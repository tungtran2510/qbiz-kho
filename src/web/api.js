// ==============================================================================
// QBIZ KHO — BACKEND WEB (Supabase của website QBiz): lớp gọi API dùng chung.
// Chỉ dùng khi CONFIG.BACKEND === 'web'. Mọi ghi dữ liệu đi qua RPC kho_* (server kiểm quyền + idempotent);
// client chỉ ĐỌC bảng trực tiếp (RLS của web giới hạn theo shop + vai trò + gói Kho).
// ==============================================================================

import { supabaseFetch, tryRefreshToken } from '../auth.js';

const PAGE = 1000;   // PostgREST mặc định tối đa 1000 dòng / lần

/** Lỗi do PHIÊN ĐĂNG NHẬP (hết hạn / sai) — không phải lỗi dữ liệu. Kiểm TRƯỚC mã nghiệp vụ (vd 'JWT expired'). */
export function isAuthError(err) {
  const msg = String(err?.details?.message || err?.details?.msg || err?.message || '');
  return err?.status === 401 || err?.details?.code === 'PGRST301' || err?.details?.code === 'PGRST303'
    || /jwt|token (is )?expired|invalid claim|not authenticated/i.test(msg);
}

// Làm mới phiên 1 lần cho mọi lời gọi đang chờ (không gọi refresh đồng thời nhiều lần).
let refreshing = null;
function refreshOnce() {
  if (!refreshing) refreshing = tryRefreshToken().finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

/** Gọi 1 lần; lỗi phiên → làm mới phiên rồi thử lại ĐÚNG 1 lần (payload giữ nguyên). */
async function withAuthRetry(call) {
  try {
    return await call();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    if (!(await refreshOnce())) throw err;   // không làm mới được → để flush tạm dừng (lỗi chờ), không "cần xem"
    return call();
  }
}

/** Gọi RPC của web. Lỗi ném ra giữ nguyên message server (vd 'TOTAL_MISMATCH: 700000') để phân loại. */
export async function rpc(name, args = {}) {
  return withAuthRetry(() => supabaseFetch(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }));
}

/** Ghi REST 1 dòng (bảng client được RLS cho ghi). */
export async function restInsert(table, row) {
  return withAuthRetry(() => supabaseFetch(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }));
}

/** Đọc TOÀN BỘ dòng của 1 truy vấn REST (tự phân trang bằng header Range). */
export async function selectAll(pathWithQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await withAuthRetry(() => supabaseFetch(`/rest/v1/${pathWithQuery}`, {
      method: 'GET',
      headers: { 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` },
    }));
    const list = Array.isArray(page) ? page : [];
    rows.push(...list);
    if (list.length < PAGE) break;
  }
  return rows;
}

/** Mã lỗi: 'AUTH' (phiên) | mã nghiệp vụ đầu message ('TOTAL_MISMATCH: 7000' → 'TOTAL_MISMATCH') | PG_<sqlstate> | NETWORK | HTTP_<n>. */
export function errorCode(err) {
  if (isAuthError(err)) return 'AUTH';
  const msg = String(err?.details?.message || err?.message || '');
  const m = msg.match(/^([A-Z][A-Z0-9_]{2,})(?::|\b)/);
  if (m) return m[1];
  const pg = err?.details?.code;               // mã Postgres (vd 40P01 deadlock, 23505 trùng khoá)
  if (pg) return `PG_${pg}`;
  if (!err?.status || /failed to fetch|networkerror|kết nối/i.test(msg)) return 'NETWORK';
  return `HTTP_${err.status}`;
}

/**
 * Phân loại lỗi đồng bộ (review Codex — không được lặp vô hạn phiếu sai, không được bỏ phiếu đang chờ):
 *  - 'retry'    : chờ rồi gửi lại (phiên đăng nhập, mạng, thứ tự chưa tới, gói hết hạn, kho đang kiểm, deadlock,
 *                 lỗi máy chủ).
 *  - 'terminal' : dữ liệu sai — đưa vào hàng "cần xem" cho chủ shop, KHÔNG xoá, KHÔNG gửi lại tự động.
 */
const RETRY_CODES = new Set([
  'AUTH', 'NETWORK', 'KHO_NOT_ENTITLED', 'WAREHOUSE_COUNTING', 'SHIFT_NOT_FOUND', 'SALE_NOT_FOUND', 'TRANSFER_NOT_FOUND',
  'CUSTOMER_NOT_FOUND', 'SUPPLIER_NOT_FOUND', 'SESSION_STILL_OPEN', 'NOT_AUTHENTICATED', 'PG_40P01', 'PG_40001',
  'PG_57014', 'HTTP_408', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504',
]);
export function classifyError(err) {
  return RETRY_CODES.has(errorCode(err)) ? 'retry' : 'terminal';
}
