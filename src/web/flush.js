// ==============================================================================
// QBIZ KHO — BACKEND WEB: đẩy outbox lên RPC kho_* của website.
//
// Quy tắc (review Codex/advisor):
//  1. ĐÚNG THỨ TỰ TẠO: sắp theo client_seq (engine.makeOutbox, tăng đơn điệu) → created_at (IndexedDB trả theo khoá UUID).
//     Gặp lỗi CHỜ (retry) → DỪNG lượt đẩy (giữ thứ tự: mở ca trước đóng ca, khách trước phiếu bán, ...).
//  2. ĐÓNG BĂNG PAYLOAD: lần gửi đầu dựng payload RPC rồi LƯU vào dòng outbox (rpc_payload); mọi lần gửi lại dùng
//     y nguyên → server so request_hash = md5(payload) không báo OPERATION_ID_CONFLICT giả.
//  3. PHÂN LOẠI LỖI: 'duplicate' từ server = đã xong; lỗi chờ → gửi lại sau (backoff); lỗi dữ liệu → NEEDS_REVIEW
//     (hàng "cần xem" cho chủ shop — KHÔNG xoá, KHÔNG tự gửi lại).
//  4. device_seq: bộ đếm RIÊNG cho backend web theo THIẾT BỊ (bắt đầu từ 1 lúc thiết bị vào web) — server kiểm
//     chứng mốc xác nhận kiểm kho bằng dãy 1..N liên tục. Gán khi đóng băng payload phiếu bán (theo thứ tự tạo).
// Loại sự kiện chưa hỗ trợ ở lát này → DEFERRED (giữ nguyên, không chặn sự kiện khác).
// ==============================================================================

import { getAll, getOne, put, runTransaction } from '../db.js';
import { getActiveShop } from '../auth.js';
import { rpc, restInsert, classifyError, errorCode } from './api.js';
import { splitWebItemId } from './catalog.js';

const BACKOFF_MS = [5000, 15000, 30000, 60000, 300000];
const nowIso = () => new Date().toISOString();
const nn = (v) => (v === undefined || v === null || v === '' ? null : v);
const shiftRef = (id) => (id && id !== 'shift_auto' ? id : null);

// ---- Dựng payload RPC từ payload outbox (chạy 1 LẦN / sự kiện, kết quả được đóng băng) ----------------------
const BUILDERS = {
  async 'sale.create'(row) {
    const s = row.payload?.sale || {};
    const customers = new Map((await getAll('customers')).map((c) => [c.id, c]));
    const products = new Map((await getAll('products')).map((p) => [p.id, p]));
    const cust = customers.get(s.customer_id || s.customerId);
    const deviceId = s.device_id || row.device_id;
    return {
      fn: 'kho_record_sale',
      seq_device: deviceId || null,
      args: {
        p_sale: {
          id: s.id,
          operation_id: row.operation_id,
          code: nn(s.code),
          warehouse_id: s.warehouseId || s.location_id || s.warehouse_id,
          device_id: nn(deviceId),
          device_seq: null,   // cấp NGUYÊN TỬ lúc đóng băng (freezeAtomic)
          register_id: nn(s.register_id || row.register_id),
          shift_id: shiftRef(s.shift_id),
          // Khách tạo offline chưa lên web → gửi nhãn, không gửi mã (tránh CUSTOMER_NOT_FOUND).
          customer_id: cust?.web_synced ? cust.id : null,
          customer_label: nn(s.customer_label || s.customerLabel) || 'Khách lẻ',
          note: nn(s.note),
          sold_at: s.created_at || s.createdAt || row.created_at,
          discount_total: Number(s.discount_total ?? s.discount ?? 0),
          grand_total: Number(s.grand_total ?? s.total ?? 0),
          items: (s.items || []).map((it) => {
            const ref = splitWebItemId(it.item_id || it.itemId);
            return {
              product_id: ref.product_id,
              variant_id: ref.variant_id,
              name: nn(it.name),
              sku: nn(it.sku),
              quantity: Number(it.quantity),
              unit_price: Number(it.unit_price ?? it.unitPrice ?? 0),
              discount: Number(it.discount || 0),
              tax_rate: it.tax_rate == null || it.tax_rate === '' ? null : Number(it.tax_rate),
              tax_amount: Number(it.tax_amount || 0),
              tax_inclusive: Boolean(it.tax_inclusive),
              // Mã phiên bản giá vốn ĐÓNG BĂNG LÚC BÁN (engine.createSale); dòng cũ chưa có → mã hiện tại của mặt hàng.
              cost_version_id: nn(it.cost_version_id) ?? nn(products.get(it.item_id || it.itemId)?.cost_version_id),
            };
          }),
          payments: (s.payments || []).map((p) => ({
            id: nn(p.id), method: p.method, amount: Number(p.amount || 0), status: p.status,
            reference: nn(p.reference), shift_id: shiftRef(p.shift_id), paid_at: nn(p.paid_at),
          })),
        },
      },
    };
  },
  async 'shift.open'(row) {
    const sh = row.payload?.shift || {};
    return {
      fn: 'kho_open_shift',
      args: { p_shift: { id: sh.id, operation_id: row.operation_id, register_id: sh.register_id || row.register_id,
        device_id: sh.device_id || row.device_id, opened_at: nn(sh.opened_at), opening_cash: Number(sh.opening_cash || 0),
        employee: nn(sh.employee) } },
    };
  },
  async 'shift.close'(row) {
    const sh = row.payload?.shift || {};
    return {
      fn: 'kho_close_shift',
      args: { p_close: { shift_id: sh.id || row.entity_id, operation_id: row.operation_id, closed_at: nn(sh.closed_at),
        counted_cash: Number(sh.counted_cash || 0), expected_cash: sh.expected_cash == null ? null : Number(sh.expected_cash),
        difference: sh.difference == null ? null : Number(sh.difference),
        summary: sh.summary && typeof sh.summary === 'object' ? sh.summary : null } },
    };
  },
};

// ---- Lát 2: khách hàng, trả hàng, thu nợ -----------------------------------------------------------------
const RETURN_METHODS = new Set(['cash', 'transfer', 'qr', 'debt']);
const localCashPaid = (sale) => (sale?.payments || [])
  .filter((p) => String(p.status || '').toUpperCase() === 'PAID' && (p.method || sale.payment_method) === 'cash')
  .reduce((n, p) => n + Number(p.amount || 0), 0);

async function collectBuilder(row) {
  const s = row.payload?.sale || {};
  // Khoản thu của lần này: dòng PAID có paid_at = thời điểm cập nhật phiếu (engine.markSalePaid).
  const pay = (s.payments || []).find((p) => String(p.status || '').toUpperCase() === 'PAID' && p.paid_at && p.paid_at === s.updated_at)
    || { method: s.payment_method || 'cash', shift_id: s.shift_id };
  const method = ['cash', 'transfer', 'qr'].includes(pay.method) ? pay.method : 'transfer';
  return {
    fn: 'kho_collect_debt',
    args: { p_payment: { id: row.operation_id, operation_id: row.operation_id, sale_id: s.id, method,
      amount: Math.round(Number(row.payload?.collected_amount || 0)), paid_at: nn(pay.paid_at),
      shift_id: shiftRef(pay.shift_id) || shiftRef(s.shift_id), reference: nn(pay.reference) } },
  };
}

Object.assign(BUILDERS, {
  // Khách tạo offline → bảng kho_customers (RLS: owner/manager/cashier khi shop còn quyền Kho). Gửi lại khi đã có
  // (23505) = đã xong. Sau khi lên web, phiếu bán dựng SAU đó gửi kèm customer_id (thứ tự tạo được giữ).
  async 'customer.create'(row) {
    const c = row.payload?.customer || {};
    return { rest: 'kho_customers', row: { id: c.id, code: nn(c.code), name: c.name, phone: nn(c.phone), email: nn(c.email),
      address: nn(c.address), credit_limit: Number(c.credit_limit ?? c.creditLimit ?? 0) || null, note: nn(c.note) },
      after: { store: 'customers', id: c.id, patch: { web_synced: true } } };
  },
  async 'return.create'(row) {
    const d = row.payload?.return || {};
    const sale = (await getAll('sales')).find((s) => s.id === d.sale_id);
    let method = String(d.refund_method || '').toLowerCase();
    if (!RETURN_METHODS.has(method)) {
      // 'split' / 'original' / phương thức lạ: tiền mặt nếu không vượt (tiền mặt đã thu − tiền mặt đã hoàn trước) của
      // phiếu, ngược lại chuyển khoản (server giới hạn hoàn tiền mặt theo đúng công thức này).
      // Tiền mặt ĐÃ hoàn trước theo phương thức THỰC TẾ đã gửi server (payload đóng băng của các phiếu trả trước) —
      // engine lưu 'split'/'original' nên không dựa vào phương thức cục bộ được.
      const priorCash = (await getAll('outbox'))
        .filter((o) => o.type === 'return.create' && o.id !== row.id && o.payload?.return?.sale_id === d.sale_id
          && !['NEEDS_REVIEW', 'DISCARDED'].includes(String(o.sync_status || '').toUpperCase())
          && o.rpc_payload?.args?.p_return?.refund_method === 'cash')
        .reduce((n, o) => n + Number(o.rpc_payload.args.p_return.cash_refund || 0), 0);
      method = Number(d.cash_refund || 0) <= localCashPaid(sale) - priorCash ? 'cash' : 'transfer';
    }
    return {
      fn: 'kho_record_return',
      args: { p_return: { id: d.id, operation_id: row.operation_id, sale_id: d.sale_id, shift_id: shiftRef(d.shift_id),
        reason: nn(d.reason), returned_at: d.created_at || row.created_at, refund_method: method,
        refund_amount: Math.round(Number(d.refund_amount || 0)), debt_deduction: Math.round(Number(d.debt_deduction || 0)),
        cash_refund: method === 'debt' ? 0 : Math.round(Number(d.cash_refund || 0)),
        lines: (d.lines || []).map((l) => {
          const ref = splitWebItemId(l.item_id || l.itemId);
          return { product_id: ref.product_id, variant_id: ref.variant_id, quantity: Number(l.quantity),
            condition: String(l.condition || 'SELLABLE').toLowerCase(), refund_amount: Math.round(Number(l.refund_amount || 0)) };
        }) } },
    };
  },
  'sale.mark_paid': collectBuilder,
  'sale.partial_paid': collectBuilder,
});

// ---- Lát 3: nhà cung cấp, phiếu kho (nhập / xuất / kiểm / trả NCC), chuyển kho -------------------------------
async function syncedRef(store, id) {
  if (!id) return null;
  const x = await getOne(store, id);
  return x?.web_synced ? id : null;   // chưa lên web → không gửi mã (tránh *_NOT_FOUND chặn hàng đợi mãi)
}

async function stockDocBuilder(row, { kind, subType } = {}) {
  const d = row.payload?.document || row.payload?.purchase_return || {};
  const k = kind || d.kind;
  // Kiểm kho: tồn MÁY THẤY lúc kiểm = số đếm − chênh lệch đã ghi (movement của phiếu; không có movement = khớp).
  const moved = new Map();
  for (const m of row.payload?.inventory_movements || []) moved.set(m.productId, Number(m.qty || 0));
  return {
    fn: 'kho_record_stock_document',
    args: { p_doc: { id: d.id || d.document_id, operation_id: row.operation_id, kind: k, sub_type: nn(subType || d.sub_type),
      warehouse_id: d.warehouse_id, supplier_id: k === 'receive' ? await syncedRef('suppliers', d.supplier_id) : null,
      reference: nn(d.reference), receiver_name: nn(d.receiver_name), deliverer_name: nn(d.deliverer_name),
      note: nn(d.note || d.reason), document_at: d.created_at || row.created_at,
      lines: (d.lines || []).map((l) => {
        const ref = splitWebItemId(l.productId || l.item_id);
        const qty = Math.round(Number(l.qty ?? l.quantity ?? 0));
        return { product_id: ref.product_id, variant_id: ref.variant_id, quantity: qty,
          client_on_hand: k === 'count' ? qty - (moved.get(l.productId) || 0) : null,
          unit_cost: k === 'receive' && l.price != null && l.price !== '' ? Number(l.price) : null };
      }) } },
  };
}

const transferStep = (fn, atField) => async (row) => {
  const t = row.payload?.transfer || {};
  return { fn, args: { p_transfer_id: t.id || row.entity_id, p_operation_id: row.operation_id, [atField]: nn(t.receivedAt || t.updatedAt) || row.created_at } };
};

Object.assign(BUILDERS, {
  async 'supplier.create'(row) {
    const s = row.payload?.supplier || {};
    return { rest: 'kho_suppliers', row: { id: s.id, code: nn(s.code), name: s.name, phone: nn(s.phone), email: nn(s.email),
      address: nn(s.address), tax_code: nn(s.tax_code), note: nn(s.note) },
      after: { store: 'suppliers', id: s.id, patch: { web_synced: true } } };
  },
  'inventory_document.receive': (row) => stockDocBuilder(row, { kind: 'receive' }),
  'inventory_document.issue': (row) => stockDocBuilder(row, { kind: 'issue' }),
  'inventory_document.count': (row) => stockDocBuilder(row, { kind: 'count' }),
  'purchase_return.create': (row) => stockDocBuilder(row, { kind: 'issue', subType: 'PURCHASE_RETURN_OUT' }),
  async 'transfer.create'(row) {
    const t = row.payload?.transfer || {};
    const lines = Array.isArray(t.lines) && t.lines.length ? t.lines : [{ productId: t.productId, qty: t.qty }];
    return { fn: 'kho_create_transfer', args: { p_transfer: { id: t.id, operation_id: row.operation_id,
      from_warehouse_id: t.fromWarehouseId, to_warehouse_id: t.toWarehouseId, note: nn(t.note), sent_at: t.createdAt || row.created_at,
      lines: lines.map((l) => { const ref = splitWebItemId(l.productId); return { product_id: ref.product_id, variant_id: ref.variant_id, quantity: Number(l.qty) }; }) } } };
  },
  'transfer.receive': transferStep('kho_receive_transfer', 'p_received_at'),
  'transfer.cancel': transferStep('kho_cancel_transfer', 'p_cancelled_at'),
});

// ---- Mốc xác nhận kiểm kho: device_seq LIÊN TỤC lớn nhất đã đồng bộ (lưu bền — outbox cũ có thể bị dọn) ------
export async function contiguousSyncedSeq(deviceId) {
  const key = `web_sale_seq_synced:${deviceId}`;
  let w = Number((await getOne('settings', key))?.value || 0);
  const synced = new Set((await getAll('outbox'))
    .filter((r) => r.type === 'sale.create' && r.sync_status === 'SYNCED' && r.rpc_payload?.args?.p_sale?.device_id === deviceId)
    .map((r) => Number(r.rpc_payload.args.p_sale.device_seq)));
  while (synced.has(w + 1)) w++;
  await put('settings', { id: key, value: w });
  return w;
}

export function isWebSupported(type) { return Object.prototype.hasOwnProperty.call(BUILDERS, type); }

/** Gửi 1 payload đã đóng băng: RPC, hoặc ghi REST trực tiếp (bảng client được RLS cho ghi). */
async function sendFrozen(frozen) {
  if (frozen.rest) {
    try {
      await restInsert(frozen.rest, { ...frozen.row, shop_id: frozen.args.p_shop_id });
      return { id: frozen.row.id, duplicate: false };
    } catch (err) {
      if (errorCode(err) === 'PG_23505') return { id: frozen.row.id, duplicate: true };   // đã có (lần gửi trước)
      throw err;
    }
  }
  return rpc(frozen.fn, frozen.args);
}

// ---- Đăng ký thiết bị + quầy (server yêu cầu tồn tại + đang bật trước khi mở ca) ------------------------------
export async function ensureDevice(shopId, identity, defaultWarehouseId, role = '') {
  const dev = await rpc('kho_register_device', { p_shop_id: shopId, p_device: {
    id: identity.device_id, device_key: identity.device_id,
    name: identity.device_name || 'Thiết bị Kho', platform: (globalThis.navigator?.userAgent || '').slice(0, 200) } });
  // Quầy thu ngân chỉ cho vai trò bán hàng (server: owner/manager/cashier) — thủ kho không có quầy/ca, không được
  // để lỗi FORBIDDEN ở đây chặn việc kéo dữ liệu kho / đẩy phiếu kho.
  if (identity.register_id && String(role).toUpperCase() !== 'WAREHOUSE') {
    await rpc('kho_ensure_register', { p_shop_id: shopId, p_register: {
      id: identity.register_id, name: identity.register_name || 'Quầy chính', warehouse_id: defaultWarehouseId || null } });
  }
  return dev;   // { id, active, name } — active=false: thiết bị bị chủ shop tắt → app ngừng bán
}

// ---- Đóng băng NGUYÊN TỬ: cấp device_seq + lưu payload trong CÙNG 1 giao dịch IndexedDB (review Codex) -------
// Crash giữa "tăng bộ đếm" và "lưu payload" từng tạo lỗ vĩnh viễn trong dãy 1..N → không xác nhận kiểm kho được.
// Tab khác đã đóng băng trước → dùng payload của tab đó (không cấp số mới).
async function freezeAtomic(rowId, frozen) {
  let out = null;
  await runTransaction(['settings', 'outbox'], (stores) => {
    const obReq = stores.outbox.get(rowId);
    obReq.onsuccess = () => {
      const cur = obReq.result;
      if (!cur) return;
      if (cur.rpc_payload) { out = cur.rpc_payload; return; }
      const save = () => { stores.outbox.put({ ...cur, rpc_payload: frozen, rpc_frozen_at: nowIso() }); out = frozen; };
      if (!frozen.seq_device) { save(); return; }
      const key = `web_sale_seq:${frozen.seq_device}`;
      const sReq = stores.settings.get(key);
      sReq.onsuccess = () => {
        const n = Number(sReq.result?.value || 0) + 1;
        stores.settings.put({ id: key, value: n });
        frozen.args.p_sale.device_seq = n;
        save();
      };
    };
  });
  return out;
}

// ---- Thứ tự + phụ thuộc -------------------------------------------------------------------------------------
// client_seq (engine.makeOutbox, tăng đơn điệu kể cả khi đồng hồ lùi) → created_at → id.
const orderKey = (r) => [Number(r.client_seq || 0), String(r.created_at || ''), String(r.id)];
function byOrder(a, b) {
  const x = orderKey(a), y = orderKey(b);
  if (x[0] && y[0] && x[0] !== y[0]) return x[0] - y[0];
  return x[1].localeCompare(y[1]) || x[2].localeCompare(y[2]);
}
// Thực thể mà 1 sự kiện TẠO ra / PHỤ THUỘC vào (cùng khoá 'loại:id').
function createsKey(r) {
  const p = r.payload || {};
  if (r.type === 'sale.create') return `sale:${p.sale?.id}`;
  if (r.type === 'shift.open') return `shift:${p.shift?.id}`;
  if (r.type === 'transfer.create') return `transfer:${p.transfer?.id}`;
  return null;
}
function dependsOn(r) {
  const p = r.payload || {};
  if (r.type === 'return.create') return [`sale:${p.return?.sale_id}`];
  if (r.type === 'sale.mark_paid' || r.type === 'sale.partial_paid') return [`sale:${p.sale?.id}`];
  if (r.type === 'shift.close') return [`shift:${p.shift?.id || r.entity_id}`];
  if (r.type === 'transfer.receive' || r.type === 'transfer.cancel') return [`transfer:${p.transfer?.id || r.entity_id}`];
  return [];
}

// ---- Vòng đẩy ------------------------------------------------------------------------------------------------
let running = null;

export function webFlushOutbox() {
  if (!running) running = doFlush().finally(() => { running = null; });
  return running;
}

const ACTIVE = ['PENDING', 'ERROR', 'SYNCING'];
const statusOf = (r) => String(r.sync_status || 'PENDING').toUpperCase();

async function doFlush() {
  const shop = getActiveShop();
  if (!shop?.id) return { sent: 0, failed: 0, skipped: true, reason: 'NO_SHOP' };
  const now = Date.now();
  const all = (await getAll('outbox')).sort(byOrder);
  const creator = new Map();
  for (const r of all) { const k = createsKey(r); if (k) creator.set(k, r); }
  const rows = all.filter((r) => ACTIVE.includes(statusOf(r)));

  let sent = 0, failed = 0, review = 0, deferred = 0;
  // Cập nhật bảng sự kiện gốc NGAY khi trạng thái đổi trong lượt này (phiếu bán vừa vào "cần xem" → phiếu trả phía sau
  // phải thấy ngay, không gửi đi rồi nhận SALE_NOT_FOUND chặn cả hàng đợi).
  const track = (r) => { const k = createsKey(r); if (k) creator.set(k, r); };
  for (const row of rows) {
    if (!isWebSupported(row.type)) {
      if (row.web_status !== 'DEFERRED') { await put('outbox', { ...row, web_status: 'DEFERRED' }); }
      deferred++;
      continue;
    }
    // Sự kiện gốc (phiếu bán / mở ca / tạo phiếu chuyển) đang "cần xem" → sự kiện phụ thuộc không bao giờ lên được:
    // đưa luôn vào "cần xem" thay vì chờ *_NOT_FOUND vô hạn (chặn cả hàng đợi).
    // Sự kiện gốc bị chủ shop BỎ (DISCARDED) cũng không bao giờ lên server → sự kiện phụ thuộc vào "cần xem".
    const blocked = dependsOn(row).map((k) => creator.get(k)).find((c) => c && ['NEEDS_REVIEW', 'DISCARDED'].includes(statusOf(c)));
    if (blocked) {
      const discarded = statusOf(blocked) === 'DISCARDED';
      const upd = { ...row, sync_status: 'NEEDS_REVIEW', web_status: 'NEEDS_REVIEW',
        last_error_code: discarded ? 'DEPENDENCY_DISCARDED' : 'DEPENDENCY_IN_REVIEW',
        last_error: `Phụ thuộc ${blocked.type} ${blocked.id} ${discarded ? 'đã bị bỏ' : 'đang cần xem'}.`, updated_at: nowIso() };
      await put('outbox', upd); track(upd);
      review++;
      continue;
    }
    if (statusOf(row) === 'ERROR' && row.next_retry_at && Date.parse(row.next_retry_at) > now) break;   // giữ thứ tự

    let frozen = row.rpc_payload;
    if (!frozen) {
      const built = await BUILDERS[row.type](row);
      built.args = { p_shop_id: shop.id, ...(built.args || {}) };
      frozen = await freezeAtomic(row.id, built);
      if (!frozen) continue;   // dòng đã bị xoá giữa chừng
    }
    const fresh = (await getOne('outbox', row.id)) || row;
    try {
      const ack = await sendFrozen(frozen);
      if (frozen.after) {
        const cur = await getOne(frozen.after.store, frozen.after.id);
        if (cur) await put(frozen.after.store, { ...cur, ...frozen.after.patch });
      }
      const done = { ...fresh, rpc_payload: frozen, sync_status: 'SYNCED', web_status: 'SYNCED',
        synced_at: nowIso(), ack, last_error: null, updated_at: nowIso() };
      await put('outbox', done); track(done);
      sent++;
    } catch (err) {
      const code = errorCode(err);
      if (classifyError(err) === 'terminal') {
        // Dữ liệu sai → hàng "cần xem". Không chặn sự kiện sau (sự kiện phụ thuộc tự vào "cần xem" ở trên).
        const rev = { ...fresh, rpc_payload: frozen, sync_status: 'NEEDS_REVIEW', web_status: 'NEEDS_REVIEW',
          last_error: String(err.message || err), last_error_code: code, updated_at: nowIso() };
        await put('outbox', rev); track(rev);
        review++;
        continue;
      }
      const retry = Number(fresh.retry_count || 0) + 1;
      await put('outbox', { ...fresh, rpc_payload: frozen, sync_status: 'ERROR', web_status: code === 'AUTH' ? 'AUTH_REQUIRED' : 'WAITING',
        retry_count: retry, last_error: String(err.message || err), last_error_code: code, updated_at: nowIso(),
        next_retry_at: new Date(Date.now() + BACKOFF_MS[Math.min(retry - 1, BACKOFF_MS.length - 1)]).toISOString() });
      failed++;
      break;   // giữ thứ tự: sự kiện sau có thể phụ thuộc sự kiện này
    }
  }
  return { sent, failed, review, deferred, skipped: false };
}

/** Có sự kiện ảnh hưởng tồn còn chưa lên server (chờ / lỗi / cần xem)? — xác nhận kiểm kho chỉ khi KHÔNG. */
export async function hasUnsettledStockEvents() {
  return (await getAll('outbox')).some((r) => [...ACTIVE, 'NEEDS_REVIEW'].includes(statusOf(r)) && r.web_status !== 'DEFERRED'
    && /^(sale|return|exchange|inventory_document|transfer|purchase_return)\./.test(String(r.type || '')));
}

/** Số liệu cho thanh trạng thái đồng bộ. */
export async function webSyncStatus() {
  const rows = await getAll('outbox');
  const by = (s) => rows.filter((r) => statusOf(r) === s).length;
  return { pending: by('PENDING') + by('ERROR') + by('SYNCING'), review: by('NEEDS_REVIEW'),
    deferred: rows.filter((r) => r.web_status === 'DEFERRED' && statusOf(r) !== 'SYNCED').length,
    authRequired: rows.some((r) => r.web_status === 'AUTH_REQUIRED' && statusOf(r) === 'ERROR') };
}

// ---- Xử lý hàng "cần xem" (chủ shop / quản lý quyết; giao diện ở lát sau) -----------------------------------
/** Bỏ 1 mục (dữ liệu sai không sửa được): KHÔNG xoá — giữ dấu vết, không gửi nữa, không chặn kiểm kho. */
export async function discardReviewItem(id, reason = '') {
  const row = await getOne('outbox', id);
  if (!row || statusOf(row) !== 'NEEDS_REVIEW') return false;
  await put('outbox', { ...row, sync_status: 'DISCARDED', web_status: 'DISCARDED', discarded_reason: reason || null, updated_at: nowIso() });
  return true;
}
/** Gửi lại 1 mục (vd phụ thuộc đã được xử lý, hoặc lỗi tạm bị xếp nhầm). Payload đóng băng giữ nguyên. */
export async function retryReviewItem(id) {
  const row = await getOne('outbox', id);
  if (!row || statusOf(row) !== 'NEEDS_REVIEW') return false;
  await put('outbox', { ...row, sync_status: 'PENDING', web_status: 'RETRY', next_retry_at: null, updated_at: nowIso() });
  return true;
}
