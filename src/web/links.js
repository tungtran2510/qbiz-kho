// ==============================================================================
// QBIZ KHO — BACKEND WEB: lối sang website QBiz (đăng ký, quên mật khẩu, trang quản trị, gói dịch vụ).
// Tài khoản + cửa hàng + gói đều quản lý ở web; Kho chỉ mở trang tương ứng. CONFIG.WEB_ORIGIN null → mọi hàm trả null
// (nơi gọi ẩn nút). Không truyền phiên đăng nhập qua URL — SSO 2 chiều làm ở bước sau.
// ==============================================================================

import { CONFIG } from '../config.js';

export function webUrl(path) { return CONFIG.WEB_ORIGIN ? CONFIG.WEB_ORIGIN + path : null; }

/** Đăng ký QBiz Kho (tạo tài khoản + cửa hàng + dùng thử Kho) tại web. */
export const webRegisterUrl = () => webUrl('/register-shop?product=kho');

/** Quên mật khẩu: web tự gửi email khôi phục (link quay về trang đặt lại mật khẩu của web). */
export const webForgotUrl = (email = '') => webUrl('/login?forgot=1' + (email ? '&email=' + encodeURIComponent(email) : ''));

/** Trang quản trị web của shop (sub vd 'subscription', 'products'). */
export const webAdminUrl = (slug, sub = '') => (slug ? webUrl('/admin/' + encodeURIComponent(slug) + (sub ? '/' + sub : '')) : null);

/** Mở trang web ở tab mới. false nếu chưa cấu hình WEB_ORIGIN. */
export function openWebPage(url) {
  if (!url || typeof window === 'undefined') return false;
  window.open(url, '_blank', 'noopener');
  return true;
}
