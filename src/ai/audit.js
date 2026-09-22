/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — AUDIT & DEV OBSERVABILITY
 * Maintains an in-memory audit log of all context builds, skill resolutions, proposals, and tool calls.
 * Section S: Full decision chain logging for write operations.
 */

const MAX_AUDIT_ENTRIES = 100;
const auditBuffer = [];
const decisionChains = [];

export function logAuditEvent(type, details = {}) {
  const entry = {
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    timestamp: new Date().toISOString(),
    details,
  };

  auditBuffer.unshift(entry);
  if (auditBuffer.length > MAX_AUDIT_ENTRIES) {
    auditBuffer.pop();
  }

  // Dispatch custom event for DEV Context Inspector
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qbiz:ai:audit', { detail: entry }));
  }

  return entry;
}

/**
 * Section S: Log complete decision chain for write operations.
 */
export function logDecisionChain(record = {}) {
  const chainEntry = {
    id: `chain_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    who: record.who || 'unknown',
    role: record.role || 'owner',
    askedWhat: record.askedWhat || '',
    contextVersion: record.contextVersion || 1,
    resolvedAction: record.resolvedAction || '',
    userSaw: record.userSaw || '',
    confirmedBy: record.confirmedBy || '',
    confirmedAt: record.confirmedAt || '',
    revalidationResult: record.revalidationResult || 'PASS',
    domainOperation: record.domainOperation || '',
    operationId: record.operationId || '',
    result: record.result || 'UNKNOWN',
    error: record.error || null,
  };

  decisionChains.unshift(chainEntry);
  if (decisionChains.length > MAX_AUDIT_ENTRIES) {
    decisionChains.pop();
  }

  logAuditEvent('DECISION_CHAIN_LOGGED', chainEntry);
  return chainEntry;
}

export function getAuditTrail(limit = 20) {
  return auditBuffer.slice(0, limit);
}

export function getDecisionChains(limit = 20) {
  return decisionChains.slice(0, limit);
}

export function clearAuditTrail() {
  auditBuffer.length = 0;
  decisionChains.length = 0;
}
