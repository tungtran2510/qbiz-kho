// ==============================================================================
// QBIZ KHO PRODUCTION V1 — ROLE & CAPABILITY MATRIX (GATE 1)
// Spec: QBIZ_KHO_MASTER_PRODUCTION_V1_SYNC01.md (§5, §6, §17)
// ==============================================================================

export const ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAREHOUSE: 'WAREHOUSE',
};

export const ROLE_LABELS = {
  OWNER: 'Chủ cửa hàng',
  MANAGER: 'Quản lý',
  CASHIER: 'Thu ngân',
  WAREHOUSE: 'Thủ kho',
};

// PLATFORM ROLE (System-level, separate from shop memberships)
export const PLATFORM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
};

export const PLATFORM_ROLE_LABELS = {
  SUPER_ADMIN: 'Chủ nền tảng (Super Admin)',
};

export const PLATFORM_CAPABILITIES = {
  VIEW_PLATFORM_CONSOLE: 'VIEW_PLATFORM_CONSOLE',
  MANAGE_PLATFORM_SHOPS: 'MANAGE_PLATFORM_SHOPS',
  MANAGE_PLATFORM_USERS: 'MANAGE_PLATFORM_USERS',
  VIEW_PLATFORM_AUDIT: 'VIEW_PLATFORM_AUDIT',
  VIEW_PLATFORM_METRICS: 'VIEW_PLATFORM_METRICS',
};

export const CAPABILITIES = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  SELL: 'SELL',
  VIEW_CUSTOMER: 'VIEW_CUSTOMER',
  EDIT_CUSTOMER: 'EDIT_CUSTOMER',
  VIEW_COST: 'VIEW_COST',
  EDIT_PRODUCT: 'EDIT_PRODUCT',
  EDIT_PRICE: 'EDIT_PRICE',
  RECEIVE_STOCK: 'RECEIVE_STOCK',
  ISSUE_STOCK: 'ISSUE_STOCK',
  STOCKTAKE: 'STOCKTAKE',
  TRANSFER_STOCK: 'TRANSFER_STOCK',
  PROCESS_RETURN: 'PROCESS_RETURN',
  VIEW_REPORT: 'VIEW_REPORT',
  MANAGE_SHIFT: 'MANAGE_SHIFT',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
  VIEW_AUDIT: 'VIEW_AUDIT',
  INVOICE_CONFIGURE: 'INVOICE_CONFIGURE',
  INVOICE_ISSUE: 'INVOICE_ISSUE',
  INVOICE_ADJUST: 'INVOICE_ADJUST',
  INVOICE_REPLACE: 'INVOICE_REPLACE',
};

export const CAPABILITY_LABELS = {
  VIEW_DASHBOARD: 'Xem trang tổng quan',
  SELL: 'Bán hàng tại quầy (POS)',
  VIEW_CUSTOMER: 'Xem danh sách khách hàng',
  EDIT_CUSTOMER: 'Thêm & sửa khách hàng',
  VIEW_COST: 'Xem giá vốn sản phẩm',
  EDIT_PRODUCT: 'Thêm & sửa hàng hóa',
  EDIT_PRICE: 'Sửa giá bán & chiết khấu',
  RECEIVE_STOCK: 'Nhập hàng vào kho',
  ISSUE_STOCK: 'Xuất hàng khỏi kho',
  STOCKTAKE: 'Kiểm kê & cân kho',
  TRANSFER_STOCK: 'Chuyển hàng giữa các kho',
  PROCESS_RETURN: 'Xử lý trả hàng & hoàn tiền',
  VIEW_REPORT: 'Xem báo cáo tài chính & doanh thu',
  MANAGE_SHIFT: 'Mở, đóng & đối soát ca',
  MANAGE_USERS: 'Mời & quản lý nhân viên',
  MANAGE_SETTINGS: 'Cấu hình cửa hàng & hệ thống',
  VIEW_AUDIT: 'Xem nhật ký kiểm toán (Audit)',
  INVOICE_CONFIGURE: 'Cấu hình nhà cung cấp HĐĐT',
  INVOICE_ISSUE: 'Phát hành HĐĐT gốc',
  INVOICE_ADJUST: 'Lập & phát hành HĐĐT điều chỉnh',
  INVOICE_REPLACE: 'Lập & phát hành HĐĐT thay thế',
};

export const ROLE_CAPABILITY_MAP = {
  OWNER: [
    CAPABILITIES.VIEW_DASHBOARD,
    CAPABILITIES.SELL,
    CAPABILITIES.VIEW_CUSTOMER,
    CAPABILITIES.EDIT_CUSTOMER,
    CAPABILITIES.VIEW_COST,
    CAPABILITIES.EDIT_PRODUCT,
    CAPABILITIES.EDIT_PRICE,
    CAPABILITIES.RECEIVE_STOCK,
    CAPABILITIES.ISSUE_STOCK,
    CAPABILITIES.STOCKTAKE,
    CAPABILITIES.TRANSFER_STOCK,
    CAPABILITIES.PROCESS_RETURN,
    CAPABILITIES.VIEW_REPORT,
    CAPABILITIES.MANAGE_SHIFT,
    CAPABILITIES.MANAGE_USERS,
    CAPABILITIES.MANAGE_SETTINGS,
    CAPABILITIES.VIEW_AUDIT,
    CAPABILITIES.INVOICE_CONFIGURE,
    CAPABILITIES.INVOICE_ISSUE,
    CAPABILITIES.INVOICE_ADJUST,
    CAPABILITIES.INVOICE_REPLACE,
  ],
  MANAGER: [
    CAPABILITIES.VIEW_DASHBOARD,
    CAPABILITIES.SELL,
    CAPABILITIES.VIEW_CUSTOMER,
    CAPABILITIES.EDIT_CUSTOMER,
    CAPABILITIES.VIEW_COST,
    CAPABILITIES.EDIT_PRODUCT,
    CAPABILITIES.RECEIVE_STOCK,
    CAPABILITIES.ISSUE_STOCK,
    CAPABILITIES.STOCKTAKE,
    CAPABILITIES.TRANSFER_STOCK,
    CAPABILITIES.PROCESS_RETURN,
    CAPABILITIES.VIEW_REPORT,
    CAPABILITIES.MANAGE_SHIFT,
    CAPABILITIES.VIEW_AUDIT,
    CAPABILITIES.INVOICE_CONFIGURE,
    CAPABILITIES.INVOICE_ISSUE,
    CAPABILITIES.INVOICE_ADJUST,
    CAPABILITIES.INVOICE_REPLACE,
  ],
  CASHIER: [
    CAPABILITIES.VIEW_DASHBOARD,
    CAPABILITIES.SELL,
    CAPABILITIES.VIEW_CUSTOMER,
    CAPABILITIES.EDIT_CUSTOMER,
    CAPABILITIES.PROCESS_RETURN,
    CAPABILITIES.MANAGE_SHIFT,
    CAPABILITIES.INVOICE_ISSUE,
  ],
  WAREHOUSE: [
    CAPABILITIES.VIEW_DASHBOARD,
    CAPABILITIES.RECEIVE_STOCK,
    CAPABILITIES.ISSUE_STOCK,
    CAPABILITIES.STOCKTAKE,
    CAPABILITIES.TRANSFER_STOCK,
    CAPABILITIES.EDIT_PRODUCT,
  ],
};

/**
 * Check if a given role has a specific capability.
 * @param {string} role - One of OWNER, MANAGER, CASHIER, WAREHOUSE.
 * @param {string} capability - Capability key.
 * @returns {boolean}
 */
export function hasCapability(role, capability) {
  if (!role || !capability) return false;
  const normalizedRole = String(role).toUpperCase();
  const allowed = ROLE_CAPABILITY_MAP[normalizedRole];
  if (!allowed) return false;
  return allowed.includes(capability);
}

/**
 * Get readable Vietnamese label for a role.
 * @param {string} role
 * @returns {string}
 */
export function getRoleLabel(role) {
  return ROLE_LABELS[String(role).toUpperCase()] || role || 'Không xác định';
}

/**
 * Get readable Vietnamese label for a platform role.
 * @param {string} role
 * @returns {string}
 */
export function getPlatformRoleLabel(role) {
  return PLATFORM_ROLE_LABELS[String(role).toUpperCase()] || role || 'Không xác định';
}
