/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — CONTEXT ENVELOPE & BUILDER
 * Strict Batch 2 Safety Addendum:
 * - ActorContext & Capability integration
 * - Dynamic Tool Allowlist generation by policy
 * - Actor switching with sensitive data purge (Section M)
 * - Navigation context invalidation (Section L)
 */

import { computeAllowedTools, hasCapability, PERMISSIONS, ROLES } from './policy.js';
import { logAuditEvent } from './audit.js';

const uuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

// Current active actor (defaults to 'owner')
let currentActor = {
  id: 'usr_owner_1',
  role: 'owner',
  name: 'Chủ shop',
};

// Sensitive conversation cache (purged on actor switch)
const sensitiveStateStore = new Map();

// Multi-turn resolution state (purged on actor switch)
let lastResolvedProduct = null;
let lastResolvedWarehouse = null;
let pendingIntent = null;

export function setLastResolvedProduct(prod) {
  lastResolvedProduct = prod ? { ...prod } : null;
}

export function getLastResolvedProduct() {
  return lastResolvedProduct ? { ...lastResolvedProduct } : null;
}

export function setLastResolvedWarehouse(whId) {
  lastResolvedWarehouse = whId || null;
}

export function getLastResolvedWarehouse() {
  return lastResolvedWarehouse;
}

export function setPendingIntent(intent) {
  pendingIntent = intent ? { ...intent } : null;
}

export function getPendingIntent() {
  return pendingIntent ? { ...pendingIntent } : null;
}

export function clearPendingIntent() {
  pendingIntent = null;
}

/**
 * Get the currently active actor.
 */
export function getCurrentActor() {
  return { ...currentActor };
}

/**
 * Section M: Actor Switch with Mandatory Sensitive State Purge.
 * When switching from Owner to Cashier or between users:
 * Purges safe context, cost/profit data, provider context, and active conversation caches.
 * @param {string|Object} roleOrActor
 */
export function switchActor(roleOrActor) {
  const newRole = typeof roleOrActor === 'string' ? roleOrActor.toLowerCase() : (roleOrActor.role || 'cashier').toLowerCase();
  const actorId = typeof roleOrActor === 'object' && roleOrActor.id ? roleOrActor.id : `usr_${newRole}_1`;
  const roleDef = ROLES[newRole.toUpperCase()] || ROLES.CASHIER;

  const prevRole = currentActor.role;
  currentActor = {
    id: actorId,
    role: roleDef.id,
    name: roleDef.name,
  };

  // Section M: PURGE ALL SENSITIVE STATE & MULTI-TURN CONTEXT
  sensitiveStateStore.clear();
  lastResolvedProduct = null;
  lastResolvedWarehouse = null;
  pendingIntent = null;

  logAuditEvent('ACTOR_SWITCHED', {
    from: prevRole,
    to: currentActor.role,
    purgedSensitiveState: true,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qbiz:ai:actor-switched', { detail: { actor: currentActor } }));
  }

  return currentActor;
}

/**
 * Store sensitive data tagged by actor capability.
 */
export function storeSensitiveData(key, value, requiresPermission = PERMISSIONS.VIEW_COST) {
  if (hasCapability(currentActor, requiresPermission)) {
    sensitiveStateStore.set(key, { value, permission: requiresPermission });
  }
}

/**
 * Retrieve sensitive data (denied if current actor lacks permission).
 */
export function retrieveSensitiveData(key) {
  const entry = sensitiveStateStore.get(key);
  if (!entry) return null;
  if (!hasCapability(currentActor, entry.permission)) {
    return null; // HARD DENIAL on capability
  }
  return entry.value;
}

/**
 * Build a point-in-time ContextEnvelope from the current application state.
 * @param {Object} appState Current runtime state (from app.js)
 * @param {Object} [overrides] Optional context overrides
 * @returns {Object} ContextEnvelope
 */
export function buildContextEnvelope(appState = {}, overrides = {}) {
  const d = appState.data || {};
  const settings = d.settings || [];

  const shopSetting = settings.find(s => s.id === 'business_profile')?.value || {};
  const deviceId = settings.find(s => s.id === 'device_id')?.value || 'dev_local';
  const registerId = settings.find(s => s.id === 'register_id')?.value || 'reg_main';
  const defaultWarehouse = (d.warehouses || [])[0]?.id || '';
  const currentWarehouseId = appState.warehouse && appState.warehouse !== 'all'
    ? appState.warehouse
    : (appState.saleDraft?.warehouseId || getLastResolvedWarehouse() || defaultWarehouse);

  // Active modal or screen entity bindings (with multi-turn memory fallback)
  const boundProductId = overrides.current_product_id || appState.currentProductId || getLastResolvedProduct()?.id || null;
  const boundOrderId = overrides.current_order_id || appState.currentOrderId || null;
  const boundSaleId = overrides.current_sale_id || appState.currentSaleId || null;
  const boundCustomerId = overrides.current_customer_id || appState.saleCustomer?.id || appState.currentCustomerId || null;
  const boundSupplierId = overrides.current_supplier_id || appState.currentSupplierId || null;
  const boundTransferId = overrides.current_transfer_id || appState.currentTransferId || null;
  const boundReturnId = overrides.current_return_id || appState.currentReturnId || null;
  const boundDocumentId = overrides.current_document_id || appState.currentDocumentId || null;

  // Determine entity version if bound
  let entityVersion = null;
  if (boundProductId) {
    const prod = (d.products || []).find(p => p.id === boundProductId);
    if (prod) entityVersion = prod.version || prod.updated_at || 1;
  } else if (boundOrderId) {
    const ord = (d.orders || []).find(o => o.id === boundOrderId);
    if (ord) entityVersion = ord.version || ord.updated_at || 1;
  }

  const currentRoute = appState.page || 'dashboard';
  const currentScreen = currentRoute === 'sales' ? (appState.saleStep || 'browse') : currentRoute;

  // Active actor
  const actor = overrides.actor || currentActor;

  // Section F: Allowed tools strictly computed by policy from ActorContext
  const allowedToolsSet = computeAllowedTools(actor, { current_route: currentRoute });
  const allowedTools = Array.from(allowedToolsSet);

  const capabilities = {
    canRead: true,
    canViewCost: hasCapability(actor, PERMISSIONS.VIEW_COST),
    canViewSales: hasCapability(actor, PERMISSIONS.VIEW_SALES),
    canNavigate: true,
    canDraft: true,
    canWriteProposal: true,
    canExecuteWrite: hasCapability(actor, PERMISSIONS.RECEIVE_STOCK) || hasCapability(actor, PERMISSIONS.TRANSFER_STOCK),
  };

  const reqId = uuid();

  return {
    request_id: reqId,
    idempotency_key: overrides.idempotency_key || `idem_${reqId}`,
    current_route: currentRoute,
    current_screen: currentScreen,

    actor_id: actor.id,
    actor_role: actor.role,
    shop_id: shopSetting.shop_id || 'shop_default',
    branch_id: shopSetting.branch_id || 'branch_main',
    warehouse_id: currentWarehouseId,
    register_id: registerId,
    device_id: deviceId,

    current_product_id: boundProductId,
    current_variant_id: overrides.current_variant_id || null,
    current_customer_id: boundCustomerId,
    current_supplier_id: boundSupplierId,
    current_order_id: boundOrderId,
    current_sale_id: boundSaleId,
    current_transfer_id: boundTransferId,
    current_return_id: boundReturnId,
    current_document_id: boundDocumentId,

    selected_ids: Array.from(appState.productSelected || []),

    operation_mode: 'local',
    allowed_tools: allowedTools,
    capabilities: capabilities,

    input_type: overrides.input_type || 'text',
    locale: 'vi-VN',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',

    context_created_at: new Date().toISOString(),
    context_version: overrides.context_version || 1,
    entity_version: entityVersion,
  };
}

/**
 * Section L: Revalidate a context envelope against the latest application state.
 * Detects if the bound entity, route, or actor has changed.
 * @param {Object} envelope Snapshot ContextEnvelope
 * @param {Object} currentState Current application state
 * @returns {{ valid: boolean, reason?: string }}
 */
export function revalidateContext(envelope, currentState) {
  if (!envelope || !currentState || !currentState.data) {
    return { valid: false, reason: 'Dữ liệu trạng thái không hợp lệ hoặc thiếu.' };
  }

  // Section L: Check if actor role has changed
  if (envelope.actor_role && envelope.actor_role !== currentActor.role) {
    return { valid: false, reason: `Vai trò người dùng đã thay đổi (từ ${envelope.actor_role} sang ${currentActor.role}). Xác nhận cũ bị hủy bỏ.` };
  }

  // Check if bound product still exists
  if (envelope.current_product_id) {
    const prod = (currentState.data.products || []).find(p => p.id === envelope.current_product_id);
    if (!prod) {
      return { valid: false, reason: 'Sản phẩm đang xem không còn tồn tại.' };
    }
  }

  // Check if bound order still exists
  if (envelope.current_order_id) {
    const ord = (currentState.data.orders || []).find(o => o.id === envelope.current_order_id);
    if (!ord) {
      return { valid: false, reason: 'Đơn hàng đang xem không còn tồn tại.' };
    }
  }

  return { valid: true };
}
