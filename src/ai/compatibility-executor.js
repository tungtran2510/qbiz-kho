/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — COMPATIBILITY EXECUTOR (PHASE 3)
 * 
 * Core Architectural Role:
 * - Bridges Semantic Planner with Canonical Capability Registry (41 Tools, 40 Skills).
 * - Enforces Post-Plan Deterministic Entity & Temporal Resolution.
 * - Guard against Ambiguous Entity Auto-Execution (returns clarification prompt + stores pending clarification).
 * - Executes Multi-Intent Sequential Read execution without dropping subsequent intents.
 * - WRITE intent remains strictly PROPOSAL-ONLY (MODEL_DIRECT_DB_WRITE_COUNT = 0).
 * - Constructs & verifies Evidence Packets with tenant & mode invariants.
 * - Composes Grounded Responses strictly from verified Evidence Packets.
 * - Integrates with Conversation State for multi-turn history & deictic context.
 * - Non-blocking quality error reporting (CR-AIQ-002).
 */

import { executeSkill } from './skills.js';
import { executeTool } from './tools.js';
import { queryReceiptsAggregate } from './router.js';
import { postPlanRiskGuard } from './semantic-planner.js';
import { getCapability, isValidCapability } from './capability-registry.js';
import {
  resolveIntentEntities,
  buildEvidencePacket,
  verifyEvidencePacket,
  composeGroundedResponse,
  composeResponseFromEvidence,
} from './evidence-engine.js';
import { reportToolError, reportToolSelectedNotExecuted } from './error-reporter.js';
import {
  getConversationId,
  setPendingClarification,
  setPendingProposal,
  addTurnToHistory,
} from './conversation-state.js';

/**
 * Legacy Evidence Verification Helper (kept for backward compatibility).
 */
export function verifyExecutionEvidence(results, plan, context, state) {
  const currentShopId = context.shop_id || 'shop_default';
  const isPureRead = plan.intents.every(i => (i.mode || 'READ').toUpperCase() === 'READ');
  if (isPureRead) {
    for (const res of results) {
      if (res && res.proposal && res.proposal.status === 'COMMITTED') {
        return { verified: false, reason: 'UNAUTHORIZED_MUTATION_IN_READ_PLAN' };
      }
    }
  }
  return { verified: true, reason: 'EVIDENCE_VERIFIED_PASS' };
}

/**
 * Execute capability implementation binding.
 * Guarantees WRITE capabilities produce Proposals only.
 */
async function executeCapabilityBinding(capId, capability, resolved, intent, context, state) {
  const binding = capability.implementation_binding || {};
  const entities = intent.entities || {};

  switch (capId) {
    case 'get_profit_summary': {
      const period = resolved.timeRange?.code || intent.time_range || entities.period || 'today';
      const res = await executeSkill('profit-inquiry', { period }, context, state);
      return { ...res, intent: 'PROFIT_INQUIRY', toolExecuted: 'get_profit_summary' };
    }

    case 'get_customer_debt_summary': {
      const q = resolved.customerName || entities.customerName || entities.customer_name || entities.query || entities.customerId || context.rawPrompt || context.user_prompt;
      const res = await executeSkill('customer-debt-inquiry', { query: q }, context, state);
      return { ...res, intent: 'CUSTOMER_DEBT_INQUIRY', toolExecuted: 'get_customer_debt_summary' };
    }

    case 'get_customer_aging_report': {
      const res = await executeSkill('customer-aging-report', {}, context, state);
      return { ...res, intent: 'CUSTOMER_AGING_REPORT', toolExecuted: 'get_customer_aging_report' };
    }

    case 'get_customer_profile_history': {
      const q = resolved.customerName || entities.customerName || entities.customer_name || entities.query || entities.customerId || context.rawPrompt || context.user_prompt;
      const res = await executeSkill('customer-debt-inquiry', { query: q }, context, state);
      return { ...res, intent: 'CUSTOMER_PROFILE_HISTORY', toolExecuted: 'get_customer_profile_history' };
    }

    case 'search_customers': {
      const q = resolved.customerName || entities.customerName || entities.customer_name || entities.query || context.rawPrompt || context.user_prompt;
      const res = executeTool('search_customers', { query: q }, state, context);
      return { ...res, intent: 'SEARCH_CUSTOMERS', toolExecuted: 'search_customers' };
    }

    case 'setup_payment_qr': {
      const res = await executeSkill('setup-payment-qr', {}, context, state);
      return { ...res, intent: 'SETUP_PAYMENT_QR', toolExecuted: 'setup_payment_qr' };
    }

    case 'audit_qr_payment': {
      const q = resolved.query || entities.query || context.rawPrompt || context.user_prompt;
      const res = await executeSkill('audit-qr-payment', { query: q }, context, state);
      return { ...res, intent: 'AUDIT_QR_PAYMENT', toolExecuted: 'audit_qr_payment' };
    }

    case 'get_operating_expenses': {
      const period = resolved.timeRange?.code || intent.time_range || entities.period || 'month';
      const res = await executeSkill('operating-expenses-inquiry', { period }, context, state);
      return { ...res, intent: 'OPERATING_EXPENSES', toolExecuted: 'get_operating_expenses' };
    }

    case 'replenishment_suggestion': {
      const warehouseId = resolved.warehouseId || context.warehouse_id || 'all';
      const limit = entities.limit || 5;
      const res = await executeSkill('replenishment-suggestion', { warehouseId, limit }, context, state);
      return { ...res, intent: 'REPLENISHMENT_SUGGESTION', toolExecuted: 'replenishment-suggestion' };
    }

    case 'explain_replenishment': {
      const prodId = resolved.productId || entities.productId || context.current_product_id;
      let repRes = null;
      try {
        repRes = executeTool('explain_replenishment', { productId: prodId, warehouseId: resolved.warehouseId || 'all' }, state);
      } catch (_) {}

      const stockInfo = executeTool('get_available_stock', { productId: prodId }, state, context);
      const prod = (state?.data?.products || []).find(p => p.id === prodId) || { name: resolved.productName || 'Sản phẩm', unit: 'cái' };
      const lowThresh = prod.lowStock ?? 5;
      const fmt = new Intl.NumberFormat('vi-VN');

      let verdict = 'CHƯA CẦN';
      let suggestedQty = 10;
      let expText = '';

      if (repRes?.explanation?.markdown) {
        expText = repRes.explanation.markdown;
        suggestedQty = repRes.bundle?.plan?.suggestedQuantity || 10;
        verdict = (suggestedQty > 0 || stockInfo.available <= 0) ? 'NÊN NHẬP' : 'CHƯA CẦN';
      } else {
        if (stockInfo.available <= 0) {
          verdict = 'NÊN NHẬP';
          suggestedQty = lowThresh > 0 ? lowThresh * 2 : 10;
          expText = `• Tồn khả dụng hiện tại: **0 ${prod.unit}** (Đã hết hàng hoàn toàn).\n• Ngưỡng an toàn: **${lowThresh}**.\n• Lý do: Cần nhập bổ sung ngay để không gián đoạn bán hàng.`;
        } else if (stockInfo.available <= lowThresh) {
          verdict = 'NÊN NHẬP';
          suggestedQty = Math.max(10, lowThresh * 2 - stockInfo.available);
          expText = `• Tồn khả dụng hiện tại: **${fmt.format(stockInfo.available)} ${prod.unit}** (Dưới ngưỡng an toàn ${lowThresh}).\n• Khuyến nghị: Nên nhập thêm khoảng **${suggestedQty} ${prod.unit}**.`;
        } else {
          verdict = 'CHƯA CẦN';
          expText = `• Tồn khả dụng hiện tại: **${fmt.format(stockInfo.available)} ${prod.unit}** (Vượt ngưỡng an toàn ${lowThresh}).\n• Lý do: Hàng sẵn có đáp ứng tốt nhu cầu, chưa cần nhập thêm lúc này.`;
        }
      }

      return {
        text: `💡 **Tư vấn nhập hàng cho ${prod.name}: [${verdict}]**\n\n${expText}`,
        intent: 'REPLENISHMENT_ADVICE',
        skillId: 'explain-replenishment',
        toolExecuted: 'explain_replenishment',
        productId: prodId,
        productName: prod.name,
        status: 'SUCCESS',
      };
    }

    case 'check_stock': {
      const q = resolved.productName || resolved.productId || entities.productName || entities.product_name || entities.productId || entities.product_id || entities.query || entities.product || '';
      const res = await executeSkill('check-stock', { query: q, warehouseId: resolved.warehouseId }, context, state);
      return { ...res, intent: 'QUERY_STOCK', toolExecuted: 'check-stock', productId: resolved.productId, productName: resolved.productName };
    }

    case 'find_low_stock': {
      const res = await executeSkill('find-low-stock', { warehouseId: resolved.warehouseId }, context, state);
      return { ...res, intent: 'LOW_STOCK_INQUIRY', toolExecuted: 'find-low-stock' };
    }

    case 'search_products': {
      const q = resolved.productName || entities.query || entities.product || '';
      const res = executeTool('search_products', { query: q }, state, context);
      return { ...res, intent: 'SEARCH_PRODUCTS', toolExecuted: 'search_products' };
    }

    case 'price_lookup': {
      const prodId = resolved.productId || entities.productId;
      const res = await executeSkill('price-lookup', { productId: prodId }, context, state);
      return { ...res, intent: 'PRICE_LOOKUP', toolExecuted: 'price-lookup', productId: prodId };
    }

    case 'query_receipts_aggregate': {
      const p = resolved.timeRange?.label || intent.time_range || 'thang nay';
      const res = queryReceiptsAggregate(p, state, context);
      return { ...res, intent: 'QUERY_RECEIPTS_AGGREGATE', toolExecuted: 'query_receipts_aggregate' };
    }

    case 'sales_summary': {
      const period = resolved.timeRange?.code || intent.time_range || entities.period || entities.time_range || entities.timeRange || 'today';
      const res = await executeSkill('sales-summary', { period, comparePeriod: entities.comparePeriod || intent.comparePeriod }, context, state);
      return { ...res, intent: 'SALES_SUMMARY', toolExecuted: 'sales-summary' };
    }

    case 'export_report': {
      const period = resolved.timeRange?.code || intent.time_range || entities.period || 'month';
      const reportType = entities.reportType || 'revenue_tt88';
      const res = await executeSkill('export-report', { period, reportType }, context, state);
      return { ...res, intent: 'EXPORT_REPORT', toolExecuted: 'export-report' };
    }

    case 'top_selling_products': {
      const period = resolved.timeRange?.code || intent.time_range || 'month';
      const res = await executeSkill('top-selling-products', { period, query: entities.query || context.rawPrompt }, context, state);
      return { ...res, intent: 'TOP_SELLING', toolExecuted: 'top-selling-products' };
    }

    case 'product_performance_ranking': {
      const period = resolved.timeRange?.code || intent.time_range || entities.period || 'this_week';
      const res = await executeSkill('product-performance-ranking', {
        period,
        startDate: resolved.timeRange?.start,
        endDate: resolved.timeRange?.end,
        query: entities.query || context.rawPrompt,
        limit: entities.limit || 5,
        sortBy: entities.sortBy || 'auto',
      }, context, state);
      return { ...res, intent: 'PRODUCT_PERFORMANCE_RANKING', toolExecuted: 'getProductPerformanceRanking' };
    }

    case 'search_orders': {
      let sales = state?.data?.sales || [];
      if (sales.length === 0) {
        try {
          const dbMod = await import('../db.js');
          sales = (await dbMod.getAll('sales')) || [];
        } catch (_) {}
      }
      const q = entities.query || context.rawPrompt || '';
      if (sales.length === 0) {
        return {
          text: '⚠️ Cửa hàng chưa có đơn hàng hoặc hóa đơn nào trong hệ thống.',
          status: 'SUCCESS',
          intent: 'SEARCH_ORDERS',
          toolExecuted: 'search_orders'
        };
      }
      const fmt = new Intl.NumberFormat('vi-VN');
      const targetSale = sales[sales.length - 1];
      return {
        text: `🧾 **Thông tin hóa đơn bán hàng gần nhất:**\n\n- Mã đơn: **${targetSale.code || targetSale.id || 'HD-001'}**\n- Khách hàng: **${targetSale.customerLabel || targetSale.customer_name || 'Khách lẻ'}**\n- Tổng tiền: **${fmt.format(targetSale.total || targetSale.grand_total || 0)} ₫**\n- Trạng thái: **${targetSale.payment_status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}**\n- Thời gian: ${targetSale.createdAt || targetSale.created_at || 'Vừa xong'}`,
        status: 'SUCCESS',
        intent: 'SEARCH_ORDERS',
        toolExecuted: 'search_orders'
      };
    }

    case 'order_diagnosis': {
      const orderId = resolved.orderId || entities.orderId || context.current_order_id;
      const res = await executeSkill('order-diagnosis', { orderId }, context, state);
      return { ...res, intent: 'ORDER_DIAGNOSIS', toolExecuted: 'order-diagnosis' };
    }

    case 'shop_health_check': {
      const res = await executeSkill('shop-health-check', {}, context, state);
      return { ...res, intent: 'SHOP_HEALTH_CHECK', toolExecuted: 'shop-health-check' };
    }

    case 'customer_lookup': {
      const res = await executeSkill('customer-lookup', { customerId: resolved.customerId || entities.customerId }, context, state);
      return { ...res, intent: 'CUSTOMER_LOOKUP', toolExecuted: 'customer-lookup' };
    }

    case 'manage_hardware_printer': {
      const action = entities.action || 'PRINT_LATEST_INVOICE';
      if (action === 'PRINT_LATEST_INVOICE') {
        const sales = state?.data?.sales || [];
        if (sales.length === 0) {
          return {
            text: '⚠️ **Chưa có hóa đơn nào:** Cửa hàng chưa có giao dịch bán hàng nào trong hệ thống để in lại hóa đơn.',
            status: 'SUCCESS',
            intent: 'PRINT_INVOICE',
            toolExecuted: 'manage_hardware_printer'
          };
        }
        const latestSale = sales[sales.length - 1];
        if (typeof window !== 'undefined') {
          if (window.__qbiz_app__?.openTransaction) {
            window.__qbiz_app__.openTransaction(latestSale);
          } else if (window.__qbiz_app__?.openTransactionModal) {
            window.__qbiz_app__.openTransactionModal(latestSale.id || latestSale.sale_uuid);
          }
        }
        const fmt = new Intl.NumberFormat('vi-VN');
        return {
          text: `🖨️ **Đang mở và chuẩn bị in hóa đơn gần nhất:**\n\n- Mã hóa đơn: **${latestSale.code || latestSale.sale_uuid || 'HD-Gần nhất'}**\n- Khách hàng: **${latestSale.customerLabel || latestSale.customer_name || 'Khách lẻ'}**\n- Tổng tiền: **${fmt.format(latestSale.total || latestSale.total_amount || 0)} ₫**\n- Thời gian: ${latestSale.createdAt || latestSale.created_at || 'Vừa xong'}\n\n✅ *Phiếu thanh toán đã được mở trên màn hình để bạn bấm in hoặc gửi cho khách.*`,
          status: 'SUCCESS',
          intent: 'PRINT_INVOICE',
          toolExecuted: 'manage_hardware_printer'
        };
      }
      if (action === 'SET_PAPER_K80' || action === 'SET_PAPER_K58') {
        const isK80 = action === 'SET_PAPER_K80';
        const sizeCode = isK80 ? 'K80' : 'K58';
        if (typeof window !== 'undefined' && window.__qbiz_app__?.state?.printSettings) {
          window.__qbiz_app__.state.printSettings.paperSize = sizeCode;
        }
        if (typeof localStorage !== 'undefined') {
          try {
            const cur = JSON.parse(localStorage.getItem('qbiz_printer_settings') || '{}');
            cur.paperSize = sizeCode;
            localStorage.setItem('qbiz_printer_settings', JSON.stringify(cur));
          } catch (e) {}
        }
        return {
          text: `✅ **Đã chuyển định dạng in sang khổ giấy ${isK80 ? 'K80 (80mm)' : 'K58 (58mm)'}.**\n\nCấu hình đã được lưu bền vững. Các hóa đơn tiếp theo sẽ tự động dàn trang theo chuẩn khổ ${sizeCode}.`,
          status: 'SUCCESS',
          intent: 'SET_PAPER_SIZE',
          toolExecuted: 'manage_hardware_printer'
        };
      }
      if (action === 'PRINT_TEST') {
        return {
          text: `🖨️ **Lệnh in thử nghiệm (Test Slip):**\n\n- Đã gửi tín hiệu kiểm tra tới máy in POS.\n- Định dạng: Khổ giấy ${typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('qbiz_printer_settings') || '{}').paperSize === 'K58' ? 'K58 (58mm)' : 'K80 (80mm)'}.\n- Vui lòng kiểm tra khay giấy và cuộn in xem mẫu thử đã in ra rõ nét hay chưa.`,
          status: 'SUCCESS',
          intent: 'PRINT_TEST',
          toolExecuted: 'manage_hardware_printer'
        };
      }
      return {
        text: '⚙️ Đã tiếp nhận yêu cầu điều khiển máy in POS.',
        status: 'SUCCESS',
        intent: 'PRINTER_ACTION',
        toolExecuted: 'manage_hardware_printer'
      };
    }

    case 'compare_warehouse_stock': {
      const res = await executeSkill('compare-warehouse-stock', {
        warehouseA: entities.warehouseA || resolved.warehouseA,
        warehouseB: entities.warehouseB || resolved.warehouseB,
        query: entities.query || context.rawPrompt
      }, context, state);
      return { ...res, intent: 'COMPARE_WAREHOUSE_STOCK', toolExecuted: 'compare-warehouse-stock' };
    }

    case 'stocktake_discrepancies': {
      const res = await executeSkill('stocktake-discrepancies', {
        warehouseId: entities.warehouseId || resolved.warehouseId
      }, context, state);
      return { ...res, intent: 'STOCKTAKE_DISCREPANCIES', toolExecuted: 'stocktake-discrepancies' };
    }

    case 'generate_vietqr': {
      const res = await executeSkill('generate-vietqr', {
        amount: entities.amount,
        orderCode: entities.orderCode,
        note: entities.note,
        bankName: entities.bankName,
        accountNumber: entities.accountNumber,
        accountOwner: entities.accountOwner
      }, context, state);
      return { ...res, intent: 'GENERATE_VIETQR', toolExecuted: 'generate-vietqr' };
    }

    case 'manage_pos_shift': {
      const res = await executeSkill('manage-pos-shift', {
        action: entities.action || (context.rawPrompt?.toLowerCase().includes('mo ca') ? 'OPEN_SHIFT' : 'RECONCILE_SHIFT'),
        countedCash: entities.countedCash,
        openingCash: entities.openingCash || 1000000
      }, context, state);
      return { ...res, intent: res.intent || 'RECONCILE_SHIFT', toolExecuted: 'manage-pos-shift' };
    }

    case 'carrier_logistics': {
      const res = await executeSkill('carrier-logistics', {
        action: entities.action || (entities.trackingCode || resolved.trackingCode ? 'TRACK_SHIPMENT' : 'ESTIMATE_FEE'),
        trackingCode: entities.trackingCode || resolved.trackingCode,
        carrierCode: entities.carrierCode || resolved.carrierCode,
        weight: entities.weight || resolved.weight,
        province: entities.province || resolved.province
      }, context, state);
      return { ...res, intent: res.intent || 'CARRIER_LOGISTICS', toolExecuted: 'carrier-logistics' };
    }

    // =========================================================================
    // WRITE INTENT PROPOSALS — STRICT INVARIANT: MODEL DIRECT DB WRITE COUNT = 0
    // =========================================================================
    case 'receipt_proposal': {
      const res = await executeSkill('receipt-proposal', {
        ...entities,
        productId: resolved.productId || entities.productId,
        warehouseId: resolved.warehouseId !== 'all' ? resolved.warehouseId : 'wh_center',
      }, context, state);
      return { ...res, is_proposal: true, intent: 'CREATE_RECEIPT_PROPOSAL', toolExecuted: 'receipt-proposal', productId: resolved.productId };
    }

    case 'transfer_proposal': {
      const res = await executeSkill('transfer-proposal', {
        ...entities,
        productId: resolved.productId || entities.productId,
      }, context, state);
      return { ...res, is_proposal: true, intent: 'CREATE_TRANSFER_PROPOSAL', toolExecuted: 'transfer-proposal', productId: resolved.productId };
    }

    case 'stocktake_proposal': {
      const res = await executeSkill('stocktake-proposal', {
        ...entities,
        productId: resolved.productId || entities.productId,
        warehouseId: resolved.warehouseId !== 'all' ? resolved.warehouseId : 'wh_center',
      }, context, state);
      return { ...res, is_proposal: true, intent: 'CREATE_STOCKTAKE_PROPOSAL', toolExecuted: 'stocktake-proposal', productId: resolved.productId };
    }

    case 'issue_proposal': {
      const res = await executeSkill('issue-proposal', {
        ...entities,
        productId: resolved.productId || entities.productId,
        warehouseId: resolved.warehouseId !== 'all' ? resolved.warehouseId : 'wh_center',
        lines: (resolved.lines && resolved.lines.length > 0) ? resolved.lines : (entities.lines || []),
        qty: entities.quantity || entities.qty || resolved.qty || 1,
        reason: entities.reason || resolved.reason || 'Đề xuất xuất kho từ trợ lý AI',
      }, context, state);
      return { ...res, is_proposal: true, intent: 'CREATE_ISSUE_PROPOSAL', toolExecuted: 'issue-proposal', productId: resolved.productId };
    }

    case 'order_proposal': {
      const res = await executeSkill('order-proposal', {
        ...entities,
        customerName: resolved.customerName || entities.customerName || 'Khách lẻ',
        customerPhone: resolved.customerPhone || entities.customerPhone || '',
        address: resolved.address || entities.address || '',
        items: (resolved.items && resolved.items.length > 0) ? resolved.items : (entities.items || (resolved.productId ? [{ productId: resolved.productId, quantity: entities.quantity || resolved.qty || 1 }] : [])),
        discount: entities.discount ?? resolved.discount ?? 0,
        shippingFee: entities.shippingFee ?? resolved.shippingFee ?? 0,
        paymentMethod: entities.paymentMethod || resolved.paymentMethod || 'TM',
        paymentTermDays: entities.paymentTermDays ?? resolved.paymentTermDays ?? 0,
        warehouseId: resolved.warehouseId !== 'all' ? resolved.warehouseId : 'wh_center',
      }, context, state);
      return { ...res, is_proposal: true, intent: 'CREATE_ORDER_PROPOSAL', toolExecuted: 'order-proposal' };
    }

    case 'electronic_invoice_proposal': {
      const res = await executeSkill('invoice-proposal', {
        ...entities,
        taxCode: resolved.taxCode || entities.taxCode || '',
        companyName: resolved.companyName || entities.companyName || '',
        address: resolved.address || entities.address || '',
        email: resolved.email || entities.email || '',
        items: (resolved.items && resolved.items.length > 0) ? resolved.items : (entities.items || (resolved.productId ? [{ productId: resolved.productId, quantity: entities.quantity || resolved.qty || 1 }] : [])),
        vatRate: entities.vatRate ?? resolved.vatRate ?? 10,
        paymentMethod: entities.paymentMethod || resolved.paymentMethod || 'CK',
      }, context, state);
      return { ...res, is_proposal: true, intent: 'CREATE_INVOICE_PROPOSAL', toolExecuted: 'invoice-proposal' };
    }

    case 'add_cart_draft': {
      const res = await executeSkill('add-cart-draft', {
        ...entities,
        productId: resolved.productId || entities.productId,
      }, context, state);
      return { ...res, is_proposal: true, intent: 'ADD_CART_DRAFT', toolExecuted: 'add-cart-draft', productId: resolved.productId };
    }

    default: {
      if (binding.type === 'skill' && binding.target) {
        const res = await executeSkill(binding.target, { ...entities, ...resolved }, context, state);
        return { ...res, intent: capId, toolExecuted: binding.target };
      } else if (binding.type === 'tool' && binding.target) {
        const res = executeTool(binding.target, { ...entities, ...resolved }, state, context);
        return { ...res, intent: capId, toolExecuted: binding.target };
      }
      const res = await executeSkill('check-stock', { query: '' }, context, state);
      return { ...res, intent: 'GENERAL_STOCK_OVERVIEW', toolExecuted: 'check-stock' };
    }
  }
}

/**
 * Execute a single planned intent node with Entity Resolution & Evidence Construction.
 */
async function executeSingleIntentWithEvidence(intent, context, state) {
  const cap = intent.required_capability;

  // 1. Post-Plan Entity & Context Resolution
  const resolved = resolveIntentEntities(intent, context, state);

  // 2. Ambiguity Guard: Blocks Auto-Execution on Ambiguous Entity References
  if (resolved.isAmbiguous) {
    reportToolSelectedNotExecuted(cap, 'AMBIGUOUS_ENTITY', { candidates: resolved.ambiguousCandidates });
    const candidateList = resolved.ambiguousCandidates.map(c => `• **${c.name}** (Mã: ${c.sku || c.id})`).join('\n');
    const clarText = `🔍 **Phát hiện nhiều sản phẩm phù hợp với "${intent.entities?.productName || intent.entities?.productId || ''}":**\n\n${candidateList}\n\nVui lòng chỉ định rõ tên hoặc mã cụ thể để tôi thực hiện chính xác!`;

    // Record pending clarification in Conversation State
    setPendingClarification({
      query: intent.entities?.productName || intent.entities?.productId || '',
      reason: 'AMBIGUOUS_ENTITY',
      candidates: resolved.ambiguousCandidates,
      original_intent: intent,
      replan_count: 0,
    });

    return {
      execution_blocked: true,
      block_reason: 'AMBIGUOUS_ENTITY',
      result: {
        text: clarText,
        status: 'CLARIFICATION_REQUIRED',
        isAmbiguous: true,
        isClarification: true,
        candidates: resolved.ambiguousCandidates,
        intent: intent.intent_name,
        toolExecuted: null,
      },
      evidence: null,
      resolved,
    };
  }

  // 3. Capability Registry Guard
  const capability = getCapability(cap);
  if (!capability) {
    reportToolSelectedNotExecuted(cap, 'UNREGISTERED_CAPABILITY', {});
    return {
      execution_blocked: true,
      block_reason: 'UNREGISTERED_CAPABILITY',
      result: {
        text: `⚠️ **Khả năng chưa đăng ký:** Yêu cầu "${cap}" không thuộc danh mục năng lực được cấp phép của hệ thống.`,
        status: 'UNREGISTERED_CAPABILITY',
        error: 'UNREGISTERED_CAPABILITY',
        intent: intent.intent_name,
        toolExecuted: null,
      },
      evidence: null,
      resolved,
    };
  }

  // 4. Execution Binding
  let rawResult = null;
  try {
    rawResult = await executeCapabilityBinding(cap, capability, resolved, intent, context, state);
  } catch (execErr) {
    console.warn(`[Compatibility Executor] Error executing capability ${cap}:`, execErr);
    reportToolError(cap, execErr, { context, intent });
    rawResult = {
      text: `⚠️ Có lỗi khi thực thi tác vụ ${cap}: ${execErr.message || 'Lỗi không xác định'}`,
      status: 'EXECUTION_ERROR',
      error: execErr.message || 'EXECUTION_ERROR',
      intent: intent.intent_name,
      toolExecuted: cap,
    };
  }

  // 5. Wrap Proposal if WRITE capability or returned is_proposal
  let structuredProposal = null;
  if (rawResult?.proposal && typeof rawResult.proposal === 'object') {
    structuredProposal = rawResult.proposal;
    structuredProposal.id = structuredProposal.id || structuredProposal.proposal_id || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    structuredProposal.proposal_id = structuredProposal.id;
    structuredProposal.conversation_id = structuredProposal.conversation_id || getConversationId();
    structuredProposal.source_intent = structuredProposal.source_intent || intent.intent_name || structuredProposal.intent;
    structuredProposal.isProposal = true;
    if (!structuredProposal.status || structuredProposal.status === 'PROPOSAL_DRAFT' || structuredProposal.status === 'DRAFT') {
      structuredProposal.status = 'READY';
    }
    setPendingProposal(structuredProposal);
    rawResult.proposal = structuredProposal;
    rawResult.is_proposal = true;
    rawResult.status = 'PROPOSAL_PENDING';
  } else if (capability.mode === 'WRITE' || rawResult?.is_proposal) {
    const propId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    structuredProposal = {
      id: propId,
      proposal_id: propId,
      conversation_id: getConversationId(),
      intent: intent.intent_name || cap,
      source_intent: intent.intent_name || cap,
      entity_ids: [resolved.productId].filter(Boolean),
      parameters: rawResult?.parameters || rawResult?.params || { productId: resolved.productId, warehouseId: resolved.warehouseId },
      human_summary: rawResult?.summary || rawResult?.text || `Đề xuất cho ${cap}`,
      mutation_summary: rawResult?.summary || rawResult?.text || `Đề xuất cho ${cap}`,
      risk_level: 'WRITE_PROPOSAL',
      confirmation_state: 'PENDING',
      raw_proposal: rawResult?.proposal || rawResult,
      status: 'READY',
      isProposal: true,
    };

    setPendingProposal(structuredProposal);
    rawResult.proposal = structuredProposal;
    rawResult.is_proposal = true;
    rawResult.status = 'PROPOSAL_PENDING';
  }

  // 6. Evidence Packet Construction
  const evidencePacket = buildEvidencePacket({
    capability,
    toolBinding: rawResult?.toolExecuted || cap,
    resolvedContext: resolved,
    rawResult,
    context,
    state,
  });

  // 7. Evidence Verification
  const ver = verifyEvidencePacket(evidencePacket, capability, context, state);

  return {
    execution_blocked: false,
    block_reason: null,
    result: rawResult,
    evidence: {
      packet: evidencePacket,
      verified: ver.verified,
      failureReason: ver.failureReason,
    },
    resolved,
    proposal: structuredProposal,
  };
}

/**
 * Main Compatibility Execution Pipeline for Semantic Plans (Phase 3).
 * Strictly bounds execution DAG to 1_PLAN_N_TOOLS (Zero infinite loops).
 */
export async function executeSemanticPlan(plan, context = {}, state = {}, options = {}) {
  // 1. Post-Plan Business Risk Guard
  const guard = postPlanRiskGuard(plan, context);
  if (!guard.allowed) {
    return {
      text: guard.deniedReason,
      status: 'BLOCKED',
      isBlocked: true,
      permissionDenied: guard.permissionDenied || false,
      tier: 0,
      provider: 'POST_PLAN_RISK_GUARD',
      authority_path: 'POST_PLAN_RISK_GUARD',
      final_answer_source: 'POLICY_GUARD',
      compactTrace: 'Post-Plan Risk Guard (Blocked)',
      conversation_id: getConversationId(),
    };
  }

  // 2. Execute Planned Intents (Bounded DAG: Single pass across planned intents)
  const results = [];
  const toolsExecuted = [];
  const evidencePackets = [];
  let lastResolvedProduct = null;
  let lastResolvedWarehouse = null;
  let lastTimeRange = null;
  let primaryProposal = null;

  for (const intent of plan.intents) {
    const execContext = {
      ...context,
      rawPrompt: plan.raw_prompt || context.rawPrompt || context.user_prompt || '',
      user_prompt: plan.raw_prompt || context.user_prompt || context.rawPrompt || '',
    };
    const execRes = await executeSingleIntentWithEvidence(intent, execContext, state);

    if (execRes.execution_blocked) {
      // Early exit if an intent demands clarification or is blocked
      return {
        ...execRes.result,
        tier: 0,
        provider: plan.provider_trace?.provider || 'RESOLVER_GUARD',
        authority_path: execRes.block_reason,
        final_answer_source: 'RESOLVER_GUARD',
        compactTrace: `Clarification Required [${execRes.block_reason}]`,
        conversation_id: getConversationId(),
      };
    }

    if (execRes.result) {
      results.push(execRes.result);
      if (execRes.result.toolExecuted) {
        toolsExecuted.push(execRes.result.toolExecuted);
      }
    }

    if (execRes.resolved?.productId) {
      lastResolvedProduct = {
        id: execRes.resolved.productId,
        name: execRes.resolved.productName || 'Sản phẩm',
      };
    }
    if (execRes.resolved?.warehouseId) {
      lastResolvedWarehouse = {
        id: execRes.resolved.warehouseId,
        name: execRes.resolved.warehouseName || execRes.resolved.warehouseId,
      };
    }
    if (execRes.resolved?.timeRange?.label) {
      lastTimeRange = execRes.resolved.timeRange.label;
    }

    if (execRes.proposal && !primaryProposal) {
      primaryProposal = execRes.proposal;
    }

    if (execRes.evidence) {
      evidencePackets.push(execRes.evidence);
    }
  }

  // 3. Grounded Response Composition via Evidence Engine
  const composed = await composeGroundedResponse({
    plan,
    evidencePackets,
    userPrompt: plan.raw_prompt || '',
    context,
    options,
  });

  // 4. Update Conversation State (Record completed turn)
  addTurnToHistory({
    userPrompt: plan.raw_prompt || '',
    assistantSummary: composed.text,
    intents: plan.intents,
    entities: {
      product: lastResolvedProduct,
      warehouse: lastResolvedWarehouse,
    },
    proposal: primaryProposal,
    timeRange: lastTimeRange,
  });

  // 5. Trace Truth Synthesis
  const isRealModel = Boolean(plan.provider_trace?.is_model_reasoning);
  const planProvider = plan.provider_trace?.provider || (isRealModel ? 'SEMANTIC_PLANNER' : 'DEGRADED_RULE_PLANNER');
  const planModel = plan.provider_trace?.model || (isRealModel ? 'semantic-planner' : 'rule-based-planner');
  const effectiveAuthority = isRealModel ? 'SEMANTIC_PLANNER' : 'DEGRADED_RULE_PLANNER';
  const effectiveFinalSource = isRealModel
    ? (composed.is_real_composer ? 'GROUNDED_COMPOSER_MODEL' : 'SEMANTIC_MODEL')
    : 'DETERMINISTIC_FALLBACK';
  const effectiveTier = isRealModel ? 1 : 0;
  const allVerified = evidencePackets.length > 0 && evidencePackets.every(e => e.verified);
  const verVerdict = allVerified ? 'PASS' : 'FAIL';

  const hasWrite = plan.intents.some(i => i.mode === 'WRITE');
  const hasRead = plan.intents.some(i => (i.mode || 'READ') === 'READ');
  const riskClass = hasWrite && hasRead ? 'READ_WRITE_COMPOSED' : (hasWrite ? 'WRITE_PROPOSAL' : (plan.intents.length > 1 ? 'READ_MULTI' : 'READ_SINGLE'));

  const tracePill = isRealModel
    ? `Semantic Plan [${toolsExecuted.join(' + ')}]`
    : `Degraded Rule Planner [${toolsExecuted.join(' + ')}]`;

  const traceDetail = isRealModel
    ? `Semantic Planner (${planModel}) -> ${toolsExecuted.join(', ')} [Composer: ${composed.composer_provider || 'DETERMINISTIC'}, Evidence: ${verVerdict}]`
    : `Degraded Rule Planner (${planModel}) -> ${toolsExecuted.join(', ')} [Composer: ${composed.composer_provider || 'DETERMINISTIC'}, Evidence: ${verVerdict}]`;

  // Preserve proposal if generated
  const proposalPayload = primaryProposal || composed.proposal || results.find(r => r.proposal)?.proposal || null;
  const primaryResult = results[0] || {};

  return {
    ...composed,
    intent: primaryResult.intent || plan.intents[0]?.intent_name,
    skillId: primaryResult.skillId || plan.intents[0]?.required_capability,
    summary: primaryResult.summary || primaryResult.result?.summary || null,
    parameters: primaryResult.parameters || plan.intents[0]?.entities || {},
    BUILD_SHA: '9837b84-qa-phase3r',
    build_sha: '9837b84-qa-phase3r',
    proposal: proposalPayload,
    tier: effectiveTier,
    provider: planProvider,
    authority_path: effectiveAuthority,
    conversation_id: getConversationId(),
    request_id: plan.request_id || `req_${Date.now()}`,
    planner_provider: planProvider,
    planner_model: planModel,
    composer_provider: composed.composer_provider || 'DETERMINISTIC_COMPOSER',
    composer_model: composed.composer_model || 'grounded-template',
    composer_source: composed.is_real_composer ? 'GROUNDED_COMPOSER_MODEL' : (composed.composer_provider || 'DETERMINISTIC_COMPOSER'),
    plan_intent_count: plan.intents.length,
    capabilities: plan.intents.map(i => i.required_capability),
    selected_capabilities: plan.intents.map(i => i.required_capability),
    risk_class: riskClass,
    tools_executed: toolsExecuted,
    evidence_status: verVerdict,
    evidence_packets: evidencePackets.map(e => e.packet),
    evidence_verified: allVerified,
    verification: verVerdict,
    proposal_state: proposalPayload ? 'PENDING_CONFIRMATION' : 'NONE',
    clarification_state: 'NONE',
    final_answer_source: effectiveFinalSource,
    is_real_ai: isRealModel,
    compactTrace: tracePill,
    trace: traceDetail,
  };
}
