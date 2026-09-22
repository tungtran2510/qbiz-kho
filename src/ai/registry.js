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
    aliases: ['tong quan', 'trang chu', 'dashboard', 'mo tong quan'],
    example_phrases: ['mở tổng quan', 'về trang chủ', 'tổng quan'],
    contexts: ['products', 'sales', 'orders', 'transfers', 'settings'],
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
    aliases: ['hang sap het', 'canh bao ton', 'het hang', 'hang ton it', 'sap het hang', 'hang nao sap het'],
    example_phrases: ['hàng nào sắp hết', 'xem hàng sắp hết', 'hàng hết'],
    contexts: ['dashboard', 'products', 'transfers'],
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
    aliases: ['hang hoa', 'san pham', 'danh muc', 'danh sach hang', 'vao hang hoa', 'mo hang hoa', 'mo danh muc', 'mo san pham'],
    example_phrases: ['mở hàng hóa', 'vào hàng hóa', 'mở danh mục', 'xem sản phẩm'],
    contexts: ['dashboard', 'sales', 'orders', 'settings'],
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
    aliases: ['chi tiet san pham', 'mo san pham nay', 'xem mat hang'],
    example_phrases: ['mở chi tiết sản phẩm', 'xem sản phẩm'],
    contexts: ['products'],
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
    aliases: ['don cho', 'don hang cho xu ly', 'don chua xong', 'don dang xu ly'],
    example_phrases: ['xem đơn chờ xử lý', 'đơn hàng chờ', 'đơn chưa xong'],
    contexts: ['dashboard', 'orders'],
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
    aliases: ['don chua thanh toan', 'chua thanh toan', 'chua tra tien', 'no don'],
    example_phrases: ['đơn chưa thanh toán', 'xem đơn chưa thanh toán'],
    contexts: ['dashboard', 'orders'],
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
    aliases: ['chi tiet don hang', 'mo don nay'],
    example_phrases: ['mở chi tiết đơn hàng'],
    contexts: ['orders'],
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
    aliases: ['kho', 'kho hang', 'vao kho', 'mo kho', 'trung tam kho'],
    example_phrases: ['vào kho', 'mở kho hàng', 'quản lý kho'],
    contexts: ['dashboard', 'products'],
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
    aliases: ['luan chuyen kho', 'chuyen kho list', 'danh sach chuyen'],
    example_phrases: ['xem luân chuyển kho'],
    contexts: ['transfers'],
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
    aliases: ['nhap kho', 'phieu nhap', 'mo nhap kho', 'lap phieu nhap'],
    example_phrases: ['nhập kho', 'mở phiếu nhập kho', 'tạo phiếu nhập'],
    contexts: ['transfers', 'products', 'dashboard'],
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
    aliases: ['chuyen kho', 'phieu chuyen', 'mo chuyen kho', 'dieu chuyen'],
    example_phrases: ['chuyển kho', 'mở phiếu chuyển kho'],
    contexts: ['transfers', 'products', 'dashboard'],
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
    aliases: ['kiem kho', 'kiem ke', 'mo kiem kho', 'kiem tra ton'],
    example_phrases: ['kiểm kho', 'mở kiểm kho'],
    contexts: ['transfers', 'products', 'dashboard'],
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
    aliases: ['may in', 'cai may in', 'mo may in', 'thiet bi in', 'sua may in', 'in thu', 'vao may in'],
    example_phrases: ['mở máy in', 'cài máy in', 'sửa máy in', 'vào máy in'],
    contexts: ['settings', 'dashboard'],
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
    aliases: ['van chuyen', 'cai dat van chuyen', 'ghn', 'ghtk'],
    example_phrases: ['cài đặt vận chuyển'],
    contexts: ['settings'],
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
    aliases: ['kenh ban hang', 'shopee', 'tiktok shop', 'san tmdt'],
    example_phrases: ['kênh bán hàng'],
    contexts: ['settings'],
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
    aliases: ['sao luu', 'sao luu du lieu', 'khoi phuc du lieu', 'phuc hoi du lieu', 'backup'],
    example_phrases: ['sao lưu dữ liệu', 'sao lưu', 'khôi phục dữ liệu'],
    contexts: ['settings', 'dashboard'],
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
    aliases: ['phan quyen', 'nguoi dung', 'phan quyen nhan vien', 'them nhan vien', 'nguoi dung va phan quyen'],
    example_phrases: ['phân quyền nhân viên', 'thêm nhân viên', 'người dùng và phân quyền'],
    contexts: ['settings', 'dashboard'],
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
    aliases: ['so quy', 'quy tien', 'tien mat', 'so quy tien mat'],
    example_phrases: ['sổ quỹ', 'mở sổ quỹ tiền mặt'],
    contexts: ['dashboard'],
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
    aliases: ['so ca', 'ca ban hang', 'mo ca', 'dong ca', 'ca lam viec', 'so ca thu ngan', 'mo ca ban hang'],
    example_phrases: ['mở sổ ca', 'sổ ca', 'mở ca bán hàng', 'đóng ca'],
    contexts: ['dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('shifts');
        return { success: true, message: 'Đã mở sổ ca thu ngân.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_sales: {
    id: 'open_sales', name: 'Mở bán hàng', feature_id: 'POS',
    route: 'sales', screen: 'SalesPOS',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['ban hang', 'vao ban hang', 'mo pos', 'ban', 'vao pos'],
    example_phrases: ['vào bán hàng', 'mở bán hàng', 'bán hàng'],
    contexts: ['dashboard', 'products', 'orders', 'settings'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('sales'); return { success: true, message: 'Đã mở màn hình bán hàng.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_orders: {
    id: 'open_orders', name: 'Mở đơn hàng', feature_id: 'ORDERS',
    route: 'orders', screen: 'OrderList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['don hang', 'mo don hang', 'xem don', 'danh sach don'],
    example_phrases: ['mở đơn hàng', 'vào đơn hàng', 'xem đơn hàng'],
    contexts: ['dashboard', 'products', 'sales', 'settings'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('orders'); return { success: true, message: 'Đã mở danh sách đơn hàng.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_customers: {
    id: 'open_customers', name: 'Mở danh bạ khách hàng', feature_id: 'CUSTOMERS',
    route: 'customers', screen: 'CustomerList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['khach hang', 'mo khach hang', 'danh ba khach', 'xem khach'],
    example_phrases: ['mở khách hàng', 'vào khách hàng', 'danh bạ khách'],
    contexts: ['dashboard', 'sales', 'orders', 'settings'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('customers'); return { success: true, message: 'Đã mở danh bạ khách hàng.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_suppliers: {
    id: 'open_suppliers', name: 'Mở nhà cung cấp', feature_id: 'SUPPLIERS',
    route: 'suppliers', screen: 'SupplierList',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['nha cung cap', 'ncc', 'mo nha cung cap', 'nguon hang'],
    example_phrases: ['mở nhà cung cấp', 'xem nhà cung cấp'],
    contexts: ['dashboard', 'products', 'transfers'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('suppliers'); return { success: true, message: 'Đã mở danh sách nhà cung cấp.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_settings: {
    id: 'open_settings', name: 'Mở cài đặt', feature_id: null,
    route: 'settings', screen: 'Settings',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['cai dat', 'thiet lap', 'settings', 'cau hinh'],
    example_phrases: ['vào cài đặt', 'mở cài đặt', 'thiết lập'],
    contexts: ['dashboard', 'products', 'sales', 'orders'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('settings'); return { success: true, message: 'Đã mở trang cài đặt.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_transactions: {
    id: 'open_transactions', name: 'Mở lịch sử giao dịch', feature_id: null,
    route: 'transactions', screen: 'TransactionList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['hoa don', 'lich su ban', 'giao dich', 'phieu ban'],
    example_phrases: ['xem hóa đơn', 'lịch sử bán hàng', 'mở giao dịch'],
    contexts: ['dashboard', 'sales', 'orders'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('transactions'); return { success: true, message: 'Đã mở lịch sử giao dịch.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_reports: {
    id: 'open_reports', name: 'Mở báo cáo', feature_id: null,
    route: 'reports', screen: 'Reports',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['bao cao', 'thong ke', 'tong hop', 'xem bao cao'],
    example_phrases: ['mở báo cáo', 'xem thống kê', 'báo cáo doanh thu'],
    contexts: ['dashboard', 'products', 'sales'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('reports'); return { success: true, message: 'Đã mở trang báo cáo.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_returns: {
    id: 'open_returns', name: 'Mở đổi trả hàng', feature_id: null,
    route: 'returns', screen: 'ReturnCenter',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['doi tra', 'tra hang', 'hoan hang', 'doi hang'],
    example_phrases: ['mở đổi trả', 'trả hàng', 'đổi hàng'],
    contexts: ['dashboard', 'sales', 'transactions'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('returns'); return { success: true, message: 'Đã mở trung tâm đổi trả hàng.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_store_info: {
    id: 'open_store_info', name: 'Mở thông tin cửa hàng', feature_id: null,
    route: 'settings', screen: 'BusinessProfile',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['thong tin cua hang', 'sua thong tin', 'ten cua hang', 'doi ten shop'],
    example_phrases: ['sửa thông tin cửa hàng', 'đổi tên cửa hàng', 'mở hồ sơ shop'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('settings');
        setTimeout(() => document.querySelector('[data-action="business-profile"]')?.click(), 100);
        return { success: true, message: 'Đã mở thông tin cửa hàng.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_business_mode: {
    id: 'open_business_mode', name: 'Mở chế độ kinh doanh', feature_id: null,
    route: 'settings', screen: 'BusinessModeSelector',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['che do kinh doanh', 'doi che do', 'mo hinh kinh doanh', 'ban le', 'ban si', 'fnb', 'dich vu'],
    example_phrases: ['đổi chế độ kinh doanh', 'chuyển sang bán lẻ', 'mở mô hình kinh doanh'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('settings');
        setTimeout(() => document.querySelector('[data-action="business-mode-selector"]')?.click(), 100);
        return { success: true, message: 'Đã mở chọn chế độ kinh doanh.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_ui_profile: {
    id: 'open_ui_profile', name: 'Mở kiểu giao diện', feature_id: null,
    route: 'settings', screen: 'UiProfileSelector',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['kieu giao dien', 'doi giao dien', 'giao dien', 'ui profile'],
    example_phrases: ['đổi kiểu giao diện', 'chọn giao diện', 'mở kiểu giao diện'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('settings');
        setTimeout(() => document.querySelector('[data-action="ui-profile-selector"]')?.click(), 100);
        return { success: true, message: 'Đã mở chọn kiểu giao diện.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  new_product: {
    id: 'new_product', name: 'Thêm hàng hóa mới', feature_id: 'PRODUCTS',
    route: 'products', screen: 'NewProductForm',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['them san pham', 'them san pham moi', 'tao hang moi', 'them mat hang', 'them hang'],
    example_phrases: ['thêm sản phẩm', 'thêm sản phẩm mới', 'tạo hàng mới', 'thêm mặt hàng'],
    entity_types: ['PRODUCT'],
    contexts: ['products', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('products');
        setTimeout(() => document.querySelector('[data-action="new-product"]')?.click(), 100);
        return { success: true, message: 'Đã mở form thêm hàng hóa mới.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  new_service: {
    id: 'new_service', name: 'Thêm dịch vụ mới', feature_id: 'PRODUCTS',
    route: 'products', screen: 'NewServiceForm',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['them dich vu', 'tao dich vu moi', 'them goi dich vu'],
    example_phrases: ['thêm dịch vụ', 'tạo dịch vụ mới'],
    entity_types: ['SERVICE'],
    contexts: ['products', 'dashboard'],
    async execute(params, state) {
      // Navigate to products, then trigger new service form
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('products');
        // The new-product action in app.js handles service creation too
        return { success: true, message: 'Đã mở form thêm dịch vụ mới. Vui lòng chọn loại "Dịch vụ".' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  new_customer: {
    id: 'new_customer', name: 'Thêm khách hàng mới', feature_id: 'CUSTOMERS',
    route: 'customers', screen: 'NewCustomerForm',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['them khach', 'them khach hang', 'tao khach moi', 'khach moi'],
    example_phrases: ['thêm khách hàng', 'tạo khách hàng mới', 'thêm khách mới'],
    entity_types: ['CUSTOMER'],
    contexts: ['customers', 'sales', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('customers');
        setTimeout(() => document.querySelector('[data-action="new-customer"]')?.click(), 100);
        return { success: true, message: 'Đã mở form thêm khách hàng mới.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  new_supplier: {
    id: 'new_supplier', name: 'Thêm nhà cung cấp mới', feature_id: 'SUPPLIERS',
    route: 'suppliers', screen: 'NewSupplierForm',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['them nha cung cap', 'tao ncc', 'them ncc moi'],
    example_phrases: ['thêm nhà cung cấp', 'tạo NCC mới'],
    entity_types: ['SUPPLIER'],
    contexts: ['suppliers', 'products', 'transfers'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('suppliers');
        setTimeout(() => document.querySelector('[data-action="new-supplier"]')?.click(), 100);
        return { success: true, message: 'Đã mở form thêm nhà cung cấp mới.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  new_order: {
    id: 'new_order', name: 'Tạo đơn đặt hàng mới', feature_id: 'ORDERS',
    route: 'orders', screen: 'NewOrderForm',
    required_capabilities: [PERMISSIONS.VIEW_SALES, PERMISSIONS.MANAGE_ORDERS],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['tao don', 'tao don hang', 'don hang moi', 'lap don'],
    example_phrases: ['tạo đơn hàng', 'lập đơn mới', 'tạo đơn đặt hàng'],
    entity_types: ['ORDER'],
    contexts: ['orders', 'dashboard', 'products'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('orders');
        setTimeout(() => document.querySelector('[data-action="new-order"]')?.click(), 100);
        return { success: true, message: 'Đã mở form tạo đơn đặt hàng mới.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },
};

/**
 * Find actions matching a given alias (normalized).
 * Returns array of {action, matchScore} sorted by relevance.
 */
export function findActionsByAlias(normalizedAlias) {
  const results = [];
  const pNorm = (str) => String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const target = pNorm(normalizedAlias);
  if (!target) return [];

  for (const [id, action] of Object.entries(ACTION_REGISTRY)) {
    const list = [
      ...(action.aliases || []),
      ...(action.example_phrases || []).map(pNorm),
      pNorm(action.name),
    ];
    for (const rawAlias of list) {
      const alias = pNorm(rawAlias);
      if (!alias) continue;
      if (alias === target) {
        results.push({ action, matchScore: 100 });
      } else if (target.startsWith(alias) || alias.startsWith(target)) {
        results.push({ action, matchScore: 85 });
      } else if (target.includes(alias) || alias.includes(target)) {
        results.push({ action, matchScore: 70 });
      }
    }
  }
  return results.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Get actions relevant to a specific route/context.
 */
export function getActionsForContext(route) {
  return Object.values(ACTION_REGISTRY).filter(a => {
    if (!a.contexts) return true;
    return a.contexts.includes(route);
  });
}

/**
 * Get suggested actions for a route (for dynamic chips).
 * Returns max 5 actions that are AVAILABLE and have example_phrases.
 */
export function getSuggestedActions(route) {
  return Object.values(ACTION_REGISTRY)
    .filter(a => {
      if (a.implementation_state !== IMPLEMENTATION_STATE.AVAILABLE) return false;
      if (!a.example_phrases || a.example_phrases.length === 0) return false;
      if (a.contexts && !a.contexts.includes(route)) return false;
      return true;
    })
    .slice(0, 5)
    .map(a => ({ id: a.id, phrase: a.example_phrases[0], name: a.name }));
}

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
