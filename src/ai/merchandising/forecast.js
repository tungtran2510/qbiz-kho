/**
 * QBIZ MERCHANDISING INTELLIGENCE — PROGRESSIVE DEMAND FORECAST ENGINE
 * Progressive strategy:
 * Level 0: Insufficient History (< 7 days or < 3 sales) -> NEED_MORE_HISTORY
 * Level 1: Simple baseline (SMA, WMA, weekday seasonal adjustments)
 * Level 2: Intermittent demand (Croston's method for sparse demand)
 *
 * Chooses the best baseline using deterministic backtesting (lowest MAE).
 * LLMs NEVER generate raw forecast numbers.
 */

/**
 * Runs progressive forecast for a product using its daily sales series.
 *
 * @param {Array<{date: string, qty: number}>} dailyUnits - Daily sales array (chronological or reverse)
 * @param {number} horizonDays - Forecast horizon in days (default 14)
 * @returns {object} Forecast result with method, expected daily rate, total projected, MAE, and confidence
 */
export function forecastDemand(dailyUnits = [], horizonDays = 14) {
  // Sort chronologically ascending
  const series = (dailyUnits || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalPoints = series.length;
  const nonZeroPoints = series.filter(d => d.qty > 0);
  const totalUnits = series.reduce((sum, d) => sum + d.qty, 0);

  // LEVEL 0: Insufficient history
  if (totalPoints < 7 || nonZeroPoints.length < 2 || totalUnits === 0) {
    const fallbackRate = totalPoints > 0 ? Number((totalUnits / totalPoints).toFixed(2)) : 0;
    return {
      level: 0,
      method: 'LEVEL_0_RECENT_VELOCITY',
      status: totalUnits === 0 ? 'NO_SALES_RECORDED' : 'NEED_MORE_HISTORY',
      dailyForecast: fallbackRate,
      projectedDemand: Math.round(fallbackRate * horizonDays),
      confidence: 'LOW',
      mae: null,
      historyLengthDays: totalPoints,
      explanation: totalUnits === 0
        ? 'Chưa ghi nhận giao dịch bán nào trong lịch sử theo dõi.'
        : `Dữ liệu lịch sử còn ít (${nonZeroPoints.length} lần phát sinh bán), dùng tốc độ bán trung bình sơ bộ.`,
    };
  }

  // LEVEL 1 Models
  // 1. Simple Moving Average 7d (SMA7)
  const last7 = series.slice(-7);
  const sma7Rate = last7.reduce((sum, d) => sum + d.qty, 0) / 7;

  // 2. Simple Moving Average 14d (SMA14)
  const last14 = series.slice(-14);
  const sma14Rate = last14.reduce((sum, d) => sum + d.qty, 0) / Math.max(1, last14.length);

  // 3. Weighted Moving Average (WMA3W): 50% week 1, 30% week 2, 20% week 3
  let wmaRate = sma7Rate;
  if (totalPoints >= 21) {
    const w1 = series.slice(-7).reduce((s, d) => s + d.qty, 0) / 7;
    const w2 = series.slice(-14, -7).reduce((s, d) => s + d.qty, 0) / 7;
    const w3 = series.slice(-21, -14).reduce((s, d) => s + d.qty, 0) / 7;
    wmaRate = (0.5 * w1) + (0.3 * w2) + (0.2 * w3);
  }

  // LEVEL 2 Model: Croston's Method for Intermittent Demand
  // Used if zero-sales days constitute > 50% of the series
  const zeroRatio = (totalPoints - nonZeroPoints.length) / totalPoints;
  let crostonRate = 0;
  if (zeroRatio > 0.4) {
    let z = nonZeroPoints[0]?.qty || 1; // demand size
    let p = 1; // inter-arrival intervals
    let q = 1;
    const alpha = 0.15;

    for (let i = 1; i < totalPoints; i++) {
      if (series[i].qty > 0) {
        z = z + alpha * (series[i].qty - z);
        p = p + alpha * (q - p);
        q = 1;
      } else {
        q++;
      }
    }
    crostonRate = p > 0 ? z / p : 0;
  }

  // Deterministic Backtest selection on the last 7 days (if total series >= 14 days)
  let chosenMethod = 'SMA7';
  let chosenDailyRate = sma7Rate;
  let validationMae = null;

  if (totalPoints >= 14) {
    const trainSeries = series.slice(0, -7);
    const testSeries = series.slice(-7);
    const actualTest = testSeries.map(d => d.qty);

    // Predict with SMA7 from train
    const trainSMA7 = trainSeries.slice(-7).reduce((s, d) => s + d.qty, 0) / 7;
    const maeSMA7 = actualTest.reduce((sum, a) => sum + Math.abs(a - trainSMA7), 0) / 7;

    // Predict with SMA14 from train
    const trainSMA14 = trainSeries.slice(-14).reduce((s, d) => s + d.qty, 0) / Math.max(1, trainSeries.slice(-14).length);
    const maeSMA14 = actualTest.reduce((sum, a) => sum + Math.abs(a - trainSMA14), 0) / 7;

    let bestMae = maeSMA7;
    chosenMethod = 'SMA7';
    chosenDailyRate = sma7Rate;

    if (maeSMA14 < bestMae) {
      bestMae = maeSMA14;
      chosenMethod = 'SMA14';
      chosenDailyRate = sma14Rate;
    }

    if (zeroRatio > 0.4 && crostonRate > 0) {
      // Evaluate croston
      const maeCroston = actualTest.reduce((sum, a) => sum + Math.abs(a - crostonRate), 0) / 7;
      if (maeCroston < bestMae) {
        bestMae = maeCroston;
        chosenMethod = 'CROSTON_INTERMITTENT';
        chosenDailyRate = crostonRate;
      }
    }

    validationMae = Number(bestMae.toFixed(2));
  } else {
    // If between 7 and 13 days, default to SMA7
    chosenMethod = 'SMA7';
    chosenDailyRate = sma7Rate;
  }

  const roundedDaily = Number(Math.max(0, chosenDailyRate).toFixed(2));
  const projectedDemand = Math.round(roundedDaily * horizonDays);

  return {
    level: zeroRatio > 0.4 ? 2 : 1,
    method: chosenMethod,
    status: 'ACTIVE_FORECAST',
    dailyForecast: roundedDaily,
    projectedDemand,
    horizonDays,
    confidence: totalPoints >= 30 ? 'HIGH' : 'MEDIUM',
    mae: validationMae,
    historyLengthDays: totalPoints,
    zeroRatio: Number(zeroRatio.toFixed(2)),
  };
}
