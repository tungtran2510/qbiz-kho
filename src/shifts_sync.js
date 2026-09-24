// ==============================================================================
// QBIZ KHO PRODUCTION V1 — GATE 5: SHIFTS, CASH, DEVICES, REGISTERS & AUDIT SYNC
// Spec: CMD_20260925_GATE5_SHIFTS_AUDIT_DEVICES.txt
// ==============================================================================

import { getAll, getOne, put, runTransaction } from './db.js';
import { CONFIG } from './config.js';
import { getSupabaseConfig } from './auth.js';
import { deterministicUuid } from './catalog_sync.js';
import { isUuid } from './inventory_sync.js';
import { hasCapability, ROLES, CAPABILITIES } from './capabilities.js';

export const SHIFTS_SYNC_STATES = {
  NOT_SYNCED: 'NOT_SYNCED',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  CONFLICT: 'CONFLICT',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  ERROR: 'ERROR'
};

export const SHIFT_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED'
};

export const AUDIT_SOURCES = {
  UI: 'UI',
  AI: 'AI',
  SYNC: 'SYNC',
  IMPORT: 'IMPORT',
  SYSTEM: 'SYSTEM'
};

export const AUDIT_RESULTS = {
  SUCCESS: 'SUCCESS',
  DENIED: 'DENIED',
  ERROR: 'ERROR'
};

const SECRET_PATTERNS = [
  /password/i,
  /pwd/i,
  /token/i,
  /secret/i,
  /service[_-]?role/i,
  /key/i,
  /auth/i,
  /bearer/i
];

/**
 * Deeply sanitizes objects to ensure NO secrets, tokens, or credentials leak into audit logs.
 */
export function sanitizeAuditDetails(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeAuditDetails);

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    const isSecretKey = SECRET_PATTERNS.some(p => p.test(key));
    if (isSecretKey) {
      clean[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      clean[key] = sanitizeAuditDetails(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * REST helper with Supabase Authorization headers.
 */
async function cloudFetch(endpoint, { method = 'GET', body = null, token, prefer = 'return=representation' } = {}) {
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
 * Server-derived role verification from authenticated membership.
 */
export async function fetchUserShopRole(shopId, token, userId) {
  if (!shopId || !token || !userId) return null;
  try {
    const rows = await cloudFetch(`memberships?shop_id=eq.${shopId}&user_id=eq.${userId}&status=eq.ACTIVE&select=role`, { token });
    if (rows && rows.length > 0) return rows[0].role;
  } catch (err) {
    console.warn('Không thể kiểm tra role từ Cloud:', err);
  }
  return null;
}

// ==============================================================================
// 1. DEVICE IDENTITY & LIFECYCLE SYNC
// ==============================================================================

/**
 * Ensures a device exists and is registered in Cloud public.devices.
 * Handles deduplication: Re-opening on same device updates last_seen_at without duplicate rows.
 */
export async function ensureCloudDevice({ shopId, deviceId, deviceKey, name, platform, token, userId }) {
  if (!shopId || !deviceId) throw new Error('Thiếu shopId hoặc deviceId khi đăng ký thiết bị.');
  const cloudDeviceId = isUuid(deviceId) ? deviceId : await deterministicUuid('device', deviceId);
  const key = deviceKey || deviceId;

  // Check if device already registered
  const existing = await cloudFetch(`devices?shop_id=eq.${shopId}&id=eq.${cloudDeviceId}&select=id,status,name`, { token });
  if (existing && existing.length > 0) {
    const dev = existing[0];
    if (dev.status === 'DISABLED') {
      return { device: dev, isNew: false, active: false };
    }
    // Update last_seen_at
    const nowIso = new Date().toISOString();
    await cloudFetch(`devices?id=eq.${cloudDeviceId}&shop_id=eq.${shopId}`, {
      method: 'PATCH',
      body: { last_seen_at: nowIso },
      token
    });
    return { device: { ...dev, last_seen_at: nowIso }, isNew: false, active: true };
  }

  // Insert fresh device
  const nowIso = new Date().toISOString();
  const newDevice = {
    id: cloudDeviceId,
    shop_id: shopId,
    device_key: key,
    name: name || `Thiết bị ${cloudDeviceId.slice(0, 8)}`,
    platform: platform || (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'Windows / Web'),
    status: 'ACTIVE',
    first_seen_at: nowIso,
    last_seen_at: nowIso,
    created_by: userId && isUuid(userId) ? userId : null
  };

  await cloudFetch('devices?on_conflict=id', {
    method: 'POST',
    body: [newDevice],
    token,
    prefer: 'resolution=ignore-duplicates'
  });

  // Mirror to local devices store
  await put('devices', {
    id: deviceId,
    device_id: deviceId,
    device_name: newDevice.name,
    platform: newDevice.platform,
    status: 'ACTIVE',
    updated_at: nowIso
  });

  return { device: newDevice, isNew: true, active: true };
}

/**
 * Pull list of all registered devices for shop.
 */
export async function pullDevices({ shopId, token }) {
  if (!shopId || !token) throw new Error('Thiếu shopId hoặc token khi tải danh sách thiết bị.');
  const cloudDevices = await cloudFetch(`devices?shop_id=eq.${shopId}&order=last_seen_at.desc`, { token });
  if (Array.isArray(cloudDevices)) {
    for (const d of cloudDevices) {
      await put('devices', {
        id: d.id,
        device_id: d.id,
        device_name: d.name,
        platform: d.platform,
        status: d.status,
        updated_at: d.last_seen_at
      });
    }
  }
  return cloudDevices || [];
}

/**
 * Owner/Manager disables or revokes a device.
 * Revoked device loses write access while preserving server history.
 */
export async function disableDevice({ shopId, deviceId, token, userId, userRole = 'OWNER' }) {
  if (!shopId || !deviceId || !token) throw new Error('Thiếu tham số vô hiệu hóa thiết bị.');
  const cloudDeviceId = isUuid(deviceId) ? deviceId : await deterministicUuid('device', deviceId);

  // Derive role
  const role = userRole || await fetchUserShopRole(shopId, token, userId) || 'OWNER';
  if (!hasCapability(role, CAPABILITIES.MANAGE_SETTINGS) && role !== ROLES.OWNER && role !== ROLES.MANAGER) {
    const err = new Error('ROLE_DENIED: Chỉ Chủ cửa hàng hoặc Quản lý mới có quyền vô hiệu hóa thiết bị.');
    err.code = 'ROLE_DENIED';
    throw err;
  }

  const nowIso = new Date().toISOString();
  await cloudFetch(`devices?id=eq.${cloudDeviceId}&shop_id=eq.${shopId}`, {
    method: 'PATCH',
    body: { status: 'DISABLED', last_seen_at: nowIso },
    token
  });

  // Update local store
  const localDev = await getOne('devices', deviceId);
  if (localDev) {
    await put('devices', { ...localDev, status: 'DISABLED', updated_at: nowIso });
  }

  // Audit log
  await recordAuditLog({
    shopId,
    userId,
    deviceId: cloudDeviceId,
    entityType: 'device',
    entityId: cloudDeviceId,
    action: 'disable',
    source: AUDIT_SOURCES.UI,
    result: AUDIT_RESULTS.SUCCESS,
    details: { reason: 'Quản trị viên vô hiệu hóa thiết bị' },
    token
  });

  return { success: true, deviceId: cloudDeviceId, status: 'DISABLED' };
}

/**
 * Verify that device is active on Cloud. Throws if revoked.
 */
export async function verifyDeviceActive({ shopId, deviceId, token }) {
  if (!shopId || !deviceId || !token) return true;
  const cloudDeviceId = isUuid(deviceId) ? deviceId : await deterministicUuid('device', deviceId);
  const rows = await cloudFetch(`devices?shop_id=eq.${shopId}&id=eq.${cloudDeviceId}&select=id,status`, { token });
  if (rows && rows.length > 0 && rows[0].status === 'DISABLED') {
    const err = new Error('DEVICE_REVOKED: Thiết bị này đã bị vô hiệu hóa bởi Chủ cửa hàng.');
    err.code = 'DEVICE_REVOKED';
    throw err;
  }
  return true;
}

// ==============================================================================
// 2. REGISTER IDENTITY & LIFECYCLE SYNC
// ==============================================================================

/**
 * Ensures a logical sales counter exists in Cloud public.registers.
 */
export async function ensureCloudRegister({ shopId, registerId, warehouseId, name, token, userId }) {
  if (!shopId || !registerId) throw new Error('Thiếu shopId hoặc registerId khi thiết lập quầy.');
  const cloudRegisterId = isUuid(registerId) ? registerId : await deterministicUuid('register', registerId);

  // Check if register already exists
  const existing = await cloudFetch(`registers?shop_id=eq.${shopId}&id=eq.${cloudRegisterId}&select=id,status,name,warehouse_id`, { token });
  if (existing && existing.length > 0) {
    return { register: existing[0], isNew: false, active: existing[0].status === 'ACTIVE' };
  }

  const cloudWhId = warehouseId ? (isUuid(warehouseId) ? warehouseId : await deterministicUuid('warehouse', warehouseId)) : null;
  const nowIso = new Date().toISOString();
  const newRegister = {
    id: cloudRegisterId,
    shop_id: shopId,
    name: name || 'Quầy chính',
    warehouse_id: cloudWhId,
    status: 'ACTIVE',
    created_at: nowIso
  };

  await cloudFetch('registers?on_conflict=id', {
    method: 'POST',
    body: [newRegister],
    token,
    prefer: 'resolution=ignore-duplicates'
  });

  // Mirror locally
  await put('registers', {
    id: registerId,
    register_id: registerId,
    register_name: newRegister.name,
    warehouse_id: warehouseId,
    status: 'ACTIVE',
    updated_at: nowIso
  });

  return { register: newRegister, isNew: true, active: true };
}

/**
 * Pull all registers for shop from Cloud.
 */
export async function pullRegisters({ shopId, token }) {
  if (!shopId || !token) throw new Error('Thiếu shopId hoặc token khi tải danh sách quầy.');
  const cloudRegisters = await cloudFetch(`registers?shop_id=eq.${shopId}&order=created_at.asc`, { token });
  if (Array.isArray(cloudRegisters)) {
    for (const r of cloudRegisters) {
      await put('registers', {
        id: r.id,
        register_id: r.id,
        register_name: r.name,
        warehouse_id: r.warehouse_id,
        status: r.status,
        created_at: r.created_at
      });
    }
  }
  return cloudRegisters || [];
}

/**
 * Disable a register. Disabled registers cannot open new shifts.
 */
export async function disableRegister({ shopId, registerId, token, userId, userRole = 'OWNER' }) {
  if (!shopId || !registerId || !token) throw new Error('Thiếu tham số vô hiệu hóa quầy.');
  const cloudRegId = isUuid(registerId) ? registerId : await deterministicUuid('register', registerId);

  const role = userRole || await fetchUserShopRole(shopId, token, userId) || 'OWNER';
  if (!hasCapability(role, CAPABILITIES.MANAGE_SETTINGS) && role !== ROLES.OWNER && role !== ROLES.MANAGER) {
    const err = new Error('ROLE_DENIED: Chỉ Chủ cửa hàng hoặc Quản lý mới có quyền vô hiệu hóa quầy.');
    err.code = 'ROLE_DENIED';
    throw err;
  }

  await cloudFetch(`registers?id=eq.${cloudRegId}&shop_id=eq.${shopId}`, {
    method: 'PATCH',
    body: { status: 'DISABLED' },
    token
  });

  // Update local store
  const localReg = await getOne('registers', registerId);
  if (localReg) {
    await put('registers', { ...localReg, status: 'DISABLED' });
  }

  // Audit log
  await recordAuditLog({
    shopId,
    userId,
    entityType: 'register',
    entityId: cloudRegId,
    action: 'disable',
    source: AUDIT_SOURCES.UI,
    result: AUDIT_RESULTS.SUCCESS,
    details: { reason: 'Quản trị viên vô hiệu hóa quầy thu ngân' },
    token
  });

  return { success: true, registerId: cloudRegId, status: 'DISABLED' };
}

/**
 * Verify that register is active on Cloud. Throws if disabled.
 */
export async function verifyRegisterActive({ shopId, registerId, token }) {
  if (!shopId || !registerId || !token) return true;
  const cloudRegId = isUuid(registerId) ? registerId : await deterministicUuid('register', registerId);
  const rows = await cloudFetch(`registers?shop_id=eq.${shopId}&id=eq.${cloudRegId}&select=id,status`, { token });
  if (rows && rows.length > 0 && rows[0].status === 'DISABLED') {
    const err = new Error('REGISTER_DISABLED: Quầy thu ngân đã bị vô hiệu hóa. Không thể mở ca mới.');
    err.code = 'REGISTER_DISABLED';
    throw err;
  }
  return true;
}

// ==============================================================================
// 3. SHIFT LIFECYCLE & CASH RECONCILIATION SYNC
// ==============================================================================

/**
 * Push an opened shift to Supabase Cloud.
 * Enforces role check (Warehouse cannot open shifts).
 * Enforces device active and register active checks.
 * Idempotent: Same operation_id retry returns existing cloud row.
 */
export async function pushShiftOpen({
  shift,
  shopId,
  token,
  userId,
  deviceId,
  registerId,
  operationId,
  userRole = 'CASHIER'
}) {
  if (!shift || !shopId || !token || !userId) throw new Error('Thiếu thông số bắt buộc để mở ca đồng bộ.');

  // 1. Role verification: WAREHOUSE cannot operate cash drawer or open shifts!
  const role = userRole || await fetchUserShopRole(shopId, token, userId) || 'CASHIER';
  if (role === ROLES.WAREHOUSE || !hasCapability(role, CAPABILITIES.MANAGE_SHIFT)) {
    const err = new Error('ROLE_DENIED: Thủ kho không có quyền thao tác ca làm việc hoặc két tiền.');
    err.code = 'ROLE_DENIED';
    throw err;
  }

  const shiftOpId = operationId || shift.operation_id;
  if (!shiftOpId) throw new Error('Thiếu operation_id cho giao dịch mở ca.');

  const devId = deviceId || shift.device_id;
  const regId = registerId || shift.register_id;
  const cloudShiftId = isUuid(shift.id) ? shift.id : await deterministicUuid('shift', shift.id);
  const cloudDeviceId = isUuid(devId) ? devId : await deterministicUuid('device', devId);
  const cloudRegisterId = isUuid(regId) ? regId : await deterministicUuid('register', regId);

  // 2. Active checks
  await verifyDeviceActive({ shopId, deviceId: cloudDeviceId, token });
  await verifyRegisterActive({ shopId, registerId: cloudRegisterId, token });

  // 3. Ensure Device & Register rows exist in Cloud (foreign key constraints)
  await ensureCloudDevice({ shopId, deviceId: cloudDeviceId, token, userId });
  await ensureCloudRegister({ shopId, registerId: cloudRegisterId, token, userId });

  // 4. Idempotency check: Look up by (shop_id, operation_id)
  const existing = await cloudFetch(`shifts?shop_id=eq.${shopId}&operation_id=eq.${shiftOpId}&select=*`, { token });
  if (existing && existing.length > 0) {
    // Already pushed, return existing record
    return { success: true, shift: existing[0], duplicate: true };
  }

  // 5. Insert new shift
  const cloudRow = {
    id: cloudShiftId,
    shop_id: shopId,
    operation_id: shiftOpId,
    register_id: cloudRegisterId,
    user_id: userId,
    device_id: cloudDeviceId,
    opened_at: shift.opened_at || new Date().toISOString(),
    opening_cash: Number(shift.opening_cash || 0),
    status: 'OPEN',
    version: Number(shift.version || 1)
  };

  const inserted = await cloudFetch('shifts', {
    method: 'POST',
    body: [cloudRow],
    token
  });

  // 6. Record audit trail
  await recordAuditLog({
    shopId,
    userId,
    deviceId: cloudDeviceId,
    entityType: 'shift',
    entityId: cloudShiftId,
    action: 'open',
    operationId: shiftOpId,
    source: AUDIT_SOURCES.UI,
    result: AUDIT_RESULTS.SUCCESS,
    details: {
      register_id: cloudRegisterId,
      opening_cash: cloudRow.opening_cash
    },
    token
  });

  // 7. Update local outbox
  const outboxRow = await getOne('outbox', shiftOpId);
  if (outboxRow) {
    await put('outbox', {
      ...outboxRow,
      sync_status: 'SYNCED',
      synced_at: new Date().toISOString()
    });
  }

  return { success: true, shift: inserted?.[0] || cloudRow, duplicate: false };
}

/**
 * Push closed shift with counted cash, expected cash and variance to Supabase Cloud.
 * Idempotent: Retrying close operation returns existing state with DUPLICATE_CASH_ENTRY = 0.
 */
export async function pushShiftClose({
  shift,
  shopId,
  token,
  userId,
  deviceId,
  operationId,
  userRole = 'CASHIER'
}) {
  if (!shift || !shopId || !token || !userId) throw new Error('Thiếu thông số bắt buộc để đóng ca đồng bộ.');

  const role = userRole || await fetchUserShopRole(shopId, token, userId) || 'CASHIER';
  if (!hasCapability(role, CAPABILITIES.MANAGE_SHIFT)) {
    const err = new Error('ROLE_DENIED: Không có quyền đóng ca làm việc.');
    err.code = 'ROLE_DENIED';
    throw err;
  }

  const shiftOpId = operationId || shift.operation_id;
  const cloudShiftId = isUuid(shift.id) ? shift.id : await deterministicUuid('shift', shift.id);
  const devId = deviceId || shift.device_id;
  const cloudDeviceId = isUuid(devId) ? devId : await deterministicUuid('device', devId);

  // Verify device is active
  await verifyDeviceActive({ shopId, deviceId: cloudDeviceId, token });

  // Idempotency: Check if shift already CLOSED on Cloud
  const existing = await cloudFetch(`shifts?shop_id=eq.${shopId}&id=eq.${cloudShiftId}&select=*`, { token });
  if (existing && existing.length > 0 && existing[0].status === 'CLOSED') {
    // Shift is already closed in Cloud. Do NOT duplicate financial effects!
    return { success: true, shift: existing[0], duplicate: true };
  }

  const updatePayload = {
    status: 'CLOSED',
    closed_at: shift.closed_at || new Date().toISOString(),
    counted_cash: Number(shift.counted_cash || 0),
    expected_cash: Number(shift.expected_cash || 0),
    difference: Number(shift.difference || 0),
    summary: shift.summary || {},
    version: Number(shift.version || 2)
  };

  const updated = await cloudFetch(`shifts?id=eq.${cloudShiftId}&shop_id=eq.${shopId}`, {
    method: 'PATCH',
    body: updatePayload,
    token
  });

  // Record audit trail
  await recordAuditLog({
    shopId,
    userId,
    deviceId: cloudDeviceId,
    entityType: 'shift',
    entityId: cloudShiftId,
    action: 'close',
    operationId: shiftOpId,
    source: AUDIT_SOURCES.UI,
    result: AUDIT_RESULTS.SUCCESS,
    details: {
      expected_cash: updatePayload.expected_cash,
      counted_cash: updatePayload.counted_cash,
      difference: updatePayload.difference,
      summary: updatePayload.summary
    },
    token
  });

  // Update local outbox
  if (shiftOpId) {
    const outboxRow = await getOne('outbox', shiftOpId);
    if (outboxRow) {
      await put('outbox', {
        ...outboxRow,
        sync_status: 'SYNCED',
        synced_at: new Date().toISOString()
      });
    }
  }

  return { success: true, shift: updated?.[0] || { ...existing?.[0], ...updatePayload }, duplicate: false };
}

/**
 * Pull shifts from Cloud and mirror into local IndexedDB store.
 * Allows remote Owner/Manager or other registers to see active and closed shifts.
 */
export async function pullShifts({ shopId, token, limit = 50 }) {
  if (!shopId || !token) throw new Error('Thiếu shopId hoặc token khi tải danh sách ca.');
  const cloudShifts = await cloudFetch(`shifts?shop_id=eq.${shopId}&order=opened_at.desc&limit=${limit}`, { token });
  if (Array.isArray(cloudShifts)) {
    for (const cs of cloudShifts) {
      const localShift = {
        id: cs.id,
        shift_id: cs.id,
        shop_id: cs.shop_id,
        operation_id: cs.operation_id,
        register_id: cs.register_id,
        device_id: cs.device_id,
        opened_at: cs.opened_at,
        closed_at: cs.closed_at,
        opening_cash: Number(cs.opening_cash || 0),
        counted_cash: cs.counted_cash !== null ? Number(cs.counted_cash) : null,
        expected_cash: cs.expected_cash !== null ? Number(cs.expected_cash) : null,
        difference: cs.difference !== null ? Number(cs.difference) : null,
        summary: cs.summary,
        status: cs.status,
        version: Number(cs.version || 1),
        source: 'cloud_sync'
      };
      await put('shifts', localShift);
    }
  }
  return cloudShifts || [];
}

/**
 * Calculate expected cash for a shift based strictly on its isolated sales and refunds.
 * Cash from Register A does NOT leak into Register B.
 */
export async function calculateShiftCashSummary({ shiftId, openingCash = 0 }) {
  if (!shiftId) throw new Error('Thiếu shiftId để tính toán sổ tiền ca.');
  const allSales = await getAll('sales');
  const allRefunds = await getAll('refunds');

  const shiftSales = allSales.filter(s => s.shift_id === shiftId);
  const shiftRefunds = allRefunds.filter(r => r.shift_id === shiftId);

  let cashSales = 0;
  for (const s of shiftSales) {
    const payments = Array.isArray(s.payments) && s.payments.length ? s.payments : [
      { method: s.payment_method || 'cash', amount: s.grand_total ?? s.total ?? 0, status: s.payment_status || 'PAID' }
    ];
    for (const p of payments) {
      if (p.method === 'cash') {
        cashSales += Math.max(0, Number(p.amount) || 0);
      }
    }
  }

  let cashRefunds = 0;
  for (const r of shiftRefunds) {
    if (r.method === 'cash' || r.refund_method === 'cash' || !r.method) {
      cashRefunds += Math.max(0, Number(r.amount || r.refund_amount) || 0);
    }
  }

  const expectedCash = Math.max(0, Number(openingCash || 0) + cashSales - cashRefunds);

  return {
    shift_id: shiftId,
    opening_cash: Number(openingCash || 0),
    sales_count: shiftSales.length,
    cash_sales: cashSales,
    refunds_count: shiftRefunds.length,
    cash_refunds: cashRefunds,
    expected_cash: expectedCash
  };
}

// ==============================================================================
// 4. OPERATIONAL AUDIT TRAIL
// ==============================================================================

/**
 * Record an operational audit log entry to Supabase Cloud.
 * Automatically redacts any secret tokens/passwords.
 */
export async function recordAuditLog({
  shopId,
  userId,
  deviceId = null,
  entityType,
  entityId,
  action,
  operationId = null,
  source = AUDIT_SOURCES.UI,
  result = AUDIT_RESULTS.SUCCESS,
  details = {},
  token
}) {
  if (!shopId || !userId || !entityType || !action) return null;

  const sanitized = sanitizeAuditDetails(details);
  const cleanOpId = operationId && isUuid(operationId) ? operationId : null;
  const cleanDevId = deviceId && isUuid(deviceId) ? deviceId : null;

  const logRow = {
    shop_id: shopId,
    user_id: userId,
    device_id: cleanDevId,
    entity_type: entityType,
    entity_id: String(entityId || ''),
    action,
    operation_id: cleanOpId,
    source,
    result,
    details: sanitized,
    created_at: new Date().toISOString()
  };

  try {
    const res = await cloudFetch('audit_logs', {
      method: 'POST',
      body: [logRow],
      token
    });
    return res?.[0] || logRow;
  } catch (err) {
    console.warn('Không thể lưu audit log vào Cloud:', err);
    return null;
  }
}

/**
 * Pull operational audit trail from Supabase Cloud.
 * Role-protected: Only Owner and Manager can read audit logs.
 * Cashier or Warehouse requests are rejected.
 */
export async function pullAuditLogs({ shopId, token, userId, userRole, limit = 50 }) {
  if (!shopId || !token) throw new Error('Thiếu shopId hoặc token khi tải nhật ký kiểm toán.');

  // Derive role
  const role = userRole || (userId ? await fetchUserShopRole(shopId, token, userId) : null) || 'OWNER';
  if (!hasCapability(role, CAPABILITIES.VIEW_AUDIT) && role !== ROLES.OWNER && role !== ROLES.MANAGER) {
    const err = new Error('ROLE_DENIED: Bạn không có quyền truy cập nhật ký kiểm toán (Audit Log).');
    err.code = 'ROLE_DENIED';
    throw err;
  }

  const logs = await cloudFetch(`audit_logs?shop_id=eq.${shopId}&order=created_at.desc&limit=${limit}`, { token });
  return logs || [];
}

// ==============================================================================
// 5. OUTBOX SYNC INTEGRATION
// ==============================================================================

/**
 * Sync shift-related outbox operations (`shift.open`, `shift.close`, etc.).
 */
export async function syncShiftsOutboxOperation({ operationId, shopId, token, userId, deviceId, userRole = 'CASHIER' }) {
  const outboxRow = await getOne('outbox', operationId);
  if (!outboxRow) throw new Error(`Không tìm thấy outbox với operationId: ${operationId}`);

  const payload = outboxRow.payload || {};
  const entityType = outboxRow.entity_type;
  const action = outboxRow.action;

  if (entityType === 'shift' && action === 'open') {
    const shift = payload.shift || (await getOne('shifts', outboxRow.entity_id));
    return await pushShiftOpen({
      shift,
      shopId,
      token,
      userId,
      deviceId: outboxRow.device_id || deviceId,
      registerId: outboxRow.register_id,
      operationId,
      userRole
    });
  }

  if (entityType === 'shift' && action === 'close') {
    const shift = payload.shift || (await getOne('shifts', outboxRow.entity_id));
    return await pushShiftClose({
      shift,
      shopId,
      token,
      userId,
      deviceId: outboxRow.device_id || deviceId,
      operationId,
      userRole
    });
  }

  throw new Error(`Loại entity không hỗ trợ trong shifts outbox: ${entityType}.${action}`);
}

/**
 * Flush all pending shift outbox operations to Cloud.
 */
export async function flushShiftsOutbox({ shopId, token, userId, deviceId, userRole = 'CASHIER' }) {
  const allOutbox = await getAll('outbox');
  const shiftOutbox = allOutbox.filter(row =>
    row.entity_type === 'shift' &&
    (row.sync_status === 'PENDING' || row.sync_status === 'ERROR')
  );

  let synced = 0;
  let errors = 0;

  for (const row of shiftOutbox) {
    try {
      await syncShiftsOutboxOperation({
        operationId: row.operation_id || row.id,
        shopId,
        token,
        userId,
        deviceId,
        userRole
      });
      synced++;
    } catch (err) {
      errors++;
    }
  }

  return { total: shiftOutbox.length, synced, errors };
}

// ==============================================================================
// 6. CLEAN NEW DEVICE BOOTSTRAP
// ==============================================================================

/**
 * Bootstrap an operational session on a clean device:
 * 1. Register device
 * 2. Pull available registers
 * 3. Pull active/recent shifts
 * 4. Pull audit summary if role permits
 */
export async function bootstrapNewDeviceOperations({
  shopId,
  token,
  userId,
  userRole = 'CASHIER',
  deviceKey,
  deviceName,
  defaultWarehouseId = null
}) {
  if (!shopId || !token) throw new Error('Thiếu shopId hoặc token khi khởi tạo thiết bị mới.');

  // 1. Register Device
  const devRes = await ensureCloudDevice({
    shopId,
    deviceId: deviceKey,
    deviceKey,
    name: deviceName,
    token,
    userId
  });

  // 2. Pull registers
  const registers = await pullRegisters({ shopId, token });

  // 3. Pull shifts
  const shifts = await pullShifts({ shopId, token });

  // 4. Pull audit logs if role permits
  let auditLogs = [];
  if (hasCapability(userRole, CAPABILITIES.VIEW_AUDIT) || userRole === ROLES.OWNER || userRole === ROLES.MANAGER) {
    try {
      auditLogs = await pullAuditLogs({ shopId, token, userId, userRole, limit: 10 });
    } catch (err) {
      console.warn('Không thể tải audit log khi bootstrap:', err.message);
    }
  }

  return {
    device: devRes.device,
    registers_count: registers.length,
    shifts_count: shifts.length,
    audit_logs_count: auditLogs.length
  };
}
