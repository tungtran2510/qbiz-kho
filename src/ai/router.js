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
import { hasCapability, PERMISSIONS, detectPromptInjection } from './policy.js';
import { executeAction, lookupFeature, lookupAction, IMPLEMENTATION_STATE } from './registry.js';
import { norm as dictNorm, classifyIntent, detectEntityType, isPronounReference, isConfirmation, isCancellation, isCorrection, parseTimeExpression, extractQuantityAndUnit } from './dictionary.js';
import { findActionsByAlias, getSuggestedActions, ACTION_REGISTRY } from './registry.js';
import { resolveProduct, resolveCustomer, autoDetectAndResolve } from './resolver.js';

function norm(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
      return { type: 'ACTION', action_id: 'select_customer', action: ACTION_REGISTRY['select_customer'], confidence: 95, source: 'customer_select' };
    }
    // "thêm 5" in sales -> fall through to sales cart handler
    if (/^(?:them|cong|tang|nhap them)\s+\d+/i.test(p)) {
      return null;
    }
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
    if (p.includes('con bao nhieu') || p.includes('kiem ton') || p.includes('con khong') || p.includes('ton kho') || p === 'con bao nhieu') {
      return { type: 'ACTION', action_id: 'check_stock', action: ACTION_REGISTRY['check_stock'], params: { productId: activeProductId }, confidence: 95, source: 'product_context' };
    }
    if (p.startsWith('nhap them') || p.includes('nhap them') || (p.startsWith('them') && isPronounReference(p))) {
      const q = extractQuantityAndUnit(p);
      return { type: 'ACTION', action_id: 'create_receipt_proposal', action: ACTION_REGISTRY['create_receipt_proposal'], params: { productId: activeProductId, qty: q?.quantity || 5 }, confidence: 95, source: 'product_context' };
    }
    if (p.includes('doi gia') || p.includes('thay gia') || p.includes('sua gia')) {
      return { type: 'ACTION', action_id: 'new_product', action: ACTION_REGISTRY['new_product'], confidence: 85, source: 'product_context' };
    }
  }

  // If on products list without an active product, let "thêm [số]" fall through to ambiguous clarification
  if (currRoute === 'products' && !activeProductId && /^(?:them|cong|tang)\s+\d+/i.test(p)) {
    return null;
  }

  // 5. Warehouse receipt proposal with warehouse or product mentioned ("thêm X cái ... vào kho ...")
  if ((p.startsWith('nhap them') || p.startsWith('them')) && (p.includes('vao kho') || p.includes('kho'))) {
    return { type: 'ACTION', action_id: 'create_receipt_proposal', action: ACTION_REGISTRY['create_receipt_proposal'], confidence: 95, source: 'receipt_pattern' };
  }

  // 6. Try registry alias matching (most specific)
  const aliasMatches = findActionsByAlias(p);
  if (aliasMatches.length > 0 && aliasMatches[0].matchScore >= 80) {
    const bestAction = aliasMatches[0].action;
    return {
      type: 'ACTION',
      action_id: bestAction.id,
      action: bestAction,
      confidence: aliasMatches[0].matchScore,
      source: 'registry_alias',
    };
  }

  // 7. Classify intent + detect entity type
  const intent = classifyIntent(p);
  const entity = detectEntityType(p);

  if (intent && entity) {
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

export async function routeIntent(prompt, context, state) {
  const rawPrompt = String(prompt || '').trim();

  // === Batch A5: Dictionary-based routing (runs first) ===
  const dictResult = dictionaryRoute(rawPrompt, context, state);
  if (dictResult) {
    // Handle structured results from dictionary layer
    if (dictResult.type === 'ACTION' && dictResult.action) {
      try {
        const result = await dictResult.action.execute(dictResult.params || {}, state, context);
        const msg = result?.text || result?.message || dictResult.action.name;
        return { text: msg, ...result, tier: 0, provider: 'dictionary' };
      } catch (e) {
        // Fall through to existing router on error
      }
    }
    if (dictResult.type === 'SUGGEST') {
      return { text: dictResult.message + '\n' + dictResult.suggestions.map(s => `\u2022 ${s.label}`).join('\n'), tier: 0, provider: 'dictionary' };
    }
    if (dictResult.type === 'CONFIRM_PENDING') {
      const pIntent = getPendingIntent() || dictResult.pending;
      clearPendingIntent();
      if (pIntent?.skillId) {
        const res = await executeSkill(pIntent.skillId, pIntent.params || {}, context, state);
        return { ...res, text: `Đã xác nhận: ${res.text || 'thực hiện thao tác thành công.'}`, tier: 0, provider: 'dictionary' };
      }
      return { text: 'Đã xác nhận thao tác.', tier: 0, provider: 'dictionary' };
    }
    if (dictResult.type === 'CANCEL_PENDING') {
      clearPendingIntent();
      return { text: 'Đã hủy thao tác đang chờ.', tier: 0, provider: 'dictionary' };
    }
    if (dictResult.type === 'CORRECT_PENDING') {
      clearPendingIntent();
      return { text: 'Đã hủy lệnh trước. Vui lòng cho biết yêu cầu mới của bạn.', tier: 0, provider: 'dictionary' };
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

  // Context-sensitive "thêm [số]" handling
  const addMatch = dictNorm(rawPrompt).match(/^(?:them|cong|tang|nhap them)\s+(\d+)(?:\s*(?:cai|mon|chiec|san pham|sp))?(?:\s*(?:nay|cai nay))?$/i);
  if (addMatch) {
    const qty = parseInt(addMatch[1], 10) || 1;
    // Context A: Sales / POS
    if (context.current_route === 'sales') {
      let targetProdId = context.current_product_id || getLastResolvedProduct()?.id;
      if (!targetProdId && state.data?.products?.length) {
        targetProdId = state.data.products[0].id;
      }
      if (targetProdId) {
        const prodObj = (state.data?.products || []).find(p => p.id === targetProdId);
        const res = await executeSkill('add-cart-draft', { items: [{ productId: targetProdId, qty }] }, context, state);
        return { ...res, text: `Đã đưa ${qty} ${prodObj ? prodObj.name : 'sản phẩm'} vào giỏ hàng POS.`, tier: 0, provider: 'contextual' };
      }
      return { text: 'Vui lòng chọn sản phẩm trên màn hình bán hàng để thêm vào giỏ.', tier: 0, provider: 'contextual' };
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
  const config = getProviderConfig();

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
  if (p.includes('chuyen kho') || p.includes('chuyen hang') || p.startsWith('chuyen ')) {
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

    // Check if destination warehouse is mentioned with ambiguity
    if (p.includes('sang kho chi nhanh') || p.includes('ve kho chi nhanh') || p.includes('kho chi nhanh')) {
      const matching = whs.filter(w => norm(w.name).includes('chi nhanh'));
      if (matching.length === 1) toWh = matching[0].id;
      else if (matching.length > 1) whCandidates = matching;
    } else if (p.includes('sang kho phu') || p.includes('ve kho phu')) {
      const matching = whs.filter(w => norm(w.name).includes('phu'));
      if (matching.length === 1) toWh = matching[0].id;
      else if (matching.length > 1) whCandidates = matching;
    }

    let targetProdId = context.current_product_id;
    if (!targetProdId && state.data?.products?.length) {
      targetProdId = state.data.products[0].id;
    }

    // Extract quantity if mentioned
    const qtyMatch = p.match(/(\d+)\s*(cai|chiec|san pham)?/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 5;

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
  if (receiptMatch || p.startsWith('nhap them') || (p.includes('nhap') && p.includes('kho'))) {
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
    p.startsWith('mo ') ||
    p.startsWith('xem ') ||
    p.includes('o dau') ||
    p.startsWith('cai ') ||
    p.includes('kenh ban hang') ||
    p.includes('shopee') ||
    p.includes('tiktok shop')
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
  // CLOUD PROVIDER DISPATCH (IF CONFIGURED)
  // ==========================================
  if (config.mode !== PROVIDER_MODES.DETERMINISTIC) {
    const adapter = new AIProviderAdapter(config);
    try {
      const providerRes = await adapter.generateResponse({
        prompt: rawPrompt,
        context,
        systemPrompt: 'Bạn là Trợ lý vận hành QBiz Kho. Chỉ đưa ra phân tích và đề xuất có căn cứ theo dữ liệu ngữ cảnh cung cấp. Không bịa đặt số liệu hay tự tiện cập nhật dữ liệu.',
      });

      logAuditEvent('PROVIDER_CALLED', { mode: config.mode, success: true });
      return {
        text: providerRes.text,
        tier: 1,
        provider: config.mode,
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
