/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — LEGACY ROUTER COMPATIBILITY ADAPTER
 * 
 * Strict Architectural Rule:
 * - Legacy router is NO LONGER the primary decision maker.
 * - Used only as a fallback adapter when exact gate and semantic planner delegate.
 * - Every invocation into legacy logic is explicitly tagged with Trace Truth.
 */

import { legacyRouteIntent } from './router.js';

export async function executeLegacyRouteWithTrace(prompt, context = {}, state = {}, options = {}, fallbackReason = 'DELEGATED_TO_LEGACY') {
  const res = await legacyRouteIntent(prompt, context, state, options);
  
  return {
    ...res,
    authority_path: 'LEGACY_FALLBACK',
    LEGACY_FALLBACK_USED: true,
    LEGACY_HANDLER: res?.skillId || res?.actionId || res?.intent || 'legacy_rule',
    FALLBACK_REASON: fallbackReason,
    final_answer_source: 'LEGACY_COMPAT',
    compactTrace: res?.compactTrace ? `${res.compactTrace} [Legacy Compat]` : 'Legacy Compat Rule',
  };
}
