/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — EVIDENCE ENGINE (PHASE 3)
 * 
 * Responsibilities:
 * 1. Post-Plan Entity & Context Resolution (Products, Warehouses, Time ranges).
 * 2. Follow-up / Deictic Resolution using Conversation State.
 * 3. Ambiguity Guard: Blocks auto-execution on ambiguous entity references.
 * 4. Evidence Packet Construction (Clean telemetry & audit trail).
 * 5. Evidence Verifier (Tenant isolation, Write invariant, Data boundary checks).
 * 6. Grounded Response Composer (Answers generated strictly from verified evidence).
 *    - Real Provider composer if available; deterministic fallback if offline.
 *    - Invariants: COMPOSER_CAN_REPLAN = NO, COMPOSER_CAN_SELECT_NEW_TOOL = NO, COMPOSER_CAN_INVENT_BUSINESS_NUMBER = NO.
 */

import { resolveProduct, resolveWarehouse, resolveOrder, resolveCustomer } from './resolver.js';
import { resolveDateInterval, resolveTemporalRange } from './tools.js';
import { getCapability } from './capability-registry.js';
import { reportToolError, reportToolSelectedNotExecuted } from './error-reporter.js';
import { getLastResolvedEntity, getLastTimeRange } from './conversation-state.js';
import { dispatchSemanticPlanning, getProviderConfig } from './providers.js';
import {
  canonicalizeVietnamese,
  parseVietnameseTaxCode,
  parseVietnameseBank,
  parseVietnamesePaymentTerm,
  parseVietnameseDiscount,
  parseVietnameseShippingFee,
  parseVietnameseCustomer,
  extractVietnameseOrderItems,
} from './vietnamese-nlp.js';
import { extractQuantityAndUnit } from './dictionary.js';

/**
 * 1. Post-Plan Entity & Context Resolution (with Deictic / Conversation Context Support)
 * Model identifies semantic entity targets; Deterministic Resolver binds actual DB IDs.
 * Rules:
 * - EXACT / STRONG_MATCH / DEICTIC: binds entity ID.
 * - AMBIGUOUS: returns AMBIGUOUS_ENTITY -> blocks execution, prompts user.
 * - NOT_FOUND: returns ENTITY_NOT_FOUND -> prompts user.
 * - MODEL NEVER INVENTS ENTITY IDS.
 * - DEICTIC_BINDING_OWNER = RESOLVER_LAYER.
 */
export function resolveIntentEntities(intent, context = {}, state = {}) {
  const entities = intent.entities || {};
  const products = state?.data?.products || [];
  const warehouses = state?.data?.warehouses || [];
  const orders = state?.data?.orders || [];
  const customers = state?.data?.customers || [];
  const rawPrompt = context.rawPrompt || context.raw_prompt || context.user_prompt || intent.entities?.query || '';

  const resolution = {
    productId: null,
    productName: null,
    warehouseId: null,
    warehouseName: null,
    orderId: null,
    customerId: null,
    timeRange: null,
    isAmbiguous: false,
    ambiguousCandidates: [],
    notFound: false,
    resolutionType: 'NONE',
  };

  // 1.A. Product Resolution
  let prodQuery = entities.productId || entities.product_id || entities.productName || entities.product_name || entities.product || entities.item || null;
  // Fix model number misclassified as price or severed from product name (e.g., 'ghế 150')
  if (prodQuery && /^(?:ghe|gối|goi|dem|đệm)\s*$/i.test(String(prodQuery).trim())) {
    const rawP = String(context.rawPrompt || context.user_prompt || '');
    const modelMatch = rawP.match(/(?:ghế|ghe)\s*(135|150|90D|90T|95)/i) ||
                       rawP.match(/(?:gối|goi)\s*(f1|f3\/?c?|f4\/?(?:09)?|f5|f6)/i) ||
                       rawP.match(/(?:đệm|dem)\s*(thiền|thien)/i);
    if (modelMatch) {
      prodQuery = `${prodQuery} ${modelMatch[1]}`;
    }
  }
  const boundProdId = context.current_product_id || state?.currentProductId || null;
  const prodNorm = prodQuery ? canonicalizeVietnamese(String(prodQuery)) : '';
  const isDeictic = prodQuery && ['cai nay', 'hang nay', 'mon nay', 'sp nay', 'san pham nay', 'nay', 'no', 'cai do', 'mon do'].includes(prodNorm);
  const lastSessionProduct = getLastResolvedEntity('product');

  if (isDeictic && boundProdId) {
    const bound = products.find(p => p.id === boundProdId);
    if (bound) {
      resolution.productId = bound.id;
      resolution.productName = bound.name;
      resolution.resolutionType = 'DEICTIC_SCREEN';
    }
  } else if (isDeictic && lastSessionProduct) {
    // Follow-up deictic reference from conversation context (e.g. "cái này có nên nhập không?")
    const bound = products.find(p => p.id === lastSessionProduct.id) || lastSessionProduct;
    resolution.productId = bound.id;
    resolution.productName = bound.name;
    resolution.resolutionType = 'DEICTIC_CONVERSATION_CONTEXT';
  } else if (prodQuery) {
    const prodRes = resolveProduct(String(prodQuery), products, context);
    if (prodRes.isAmbiguous) {
      resolution.isAmbiguous = true;
      resolution.ambiguousCandidates = prodRes.candidates || [];
      resolution.resolutionType = 'AMBIGUOUS';
    } else if (prodRes.bestMatch) {
      resolution.productId = prodRes.bestMatch.id;
      resolution.productName = prodRes.bestMatch.name;
      resolution.resolutionType = prodRes.isExact ? 'EXACT' : 'STRONG_MATCH';
      
      // Auto-populate items array for orders and promotions
      const mainQty = Number(entities.quantity || entities.qty || 1);
      const items = [{
        productId: prodRes.bestMatch.id,
        productName: prodRes.bestMatch.name,
        quantity: mainQty,
        price: prodRes.bestMatch.price || 0
      }];
      const giftQuery = entities.gift || (context.rawPrompt && context.rawPrompt.match(/tặng\s*(?:kèm)?\s*(\d+)?\s*(.+?)(?:\s+cho\s+|$)/i)?.[2]);
      if (giftQuery) {
        const giftRes = resolveProduct(String(giftQuery), products, context);
        if (giftRes && giftRes.bestMatch) {
          items.push({
            productId: giftRes.bestMatch.id,
            productName: giftRes.bestMatch.name,
            quantity: 1,
            price: 0,
            discount: 100,
            note: 'Quà tặng kèm'
          });
        }
      }
      resolution.items = items;
    } else {
      resolution.notFound = true;
      resolution.resolutionType = 'NOT_FOUND';
    }
  } else if (boundProdId) {
    const bound = products.find(p => p.id === boundProdId);
    if (bound) {
      resolution.productId = bound.id;
      resolution.productName = bound.name;
      resolution.resolutionType = 'DEICTIC_SCREEN_CONTEXT';
    }
  } else if (lastSessionProduct && (intent.required_capability === 'explain_replenishment' || intent.required_capability === 'check_stock' || intent.required_capability === 'price_lookup')) {
    // Subject omitted follow-up query (e.g. "vậy có nên nhập thêm không?", "giá bao nhiêu?")
    const bound = products.find(p => p.id === lastSessionProduct.id) || lastSessionProduct;
    resolution.productId = bound.id;
    resolution.productName = bound.name;
    resolution.resolutionType = 'OMITTED_SUBJECT_CONVERSATION_CONTEXT';
  }

  // 1.B. Warehouse Resolution
  let whQuery = entities.warehouseId || entities.warehouse || context.warehouse_id || null;
  if (!whQuery && rawPrompt) {
    const pLow = rawPrompt.toLowerCase();
    if (pLow.includes('ha dong') || pLow.includes('hà đông')) {
      whQuery = 'wh_hadong';
    } else if (pLow.includes('trung tam') || pLow.includes('trung tâm')) {
      whQuery = 'wh_center';
    }
  }
  const isDeicticWh = whQuery && ['kho nay', 'kho do', 'kho kia', 'kho khac'].includes(String(whQuery).toLowerCase().trim());
  const lastSessionWh = getLastResolvedEntity('warehouse');

  if (isDeicticWh && warehouses.length > 1 && lastSessionWh) {
    // If user says "còn kho kia?", pick the other warehouse
    const otherWh = warehouses.find(w => w.id !== lastSessionWh.id);
    if (otherWh) {
      resolution.warehouseId = otherWh.id;
      resolution.warehouseName = otherWh.name;
    } else {
      resolution.warehouseId = warehouses[0]?.id || 'wh_center';
      resolution.warehouseName = warehouses[0]?.name || 'Kho Trung Tâm';
    }
  } else if (whQuery && whQuery !== 'all') {
    const whRes = resolveWarehouse(String(whQuery), warehouses, context);
    if (whRes.bestMatch) {
      resolution.warehouseId = whRes.bestMatch.id;
      resolution.warehouseName = whRes.bestMatch.name;
    } else {
      resolution.warehouseId = (warehouses[0] || {}).id || 'wh_center';
    }
  } else {
    resolution.warehouseId = 'all';
  }

  // 1.C. Temporal Resolution (Canonical Date Interval Resolver + Follow-up)
  const timeQuery = intent.time_range || entities.period || null;
  const rawText = entities?.query || context?.rawPrompt || context?.user_prompt || '';

  if (timeQuery) {
    const interval = resolveDateInterval(String(timeQuery));
    resolution.timeRange = {
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      label: interval.label,
      code: interval.periodKey || timeQuery,
      time_origin: 'INTENT_SPECIFIC',
    };
  } else {
    const promptTr = resolveTemporalRange(rawText);
    if (promptTr.isExplicit) {
      resolution.timeRange = {
        start: promptTr.start.toISOString(),
        end: promptTr.end.toISOString(),
        label: promptTr.label,
        code: promptTr.code,
        time_origin: 'EXPLICIT_PROMPT',
      };
    } else {
      const lastTr = getLastTimeRange();
      if (lastTr && intent.domain === 'FINANCE') {
        const interval = resolveDateInterval(String(lastTr));
        resolution.timeRange = {
          start: interval.start.toISOString(),
          end: interval.end.toISOString(),
          label: interval.label,
          code: interval.periodKey || String(lastTr),
          time_origin: 'CONVERSATION_CONTEXT',
        };
      } else {
        const defaultInterval = resolveDateInterval('today');
        resolution.timeRange = {
          start: defaultInterval.start.toISOString(),
          end: defaultInterval.end.toISOString(),
          label: defaultInterval.label,
          code: 'today',
          time_origin: 'DEFAULT',
        };
      }
    }
  }

  // 1.D. Multi-Item Resolution for Orders, Invoices, and Batch Issues
  if (Array.isArray(entities.items) && entities.items.length > 0) {
    resolution.items = entities.items.map(it => {
      const q = it.productName || it.product_name || it.item_name || it.description || it.item || it.product || it.name || it.productId || it.itemId || '';
      const prodRes = resolveProduct(String(q), products, context);
      const prod = prodRes.bestMatch || products.find(p => p.id === it.productId || p.id === it.itemId);
      return {
        productId: prod?.id || it.productId || null,
        itemId: prod?.id || it.itemId || it.productId || null,
        productName: prod?.name || it.productName || it.product_name || it.name || 'Sản phẩm',
        unit: prod?.unit || it.unit || 'cái',
        quantity: Math.max(1, Number(it.quantity || it.qty || 1)),
        unitPrice: Number(it.unitPrice || it.price || prod?.price || 0),
      };
    });

    if (resolution.items.some(i => !i.productId) && rawPrompt) {
      const extracted = extractVietnameseOrderItems(rawPrompt, products);
      if (extracted.length > 0) {
        resolution.items = extracted;
      }
    }

    resolution.lines = resolution.items.map(e => ({ productId: e.productId, productName: e.productName, qty: e.quantity, unit: e.unit }));
    if (resolution.items.length === 1) {
      resolution.productId = resolution.items[0].productId;
      resolution.productName = resolution.items[0].productName;
      resolution.qty = resolution.items[0].quantity;
    }
  } else if (rawPrompt && (intent.required_capability === 'order_proposal' || intent.required_capability === 'electronic_invoice_proposal' || intent.required_capability === 'issue_proposal')) {
    const extracted = extractVietnameseOrderItems(rawPrompt, products);
    if (extracted.length > 0) {
      resolution.items = extracted;
      resolution.lines = extracted.map(e => ({ productId: e.productId, productName: e.productName, qty: e.quantity, unit: e.unit }));
      if (extracted.length === 1) {
        resolution.productId = extracted[0].productId;
        resolution.productName = extracted[0].productName;
        resolution.qty = extracted[0].quantity;
      }
    }
  }

  if (!resolution.productId && (entities.item || entities.product_name || entities.productName)) {
    const q = entities.item || entities.product_name || entities.productName;
    const prodRes = resolveProduct(String(q), products, context);
    if (prodRes.bestMatch) {
      resolution.productId = prodRes.bestMatch.id;
      resolution.productName = prodRes.bestMatch.name;
    }
  }

  if (!resolution.qty && (entities.quantity || entities.qty)) {
    resolution.qty = Number(entities.quantity || entities.qty);
  }

  if (!resolution.qty && rawPrompt) {
    const qExt = extractQuantityAndUnit(rawPrompt);
    if (qExt?.quantity) resolution.qty = qExt.quantity;
  }

  // 1.E. Vietnamese Commerce Entities (Tax, Customer, Discount, Payment Term, Bank)
  if (rawPrompt) {
    const parsedCust = parseVietnameseCustomer(rawPrompt);
    const isDebtOrSearchQuery = intent.required_capability === 'get_customer_debt_summary' || 
                                intent.required_capability === 'search_customers' || 
                                intent.domain === 'FINANCE';
    resolution.customerName = entities.customerName || entities.customer_name || parsedCust.name || parsedCust.company || (isDebtOrSearchQuery ? null : 'Khách lẻ');
    resolution.customerPhone = entities.customerPhone || entities.customer_phone || parsedCust.phone || '';
    resolution.companyName = entities.companyName || parsedCust.company || '';
    resolution.address = entities.address || parsedCust.address || '';
    resolution.taxCode = entities.taxCode || parseVietnameseTaxCode(rawPrompt) || '';
    resolution.paymentMethod = entities.paymentMethod || parseVietnameseBank(rawPrompt) || (rawPrompt.toLowerCase().includes('tien mat') ? 'TM' : (resolution.taxCode ? 'CK' : 'TM'));
    resolution.paymentTermDays = entities.paymentTermDays ?? parseVietnamesePaymentTerm(rawPrompt) ?? 0;
    resolution.discount = entities.discount ?? parseVietnameseDiscount(rawPrompt) ?? 0;
    resolution.shippingFee = entities.shippingFee ?? parseVietnameseShippingFee(rawPrompt) ?? 0;
    const reasonMatch = rawPrompt.match(/(?:lý do|ly do|do|muc dich|mục đích)[:\s]*([^,.\n]+)/i);
    resolution.reason = entities.reason || (reasonMatch ? reasonMatch[1].trim() : 'Đề xuất xuất kho từ trợ lý AI');
  }

  return resolution;
}

/**
 * 2. Build Evidence Packet
 * Encapsulates full execution evidence for a tool.
 */
export function buildEvidencePacket({
  capability,
  toolBinding,
  resolvedContext,
  rawResult,
  context = {},
  state = {},
}) {
  const shopId = context.shop_id || 'shop_default';
  const isProposal = Boolean(rawResult?.proposal || rawResult?.isProposal);

  return {
    capability_id: capability.capability_id,
    tool_binding: toolBinding,
    shop_id: shopId,
    warehouse_id: resolvedContext.warehouseId || 'all',
    entity_id: resolvedContext.productId || resolvedContext.orderId || null,
    entity_type: capability.entity_types?.[0] || 'GENERAL',
    time_range: resolvedContext.timeRange,
    data_authority: 'INDEXED_DB_LOCAL',
    fetched_at: new Date().toISOString(),
    payload: rawResult,
    status: rawResult?.status || (rawResult?.error ? 'ERROR' : 'SUCCESS'),
    is_proposal: isProposal,
    error: rawResult?.error || null,
  };
}

/**
 * 3. Evidence Verifier
 * Verifies that the evidence packet adheres to all invariant rules.
 */
export function verifyEvidencePacket(packet, capability, context = {}, state = {}) {
  // Invariant 1: Tenant / Shop boundary
  const currentShopId = context.shop_id || 'shop_default';
  if (packet.shop_id && packet.shop_id !== currentShopId) {
    return { verified: false, failureReason: 'TENANT_BOUNDARY_MISMATCH' };
  }

  // Invariant 2: Mode invariant (READ intent must NEVER produce a committed mutation)
  if (capability.mode === 'READ' && packet.payload?.mutationCommitted === true) {
    return { verified: false, failureReason: 'UNAUTHORIZED_MUTATION_IN_READ_CAPABILITY' };
  }

  // Invariant 3: Required entity check
  if (capability.entity_types && capability.entity_types.includes('product') && capability.input_schema?.productId?.required) {
    if (!packet.entity_id && packet.status === 'SUCCESS') {
      return { verified: false, failureReason: 'MISSING_REQUIRED_ENTITY_BINDING' };
    }
  }

  // Invariant 4: Freshness check
  if (packet.fetched_at) {
    const ageMs = Date.now() - new Date(packet.fetched_at).getTime();
    if (ageMs > 60000) {
      return { verified: false, failureReason: 'STALE_EVIDENCE_TIMESTAMP' };
    }
  }

  return { verified: true, failureReason: null };
}

/**
 * Deterministic presentation fallback from verified evidence packets.
 */
export function composeDeterministicResponseFromEvidence(validPackets, failedPackets = []) {
  const textSections = [];
  const combinedSuggestions = [];
  const combinedActions = [];
  let primaryProposal = null;

  for (const p of validPackets) {
    const res = p.packet?.payload || p.payload || {};
    const textContent = res.text ? String(res.text).trim() : '';
    if (textContent && !textSections.includes(textContent)) {
      textSections.push(textContent);
    }
    if (Array.isArray(res.suggestions)) {
      combinedSuggestions.push(...res.suggestions);
    }
    if (Array.isArray(res.actions)) {
      combinedActions.push(...res.actions);
    }
    if ((p.packet?.is_proposal || p.is_proposal) && !primaryProposal) {
      primaryProposal = res.proposal || res;
    }
  }

  if (failedPackets.length > 0) {
    textSections.push(`*(Lưu ý: Một phần dữ liệu (${failedPackets.map(f => f.packet?.capability_id || f.capability_id).join(', ')}) không vượt qua kiểm toán bằng chứng an toàn nên đã được lược bỏ).*`);
  }

  // Safety Shield: Never return empty text when packets were verified
  if (textSections.length === 0 && validPackets.length > 0) {
    for (const p of validPackets) {
      const res = p.packet?.payload || p.payload || {};
      if (Array.isArray(res.candidates) && res.candidates.length > 0) {
        const fmt = new Intl.NumberFormat('vi-VN');
        const lines = res.candidates.slice(0, 5).map(c => 
          `• **${c.name}** (SKU: \`${c.sku || 'N/A'}\` | Mã vạch: \`${c.barcode || 'N/A'}\` | Tồn: **${c.available ?? c.onHand ?? 0}** | Giá: **${fmt.format(c.price || 0)} ₫**)`
        ).join('\n');
        textSections.push(`🔍 **Kết quả tra cứu:**\n\n${lines}`);
      } else if (res.message) {
        textSections.push(String(res.message).trim());
      } else if (res.count === 0 || (Array.isArray(res.candidates) && res.candidates.length === 0)) {
        textSections.push(`🔍 Hệ thống đã kiểm tra nhưng không tìm thấy bản ghi dữ liệu phù hợp với yêu cầu của bạn.`);
      }
    }
  }

  if (textSections.length === 0) {
    textSections.push('✓ Yêu cầu đã được kiểm tra trên hệ thống.');
  }

  return {
    text: textSections.join('\n\n---\n\n'),
    suggestions: [...new Set(combinedSuggestions)].slice(0, 5),
    actions: combinedActions.slice(0, 4),
    proposal: primaryProposal,
  };
}

/**
 * 4. Grounded Response Composer
 * Strictly formats final answer based on verified evidence packets.
 * If Real Provider is active, utilizes model for natural phrasing while strictly enforcing grounding.
 * Otherwise, uses deterministic presentation.
 * Invariants:
 * - COMPOSER_CAN_REPLAN = NO
 * - COMPOSER_CAN_SELECT_NEW_TOOL = NO
 * - COMPOSER_CAN_INVENT_BUSINESS_NUMBER = NO
 */
export async function composeGroundedResponse({
  plan,
  evidencePackets,
  userPrompt,
  context = {},
  options = {},
}) {
  const validPackets = evidencePackets.filter(p => p.verified);
  const failedPackets = evidencePackets.filter(p => !p.verified);

  if (validPackets.length === 0) {
    return {
      text: '⚠️ **Không thể xác thực dữ liệu:** Hệ thống không tìm thấy bằng chứng hợp lệ để trả lời yêu cầu của bạn một cách an toàn.',
      status: 'VERIFICATION_FAILED',
      evidence_verified: false,
      composer_provider: 'NONE',
      composer_model: 'none',
      is_real_composer: false,
    };
  }

  // Build deterministic baseline
  const deterministicBase = composeDeterministicResponseFromEvidence(validPackets, failedPackets);

  // Optimization per Section 8: avoid duplicate provider calls; avoid calling model for response composition when deterministic grounded rendering is sufficient
  const allowModelComposer = options.useModelComposer === true;

  if (allowModelComposer) {
    try {
      const evidenceDataForModel = validPackets.map(p => ({
        capability: p.packet.capability_id,
        entity_id: p.packet.entity_id,
        warehouse: p.packet.warehouse_id,
        time_range: p.packet.time_range?.label,
        is_proposal: p.packet.is_proposal,
        content: p.packet.payload?.text?.slice(0, 500) || p.packet.payload,
      }));

      const composerPrompt = `[BẰNG CHỨNG XÁC THỰC DUY NHẤT TỪ HỆ THỐNG QUẢN LÝ KHO]
${JSON.stringify(evidenceDataForModel, null, 2)}

[CÂU HỎI CỦA NGƯỜI DÙNG]
${userPrompt}

[QUY TẮC BẮT BUỘC CHO GROUNDED COMPOSER]:
1. Trả lời trực tiếp câu hỏi người dùng bằng tiếng Việt tự nhiên, chuẩn xác, ưu tiên ngắn gọn và dễ hiểu.
2. NGUYÊN TẮC BẰNG CHỨNG (GROUNDING): CHỈ sử dụng dữ liệu có trong [BẰNG CHỨNG XÁC THỰC DUY NHẤT]. Tuyệt đối KHÔNG tự sáng tác, bịa đặt thêm số liệu, số lượng tồn, giá tiền, hay trạng thái không có trong bằng chứng.
3. Nếu người dùng hỏi nhiều ý (multi-intent), hãy phân tách rõ ràng từng ý.
4. Nếu có đề xuất nhập kho/chuyển kho (proposal), phải nêu rõ đây là ĐỀ XUẤT CHỜ DUYỆT, CHƯA ĐƯỢC ghi vào hệ thống.
5. Tuyệt đối KHÔNG lập kế hoạch mới, KHÔNG gợi ý gọi thêm công cụ khác.`;

      const providerRes = await dispatchSemanticPlanning({
        promptText: composerPrompt,
        config,
        timeoutMs: options.composerTimeoutMs || 3000,
        context,
      });

      if (providerRes && providerRes.success && providerRes.rawText && providerRes.rawText.trim().length > 10) {
        return {
          text: providerRes.rawText.trim(),
          status: 'SUCCESS',
          evidence_verified: true,
          proposal: deterministicBase.proposal,
          suggestions: deterministicBase.suggestions,
          actions: deterministicBase.actions,
          evidence_count: validPackets.length,
          composer_provider: providerRes.provider,
          composer_model: providerRes.model,
          is_real_composer: true,
        };
      }
    } catch (composerErr) {
      console.warn('[Grounded Response Composer Error]:', composerErr);
    }
  }

  // Fallback to deterministic presentation
  return {
    text: deterministicBase.text,
    status: 'SUCCESS',
    evidence_verified: true,
    proposal: deterministicBase.proposal,
    suggestions: deterministicBase.suggestions,
    actions: deterministicBase.actions,
    evidence_count: validPackets.length,
    composer_provider: 'DETERMINISTIC_COMPOSER',
    composer_model: 'grounded-template',
    is_real_composer: false,
  };
}

/**
 * Legacy composeResponseFromEvidence wrapper for backwards compatibility.
 */
export function composeResponseFromEvidence({ plan, evidencePackets, userPrompt, context }) {
  const validPackets = evidencePackets.filter(p => p.verified);
  const failedPackets = evidencePackets.filter(p => !p.verified);
  if (validPackets.length === 0) {
    return {
      text: '⚠️ **Không thể xác thực dữ liệu:** Hệ thống không tìm thấy bằng chứng hợp lệ để trả lời yêu cầu của bạn một cách an toàn.',
      status: 'VERIFICATION_FAILED',
      evidence_verified: false,
    };
  }
  const base = composeDeterministicResponseFromEvidence(validPackets, failedPackets);
  return {
    ...base,
    status: 'SUCCESS',
    evidence_verified: true,
    evidence_count: validPackets.length,
  };
}
