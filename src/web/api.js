// ==============================================================================
// QBIZ KHO — BACKEND WEB (Supabase của website QBiz): lớp gọi API dùng chung.
// Chỉ dùng khi CONFIG.BACKEND === 'web'. Mọi ghi dữ liệu đi qua RPC kho_* (server kiểm quyền + idempotent);
// client chỉ ĐỌC bảng trực tiếp (RLS của web giới hạn theo shop + vai trò + gói Kho).
// ==============================================================================

import { supabaseFetch } from '../auth.js';

const PAGE = 1000;   // PostgREST mặc định tối đa 1000 dòng / lần

/** Gọi RPC của web. Lỗi ném ra giữ nguyên message server (vd 'TOTAL_MISMATCH: 700000') để phân loại. */
export async function rpc(name, args = {}) {
  return supabaseFetch(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
}

/** Đọc TOÀN BỘ dòng của 1 truy vấn REST (tự phân trang bằng header Range). */
export async function selectAll(pathWithQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await supabaseFetch(`/rest/v1/${pathWithQuery}`, {
      method: 'GET',
      headers: { 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` },
    });
    const list = Array.isArray(page) ? page : [];
    rows.push(...list);
    if (list.length < PAGE) break;
  }
  return rows;
}

/** Mã lỗi nghiệp vụ đầu message server: 'TOTAL_MISMATCH: 7000' → 'TOTAL_MISMATCH'. */
export function errorCode(err) {
  const msg = String(err?.details?.message || err?.message || '');
  const m = msg.match(/^([A-Z][A-Z0-9_]{2,})(?::|\b)/);
  if (m) return m[1];
  const pg = err?.details?.code;               // mã Postgres (vd 40P01 deadlock)
  if (pg) return `PG_${pg}`;
  if (!err?.status || /failed to fetch|networkerror|kết nối/i.test(msg)) return 'NETWORK';
  return `HTTP_${err.status}`;
}

/**
 * Phân loại lỗi đồng bộ (review Codex — không được lặp vô hạn phiếu sai, không được bỏ phiếu đang chờ):
 *  - 'retry'    : chờ rồi gửi lại (mạng, thứ tự chưa tới, gói hết hạn, kho đang kiểm, deadlock, lỗi máy chủ).
 *  - 'terminal' : dữ liệu sai — đưa vào hàng "cần xem" cho chủ shop, KHÔNG xoá, KHÔNG gửi lại tự động.
 */
const RETRY_CODES = new Set([
  'NETWORK', 'KHO_NOT_ENTITLED', 'WAREHOUSE_COUNTING', 'SHIFT_NOT_FOUND', 'SALE_NOT_FOUND', 'TRANSFER_NOT_FOUND',
  'CUSTOMER_NOT_FOUND', 'SUPPLIER_NOT_FOUND', 'SESSION_STILL_OPEN', 'NOT_AUTHENTICATED', 'PG_40P01', 'PG_40001',
  'HTTP_401', 'HTTP_408', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504',
]);
export function classifyError(err) {
  return RETRY_CODES.has(errorCode(err)) ? 'retry' : 'terminal';
}
