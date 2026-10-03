/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — CONVERSATION ORCHESTRATION & STATE (PHASE 3)
 * 
 * Rules:
 * - Session-based conversation state.
 * - Stores minimal safe context:
 *   - conversation_id
 *   - turns: last N turns (user prompt, assistant response summary, ts)
 *   - last_verified_intents: array of verified intents from last turn
 *   - last_resolved_entities: { product, warehouse, order, customer }
 *   - last_time_range: normalized time interval
 *   - pending_clarification: { query, reason, candidates, original_intent, replan_count }
 *   - pending_proposal: { proposal_id, conversation_id, source_intent, entity_ids, mutation_summary, risk_level, confirmation_state }
 *   - current_route, current_screen
 * - Never stores secrets, credentials, or whole DB.
 * - Memory is a CONTEXT HINT, not business truth.
 */

const MAX_HISTORY_TURNS = 5;

// Generate or retrieve current conversation ID
let activeConversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Turn history: array of { role, text, intents, entities, proposal, timeRange, ts }
let turnHistory = [];

// Last verified context entities
let lastResolvedEntities = {
  product: null,    // { id, name, sku, unit }
  warehouse: null,  // { id, name }
  order: null,      // { id, code }
  customer: null,   // { id, name }
};

// Last normalized time range ('today', 'month', 'this_week', etc.)
let lastTimeRange = null;

// Last verified intents array
let lastVerifiedIntents = [];

// Pending clarification state
let pendingClarification = null; // { query, reason, candidates: [], original_intent: null, replan_count: 0 }

// Pending proposal state (awaiting user confirmation)
let pendingProposal = null; // { proposal_id, conversation_id, source_intent, entity_ids, mutation_summary, risk_level, confirmation_state }

/**
 * Get active conversation ID.
 */
export function getConversationId() {
  return activeConversationId;
}

/**
 * Reset conversation state (e.g. on new session, actor switch, or user reset).
 */
export function resetConversation() {
  activeConversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  turnHistory = [];
  lastResolvedEntities = {
    product: null,
    warehouse: null,
    order: null,
    customer: null,
  };
  lastTimeRange = null;
  lastVerifiedIntents = [];
  pendingClarification = null;
  pendingProposal = null;
}

/**
 * Get full conversation state snapshot.
 */
export function getConversationState() {
  return {
    conversation_id: activeConversationId,
    turns_count: turnHistory.length,
    last_verified_intents: [...lastVerifiedIntents],
    last_resolved_entities: { ...lastResolvedEntities },
    last_time_range: lastTimeRange,
    has_pending_clarification: Boolean(pendingClarification),
    has_pending_proposal: Boolean(pendingProposal),
  };
}

/**
 * Record a completed conversation turn.
 */
export function addTurnToHistory({
  userPrompt = '',
  assistantSummary = '',
  intents = [],
  entities = {},
  proposal = null,
  timeRange = null,
}) {
  const ts = Date.now();

  turnHistory.push({
    user: userPrompt,
    assistant: assistantSummary,
    intents: intents.map(i => typeof i === 'string' ? i : (i.intent_name || i.required_capability || '')),
    entities,
    has_proposal: Boolean(proposal),
    timeRange,
    ts,
  });

  if (turnHistory.length > MAX_HISTORY_TURNS) {
    turnHistory.shift();
  }

  // Update verified context references
  if (intents && intents.length > 0) {
    lastVerifiedIntents = intents.map(i => typeof i === 'string' ? i : (i.required_capability || i.intent_name || ''));
  }

  if (entities?.product) {
    lastResolvedEntities.product = { ...entities.product };
  }
  if (entities?.warehouse) {
    lastResolvedEntities.warehouse = { ...entities.warehouse };
  }
  if (entities?.order) {
    lastResolvedEntities.order = { ...entities.order };
  }
  if (entities?.customer) {
    lastResolvedEntities.customer = { ...entities.customer };
  }

  if (timeRange) {
    lastTimeRange = timeRange;
  }
}

/**
 * Retrieve last resolved entity of a specific type.
 */
export function getLastResolvedEntity(type = 'product') {
  return lastResolvedEntities[type] ? { ...lastResolvedEntities[type] } : null;
}

/**
 * Set last resolved entity manually.
 */
export function setLastResolvedEntity(type, entity) {
  if (type && lastResolvedEntities.hasOwnProperty(type)) {
    lastResolvedEntities[type] = entity ? { ...entity } : null;
  }
}

/**
 * Retrieve last time range.
 */
export function getLastTimeRange() {
  return lastTimeRange;
}

/**
 * Set last time range.
 */
export function setLastTimeRange(tr) {
  lastTimeRange = tr || null;
}

/**
 * Get last verified intents.
 */
export function getLastVerifiedIntents() {
  return [...lastVerifiedIntents];
}

/**
 * Pending Clarification management.
 */
export function getPendingClarification() {
  if (!pendingClarification) return null;
  // TTL: 120 seconds
  if (Date.now() - (pendingClarification.ts || 0) > 120000) {
    pendingClarification = null;
    return null;
  }
  return { ...pendingClarification };
}

export function setPendingClarification({
  query,
  reason = 'AMBIGUOUS_ENTITY',
  candidates = [],
  original_intent = null,
  replan_count = 0,
}) {
  pendingClarification = {
    query,
    reason,
    candidates: [...candidates],
    original_intent,
    replan_count,
    ts: Date.now(),
  };
}

export function clearPendingClarification() {
  pendingClarification = null;
}

/**
 * Pending Write Proposal management.
 */
export function getPendingProposal() {
  if (!pendingProposal) return null;
  // TTL: 300 seconds (5 minutes)
  if (Date.now() - (pendingProposal.ts || 0) > 300000) {
    pendingProposal = null;
    return null;
  }
  return { ...pendingProposal };
}

export function setPendingProposal(proposal) {
  if (!proposal) {
    pendingProposal = null;
    return;
  }
  pendingProposal = {
    proposal_id: proposal.id || proposal.proposalId || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    conversation_id: activeConversationId,
    source_intent: proposal.type || proposal.intent || 'WRITE_PROPOSAL',
    entity_ids: proposal.entity_ids || (proposal.productId ? [proposal.productId] : []),
    mutation_summary: proposal.summary || proposal.text || 'Đề xuất thay đổi',
    risk_level: proposal.risk || 'WRITE_PROPOSAL',
    confirmation_state: 'PENDING',
    raw_proposal: proposal,
    ts: Date.now(),
  };
}

export function clearPendingProposal() {
  pendingProposal = null;
}

/**
 * Build a compact, safe conversation context summary for model planning.
 * Strictly excludes secrets and large datasets.
 */
export function buildConversationContextSummary() {
  const recentTurns = turnHistory.slice(-3).map(t => ({
    user: t.user,
    assistant: t.assistant?.slice(0, 120) || '',
    intents: t.intents,
  }));

  return {
    conversation_id: activeConversationId,
    last_product: lastResolvedEntities.product
      ? `${lastResolvedEntities.product.name} (ID: ${lastResolvedEntities.product.id}, SKU: ${lastResolvedEntities.product.sku || 'N/A'})`
      : null,
    last_warehouse: lastResolvedEntities.warehouse ? lastResolvedEntities.warehouse.name || lastResolvedEntities.warehouse.id : null,
    last_time_range: lastTimeRange,
    last_verified_intents: lastVerifiedIntents,
    pending_clarification_reason: pendingClarification?.reason || null,
    pending_proposal_id: pendingProposal?.proposal_id || null,
    recent_turns: recentTurns,
  };
}
