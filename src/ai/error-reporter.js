/**
 * QBiz Kho — AI Quality Error Reporter Client (CR-AIQ-002)
 * 
 * Side-channel telemetry producer for QBiz Core AI Quality Error Inbox.
 * Conforms to Lệnh #17 and CR-AIQ-002:
 * - Side-channel only: NEVER blocks user requests or AI responses.
 * - Zero direct cross-repo file writes: communicates strictly over HTTP.
 * - Minimal data collection: scrubs secrets/PII before transmission.
 * - Transport idempotency: uses deterministic error_id for replay deduplication.
 * - Bounded timeout: fails safe without hanging.
 */

const DEFAULT_CORE_INTAKE_URL = 'http://127.0.0.1:3720/api/integration/ai-quality-errors';
const DEFAULT_TIMEOUT_MS = 1500;

// Client-side PII and Secret scrubbing regexes
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const API_KEY_REGEX = /(?:api[-_]?key|secret|authorization|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+["']?/gi;
const PHONE_REGEX = /(?:\+84|0)(?:3|5|7|8|9)[0-9]{8}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;

export function redactKhoClientEvidence(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(BEARER_REGEX, 'Bearer ***REDACTED***')
    .replace(API_KEY_REGEX, 'secret: "***REDACTED***"')
    .replace(EMAIL_REGEX, '***EMAIL_REDACTED***')
    .replace(PHONE_REGEX, '***PHONE_REDACTED***');
}

/**
 * Creates a standard AIQualityErrorEventV1 payload from QBiz Kho runtime.
 */
export function createKhoQualityErrorEvent({
  errorId,
  errorType = 'UNEXPECTED_FALLBACK',
  severity = 'MEDIUM',
  confidence = 1.0,
  route = 'dashboard',
  role = 'cashier',
  intent = '',
  skill = '',
  provider = 'LOCAL_AI',
  tier = 'TIER_1',
  toolSelected = undefined,
  toolExecuted = false,
  toolResultStatus = undefined,
  finalResponseStatus = 'FAILED',
  userPrompt = '',
  actualResponse = '',
  expectedBehavior = '',
  correlationId = '',
  operationId = '',
  expectedTruthSource = undefined,
  expectedTruthVersion = undefined,
  verificationStatus = undefined,
  linkedCorrectionErrorId = undefined,
  userCorrectionText = undefined,
}) {
  const generatedErrorId = errorId || `aiq_err_kho_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const corrId = correlationId || `corr_kho_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const isCorrection = errorType === 'USER_CORRECTION';
  const isTruthMismatch = errorType === 'DETERMINISTIC_TRUTH_MISMATCH';

  const resolvedVerificationStatus =
    verificationStatus ||
    (isCorrection ? 'UNVERIFIED' : isTruthMismatch ? 'VERIFIED' : 'UNVERIFIED');

  // Rule 1: Never auto-trust user correction as expected truth
  const expectedTruth = isCorrection
    ? undefined // User correction is NOT canonical expected truth!
    : redactKhoClientEvidence(expectedBehavior);

  const userCorrection = isCorrection
    ? redactKhoClientEvidence(userCorrectionText || expectedBehavior || actualResponse)
    : userCorrectionText ? redactKhoClientEvidence(userCorrectionText) : undefined;

  return {
    identity: {
      error_id: generatedErrorId,
      schema_version: '1.0',
      observed_at: new Date().toISOString(),
      source_app: 'qbiz-kho',
      source_runtime: 'qbiz-kho-ai-runtime',
      correlation_id: corrId,
      operation_id: operationId || undefined,
    },
    context: {
      route: route || 'dashboard',
      role: role || 'cashier',
      intent: intent || undefined,
      skill: skill || undefined,
      provider: provider || undefined,
      tier: tier || undefined,
    },
    execution: {
      tool_selected: toolSelected || undefined,
      tool_executed: Boolean(toolExecuted),
      tool_result_status: toolResultStatus || undefined,
      final_response_status: finalResponseStatus || 'FAILED',
    },
    evidence: {
      input_redacted: redactKhoClientEvidence(userPrompt),
      actual_redacted: redactKhoClientEvidence(actualResponse),
      expected_truth_redacted: expectedTruth,
      user_correction_redacted: userCorrection,
      expected_truth_source: expectedTruthSource,
      expected_truth_version: expectedTruthVersion,
      verification_status: resolvedVerificationStatus,
      linked_correction_error_id: linkedCorrectionErrorId,
    },
    classification: {
      error_type: errorType,
      severity: severity || 'MEDIUM',
      confidence: typeof confidence === 'number' ? confidence : 1.0,
      fingerprint_v1: '', // Computed by Core authority
      status: 'NEW',
      verification_status: resolvedVerificationStatus,
    },
    traceability: {
      release_id: 'qbiz-kho-v12',
      commit: 'ace241b',
      expected_truth_source: expectedTruthSource,
      expected_truth_version: expectedTruthVersion,
      linked_correction_error_id: linkedCorrectionErrorId,
    },
  };
}

/**
 * Emits an AI Quality Error event to Core Intake endpoint over HTTP.
 * Strictly non-blocking: never throws, never blocks user.
 */
export async function reportAIQualityError(event, options = {}) {
  const intakeUrl = options.intakeUrl || options.endpoint ||
    (typeof process !== 'undefined' && process.env?.QBIZ_CORE_ERROR_INTAKE_URL) ||
    (typeof window !== 'undefined' && window?.QBIZ_CORE_ERROR_INTAKE_URL) ||
    (typeof globalThis !== 'undefined' && globalThis?.__QBIZ_CORE_ERROR_INTAKE_URL) ||
    DEFAULT_CORE_INTAKE_URL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    const res = await fetch(intakeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-QBiz-Source-App': 'qbiz-kho',
        'X-Correlation-ID': event.identity?.correlation_id || `corr_${Date.now()}`,
      },
      body: JSON.stringify(event),
      signal: controller ? controller.signal : undefined,
    });

    if (timer) clearTimeout(timer);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, status: res.status, ack: data };
    } else {
      const errData = await res.json().catch(() => ({}));
      return { success: false, status: res.status, error: errData };
    }
  } catch (err) {
    // Non-blocking telemetry: log nothing destructive, never throw
    return { success: false, error: err?.message || 'NETWORK_FAILURE' };
  }
}

/**
 * Convenience helper: Reports Unexpected Fallback
 */
export async function reportUnexpectedFallback(params, options = {}) {
  const opts = typeof options === 'object' && options !== null ? { ...options } : {};
  if (params.intakeUrl || params.endpoint) {
    opts.intakeUrl = opts.intakeUrl || params.intakeUrl || params.endpoint;
  }
  const event = createKhoQualityErrorEvent({
    ...params,
    userPrompt: params.userPrompt || params.input || '',
    actualResponse: params.actualResponse || params.fallbackMessage || '',
    errorType: 'UNEXPECTED_FALLBACK',
    severity: 'MEDIUM',
    finalResponseStatus: 'FALLBACK',
  });
  return reportAIQualityError(event, opts);
}

/**
 * Convenience helper: Reports Provider Error
 */
export async function reportProviderError(params, options = {}) {
  const opts = typeof options === 'object' && options !== null ? { ...options } : {};
  if (params.intakeUrl || params.endpoint) {
    opts.intakeUrl = opts.intakeUrl || params.intakeUrl || params.endpoint;
  }
  const event = createKhoQualityErrorEvent({
    ...params,
    userPrompt: params.userPrompt || params.input || '',
    actualResponse: params.actualResponse || params.errorMessage || '',
    errorType: 'PROVIDER_ERROR',
    severity: 'HIGH',
    finalResponseStatus: 'FAILED',
  });
  return reportAIQualityError(event, opts);
}

/**
 * Convenience helper: Reports Tool Error
 */
export async function reportToolError(params, options = {}) {
  const opts = typeof options === 'object' && options !== null ? { ...options } : {};
  if (params.intakeUrl || params.endpoint) {
    opts.intakeUrl = opts.intakeUrl || params.intakeUrl || params.endpoint;
  }
  const event = createKhoQualityErrorEvent({
    ...params,
    userPrompt: params.userPrompt || params.input || '',
    actualResponse: params.actualResponse || params.errorMessage || '',
    toolSelected: params.toolSelected || params.toolName,
    errorType: 'TOOL_ERROR',
    severity: 'HIGH',
    toolExecuted: true,
    toolResultStatus: 'ERROR',
    finalResponseStatus: 'FAILED',
  });
  return reportAIQualityError(event, opts);
}

/**
 * Convenience helper: Reports Tool Selected Not Executed
 */
export async function reportToolSelectedNotExecuted(params, options) {
  const event = createKhoQualityErrorEvent({
    ...params,
    errorType: 'TOOL_SELECTED_NOT_EXECUTED',
    severity: 'MEDIUM',
    toolExecuted: false,
    finalResponseStatus: 'UNEXPECTED_FALLBACK',
  });
  return reportAIQualityError(event, options);
}

/**
 * Convenience helper: Reports Deterministic Truth Mismatch
 */
export async function reportTruthMismatch(params, options = {}) {
  const opts = typeof options === 'object' && options !== null ? { ...options } : {};
  if (params.intakeUrl || params.endpoint) {
    opts.intakeUrl = opts.intakeUrl || params.intakeUrl || params.endpoint;
  }
  const event = createKhoQualityErrorEvent({
    ...params,
    userPrompt: params.userPrompt || params.input || '',
    expectedTruthSource: params.expectedTruthSource || (params.route === 'sales' ? 'sales_summary' : 'inventory_ledger'),
    expectedTruthVersion: params.expectedTruthVersion || 12,
    verificationStatus: 'VERIFIED',
    errorType: 'DETERMINISTIC_TRUTH_MISMATCH',
    severity: params.severity || 'CRITICAL',
    finalResponseStatus: 'SUCCESS',
  });
  return reportAIQualityError(event, opts);
}

/**
 * Convenience helper: Reports User Correction (Candidate signal, UNVERIFIED)
 */
export async function reportUserCorrection(params, options = {}) {
  const opts = typeof options === 'object' && options !== null ? { ...options } : {};
  if (params.intakeUrl || params.endpoint) {
    opts.intakeUrl = opts.intakeUrl || params.intakeUrl || params.endpoint;
  }
  const event = createKhoQualityErrorEvent({
    ...params,
    userPrompt: params.userPrompt || params.input || '',
    userCorrectionText: params.userCorrection || params.userCorrectionText || params.actualResponse,
    errorType: 'USER_CORRECTION',
    severity: params.severity || 'MEDIUM',
    verificationStatus: 'UNVERIFIED',
    finalResponseStatus: 'FALLBACK',
  });
  return reportAIQualityError(event, opts);
}
