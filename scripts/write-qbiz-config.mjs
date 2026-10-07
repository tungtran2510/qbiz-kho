// Sinh qbiz-config.js từ biến môi trường lúc build (Vercel project kho.qbiz.vn: Build Command
// `node scripts/write-qbiz-config.mjs`, Output Directory `.`). Thiếu QBIZ_BACKEND → file trống (legacy, không đổi gì).
//   QBIZ_BACKEND=web | legacy
//   QBIZ_SUPABASE_URL, QBIZ_SUPABASE_ANON_KEY   — Supabase của website QBiz (anon key, KHÔNG dùng service key)
//   QBIZ_WEB_ORIGIN                             — vd https://qbiz.vn (đăng ký / quên mật khẩu / SSO / trang quản trị)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const cfg = {};
if (env.QBIZ_BACKEND) cfg.BACKEND = env.QBIZ_BACKEND;
if (env.QBIZ_SUPABASE_URL) cfg.SUPABASE_URL = env.QBIZ_SUPABASE_URL;
if (env.QBIZ_SUPABASE_ANON_KEY) cfg.SUPABASE_ANON_KEY = env.QBIZ_SUPABASE_ANON_KEY;
if (env.QBIZ_WEB_ORIGIN) cfg.WEB_ORIGIN = env.QBIZ_WEB_ORIGIN;
if (cfg.BACKEND === 'web' && !(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.WEB_ORIGIN)) {
  console.error('QBIZ_BACKEND=web cần đủ QBIZ_SUPABASE_URL, QBIZ_SUPABASE_ANON_KEY, QBIZ_WEB_ORIGIN.');
  process.exit(1);
}
if (/service_role/.test(Buffer.from(String(cfg.SUPABASE_ANON_KEY || '').split('.')[1] || '', 'base64url').toString())) {
  console.error('QBIZ_SUPABASE_ANON_KEY đang là service_role key — KHÔNG được đưa ra trình duyệt.');
  process.exit(1);
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'qbiz-config.js');
fs.writeFileSync(out, `// SINH TỰ ĐỘNG bởi scripts/write-qbiz-config.mjs — không sửa tay.\nwindow.__QBIZ_CONFIG__ = Object.assign({}, ${JSON.stringify(cfg)}, window.__QBIZ_CONFIG__ || {});\n`);
console.log('qbiz-config.js:', Object.keys(cfg).join(', ') || '(trống — legacy)');
