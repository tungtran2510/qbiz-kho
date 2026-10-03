/**
 * QBIZ MERCHANDISING INTELLIGENCE — DECISION & RECOMMENDATION ENGINE
 * Implements:
 * - Deterministic Reorder Point (ROP) & Safety Stock (SS)
 * - Suggested Reorder Quantity (SRQ)
 * - 9-State Explainable Product Viability Evaluation
 * - Replenishment Candidate Ranking
 * - Budget-constrained Purchase Allocation
 */

/**
 * Calculates replenishment plan for a single product.
 *
 * @param {object} snapshot - ProductDecisionSnapshot
 * @param {object} metrics - Output of calculateProductMetrics
 * @param {object} forecast - Output of forecastDemand
 * @param {object} options - Options (leadTimeDays, coverageDays, reviewDays)
 * @returns {object} Replenishment plan object
 */
export function calculateReplenishmentPlan(snapshot, metrics, forecast, options = {}) {
  const prod = snapshot.product || {};
  const inv = snapshot.inventory || {};
  const lowStock = Number(prod.lowStock || 0);

  // Supplier lead time: Check if explicitly provided or default assumption
  const leadTimeConfigured = options.leadTimeDays || prod.leadTimeDays || null;
  const leadTimeDays = Number(leadTimeConfigured || 3);
  const isLeadTimeAssumed = !leadTimeConfigured;

  // Review & coverage periods
  const coverageDays = Number(options.coverageDays || 14);
  const dailyRate = forecast?.dailyForecast !== undefined ? forecast.dailyForecast : metrics.primaryVelocity;

  // Safety Stock (SS)
  // If variance is known, SS = ceil(1.65 * stdDev * sqrt(leadTime)), bounded by lowStock
  let safetyStock = lowStock;
  if (metrics.stdDevDailySales > 0 && leadTimeDays > 0) {
    const statisticalSS = Math.ceil(1.65 * metrics.stdDevDailySales * Math.sqrt(leadTimeDays));
    safetyStock = Math.max(lowStock, statisticalSS);
  }

  // Reorder Point (ROP) = demand during lead time + safety stock
  const leadTimeDemand = dailyRate * leadTimeDays;
  const reorderPoint = Math.ceil(leadTimeDemand + safetyStock);

  // Target Stock = demand over (lead time + coverage) + safety stock
  const targetStock = Math.max(
    lowStock * 2,
    Math.ceil(dailyRate * (leadTimeDays + coverageDays)) + safetyStock,
    10 // Minimum sensible business buffer for active merchandise
  );

  const netAvailable = inv.available + inv.incomingTransit;

  // Replenishment trigger condition:
  // Net available <= ROP OR available <= lowStock OR available <= 0
  const needsReorder = (netAvailable <= reorderPoint) || (inv.available <= lowStock) || (inv.available <= 0);
  const suggestedQty = needsReorder ? Math.max(0, targetStock - netAvailable) : 0;

  // Determine urgency
  let urgency = 'NORMAL';
  let priorityScore = 0;

  if (inv.available <= 0 && dailyRate > 0) {
    urgency = 'CRITICAL';
    priorityScore += 60;
  } else if (metrics.daysOfSupply !== null && metrics.daysOfSupply <= leadTimeDays) {
    urgency = 'HIGH';
    priorityScore += 45;
  } else if (needsReorder) {
    urgency = 'MEDIUM';
    priorityScore += 25;
  }

  // Trend boost
  if (metrics.trend7d?.direction === 'RISING') priorityScore += 15;
  if (metrics.trend7d?.direction === 'FALLING') priorityScore -= 10;

  // Economic contribution boost
  if (metrics.grossProfit30d > 0) priorityScore += 10;

  return {
    productId: prod.id,
    productName: prod.name,
    sku: prod.sku,
    unit: prod.unit,
    costPrice: prod.cost_price,
    sellingPrice: prod.price,
    currentStock: inv.onHand,
    availableStock: inv.available,
    incomingTransit: inv.incomingTransit,
    dailyVelocity: dailyRate,
    daysOfSupply: metrics.daysOfSupply,
    leadTimeDays,
    isLeadTimeAssumed,
    safetyStock,
    reorderPoint,
    targetStock,
    needsReorder,
    suggestedQuantity: suggestedQty,
    urgency,
    priorityScore,
    coverageDays,
  };
}

/**
 * Evaluates the 9-state Product Viability Decision.
 * States:
 * - GROW
 * - KEEP
 * - REORDER
 * - WATCH
 * - REDUCE_BUYING
 * - PROMOTION_CANDIDATE
 * - CLEARANCE_CANDIDATE
 * - DISCONTINUE_CANDIDATE
 * - NEED_MORE_DATA
 *
 * @param {object} snapshot - ProductDecisionSnapshot
 * @param {object} metrics - Deterministic metrics
 * @param {object} plan - Replenishment plan
 * @param {object} abcxyz - ABC/XYZ classification info
 * @returns {object} Viability assessment
 */
export function evaluateProductViability(snapshot, metrics, plan, abcxyz = {}) {
  const prod = snapshot.product || {};
  const inv = snapshot.inventory || {};
  const sales = snapshot.sales || {};

  const reasonCodes = [];
  const whyReasons = [];

  // Check 1: Insufficient history / new product
  const totalSold30d = sales.unitsSold30d || 0;
  const txCount = sales.txCount30d || 0;
  if (totalSold30d === 0 && txCount === 0 && (!sales.lastSoldDate || inv.available === 0)) {
    return {
      state: 'NEED_MORE_DATA',
      label: 'Cần thêm dữ liệu',
      badgeClass: 'badge-muted',
      headline: 'Chưa đủ dữ liệu giao dịch để đánh giá hiệu quả kinh doanh.',
      action: 'Tiếp tục theo dõi bán hàng và nhập tồn thực tế.',
      reasonCodes: ['INSUFFICIENT_HISTORY', 'NO_RECENT_DEMAND'],
      whyReasons: ['Chưa phát sinh giao dịch bán hàng nào trong 30 ngày qua.'],
      metrics,
    };
  }

  // Check reason codes
  if (inv.available <= 0) reasonCodes.push('STOCKOUT');
  if (metrics.daysOfSupply !== null && metrics.daysOfSupply <= 3) reasonCodes.push('LOW_DAYS_OF_SUPPLY');
  if (metrics.primaryVelocity >= 1.0) reasonCodes.push('HIGH_VELOCITY');
  if (metrics.trend7d?.direction === 'RISING') reasonCodes.push('RISING_DEMAND');
  if (metrics.trend7d?.direction === 'FALLING') reasonCodes.push('FALLING_DEMAND');

  if (abcxyz.abcClass === 'A') reasonCodes.push('ABC_A');
  else if (abcxyz.abcClass === 'B') reasonCodes.push('ABC_B');
  else if (abcxyz.abcClass === 'C') reasonCodes.push('ABC_C');

  if (metrics.grossMarginPct30d !== null) {
    if (metrics.grossMarginPct30d >= 30) reasonCodes.push('GOOD_MARGIN');
    else if (metrics.grossMarginPct30d < 15) reasonCodes.push('LOW_MARGIN');
  }

  if (metrics.isSlowMoving) reasonCodes.push('SLOW_MOVING');
  if (metrics.isAgedStock) reasonCodes.push('AGED_STOCK');
  if (plan.suggestedQuantity > 0) reasonCodes.push('REORDER_RECOMMENDED');
  if (inv.incomingTransit > 0) reasonCodes.push('INCOMING_STOCK_EXISTS');
  if (plan.isLeadTimeAssumed) reasonCodes.push('LEAD_TIME_MISSING');
  if (!prod.cost_price) reasonCodes.push('COST_DATA_MISSING');

  // Decision State Logic
  let state = 'KEEP';
  let label = 'Duy trì kinh doanh';
  let badgeClass = 'badge-success';
  let headline = '';
  let action = '';

  // 1. REORDER state: high commercial urgency
  if (plan.needsReorder && plan.suggestedQuantity > 0 && (abcxyz.abcClass === 'A' || metrics.primaryVelocity >= 0.5)) {
    state = 'REORDER';
    label = 'Cần nhập thêm ngay';
    badgeClass = 'badge-danger';
    headline = `Mặt hàng bán tốt nhưng sắp đứt hàng (còn ${inv.available} ${prod.unit}, đủ bán ${metrics.daysOfSupply ?? '< 1'} ngày).`;
    action = `Lập phiếu nhập thêm ${plan.suggestedQuantity} ${prod.unit} để tránh gián đoạn kinh doanh.`;
    whyReasons.push(`Tốc độ bán đạt ${metrics.primaryVelocity} ${prod.unit}/ngày.`);
    whyReasons.push(`Tồn kho khả dụng (${inv.available}) dưới ngưỡng an toàn (${plan.reorderPoint}).`);
  }
  // 2. GROW state: Rising, high velocity, healthy margin
  else if (metrics.trend7d?.direction === 'RISING' && (abcxyz.abcClass === 'A' || abcxyz.abcClass === 'B') && (metrics.grossMarginPct30d === null || metrics.grossMarginPct30d >= 20)) {
    state = 'GROW';
    label = 'Tiềm năng tăng trưởng';
    badgeClass = 'badge-primary';
    headline = `Mặt hàng đang tăng trưởng mạnh (+${metrics.trend7d.percentage}% so với tuần trước), biên lãi tốt.`;
    action = `Ưu tiên vị trí trưng bày nổi bật và đảm bảo nguồn hàng dồi dào.`;
    whyReasons.push(`Doanh số 7 ngày gần nhất tăng ${metrics.trend7d.percentage}%.`);
    if (metrics.grossMarginPct30d) whyReasons.push(`Biên lợi nhuận gộp hấp dẫn (${metrics.grossMarginPct30d}%).`);
  }
  // 3. CLEARANCE_CANDIDATE: Aged stock > 60 days, money tied up, zero recent sales
  else if (metrics.isAgedStock && inv.available > 0 && totalSold30d === 0) {
    state = 'CLEARANCE_CANDIDATE';
    label = 'Xả hàng thanh lý';
    badgeClass = 'badge-warning';
    headline = `Hàng tồn kho lâu ngày không bán được, đang chôn vốn ${new Intl.NumberFormat('vi-VN').format(metrics.capitalTiedUp)} ₫.`;
    action = `Nên giảm giá thanh lý để thu hồi vốn lưu động, tuyệt đối KHÔNG nhập thêm.`;
    whyReasons.push(`Đã hơn ${metrics.daysSinceLastSale ?? '60+'} ngày chưa phát sinh đơn bán.`);
    whyReasons.push(`Đang giam giữ ${inv.available} ${prod.unit} trong kho.`);
  }
  // 4. PROMOTION_CANDIDATE: Slow moving, excess stock
  else if (metrics.isSlowMoving && inv.available > 0 && metrics.daysOfSupply > 45) {
    state = 'PROMOTION_CANDIDATE';
    label = 'Nên kích cầu / khuyến mãi';
    badgeClass = 'badge-info';
    headline = `Tốc độ bán chậm (${metrics.primaryVelocity} ${prod.unit}/ngày) so với mức tồn kho (${inv.available} ${prod.unit}).`;
    action = `Áp dụng chương trình combo, giảm giá nhẹ hoặc tặng kèm để đẩy nhanh tồn kho.`;
    whyReasons.push(`Tồn kho hiện tại đủ bán tới ${metrics.daysOfSupply} ngày.`);
    whyReasons.push(`Cần tăng vòng quay vốn hàng hóa.`);
  }
  // 5. REDUCE_BUYING: Excessive days of supply, falling trend
  else if (metrics.daysOfSupply !== null && metrics.daysOfSupply > 60 && metrics.trend7d?.direction === 'FALLING') {
    state = 'REDUCE_BUYING';
    label = 'Nên giảm nhập';
    badgeClass = 'badge-warning';
    headline = `Lượng bán đang chững lại (-${Math.abs(metrics.trend7d.percentage)}%), tồn kho còn rất dồi dào.`;
    action = `Giảm định mức nhập hoặc tạm ngưng đặt hàng đến khi mức tồn về an toàn.`;
    whyReasons.push(`Tồn kho còn đủ bán cho ${metrics.daysOfSupply} ngày tới.`);
    whyReasons.push(`Xu hướng bán 7 ngày qua giảm mạnh.`);
  }
  // 6. DISCONTINUE_CANDIDATE: Long-term zero sales, low margin, high holding cost
  else if (sales.unitsSold90d === 0 && inv.available > 0 && metrics.daysSinceLastSale >= 90) {
    state = 'DISCONTINUE_CANDIDATE';
    label = 'Cân nhắc ngừng kinh doanh';
    badgeClass = 'badge-danger';
    headline = `Sản phẩm không có giao dịch trong suốt 90 ngày qua.`;
    action = `Bán hết tồn hiện tại rồi ngưng kinh doanh mặt hàng này để tối ưu danh mục.`;
    whyReasons.push(`Không có doanh số trong suốt 3 tháng qua.`);
    whyReasons.push(`Không nên tiếp tục đặt hàng từ nhà cung cấp.`);
  }
  // 7. WATCH: Low margin or falling trend or volatile
  else if (metrics.trend7d?.direction === 'FALLING' || (metrics.grossMarginPct30d !== null && metrics.grossMarginPct30d < 10)) {
    state = 'WATCH';
    label = 'Cần theo dõi sát';
    badgeClass = 'badge-warning';
    headline = metrics.grossMarginPct30d !== null && metrics.grossMarginPct30d < 10
      ? `Doanh thu khá nhưng biên lợi nhuận quá mỏng (${metrics.grossMarginPct30d}%).`
      : `Xu hướng tiêu thụ sụt giảm (${metrics.trend7d.percentage}% so với tuần trước).`;
    action = `Xem lại giá vốn/giá bán hoặc khảo sát lại nhu cầu khách hàng.`;
    if (metrics.grossMarginPct30d !== null && metrics.grossMarginPct30d < 10) {
      whyReasons.push(`Biên lợi nhuận gộp chỉ đạt ${metrics.grossMarginPct30d}%.`);
    } else {
      whyReasons.push(`Lượng bán tuần này sụt giảm.`);
    }
  }
  // 8. KEEP: Normal, healthy performance
  else {
    state = 'KEEP';
    label = 'Duy trì kinh doanh ổn định';
    badgeClass = 'badge-success';
    headline = `Mặt hàng vận hành ổn định, đóng góp đều đặn cho cửa hàng.`;
    action = `Tiếp tục kinh doanh bình thường, theo dõi các đợt nhập định kỳ.`;
    whyReasons.push(`Tốc độ bán ổn định (${metrics.primaryVelocity} ${prod.unit}/ngày).`);
    whyReasons.push(`Tồn kho ở mức phù hợp (${inv.available} ${prod.unit}).`);
  }

  return {
    state,
    label,
    badgeClass,
    headline,
    action,
    reasonCodes,
    whyReasons,
    metrics,
  };
}

/**
 * Ranks replenishment candidates across the shop.
 *
 * @param {Array<object>} items - Array of { snapshot, metrics, forecast, plan, abcxyz, viability }
 * @returns {Array<object>} Sorted list of top candidates needing replenishment
 */
export function rankReplenishmentCandidates(items = []) {
  const needing = items.filter(it => it.plan.needsReorder || it.plan.suggestedQuantity > 0 || it.plan.urgency === 'CRITICAL');

  needing.sort((a, b) => {
    // 1. Critical stockout first
    if (a.plan.urgency === 'CRITICAL' && b.plan.urgency !== 'CRITICAL') return -1;
    if (b.plan.urgency === 'CRITICAL' && a.plan.urgency !== 'CRITICAL') return 1;

    // 2. High urgency second
    if (a.plan.urgency === 'HIGH' && b.plan.urgency !== 'HIGH') return -1;
    if (b.plan.urgency === 'HIGH' && a.plan.urgency !== 'HIGH') return 1;

    // 3. Priority score
    if (b.plan.priorityScore !== a.plan.priorityScore) {
      return b.plan.priorityScore - a.plan.priorityScore;
    }

    // 4. Suggested quantity
    return b.plan.suggestedQuantity - a.plan.suggestedQuantity;
  });

  const seenNames = new Set();
  const dedupedNeeding = [];
  for (const it of needing) {
    const normName = String(it.snapshot?.product?.name || '').trim().toLowerCase();
    if (normName && seenNames.has(normName)) continue;
    if (normName) seenNames.add(normName);
    dedupedNeeding.push(it);
  }

  return dedupedNeeding;
}

/**
 * Optimizes replenishment under a strict budget constraint.
 * Greedily allocates available funds to highest-priority items.
 *
 * @param {Array<object>} rankedCandidates - Output from rankReplenishmentCandidates
 * @param {number} budgetAmount - Total budget in VND (e.g. 5,000,000)
 * @returns {object} Draft purchase allocation plan
 */
export function allocatePurchaseBudget(rankedCandidates = [], budgetAmount = 0) {
  const budget = Math.max(0, Number(budgetAmount || 0));
  let remainingBudget = budget;
  const draftLines = [];
  let totalAllocatedUnits = 0;
  let totalCost = 0;

  for (const candidate of rankedCandidates) {
    if (remainingBudget <= 0) break;
    const plan = candidate.plan;
    const prod = candidate.snapshot.product;
    const unitCost = Number(prod.cost_price || (prod.price ? prod.price * 0.7 : 0));
    if (unitCost <= 0) continue;

    const neededQty = plan.suggestedQuantity > 0 ? plan.suggestedQuantity : (plan.targetStock - plan.availableStock);
    if (neededQty <= 0) continue;

    // Max affordable units
    const maxAffordable = Math.floor(remainingBudget / unitCost);
    if (maxAffordable <= 0) continue;

    const allocatedQty = Math.min(neededQty, maxAffordable);
    const lineCost = allocatedQty * unitCost;

    remainingBudget -= lineCost;
    totalCost += lineCost;
    totalAllocatedUnits += allocatedQty;

    draftLines.push({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      unit: prod.unit,
      unitCost,
      requestedQty: neededQty,
      allocatedQty,
      lineTotal: lineCost,
      urgency: plan.urgency,
      reason: candidate.viability?.headline || plan.urgency,
      daysOfSupply: plan.daysOfSupply,
    });
  }

  return {
    budgetTotal: budget,
    allocatedCost: totalCost,
    remainingBudget,
    totalAllocatedUnits,
    itemCount: draftLines.length,
    lines: draftLines,
    isBudgetExhausted: remainingBudget < 50000, // less than 50k left
    explanation: `Đã tối ưu phân bổ ${new Intl.NumberFormat('vi-VN').format(totalCost)} ₫ / ${new Intl.NumberFormat('vi-VN').format(budget)} ₫ ngân sách cho ${draftLines.length} mặt hàng cấp thiết nhất.`,
  };
}
