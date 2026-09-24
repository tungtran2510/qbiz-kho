// ==============================================================================
// QBIZ KHO PRODUCTION V1 — GATE 4: SALES, ORDERS & RETURNS/REFUNDS SYNC
// Spec: CMD_20260925_GATE4_SALES_ORDERS_RETURNS_SYNC.txt
// ==============================================================================

import { getAll, getOne, put, runTransaction } from './db.js';
import { CONFIG } from './config.js';
import { getSupabaseConfig } from './auth.js';
import { deterministicUuid } from './catalog_sync.js';
import { ensureDeterministicIdMap, isUuid, mapMovementTypeToCloud } from './inventory_sync.js';
import { hasCapability, ROLES, CAPABILITIES } from './capabilities.js';

export const SALES_SYNC_STATES = {
  NOT_SYNCED: 'NOT_SYNCED',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  CONFLICT: 'CONFLICT',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  ERROR: 'ERROR'
};

export const ALLOWED_ORDER_TRANSITIONS = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

/**
 * Validate order state machine transitions strictly.
 * Disallows illegal or backward transitions.
 */
export function validateOrderTransition(currentStatus, nextStatus) {
  const curr = String(currentStatus || 'NEW').toUpperCase();
  const next = String(nextStatus || '').toUpperCase();
  if (curr === next) return true;
  const allowed = ALLOWED_ORDER_TRANSITIONS[curr] || [];
  if (!allowed.includes(next)) {
    const err = new Error(`INVALID_ORDER_TRANSITION: Không thể chuyển trạng thái đơn hàng từ ${curr} sang ${next}.`);
    err.code = 'INVALID_ORDER_TRANSITION';
    err.current = curr;
    err.next = next;
    throw err;
  }
  return true;
}

/**
 * REST helper with authorization header.
 */
async function cloudFetch(endpoint, { method = 'GET', body = null, token, prefer = 'return=representation' }) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) throw new Error('Chưa cấu hình Supabase Cloud.');

  const headers = {
    'apikey': anonKey,
    'Authorization': `Bearer ${token || anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': prefer
  };

  const options = { method, headers };
  if (body !== null) options.body = JSON.stringify(body);

  const res = await fetch(`${url}/rest/v1/${endpoint}`, options);
  if (!res.ok) {
    const errText = await res.text();
    let parsed;
    try { parsed = JSON.parse(errText); } catch { parsed = errText; }
    const err = new Error(`Cloud error [${res.status}]: ${typeof parsed === 'object' ? parsed.message || JSON.stringify(parsed) : parsed}`);
    err.status = res.status;
    err.details = parsed;
    throw err;
  }

  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}

/**
 * Ensures device exists in Cloud before referencing it in sales or movements.
 */
export async function ensureCloudDevice({ shopId, deviceId, token, userId }) {
  if (!shopId || !deviceId || !isUuid(deviceId)) return null;
  try {
    await cloudFetch('devices?on_conflict=id', {
      method: 'POST',
      body: [{
        id: deviceId,
        shop_id: shopId,
        device_key: deviceId,
        name: `Thiết bị ${deviceId.slice(0, 8)}`,
        status: 'ACTIVE',
        created_by: userId && isUuid(userId) ? userId : null,
        last_seen_at: new Date().toISOString()
      }],
      token,
      prefer: 'resolution=ignore-duplicates'
    });
    return deviceId;
  } catch (err) {
    console.warn('[sales_sync] Could not auto-register device in Cloud, fallback device_id=null:', err?.message || err);
    return null;
  }
}

/**
 * Push POS sale operation to Supabase Cloud.
 */
export async function pushSaleOperation({
  sale,
  movements = [],
  levels = [],
  shopId,
  token,
  userId,
  deviceId,
  userRole = 'OWNER'
}) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token.');
  if (!sale) throw new Error('Dữ liệu phiếu bán (sale) là bắt buộc.');

  // 1. Role capability check: SELL capability required
  if (!hasCapability(userRole, CAPABILITIES.SELL)) {
    const err = new Error('CASHIER_DENIED: Bạn không có quyền thực hiện bán hàng (SELL).');
    err.code = 'ROLE_PERMISSION_DENIED';
    throw err;
  }

  const { idMap } = await ensureDeterministicIdMap(shopId);

  const localOpId = String(sale.operation_id || sale.id || '');
  const cloudOpId = isUuid(localOpId) ? localOpId : await deterministicUuid(shopId, `operation:${localOpId}`);
  const cloudSaleId = isUuid(sale.id) ? sale.id : await deterministicUuid(shopId, `sale:${sale.id}`);

  // 2. Check stock availability on Cloud before committing sale
  for (const item of sale.items || []) {
    if (item.type === 'PRODUCT' && item.track_inventory !== false) {
      const pId = item.item_id || item.productId;
      const wId = sale.warehouseId || sale.warehouse_id;
      const cloudProdId = idMap[pId] || pId;
      const cloudWhId = idMap[wId] || wId;
      const reqQty = Number(item.quantity || item.qty || 1);

      const cloudLevels = await cloudFetch(
        `inventory_levels?shop_id=eq.${shopId}&product_id=eq.${cloudProdId}&warehouse_id=eq.${cloudWhId}&select=on_hand,reserved,damaged`,
        { method: 'GET', token }
      );

      const curLevel = Array.isArray(cloudLevels) && cloudLevels.length ? cloudLevels[0] : { on_hand: 0, reserved: 0, damaged: 0 };
      const available = Number(curLevel.on_hand || 0) - Number(curLevel.reserved || 0) - Number(curLevel.damaged || 0);

      if (available < reqQty) {
        const err = new Error(`CONFLICT_INSUFFICIENT_STOCK: Tồn khả dụng trên máy chủ không đủ để xuất bán (Hiện có: ${available}, Cần bán: ${reqQty}).`);
        err.code = 'CONFLICT_INSUFFICIENT_STOCK';
        err.available = available;
        err.required = reqQty;
        throw err;
      }
    }
  }

  // 3. Prepare Cloud Sale Record
  const rawDeviceId = (sale.device_id && isUuid(sale.device_id)) ? sale.device_id : (deviceId && isUuid(deviceId) ? deviceId : null);
  const cloudDeviceId = rawDeviceId ? await ensureCloudDevice({ shopId, deviceId: rawDeviceId, token, userId }) : null;

  const cloudWhId = idMap[sale.warehouseId || sale.warehouse_id] || (isUuid(sale.warehouseId) ? sale.warehouseId : null);
  const cloudSale = {
    id: cloudSaleId,
    shop_id: shopId,
    operation_id: cloudOpId,
    code: sale.code || `POS-${Date.now()}`,
    customer_id: sale.customer_id && isUuid(sale.customer_id) ? sale.customer_id : (sale.customer_id && idMap[sale.customer_id] ? idMap[sale.customer_id] : null),
    warehouse_id: cloudWhId,
    shift_id: sale.shift_id && isUuid(sale.shift_id) ? sale.shift_id : null,
    subtotal: Number(sale.subtotal || 0),
    discount: Number(sale.discount_total || sale.discount || 0),
    grand_total: Number(sale.grand_total || sale.total || 0),
    payment_method: sale.payment_method || 'cash',
    payment_status: sale.payment_status || 'PAID',
    user_id: userId && isUuid(userId) ? userId : null,
    device_id: cloudDeviceId,
    created_at: sale.created_at || sale.createdAt || new Date().toISOString(),
    version: Number(sale.version || 1)
  };

  // 4. Prepare Cloud Sale Items
  const cloudSaleItems = [];
  for (const line of sale.items || []) {
    const pId = line.item_id || line.productId;
    const cloudProdId = idMap[pId] || (isUuid(pId) ? pId : null);
    if (!cloudProdId) continue;

    const itemId = await deterministicUuid(shopId, `sale_item:${cloudSaleId}:${pId}`);
    cloudSaleItems.push({
      id: itemId,
      shop_id: shopId,
      sale_id: cloudSaleId,
      product_id: cloudProdId,
      qty: Number(line.quantity || line.qty || 1),
      price: Number(line.unit_price || line.price || 0),
      total: Number(line.line_total || line.line_subtotal || line.total || 0)
    });
  }

  // 5. Prepare Cloud Movements
  const cloudMovements = [];
  for (const m of movements) {
    const pId = m.productId || m.product_id;
    const wId = m.warehouseId || m.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudMvWhId = idMap[wId] || wId;
    const cloudMvId = isUuid(m.id) ? m.id : await deterministicUuid(shopId, `movement:${m.id || Math.random()}`);

    cloudMovements.push({
      id: cloudMvId,
      shop_id: shopId,
      operation_id: cloudOpId,
      product_id: cloudProdId,
      warehouse_id: cloudMvWhId,
      type: 'SALE',
      qty: Number(m.qty || 0),
      balance_after: m.after?.onHand !== undefined ? Number(m.after.onHand) : null,
      reference: sale.code || 'Bán hàng',
      source: 'pos',
      user_id: userId && isUuid(userId) ? userId : null,
      device_id: cloudDeviceId,
      created_at: m.createdAt || m.created_at || new Date().toISOString()
    });
  }

  // 6. Prepare Cloud Levels
  const cloudLevels = [];
  for (const l of levels) {
    const pId = l.productId || l.product_id;
    const wId = l.warehouseId || l.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudLvlWhId = idMap[wId] || wId;
    const cloudLevelId = isUuid(l.id) ? l.id : await deterministicUuid(shopId, `level:${pId}:${wId}`);

    cloudLevels.push({
      id: cloudLevelId,
      shop_id: shopId,
      product_id: cloudProdId,
      warehouse_id: cloudLvlWhId,
      on_hand: Number(l.onHand !== undefined ? l.onHand : l.on_hand || 0),
      reserved: Number(l.reserved || 0),
      damaged: Number(l.damaged || 0),
      version: Number(l.version || 1),
      updated_at: new Date().toISOString()
    });
  }

  // 7. Atomic Push to Cloud
  // Try PATCH first for sale (if updating payment status or retry)
  const patchRes = await cloudFetch(`sales?shop_id=eq.${shopId}&id=eq.${cloudSaleId}`, {
    method: 'PATCH',
    body: {
      operation_id: cloudOpId,
      payment_status: cloudSale.payment_status,
      version: cloudSale.version
    },
    token,
    prefer: 'return=representation'
  });

  if (!Array.isArray(patchRes) || patchRes.length === 0) {
    await cloudFetch('sales?on_conflict=id', {
      method: 'POST',
      body: [cloudSale],
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudSaleItems.length > 0) {
    await cloudFetch('sale_items?on_conflict=id', {
      method: 'POST',
      body: cloudSaleItems,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudMovements.length > 0) {
    await cloudFetch('inventory_movements?on_conflict=shop_id,operation_id,product_id', {
      method: 'POST',
      body: cloudMovements,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudLevels.length > 0) {
    await cloudFetch('inventory_levels?on_conflict=shop_id,product_id,warehouse_id', {
      method: 'POST',
      body: cloudLevels,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  // 8. Update local outbox row
  try {
    const outboxRow = await getOne('outbox', sale.operation_id || sale.id);
    if (outboxRow) {
      await put('outbox', {
        ...outboxRow,
        sync_status: 'SYNCED',
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  } catch (err) {}

  return {
    success: true,
    sale_id: cloudSaleId,
    operation_id: cloudOpId,
    items_count: cloudSaleItems.length,
    movements_count: cloudMovements.length
  };
}

/**
 * Push Order operation to Supabase Cloud with state transition validation.
 */
export async function pushOrderOperation({
  order,
  movements = [],
  levels = [],
  shopId,
  token,
  userRole = 'OWNER'
}) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token.');
  if (!order) throw new Error('Dữ liệu đơn hàng (order) là bắt buộc.');

  const { idMap } = await ensureDeterministicIdMap(shopId);

  const localOpId = String(order.operation_id || order.id || '');
  const cloudOpId = isUuid(localOpId) ? localOpId : await deterministicUuid(shopId, `operation:${localOpId}`);
  const cloudOrderId = isUuid(order.id) ? order.id : await deterministicUuid(shopId, `order:${order.id}`);

  // Map local status to Cloud CHECK constraint:
  // CHECK (order_state IN ('DRAFT', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'))
  const statusToCloud = {
    NEW: 'DRAFT',
    CONFIRMED: 'CONFIRMED',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
  };
  const targetCloudState = statusToCloud[order.status] || order.status;

  // 1. Fetch current remote order state if present
  const existingOrders = await cloudFetch(`orders?shop_id=eq.${shopId}&id=eq.${cloudOrderId}`, {
    method: 'GET',
    token
  });

  if (Array.isArray(existingOrders) && existingOrders.length > 0) {
    const currentCloudState = existingOrders[0].order_state;
    const currentLocalState = currentCloudState === 'DRAFT' ? 'NEW' : currentCloudState;
    // Validate transition
    validateOrderTransition(currentLocalState, order.status);
  }

  // 2. Prepare Cloud Order Record
  const cloudWhId = idMap[order.warehouseId || order.warehouse_id] || (isUuid(order.warehouseId) ? order.warehouseId : null);
  const cloudOrder = {
    id: cloudOrderId,
    shop_id: shopId,
    operation_id: cloudOpId,
    code: order.code || `DH-${Date.now()}`,
    customer_id: order.customer_id && isUuid(order.customer_id) ? order.customer_id : (order.customer_id && idMap[order.customer_id] ? idMap[order.customer_id] : null),
    order_state: targetCloudState,
    payment_state: order.payment_status || 'UNPAID',
    fulfillment_state: order.status === 'COMPLETED' ? 'FULFILLED' : 'UNFULFILLED',
    grand_total: Number(order.grand_total || order.subtotal || 0),
    created_at: order.created_at || new Date().toISOString(),
    version: Number(order.version || 1)
  };

  // 3. Prepare Cloud Order Items
  const cloudOrderItems = [];
  for (const line of order.items || []) {
    const pId = line.item_id || line.productId;
    const cloudProdId = idMap[pId] || (isUuid(pId) ? pId : null);
    if (!cloudProdId) continue;

    const itemId = await deterministicUuid(shopId, `order_item:${cloudOrderId}:${pId}`);
    cloudOrderItems.push({
      id: itemId,
      shop_id: shopId,
      order_id: cloudOrderId,
      product_id: cloudProdId,
      qty: Number(line.quantity || line.qty || 1),
      price: Number(line.unit_price || line.price || 0),
      total: Number(line.line_total || 0)
    });
  }

  // 4. Prepare Cloud Movements if applicable (e.g. sale movement on complete)
  const cloudMovements = [];
  for (const m of movements) {
    const pId = m.productId || m.product_id;
    const wId = m.warehouseId || m.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudMvWhId = idMap[wId] || wId;
    const cloudMvId = isUuid(m.id) ? m.id : await deterministicUuid(shopId, `movement:${m.id || Math.random()}`);

    cloudMovements.push({
      id: cloudMvId,
      shop_id: shopId,
      operation_id: cloudOpId,
      product_id: cloudProdId,
      warehouse_id: cloudMvWhId,
      type: m.type === 'sale' ? 'SALE' : 'ADJUSTMENT',
      qty: Number(m.qty || 0),
      balance_after: m.after?.onHand !== undefined ? Number(m.after.onHand) : null,
      reference: order.code || 'Đơn hàng',
      source: 'pos',
      created_at: m.createdAt || m.created_at || new Date().toISOString()
    });
  }

  // 5. Prepare Cloud Levels
  const cloudLevels = [];
  for (const l of levels) {
    const pId = l.productId || l.product_id;
    const wId = l.warehouseId || l.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudLvlWhId = idMap[wId] || wId;
    const cloudLevelId = isUuid(l.id) ? l.id : await deterministicUuid(shopId, `level:${pId}:${wId}`);

    cloudLevels.push({
      id: cloudLevelId,
      shop_id: shopId,
      product_id: cloudProdId,
      warehouse_id: cloudLvlWhId,
      on_hand: Number(l.onHand !== undefined ? l.onHand : l.on_hand || 0),
      reserved: Number(l.reserved || 0),
      damaged: Number(l.damaged || 0),
      version: Number(l.version || 1),
      updated_at: new Date().toISOString()
    });
  }

  // 6. Push Order to Cloud: PATCH existing or POST new
  const patchRes = await cloudFetch(`orders?shop_id=eq.${shopId}&id=eq.${cloudOrderId}`, {
    method: 'PATCH',
    body: {
      order_state: cloudOrder.order_state,
      payment_state: cloudOrder.payment_state,
      fulfillment_state: cloudOrder.fulfillment_state,
      operation_id: cloudOpId,
      version: cloudOrder.version
    },
    token,
    prefer: 'return=representation'
  });

  if (!Array.isArray(patchRes) || patchRes.length === 0) {
    await cloudFetch('orders?on_conflict=id', {
      method: 'POST',
      body: [cloudOrder],
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudOrderItems.length > 0) {
    await cloudFetch('order_items?on_conflict=id', {
      method: 'POST',
      body: cloudOrderItems,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudMovements.length > 0) {
    await cloudFetch('inventory_movements?on_conflict=shop_id,operation_id,product_id', {
      method: 'POST',
      body: cloudMovements,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudLevels.length > 0) {
    await cloudFetch('inventory_levels?on_conflict=shop_id,product_id,warehouse_id', {
      method: 'POST',
      body: cloudLevels,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  // 7. Update local outbox row
  try {
    const outboxRow = await getOne('outbox', order.operation_id || order.id);
    if (outboxRow) {
      await put('outbox', {
        ...outboxRow,
        sync_status: 'SYNCED',
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  } catch (err) {}

  return {
    success: true,
    order_id: cloudOrderId,
    operation_id: cloudOpId,
    state: cloudOrder.order_state
  };
}

/**
 * Push Return & Refund operation to Supabase Cloud.
 */
export async function pushReturnOperation({
  returnDoc,
  refundDoc,
  movements = [],
  levels = [],
  shopId,
  token,
  userRole = 'OWNER'
}) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token.');
  if (!returnDoc) throw new Error('Dữ liệu trả hàng (returnDoc) là bắt buộc.');

  // 1. Role capability check: PROCESS_RETURN
  if (!hasCapability(userRole, CAPABILITIES.PROCESS_RETURN)) {
    const err = new Error('CASHIER_DENIED: Bạn không có quyền xử lý trả hàng (PROCESS_RETURN).');
    err.code = 'ROLE_PERMISSION_DENIED';
    throw err;
  }

  const { idMap } = await ensureDeterministicIdMap(shopId);

  const localOpId = String(returnDoc.operation_id || returnDoc.id || '');
  const cloudOpId = isUuid(localOpId) ? localOpId : await deterministicUuid(shopId, `operation:${localOpId}`);
  const cloudReturnId = isUuid(returnDoc.id) ? returnDoc.id : await deterministicUuid(shopId, `return:${returnDoc.id}`);
  const cloudSaleId = isUuid(returnDoc.sale_id) ? returnDoc.sale_id : await deterministicUuid(shopId, `sale:${returnDoc.sale_id}`);

  // 2. Validate original sale exists on Cloud
  const origSales = await cloudFetch(`sales?shop_id=eq.${shopId}&id=eq.${cloudSaleId}`, {
    method: 'GET',
    token
  });
  if (!Array.isArray(origSales) || origSales.length === 0) {
    throw new Error('Giao dịch gốc (sale) chưa tồn tại trên Cloud.');
  }

  // 3. Prepare Cloud Return
  const cloudWhId = idMap[returnDoc.warehouse_id] || (isUuid(returnDoc.warehouse_id) ? returnDoc.warehouse_id : origSales[0].warehouse_id);
  const cloudReturn = {
    id: cloudReturnId,
    shop_id: shopId,
    operation_id: cloudOpId,
    sale_id: cloudSaleId,
    warehouse_id: cloudWhId,
    total_refund: Number(returnDoc.refund_amount || 0),
    refund_method: returnDoc.refund_method || 'original',
    lines: returnDoc.lines || [],
    created_at: returnDoc.created_at || new Date().toISOString(),
    version: Number(returnDoc.version || 1)
  };

  // 4. Prepare Cloud Refund if applicable
  let cloudRefund = null;
  if (refundDoc && Number(refundDoc.amount || 0) > 0) {
    const cloudRefundId = isUuid(refundDoc.id) ? refundDoc.id : await deterministicUuid(shopId, `refund:${refundDoc.id}`);
    cloudRefund = {
      id: cloudRefundId,
      shop_id: shopId,
      operation_id: cloudOpId,
      sale_id: cloudSaleId,
      return_id: cloudReturnId,
      shift_id: refundDoc.shift_id && isUuid(refundDoc.shift_id) ? refundDoc.shift_id : null,
      amount: Number(refundDoc.amount || 0),
      method: refundDoc.method || 'cash',
      created_at: refundDoc.created_at || new Date().toISOString(),
      version: Number(refundDoc.version || 1)
    };
  }

  // 5. Prepare Cloud Movements (restocking returned items)
  const cloudMovements = [];
  for (const m of movements) {
    const pId = m.productId || m.product_id;
    const wId = m.warehouseId || m.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudMvWhId = idMap[wId] || wId;
    const cloudMvId = isUuid(m.id) ? m.id : await deterministicUuid(shopId, `movement:${m.id || Math.random()}`);

    cloudMovements.push({
      id: cloudMvId,
      shop_id: shopId,
      operation_id: cloudOpId,
      product_id: cloudProdId,
      warehouse_id: cloudMvWhId,
      type: 'RETURN',
      qty: Number(m.qty || 0),
      balance_after: m.after?.onHand !== undefined ? Number(m.after.onHand) : null,
      reference: returnDoc.reason || 'Trả hàng',
      source: 'pos',
      created_at: m.createdAt || m.created_at || new Date().toISOString()
    });
  }

  // 6. Prepare Cloud Levels
  const cloudLevels = [];
  for (const l of levels) {
    const pId = l.productId || l.product_id;
    const wId = l.warehouseId || l.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudLvlWhId = idMap[wId] || wId;
    const cloudLevelId = isUuid(l.id) ? l.id : await deterministicUuid(shopId, `level:${pId}:${wId}`);

    cloudLevels.push({
      id: cloudLevelId,
      shop_id: shopId,
      product_id: cloudProdId,
      warehouse_id: cloudLvlWhId,
      on_hand: Number(l.onHand !== undefined ? l.onHand : l.on_hand || 0),
      reserved: Number(l.reserved || 0),
      damaged: Number(l.damaged || 0),
      version: Number(l.version || 1),
      updated_at: new Date().toISOString()
    });
  }

  // 7. Atomic Push
  await cloudFetch('returns?on_conflict=id', {
    method: 'POST',
    body: [cloudReturn],
    token,
    prefer: 'resolution=merge-duplicates,return=representation'
  });

  if (cloudRefund) {
    await cloudFetch('refunds?on_conflict=id', {
      method: 'POST',
      body: [cloudRefund],
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudMovements.length > 0) {
    await cloudFetch('inventory_movements?on_conflict=shop_id,operation_id,product_id', {
      method: 'POST',
      body: cloudMovements,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  if (cloudLevels.length > 0) {
    await cloudFetch('inventory_levels?on_conflict=shop_id,product_id,warehouse_id', {
      method: 'POST',
      body: cloudLevels,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  // 8. Update local outbox row
  try {
    const outboxRow = await getOne('outbox', returnDoc.operation_id || returnDoc.id);
    if (outboxRow) {
      await put('outbox', {
        ...outboxRow,
        sync_status: 'SYNCED',
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  } catch (err) {}

  return {
    success: true,
    return_id: cloudReturnId,
    refund_id: cloudRefund?.id || null,
    operation_id: cloudOpId
  };
}

/**
 * Pull sales, orders, returns, and refunds from Supabase Cloud to local IndexedDB.
 * Deduplicates by ID/operation_id to ensure DUPLICATE_REVENUE = 0 and DUPLICATE_REFUND = 0.
 */
export async function pullSalesAndOrders({ shopId, token, sinceTimestamp = null }) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token.');

  const { reverseMap } = await ensureDeterministicIdMap(shopId);

  // 1. Fetch Cloud Records
  let salesEndpoint = `sales?shop_id=eq.${shopId}&order=created_at.asc`;
  let ordersEndpoint = `orders?shop_id=eq.${shopId}&order=created_at.asc`;
  let returnsEndpoint = `returns?shop_id=eq.${shopId}&order=created_at.asc`;
  let refundsEndpoint = `refunds?shop_id=eq.${shopId}&order=created_at.asc`;

  if (sinceTimestamp) {
    salesEndpoint += `&created_at=gt.${sinceTimestamp}`;
    ordersEndpoint += `&created_at=gt.${sinceTimestamp}`;
    returnsEndpoint += `&created_at=gt.${sinceTimestamp}`;
    refundsEndpoint += `&created_at=gt.${sinceTimestamp}`;
  }

  const [cloudSales, cloudOrders, cloudReturns, cloudRefunds] = await Promise.all([
    cloudFetch(salesEndpoint, { method: 'GET', token }),
    cloudFetch(ordersEndpoint, { method: 'GET', token }),
    cloudFetch(returnsEndpoint, { method: 'GET', token }),
    cloudFetch(refundsEndpoint, { method: 'GET', token })
  ]);

  // Also fetch sale_items & order_items for complete line recreation
  const [cloudSaleItems, cloudOrderItems] = await Promise.all([
    cloudFetch(`sale_items?shop_id=eq.${shopId}`, { method: 'GET', token }),
    cloudFetch(`order_items?shop_id=eq.${shopId}`, { method: 'GET', token })
  ]);

  const saleItemsMap = new Map();
  for (const item of cloudSaleItems || []) {
    const list = saleItemsMap.get(item.sale_id) || [];
    list.push(item);
    saleItemsMap.set(item.sale_id, list);
  }

  const orderItemsMap = new Map();
  for (const item of cloudOrderItems || []) {
    const list = orderItemsMap.get(item.order_id) || [];
    list.push(item);
    orderItemsMap.set(item.order_id, list);
  }

  // 2. Fetch Local Records to Avoid Duplicates & Load Reference info
  const [localSales, localOrders, localReturns, localRefunds, localProducts, localWarehouses] = await Promise.all([
    getAll('sales'),
    getAll('orders'),
    getAll('returns'),
    getAll('refunds'),
    getAll('products'),
    getAll('warehouses')
  ]);

  const prodMap = new Map((localProducts || []).map(p => [p.id, p]));
  const defaultWhId = (localWarehouses.find(w => w.is_default || w.id === 'wh_center') || localWarehouses[0])?.id || 'wh_center';

  const existingSaleKeys = new Set();
  for (const s of localSales) {
    existingSaleKeys.add(s.id);
    if (s.operation_id) existingSaleKeys.add(s.operation_id);
    if (s.code) existingSaleKeys.add(s.code);
  }

  const existingOrderKeys = new Set();
  for (const o of localOrders) {
    existingOrderKeys.add(o.id);
    if (o.operation_id) existingOrderKeys.add(o.operation_id);
    if (o.code) existingOrderKeys.add(o.code);
  }

  const existingReturnKeys = new Set();
  for (const r of localReturns) {
    existingReturnKeys.add(r.id);
    if (r.operation_id) existingReturnKeys.add(r.operation_id);
  }

  const existingRefundKeys = new Set();
  for (const ref of localRefunds) {
    existingRefundKeys.add(ref.id);
    if (ref.operation_id) existingRefundKeys.add(ref.operation_id);
  }

  let appliedSales = 0;
  let appliedOrders = 0;
  let appliedReturns = 0;
  let appliedRefunds = 0;

  await runTransaction(['sales', 'orders', 'returns', 'refunds'], stores => {
    // Apply remote sales
    for (const cs of cloudSales || []) {
      if (existingSaleKeys.has(cs.id) || existingSaleKeys.has(cs.operation_id) || existingSaleKeys.has(cs.code)) {
        continue; // Already applied locally, DO NOT post revenue twice
      }

      const items = (saleItemsMap.get(cs.id) || []).map(line => {
        const localProdId = reverseMap[line.product_id] || line.product_id;
        const p = prodMap.get(localProdId);
        return {
          item_id: localProdId,
          productId: localProdId,
          name: p?.name || 'Sản phẩm',
          sku: p?.sku || '',
          quantity: Number(line.qty || 1),
          unit_price: Number(line.price || 0),
          line_total: Number(line.total || 0)
        };
      });

      const localWhId = reverseMap[cs.warehouse_id] || cs.warehouse_id;
      const localSale = {
        id: cs.id,
        sale_uuid: cs.id,
        code: cs.code,
        operation_id: cs.operation_id,
        warehouseId: localWhId,
        warehouse_id: localWhId,
        subtotal: Number(cs.subtotal || 0),
        discount_total: Number(cs.discount || 0),
        grand_total: Number(cs.grand_total || 0),
        total: Number(cs.grand_total || 0),
        payment_method: cs.payment_method || 'cash',
        payment_status: cs.payment_status || 'PAID',
        status: 'COMPLETED',
        created_at: cs.created_at,
        createdAt: cs.created_at,
        version: Number(cs.version || 1),
        items,
        source: 'cloud_sync'
      };

      stores.sales.put(localSale);
      existingSaleKeys.add(cs.id);
      existingSaleKeys.add(cs.operation_id);
      appliedSales++;
    }

    // Apply remote orders
    for (const co of cloudOrders || []) {
      const localStatus = co.order_state === 'DRAFT' ? 'NEW' : co.order_state;

      const localExisting = localOrders.find(o => o.id === co.id || o.operation_id === co.operation_id || (co.code && o.code === co.code));
      if (localExisting) {
        // If remote version is newer or status has transitioned, update local order
        const updatedItems = (localExisting.items || []).map(line => {
          const held = Number(line.reserved_qty || line.quantity);
          const reservedQty = (localStatus === 'CONFIRMED' || localStatus === 'PROCESSING') ? held : 0;
          return { ...line, reserved_qty: reservedQty };
        });
        const updated = {
          ...localExisting,
          status: localStatus,
          payment_status: co.payment_state || localExisting.payment_status || 'UNPAID',
          grand_total: Number(co.grand_total || localExisting.grand_total || 0),
          items: updatedItems,
          version: Math.max(Number(localExisting.version || 1), Number(co.version || 1)),
          updated_at: co.created_at || new Date().toISOString()
        };
        stores.orders.put(updated);
        appliedOrders++;
        continue;
      }

      const items = (orderItemsMap.get(co.id) || []).map(line => {
        const localProdId = reverseMap[line.product_id] || line.product_id;
        const p = prodMap.get(localProdId);
        const qty = Number(line.qty || 1);
        const reservedQty = (localStatus === 'CONFIRMED' || localStatus === 'PROCESSING') ? qty : 0;
        return {
          item_id: localProdId,
          productId: localProdId,
          type: p?.type || 'PRODUCT',
          track_inventory: p ? p.trackInventory !== false : true,
          name: p?.name || 'Sản phẩm',
          sku: p?.sku || '',
          quantity: qty,
          unit_price: Number(line.price || 0),
          discount: 0,
          line_total: Number(line.total || 0),
          warehouse_id: defaultWhId,
          location_id: defaultWhId,
          reserved_qty: reservedQty,
          reservation_id: ''
        };
      });

      const localOrder = {
        id: co.id,
        order_uuid: co.id,
        code: co.code,
        operation_id: co.operation_id,
        status: localStatus,
        payment_status: co.payment_state || 'UNPAID',
        warehouseId: defaultWhId,
        location_id: defaultWhId,
        customer_label: 'Khách lẻ',
        grand_total: Number(co.grand_total || 0),
        subtotal: Number(co.grand_total || 0),
        created_at: co.created_at,
        updated_at: co.created_at,
        version: Number(co.version || 1),
        items,
        source: 'cloud_sync'
      };

      stores.orders.put(localOrder);
      existingOrderKeys.add(co.id);
      existingOrderKeys.add(co.operation_id);
      appliedOrders++;
    }

    // Apply remote returns
    for (const cr of cloudReturns || []) {
      if (existingReturnKeys.has(cr.id) || existingReturnKeys.has(cr.operation_id)) {
        continue;
      }

      const localReturn = {
        id: cr.id,
        return_id: cr.id,
        sale_id: cr.sale_id,
        warehouse_id: reverseMap[cr.warehouse_id] || cr.warehouse_id,
        refund_amount: Number(cr.total_refund || 0),
        refund_method: cr.refund_method,
        lines: cr.lines || [],
        status: 'CONFIRMED',
        created_at: cr.created_at,
        operation_id: cr.operation_id,
        version: Number(cr.version || 1),
        source: 'cloud_sync'
      };

      stores.returns.put(localReturn);
      existingReturnKeys.add(cr.id);
      existingReturnKeys.add(cr.operation_id);
      appliedReturns++;
    }

    // Apply remote refunds
    for (const cref of cloudRefunds || []) {
      if (existingRefundKeys.has(cref.id) || existingRefundKeys.has(cref.operation_id)) {
        continue;
      }

      const localRefund = {
        id: cref.id,
        return_id: cref.return_id,
        sale_id: cref.sale_id,
        amount: Number(cref.amount || 0),
        method: cref.method || 'cash',
        status: 'RECORDED',
        created_at: cref.created_at,
        operation_id: cref.operation_id,
        version: Number(cref.version || 1),
        source: 'cloud_sync'
      };

      stores.refunds.put(localRefund);
      existingRefundKeys.add(cref.id);
      existingRefundKeys.add(cref.operation_id);
      appliedRefunds++;
    }
  });

  return {
    applied_sales: appliedSales,
    applied_orders: appliedOrders,
    applied_returns: appliedReturns,
    applied_refunds: appliedRefunds
  };
}

/**
 * Sync an existing sales/orders/returns/refunds outbox operation to Supabase Cloud.
 */
export async function syncSalesOutboxOperation({ operationId, shopId, token, userId, deviceId, userRole = 'OWNER' }) {
  const outboxRow = await getOne('outbox', operationId);
  if (!outboxRow) throw new Error(`Không tìm thấy outbox với operationId: ${operationId}`);

  const payload = outboxRow.payload || {};
  const entityType = outboxRow.entity_type;
  const action = outboxRow.action;

  try {
    if (entityType === 'sale') {
      const sale = payload.sale || (await getOne('sales', outboxRow.entity_id));
      const movements = payload.inventory_movements || [];
      const allLevels = await getAll('levels');
      const affectedKeys = new Set(movements.map(m => `${m.productId || m.product_id}:${m.warehouseId || m.warehouse_id}`));
      const levels = allLevels.filter(l => affectedKeys.has(`${l.productId}:${l.warehouseId}`));

      return await pushSaleOperation({
        sale,
        movements,
        levels,
        shopId,
        token,
        userId,
        deviceId,
        userRole
      });
    }

    if (entityType === 'order') {
      const order = payload.order || (await getOne('orders', outboxRow.entity_id));
      const movements = payload.inventory_movements || [];
      const allLevels = await getAll('levels');
      const affectedKeys = new Set(movements.map(m => `${m.productId || m.product_id}:${m.warehouseId || m.warehouse_id}`));
      const levels = allLevels.filter(l => affectedKeys.has(`${l.productId}:${l.warehouseId}`));

      return await pushOrderOperation({
        order,
        movements,
        levels,
        shopId,
        token,
        userRole
      });
    }

    if (entityType === 'return') {
      const returnDoc = payload.return || (await getOne('returns', outboxRow.entity_id));
      const refundDoc = payload.refund || (await getOne('refunds', `${outboxRow.entity_id}:refund`));
      const movements = payload.inventory_movements || [];
      const allLevels = await getAll('levels');
      const affectedKeys = new Set(movements.map(m => `${m.productId || m.product_id}:${m.warehouseId || m.warehouse_id}`));
      const levels = allLevels.filter(l => affectedKeys.has(`${l.productId}:${l.warehouseId}`));

      return await pushReturnOperation({
        returnDoc,
        refundDoc,
        movements,
        levels,
        shopId,
        token,
        userRole
      });
    }

    throw new Error(`Loại entity không hỗ trợ trong sales outbox: ${entityType}`);
  } catch (err) {
    if (err.code === 'CONFLICT_INSUFFICIENT_STOCK') {
      // Mark outbox row as NEEDS_REVIEW so local transaction is preserved and not deleted
      await put('outbox', {
        ...outboxRow,
        sync_status: 'NEEDS_REVIEW',
        error_message: err.message,
        updated_at: new Date().toISOString()
      });
    }
    throw err;
  }
}

/**
 * Flush all pending sales/orders/returns/refunds outbox operations to Cloud.
 */
export async function flushSalesOutbox({ shopId, token, userId, deviceId, userRole = 'OWNER' }) {
  const allOutbox = await getAll('outbox');
  const salesOutbox = allOutbox.filter(row =>
    ['sale', 'order', 'return', 'refund'].includes(row.entity_type) &&
    (row.sync_status === 'PENDING' || row.sync_status === 'ERROR')
  );

  let synced = 0;
  let conflicts = 0;
  let errors = 0;

  for (const row of salesOutbox) {
    try {
      await syncSalesOutboxOperation({
        operationId: row.operation_id || row.id,
        shopId,
        token,
        userId,
        deviceId,
        userRole
      });
      synced++;
    } catch (err) {
      if (err.code === 'CONFLICT_INSUFFICIENT_STOCK') {
        conflicts++;
      } else {
        errors++;
      }
    }
  }

  return { total: salesOutbox.length, synced, conflicts, errors };
}

/**
 * Bootstrap Sales & Orders for a new clean device.
 */
export async function bootstrapNewDeviceSales({ shopId, token }) {
  return pullSalesAndOrders({ shopId, token });
}
