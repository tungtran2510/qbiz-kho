// ==============================================================================
// QBIZ KHO — BACKEND WEB: đẩy outbox lên RPC kho_* của website.
//
// Quy tắc (review Codex/advisor):
//  1. ĐÚNG THỨ TỰ TẠO: sắp theo created_at (outbox IndexedDB trả theo khoá = UUID ngẫu nhiên, không phải thứ tự).
//     Gặp lỗi CHỜ (retry) → DỪNG lượt đẩy (giữ thứ tự: mở ca trước đóng ca, khách trước phiếu bán, ...).
//  2. ĐÓNG BĂNG PAYLOAD: lần gửi đầu dựng payload RPC rồi LƯU vào dòng outbox (rpc_payload); mọi lần gửi lại dùng
//     y nguyên → server so request_hash = md5(payload) không báo OPERATION_ID_CONFLICT giả.
//  3. PHÂN LOẠI LỖI: 'duplicate' từ server = đã xong; lỗi chờ → gửi lại sau (backoff); lỗi dữ liệu → NEEDS_REVIEW
//     (hàng "cần xem" cho chủ shop — KHÔNG xoá, KHÔNG tự gửi lại).
//  4. device_seq: bộ đếm RIÊNG cho backend web theo THIẾT BỊ (bắt đầu từ 1 lúc thiết bị vào web) — server kiểm
//     chứng mốc xác nhận kiểm kho bằng dãy 1..N liên tục. Gán khi đóng băng payload phiếu bán (theo thứ tự tạo).
// Loại sự kiện chưa hỗ trợ ở lát này → DEFERRED (giữ nguyên, không chặn sự kiện khác).
// ==============================================================================

import { getAll, getOne, put } from '../db.js';
import { getActiveShop, supabaseFetch } from '../auth.js';
import { rpc, classifyError, errorCode } from './api.js';
import { splitWebItemId } from './catalog.js';

const BACKOFF_MS = [5000, 15000, 30000, 60000, 300000];
const nowIso = () => new Date().toISOString();
const nn = (v) => (v === undefined || v === null || v === '' ? null : v);
const shiftRef = (id) => (id && id !== 'shift_auto' ? id : null);

async function nextWebSaleSeq(deviceId) {
  const key = `web_sale_seq:${deviceId}`;
  const cur = Number((await getOne('settings', key))?.value || 0) + 1;
  await put('settings', { id: key, value: cur });
  return cur;
}

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
      args: {
        p_sale: {
          id: s.id,
          operation_id: row.operation_id,
          code: nn(s.code),
          warehouse_id: s.warehouseId || s.location_id || s.warehouse_id,
          device_id: nn(deviceId),
          device_seq: deviceId ? await nextWebSaleSeq(deviceId) : null,
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
              cost_version_id: nn(products.get(it.item_id || it.itemId)?.cost_version_id),
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
      // 'split' / 'original' / phương thức lạ: tiền mặt nếu không vượt tiền mặt đã thu của phiếu, ngược lại chuyển khoản.
      method = Number(d.cash_refund || 0) <= localCashPaid(sale) ? 'cash' : 'transfer';
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

export function isWebSupported(type) { return Object.prototype.hasOwnProperty.call(BUILDERS, type); }

/** Gửi 1 payload đã đóng băng: RPC, hoặc ghi REST trực tiếp (bảng client được RLS cho ghi). */
async function sendFrozen(frozen) {
  if (frozen.rest) {
    try {
      await supabaseFetch(`/rest/v1/${frozen.rest}`, { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ ...frozen.row, shop_id: frozen.args.p_shop_id }) });
      return { id: frozen.row.id, duplicate: false };
    } catch (err) {
      if (errorCode(err) === 'PG_23505') return { id: frozen.row.id, duplicate: true };   // đã có (lần gửi trước)
      throw err;
    }
  }
  return rpc(frozen.fn, frozen.args);
}

// ---- Đăng ký thiết bị + quầy (server yêu cầu tồn tại + đang bật trước khi mở ca) ------------------------------
export async function ensureDevice(shopId, identity, defaultWarehouseId) {
  const dev = await rpc('kho_register_device', { p_shop_id: shopId, p_device: {
    id: identity.device_id, device_key: identity.device_id,
    name: identity.device_name || 'Thiết bị Kho', platform: (globalThis.navigator?.userAgent || '').slice(0, 200) } });
  if (identity.register_id) {
    await rpc('kho_ensure_register', { p_shop_id: shopId, p_register: {
      id: identity.register_id, name: identity.register_name || 'Quầy chính', warehouse_id: defaultWarehouseId || null } });
  }
  return dev;   // { id, active, name } — active=false: thiết bị bị chủ shop tắt → app ngừng bán
}

// ---- Vòng đẩy ------------------------------------------------------------------------------------------------
let running = null;

export function webFlushOutbox() {
  if (!running) running = doFlush().finally(() => { running = null; });
  return running;
}

async function doFlush() {
  const shop = getActiveShop();
  if (!shop?.id) return { sent: 0, failed: 0, skipped: true, reason: 'NO_SHOP' };
  const now = Date.now();
  const rows = (await getAll('outbox'))
    .filter((r) => ['PENDING', 'ERROR', 'SYNCING'].includes(String(r.sync_status || 'PENDING').toUpperCase()))
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));

  let sent = 0, failed = 0, review = 0, deferred = 0;
  for (const row of rows) {
    if (!isWebSupported(row.type)) {
      if (row.web_status !== 'DEFERRED') { await put('outbox', { ...row, web_status: 'DEFERRED' }); }
      deferred++;
      continue;
    }
    if (row.sync_status === 'ERROR' && row.next_retry_at && Date.parse(row.next_retry_at) > now) break;   // giữ thứ tự

    let frozen = row.rpc_payload;
    if (!frozen) {
      frozen = await BUILDERS[row.type](row);
      frozen.args = { p_shop_id: shop.id, ...(frozen.args || {}) };
      await put('outbox', { ...row, rpc_payload: frozen, rpc_frozen_at: nowIso() });
    }
    try {
      const ack = await sendFrozen(frozen);
      if (frozen.after) {
        const cur = await getOne(frozen.after.store, frozen.after.id);
        if (cur) await put(frozen.after.store, { ...cur, ...frozen.after.patch });
      }
      await put('outbox', { ...row, rpc_payload: frozen, sync_status: 'SYNCED', web_status: 'SYNCED',
        synced_at: nowIso(), ack, last_error: null, updated_at: nowIso() });
      sent++;
    } catch (err) {
      const code = errorCode(err);
      if (classifyError(err) === 'terminal') {
        // Dữ liệu sai → hàng "cần xem". Không chặn sự kiện sau (sự kiện phụ thuộc sẽ tự rơi vào "cần xem").
        await put('outbox', { ...row, rpc_payload: frozen, sync_status: 'NEEDS_REVIEW', web_status: 'NEEDS_REVIEW',
          last_error: String(err.message || err), last_error_code: code, updated_at: nowIso() });
        review++;
        continue;
      }
      const retry = Number(row.retry_count || 0) + 1;
      await put('outbox', { ...row, rpc_payload: frozen, sync_status: 'ERROR', web_status: 'WAITING', retry_count: retry,
        last_error: String(err.message || err), last_error_code: code, updated_at: nowIso(),
        next_retry_at: new Date(Date.now() + BACKOFF_MS[Math.min(retry - 1, BACKOFF_MS.length - 1)]).toISOString() });
      failed++;
      break;   // giữ thứ tự: sự kiện sau có thể phụ thuộc sự kiện này
    }
  }
  return { sent, failed, review, deferred, skipped: false };
}

/** Số liệu cho thanh trạng thái đồng bộ. */
export async function webSyncStatus() {
  const rows = await getAll('outbox');
  const by = (s) => rows.filter((r) => String(r.sync_status || '').toUpperCase() === s).length;
  return { pending: by('PENDING') + by('ERROR') + by('SYNCING'), review: by('NEEDS_REVIEW'),
    deferred: rows.filter((r) => r.web_status === 'DEFERRED' && r.sync_status !== 'SYNCED').length };
}
