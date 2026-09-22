/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — SHOP MEMORY FOUNDATION
 * Memory belongs to QBiz. The AI must never silently persist memory without explicit user confirmation.
 */

import { createProposal } from './proposals.js';

export const MEMORY_SCOPES = {
  SHOP: 'SHOP',
  PRODUCT: 'PRODUCT',
  WAREHOUSE: 'WAREHOUSE',
  CUSTOMER_REFERENCE: 'CUSTOMER_REFERENCE',
  SUPPLIER: 'SUPPLIER',
  PREFERENCE: 'PREFERENCE',
};

const STORAGE_KEY = 'qbiz_ai_memory_entries';

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('Không thể lưu trí nhớ shop vào localStorage:', err);
  }
}

/**
 * Retrieve memory entries by scope, entityId, keyword, tags, or pinned status.
 */
export function queryMemory({ scope, entityId, query, tag, pinnedOnly = false }) {
  const all = loadEntries();
  return all.filter(m => {
    if (scope && m.scope !== scope) return false;
    if (entityId && m.entity_id !== entityId) return false;
    if (pinnedOnly && !m.pinned) return false;
    if (tag && !(m.tags || []).includes(tag)) return false;
    if (query) {
      const q = query.toLowerCase();
      const contentMatch = (m.content || '').toLowerCase().includes(q);
      const titleMatch = (m.title || '').toLowerCase().includes(q);
      if (!contentMatch && !titleMatch) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.importance || 1) - (a.importance || 1) || String(b.created_at).localeCompare(String(a.created_at));
  });
}

/**
 * Create a proposal to save a piece of knowledge into shop memory.
 * Requires user confirmation before calling commitMemory.
 */
export function proposeMemorySave({ scope = MEMORY_SCOPES.SHOP, entityId = null, title, content, tags = [], importance = 1 }, envelope) {
  return createProposal({
    requestId: envelope?.request_id,
    skillId: 'memory-retrieve',
    intent: 'propose_memory_save',
    entities: { scope, entityId, title },
    parameters: { scope, entityId, title, content, tags, importance },
    humanSummary: `Lưu vào Trí nhớ Shop [${scope}]: "${title}"`,
    contextSnapshot: envelope,
  });
}

/**
 * Explicitly commit memory after user confirmation.
 */
export function commitMemory({ scope, entityId = null, title, content, tags = [], importance = 1, pinned = false }) {
  const entries = loadEntries();
  const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const newEntry = {
    id,
    scope: scope || MEMORY_SCOPES.SHOP,
    entity_id: entityId,
    title: title || 'Ghi nhớ',
    content: content || '',
    tags: Array.isArray(tags) ? tags : [],
    importance: Number(importance || 1),
    pinned: Boolean(pinned),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  entries.push(newEntry);
  saveEntries(entries);
  return newEntry;
}
