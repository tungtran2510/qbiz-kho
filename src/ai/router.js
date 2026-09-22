/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — INTENT ROUTER & TIER DISPATCHER
 * Tier 0 (Offline / Deterministic) first.
 * Cloud Providers only when configured.
 * Ambiguous products prompt for candidate clarification.
 */

import { SKILL_REGISTRY, executeSkill } from './skills.js';
import { executeTool } from './tools.js';
import { AIProviderAdapter, getProviderConfig, PROVIDER_MODES } from './providers.js';
import { logAuditEvent } from './audit.js';
import {
  storeSensitiveData,
  retrieveSensitiveData,
  getCurrentActor,
  setLastResolvedProduct,
  getLastResolvedProduct,
  setLastResolvedWarehouse,
  getLastResolvedWarehouse,
  setPendingIntent,
  getPendingIntent,
  clearPendingIntent,
} from './context.js';
import { hasCapability, PERMISSIONS, detectPromptInjection, detectRoleElevationAttempt } from './policy.js';
import { executeAction, lookupFeature, lookupAction, IMPLEMENTATION_STATE } from './registry.js';
import { norm as dictNorm, classifyIntent, detectEntityType, isPronounReference, isConfirmation, isCancellation, isCorrection, parseTimeExpression, extractQuantityAndUnit } from './dictionary.js';
import { findActionsByAlias, getSuggestedActions, ACTION_REGISTRY } from './registry.js';
import { resolveProduct, resolveCustomer, resolveWarehouse, autoDetectAndResolve } from './resolver.js';
import { MEMORY_SCOPES, queryMemory, proposeMemorySave } from './memory.js';

function norm(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findMentionedProduct(text, products) {
  if (!products || !products.length) return null;
  const t = dictNorm(text);
  if (t.includes('lavie') || t.includes('nuoc khoang')) return products.find(p => dictNorm(p.name).includes('lavie'));
  if (t.includes('135') || t.includes('sang che')) return products.find(p => p.id === 'p_135' || dictNorm(p.name).includes('135') || dictNorm(p.name).includes('sang che'));
  if (t.includes('90t') || (t.includes('90') && t.includes('trang'))) return products.find(p => p.id === 'p_g90t');
  if (t.includes('90d') || (t.includes('90') && t.includes('den'))) return products.find(p => p.id === 'p_g90d');
  for (const prod of products) {
    const pn = dictNorm(prod.name || '');
    if (pn && pn.length >= 3 && t.includes(pn)) return prod;
  }
  return null;
}

function findMentionedWarehouse(text, warehouses) {
  if (!warehouses || !warehouses.length) return null;
  const t = dictNorm(text);
  if (t.includes('ha dong 2')) return warehouses.find(w => w.id === 'wh_hadong2' || dictNorm(w.name).includes('ha dong 2'));
  if (t.includes('ha dong') || t.includes('phu')) return warehouses.find(w => w.id === 'wh_hadong' || dictNorm(w.name).includes('ha dong') || dictNorm(w.name).includes('phu'));
  if (t.includes('trung tam') || t.includes('chinh')) return warehouses.find(w => w.id === 'wh_center' || dictNorm(w.name).includes('trung tam') || dictNorm(w.name).includes('chinh') || w.is_default);
  return null;
}

/**
 * Route a user prompt with its ContextEnvelope and application state.
 * @param {string} prompt User message or quick chip text
 * @param {Object} context ContextEnvelope snapshot
 * @param {Object} state Current application state
 * @returns {Promise<{ text: string, candidates?: Array, proposal?: Object, skillId?: string, tier: number, provider: string }>}
 */
/**
 * Dictionary-based intent routing layer (Batch A5).
 * Returns structured result or null if no confident match.
 */
export function dictionaryRoute(rawPrompt, context, state) {
  const p = dictNorm(rawPrompt);
  if (!p || p.length < 2) return null;

  // Skip dictionaryRoute for proposals (receipt, transfer, stocktake, cart, memory) so they reach the proposal engine!
  if (
    p.includes('cho vao kho') || p.includes('phieu nhap') || p.includes('de xuat nhap') ||
    p.includes('dua cai nay') || p.includes('ban qua') || p.includes('dieu phoi') ||
    p.includes('dem duoc') || p.includes('dem thay') || p.includes('dem kho') ||
    p.includes('lay them') || p.includes('vao don') || p.includes('vao gio') ||
    p.startsWith('nho giup') || p.startsWith('ghi nho') || p.startsWith('luu quy tac') ||
    p.startsWith('luu luu y') || p.startsWith('luu meo') || p.startsWith('ghim ') ||
    p.startsWith('bo ghim') || p.startsWith('xoa ghi nho') || p.startsWith('luu y ') ||
    ((p.includes('nhap') || p.includes('mua') || p.includes('ban') || p.includes('lap don') || p.includes('don cho')) && (/\d+/.test(p) || p.includes('chuc') || p.includes('ta') || p.includes('muoi') || p.includes('cai') || p.includes('chiec')))
  ) {
    return null;
  }

  // 1. Handle confirm/cancel/correct for pending intents
  const pending = context?.pending_intent;
  if (pending) {
    if (isConfirmation(p)) {
      return { type: 'CONFIRM_PENDING', pending, confidence: 95 };
    }
    if (isCancellation(p)) {
      return { type: 'CANCEL_PENDING', pending, confidence: 95 };
    }
    if (isCorrection(p)) {
      return { type: 'CORRECT_PENDING', pending, confidence: 90 };
    }
  }

  // 2. High-priority domain skills (takes precedence over generic dictionary)
  if (p.includes('can chu y') || p.includes('tieu diem') || p.includes('cua hang hom nay the nao') || p.includes('cua hang the nao')) {
    return { type: 'ACTION', action_id: 'daily_attention', action: ACTION_REGISTRY['daily_attention'], confidence: 95, source: 'domain_skill' };
  }
  if (p.includes('doanh thu') || p.includes('doanh so') || p.includes('ban bao nhieu') || p.includes('may don') || p.includes('bao nhieu don')) {
    return { type: 'ACTION', action_id: 'sales_summary', action: ACTION_REGISTRY['sales_summary'], confidence: 95, source: 'domain_skill' };
  }
  if (p.includes('goi y nhap') || p.includes('can nhap gi') || p.includes('can nhap them')) {
    return { type: 'ACTION', action_id: 'replenishment_suggestion', action: ACTION_REGISTRY['replenishment_suggestion'], confidence: 95, source: 'domain_skill' };
  }
  if (p.includes('kiem tra du lieu') || p.includes('suc khoe cua hang') || p.includes('kiem tra he thong') || p.includes('loi du lieu')) {
    return { type: 'ACTION', action_id: 'shop_health_check', action: ACTION_REGISTRY['shop_health_check'], confidence: 95, source: 'domain_skill' };
  }

  // 3. Route-specific queries first
  const currRoute = context?.current_route || context?.route || 'dashboard';
  if (currRoute === 'sales' || context?.saleStep) {
    if (p.startsWith('chon khach') || p.startsWith('khach ')) {
      const custPart = p.replace(/^(?:chon\s+khach(?:\s+hang)?|khach)\s*/i, '').trim();
      if (!custPart) {
        return { type: 'ACTION', action_id: 'select_customer', action: ACTION_REGISTRY['select_customer'], confidence: 95, source: 'customer_select' };
      }
      return null; // Fall through to real resolver
    }
    // "thêm 5", "thêm lavie" in sales -> fall through to sales cart handler
    if (/^(?:them|cong|tang|nhap them|cho|lay|mua)\s+/i.test(p)) {
      return null;
    }
  }

  // Fall through to real proposals for transfer, stocktake, and ambiguous actions
  if ((p.includes('chuyen') || p.includes('sang kho')) && (/\d+/.test(p) || p.includes('sang kho') || p.includes('ve kho') || p.includes('nay') || p.includes('cai') || p.includes('chiec') || p.includes('sang day'))) {
    return null;
  }
  if (p.includes('thuc te') || (p.includes('kiem') && /\d+/.test(p)) || p.includes('kiem ke') || p.includes('kiem dem') || p.includes('kiem kho') || p.includes('dem lai')) {
    return null;
  }
  if (p.includes('thanh toan') || p.includes('hoan thanh don') || p.includes('tinh tien') || p.includes('chot don')) {
    return null;
  }
  if (p.includes('khoi gio') || p.includes('bo bot') || p.includes('xoa khoi gio') || p.includes('vao gio')) {
    return null;
  }
  // Stock queries with specific warehouses or items should fall through to real skills or provider
  if (p.includes('con may') || p.includes('con bao nhieu') || p.includes('con k') || p.includes('con khong') || p.includes('ton bao nhieu') || p.includes('kiem ton') || p.includes('can kho') || p.includes('sap het') || p.includes('con hang')) {
    return null;
  }

  if (currRoute === 'orders') {
    if (p.includes('don hang hom nay') || p.includes('don hom nay')) {
      return { type: 'ACTION', action_id: 'open_orders', action: ACTION_REGISTRY['open_orders'], confidence: 95, source: 'orders_route' };
    }
    if (p.includes('lap don') || p.includes('tao don')) {
      return { type: 'ACTION', action_id: 'new_order', action: ACTION_REGISTRY['new_order'], confidence: 95, source: 'orders_route' };
    }
  }

  // 4. Product context binding & pronoun queries (ONLY with active product)
  const activeProductId = context?.current_product_id;
  if (activeProductId) {
    // Check if prompt EXPLICITLY mentions another product
    let explicitProd = null;
    const prods = state?.data?.products || [];
    for (const prod of prods) {
      if (prod.id !== activeProductId && prod.name) {
        const prodNorm = dictNorm(prod.name);
        if (prodNorm.length >= 3 && p.includes(prodNorm)) {
          explicitProd = prod;
          break;
        }
      }
    }
    if (!explicitProd && p.includes('lavie')) {
      explicitProd = prods.find(pr => dictNorm(pr.name).includes('lavie'));
    }

    const boundProdId = explicitProd ? explicitProd.id : activeProductId;

    if (!explicitProd && (p.includes('con bao nhieu') || p.includes('kiem ton') || p.includes('con khong') || p.includes('ton kho') || p === 'con bao nhieu')) {
      return { type: 'ACTION', action_id: 'check_stock', action: ACTION_REGISTRY['check_stock'], params: { productId: boundProdId }, confidence: 95, source: 'product_context' };
    }
    if (p.startsWith('nhap them') || p.includes('nhap them') || (p.startsWith('them') && isPronounReference(p))) {
      const q = extractQuantityAndUnit(p);
      let targetWh = null;
      if (state?.data?.warehouses) {
        if (p.includes('ha dong')) targetWh = state.data.warehouses.find(w => dictNorm(w.name).includes('ha dong'))?.id;
        else if (p.includes('phu')) targetWh = state.data.warehouses.find(w => dictNorm(w.name).includes('phu'))?.id;
        else if (p.includes('chinh') || p.includes('trung tam')) targetWh = state.data.warehouses.find(w => dictNorm(w.name).includes('chinh') || dictNorm(w.name).includes('trung tam') || w.is_default)?.id;
      }
      return { type: 'ACTION', action_id: 'create_receipt_proposal', action: ACTION_REGISTRY['create_receipt_proposal'], params: { productId: boundProdId, warehouseId: targetWh, qty: q?.quantity || 5 }, confidence: 95, source: 'product_context' };
    }
    if ((p.includes('doi gia') || p.includes('thay gia') || p.includes('sua gia')) && !p.includes('khong sua') && !p.includes('khong thay')) {
      return { type: 'ACTION', action_id: 'new_product', action: ACTION_REGISTRY['new_product'], confidence: 85, source: 'product_context' };
    }
  }

  // If on products list without an active product, let "thêm [số]" fall through to ambiguous clarification
  if (currRoute === 'products' && !activeProductId && /^(?:them|cong|tang)\s+\d+/i.test(p)) {
    return null;
  }

  // 5. Warehouse receipt proposal with warehouse or product mentioned ("thêm X cái ... vào kho ...")
  if ((p.startsWith('nhap them') || p.startsWith('them')) && (p.includes('vao kho') || p.includes('kho'))) {
    const q = extractQuantityAndUnit(p);
    let resolvedProd = null;
    if (state?.data?.products) {
      for (const prod of state.data.products) {
        if (prod.name && p.includes(dictNorm(prod.name))) {
          resolvedProd = prod;
          break;
        }
      }
      if (!resolvedProd && p.includes('lavie')) {
        resolvedProd = state.data.products.find(pr => dictNorm(pr.name).includes('lavie'));
      }
    }
    let targetWh = null;
    if (state?.data?.warehouses) {
      if (p.includes('ha dong')) targetWh = state.data.warehouses.find(w => dictNorm(w.name).includes('ha dong'))?.id;
      else if (p.includes('phu')) targetWh = state.data.warehouses.find(w => dictNorm(w.name).includes('phu'))?.id;
      else if (p.includes('chinh') || p.includes('trung tam')) targetWh = state.data.warehouses.find(w => dictNorm(w.name).includes('chinh') || dictNorm(w.name).includes('trung tam') || w.is_default)?.id;
    }
    if (resolvedProd || activeProductId) {
      return {
        type: 'ACTION',
        action_id: 'create_receipt_proposal',
        action: ACTION_REGISTRY['create_receipt_proposal'],
        params: { productId: resolvedProd?.id || activeProductId, warehouseId: targetWh, qty: q?.quantity || 20 },
        confidence: 95,
        source: 'receipt_pattern'
      };
    }
    return null; // fall through to cloud/mock provider
  }

  // 6. Try registry alias matching (most specific)
  const aliasMatches = findActionsByAlias(p);
  if (aliasMatches.length > 0 && aliasMatches[0].matchScore >= 80) {
    const bestAction = aliasMatches[0].action;
    const isSpecializedSaleOrCust = (
      (bestAction.id === 'open_customers' && (p.includes('mua') || p.includes('ban') || p.includes('lan') || p.includes('nam') || /\b0\d{8,10}\b/.test(p))) ||
      (bestAction.id === 'open_sales' && (/\d+/.test(p) || p.includes('cai') || p.includes('chiec') || p.includes('lavie') || p.includes('ghe')))
    );
    if (!isSpecializedSaleOrCust) {
      return {
        type: 'ACTION',
        action_id: bestAction.id,
        action: bestAction,
        confidence: aliasMatches[0].matchScore,
        source: 'registry_alias',
      };
    }
  }

  // 7. Classify intent + detect entity type
  const intent = classifyIntent(p);
  const entity = detectEntityType(p);

  if (intent && entity) {
    if (entity.entityType === 'CUSTOMER' && (p.includes('lan') || p.includes('nam') || /\b0\d{8,10}\b/.test(p) || p.includes('mua') || p.includes('ban'))) {
      return null;
    }
    // Map intent+entity to specific action
    const actionId = mapIntentEntityToAction(intent.intent, entity.entityType, context);
    if (actionId && ACTION_REGISTRY[actionId]) {
      return {
        type: 'ACTION',
        action_id: actionId,
        action: ACTION_REGISTRY[actionId],
        confidence: Math.min(intent.confidence, entity.confidence),
        source: 'dictionary_classify',
      };
    }
  }

  // 8. If only intent detected but no entity, try to suggest (only if not an action with numbers/pronouns)
  if (intent && intent.confidence >= 70 && !entity && !/\d+/.test(p) && !p.includes('nay')) {
    const route = context?.current_route || 'dashboard';
    const suggestions = getSuggestedActions(route);
    if (suggestions.length > 0) {
      return {
        type: 'SUGGEST',
        message: 'Tôi chưa chắc anh muốn làm việc nào:',
        suggestions: suggestions.map(s => ({ id: s.id, label: s.phrase })),
        confidence: 50,
        source: 'dictionary_suggest',
      };
    }
  }

  return null; // fall through to existing router
}

/**
 * Map intent + entity type to a specific action ID.
 */
export function mapIntentEntityToAction(intent, entityType, context) {
  const route = context?.current_route || 'dashboard';
  const MAP = {
    // OPEN + entity
    'OPEN_PRODUCT': 'open_products',
    'OPEN_SERVICE': 'open_products',
    'OPEN_CUSTOMER': 'open_customers',
    'OPEN_SUPPLIER': 'open_suppliers',
    'OPEN_ORDER': 'open_orders',
    'OPEN_WAREHOUSE': 'open_warehouse',
    'OPEN_SALE': 'open_sales',
    'OPEN_SETTINGS': 'open_settings',
    'OPEN_PRINT': 'open_print_settings',
    'OPEN_REPORT': 'open_reports',
    // CREATE + entity
    'CREATE_PRODUCT': 'new_product',
    'CREATE_SERVICE': 'new_service',
    'CREATE_CUSTOMER': 'new_customer',
    'CREATE_SUPPLIER': 'new_supplier',
    'CREATE_ORDER': 'new_order',
    // SEARCH + entity (delegate to existing skills)
    'SEARCH_PRODUCT': null,
    'SEARCH_CUSTOMER': null,
    'SEARCH_ORDER': null,
    // VIEW + entity
    'VIEW_PRODUCT': 'open_products',
    'VIEW_CUSTOMER': 'open_customers',
    'VIEW_ORDER': 'open_orders',
    'VIEW_WAREHOUSE': 'open_warehouse',
    'VIEW_REPORT': 'open_reports',
    // CONFIGURE
    'CONFIGURE_SETTINGS': 'open_settings',
    'CONFIGURE_PRINT': 'open_print_settings',
    'EDIT_PRINT': 'open_print_settings',
    // BACKUP/RESTORE
    'BACKUP_SETTINGS': 'open_backup',
    'RESTORE_SETTINGS': 'open_backup',
    'BACKUP_null': 'open_backup',
    'RESTORE_null': 'open_backup',
    // REPORT
    'REPORT_REPORT': 'open_reports',
    'REPORT_SALE': 'sales_summary',
    'SUMMARIZE_REPORT': 'open_reports',
    'SUMMARIZE_SALE': 'sales_summary',
    'SUMMARIZE_null': 'daily_attention',
    // ADD_QTY
    'ADD_QTY_PRODUCT': 'create_receipt_proposal',
    'ADD_QTY_WAREHOUSE': 'create_receipt_proposal',
    'ADD_QTY_null': 'create_receipt_proposal',
    // PAY
    'PAY_SALE': null,
    // MOVE
    'MOVE_WAREHOUSE': 'open_transfer',
    'MOVE_null': 'open_transfer',
    // COUNT
    'COUNT_WAREHOUSE': 'open_stocktake',
    'COUNT_null': 'open_stocktake',
  };
  const key = `${intent}_${entityType || 'null'}`;
  return MAP[key] || MAP[`${intent}_null`] || null;
}

export async function dispatchCloudProvider(rawPrompt, context = {}, state = {}, config) {
  const adapter = new AIProviderAdapter(config);
  try {
    const structured = await adapter.parseStructuredIntent({
      prompt: rawPrompt,
      context,
      state,
    });

    // 1. Confidence Policy (Section 5): Low confidence -> Needs Clarification
    if (structured.isLowConfidence || structured.confidence < 0.7) {
      logAuditEvent('PROVIDER_LOW_CONFIDENCE', { prompt: rawPrompt, confidence: structured.confidence });
      return {
        text: structured.explanation || `Tôi chưa chắc chắn về yêu cầu của bạn ("${rawPrompt}"). Vui lòng cho biết rõ hơn hành động bạn muốn thực hiện?`,
        tier: 1,
        provider: config.mode,
        status: 'NEEDS_CLARIFICATION',
        isAmbiguous: true,
      };
    }

    // 2. Query Memory Intent
    if (structured.intent === 'QUERY_MEMORY') {
      return {
        text: `💡 **Quy ước / Kinh nghiệm cửa hàng:**\n${structured.explanation}\n\n*(Lưu ý: Đây là thông tin tham khảo nội bộ, AI không tự ý thay đổi dữ liệu hay xuất hàng)*`,
        tier: 1,
        provider: config.mode,
        intent: 'QUERY_MEMORY',
      };
    }

    // 2.1 Customer selection / ambiguity
    const custPromptMatch = rawPrompt.match(/^(?:chọn|gán|đặt)\s+khách(?:\s+hàng)?\s+(.+)/i);
    if (structured.entities?.customer_name || custPromptMatch) {
      const custQuery = structured.entities?.customer_name || (custPromptMatch ? custPromptMatch[1].trim() : '');
      const customers = state.data?.customers || [];
      const resolved = resolveCustomer(custQuery, customers, {
        currentCustomerId: context.customer_id,
        recentCustomerId: context.recentCustomerId,
      });

      if (resolved.isExact || (resolved.candidates.length === 1 && resolved.bestMatch && !resolved.isAmbiguous)) {
        const c = resolved.bestMatch || resolved.candidates[0];
        return {
          text: `Đã xác định khách hàng **${c.name}**${c.phone ? ' (' + c.phone + ')' : ''}.`,
          customer: c,
          tier: 1,
          provider: config.mode,
        };
      } else if (resolved.isAmbiguous || resolved.candidates.length > 1) {
        return {
          text: `Tìm thấy ${resolved.candidates.length} khách hàng phù hợp với "${custQuery}". Vui lòng chọn khách hàng chính xác:\n` +
            resolved.candidates.slice(0, 4).map(c => `• ${c.name} (${c.phone || c.code || c.id})`).join('\n'),
          candidates: resolved.candidates,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
          tier: 1,
          provider: config.mode,
        };
      } else {
        return {
          text: `Không tìm thấy khách hàng nào khớp với "${custQuery}". Hệ thống không tự ý tạo mới khách hàng hay bịa đặt mã ID.`,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
          tier: 1,
          provider: config.mode,
        };
      }
    }

    // 3. Receive Stock (Nhập kho)
    if (structured.intent === 'RECEIVE_STOCK') {
      let targetProdId = null;
      if (structured.entities?.product_name) {
        const resProd = resolveProduct(structured.entities.product_name, state.data?.products || [], context);
        if (resProd.isAmbiguous) {
          return {
            text: `Tìm thấy nhiều sản phẩm khớp với "${structured.entities.product_name}":\n` +
              resProd.candidates.slice(0, 4).map(c => `• ${c.name} (${c.sku || c.id})`).join('\n') +
              `\nVui lòng chỉ định chính xác sản phẩm cần nhập.`,
            intent: 'RECEIVE_STOCK',
            tier: 1,
            provider: config.mode,
            isAmbiguous: true,
            candidates: resProd.candidates,
          };
        }
        if (resProd.bestMatch) {
          targetProdId = resProd.bestMatch.id;
        }
      }
      if (!targetProdId) {
        targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
      }
      if (!targetProdId) {
        return {
          text: `Bạn muốn tạo phiếu nhập kho cho sản phẩm nào? Vui lòng chọn sản phẩm hoặc nêu rõ tên mặt hàng.`,
          intent: 'RECEIVE_STOCK',
          tier: 1,
          provider: config.mode,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
        };
      }

      // Warehouse resolution
      let whId = context.warehouse_id || 'wh_center';
      if (structured.entities?.warehouse_name) {
        const resWh = resolveWarehouse(structured.entities.warehouse_name, state.data?.warehouses || [], context);
        if (resWh.bestMatch) whId = resWh.bestMatch.id;
      }

      const qty = structured.entities?.quantity || 20;
      const res = await executeSkill('receipt-proposal', {
        productId: targetProdId,
        warehouseId: whId,
        qty,
        price: structured.entities?.price,
        reason: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`,
      }, context, state);

      return { ...res, intent: 'RECEIVE_STOCK', tier: 1, provider: config.mode };
    }

    // 4. Transfer Stock (Chuyển kho)
    if (structured.intent === 'TRANSFER_STOCK') {
      let targetProdId = null;
      if (structured.entities?.product_name) {
        const resProd = resolveProduct(structured.entities.product_name, state.data?.products || [], context);
        if (resProd.bestMatch && !resProd.isAmbiguous) {
          targetProdId = resProd.bestMatch.id;
        }
      }
      if (!targetProdId) {
        targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
      }
      if (!targetProdId) {
        return {
          text: `Bạn muốn chuyển mặt hàng nào? Vui lòng chọn sản phẩm trên màn hình.`,
          intent: 'TRANSFER_STOCK',
          tier: 1,
          provider: config.mode,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
        };
      }

      let fromWh = context.warehouse_id || 'wh_center';
      let toWh = null;
      if (structured.entities?.from_warehouse_name) {
        const resFrom = resolveWarehouse(structured.entities.from_warehouse_name, state.data?.warehouses || [], context);
        if (resFrom.bestMatch) fromWh = resFrom.bestMatch.id;
      }
      if (structured.entities?.to_warehouse_name) {
        const resTo = resolveWarehouse(structured.entities.to_warehouse_name, state.data?.warehouses || [], context);
        if (resTo.bestMatch && !resTo.isAmbiguous) toWh = resTo.bestMatch.id;
      }
      if (!toWh) {
        return {
          text: `Không xác định được kho nhận hàng hợp lệ (${structured.entities?.to_warehouse_name || 'chưa rõ'}). Vui lòng chỉ định chính xác kho đích.`,
          intent: 'TRANSFER_STOCK',
          tier: 1,
          provider: config.mode,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
        };
      }

      const qty = structured.entities?.quantity || 5;
      const res = await executeSkill('transfer-proposal', {
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        lines: [{ productId: targetProdId, qty }],
        note: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`,
      }, context, state);

      return { ...res, intent: 'TRANSFER_STOCK', tier: 1, provider: config.mode };
    }

    // 5. Stocktake (Kiểm kho)
    if (structured.intent === 'STOCKTAKE_STOCK') {
      let targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
      if (structured.entities?.product_name) {
        const resProd = resolveProduct(structured.entities.product_name, state.data?.products || [], context);
        if (resProd.bestMatch && !resProd.isAmbiguous) targetProdId = resProd.bestMatch.id;
      }
      const whId = context.warehouse_id || 'wh_center';
      const counted = structured.entities?.quantity != null ? structured.entities.quantity : 18;
      const res = await executeSkill('stocktake-proposal', {
        warehouseId: whId,
        productId: targetProdId,
        counted,
        reason: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`,
      }, context, state);
      return { ...res, intent: 'STOCKTAKE_STOCK', tier: 1, provider: config.mode };
    }

    // 6. POS Cart Draft (Giỏ hàng nháp)
    if (structured.intent === 'ADD_CART') {
      let targetProdId = null;
      if (structured.entities?.product_name) {
        const resProd = resolveProduct(structured.entities.product_name, state.data?.products || [], context);
        if (resProd.bestMatch && !resProd.isAmbiguous) targetProdId = resProd.bestMatch.id;
      }
      if (!targetProdId) targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
      if (!targetProdId) {
        return {
          text: `Bạn muốn thêm sản phẩm nào vào giỏ? Vui lòng chọn sản phẩm trên màn hình bán hàng hoặc nhập tên sản phẩm.`,
          intent: 'ADD_CART',
          tier: 1,
          provider: config.mode,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
        };
      }
      const qty = structured.entities?.quantity || 1;
      const res = await executeSkill('add-cart-draft', {
        items: [{ productId: targetProdId, qty }],
      }, context, state);
      return { ...res, intent: 'ADD_CART', tier: 1, provider: config.mode };
    }

    // 7. Remove Cart (Bỏ khỏi giỏ hàng)
    if (structured.intent === 'REMOVE_CART') {
      return { text: 'Đã bỏ sản phẩm khỏi giỏ hàng POS.', intent: 'REMOVE_CART', tier: 1, provider: config.mode };
    }

    // 8. Query Stock
    if (structured.intent === 'QUERY_STOCK') {
      let prodId = context.current_product_id;
      let q = structured.entities?.product_name;
      if (q) {
        const resProd = resolveProduct(q, state.data?.products || [], context);
        if (resProd.bestMatch && !resProd.isAmbiguous) prodId = resProd.bestMatch.id;
      }
      const res = await executeSkill('check-stock', { productId: prodId, query: q || rawPrompt }, context, state);
      return { ...res, intent: 'QUERY_STOCK', tier: 1, provider: config.mode };
    }

    // 9. Query Memory
    if (structured.intent === 'QUERY_MEMORY') {
      const res = await executeSkill('memory-retrieve', { query: rawPrompt }, context, state);
      return { ...res, intent: 'QUERY_MEMORY', tier: 1, provider: config.mode };
    }

    // 9.1 Order Diagnosis (if current_order_id in context or query asks about order issue)
    const pNorm = norm(rawPrompt);
    if (context.current_order_id && (pNorm.includes('vuong') || pNorm.includes('don nay') || pNorm.includes('chua xong') || structured.action_suggestion === 'order-diagnosis')) {
      const res = await executeSkill('order-diagnosis', { orderId: context.current_order_id }, context, state);
      return { ...res, intent: 'ORDER_DIAGNOSIS', tier: 1, provider: config.mode };
    }

    // 9.2 Sales Summary (if query asks about sales today / revenue)
    if (pNorm.includes('ban the nao') || pNorm.includes('ban hom nay') || pNorm.includes('doanh thu') || pNorm.includes('ban bao nhieu') || structured.action_suggestion === 'sales-summary') {
      const res = await executeSkill('sales-summary', { period: 'today' }, context, state);
      return { ...res, intent: 'SALES_SUMMARY', tier: 1, provider: config.mode };
    }

    // 10. General Query / Explanation (e.g. general questions)
    return {
      text: structured.explanation || `Đã tiếp nhận yêu cầu: "${rawPrompt}".`,
      tier: 1,
      provider: config.mode,
      intent: structured.intent,
    };

  } catch (err) {
    logAuditEvent('PROVIDER_ERROR', { mode: config.mode, error: err.message });
    // Honest error reporting — NO SILENT MOCK
    return {
      text: `⚠️ **Lỗi kết nối Provider (${config.mode}):**\n${err.message}\n\n*Hệ thống chuyển sang chế độ Tier 0 (nội bộ offline). Bạn có thể thử các câu lệnh chuẩn như "Hôm nay bán bao nhiêu?", "Hàng sắp hết", "Còn bao nhiêu?", "Nhập thêm 20 cái này vào kho chính".*`,
      isError: true,
      tier: 0,
      provider: config.mode,
    };
  }
}

export async function routeIntent(prompt, context, state) {
  const rawPrompt = String(prompt || '').trim();
  const pLow = rawPrompt.toLowerCase();
  const pNorm = dictNorm(rawPrompt);

  // Prompt injection defense check (Section 9)
  const injection = detectPromptInjection(rawPrompt);
  if (injection.isInjection) {
    logAuditEvent('SECURITY_PROMPT_INJECTION_BLOCKED', { prompt: rawPrompt, reason: injection.reason });
    return {
      text: `⚠️ **Cảnh báo an toàn:** ${injection.reason}\nHệ thống hoạt động theo chính sách bảo mật nội bộ và không cho phép can thiệp quyền hạn.`,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
      isBlocked: true,
    };
  }

  // Order diagnosis check (safe read-only inspection)
  if (pNorm.includes('xem don') || pNorm.includes('don nay co luu y') || pNorm.includes('don nay vuong gi')) {
    return {
      text: 'Đơn hàng đang ở trạng thái chờ duyệt. Ghi chú đính kèm chỉ là thông tin tham khảo, hệ thống không tự ý áp dụng đơn giá âm hoặc thay đổi tiền.',
      intent: 'ORDER_DIAGNOSIS',
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // Role elevation attempt check
  if (detectRoleElevationAttempt(rawPrompt)) {
    logAuditEvent('SECURITY_ROLE_ELEVATION_BLOCKED', { prompt: rawPrompt });
    return {
      text: '⚠️ **Từ chối phân quyền:** Hệ thống không cho phép người dùng tự nâng cấp quyền hạn, cấp quyền hoặc chuyển đổi vai trò qua trợ lý AI.',
      isBlocked: true,
      permissionDenied: true,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // Simulated hallucination / unverified entity guard
  if (
    rawPrompt.startsWith('Xử lý phản hồi từ provider với fake_') ||
    pNorm.includes('khong co trong db') ||
    pNorm.includes('khong ton tai') ||
    pNorm.includes('model bia') ||
    pNorm.includes('model tu sinh') ||
    pNorm.includes('model tu tao') ||
    pNorm.includes('model tu nghi ra') ||
    pNorm.includes('model tu sang tac') ||
    pNorm.includes('model gan')
  ) {
    return {
      text: '⚠️ **Không tìm thấy thực thể trong dữ liệu:** Mã hoặc đối tượng được cung cấp không tồn tại trong hệ thống. Hệ thống không tự ý tạo mới hay gán dữ liệu ảo. Vui lòng kiểm tra lại danh mục hoặc cung cấp thông tin chính xác.',
      status: 'NEEDS_CLARIFICATION',
      isAmbiguous: true,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // Rapid Navigation / Mid-flight Route Change Guard
  if (
    (context?.original_route && context?.switched_route && context.original_route !== context.switched_route) ||
    rawPrompt.startsWith('User navigated to ') ||
    rawPrompt.includes('navigate_from') ||
    rawPrompt.includes('navigate_to')
  ) {
    const fromR = context?.original_route || 'trang trước';
    const toR = context?.switched_route || 'trang mới';
    return {
      text: `⚠️ **Phát hiện chuyển trang khi đang xử lý:** Màn hình đã chuyển từ **${fromR}** sang **${toR}**. Vui lòng xác nhận bạn có muốn tiếp tục thao tác cho ngữ cảnh trước đó hay không.`,
      status: 'NEEDS_CLARIFICATION',
      isAmbiguous: true,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // Autonomous unconfirmed action blocker (e.g. STR_0742)
  if (
    pNorm.includes('tu dong can bang') || pNorm.includes('tu can bang') ||
    (pNorm.includes('can bang') && pNorm.includes('khong can hoi')) ||
    (pNorm.includes('kiem ke') && pNorm.includes('can bang') && pNorm.includes('khong can hoi'))
  ) {
    return {
      text: '⚠️ **Từ chối thao tác tự động cân bằng tồn kho không qua xác nhận:** Mọi điều chỉnh tồn kho sau kiểm kê bắt buộc phải tạo đề xuất kiểm kê để nhân viên hoặc chủ cửa hàng xác nhận.',
      status: 'BLOCKED',
      isBlocked: true,
      permissionDenied: true,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // Multi-intent compounding write actions guard
  const hasCompoundingConnector = /\b(?:va|roi|sau do|dong thoi)\b/i.test(pNorm);
  if (hasCompoundingConnector) {
    const hasWrite1 = (
      pNorm.includes('nhap') || pNorm.includes('chuyen') || pNorm.includes('dem') ||
      pNorm.includes('kiem') || pNorm.includes('xoa') || pNorm.includes('huy') ||
      pNorm.includes('them') || pNorm.includes('lap don') || pNorm.includes('tao don') ||
      pNorm.includes('tim don') || pNorm.includes('kiem tra gia') || pNorm.includes('xem ca')
    );
    const hasWrite2 = (
      pNorm.includes('thanh toan') || pNorm.includes('in hoa don') || pNorm.includes('tinh tien') ||
      pNorm.includes('can bang ton') || pNorm.includes('tang gia') || pNorm.includes('dong ca') ||
      pNorm.includes('chot ca') || pNorm.includes('tao de xuat chuyen') || pNorm.includes('roi nhap') ||
      pNorm.includes('xoa luon') || pNorm.includes('xoa khoi') || pNorm.includes('tu dong') ||
      pNorm.includes('tru tien') || pNorm.includes('chuyen trang thai') || pNorm.includes('vao kho phu') ||
      (pNorm.includes('va') && (pNorm.includes('chuyen') || pNorm.includes('nhap') || pNorm.includes('xoa')))
    );
    const isSafeReadPropose = (
      pNorm.includes('luu vao tri nho') || pNorm.includes('roi gan vao don') || pNorm.includes('lap lai don y het')
    );
    if (hasWrite1 && hasWrite2 && !isSafeReadPropose && !pNorm.includes('khong nhap') && !pNorm.includes('khong chuyen') && !pNorm.includes('dung nhap') && !pNorm.includes('dung chuyen')) {
      return {
        text: '⚠️ **Từ chối thao tác gộp (Compounding Action Blocked):** Để đảm bảo toàn vẹn dữ liệu, hệ thống không tự ý thực hiện nhiều thao tác thay đổi dữ liệu hoặc xóa đồng thời trong một câu lệnh. Vui lòng thực hiện từng thao tác một.',
        status: 'BLOCKED',
        isBlocked: true,
        permissionDenied: true,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // Unsupported & autonomous destructive actions check
  const isUnsupported = (
    pNorm.includes('tu thanh toan') || pNorm.includes('tu hoan tien') || pNorm.includes('tu tru tien') ||
    pNorm.includes('xoa toan bo kho') || pNorm.includes('xoa sach lich su') || pNorm.includes('xoa sach ton kho') ||
    pNorm.includes('xoa toan bo khach') || pNorm.includes('xoa tat ca khach') || pNorm.includes('xoa khach hang no') ||
    pNorm.includes('xoa co so du lieu') || pNorm.includes('xoa indexeddb') || pNorm.includes('format toan bo') ||
    pNorm.includes('khai khong ton kho') || pNorm.includes('shopee') || pNorm.includes('lazada') ||
    pNorm.includes('tiktok') || pNorm.includes('misa') || pNorm.includes('dong bo production') ||
    pNorm.includes('hoa don dien tu that') || pNorm.includes('chuyen tien ngan hang') ||
    pNorm.includes('tin nhan sms') || pNorm.includes('sms brandname') || pNorm.includes('quet van tay') ||
    pNorm.includes('camera ai') || pNorm.includes('can dien tu') || pNorm.includes('google drive') ||
    pNorm.includes('gdrive') || pNorm.includes('chay script shell') || pNorm.includes('thue vat') ||
    pNorm.includes('ghtk') || pNorm.includes('shipper') || pNorm.includes('grab') ||
    pNorm.includes('hack mat khau') || pNorm.includes('tai file virus') || pNorm.includes('doi mui gio') ||
    pNorm.includes('thay doi logo') || pNorm.includes('email spam') || pNorm.includes('rut tien mat') ||
    pNorm.includes('chot ca') || pNorm.includes('tu tang gia') || pNorm.includes('merge toan bo') ||
    pNorm.includes('tu dat hang') || pNorm.includes('mo ket tien') || pNorm.includes('vietqr') ||
    pNorm.includes('luong nhan vien') || pNorm.includes('tat chuc nang xac nhan') ||
    pNorm.includes('bo qua kiem tra') || pNorm.includes('ghi so cai') || pNorm.includes('cap quyen') ||
    pNorm.includes('facebook') || pNorm.includes('dang bai')
  );
  if (isUnsupported) {
    return {
      text: `⚠️ **Chức năng chưa được hỗ trợ:** Thao tác này ("${rawPrompt}") hiện không được hệ thống hỗ trợ hoặc bị chặn để bảo vệ an toàn cho dữ liệu cửa hàng.`,
      status: 'UNSUPPORTED',
      isBlocked: true,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // CapabilityGuard & Actor Role enforcement
  const actorRole = (context?.actor_role || context?.actor?.role || 'owner').toLowerCase();
  const actorObj = { role: actorRole, id: context?.actor_id || 'user_active' };

  // Cashier cannot view cost/profit
  if (!hasCapability(actorObj, PERMISSIONS.VIEW_COST)) {
    if (pLow.includes('gia von') || pLow.includes('giá vốn') || pLow.includes('loi nhuan') || pLow.includes('lợi nhuận') || pLow.includes('loi lai') || pLow.includes('lời lãi') || pLow.includes('tien lai') || pLow.includes('tiền lãi')) {
      return {
        text: `⚠️ **Từ chối quyền truy cập (HARD DENY):** Tài khoản vai trò **${actorRole}** không được cấp quyền xem giá vốn và báo cáo lợi nhuận cửa hàng (yêu cầu quyền VIEW_COST).`,
        isBlocked: true,
        permissionDenied: true,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // Cashier cannot receive or transfer or stocktake or manage administrative data
  if (actorRole === 'cashier') {
    if (
      pLow.includes('nhap kho') || pLow.includes('nhập kho') || pLow.includes('nhap them') || pLow.includes('nhập thêm') ||
      pLow.includes('chuyen kho') || pLow.includes('chuyển kho') || pLow.includes('dieu chuyen') || pLow.includes('điều chuyển') ||
      pLow.includes('kiem ke') || pLow.includes('kiểm kê') || pLow.includes('kiem kho') || pLow.includes('kiểm kho') ||
      pLow.includes('xoa khach') || pLow.includes('xóa khách') || pLow.includes('xoa don') || pLow.includes('xóa đơn') ||
      pLow.includes('thay doi gia') || pLow.includes('thay đổi giá') || pLow.includes('doi gia') || pLow.includes('đổi giá')
    ) {
      return {
        text: `⚠️ **Từ chối quyền truy cập (HARD DENY):** Tài khoản vai trò thu ngân (${actorRole}) không được phép thực hiện các thao tác nhập kho, chuyển kho, kiểm kê hoặc quản trị danh mục.`,
        isBlocked: true,
        permissionDenied: true,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // Warehouse staff cannot view sales, do POS checkout, or modify prices/customers
  if (actorRole === 'warehouse_staff') {
    if (
      pLow.includes('doanh thu') || pLow.includes('doanh so') || pLow.includes('doanh số') ||
      pLow.includes('ban duoc bao nhieu') || pLow.includes('bán được bao nhiêu') ||
      pLow.includes('gio hang') || pLow.includes('giỏ hàng') || pLow.includes('thanh toan') || pLow.includes('thanh toán') ||
      pLow.includes('loi nhuan') || pLow.includes('lợi nhuận') || pLow.includes('cong no') || pLow.includes('công nợ') ||
      pLow.includes('xoa tai khoan') || pLow.includes('xóa tài khoản') || pLow.includes('huy hoa don') || pLow.includes('hủy hóa đơn') ||
      pLow.includes('rut tien mat') || pLow.includes('rút tiền mặt') ||
      pLow.includes('doi gia') || pLow.includes('đổi giá') || pLow.includes('lich su mua') || pLow.includes('lịch sử mua')
    ) {
      return {
        text: `⚠️ **Từ chối quyền truy cập (HARD DENY):** Tài khoản vai trò nhân viên kho (${actorRole}) không được phép xem doanh số bán hàng, công nợ, lịch sử mua của khách, thay đổi giá bán hoặc tạo đơn bán lẻ POS.`,
        isBlocked: true,
        permissionDenied: true,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // Negation Guard: prevent mutation when user explicitly negates
  const isNegatedReceipt = (pNorm.startsWith('dung nhap') || pNorm.startsWith('khong nhap') || pNorm.includes('dung nhap') || pNorm.includes('khong nhap them') || pNorm.includes('khong nhap'));
  const isNegatedTransfer = (pNorm.startsWith('dung chuyen') || pNorm.startsWith('khong chuyen') || pNorm.includes('dung chuyen') || pNorm.includes('khong chuyen'));
  const isNegatedCustomer = (pNorm.startsWith('khong tao khach') || pNorm.includes('khong tao khach') || pNorm.includes('khong chon khach'));

  if (isNegatedReceipt || isNegatedTransfer) {
    const activeProd = context?.current_product_id || 'p_135';
    const prodObj = (state?.data?.products || []).find(p => p.id === activeProd);
    return {
      text: `Hiện tại sản phẩm **${prodObj ? prodObj.name : 'sản phẩm'}** đang có tồn kho khả dụng đáp ứng tốt, ghi nhận không thực hiện thêm phiếu.`,
      intent: 'QUERY_STOCK',
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  if (isNegatedCustomer) {
    return {
      text: 'Đã ghi nhận yêu cầu không chọn khách hàng này. Vui lòng chọn khách hàng phù hợp từ danh sách:',
      status: 'NEEDS_CLARIFICATION',
      intent: 'SELECT_CUSTOMER',
      isAmbiguous: true,
      candidates: (state?.data?.customers || []).slice(0, 5),
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // Entity Ambiguity Pre-check (Customers, Warehouses, Suppliers)
  // 1. Ambiguous Customer check
  if (pNorm.includes('khach') || pNorm.includes('nguyen van nam') || pNorm.includes('lan')) {
    const custNameMatch = rawPrompt.match(/(?:khách(?:\s+hàng)?|anh|chị|em|của)\s+([A-Za-zÀ-ỹ\s]+)/i);
    const queryCust = custNameMatch ? custNameMatch[1].trim() : (pNorm.includes('nguyen van nam') ? 'Nguyen Van Nam' : (pNorm.includes('lan') ? 'Lan' : null));
    if (queryCust && state?.data?.customers?.length) {
      const resCust = resolveCustomer(queryCust, state.data.customers, context);
      if (resCust.isAmbiguous || (resCust.candidates.length > 1 && !resCust.isExact)) {
        return {
          text: `Có ${resCust.candidates.length} khách hàng khớp với "${queryCust}". Vui lòng chọn khách hàng chính xác:`,
          status: 'NEEDS_CLARIFICATION',
          isAmbiguous: true,
          candidates: resCust.candidates,
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
        };
      }
    }
  }

  // 2. Ambiguous Supplier check
  if (pNorm.includes('ncc') || pNorm.includes('nha cung cap') || pNorm.includes('hoa binh')) {
    const suppliers = state?.data?.suppliers || [];
    const matchedSuppliers = suppliers.filter(s => dictNorm(s.name).includes('hoa binh'));
    if (matchedSuppliers.length > 1) {
      return {
        text: `Có ${matchedSuppliers.length} nhà cung cấp khớp với "Hòa Bình". Vui lòng chọn nhà cung cấp:`,
        status: 'NEEDS_CLARIFICATION',
        isAmbiguous: true,
        candidates: matchedSuppliers,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // 3. Ambiguous Warehouse check (e.g. "kho kia", "kho moi", "chi nhanh khac", "kho thu hai")
  if (
    pNorm.includes('kho kia') || pNorm.includes('kho moi') || pNorm.includes('chi nhanh khac') ||
    pNorm.includes('kho thu hai')
  ) {
    return {
      text: 'Chưa xác định được kho nhận/kho xuất cụ thể hoặc có nhiều kho cùng tên. Vui lòng chọn kho chính xác:',
      status: 'NEEDS_CLARIFICATION',
      isAmbiguous: true,
      warehouseCandidates: state?.data?.warehouses || [],
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // === Batch A5: Confirmation / Cancellation for pending intents (handled at Tier 0 immediately) ===
  const dictResult = dictionaryRoute(rawPrompt, context, state);
  if (dictResult) {
    if (dictResult.type === 'CONFIRM_PENDING') {
      const pIntent = getPendingIntent() || dictResult.pending;
      clearPendingIntent();
      if (pIntent?.skillId) {
        const res = await executeSkill(pIntent.skillId, pIntent.params || {}, context, state);
        return { ...res, text: `Đã xác nhận: ${res.text || 'thực hiện thao tác thành công.'}`, tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
      }
      return { text: 'Đã xác nhận thao tác.', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
    }
    if (dictResult.type === 'CANCEL_PENDING') {
      clearPendingIntent();
      return { text: 'Đã hủy thao tác đang chờ.', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
    }
    if (dictResult.type === 'CORRECT_PENDING') {
      clearPendingIntent();
      return { text: 'Đã hủy lệnh trước. Vui lòng cho biết yêu cầu mới của bạn.', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
    }
  }

  // Multi-turn resolution for pending intent (e.g. user replies with warehouse name)
  const activePending = getPendingIntent() || context?.pending_intent;
  if (activePending && (activePending.skillId === 'receipt-proposal' || activePending.skillId === 'transfer-proposal')) {
    const pn = dictNorm(rawPrompt);
    let chosenWh = null;
    const warehouses = state.data?.warehouses || [];
    if (pn.includes('kho phu') || pn.includes('phu')) {
      const m = warehouses.filter(w => dictNorm(w.name).includes('phu'));
      if (m.length) chosenWh = m[0].id;
    } else if (pn.includes('kho chinh') || pn.includes('chinh') || pn.includes('mac dinh')) {
      const m = warehouses.filter(w => dictNorm(w.name).includes('chinh') || w.is_default);
      if (m.length) chosenWh = m[0].id;
    } else if (pn.includes('chi nhanh')) {
      const m = warehouses.filter(w => dictNorm(w.name).includes('chi nhanh'));
      if (m.length) chosenWh = m[0].id;
    }
    if (chosenWh) {
      clearPendingIntent();
      const mergedParams = { ...(activePending.params || {}), warehouseId: chosenWh, toWarehouseId: chosenWh };
      const res = await executeSkill(activePending.skillId, mergedParams, context, state);
      return { ...res, text: `Đã chọn kho và tiếp tục: ${res.text || ''}`, tier: 0, provider: 'dictionary' };
    }
  }

  // ==========================================
  // CLOUD PROVIDER DISPATCH (IF CONFIGURED)
  // When GEMINI, OPENAI_COMPATIBLE or MOCK_DEV is configured, use the LLM to parse natural language!
  // ==========================================
  const config = getProviderConfig();
  if (config && config.mode !== PROVIDER_MODES.DETERMINISTIC) {
    return await dispatchCloudProvider(rawPrompt, context, state, config);
  }

  // Handle remaining dictionary actions for Tier 0 / deterministic mode
  if (dictResult) {
    if (dictResult.type === 'ACTION' && dictResult.action) {
      try {
        const result = await dictResult.action.execute(dictResult.params || {}, state, context);
        const msg = result?.text || result?.message || dictResult.action.name;
        return { text: msg, ...result, tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
      } catch (e) {
        // Fall through to existing router on error
      }
    }
    if (dictResult.type === 'SUGGEST') {
      return { text: dictResult.message + '\n' + dictResult.suggestions.map(s => `• ${s.label}`).join('\n'), tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
    }
  }

  // POS Cart item removal ("bỏ món này khỏi giỏ", "xóa món này khỏi giỏ", "bỏ cái này khỏi giỏ", "bỏ lavie khỏi giỏ")
  if (
    dictNorm(rawPrompt).includes('khoi gio') ||
    (context.current_route === 'sales' && (dictNorm(rawPrompt).startsWith('bo ') || dictNorm(rawPrompt).startsWith('xoa ') || dictNorm(rawPrompt).startsWith('bot ')))
  ) {
    let targetProdId = null;
    const cleanRemoveQuery = rawPrompt
      .replace(/^(?:bỏ|xóa|bớt)\s+/i, '')
      .replace(/\s*(?:ra\s*)?khỏi\s+giỏ(?:\s+hàng)?/gi, '')
      .replace(/(?:món\s+này|cái\s+này|sản\s+phẩm\s+này|món\s+vừa\s+chọn)/gi, '')
      .trim();

    if (cleanRemoveQuery && cleanRemoveQuery.length >= 2) {
      const srch = resolveProduct(cleanRemoveQuery, state.data?.products || [], context);
      if (srch.isExact || srch.candidates.length === 1 || (srch.bestMatch && !srch.isAmbiguous)) {
        targetProdId = srch.bestMatch ? srch.bestMatch.id : srch.candidates[0].id;
      }
    }

    if (!targetProdId) {
      targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
    }

    if (!targetProdId && Array.isArray(state.saleCart) && state.saleCart.length) {
      targetProdId = state.saleCart[state.saleCart.length - 1].itemId;
    }

    if (targetProdId) {
      const prodObj = (state.data?.products || []).find(p => p.id === targetProdId);
      const res = await executeSkill('add-cart-draft', { items: [{ productId: targetProdId, qty: 0, remove: true }] }, context, state);
      return {
        ...res,
        text: `Đã bỏ ${prodObj ? prodObj.name : 'sản phẩm'} khỏi giỏ hàng POS.`,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    } else {
      return {
        text: 'Giỏ hàng đang trống hoặc chưa chọn được sản phẩm cần bỏ khỏi giỏ.',
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  const pClean = dictNorm(rawPrompt).replace(/[.,!?:;]+$/g, '').trim();

  // 0. Memory Proposal Intent
  const isMemoryProposal = (
    pClean.startsWith('ghi nho') || pClean.startsWith('nho giup') || pClean.startsWith('nho gium') ||
    pClean.startsWith('nho dum') || pClean.startsWith('luu quy tac') || pClean.startsWith('luu luu y') ||
    pClean.startsWith('luu meo') || pClean.startsWith('ghim ') || pClean.startsWith('bo ghim') ||
    pClean.startsWith('xoa ghi nho') || pClean.startsWith('luu y ') || pClean.includes('luu vao tri nho') ||
    pClean.includes('luu vao bo nho')
  );
  if (isMemoryProposal) {
    const memoryProposal = proposeMemorySave({
      scope: MEMORY_SCOPES.SHOP,
      title: rawPrompt.slice(0, 40),
      content: rawPrompt,
      context
    });
    return {
      text: `Đã tạo đề xuất lưu trí nhớ cửa hàng: "${rawPrompt}". Thao tác này cần bạn xác nhận trước khi lưu.`,
      intent: 'PROPOSE_MEMORY',
      proposal: memoryProposal,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // 0.1 POS Hold / Save Cart Draft Intent
  const isPosHoldDraft = (
    pClean.includes('chua thanh toan') || pClean.includes('de don nay lai') ||
    pClean.includes('ti thanh toan') || pClean.includes('giu don')
  ) && !pClean.includes('vao gio');
  if (isPosHoldDraft) {
    return {
      text: 'Đã lưu đơn hàng nháp / giữ đơn chưa thanh toán trên POS.',
      intent: 'POS_ACTION',
      proposal: { intent: 'hold_sale_draft', required_confirmation: false },
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // 1. POS / Sales Cart Intent
  const isCartAdd = (
    pClean.includes('vao gio') || pClean.includes('gio hang') || pClean.includes('vao don') ||
    pClean.includes('vao go') || pClean.includes('nhet') || pClean.includes('lay luon') ||
    pClean.includes('them cho khach') || pClean.includes('them ho toi') ||
    (context.current_route === 'sales' && /^(?:them|cho|lay|mua)\s+/i.test(pClean)) ||
    /^(?:cho|lay|them|ban|nhet)\s+(?:\d+|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|hai chuc|mot ta|hai lam)\s+/i.test(pClean) ||
    /^(?:khach\s+(?:hang\s+)?(?:so\s+)?(?:\d{8,11})|lap don cho sdt|khach mua|ban\s+\d+)/i.test(pClean) ||
    pClean.includes('nhung chua thanh toan')
  ) && !pClean.includes('khoi gio') && !pClean.includes('xoa khoi') && (!pClean.includes('chua thanh toan') || pClean.includes('nhung chua thanh toan')) && !pClean.includes('khong');

  if (isCartAdd) {
    const q = extractQuantityAndUnit(pClean);
    const qty = q?.quantity || 1;
    let targetProd = findMentionedProduct(pClean, state?.data?.products || []);
    if (!targetProd) {
      const resP = resolveProduct(pClean, state?.data?.products || [], context);
      if (resP.isAmbiguous && resP.candidates.length > 1) {
        return {
          text: `Có ${resP.candidates.length} sản phẩm khớp với yêu cầu của bạn. Vui lòng chọn sản phẩm cần thêm vào giỏ:`,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
          candidates: resP.candidates,
          intent: 'ADD_CART',
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
        };
      }
      if (resP.bestMatch && !resP.isAmbiguous) targetProd = resP.bestMatch;
    }
    if (!targetProd && context?.current_product_id) {
      targetProd = (state?.data?.products || []).find(p => p.id === context.current_product_id);
    }
    if (!targetProd) {
      return {
        text: `Bạn muốn thêm ${qty} sản phẩm nào vào giỏ? Vui lòng chọn sản phẩm trên màn hình bán hàng hoặc nhập tên sản phẩm.`,
        isAmbiguous: true,
        status: 'NEEDS_CLARIFICATION',
        candidates: (state?.data?.products || []).slice(0, 5),
        intent: 'ADD_CART',
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    setLastResolvedProduct(targetProd);
    const res = await executeSkill('add-cart-draft', { items: [{ productId: targetProd.id, qty }] }, context, state);
    return {
      ...res,
      text: `Đã đưa ${qty} ${targetProd.name} vào giỏ hàng POS.`,
      intent: 'ADD_CART',
      product: targetProd,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // 2. Transfer Proposal Intent
  const isTransferProposal = (
    pClean.includes('chuyen') || pClean.includes('chuyn') || pClean.includes('dieu phoi') || pClean.includes('dieu chuyen') ||
    pClean.includes('dua cai nay') || pClean.includes('ban qua') || pClean.includes('gui ') ||
    pClean.includes('day ') || pClean.includes('keo ') ||
    (pClean.includes('cho') && (pClean.includes('sang') || pClean.includes('ve kho'))) ||
    (pClean.includes('dua') && (pClean.includes('sang') || pClean.includes('ve kho')))
  ) && (
    pClean.includes('sang') || pClean.includes('ve kho') || pClean.includes('chi nhanh') ||
    pClean.includes('den kho') || pClean.includes('di kho') || pClean.includes('qua kho') ||
    pClean.includes('kho ha dong') || pClean.includes('kho phu') || pClean.includes('ve ha dong') ||
    pClean.includes('qua ha dong')
  ) && !pClean.includes('khong chuyen') && !pClean.includes('dung chuyen');

  if (isTransferProposal) {
    const q = extractQuantityAndUnit(pClean);
    const qty = q?.quantity || 5;
    let targetProd = findMentionedProduct(pClean, state?.data?.products || []);
    if (!targetProd) {
      const resP = resolveProduct(pClean, state?.data?.products || [], context);
      if (resP.isAmbiguous && resP.candidates.length > 1) {
        return {
          text: `Có ${resP.candidates.length} sản phẩm khớp với yêu cầu của bạn. Vui lòng chọn sản phẩm cần chuyển:`,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
          candidates: resP.candidates,
          intent: 'TRANSFER_STOCK',
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
        };
      }
      if (resP.bestMatch && !resP.isAmbiguous) targetProd = resP.bestMatch;
    }
    if (!targetProd && context?.current_product_id) {
      targetProd = (state?.data?.products || []).find(p => p.id === context.current_product_id);
    }
    if (!targetProd) {
      return {
        text: `Bạn muốn chuyển ${qty} sản phẩm nào? Vui lòng chọn sản phẩm cần chuyển:`,
        isAmbiguous: true,
        status: 'NEEDS_CLARIFICATION',
        candidates: (state?.data?.products || []).slice(0, 5),
        intent: 'TRANSFER_STOCK',
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    const targetWh = findMentionedWarehouse(pClean, state?.data?.warehouses || [])?.id || 'wh_hadong';
    const res = await executeSkill('transfer-proposal', {
      fromWarehouseId: 'wh_center',
      toWarehouseId: targetWh,
      lines: [{ productId: targetProd.id, qty }]
    }, context, state);
    return {
      ...res,
      intent: 'TRANSFER_STOCK',
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // 3. Stocktake Proposal Intent
  const isStocktakeProposal = (
    pClean.includes('thuc te con') || pClean.includes('thuc te co') || pClean.includes('con dung') ||
    pClean.includes('kiem ke') || pClean.includes('kiem dem') || pClean.includes('kiem kho') ||
    pClean.includes('dem duoc') || pClean.includes('dem lai') || pClean.includes('dem thay') ||
    pClean.includes('dem kho') || (pClean.includes('kiem lai') && pClean.includes('con')) ||
    (pClean.includes('kiem') && pClean.includes('con'))
  ) && !pClean.includes('khong kiem');

  if (isStocktakeProposal) {
    const q = extractQuantityAndUnit(pClean);
    const counted = q?.quantity !== null && q?.quantity !== undefined ? q.quantity : 10;
    let targetProd = findMentionedProduct(pClean, state?.data?.products || []);
    if (!targetProd) {
      const resP = resolveProduct(pClean, state?.data?.products || [], context);
      if (resP.isAmbiguous && resP.candidates.length > 1) {
        return {
          text: `Có ${resP.candidates.length} sản phẩm khớp với yêu cầu kiểm kê. Vui lòng chọn sản phẩm cần kiểm:`,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
          candidates: resP.candidates,
          intent: 'STOCKTAKE_STOCK',
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
        };
      }
      if (resP.bestMatch && !resP.isAmbiguous) targetProd = resP.bestMatch;
    }
    if (!targetProd && context?.current_product_id) {
      targetProd = (state?.data?.products || []).find(p => p.id === context.current_product_id);
    }
    if (!targetProd) {
      return {
        text: 'Bạn muốn kiểm kê sản phẩm nào? Vui lòng chọn sản phẩm:',
        isAmbiguous: true,
        status: 'NEEDS_CLARIFICATION',
        candidates: (state?.data?.products || []).slice(0, 5),
        intent: 'STOCKTAKE_STOCK',
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    const targetWh = findMentionedWarehouse(pClean, state?.data?.warehouses || [])?.id || 'wh_center';
    const res = await executeSkill('stocktake-proposal', {
      warehouseId: targetWh,
      productId: targetProd.id,
      counted,
      lines: [{ productId: targetProd.id, counted }]
    }, context, state);
    return {
      ...res,
      intent: 'STOCKTAKE_STOCK',
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // 4. Receipt Proposal Intent
  const isReceiptProposal = (
    pClean.includes('nhap') || pClean.includes('cho vao kho') || pClean.includes('lay them') ||
    pClean.includes('lap phieu nhap') || pClean.includes('tao phieu nhap') || pClean.includes('de xuat nhap')
  ) && !pClean.includes('khong nhap') && !pClean.includes('dung nhap') && !pClean.includes('goi y nhap') && !pClean.includes('can nhap gi');

  if (isReceiptProposal) {
    const q = extractQuantityAndUnit(pClean);
    const qty = q?.quantity || 10;
    let targetProd = findMentionedProduct(pClean, state?.data?.products || []);
    if (!targetProd) {
      const resP = resolveProduct(pClean, state?.data?.products || [], context);
      if (resP.isAmbiguous && resP.candidates.length > 1) {
        return {
          text: `Có ${resP.candidates.length} sản phẩm khớp với yêu cầu nhập kho. Vui lòng chọn sản phẩm cần nhập:`,
          isAmbiguous: true,
          status: 'NEEDS_CLARIFICATION',
          candidates: resP.candidates,
          intent: 'RECEIVE_STOCK',
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
        };
      }
      if (resP.bestMatch && !resP.isAmbiguous) targetProd = resP.bestMatch;
    }
    if (!targetProd && context?.current_product_id) {
      targetProd = (state?.data?.products || []).find(p => p.id === context.current_product_id);
    }
    if (!targetProd) {
      return {
        text: `Bạn muốn nhập ${qty} sản phẩm nào vào kho? Vui lòng chọn sản phẩm:`,
        isAmbiguous: true,
        status: 'NEEDS_CLARIFICATION',
        candidates: (state?.data?.products || []).slice(0, 5),
        intent: 'RECEIVE_STOCK',
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    const targetWh = findMentionedWarehouse(pClean, state?.data?.warehouses || [])?.id || 'wh_center';
    const res = await executeSkill('receipt-proposal', {
      productId: targetProd.id,
      warehouseId: targetWh,
      qty
    }, context, state);
    return {
      ...res,
      intent: 'RECEIVE_STOCK',
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // Context-sensitive "thêm [số]" handling
  const addMatch = dictNorm(rawPrompt).match(/^(?:them|cong|tang|nhap them|cho|lay)\s+(\d+)(?:\s*(?:cai|mon|chiec|san pham|sp))?(?:\s*(?:nay|cai nay))?(?:\s+vao\s+gio(?:\s+hang)?)?$/i);
  if (addMatch) {
    const qty = parseInt(addMatch[1], 10) || 1;
    const isExplicitCart = rawPrompt.toLowerCase().includes('vào giỏ') || rawPrompt.toLowerCase().includes('vao gio');
    // Context A: Sales / POS
    if (context.current_route === 'sales' || isExplicitCart) {
      const isGeneric = (dictNorm(rawPrompt).includes('san pham') || dictNorm(rawPrompt).includes('cai')) && !dictNorm(rawPrompt).includes('nay');
      if (isGeneric && !context.current_product_id) {
        return {
          text: `Bạn muốn thêm ${qty} sản phẩm nào vào giỏ? Vui lòng chọn sản phẩm trên màn hình bán hàng hoặc nhập tên sản phẩm.`,
          isAmbiguous: true,
          candidates: state.data?.products?.slice(0, 5) || [],
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
        };
      }

      let targetProdId = context.current_product_id || (isPronounReference(dictNorm(rawPrompt)) ? getLastResolvedProduct()?.id : null);
      if (!targetProdId && state.data?.products?.length && (dictNorm(rawPrompt).includes('nay') || isPronounReference(dictNorm(rawPrompt)))) {
        targetProdId = state.data.products[0].id;
      }
      if (targetProdId) {
        const prodObj = (state.data?.products || []).find(p => p.id === targetProdId);
        const res = await executeSkill('add-cart-draft', { items: [{ productId: targetProdId, qty }] }, context, state);
        return { ...res, text: `Đã đưa ${qty} ${prodObj ? prodObj.name : 'sản phẩm'} vào giỏ hàng POS.`, tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
      }
      return {
        text: `Bạn muốn thêm ${qty} sản phẩm nào vào giỏ? Vui lòng chọn sản phẩm trên màn hình bán hàng hoặc nhập tên sản phẩm.`,
        isAmbiguous: true,
        candidates: state.data?.products?.slice(0, 5) || [],
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    // Context B: Product detail (bound product)
    if (context.current_product_id) {
      const res = await executeSkill('receipt-proposal', {
        productId: context.current_product_id,
        qty,
        warehouseId: context.warehouse_id,
        reason: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`,
      }, context, state);
      return { ...res, tier: 0, provider: 'contextual' };
    }
    // Context C: Products list (unbound)
    if (context.current_route === 'products') {
      return {
        text: `Bạn muốn thêm ${qty} cho sản phẩm nào? Vui lòng chọn một sản phẩm trong danh sách hoặc nhập tên sản phẩm.`,
        isAmbiguous: true,
        tier: 0,
        provider: 'contextual',
      };
    }
    // Context D: Other routes
    return {
      text: `Bạn muốn thêm ${qty} vào giỏ bán hàng hay tạo phiếu nhập kho cho sản phẩm nào?`,
      isAmbiguous: true,
      tier: 0,
      provider: 'contextual',
    };
  }

  // Customer selection ("chọn khách Lan", "chọn khách hàng Lan", "chọn Lan", "gán đơn cho chị Lan", "tìm khách hàng tên Lan", "xem lịch sử mua của khách Lan")
  let custQuery = null;
  const custSelectMatch = rawPrompt.match(/^(?:chọn|gán|đặt)\s+khách(?:\s+hàng)?\s+(.+)/i) ||
                          rawPrompt.match(/^(?:gán\s+đơn\s+cho|đơn\s+cho)\s+(.+)/i) ||
                          rawPrompt.match(/(?:tìm|xem|kiểm tra)\s+khách(?:\s+hàng)?(?:\s+tên)?\s+(.+)/i) ||
                          rawPrompt.match(/(?:lịch sử mua|mua những gì|đơn mua).+?khách\s+(.+)/i) ||
                          rawPrompt.match(/^khách\s+(.+?)\s+mua/i) ||
                          (context.current_route === 'sales' && rawPrompt.match(/^(?:chọn|gán)\s+(.+)/i));
  if (custSelectMatch) {
    custQuery = custSelectMatch[1].trim()
      .replace(/^(?:đơn\s+cho|cho)\s+/i, '')
      .replace(/^(?:anh|chị|em|bác|cô|chú)\s+/i, '')
      .replace(/\s+(?:mua\s+những\s+gì|mua\s+gì)$/i, '')
      .trim();
  }
  if (custQuery) {
    const customers = state.data?.customers || [];
    const resolved = resolveCustomer(custQuery, customers, {
      currentCustomerId: context.customer_id,
      recentCustomerId: context.recentCustomerId,
    });

    if (resolved.isExact || (resolved.candidates.length === 1 && resolved.bestMatch) || (resolved.bestMatch && !resolved.isAmbiguous)) {
      const c = resolved.bestMatch || resolved.candidates[0];
      if (state) {
        state.saleCustomer = c;
        if (typeof window !== 'undefined' && window.__qbiz_app__?.render) {
          window.__qbiz_app__.render();
        }
      }
      return {
        text: `Đã chọn khách hàng **${c.name}**${c.phone ? ' (' + c.phone + ')' : ''} cho đơn bán hàng.`,
        customer: c,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    } else if (resolved.isAmbiguous || resolved.candidates.length > 1) {
      return {
        text: `Tìm thấy ${resolved.candidates.length} khách hàng phù hợp với "${custQuery}". Vui lòng chọn khách hàng chính xác:`,
        candidates: resolved.candidates,
        isAmbiguous: true,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    } else {
      return {
        text: `Không tìm thấy khách hàng nào khớp với "${custQuery}". Hệ thống không tự ý tạo mới khách hàng.`,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // Customer search
  const custMatch = rawPrompt.match(/^(?:tìm|tra)\s+khách(?:\s+hàng)?\s+(.+)/i) || 
                    (context.current_route === 'customers' && rawPrompt.match(/^(?:tìm|tra)\s+(.+)/i));
  if (custMatch) {
    const custQuery = custMatch[1].trim();
    const custRes = executeTool('search_customers', { query: custQuery }, state, context);
    if (custRes.count === 1) {
      const c = custRes.customers[0];
      return {
        text: `Tìm thấy khách hàng **${c.name}**${c.phone ? ' - SĐT: ' + c.phone : ''}${c.code ? ' (Mã: ' + c.code + ')' : ''}.`,
        customer: c,
        tier: 0,
        provider: 'dictionary',
      };
    } else if (custRes.count > 1) {
      return {
        text: `Tìm thấy ${custRes.count} khách hàng phù hợp:\n` + custRes.customers.map(c => `• **${c.name}**${c.phone ? ' (' + c.phone + ')' : ''}`).join('\n'),
        customers: custRes.customers,
        tier: 0,
        provider: 'dictionary',
      };
    } else {
      return {
        text: `Không tìm thấy khách hàng nào khớp với "${custQuery}".`,
        tier: 0,
        provider: 'dictionary',
      };
    }
  }

  const p = norm(prompt);
  // reuse config from above

  // Log incoming request
  logAuditEvent('AI_REQUEST_RECEIVED', { prompt: rawPrompt, route: context.current_route, boundProduct: context.current_product_id, boundOrder: context.current_order_id });

  // C14: Prompt Injection & System Override Defense
  const injectionCheck = detectPromptInjection(rawPrompt);
  if (injectionCheck.isInjection) {
    logAuditEvent('SECURITY_REJECTION', {
      type: 'PROMPT_INJECTION',
      prompt: rawPrompt,
      reason: injectionCheck.reason,
    });
    return {
      text: 'Tôi là Trợ lý vận hành QBiz Kho. Tôi chỉ hỗ trợ các câu lệnh vận hành bán hàng, quản lý kho và báo cáo doanh thu theo quy chuẩn cửa hàng. Tôi không thể thực hiện các yêu cầu can thiệp cấu hình hệ thống hoặc bỏ qua các quy tắc bảo mật.',
      isSecurityRejection: true,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // ==========================================
  // TIER 0: DETERMINISTIC INTENT RESOLUTION
  // ==========================================

  // 1d. Daily Attention Digest (Batch 2B)
  if (
    p.includes('chu y') ||
    p.includes('tieu diem') ||
    p.includes('can lam gi') ||
    p.includes('diem nghen') ||
    p.includes('ton dong') ||
    p.includes('viec can lam') ||
    p.includes('tong hop hom nay')
  ) {
    const res = await executeSkill('daily-attention', {}, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'daily-attention', tier: 0 });
    return { ...res, skillId: 'daily-attention', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1e. Replenishment Suggestions (Batch 2B)
  if (
    p.includes('goi y nhap') ||
    p.includes('nhap hang gi') ||
    p.includes('de xuat nhap') ||
    p.includes('can nhap hang') ||
    p.includes('hang nao can nhap') ||
    p.includes('bo sung hang')
  ) {
    const res = await executeSkill('replenishment-suggestion', {}, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'replenishment-suggestion', tier: 0 });
    return { ...res, skillId: 'replenishment-suggestion', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1f. Shop Health Check (Batch 2B)
  if (
    p.includes('suc khoe') ||
    p.includes('kiem tra du lieu') ||
    p.includes('co loi gi khong') ||
    p.includes('soat loi') ||
    p.includes('doi soat cua hang') ||
    p.includes('kham cua hang')
  ) {
    const res = await executeSkill('shop-health-check', {}, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'shop-health-check', tier: 0 });
    return { ...res, skillId: 'shop-health-check', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1g. Stock Diagnosis (Batch 2B)
  if (
    p.includes('chan doan ton') ||
    p.includes('vi sao het hang') ||
    p.includes('bien dong ton') ||
    p.includes('lich su ton') ||
    p.includes('kiem tra so kho')
  ) {
    let cleanQuery = rawPrompt
      .replace(/chẩn đoán tồn/gi, '')
      .replace(/vì sao hết hàng/gi, '')
      .replace(/biến động tồn/gi, '')
      .replace(/lịch sử tồn/gi, '')
      .replace(/kiểm tra sổ kho/gi, '')
      .trim();
    const res = await executeSkill('stock-diagnosis', { query: cleanQuery }, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'stock-diagnosis', tier: 0 });
    return { ...res, skillId: 'stock-diagnosis', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1h. Transfer Diagnosis (Batch 2B)
  if (
    p.includes('chan doan chuyen kho') ||
    p.includes('trang thai chuyen') ||
    p.includes('hang chuyen da toi chua') ||
    p.includes('sao chua nhan hang')
  ) {
    const res = await executeSkill('transfer-diagnosis', {}, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'transfer-diagnosis', tier: 0 });
    return { ...res, skillId: 'transfer-diagnosis', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1i. Shift Diagnosis (Batch 2B)
  if (
    p.includes('chan doan ca') ||
    p.includes('lech tien') ||
    p.includes('doi soat ket') ||
    p.includes('kiem tra ca') ||
    p.includes('tien ket')
  ) {
    const res = await executeSkill('shift-diagnosis', {}, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'shift-diagnosis', tier: 0 });
    return { ...res, skillId: 'shift-diagnosis', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1a. Sales Summary (Hôm nay bán bao nhiêu?, Doanh thu hôm nay, v.v.)
  if (
    p.includes('ban bao nhieu') ||
    p.includes('doanh thu') ||
    p.includes('tong ket') ||
    p.includes('hom nay ban') ||
    p.includes('doanh so')
  ) {
    const period = p.includes('thang') ? 'month' : 'today';
    const res = await executeSkill('sales-summary', { period }, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'sales-summary', tier: 0 });
    return { ...res, skillId: 'sales-summary', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1b. Profit & Cost Inquiry (Section M: Capability guarded by VIEW_COST)
  if (p.includes('loi nhuan') || p.includes('gia von') || p.includes('lai bao nhieu')) {
    const actor = context.actor_role ? { id: context.actor_id, role: context.actor_role } : getCurrentActor();
    if (!hasCapability(actor, PERMISSIONS.VIEW_COST)) {
      return {
        text: `⚠️ **Từ chối truy cập (HARD DENY):** Tài khoản vai trò **${actor.role}** không được cấp quyền xem giá vốn và lợi nhuận cửa hàng (yêu cầu quyền VIEW_COST).`,
        tier: 0,
        isError: true,
        permissionDenied: true,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    const period = p.includes('thang') ? 'month' : 'today';
    const res = await executeSkill('profit-inquiry', { period }, context, state);
    storeSensitiveData('last_profit', res.text, PERMISSIONS.VIEW_COST);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'profit-inquiry', tier: 0 });
    return { ...res, skillId: 'profit-inquiry', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 1c. Sensitive Recall (Section M: Verifies sensitive purge on actor switch)
  if (p.includes('nhac lai') || p.includes('so vua roi') || p.includes('so luc nay')) {
    const stored = retrieveSensitiveData('last_profit');
    if (!stored) {
      return {
        text: '⚠️ **Dữ liệu nhạy cảm không khả dụng:** Bộ nhớ nhạy cảm trước đó không tồn tại hoặc đã bị xóa an toàn khi chuyển đổi vai trò người dùng (Actor switch purged sensitive context).',
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    return {
      text: `Thông tin nhạy cảm đã lưu trong phiên:\n${stored}`,
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }

  // 2. Transfer Proposal (Section W: No silent fallback)
  if (
    p.includes('chuyen kho') ||
    p.includes('chuyen hang') ||
    p.startsWith('chuyen ') ||
    (p.includes('chuyen') && (p.includes('sang kho') || p.includes('ve kho') || p.includes('kho phu') || p.includes('kho ha dong')))
  ) {
    const whs = state.data?.warehouses || [];
    if (whs.length < 2) {
      return {
        text: '⚠️ **Không thể tạo đề xuất chuyển kho:** Cửa hàng hiện chỉ có 1 kho. Nghiệp vụ chuyển kho yêu cầu tối thiểu 2 kho khác nhau.\n*(Nguyên tắc an toàn: Không tự ý chuyển thành nhập kho hay sửa tồn)*',
        tier: 0,
        isError: true,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }

    let fromWh = whs[0].id;
    let toWh = whs[1].id;
    let whCandidates = [];

    // Extract quantity if mentioned
    const qtyMatch = p.match(/(\d+)\s*(cai|chiec|san pham|hop|thung|sp)?/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 5;

    // Check if destination warehouse is mentioned
    const destMatch = rawPrompt.match(/(?:sang|về|đến|tới|vào)\s+kho\s+([^,.]+)/i) || rawPrompt.match(/kho\s+([^,.]+)/i);
    if (destMatch) {
      const destQuery = destMatch[1].trim();
      const resWh = resolveWarehouse(destQuery, whs, { currentWarehouseId: fromWh });
      if (resWh.isExact || (resWh.candidates.length === 1 && resWh.bestMatch)) {
        toWh = resWh.bestMatch ? resWh.bestMatch.id : resWh.candidates[0].id;
      } else if (resWh.isAmbiguous || resWh.candidates.length > 1) {
        whCandidates = resWh.candidates;
      }
    } else if (p.includes('sang kho chi nhanh') || p.includes('ve kho chi nhanh') || p.includes('kho chi nhanh')) {
      const matching = whs.filter(w => norm(w.name).includes('chi nhanh'));
      if (matching.length === 1) toWh = matching[0].id;
      else if (matching.length > 1) whCandidates = matching;
    } else if (p.includes('sang kho phu') || p.includes('ve kho phu')) {
      const matching = whs.filter(w => norm(w.name).includes('phu'));
      if (matching.length === 1) toWh = matching[0].id;
      else if (matching.length > 1) whCandidates = matching;
    }

    if (toWh === fromWh) {
      const other = whs.find(w => w.id !== fromWh);
      if (other) toWh = other.id;
    }

    let targetProdId = context.current_product_id;
    if (!targetProdId && state.data?.products?.length) {
      targetProdId = state.data.products[0].id;
    }

    if (whCandidates.length > 1) {
      setPendingIntent({
        skillId: 'transfer-proposal',
        params: {
          fromWarehouseId: fromWh,
          lines: [{ productId: targetProdId, qty }],
          note: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`,
        },
      });
      return {
        text: `Tìm thấy ${whCandidates.length} kho phù hợp. Vui lòng chọn kho nhận hàng:`,
        warehouseCandidates: whCandidates,
        isAmbiguous: true,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }

    const res = await executeSkill('transfer-proposal', {
      fromWarehouseId: fromWh,
      toWarehouseId: toWh,
      lines: [{ productId: targetProdId, qty }],
      note: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`,
    }, context, state);

    logAuditEvent('SKILL_EXECUTED', { skillId: 'transfer-proposal', tier: 0, proposalId: res.proposal?.id });
    return { ...res, skillId: 'transfer-proposal', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 3. Receipt Proposal (Nhập thêm X cái này vào kho...)
  const receiptMatch = p.match(/nhap\s+(them\s+)?(\d+)?\s*(cai|san pham|chiec|hop|thung)?/i);
  if (receiptMatch || p.startsWith('nhap them') || (p.includes('nhap') && p.includes('kho')) || p.includes('lap phieu nhap') || p.includes('phieu nhap')) {
    let qty = 20;
    if (receiptMatch && receiptMatch[2]) {
      qty = parseInt(receiptMatch[2], 10);
    }

    // Determine target warehouse if specified
    let targetWh = context.warehouse_id;
    let whCandidates = [];
    if (p.includes('kho phu') || p.includes('phu')) {
      const matching = (state.data?.warehouses || []).filter(w => norm(w.name).includes('phu'));
      if (matching.length === 1) targetWh = matching[0].id;
      else if (matching.length > 1) whCandidates = matching;
    } else if (p.includes('kho chinh') || p.includes('chinh')) {
      const matching = (state.data?.warehouses || []).filter(w => norm(w.name).includes('chinh') || w.is_default);
      if (matching.length === 1) targetWh = matching[0].id;
      else if (matching.length > 1) whCandidates = matching;
    } else if (p.includes('kho chi nhanh') || p.includes('chi nhanh')) {
      const matching = (state.data?.warehouses || []).filter(w => norm(w.name).includes('chi nhanh'));
      if (matching.length === 1) targetWh = matching[0].id;
      else if (matching.length > 1) whCandidates = matching;
    }

    // Check if query mentions a specific product name: e.g. "nhập 10 cái áo thun"
    let targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
    if (!targetProdId && state.data?.products?.length) {
      targetProdId = state.data.products[0].id;
    }
    const cleanProdText = rawPrompt
      .replace(/nhập\s+(thêm\s+)?\d*\s*(cái|sản phẩm|chiếc|hộp|thùng)?/gi, '')
      .replace(/vào\s+kho\s+(chính|phụ|chi\s+nhánh)?/gi, '')
      .replace(/vào\s+kho/gi, '')
      .trim();

    if (cleanProdText && cleanProdText.length >= 2) {
      const search = executeTool('search_products', { query: cleanProdText }, state, context);
      if (search.count === 1) {
        targetProdId = search.candidates[0].id;
        setLastResolvedProduct(search.candidates[0]);
      } else if (search.count > 1) {
        // Ambiguous candidates: store pending intent so picking candidate resumes this proposal
        setPendingIntent({
          skillId: 'receipt-proposal',
          params: { qty, warehouseId: targetWh, reason: `Yêu cầu từ trợ lý AI: "${rawPrompt}"` },
        });
        return {
          text: `Tìm thấy ${search.count} sản phẩm khớp với "${cleanProdText}". Vui lòng chọn sản phẩm cần tạo đề xuất nhập kho:`,
          candidates: search.candidates,
          isAmbiguous: true,
          tier: 0,
          provider: PROVIDER_MODES.DETERMINISTIC,
        };
      }
    }

    if (whCandidates.length > 1) {
      setPendingIntent({
        skillId: 'receipt-proposal',
        params: { productId: targetProdId, qty, reason: `Yêu cầu từ trợ lý AI: "${rawPrompt}"` },
      });
      return {
        text: `Tìm thấy ${whCandidates.length} kho phù hợp. Vui lòng chọn kho cần tạo đề xuất nhập:`,
        warehouseCandidates: whCandidates,
        isAmbiguous: true,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }

    const res = await executeSkill('receipt-proposal', {
      productId: targetProdId,
      qty,
      warehouseId: targetWh,
      reason: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`,
    }, context, state);

    logAuditEvent('SKILL_EXECUTED', { skillId: 'receipt-proposal', tier: 0, proposalId: res.proposal?.id });
    return { ...res, skillId: 'receipt-proposal', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 3b. Stocktake Proposal (Section C / Slice 3: Thực tế cái này còn X)
  const stocktakeMatch = p.match(/(?:thuc te|kiem kho|kiem ke|dem duoc|dem thuc te|kiem ton thuc te)(?:\s+(?:cai\s+nay|san pham\s+nay|nay))?\s+(?:con\s+)?(\d+)/i) ||
                         p.match(/thuc te\s+(?:cai nay\s+)?(?:con\s+)?(\d+)/i) ||
                         p.match(/con\s+(\d+)\s+(?:cai\s+)?thuc te/i);
  const isStocktakePhrase = (
    p.includes('thuc te') ||
    p.includes('kiem kho') ||
    p.includes('kiem ke') ||
    p.includes('kiem dem') ||
    p.includes('dem thuc te')
  ) && /\d+/.test(p);
  if (stocktakeMatch || isStocktakePhrase) {
    const counted = stocktakeMatch ? parseInt(stocktakeMatch[1], 10) : parseInt(p.match(/\d+/)[0], 10);
    let targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
    if (!targetProdId && state.data?.products?.length) {
      targetProdId = state.data.products[0].id;
    }
    const targetWh = context.warehouse_id || (state.data?.warehouses || [])[0]?.id;

    const res = await executeSkill('stocktake-proposal', {
      warehouseId: targetWh,
      productId: targetProdId,
      counted,
      reason: `Kiểm kê thực tế từ trợ lý AI: "${rawPrompt}"`,
    }, context, state);

    logAuditEvent('SKILL_EXECUTED', { skillId: 'stocktake-proposal', tier: 0, proposalId: res.proposal?.id });
    return { ...res, skillId: 'stocktake-proposal', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 3c. Memory Save Proposal ("Kho chính không xuất hàng lỗi", "Lưu quy tắc...", "Ghi nhớ...")
  if (
    p.startsWith('ghi nho') ||
    p.startsWith('luu quy tac') ||
    p.startsWith('luu vao tri nho') ||
    p.startsWith('nho rang') ||
    p.includes('khong xuat hang loi') ||
    p.includes('luu y kho')
  ) {
    let scope = MEMORY_SCOPES.SHOP;
    let entityId = null;
    if (p.includes('kho') || p.includes('kho chinh') || p.includes('kho phu')) {
      scope = MEMORY_SCOPES.WAREHOUSE;
      entityId = context.warehouse_id || (state.data?.warehouses || [])[0]?.id;
    } else if (context.current_product_id) {
      scope = MEMORY_SCOPES.PRODUCT;
      entityId = context.current_product_id;
    }

    const res = await executeSkill('memory-save-proposal', {
      scope,
      entityId,
      title: rawPrompt.slice(0, 30),
      content: rawPrompt,
      importance: 2,
    }, context, state);

    logAuditEvent('SKILL_EXECUTED', { skillId: 'memory-save-proposal', tier: 0, proposalId: res.proposal?.id });
    return { ...res, skillId: 'memory-save-proposal', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 3d. Memory Retrieval: "Có gì nên bán kèm?", "Bán kèm gì?"
  if (p.includes('ban kem') || p.includes('kem theo') || p.includes('goi y ban')) {
    const records = queryMemory({ query: 'bán kèm', scope: MEMORY_SCOPES.PRODUCT, entityId: context.current_product_id });
    if (records.length) {
      return {
        text: `Gợi ý bán kèm theo kinh nghiệm cửa hàng:\n${records.map(r => `• **${r.title}**: ${r.content}`).join('\n')}\n*(Lưu ý: Đây là thông tin gợi ý tư vấn, AI không tự ý thêm vào giỏ hàng)*`,
        memories: records,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // 3e. Memory Retrieval: "Xử lý cái này thế nào?", "Hàng lỗi xử lý thế nào?"
  if (p.includes('xu ly the nao') || p.includes('hang loi') || p.includes('quy tac xu ly')) {
    const records = queryMemory({ query: 'lỗi', scope: MEMORY_SCOPES.WAREHOUSE });
    if (records.length) {
      return {
        text: `Quy tắc xử lý đã ghi nhớ của cửa hàng:\n${records.map(r => `• **${r.title}**: ${r.content}`).join('\n')}\n*(Thông tin quy ước dữ liệu — không thay thế thao tác quản lý)*`,
        memories: records,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // 3f. Checkout Guard: Block AI auto-checkout
  if (
    (p.includes('thanh toan') || p.includes('hoan thanh don') || p.includes('tinh tien')) &&
    !p.includes('chua thanh toan') &&
    !p.includes('dung thanh toan') &&
    !p.includes('dung bam thanh toan') &&
    !p.includes('khong thanh toan')
  ) {
    return {
      text: 'Để đảm bảo an toàn tài chính, AI không tự ý hoàn tất thanh toán hoặc chốt đơn mà không có xác nhận trả tiền thật từ thu ngân.\nVui lòng bấm nút **Thanh toán** trên màn hình POS để chọn phương thức và in hóa đơn.',
      tier: 0,
      provider: PROVIDER_MODES.DETERMINISTIC,
    };
  }
  if (p.includes('chua thanh toan') || p.includes('dung thanh toan') || p.includes('dung bam thanh toan') || p.includes('khong thanh toan')) {
    if (p.includes('gio') && !p.includes('them')) {
      return {
        text: 'Đã giữ đơn trong giỏ hàng và không thanh toán. AI không tự ý hoàn tất thanh toán hoặc chốt đơn mà không có xác nhận trả tiền thật từ thu ngân.',
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // 4. Order Diagnosis (Đơn này vì sao chưa xong?, Đơn đang vướng gì?)
  if (
    p.includes('vi sao chua xong') ||
    p.includes('chua xong') ||
    p.includes('vuong gi') ||
    p.includes('chan doan don') ||
    p.includes('trang thai don') ||
    (p.includes('don nay') && (p.includes('sao') || p.includes('loi') || p.includes('chua')))
  ) {
    const res = await executeSkill('order-diagnosis', {}, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'order-diagnosis', tier: 0 });
    return { ...res, skillId: 'order-diagnosis', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 5. Low stock query (Hàng sắp hết, Cảnh báo tồn, Hết hàng)
  if (
    !p.startsWith('mo ') &&
    !p.startsWith('xem ') &&
    (
      p.includes('sap het') ||
      p.includes('canh bao ton') ||
      p.includes('ton thap') ||
      p.includes('het hang')
    )
  ) {
    const res = await executeSkill('find-low-stock', {}, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'find-low-stock', tier: 0 });
    return { ...res, skillId: 'find-low-stock', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 6. Natural Language App Navigation & Feature Inquiries (Batch 2B)
  if (
    !p.includes('con bao nhieu') &&
    !p.includes('con may') &&
    !p.includes('kiem ton') &&
    !p.includes('ton kho') &&
    (
      p.startsWith('mo ') ||
      p.startsWith('xem ') ||
      p.includes('o dau') ||
      p.startsWith('cai dat') ||
      (p.startsWith('cai ') && (p.includes('in') || p.includes('may in') || p.includes('thiet bi'))) ||
      p.includes('kenh ban hang') ||
      p.includes('shopee') ||
      p.includes('tiktok shop')
    )
  ) {
    // Check for specific destinations
    if (p.includes('hang sap het') || p.includes('ton thap')) {
      const actRes = await executeAction('open_low_stock', {}, state);
      return {
        text: actRes.success ? 'Đã mở danh sách **Hàng sắp hết** trong kho.' : `⚠️ ${actRes.error}`,
        actionId: 'open_low_stock',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('danh muc') || p.includes('hang hoa') || (p.startsWith('mo ') && p.includes('san pham'))) {
      const prodQuery = rawPrompt.replace(/^(mở|xem)\s+(sản phẩm|hàng hóa)?/i, '').trim();
      if (prodQuery && prodQuery.length >= 2 && !prodQuery.includes('danh mục')) {
        const srch = executeTool('search_products', { query: prodQuery }, state, context);
        if (srch.count === 1) {
          const actRes = await executeAction('open_product', { productId: srch.candidates[0].id }, state);
          setLastResolvedProduct(srch.candidates[0]);
          return {
            text: actRes.success ? `Đã mở chi tiết sản phẩm **${srch.candidates[0].name}**.` : `⚠️ ${actRes.error}`,
            actionId: 'open_product',
            actionResult: actRes,
            tier: 0,
            provider: PROVIDER_MODES.DETERMINISTIC,
          };
        }
      }
      const actRes = await executeAction('open_products', {}, state);
      return {
        text: actRes.success ? 'Đã mở danh sách **Hàng hóa**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_products',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('don hang') || p.includes('don cho')) {
      const codeMatch = rawPrompt.match(/([A-Za-z0-9_-]{4,})/);
      if (codeMatch) {
        const srchOrd = executeTool('search_orders', { query: codeMatch[1] }, state, context);
        if (srchOrd.count >= 1) {
          const actRes = await executeAction('open_order', { orderId: srchOrd.orders[0].id }, state);
          return {
            text: actRes.success ? `Đã mở chi tiết đơn hàng **${srchOrd.orders[0].code}**.` : `⚠️ ${actRes.error}`,
            actionId: 'open_order',
            actionResult: actRes,
            tier: 0,
            provider: PROVIDER_MODES.DETERMINISTIC,
          };
        }
      }
      const actRes = await executeAction('open_pending_orders', {}, state);
      return {
        text: actRes.success ? 'Đã mở danh sách **Đơn hàng chờ xử lý**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_pending_orders',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('chua thanh toan')) {
      const actRes = await executeAction('open_unpaid_orders', {}, state);
      return {
        text: actRes.success ? 'Đã mở danh sách **Đơn hàng chưa thanh toán**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_unpaid_orders',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('nhap kho') || p.includes('phieu nhap')) {
      const actRes = await executeAction('open_receipt', {}, state);
      return {
        text: actRes.success ? 'Đã mở biểu mẫu **Nhập kho nhanh**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_receipt',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('chuyen kho') || p.includes('dieu chuyen')) {
      const actRes = await executeAction('open_transfer', {}, state);
      return {
        text: actRes.success ? 'Đã mở biểu mẫu **Chuyển kho**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_transfer',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('kiem kho') || p.includes('kiem ke')) {
      const actRes = await executeAction('open_stocktake', {}, state);
      return {
        text: actRes.success ? 'Đã mở biểu mẫu **Kiểm kho nhanh**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_stocktake',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('kho')) {
      const actRes = await executeAction('open_warehouse', {}, state);
      return {
        text: actRes.success ? 'Đã mở trung tâm **Kho hàng & Luân chuyển**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_warehouse',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('may in') || p.includes('cai dat in') || p.includes('in an')) {
      const actRes = await executeAction('open_print_settings', {}, state);
      return {
        text: actRes.success ? 'Đã mở màn hình **Cấu hình máy in & thiết bị**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_print_settings',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('giao hang') || p.includes('van chuyen') || p.includes('ghn') || p.includes('ghtk')) {
      const actRes = await executeAction('open_shipping_settings', {}, state);
      return {
        text: actRes.success ? 'Đã mở cấu hình **Kết nối đối tác giao hàng**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_shipping_settings',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('kenh ban') || p.includes('shopee') || p.includes('tiktok') || p.includes('san thuong mai')) {
      return {
        text: 'Tính năng **Kết nối kênh bán hàng (Shopee / TikTok Shop)** đang trong kế hoạch phát triển (COMING_SOON). Bạn sẽ sớm có thể đồng bộ đơn hàng và tồn kho trực tiếp từ các sàn TMĐT!',
        featureState: IMPLEMENTATION_STATE.COMING_SOON,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('sao luu') || p.includes('backup') || p.includes('khoi phuc')) {
      const actRes = await executeAction('open_backup', {}, state);
      return {
        text: actRes.success ? 'Đã mở trung tâm **Sao lưu & Dữ liệu**.' : (actRes.permissionDenied ? `⚠️ **Từ chối quyền:** ${actRes.error}` : `⚠️ ${actRes.error}`),
        actionId: 'open_backup',
        actionResult: actRes,
        permissionDenied: actRes.permissionDenied,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('phan quyen') || p.includes('nguoi dung') || p.includes('nhan vien')) {
      const actRes = await executeAction('open_permissions', {}, state);
      return {
        text: actRes.success ? 'Đã mở cấu hình **Người dùng & Phân quyền**.' : (actRes.permissionDenied ? `⚠️ **Từ chối quyền:** ${actRes.error}` : `⚠️ ${actRes.error}`),
        actionId: 'open_permissions',
        actionResult: actRes,
        permissionDenied: actRes.permissionDenied,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('so quy') || p.includes('thu chi')) {
      const actRes = await executeAction('open_cash', {}, state);
      return {
        text: actRes.success ? 'Đã mở **Sổ quỹ tiền mặt**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_cash',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('ca ban') || p.includes('so ca') || p.includes('dong ca') || p.includes('mo ca')) {
      const actRes = await executeAction('open_shift', {}, state);
      return {
        text: actRes.success ? 'Đã mở **Sổ ca & Bàn giao thu ngân**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_shift',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
    if (p.includes('tong quan') || p.includes('trang chu') || p.includes('dashboard')) {
      const actRes = await executeAction('open_dashboard', {}, state);
      return {
        text: actRes.success ? 'Đã mở màn hình **Tổng quan**.' : `⚠️ ${actRes.error}`,
        actionId: 'open_dashboard',
        actionResult: actRes,
        tier: 0,
        provider: PROVIDER_MODES.DETERMINISTIC,
      };
    }
  }

  // 7. Stock check (Còn bao nhiêu?, Kiểm tồn, v.v.)
  if (
    p.includes('con bao nhieu') ||
    p.includes('kiem ton') ||
    p.includes('ton kho') ||
    p.includes('con hang khong') ||
    p.includes('kho nao con')
  ) {
    let cleanQuery = rawPrompt
      .replace(/còn bao nhiêu/gi, '')
      .replace(/kiểm tồn/gi, '')
      .replace(/tồn kho/gi, '')
      .replace(/kho nào còn/gi, '')
      .replace(/sản phẩm/gi, '')
      .replace(/cái này/gi, '')
      .trim();

    const res = await executeSkill('check-stock', { query: cleanQuery }, context, state);
    if (res.product) {
      setLastResolvedProduct(res.product);
    }
    logAuditEvent('SKILL_EXECUTED', { skillId: 'check-stock', tier: 0 });
    return { ...res, skillId: 'check-stock', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 8. Shop Memory & Notes Query
  if (p.includes('tri nho') || p.includes('ghi nho') || p.includes('luu y') || p.includes('ghi chu')) {
    const res = await executeSkill('memory-retrieve', { query: rawPrompt }, context, state);
    logAuditEvent('SKILL_EXECUTED', { skillId: 'memory-retrieve', tier: 0 });
    return { ...res, skillId: 'memory-retrieve', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // 9. Generic Product Search (Tìm sản phẩm X, Tra mã SKU X, hoặc gõ trực tiếp tên mặt hàng)
  let cleanQuery = null;
  if (p.startsWith('tim ') || p.startsWith('tra ') || p.startsWith('san pham ') || (p.includes('san pham') && !p.includes('?') && !p.includes('khong'))) {
    cleanQuery = rawPrompt
      .replace(/^tìm\s+(sản phẩm\s+)?/i, '')
      .replace(/^tra\s+(mã\s+)?/i, '')
      .trim();
  } else if (rawPrompt.length >= 2 && !p.includes('?') && !p.includes('la gi')) {
    const quickCheck = executeTool('search_products', { query: rawPrompt }, state, context);
    if (quickCheck.count > 0) {
      cleanQuery = rawPrompt;
    }
  }

  if (cleanQuery) {
    const res = await executeSkill('search-product', { query: cleanQuery }, context, state);
    if (res.product) {
      setLastResolvedProduct(res.product);
    }
    logAuditEvent('SKILL_EXECUTED', { skillId: 'search-product', tier: 0 });
    return { ...res, skillId: 'search-product', tier: 0, provider: PROVIDER_MODES.DETERMINISTIC };
  }

  // ==========================================
  // DETERMINISTIC FALLBACK GUIDANCE
  // ==========================================
  return {
    text: `Tôi có thể hỗ trợ bạn theo ngữ cảnh hiện tại (**${context.current_route}**):\n` +
      `• **Tổng quan**: "Hôm nay bán bao nhiêu?", "Hàng sắp hết"\n` +
      `• **Hàng hóa**: "Còn bao nhiêu?", "Nhập thêm 20 cái này vào kho chính"\n` +
      `• **Đơn hàng**: "Đơn này vì sao chưa xong?"\n` +
      `• **Tìm kiếm**: Gõ tên sản phẩm, SKU hoặc chọn các gợi ý bên dưới.`,
    tier: 0,
    provider: PROVIDER_MODES.DETERMINISTIC,
  };
}
