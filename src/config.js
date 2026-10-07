export const CONFIG = {
  APP_NAME: 'QBiz Kho',
  DB_NAME: 'qbiz_kho_v1',
  DB_VERSION: 13,
  // 'local' chạy độc lập/offline. Chuyển sang 'api' khi QBiz có Inventory API thật.
  SYNC_MODE: 'local',
  API_BASE_URL: '/api/inventory',
  DEFAULT_LOW_STOCK: 5,
  // 'legacy' = Supabase riêng của Kho (mặc định, giữ nguyên hành vi cũ). 'web' = dùng chung database + đăng nhập
  // của website QBiz (RPC kho_*; xem src/web/). Đặt qua window.__QBIZ_CONFIG__ = { BACKEND:'web', SUPABASE_URL,
  // SUPABASE_ANON_KEY } lúc deploy (vd kho.qbiz.vn) — không cần sửa code.
  BACKEND: globalThis.__QBIZ_CONFIG__?.BACKEND === 'web' ? 'web' : 'legacy',
  // Backend web: địa chỉ website QBiz (vd https://qbiz.vn) — đăng ký / quên mật khẩu / trang quản trị mở ở đó. Chỉ lấy từ
  // __QBIZ_CONFIG__ (KHÔNG mặc định trỏ production — môi trường kiểm thử); thiếu → ẩn mọi lối sang web.
  WEB_ORIGIN: (() => {
    const v = String(globalThis.__QBIZ_CONFIG__?.WEB_ORIGIN || '').replace(/\/+$/, '');
    return /^https?:\/\/[^/?#]+$/i.test(v) ? v : null;
  })(),
  SUPABASE_URL: globalThis.__QBIZ_CONFIG__?.SUPABASE_URL || 'https://ofcooslacddbizlykobh.supabase.co',
  SUPABASE_ANON_KEY: globalThis.__QBIZ_CONFIG__?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mY29vc2xhY2RkYml6bHlrb2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTU1NDIsImV4cCI6MjEwNjc5MTU0Mn0.R1Gr5et2QyTZ_cccChiMKAW5zU6PIyrHgkuvZzueroc',
  // Feature flags protect unfinished integrations and contracts from appearing as usable.
  FEATURE_FLAGS: {
    auth: true,
    shipping_connector: false,
    marketplace_connector: false,
    customer_debt: false,
    supplier_debt: false,
    shift: true,
    advanced_profit: false,
    e_invoice: true,
    split_payment: false,
    cod_reconciliation: false,
  },
};
