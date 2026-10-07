// ==============================================================================
// QBIZ KHO — BACKEND WEB: kéo danh mục + kho + tồn + khách từ website về IndexedDB.
// Quyết định 10/2026: WEB QUẢN LÝ DANH MỤC, Kho chỉ đọc (thêm/sửa hàng làm ở admin web).
//
// Ánh xạ:
//  - Sản phẩm KHÔNG biến thể → 1 mặt hàng Kho, id = products.id.
//  - Sản phẩm CÓ biến thể (web lưu variants jsonb, mỗi biến thể có giá/tồn riêng) → MỖI biến thể là 1 mặt hàng
//    Kho riêng, id = `${productId}::${variantId}` (Kho không có biến thể bán được). flush.js tách lại khi gửi.
//  - Dịch vụ → id = `service:${services.id}`, không theo dõi tồn.
//  - Tồn: stock_levels → level `${itemId}:${warehouseId}`.
//  - Giá vốn: client KHÔNG đọc được số tiền; chỉ giữ MÃ phiên bản giá vốn mới nhất (cost_version_id) để đóng
//    băng vào phiếu bán (server tra giá đúng phiên bản).
// Tồn + mã giá vốn chỉ làm mới khi outbox KHÔNG còn phiếu ảnh hưởng tồn chờ gửi (nếu không: tồn server chưa trừ
// các phiếu đó → màn hình hiện tồn cao giả; mã giá vốn đổi giữa lúc bán và lúc gửi).
// ==============================================================================

import { getAll, put, putMany, remove, runTransaction } from '../db.js';
import { selectAll } from './api.js';

const STOCK_EVENT_TYPES = /^(sale|return|exchange|inventory|inventory_document|transfer|purchase_return)\./;

export const WEB_ITEM_SEP = '::';
export const webItemId = (productId, variantId) => (variantId ? `${productId}${WEB_ITEM_SEP}${variantId}` : productId);
/** Tách mã mặt hàng Kho về (product_id, variant_id) của web; dịch vụ giữ nguyên 'service:<id>'. */
export function splitWebItemId(itemId) {
  const s = String(itemId || '');
  if (s.startsWith('service:')) return { product_id: s, variant_id: null };
  const i = s.indexOf(WEB_ITEM_SEP);
  return i < 0 ? { product_id: s, variant_id: null } : { product_id: s.slice(0, i), variant_id: s.slice(i + WEB_ITEM_SEP.length) };
}

const enc = encodeURIComponent;
const listPrice = (p) => (p.sale_price && Number(p.sale_price) > 0 ? Number(p.sale_price) : (p.price == null ? null : Number(p.price)));

// Chỉ tính sự kiện CÒN SẼ GỬI (chờ / đang gửi / lỗi chờ). Mục "cần xem" (NEEDS_REVIEW) và loại chưa hỗ trợ
// (DEFERRED) không bao giờ tự lên server → nếu tính vào thì tồn không bao giờ được làm mới nữa.
export async function hasPendingStockEvents() {
  return (await getAll('outbox')).some((r) => ['PENDING', 'SYNCING', 'ERROR'].includes(String(r.sync_status || 'PENDING').toUpperCase())
    && r.web_status !== 'DEFERRED' && STOCK_EVENT_TYPES.test(String(r.type || '')));
}

/** Thay toàn bộ nội dung 1 store bằng `rows` (xoá dòng không còn trên web). */
async function replaceStore(name, rows, keep = () => false) {
  const ids = new Set(rows.map((r) => r.id));
  for (const old of await getAll(name)) if (!ids.has(old.id) && !keep(old)) await remove(name, old.id);
  if (rows.length) await putMany(name, rows);
}

export async function pullCatalog(shopId) {
  const sid = enc(shopId);
  const stockFresh = !(await hasPendingStockEvents());
  const [products, services, warehouses, customers, levels, versions] = await Promise.all([
    selectAll(`products?shop_id=eq.${sid}&select=id,name,sku,barcode,price,sale_price,images,status,is_hidden,variants,unit&order=sort_order.asc`),
    selectAll(`services?shop_id=eq.${sid}&select=id,title,price_number,status&order=title.asc`),
    selectAll(`warehouses?shop_id=eq.${sid}&select=id,name,code,address,is_default,status`),
    selectAll(`kho_customers?shop_id=eq.${sid}&select=id,code,name,phone,email,address,credit_limit,note`),
    stockFresh ? selectAll(`stock_levels?shop_id=eq.${sid}&select=warehouse_id,product_id,variant_id,on_hand,reserved`) : Promise.resolve(null),
    selectAll(`product_cost_versions?shop_id=eq.${sid}&select=id,product_id,effective_at&order=effective_at.desc`),
  ]);

  const oldItems = new Map((await getAll('products')).map((p) => [p.id, p]));
  const latestVersion = new Map();
  for (const v of versions) if (!latestVersion.has(v.product_id)) latestVersion.set(v.product_id, v.id);

  const items = [];
  const base = (p) => ({
    type: 'PRODUCT', categoryId: '', active: true, websiteVisibility: !p.is_hidden, trackInventory: true, variants: [],
    images: Array.isArray(p.images) ? p.images : [], image: (Array.isArray(p.images) && p.images[0]) || '',
    unit: p.unit || '', lowStock: 0, low_stock_threshold: 0, source: 'web', web_product_id: p.id,
  });
  for (const p of products) {
    if (p.status === 'hidden') continue;
    const allVariants = Array.isArray(p.variants) ? p.variants.filter((v) => v && v.id) : [];
    const vlist = allVariants.filter((v) => !v.hidden);
    // CÓ biến thể nhưng tất cả đều ẩn → sản phẩm không bán được (KHÔNG coi là "không có biến thể" rồi bán hàng cha).
    if (allVariants.length && !vlist.length) continue;
    // Mã giá vốn đóng băng: giữ mã cũ nếu còn phiếu chờ gửi (stockFresh=false).
    const costVersion = (id) => (stockFresh ? latestVersion.get(p.id) || null : oldItems.get(id)?.cost_version_id ?? latestVersion.get(p.id) ?? null);
    if (!vlist.length) {
      items.push({ ...base(p), id: p.id, name: p.name, sku: p.sku || '', barcode: p.barcode || '', price: listPrice(p),
        web_variant_id: '', cost_version_id: costVersion(p.id) });
    } else {
      for (const v of vlist) {
        const id = webItemId(p.id, v.id);
        items.push({ ...base(p), id, name: `${p.name} - ${v.name || ''}`.trim(), sku: v.sku || p.sku || '',
          barcode: v.barcode || '', price: v.price == null ? null : Number(v.price),
          web_variant_id: v.id, cost_version_id: costVersion(id) });
      }
    }
  }
  for (const s of services) {
    if (s.status === 'hidden') continue;
    items.push({ type: 'SERVICE', id: `service:${s.id}`, name: s.title, sku: '', barcode: '', categoryId: '', active: true,
      trackInventory: false, variants: [], images: [], image: '', price: s.price_number == null ? null : Number(s.price_number),
      source: 'web', web_product_id: `service:${s.id}`, web_variant_id: '', cost_version_id: null });
  }
  await replaceStore('products', items);

  await replaceStore('warehouses', warehouses.filter((w) => w.status !== 'inactive').map((w) => ({
    id: w.id, name: w.name, code: w.code || '', address: w.address || '', isDefault: !!w.is_default, source: 'web',
  })));

  // Khách: giữ khách tạo offline chưa đồng bộ (không có web_synced) để không mất.
  await replaceStore('customers', customers.map((c) => ({
    id: c.id, code: c.code || '', name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '',
    creditLimit: Number(c.credit_limit || 0), credit_limit: Number(c.credit_limit || 0), note: c.note || '', web_synced: true,
  })), (old) => !old.web_synced);

  if (levels) {
    const stamp = new Date().toISOString();
    const next = levels.map((l) => {
      const itemId = webItemId(l.product_id, l.variant_id);
      return { id: `${itemId}:${l.warehouse_id}`, productId: itemId, variantId: '', variant_id: '', warehouseId: l.warehouse_id,
        onHand: Number(l.on_hand || 0), reserved: Number(l.reserved || 0), damaged: 0, updatedAt: stamp, source: 'web' };
    });
    // NGUYÊN TỬ với outbox (review Codex): kiểm lại "còn phiếu chờ" TRONG cùng giao dịch ghi tồn — phiếu bán tạo ra
    // trong lúc đang tải mạng sẽ khiến bỏ qua lần ghi này (không ghi đè phần trừ tồn cục bộ của phiếu đó).
    await runTransaction(['outbox', 'levels'], (stores) => {
      const req = stores.outbox.getAll();
      req.onsuccess = () => {
        const pending = (req.result || []).some((r) => ['PENDING', 'SYNCING', 'ERROR'].includes(String(r.sync_status || 'PENDING').toUpperCase())
          && r.web_status !== 'DEFERRED' && STOCK_EVENT_TYPES.test(String(r.type || '')));
        if (pending) return;
        const keep = new Set(next.map((x) => x.id));
        const cur = stores.levels.getAll();
        cur.onsuccess = () => {
          for (const old of cur.result || []) if (!keep.has(old.id)) stores.levels.delete(old.id);
          for (const x of next) stores.levels.put(x);
        };
      };
    });
  }
  await put('settings', { id: 'web_catalog_pulled_at', value: new Date().toISOString() });
  return { items: items.length, warehouses: warehouses.length, customers: customers.length, levels: levels ? levels.length : null };
}
