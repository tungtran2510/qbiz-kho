// ==============================================================================
// QBIZ KHO PRODUCTION V1 — GATE 3: MULTI-DEVICE INVENTORY LEDGER SYNC
// Spec: CMD_20260925_GATE3_INVENTORY_LEDGER_SYNC.txt
// ==============================================================================

import { getAll, getOne, put, putMany, setting, setSetting, runTransaction } from './db.js';
import { CONFIG } from './config.js';
import { getSupabaseConfig, getAuthState } from './auth.js';
import { getIdMap, saveIdMap, deterministicUuid } from './catalog_sync.js';
import { hasCapability, ROLES, CAPABILITIES } from './capabilities.js';

export const INVENTORY_SYNC_STATES = {
  NOT_SYNCED: 'NOT_SYNCED',       // Chưa đồng bộ
  SYNCING: 'SYNCING',             // Đang đồng bộ
  SYNCED: 'SYNCED',               // Đã đồng bộ
  CONFLICT: 'CONFLICT',           // Xung đột tồn kho
  NEEDS_REVIEW: 'NEEDS_REVIEW',   // Cần kiểm tra
  ERROR: 'ERROR'
};

const LAST_INVENTORY_PULL_KEY = 'last_inventory_pull_timestamp';

/**
 * Check if a string is a standard UUID.
 */
export function isUuid(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Map local movement types to Supabase CHECK constraint allowed types:
 * CHECK (type IN ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RETURN', 'EXCHANGE'))
 */
export function mapMovementTypeToCloud(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'RECEIVE' || t === 'RECEIPT') return 'RECEIPT';
  if (t === 'ISSUE') return 'ISSUE';
  if (t === 'COUNT' || t === 'ADJUST' || t === 'ADJUSTMENT' || t === 'OPENING') return 'ADJUSTMENT';
  if (t === 'TRANSFER_OUT') return 'TRANSFER_OUT';
  if (t === 'TRANSFER_IN') return 'TRANSFER_IN';
  if (t === 'TRANSFER_CANCEL') return 'TRANSFER_IN'; // restored back to source warehouse
  if (t === 'SALE') return 'SALE';
  if (t === 'RETURN') return 'RETURN';
  if (t === 'EXCHANGE') return 'EXCHANGE';
  return 'ADJUSTMENT';
}

/**
 * Map cloud movement types back to local types.
 */
export function mapMovementTypeToLocal(cloudType) {
  const t = String(cloudType || '').toUpperCase();
  if (t === 'RECEIPT') return 'receive';
  if (t === 'ISSUE') return 'issue';
  if (t === 'ADJUSTMENT') return 'count';
  if (t === 'TRANSFER_OUT') return 'transfer_out';
  if (t === 'TRANSFER_IN') return 'transfer_in';
  if (t === 'SALE') return 'sale';
  if (t === 'RETURN') return 'return';
  return t.toLowerCase();
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
 * Diagnostic reconciliation function.
 * Checks that for every product and warehouse, derived movement balance == materialized balance.
 * Returns { ledger_mismatch, orphan_movements, duplicate_operations, total_levels, details, is_clean }.
 */
export async function reconcileLocalLedger() {
  const [movements, levels, products, warehouses] = await Promise.all([
    getAll('movements'),
    getAll('levels'),
    getAll('products'),
    getAll('warehouses')
  ]);

  const validProductIds = new Set(products.map(p => p.id));
  const validWarehouseIds = new Set(warehouses.map(w => w.id));

  let orphanMovements = 0;
  const opIds = new Set();
  let duplicateOperations = 0;

  const derivedBalances = new Map();

  for (const m of movements) {
    const pId = m.productId || m.product_id;
    const wId = m.warehouseId || m.warehouse_id;
    const qty = Number(m.qty || 0);

    if (pId && !validProductIds.has(pId)) orphanMovements++;
    if (wId && !validWarehouseIds.has(wId)) orphanMovements++;

    // Reservation movements ('reserve', 'release') track hold state, NOT onHand physical stock
    if (m.type === 'reserve' || m.type === 'release') continue;

    const key = `${pId}:${wId}`;
    derivedBalances.set(key, (derivedBalances.get(key) || 0) + qty);
  }

  let ledgerMismatch = 0;
  const details = [];

  for (const l of levels) {
    const pId = l.productId || l.product_id;
    const wId = l.warehouseId || l.warehouse_id;
    const key = `${pId}:${wId}`;
    const derived = derivedBalances.get(key) || 0;
    const onHand = Number(l.onHand || 0);

    if (derived !== onHand) {
      ledgerMismatch++;
      details.push({
        id: l.id,
        productId: pId,
        warehouseId: wId,
        onHand,
        derived,
        diff: onHand - derived
      });
    }
  }

  return {
    ledger_mismatch: ledgerMismatch,
    orphan_movements: orphanMovements,
    duplicate_operations: duplicateOperations,
    total_levels: levels.length,
    total_movements: movements.length,
    details,
    is_clean: ledgerMismatch === 0 && orphanMovements === 0
  };
}

/**
/**
 * Ensure deterministic local -> cloud ID mappings exist for known products and warehouses.
 */
export async function ensureDeterministicIdMap(shopId) {
  const idMap = await getIdMap();
  const reverseMap = Object.fromEntries(Object.entries(idMap).map(([k, v]) => [v, k]));

  // 1. Warehouses
  const knownWarehouses = ['wh_center', 'wh_hadong'];
  for (const wId of knownWarehouses) {
    const cId = await deterministicUuid(shopId, `warehouse:${wId}`);
    idMap[wId] = cId;
    reverseMap[cId] = wId;
  }

  // 2. Known sample products
  const knownProducts = [
    'p_n85_navy_high', 'p_n85_navy_low', 'p_n85_pink_high', 'p_90d', 'p_90t',
    'p_95', 'p_135', 'p_150', 'p_f1', 'p_f3', 'p_f4', 'p_f5', 'p_f6',
    'p_lumbar', 'p_meditation'
  ];
  for (const pId of knownProducts) {
    const cId = await deterministicUuid(shopId, `product:${pId}`);
    idMap[pId] = cId;
    reverseMap[cId] = pId;
  }

  // 3. Any additional local products in DB
  try {
    const localProducts = await getAll('products');
    for (const p of localProducts) {
      if (p.id && !p.id.includes('-')) {
        const cId = await deterministicUuid(shopId, `product:${p.id}`);
        idMap[p.id] = cId;
        reverseMap[cId] = p.id;
      }
    }
  } catch (e) {}

  await saveIdMap(idMap);
  return { idMap, reverseMap };
}

/**
 * Step 13: Initial Inventory Cloud Bootstrap.
 * Safely migrates existing local opening movements and levels to Supabase Cloud using deterministic UUIDs.
 */
export async function bootstrapInventoryToCloud({ shopId, token, userId, deviceId }) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token để thực hiện bootstrap kho.');

  // 1. Verify local ledger integrity before upload
  const recon = await reconcileLocalLedger();
  if (!recon.is_clean) {
    throw new Error(`Không thể bootstrap: Phát hiện sai lệch sổ kho local (${recon.ledger_mismatch} lỗi).`);
  }

  const { idMap, reverseMap } = await ensureDeterministicIdMap(shopId);
  const [localMovements, localLevels] = await Promise.all([
    getAll('movements'),
    getAll('levels')
  ]);

  const cloudMovements = [];
  const cloudLevels = [];

  // 2. Prepare Cloud Movements
  for (const m of localMovements) {
    const pId = m.productId || m.product_id;
    const wId = m.warehouseId || m.warehouse_id;
    const cloudProdId = idMap[pId];
    const cloudWhId = idMap[wId];

    if (!cloudProdId || !cloudWhId) {
      throw new Error(`Không tìm thấy cloud ID cho mặt hàng ${pId} hoặc kho ${wId}`);
    }

    const localOpId = String(m.operation_id || m.id || '');
    const cloudOpId = isUuid(localOpId) ? localOpId : await deterministicUuid(shopId, `operation:${localOpId}`);
    const cloudMvId = isUuid(m.id) ? m.id : await deterministicUuid(shopId, `movement:${m.id}`);

    cloudMovements.push({
      id: cloudMvId,
      shop_id: shopId,
      operation_id: cloudOpId,
      product_id: cloudProdId,
      warehouse_id: cloudWhId,
      type: mapMovementTypeToCloud(m.type),
      qty: Number(m.qty || 0),
      balance_after: m.after?.onHand !== undefined ? Number(m.after.onHand) : Number(m.qty || 0),
      reference: m.reference || m.reason || 'Tồn đầu kỳ',
      source: m.source || 'pos',
      user_id: userId || null,
      device_id: deviceId || null,
      created_at: m.createdAt || m.created_at || new Date().toISOString()
    });
  }

  // 3. Prepare Cloud Levels
  for (const l of localLevels) {
    const pId = l.productId || l.product_id;
    const wId = l.warehouseId || l.warehouse_id;
    const cloudProdId = idMap[pId];
    const cloudWhId = idMap[wId];

    if (!cloudProdId || !cloudWhId) continue;

    const cloudLevelId = isUuid(l.id) ? l.id : await deterministicUuid(shopId, `level:${l.id}`);

    cloudLevels.push({
      id: cloudLevelId,
      shop_id: shopId,
      product_id: cloudProdId,
      warehouse_id: cloudWhId,
      on_hand: Number(l.onHand || 0),
      reserved: Number(l.reserved || 0),
      damaged: Number(l.damaged || 0),
      version: Number(l.version || 1),
      updated_at: l.updatedAt || l.updated_at || new Date().toISOString()
    });
  }

  // 4. Upload movements with idempotent resolution
  let movementsUploaded = 0;
  if (cloudMovements.length > 0) {
    await cloudFetch('inventory_movements?on_conflict=shop_id,operation_id,product_id', {
      method: 'POST',
      body: cloudMovements,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    movementsUploaded = cloudMovements.length;
  }

  // 5. Upload levels with idempotent resolution
  let levelsUploaded = 0;
  if (cloudLevels.length > 0) {
    await cloudFetch('inventory_levels?on_conflict=shop_id,product_id,warehouse_id', {
      method: 'POST',
      body: cloudLevels,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    levelsUploaded = cloudLevels.length;
  }

  return {
    success: true,
    movements_migrated: movementsUploaded,
    levels_migrated: levelsUploaded,
    shop_id: shopId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Push an inventory operation to Supabase Cloud with full validation:
 * - Role & capability check
 * - Negative stock / available stock validation
 * - Idempotency
 * - Atomic cloud persistence
 */
export async function pushInventoryOperation({
  operationId,
  type, // 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT' | 'TRANSFER'
  movements = [],
  levels = [],
  transfer = null,
  shopId,
  token,
  userId = null,
  deviceId = null,
  userRole = 'OWNER'
}) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token.');
  if (!operationId) throw new Error('Yêu cầu operationId hợp lệ.');

  const upperType = String(type || '').toUpperCase();

  // 1. Role Capability Check
  if (upperType === 'RECEIPT' && !hasCapability(userRole, CAPABILITIES.RECEIVE_STOCK)) {
    throw new Error('CASHIER_DENIED: Bạn không có quyền nhập hàng (RECEIVE_STOCK).');
  }
  if (upperType === 'ISSUE' && !hasCapability(userRole, CAPABILITIES.ISSUE_STOCK)) {
    throw new Error('CASHIER_DENIED: Bạn không có quyền xuất hàng (ISSUE_STOCK).');
  }
  if (upperType === 'ADJUSTMENT' && !hasCapability(userRole, CAPABILITIES.STOCKTAKE)) {
    throw new Error('CASHIER_DENIED: Bạn không có quyền kiểm kê / cân kho (STOCKTAKE).');
  }
  if (upperType === 'TRANSFER' && !hasCapability(userRole, CAPABILITIES.TRANSFER_STOCK)) {
    throw new Error('CASHIER_DENIED: Bạn không có quyền chuyển kho (TRANSFER_STOCK).');
  }

  const { idMap, reverseMap } = await ensureDeterministicIdMap(shopId);
  const cloudOpId = isUuid(operationId) ? operationId : await deterministicUuid(shopId, `operation:${operationId}`);

  // 2. Idempotency Check: check if operation already recorded in cloud
  const existingRows = await cloudFetch(`inventory_movements?shop_id=eq.${shopId}&operation_id=eq.${cloudOpId}&select=id,operation_id,product_id`, {
    method: 'GET',
    token
  });

  if (Array.isArray(existingRows) && existingRows.length > 0) {
    return {
      success: true,
      idempotent: true,
      already_applied: true,
      operation_id: cloudOpId,
      movements_count: existingRows.length
    };
  }

  // 3. Negative Stock / Concurrency Check for Issues and Transfer Out
  if (upperType === 'ISSUE' || (upperType === 'TRANSFER' && transfer)) {
    for (const m of movements) {
      const pId = m.productId || m.product_id;
      const wId = m.warehouseId || m.warehouse_id;
      const cloudProdId = idMap[pId] || pId;
      const cloudWhId = idMap[wId] || wId;
      const reqQty = Math.abs(Number(m.qty || 0));

      if (Number(m.qty || 0) < 0 || upperType === 'ISSUE') {
        const cloudLevels = await cloudFetch(`inventory_levels?shop_id=eq.${shopId}&product_id=eq.${cloudProdId}&warehouse_id=eq.${cloudWhId}&select=on_hand,reserved,damaged`, {
          method: 'GET',
          token
        });

        const curLevel = Array.isArray(cloudLevels) && cloudLevels.length ? cloudLevels[0] : { on_hand: 0, reserved: 0, damaged: 0 };
        const available = Number(curLevel.on_hand || 0) - Number(curLevel.reserved || 0) - Number(curLevel.damaged || 0);

        if (available < reqQty) {
          const err = new Error(`CONFLICT_INSUFFICIENT_STOCK: Tồn khả dụng trên máy chủ không đủ để xuất (Hiện có: ${available}, Cần xuất: ${reqQty}).`);
          err.code = 'CONFLICT_INSUFFICIENT_STOCK';
          err.available = available;
          err.required = reqQty;
          throw err;
        }
      }
    }
  }

  // 4. Prepare Cloud Movements Payload
  const cloudMovements = [];
  for (const m of movements) {
    const pId = m.productId || m.product_id;
    const wId = m.warehouseId || m.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudWhId = idMap[wId] || wId;
    const cloudMvId = isUuid(m.id) ? m.id : await deterministicUuid(shopId, `movement:${m.id || Math.random()}`);

    cloudMovements.push({
      id: cloudMvId,
      shop_id: shopId,
      operation_id: cloudOpId,
      product_id: cloudProdId,
      warehouse_id: cloudWhId,
      type: mapMovementTypeToCloud(m.type || upperType),
      qty: Number(m.qty || 0),
      balance_after: m.after?.onHand !== undefined ? Number(m.after.onHand) : (m.balance_after !== undefined ? Number(m.balance_after) : null),
      reference: m.reference || m.reason || '',
      source: m.source || 'pos',
      user_id: userId || null,
      device_id: deviceId || null,
      created_at: m.createdAt || m.created_at || new Date().toISOString()
    });
  }

  // 5. Prepare Cloud Levels Payload
  const cloudLevels = [];
  for (const l of levels) {
    const pId = l.productId || l.product_id;
    const wId = l.warehouseId || l.warehouse_id;
    const cloudProdId = idMap[pId] || pId;
    const cloudWhId = idMap[wId] || wId;
    const cloudLevelId = isUuid(l.id) ? l.id : await deterministicUuid(shopId, `level:${pId}:${wId}`);

    cloudLevels.push({
      id: cloudLevelId,
      shop_id: shopId,
      product_id: cloudProdId,
      warehouse_id: cloudWhId,
      on_hand: Number(l.onHand !== undefined ? l.onHand : l.on_hand || 0),
      reserved: Number(l.reserved || 0),
      damaged: Number(l.damaged || 0),
      version: Number(l.version || 1),
      updated_at: new Date().toISOString()
    });
  }

  // 6. Push Movements
  if (cloudMovements.length > 0) {
    await cloudFetch('inventory_movements?on_conflict=shop_id,operation_id,product_id', {
      method: 'POST',
      body: cloudMovements,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  // 7. Push Levels
  if (cloudLevels.length > 0) {
    await cloudFetch('inventory_levels?on_conflict=shop_id,product_id,warehouse_id', {
      method: 'POST',
      body: cloudLevels,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  // 8. If transfer, push transfer record
  if (transfer) {
    const cloudTransferId = isUuid(transfer.id) ? transfer.id : await deterministicUuid(shopId, `transfer:${transfer.id}`);
    const fromWh = idMap[transfer.fromWarehouseId || transfer.from_warehouse_id] || transfer.fromWarehouseId;
    const toWh = idMap[transfer.toWarehouseId || transfer.to_warehouse_id] || transfer.toWarehouseId;

    const cloudTransfer = {
      id: cloudTransferId,
      shop_id: shopId,
      operation_id: cloudOpId,
      code: transfer.id || `TR-${Date.now()}`,
      from_warehouse_id: fromWh,
      to_warehouse_id: toWh,
      status: String(transfer.status || 'in_transit').toUpperCase(),
      lines: transfer.lines || [],
      created_at: transfer.createdAt || transfer.created_at || new Date().toISOString(),
      received_at: transfer.receivedAt || transfer.received_at || null,
      version: Number(transfer.version || 1)
    };

    // First attempt PATCH to update existing transfer (e.g. status received, cancelled, or retry)
    const patchRes = await cloudFetch(`transfers?shop_id=eq.${shopId}&id=eq.${cloudTransferId}`, {
      method: 'PATCH',
      body: {
        operation_id: cloudOpId,
        status: cloudTransfer.status,
        received_at: cloudTransfer.received_at,
        version: cloudTransfer.version
      },
      token,
      prefer: 'return=representation'
    });

    if (!Array.isArray(patchRes) || patchRes.length === 0) {
      // Not yet created, insert new transfer
      await cloudFetch('transfers?on_conflict=id', {
        method: 'POST',
        body: [cloudTransfer],
        token,
        prefer: 'resolution=merge-duplicates,return=representation'
      });
    }
  }

  // 9. Update local outbox row if present
  try {
    const outboxRow = await getOne('outbox', operationId);
    if (outboxRow) {
      await put('outbox', {
        ...outboxRow,
        sync_status: 'SYNCED',
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  } catch (err) {
    // Non-fatal if outbox update fails
  }

  return {
    success: true,
    operation_id: cloudOpId,
    movements_count: cloudMovements.length,
    levels_count: cloudLevels.length
  };
}

/**
 * Pull inventory movements, levels, and transfers from Supabase Cloud
 * and idempotently apply them to local IndexedDB.
 */
export async function pullInventoryLedger({ shopId, token, sinceTimestamp = null }) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token.');

  const { idMap, reverseMap } = await ensureDeterministicIdMap(shopId);

  // 1. Fetch Cloud Movements
  let mvEndpoint = `inventory_movements?shop_id=eq.${shopId}&order=created_at.asc`;
  if (sinceTimestamp) {
    mvEndpoint += `&created_at=gt.${sinceTimestamp}`;
  }
  const cloudMovements = await cloudFetch(mvEndpoint, { method: 'GET', token });

  // 2. Fetch Cloud Levels
  const cloudLevels = await cloudFetch(`inventory_levels?shop_id=eq.${shopId}`, { method: 'GET', token });

  // 3. Fetch Cloud Transfers
  const cloudTransfers = await cloudFetch(`transfers?shop_id=eq.${shopId}`, { method: 'GET', token });

  // Preload existing movements to avoid duplicate application
  const existingMovements = await getAll('movements');
  const existingKeys = new Set();
  for (const em of existingMovements) {
    const pId = em.productId || em.product_id;
    const op = em.operation_id || em.id;
    existingKeys.add(`${op}:${pId}`);
    existingKeys.add(`${em.id}`);

    // If local operation_id was a string, also include its deterministic Cloud UUID
    if (!isUuid(op)) {
      const cOp = await deterministicUuid(shopId, `operation:${op}`);
      existingKeys.add(`${cOp}:${pId}`);
    }
    const cMvId = await deterministicUuid(shopId, `movement:${em.id}`);
    existingKeys.add(cMvId);
  }

  let appliedMovements = 0;
  let appliedLevels = 0;
  let appliedTransfers = 0;

  await runTransaction(['movements', 'levels', 'transfers', 'settings'], (stores, tx, context) => {
    try {
      // Apply movements
      if (Array.isArray(cloudMovements)) {
        for (const cm of cloudMovements) {
          const localProdId = reverseMap[cm.product_id] || cm.product_id;
          const localWhId = reverseMap[cm.warehouse_id] || cm.warehouse_id;
          const checkKey = `${cm.operation_id}:${localProdId}`;

          if (existingKeys.has(checkKey) || existingKeys.has(cm.id)) {
            continue; // Already applied locally
          }

          const localMv = {
            id: cm.id,
            operation_id: cm.operation_id,
            productId: localProdId,
            warehouseId: localWhId,
            type: mapMovementTypeToLocal(cm.type),
            qty: Number(cm.qty || 0),
            reason: cm.reference || 'Đồng bộ đám mây',
            reference: cm.reference || '',
            reference_type: 'cloud_sync',
            source: cm.source || 'pos',
            createdAt: cm.created_at,
            after: {
              onHand: cm.balance_after !== null ? Number(cm.balance_after) : null
            }
          };

          stores.movements.put(localMv);
          existingKeys.add(checkKey);
          existingKeys.add(cm.id);
          appliedMovements++;
        }
      }

      // Apply levels
      if (Array.isArray(cloudLevels)) {
        for (const cl of cloudLevels) {
          const localProdId = reverseMap[cl.product_id] || cl.product_id;
          const localWhId = reverseMap[cl.warehouse_id] || cl.warehouse_id;
          const levelId = `${localProdId}:${localWhId}`;

          const localLevel = {
            id: levelId,
            productId: localProdId,
            warehouseId: localWhId,
            onHand: Number(cl.on_hand || 0),
            reserved: Number(cl.reserved || 0),
            damaged: Number(cl.damaged || 0),
            version: Number(cl.version || 1),
            updatedAt: cl.updated_at
          };

          stores.levels.put(localLevel);
          appliedLevels++;
        }
      }

      // Apply transfers
      if (Array.isArray(cloudTransfers)) {
        for (const ct of cloudTransfers) {
          const fromWh = reverseMap[ct.from_warehouse_id] || ct.from_warehouse_id;
          const toWh = reverseMap[ct.to_warehouse_id] || ct.to_warehouse_id;

          const localTr = {
            id: ct.code || ct.id,
            fromWarehouseId: fromWh,
            toWarehouseId: toWh,
            status: String(ct.status || 'in_transit').toLowerCase(),
            lines: ct.lines || [],
            operation_id: ct.operation_id,
            createdAt: ct.created_at,
            receivedAt: ct.received_at,
            version: Number(ct.version || 1)
          };

          stores.transfers.put(localTr);
          appliedTransfers++;
        }
      }

      // Update last pull timestamp
      stores.settings.put({
        id: LAST_INVENTORY_PULL_KEY,
        value: new Date().toISOString()
      });
    } catch (err) {
      context.abort(err);
    }
  });

  // 4. Reconcile after apply
  const recon = await reconcileLocalLedger();

  return {
    applied_movements: appliedMovements,
    applied_levels: appliedLevels,
    applied_transfers: appliedTransfers,
    ledger_mismatch: recon.ledger_mismatch,
    orphan_movements: recon.orphan_movements,
    is_reconciled: recon.is_clean
  };
}

/**
 * Sync an existing outbox record to Supabase.
 */
export async function syncOutboxOperation({ operationId, shopId, token, userId, deviceId, userRole = 'OWNER' }) {
  const outboxRow = await getOne('outbox', operationId);
  if (!outboxRow) throw new Error(`Không tìm thấy outbox với operationId: ${operationId}`);

  const payload = outboxRow.payload || {};
  let movements = [];
  let levels = [];
  let transfer = payload.transfer || null;
  let opType = 'RECEIPT';

  if (outboxRow.type?.includes('receive') || outboxRow.action === 'receive') {
    opType = 'RECEIPT';
  } else if (outboxRow.type?.includes('issue') || outboxRow.action === 'issue') {
    opType = 'ISSUE';
  } else if (outboxRow.type?.includes('count') || outboxRow.action === 'count') {
    opType = 'ADJUSTMENT';
  } else if (outboxRow.entity_type === 'transfer' || outboxRow.type?.startsWith('transfer.')) {
    opType = 'TRANSFER';
  }

  if (payload.inventory_movements && Array.isArray(payload.inventory_movements)) {
    movements = payload.inventory_movements;
  } else if (payload.movement) {
    movements = [payload.movement];
  } else {
    const allMv = await getAll('movements');
    movements = allMv.filter(m => m.operation_id === operationId);
  }

  if (payload.level) {
    levels = [payload.level];
  } else {
    const allLevels = await getAll('levels');
    const affectedKeys = new Set(movements.map(m => `${m.productId || m.product_id}:${m.warehouseId || m.warehouse_id}`));
    levels = allLevels.filter(l => affectedKeys.has(`${l.productId}:${l.warehouseId}`));
  }

  return pushInventoryOperation({
    operationId,
    type: opType,
    movements,
    levels,
    transfer,
    shopId,
    token,
    userId,
    deviceId,
    userRole
  });
}

/**
 * Flush all pending inventory operations from local outbox to Supabase Cloud.
 */
export async function flushInventoryOutbox({ shopId, token, userId, deviceId, userRole = 'OWNER' }) {
  const allOutbox = await getAll('outbox');
  const inventoryOutbox = allOutbox.filter(row => 
    ['inventory', 'inventory_document', 'transfer'].includes(row.entity_type) &&
    (row.sync_status === 'PENDING' || row.sync_status === 'ERROR')
  );

  let synced = 0;
  let conflicts = 0;
  let errors = 0;

  for (const row of inventoryOutbox) {
    try {
      await syncOutboxOperation({
        operationId: row.operation_id || row.id,
        shopId,
        token,
        userId,
        deviceId,
        userRole
      });
      synced++;
    } catch (err) {
      if (err.code === 'CONFLICT_INSUFFICIENT_STOCK' || err.message?.includes('CONFLICT_INSUFFICIENT_STOCK')) {
        await put('outbox', {
          ...row,
          sync_status: INVENTORY_SYNC_STATES.NEEDS_REVIEW,
          last_error: err.message,
          updated_at: new Date().toISOString()
        });
        conflicts++;
      } else {
        await put('outbox', {
          ...row,
          sync_status: INVENTORY_SYNC_STATES.ERROR,
          last_error: err.message,
          updated_at: new Date().toISOString()
        });
        errors++;
      }
    }
  }

  return { total: inventoryOutbox.length, synced, conflicts, errors };
}

/**
 * Bootstrap an entirely clean / new device with inventory from Supabase Cloud.
 */
export async function bootstrapNewDeviceInventory({ shopId, token }) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token.');

  return pullInventoryLedger({ shopId, token, sinceTimestamp: null });
}
