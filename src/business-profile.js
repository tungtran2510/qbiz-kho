/**
 * QBIZ KHO — BUSINESS PROFILE / BUSINESS MODE FOUNDATION (PHASE 1)
 * 
 * Purpose: Provide an extensible, capability-driven business profile engine
 * that allows QBiz to adapt across diverse business models (Retail, Wholesale,
 * Service, General) without code forking or hard-coded industry logic.
 * 
 * STRICT PHASE 1 INVARIANT:
 * Engine-only foundation. Absolutely NO unprompted UI/presentation modification.
 * Existing UI renders 100% identically to the established baseline.
 */

import { setting, setSetting } from './db.js';

export const SCHEMA_VERSION = 1;
export const BUSINESS_MODE_SETTING_KEY = 'qbiz_business_mode_profile';
export const BUSINESS_MODE_STORAGE_KEY = 'qbiz_business_mode_profile';

// Backward-compatible aliases
export const SETTING_KEY = BUSINESS_MODE_SETTING_KEY;
export const STORAGE_KEY = BUSINESS_MODE_STORAGE_KEY;

/**
 * Canonical Business Concepts for Terminology Mapping
 */
export const CANONICAL_CONCEPTS = Object.freeze({
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
  CUSTOMER: 'CUSTOMER',
  ORDER: 'ORDER',
  SALE: 'SALE',
  WAREHOUSE: 'WAREHOUSE',
  SUPPLIER: 'SUPPLIER',
  APPOINTMENT: 'APPOINTMENT',
  CATEGORY: 'CATEGORY',
  SHIFT: 'SHIFT',
  EXPENSE: 'EXPENSE',
  REPORT: 'REPORT',
});

/**
 * Standard Capabilities Recognized by the Engine
 */
export const CAPABILITY_KEYS = Object.freeze([
  'inventory',
  'service',
  'appointment',
  'wholesale',
  'retail',
  'customer_management',
  'supplier_management',
  'multi_warehouse',
  'barcode',
  'delivery',
  'debt',
  'warranty',
  'serial_imei',
  'batch_expiry',
  'variants',
  'price_lists',
  'commission',
  'booking',
]);

/**
 * PRESET 1: GENERAL (Default baseline - identical to current QBiz Kho behavior)
 */
export const PRESET_GENERAL = Object.freeze({
  schema_version: SCHEMA_VERSION,
  profile_id: 'general',
  profile_version: 1,
  name: 'Cửa hàng chung',
  business_type: 'GENERAL',
  capabilities: {
    inventory: true,
    service: true,
    appointment: false,
    wholesale: false,
    retail: true,
    customer_management: true,
    supplier_management: true,
    multi_warehouse: true,
    barcode: true,
    delivery: false,
    debt: true,
    warranty: false,
    serial_imei: false,
    batch_expiry: false,
    variants: false,
    price_lists: false,
    commission: false,
    booking: false,
  },
  feature_defaults: {
    track_stock_default: true,
    allow_negative_stock: false,
    require_customer_on_sale: false,
    auto_barcode: true,
    default_warehouse_code: 'MAIN',
  },
  terminology: {
    PRODUCT: { singular: 'Hàng hóa', plural: 'Hàng hóa', label: 'Hàng hóa', action_create: 'Thêm hàng hóa' },
    SERVICE: { singular: 'Dịch vụ', plural: 'Dịch vụ', label: 'Dịch vụ', action_create: 'Thêm dịch vụ' },
    CUSTOMER: { singular: 'Khách hàng', plural: 'Khách hàng', label: 'Khách hàng', action_create: 'Thêm khách hàng' },
    ORDER: { singular: 'Đơn hàng', plural: 'Đơn hàng', label: 'Đơn hàng', action_create: 'Tạo đơn hàng' },
    SALE: { singular: 'Bán hàng', plural: 'Phiếu bán', label: 'Bán hàng', action_create: 'Bán hàng' },
    WAREHOUSE: { singular: 'Kho', plural: 'Kho hàng', label: 'Kho', action_create: 'Thêm kho' },
    SUPPLIER: { singular: 'Nhà cung cấp', plural: 'Nhà cung cấp', label: 'Nhà cung cấp', action_create: 'Thêm nhà cung cấp' },
    APPOINTMENT: { singular: 'Lịch hẹn', plural: 'Lịch hẹn', label: 'Lịch hẹn', action_create: 'Đặt lịch' },
    CATEGORY: { singular: 'Danh mục', plural: 'Danh mục', label: 'Danh mục', action_create: 'Thêm danh mục' },
    SHIFT: { singular: 'Ca làm việc', plural: 'Sổ ca', label: 'Ca bán hàng', action_create: 'Mở ca' },
    EXPENSE: { singular: 'Chi phí', plural: 'Chi phí', label: 'Chi phí', action_create: 'Tạo chi' },
    REPORT: { singular: 'Báo cáo', plural: 'Báo cáo', label: 'Báo cáo', action_create: 'Xem báo cáo' },
  },
  navigation_preferences: {
    menu_priority: ['dashboard', 'products', 'sales', 'transfers', 'more'],
    preferred_home_actions: ['sale', 'receive', 'count', 'orders', 'customers'],
    module_priority: ['dashboard', 'sales', 'products', 'transfers', 'orders', 'customers', 'suppliers', 'shifts', 'reports', 'settings'],
    frequently_used_modules: ['dashboard', 'sales', 'products', 'transfers'],
    hidden_by_default_candidates: [],
  },
  workflow_preferences: {
    sale_mode: 'standard',
    stock_tracking: 'strict',
    service_mode: 'bundled',
    booking_mode: 'disabled',
    invoice_mode: 'standard_receipt',
    customer_required: false,
    supplier_usage: 'full',
    delivery_usage: 'optional',
    warehouse_mode: 'multi',
  },
  visual_preferences: {
    density: 'comfortable',
    card_view: 'grid',
    preferred_content_emphasis: 'image_primary',
    image_importance: 'high',
    data_density: 'medium',
    dashboard_emphasis: 'sales_first',
  },
  metadata: {
    is_preset: true,
    description: 'Cấu hình tiêu chuẩn cho cửa hàng bán lẻ và quản lý kho tổng hợp.',
    created_at: '2026-09-22T00:00:00.000Z',
  },
});

/**
 * PRESET 2: RETAIL (Convenience store, grocery, supermarket)
 */
export const PRESET_RETAIL = Object.freeze({
  schema_version: SCHEMA_VERSION,
  profile_id: 'retail',
  profile_version: 1,
  name: 'Bán lẻ',
  business_type: 'RETAIL',
  capabilities: {
    inventory: true,
    service: false,
    appointment: false,
    wholesale: false,
    retail: true,
    customer_management: true,
    supplier_management: true,
    multi_warehouse: true,
    barcode: true,
    delivery: false,
    debt: true,
    warranty: false,
    serial_imei: false,
    batch_expiry: true,
    variants: true,
    price_lists: false,
    commission: false,
    booking: false,
  },
  feature_defaults: {
    track_stock_default: true,
    allow_negative_stock: false,
    require_customer_on_sale: false,
    auto_barcode: true,
  },
  terminology: {
    PRODUCT: { singular: 'Sản phẩm', plural: 'Sản phẩm', label: 'Sản phẩm', action_create: 'Thêm sản phẩm' },
    SERVICE: { singular: 'Dịch vụ phụ', plural: 'Dịch vụ phụ', label: 'Dịch vụ', action_create: 'Thêm dịch vụ' },
    CUSTOMER: { singular: 'Khách mua', plural: 'Khách mua', label: 'Khách hàng', action_create: 'Thêm khách hàng' },
    ORDER: { singular: 'Đơn giao hàng', plural: 'Đơn giao hàng', label: 'Đơn hàng', action_create: 'Tạo đơn' },
    SALE: { singular: 'Thu ngân (POS)', plural: 'Hóa đơn', label: 'Thu ngân', action_create: 'Bán lẻ' },
    WAREHOUSE: { singular: 'Kho / Quầy', plural: 'Kho & Quầy', label: 'Kho', action_create: 'Thêm kho' },
    SUPPLIER: { singular: 'Nhà phân phối', plural: 'Nhà phân phối', label: 'Nhà cung cấp', action_create: 'Thêm nhà cung cấp' },
    APPOINTMENT: { singular: 'Lịch hẹn', plural: 'Lịch hẹn', label: 'Lịch hẹn', action_create: 'Đặt lịch' },
    CATEGORY: { singular: 'Ngành hàng', plural: 'Ngành hàng', label: 'Ngành hàng', action_create: 'Thêm ngành hàng' },
    SHIFT: { singular: 'Ca thu ngân', plural: 'Sổ ca', label: 'Ca thu ngân', action_create: 'Mở ca' },
    EXPENSE: { singular: 'Khoản chi', plural: 'Khoản chi', label: 'Chi phí', action_create: 'Tạo chi' },
    REPORT: { singular: 'Báo cáo bán lẻ', plural: 'Báo cáo bán lẻ', label: 'Báo cáo', action_create: 'Xem báo cáo' },
  },
  navigation_preferences: {
    menu_priority: ['sales', 'products', 'dashboard', 'transfers', 'more'],
    preferred_home_actions: ['sale', 'receive', 'count'],
    module_priority: ['sales', 'products', 'dashboard', 'transfers', 'shifts', 'orders', 'customers', 'suppliers', 'reports', 'settings'],
    frequently_used_modules: ['sales', 'products', 'shifts'],
    hidden_by_default_candidates: [],
  },
  workflow_preferences: {
    sale_mode: 'fast_pos',
    stock_tracking: 'strict',
    service_mode: 'standalone',
    booking_mode: 'disabled',
    invoice_mode: 'standard_receipt',
    customer_required: false,
    supplier_usage: 'full',
    delivery_usage: 'none',
    warehouse_mode: 'multi',
  },
  visual_preferences: {
    density: 'compact',
    card_view: 'grid',
    preferred_content_emphasis: 'barcode_primary',
    image_importance: 'medium',
    data_density: 'high',
    dashboard_emphasis: 'sales_first',
  },
  metadata: {
    is_preset: true,
    description: 'Tối ưu cho bán lẻ quầy thu ngân nhanh, quét mã vạch liên tục và ca bán hàng.',
    created_at: '2026-09-22T00:00:00.000Z',
  },
});

/**
 * PRESET FASHION: Apparel, boutique, shoes, accessories
 */
export const PRESET_FASHION = Object.freeze({
  ...PRESET_RETAIL,
  profile_id: 'fashion',
  name: 'Thời trang & Phụ kiện',
  business_type: 'FASHION',
  capabilities: {
    ...PRESET_RETAIL.capabilities,
    variants: true,
    barcode: true,
  },
  terminology: {
    ...PRESET_RETAIL.terminology,
    PRODUCT: { singular: 'Sản phẩm thời trang', plural: 'Sản phẩm', label: 'Thời trang', action_create: 'Thêm sản phẩm' },
    CATEGORY: { singular: 'Bộ sưu tập', plural: 'Bộ sưu tập', label: 'Bộ sưu tập', action_create: 'Thêm bộ sưu tập' },
    WAREHOUSE: { singular: 'Kho / Showroom', plural: 'Kho & Showroom', label: 'Kho', action_create: 'Thêm kho' },
    SHIFT: { singular: 'Ca bán hàng', plural: 'Sổ ca', label: 'Ca bán hàng', action_create: 'Mở ca' },
  },
  metadata: {
    ...PRESET_RETAIL.metadata,
    base_preset: 'retail',
    description: 'Tối ưu cho shop thời trang, quần áo, váy đầm, giày dép, phụ kiện quản lý theo size và màu sắc.',
    created_at: '2026-09-26T00:00:00.000Z',
  },
});

/**
 * PRESET 3: WHOLESALE (Distributor, B2B wholesale)
 */
export const PRESET_WHOLESALE = Object.freeze({
  schema_version: SCHEMA_VERSION,
  profile_id: 'wholesale',
  profile_version: 1,
  name: 'Bán sỉ',
  business_type: 'WHOLESALE',
  capabilities: {
    inventory: true,
    service: false,
    appointment: false,
    wholesale: true,
    retail: false,
    customer_management: true,
    supplier_management: true,
    multi_warehouse: true,
    barcode: true,
    delivery: true,
    debt: true,
    warranty: false,
    serial_imei: true,
    batch_expiry: true,
    variants: true,
    price_lists: true,
    commission: true,
    booking: false,
  },
  feature_defaults: {
    track_stock_default: true,
    allow_negative_stock: false,
    require_customer_on_sale: true,
    auto_barcode: false,
  },
  terminology: {
    PRODUCT: { singular: 'Mặt hàng', plural: 'Mặt hàng', label: 'Mặt hàng', action_create: 'Thêm mặt hàng' },
    SERVICE: { singular: 'Chi phí phụ', plural: 'Chi phí phụ', label: 'Dịch vụ phụ', action_create: 'Thêm dịch vụ' },
    CUSTOMER: { singular: 'Đại lý / Đối tác', plural: 'Đại lý', label: 'Đại lý', action_create: 'Thêm đại lý' },
    ORDER: { singular: 'Đơn đặt hàng', plural: 'Đơn đặt hàng', label: 'Đơn hàng', action_create: 'Lập đơn đặt hàng' },
    SALE: { singular: 'Xuất buôn', plural: 'Phiếu xuất buôn', label: 'Xuất buôn', action_create: 'Lập phiếu xuất' },
    WAREHOUSE: { singular: 'Kho tổng / Kho phụ', plural: 'Hệ thống kho', label: 'Kho', action_create: 'Thêm kho' },
    SUPPLIER: { singular: 'Nhà sản xuất / Đầu nguồn', plural: 'Nguồn hàng', label: 'Nhà cung cấp', action_create: 'Thêm nhà cung cấp' },
    APPOINTMENT: { singular: 'Lịch hẹn giao hàng', plural: 'Lịch hẹn', label: 'Lịch hẹn', action_create: 'Đặt lịch' },
    CATEGORY: { singular: 'Nhóm phân phối', plural: 'Nhóm phân phối', label: 'Nhóm hàng', action_create: 'Thêm nhóm hàng' },
    SHIFT: { singular: 'Phiên làm việc', plural: 'Phiên làm việc', label: 'Phiên làm việc', action_create: 'Mở phiên' },
    EXPENSE: { singular: 'Chi phí vận hành', plural: 'Chi phí vận hành', label: 'Chi phí', action_create: 'Tạo phiếu chi' },
    REPORT: { singular: 'Báo cáo doanh số', plural: 'Báo cáo doanh số', label: 'Báo cáo', action_create: 'Xem báo cáo' },
  },
  navigation_preferences: {
    menu_priority: ['orders', 'transfers', 'products', 'dashboard', 'more'],
    preferred_home_actions: ['orders', 'receive', 'transfer', 'customers'],
    module_priority: ['orders', 'transfers', 'products', 'customers', 'dashboard', 'suppliers', 'reports', 'settings', 'sales', 'shifts'],
    frequently_used_modules: ['orders', 'transfers', 'customers', 'products'],
    hidden_by_default_candidates: [],
  },
  workflow_preferences: {
    sale_mode: 'wholesale_order',
    stock_tracking: 'strict',
    service_mode: 'standalone',
    booking_mode: 'disabled',
    invoice_mode: 'delivery_bill',
    customer_required: true,
    supplier_usage: 'full',
    delivery_usage: 'integrated',
    warehouse_mode: 'multi',
  },
  visual_preferences: {
    density: 'compact',
    card_view: 'table',
    preferred_content_emphasis: 'sku_primary',
    image_importance: 'low',
    data_density: 'high',
    dashboard_emphasis: 'inventory_first',
  },
  metadata: {
    is_preset: true,
    description: 'Tối ưu cho doanh nghiệp phân phối B2B, quản lý công nợ đại lý, điều chuyển kho và đơn hàng số lượng lớn.',
    created_at: '2026-09-22T00:00:00.000Z',
  },
});

/**
 * PRESET 4: SERVICE (Spa, Salon, Clinic, Consulting, Education)
 */
export const PRESET_SERVICE = Object.freeze({
  schema_version: SCHEMA_VERSION,
  profile_id: 'service',
  profile_version: 1,
  name: 'Dịch vụ',
  business_type: 'SERVICE',
  capabilities: {
    inventory: false,
    service: true,
    appointment: true,
    wholesale: false,
    retail: false,
    customer_management: true,
    supplier_management: false,
    multi_warehouse: false,
    barcode: false,
    delivery: false,
    debt: true,
    warranty: false,
    serial_imei: false,
    batch_expiry: false,
    variants: false,
    price_lists: false,
    commission: true,
    booking: true,
  },
  feature_defaults: {
    track_stock_default: false,
    allow_negative_stock: true,
    require_customer_on_sale: true,
    auto_barcode: false,
  },
  terminology: {
    PRODUCT: { singular: 'Gói dịch vụ', plural: 'Gói dịch vụ', label: 'Gói dịch vụ', action_create: 'Thêm gói dịch vụ' },
    SERVICE: { singular: 'Liệu trình / Dịch vụ', plural: 'Liệu trình', label: 'Liệu trình', action_create: 'Thêm liệu trình' },
    CUSTOMER: { singular: 'Khách hàng / Học viên', plural: 'Hội viên', label: 'Khách hàng', action_create: 'Thêm hồ sơ khách' },
    ORDER: { singular: 'Phiếu dịch vụ', plural: 'Phiếu dịch vụ', label: 'Phiếu dịch vụ', action_create: 'Tạo phiếu dịch vụ' },
    SALE: { singular: 'Thanh toán dịch vụ', plural: 'Hóa đơn dịch vụ', label: 'Thanh toán', action_create: 'Lập phiếu thu' },
    WAREHOUSE: { singular: 'Kho vật tư / Tủ đồ', plural: 'Kho vật tư', label: 'Kho vật tư', action_create: 'Thêm kho vật tư' },
    SUPPLIER: { singular: 'Nhà cung ứng vật tư', plural: 'Nhà cung ứng', label: 'Nhà cung ứng', action_create: 'Thêm nhà cung ứng' },
    APPOINTMENT: { singular: 'Lịch hẹn / Ca dịch vụ', plural: 'Lịch hẹn', label: 'Lịch hẹn', action_create: 'Đặt lịch hẹn' },
    CATEGORY: { singular: 'Nhóm dịch vụ', plural: 'Nhóm dịch vụ', label: 'Nhóm dịch vụ', action_create: 'Thêm nhóm dịch vụ' },
    SHIFT: { singular: 'Ca làm việc kỹ thuật viên', plural: 'Ca làm việc', label: 'Ca làm việc', action_create: 'Mở ca' },
    EXPENSE: { singular: 'Khoản chi phí', plural: 'Khoản chi phí', label: 'Chi phí', action_create: 'Tạo phiếu chi' },
    REPORT: { singular: 'Báo cáo dịch vụ', plural: 'Báo cáo dịch vụ', label: 'Báo cáo', action_create: 'Xem báo cáo' },
  },
  navigation_preferences: {
    menu_priority: ['dashboard', 'products', 'sales', 'customers', 'more'],
    preferred_home_actions: ['sale', 'customers', 'orders'],
    module_priority: ['dashboard', 'sales', 'customers', 'products', 'orders', 'shifts', 'reports', 'settings', 'transfers', 'suppliers'],
    frequently_used_modules: ['dashboard', 'sales', 'customers'],
    hidden_by_default_candidates: ['transfers', 'suppliers'],
  },
  workflow_preferences: {
    sale_mode: 'service_ticket',
    stock_tracking: 'none',
    service_mode: 'session_based',
    booking_mode: 'required',
    invoice_mode: 'standard_receipt',
    customer_required: true,
    supplier_usage: 'minimal',
    delivery_usage: 'none',
    warehouse_mode: 'single',
  },
  visual_preferences: {
    density: 'comfortable',
    card_view: 'list',
    preferred_content_emphasis: 'title_primary',
    image_importance: 'medium',
    data_density: 'medium',
    dashboard_emphasis: 'service_first',
  },
  metadata: {
    is_preset: true,
    description: 'Tối ưu cho cơ sở dịch vụ, spa, salon làm đẹp, trung tâm đào tạo và tư vấn.',
    created_at: '2026-09-22T00:00:00.000Z',
  },
});

/**
 * PRESET 5: FNB (Quán ăn / Cà phê) - Mapped to retail capabilities without fake capability
 */
export const PRESET_FNB = Object.freeze({
  ...PRESET_RETAIL,
  profile_id: 'fnb',
  name: 'Quán ăn / Cà phê',
  terminology: {
    ...PRESET_RETAIL.terminology,
    PRODUCT: { singular: 'Món', plural: 'Danh sách món', label: 'Món / Sản phẩm', action_create: 'Thêm món' },
    SALE: { singular: 'Bán hàng', plural: 'Phiếu bán nhanh', label: 'Bán hàng nhanh', action_create: 'Bán hàng' },
    ORDER: { singular: 'Đơn hàng', plural: 'Đơn hàng', label: 'Đơn hàng', action_create: 'Tạo đơn' },
    WAREHOUSE: { singular: 'Kho nguyên liệu', plural: 'Kho nguyên liệu', label: 'Kho', action_create: 'Thêm kho' },
  },
  navigation_preferences: {
    menu_priority: ['sales', 'orders', 'products', 'dashboard', 'more'],
    preferred_home_actions: ['sales', 'orders', 'products', 'transactions', 'receive'],
    module_priority: ['sales', 'orders', 'products', 'dashboard', 'transfers', 'shifts', 'reports', 'settings', 'customers', 'suppliers'],
    frequently_used_modules: ['sales', 'orders', 'products'],
    hidden_by_default_candidates: [],
  },
  workflow_preferences: {
    sale_mode: 'fast_pos',
    stock_tracking: 'optional',
    service_mode: 'standalone',
    booking_mode: 'disabled',
    invoice_mode: 'standard_receipt',
    customer_required: false,
    supplier_usage: 'minimal',
    delivery_usage: 'none',
    warehouse_mode: 'single',
  },
  visual_preferences: {
    density: 'comfortable',
    card_view: 'grid',
    preferred_content_emphasis: 'image_primary',
    image_importance: 'high',
    data_density: 'medium',
    dashboard_emphasis: 'sales_first',
  },
  metadata: {
    ...PRESET_RETAIL.metadata,
    base_preset: 'retail',
    description: 'Bán nhanh, món hàng, tồn kho',
  },
});

/**
 * PRESET 6: CONSULTING (Chuyên gia / Tư vấn) - Mapped to service capabilities without fake capability
 */
export const PRESET_CONSULTING = Object.freeze({
  ...PRESET_SERVICE,
  profile_id: 'consulting',
  name: 'Chuyên gia / Tư vấn',
  terminology: {
    ...PRESET_SERVICE.terminology,
    PRODUCT: { singular: 'Gói tư vấn', plural: 'Gói tư vấn', label: 'Gói tư vấn', action_create: 'Thêm gói tư vấn' },
    SERVICE: { singular: 'Dịch vụ tư vấn', plural: 'Dịch vụ', label: 'Dịch vụ', action_create: 'Thêm dịch vụ' },
    CUSTOMER: { singular: 'Khách tư vấn', plural: 'Khách hàng / Đối tác', label: 'Khách hàng', action_create: 'Thêm hồ sơ' },
    ORDER: { singular: 'Đơn dịch vụ', plural: 'Đơn dịch vụ', label: 'Đơn dịch vụ', action_create: 'Tạo đơn' },
    SALE: { singular: 'Thu phí tư vấn', plural: 'Biên lai', label: 'Thanh toán', action_create: 'Thu phí' },
    WAREHOUSE: { singular: 'Kho tài liệu', plural: 'Kho tài liệu', label: 'Kho', action_create: 'Thêm kho' },
  },
  navigation_preferences: {
    menu_priority: ['products', 'customers', 'sales', 'dashboard', 'more'],
    preferred_home_actions: ['services', 'customers', 'sales', 'orders', 'transactions'],
    module_priority: ['products', 'customers', 'sales', 'orders', 'dashboard', 'reports', 'settings', 'shifts', 'transfers', 'suppliers'],
    frequently_used_modules: ['products', 'customers', 'sales'],
    hidden_by_default_candidates: ['transfers', 'suppliers'],
  },
  workflow_preferences: {
    sale_mode: 'service_ticket',
    stock_tracking: 'none',
    service_mode: 'session_based',
    booking_mode: 'disabled',
    invoice_mode: 'standard_receipt',
    customer_required: true,
    supplier_usage: 'none',
    delivery_usage: 'none',
    warehouse_mode: 'single',
  },
  visual_preferences: {
    density: 'comfortable',
    card_view: 'list',
    preferred_content_emphasis: 'title_primary',
    image_importance: 'low',
    data_density: 'medium',
    dashboard_emphasis: 'service_first',
  },
  metadata: {
    ...PRESET_SERVICE.metadata,
    base_preset: 'service',
    description: 'Dịch vụ tư vấn, hồ sơ khách hàng, đơn dịch vụ',
  },
});

/**
 * PRESET 7: OTHER (Khác) - Mapped to general baseline
 */
export const PRESET_OTHER = Object.freeze({
  ...PRESET_GENERAL,
  profile_id: 'other',
  name: 'Khác',
  metadata: {
    ...PRESET_GENERAL.metadata,
    base_preset: 'general',
    description: 'Cấu hình tiêu chuẩn linh hoạt',
  },
});

/**
 * Registry of available built-in presets
 */
export const PROFILE_PRESETS = Object.freeze({
  [PRESET_GENERAL.profile_id]: PRESET_GENERAL,
  [PRESET_RETAIL.profile_id]: PRESET_RETAIL,
  [PRESET_FASHION.profile_id]: PRESET_FASHION,
  [PRESET_WHOLESALE.profile_id]: PRESET_WHOLESALE,
  [PRESET_SERVICE.profile_id]: PRESET_SERVICE,
  [PRESET_FNB.profile_id]: PRESET_FNB,
  'food_beverage': PRESET_FNB,
  [PRESET_CONSULTING.profile_id]: PRESET_CONSULTING,
  [PRESET_OTHER.profile_id]: PRESET_OTHER,
});

/**
 * User-facing Business Mode Options for UI Selector
 */
export const BUSINESS_MODE_OPTIONS = Object.freeze([
  {
    id: 'general',
    name: 'Cửa hàng chung',
    desc: 'Bán hàng, quản lý kho, theo dõi tồn',
    icon: 'store',
    recommended_uses: ['Bán hàng tổng hợp', 'Quản lý kho hàng', 'Khách hàng'],
  },
  {
    id: 'retail',
    name: 'Bán lẻ',
    desc: 'Thu ngân nhanh, quét mã, ca bán',
    icon: 'shopping-bag',
    recommended_uses: ['Bán quầy thu ngân', 'Quét mã vạch nhanh', 'Mở & đóng ca bán'],
  },
  {
    id: 'fashion',
    name: 'Thời trang',
    desc: 'Size, màu sắc, biến thể, quầy bán',
    icon: 'tag',
    recommended_uses: ['Thời trang & Quần áo', 'Biến thể size / màu', 'Bán hàng showroom'],
  },
  {
    id: 'fnb',
    name: 'Quán ăn / Cà phê',
    desc: 'Bán nhanh, món hàng, tồn kho',
    icon: 'coffee',
    recommended_uses: ['Bán nhanh tại quầy', 'Món hàng & thực đơn', 'Tồn kho nguyên vật liệu'],
  },
  {
    id: 'wholesale',
    name: 'Bán sỉ',
    desc: 'Kho, khách hàng, bảng giá',
    icon: 'boxes',
    recommended_uses: ['Xuất buôn & phân phối', 'Bảng giá theo đại lý', 'Quản lý công nợ'],
  },
  {
    id: 'service',
    name: 'Dịch vụ',
    desc: 'Gói dịch vụ, hồ sơ khách, hóa đơn',
    icon: 'sparkles',
    recommended_uses: ['Quản lý gói dịch vụ', 'Hồ sơ khách hàng', 'Hóa đơn dịch vụ'],
  },
  {
    id: 'consulting',
    name: 'Chuyên gia / Tư vấn',
    desc: 'Dịch vụ tư vấn, hồ sơ khách hàng',
    icon: 'user-check',
    recommended_uses: ['Tư vấn chuyên gia', 'Hồ sơ đối tác & khách', 'Theo dõi đơn dịch vụ'],
  },
  {
    id: 'other',
    name: 'Khác',
    desc: 'Cấu hình tiêu chuẩn linh hoạt',
    icon: 'layout-grid',
    recommended_uses: ['Mô hình kinh doanh mở', 'Tùy chỉnh linh hoạt', 'Nghiệp vụ cơ bản'],
  },
]);

/**
 * Human-readable capability labels for preview
 */
export const CAPABILITY_LABELS = Object.freeze({
  retail: 'Bán hàng (POS)',
  inventory: 'Kho & tồn kho',
  customer_management: 'Khách hàng',
  supplier_management: 'Nhà cung cấp',
  service: 'Gói dịch vụ',
  appointment: 'Lịch hẹn',
  wholesale: 'Bán sỉ / Đại lý',
  barcode: 'Quét mã vạch',
  price_lists: 'Bảng giá riêng',
  multi_warehouse: 'Nhiều kho',
  debt: 'Công nợ',
  booking: 'Đặt lịch',
  delivery: 'Giao hàng',
});

/**
 * DEFAULT fallback profile (Strict invariant: Must match current system behavior)
 */
export const DEFAULT_BUSINESS_PROFILE = PRESET_GENERAL;

// In-memory active profile instance
let activeProfile = deepClone(DEFAULT_BUSINESS_PROFILE);
let isInitialized = false;

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (_) {
    return { ...obj };
  }
}

/**
 * Validate profile structure against schema
 * @param {Object} profile 
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBusinessProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Profile must be a non-null object'] };
  }

  if (typeof profile.profile_id !== 'string' || !profile.profile_id.trim()) {
    errors.push('Missing or invalid profile_id');
  }

  if (typeof profile.name !== 'string' || !profile.name.trim()) {
    errors.push('Missing or invalid name');
  }

  if (typeof profile.business_type !== 'string' || !profile.business_type.trim()) {
    errors.push('Missing or invalid business_type');
  }

  if (!profile.capabilities || typeof profile.capabilities !== 'object') {
    errors.push('Missing or invalid capabilities object');
  }

  if (!profile.terminology || typeof profile.terminology !== 'object') {
    errors.push('Missing or invalid terminology object');
  }

  if (!profile.navigation_preferences || typeof profile.navigation_preferences !== 'object') {
    errors.push('Missing or invalid navigation_preferences object');
  }

  if (!profile.workflow_preferences || typeof profile.workflow_preferences !== 'object') {
    errors.push('Missing or invalid workflow_preferences object');
  }

  if (!profile.visual_preferences || typeof profile.visual_preferences !== 'object') {
    errors.push('Missing or invalid visual_preferences object');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalize and merge an incoming profile with the default baseline,
 * ensuring all required keys and structures exist safely without crashes.
 * @param {Object} profile 
 * @returns {Object} Full normalized BusinessProfile
 */
export function normalizeBusinessProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return deepClone(DEFAULT_BUSINESS_PROFILE);
  }

  const base = deepClone(DEFAULT_BUSINESS_PROFILE);

  // Preserve identity
  const normalized = {
    schema_version: Number(profile.schema_version || SCHEMA_VERSION),
    profile_id: String(profile.profile_id || base.profile_id).trim().toLowerCase(),
    profile_version: Number(profile.profile_version || 1),
    name: String(profile.name || base.name).trim(),
    business_type: String(profile.business_type || base.business_type).trim().toUpperCase(),
    capabilities: {
      ...base.capabilities,
      ...(profile.capabilities || {}),
    },
    feature_defaults: {
      ...base.feature_defaults,
      ...(profile.feature_defaults || {}),
    },
    terminology: {
      ...base.terminology,
    },
    navigation_preferences: {
      ...base.navigation_preferences,
      ...(profile.navigation_preferences || {}),
    },
    workflow_preferences: {
      ...base.workflow_preferences,
      ...(profile.workflow_preferences || {}),
    },
    visual_preferences: {
      ...base.visual_preferences,
      ...(profile.visual_preferences || {}),
    },
    metadata: {
      ...base.metadata,
      ...(profile.metadata || {}),
      normalized_at: new Date().toISOString(),
    },
  };

  // Deep-merge terminology concepts safely
  if (profile.terminology && typeof profile.terminology === 'object') {
    for (const [key, term] of Object.entries(profile.terminology)) {
      if (term && typeof term === 'object') {
        normalized.terminology[key] = {
          ...(normalized.terminology[key] || {}),
          ...term,
        };
      }
    }
  }

  // Preserve any unknown extension fields without crashing
  for (const [k, v] of Object.entries(profile)) {
    if (!(k in normalized)) {
      normalized[k] = v;
    }
  }

  return normalized;
}

/**
 * Synchronous local cache loader
 */
function readStorageCache() {
  try {
    const raw = localStorage.getItem(BUSINESS_MODE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const validation = validateBusinessProfile(parsed);
    if (validation.valid) {
      return normalizeBusinessProfile(parsed);
    }
  } catch (_) {}
  return null;
}

/**
 * Synchronous local cache writer
 */
function writeStorageCache(profile) {
  try {
    localStorage.setItem(BUSINESS_MODE_STORAGE_KEY, JSON.stringify(profile));
  } catch (_) {}
}

/**
 * Initialize Business Profile engine
 * @param {Array<{ id: string, value: any }>} [settingsData]
 */
export async function initBusinessProfile(settingsData = null) {
  // 1. Try memory cache / synchronous storage first for instant zero-latency boot
  const cached = readStorageCache();
  if (cached) {
    activeProfile = cached;
  }

  // 2. Try IndexedDB settings store under BUSINESS_MODE_SETTING_KEY
  try {
    let dbVal = null;
    if (Array.isArray(settingsData)) {
      const entry = settingsData.find(s => s.id === BUSINESS_MODE_SETTING_KEY);
      dbVal = entry?.value;
    } else {
      dbVal = await setting(BUSINESS_MODE_SETTING_KEY, null);
    }

    if (dbVal) {
      let candidate = typeof dbVal === 'string' ? JSON.parse(dbVal) : dbVal;
      // If preset ID string was stored
      if (typeof candidate === 'string' && PROFILE_PRESETS[candidate]) {
        candidate = PROFILE_PRESETS[candidate];
      }
      const valCheck = validateBusinessProfile(candidate);
      if (valCheck.valid) {
        activeProfile = normalizeBusinessProfile(candidate);
        writeStorageCache(activeProfile);
      } else {
        // Fallback safely to default
        activeProfile = deepClone(DEFAULT_BUSINESS_PROFILE);
      }
    } else if (!cached) {
      // Clean first boot -> default profile
      activeProfile = deepClone(DEFAULT_BUSINESS_PROFILE);
      writeStorageCache(activeProfile);
    }
  } catch (_) {
    if (!activeProfile) {
      activeProfile = deepClone(DEFAULT_BUSINESS_PROFILE);
    }
  }

  isInitialized = true;
  return activeProfile;
}

/**
 * Get active business profile
 * @returns {Object}
 */
export function getBusinessProfile() {
  if (!isInitialized) {
    const cached = readStorageCache();
    if (cached) activeProfile = cached;
  }
  return deepClone(activeProfile);
}

/**
 * Switch or set active business profile.
 * CRITICAL INVARIANT: Switches presentation / capability preferences only.
 * NEVER mutates, re-types, deletes or resets business transactions, products,
 * inventory levels, customers, suppliers or ledger movements!
 * 
 * @param {string|Object} profileOrId Preset ID ('general', 'retail', 'wholesale', 'service') or custom profile object
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, profile: Object, fallback?: boolean, errors?: string[] }>}
 */
export async function setBusinessProfile(profileOrId, options = {}) {
  let candidate = null;

  if (typeof profileOrId === 'string') {
    const id = profileOrId.trim().toLowerCase();
    candidate = PROFILE_PRESETS[id] || null;
    if (!candidate) {
      // Invalid preset ID -> Fallback safely to DEFAULT
      activeProfile = deepClone(DEFAULT_BUSINESS_PROFILE);
      writeStorageCache(activeProfile);
      try { await setSetting(BUSINESS_MODE_SETTING_KEY, activeProfile); } catch (_) {}
      return {
        success: false,
        fallback: true,
        errors: [`Preset "${profileOrId}" not found. Falling back to DEFAULT.`],
        profile: deepClone(activeProfile),
      };
    }
  } else if (profileOrId && typeof profileOrId === 'object') {
    candidate = profileOrId;
  }

  const validation = validateBusinessProfile(candidate);
  if (!validation.valid) {
    activeProfile = deepClone(DEFAULT_BUSINESS_PROFILE);
    writeStorageCache(activeProfile);
    try { await setSetting(BUSINESS_MODE_SETTING_KEY, activeProfile); } catch (_) {}
    return {
      success: false,
      fallback: true,
      errors: validation.errors,
      profile: deepClone(activeProfile),
    };
  }

  activeProfile = normalizeBusinessProfile(candidate);
  writeStorageCache(activeProfile);

  // Persist to existing 'settings' object store in IndexedDB under BUSINESS_MODE_SETTING_KEY
  try {
    await setSetting(BUSINESS_MODE_SETTING_KEY, activeProfile);
  } catch (err) {
    console.warn('Failed to persist business profile to IndexedDB:', err);
  }

  // Emit event for future phases (Phase 1 does not mutate DOM)
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent('qbiz:business-profile:changed', {
        detail: { profile: deepClone(activeProfile) }
      }));
    } catch (_) {}
  }

  return {
    success: true,
    profile: deepClone(activeProfile),
  };
}

export const switchBusinessProfile = setBusinessProfile;

/**
 * Reset profile to DEFAULT general profile
 */
export async function resetToDefaultProfile() {
  return setBusinessProfile(DEFAULT_BUSINESS_PROFILE);
}

/**
 * Check whether active business profile supports a given capability.
 * @param {string} capabilityName
 * @returns {boolean}
 */
export function hasCapability(capabilityName) {
  const profile = getBusinessProfile();
  return Boolean(profile.capabilities?.[capabilityName]);
}

/**
 * Alias for hasCapability
 */
export function getCapability(capabilityName) {
  return hasCapability(capabilityName);
}

/**
 * Resolve display terminology for a canonical concept.
 * Note: In Phase 1 this is engine-only resolver.
 * @param {string} conceptKey One of CANONICAL_CONCEPTS ('PRODUCT', 'SERVICE', 'CUSTOMER', etc.)
 * @param {string} [fallback] Fallback string if key not found
 * @returns {string}
 */
export function getTerminology(conceptKey, fallback = '') {
  const profile = getBusinessProfile();
  const term = profile.terminology?.[conceptKey];
  if (term && typeof term === 'object') {
    return term.singular || term.label || fallback || conceptKey;
  }
  if (typeof term === 'string') return term;
  return fallback || conceptKey;
}

/**
 * Resolve full terminology object for a concept
 * @param {string} conceptKey 
 * @returns {{ singular: string, plural?: string, label?: string, action_create?: string }}
 */
export function getConceptDetails(conceptKey) {
  const profile = getBusinessProfile();
  return deepClone(profile.terminology?.[conceptKey] || { singular: conceptKey, label: conceptKey });
}

/**
 * Resolve a navigation preference
 * @param {string} key 
 * @param {*} [fallback]
 * @returns {*}
 */
export function getNavigationPreference(key, fallback = null) {
  const profile = getBusinessProfile();
  return profile.navigation_preferences?.[key] ?? fallback;
}

/**
 * Resolve a workflow preference
 * @param {string} key 
 * @param {*} [fallback]
 * @returns {*}
 */
export function getWorkflowPreference(key, fallback = null) {
  const profile = getBusinessProfile();
  return profile.workflow_preferences?.[key] ?? fallback;
}

/**
 * Resolve a visual preference
 * @param {string} key 
 * @param {*} [fallback]
 * @returns {*}
 */
export function getVisualPreference(key, fallback = null) {
  const profile = getBusinessProfile();
  return profile.visual_preferences?.[key] ?? fallback;
}

/**
 * Resolve a feature default setting
 * @param {string} key 
 * @param {*} [fallback]
 * @returns {*}
 */
export function getFeatureDefault(key, fallback = null) {
  const profile = getBusinessProfile();
  return profile.feature_defaults?.[key] ?? fallback;
}

/**
 * List all available presets
 * @returns {Array<{ profile_id: string, name: string, business_type: string, description: string, is_active: boolean }>}
 */
export function listBusinessProfiles() {
  const current = getBusinessProfile();
  return Object.values(PROFILE_PRESETS).map(preset => ({
    profile_id: preset.profile_id,
    name: preset.name,
    business_type: preset.business_type,
    description: preset.metadata?.description || '',
    is_active: preset.profile_id === current.profile_id,
  }));
}

/**
 * Resolve Adaptive Workspace Profile
 * Centralized adapter layer that derives operational priorities, primary/secondary actions,
 * navigation order, presentation preferences, and terminology without scattering if/else across the app.
 *
 * SCOPE & STATUS CLASSIFICATION (Phase 2B):
 * - IMPLEMENTED_NOW:
 *   + Adaptive Dashboard Quick Actions (renderQuickActions in app.js)
 *   + Settings Mode Priority Preview (renderPriorityHighlights in app.js)
 *   + Profile & Workspace Resolver (resolveWorkspaceProfile in business-profile.js)
 *   + Profile Persistence (qbiz_business_mode_profile in settings store)
 * - PREPARED_NOT_APPLIED:
 *   + Navigation adaptation (menu_priority preserved at general baseline)
 *   + Catalog presentation adaptation (view/density/default_type preserved at general baseline)
 *   + POS presentation adaptation (pos_view/fast_pos preserved at general baseline)
 *   + Default route adaptation (entry route preserved at dashboard)
 *   + Broad terminology adaptation (entity labels preserved at general baseline)
 *
 * @param {string|Object} [profileOrId] Optional preset id or profile object; defaults to active profile
 * @returns {Object} Full resolved workspace profile object
 */
export function resolveWorkspaceProfile(profileOrId = null) {
  let profile = null;
  if (!profileOrId) {
    profile = getBusinessProfile();
  } else if (typeof profileOrId === 'string') {
    const id = profileOrId.trim().toLowerCase();
    profile = PROFILE_PRESETS[id] || deepClone(DEFAULT_BUSINESS_PROFILE);
  } else if (typeof profileOrId === 'object') {
    profile = normalizeBusinessProfile(profileOrId);
  } else {
    profile = deepClone(DEFAULT_BUSINESS_PROFILE);
  }

  const pid = profile.profile_id || 'general';

  // 1. Default entry route
  let default_route = 'dashboard';
  if (pid === 'fnb' || pid === 'retail') {
    default_route = 'sales';
  } else if (pid === 'wholesale') {
    default_route = 'products';
  } else if (pid === 'service' || pid === 'consulting') {
    default_route = 'products';
  }

  // 2. Primary actions for Dashboard Quick Actions & Priority highlights
  let primary_actions = [];
  let secondary_actions = [];
  let priority_highlights = [];

  if (pid === 'retail') {
    primary_actions = [
      { id: 'sales', kind: 'sales', title: 'Bán hàng', sub: 'Thu ngân bán lẻ', icon: 'shopping-cart', page: 'sales' },
      { id: 'products', kind: 'products', title: 'Hàng hóa', sub: 'Quản lý sản phẩm', icon: 'package-search', page: 'products' },
      { id: 'receive', kind: 'receive', title: 'Nhập hàng', sub: 'Thêm vào kho', icon: 'package-plus', action: 'quick-action' },
      { id: 'count', kind: 'count', title: 'Kiểm tồn', sub: 'Kiểm tra tồn kho', icon: 'clipboard-check', action: 'quick-action' },
      { id: 'orders', kind: 'orders', title: 'Đơn hàng', sub: 'Đơn giao hàng', icon: 'file-text', page: 'orders' },
    ];
    secondary_actions = ['transactions', 'customers', 'suppliers', 'shifts', 'reports'];
    priority_highlights = [
      'Bán hàng & thu ngân quầy nhanh',
      'Hàng hóa & quét mã vạch',
      'Kiểm tồn kho & nhập hàng',
      'Theo dõi đơn giao hàng',
    ];
  } else if (pid === 'fnb') {
    primary_actions = [
      { id: 'sales', kind: 'sales', title: 'Bán hàng', sub: 'Bán nhanh & thu ngân', icon: 'shopping-cart', page: 'sales' },
      { id: 'orders', kind: 'orders', title: 'Đơn hàng', sub: 'Theo dõi đơn bán', icon: 'file-text', page: 'orders' },
      { id: 'products', kind: 'products', title: 'Danh sách món', sub: 'Thực đơn & bảng giá', icon: 'package-search', page: 'products' },
      { id: 'transactions', kind: 'transactions', title: 'Hóa đơn', sub: 'Phiếu thu gần đây', icon: 'file-text', page: 'transactions' },
      { id: 'receive', kind: 'receive', title: 'Nhập nguyên liệu', sub: 'Kho nguyên liệu/món', icon: 'package-plus', action: 'quick-action' },
    ];
    secondary_actions = ['count', 'customers', 'shifts', 'reports', 'transfers'];
    priority_highlights = [
      'Bán hàng nhanh',
      'Danh sách món & thực đơn hình ảnh',
      'Theo dõi đơn bán',
      'Kho nguyên liệu & sản phẩm (phụ)',
    ];
  } else if (pid === 'wholesale') {
    primary_actions = [
      { id: 'products', kind: 'products', title: 'Mặt hàng sỉ', sub: 'Danh mục & mã hàng', icon: 'package-search', page: 'products' },
      { id: 'receive', kind: 'receive', title: 'Nhập hàng sỉ', sub: 'Nhập kho lô lớn', icon: 'package-plus', action: 'quick-action' },
      { id: 'count', kind: 'count', title: 'Tồn kho tổng', sub: 'Kiểm tra tồn đa kho', icon: 'clipboard-check', action: 'quick-action' },
      { id: 'customers', kind: 'customers', title: 'Đại lý / Đối tác', sub: 'Hồ sơ đại lý / đối tác', icon: 'user', action: 'customer-directory' },
      { id: 'orders', kind: 'orders', title: 'Đơn đặt sỉ', sub: 'Đơn hàng số lượng lớn', icon: 'file-text', page: 'orders' },
    ];
    secondary_actions = ['sales', 'transactions', 'transfers', 'suppliers', 'reports'];
    priority_highlights = [
      'Mặt hàng & danh mục phân phối',
      'Quản lý kho tổng & điều chuyển',
      'Đại lý & đối tác phân phối',
      'Đơn đặt hàng số lượng lớn',
    ];
  } else if (pid === 'service') {
    primary_actions = [
      { id: 'services', kind: 'products', title: 'Gói dịch vụ', sub: 'Bảng giá & liệu trình', icon: 'sparkles', page: 'products' },
      { id: 'customers', kind: 'customers', title: 'Khách hàng', sub: 'Hồ sơ khách & hội viên', icon: 'user', action: 'customer-directory' },
      { id: 'sales', kind: 'sales', title: 'Thu phí dịch vụ', sub: 'Lập hóa đơn dịch vụ', icon: 'shopping-cart', page: 'sales' },
      { id: 'orders', kind: 'orders', title: 'Phiếu dịch vụ', sub: 'Theo dõi tiến trình', icon: 'file-text', page: 'orders' },
      { id: 'transactions', kind: 'transactions', title: 'Lịch sử thu', sub: 'Xem phiếu thu tiền', icon: 'file-text', page: 'transactions' },
    ];
    secondary_actions = ['receive', 'count', 'transfers', 'shifts', 'reports'];
    priority_highlights = [
      'Gói dịch vụ & biểu phí',
      'Hồ sơ khách hàng & hội viên',
      'Thanh toán & hóa đơn dịch vụ',
      'Quản lý vật tư tiêu hao (phụ)',
    ];
  } else if (pid === 'consulting') {
    primary_actions = [
      { id: 'services', kind: 'products', title: 'Gói tư vấn', sub: 'Dịch vụ & gói giải pháp', icon: 'briefcase', page: 'products' },
      { id: 'customers', kind: 'customers', title: 'Khách hàng', sub: 'Hồ sơ đối tác & khách', icon: 'user', action: 'customer-directory' },
      { id: 'sales', kind: 'sales', title: 'Thanh toán', sub: 'Thu phí dịch vụ tư vấn', icon: 'shopping-cart', page: 'sales' },
      { id: 'orders', kind: 'orders', title: 'Đơn dịch vụ', sub: 'Theo dõi đơn dịch vụ', icon: 'file-text', page: 'orders' },
      { id: 'transactions', kind: 'transactions', title: 'Biên lai', sub: 'Lịch sử thanh toán', icon: 'file-text', page: 'transactions' },
    ];
    secondary_actions = ['receive', 'count', 'transfers', 'reports', 'settings'];
    priority_highlights = [
      'Gói tư vấn & chuyên môn',
      'Hồ sơ khách hàng & đối tác',
      'Thu phí & đơn dịch vụ tư vấn',
      'Thông tin & liên hệ nhanh',
    ];
  } else {
    // general & other (Identical baseline 100%)
    primary_actions = [
      { id: 'sales', kind: 'sales', title: 'Bán hàng', sub: 'Tạo phiếu bán', icon: 'shopping-cart', page: 'sales' },
      { id: 'receive', kind: 'receive', title: 'Nhập kho', sub: 'Thêm hàng vào kho', icon: 'package-plus', action: 'quick-action' },
      { id: 'count', kind: 'count', title: 'Kiểm kho', sub: 'Xem tồn kho', icon: 'clipboard-check', action: 'quick-action' },
      { id: 'transactions', kind: 'transactions', title: 'Hóa đơn', sub: 'Xem phiếu bán', icon: 'file-text', page: 'transactions' },
      { id: 'customers', kind: 'customers', title: 'Khách hàng', sub: 'Tìm và chọn khách', icon: 'user', action: 'customer-directory' },
    ];
    secondary_actions = ['orders', 'transfers', 'suppliers', 'shifts', 'reports'];
    priority_highlights = [
      'Bán hàng & thu ngân',
      'Hàng hóa & danh mục',
      'Quản lý kho & luân chuyển',
      'Theo dõi đơn hàng',
    ];
  }

  // 3. Navigation priority
  const navigation_priority = profile.navigation_preferences?.menu_priority || [
    'dashboard', 'products', 'sales', 'transfers', 'more'
  ];

  // 4. Module emphasis map
  const module_emphasis = {
    dashboard: 'high',
    sales: pid === 'fnb' || pid === 'retail' ? 'highest' : pid === 'wholesale' ? 'medium' : 'high',
    products: pid === 'wholesale' || pid === 'service' || pid === 'consulting' ? 'highest' : 'high',
    transfers: pid === 'wholesale' ? 'highest' : pid === 'service' || pid === 'consulting' ? 'low' : 'high',
    orders: pid === 'fnb' || pid === 'retail' || pid === 'wholesale' ? 'high' : 'medium',
    customers: pid === 'service' || pid === 'consulting' || pid === 'wholesale' ? 'highest' : 'medium',
    suppliers: pid === 'service' || pid === 'consulting' ? 'low' : 'medium',
  };

  // 5. Terminology overrides summary
  const terminology_overrides = {
    PRODUCT: profile.terminology?.PRODUCT?.label || profile.terminology?.PRODUCT?.singular || 'Hàng hóa',
    SERVICE: profile.terminology?.SERVICE?.label || profile.terminology?.SERVICE?.singular || 'Dịch vụ',
    CUSTOMER: profile.terminology?.CUSTOMER?.label || profile.terminology?.CUSTOMER?.singular || 'Khách hàng',
    ORDER: profile.terminology?.ORDER?.label || profile.terminology?.ORDER?.singular || 'Đơn hàng',
    SALE: profile.terminology?.SALE?.label || profile.terminology?.SALE?.singular || 'Bán hàng',
    WAREHOUSE: profile.terminology?.WAREHOUSE?.label || profile.terminology?.WAREHOUSE?.singular || 'Kho',
  };

  // 6. Catalog presentation preferences
  const catalog_presentation = {
    view: pid === 'wholesale' ? 'compact' : pid === 'service' || pid === 'consulting' ? 'list' : 'image',
    density: pid === 'wholesale' || pid === 'retail' ? 'compact' : 'medium',
    default_type: pid === 'service' || pid === 'consulting' ? 'SERVICE' : 'PRODUCT',
    show_stock: pid !== 'service' && pid !== 'consulting',
    quick_add: pid === 'fnb' || pid === 'retail',
  };

  // 7. POS presentation preferences
  const pos_presentation = {
    pos_view: pid === 'fnb' ? 'grid2' : pid === 'wholesale' || pid === 'service' || pid === 'consulting' ? 'list' : 'grid3',
    fast_pos: pid === 'fnb' || pid === 'retail',
    show_images: pid === 'fnb' || pid === 'retail' || pid === 'general' || pid === 'other',
    require_customer: pid === 'wholesale' || pid === 'service' || pid === 'consulting',
  };

  // 8. Dashboard emphasis
  const dashboard_emphasis = profile.visual_preferences?.dashboard_emphasis || (
    pid === 'wholesale' ? 'inventory_first' : pid === 'service' || pid === 'consulting' ? 'service_first' : 'sales_first'
  );

  return {
    profile_id: pid,
    name: profile.name,
    default_route,
    primary_actions,
    secondary_actions,
    navigation_priority,
    module_emphasis,
    terminology_overrides,
    catalog_presentation,
    pos_presentation,
    dashboard_emphasis,
    priority_highlights,
  };
}
