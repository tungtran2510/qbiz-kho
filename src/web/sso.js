// ==============================================================================
// QBIZ KHO — BACKEND WEB: SSO với website QBiz (thay việc nhận token thô qua URL). Giao thức giống bên web
// (anhpt: src/lib/sso/protocol.ts): BÊN NHẬN tạo state + verifier, bên cấp xin mã 1 lần ở server web, mã quay về ở
// FRAGMENT `#sso_code=…&state=…`, bên nhận đổi mã (kèm verifier) lấy phiên RIÊNG.
//   - Web → Kho  (Kho NHẬN): `/?sso=start&shop=<id>` → tạo giao dịch → <WEB>/auth/sso/authorize?target=kho…
//                             → quay về `/#sso_code…` → POST <WEB>/api/sso/redeem → lưu phiên Kho.
//   - Kho → web  (Kho CẤP) : web mở `/?sso=authorize&target=web&shop&state&challenge` → Kho dùng phiên của nó gọi
//                             POST <WEB>/api/sso/issue → chuyển tới URL server trả (trang quản trị web).
// Xử lý ở ĐẦU boot (trước khi mở DB / chạy đồng bộ). Không ghi log mã / verifier / token.
// ==============================================================================

import { CONFIG } from '../config.js';

const TX_KEY = 'qbiz_sso_tx';
const TX_TTL_MS = 10 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function b64url(bytes) {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randomToken() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return b64url(b);
}
export async function sha256b64url(s) {
  return b64url(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
const isToken = (v) => typeof v === 'string' && TOKEN.test(v);

/** Kho NHẬN: tạo giao dịch (sessionStorage — chỉ tab này) rồi sang trang cấp của web. */
export async function beginKhoReceive(shopId) {
  if (!CONFIG.WEB_ORIGIN) throw new Error('Chưa cấu hình địa chỉ website QBiz.');
  const tx = { state: randomToken(), verifier: randomToken(), shopId: String(shopId || ''), at: Date.now() };
  sessionStorage.setItem(TX_KEY, JSON.stringify(tx));
  const p = new URLSearchParams({ target: 'kho', shop: tx.shopId, state: tx.state, challenge: await sha256b64url(tx.verifier) });
  return `${CONFIG.WEB_ORIGIN}/auth/sso/authorize?${p.toString()}`;
}

/** Đọc + XOÁ fragment SSO khỏi URL. null nếu không có. { bad: true } nếu có nhưng sai định dạng. */
export function takeSsoFragment(loc = globalThis.location) {
  const p = new URLSearchParams(String(loc?.hash || '').replace(/^#/, ''));
  const code = p.get('sso_code'), state = p.get('state');
  if (!code && !state) return null;
  globalThis.history?.replaceState(null, '', loc.pathname + loc.search);
  return isToken(code) && isToken(state) ? { code, state } : { bad: true };
}

/** Lấy + XOÁ giao dịch khớp state (1 lần, hết hạn 10 phút). null = không có giao dịch → TỪ CHỐI (login-CSRF). */
export function takeReceiveTx(state) {
  let tx = null;
  try { tx = JSON.parse(sessionStorage.getItem(TX_KEY) || 'null'); } catch (_) { tx = null; }
  sessionStorage.removeItem(TX_KEY);
  if (!tx || tx.state !== state || Date.now() - tx.at > TX_TTL_MS) return null;
  return tx;
}

async function postWeb(path, body, token) {
  const res = await fetch(`${CONFIG.WEB_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const err = new Error(json?.error || 'Không kết nối được website QBiz.');
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Kho NHẬN: đổi mã lấy phiên Kho (server kiểm Origin = origin Kho). */
export async function redeemForKho(code, tx) {
  if (!CONFIG.WEB_ORIGIN) throw new Error('Chưa cấu hình địa chỉ website QBiz.');
  return postWeb('/api/sso/redeem', { code, verifier: tx.verifier, state: tx.state, target: 'kho' });
}

/** Kho CẤP cho web: tham số từ URL `?sso=authorize…` → URL quay về do server dựng. */
export async function issueForWeb(params, accessToken) {
  if (!CONFIG.WEB_ORIGIN) throw new Error('Chưa cấu hình địa chỉ website QBiz.');
  const { shop, state, challenge } = params;
  if (!shop || !isToken(state) || !isToken(challenge)) throw new Error('Liên kết đăng nhập không hợp lệ.');
  const json = await postWeb('/api/sso/issue', { target: 'web', shopId: shop, state, challenge }, accessToken);
  const dest = String(json.redirect || '');
  // Chỉ chuyển tới đúng website đã cấu hình (server dựng URL; kiểm thêm phía Kho cho chắc).
  if (!dest.startsWith(`${CONFIG.WEB_ORIGIN}/`)) throw new Error('Địa chỉ quay về không hợp lệ.');
  return dest;
}

/** URL mở 1 trang quản trị web (đường dẫn nội bộ `next`), đăng nhập sẵn bằng tài khoản Kho qua shop `shopId`
 *  (web là bên nhận; server kiểm quyền chủ shop / quản lý của shop đó). null nếu chưa cấu hình. */
export function webSsoUrl(shopId, next) {
  if (!CONFIG.WEB_ORIGIN || !shopId || !String(next || '').startsWith('/')) return null;
  return `${CONFIG.WEB_ORIGIN}/auth/sso/start?${new URLSearchParams({ from: 'kho', shop: shopId, next }).toString()}`;
}

/** URL mở trang quản trị web của shop (sub vd 'members', 'subscription'), đăng nhập sẵn bằng tài khoản Kho. */
export function webAdminSsoUrl(shopId, slug, sub = '') {
  if (!slug) return null;
  return webSsoUrl(shopId, `/admin/${encodeURIComponent(slug)}${sub ? '/' + sub : ''}`);
}

/** Đọc tham số `?sso=…` (start | authorize) rồi xoá khỏi URL. */
export function takeSsoQuery(loc = globalThis.location) {
  const q = new URLSearchParams(loc?.search || '');
  const mode = q.get('sso');
  if (mode !== 'start' && mode !== 'authorize') return null;
  const out = { mode, shop: q.get('shop') || '', target: q.get('target') || '', state: q.get('state') || '', challenge: q.get('challenge') || '' };
  ['sso', 'shop', 'target', 'state', 'challenge'].forEach((k) => q.delete(k));
  const rest = q.toString();
  globalThis.history?.replaceState(null, '', loc.pathname + (rest ? `?${rest}` : ''));
  return out;
}

/** sub + email trong access token (chỉ để so tài khoản / hiển thị — server đã xác thực). */
export function jwtClaims(token) {
  try {
    const p = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch (_) { return {}; }
}
