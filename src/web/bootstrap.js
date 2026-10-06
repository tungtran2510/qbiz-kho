// ==============================================================================
// QBIZ KHO — BACKEND WEB: khởi động đồng bộ sau khi đăng nhập + chọn shop.
//   1. Đăng ký thiết bị + quầy (server cần trước khi mở ca / bán).
//   2. Kéo danh mục / kho / tồn / khách từ web.
//   3. Đẩy outbox ngay, rồi định kỳ + mỗi khi có mạng lại; làm mới danh mục định kỳ (sau khi đẩy).
// Gọi lại khi đổi shop: dừng vòng cũ, chạy vòng mới.
// ==============================================================================

import { ensureLocalIdentity } from '../engine.js';
import { pullCatalog } from './catalog.js';
import { ensureDevice, webFlushOutbox } from './flush.js';

const FLUSH_EVERY_MS = 20000;
const CATALOG_EVERY_MS = 5 * 60000;

let timers = [];
let onlineHandler = null;
let currentShopId = null;
let lastState = { deviceActive: true, error: null, catalog: null };

export function getWebSyncState() { return { ...lastState, shopId: currentShopId }; }

export function stopWebSync() {
  timers.forEach(clearInterval);
  timers = [];
  if (onlineHandler && typeof window !== 'undefined') window.removeEventListener('online', onlineHandler);
  onlineHandler = null;
  currentShopId = null;
}

/** shop: { id, kho_entitled, default_warehouse_id }. onChange(): gọi để app vẽ lại sau khi dữ liệu đổi. */
export async function startWebSync(shop, onChange = () => {}) {
  stopWebSync();
  if (!shop?.id) return lastState;
  currentShopId = shop.id;
  const identity = await ensureLocalIdentity();

  let registered = false;
  const register = async () => {
    if (registered || shop.kho_entitled === false) return;
    const dev = await ensureDevice(shop.id, identity, shop.default_warehouse_id);
    lastState.deviceActive = dev?.active !== false;
    registered = true;
  };

  const cycle = async ({ catalog = false } = {}) => {
    if (currentShopId !== shop.id) return;
    try {
      // Thiết bị + quầy PHẢI có trên server trước khi đẩy mở ca (nếu không: DEVICE_INACTIVE → "cần xem" oan).
      await register();
      if (catalog) {
        // Đẩy trước rồi mới kéo: tồn/mã giá vốn chỉ làm mới khi không còn phiếu chờ (xem catalog.js).
        await webFlushOutbox();
        lastState.catalog = await pullCatalog(shop.id);
      } else {
        await webFlushOutbox();
      }
      lastState.error = null;
    } catch (err) {
      lastState.error = String(err?.message || err);
    }
    onChange();
  };

  await cycle({ catalog: true });   // offline lúc mở app → register/đẩy/kéo thử lại ở vòng sau

  timers.push(setInterval(() => cycle(), FLUSH_EVERY_MS));
  timers.push(setInterval(() => cycle({ catalog: true }), CATALOG_EVERY_MS));
  if (typeof window !== 'undefined') {
    onlineHandler = () => cycle({ catalog: true });
    window.addEventListener('online', onlineHandler);
  }
  return lastState;
}
