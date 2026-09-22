/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — FEATURE & ACTION REGISTRY
 * Authoritative capability map and natural language action dispatcher.
 * Routes are discovered directly from actual app source (src/app.js).
 * Model resolves intent candidate only; registry resolves actual action.
 */

import { hasCapability, PERMISSIONS } from './policy.js';
import { getCurrentActor } from './context.js';

export const IMPLEMENTATION_STATE = {
  AVAILABLE: 'AVAILABLE',
  PARTIAL: 'PARTIAL',
  COMING_SOON: 'COMING_SOON',
  UNAVAILABLE: 'UNAVAILABLE',
};

export const EXECUTION_MODE = {
  NAVIGATE: 'NAVIGATE',
  OPEN: 'OPEN',
  PREFILL: 'PREFILL',
  PROPOSE: 'PROPOSE',
  EXECUTE_AFTER_CONFIRM: 'EXECUTE_AFTER_CONFIRM',
};

/**
 * Authoritative Application Feature Registry
 */
export const FEATURE_REGISTRY = {
  DASHBOARD: {
    feature_id: 'DASHBOARD',
    name: 'Tổng quan',
    route: 'dashboard',
    screen: 'Dashboard',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_dashboard', 'view_attention'],
  },
  PRODUCTS: {
    feature_id: 'PRODUCTS',
    name: 'Hàng hóa & Tồn kho',
    route: 'products',
    screen: 'ProductList',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_products', 'open_low_stock', 'new_product'],
  },
  PRODUCT_DETAIL: {
    feature_id: 'PRODUCT_DETAIL',
    name: 'Chi tiết sản phẩm',
    route: 'products',
    screen: 'ProductDetailModal',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_product', 'create_receipt_proposal'],
  },
  POS: {
    feature_id: 'POS',
    name: 'Bán hàng (POS)',
    route: 'sales',
    screen: 'SalesPOS',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_sales', 'create_cart_draft'],
  },
  ORDERS: {
    feature_id: 'ORDERS',
    name: 'Đơn hàng',
    route: 'orders',
    screen: 'OrderList',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.VIEW_SALES, PERMISSIONS.MANAGE_ORDERS],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_orders', 'open_pending_orders', 'open_unpaid_orders'],
  },
  ORDER_DETAIL: {
    feature_id: 'ORDER_DETAIL',
    name: 'Chi tiết đơn hàng',
    route: 'orders',
    screen: 'OrderDetailModal',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.VIEW_SALES, PERMISSIONS.MANAGE_ORDERS],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_order', 'diagnose_order'],
  },
  WAREHOUSE: {
    feature_id: 'WAREHOUSE',
    name: 'Kho & Điều chuyển',
    route: 'transfers',
    screen: 'WarehouseCenter',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_warehouse', 'open_transfers'],
  },
  WAREHOUSE_RECEIPT: {
    feature_id: 'WAREHOUSE_RECEIPT',
    name: 'Nhập kho',
    route: 'transfers',
    screen: 'QuickReceiveModal',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.RECEIVE_STOCK],
    execution_location: 'DOMAIN_ENGINE',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_receipt', 'create_receipt_proposal', 'execute_receipt'],
  },
  WAREHOUSE_TRANSFER: {
    feature_id: 'WAREHOUSE_TRANSFER',
    name: 'Chuyển kho',
    route: 'transfers',
    screen: 'QuickTransferModal',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.TRANSFER_STOCK],
    execution_location: 'DOMAIN_ENGINE',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_transfer', 'create_transfer_proposal', 'execute_transfer'],
  },
  WAREHOUSE_STOCKTAKE: {
    feature_id: 'WAREHOUSE_STOCKTAKE',
    name: 'Kiểm kho',
    route: 'transfers',
    screen: 'QuickStocktakeModal',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_stocktake', 'create_stocktake_proposal'],
  },
  CUSTOMERS: {
    feature_id: 'CUSTOMERS',
    name: 'Khách hàng',
    route: 'customers',
    screen: 'CustomerList',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_customers', 'new_customer'],
  },
  SUPPLIERS: {
    feature_id: 'SUPPLIERS',
    name: 'Nhà cung cấp',
    route: 'suppliers',
    screen: 'SupplierList',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_suppliers', 'new_supplier'],
  },
  CASH: {
    feature_id: 'CASH',
    name: 'Sổ quỹ',
    route: 'cash',
    screen: 'CashCenter',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_cash'],
  },
  SHIFT: {
    feature_id: 'SHIFT',
    name: 'Sổ ca & Bàn giao',
    route: 'shifts',
    screen: 'ShiftCenter',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_shift'],
  },
  PRINT_DEVICE: {
    feature_id: 'PRINT_DEVICE',
    name: 'In & Thiết bị',
    route: 'print',
    screen: 'PrintCenter',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_print_settings'],
  },
  SHIPPING: {
    feature_id: 'SHIPPING',
    name: 'Vận chuyển',
    route: 'shipping',
    screen: 'ShippingCenter',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.PARTIAL,
    required_capabilities: [],
    execution_location: 'CLIENT',
    requires_online: true,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_shipping_settings'],
  },
  CHANNELS: {
    feature_id: 'CHANNELS',
    name: 'Kênh bán hàng',
    route: 'channels',
    screen: 'ChannelCenter',
    enabled: false,
    implementation_state: IMPLEMENTATION_STATE.COMING_SOON,
    required_capabilities: [],
    execution_location: 'CLOUD',
    requires_online: true,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_channel_settings'],
  },
  BACKUP: {
    feature_id: 'BACKUP',
    name: 'Sao lưu & Dữ liệu',
    route: 'backup',
    screen: 'BackupCenter',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [PERMISSIONS.MANAGE_SETTINGS],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_backup'],
  },
  AI_SETTINGS: {
    feature_id: 'AI_SETTINGS',
    name: 'Cấu hình Trợ lý AI',
    route: null,
    screen: 'AISettingsDrawer',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    required_capabilities: [],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_ai_settings'],
  },
  USERS_PERMISSION: {
    feature_id: 'USERS_PERMISSION',
    name: 'Người dùng & Phân quyền',
    route: 'permissions',
    screen: 'PermissionCenter',
    enabled: true,
    implementation_state: IMPLEMENTATION_STATE.PARTIAL,
    required_capabilities: [PERMISSIONS.MANAGE_SETTINGS],
    execution_location: 'CLIENT',
    requires_online: false,
    requires_local_node: false,
    requires_device_permission: false,
    related_actions: ['open_permissions'],
  },
};

/**
 * Authoritative Application Action Registry
 */
export const ACTION_REGISTRY = {
  open_dashboard: {
    id: 'open_dashboard',
    name: 'Mở màn hình Tổng quan',
    feature_id: 'DASHBOARD',
    route: 'dashboard',
    screen: 'Dashboard',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('dashboard');
        return { success: true, message: 'Đã mở màn hình Tổng quan.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_low_stock: {
    id: 'open_low_stock',
    name: 'Xem hàng sắp hết',
    feature_id: 'PRODUCTS',
    route: 'products',
    screen: 'ProductList',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        state.warehouseFilter = 'low';
        state.warehouseStockFilter = 'low';
        window.__qbiz_app__.navigate('products');
        return { success: true, message: 'Đã mở danh sách hàng sắp hết.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_products: {
    id: 'open_products',
    name: 'Mở danh mục hàng hóa',
    feature_id: 'PRODUCTS',
    route: 'products',
    screen: 'ProductList',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        state.warehouseFilter = 'all';
        state.warehouseStockFilter = 'all';
        window.__qbiz_app__.navigate('products');
        return { success: true, message: 'Đã mở danh sách hàng hóa.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_product: {
    id: 'open_product',
    name: 'Mở chi tiết sản phẩm',
    feature_id: 'PRODUCT_DETAIL',
    route: 'products',
    screen: 'ProductDetailModal',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute({ productId }, state) {
      if (!productId) return { success: false, error: 'Thiếu mã sản phẩm.' };
      if (window.__qbiz_app__?.openProduct) {
        window.__qbiz_app__.openProduct(productId);
        return { success: true, message: `Đã mở chi tiết sản phẩm ${productId}.` };
      }
      return { success: false, error: 'Hàm openProduct chưa sẵn sàng.' };
    },
  },

  open_pending_orders: {
    id: 'open_pending_orders',
    name: 'Xem đơn hàng chờ xử lý',
    feature_id: 'ORDERS',
    route: 'orders',
    screen: 'OrderList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        state.orderFilter = 'active';
        window.__qbiz_app__.navigate('orders');
        return { success: true, message: 'Đã mở danh sách đơn chờ xử lý.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_unpaid_orders: {
    id: 'open_unpaid_orders',
    name: 'Xem đơn hàng chưa thanh toán',
    feature_id: 'ORDERS',
    route: 'orders',
    screen: 'OrderList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        state.orderFilter = 'unpaid';
        window.__qbiz_app__.navigate('orders');
        return { success: true, message: 'Đã mở danh sách đơn chưa thanh toán.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_order: {
    id: 'open_order',
    name: 'Mở chi tiết đơn hàng',
    feature_id: 'ORDER_DETAIL',
    route: 'orders',
    screen: 'OrderDetailModal',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute({ orderId }, state) {
      if (!orderId) return { success: false, error: 'Thiếu mã đơn hàng.' };
      if (window.__qbiz_app__?.openOrderDetail) {
        window.__qbiz_app__.openOrderDetail(orderId);
        return { success: true, message: `Đã mở chi tiết đơn hàng ${orderId}.` };
      }
      return { success: false, error: 'Hàm openOrderDetail chưa sẵn sàng.' };
    },
  },

  open_warehouse: {
    id: 'open_warehouse',
    name: 'Mở quản lý kho & chuyển kho',
    feature_id: 'WAREHOUSE',
    route: 'transfers',
    screen: 'WarehouseCenter',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        state.warehouseTab = 'operations';
        window.__qbiz_app__.navigate('transfers');
        return { success: true, message: 'Đã mở quản lý kho.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_transfers: {
    id: 'open_transfers',
    name: 'Xem danh sách chuyển kho',
    feature_id: 'WAREHOUSE_TRANSFER',
    route: 'transfers',
    screen: 'WarehouseCenter',
    required_capabilities: [PERMISSIONS.TRANSFER_STOCK],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        state.warehouseTab = 'operations';
        window.__qbiz_app__.navigate('transfers');
        return { success: true, message: 'Đã mở màn hình luân chuyển kho.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_receipt: {
    id: 'open_receipt',
    name: 'Mở phiếu nhập kho',
    feature_id: 'WAREHOUSE_RECEIPT',
    route: 'transfers',
    screen: 'QuickReceiveModal',
    required_capabilities: [PERMISSIONS.RECEIVE_STOCK],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.openQuick) {
        window.__qbiz_app__.openQuick('receive');
        return { success: true, message: 'Đã mở biểu mẫu nhập kho.' };
      }
      return { success: false, error: 'Hàm openQuick chưa sẵn sàng.' };
    },
  },

  open_transfer: {
    id: 'open_transfer',
    name: 'Mở phiếu chuyển kho',
    feature_id: 'WAREHOUSE_TRANSFER',
    route: 'transfers',
    screen: 'QuickTransferModal',
    required_capabilities: [PERMISSIONS.TRANSFER_STOCK],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.openQuick) {
        window.__qbiz_app__.openQuick('transfer');
        return { success: true, message: 'Đã mở biểu mẫu chuyển kho.' };
      }
      return { success: false, error: 'Hàm openQuick chưa sẵn sàng.' };
    },
  },

  open_stocktake: {
    id: 'open_stocktake',
    name: 'Mở kiểm kho',
    feature_id: 'WAREHOUSE_STOCKTAKE',
    route: 'transfers',
    screen: 'QuickStocktakeModal',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.openQuick) {
        window.__qbiz_app__.openQuick('count');
        return { success: true, message: 'Đã mở biểu mẫu kiểm kho.' };
      }
      return { success: false, error: 'Hàm openQuick chưa sẵn sàng.' };
    },
  },

  open_print_settings: {
    id: 'open_print_settings',
    name: 'Mở cấu hình In & Thiết bị',
    feature_id: 'PRINT_DEVICE',
    route: 'print',
    screen: 'PrintCenter',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('print');
        return { success: true, message: 'Đã mở màn hình cấu hình máy in và thiết bị.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_shipping_settings: {
    id: 'open_shipping_settings',
    name: 'Mở cấu hình Vận chuyển',
    feature_id: 'SHIPPING',
    route: 'shipping',
    screen: 'ShippingCenter',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.PARTIAL,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('shipping');
        return { success: true, message: 'Đã mở màn hình kết nối vận chuyển (GHN / GHTK).' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_channel_settings: {
    id: 'open_channel_settings',
    name: 'Mở cấu hình Kênh bán hàng',
    feature_id: 'CHANNELS',
    route: 'channels',
    screen: 'ChannelCenter',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.COMING_SOON,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('channels');
        return { success: true, message: 'Đã mở trung tâm kết nối kênh bán hàng (Shopee / TikTok Shop - Sắp có).' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_backup: {
    id: 'open_backup',
    name: 'Mở Sao lưu & Dữ liệu',
    feature_id: 'BACKUP',
    route: 'backup',
    screen: 'BackupCenter',
    required_capabilities: [PERMISSIONS.MANAGE_SETTINGS],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('backup');
        return { success: true, message: 'Đã mở trung tâm sao lưu và khôi phục dữ liệu.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_permissions: {
    id: 'open_permissions',
    name: 'Mở Người dùng & Phân quyền',
    feature_id: 'USERS_PERMISSION',
    route: 'permissions',
    screen: 'PermissionCenter',
    required_capabilities: [PERMISSIONS.MANAGE_SETTINGS],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.PARTIAL,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('permissions');
        return { success: true, message: 'Đã mở trung tâm người dùng và phân quyền.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_cash: {
    id: 'open_cash',
    name: 'Mở Sổ quỹ tiền mặt',
    feature_id: 'CASH',
    route: 'cash',
    screen: 'CashCenter',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('cash');
        return { success: true, message: 'Đã mở sổ quỹ tiền mặt.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_shift: {
    id: 'open_shift',
    name: 'Mở Sổ ca & Bàn giao',
    feature_id: 'SHIFT',
    route: 'shifts',
    screen: 'ShiftCenter',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('shifts');
        return { success: true, message: 'Đã mở sổ ca thu ngân.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },
};

/**
 * Lookup a feature in the Feature Registry.
 */
export function lookupFeature(featureId) {
  return FEATURE_REGISTRY[featureId] || null;
}

/**
 * Lookup an action in the Action Registry.
 */
export function lookupAction(actionId) {
  return ACTION_REGISTRY[actionId] || null;
}

/**
 * Execute an action with actor capability check.
 */
export async function executeAction(actionId, params = {}, state = {}, actor = null) {
  const action = lookupAction(actionId);
  if (!action) {
    return { success: false, error: `Hành động "${actionId}" không tồn tại trong Action Registry.` };
  }

  const currentActor = actor || getCurrentActor();
  for (const cap of action.required_capabilities) {
    if (!hasCapability(currentActor, cap)) {
      return {
        success: false,
        error: `HARD DENY: Tài khoản vai trò "${currentActor.role}" không có quyền thực hiện thao tác này (yêu cầu quyền ${cap}).`,
        permissionDenied: true,
        requiredCapability: cap,
      };
    }
  }

  return action.execute(params, state);
}
