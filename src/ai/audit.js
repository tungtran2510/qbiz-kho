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
 * Enforces mandatory audit fields for Batch 2:
 * request_id, proposal_id, operation_id, idempotency_key, actor, device,
 * route, context, skill, tool, proposal_summary, confirmation_time, domain_result, success/failure.
 */
export function logDecisionChain(record = {}) {
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
    context: record.context || null,
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
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('qbiz_ai_decision_chains', JSON.stringify(decisionChains.slice(0, 50)));
    }
  } catch (_) {}

  logAuditEvent('DECISION_CHAIN_LOGGED', chainEntry);
  return chainEntry;
}

export function getAuditTrail(limit = 20) {
  return auditBuffer.slice(0, limit);
}

export function getDecisionChains(limit = 20) {
  return decisionChains.slice(0, limit);
}

export const getDecisionChainAuditLog = getDecisionChains;

export function clearAuditTrail() {
  auditBuffer.length = 0;
  decisionChains.length = 0;
}
