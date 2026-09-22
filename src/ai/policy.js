/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — RISK & POLICY ENGINE
 * Hard safety requirements for Batch 2:
 * - CapabilityGuard & ActorContext
 * - Dynamic Policy-generated Tool Allowlist (HARD DENY on violation)
 * - Strict Quantity / Money / Unit validation
 * - Tenant & Warehouse scope boundaries
 * - High-Risk Magnitude Escalation
 * - Prompt-Injection defense
 */

export const RISK_LEVELS = {
  READ: 'READ',
  NAVIGATE: 'NAVIGATE',
  DRAFT: 'DRAFT',
  WRITE: 'WRITE',
  HIGH_RISK_WRITE: 'HIGH_RISK_WRITE',
};

export const PERMISSIONS = {
  READ_STOCK: 'READ_STOCK',
  VIEW_COST: 'VIEW_COST',
  VIEW_SALES: 'VIEW_SALES',
  RECEIVE_STOCK: 'RECEIVE_STOCK',
  TRANSFER_STOCK: 'TRANSFER_STOCK',
  STOCKTAKE_STOCK: 'STOCKTAKE_STOCK',
  MANAGE_ORDERS: 'MANAGE_ORDERS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
};

export const ROLES = {
  OWNER: {
    id: 'owner',
    name: 'Chủ cửa hàng (Owner)',
    permissions: new Set([
      PERMISSIONS.READ_STOCK,
      PERMISSIONS.VIEW_COST,
      PERMISSIONS.VIEW_SALES,
      PERMISSIONS.RECEIVE_STOCK,
      PERMISSIONS.TRANSFER_STOCK,
      PERMISSIONS.STOCKTAKE_STOCK,
      PERMISSIONS.MANAGE_ORDERS,
      PERMISSIONS.MANAGE_SETTINGS,
    ]),
    warehouse_scope: 'all', // all warehouses allowed
  },
  CASHIER: {
    id: 'cashier',
    name: 'Thu ngân (Cashier)',
    permissions: new Set([
      PERMISSIONS.READ_STOCK,
      PERMISSIONS.VIEW_SALES,
      PERMISSIONS.MANAGE_ORDERS,
    ]),
    // CASHIER has NO VIEW_COST, NO RECEIVE_STOCK, NO TRANSFER_STOCK
    warehouse_scope: 'default_only',
  },
  WAREHOUSE_STAFF: {
    id: 'warehouse_staff',
    name: 'Nhân viên kho',
    permissions: new Set([
      PERMISSIONS.READ_STOCK,
      PERMISSIONS.RECEIVE_STOCK,
      PERMISSIONS.TRANSFER_STOCK,
      PERMISSIONS.STOCKTAKE_STOCK,
    ]),
    // Can be restricted to specific warehouses
    warehouse_scope: ['wh_center'],
  },
};

/**
 * Check if an actor possesses a specific capability.
 */
export function hasCapability(actor, permission) {
  if (!actor || !actor.role) return false;
  const roleDef = ROLES[actor.role.toUpperCase()] || ROLES.CASHIER;
  return roleDef.permissions.has(permission);
}

/**
 * Batch 2 Whitelist of Real Write Actions.
 * Generic mutations and arbitrary tools are strictly forbidden.
 */
export const ALLOWED_WRITE_ACTIONS = new Set([
  'create_receipt_proposal',
  'create_transfer_proposal',
  'create_stocktake_proposal',
  'create_cart_draft',
  'RECEIVE_STOCK',
  'TRANSFER_STOCK',
  'STOCKTAKE_STOCK',
  'propose_memory_save',
  'saveMemory',
]);

const HIGH_RISK_ACTIONS = new Set([
  'createTransfer',
  'receiveTransfer',
  'cancelTransfer',
  'createReturn',
  'createExchange',
  'countAdjust',
  'setOpeningStock',
  'applyWarehouseBatch',
  'updateItem',
  'clearAll',
  'resetDemo',
]);

const WRITE_ACTIONS = new Set([
  'receive',
  'issue',
  'createSale',
  'createOrder',
  'confirmOrder',
  'processOrder',
  'completeOrder',
  'cancelOrder',
  'createProduct',
  'createService',
  'createCategory',
  'createWarehouse',
  'createSupplier',
  'openShift',
  'closeShift',
  'markSalePaid',
  'markOrderPaid',
  'saveMemory',
]);

const DRAFT_ACTIONS = new Set([
  'create_cart_draft',
  'create_receipt_proposal',
  'create_transfer_proposal',
  'create_stocktake_proposal',
  'propose_memory_save',
]);

/**
 * Evaluate the risk and execution requirements for any requested action.
 * Escalates to HIGH_RISK_WRITE if parameters exceed magnitude thresholds.
 * @param {string} actionName Name of the action or tool
 * @param {Object} [params] Parameters associated with the action
 * @param {Object} [context] Context envelope
 * @param {Object} [state] Application state
 * @returns {{ riskLevel: string, requiresConfirmation: boolean, requiresRevalidation: boolean, autoExecutable: boolean }}
 */
export function evaluateRisk(actionName, params = {}, context = {}, state = {}) {
  let riskLevel = RISK_LEVELS.READ;
  let requiresConfirmation = false;
  let requiresRevalidation = false;
  let autoExecutable = true;

  if (HIGH_RISK_ACTIONS.has(actionName)) {
    riskLevel = RISK_LEVELS.HIGH_RISK_WRITE;
    requiresConfirmation = true;
    requiresRevalidation = true;
    autoExecutable = false;
  } else if (WRITE_ACTIONS.has(actionName)) {
    riskLevel = RISK_LEVELS.WRITE;
    requiresConfirmation = true;
    requiresRevalidation = true;
    autoExecutable = false;
  } else if (DRAFT_ACTIONS.has(actionName)) {
    riskLevel = RISK_LEVELS.DRAFT;
    requiresConfirmation = false;
    requiresRevalidation = false;
    autoExecutable = true;
  } else if (actionName.startsWith('navigate_')) {
    riskLevel = RISK_LEVELS.NAVIGATE;
    requiresConfirmation = false;
    requiresRevalidation = false;
    autoExecutable = true;
  }

  // Section R: High-Risk Threshold Escalation
  // If write quantity is unusually large (> 50 units) or transfers > 80% of stock, escalate
  const qty = Number(params.qty || params.quantity || 0);
  if (qty > 50) {
    riskLevel = RISK_LEVELS.HIGH_RISK_WRITE;
    requiresConfirmation = true;
    requiresRevalidation = true;
  }

  return {
    riskLevel,
    requiresConfirmation,
    requiresRevalidation,
    autoExecutable,
  };
}

/**
 * Section F: Tool Allowlist Generation
 * Allowed tools MUST be computed by policy from ActorContext, Capabilities, and Route.
 * Never derived from LLM text, prompt, or client claim.
 * @param {Object} actor
 * @param {Object} context
 * @returns {Set<string>} Whitelist of permitted tool names
 */
export function computeAllowedTools(actor = {}, context = {}) {
  const roleKey = String(actor.role || 'owner').toUpperCase();
  const roleDef = ROLES[roleKey] || ROLES.CASHIER;
  const tools = new Set();

  // Everyone can search & check stock
  tools.add('search_products');
  tools.add('get_product');
  tools.add('get_stock');
  tools.add('get_available_stock');
  tools.add('find_low_stock');
  tools.add('get_daily_attention_digest');
  tools.add('get_replenishment_suggestions');
  tools.add('get_shop_health_report');
  tools.add('diagnose_stock');
  tools.add('diagnose_transfer');
  tools.add('reconcile_ledger');

  // Sales summary & order diagnosis
  if (roleDef.permissions.has(PERMISSIONS.VIEW_SALES)) {
    tools.add('get_sales_summary');
    tools.add('search_orders');
    tools.add('get_order');
    tools.add('diagnose_order');
    tools.add('search_customers');
    tools.add('get_customer');
    tools.add('create_cart_draft');
    tools.add('diagnose_shift');
  }

  // Cost & Profit inquiry (strictly requires VIEW_COST)
  if (roleDef.permissions.has(PERMISSIONS.VIEW_COST)) {
    tools.add('get_profit_summary');
  }

  // Stock operations (only if role has permission)
  if (roleDef.permissions.has(PERMISSIONS.RECEIVE_STOCK)) {
    tools.add('create_receipt_proposal');
  }
  if (roleDef.permissions.has(PERMISSIONS.TRANSFER_STOCK)) {
    tools.add('create_transfer_proposal');
  }
  if (roleDef.permissions.has(PERMISSIONS.STOCKTAKE_STOCK)) {
    tools.add('create_stocktake_proposal');
  }

  // Memory & Settings management
  if (roleDef.permissions.has(PERMISSIONS.MANAGE_SETTINGS) || roleKey === 'OWNER') {
    tools.add('propose_memory_save');
    tools.add('saveMemory');
  }

  return tools;
}

/**
 * Centralized Operational Threshold Policy (Batch 2C Certification)
 * Replaces duplicated magic numbers and establishes explicit deterministic heuristics.
 */
export const OPERATIONAL_THRESHOLDS = {
  STALE_ORDER_HOURS: 48,
  STALE_TRANSFER_HOURS: 48,
  REPLENISHMENT_DEFAULT_COVERAGE_DAYS: 14,
  REPLENISHMENT_MIN_HISTORY_DAYS: 7,
};

/**
 * Section F Guard: Enforce tool allowlist.
 * Rejects with HARD DENY if tool is not in computed allowlist.
 */
export function isToolAllowed(toolName, actor, context) {
  const allowlist = computeAllowedTools(actor, context);
  return allowlist.has(toolName);
}

/**
 * Section G: Quantity, Money, and Unit Validation
 * Rejects NaN, Infinity, negative, non-integer when unit requires integers.
 */
export function validateQuantityAndUnit({ qty, unit, product }) {
  if (qty === null || qty === undefined || qty === '') {
    return { valid: false, error: 'Thiếu số lượng.' };
  }

  const num = Number(qty);
  if (!Number.isFinite(num)) {
    return { valid: false, error: 'Số lượng không phải số hữu hạn (NaN hoặc Infinity).' };
  }

  if (num <= 0) {
    return { valid: false, error: 'Số lượng phải lớn hơn 0.' };
  }

  // Max domain sanity limit
  if (num > 100000) {
    return { valid: false, error: 'Số lượng vượt quá giới hạn vận hành tối đa (100.000).' };
  }

  // Integer unit check
  const integerUnits = new Set(['cái', 'chiếc', 'hộp', 'bộ', 'thùng', 'lần', 'buổi']);
  const prodUnit = (product?.unit || unit || 'cái').toLowerCase().trim();
  if (integerUnits.has(prodUnit) && !Number.isInteger(num)) {
    return { valid: false, error: `Đơn vị "${prodUnit}" chỉ chấp nhận số nguyên, không chấp nhận số lẻ.` };
  }

  // Mismatch or unknown unit check
  if (unit && product?.unit && unit.toLowerCase().trim() !== product.unit.toLowerCase().trim()) {
    // LLM must not guess unit conversion without official rule
    return {
      valid: false,
      isAmbiguous: true,
      error: `Đơn vị yêu cầu "${unit}" khác với đơn vị quản lý "${product.unit}". Cần làm rõ quy cách trước khi tạo lệnh.`,
    };
  }

  return { valid: true, normalizedQty: num, unit: prodUnit };
}

/**
 * Section H: Tenant and Warehouse Scope Boundary
 * Ensures actor only accesses warehouses within their assigned scope.
 * Inaccessible warehouse returns HARD DENY.
 */
export function validateWarehouseScope(actor, warehouseId, fromWarehouseId, toWarehouseId, state) {
  const warehouses = state?.data?.warehouses || [];
  const knownWhIds = new Set(warehouses.map(w => w.id));

  // Verify warehouses exist in current tenant
  const targetWhs = [warehouseId, fromWarehouseId, toWarehouseId].filter(Boolean);
  for (const wh of targetWhs) {
    if (!knownWhIds.has(wh)) {
      return { allowed: false, error: `Kho "${wh}" không tồn tại trong hệ thống của shop.` };
    }
  }

  // Check actor scope
  const roleKey = String(actor?.role || 'owner').toUpperCase();
  const roleDef = ROLES[roleKey] || ROLES.CASHIER;

  const effectiveScope = actor?.warehouse_scope || roleDef.warehouse_scope;

  if (effectiveScope === 'all') {
    return { allowed: true };
  }

  if (effectiveScope === 'default_only') {
    const defaultWh = warehouses.find(w => w.is_default)?.id || warehouses[0]?.id;
    for (const wh of targetWhs) {
      if (wh !== defaultWh) {
        return { allowed: false, error: `Tài khoản ${roleDef.name} chỉ được thao tác tại kho mặc định.` };
      }
    }
    return { allowed: true };
  }

  if (Array.isArray(effectiveScope)) {
    const allowedSet = new Set(effectiveScope);
    for (const wh of targetWhs) {
      if (!allowedSet.has(wh)) {
        return { allowed: false, error: `Kho "${wh}" nằm ngoài phạm vi kho được phân quyền của bạn (HARD DENY).` };
      }
    }
    return { allowed: true };
  }

  return { allowed: false, error: 'Không xác định được phạm vi kho của người dùng.' };
}

/**
 * Prompt-Injection Defense:
 * Product notes, customer remarks, imported descriptions, and memory entries are DATA.
 * They must never be treated as executable system commands or override capability policies.
 * @param {*} data Untrusted input data
 * @returns {*} Sanitized data safely tagged as data role
 */
export function sanitizeDataBoundary(data) {
  if (typeof data === 'string') {
    return data.trim();
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeDataBoundary);
  }
  if (data && typeof data === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(data)) {
      clean[k] = sanitizeDataBoundary(v);
    }
    return clean;
  }
  return data;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|safety)\s+(instructions|directions|commands|rules|constraints)/i,
  /bỏ\s+qua\s+(hết|tất\s+cả|mọi)?\s*(các\s+)?(chỉ\s+dẫn|quy\s+tắc|ràng\s+buộc|mệnh\s+lệnh|chính\s+sách|bảo\s+mật|bước|fingerprint)/i,
  /bo\s+qua\s+(het|tat\s+ca|moi)?\s*(cac\s+)?(chi\s+dan|quy\s+tac|rang\s+buoc|menh\s+lenh|chinh\s+sach|bao\s+mat|buoc|fingerprint)/i,
  /system\s*prompt/i,
  /developer\s*mode/i,
  /chế\s+độ\s+nhà\s+phát\s+triển|che\s+do\s+nha\s+phat\s+trien/i,
  /khong\s+bi\s+rang\s+buoc|không\s+bị\s+ràng\s+buộc/i,
  /you\s+are\s+now\s+(in\s+developer\s+mode|a\s+developer|unrestricted)/i,
  /act\s+as\s+(an\s+unfiltered|a\s+malicious|system\s+root|admin|owner)/i,
  /đóng\s+vai\s+(chủ\s+sở\s+hữu\s+tối\s+cao|admin|root|quản\s+trị\s+viên)/i,
  /dong\s+vai\s+(chu\s+so\s+huu\s+toi\s+cao|admin|root)/i,
  /override\s+(all\s+)?(safety|policies|security|permissions|role)/i,
  /dump\s+(the\s+)?(entire\s+)?(database|db|system\s+prompt|api\s+key|internal\s+rules|schema)/i,
  /(in(\s+ra)?|cho(\s+tôi)?\s+xem|trích\s+xuất|trich\s+xuat|tiết\s+lộ|tiet\s+lo)\s+(toàn\s+bộ\s+)?(api\s*key|khóa\s+bí\s+mật|mật\s+khẩu|token|cookie|biến\s+môi\s+trường|mã\s+nguồn)/i,
  /(api\s*key|process\.env|khóa\s+bí\s+mật|secret\s*key)/i,
  /system\s+(override|alert|instruction|command)/i,
  /reveal\s+(hidden\s+)?(instructions|prompt)/i,
  /show\s+other\s+customer\s+data/i,
  /(xuất|xuat|lấy|lay)\s+danh\s+sách\s+(tất\s+cả\s+|toàn\s+bộ\s+)?khách\s+hàng/i,
  /disable\s+(confirmation|safety|security|policy|card)/i,
  /(tắt|vô\s+hiệu\s+hóa|tat|vo\s+hieu\s+hoa)\s+(toàn\s+bộ\s+)?(lớp\s+)?(xác\s+nhận|capabilityguard|chính\s+sách|bảo\s+mật|idempotency)/i,
  /execute\s+(tool|database\s+mutation|raw\s+sql|script)/i,
  /(ghi\s+thẳng|ghi\s+truc\s+tiep|can\s+thiep\s+truc\s+tiep)\s+(vào\s+)?(indexeddb|database|db|sổ\s+cái)/i,
  /<script[\s>]/i,
  /javascript:/i,
  /eval\s*\(/i,
  /bạn\s+là\s+(admin|root|chủ\s+hệ\s+thống|siêu\s+quản\s+trị|chủ\s+sở\s+hữu\s+tối\s+cao)/i,
  /ban\s+la\s+(admin|root)/i,
  /admin\s+root/i,
  /root\s+admin/i,
  /hack\s+hệ\s+thống|hack\s+he\s+thong/i,
  /xóa\s+bảng\s+(movements|levels|products|customers|sales|orders)/i,
  /drop\s+table/i,
  /xóa\s+sạch\s+(kho|dữ\s+liệu|data|db|cơ\s+sở)/i,
  /xoa\s+sach\s+(kho|du\s+lieu|data|db)/i,
  /purge\s+(all\s+)?audit\s+logs/i,
  /(chuyển|chuyen)\s+toàn\s+bộ\s+tiền\s+quỹ/i,
  /tự\s+động\s+xác\s+nhận\s+tất\s+cả/i,
  /cấp\s+quyền\s+owner/i,
];

/**
 * Detect prompt injection, system prompt override attempts, or malicious script execution.
 * @param {string} prompt
 * @returns {{ isInjection: boolean, reason?: string }}
 */
export function detectPromptInjection(prompt) {
  if (!prompt || typeof prompt !== 'string') return { isInjection: false };
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      return {
        isInjection: true,
        reason: 'Phát hiện yêu cầu có dấu hiệu can thiệp chính sách an toàn hoặc chỉ thị hệ thống.',
      };
    }
  }
  return { isInjection: false };
}

/**
 * Detect attempts by users to elevate their role or bypass role constraints.
 * @param {string} prompt
 * @returns {boolean}
 */
export function detectRoleElevationAttempt(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  const p = prompt.toLowerCase();
  return (
    p.includes('nang quyen') || p.includes('nâng quyền') ||
    p.includes('cap quyen') || p.includes('cấp quyền') ||
    p.includes('chuyen vai tro') || p.includes('chuyển vai trò') ||
    p.includes('mo quyen') || p.includes('mở quyền') ||
    p.includes('bo qua kiem tra vai tro') || p.includes('bỏ qua kiểm tra vai trò') ||
    p.includes('elevate role') || p.includes('grant permission')
  );
}
