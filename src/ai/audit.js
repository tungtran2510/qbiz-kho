/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — AUDIT & DEV OBSERVABILITY
 * Maintains an in-memory audit log of all context builds, skill resolutions, proposals, and tool calls.
 * Section S: Full decision chain logging for write operations.
 */

const MAX_AUDIT_ENTRIES = 100;
const STORAGE_KEY_CHAINS = 'qbiz_ai_decision_chains';
const STORAGE_KEY_AUDIT = 'qbiz_ai_audit_trail';

function loadPersistedChains() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_CHAINS);
      if (raw) return JSON.parse(raw);
    }
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(STORAGE_KEY_CHAINS);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}
  return [];
}

function loadPersistedAudit() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_AUDIT);
      if (raw) return JSON.parse(raw);
    }
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(STORAGE_KEY_AUDIT);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}
  return [];
}

const auditBuffer = loadPersistedAudit();
const decisionChains = loadPersistedChains();

export function logAuditEvent(type, details = {}) {
  // Strip any sensitive credentials before logging
  const safeDetails = details && typeof details === 'object' ? { ...details } : { value: details };
  delete safeDetails.apiKey;
  delete safeDetails.geminiKey;
  delete safeDetails.openaiKey;

  const entry = {
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    timestamp: new Date().toISOString(),
    details: safeDetails,
  };

  auditBuffer.unshift(entry);
  if (auditBuffer.length > MAX_AUDIT_ENTRIES) {
    auditBuffer.pop();
  }

  try {
    const serialized = JSON.stringify(auditBuffer.slice(0, 50));
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY_AUDIT, serialized);
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(STORAGE_KEY_AUDIT, serialized);
  } catch (_) {}

  // Dispatch custom event for DEV Context Inspector
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('qbiz:ai:audit', { detail: entry }));
  }

  return entry;
}

/**
 * Section S: Log complete decision chain for write operations.
 * Enforces mandatory audit fields for Batch 2:
 * request_id, proposal_id, operation_id, idempotency_key, actor, device,
 * route, context, skill, tool, proposal_summary, confirmation_time, domain_result, success/failure.
 */
export function logDecisionChain(record = {}) {
  // Strip any credentials from context
  const safeContext = record.context && typeof record.context === 'object' ? { ...record.context } : record.context;
  if (safeContext && typeof safeContext === 'object') {
    delete safeContext.apiKey;
    delete safeContext.geminiKey;
    delete safeContext.openaiKey;
  }

  const chainEntry = {
    id: `chain_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    request_id: record.request_id || null,
    proposal_id: record.proposal_id || null,
    operation_id: record.operation_id || record.operationId || '',
    idempotency_key: record.idempotency_key || record.operation_id || '',
    actor: record.actor || { id: record.who || 'unknown', role: record.role || 'owner' },
    who: record.who || record.actor?.id || 'unknown',
    role: record.role || record.actor?.role || 'owner',
    device: record.device || 'device_local',
    route: record.route || 'unknown',
    context: safeContext || null,
    skill: record.skill || '',
    tool: record.tool || record.domainOperation || '',
    proposal_summary: record.proposal_summary || record.userSaw || record.askedWhat || '',
    confirmation_time: record.confirmation_time || record.confirmedAt || '',
    domain_result: record.domain_result || null,
    success: record.success !== undefined ? Boolean(record.success) : (record.result === 'SUCCEEDED'),
    result: record.result || (record.success ? 'SUCCEEDED' : 'FAILED'),
    provider: record.provider || 'DETERMINISTIC',
    askedWhat: record.askedWhat || '',
    contextVersion: record.contextVersion || 1,
    resolvedAction: record.resolvedAction || record.tool || '',
    userSaw: record.userSaw || record.proposal_summary || '',
    confirmedBy: record.confirmedBy || record.who || '',
    confirmedAt: record.confirmedAt || record.confirmation_time || '',
    revalidationResult: record.revalidationResult || 'PASS',
    domainOperation: record.domainOperation || record.tool || '',
    operationId: record.operationId || record.operation_id || '',
    error: record.error || null,
  };

  decisionChains.unshift(chainEntry);
  if (decisionChains.length > MAX_AUDIT_ENTRIES) {
    decisionChains.pop();
  }

  try {
    const serialized = JSON.stringify(decisionChains.slice(0, 50));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CHAINS, serialized);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_CHAINS, serialized);
    }
  } catch (_) {}

  logAuditEvent('DECISION_CHAIN_LOGGED', chainEntry);
  return chainEntry;
}

export function getAuditTrail(limit = 20) {
  if (!auditBuffer.length) {
    const persisted = loadPersistedAudit();
    if (persisted.length) auditBuffer.push(...persisted);
  }
  return auditBuffer.slice(0, limit);
}

export function getDecisionChains(limit = 20) {
  if (!decisionChains.length) {
    const persisted = loadPersistedChains();
    if (persisted.length) decisionChains.push(...persisted);
  }
  return decisionChains.slice(0, limit);
}

export const getDecisionChainAuditLog = getDecisionChains;

export function clearAuditTrail() {
  auditBuffer.length = 0;
  decisionChains.length = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_CHAINS);
      localStorage.removeItem(STORAGE_KEY_AUDIT);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY_CHAINS);
      sessionStorage.removeItem(STORAGE_KEY_AUDIT);
    }
  } catch (_) {}
}
