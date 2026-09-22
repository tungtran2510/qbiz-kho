export const CONFIG = {
  APP_NAME: 'QBiz Kho',
  DB_NAME: 'qbiz_kho_v1',
  DB_VERSION: 12,
  // 'local' chạy độc lập/offline. Chuyển sang 'api' khi QBiz có Inventory API thật.
  SYNC_MODE: 'local',
  API_BASE_URL: '/api/inventory',
  DEFAULT_LOW_STOCK: 5,
  // Feature flags protect unfinished integrations and contracts from appearing as usable.
  FEATURE_FLAGS: {
    shipping_connector: false,
    marketplace_connector: false,
    customer_debt: false,
    supplier_debt: false,
    shift: true,
    advanced_profit: false,
    e_invoice: false,
    split_payment: false,
    cod_reconciliation: false,
  },
};
