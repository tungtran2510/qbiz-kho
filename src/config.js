export const CONFIG = {
  APP_NAME: 'QBiz Kho',
  DB_NAME: 'qbiz_kho_v1',
  DB_VERSION: 13,
  // 'local' chạy độc lập/offline. Chuyển sang 'api' khi QBiz có Inventory API thật.
  SYNC_MODE: 'local',
  API_BASE_URL: '/api/inventory',
  DEFAULT_LOW_STOCK: 5,
  SUPABASE_URL: globalThis.__QBIZ_CONFIG__?.SUPABASE_URL || 'https://xewvtdprfsxsvdayrcvi.supabase.co',
  SUPABASE_ANON_KEY: globalThis.__QBIZ_CONFIG__?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhld3Z0ZHByZnN4c3ZkYXlyY3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNTU1NjYsImV4cCI6MjEwNTgzMTU2Nn0.AWWwJe-sHeEanmPW0ApfZhRF8okKWijffkdF3jSaVSM',
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
