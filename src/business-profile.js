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
  name: 'Chế độ tiêu chuẩn (Phổ thông)',
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
  name: 'Bán lẻ & Siêu thị mini',
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
 * PRESET 3: WHOLESALE (Distributor, B2B wholesale)
 */
export const PRESET_WHOLESALE = Object.freeze({
  schema_version: SCHEMA_VERSION,
  profile_id: 'wholesale',
  profile_version: 1,
  name: 'Bán buôn & Phân phối',
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
  name: 'Dịch vụ / Spa / Salon / Tư vấn',
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
    dashboard_emphasis: 'appointments_first',
  },
  metadata: {
    is_preset: true,
    description: 'Tối ưu cho cơ sở dịch vụ, spa, salon làm đẹp, trung tâm đào tạo và tư vấn.',
    created_at: '2026-09-22T00:00:00.000Z',
  },
});

/**
 * Registry of available built-in presets
 */
export const PROFILE_PRESETS = Object.freeze({
  [PRESET_GENERAL.profile_id]: PRESET_GENERAL,
  [PRESET_RETAIL.profile_id]: PRESET_RETAIL,
  [PRESET_WHOLESALE.profile_id]: PRESET_WHOLESALE,
  [PRESET_SERVICE.profile_id]: PRESET_SERVICE,
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
