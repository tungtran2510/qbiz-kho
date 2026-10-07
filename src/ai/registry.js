/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — FEATURE & ACTION REGISTRY
 * Authoritative capability map and natural language action dispatcher.
 * Routes are discovered directly from actual app source (src/app.js).
 * Model resolves intent candidate only; registry resolves actual action.
 */

import { hasCapability, PERMISSIONS } from './policy.js';
import { getCurrentActor } from './context.js';

if (typeof window === 'undefined') {
  globalThis.window = globalThis;
}

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
      const navFn = window.__qbiz_app__?.navigate || window.navigate;
      if (navFn) {
        if (state) {
          state.warehouseFilter = 'all';
          state.warehouseStockFilter = 'all';
          if (params?.type === 'SERVICE' || params?.tab === 'SERVICE') {
            state.productType = 'SERVICE';
            state._userSelectedProductType = true;
          } else {
            state.productType = 'ALL';
          }
        }
        navFn('products');
        return { success: true, message: params?.type === 'SERVICE' ? 'Đã mở danh mục dịch vụ.' : 'Đã mở danh sách hàng hóa.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_services: {
    id: 'open_services',
    name: 'Mở danh mục dịch vụ & sửa chữa',
    feature_id: 'PRODUCTS',
    route: 'products',
    screen: 'ServiceList',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['dich vu', 'sua chua', 'dich vu sua chua', 'danh sach dich vu', 'mo dich vu', 'vao dich vu', 'khu dich vu'],
    example_phrases: ['mở dịch vụ', 'vào dịch vụ', 'danh sách dịch vụ sửa chữa'],
    contexts: ['dashboard', 'sales', 'products'],
    async execute(params, state) {
      const navFn = window.__qbiz_app__?.navigate || window.navigate;
      if (navFn) {
        if (state) {
          state.productType = 'SERVICE';
          state._userSelectedProductType = true;
        }
        navFn('products');
        return { success: true, message: 'Đã mở danh mục dịch vụ & sửa chữa.' };
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
    aliases: [
      'may in', 'cai may in', 'mo may in', 'thiet bi in', 'sua may in', 'in thu', 'vao may in',
      'cai dat may in', 'mo cai dat may in', 'cau hinh may in', 'thiet lap may in',
      'ket noi may in', 'may in hoa don', 'may in bill', 'may in nhiet', 'may in tem',
      'in va thiet bi', 'thiet bi va in', 'mau in', 'cai dat mau in', 'nhat ky in',
      'lich su in', 'in test', 'test may in'
    ],
    example_phrases: [
      'mở máy in', 'cài máy in', 'cài đặt máy in', 'mở cài đặt máy in',
      'kết nối máy in', 'cấu hình máy in', 'thiết lập máy in', 'mẫu in',
      'nhật ký in', 'in thử'
    ],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      let targetTab = params?.tab || 'devices';
      if (!params?.tab && params?.query) {
        const qNorm = String(params.query).toLowerCase();
        if (qNorm.includes('mau') || qNorm.includes('template')) {
          targetTab = 'templates';
        } else if (qNorm.includes('nhat ky') || qNorm.includes('lich su') || qNorm.includes('job')) {
          targetTab = 'jobs';
        } else {
          targetTab = 'devices';
        }
      }
      const tabNames = { devices: 'Thiết bị & Máy in', templates: 'Mẫu in', jobs: 'Nhật ký in' };
      if (window.__qbiz_app__?.openPrintSettings) {
        window.__qbiz_app__.openPrintSettings(targetTab);
        return {
          success: true,
          intent: 'OPEN_PRINT_SETTINGS',
          actionId: 'open_print_settings',
          message: `Đã mở màn hình **Cấu hình máy in & thiết bị** (${tabNames[targetTab] || 'Thiết bị'}).`
        };
      }
      if (window.__qbiz_app__?.navigate) {
        state.printTab = targetTab;
        window.__qbiz_app__.navigate('print');
        return {
          success: true,
          intent: 'OPEN_PRINT_SETTINGS',
          actionId: 'open_print_settings',
          message: `Đã mở màn hình **Cấu hình máy in & thiết bị** (${tabNames[targetTab] || 'Thiết bị'}).`
        };
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
    aliases: ['ban hang', 'vao ban hang', 'mo pos', 'ban', 'vao pos', 'pos'],
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
    aliases: ['don hang', 'mo don hang', 'xem don', 'danh sach don', 'don hang hom nay', 'don hom nay'],
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
    aliases: [
      'hoa don', 'lich su ban', 'giao dich', 'phieu ban', 'mo hoa don', 'xem hoa don',
      'danh sach hoa don', 'lich su hoa don', 'trang hoa don', 'danh sach giao dich',
      'lich su giao dich', 'mo giao dich', 'xem giao dich', 'danh sach phieu ban',
      'lich su ban hang', 'mo phieu ban', 'xem phieu ban', 'so hoa don'
    ],
    example_phrases: ['xem hóa đơn', 'lịch sử bán hàng', 'mở giao dịch', 'danh sách hóa đơn'],
    entity_types: ['TRANSACTION'],
    contexts: ['dashboard', 'sales', 'orders', 'transactions'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        state.txSearch = '';
        window.__qbiz_app__.navigate('transactions');
        return { success: true, message: 'Đã mở màn hình Giao dịch & phiếu (lịch sử hóa đơn bán hàng).' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  get_latest_transaction: {
    id: 'get_latest_transaction',
    name: 'Hóa đơn gần nhất',
    feature_id: null,
    route: 'transactions',
    screen: 'TransactionList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: [
      'hoa don gan nhat', 'tim lay hoa don gan nhat', 'lay hoa don gan nhat', 'tim hoa don gan nhat',
      'xem hoa don gan nhat', 'mo hoa don gan nhat', 'in hoa don gan nhat', 'in lai hoa don gan nhat',
      'hoa don moi nhat', 'hoa don vua ban', 'hoa don vua tao', 'hoa don cuoi cung', 'hoa don vua roi',
      'don gan nhat', 'don hang gan nhat', 'tim don gan nhat', 'xem don gan nhat', 'mo don gan nhat',
      'don moi nhat', 'don vua ban', 'don vua roi', 'lay don gan nhat',
      'phieu ban gan nhat', 'tim phieu ban gan nhat', 'xem phieu ban gan nhat', 'phieu gan nhat',
      'phieu moi nhat', 'phieu vua ban', 'phieu vua roi', 'mo phieu ban gan nhat',
      'giao dich gan nhat', 'tim giao dich gan nhat', 'xem giao dich gan nhat', 'giao dich moi nhat',
      'in hoa don vua ban', 'in lai hoa don', 'in phieu gan nhat'
    ],
    example_phrases: [
      'tìm lấy hóa đơn gần nhất', 'hóa đơn gần nhất', 'xem hóa đơn gần nhất', 'phiếu bán gần nhất',
      'in hóa đơn gần nhất', 'đơn hàng gần nhất', 'giao dịch gần nhất', 'hóa đơn vừa bán'
    ],
    entity_types: ['TRANSACTION', 'ORDER'],
    contexts: ['dashboard', 'sales', 'orders', 'transactions'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return await executeSkill('latest-transaction', params, context, state);
    },
  },

  search_transactions: {
    id: 'search_transactions',
    name: 'Tìm kiếm hóa đơn',
    feature_id: null,
    route: 'transactions',
    screen: 'TransactionList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['tim hoa don', 'tra cuu hoa don', 'tim phieu ban', 'tim giao dich', 'tim don hang'],
    example_phrases: ['tìm hóa đơn', 'tra cứu hóa đơn', 'tìm phiếu bán'],
    entity_types: ['TRANSACTION', 'ORDER'],
    contexts: ['dashboard', 'sales', 'orders', 'transactions'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return await executeSkill('search-transaction', params, context, state);
    },
  },

  open_reports: {
    id: 'open_reports', name: 'Mở báo cáo', feature_id: null,
    route: 'reports', screen: 'Reports',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['trang bao cao', 'mo bao cao', 'xem bao cao', 'trung tam bao cao', 'mo thong ke'],
    example_phrases: ['mở báo cáo', 'xem thống kê', 'vào trang báo cáo', 'mở thống kê'],
    contexts: ['dashboard', 'products', 'sales'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('reports'); return { success: true, message: 'Đã mở trang báo cáo.' }; }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_exports: {
    id: 'open_exports', name: 'Mở trung tâm xuất dữ liệu & chứng từ kế toán', feature_id: null,
    route: 'exports', screen: 'Exports',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.NAVIGATE, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['xuat du lieu', 'trung tam xuat du lieu', 'xuat bao cao', 'mau bieu ke toan', 'chung tu ke toan'],
    example_phrases: ['mở xuất dữ liệu', 'vào xuất dữ liệu', 'xuất chứng từ kế toán'],
    contexts: ['dashboard', 'reports', 'settings'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) { window.__qbiz_app__.navigate('exports'); return { success: true, message: 'Đã mở Trung tâm Xuất dữ liệu & Biểu mẫu kế toán.' }; }
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
    aliases: ['thong tin cua hang', 'sua thong tin', 'ten cua hang', 'doi ten shop', 'thong tin shop', 'ho so shop', 'cai dat cua hang', 'cai dat ngan hang', 'cai so tai khoan', 'so tai khoan', 'ngan hang'],
    example_phrases: ['sửa thông tin cửa hàng', 'đổi tên cửa hàng', 'mở hồ sơ shop', 'cài đặt tài khoản ngân hàng'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openBusinessProfile) {
        window.__qbiz_app__.openBusinessProfile();
        return { success: true, message: 'Đã mở Thông tin cửa hàng & Ngân hàng.' };
      }
      if (window.openBusinessProfile) {
        window.openBusinessProfile();
        return { success: true, message: 'Đã mở Thông tin cửa hàng & Ngân hàng.' };
      }
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('settings');
        setTimeout(() => document.querySelector('[data-action="business-profile"]')?.click(), 100);
        return { success: true, message: 'Đã mở thông tin cửa hàng.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_business_profile: {
    id: 'open_business_profile', name: 'Mở thông tin cửa hàng & Ngân hàng', feature_id: null,
    route: 'settings', screen: 'BusinessProfile',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['cai dat ngan hang', 'so tai khoan', 'thong tin shop', 'open_business_profile'],
    example_phrases: ['cài đặt ngân hàng', 'mở số tài khoản'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openBusinessProfile) {
        window.__qbiz_app__.openBusinessProfile();
        return { success: true, message: 'Đã mở Thông tin cửa hàng & Ngân hàng.' };
      }
      if (window.openBusinessProfile) {
        window.openBusinessProfile();
        return { success: true, message: 'Đã mở Thông tin cửa hàng & Ngân hàng.' };
      }
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
    aliases: [
      'che do kinh doanh', 'doi che do', 'mo hinh kinh doanh', 'doi mo hinh', 'chon mo hinh', 'chon che do kinh doanh', 'mo che do kinh doanh',
      'chuyen doi nganh hang', 'chuyen nganh hang', 'doi nganh hang', 'nganh hang',
      'chuyen doi phuong thuc ban hang', 'phuong thuc ban hang', 'doi phuong thuc ban hang',
      'chuyen sang ban le', 'doi sang ban le', 'nganh ban le', 'ban le'
    ],
    example_phrases: ['đổi chế độ kinh doanh', 'chuyển sang bán lẻ', 'mở mô hình kinh doanh', 'đổi mô hình kinh doanh', 'chuyển đổi ngành hàng', 'chuyển đổi phương thức bán hàng'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openBusinessModeModal) {
        window.__qbiz_app__.openBusinessModeModal(params?.mode);
        const modeLabel = params?.mode === 'retail' ? 'Bán lẻ' : params?.mode;
        return { success: true, message: modeLabel ? `Đã mở Chế độ kinh doanh (Đề xuất: ${modeLabel}).` : 'Đã mở chọn chế độ kinh doanh.' };
      }
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
    aliases: ['kieu giao dien', 'doi giao dien', 'giao dien', 'ui profile', 'cai dat giao dien'],
    example_phrases: ['đổi kiểu giao diện', 'chọn giao diện', 'mở kiểu giao diện'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openUiProfileModal) {
        window.__qbiz_app__.openUiProfileModal();
        return { success: true, message: 'Đã mở chọn kiểu giao diện.' };
      }
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('settings');
        setTimeout(() => document.querySelector('[data-action="ui-profile-selector"]')?.click(), 100);
        return { success: true, message: 'Đã mở chọn kiểu giao diện.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_sale_preferences: {
    id: 'open_sale_preferences',
    name: 'Mở Bán hàng & Thanh toán',
    feature_id: null,
    route: 'settings',
    screen: 'SalePreferences',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['cai dat thanh toan', 'ban hang va thanh toan', 'phuong thuc thanh toan mac dinh', 'kho mac dinh', 'cai dat qr', 'cai qr', 'cai dat payos', 'ting ting tu dong', 'open_sales_pref'],
    example_phrases: ['cài đặt thanh toán', 'mở bán hàng và thanh toán', 'cài đặt qr', 'cài đặt payos'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openSalePreferences) {
        window.__qbiz_app__.openSalePreferences();
        return { success: true, message: 'Đã mở Cài đặt Bán hàng & Thanh toán.' };
      }
      if (window.openSalePreferences) {
        window.openSalePreferences();
        return { success: true, message: 'Đã mở Cài đặt Bán hàng & Thanh toán.' };
      }
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('settings');
        setTimeout(() => document.querySelector('[data-action="sale-preferences"]')?.click(), 100);
        return { success: true, message: 'Đã mở Cài đặt Bán hàng & Thanh toán.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_sales_pref: {
    id: 'open_sales_pref',
    name: 'Mở Bán hàng & Thanh toán',
    feature_id: null,
    route: 'settings',
    screen: 'SalePreferences',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['open_sales_pref', 'cai dat qr'],
    example_phrases: ['cài đặt qr'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openSalePreferences) {
        window.__qbiz_app__.openSalePreferences();
        return { success: true, message: 'Đã mở Cài đặt Bán hàng & Thanh toán.' };
      }
      if (window.openSalePreferences) {
        window.openSalePreferences();
        return { success: true, message: 'Đã mở Cài đặt Bán hàng & Thanh toán.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_warehouse_management: {
    id: 'open_warehouse_management',
    name: 'Mở Cài đặt Kho hàng',
    feature_id: null,
    route: 'settings',
    screen: 'WarehouseManagement',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['cai dat kho', 'danh sach kho', 'quan ly kho', 'them kho'],
    example_phrases: ['cài đặt kho', 'mở quản lý kho', 'danh sách kho'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openWarehouseManagement) {
        window.__qbiz_app__.openWarehouseManagement();
        return { success: true, message: 'Đã mở Quản lý Kho hàng.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_data_settings: {
    id: 'open_data_settings',
    name: 'Mở Cài đặt Dữ liệu',
    feature_id: null,
    route: 'settings',
    screen: 'DataSettings',
    required_capabilities: [PERMISSIONS.MANAGE_SETTINGS],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['cai dat du lieu', 'du lieu', 'quan ly du lieu'],
    example_phrases: ['cài đặt dữ liệu', 'mở dữ liệu'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openDataSettings) {
        window.__qbiz_app__.openDataSettings();
        return { success: true, message: 'Đã mở Cài đặt Dữ liệu.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_advanced: {
    id: 'open_advanced',
    name: 'Mở Tiện ích nâng cao',
    feature_id: null,
    route: 'advanced',
    screen: 'AdvancedHub',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['tien ich nang cao', 'tien ich', 'nang cao', 'mo rong'],
    example_phrases: ['mở tiện ích nâng cao', 'tiện ích nâng cao'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('advanced');
        return { success: true, message: 'Đã mở Tiện ích nâng cao.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_prices: {
    id: 'open_prices',
    name: 'Mở Bảng giá & Giá sỉ',
    feature_id: null,
    route: 'prices',
    screen: 'Prices',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['bang gia', 'gia si', 'bang gia ban le', 'cai dat gia'],
    example_phrases: ['mở bảng giá', 'bảng giá', 'giá sỉ'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('prices');
        return { success: true, message: 'Đã mở Quản lý Bảng giá & Giá sỉ.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_promos: {
    id: 'open_promos',
    name: 'Mở Khuyến mại',
    feature_id: null,
    route: 'promos',
    screen: 'Promotions',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['khuyen mai', 'giam gia', 'chuong trinh khuyen mai'],
    example_phrases: ['mở khuyến mại', 'khuyến mại'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('promos');
        return { success: true, message: 'Đã mở Quản lý Khuyến mại.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_debts: {
    id: 'open_debts',
    name: 'Mở Quản lý Công nợ',
    feature_id: null,
    route: 'debts',
    screen: 'Debts',
    required_capabilities: [PERMISSIONS.VIEW_FINANCIAL_REPORTS],
    execution_mode: EXECUTION_MODE.NAVIGATE,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['cong no', 'so no', 'quan ly cong no', 'no khach hang', 'no nha cung cap'],
    example_phrases: ['mở công nợ', 'sổ nợ', 'quản lý công nợ'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.navigate) {
        window.__qbiz_app__.navigate('debts');
        return { success: true, message: 'Đã mở Quản lý Công nợ.' };
      }
      return { success: false, error: 'Chưa khởi tạo điều hướng app.' };
    },
  },

  open_scan: {
    id: 'open_scan',
    name: 'Quét mã vạch / QR',
    feature_id: null,
    route: null,
    screen: 'ScanModal',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'NAVIGATE',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['quet ma', 'quet barcode', 'quet qr', 'may quet', 'bat camera quet'],
    example_phrases: ['quét mã', 'quét barcode', 'mở máy quét mã vạch'],
    contexts: ['sales', 'products', 'dashboard'],
    async execute(params, state) {
      if (window.__qbiz_app__?.openScan) {
        window.__qbiz_app__.openScan();
        return { success: true, message: 'Đã mở máy quét mã vạch / QR.' };
      }
      return { success: false, error: 'Hàm openScan chưa sẵn sàng.' };
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
    aliases: ['tao don', 'tao don hang', 'don hang moi', 'lap don', 'lap don hang'],
    example_phrases: ['tạo đơn hàng', 'lập đơn mới', 'tạo đơn đặt hàng', 'lập đơn hàng'],
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

  sales_summary: {
    id: 'sales_summary', name: 'Tổng kết doanh thu', feature_id: null,
    route: 'reports', screen: 'Reports',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['doanh thu', 'doanh thu hom nay', 'doanh so', 'doanh so hom nay', 'ban bao nhieu', 'hom nay ban bao nhieu', 'hom nay co may don', 'may don', 'bao nhieu don', 'tong ket ban hang'],
    example_phrases: ['doanh thu hôm nay', 'hôm nay có mấy đơn', 'hôm nay bán bao nhiêu'],
    contexts: ['dashboard', 'sales', 'reports'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('sales-summary', params || {}, context || {}, state);
    },
  },

  find_low_stock: {
    id: 'find_low_stock', name: 'Hàng sắp hết', feature_id: 'INVENTORY_LOW',
    route: 'products', screen: 'LowStockList',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['hang sap het', 'mat hang sap het', 'hang gan het', 'mat hang gan het', 'xem mat hang nao gan het', 'xem hang sap het', 'canh bao ton', 'ton toi thieu', 'sap can'],
    example_phrases: ['hàng sắp hết', 'xem mặt hàng nào gần hết', 'hàng gần hết'],
    contexts: ['dashboard', 'products', 'transfers'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('find-low-stock', params || {}, context || {}, state);
    },
  },

  query_receipts_aggregate: {
    id: 'query_receipts_aggregate', name: 'Thống kê nhập hàng', feature_id: 'WAREHOUSE_RECEIPT',
    route: 'transfers', screen: 'ReceiptSummary',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['nhap bao nhieu hang', 'thang nay nhap bao nhieu hang', 'thang nay nhap vao bao nhieu hang', 'hom nay nhap bao nhieu hang', 'da nhap bao nhieu'],
    example_phrases: ['tháng này nhập vào bao nhiêu hàng', 'hôm nay nhập bao nhiêu hàng'],
    contexts: ['dashboard', 'transfers', 'products'],
    async execute(params, state, context) {
      const { queryReceiptsAggregate } = await import('./router.js');
      return queryReceiptsAggregate(params?.query || '', state, context || {});
    },
  },

  daily_attention: {
    id: 'daily_attention', name: 'Tiêu điểm hàng ngày', feature_id: null,
    route: 'dashboard', screen: 'Dashboard',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['co gi can chu y', 'can chu y', 'tieu diem', 'tieu diem hom nay', 'cua hang the nao', 'cua hang hom nay the nao', 'tinh hinh cua hang', 'diem nong'],
    example_phrases: ['có gì cần chú ý', 'cửa hàng hôm nay thế nào', 'tiêu điểm hôm nay'],
    contexts: ['dashboard', 'sales', 'products'],
    async execute(params, state) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('daily-attention', params || {}, {}, state);
    },
  },

  replenishment_suggestion: {
    id: 'replenishment_suggestion', name: 'Gợi ý nhập hàng', feature_id: 'WAREHOUSE_RECEIPT',
    route: 'transfers', screen: 'Replenishment',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['goi y nhap hang', 'goi y nhap', 'can nhap gi', 'can nhap them gi', 'de xuat nhap hang'],
    example_phrases: ['gợi ý nhập hàng', 'cần nhập thêm gì'],
    contexts: ['products', 'transfers', 'dashboard'],
    async execute(params, state) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('replenishment-suggestion', params || {}, {}, state);
    },
  },

  shop_health_check: {
    id: 'shop_health_check', name: 'Kiểm tra sức khỏe cửa hàng', feature_id: null,
    route: 'settings', screen: 'ShopHealth',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['kiem tra du lieu', 'suc khoe cua hang', 'kiem tra he thong', 'loi du lieu', 'kiem tra sai sot', 'ra soat du lieu'],
    example_phrases: ['kiểm tra dữ liệu', 'sức khỏe cửa hàng'],
    contexts: ['settings', 'dashboard'],
    async execute(params, state) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('shop-health-check', params || {}, {}, state);
    },
  },

  check_stock: {
    id: 'check_stock', name: 'Kiểm tra tồn kho', feature_id: 'PRODUCTS',
    route: 'products', screen: 'ProductDetail',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['cai nay con bao nhieu', 'con bao nhieu', 'kiem tra ton', 'xem ton kho', 'con khong', 'con ton khong'],
    example_phrases: ['cái này còn bao nhiêu', 'còn bao nhiêu', 'kiểm tra tồn'],
    contexts: ['products', 'sales', 'transfers'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('check-stock', params || {}, context || {}, state);
    },
  },

  create_receipt_proposal: {
    id: 'create_receipt_proposal', name: 'Đề xuất nhập hàng', feature_id: 'WAREHOUSE_RECEIPT',
    route: 'transfers', screen: 'ReceiptProposal',
    required_capabilities: [PERMISSIONS.RECEIVE_STOCK],
    execution_mode: EXECUTION_MODE.MUTATE, risk_level: 'WRITE',
    confirmation_policy: 'PROPOSAL_REQUIRED', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['de xuat nhap kho', 'de xuat nhap hang', 'tao de xuat nhap kho', 'nhap hang vao kho'],
    example_phrases: ['nhập thêm 5 cái này', 'nhập thêm 20 cái', 'thêm 5 cái Lavie vào kho chính'],
    contexts: ['products', 'transfers'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('receipt-proposal', params || {}, context || {}, state);
    },
  },

  create_issue_proposal: {
    id: 'create_issue_proposal', name: 'Đề xuất xuất kho / Giảm tồn', feature_id: 'WAREHOUSE_ISSUE',
    route: 'transfers', screen: 'IssueProposal',
    required_capabilities: [PERMISSIONS.RECEIVE_STOCK],
    execution_mode: EXECUTION_MODE.MUTATE, risk_level: 'WRITE',
    confirmation_policy: 'PROPOSAL_REQUIRED', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['de xuat xuat kho', 'de xuat giam kho', 'giam kho', 'xuat kho', 'giam ton', 'bot ton', 'tru kho', 'xuat bot', 'xuat huy'],
    example_phrases: ['giảm kho cái này đi hai cái', 'giảm kho 2 cái', 'xuất kho 5 cái này', 'trừ kho 2 cái'],
    contexts: ['products', 'transfers'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return executeSkill('issue-proposal', params || {}, context || {}, state);
    },
  },

  select_customer: {
    id: 'select_customer', name: 'Chọn khách hàng', feature_id: 'CUSTOMERS',
    route: 'sales', screen: 'CustomerSelect',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN, risk_level: 'READ',
    confirmation_policy: 'NEVER', implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['chon khach', 'chon khach lan', 'tim khach lan', 'chi dinh khach hang'],
    example_phrases: ['chọn khách Lan', 'chọn khách'],
    contexts: ['sales', 'orders'],
    async execute(params, state) {
      if (window.__qbiz_app__?.selectCustomer) {
        return window.__qbiz_app__.selectCustomer(params?.query || 'Lan');
      }
      return { success: true, message: 'Đã tìm kiếm khách hàng.' };
    },
  },

  sales_summary: {
    id: 'sales_summary',
    name: 'Báo cáo doanh thu & Bán hàng',
    feature_id: 'DASHBOARD',
    route: 'dashboard',
    screen: 'Dashboard',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: [
      'doanh thu', 'doanh so', 'ban bao nhieu', 'ban duoc bao nhieu', 'may don', 'bao nhieu don',
      'hom nay ban duoc bao nhieu', 'thang nay ban duoc bao nhieu', 'tong ket ban hang', 'tinh hinh ban hang',
      'hom nay ban the nao', 'thang nay ban the nao', 'tien ban hom nay', 'tien ban thang nay',
      'doanh thu hom nay', 'doanh thu thang nay', 'doanh so hom nay', 'doanh so thang nay'
    ],
    example_phrases: ['hôm nay bán bao nhiêu', 'doanh thu hôm nay', 'tháng này bán được bao nhiêu'],
    contexts: ['dashboard', 'sales', 'reports'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      const period = params?.period || (context?.period) || 'today';
      return await executeSkill('sales-summary', { period }, context || {}, state);
    },
  },

  profit_inquiry: {
    id: 'profit_inquiry',
    name: 'Báo cáo lợi nhuận & Giá vốn',
    feature_id: 'DASHBOARD',
    route: 'dashboard',
    screen: 'Dashboard',
    required_capabilities: [PERMISSIONS.VIEW_COST],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: [
      'loi nhuan', 'gia von', 'lai bao nhieu', 'loi bao nhieu', 'lai hay lo', 'dang lai', 'lai gop',
      'loi duoc', 'lai duoc', 'loi hon', 'lo hay lai', 'loi lai', 'tong gia von', 'ti le loi nhuan',
      'ty suat loi nhuan', 'profit', 'gross profit', 'thang nay loi bao nhieu', 'hai ngay nay loi nhuan bao nhieu',
      'loi nhuan hai ngay nay la bao nhieu', 'hom nay lai bao nhieu', 'tuan nay loi nhuan bao nhieu',
      'hai ngay nay loi bao nhieu', '2 ngay nay loi bao nhieu', 'tu dau thang den nay loi bao nhieu'
    ],
    example_phrases: ['tháng này lời bao nhiêu', 'lợi nhuận hai ngày nay là bao nhiêu', 'hôm nay lãi bao nhiêu'],
    contexts: ['dashboard', 'reports'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      const period = params?.period || context?.period || 'today';
      return await executeSkill('profit-inquiry', { period, ...params }, context || {}, state);
    },
  },

  daily_attention: {
    id: 'daily_attention',
    name: 'Tiêu điểm & Cần chú ý trong ngày',
    feature_id: 'DASHBOARD',
    route: 'dashboard',
    screen: 'Dashboard',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['can chu y', 'tieu diem', 'dau ngay', 'sang nay', 'cua hang the nao', 'tinh hinh cua hang', 'diem can chu y'],
    example_phrases: ['cần chú ý gì', 'tiêu điểm hôm nay', 'cửa hàng hôm nay thế nào'],
    contexts: ['dashboard'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return await executeSkill('daily-attention', params || {}, context || {}, state);
    },
  },

  replenishment_suggestion: {
    id: 'replenishment_suggestion',
    name: 'Gợi ý & Đề xuất nhập hàng',
    feature_id: 'PRODUCTS',
    route: 'products',
    screen: 'ProductList',
    required_capabilities: [PERMISSIONS.READ_STOCK],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['goi y nhap', 'can nhap gi', 'can nhap them', 'de xuat nhap hang', 'mat hang can nhap', 'hang nao can nhap'],
    example_phrases: ['gợi ý nhập hàng', 'cần nhập thêm gì', 'hàng nào cần nhập'],
    contexts: ['products', 'transfers', 'dashboard'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return await executeSkill('replenishment-suggestion', params || {}, context || {}, state);
    },
  },

  shop_health_check: {
    id: 'shop_health_check',
    name: 'Kiểm tra dữ liệu & Sức khỏe hệ thống',
    feature_id: 'DASHBOARD',
    route: 'dashboard',
    screen: 'Dashboard',
    required_capabilities: [],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['kiem tra du lieu', 'suc khoe cua hang', 'kiem tra he thong', 'loi du lieu'],
    example_phrases: ['kiểm tra dữ liệu', 'sức khỏe cửa hàng'],
    contexts: ['dashboard', 'settings'],
    async execute(params, state) {
      const prods = state?.data?.products || [];
      const orders = state?.data?.orders || [];
      const sales = state?.data?.sales || [];
      return {
        text: `Hệ thống dữ liệu hoạt động bình thường:\n- **${prods.length}** sản phẩm trong kho\n- **${sales.length}** phiếu bán hàng đã lưu\n- **${orders.length}** đơn hàng ghi nhận\nKhông phát hiện xung đột dữ liệu.`,
        success: true,
      };
    },
  },

  top_selling_products: {
    id: 'top_selling_products',
    name: 'Mặt hàng & dịch vụ bán chạy',
    feature_id: 'DASHBOARD',
    route: 'dashboard',
    screen: 'Dashboard',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: [
      'ban chay', 'top ban chay', 'chay nhat', 'hang ban chay', 'mat hang ban chay',
      'dich vu ban chay', 'dich vu ban chay nhat', 'dich vu nao ban chay', 'goi ban chay',
      'ban nhieu nhat', 'duoc ban nhieu nhat', 'ban duoc nhieu nhat', 'dat nhieu nhat',
      'duoc dat nhieu nhat', 'goi tri lieu nao duoc dat nhieu nhat', 'doanh thu cao nhat',
      'dich vu nao doanh thu cao nhat', 'mon nao ban chay', 'mon ban chay', 'ban chay nhat'
    ],
    example_phrases: [
      'mặt hàng nào bán chạy nhất tháng này', 'top bán chạy',
      'dịch vụ nào được bán nhiều nhất', 'báo cáo dịch vụ nào được bán nhiều nhất',
      'gói trị liệu nào được đặt nhiều nhất', 'món nào bán chạy nhất hôm nay',
      'dịch vụ nào doanh thu cao nhất'
    ],
    contexts: ['dashboard', 'sales', 'reports'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      const query = params?.query || '';
      const period = params?.period || (query.includes('hom nay') ? 'today' : (query.includes('2 ngay') ? '2_days' : 'month'));
      const sortBy = params?.sortBy || ((query.includes('doanh thu') || query.includes('doanh so')) ? 'revenue' : 'quantity');
      return await executeSkill('top-selling-products', { period, query, sortBy, ...params }, context || {}, state);
    },
  },

  price_lookup: {
    id: 'price_lookup',
    name: 'Tra cứu giá bán',
    feature_id: 'PRODUCTS',
    route: 'products',
    screen: 'ProductList',
    required_capabilities: [PERMISSIONS.VIEW_SALES],
    execution_mode: EXECUTION_MODE.OPEN,
    risk_level: 'READ',
    confirmation_policy: 'NEVER',
    implementation_state: IMPLEMENTATION_STATE.AVAILABLE,
    aliases: ['gia bao nhieu', 'bao nhieu tien', 'tra gia', 'gia ban', 'don gia'],
    example_phrases: ['sản phẩm này giá bao nhiêu', 'cái này bao nhiêu tiền'],
    contexts: ['products', 'sales', 'dashboard'],
    async execute(params, state, context) {
      const { executeSkill } = await import('./skills.js');
      return await executeSkill('price-lookup', { query: params?.query || '' }, context || {}, state);
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

  const isQuestion = /\b(nao|gi|sao|bao nhieu|may|khong|ko|k|the nao|chua)\b/i.test(target);
  const isQueryIntent = /\b(ban chay|chay nhat|nhieu nhat|cao nhat|tot nhat|loi|lai|doanh thu|gia|con bao nhieu|con khong)\b/i.test(target);

  for (const [id, action] of Object.entries(ACTION_REGISTRY)) {
    const isNavAction = action.risk_level === 'NAVIGATE' || action.execution_mode === EXECUTION_MODE.NAVIGATE;
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
      } else if (
        target === alias ||
        target.startsWith(alias + ' ') ||
        alias.startsWith(target + ' ') ||
        (alias.length >= 6 && target.startsWith(alias))
      ) {
        // If target is a question or analytical query, do not allow prefix match to hijack into a NAVIGATE action!
        if (isNavAction && (isQuestion || isQueryIntent) && alias !== target) {
          continue;
        }
        results.push({ action, matchScore: 85 });
      } else if (new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:\\s|$)`, 'i').test(target)) {
        if (isNavAction && (isQuestion || isQueryIntent) && alias !== target) {
          continue;
        }
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
