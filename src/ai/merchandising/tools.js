/**
 * QBIZ MERCHANDISING INTELLIGENCE — HIGH-LEVEL TOOLS
 * Provides pure, deterministic analytical functions exposed to AI skills and router.
 * Tools comply with READ-ONLY safety. Proposals produce structured draft envelopes.
 */

import { buildProductDecisionSnapshot, buildAllProductDecisionSnapshots } from './facts.js';
import { calculateProductMetrics, calculateShopABCXYZ } from './metrics.js';
import { forecastDemand } from './forecast.js';
import {
  calculateReplenishmentPlan,
  evaluateProductViability,
  rankReplenishmentCandidates,
  allocatePurchaseBudget,
} from './recommendations.js';
import {
  formatProductReplenishmentExplanation,
  formatReplenishmentList,
  formatSlowMovingReport,
  formatHighRevenueLowMarginReport,
  formatBudgetAllocationExplanation,
  formatFiveActionsChecklist,
} from './explanations.js';
import { createProposal } from '../proposals.js';
import { hasCapability, PERMISSIONS } from '../policy.js';
import { getCurrentActor } from '../context.js';
import { resolveDateInterval } from '../tools.js';

/**
 * Builds full analysis bundle for a single product snapshot.
 */
function analyzeSingleProduct(snapshot, options = {}, abcMap = null) {
  if (!snapshot) return null;
  const metrics = calculateProductMetrics(snapshot, options);
  const forecast = forecastDemand(snapshot.sales.dailyUnits, options.horizonDays || 14);
  const plan = calculateReplenishmentPlan(snapshot, metrics, forecast, options);
  const abcxyz = abcMap?.get(snapshot.product.id) || { abcClass: 'B', xyzClass: 'Y', abcxyz: 'B-Y' };
  const viability = evaluateProductViability(snapshot, metrics, plan, abcxyz);

  return {
    snapshot,
    metrics,
    forecast,
    plan,
    abcxyz,
    viability,
  };
}

/**
 * Builds full analysis bundles for all tracked products.
 */
function analyzeAllProducts(state, options = {}) {
  const snapshots = buildAllProductDecisionSnapshots(state, options);
  const abcMap = calculateShopABCXYZ(snapshots, options);
  return snapshots.map(s => analyzeSingleProduct(s, options, abcMap)).filter(Boolean);
}

export const MERCHANDISING_TOOLS = {
  /**
   * 1. Get detailed Decision Snapshot for a product.
   */
  get_product_decision_snapshot({ productId, warehouseId }, state) {
    const snapshot = buildProductDecisionSnapshot(productId, state, { warehouseId });
    if (!snapshot) {
      return { error: 'PRODUCT_NOT_FOUND', productId };
    }
    const bundle = analyzeSingleProduct(snapshot, { warehouseId });
    return bundle;
  },

  /**
   * 2. Get ranked Replenishment Candidates across the store.
   */
  get_replenishment_candidates({ warehouseId, limit = 10 }, state) {
    const allBundles = analyzeAllProducts(state, { warehouseId });
    const ranked = rankReplenishmentCandidates(allBundles);
    const top = ranked.slice(0, Number(limit || 10));

    return {
      candidates: top.map(it => ({
        productId: it.snapshot.product.id,
        productName: it.snapshot.product.name,
        sku: it.snapshot.product.sku,
        unit: it.snapshot.product.unit,
        warehouseId: it.snapshot.inventory.warehouseId,
        warehouseName: it.snapshot.inventory.warehouseName,
        availableStock: it.snapshot.inventory.available,
        dailyVelocity: it.metrics.primaryVelocity,
        daysOfSupply: it.metrics.daysOfSupply,
        suggestedQuantity: it.plan.suggestedQuantity,
        reorderPoint: it.plan.reorderPoint,
        urgency: it.plan.urgency,
        viabilityState: it.viability.state,
        headline: it.viability.headline,
      })),
      totalNeedingReplenishment: ranked.length,
      markdown: formatReplenishmentList(top),
      isClean: ranked.length === 0,
    };
  },

  /**
   * 3. Fully explain replenishment recommendation for a specific product.
   */
  explain_replenishment({ productId, warehouseId }, state) {
    const snapshot = buildProductDecisionSnapshot(productId, state, { warehouseId });
    if (!snapshot) {
      return { error: 'PRODUCT_NOT_FOUND', productId };
    }
    const allBundles = analyzeAllProducts(state, { warehouseId });
    const abcMap = new Map(allBundles.map(b => [b.snapshot.product.id, b.abcxyz]));
    const bundle = analyzeSingleProduct(snapshot, { warehouseId }, abcMap);
    const explanation = formatProductReplenishmentExplanation(bundle);

    return {
      bundle,
      explanation,
    };
  },

  /**
   * 4. Identify slow-moving goods and tied-up working capital.
   */
  get_slow_movers({ warehouseId, limit = 10 }, state) {
    const allBundles = analyzeAllProducts(state, { warehouseId });
    const slow = allBundles.filter(it => it.metrics.isSlowMoving || it.metrics.isAgedStock || it.viability.state === 'CLEARANCE_CANDIDATE');

    slow.sort((a, b) => (b.metrics.capitalTiedUp || 0) - (a.metrics.capitalTiedUp || 0));
    const top = slow.slice(0, Number(limit || 10));

    return {
      slowMovers: top.map(it => ({
        productId: it.snapshot.product.id,
        productName: it.snapshot.product.name,
        availableStock: it.snapshot.inventory.available,
        daysSinceLastSale: it.metrics.daysSinceLastSale,
        capitalTiedUp: it.metrics.capitalTiedUp,
        viabilityState: it.viability.state,
        recommendedAction: it.viability.action,
      })),
      totalCount: slow.length,
      totalCapitalTiedUp: slow.reduce((sum, it) => sum + (it.metrics.capitalTiedUp || 0), 0),
      markdown: formatSlowMovingReport(top),
    };
  },

  /**
   * 5. Detect high revenue but low margin products (commercial leakage).
   */
  get_high_revenue_low_margin({ warehouseId, limit = 5 }, state, envelope, actor) {
    const act = actor || (envelope?.actor_role ? { id: envelope.actor_id, role: envelope.actor_role } : getCurrentActor());
    if (!hasCapability(act, PERMISSIONS.VIEW_COST)) {
      throw new Error(`HARD DENY: Tài khoản vai trò "${act.role}" không có quyền xem giá vốn và phân tích biên lợi nhuận (VIEW_COST denied).`);
    }

    const allBundles = analyzeAllProducts(state, { warehouseId });
    const filtered = allBundles.filter(it => {
      const net = it.metrics.netSales30d || 0;
      const margin = it.metrics.grossMarginPct30d;
      return net > 0 && margin !== null && margin < 15;
    });

    filtered.sort((a, b) => (b.metrics.netSales30d || 0) - (a.metrics.netSales30d || 0));
    const top = filtered.slice(0, Number(limit || 5));

    return {
      items: top,
      markdown: formatHighRevenueLowMarginReport(top),
    };
  },

  /**
   * 6. Evaluate viability state of a product (Should I keep selling this?).
   */
  evaluate_product_viability({ productId, warehouseId }, state) {
    const snapshot = buildProductDecisionSnapshot(productId, state, { warehouseId });
    if (!snapshot) {
      return { error: 'PRODUCT_NOT_FOUND', productId };
    }
    const allBundles = analyzeAllProducts(state, { warehouseId });
    const abcMap = new Map(allBundles.map(b => [b.snapshot.product.id, b.abcxyz]));
    const bundle = analyzeSingleProduct(snapshot, { warehouseId }, abcMap);

    return {
      productId: bundle.snapshot.product.id,
      productName: bundle.snapshot.product.name,
      viability: bundle.viability,
      metrics: bundle.metrics,
      markdown: `### 🧭 ĐÁNH GIÁ KINH DOANH: **${bundle.snapshot.product.name}**\n- **Trạng thái:** **${bundle.viability.label}**\n- **Nhận định:** ${bundle.viability.headline}\n- **Khuyến nghị hành động:** ${bundle.viability.action}\n- **Căn cứ:**\n${bundle.viability.whyReasons.map(r => `  + ${r}`).join('\n')}`,
    };
  },

  /**
   * 7. Optimize replenishment under strict budget constraint.
   */
  optimize_replenishment_budget({ budgetAmount, warehouseId }, state, envelope, actor) {
    const allBundles = analyzeAllProducts(state, { warehouseId });
    const ranked = rankReplenishmentCandidates(allBundles);
    const allocation = allocatePurchaseBudget(ranked, budgetAmount);

    return {
      allocation,
      markdown: formatBudgetAllocationExplanation(allocation),
    };
  },

  /**
   * 8. Generate 5 actionable items for shop owner today.
   */
  get_five_actions_today({ warehouseId }, state) {
    const allBundles = analyzeAllProducts(state, { warehouseId });
    const ranked = rankReplenishmentCandidates(allBundles);
    const slow = allBundles.filter(it => it.metrics.isSlowMoving || it.viability.state === 'CLEARANCE_CANDIDATE');

    const actions = [];

    // 1. Stockout check
    const stockoutItems = ranked.filter(it => it.plan.urgency === 'CRITICAL');
    if (stockoutItems.length > 0) {
      actions.push({
        title: `Xử lý ${stockoutItems.length} mặt hàng đứt tồn`,
        detail: `Các mặt hàng: ${stockoutItems.map(it => it.snapshot.product.name).slice(0, 3).join(', ')} đã hết hàng.`,
        recommendation: `Tạo ngay phiếu nhập bổ sung để không bỏ lỡ doanh thu.`,
      });
    }

    // 2. Imminent stockout
    const imminent = ranked.filter(it => it.plan.urgency === 'HIGH');
    if (imminent.length > 0) {
      actions.push({
        title: `Nhập bổ sung ${imminent.length} mặt hàng sắp hết`,
        detail: `Tồn kho chỉ còn đủ bán từ 1 - 3 ngày tới (${imminent.map(it => it.snapshot.product.name).slice(0, 2).join(', ')}).`,
        recommendation: `Liên hệ nhà cung cấp đặt hàng trước khi cạn kho.`,
      });
    }

    // 3. Slow moving capital
    if (slow.length > 0) {
      const topSlow = slow[0];
      actions.push({
        title: `Giải phóng vốn đọng mặt hàng bán chậm`,
        detail: `Mặt hàng "${topSlow.snapshot.product.name}" chôn vốn ${new Intl.NumberFormat('vi-VN').format(topSlow.metrics.capitalTiedUp)} ₫.`,
        recommendation: `Chạy khuyến mãi, tặng kèm hoặc giảm giá xả tồn.`,
      });
    }

    // 4. Check rising star items
    const rising = allBundles.filter(it => it.metrics.trend7d?.direction === 'RISING');
    if (rising.length > 0) {
      const topRising = rising[0];
      actions.push({
        title: `Đẩy mạnh mặt hàng tăng trưởng`,
        detail: `"${topRising.snapshot.product.name}" tăng ${topRising.metrics.trend7d.percentage}% doanh số tuần qua.`,
        recommendation: `Đưa lên đầu danh mục, vị trí nổi bật tại quầy hoặc banner quảng cáo.`,
      });
    }

    // 5. Audit & inventory count
    actions.push({
      title: `Kiểm kê ngẫu nhiên 3 mặt hàng có doanh số lớn`,
      detail: `Đối chiếu số tồn trên sổ sách và số lượng đếm thực tế ở kho.`,
      recommendation: `Tránh lệch tồn dẫn đến tính sai lượng đề xuất nhập.`,
    });

    const markdown = formatFiveActionsChecklist({ actions });
    return {
      actions,
      markdown,
    };
  },

  /**
   * 9. Summarize business period (Week/Month Review).
   */
  summarize_business_period({ period = 'month', customStart = null, customEnd = null, warehouseId = null }, state, envelope, actor) {
    const { start, end, label } = resolveDateInterval(period, new Date(), customStart, customEnd);
    const allBundles = analyzeAllProducts(state, { warehouseId });
    const ranked = rankReplenishmentCandidates(allBundles);
    const slow = allBundles.filter(it => it.metrics.isSlowMoving);
    const rising = allBundles.filter(it => it.metrics.trend7d?.direction === 'RISING');

    // Sales metrics for period
    const sales = (state?.data?.sales || []).filter(s => {
      const dt = new Date(s.created_at || s.createdAt || 0);
      return ['COMPLETED', 'PAID'].includes(String(s.status || '').toUpperCase()) && dt >= start && dt <= end;
    });

    const netRevenue = sales.reduce((sum, s) => sum + Number(s.grand_total ?? s.total ?? 0), 0);
    const txCount = sales.length;

    const lines = [
      `📊 **TỔNG KẾT KINH DOANH & TỒN KHO (${label.toUpperCase()}):**\n`,
      `**1. KẾT QUẢ KINH DOANH:**`,
      `- Doanh thu ghi nhận: **${new Intl.NumberFormat('vi-VN').format(netRevenue)} ₫** (${txCount} giao dịch hoàn tất)`,
      `- Mặt hàng bán chạy nhất: **${rising[0]?.snapshot?.product?.name || allBundles[0]?.snapshot?.product?.name || 'Chưa có'}**\n`,
      `**2. BIẾN ĐỘNG SẢN PHẨM & TỒN KHO:**`,
      `- Mặt hàng cần nhập thêm: **${ranked.length}** sản phẩm`,
      `- Mặt hàng bán chậm / tồn đọng: **${slow.length}** sản phẩm`,
      `- Mặt hàng có xu hướng tăng trưởng: **${rising.length}** sản phẩm\n`,
      `**3. ĐỀ XUẤT HÀNH ĐỘNG TRỌNG TÂM:**`,
      `- Ưu tiên đặt hàng các mặt hàng sắp cạn: ${ranked.slice(0, 3).map(it => it.snapshot.product.name).join(', ') || 'Kho đủ hàng'}`,
      `- Lên kế hoạch xả tồn hoặc giảm giá cho nhóm hàng bán chậm để xoay vòng vốn.`,
    ];

    return {
      period,
      periodLabel: label,
      netRevenue,
      txCount,
      reorderCount: ranked.length,
      slowCount: slow.length,
      markdown: lines.join('\n'),
    };
  },

  /**
   * 10. Create Replenishment Plan Draft (DRAFT PROPOSAL ENVELOPE ONLY).
   * Strict safety: Does not write to DB! Produces proposal for user confirmation.
   */
  create_replenishment_plan_draft({ items = [], warehouseId = null, reason = 'Đề xuất nhập hàng từ phân tích AI' }, state, envelope) {
    const whId = warehouseId || (state?.data?.warehouses || [])[0]?.id || 'wh_default';
    const wh = (state?.data?.warehouses || []).find(w => w.id === whId);
    const draftLines = [];

    for (const it of items) {
      const p = (state?.data?.products || []).find(x => x.id === it.productId || x.sku === it.sku || x.name === it.productName);
      if (p) {
        draftLines.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku || '',
          unit: p.unit || 'cái',
          qty: Math.max(1, Math.floor(Number(it.qty || it.suggestedQuantity || 1))),
          costPrice: Number(p.cost_price || p.price || 0),
        });
      }
    }

    if (!draftLines.length) {
      throw new Error('Không có mặt hàng hợp lệ nào để lập đề xuất nhập hàng.');
    }

    const payload = {
      action: 'REPLENISHMENT_DRAFT',
      warehouseId: whId,
      reason,
      lines: draftLines,
      totalUnits: draftLines.reduce((sum, l) => sum + l.qty, 0),
      totalEstimatedCost: draftLines.reduce((sum, l) => sum + (l.qty * l.costPrice), 0),
    };

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'create-replenishment-draft',
      intent: 'create_receipt_proposal',
      entities: {
        warehouse: wh ? { id: wh.id, name: wh.name } : null,
        lines: draftLines,
      },
      parameters: {
        warehouseId: whId,
        lines: draftLines,
        reason,
        totalUnits: payload.totalUnits,
        totalEstimatedCost: payload.totalEstimatedCost,
      },
      humanSummary: `Đề xuất nhập bổ sung ${payload.totalUnits} đơn vị hàng hóa cho ${draftLines.length} mặt hàng theo khuyến nghị của Trợ lý AI.`,
      contextSnapshot: envelope,
      actor: envelope?.actor || { id: 'user_active', role: 'owner' },
    });
  },
};
