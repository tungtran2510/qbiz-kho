/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — SEMANTIC PLANNER (PHASE 1)
 * 
 * Core Architectural Role:
 * - Primary semantic reasoner for all natural language and business inquiries.
 * - Receives a compact Context Capsule + Tool Manifest (no whole database dumping).
 * - Produces a Universal Semantic Plan with `intents[]` (multi-intent capable).
 * - Enforces Post-Plan Business Risk Guard (READ+READ allowed, WRITE requires proposal).
 */

import { canonicalizeVietnamese, parseVietnameseTaxCode, parseVietnameseCustomer, parseVietnameseCurrency } from './vietnamese-nlp.js';
import { getCurrentActor } from './context.js';
import { hasCapability, PERMISSIONS } from './policy.js';
import { getProviderConfig, dispatchSemanticPlanning, dispatchCloudEscalation, dispatchDeepSeekPrimary, PROVIDER_MODES } from './providers.js';
import { generateModelToolManifest, generateCompactToolManifest, isValidCapability } from './capability-registry.js';
import { getConversationId, buildConversationContextSummary } from './conversation-state.js';

export const TOOL_MANIFEST = generateModelToolManifest();


/**
 * Build a compact, lightweight Context Capsule for the Semantic Planner.
 * Strictly avoids dumping the entire business database into the prompt.
 */
export function buildContextCapsule(prompt, context = {}, state = {}) {
  const now = new Date();
  const rawPrompt = String(prompt || '').trim();
  const pNorm = canonicalizeVietnamese(rawPrompt);

  const actor = context.actor_role
    ? { id: context.actor_id, role: context.actor_role }
    : getCurrentActor();

  const boundProdId = context?.current_product_id || state?.currentProductId || null;
  const boundProd = boundProdId ? (state?.data?.products || []).find(p => p.id === boundProdId) : null;

  const boundProductSummary = boundProd ? {
    id: boundProd.id,
    name: boundProd.name,
    sku: boundProd.sku || '',
    unit: boundProd.unit || 'cái',
    lowStock: boundProd.lowStock ?? 5,
    onHand: boundProd.onHand ?? 0,
  } : null;

  const convSummary = buildConversationContextSummary();

  return {
    request_id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    conversation_id: getConversationId(),
    conversation_context: convSummary,
    raw_prompt: rawPrompt,
    normalized_prompt: pNorm,
    route: context.current_route || 'dashboard',
    screen: context.current_screen || context.current_route || 'dashboard',
    shop_id: context.shop_id || 'shop_default',
    warehouse_id: context.warehouse_id || 'all',
    bound_product: boundProductSummary,
    actor: {
      id: actor.id || 'usr_owner_1',
      role: actor.role || 'owner',
    },
    local_time: {
      iso: now.toISOString(),
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      day_of_week: now.getDay(),
    },
    tool_manifest: TOOL_MANIFEST,
  };
}

/**
 * Validate that a returned plan strictly obeys the Universal Plan Contract.
 */
export function validateSemanticPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return { valid: false, error: 'PLAN_NOT_OBJECT' };
  }
  if (!Array.isArray(plan.intents) || plan.intents.length === 0) {
    return { valid: false, error: 'PLAN_MISSING_INTENTS' };
  }

  for (let i = 0; i < plan.intents.length; i++) {
    const item = plan.intents[i];
    if (!item.required_capability && (item.capability || item.tool || item.intent_name)) {
      item.required_capability = item.capability || item.tool || item.intent_name;
    }
    if (!item.intent_name && item.required_capability) {
      item.intent_name = item.required_capability;
    }
    if (!item.intent_name || !item.required_capability) {
      return { valid: false, error: `INTENT_${i}_MISSING_CAPABILITY` };
    }
    if (typeof item.required_capability === 'string') {
      item.required_capability = item.required_capability.trim().replace(/-/g, '_');
    }
    if (typeof item.intent_name === 'string') {
      item.intent_name = item.intent_name.trim().replace(/-/g, '_');
    }
    if (item.required_capability === 'receipt_proposal' || item.intent_name === 'receipt_proposal') {
      item.required_capability = 'receipt_proposal';
      item.intent_name = 'receipt_proposal';
      item.mode = 'WRITE';
      item.domain = 'INVENTORY';
    }
    if (item.required_capability === 'clarify_ambiguity' || item.intent_name === 'clarify_ambiguity') {
      item.required_capability = 'clarify_ambiguity';
      item.intent_name = 'clarify_ambiguity';
      item.mode = 'READ';
      item.domain = 'SYSTEM';
    }
    if (!isValidCapability(item.required_capability)) {
      return { valid: false, error: `INTENT_${i}_UNREGISTERED_CAPABILITY_${item.required_capability}` };
    }
    const mode = (item.mode || 'READ').toUpperCase();
    if (mode !== 'READ' && mode !== 'WRITE' && mode !== 'HIGH_RISK_WRITE') {
      return { valid: false, error: `INTENT_${i}_INVALID_MODE` };
    }
  }

  return { valid: true };
}

/**
 * POST-PLAN BUSINESS RISK GUARD:
 * - Checks user role against plan capabilities (e.g. VIEW_COST for profit).
 * - Enforces READ+READ as completely safe.
 * - Converts any WRITE action into Proposal requirements.
 */
export function postPlanRiskGuard(plan, context = {}) {
  const actor = context.actor_role
    ? { id: context.actor_id, role: context.actor_role }
    : getCurrentActor();

  for (const intent of plan.intents) {
    // 1. Financial Permission Check
    if (intent.required_capability === 'get_profit_summary') {
      if (!hasCapability(actor, PERMISSIONS.VIEW_COST)) {
        return {
          allowed: false,
          deniedReason: `⚠️ **Từ chối quyền truy cập (HARD DENY):** Tài khoản vai trò **${actor.role}** không được cấp quyền xem giá vốn và báo cáo lợi nhuận cửa hàng (yêu cầu quyền VIEW_COST).`,
          permissionDenied: true,
          status: 'BLOCKED',
        };
      }
    }

    // 2. Settings / Security Management Check
    if (intent.domain === 'SYSTEM' && intent.intent_name.includes('security')) {
      if (actor.role !== 'owner' && actor.role !== 'manager') {
        return {
          allowed: false,
          deniedReason: `⚠️ **Từ chối phân quyền:** Vai trò **${actor.role}** không được phép can thiệp cài đặt hệ thống.`,
          permissionDenied: true,
          status: 'BLOCKED',
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Fallback Semantic Planner:
 * High-accuracy semantic rule-based planner used when external/local LLM is offline or unconfigured.
 * CRITICAL RULE: Never morphs forward-looking advice into past history!
 */
export function generateDeterministicSemanticPlan(capsule) {
  const p = capsule.normalized_prompt;
  const intents = [];
  let composition = 'SINGLE';

  // --- Sub-intent detection ---

  // 1. Profit Inquiry intent
  const asksProfit = (
    p.includes('loi bao nhieu') || p.includes('lai bao nhieu') || p.includes('loi nhuan') ||
    p.includes('gia von') || p.includes('tong gia von') || p.includes('gia von ban hang') ||
    p.includes('lai duoc bao nhieu') || p.includes('loi duoc bao nhieu') ||
    p.includes('lai dc bao nhieu') || p.includes('loi dc bao nhieu') ||
    p.includes('lai duoc') || p.includes('loi duoc') ||
    p.includes('loi hay lo') || p.includes('lai hay lo') || p.includes('lo hay loi') || p.includes('lo hay lai') ||
    p.includes('dang loi') || p.includes('dang lai') || p.includes('dang lo') ||
    p.includes('lai gop') || p.includes('loi gop') ||
    p.includes('lai rong') || p.includes('loi rong') ||
    p.includes('tien lai') || p.includes('loi lai') ||
    p.includes('lai hon') || p.includes('loi hon') ||
    p.includes('co loi khong') || p.includes('co lai khong') ||
    p.includes('co loi ko') || p.includes('co lai ko') ||
    p.includes('co loi k') || p.includes('co lai k') ||
    p.includes('loi nhieu khong') || p.includes('lai nhieu khong') ||
    p.includes('loi nhieu ko') || p.includes('lai nhieu ko') ||
    p.includes('loi bn') || p.includes('lai bn') ||
    p.includes('loi dc bn') || p.includes('lai dc bn') ||
    p.includes('ty suat loi nhuan') || p.includes('ti suat loi nhuan') ||
    p.includes('ty le loi nhuan') || p.includes('ti le loi nhuan') ||
    p.includes('gross profit') || p.includes('net profit') || p.includes('profit') ||
    ((p.includes('thang') || p.includes('hom nay') || p.includes('tuan') || p.includes('ngay nay') || p.includes('ngay qua') || p.includes('tu dau thang') || p.includes('hom qua')) && (p.includes('loi') || p.includes('lai')))
  ) && !(p.includes('tra loi') || p.includes('loi khuyen') || p.includes('loi he thong') || p.includes('xin loi') || p.includes('bao loi') || p.includes('loi phat am'));

  // Subclause period extractor
  const extractSubclausePeriod = (keywords, defaultPeriod = 'this_week') => {
    let bestIdx = -1;
    for (const kw of keywords) {
      const pos = p.indexOf(kw);
      if (pos !== -1) {
        bestIdx = pos;
        break;
      }
    }
    if (bestIdx === -1) return defaultPeriod;
    const windowStart = Math.max(0, bestIdx - 35);
    const windowEnd = Math.min(p.length, bestIdx + 35);
    const subclause = p.slice(windowStart, windowEnd);

    if (subclause.includes('thang truoc') || subclause.includes('thang qua')) return 'last_month';
    if (subclause.includes('thang nay') || subclause.includes('dau thang')) return 'month';
    if (subclause.includes('tuan truoc') || subclause.includes('tuan qua')) return 'last_week';
    if (subclause.includes('tuan nay') || subclause.includes('trong tuan')) return 'this_week';
    if (subclause.includes('hom qua') || subclause.includes('yesterday')) return 'yesterday';
    if (subclause.includes('hom nay') || subclause.includes('today')) return 'today';
    if (subclause.includes('2 ngay') || subclause.includes('hai ngay')) return '2_days';
    if (subclause.includes('3 ngay') || subclause.includes('ba ngay')) return '3_days';
    if (subclause.includes('7 ngay') || subclause.includes('7d')) return '7d';
    if (subclause.includes('30 ngay') || subclause.includes('30d')) return '30d';

    return defaultPeriod;
  };

  // 1b. Product Performance Ranking intent
  const explicitRanking = (
    p.includes('ban tot') || p.includes('ban khong tot') ||
    p.includes('ban kem') || p.includes('ban e') ||
    p.includes('ban cham') || p.includes('e am') ||
    p.includes('e khong') || p.includes('co e') ||
    p.includes('noi bat') || p.includes('ban chay') ||
    p.includes('chay nhat') ||
    p.includes('ban duoc nhung gi') || p.includes('ban duoc gi') || p.includes('cai gi ban duoc') ||
    p.includes('cai nao ban duoc') || p.includes('mat hang nao ban duoc') ||
    p.includes('khong ban duoc') || p.includes('chua ban duoc') ||
    p.includes('ban nhieu') || p.includes('ban it') ||
    p.includes('it nguoi mua') || p.includes('nhieu nguoi mua') ||
    p.includes('xep hang') || p.includes('hieu suat') ||
    ((p.includes('mat hang') || p.includes('san pham') || p.includes('cai nao') || p.includes('mon nao') || p.includes('hang nao')) &&
      (p.includes('ban tot') || p.includes('ban kem') || p.includes('ban chay') || p.includes('ban e') || /\b[eế]\b/i.test(p)))
  ) && !(p.includes('ban duoc bao nhieu') || p.includes('ban bao nhieu') || p.includes('ban dc bao nhieu'));
  const asksProductRanking = explicitRanking;

  // 1c. Sales Summary / Revenue intent
  const explicitSales = (
    p.includes('doanh thu') || p.includes('doanh so') ||
    p.includes('ban duoc bao nhieu') || p.includes('ban bao nhieu') || p.includes('ban dc bao nhieu') ||
    p.includes('tong tien ban') || p.includes('thu duoc bao nhieu')
  );
  const contextualSales = !asksProfit && !asksProductRanking && (
    p.includes('ban the nao') || p.includes('tinh hinh ban hang') ||
    (p.includes('ban duoc') && (p.includes('hom nay') || p.includes('ngay nay') || p.includes('tuan') || p.includes('thang')))
  );
  const asksSalesSummary = explicitSales || contextualSales;

  let rankingPeriod = extractSubclausePeriod(['chay', 'ban tot', 'ban kem', 'ban e', 'noi bat', 'e'], 'this_week');

  // 2. Replenishment Advice / Planning intent (Forward-looking!)
  const asksReplenishmentAdvice = (
    p.includes('can nhap') || p.includes('nen nhap') || p.includes('co nen nhap') ||
    p.includes('co can nhap') || p.includes('de xuat nhap') || p.includes('goi y nhap') ||
    p.includes('can them nhap') || p.includes('nhap them cai gi') || p.includes('nhap them gi') ||
    p.includes('len lay') || p.includes('nen lay') || p.includes('hang nao len lay') || p.includes('hang nao nen lay') ||
    p.includes('nhung cai gi') || p.includes('mat hang nao') || p.includes('hang nao can nhap') ||
    p.includes('can nhap nhung cai gi') || p.includes('nhap gi') || p.includes('nhap them')
  );

  // 3. Past Receipts Aggregate intent (Backward-looking history only!)
  const asksReceiptsHistory = (
    (p.includes('da nhap') || p.includes('nhap vao bao nhieu') || p.includes('nhap may don')) &&
    !asksReplenishmentAdvice
  );

  // 4. Low stock check
  const asksLowStock = (
    p.includes('sap het') || p.includes('gan het') || p.includes('het hang') ||
    p.includes('con ton it') || p.includes('ton it') || p.includes('hang nao con ton it')
  );

  // 5. High stock check
  const asksHighStock = (
    p.includes('con ton nhieu') || p.includes('ton nhieu') || p.includes('nhieu ton') ||
    p.includes('ton cao') || p.includes('hang nao con ton nhieu') || p.includes('hang nao ton nhieu')
  );

  // 6. Specific Product Stock Check
  const asksProductStock = (
    p.includes('con bao nhieu') || p.includes('ton kho') || p.includes('con may') ||
    p.includes('kiem tra san pham') || p.includes('kiem tra ton') || p.includes('con hang khong') ||
    p.includes('con ton khong') || (p.includes('kiem tra') && p.includes('con'))
  ) && !asksLowStock && !asksHighStock;

  let mentionedProduct = null;
  const rawP = capsule.raw_prompt || '';
  const prodMatch = rawP.match(/(?:sản phẩm|mặt hàng|hàng|món)\s+([^,?.!]+?)(?:\s+(?:còn|hết|bao nhiêu|giá|và|có|ở|kho)|\?|$)/i);
  if (prodMatch && prodMatch[1]) {
    mentionedProduct = prodMatch[1].trim();
  }

  // --- Build Plan based on identified intents ---

  if (asksProfit) {
    const profitPeriod = extractSubclausePeriod(['loi hay lo', 'lo hay loi', 'lai lo', 'loi nhuan', 'tien lai', 'loi', 'lai', 'lo'], (p.includes('thang nay') ? 'month' : 'this_week'));

    intents.push({
      intent_name: 'query_profit',
      mode: 'READ',
      domain: 'FINANCE',
      entities: { period: profitPeriod },
      time_range: profitPeriod,
      required_capability: 'get_profit_summary',
      confidence: 0.95,
    });
  }

  if (asksSalesSummary) {
    const salesPeriod = extractSubclausePeriod(['ban duoc bao nhieu', 'ban bao nhieu', 'doanh thu', 'doanh so', 'tong tien', 'ban duoc'], (p.includes('thang nay') ? 'month' : 'today'));

    intents.push({
      intent_name: 'sales_summary',
      mode: 'READ',
      domain: 'SALES',
      entities: { period: salesPeriod },
      time_range: salesPeriod,
      required_capability: 'sales_summary',
      confidence: 0.95,
    });
  }

  if (asksProductRanking) {
    intents.push({
      intent_name: 'product_performance_ranking',
      mode: 'READ',
      domain: 'SALES',
      entities: { period: rankingPeriod, query: capsule.raw_prompt },
      time_range: rankingPeriod,
      required_capability: 'product_performance_ranking',
      confidence: 0.98,
    });
  }

  if (asksHighStock) {
    intents.push({
      intent_name: 'check_stock_high',
      mode: 'READ',
      domain: 'INVENTORY',
      entities: { query: 'ton nhieu' },
      time_range: null,
      required_capability: 'check_stock',
      confidence: 0.95,
    });
  }

  if (asksLowStock) {
    intents.push({
      intent_name: 'find_low_stock',
      mode: 'READ',
      domain: 'INVENTORY',
      entities: {},
      time_range: null,
      required_capability: 'find_low_stock',
      confidence: 0.95,
    });
  }

  if (asksProductStock) {
    intents.push({
      intent_name: 'check_stock',
      mode: 'READ',
      domain: 'INVENTORY',
      entities: { product: mentionedProduct || capsule.raw_prompt },
      time_range: null,
      required_capability: 'check_stock',
      confidence: 0.96,
    });
  }

  if (asksReplenishmentAdvice) {
    if (capsule.bound_product) {
      intents.push({
        intent_name: 'explain_product_replenishment',
        mode: 'READ',
        domain: 'INVENTORY',
        entities: { productId: capsule.bound_product.id, productName: capsule.bound_product.name },
        time_range: null,
        required_capability: 'explain_replenishment',
        confidence: 0.95,
      });
    } else if (mentionedProduct) {
      intents.push({
        intent_name: 'explain_product_replenishment',
        mode: 'READ',
        domain: 'INVENTORY',
        entities: { product: mentionedProduct },
        time_range: null,
        required_capability: 'explain_replenishment',
        confidence: 0.95,
      });
    } else if (capsule.conversation_context?.last_product) {
      intents.push({
        intent_name: 'explain_product_replenishment',
        mode: 'READ',
        domain: 'INVENTORY',
        entities: { product: 'cai nay' },
        time_range: null,
        required_capability: 'explain_replenishment',
        confidence: 0.95,
      });
    } else {
      intents.push({
        intent_name: 'replenishment_suggestions',
        mode: 'READ',
        domain: 'INVENTORY',
        entities: { warehouse: capsule.warehouse_id || 'all', limit: 5 },
        time_range: p.includes('thang nay') ? 'month' : null,
        required_capability: 'replenishment_suggestion',
        confidence: 0.95,
      });
    }
  }

  if (!asksProfit && !asksSalesSummary && !asksProductRanking && !asksHighStock && !asksLowStock && !asksReplenishmentAdvice && (p.includes('thang truoc') || p.includes('tuan truoc') || p.includes('hom qua') || p.includes('thang nay') || p.includes('tuan nay')) && capsule.conversation_context?.last_verified_intents?.includes('get_profit_summary') && (p.startsWith('the ') || p.startsWith('con ') || p.length < 25)) {
    // Temporal follow-up on profit inquiry (e.g. "thế tháng trước?", "còn tuần này?")
    const period = p.includes('thang truoc') ? 'last_month' : (p.includes('tuan truoc') ? 'last_week' : (p.includes('tuan nay') ? 'this_week' : (p.includes('hom qua') ? 'yesterday' : 'month')));
    intents.push({
      intent_name: 'query_profit_followup',
      mode: 'READ',
      domain: 'FINANCE',
      entities: { period },
      time_range: period,
      required_capability: 'get_profit_summary',
      confidence: 0.95,
    });
  }

  if (asksReceiptsHistory && !intents.some(i => i.required_capability === 'query_receipts_aggregate')) {
    intents.push({
      intent_name: 'query_receipts_aggregate',
      mode: 'READ',
      domain: 'INVENTORY',
      entities: { period: p.includes('thang nay') ? 'month' : 'today' },
      time_range: p.includes('thang nay') ? 'month' : 'today',
      required_capability: 'query_receipts_aggregate',
      confidence: 0.90,
    });
  }

  // Multi-Warehouse Stock Comparison
  const asksCompareWarehouse = (p.includes('so sanh') || p.includes('doi chieu')) && (p.includes('kho') || p.includes('ton'));
  if (asksCompareWarehouse) {
    intents.push({
      intent_name: 'compare_warehouse_stock',
      mode: 'READ',
      domain: 'INVENTORY',
      required_capability: 'compare_warehouse_stock',
      entities: { query: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // Customer Debt & Aging Report
  const asksAging = p.includes('tuoi no') || p.includes('bao cao tuoi no') || p.includes('no qua han') || (p.includes('ai dang no') && !p.includes('bao nhieu'));
  if (asksAging) {
    intents.push({
      intent_name: 'customer_aging_report',
      mode: 'READ',
      domain: 'FINANCE',
      required_capability: 'get_customer_aging_report',
      entities: {},
      confidence: 0.95,
    });
  }

  const asksCustomerDebt = (p.includes('cong no') || p.includes('con no bao nhieu') || p.includes('no bao nhieu') || p.includes('tien no') || p.includes('so no') || (p.includes('no') && (p.includes('khach') || p.includes('anh') || p.includes('chi')))) && !asksAging;
  if (asksCustomerDebt) {
    intents.push({
      intent_name: 'customer_debt_summary',
      mode: 'READ',
      domain: 'FINANCE',
      required_capability: 'get_customer_debt_summary',
      entities: { query: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // Operating Expenses
  const asksExpenses = (p.includes('chi phi') || p.includes('chi phi van hanh') || p.includes('tien dien') || p.includes('tien nuoc') || p.includes('tien mat bang')) && !p.includes('phi ship') && !p.includes('cuoc ship');
  if (asksExpenses) {
    intents.push({
      intent_name: 'operating_expenses',
      mode: 'READ',
      domain: 'FINANCE',
      required_capability: 'get_operating_expenses',
      entities: { period: p.includes('thang') ? 'month' : (p.includes('tuan') ? 'this_week' : 'today') },
      confidence: 0.95,
    });
  }

  // Stocktake Discrepancies (Hàng lệch kho sau kiểm kê)
  const asksStocktakeDiscrepancies = (p.includes('lech kho') || p.includes('chenh lech') || p.includes('sai lech') || p.includes('that thoat')) && (p.includes('kiem ke') || p.includes('kho') || p.includes('hang') || p.includes('so sach'));
  if (asksStocktakeDiscrepancies) {
    intents.push({
      intent_name: 'stocktake_discrepancies',
      mode: 'READ',
      domain: 'INVENTORY',
      required_capability: 'stocktake_discrepancies',
      entities: {},
      confidence: 0.95,
    });
  }

  // Dynamic VietQR Generation
  const asksVietQR = p.includes('vietqr') || p.includes('tao qr') || p.includes('ma qr') || (p.includes('qr') && (p.includes('thanh toan') || p.includes('chuyen khoan') || p.includes('ngan hang')));
  if (asksVietQR && !p.includes('xuat kho') && !p.includes('ban hang')) {
    intents.push({
      intent_name: 'generate_vietqr',
      mode: 'READ',
      domain: 'SALES',
      required_capability: 'generate_vietqr',
      entities: { note: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // POS Shift & Cash Float Reconciliation (Mở ca, chốt ca, đối soát két)
  const asksPosShift = p.includes('chot ca') || p.includes('dong ca') || p.includes('mo ca') || p.includes('doi soat ket') || p.includes('lech ket') || p.includes('tien trong ket') || p.includes('z-report') || p.includes('bao cao ca');
  if (asksPosShift) {
    const isOpening = p.includes('mo ca');
    const cashMatch = capsule.raw_prompt.match(/(\d+(?:[.,]\d+)*(?:\s*k|\s*tr|\s*trieu|\s*d|\s*vnd)?)/i);
    intents.push({
      intent_name: 'manage_pos_shift',
      mode: 'READ',
      domain: 'SALES',
      required_capability: 'manage_pos_shift',
      entities: {
        action: isOpening ? 'OPEN_SHIFT' : 'RECONCILE_SHIFT',
        countedCash: cashMatch ? parseVietnameseCurrency(cashMatch[1]) : null
      },
      confidence: 0.95,
    });
  }

  // Logistics & Carrier Tracking (GHN, GHTK, Viettel Post, tra cứu vận đơn, cước ship)
  const asksLogistics = p.includes('van don') || p.includes('tra cuu don') || p.includes('ghn') || p.includes('ghtk') || p.includes('viettel post') || p.includes('cuoc ship') || p.includes('phi ship') || p.includes('cuoc van chuyen');
  if (asksLogistics) {
    let trackingCode = '';
    const m1 = capsule.raw_prompt.match(/(?:vận đơn|mã đơn|mã|tracking|tra cứu)\s*[:#]?\s*([A-Za-z0-9._-]{5,30})/i);
    const m2 = capsule.raw_prompt.match(/\b((?:GHN|GHTK|VTP|S21)[A-Za-z0-9._-]+)\b/i);
    if (m2) {
      trackingCode = m2[1];
    } else if (m1 && !['hàng', 'đơn', 'kho', 'vận'].includes(m1[1].toLowerCase())) {
      trackingCode = m1[1];
    }

    const weightMatch = capsule.raw_prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:g|kg|gram)/i);
    let weight = 500;
    if (weightMatch) {
      const val = parseFloat(weightMatch[1].replace(',', '.'));
      weight = capsule.raw_prompt.toLowerCase().includes('kg') ? val * 1000 : val;
    }

    intents.push({
      intent_name: 'carrier_logistics',
      mode: 'READ',
      domain: 'SALES',
      required_capability: 'carrier_logistics',
      entities: {
        action: trackingCode ? 'TRACK_SHIPMENT' : 'ESTIMATE_FEE',
        trackingCode: trackingCode,
        weight: weight
      },
      confidence: 0.95,
    });
  }

  // 6.B Export Data / Products / Reports
  const asksExport = (
    p.includes('xuat file') || p.includes('xuat excel') || p.includes('xuat csv') ||
    p.includes('tai file') || p.includes('tai excel') || p.includes('tai danh sach') ||
    p.includes('xuat danh sach') || p.includes('export file') || p.includes('export excel') ||
    (p.includes('xuat') && (p.includes('file') || p.includes('excel') || p.includes('csv')))
  );

  if (asksExport) {
    if (p.includes('doanh thu') || p.includes('ban hang') || p.includes('tt88') || p.includes('s2b')) {
      intents.push({
        intent_name: 'export_report',
        mode: 'READ',
        domain: 'SALES',
        required_capability: 'export_report',
        entities: { reportType: p.includes('tt88') ? 'revenue_tt88' : 'sales' },
        confidence: 0.98,
      });
    } else if (p.includes('nhap xuat ton')) {
      intents.push({
        intent_name: 'export_report',
        mode: 'READ',
        domain: 'INVENTORY',
        required_capability: 'export_report',
        entities: { reportType: 'inventory' },
        confidence: 0.98,
      });
    } else {
      intents.push({
        intent_name: 'export_products',
        mode: 'READ',
        domain: 'INVENTORY',
        required_capability: 'export_products',
        entities: {},
        confidence: 0.98,
      });
    }
  }

  // Tax / Circular 88 Report (Mẫu 01-1/GTGT / S2b-HKD)
  const hasTaxExportAction = p.includes('xuat') || p.includes('tai') || p.includes('download') || p.includes('in file') || p.includes('lay file') || p.includes('export');
  const asksTaxReport = hasTaxExportAction && (
    p.includes('bang ke thue') ||
    p.includes('to khai thue') ||
    p.includes('thong tu 88') ||
    p.includes('tt88') ||
    p.includes('s2b') ||
    p.includes('bao cao thue') ||
    (p.includes('bang ke') && (p.includes('thue') || p.includes('dau ra') || p.includes('doanh thu')))
  ) && !p.includes('xuat hoa don') && !p.includes('lap hoa don') && !p.includes('hoa don do');

  if (asksTaxReport) {
    intents.push({
      intent_name: 'export_report',
      mode: 'READ',
      domain: 'SALES',
      required_capability: 'export_report',
      entities: {
        reportType: 'revenue_tt88',
        period: p.includes('thang truoc') ? 'last_month' : (p.includes('hom qua') ? 'yesterday' : 'month')
      },
      time_range: p.includes('thang truoc') ? 'last_month' : (p.includes('hom qua') ? 'yesterday' : 'month'),
      confidence: 0.95,
    });
  }

  // Search Orders / Latest Invoice lookup (READ only)
  const asksOrderLookup = (p.includes('hoa don') || p.includes('don hang')) &&
    (p.includes('gan nhat') || p.includes('moi nhat') || p.includes('vua xong') || p.includes('tim hoa don') || p.includes('xem hoa don') || p.includes('tim don hang')) &&
    !p.includes('xuat hoa don') && !p.includes('lap hoa don') && !p.includes('hoa don do');

  if (asksOrderLookup) {
    intents.push({
      intent_name: 'search_orders',
      mode: 'READ',
      domain: 'SALES',
      required_capability: 'search_orders',
      entities: { query: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // Electronic Invoice Proposal (Requires VAT / MST / Company) — Strictly excluded if asksTaxReport
  const hasMstOrCompany = !asksTaxReport && (
    Boolean(parseVietnameseTaxCode(capsule.raw_prompt)) ||
    Boolean(parseVietnameseCustomer(capsule.raw_prompt).company) ||
    p.includes('mst') || p.includes('ma so thue') || p.includes('cong ty') || p.includes('cty') || p.includes('doanh nghiep') || p.includes('hoa don do') || p.includes('vat')
  );

  const asksDetInvoice = !asksTaxReport && hasMstOrCompany && (
    p.includes('hoa don') || p.includes('vat') || p.includes('mst') || p.includes('ma so thue') || p.includes('hoa don do')
  ) && !p.includes('bang ke') && !p.includes('to khai') && !p.includes('thong tu 88') && !p.includes('tt88');

  if (asksDetInvoice) {
    intents.push({
      intent_name: 'electronic_invoice_proposal',
      mode: 'WRITE',
      domain: 'INVOICE',
      required_capability: 'electronic_invoice_proposal',
      entities: { query: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // Order / Credit Sale Proposal
  const asksDetOrder = !asksDetInvoice && (
    p.includes('ban no') ||
    p.includes('cho khach hang') ||
    p.includes('cho khach') ||
    p.includes('lap don') ||
    p.includes('tao don') ||
    p.includes('don hang cho') ||
    (p.includes('xuat') && (p.includes('cho khach') || p.includes('cho anh') || p.includes('cho chi') || p.includes('nguoi nhan') || p.includes('giao ve') || p.includes('giao den') || p.includes('chiet khau') || p.includes('giam gia') || p.includes('hen thanh toan') || p.includes('tra sau')))
  );

  if (asksDetOrder) {
    intents.push({
      intent_name: 'order_proposal',
      mode: 'WRITE',
      domain: 'SALES',
      required_capability: 'order_proposal',
      entities: { query: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // Issue / Stock Deduction Proposal
  const asksDetIssue = !asksDetInvoice && !asksDetOrder && (
    (p.includes('xuat kho') || p.includes('xuat khoi') || p.includes('xuat mau')) &&
    (p.includes('mau') || p.includes('huy') || p.includes('hong') || p.includes('mop') || p.includes('noi bo') || p.includes('doi tac') || p.includes('ngay bay gio') || p.includes('dong thoi') || p.includes('giam ton'))
  );

  if (asksDetIssue) {
    intents.push({
      intent_name: 'issue_proposal',
      mode: 'WRITE',
      domain: 'INVENTORY',
      required_capability: 'issue_proposal',
      entities: { query: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // External Integration / System Clarification Guidance
  const asksIntegrationOrClarify = p.includes('vnpt') || p.includes('viettel') || p.includes('kiotviet') || p.includes('sapo') || (p.includes('ket noi') && !p.includes('may in') && !p.includes('ghn') && !p.includes('ghtk'));
  if (asksIntegrationOrClarify) {
    intents.push({
      intent_name: 'clarify_ambiguity',
      mode: 'READ',
      domain: 'SYSTEM',
      required_capability: 'clarify_ambiguity',
      entities: { query: capsule.raw_prompt },
      confidence: 0.95,
    });
  }

  // Multi-intent composition
  if (intents.length > 1) {
    composition = 'SEQUENTIAL_READ';
  } else if (intents.length === 0) {
    // Action-specific fallback when intents is empty — NEVER drop into find-low-stock for actions!
    if (p.includes('xuat file') || p.includes('xuat excel') || p.includes('tai file') || p.includes('tai danh sach') || (p.includes('xuat') && p.includes('hang'))) {
      intents.push({
        intent_name: 'export_products',
        mode: 'READ',
        domain: 'INVENTORY',
        required_capability: 'export_products',
        entities: {},
        confidence: 0.95,
      });
    } else if (p.includes('nhap')) {
      intents.push({
        intent_name: 'receipt_proposal',
        mode: 'WRITE',
        domain: 'INVENTORY',
        required_capability: 'receipt_proposal',
        entities: { query: capsule.raw_prompt },
        confidence: 0.85,
      });
    } else if (p.includes('xuat') && (p.includes('huy') || p.includes('noi bo') || p.includes('mau') || p.includes('hong') || p.includes('kho'))) {
      intents.push({
        intent_name: 'issue_proposal',
        mode: 'WRITE',
        domain: 'INVENTORY',
        required_capability: 'issue_proposal',
        entities: { query: capsule.raw_prompt },
        confidence: 0.85,
      });
    } else if (p.includes('kiem')) {
      intents.push({
        intent_name: 'stocktake_proposal',
        mode: 'WRITE',
        domain: 'INVENTORY',
        required_capability: 'stocktake_proposal',
        entities: { query: capsule.raw_prompt },
        confidence: 0.85,
      });
    } else if (p.includes('in') || p.includes('hoa don')) {
      intents.push({
        intent_name: 'electronic_invoice_proposal',
        mode: 'WRITE',
        domain: 'INVOICE',
        required_capability: 'electronic_invoice_proposal',
        entities: { query: capsule.raw_prompt },
        confidence: 0.85,
      });
    } else {
      // Default exploratory stock overview ONLY for truly generic inquiry
      intents.push({
        intent_name: 'check_stock_overview',
        mode: 'READ',
        domain: 'INVENTORY',
        entities: {},
        time_range: null,
        required_capability: 'check_stock',
        confidence: 0.70,
      });
    }
  }

  return {
    request_id: capsule.request_id,
    intents,
    composition,
    clarification_needed: false,
    clarification_question: null,
    provider_trace: {
      provider: 'DEGRADED_RULE_PLANNER',
      model: 'rule-based-planner',
      latency_ms: 5,
      fallback_triggered: true,
      fallback_reason: 'ALL_PROVIDERS_UNAVAILABLE',
      is_model_reasoning: false,
    },
  };
}

/**
 * Project Compact Tool Manifest dynamically from the Canonical Registry.
 * Guaranteed single source of truth (DUPLICATE_MANIFEST_SOURCE_COUNT = 0).
 */
export function getCompactToolManifest(context = {}, prompt = '') {
  return generateCompactToolManifest({
    route: context.route || context.current_route || 'dashboard',
    role: context.actor?.role || context.actor_role || 'owner',
    query: prompt || context.raw_prompt || '',
  });
}

/**
 * Execute the Semantic Planning step.
 * Returns { valid: boolean, plan: Object }
 */
export async function createSemanticPlan(prompt, context = {}, state = {}, options = {}) {
  const capsule = buildContextCapsule(prompt, context, state);
  const config = getProviderConfig();

  // 1. Serialize Complete Context Capsule + Tool Manifest into Model Prompt (Concise Representation from Canonical Registry)
  const compactManifest = generateCompactToolManifest({
    route: capsule.route,
    role: capsule.actor?.role,
    query: capsule.raw_prompt,
  });
  const planPromptText = `[DANH MỤC CÔNG CỤ]
${compactManifest}

[NGỮ CẢNH HỆ THỐNG]
- Màn hình: ${capsule.route}
- Đang xem: ${capsule.bound_product ? `${capsule.bound_product.name} (Tồn: ${capsule.bound_product.onHand})` : 'Không có'}
- Vai trò: ${capsule.actor.role}
${capsule.conversation_context?.last_product ? `[NGỮ CẢNH TRƯỚC]\n- Đã hỏi: ${capsule.conversation_context.last_product} (${capsule.conversation_context.last_verified_intents?.join(', ') || 'check_stock'})` : ''}

[YÊU CẦU: Trả về DUY NHẤT 1 JSON object theo schema:]
{"request_id":"${capsule.request_id}","composition":"SINGLE","intents":[{"intent_name":"<intent_name>","mode":"READ","domain":"<domain>","required_capability":"<capability>","entities":{},"confidence":0.95}]}

Quy tắc:
- Nhập hàng/kho (khi có hành động/số lượng ghi dữ liệu cụ thể) -> receipt_proposal (WRITE, INVENTORY).
- Đơn hàng / Bán hàng / Xuất bán cho khách / Bán nợ (có khách hàng, nợ, chiết khấu) -> order_proposal (WRITE, SALES). (Tuân thủ Thông tư 88 ghi nhận doanh thu tính thuế cho HKD).
- Xuất hóa đơn VAT / Hóa đơn đỏ / HĐĐT (có MST, tên công ty, địa chỉ) -> electronic_invoice_proposal (WRITE, INVOICE). (Tuân thủ Nghị định 123 / Thông tư 78).
- Xuất kho hủy / móp méo / hết date / nội bộ / hàng mẫu -> issue_proposal (WRITE, INVENTORY). (Theo Thông tư 88, chỉ trừ tồn kho Sổ vật tư, TUYỆT ĐỐI không tính vào doanh thu).
- Chuyển kho -> transfer_proposal (WRITE, INVENTORY). Kiểm kê cân bằng -> stocktake_proposal (WRITE, INVENTORY).
- So sánh tồn giữa các kho -> compare_warehouse_stock (READ, INVENTORY). Lệch kho kiểm kê -> stocktake_discrepancies (READ, INVENTORY).
- Tạo mã thanh toán VietQR NAPAS -> generate_vietqr (READ, SALES).
- Quản lý ca bán hàng / Mở ca / Chốt ca / Đối soát két tiền (Z-Report) -> manage_pos_shift (READ, SALES).
- Điều phối vận chuyển / Tra cứu vận đơn / Ước tính cước phí (GHN, GHTK, Viettel Post) -> carrier_logistics (READ, SALES).
- Báo cáo thuế HKD / Mẫu 01-1/GTGT / S2b-HKD Thông tư 88 -> export_report (READ, SALES).
- Điều khiển máy in hóa đơn POS / Đổi khổ giấy K58/K80 / In lại hóa đơn -> manage_hardware_printer (READ, INVENTORY).
- Tra cứu tồn -> check_stock (READ). Tra cứu giá -> price_lookup (READ). Hàng sắp hết / hàng nên nhập / cần nhập -> find_low_stock (READ).
- Lợi nhuận -> get_profit_summary (READ). Doanh thu/tổng tiền bán -> sales_summary (READ).
- Bán tốt/không tốt, bán chạy/bán ế, mặt hàng bán chạy/chậm theo thời gian -> product_performance_ranking (READ).
- Top hàng bán chạy -> top_selling_products (READ).
- Mơ hồ/chung chung/không rõ ý (ví dụ: "thế nào", "sao rồi", "tình hình sao") -> clarify_ambiguity (READ). Nối tiếp sản phẩm -> giữ ý định trước.
- 1 việc -> composition: "SINGLE" và 1 intent.
- CÂU HỎI GHÉP / NHIỀU Ý ĐỘC LẬP: BẮT BUỘC composition: "MULTI" và trả về ĐẦY ĐỦ TẤT CẢ các intents tương ứng cho từng ý (Ví dụ: "Tuần này hàng nào bán chậm và doanh thu bao nhiêu hàng nào nên nhập" -> gồm 3 ý: bán chậm = product_performance_ranking, doanh thu = sales_summary, hàng nên nhập = find_low_stock -> trả về composition: "MULTI" với ĐỦ 3 intents trên).
- KHÔNG trả về 2 intents trùng lặp cùng thực hiện một nhiệm vụ (ví dụ: không trả về cả top_selling_products lẫn product_performance_ranking cho cùng 1 câu hỏi).

[USER QUERY]
${capsule.raw_prompt}`;

  // ============================================================
  // INTERNAL HELPER: Parse and validate raw model text into a plan
  // Returns { valid: true, plan } or { valid: false, reason }
  // ============================================================
  function _tryParseAndValidatePlan(rawText, providerInfo = {}) {
    let parsed = null;
    try {
      const trimmed = String(rawText || '').trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        parsed = JSON.parse(trimmed);
      } else {
        const matchObj = trimmed.match(/\{[\s\S]*\}/);
        const matchArr = trimmed.match(/\[[\s\S]*\]/);
        if (matchArr && (!matchObj || matchArr.index < matchObj.index)) {
          parsed = JSON.parse(matchArr[0]);
        } else if (matchObj) {
          parsed = JSON.parse(matchObj[0]);
        }
      }
    } catch (_) {
      try {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch (__) {
        try {
          const matchArr = rawText.match(/\[[\s\S]*\]/);
          if (matchArr) parsed = JSON.parse(matchArr[0]);
        } catch (___) {}
      }
    }

    if (Array.isArray(parsed)) {
      parsed = {
        request_id: capsule.request_id,
        composition: parsed.length > 1 ? 'MULTI' : 'SINGLE',
        intents: parsed,
      };
    }

    if (parsed && typeof parsed === 'object') {
      if (parsed.plan && typeof parsed.plan === 'object') parsed = parsed.plan;
      if (parsed.data && typeof parsed.data === 'object') parsed = parsed.data;

      if (!Array.isArray(parsed.intents)) {
        const cap = parsed.required_capability || parsed.intent_name || parsed.action || parsed.proposal_type || parsed.capability || parsed.tool || parsed.type || parsed.proposal;
        if (cap) {
          parsed = {
            request_id: parsed.request_id || capsule.request_id,
            composition: 'SINGLE',
            intents: [{
              required_capability: String(cap).trim().replace(/-/g, '_'),
              intent_name: String(cap).trim().replace(/-/g, '_'),
              mode: parsed.mode || (String(cap).includes('proposal') ? 'WRITE' : 'READ'),
              domain: parsed.domain || (String(cap).includes('invoice') ? 'INVOICE' : (String(cap).includes('order') ? 'SALES' : 'INVENTORY')),
              entities: parsed.entities || parsed.details || parsed.parameters || {},
              confidence: parsed.confidence || 0.95,
            }],
          };
        }
      }

      if (Array.isArray(parsed.intents)) {
        parsed.intents.forEach(item => {
          const cap = item.required_capability || item.intent_name || item.action || item.proposal_type || item.capability || item.tool || item.type;
          if (cap) {
            item.required_capability = String(cap).trim().replace(/-/g, '_');
            item.intent_name = item.required_capability;
          }
          if (!item.entities && (item.details || item.parameters)) {
            item.entities = item.details || item.parameters;
          }
          if (item.details && typeof item.details === 'object') {
            item.entities = item.entities || {};
            if (item.details.item || item.details.product_name || item.details.product) {
              item.entities.productId = item.details.item || item.details.product_name || item.details.product;
              item.entities.productName = item.details.item || item.details.product_name || item.details.product;
            }
            if (item.details.quantity || item.details.qty) {
              item.entities.quantity = Number(item.details.quantity || item.details.qty);
              item.entities.qty = item.entities.quantity;
            }
            if (item.details.warehouse) {
              item.entities.warehouseId = item.details.warehouse;
            }
            if (item.details.items) {
              item.entities.items = item.details.items;
            }
            if (item.details.customer_name || item.details.customer) {
              item.entities.customerName = item.details.customer_name || item.details.customer;
            }
            if (item.details.discount_percent || item.details.discount) {
              item.entities.discount = item.details.discount_percent || item.details.discount;
            }
            if (item.details.payment_terms || item.details.payment_term) {
              item.entities.paymentTermDays = item.details.payment_terms || item.details.payment_term;
            }
            if (item.details.reason) {
              item.entities.reason = item.details.reason;
            }
          }
          if (!item.intent_name && item.required_capability) {
            item.intent_name = item.required_capability;
          }
          if (item.intent_name) {
            item.intent_name = String(item.intent_name).trim().replace(/-/g, '_');
          }
          if (item.required_capability) {
            item.required_capability = String(item.required_capability).trim().replace(/-/g, '_');
          }
          if (item.required_capability === 'receipt_proposal' || item.intent_name === 'receipt_proposal') {
            item.required_capability = 'receipt_proposal';
            item.intent_name = 'receipt_proposal';
            item.mode = 'WRITE';
            item.domain = 'INVENTORY';
          }
          if (item.required_capability === 'order_proposal' || item.intent_name === 'order_proposal' || item.required_capability === 'sales_order_proposal' || item.intent_name === 'sales_order_proposal') {
            item.required_capability = 'order_proposal';
            item.intent_name = 'order_proposal';
            item.mode = 'WRITE';
            item.domain = 'SALES';
          }
          if (item.required_capability === 'electronic_invoice_proposal' || item.intent_name === 'electronic_invoice_proposal' || item.required_capability === 'invoice_proposal' || item.intent_name === 'invoice_proposal') {
            item.required_capability = 'electronic_invoice_proposal';
            item.intent_name = 'electronic_invoice_proposal';
            item.mode = 'WRITE';
            item.domain = 'INVOICE';
          }
          if (item.required_capability === 'issue_proposal' || item.intent_name === 'issue_proposal') {
            item.required_capability = 'issue_proposal';
            item.intent_name = 'issue_proposal';
            item.mode = 'WRITE';
            item.domain = 'INVENTORY';
          }
          if (item.required_capability === 'clarify_ambiguity' || item.intent_name === 'clarify_ambiguity') {
            item.required_capability = 'clarify_ambiguity';
            item.intent_name = 'clarify_ambiguity';
            item.mode = 'READ';
            item.domain = 'SYSTEM';
          }
        });

        // Architectural Invariant: Remap accidental non-ranking to product_performance_ranking on ranking queries
        const isRankingQuery = (
          capsule.normalized_prompt.includes('ban tot') ||
          capsule.normalized_prompt.includes('ban khong tot') ||
          capsule.normalized_prompt.includes('ban kem') ||
          capsule.normalized_prompt.includes('ban e') ||
          capsule.normalized_prompt.includes('ban cham') ||
          capsule.normalized_prompt.includes('e am') ||
          capsule.normalized_prompt.includes('e khong') ||
          capsule.normalized_prompt.includes('co e') ||
          capsule.normalized_prompt.includes('noi bat') ||
          capsule.normalized_prompt.includes('ban chay') ||
          capsule.normalized_prompt.includes('chay nhat') ||
          capsule.normalized_prompt.includes('ban duoc nhung gi') ||
          capsule.normalized_prompt.includes('ban duoc gi') ||
          capsule.normalized_prompt.includes('cai gi ban duoc') ||
          capsule.normalized_prompt.includes('cai nao ban duoc') ||
          capsule.normalized_prompt.includes('mat hang nao ban duoc') ||
          capsule.normalized_prompt.includes('khong ban duoc') ||
          capsule.normalized_prompt.includes('chua ban duoc') ||
          capsule.normalized_prompt.includes('ban nhieu') ||
          capsule.normalized_prompt.includes('ban it') ||
          capsule.normalized_prompt.includes('it nguoi mua') ||
          capsule.normalized_prompt.includes('nhieu nguoi mua') ||
          capsule.normalized_prompt.includes('xep hang') ||
          capsule.normalized_prompt.includes('hieu suat') ||
          ((capsule.normalized_prompt.includes('mat hang') || capsule.normalized_prompt.includes('san pham') || capsule.normalized_prompt.includes('cai nao') || capsule.normalized_prompt.includes('mon nao')) &&
            (capsule.normalized_prompt.includes('ban tot') || capsule.normalized_prompt.includes('ban kem') || capsule.normalized_prompt.includes('ban chay') || capsule.normalized_prompt.includes('ban e') || /\b[eế]\b/i.test(capsule.normalized_prompt)))
        ) && !(capsule.normalized_prompt.includes('ban duoc bao nhieu') || capsule.normalized_prompt.includes('ban bao nhieu'));

        const p = capsule.normalized_prompt;
        let queryPeriod = 'this_week';
        if (p.includes('hom nay') || p.includes('today')) queryPeriod = 'today';
        else if (p.includes('hom qua') || p.includes('yesterday')) queryPeriod = 'yesterday';
        else if (p.includes('hai ngay') || p.includes('2 ngay') || p.includes('2d')) queryPeriod = '2_days';
        else if (p.includes('ba ngay') || p.includes('3 ngay') || p.includes('3d')) queryPeriod = '3_days';
        else if (p.includes('tuan truoc') || p.includes('tuan qua')) queryPeriod = 'last_week';
        else if (p.includes('tuan nay') || p.includes('trong tuan')) queryPeriod = 'this_week';
        else if (p.includes('7 ngay')) queryPeriod = '7d';
        else if (p.includes('thang truoc')) queryPeriod = 'last_month';
        else if (p.includes('thang nay') || p.includes('dau thang')) queryPeriod = 'month';
        else if (p.includes('30 ngay')) queryPeriod = '30d';

        // Subclause period extractor (Clause-level & Distance-based for compound queries)
        const extractSubclausePeriod = (keywords, defaultPeriod = 'this_week') => {
          // 1. Clause-level temporal scope (split by conjunctions: va, cung nhu, con, dong thoi, comma)
          const clauses = p.split(/\s*(?:,\s*|\s+(?:va|cung nhu|con|dong thoi|sau do)\s+)/i);
          for (const clause of clauses) {
            const hasKeyword = keywords.some(kw => clause.includes(kw));
            if (hasKeyword) {
              if (clause.includes('thang truoc') || clause.includes('thang qua')) return 'last_month';
              if (clause.includes('thang nay') || clause.includes('dau thang') || clause.includes('trong thang')) return 'month';
              if (clause.includes('tuan truoc') || clause.includes('tuan qua')) return 'last_week';
              if (clause.includes('tuan nay') || clause.includes('trong tuan')) return 'this_week';
              if (clause.includes('hom qua') || clause.includes('yesterday')) return 'yesterday';
              if (clause.includes('hom nay') || clause.includes('today')) return 'today';
              if (clause.includes('2 ngay') || clause.includes('hai ngay')) return '2_days';
              if (clause.includes('3 ngay') || clause.includes('ba ngay')) return '3_days';
              if (clause.includes('7 ngay') || clause.includes('7d')) return '7d';
              if (clause.includes('30 ngay') || clause.includes('30d')) return '30d';
            }
          }

          // 2. Fallback: distance-based matching across full prompt
          let bestIdx = -1;
          for (const kw of keywords) {
            const pos = p.indexOf(kw);
            if (pos !== -1) {
              bestIdx = pos;
              break;
            }
          }
          if (bestIdx === -1) return defaultPeriod;

          const temporalCandidates = [
            { code: 'last_month', terms: ['thang truoc', 'thang qua'] },
            { code: 'month', terms: ['thang nay', 'dau thang', 'trong thang'] },
            { code: 'last_week', terms: ['tuan truoc', 'tuan qua'] },
            { code: 'this_week', terms: ['tuan nay', 'trong tuan'] },
            { code: 'yesterday', terms: ['hom qua', 'yesterday'] },
            { code: 'today', terms: ['hom nay', 'today'] },
            { code: '2_days', terms: ['2 ngay', 'hai ngay'] },
            { code: '3_days', terms: ['3 ngay', 'ba ngay'] },
            { code: '7d', terms: ['7 ngay', '7d'] },
            { code: '30d', terms: ['30 ngay', '30d'] },
          ];

          let closestCandidate = null;
          let minDistance = Infinity;

          for (const cand of temporalCandidates) {
            for (const term of cand.terms) {
              let searchFrom = 0;
              while (true) {
                const termPos = p.indexOf(term, searchFrom);
                if (termPos === -1) break;
                const dist = Math.abs(termPos - bestIdx);
                if (dist < minDistance && dist <= 60) {
                  minDistance = dist;
                  closestCandidate = cand.code;
                }
                searchFrom = termPos + term.length;
              }
            }
          }

          return closestCandidate || defaultPeriod;
        };

        // Check explicit question aspects in user query
        const asksRanking = isRankingQuery;
        const asksRevenue = (
          p.includes('doanh thu') ||
          p.includes('doanh so') ||
          p.includes('tong thu') ||
          p.includes('ban duoc bao nhieu') ||
          p.includes('tong tien ban') ||
          p.includes('tong tien hang') ||
          p.includes('thu duoc bao nhieu')
        );
        const asksProfit = (
          p.includes('loi nhuan') || p.includes('lai lo') || p.includes('loi hay lo') || p.includes('lo hay loi') ||
          p.includes('tien lai') || p.includes('tien loi') || p.includes('lai duoc bao nhieu') || p.includes('loi bao nhieu') ||
          p.includes('gross profit') || p.includes('net profit') || p.includes('profit') ||
          ((p.includes('thang') || p.includes('hom nay') || p.includes('tuan') || p.includes('ngay nay') || p.includes('ngay qua') || p.includes('tu dau thang') || p.includes('hom qua')) && (p.includes('loi') || p.includes('lai') || /\b[l|L][o|ỗ|ọ]\b/.test(p) || p.includes('lo ')))
        ) && !(p.includes('tra loi') || p.includes('loi khuyen') || p.includes('loi he thong') || p.includes('xin loi') || p.includes('bao loi'));
        const asksRestock = (
          p.includes('nen nhap') ||
          p.includes('can nhap') ||
          p.includes('can them nhap') ||
          p.includes('nhap them cai gi') ||
          p.includes('nhap them gi') ||
          p.includes('nhap them cai nao') ||
          p.includes('len lay') ||
          p.includes('nen lay') ||
          p.includes('hang nao len lay') ||
          p.includes('hang nao nen lay') ||
          p.includes('nhap them') ||
          p.includes('sap het') ||
          p.includes('het hang')
        );
        const asksLowStock = (
          p.includes('con ton it') || p.includes('ton it') || p.includes('hang nao con ton it') ||
          p.includes('sap het') || p.includes('gan het') || p.includes('het hang')
        );
        const asksHighStock = (
          p.includes('con ton nhieu') || p.includes('ton nhieu') || p.includes('nhieu ton') ||
          p.includes('ton cao') || p.includes('hang nao con ton nhieu') || p.includes('hang nao ton nhieu')
        );

        // Subclause-specific periods for compound queries:
        const rankingPeriod = extractSubclausePeriod(['chay', 'ban tot', 'ban kem', 'ban e', 'noi bat', 'e'], queryPeriod);
        const isRevenueComparison = /so\s+voi\s+(tuan\s+truoc|thang\s+truoc|hom\s+qua)/i.test(p) ||
                                    /(tuan\s+nay|thang\s+nay|hom\s+nay)\s+so\s+voi/i.test(p);
        const revenuePeriod = isRevenueComparison
          ? (/thang\s+nay/i.test(p) && /thang\s+truoc/i.test(p) ? 'month' : 'this_week')
          : extractSubclausePeriod(['ban duoc bao nhieu', 'ban bao nhieu', 'doanh thu', 'doanh so', 'tong tien', 'ban duoc'], (p.includes('thang nay') ? 'month' : queryPeriod));
        const profitPeriod = extractSubclausePeriod(['loi hay lo', 'lo hay loi', 'lai lo', 'loi nhuan', 'tien lai', 'loi', 'lai', 'lo'], (p.includes('thang nay') ? 'month' : 'this_week'));
        const comparePeriod = isRevenueComparison
          ? (revenuePeriod === 'month' ? 'last_month' : 'last_week')
          : null;
        const restockPeriod = extractSubclausePeriod(['nhap', 'lay', 'sap het', 'het hang'], 'this_week');

        // Normalize and curate intents
        let rankingIncluded = false;
        const curatedIntents = [];

        for (const item of parsed.intents) {
          const cap = item.required_capability || item.intent_name;
          const isRankCap = cap === 'product_performance_ranking' || cap === 'top_selling_products';

          if (isRankCap) {
            if (!rankingIncluded) {
              item.required_capability = 'product_performance_ranking';
              item.intent_name = 'product_performance_ranking';
              item.mode = 'READ';
              item.domain = 'SALES';
              item.entities = item.entities || {};
              item.entities.period = rankingPeriod;
              item.entities.query = capsule.raw_prompt;
              curatedIntents.push(item);
              rankingIncluded = true;
            }
            // Ignore subsequent duplicate ranking intents to prevent duplicate answer blocks
          } else if (cap === 'sales_summary') {
            item.entities = item.entities || {};
            item.entities.period = revenuePeriod;
            if (comparePeriod) item.entities.comparePeriod = comparePeriod;
            curatedIntents.push(item);
          } else if (cap === 'get_profit_summary') {
            item.entities = item.entities || {};
            item.entities.period = profitPeriod;
            curatedIntents.push(item);
          } else {
            // Keep other distinct capabilities: find_low_stock, replenishment_suggestion, proposals, etc.
            curatedIntents.push(item);
          }
        }

        // Guaranteed Coverage for Compound Queries:
        // 1. If user explicitly asks for ranking but no ranking intent is in list
        if (asksRanking && !rankingIncluded) {
          curatedIntents.unshift({
            intent_name: 'product_performance_ranking',
            mode: 'READ',
            domain: 'SALES',
            required_capability: 'product_performance_ranking',
            entities: {
              period: rankingPeriod,
              query: capsule.raw_prompt,
            },
            confidence: 0.95,
          });
          rankingIncluded = true;
        }

        // 2. If user explicitly asks for revenue but no sales_summary is in list
        const hasSalesSummary = curatedIntents.some(it => (it.required_capability || it.intent_name) === 'sales_summary');
        if (asksRevenue && !hasSalesSummary) {
          curatedIntents.push({
            intent_name: 'sales_summary',
            mode: 'READ',
            domain: 'SALES',
            required_capability: 'sales_summary',
            entities: {
              period: revenuePeriod,
              ...(comparePeriod ? { comparePeriod } : {}),
            },
            confidence: 0.95,
          });
        }

        // 3. If user explicitly asks for profit but no get_profit_summary is in list
        const hasProfitSummary = curatedIntents.some(it => (it.required_capability || it.intent_name) === 'get_profit_summary');
        if (asksProfit && !hasProfitSummary) {
          curatedIntents.push({
            intent_name: 'query_profit',
            mode: 'READ',
            domain: 'FINANCE',
            required_capability: 'get_profit_summary',
            entities: {
              period: profitPeriod,
            },
            confidence: 0.95,
          });
        }

        // 4. If user explicitly asks for restock advice but no replenishment_suggestion or write proposal is in list
        const hasReplenishment = curatedIntents.some(it => {
          const c = it.required_capability || it.intent_name;
          return c === 'replenishment_suggestion' || it.mode === 'WRITE';
        });
        if (asksRestock && !hasReplenishment) {
          curatedIntents.push({
            intent_name: 'replenishment_suggestion',
            mode: 'READ',
            domain: 'INVENTORY',
            required_capability: 'replenishment_suggestion',
            entities: {
              period: restockPeriod,
              limit: 5,
            },
            confidence: 0.95,
          });
        }

        // 5. If user asks for low stock but no find_low_stock is in list
        const hasLowStock = curatedIntents.some(it => (it.required_capability || it.intent_name) === 'find_low_stock');
        if (asksLowStock && !hasLowStock) {
          curatedIntents.push({
            intent_name: 'find_low_stock',
            mode: 'READ',
            domain: 'INVENTORY',
            required_capability: 'find_low_stock',
            entities: {},
            confidence: 0.95,
          });
        }

        // 6. If user asks for high stock but no high stock intent is in list
        const hasHighStock = curatedIntents.some(it => (it.required_capability || it.intent_name) === 'check_stock');
        if (asksHighStock && !hasHighStock) {
          curatedIntents.push({
            intent_name: 'check_stock_high',
            mode: 'READ',
            domain: 'INVENTORY',
            required_capability: 'check_stock',
            entities: { query: 'ton nhieu' },
            confidence: 0.95,
          });
        }

        // 6b. Customer Aging Report & Debt
        const asksAgingInModel = p.includes('tuoi no') || p.includes('bao cao tuoi no') || p.includes('no qua han') || (p.includes('ai dang no') && !p.includes('bao nhieu'));
        if (asksAgingInModel && !curatedIntents.some(it => (it.required_capability || it.intent_name) === 'get_customer_aging_report')) {
          curatedIntents.push({
            intent_name: 'customer_aging_report',
            mode: 'READ',
            domain: 'FINANCE',
            required_capability: 'get_customer_aging_report',
            entities: {},
            confidence: 0.95,
          });
        }

        const asksDebtInModel = (p.includes('cong no') || p.includes('con no bao nhieu') || p.includes('no bao nhieu') || p.includes('tien no') || p.includes('so no') || (p.includes('no') && (p.includes('khach') || p.includes('anh') || p.includes('chi')))) && !asksAgingInModel;
        if (asksDebtInModel && !curatedIntents.some(it => (it.required_capability || it.intent_name) === 'get_customer_debt_summary')) {
          curatedIntents.push({
            intent_name: 'customer_debt_summary',
            mode: 'READ',
            domain: 'FINANCE',
            required_capability: 'get_customer_debt_summary',
            entities: { query: capsule.raw_prompt },
            confidence: 0.95,
          });
        }

        const asksExpensesInModel = (p.includes('chi phi') || p.includes('chi phi van hanh') || p.includes('tien dien') || p.includes('tien nuoc') || p.includes('tien mat bang')) && !p.includes('phi ship') && !p.includes('cuoc ship');
        if (asksExpensesInModel && !curatedIntents.some(it => (it.required_capability || it.intent_name) === 'get_operating_expenses')) {
          curatedIntents.push({
            intent_name: 'operating_expenses',
            mode: 'READ',
            domain: 'FINANCE',
            required_capability: 'get_operating_expenses',
            entities: { period: p.includes('thang') ? 'month' : (p.includes('tuan') ? 'this_week' : 'today') },
            confidence: 0.95,
          });
        }

        const asksOrderInModel = (p.includes('hoa don') || p.includes('don hang')) &&
          (p.includes('gan nhat') || p.includes('moi nhat') || p.includes('vua xong') || p.includes('tim hoa don') || p.includes('xem hoa don') || p.includes('tim don hang')) &&
          !p.includes('xuat hoa don') && !p.includes('lap hoa don') && !p.includes('hoa don do');
        if (asksOrderInModel && !curatedIntents.some(it => (it.required_capability || it.intent_name) === 'search_orders')) {
          curatedIntents.push({
            intent_name: 'search_orders',
            mode: 'READ',
            domain: 'SALES',
            required_capability: 'search_orders',
            entities: { query: capsule.raw_prompt },
            confidence: 0.95,
          });
        }

        // 7. Electronic Invoice Proposal: If user asks for VAT / HĐĐT / MST / hóa đơn doanh nghiệp (NOT tax statements)
        const hasTaxExportActionCurated = (
          p.includes('xuat') || p.includes('tai') || p.includes('download') ||
          p.includes('in file') || p.includes('lay file') || p.includes('export')
        );
        const isTaxStatement = hasTaxExportActionCurated && (
          p.includes('bang ke thue') ||
          p.includes('to khai thue') ||
          p.includes('thong tu 88') ||
          p.includes('tt88') ||
          p.includes('s2b') ||
          p.includes('bao cao thue') ||
          p.includes('thue gtgt') ||
          p.includes('thue hkd') ||
          (p.includes('bang ke') && (p.includes('thue') || p.includes('dau ra') || p.includes('doanh thu')))
        ) && !p.includes('xuat hoa don') && !p.includes('lap hoa don') && !p.includes('hoa don do');

        if (isTaxStatement && !curatedIntents.some(it => (it.required_capability || it.intent_name) === 'export_report')) {
          curatedIntents.unshift({
            intent_name: 'export_report',
            mode: 'READ',
            domain: 'SALES',
            required_capability: 'export_report',
            entities: { reportType: 'revenue_tt88', period: 'month' },
            confidence: 0.95,
          });
        }

        const hasMstOrCompany = !isTaxStatement && (
          Boolean(parseVietnameseTaxCode(capsule.raw_prompt)) ||
          Boolean(parseVietnameseCustomer(capsule.raw_prompt).company) ||
          p.includes('mst') || p.includes('ma so thue') || p.includes('cong ty') || p.includes('cty') || p.includes('doanh nghiep') || p.includes('hoa don do') || p.includes('vat')
        );

        const asksInvoice = !isTaxStatement && hasMstOrCompany && (
          p.includes('hoa don') ||
          p.includes('vat') || p.includes('mst') ||
          p.includes('ma so thue') ||
          p.includes('xuat hoa don') ||
          p.includes('hoa don do')
        ) && (p.includes('xuat') || p.includes('lap') || p.includes('tao') || p.includes('cho cong ty') || p.includes('cho cty') || p.includes('mst') || p.includes('vat') || p.includes('doanh nghiep')) &&
        !p.includes('bang ke') && !p.includes('to khai') && !p.includes('thong tu 88') && !p.includes('tt88');

        if (asksInvoice) {
          const hasInvoiceProp = curatedIntents.some(it => (it.required_capability || it.intent_name) === 'electronic_invoice_proposal');
          if (!hasInvoiceProp) {
            const filtered = curatedIntents.filter(it => (it.required_capability || it.intent_name) !== 'receipt_proposal' && (it.required_capability || it.intent_name) !== 'clarify_ambiguity');
            filtered.unshift({
              intent_name: 'electronic_invoice_proposal',
              mode: 'WRITE',
              domain: 'INVOICE',
              required_capability: 'electronic_invoice_proposal',
              entities: { query: capsule.raw_prompt },
              confidence: 0.95,
            });
            curatedIntents.length = 0;
            curatedIntents.push(...filtered);
          }
        }

        // 8. Order / Credit Sale Proposal: If user asks for selling to customer, credit sale, discount, payment term
        const asksOrder = !asksInvoice && (
          p.includes('ban no') ||
          p.includes('cho khach hang') ||
          p.includes('cho khach') ||
          p.includes('lap don') ||
          p.includes('tao don') ||
          p.includes('don hang cho') ||
          (p.includes('xuat') && (p.includes('cho khach') || p.includes('cho anh') || p.includes('cho chi') || p.includes('nguoi nhan') || p.includes('giao ve') || p.includes('giao den') || p.includes('chiet khau') || p.includes('giam gia') || p.includes('hen thanh toan') || p.includes('tra sau')))
        );

        if (asksOrder) {
          const hasOrderProp = curatedIntents.some(it => (it.required_capability || it.intent_name) === 'order_proposal');
          if (!hasOrderProp) {
            const filtered = curatedIntents.filter(it => (it.required_capability || it.intent_name) !== 'receipt_proposal' && (it.required_capability || it.intent_name) !== 'clarify_ambiguity' && (it.required_capability || it.intent_name) !== 'issue_proposal');
            filtered.unshift({
              intent_name: 'order_proposal',
              mode: 'WRITE',
              domain: 'SALES',
              required_capability: 'order_proposal',
              entities: { query: capsule.raw_prompt },
              confidence: 0.95,
            });
            curatedIntents.length = 0;
            curatedIntents.push(...filtered);
          }
        }

        // 9. Issue / Stock Deduction Proposal: If user asks for sample issue, damaged/expired issue, internal use
        const asksIssue = !asksInvoice && !asksOrder && (
          (p.includes('xuat kho') || p.includes('xuat khoi') || p.includes('xuat mau')) &&
          (p.includes('mau') || p.includes('huy') || p.includes('hong') || p.includes('mop') || p.includes('noi bo') || p.includes('doi tac') || p.includes('ngay bay gio') || p.includes('dong thoi') || p.includes('giam ton'))
        );

        if (asksIssue) {
          const hasIssueProp = curatedIntents.some(it => (it.required_capability || it.intent_name) === 'issue_proposal');
          if (!hasIssueProp) {
            const filtered = curatedIntents.filter(it => (it.required_capability || it.intent_name) !== 'receipt_proposal' && (it.required_capability || it.intent_name) !== 'clarify_ambiguity');
            filtered.unshift({
              intent_name: 'issue_proposal',
              mode: 'WRITE',
              domain: 'INVENTORY',
              required_capability: 'issue_proposal',
              entities: { query: capsule.raw_prompt },
              confidence: 0.95,
            });
            curatedIntents.length = 0;
            curatedIntents.push(...filtered);
          }
        }

        // Filter out accidental generic check_stock_overview or clarify_ambiguity if more specific business intents exist
        const hasSpecificBusinessIntents = curatedIntents.some(it => {
          const c = it.required_capability || it.intent_name;
          return c !== 'clarify_ambiguity' && c !== 'check_stock_overview' && c !== 'check_stock';
        });
        let filteredIntents = curatedIntents;
        if (hasSpecificBusinessIntents) {
          filteredIntents = curatedIntents.filter(it => {
            const c = it.required_capability || it.intent_name;
            if (c === 'clarify_ambiguity') return false;
            if (!asksHighStock && (c === 'check_stock' || c === 'check_stock_overview') && !it.entities?.product && !it.entities?.productId) {
              return false;
            }
            return true;
          });
        }

        if (asksOrderInModel && !asksRevenue) {
          filteredIntents = filteredIntents.filter(it => (it.required_capability || it.intent_name) !== 'sales_summary');
        }

        // General Deduplication: Remove duplicate identical capabilities with identical parameters
        const seenKeys = new Set();
        parsed.intents = filteredIntents.filter(item => {
          const cap = item.required_capability || item.intent_name;
          const key = `${cap}:${item.entities?.period || ''}:${item.entities?.productId || ''}:${item.mode || ''}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });

        // Update composition
        parsed.composition = parsed.intents.length > 1 ? 'MULTI' : 'SINGLE';
      }
    }

    if (parsed) {
      const planValidation = validateSemanticPlan(parsed);
      if (planValidation.valid) {
        parsed.provider_trace = {
          provider: providerInfo.provider || 'UNKNOWN',
          model: providerInfo.model || 'unknown',
          latency_ms: providerInfo.latencyMs || providerInfo.latency_ms || 100,
          fallback_triggered: Boolean(providerInfo.fallbackTriggered),
          fallback_reason: providerInfo.fallbackReason || null,
          is_model_reasoning: true,
          is_cloud_escalation: Boolean(providerInfo.isCloudEscalation),
        };
        parsed.raw_prompt = capsule.raw_prompt;
        return { valid: true, plan: parsed };
      }
    }
    return { valid: false, reason: 'PARSE_OR_VALIDATION_FAILED' };
  }

  // Early exit for Deterministic mode or Dev Mock Planner
  if (options.allowDevMockPlanner === true || config.mode === PROVIDER_MODES.DETERMINISTIC) {
    const plan = generateDeterministicSemanticPlan(capsule);
    return { valid: true, plan };
  }

  // ============================================================
  // DEEPSEEK PRIMARY ENGINE — Single fast call replaces 3-layer chain
  // Flow: DeepSeek API → parse → (if fail) 1 retry → safe refuse
  // Latency target: ≤ 8 seconds per query
  // ============================================================
  const providerRes = await dispatchDeepSeekPrimary({
    promptText: planPromptText,
    config,
    timeoutMs: options.timeoutMs || 18000,
    context,
  });

  // If provider returned successfully with text, try parsing
  if (providerRes && providerRes.success && providerRes.rawText) {
    const attempt1 = _tryParseAndValidatePlan(providerRes.rawText, providerRes);
    if (attempt1.valid) {
      return attempt1;
    }

    // DeepSeek returned text but unparseable — retry ONCE with strict format prompt
    console.warn('[Semantic Planner] DeepSeek output unparseable, retrying with strict format prompt...');
    try {
      const strictRetryPrompt = `[QUAN TRỌNG: Lần trước bạn trả về JSON KHÔNG HỢP LỆ. Lần này bạn PHẢI trả về CHÍNH XÁC 1 JSON object với cấu trúc sau, KHÔNG có text nào khác:]
{"request_id":"${capsule.request_id}","composition":"SINGLE","intents":[{"intent_name":"<tên_ý_định>","mode":"READ","domain":"<domain>","required_capability":"<capability>","entities":{},"confidence":0.95}]}

Các capability hợp lệ: check_stock, price_lookup, find_low_stock, sales_summary, get_profit_summary, product_performance_ranking, top_selling_products, receipt_proposal, transfer_proposal, order_proposal, electronic_invoice_proposal, issue_proposal, clarify_ambiguity.
- Xuất hóa đơn VAT / HĐĐT / MST -> electronic_invoice_proposal (WRITE, domain: INVOICE).
- Bán hàng / Khách hàng / Chiết khấu / Công nợ / Hẹn trả -> order_proposal (WRITE, domain: SALES).
- Xuất kho hủy / Xuất mẫu / Nội bộ -> issue_proposal (WRITE, domain: INVENTORY).
- Nhập hàng/kho -> receipt_proposal (WRITE, domain: INVENTORY). Chuyển kho -> transfer_proposal (WRITE, domain: INVENTORY).
- Tra cứu tồn -> check_stock (READ). Tra cứu giá -> price_lookup (READ). Hàng sắp hết -> find_low_stock (READ).
- Lợi nhuận -> get_profit_summary (READ). Doanh thu/tổng tiền -> sales_summary (READ).
- Bán tốt/không tốt/chạy/ế/hiệu suất -> product_performance_ranking (READ).
- Top hàng bán chạy -> top_selling_products (READ).
- Mơ hồ/không rõ -> clarify_ambiguity (READ).

[USER QUERY]
${capsule.raw_prompt}`;

      const retryRes = await dispatchDeepSeekPrimary({
        promptText: strictRetryPrompt,
        config,
        timeoutMs: options.timeoutMs || 18000,
        context,
      });

      if (retryRes && retryRes.success && retryRes.rawText) {
        const attempt2 = _tryParseAndValidatePlan(retryRes.rawText, { ...retryRes, fallbackTriggered: true, fallbackReason: 'FORMAT_RETRY' });
        if (attempt2.valid) {
          console.log('[Semantic Planner] DeepSeek format retry succeeded.');
          return attempt2;
        }
      }
    } catch (retryErr) {
      console.warn('[Semantic Planner] DeepSeek format retry error:', retryErr);
    }

    // ============================================================
    // TIER 4 DETERMINISTIC FALLBACK: If model response is unparseable,
    // evaluate whether Tier 4 Rule Planner can fulfill the business intent.
    // ============================================================
    const detPlan = generateDeterministicSemanticPlan(capsule);
    if (detPlan && Array.isArray(detPlan.intents) && detPlan.intents.length > 0 && detPlan.intents[0].required_capability !== 'check_stock_overview') {
      console.log('[Semantic Planner] Model output unparseable, safely resolved via Tier 4 Deterministic Planner.');
      detPlan.provider_trace = {
        provider: 'DETERMINISTIC_TIER4',
        model: 'rule-based-planner',
        latency_ms: 10,
        fallback_triggered: true,
        fallback_reason: 'MODEL_UNPARSEABLE_FALLBACK_TIER4',
        is_model_reasoning: false,
      };
      return { valid: true, plan: detPlan };
    }

    // ============================================================
    // SAFE REFUSE: Model responded but parsing failed and no rule matched.
    // Return natural-language apology — NEVER show technical error codes.
    // ============================================================
    console.warn('[Semantic Planner] Safe refuse: DeepSeek output unparseable after retry.');
    try {
      const { logAuditEvent: _logAudit } = await import('./audit.js');
      _logAudit('AI_GRACEFUL_REFUSE', {
        query: capsule.raw_prompt,
        isWriteIntent: false,
        attempts: 2,
        reason: 'DEEPSEEK_PLAN_UNPARSEABLE',
        provider: providerRes?.provider || 'DEEPSEEK',
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    const isAdvisoryQuestion = capsule.normalized_prompt.includes('cai gi khong') ||
      capsule.normalized_prompt.includes('can them nhap') ||
      capsule.normalized_prompt.includes('nen nhap') ||
      capsule.normalized_prompt.includes('co nen nhap') ||
      capsule.normalized_prompt.includes('hang nao') ||
      capsule.normalized_prompt.includes('len lay') ||
      capsule.normalized_prompt.includes('nen lay') ||
      capsule.normalized_prompt.includes('loi hay lo') ||
      capsule.normalized_prompt.includes('ban duoc bao nhieu') ||
      capsule.raw_prompt.includes('?');

    const hasWriteIntent = !isAdvisoryQuestion && (
      capsule.normalized_prompt.includes('nhap kho') ||
      capsule.normalized_prompt.includes('xuat kho') ||
      capsule.normalized_prompt.includes('chuyen kho') ||
      capsule.normalized_prompt.includes('sua gia') ||
      capsule.normalized_prompt.includes('cap nhat') ||
      capsule.normalized_prompt.includes('them vao') ||
      capsule.normalized_prompt.includes('ghi nhan') ||
      capsule.normalized_prompt.includes('dieu chinh') ||
      (/\bnhap\s+\d+/i.test(capsule.normalized_prompt))
    );

    if (hasWriteIntent) {
      return {
        valid: false,
        status: 'AI_SAFE_REFUSE',
        isUnavailable: true,
        authority_path: 'AI_SAFE_REFUSE',
        provider: providerRes?.provider || 'DEEPSEEK',
        tier: 0,
        final_answer_source: 'SAFE_REFUSE_WRITE',
        text: '🤔 Xin lỗi, tôi chưa chắc hiểu đúng yêu cầu nhập/xuất kho này. Bạn có thể nói rõ hơn tên mặt hàng và số lượng cần nhập/xuất không?',
        compactTrace: 'Safe Refuse (Write Intent)',
        isGracefulRefuse: true,
      };
    } else {
      return {
        valid: false,
        status: 'AI_SAFE_REFUSE',
        isUnavailable: true,
        authority_path: 'AI_SAFE_REFUSE',
        provider: providerRes?.provider || 'DEEPSEEK',
        tier: 0,
        final_answer_source: 'SAFE_REFUSE_READ',
        text: '🤔 Xin lỗi, tôi chưa hiểu rõ câu hỏi này. Bạn có thể diễn đạt lại cụ thể hơn không? Ví dụ: "Tuần này mặt hàng nào bán chạy nhất?" hoặc "Kiểm tra tồn kho sản phẩm X".',
        compactTrace: 'Safe Refuse (Read Query)',
        isGracefulRefuse: true,
      };
    }
  }

  // ============================================================
  // PROVIDER TRANSPORT FAILURE: Cloud & Local models failed (timeout/offline)
  // Evaluate Tier 4 Deterministic Rule-Based Fallback before reporting error.
  // ============================================================
  const detPlanFallback = generateDeterministicSemanticPlan(capsule);
  if (detPlanFallback && Array.isArray(detPlanFallback.intents) && detPlanFallback.intents.length > 0 && detPlanFallback.intents[0].required_capability !== 'check_stock_overview') {
    console.log('[Semantic Planner] Cloud providers unavailable, safely resolved via Tier 4 Deterministic Planner.');
    detPlanFallback.provider_trace = {
      provider: 'DETERMINISTIC_TIER4',
      model: 'rule-based-planner',
      latency_ms: 10,
      fallback_triggered: true,
      fallback_reason: providerRes?.reason || 'ALL_PROVIDERS_UNAVAILABLE',
      is_model_reasoning: false,
    };
    return { valid: true, plan: detPlanFallback };
  }

  if (options.allowDevMockPlanner === true || config.mode === PROVIDER_MODES.DETERMINISTIC) {
    const plan = generateDeterministicSemanticPlan(capsule);
    return { valid: true, plan };
  }

  const failureReason = providerRes?.reason || 'ALL_PROVIDERS_UNAVAILABLE';
  let errorText = '⚠️ Trợ lý AI tạm thời không khả dụng. Vui lòng thử lại sau giây lát.';
  let compactTrace = 'AI Unavailable';

  if (failureReason === 'LOCAL_GATEWAY_UNREACHABLE') {
    errorText = '⚠️ Không thể kết nối tới máy chủ AI. Vui lòng kiểm tra điện thoại và máy tính cùng kết nối chung một mạng Wi-Fi và máy chủ đang hoạt động.';
    compactTrace = 'Gateway Unreachable';
  } else if (failureReason === 'OLLAMA_OFFLINE') {
    errorText = '⚠️ Dịch vụ AI trên máy tính chưa được khởi chạy. Vui lòng mở ứng dụng Ollama trên máy tính để tiếp tục.';
    compactTrace = 'Ollama Offline';
  } else if (failureReason === 'LOCAL_MODEL_MISSING') {
    errorText = '⚠️ Chưa cài đặt mô hình AI trên máy tính. Hãy chạy lệnh "ollama run qwen2.5:1.5b" trên máy tính.';
    compactTrace = 'Model Missing';
  } else if (failureReason === 'LOCAL_MODEL_TIMEOUT') {
    errorText = '⚠️ AI xử lý quá lâu, có thể máy tính đang bận. Vui lòng thử lại với câu lệnh ngắn hơn.';
    compactTrace = 'Model Timeout';
  } else if (failureReason === 'CLOUD_KEY_NOT_CONFIGURED') {
    errorText = '⚠️ Chưa cấu hình API Key cho Cloud AI. Vui lòng nhập API Key trong mục Cài đặt (⚙).';
    compactTrace = 'Cloud Key Missing';
  } else if (failureReason === 'DEEPSEEK_KEY_NOT_CONFIGURED') {
    errorText = '⚠️ Chưa cấu hình DeepSeek API Key. Vui lòng đặt biến môi trường DEEPSEEK_API_KEY trên máy chủ.';
    compactTrace = 'DeepSeek Key Missing';
  } else if (failureReason === 'DEEPSEEK_TIMEOUT') {
    errorText = '⚠️ AI đang phản hồi chậm. Vui lòng thử lại sau giây lát.';
    compactTrace = 'DeepSeek Timeout';
  } else if (failureReason === 'DEEPSEEK_NETWORK_ERROR' || failureReason?.startsWith('DEEPSEEK_HTTP_')) {
    errorText = '⚠️ Không thể kết nối tới máy chủ AI. Vui lòng kiểm tra kết nối mạng.';
    compactTrace = 'DeepSeek Network Error';
  }

  return {
    valid: false,
    status: 'AI_UNAVAILABLE',
    reason: failureReason,
    isUnavailable: true,
    authority_path: 'AI_UNAVAILABLE',
    provider: providerRes?.provider || 'NONE',
    tier: 0,
    final_answer_source: failureReason,
    text: errorText,
    compactTrace,
  };
}
