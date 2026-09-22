/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — PROVIDER ABSTRACTION
 * Hard requirements for Batch 2:
 * - Section N: NEED-TO-KNOW Provider Payload Minimization (No raw DB/objects)
 * - Section O: Untrusted Provider Response Schema Validation (Rejects db.put, invalid quantities)
 * - Section E: LLM output treated as untrusted input
 * - Zero Silent Mock: Honest error reporting on provider failures
 * - Session-only API keys
 */

export const PROVIDER_MODES = {
  DETERMINISTIC: 'DETERMINISTIC',
  MOCK_DEV: 'MOCK_DEV',
  GEMINI: 'GEMINI',
  OPENAI_COMPATIBLE: 'OPENAI_COMPATIBLE',
};

const SESSION_KEY_GEMINI = 'qbiz_session_gemini_key';
const SESSION_KEY_OPENAI = 'qbiz_session_openai_key';
const SESSION_URL_OPENAI = 'qbiz_session_openai_url';

let lastInspectedPayload = null;

export function getLastInspectedPayload() {
  return lastInspectedPayload;
}

export function getProviderConfig() {
  const mode = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('qbiz_ai_provider_mode')) || PROVIDER_MODES.DETERMINISTIC;
  return {
    mode,
    geminiKey: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY_GEMINI)) || '',
    openaiKey: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY_OPENAI)) || '',
    openaiUrl: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_URL_OPENAI)) || 'https://api.openai.com/v1/chat/completions',
  };
}

export function setProviderConfig({ mode, geminiKey, openaiKey, openaiUrl }) {
  if (typeof sessionStorage === 'undefined') return;
  if (mode) sessionStorage.setItem('qbiz_ai_provider_mode', mode);
  if (geminiKey !== undefined) sessionStorage.setItem(SESSION_KEY_GEMINI, geminiKey);
  if (openaiKey !== undefined) sessionStorage.setItem(SESSION_KEY_OPENAI, openaiKey);
  if (openaiUrl !== undefined) sessionStorage.setItem(SESSION_URL_OPENAI, openaiUrl);
}

/**
 * Section N: NEED-TO-KNOW Payload Minimization
 * Explicitly whitelists minimal necessary fields.
 * Never dumps full database tables, raw entities, customer PII, or internal tokens.
 */
export function buildSafeProviderPayload({ prompt, systemPrompt, context = {}, skill = null }) {
  const safeData = {
    user_query: String(prompt || '').slice(0, 500),
    current_route: context.current_route || 'dashboard',
    current_screen: context.current_screen || 'dashboard',
    warehouse_id: context.warehouse_id || 'default',
  };

  // Only attach specific bound IDs if actively focused
  if (context.current_product_id) {
    safeData.focused_product_id = context.current_product_id;
  }
  if (context.current_order_id) {
    safeData.focused_order_id = context.current_order_id;
  }

  const serialized = JSON.stringify(safeData);
  const payloadSize = new Blob([serialized]).size;

  lastInspectedPayload = {
    fieldNames: Object.keys(safeData),
    payloadSizeBytes: payloadSize,
    redactedSample: safeData,
  };

  return {
    safeData,
    promptText: `${systemPrompt ? `[SYSTEM]\n${systemPrompt}\n\n` : ''}[MINIMAL_SAFE_CONTEXT]\n${serialized}\n\n[USER QUERY]\n${prompt}`,
    inspection: lastInspectedPayload,
  };
}

/**
 * Section O & E: Untrusted Provider Response Schema Validation
 * Strictly validates structure, rejects unauthorized tool injections (db.put, ADMIN, negative qty).
 */
export function validateProviderResponse(rawResponse, allowedTools = new Set()) {
  if (!rawResponse) {
    return { valid: false, error: 'Empty provider response.' };
  }

  // If text is a string
  if (typeof rawResponse === 'string') {
    // Check if model returned a raw JSON tool call attempt
    const trimmed = rawResponse.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return validateStructuredToolCall(parsed, allowedTools);
      } catch {
        // Normal text
        return { valid: true, text: rawResponse };
      }
    }
    return { valid: true, text: rawResponse };
  }

  if (typeof rawResponse === 'object') {
    return validateStructuredToolCall(rawResponse, allowedTools);
  }

  return { valid: true, text: String(rawResponse) };
}

/**
 * Validate a candidate structured tool call output from model.
 */
function validateStructuredToolCall(callObj, allowedTools = new Set()) {
  const { tool, risk, quantity, permission, parameters } = callObj;

  // 1. Tool Whitelist Check (Section F, O)
  if (tool) {
    if (!allowedTools.has(tool)) {
      return {
        valid: false,
        error: `HARD DENY: Tool "${tool}" không được cấp phép hoặc vi phạm danh sách trắng.`,
        rejectedTool: tool,
      };
    }
  }

  // 2. Quantity Sanity Check (Section G)
  const qty = quantity !== undefined ? quantity : parameters?.qty;
  if (qty !== undefined) {
    const num = Number(qty);
    if (!Number.isFinite(num) || num <= 0) {
      return {
        valid: false,
        error: `Số lượng không hợp lệ từ model (${qty}): Số lượng phải là số dương hữu hạn.`,
      };
    }
  }

  // 3. Drop Fabricated Permissions (Section E)
  // Model cannot set risk or permissions
  const safeCall = {
    tool: tool || null,
    parameters: parameters || {},
  };

  return { valid: true, structuredCall: safeCall, text: callObj.explanation || null };
}

/**
 * Standard Provider Adapter Class
 */
export class AIProviderAdapter {
  constructor(config = {}) {
    this.config = { ...getProviderConfig(), ...config };
  }

  async generateResponse({ prompt, systemPrompt, context, tools = [] }) {
    const mode = this.config.mode;

    switch (mode) {
      case PROVIDER_MODES.DETERMINISTIC:
        return {
          mode,
          text: null,
          isDeterministic: true,
        };

      case PROVIDER_MODES.MOCK_DEV:
        return this._callMockDev({ prompt, systemPrompt, context });

      case PROVIDER_MODES.GEMINI:
        return this._callGemini({ prompt, systemPrompt, context });

      case PROVIDER_MODES.OPENAI_COMPATIBLE:
        return this._callOpenAI({ prompt, systemPrompt, context });

      default:
        throw new Error(`Chế độ Provider "${mode}" không được hỗ trợ.`);
    }
  }

  async _callMockDev({ prompt, systemPrompt, context }) {
    // Section N: Build minimized payload
    const payload = buildSafeProviderPayload({ prompt, systemPrompt, context });
    await new Promise(r => setTimeout(r, 60));

    return {
      mode: PROVIDER_MODES.MOCK_DEV,
      text: `[MOCK_DEV] Đã tiếp nhận yêu cầu: "${prompt}". Route: ${payload.safeData.current_route}.`,
      inspection: payload.inspection,
    };
  }

  async _callGemini({ prompt, systemPrompt, context }) {
    const key = this.config.geminiKey;
    if (!key) {
      throw new Error('PROVIDER_ERROR: Chưa cấu hình Gemini API Key (Session Key).');
    }

    // Section N: Build minimized payload
    const safePayload = buildSafeProviderPayload({ prompt, systemPrompt, context });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const reqBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: safePayload.promptText }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
    } catch (err) {
      throw new Error(`PROVIDER_NETWORK_ERROR: ${err.message}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`PROVIDER_HTTP_ERROR (Gemini ${res.status}): ${errText}`);
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!candidateText) {
      throw new Error('PROVIDER_EMPTY_RESPONSE: Không nhận được phản hồi văn bản từ Gemini.');
    }

    // Section O: Validate model output schema
    const allowedToolsSet = new Set(context.allowed_tools || []);
    const validated = validateProviderResponse(candidateText, allowedToolsSet);
    if (!validated.valid) {
      throw new Error(`MODEL_OUTPUT_VALIDATION_FAILED: ${validated.error}`);
    }

    return {
      mode: PROVIDER_MODES.GEMINI,
      text: candidateText,
      inspection: safePayload.inspection,
    };
  }

  async _callOpenAI({ prompt, systemPrompt, context }) {
    const key = this.config.openaiKey;
    const url = this.config.openaiUrl;
    if (!key) {
      throw new Error('PROVIDER_ERROR: Chưa cấu hình OpenAI API Key (Session Key).');
    }

    const safePayload = buildSafeProviderPayload({ prompt, systemPrompt, context });

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt || 'Trợ lý vận hành QBiz Kho.' },
            { role: 'user', content: safePayload.promptText },
          ],
          temperature: 0.2,
        }),
      });
    } catch (err) {
      throw new Error(`PROVIDER_NETWORK_ERROR: ${err.message}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`PROVIDER_HTTP_ERROR (OpenAI ${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';

    const allowedToolsSet = new Set(context.allowed_tools || []);
    const validated = validateProviderResponse(text, allowedToolsSet);
    if (!validated.valid) {
      throw new Error(`MODEL_OUTPUT_VALIDATION_FAILED: ${validated.error}`);
    }

    return {
      mode: PROVIDER_MODES.OPENAI_COMPATIBLE,
      text,
      inspection: safePayload.inspection,
    };
  }
}
