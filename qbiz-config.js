// Cấu hình triển khai QBiz Kho (BACKEND web / legacy, Supabase, WEB_ORIGIN) — SINH khi build bằng
// scripts/write-qbiz-config.mjs từ biến môi trường (project kho.qbiz.vn). Bản trong repo để TRỐNG = chế độ legacy như cũ.
// Cấu hình chèn sẵn trên trang (window.__QBIZ_CONFIG__) được ưu tiên.
window.__QBIZ_CONFIG__ = Object.assign({}, {}, window.__QBIZ_CONFIG__ || {});
