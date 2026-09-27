/**
 * QBIZ MERCHANDISING INTELLIGENCE — DETERMINISTIC METRICS ENGINE
 * Implements strict deterministic business formulas:
 * - Velocity (7d, 14d, 30d, 90d)
 * - Trend momentum (7d vs prev 7d, 30d vs prev 30d)
 * - Days of supply (DOS) with divide-by-zero protection
 * - ABC & XYZ classification
 * - Working capital & slow-moving detection
 */

/**
 * Calculates deterministic merchandising metrics for a single product snapshot.
 *
 * @param {object} snapshot - Output from buildProductDecisionSnapshot
 * @param {object} options - Options (e.g. leadTimeDays assumption)
 * @returns {object} Calculated metrics object
 */
export function calculateProductMetrics(snapshot, options = {}) {
  if (!snapshot) return null;

  const sales = snapshot.sales || {};
  const inv = snapshot.inventory || {};
  const prod = snapshot.product || {};
  const now = options.referenceDate ? new Date(options.referenceDate) : new Date(snapshot.generated_at || Date.now());

  // 1. Sales Velocities (units/day)
  const v7 = Number((sales.unitsSold7d / 7).toFixed(2));
  const v14 = Number((sales.unitsSold14d / 14).toFixed(2));
  const v30 = Number((sales.unitsSold30d / 30).toFixed(2));
  const v90 = Number((sales.unitsSold90d / 90).toFixed(2));

  // Primary operational velocity (prefer 7d for fast-moving sensitivity, fallback to 30d)
  const primaryVelocity = v7 > 0 ? v7 : v30;

  // 2. Trend Momentum: 7d vs prev 7d
  let trend7dPct = 0;
  let trend7dDirection = 'STABLE';
  if (sales.unitsSoldPrev7d > 0) {
    trend7dPct = Math.round(((sales.unitsSold7d - sales.unitsSoldPrev7d) / sales.unitsSoldPrev7d) * 100);
  } else if (sales.unitsSold7d > 0) {
    trend7dPct = 100;
  }

  if (trend7dPct >= 20 && sales.unitsSold7d >= 2) {
    trend7dDirection = 'RISING';
  } else if (trend7dPct <= -20) {
    trend7dDirection = 'FALLING';
  } else {
    trend7dDirection = 'STABLE';
  }

  // 3. Days of Supply (DOS)
  let daysOfSupply = null;
  let dosStatus = 'NORMAL';
  if (primaryVelocity > 0) {
    daysOfSupply = Number((inv.available / primaryVelocity).toFixed(1));
  } else {
    dosStatus = inv.available > 0 ? 'NO_RECENT_DEMAND' : 'OUT_OF_STOCK';
  }

  // 4. Stockout Risk Assessment
  const defaultLeadTime = options.leadTimeDays || 3;
  let stockoutRisk = 'LOW';
  let stockoutDays = 0;

  if (inv.available <= 0) {
    stockoutRisk = primaryVelocity > 0 ? 'CRITICAL' : 'HIGH';
  } else if (daysOfSupply !== null) {
    if (daysOfSupply <= defaultLeadTime) {
      stockoutRisk = 'HIGH';
    } else if (daysOfSupply <= defaultLeadTime * 2 || inv.available <= prod.lowStock) {
      stockoutRisk = 'MEDIUM';
    }
  } else if (inv.available <= prod.lowStock && prod.lowStock > 0) {
    stockoutRisk = 'MEDIUM';
  }

  // 5. Stock Age & Slow Moving
  let daysSinceLastSale = null;
  if (sales.lastSoldDate) {
    const lastDate = new Date(sales.lastSoldDate);
    daysSinceLastSale = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000)));
  }

  const isSlowMoving = (inv.available > 0) && (
    (daysSinceLastSale !== null && daysSinceLastSale >= 30) ||
    (daysSinceLastSale === null && sales.unitsSold30d === 0)
  );

  const isAgedStock = (inv.available > 0) && (
    (daysSinceLastSale !== null && daysSinceLastSale >= 60) ||
    (daysSinceLastSale === null && sales.unitsSold90d === 0)
  );

  const capitalTiedUp = (inv.available || 0) * (prod.cost_price || prod.price || 0);

  // 6. Daily Variance & Standard Deviation (for XYZ variability)
  const dailyArray = (sales.dailyUnits || []).map(d => d.qty);
  let meanDaily = 0;
  let stdDevDaily = 0;
  let cv = 0; // Coefficient of variation = stdDev / mean

  if (dailyArray.length > 0) {
    const sum = dailyArray.reduce((acc, q) => acc + q, 0);
    meanDaily = sum / dailyArray.length;
    if (meanDaily > 0) {
      const variance = dailyArray.reduce((acc, q) => acc + Math.pow(q - meanDaily, 2), 0) / dailyArray.length;
      stdDevDaily = Math.sqrt(variance);
      cv = Number((stdDevDaily / meanDaily).toFixed(2));
    }
  }

  return {
    productId: prod.id,
    velocity_7d: v7,
    velocity_14d: v14,
    velocity_30d: v30,
    velocity_90d: v90,
    primaryVelocity,
    trend7d: {
      percentage: trend7dPct,
      direction: trend7dDirection,
      unitsCurrent: sales.unitsSold7d,
      unitsPrevious: sales.unitsSoldPrev7d,
    },
    daysOfSupply,
    dosStatus,
    stockoutRisk,
    daysSinceLastSale,
    isSlowMoving,
    isAgedStock,
    capitalTiedUp,
    meanDailySales: Number(meanDaily.toFixed(2)),
    stdDevDailySales: Number(stdDevDaily.toFixed(2)),
    coefficientOfVariation: cv,
    grossProfit30d: sales.grossProfit30d,
    grossMarginPct30d: sales.grossMarginPct30d,
    netSales30d: sales.netSales30d,
  };
}

/**
 * Computes ABC & XYZ Classification across all product snapshots.
 *
 * ABC Basis: 30d Gross Profit (if available and positive), fallback to 30d Net Sales.
 * Thresholds: A = top 80%, B = next 15%, C = bottom 5%.
 *
 * XYZ Basis: Coefficient of Variation (CV) of daily sales:
 * X: CV < 0.5 (stable)
 * Y: 0.5 <= CV <= 1.0 (moderate)
 * Z: CV > 1.0 or intermittent (volatile)
 *
 * @param {Array<object>} snapshots - Array of ProductDecisionSnapshots
 * @param {object} options - Configuration options
 * @returns {Map<string, object>} Map of productId => { abcClass, xyzClass, abcxyz, metrics }
 */
export function calculateShopABCXYZ(snapshots, options = {}) {
  const result = new Map();
  if (!snapshots || !snapshots.length) return result;

  // 1. Calculate individual metrics first
  const enriched = snapshots.map(s => ({
    snapshot: s,
    metrics: calculateProductMetrics(s, options),
  }));

  // 2. ABC Ranking: determine value basis
  // Check if we have cost data for majority
  const hasProfits = enriched.some(e => (e.metrics.grossProfit30d || 0) > 0);
  const getSortValue = e => hasProfits && e.metrics.grossProfit30d > 0
    ? e.metrics.grossProfit30d
    : (e.metrics.netSales30d || 0);

  enriched.sort((a, b) => getSortValue(b) - getSortValue(a));

  const totalValue = enriched.reduce((sum, e) => sum + Math.max(0, getSortValue(e)), 0);

  let cumulativeValue = 0;
  for (const item of enriched) {
    const val = Math.max(0, getSortValue(item));
    cumulativeValue += val;
    const cumPct = totalValue > 0 ? (cumulativeValue / totalValue) * 100 : 100;

    let abcClass = 'C';
    if (cumPct <= 80 || item === enriched[0]) {
      abcClass = 'A';
    } else if (cumPct <= 95) {
      abcClass = 'B';
    } else {
      abcClass = 'C';
    }

    // XYZ Assignment
    const cv = item.metrics.coefficientOfVariation;
    const totalSold = item.snapshot.sales.unitsSold30d;
    let xyzClass = 'Z';
    if (totalSold === 0) {
      xyzClass = 'Z';
    } else if (cv < 0.5) {
      xyzClass = 'X';
    } else if (cv <= 1.0) {
      xyzClass = 'Y';
    } else {
      xyzClass = 'Z';
    }

    result.set(item.snapshot.product.id, {
      productId: item.snapshot.product.id,
      productName: item.snapshot.product.name,
      abcClass,
      xyzClass,
      abcxyz: `${abcClass}-${xyzClass}`,
      contributionValue: val,
      cumulativePct: Math.round(cumPct * 10) / 10,
      metrics: item.metrics,
      snapshot: item.snapshot,
    });
  }

  return result;
}
