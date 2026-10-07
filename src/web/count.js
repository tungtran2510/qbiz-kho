// ==============================================================================
// QBIZ KHO — BACKEND WEB: phiên kiểm kho do server kiểm soát (migration 0096).
//   - Mọi thiết bị: TỰ xác nhận đã đồng bộ cho mọi phiên đang mở của shop (sau mỗi lượt đẩy outbox), gửi mốc
//     device_seq liên tục lớn nhất đã lên server (server kiểm chứng 1..N).
//   - Quản lý / thủ kho (online): mở phiên, ghi số đếm; owner / quản lý: chốt, huỷ, xử lý hàng đối soát.
// Giao diện quản lý phiên dùng các hàm dưới (lát giao diện sau).
// ==============================================================================

import { rpc, selectAll } from './api.js';
import { contiguousSyncedSeq, hasUnsettledStockEvents } from './flush.js';

const enc = encodeURIComponent;

export async function openCountSessions(shopId) {
  return selectAll(`kho_count_sessions?shop_id=eq.${enc(shopId)}&status=eq.open&select=id,warehouse_id,started_at`);
}

/** Xác nhận cho mọi phiên đang mở. Lỗi 1 phiên (vd ACK_NOT_PROVEN khi còn phiếu chưa lên) không chặn phiên khác. */
export async function autoAckOpenSessions(shopId, deviceId) {
  const sessions = await openCountSessions(shopId);
  if (!sessions.length) return { sessions: 0, acked: 0 };
  // Chỉ xác nhận khi KHÔNG còn sự kiện ảnh hưởng tồn nào chưa lên server (chờ / lỗi / cần xem) — xác nhận = cam kết
  // máy đã đồng bộ hết; còn mục "cần xem" thì chủ shop phải xử lý trước (hoặc chốt cưỡng bức, có ghi cờ).
  if (await hasUnsettledStockEvents()) return { sessions: sessions.length, acked: 0, blocked: 'UNSETTLED_EVENTS' };
  const seq = await contiguousSyncedSeq(deviceId);
  let acked = 0;
  for (const s of sessions) {
    try {
      await rpc('kho_ack_count_session', { p_shop_id: shopId, p_session_id: s.id, p_device_id: deviceId, p_acked_seq: seq });
      acked++;
    } catch (err) {
      console.warn('[count-session] ack', s.id, err?.message || err);
    }
  }
  return { sessions: sessions.length, acked, seq };
}

export const startCountSession = (shopId, { id, warehouseId, note }) =>
  rpc('kho_start_count_session', { p_shop_id: shopId, p_session: { id, warehouse_id: warehouseId, note: note || null } });
/** lines: [{ itemId (mã mặt hàng Kho), counted }] — mã biến thể tách về product/variant như phiếu bán. */
export async function submitCountLines(shopId, sessionId, lines) {
  const { splitWebItemId } = await import('./catalog.js');
  return rpc('kho_submit_count_lines', { p_shop_id: shopId, p_session_id: sessionId,
    p_lines: lines.map((l) => { const r = splitWebItemId(l.itemId); return { product_id: r.product_id, variant_id: r.variant_id, counted: Number(l.counted) }; }) });
}
export const finalizeCountSession = (shopId, sessionId, force = false) =>
  rpc('kho_finalize_count_session', { p_shop_id: shopId, p_session_id: sessionId, p_force: !!force });
export const cancelCountSession = (shopId, sessionId) =>
  rpc('kho_cancel_count_session', { p_shop_id: shopId, p_session_id: sessionId });
export const resolveStockException = (shopId, exceptionId, action) =>
  rpc('kho_resolve_stock_exception', { p_shop_id: shopId, p_exception_id: exceptionId, p_action: action });

// ---- Đọc cho giao diện phiên kiểm kho (app.js renderCountSessions) ----------------------------------------
/** Thiết bị đã xác nhận đồng bộ trong 1 phiên. */
export const sessionAcks = (sessionId) =>
  selectAll(`kho_count_session_devices?session_id=eq.${enc(sessionId)}&select=device_id,acked_seq,acked_at`);
/** Thiết bị đang bật của shop (phiên chỉ chốt thường khi TẤT CẢ đã xác nhận). */
export const activeDevices = (shopId) =>
  selectAll(`kho_devices?shop_id=eq.${enc(shopId)}&status=eq.active&select=id,name,last_seen_at`);
/** Mục đối soát chờ xử lý (biến động tồn tới trong lúc kho đang kiểm). */
export const pendingStockExceptions = (shopId) =>
  selectAll(`kho_stock_exceptions?shop_id=eq.${enc(shopId)}&status=eq.pending&select=id,session_id,warehouse_id,product_id,variant_id,delta,reference_type,reference_id,suggestion,created_at&order=created_at.asc`);
