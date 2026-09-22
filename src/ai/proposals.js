/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — STRUCTURED PROPOSALS & EXECUTION
 * Strict Batch 2 Safety Addendum:
 * - Strict Proposal State Machine with transition guards
 * - Immutable Proposal Fingerprinting & Confirmation Tampering Defense
 * - Business-Grade Idempotency Cache (direct duplicate protection)
 * - Domain Execution (TOCTOU Defense — domain engine checks invariants at commit)
 * - Post-Write Ledger Reconciliation Verification
 * - Expiration TTL enforcement
 */

import { levelFor, available } from '../engine.js';
import { evaluateRisk, validateQuantityAndUnit, validateWarehouseScope, ALLOWED_WRITE_ACTIONS, hasCapability, PERMISSIONS } from './policy.js';
import { revalidateContext } from './context.js';
import { logAuditEvent, logDecisionChain } from './audit.js';

export const PROPOSAL_STATUS = {
  DRAFT: 'DRAFT',
  NEEDS_CLARIFICATION: 'NEEDS_CLARIFICATION',
  READY: 'READY',
  CONFIRMED: 'CONFIRMED',
  EXECUTING: 'EXECUTING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

// Section D: Strict Proposal State Machine Transition Map
const ALLOWED_TRANSITIONS = {
  [PROPOSAL_STATUS.DRAFT]: new Set([
    PROPOSAL_STATUS.NEEDS_CLARIFICATION,
    PROPOSAL_STATUS.READY,
    PROPOSAL_STATUS.CANCELLED,
  ]),
  [PROPOSAL_STATUS.NEEDS_CLARIFICATION]: new Set([
    PROPOSAL_STATUS.READY,
    PROPOSAL_STATUS.CANCELLED,
  ]),
  [PROPOSAL_STATUS.READY]: new Set([
    PROPOSAL_STATUS.CONFIRMED,
    PROPOSAL_STATUS.CANCELLED,
    PROPOSAL_STATUS.EXPIRED,
  ]),
  [PROPOSAL_STATUS.CONFIRMED]: new Set([
    PROPOSAL_STATUS.EXECUTING,
    PROPOSAL_STATUS.CANCELLED,
    PROPOSAL_STATUS.READY, // Allowed if parameters tampered after confirmation
    PROPOSAL_STATUS.EXPIRED,
  ]),
  [PROPOSAL_STATUS.EXECUTING]: new Set([
    PROPOSAL_STATUS.SUCCEEDED,
    PROPOSAL_STATUS.FAILED,
  ]),
  // Terminal states (cannot transition further)
  [PROPOSAL_STATUS.SUCCEEDED]: new Set([]),
  [PROPOSAL_STATUS.FAILED]: new Set([]),
  [PROPOSAL_STATUS.EXPIRED]: new Set([]),
  [PROPOSAL_STATUS.CANCELLED]: new Set([]),
};

// Section B: In-Memory Business-Grade Idempotency Cache
// Maps idempotency_key -> { proposalId, status, result, timestamp }
const IDEMPOTENCY_CACHE = new Map();

// Section X: Write Gate Flag (Enabled for Batch 2 once all safety checks are active)
let writeGateEnabled = true;

export function setWriteGate(enabled) {
  writeGateEnabled = Boolean(enabled);
}

export function isWriteGateEnabled() {
  return writeGateEnabled;
}

const uid = () => `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * Section C: Compute Immutable Execution Fingerprint.
 * Produces a deterministic string hash of critical proposal parameters.
 * If any of these fields change after confirmation, the fingerprint breaks.
 */
export function computeProposalFingerprint(proposal) {
  if (!proposal) return '';
  const params = proposal.parameters || {};
  // Deterministic parameter sorting
  const sortedParamKeys = Object.keys(params).sort();
  const sortedParams = {};
  for (const k of sortedParamKeys) {
    sortedParams[k] = params[k];
  }

  const parts = [
    proposal.id || '',
    proposal.skill_id || '',
    proposal.intent || '',
    proposal.actor_id || '',
    proposal.shop_id || '',
    proposal.warehouse_id || '',
    JSON.stringify(proposal.entities || {}),
    JSON.stringify(sortedParams),
    proposal.risk_level || '',
    proposal.context_version || 1,
  ];

  // Deterministic string representation
  return parts.join('|');
}

/**
 * Section D Guard: Transition proposal state strictly according to state machine.
 * Throws error if transition is disallowed.
 */
export function transitionProposal(proposal, nextStatus, meta = {}) {
  if (!proposal) throw new Error('Proposal không tồn tại.');
  const current = proposal.status;

  if (current === nextStatus) return proposal; // No-op

  const allowedNext = ALLOWED_TRANSITIONS[current];
  if (!allowedNext || !allowedNext.has(nextStatus)) {
    const err = `Chuyển trạng thái bất hợp lệ: từ "${current}" sang "${nextStatus}". Vi phạm State Machine Guard.`;
    logAuditEvent('INVALID_STATE_TRANSITION', { proposalId: proposal.id, from: current, to: nextStatus });
    throw new Error(err);
  }

  proposal.status = nextStatus;
  proposal.updated_at = new Date().toISOString();
  if (meta.reason) proposal.transition_reason = meta.reason;

  logAuditEvent('PROPOSAL_STATE_TRANSITION', { proposalId: proposal.id, from: current, to: nextStatus });
  return proposal;
}

/**
 * Section K: Check Proposal Expiry against TTL policy.
 */
export function isProposalExpired(proposal) {
  if (!proposal) return true;
  if (proposal.status === PROPOSAL_STATUS.EXPIRED) return true;
  if (proposal.expires_at && Date.now() > Date.parse(proposal.expires_at)) {
    try {
      transitionProposal(proposal, PROPOSAL_STATUS.EXPIRED, { reason: 'Proposal TTL expired.' });
    } catch {
      proposal.status = PROPOSAL_STATUS.EXPIRED;
    }
    return true;
  }
  return false;
}

/**
 * Factory for creating a StructuredProposal.
 * @param {Object} options
 * @returns {Object} StructuredProposal
 */
export function createProposal({
  requestId,
  skillId,
  intent,
  entities = {},
  parameters = {},
  humanSummary = '',
  contextSnapshot = null,
  inventorySnapshot = null,
  actor = { id: 'user_active', role: 'owner' },
  ttlSeconds = 600, // 10 minutes default (Section K)
  status = PROPOSAL_STATUS.READY,
}) {
  const risk = evaluateRisk(intent, parameters, contextSnapshot);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

  const proposal = {
    id: uid(),
    request_id: requestId || null,
    skill_id: skillId || null,
    intent: intent || 'unknown',
    risk_level: risk.riskLevel,
    actor_id: actor.id || 'user_active',
    actor_role: actor.role || 'owner',
    shop_id: contextSnapshot?.shop_id || 'shop_default',
    warehouse_id: parameters.warehouseId || parameters.fromWarehouseId || contextSnapshot?.warehouse_id || '',
    entities: entities,
    parameters: parameters,
    human_summary: humanSummary,
    required_confirmation: risk.requiresConfirmation,
    validation_state: {
      isValid: true,
      errors: [],
      warnings: [],
    },
    context_snapshot: contextSnapshot,
    context_version: contextSnapshot?.context_version || 1,
    inventory_snapshot: inventorySnapshot,
    isStale: false,
    created_at: createdAt,
    expires_at: expiresAt,
    status: status,
    confirmation_fingerprint: null,
    confirmed_by: null,
    confirmed_at: null,
    execution_result: null,
  };

  return proposal;
}

/**
 * Validate a StructuredProposal before confirmation or execution.
 * Checks TTL expiration, entity integrity, parameters, and warehouse scope.
 * @param {Object} proposal
 * @param {Object} currentState Current application state
 * @param {Object} [actor] Current actor context
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateProposal(proposal, currentState, actor = { role: 'owner' }) {
  const errors = [];
  const warnings = [];

  if (!proposal) {
    return { valid: false, errors: ['Đề xuất không tồn tại.'], warnings };
  }

  // 1. Check expiration (Section K)
  if (isProposalExpired(proposal)) {
    errors.push('Đề xuất đã hết hạn (expired). Hãy tạo đề xuất mới.');
    return { valid: false, errors, warnings };
  }

  // 2. Revalidate context snapshot if present (Section L)
  if (proposal.context_snapshot) {
    const ctxCheck = revalidateContext(proposal.context_snapshot, currentState);
    if (!ctxCheck.valid) {
      errors.push(`Ngữ cảnh đã thay đổi: ${ctxCheck.reason}`);
    }
  }

  // 3. Section G: Quantity & Unit Validation
  const { parameters = {}, intent } = proposal;
  if (intent === 'create_receipt_proposal' || intent === 'RECEIVE_STOCK') {
    if (!parameters.productId) errors.push('Thiếu mã sản phẩm cần nhập.');
    
    const prod = (currentState?.data?.products || []).find(p => p.id === parameters.productId);
    const qtyCheck = validateQuantityAndUnit({
      qty: parameters.qty,
      unit: parameters.unit,
      product: prod,
    });
    if (!qtyCheck.valid) errors.push(qtyCheck.error);

    // Section H: Warehouse Scope
    const scopeCheck = validateWarehouseScope(actor, parameters.warehouseId, null, null, currentState);
    if (!scopeCheck.allowed) errors.push(scopeCheck.error);

  } else if (intent === 'create_transfer_proposal' || intent === 'TRANSFER_STOCK') {
    if (!parameters.fromWarehouseId || !parameters.toWarehouseId) errors.push('Thiếu kho xuất hoặc kho nhận.');
    if (parameters.fromWarehouseId === parameters.toWarehouseId) errors.push('Kho xuất và kho nhận không được trùng nhau.');
    if (!Array.isArray(parameters.lines) || !parameters.lines.length) errors.push('Danh sách chuyển hàng trống.');

    for (const line of (parameters.lines || [])) {
      const prod = (currentState?.data?.products || []).find(p => p.id === line.productId);
      const qtyCheck = validateQuantityAndUnit({
        qty: line.qty,
        unit: line.unit,
        product: prod,
      });
      if (!qtyCheck.valid) errors.push(`Mặt hàng ${line.productId}: ${qtyCheck.error}`);
    }

    // Section H: Warehouse Scope
    const scopeCheck = validateWarehouseScope(actor, null, parameters.fromWarehouseId, parameters.toWarehouseId, currentState);
    if (!scopeCheck.allowed) errors.push(scopeCheck.error);
  }

  const isValid = errors.length === 0;
  proposal.validation_state = { isValid, errors, warnings };
  if (!isValid && proposal.status === PROPOSAL_STATUS.READY) {
    proposal.status = PROPOSAL_STATUS.NEEDS_CLARIFICATION;
  }

  return { valid: isValid, errors, warnings };
}

/**
 * Section C: Confirm a StructuredProposal and bind immutable execution fingerprint.
 * @param {Object} proposal
 * @param {Object} currentState
 * @param {Object} actor Current user confirming
 * @returns {{ success: boolean, proposal: Object, message: string }}
 */
export function confirmProposal(proposal, currentState, actor = { id: 'owner_1', role: 'owner' }) {
  if (isProposalExpired(proposal)) {
    return { success: false, proposal, message: 'Không thể xác nhận đề xuất đã hết hạn (EXPIRED).' };
  }

  const validation = validateProposal(proposal, currentState, actor);
  if (!validation.valid) {
    return {
      success: false,
      proposal,
      message: `Không thể xác nhận đề xuất: ${validation.errors.join(' ')}`,
    };
  }

  // Step 8: Stale Detection check before confirmation
  if (proposal.inventory_snapshot && currentState?.data) {
    let isStale = false;
    const snap = proposal.inventory_snapshot;
    if (Array.isArray(snap.lines)) {
      const whId = snap.fromWarehouseId || proposal.parameters?.fromWarehouseId;
      for (const snapLine of snap.lines) {
        const curLevel = levelFor(currentState.data, snapLine.productId, whId);
        const curOnHand = Number(curLevel?.onHand || 0);
        if (curOnHand !== Number(snapLine.onHand || 0)) {
          isStale = true;
          break;
        }
      }
    } else if (snap.onHand !== undefined) {
      const prodId = snap.productId || proposal.parameters?.productId;
      const whId = snap.warehouseId || proposal.parameters?.warehouseId;
      if (prodId && whId) {
        const curLevel = levelFor(currentState.data, prodId, whId);
        const curOnHand = Number(curLevel?.onHand || 0);
        if (curOnHand !== Number(snap.onHand || 0)) {
          isStale = true;
        }
      }
    }

    if (isStale) {
      proposal.isStale = true;
      proposal.status = PROPOSAL_STATUS.READY;
      proposal.confirmation_fingerprint = null;
      proposal.confirmed_by = null;
      proposal.confirmed_at = null;
      return {
        success: false,
        isStale: true,
        proposal,
        message: 'Dữ liệu tồn kho đã thay đổi từ lúc tạo đề xuất.',
      };
    }
  }

  // Section D: Transition READY -> CONFIRMED
  try {
    transitionProposal(proposal, PROPOSAL_STATUS.CONFIRMED);
  } catch (err) {
    return { success: false, proposal, message: err.message };
  }

  // Section C: Calculate and bind immutable fingerprint
  proposal.confirmation_fingerprint = computeProposalFingerprint(proposal);
  proposal.confirmed_by = actor.id || 'owner';
  proposal.confirmed_at = new Date().toISOString();

  logAuditEvent('PROPOSAL_CONFIRMED', {
    proposalId: proposal.id,
    fingerprint: proposal.confirmation_fingerprint,
    confirmedBy: proposal.confirmed_by,
  });

  return {
    success: true,
    proposal,
    message: `Đề xuất "${proposal.human_summary}" đã được xác nhận (Fingerprint: ${proposal.confirmation_fingerprint.slice(0, 16)}…). Sẵn sàng thực thi an toàn.`,
  };
}

/**
 * Section C Guard: Verify that the proposal has not been tampered with after confirmation.
 * If parameters or quantities were modified, the confirmation is invalidated.
 */
export function verifyProposalFingerprint(proposal) {
  if (!proposal || !proposal.confirmation_fingerprint) {
    return { valid: false, reason: 'Đề xuất chưa có chữ ký xác nhận (Confirmation Fingerprint).' };
  }

  const currentFingerprint = computeProposalFingerprint(proposal);
  if (currentFingerprint !== proposal.confirmation_fingerprint) {
    // Tampering detected! Invalidate confirmation and revert to READY
    proposal.status = PROPOSAL_STATUS.READY;
    proposal.confirmation_fingerprint = null;
    proposal.confirmed_by = null;
    proposal.confirmed_at = null;

    logAuditEvent('CONFIRMATION_TAMPERING_DETECTED', {
      proposalId: proposal.id,
      expected: proposal.confirmation_fingerprint,
      actual: currentFingerprint,
    });

    return {
      valid: false,
      reason: 'Nội dung hoặc tham số đề xuất đã bị thay đổi sau khi xác nhận. Xác nhận cũ bị vô hiệu hóa (CONFIRMATION INVALIDATED). Vui lòng kiểm tra và xác nhận lại.',
    };
  }

  return { valid: true };
}

/**
 * Cancel a StructuredProposal.
 */
export function cancelProposal(proposal) {
  if (proposal) {
    transitionProposal(proposal, PROPOSAL_STATUS.CANCELLED, { reason: 'User cancelled.' });
    proposal.cancelled_at = new Date().toISOString();
  }
  return proposal;
}

/**
 * Section V: Post-Write Reconciliation Verifier
 * Verifies that physical onHand levels match the ledger sum (mismatch === 0).
 */
export async function verifyLedgerReconciliation(productId, warehouseId) {
  try {
    const db = await import('../db.js');
    const [level, movements] = await Promise.all([
      db.getOne('levels', `${productId}:${warehouseId}`),
      db.getAll('movements'),
    ]);

    let sum = 0;
    for (const m of movements) {
      if (['reserve', 'release', 'damage'].includes(m.type)) continue;
      if (m.productId === productId && m.warehouseId === warehouseId) {
        sum += Number(m.qty || 0);
      }
    }

    const onHand = Number(level?.onHand || 0);
    const pass = onHand === sum;
    return { pass, onHand, ledgerSum: sum, mismatch: Math.abs(onHand - sum) };
  } catch (err) {
    return { pass: false, error: err.message };
  }
}

/**
 * REAL WRITE EXECUTION ENGINE — BATCH 2
 * Hard requirements:
 * 1. Write Gate must be ENABLED (Section X)
 * 2. Status must be CONFIRMED (Section D)
 * 3. Fingerprint must match exact parameters (Section C)
 * 4. Not expired (Section K)
 * 5. Idempotency Key check: duplicate invocation returns prior result without re-executing (Section B)
 * 6. Domain engine enforces transactional invariants at commit (Section A TOCTOU)
 * 7. Post-write reconciliation verification (Section V)
 * 8. Comprehensive decision chain audit logging (Section S)
 *
 * @param {Object} proposal
 * @param {Object} appState
 * @param {string} idempotencyKey
 * @param {Object} actor
 * @returns {Promise<{ success: boolean, result?: Object, error?: string, isIdempotentReplay?: boolean }>}
 */
export async function executeProposal(proposal, appState, idempotencyKey, actor = { id: 'owner_1', role: 'owner' }) {
  const opKey = idempotencyKey || proposal.idempotency_key || `idem_${proposal.id}`;

  // 1. Section B: Business-Grade Idempotency Check
  if (IDEMPOTENCY_CACHE.has(opKey)) {
    const cached = IDEMPOTENCY_CACHE.get(opKey);
    logAuditEvent('IDEMPOTENT_REPLAY_RETURNED', { opKey, proposalId: proposal.id });
    return {
      success: true,
      result: cached.result,
      isIdempotentReplay: true,
      isDuplicate: true,
      message: 'Thao tác đã được thực thi trước đó. Trả về kết quả ghi nhận ban đầu (Idempotent Replay). Không tạo nghiệp vụ lần hai.',
    };
  }

  // 2. Section X: Write Gate Check
  if (!writeGateEnabled) {
    return {
      success: false,
      error: 'WRITE_GATE = BLOCKED. Chế độ ghi thực tế của AI đang tạm khóa để bảo vệ an toàn.',
    };
  }

  // 3. Section D: State Machine Check
  if (proposal.status !== PROPOSAL_STATUS.CONFIRMED) {
    return {
      success: false,
      error: `Chỉ đề xuất ở trạng thái CONFIRMED mới được phép thực thi. Trạng thái hiện tại: "${proposal.status}".`,
    };
  }

  // 4. Section K: Expiry Check
  if (isProposalExpired(proposal)) {
    return {
      success: false,
      error: 'Đề xuất đã hết hạn (EXPIRED). Không thể thực thi.',
    };
  }

  // 5. Section C: Fingerprint Tampering Verification
  const fpCheck = verifyProposalFingerprint(proposal);
  if (!fpCheck.valid) {
    return {
      success: false,
      error: fpCheck.reason,
    };
  }

  // 6. Section Q: Write Action Whitelist
  if (!ALLOWED_WRITE_ACTIONS.has(proposal.intent)) {
    return {
      success: false,
      error: `Hành động ghi "${proposal.intent}" không nằm trong danh mục cho phép của Batch 2 (HARD DENY).`,
    };
  }

  // 7. Section H: Scope Check
  const scopeCheck = validateWarehouseScope(
    actor,
    proposal.parameters?.warehouseId,
    proposal.parameters?.fromWarehouseId,
    proposal.parameters?.toWarehouseId,
    appState
  );
  if (!scopeCheck.allowed) {
    return {
      success: false,
      error: scopeCheck.error,
    };
  }

  // 8. Revalidate Context Snapshot (Section L)
  const validation = validateProposal(proposal, appState, actor);
  if (!validation.valid) {
    return {
      success: false,
      error: `Dữ liệu không còn hợp lệ trước khi thực thi: ${validation.errors.join(' ')}`,
    };
  }

  // Transition to EXECUTING (Section D)
  transitionProposal(proposal, PROPOSAL_STATUS.EXECUTING);

  // 9. Section A: Call Existing Domain Engine (Engine validates atomically at commit)
  try {
    const engine = await import('../engine.js');
    let executionResult = null;

    if (proposal.intent === 'create_receipt_proposal' || proposal.intent === 'RECEIVE_STOCK') {
      const { productId, warehouseId, qty, price, reason } = proposal.parameters;
      // Call domain engine receive
      executionResult = await engine.receive({
        productId,
        warehouseId,
        qty: Number(qty),
        price: price != null ? Number(price) : null,
        reference: reason || proposal.human_summary,
        operationId: opKey,
      });

      // Section V: Post-Write Reconciliation Check
      const recon = await verifyLedgerReconciliation(productId, warehouseId);
      if (!recon.pass) {
        logAuditEvent('RECONCILIATION_FAILED', { productId, warehouseId, mismatch: recon.mismatch });
        proposal.status = PROPOSAL_STATUS.FAILED;
        return {
          success: false,
          error: `Giao dịch đã ghi nhưng đối soát sổ kho thất bại (mismatch: ${recon.mismatch}). Yêu cầu kiểm tra sổ cái.`,
        };
      }

    } else if (proposal.intent === 'create_transfer_proposal' || proposal.intent === 'TRANSFER_STOCK') {
      const { fromWarehouseId, toWarehouseId, lines, note } = proposal.parameters;
      // Call domain engine createTransfer
      executionResult = await engine.createTransfer({
        fromWarehouseId,
        toWarehouseId,
        lines,
        note: note || proposal.human_summary,
        operationId: opKey,
      });

      // Section V: Post-Write Reconciliation for transferred lines
      for (const line of lines) {
        const recon = await verifyLedgerReconciliation(line.productId, fromWarehouseId);
        if (!recon.pass) {
          logAuditEvent('RECONCILIATION_FAILED', { productId: line.productId, warehouseId: fromWarehouseId });
          proposal.status = PROPOSAL_STATUS.FAILED;
          return {
            success: false,
            error: `Chuyển kho đã tạo nhưng đối soát sổ kho thất bại. Yêu cầu kiểm tra sổ cái.`,
          };
        }
      }
    } else if (proposal.intent === 'create_cart_draft') {
      const items = proposal.parameters?.items || [];
      if (!appState.cart) appState.cart = [];
      for (const it of items) {
        const prod = (appState.data?.products || []).find(p => p.id === it.productId);
        const existing = appState.cart.find(c => (c.productId === it.productId || c.product?.id === it.productId));
        if (existing) {
          existing.qty = (existing.qty || 1) + (Number(it.qty) || 1);
        } else {
          appState.cart.push({
            productId: it.productId,
            product: prod || { id: it.productId },
            qty: Number(it.qty) || 1,
            unitPrice: Number(it.unitPrice || prod?.price || 0),
          });
        }
      }
      executionResult = { cartLength: appState.cart.length, addedItems: items.length };
    }

    // Transition to SUCCEEDED (Section D)
    transitionProposal(proposal, PROPOSAL_STATUS.SUCCEEDED);
    proposal.execution_result = executionResult;

    // Cache in Idempotency Store (Section B)
    IDEMPOTENCY_CACHE.set(opKey, {
      proposalId: proposal.id,
      status: PROPOSAL_STATUS.SUCCEEDED,
      result: executionResult,
      timestamp: new Date().toISOString(),
    });

    // Section S: Audit Decision Chain
    logDecisionChain({
      who: actor.id,
      role: actor.role,
      askedWhat: proposal.human_summary,
      contextVersion: proposal.context_version,
      resolvedAction: proposal.intent,
      userSaw: proposal.human_summary,
      confirmedBy: proposal.confirmed_by,
      confirmedAt: proposal.confirmed_at,
      revalidationResult: 'PASS',
      domainOperation: proposal.intent,
      operationId: opKey,
      result: 'SUCCEEDED',
    });

    return {
      success: true,
      result: executionResult,
      proposal,
      message: `Đã thực thi thành công: ${proposal.human_summary}. Sổ cái kho đã đối soát an toàn.`,
    };

  } catch (err) {
    // Section I: Domain Failure
    try {
      transitionProposal(proposal, PROPOSAL_STATUS.FAILED, { reason: err.message });
    } catch {
      proposal.status = PROPOSAL_STATUS.FAILED;
    }

    logDecisionChain({
      who: actor.id,
      role: actor.role,
      askedWhat: proposal.human_summary,
      resolvedAction: proposal.intent,
      operationId: opKey,
      result: 'FAILED',
      error: err.message,
    });

    return {
      success: false,
      error: `Thao tác thất bại tại tầng nghiệp vụ: ${err.message}`,
      status: PROPOSAL_STATUS.FAILED,
    };
  }
}
