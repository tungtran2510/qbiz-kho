/**
 * QBIZ MERCHANDISING INTELLIGENCE — FACT BUILDER
 * Builds deterministic, auditable ProductDecisionSnapshots from live business ledger data.
 * Zero-hallucination guarantee: All numbers come directly from state.data stores.
 */

import { totalFor, levelFor, available } from '../../engine.js';

/**
 * Formats a Date object to YYYY-MM-DD
 */
function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds a single ProductDecisionSnapshot for a given product ID.
 *
 * @param {string} productId
 * @param {object} state - Global application state
 * @param {object} options - Optional filters (e.g. warehouseId, referenceDate)
 * @returns {object|null} Snapshot object or null if product not found
 */
export function buildProductDecisionSnapshot(productId, state, options = {}) {
  const products = state?.data?.products || [];
  const prod = products.find(p => p.id === productId);
  if (!prod) return null;

  const now = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const warehouseId = options.warehouseId || null;
  const targetWarehouse = warehouseId && warehouseId !== 'all'
    ? (state?.data?.warehouses || []).find(w => w.id === warehouseId)
    : null;

  // 1. Inventory facts from canonical ledger
  const invTotal = warehouseId && warehouseId !== 'all'
    ? {
        onHand: levelFor(state.data, prod.id, warehouseId)?.onHand || 0,
        reserved: levelFor(state.data, prod.id, warehouseId)?.reserved || 0,
        available: available(levelFor(state.data, prod.id, warehouseId) || {}),
        damaged: levelFor(state.data, prod.id, warehouseId)?.damaged || 0,
      }
    : totalFor(state.data, prod.id);

  // 2. Incoming transit transfers
  const transfers = state?.data?.transfers || [];
  let incomingTransit = 0;
  for (const tr of transfers) {
    if (tr.status === 'in_transit') {
      if (!warehouseId || warehouseId === 'all' || tr.toWarehouseId === warehouseId) {
        for (const line of (tr.lines || [])) {
          if (line.productId === prod.id) {
            incomingTransit += Number(line.qty || 0);
          }
        }
      }
    }
  }

  // 3. Time cutoffs
  const dayMs = 24 * 60 * 60 * 1000;
  const tNow = now.getTime();
  const t7d = tNow - 7 * dayMs;
  const tPrev7dStart = tNow - 14 * dayMs;
  const t14d = tNow - 14 * dayMs;
  const t30d = tNow - 30 * dayMs;
  const tPrev30dStart = tNow - 60 * dayMs;
  const t90d = tNow - 90 * dayMs;

  // 4. Sales and orders aggregation
  const sales = state?.data?.sales || [];
  const completedOrders = state?.data?.orders || [];

  const relevantSales = sales.filter(s => {
    if (s.status === 'CANCELLED' || s.status === 'cancelled') return false;
    const status = String(s.status || '').toUpperCase();
    if (!['COMPLETED', 'PAID'].includes(status)) return false;
    if (warehouseId && warehouseId !== 'all') {
      const wh = s.warehouseId || s.warehouse_id;
      if (wh && wh !== warehouseId) return false;
    }
    return true;
  });

  const saleCodes = new Set(relevantSales.flatMap(s => [s.code, s.id, s.sale_uuid, s.order_id, s.order_code, s.reference, s.reference_id].filter(Boolean)));
  const relevantOrders = completedOrders.filter(o => {
    if (String(o.status || '').toUpperCase() !== 'COMPLETED') return false;
    if (saleCodes.has(o.code) || saleCodes.has(o.id) || saleCodes.has(o.order_uuid)) return false;
    if (o.sale_id && relevantSales.some(s => s.id === o.sale_id || s.sale_uuid === o.sale_id)) return false;
    if (warehouseId && warehouseId !== 'all') {
      const wh = o.warehouseId || o.warehouse_id;
      if (wh && wh !== warehouseId) return false;
    }
    return true;
  });

  // Extract relevant line items for this product
  let unitsSold7d = 0;
  let unitsSoldPrev7d = 0;
  let unitsSold14d = 0;
  let unitsSold30d = 0;
  let unitsSoldPrev30d = 0;
  let unitsSold90d = 0;

  let netSales30d = 0;
  let cogs30d = 0;
  let netSales90d = 0;
  let cogs90d = 0;

  let txCount30d = 0;
  let lastSoldDate = null;

  // Daily units sold map for last 90 days: 'YYYY-MM-DD' => number
  const dailyUnitsMap = new Map();
  // Initialize last 90 days with 0
  for (let i = 89; i >= 0; i--) {
    const d = new Date(tNow - i * dayMs);
    dailyUnitsMap.set(toDateStr(d), 0);
  }

  const allRecords = [
    ...relevantSales.map(s => ({ ...s, is_order: false })),
    ...relevantOrders.map(o => ({ ...o, is_order: true }))
  ];

  for (const record of allRecords) {
    const dt = new Date(record.created_at || record.createdAt || record.date || 0);
    const t = dt.getTime();
    if (t > tNow) continue; // Future protection

    for (const item of (record.items || [])) {
      const pId = item.item_id || item.itemId || item.productId || item.product_id || item.id;
      if (pId !== prod.id) continue;

      const qty = Math.max(0, Number(item.quantity ?? item.qty ?? 1));
      const lineTotal = Number(item.line_total ?? (qty * Number(item.unit_price ?? prod.price ?? 0)) ?? 0);
      const unitCost = Number(item.cost_price ?? item.cost ?? prod.cost_price ?? prod.cost ?? prod.purchase_price ?? 0);
      const lineCost = qty * unitCost;

      // Track last sold date
      if (!lastSoldDate || dt > lastSoldDate) {
        lastSoldDate = dt;
      }

      // 7d vs Prev 7d
      if (t >= t7d && t <= tNow) {
        unitsSold7d += qty;
      } else if (t >= tPrev7dStart && t < t7d) {
        unitsSoldPrev7d += qty;
      }

      // 14d
      if (t >= t14d && t <= tNow) {
        unitsSold14d += qty;
      }

      // 30d vs Prev 30d
      if (t >= t30d && t <= tNow) {
        unitsSold30d += qty;
        netSales30d += lineTotal;
        cogs30d += lineCost;
        txCount30d++;
      } else if (t >= tPrev30dStart && t < t30d) {
        unitsSoldPrev30d += qty;
      }

      // 90d
      if (t >= t90d && t <= tNow) {
        unitsSold90d += qty;
        netSales90d += lineTotal;
        cogs90d += lineCost;
      }

      // Fill daily map
      const dateKey = toDateStr(dt);
      if (dailyUnitsMap.has(dateKey)) {
        dailyUnitsMap.set(dateKey, dailyUnitsMap.get(dateKey) + qty);
      }
    }
  }

  // 5. Purchase receipts history
  const receipts = state?.data?.receipts || [];
  let lastReceiptDate = null;
  let lastPurchaseCost = null;
  let receivedUnits30d = 0;
  let receivedUnits90d = 0;

  for (const rc of receipts) {
    if (rc.status === 'CANCELLED' || rc.status === 'cancelled') continue;
    const rDate = new Date(rc.created_at || rc.createdAt || rc.date || 0);
    const rt = rDate.getTime();
    if (rt > tNow) continue;

    for (const item of (rc.items || [])) {
      const pId = item.productId || item.product_id || item.itemId || item.id;
      if (pId !== prod.id) continue;

      const qty = Math.max(0, Number(item.qty ?? item.quantity ?? 1));
      const cost = Number(item.unitCost ?? item.cost_price ?? item.cost ?? 0);

      if (!lastReceiptDate || rDate > lastReceiptDate) {
        lastReceiptDate = rDate;
        if (cost > 0) lastPurchaseCost = cost;
      }

      if (rt >= t30d && rt <= tNow) {
        receivedUnits30d += qty;
      }
      if (rt >= t90d && rt <= tNow) {
        receivedUnits90d += qty;
      }
    }
  }

  // 6. Refunds / Returns
  const refunds = state?.data?.refunds || [];
  let refundUnits30d = 0;
  let refundAmount30d = 0;
  for (const ref of refunds) {
    const refDate = new Date(ref.created_at || ref.createdAt || 0);
    if (refDate.getTime() >= t30d && refDate.getTime() <= tNow) {
      if (ref.productId === prod.id || ref.itemId === prod.id) {
        refundUnits30d += Number(ref.quantity || ref.qty || 1);
        refundAmount30d += Number(ref.amount || 0);
      }
    }
  }

  // 7. Missing fields check & data quality
  const missing_fields = [];
  const knownCost = Number(prod.cost_price ?? prod.cost ?? prod.purchase_price ?? lastPurchaseCost ?? 0);
  if (knownCost <= 0) {
    missing_fields.push('cost_price');
  }
  // Lead time is not stored in core schema
  missing_fields.push('lead_time');
  if (prod.moq === undefined) missing_fields.push('moq');
  if (prod.pack_size === undefined) missing_fields.push('pack_size');

  let data_quality = 'HIGH';
  if (missing_fields.includes('cost_price') || (unitsSold30d === 0 && invTotal.onHand === 0)) {
    data_quality = 'LOW';
  } else if (missing_fields.length > 0 || unitsSold30d < 3) {
    data_quality = 'MEDIUM';
  }

  const grossProfit30d = netSales30d - cogs30d - refundAmount30d;
  const grossMarginPct30d = netSales30d > 0 ? Math.round((grossProfit30d / netSales30d) * 1000) / 10 : null;

  return {
    source_version: 'qbiz_merchandising_v1',
    generated_at: now.toISOString(),
    product: {
      id: prod.id,
      name: prod.name,
      sku: prod.sku || '',
      barcode: prod.barcode || '',
      category: prod.category || prod.categoryId || 'Hàng hóa',
      categoryId: prod.categoryId || prod.category || '',
      price: Number(prod.price || 0),
      cost_price: knownCost,
      unit: prod.unit || 'cái',
      lowStock: Number(prod.lowStock || 0),
      trackInventory: prod.trackInventory !== false && prod.type !== 'SERVICE',
      type: prod.type || 'GOODS',
      active: prod.active !== false,
      image: prod.image || '',
    },
    inventory: {
      warehouseId: targetWarehouse?.id || (warehouseId === 'all' ? 'all' : null),
      warehouseName: targetWarehouse?.name || (warehouseId === 'all' ? 'Toàn bộ cửa hàng' : null),
      scope: targetWarehouse ? 'WAREHOUSE' : (warehouseId === 'all' ? 'SHOP_WIDE' : 'SHOP_WIDE'),
      onHand: invTotal.onHand || 0,
      reserved: invTotal.reserved || 0,
      available: invTotal.available || 0,
      damaged: invTotal.damaged || 0,
      incomingTransit,
      inventoryValue: (invTotal.onHand || 0) * (knownCost || Number(prod.price || 0)),
    },
    sales: {
      unitsSold7d,
      unitsSoldPrev7d,
      unitsSold14d,
      unitsSold30d,
      unitsSoldPrev30d,
      unitsSold90d,
      netSales30d,
      cogs30d,
      grossProfit30d,
      grossMarginPct30d,
      netSales90d,
      cogs90d,
      txCount30d,
      refundUnits30d,
      refundAmount30d,
      lastSoldDate: lastSoldDate ? lastSoldDate.toISOString() : null,
      dailyUnits: Array.from(dailyUnitsMap.entries()).map(([date, qty]) => ({ date, qty })),
    },
    purchases: {
      lastReceiptDate: lastReceiptDate ? lastReceiptDate.toISOString() : null,
      lastPurchaseCost,
      receivedUnits30d,
      receivedUnits90d,
    },
    data_quality,
    missing_fields,
  };
}

/**
 * Builds decision snapshots for all active inventory-tracked products.
 *
 * @param {object} state - Global application state
 * @param {object} options - Optional filters
 * @returns {Array<object>} Array of snapshots
 */
export function buildAllProductDecisionSnapshots(state, options = {}) {
  const products = state?.data?.products || [];
  const tracked = products.filter(p => p.active !== false && p.type !== 'SERVICE' && p.trackInventory !== false);
  return tracked
    .map(p => buildProductDecisionSnapshot(p.id, state, options))
    .filter(Boolean);
}
