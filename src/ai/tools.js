/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — TOOL LAYER
 * Strict rule: Tools MUST NOT access IndexedDB directly.
 * All tools wrap existing business engine read functions and produce Structured Proposals.
 */

import { totalFor, levelFor, available, calculateSalesMetrics, getCustomerDebtSummary, getCustomerAgingReport, getCustomerProfileHistory } from '../engine.js';
import { createProposal } from './proposals.js';
import { isToolAllowed, hasCapability, PERMISSIONS, OPERATIONAL_THRESHOLDS } from './policy.js';
import { getCurrentActor } from './context.js';
import { MERCHANDISING_TOOLS } from './merchandising/tools.js';
import { reportToolError, reportToolSelectedNotExecuted } from './error-reporter.js';
import { parseVietnameseCurrency, parseVietnameseDiscount } from './vietnamese-nlp.js';

/**
 * Normalizes a Vietnamese string for case and diacritic-insensitive matching.
 */
function norm(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Resolves a product from state products given a line descriptor (ID, name, partial text)
 */
function findProduct(products = [], line = {}) {
  if (!line) return null;
  const pId = line.productId || line.itemId || line.id;
  if (pId) {
    const byId = products.find(x => x.id === pId);
    if (byId) return byId;
  }
  const nameQuery = String(line.productName || line.name || line.description || line.item_name || line.item || line.product || '').trim();
  if (!nameQuery) return null;
  const directMatch = products.find(x => x.name.toLowerCase() === nameQuery.toLowerCase());
  if (directMatch) return directMatch;
  const normQ = norm(nameQuery);
  const normMatch = products.find(x => norm(x.name) === normQ);
  if (normMatch) return normMatch;
  const subMatch = products.find(x => {
    const xNorm = norm(x.name);
    return xNorm.includes(normQ) || normQ.includes(xNorm);
  });
  if (subMatch) return subMatch;
  const codeMatch = products.find(x => {
    const code = norm(x.sku || '');
    return (code && normQ.includes(code)) || (x.id && normQ.includes(norm(x.id.replace(/^p_/, ''))));
  });
  if (codeMatch) return codeMatch;

  // Token subset match (e.g. "Ghế 90D" in "Ghế sáng chế 90D", "Gối F6" in "Gối cổ sáng chế F6")
  const qTokens = normQ.split(/\s+/).filter(Boolean);
  if (qTokens.length >= 2 || qTokens.some(t => /\d/.test(t) || t.length >= 3)) {
    const tokenMatch = products.find(x => {
      const xTokens = norm(x.name).split(/\s+/).filter(Boolean);
      const skuTokens = norm(x.sku || '').split(/[-_\s]+/).filter(Boolean);
      const allX = [...xTokens, ...skuTokens];
      return qTokens.every(qt => allX.includes(qt) || allX.some(xt => xt.endsWith(qt) || xt.includes(qt)));
    });
    if (tokenMatch) return tokenMatch;
  }

  return null;
}

/**
 * Section 4: Canonical Deterministic Time-Range Resolver
 * Supports relative periods in Vietnamese business operations.
 */
export function resolveDateInterval(period = 'today', now = new Date(), customStart = null, customEnd = null) {
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let label = 'hôm nay';
  const pNorm = norm(period || 'today');

  if (pNorm === 'today' || pNorm === 'hom nay' || pNorm === 'nay' || pNorm === 'ngay hom nay') {
    start.setHours(0, 0, 0, 0);
    label = 'hôm nay';
  } else if (pNorm === 'yesterday' || pNorm === 'hom qua') {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    label = 'hôm qua';
  } else if (
    pNorm === '2_days' || pNorm === '2d' ||
    pNorm.includes('hai ngay nay') || pNorm.includes('2 ngay nay') ||
    pNorm.includes('hai ngay qua') || pNorm.includes('2 ngay qua') ||
    pNorm.includes('tu hom qua den gio') || pNorm.includes('tu hom qua den nay') ||
    pNorm.includes('hom qua den nay') || pNorm.includes('hom qua den gio') ||
    pNorm.includes('may ngay nay')
  ) {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    label = 'hai ngày nay';
  } else if (
    pNorm === '3_days' || pNorm === '3d' ||
    pNorm.includes('3 ngay nay') || pNorm.includes('3 ngay gan day') ||
    pNorm.includes('ba ngay nay') || pNorm.includes('3 ngay qua')
  ) {
    start.setDate(now.getDate() - 2);
    start.setHours(0, 0, 0, 0);
    label = '3 ngày gần đây';
  } else if (
    pNorm === 'this_week' || pNorm === 'week' || pNorm.includes('tuan nay') || pNorm.includes('trong tuan')
  ) {
    // Calendar week: from Monday 00:00:00 to now
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : (day - 1);
    start.setDate(now.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);
    label = 'tuần này';
  } else if (
    pNorm === '7d' || pNorm.includes('7 ngay qua') || pNorm.includes('7 ngay gan day') || pNorm.includes('7 ngay')
  ) {
    // Rolling 7 days
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    label = '7 ngày qua';
  } else if (pNorm === 'last_week' || pNorm.includes('tuan truoc')) {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : (day - 1);
    start.setDate(now.getDate() - diffToMonday - 7);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - diffToMonday - 1);
    end.setHours(23, 59, 59, 999);
    label = 'tuần trước';
  } else if (pNorm === '30d' || pNorm.includes('30 ngay qua') || pNorm.includes('30 ngay gan day') || pNorm.includes('30 ngay')) {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    label = '30 ngày qua';
  } else if (
    pNorm === 'month' || pNorm.includes('thang nay') ||
    pNorm.includes('tu dau thang den nay') || pNorm.includes('tu dau thang toi gio') ||
    pNorm.includes('dau thang den nay') || pNorm.includes('thang hien tai')
  ) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    label = pNorm.includes('tu dau thang') ? 'từ đầu tháng đến nay' : 'tháng này';
  } else if (pNorm === 'last_month' || pNorm.includes('thang truoc')) {
    start.setMonth(now.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
    label = 'tháng trước';
  } else if (pNorm === 'custom' || customStart) {
    if (customStart) start.setTime(new Date(`${customStart}T00:00:00`).getTime());
    else start.setFullYear(2000);
    if (customEnd) end.setTime(new Date(`${customEnd}T23:59:59.999`).getTime());
    label = `từ ${start.toLocaleDateString('vi-VN')} đến ${end.toLocaleDateString('vi-VN')}`;
  } else {
    start.setHours(0, 0, 0, 0);
    label = 'hôm nay';
  }

  return { start, end, label, periodKey: pNorm };
}

/**
 * Enhanced Canonical Temporal Range Resolver
 * Determines calendar boundaries and whether an explicit time keyword was detected.
 */
export function resolveTemporalRange(input, now = new Date()) {
  const pNorm = norm(String(input || ''));
  let code = 'this_week';
  let isExplicit = false;

  if (
    pNorm.includes('hai ngay nay') || pNorm.includes('2 ngay nay') ||
    pNorm.includes('hai ngay qua') || pNorm.includes('2 ngay qua') ||
    pNorm.includes('2 ngay') || pNorm.includes('2d') ||
    pNorm.includes('tu hom qua den gio') || pNorm.includes('tu hom qua den nay') ||
    pNorm.includes('hom qua den nay') || pNorm.includes('hom qua den gio') ||
    pNorm.includes('may ngay nay')
  ) {
    code = '2_days';
    isExplicit = true;
  } else if (
    pNorm.includes('ba ngay') || pNorm.includes('3 ngay') || pNorm.includes('3d')
  ) {
    code = '3_days';
    isExplicit = true;
  } else if (pNorm.includes('7 ngay') || pNorm === '7d') {
    code = '7d';
    isExplicit = true;
  } else if (pNorm.includes('30 ngay') || pNorm === '30d') {
    code = '30d';
    isExplicit = true;
  } else if (pNorm.includes('tuan truoc') || pNorm === 'last_week' || pNorm.includes('tuan qua')) {
    code = 'last_week';
    isExplicit = true;
  } else if (pNorm.includes('tuan nay') || pNorm.includes('trong tuan') || pNorm === 'this_week' || pNorm === 'week') {
    code = 'this_week';
    isExplicit = true;
  } else if (pNorm.includes('thang truoc') || pNorm === 'last_month') {
    code = 'last_month';
    isExplicit = true;
  } else if (
    pNorm.includes('thang nay') || pNorm.includes('dau thang') ||
    pNorm === 'month' || pNorm === 'this_month' || pNorm.includes('thang hien tai') ||
    pNorm.includes('tu dau thang')
  ) {
    code = 'month';
    isExplicit = true;
  } else if (pNorm.includes('hom qua') || pNorm === 'yesterday') {
    code = 'yesterday';
    isExplicit = true;
  } else if (
    pNorm.includes('hom nay') || pNorm === 'today' ||
    pNorm.includes('ngay nay') || pNorm.includes('trong ngay') || pNorm.includes('ngay hom nay')
  ) {
    code = 'today';
    isExplicit = true;
  }

  const interval = resolveDateInterval(code, now);
  return {
    code,
    start: interval.start,
    end: interval.end,
    label: interval.label,
    isExplicit,
  };
}

/**
 * Section 4B: Canonical Product Performance Ranking Tool
 * Analyzes and ranks product performance across a specified temporal window:
 * - Best / top selling products (highest quantity or revenue)
 * - Slowest / bottom / unsold products (lowest sales or 0 sales with on-hand inventory)
 * Never falls back to generic daily overview or sales totals.
 */
export function getProductPerformanceRanking(params = {}, state = {}, context = {}) {
  const now = new Date();
  const rawQuery = params.query || context?.rawPrompt || context?.user_prompt || '';
  const temporal = resolveTemporalRange(params.period || rawQuery, now);
  const start = params.startDate ? new Date(params.startDate) : temporal.start;
  const end = params.endDate ? new Date(params.endDate) : temporal.end;
  const label = temporal.label;
  const limit = Math.max(1, Math.min(20, Number(params.limit || 5)));
  const sortBy = params.sortBy || 'auto';

  const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const isSameDay = start.toDateString() === end.toDateString();
  const dateRangeStr = isSameDay ? fmtDate(start) : `${fmtDate(start)} - ${fmtDate(end)}`;

  const effectiveShopId = context?.shop_id || null;
  const rawProds = (state?.data?.products || []).filter(p => p.active !== false);
  const prods = (effectiveShopId && effectiveShopId !== 'shop_default')
    ? rawProds.filter(p => !p.shop_id || p.shop_id === effectiveShopId)
    : rawProds;
  const validProdMap = new Map(prods.map(p => [p.id, p]));

  const getProductStock = (pId) => {
    try {
      const tot = totalFor(state?.data, pId);
      if (tot && tot.available !== undefined) return tot.available;
      if (tot && tot.onHand !== undefined) return tot.onHand;
    } catch (_) {}
    const p = validProdMap.get(pId);
    return Number(p?.onHand ?? p?.stock ?? 0);
  };

  // Completed / paid sales within [start, end]
  const allSales = state?.data?.sales || [];
  const completedSales = allSales.filter(s => {
    const d = new Date(s.created_at || s.createdAt || 0);
    if (!['COMPLETED', 'PAID'].includes(String(s.status || '').toUpperCase())) return false;
    if (d < start || d > end) return false;
    if (effectiveShopId && effectiveShopId !== 'shop_default' && s.shop_id && s.shop_id !== effectiveShopId) return false;
    return true;
  });

  // Aggregate items sold
  const soldStats = new Map();
  completedSales.forEach(s => {
    (s.items || []).forEach(it => {
      const pId = it.productId || it.item_id || it.itemId || it.id;
      const prod = validProdMap.get(pId);
      if (!prod) return;

      const qty = Number(it.quantity || it.qty || 1);
      const rev = Number(it.line_total || it.total || (it.unit_price || it.price || prod.price || 0) * qty);

      if (!soldStats.has(pId)) {
        soldStats.set(pId, {
          id: pId,
          name: prod.name,
          sku: prod.sku || '',
          unit: prod.unit || 'sản phẩm',
          qty: 0,
          revenue: 0,
          onHand: getProductStock(pId),
          isService: Boolean(prod.type === 'SERVICE' || prod.is_service),
        });
      }
      const item = soldStats.get(pId);
      item.qty += qty;
      item.revenue += rev;
    });
  });

  const qNorm = norm(rawQuery);
  const mentionsNegative = (
    qNorm.includes('khong tot') || qNorm.includes('kem') || /\b[eế]\b/i.test(qNorm) ||
    qNorm.includes('ban e') || qNorm.includes('hang e') || qNorm.includes('e am') || qNorm.includes('e khong') || qNorm.includes('co e') ||
    qNorm.includes('it') || qNorm.includes('cham') || qNorm.includes('khong ban duoc') ||
    qNorm.includes('chua ban duoc') || qNorm.includes('chua ban')
  );
  const mentionsPositive = (
    qNorm.includes('tot') || qNorm.includes('chay') || qNorm.includes('noi bat') ||
    qNorm.includes('nhieu') || qNorm.includes('top') || qNorm.includes('duoc gia')
  );

  const asksOnlyTop = mentionsPositive && !mentionsNegative;
  const asksOnlyBottom = mentionsNegative && !mentionsPositive;
  const isRevenueSort = sortBy === 'revenue' || (sortBy === 'auto' && (qNorm.includes('doanh thu') || qNorm.includes('doanh so') || qNorm.includes('tien')));

  const fmtCurrency = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';

  // Products with sales
  let soldList = Array.from(soldStats.values());
  if (isRevenueSort) {
    soldList.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
  } else {
    soldList.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  }

  // Active products with 0 sales in this period
  const unsoldList = prods
    .filter(p => !soldStats.has(p.id))
    .map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku || '',
      unit: p.unit || 'sản phẩm',
      qty: 0,
      revenue: 0,
      onHand: getProductStock(p.id),
      isService: Boolean(p.type === 'SERVICE' || p.is_service),
    }))
    .sort((a, b) => b.onHand - a.onHand);

  // If NO sales at all in period
  if (completedSales.length === 0 || soldList.length === 0) {
    let zeroText = `📊 **Hiệu suất mặt hàng ${label} (${dateRangeStr}):**\n\n`;
    zeroText += `Trong **${label}** (${dateRangeStr}), cửa hàng chưa phát sinh đơn bán hàng nào hoàn tất (0 ₫ doanh thu).\n\n`;
    if (unsoldList.length > 0) {
      zeroText += `📦 **Danh sách mặt hàng chưa phát sinh lượt bán (tồn kho hiện tại):**\n`;
      const displayUnsold = unsoldList.slice(0, limit);
      displayUnsold.forEach((p, idx) => {
        zeroText += `${idx + 1}. **${p.name}**\n   - Tồn kho: **${p.onHand} ${p.unit}** (Đã bán: **0 ${p.unit}**)\n`;
      });
      if (unsoldList.length > limit) {
        zeroText += `*(và ${unsoldList.length - limit} mặt hàng khác chưa bán được)*`;
      }
    } else {
      zeroText += `Hiện chưa có dữ liệu sản phẩm trong cửa hàng.`;
    }

    return {
      text: zeroText.trim(),
      period: temporal.code,
      periodLabel: label,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      dateRangeStr,
      totalSalesCount: 0,
      totalRevenue: 0,
      topPerformers: [],
      bottomPerformers: unsoldList.slice(0, limit),
      unsoldProducts: unsoldList,
      hasSales: false,
    };
  }

  // When sales exist
  const topSlice = soldList.slice(0, limit);
  // Bottom performers: products with 0 sales or lowest sales
  const bottomSlice = unsoldList.length > 0 ? unsoldList.slice(0, limit) : soldList.slice(-Math.min(limit, soldList.length)).reverse();

  let textResult = `📊 **Hiệu suất mặt hàng ${label} (${dateRangeStr}):**\n\n`;

  if (!asksOnlyBottom) {
    textResult += `✅ **Mặt hàng bán chạy / tốt nhất:**\n`;
    topSlice.forEach((p, idx) => {
      textResult += `${idx + 1}. **${p.name}**\n   - Đã bán: **${p.qty} ${p.unit}** · Doanh thu: **${fmtCurrency(p.revenue)}**\n`;
    });
  }

  if (!asksOnlyTop) {
    if (!asksOnlyBottom) textResult += `\n`;
    textResult += `⚠️ **Mặt hàng bán chậm / chưa bán được:**\n`;
    bottomSlice.forEach((p, idx) => {
      if (p.qty === 0) {
        textResult += `${idx + 1}. **${p.name}**\n   - Đã bán: **0 ${p.unit}** · Tồn kho: **${p.onHand} ${p.unit}**\n`;
      } else {
        textResult += `${idx + 1}. **${p.name}**\n   - Đã bán: **${p.qty} ${p.unit}** · Doanh thu: **${fmtCurrency(p.revenue)}**\n`;
      }
    });
  }

  return {
    text: textResult.trim(),
    period: temporal.code,
    periodLabel: label,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    dateRangeStr,
    totalSalesCount: completedSales.length,
    totalRevenue: soldList.reduce((acc, it) => acc + it.revenue, 0),
    topPerformers: topSlice,
    bottomPerformers: bottomSlice,
    unsoldProducts: unsoldList,
    hasSales: true,
  };
}

export const TOOLS = {
  getProductPerformanceRanking(params, state, envelope) {
    return getProductPerformanceRanking(params, state, envelope);
  },
  get_product_performance_ranking(params, state, envelope) {
    return getProductPerformanceRanking(params, state, envelope);
  },
  ...MERCHANDISING_TOOLS,

  /**
   * Search products by text query (name, SKU, barcode).
   * If query is ambiguous (multiple matches), returns array of candidate items.
   */
  search_products({ query }, state) {
    const q = norm(query);
    const products = state?.data?.products || [];
    if (!q) {
      return {
        count: 0,
        candidates: [],
        text: '🔍 Vui lòng nhập tên, mã SKU hoặc mã vạch sản phẩm để tìm kiếm.'
      };
    }

    let matches = products.filter(p => {
      if (p.active === false) return false;
      return (
        norm(p.name).includes(q) ||
        norm(p.sku).includes(q) ||
        norm(p.barcode).includes(q)
      );
    });

    // Tokenized fallback for complex model queries (e.g. "f4/09", "f1-01")
    if (matches.length === 0) {
      const tokens = (String(query || '').match(/[A-Za-z0-9]+/g) || [])
        .map(t => t.toLowerCase())
        .filter(t => t.length >= 2 && !['goi', 'ghe', 'sp', 'ma', 'cua', 'la', 'gi'].includes(t));
      if (tokens.length > 0) {
        matches = products.filter(p => {
          if (p.active === false) return false;
          const pN = norm(p.name);
          const pS = norm(p.sku);
          const pB = norm(p.barcode);
          return tokens.some(tok => pN.includes(tok) || pS.includes(tok) || pB.includes(tok));
        });
      }
    }

    const candidates = matches.map(p => {
      const tot = totalFor(state.data, p.id);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        barcode: p.barcode || '',
        price: p.price || 0,
        available: tot.available,
        onHand: tot.onHand,
        unit: p.unit || 'cái',
      };
    });

    const fmt = new Intl.NumberFormat('vi-VN');
    let text = '';
    if (candidates.length === 1) {
      const c = candidates[0];
      text = `🔍 **Thông tin sản phẩm "${c.name}":**\n` +
             `• Mã SKU: \`${c.sku || 'N/A'}\` | Mã vạch: \`${c.barcode || 'N/A'}\`\n` +
             `• Giá bán: **${fmt.format(c.price)} ₫** / ${c.unit}\n` +
             `• Tồn kho khả dụng: **${c.available} ${c.unit}** (Thực tồn: ${c.onHand})`;
    } else if (candidates.length > 1) {
      const lines = candidates.slice(0, 5).map(c => 
        `• **${c.name}** (SKU: \`${c.sku || 'N/A'}\` | Mã vạch: \`${c.barcode || 'N/A'}\` | Giá: **${fmt.format(c.price)} ₫** | Tồn: **${c.available}**)`
      ).join('\n');
      text = `🔍 **Tìm thấy ${candidates.length} sản phẩm phù hợp với "${query}":**\n\n${lines}`;
    } else {
      text = `🔍 Không tìm thấy sản phẩm nào khớp với từ khóa "${query}". Bạn có thể kiểm tra lại tên gọi hoặc mã SKU/Barcode.`;
    }

    return {
      count: candidates.length,
      candidates,
      isAmbiguous: candidates.length > 1,
      text,
    };
  },

  /**
   * Get detailed product information including stock breakdown by warehouse.
   */
  get_product({ productId }, state) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    if (!p) return { found: false, error: `Không tìm thấy sản phẩm ${productId}` };

    const totals = totalFor(state.data, p.id);
    const warehouses = (state.data.warehouses || []).map(w => {
      const lv = levelFor(state.data, p.id, w.id);
      return {
        warehouseId: w.id,
        warehouseName: w.name,
        onHand: lv ? lv.onHand : 0,
        reserved: lv ? lv.reserved : 0,
        available: lv ? available(lv) : 0,
      };
    });

    return {
      found: true,
      product: {
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        barcode: p.barcode || '',
        price: p.price || 0,
        cost: p.cost || 0,
        unit: p.unit || 'cái',
        lowStock: Number(p.lowStock || 0),
        type: p.type || 'PRODUCT',
        trackInventory: p.trackInventory !== false,
      },
      stockTotals: totals,
      warehouses,
    };
  },

  /**
   * Get stock level for a product in a specific warehouse or across all warehouses.
   */
  get_stock({ productId, warehouseId }, state) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    if (!p) return { found: false, error: 'Sản phẩm không tồn tại' };

    if (warehouseId && warehouseId !== 'all') {
      const w = (state.data.warehouses || []).find(x => x.id === warehouseId);
      const lv = levelFor(state.data, p.id, warehouseId);
      return {
        found: true,
        productId: p.id,
        productName: p.name,
        warehouseId,
        warehouseName: w?.name || warehouseId,
        onHand: lv ? lv.onHand : 0,
        reserved: lv ? lv.reserved : 0,
        available: lv ? available(lv) : 0,
      };
    }

    const totals = totalFor(state.data, p.id);
    return {
      found: true,
      productId: p.id,
      productName: p.name,
      warehouseId: 'all',
      warehouseName: 'Tất cả kho',
      onHand: totals.onHand,
      reserved: totals.reserved,
      available: totals.available,
    };
  },

  /**
   * Search warehouses by name or ID.
   */
  search_warehouses({ query }, state) {
    const q = norm(query);
    const warehouses = state?.data?.warehouses || [];
    if (!q) {
      return { count: warehouses.length, candidates: warehouses };
    }
    const matches = warehouses.filter(w => norm(w.name).includes(q) || norm(w.id).includes(q));
    return { count: matches.length, candidates: matches };
  },

  /**
   * Get total available stock across all warehouses for a product.
   */
  get_available_stock({ productId }, state, context) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    if (!p) return { found: false, available: 0, status: 'Hết hàng' };
    const whId = context?.warehouse_id || (state?.warehouse && state.warehouse !== 'all' ? state.warehouse : null);
    let avail = 0;
    let onHand = 0;
    if (whId) {
      const lv = levelFor(state.data, p.id, whId);
      avail = lv ? available(lv) : 0;
      onHand = lv ? lv.onHand : 0;
    } else {
      const tot = totalFor(state.data, p.id);
      avail = tot.available;
      onHand = tot.onHand;
    }
    const status = p.type === 'SERVICE' ? 'Dịch vụ' : (avail <= 0 ? 'Hết hàng' : (avail <= (p.lowStock || 0) ? 'Sắp hết' : 'Còn hàng'));
    return { found: true, productId: p.id, productName: p.name, available: avail, onHand, status, lowStock: p.lowStock || 0 };
  },

  /**
   * Find products whose available stock is less than or equal to their lowStock threshold.
   */
  find_low_stock(params, state) {
    const products = state?.data?.products || [];
    const lowStockItems = [];
    const seenNames = new Set();

    for (const p of products) {
      if (p.type === 'SERVICE' || p.trackInventory === false) continue;
      const normName = String(p.name || '').trim().toLowerCase();
      if (normName && seenNames.has(normName)) continue;
      const tot = totalFor(state.data, p.id);
      const threshold = Number(p.lowStock || 0);
      if (tot.available <= threshold) {
        if (normName) seenNames.add(normName);
        lowStockItems.push({
          id: p.id,
          name: p.name,
          sku: p.sku || '',
          available: tot.available,
          onHand: tot.onHand,
          lowStock: threshold,
          unit: p.unit || 'cái',
          deficit: Math.max(1, threshold * 2 - tot.available),
        });
      }
    }

    return {
      count: lowStockItems.length,
      items: lowStockItems,
    };
  },

  /**
   * Summarize sales for today, month, 2_days, 3_days, week, etc.
   */
  get_sales_summary({ period = 'today', customStart = null, customEnd = null, shopId = null }, state, context) {
    const { start, end, label } = resolveDateInterval(period, new Date(), customStart, customEnd);
    const effectiveShopId = shopId || context?.shop_id || null;
    let rawSales = state?.data?.sales || [];
    let rawOrders = state?.data?.orders || [];
    const validProdIds = new Set((state?.data?.products || []).filter(p => p.active !== false).map(p => p.id));
    if (effectiveShopId && effectiveShopId !== 'shop_default') {
      rawSales = rawSales.filter(s => (!s.shop_id || s.shop_id === effectiveShopId));
      rawOrders = rawOrders.filter(o => (!o.shop_id || o.shop_id === effectiveShopId));
    }
    const filteredSales = rawSales.filter(s => (s.items || []).some(it => validProdIds.has(it.productId || it.item_id || it.itemId || it.id)));
    const filteredOrders = rawOrders.filter(o => (o.items || []).some(it => validProdIds.has(it.productId || it.item_id || it.itemId || it.id)));

    const metrics = calculateSalesMetrics({
      sales: filteredSales.length > 0 || rawSales.length === 0 ? filteredSales : rawSales,
      orders: filteredOrders.length > 0 || rawOrders.length === 0 ? filteredOrders : rawOrders,
      refunds: state?.data?.refunds || [],
      products: state?.data?.products || [],
      startDate: start,
      endDate: end
    });

    return {
      period,
      periodLabel: label,
      completedCount: metrics.paidCount,
      totalRevenue: metrics.net,
      grossRevenue: metrics.gross,
      refundTotal: metrics.refundTotal,
      unpaidCount: metrics.unpaidCount,
      unpaidTotal: metrics.unpaidTotal,
      paymentMethods: metrics.paymentMethods,
      formattedRevenue: new Intl.NumberFormat('vi-VN').format(metrics.net) + ' ₫',
    };
  },

  /**
   * Search customers by name, phone, or customer_code.
   */
  search_customers({ query }, state) {
    const rawQ = norm(query);
    const cleanQ = rawQ.replace(/^(?:khach hang|khach|anh|chi|em|bac|chu|ong|ba|kh)\s+/i, '').trim();
    const q = cleanQ || rawQ;
    const customers = state?.data?.customers || [];
    if (!q) return { count: 0, customers: [], text: 'Vui lòng cung cấp tên hoặc số điện thoại khách hàng để tra cứu.' };

    const matches = customers.filter(c => {
      if (c.active === false) return false;
      const cName = norm(c.name);
      return (
        cName.includes(q) ||
        cName.includes(rawQ) ||
        norm(c.phone).includes(q) ||
        norm(c.customer_code).includes(q) ||
        norm(c.code).includes(q)
      );
    });

    if (matches.length === 0) {
      return {
        count: 0,
        customers: [],
        text: `Không tìm thấy khách hàng nào khớp với từ khóa "${query}".`
      };
    }

    const fmt = new Intl.NumberFormat('vi-VN');
    const lines = matches.slice(0, 5).map(c => {
      const debtStr = c.debt ? ` | Nợ: **${fmt.format(c.debt)} ₫**` : '';
      const spentStr = c.totalSpent ? ` | Đã mua: **${fmt.format(c.totalSpent)} ₫**` : '';
      return `• **${c.name}** (Mã: \`${c.code || c.customer_code || '—'}\` - SĐT: ${c.phone || '—'}${debtStr}${spentStr})`;
    }).join('\n');

    return {
      count: matches.length,
      customers: matches.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        code: c.customer_code || c.code || '',
        default_discount: c.default_discount || 0,
        debt: c.debt || 0,
        totalSpent: c.totalSpent || 0,
      })),
      text: `👤 **Thông tin hồ sơ khách hàng phù hợp với "${query}":**\n\n${lines}`
    };
  },

  /**
   * Get single customer details.
   */
  get_customer({ customerId }, state) {
    const c = (state?.data?.customers || []).find(x => x.id === customerId);
    if (!c) return { found: false, error: 'Không tìm thấy khách hàng' };
    return { found: true, customer: c };
  },

  /**
   * Get real-time debt summary and credit limit check for a customer.
   */
  async get_customer_debt_summary({ customerId, customerName, query } = {}, state) {
    const q = query || customerId || customerName;
    if (!q) return { found: false, error: 'Cần mã hoặc tên khách hàng để tra cứu công nợ.' };
    const res = await getCustomerDebtSummary(state?.data, q);
    if (!res.found) return { found: false, error: `Không tìm thấy khách hàng "${q}".` };
    return {
      found: true,
      customerId: res.customerId,
      customerName: res.customerName,
      customerCode: res.customerCode,
      customerPhone: res.customerPhone,
      creditLimit: res.creditLimit,
      totalDebt: res.totalDebt,
      availableCredit: res.availableCredit,
      isOverLimit: res.isOverLimit,
      unpaidSalesCount: (res.unpaidSales || []).length,
      unpaidSales: res.unpaidSales || [],
      formattedDebt: new Intl.NumberFormat('vi-VN').format(res.totalDebt) + ' ₫',
      formattedCreditLimit: new Intl.NumberFormat('vi-VN').format(res.creditLimit) + ' ₫',
      formattedAvailableCredit: new Intl.NumberFormat('vi-VN').format(res.availableCredit) + ' ₫'
    };
  },
  getCustomerDebtSummary(params, state) {
    return this.get_customer_debt_summary(params, state);
  },

  /**
   * Get customer aging report (phân tích tuổi nợ khách hàng theo 4 khoảng: 0-30, 31-60, 61-90, >90 ngày).
   */
  async get_customer_aging_report(params = {}, state) {
    const res = await getCustomerAgingReport(state?.data);
    return {
      success: true,
      totalCustomersWithDebt: res.totalCustomersWithDebt,
      totalOutstandingDebt: res.totalOutstandingDebt,
      formattedOutstandingDebt: new Intl.NumberFormat('vi-VN').format(res.totalOutstandingDebt) + ' ₫',
      buckets: res.buckets,
      topDebtors: (res.customers || []).slice(0, 10).map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        totalDebt: c.totalDebt,
        formattedTotalDebt: new Intl.NumberFormat('vi-VN').format(c.totalDebt) + ' ₫',
        creditLimit: c.creditLimit,
        isOverLimit: c.isOverLimit,
        oldestDebtDays: c.oldestDebtDays,
        current: c.buckets?.current || 0,
        overdue30: c.buckets?.overdue30 || 0,
        overdue60: c.buckets?.overdue60 || 0,
        overdue90: c.buckets?.overdue90 || 0
      }))
    };
  },
  getCustomerAgingReport(params, state) {
    return this.get_customer_aging_report(params, state);
  },

  /**
   * Get customer profile and purchase history (LTV, frequency, top products, recent sales).
   */
  async get_customer_profile_history({ customerId, customerName, query } = {}, state) {
    const q = query || customerId || customerName;
    if (!q) return { found: false, error: 'Cần mã hoặc tên khách hàng để xem lịch sử mua hàng.' };
    const res = await getCustomerProfileHistory(state?.data, q);
    if (!res || !res.customer) return { found: false, error: `Không tìm thấy khách hàng "${q}".` };
    const totalSpent = Number(res.customer.totalSpent || 0);
    const totalSales = Number(res.metrics?.totalSalesCount || 0);
    const aov = totalSales > 0 ? Math.round(totalSpent / totalSales) : 0;
    return {
      found: true,
      customer: res.customer,
      metrics: {
        totalOrders: res.metrics?.totalOrdersCount || 0,
        totalSales,
        totalSpent,
        formattedTotalSpent: new Intl.NumberFormat('vi-VN').format(totalSpent) + ' ₫',
        averageOrderValue: aov,
        formattedAOV: new Intl.NumberFormat('vi-VN').format(aov) + ' ₫',
        lastPurchaseDate: res.metrics?.lastPurchaseDate,
        debt: res.customer.totalDebt || 0,
        formattedDebt: new Intl.NumberFormat('vi-VN').format(res.customer.totalDebt || 0) + ' ₫'
      },
      frequentProducts: res.metrics?.topProducts || [],
      recentTransactions: res.recentSales || []
    };
  },
  getCustomerProfileHistory(params, state) {
    return this.get_customer_profile_history(params, state);
  },

  /**
   * Query operating expenses with category breakdown and date filtering.
   */
  async get_operating_expenses({ period = 'month', startDate = null, endDate = null, category = '' } = {}, state) {
    let allExpenses = [];
    if (Array.isArray(state?.data?.operating_expenses)) {
      allExpenses = state.data.operating_expenses;
    } else {
      const settingItem = (state?.data?.settings || []).find(s => s.id === 'operating_expenses');
      if (Array.isArray(settingItem?.value)) {
        allExpenses = settingItem.value;
      }
    }

    const { start, end } = resolveDateInterval(period, new Date(), startDate, endDate);
    const filtered = allExpenses.filter(e => {
      const eDate = new Date(e.created_at || e.createdAt || 0);
      if (eDate < start || eDate > end) return false;
      if (category && norm(e.category) !== norm(category)) return false;
      return true;
    });

    const totalAmount = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
    const byCategory = {};
    const byPaymentMethod = { cash: 0, transfer: 0 };

    for (const e of filtered) {
      const cat = e.category || 'Chi phí khác';
      byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0);
      const method = e.payment_method === 'transfer' ? 'transfer' : 'cash';
      byPaymentMethod[method] += Number(e.amount || 0);
    }

    return {
      success: true,
      period,
      start: start.toISOString(),
      end: end.toISOString(),
      count: filtered.length,
      totalAmount,
      formattedTotal: new Intl.NumberFormat('vi-VN').format(totalAmount) + ' ₫',
      byCategory,
      byPaymentMethod,
      expenses: filtered.map(e => ({
        id: e.id,
        category: e.category,
        amount: Number(e.amount || 0),
        formattedAmount: new Intl.NumberFormat('vi-VN').format(Number(e.amount || 0)) + ' ₫',
        paymentMethod: e.payment_method || 'cash',
        note: e.note || '',
        payee: e.payee || '',
        createdAt: e.created_at || e.createdAt
      }))
    };
  },
  getOperatingExpenses(params, state) {
    return this.get_operating_expenses(params, state);
  },

  /**
   * Search orders by code or customer label.
   */
  search_orders({ query }, state) {
    const q = norm(query);
    const orders = state?.data?.orders || [];
    if (!q) return { count: 0, orders: [] };

    const matches = orders.filter(o => {
      return (
        norm(o.code).includes(q) ||
        norm(o.customer_label).includes(q)
      );
    });

    return {
      count: matches.length,
      orders: matches.map(o => ({
        id: o.id,
        code: o.code,
        customer: o.customer_label || 'Khách lẻ',
        status: o.status,
        paymentStatus: o.payment_status,
        total: Number(o.grand_total || 0),
        itemsCount: (o.items || []).length,
      })),
    };
  },

  /**
   * Get single order details.
   */
  get_order({ orderId }, state) {
    const o = (state?.data?.orders || []).find(x => x.id === orderId);
    if (!o) return { found: false, error: 'Không tìm thấy đơn hàng' };
    return { found: true, order: o };
  },

  /**
   * Get the most recent sales transaction (or order if no sales).
   */
  get_latest_transaction(params = {}, state) {
    const sales = (state?.data?.sales || []).slice().sort((a, b) =>
      String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || ''))
    );
    if (sales.length > 0) {
      return { found: true, type: 'sale', transaction: sales[0], totalSales: sales.length };
    }
    const orders = (state?.data?.orders || []).slice().sort((a, b) =>
      String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || ''))
    );
    if (orders.length > 0) {
      return { found: true, type: 'order', transaction: orders[0], totalOrders: orders.length };
    }
    return { found: false, error: 'Chưa có hóa đơn hoặc giao dịch bán hàng nào trên thiết bị.' };
  },

  /**
   * Search transactions in sales or orders by query.
   */
  search_transactions({ query = '' } = {}, state) {
    const q = norm(query);
    if (!q) return { count: 0, transactions: [] };
    const sales = state?.data?.sales || [];
    const matches = sales.filter(s => {
      const code = norm(s.code || s.sale_uuid || '');
      const cust = norm(s.customer_label || '');
      const method = norm(s.payment_method || '');
      const items = (s.items || []).map(i => norm(i.name || i.item_name || '')).join(' ');
      return code.includes(q) || cust.includes(q) || method.includes(q) || items.includes(q);
    });
    return {
      count: matches.length,
      transactions: matches.map(s => ({
        id: s.id,
        code: s.code || s.sale_uuid || 'Phiếu bán',
        customer: s.customer_label || 'Khách lẻ',
        total: Number(s.grand_total ?? s.total ?? 0),
        createdAt: s.created_at || s.createdAt,
        itemsCount: (s.items || []).length,
        paymentStatus: s.payment_status || (s.payments?.[0]?.status) || 'PAID',
      })),
    };
  },

  /**
   * Get single transaction details by ID or code.
   */
  get_transaction({ transactionId, code } = {}, state) {
    const sales = state?.data?.sales || [];
    const s = sales.find(x => x.id === transactionId || (code && (x.code === code || x.sale_uuid === code)));
    if (s) return { found: true, type: 'sale', transaction: s };
    const orders = state?.data?.orders || [];
    const o = orders.find(x => x.id === transactionId || (code && x.code === code));
    if (o) return { found: true, type: 'order', transaction: o };
    return { found: false, error: 'Không tìm thấy hóa đơn hoặc giao dịch.' };
  },

  /**
   * Diagnose why an order is not finished.
   * Analyzes payment status, order workflow stage, and warehouse stock availability for line items.
   */
  diagnose_order({ orderId }, state) {
    const o = (state?.data?.orders || []).find(x => x.id === orderId);
    if (!o) return { found: false, error: 'Không tìm thấy đơn hàng để chẩn đoán.' };

    const issues = [];
    const recommendations = [];

    // Check status
    if (o.status === 'COMPLETED') {
      return {
        found: true,
        orderId: o.id,
        code: o.code,
        status: 'COMPLETED',
        isComplete: true,
        message: 'Đơn hàng này đã hoàn tất thành công.',
        issues: [],
        recommendations: [],
      };
    }

    if (o.status === 'CANCELLED') {
      return {
        found: true,
        orderId: o.id,
        code: o.code,
        status: 'CANCELLED',
        isComplete: false,
        message: 'Đơn hàng này đã bị hủy.',
        issues: ['Đơn hàng ở trạng thái CANCELLED'],
        recommendations: ['Tạo đơn mới nếu khách muốn mua lại.'],
      };
    }

    // Check payment
    const isPaid = o.payment_status === 'PAID';
    if (!isPaid) {
      issues.push('Đơn hàng chưa thu tiền (UNPAID).');
      recommendations.push('Xác nhận thanh toán hoặc thu tiền khi giao hàng.');
    }

    // Check line items stock
    const stockShortages = [];
    const whId = o.warehouse_id || (state.data.warehouses || [])[0]?.id;
    for (const line of o.items || []) {
      const pid = line.item_id || line.productId || line.id;
      const p = (state.data.products || []).find(x => x.id === pid);
      if (p && p.type !== 'SERVICE' && p.trackInventory !== false) {
        const lv = levelFor(state.data, pid, whId);
        const avail = lv ? available(lv) : 0;
        const needed = Number(line.quantity || 1);
        if (avail < needed) {
          stockShortages.push({
            productId: pid,
            productName: p.name,
            needed,
            available: avail,
            deficit: needed - avail,
          });
        }
      }
    }

    if (stockShortages.length > 0) {
      issues.push(`Kho không đủ tồn cho ${stockShortages.length} mặt hàng.`);
      recommendations.push(
        `Cần nhập thêm tồn kho hoặc điều chuyển từ kho khác cho: ${stockShortages
          .map(s => `${s.productName} (thiếu ${s.deficit})`)
          .join(', ')}`
      );
    }

    if (o.status === 'NEW') {
      recommendations.push('Đơn hàng mới tạo: Hãy bấm "Xác nhận" để chuyển sang xử lý.');
    } else if (o.status === 'CONFIRMED') {
      recommendations.push('Đơn đã xác nhận: Hãy bấm "Xử lý" và đóng gói hàng.');
    } else if (o.status === 'PROCESSING') {
      if (stockShortages.length === 0) {
        recommendations.push('Đơn đang xử lý và hàng hóa đầy đủ: Bấm "Hoàn tất" để xuất kho.');
      } else {
        recommendations.push('Đang chờ bổ sung hàng tồn kho trước khi có thể hoàn tất.');
      }
    }

    return {
      found: true,
      orderId: o.id,
      code: o.code,
      status: o.status,
      paymentStatus: o.payment_status,
      isComplete: false,
      issues,
      recommendations,
      stockShortages,
    };
  },

  /**
   * Create a draft cart proposal for POS.
   */
  create_cart_draft({ items = [] }, state, envelope) {
    const validLines = [];
    for (const item of items) {
      const p = (state?.data?.products || []).find(x => x.id === item.productId);
      if (p) {
        const q = item.qty !== undefined ? Number(item.qty) : (item.quantity !== undefined ? Number(item.quantity) : 1);
        validLines.push({
          itemId: p.id,
          productId: p.id,
          name: p.name,
          quantity: q,
          unitPrice: Number(p.price || 0),
          discount: 0,
          remove: Boolean(item.remove || q <= 0),
        });
      }
    }

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'add-cart-draft',
      intent: 'create_cart_draft',
      entities: { items: validLines },
      parameters: { items: validLines },
      humanSummary: `Thêm ${validLines.length} sản phẩm vào giỏ hàng POS`,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create a receipt proposal (NO stock mutation).
   */
  create_receipt_proposal({ productId, warehouseId, qty, reason = 'Đề xuất nhập thêm hàng', variantId, variantName }, state, envelope) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    const wh = (state?.data?.warehouses || []).find(w => w.id === warehouseId) || (state?.data?.warehouses || [])[0];
    const nQty = Number(qty || 1);
    const targetWhId = wh?.id || warehouseId;
    const curLevel = targetWhId ? levelFor(state?.data, productId, targetWhId) : null;
    const inventorySnapshot = {
      productId,
      warehouseId: targetWhId,
      onHand: curLevel ? Number(curLevel.onHand || 0) : 0,
      reserved: curLevel ? Number(curLevel.reserved || 0) : 0,
      available: curLevel ? available(curLevel) : 0,
    };

    const displayProdName = p ? (variantName ? `${p.name} (${variantName})` : p.name) : productId;

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'receipt-proposal',
      intent: 'create_receipt_proposal',
      entities: {
        product: p ? { id: p.id, name: displayProdName, sku: p.sku, variantId, variantName } : { id: productId },
        warehouse: wh ? { id: wh.id, name: wh.name } : { id: warehouseId },
      },
      parameters: {
        productId,
        warehouseId: targetWhId,
        qty: nQty,
        reason,
        variantId,
        variantName,
      },
      inventorySnapshot,
      humanSummary: `Nhập thêm ${nQty} ${p?.unit || 'cái'} "${displayProdName}" vào kho "${wh?.name || 'Kho chính'}"`,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create an issue / stock reduction proposal (NO direct stock mutation).
   */
  /**
   * Create an issue / stock reduction proposal (NO direct stock mutation).
   * Supports multi-line issue and single-item issue with strict available stock inspection.
   */
  create_issue_proposal({ productId, warehouseId, qty, reason = 'Đề xuất xuất kho / giảm tồn', lines = [], variantId, variantName }, state, envelope) {
    const wh = (state?.data?.warehouses || []).find(w => w.id === warehouseId) || (state?.data?.warehouses || [])[0];
    const targetWhId = wh?.id || warehouseId;
    const products = state?.data?.products || [];

    // Multi-line issue handling (when 2 or more lines)
    if (Array.isArray(lines) && lines.length > 1) {
      const normalizedLines = lines.map(line => {
        const p = findProduct(products, line);
        const nQty = Number(line.quantity || line.qty || 1);
        const curLevel = targetWhId && p ? levelFor(state?.data, p.id, targetWhId) : null;
        const avail = curLevel ? available(curLevel) : 0;
        return {
          productId: p?.id || line.productId,
          productName: p?.name || line.productName || line.name || 'Sản phẩm',
          unit: p?.unit || line.unit || 'cái',
          quantity: nQty,
          reason: line.reason || reason,
          available: avail,
          isSufficient: avail >= nQty,
        };
      });

      const inventorySnapshot = {
        warehouseId: targetWhId,
        lines: normalizedLines.map(l => ({
          productId: l.productId,
          onHand: l.available,
          available: l.available,
          requested: l.quantity,
        })),
      };

      return createProposal({
        requestId: envelope?.request_id,
        skillId: 'issue-proposal',
        intent: 'create_issue_proposal',
        entities: {
          warehouse: wh ? { id: wh.id, name: wh.name } : { id: warehouseId },
          lines: normalizedLines,
        },
        parameters: {
          warehouseId: targetWhId,
          warehouseName: wh?.name || 'Kho chính',
          lines: normalizedLines,
          reason,
        },
        inventorySnapshot,
        humanSummary: `Xuất kho: ${normalizedLines.map(l => `${l.quantity} ${l.unit} "${l.productName}"`).join(', ')} khỏi kho "${wh?.name || 'Kho chính'}" (Lý do: ${reason})`,
        contextSnapshot: envelope,
      });
    }

    if (Array.isArray(lines) && lines.length === 1 && !productId) {
      productId = lines[0].productId;
      qty = lines[0].quantity || lines[0].qty || qty;
    }

    const p = findProduct(products, { productId, productName: productId });
    const resolvedProdId = p?.id || productId;
    const nQty = Number(qty || 1);
    const curLevel = targetWhId && p ? levelFor(state?.data, resolvedProdId, targetWhId) : null;
    const avail = curLevel ? available(curLevel) : 0;
    const inventorySnapshot = {
      productId: resolvedProdId,
      warehouseId: targetWhId,
      onHand: curLevel ? Number(curLevel.onHand || 0) : 0,
      reserved: curLevel ? Number(curLevel.reserved || 0) : 0,
      available: avail,
    };

    const displayProdName = p ? (variantName ? `${p.name} (${variantName})` : p.name) : (productId || 'Sản phẩm');

      const isSupplierReturn = /trả|ncc|nhà cung cấp|lỗi/i.test(String(reason || ''));
      const summaryPrefix = isSupplierReturn ? 'Xuất trả nhà cung cấp / Giảm' : 'Xuất kho / Giảm';
      return createProposal({
        requestId: envelope?.request_id,
        skillId: 'issue-proposal',
        intent: 'create_issue_proposal',
        entities: {
          product: p ? { id: p.id, name: displayProdName, sku: p.sku, variantId, variantName } : { id: resolvedProdId },
          warehouse: wh ? { id: wh.id, name: wh.name } : { id: warehouseId },
        },
        parameters: {
          productId: resolvedProdId,
          productName: displayProdName,
          warehouseId: targetWhId,
          warehouseName: wh?.name || 'Kho chính',
          qty: nQty,
          available: avail,
          isSufficient: avail >= nQty,
          reason,
          variantId,
          variantName,
        },
        inventorySnapshot,
        humanSummary: `${summaryPrefix} ${nQty} ${p?.unit || 'cái'} "${displayProdName}" khỏi kho "${wh?.name || 'Kho chính'}" (Lý do: ${reason})${isSupplierReturn ? ' cho nhà cung cấp/đối tác' : ''}`,
        contextSnapshot: envelope,
      });
  },

  /**
   * Create a sales order proposal (conforms to Circular 88 HKD - revenue recognized on confirmation).
   */
  create_order_proposal({
    items = [],
    customerName = 'Khách lẻ',
    customerPhone = '',
    address = '',
    discount = 0,
    shippingFee = 0,
    paymentMethod = 'TM',
    paymentTermDays = 0,
    warehouseId = 'wh_center',
    note = '',
  }, state, envelope) {
    const wh = (state?.data?.warehouses || []).find(w => w.id === warehouseId) || (state?.data?.warehouses || [])[0];
    const targetWhId = wh?.id || warehouseId;
    const products = state?.data?.products || [];

    const normalizedItems = (items || []).map(line => {
      const p = findProduct(products, line);
      const qty = Math.max(1, Number(line.quantity || line.qty || 1));
      const unitPrice = Number(line.unitPrice || line.unit_price || p?.price || 0);
      const lineTotal = qty * unitPrice;
      const curLevel = targetWhId && p ? levelFor(state?.data, p.id, targetWhId) : null;
      const avail = curLevel ? available(curLevel) : 0;

      return {
        productId: p?.id || line.productId || line.itemId,
        itemId: p?.id || line.productId || line.itemId,
        productName: p?.name || line.productName || line.name || 'Sản phẩm',
        unit: p?.unit || line.unit || 'cái',
        quantity: qty,
        unitPrice,
        lineTotal,
        available: avail,
        isSufficient: avail >= qty,
      };
    });

    const subtotal = normalizedItems.reduce((acc, it) => acc + it.lineTotal, 0);

    let discAmt = 0;
    if (typeof discount === 'object' && discount !== null) {
      if (discount.type === 'PERCENT' || String(discount.type).toUpperCase() === 'PERCENT' || String(discount.unit) === '%') {
        const pct = parseFloat(String(discount.value ?? discount.percent ?? 0).replace('%', '').trim());
        discAmt = isNaN(pct) ? 0 : Math.round((subtotal * pct) / 100);
      } else {
        const val = discount.value ?? discount.amount ?? 0;
        if (typeof val === 'string' && val.includes('%')) {
          const pct = parseFloat(val.replace('%', '').trim());
          discAmt = isNaN(pct) ? 0 : Math.round((subtotal * pct) / 100);
        } else {
          discAmt = parseVietnameseCurrency(val);
        }
      }
    } else if (typeof discount === 'string') {
      const trimmed = discount.trim();
      if (trimmed.includes('%')) {
        const pct = parseFloat(trimmed.replace('%', '').trim());
        discAmt = isNaN(pct) ? 0 : Math.round((subtotal * pct) / 100);
      } else {
        discAmt = parseVietnameseCurrency(trimmed);
      }
    } else if (typeof discount === 'number') {
      discAmt = isNaN(discount) ? 0 : discount;
    }

    const shipAmt = typeof shippingFee === 'number'
      ? (isNaN(shippingFee) ? 0 : shippingFee)
      : parseVietnameseCurrency(shippingFee);

    const grandTotal = Math.max(0, subtotal - discAmt + shipAmt);

    const inventorySnapshot = {
      warehouseId: targetWhId,
      lines: normalizedItems.map(it => ({
        productId: it.productId,
        requested: it.quantity,
        available: it.available,
      })),
    };

    const termSummary = paymentTermDays > 0 ? ` (Hạn nợ: ${paymentTermDays} ngày)` : '';
    const discSummary = discAmt > 0 ? `, Giảm ${new Intl.NumberFormat('vi-VN').format(discAmt)}đ` : '';
    const shipSummary = shipAmt > 0 ? `, Ship ${new Intl.NumberFormat('vi-VN').format(shipAmt)}đ` : '';

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'order-proposal',
      intent: 'create_order_proposal',
      entities: {
        customer: { name: customerName, phone: customerPhone, address },
        warehouse: wh ? { id: wh.id, name: wh.name } : { id: warehouseId },
        items: normalizedItems,
      },
      parameters: {
        customerName,
        customerPhone,
        customerLabel: customerPhone ? `${customerName} - ${customerPhone}` : customerName,
        address,
        items: normalizedItems,
        subtotal,
        discount: discAmt,
        shippingFee: shipAmt,
        grandTotal,
        paymentMethod,
        paymentTermDays,
        warehouseId: targetWhId,
        warehouseName: wh?.name || 'Kho chính',
        note: note || `Đơn hàng qua AI Trợ lý${termSummary}`,
      },
      inventorySnapshot,
      humanSummary: `Đơn bán hàng cho "${customerName}": ${normalizedItems.map(i => `${i.quantity} ${i.unit} ${i.productName}`).join(', ')} — Tổng: ${new Intl.NumberFormat('vi-VN').format(grandTotal)}đ${discSummary}${shipSummary}${termSummary}`,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create an electronic invoice draft proposal (conforms to Decree 123 / Circular 78).
   */
  create_invoice_proposal({
    taxCode = '',
    companyName = '',
    address = '',
    email = '',
    items = [],
    vatRate = 10,
    paymentMethod = 'CK',
    warehouseId = 'wh_center',
  }, state, envelope) {
    const products = state?.data?.products || [];
    const normalizedItems = (items || []).map((line, idx) => {
      const p = findProduct(products, line);
      const qty = Math.max(1, Number(line.quantity || line.qty || 1));
      const unitPrice = Number(line.unitPrice || line.unit_price || p?.price || 0);
      const lineSubtotal = qty * unitPrice;
      const lineVat = Math.round((lineSubtotal * Number(vatRate || 0)) / 100);
      return {
        line_index: idx + 1,
        productId: p?.id || line.productId,
        itemId: p?.id || line.productId,
        name: p?.name || line.productName || line.name || 'Hàng hóa / Dịch vụ',
        unit: p?.unit || 'cái',
        quantity: qty,
        unitPrice,
        unit_price: unitPrice,
        vat_rate: Number(vatRate || 0),
        vat_amount: lineVat,
        line_total: lineSubtotal + lineVat,
      };
    });

    const subtotal = normalizedItems.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0);
    const vatTotal = normalizedItems.reduce((acc, it) => acc + it.vat_amount, 0);
    const grandTotal = subtotal + vatTotal;

    const buyerLabel = companyName || 'Doanh nghiệp mua hàng';
    const taxLabel = taxCode ? ` (MST: ${taxCode})` : '';

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'invoice-proposal',
      intent: 'electronic_invoice_proposal',
      entities: {
        buyer: { taxCode, companyName, address, email },
        items: normalizedItems,
      },
      parameters: {
        buyerType: taxCode ? 'BUSINESS' : 'INDIVIDUAL',
        taxCode,
        companyName,
        address,
        email,
        items: normalizedItems,
        subtotal,
        vatRate: Number(vatRate || 0),
        vatTotal,
        grandTotal,
        paymentMethod,
      },
      humanSummary: `HĐĐT (Bản nháp) cho "${buyerLabel}"${taxLabel}: ${normalizedItems.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ')} — Tổng thanh toán (VAT ${vatRate}%): ${new Intl.NumberFormat('vi-VN').format(grandTotal)}đ`,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create a transfer proposal between warehouses (NO stock mutation).
   */
  create_transfer_proposal({ fromWarehouseId, toWarehouseId, lines = [], note = '' }, state, envelope) {
    const fromWh = (state?.data?.warehouses || []).find(w => w.id === fromWarehouseId);
    const toWh = (state?.data?.warehouses || []).find(w => w.id === toWarehouseId);
    const inventorySnapshot = {
      fromWarehouseId,
      lines: (lines || []).map(line => {
        const lv = levelFor(state?.data, line.productId, fromWarehouseId);
        return {
          productId: line.productId,
          onHand: lv ? Number(lv.onHand || 0) : 0,
          reserved: lv ? Number(lv.reserved || 0) : 0,
          available: lv ? available(lv) : 0,
        };
      }),
    };

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'transfer-proposal',
      intent: 'create_transfer_proposal',
      entities: {
        fromWarehouse: fromWh ? { id: fromWh.id, name: fromWh.name } : null,
        toWarehouse: toWh ? { id: toWh.id, name: toWh.name } : null,
        linesCount: lines.length,
      },
      parameters: {
        fromWarehouseId,
        toWarehouseId,
        lines,
        note,
      },
      inventorySnapshot,
      humanSummary: lines.length === 1
        ? (() => {
            const p = (state?.data?.products || []).find(x => x.id === lines[0].productId);
            return `Chuyển ${lines[0].qty} ${p?.unit || 'chiếc'} "${p?.name || 'sản phẩm'}" từ kho "${fromWh?.name || fromWarehouseId}" sang kho "${toWh?.name || toWarehouseId}"`;
          })()
        : `Chuyển ${lines.length} mặt hàng từ kho "${fromWh?.name || fromWarehouseId}" sang kho "${toWh?.name || toWarehouseId}"`,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create a stocktake proposal (NO stock mutation).
   */
  create_stocktake_proposal({ warehouseId, productId, counted, lines = [], reason = 'Kiểm kho định kỳ' }, state, envelope) {
    const wh = (state?.data?.warehouses || []).find(w => w.id === warehouseId) || (state?.data?.warehouses || [])[0];
    const targetWhId = wh?.id || warehouseId;

    if (productId && counted !== undefined) {
      const p = (state?.data?.products || []).find(x => x.id === productId);
      const curLevel = targetWhId ? levelFor(state?.data, productId, targetWhId) : null;
      const expected = curLevel ? Number(curLevel.onHand || 0) : 0;
      const nCounted = Number(counted);
      const diff = nCounted - expected;

      const inventorySnapshot = {
        productId,
        warehouseId: targetWhId,
        onHand: expected,
        reserved: curLevel ? Number(curLevel.reserved || 0) : 0,
        available: curLevel ? available(curLevel) : 0,
      };

      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const humanSummary = `Kiểm kho sản phẩm "${p?.name || productId}": Sổ sách ${expected}, Thực kiểm ${nCounted} (Lệch: ${diffStr})`;

      return createProposal({
        requestId: envelope?.request_id,
        skillId: 'stocktake-proposal',
        intent: 'create_stocktake_proposal',
        entities: {
          product: p ? { id: p.id, name: p.name, sku: p.sku } : { id: productId },
          warehouse: wh ? { id: wh.id, name: wh.name } : { id: targetWhId },
        },
        parameters: {
          productId,
          warehouseId: targetWhId,
          expected,
          counted: nCounted,
          difference: diff,
          reason,
        },
        inventorySnapshot,
        humanSummary,
        contextSnapshot: envelope,
      });
    }

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'stocktake-proposal',
      intent: 'create_stocktake_proposal',
      entities: {
        warehouse: wh ? { id: wh.id, name: wh.name } : null,
        linesCount: lines.length,
      },
      parameters: {
        warehouseId: targetWhId,
        lines,
        reason,
      },
      humanSummary: `Đề xuất kiểm kê ${lines.length} mặt hàng tại kho "${wh?.name || 'Kho chính'}"`,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create a product status proposal (open for sale / stop selling).
   */
  create_update_product_status_proposal({ productId, active, reason }, state, envelope) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    const actBool = Boolean(active);
    const summary = `${actBool ? 'Mở bán trở lại (Đang kinh doanh)' : 'Ngừng kinh doanh (Tạm dừng bán)'} cho sản phẩm "${p?.name || productId}"`;
    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'update-product-status',
      intent: 'update_product_status',
      entities: {
        product: p ? { id: p.id, name: p.name, sku: p.sku } : { id: productId },
      },
      parameters: {
        productId,
        active: actBool,
        reason: reason || (actBool ? 'Mở bán trở lại từ AI' : 'Ngừng kinh doanh từ AI'),
      },
      humanSummary: summary,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create a product price proposal (selling price or purchase price / cost).
   */
  create_update_product_price_proposal({ productId, price, costPrice, reason }, state, envelope) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    const nPrice = price != null ? Number(price) : null;
    const nCost = costPrice != null ? Number(costPrice) : null;
    const fmt = new Intl.NumberFormat('vi-VN');
    let summary = '';
    if (nPrice != null && nCost != null) {
      summary = `Cập nhật giá "${p?.name || productId}": Giá bán ${fmt.format(nPrice)} ₫, Giá nhập ${fmt.format(nCost)} ₫`;
    } else if (nPrice != null) {
      summary = `Cập nhật giá bán "${p?.name || productId}": ${fmt.format(nPrice)} ₫ (hiện tại: ${p?.price != null ? fmt.format(p.price) + ' ₫' : 'chưa đặt'})`;
    } else {
      summary = `Cập nhật giá nhập "${p?.name || productId}": ${fmt.format(nCost)} ₫ (hiện tại: ${p?.purchase_price != null ? fmt.format(p.purchase_price) + ' ₫' : 'chưa đặt'})`;
    }
    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'update-product-price',
      intent: 'update_product_price',
      entities: {
        product: p ? { id: p.id, name: p.name, sku: p.sku } : { id: productId },
      },
      parameters: {
        productId,
        price: nPrice,
        costPrice: nCost,
        reason: reason || (nCost != null ? 'Sửa giá nhập từ AI' : 'Sửa giá bán từ AI'),
      },
      humanSummary: summary,
      contextSnapshot: envelope,
    });
  },

  /**
   * Create a warehouse creation proposal.
   */
  create_warehouse_proposal({ name, reason }, state, envelope) {
    const cleanName = String(name || '').trim();
    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'create-warehouse',
      intent: 'create_warehouse',
      entities: {
        warehouseName: cleanName,
      },
      parameters: {
        name: cleanName,
        reason: reason || 'Tạo kho mới từ AI',
      },
      humanSummary: `Tạo thêm kho mới "${cleanName}"`,
      contextSnapshot: envelope,
    });
  },

  /**
   * Section M: Get gross profit & cost summary (strictly requires VIEW_COST).
   * Exact parity with reportSales('month'|'today'|'2_days'|etc.) on Dashboard.
   */
  get_profit_summary({ period = 'today', customStart = null, customEnd = null }, state, envelope, actor) {
    const act = actor || (envelope && envelope.actor_role ? { id: envelope.actor_id, role: envelope.actor_role } : getCurrentActor());
    if (!hasCapability(act, PERMISSIONS.VIEW_COST)) {
      throw new Error(`HARD DENY: Tài khoản vai trò "${act.role}" không có quyền xem giá vốn và lợi nhuận (VIEW_COST denied).`);
    }

    const { start, end, label } = resolveDateInterval(period, new Date(), customStart, customEnd);

    const sales = (state?.data?.sales || []).filter(s => {
      if (s.status === 'cancelled') return false;
      const dt = new Date(s.created_at || s.createdAt || s.date || 0);
      return ['COMPLETED', 'PAID'].includes(String(s.status || '').toUpperCase()) && dt >= start && dt <= end;
    });

    const saleCodes = new Set(sales.flatMap(s => [s.code, s.id, s.sale_uuid, s.order_id, s.order_code, s.reference, s.reference_id].filter(Boolean)));
    const completedOrders = (state?.data?.orders || []).filter(o => {
      if (String(o.status || '').toUpperCase() !== 'COMPLETED') return false;
      const dt = new Date(o.created_at || o.createdAt || o.updated_at || 0);
      if (dt < start || dt > end) return false;
      if (saleCodes.has(o.code) || saleCodes.has(o.id) || saleCodes.has(o.order_uuid)) return false;
      if (o.sale_id && sales.some(s => s.id === o.sale_id || s.sale_uuid === o.sale_id)) return false;
      return true;
    }).map(o => ({
      id: o.id,
      code: o.code || o.id,
      customer_label: o.customer_label || 'Khách lẻ',
      created_at: o.created_at || o.createdAt,
      subtotal: Number(o.subtotal || 0),
      discount_total: Number(o.discount_total || 0),
      tax_total: Number(o.tax_total || 0),
      grand_total: Number(o.grand_total || 0),
      total: Number(o.grand_total || 0),
      status: 'COMPLETED',
      items: (o.items || []).map(i => ({
        item_id: i.item_id || i.itemId || i.productId || i.id,
        name: i.name || 'Sản phẩm',
        quantity: Number(i.quantity || 0),
        unit_price: Number(i.unit_price || 0),
        cost_price: Number(i.cost_price || 0),
        line_total: Number(i.line_total ?? (Number(i.quantity || 0) * Number(i.unit_price || 0)) ?? 0)
      })),
      is_order: true
    }));

    const allSales = [...sales, ...completedOrders];
    const sum = key => allSales.reduce((n, s) => n + Number(s[key] || 0), 0);
    const gross = sum('subtotal');
    const discount = sum('discount_total');
    const net = gross > 0 ? Math.max(0, gross - discount) : (sum('grand_total') || sum('total'));

    const products = state?.data?.products || [];
    const prodMap = new Map(products.map(p => [p.id, p]));

    let estimatedCost = 0;
    let itemsCount = 0;
    let itemsWithCost = 0;

    for (const s of allSales) {
      for (const item of (s.items || [])) {
        itemsCount++;
        const pId = item.item_id || item.itemId || item.productId || item.product_id || item.id;
        const p = prodMap.get(pId);
        const unitCost = Number(item.cost_price ?? item.cost ?? p?.cost_price ?? p?.cost ?? p?.purchase_price ?? 0);
        if (unitCost > 0 || (item.cost_price !== undefined || p?.cost_price !== undefined)) {
          itemsWithCost++;
        }
        const qty = Number(item.quantity ?? item.qty ?? 1);
        const itemTotalCost = Number(item.cost_total) > 0 ? Number(item.cost_total) : (unitCost * qty);
        estimatedCost += itemTotalCost;
      }
    }

    const refundTotal = (state?.data?.refunds || []).filter(r => {
      const rDate = new Date(r.created_at || r.createdAt || 0);
      return rDate >= start && rDate <= end;
    }).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const hasCost = estimatedCost > 0;
    const grossProfit = hasCost ? Math.max(0, net - estimatedCost - refundTotal) : 0;
    const margin = net > 0 ? Math.round((grossProfit / net) * 100) : 0;

    return {
      period,
      periodLabel: label,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      salesCount: allSales.length,
      revenue: net,
      cost: estimatedCost,
      grossProfit,
      margin,
      hasCost,
      refundTotal,
      formattedRevenue: new Intl.NumberFormat('vi-VN').format(net) + ' ₫',
      formattedCost: new Intl.NumberFormat('vi-VN').format(estimatedCost) + ' ₫',
      formattedGrossProfit: new Intl.NumberFormat('vi-VN').format(grossProfit) + ' ₫',
    };
  },

  /**
   * STEP 1: Daily Attention Engine
   * Deterministic operational signals (low stock, out of stock, pending orders, unpaid orders, in-transit transfers, open shift, discrepancies).
   */
  get_daily_attention_digest(params = {}, state, envelope, actor) {
    const products = state?.data?.products || [];
    const orders = state?.data?.orders || [];
    const transfers = state?.data?.transfers || [];
    const shifts = state?.data?.shifts || [];
    const items = [];

    // 1. Check stock: Out of stock (CRITICAL) & Low stock (HIGH)
    const trackedProds = products.filter(p => p.active !== false && p.type !== 'SERVICE' && p.trackInventory !== false);
    const outOfStockProds = [];
    const lowStockProds = [];

    for (const p of trackedProds) {
      const tot = totalFor(state.data, p.id);
      if (tot.available <= 0) {
        outOfStockProds.push({ id: p.id, name: p.name, available: tot.available, lowStock: p.lowStock });
      } else if (tot.available <= Number(p.lowStock || 0)) {
        lowStockProds.push({ id: p.id, name: p.name, available: tot.available, lowStock: p.lowStock });
      }
    }

    if (outOfStockProds.length > 0) {
      items.push({
        id: 'att_out_of_stock',
        type: 'out_of_stock',
        severity: 'CRITICAL',
        count: outOfStockProds.length,
        summary: `${outOfStockProds.length} sản phẩm đã hết hàng`,
        entity_type: 'product',
        entity_ids: outOfStockProds.map(p => p.id),
        feature_id: 'PRODUCTS',
        action_id: 'open_low_stock',
        evidence: outOfStockProds.slice(0, 3).map(p => `${p.name} (còn 0)`).join(', ') + (outOfStockProds.length > 3 ? '...' : ''),
      });
    }

    if (lowStockProds.length > 0) {
      items.push({
        id: 'att_low_stock',
        type: 'low_stock',
        severity: 'HIGH',
        count: lowStockProds.length,
        summary: `${lowStockProds.length} sản phẩm sắp hết hàng`,
        entity_type: 'product',
        entity_ids: lowStockProds.map(p => p.id),
        feature_id: 'PRODUCTS',
        action_id: 'open_low_stock',
        evidence: lowStockProds.slice(0, 3).map(p => `${p.name} (còn ${p.available})`).join(', ') + (lowStockProds.length > 3 ? '...' : ''),
      });
    }

    // 2. Check pending orders (HIGH)
    const pendingOrders = orders.filter(o => o.status === 'NEW' || o.status === 'CONFIRMED' || o.status === 'PROCESSING');
    if (pendingOrders.length > 0) {
      items.push({
        id: 'att_pending_orders',
        type: 'pending_orders',
        severity: 'HIGH',
        count: pendingOrders.length,
        summary: `${pendingOrders.length} đơn hàng đang chờ xử lý / xuất kho`,
        entity_type: 'order',
        entity_ids: pendingOrders.map(o => o.id),
        feature_id: 'ORDERS',
        action_id: 'open_pending_orders',
        evidence: pendingOrders.slice(0, 3).map(o => `${o.code} (${o.status})`).join(', ') + (pendingOrders.length > 3 ? '...' : ''),
      });
    }

    // 3. Check unpaid orders (MEDIUM)
    const unpaidOrders = orders.filter(o => o.status !== 'CANCELLED' && o.payment_status !== 'PAID');
    if (unpaidOrders.length > 0) {
      const totalUnpaid = unpaidOrders.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
      items.push({
        id: 'att_unpaid_orders',
        type: 'unpaid_orders',
        severity: 'MEDIUM',
        count: unpaidOrders.length,
        summary: `${unpaidOrders.length} đơn hàng chưa thanh toán (${new Intl.NumberFormat('vi-VN').format(totalUnpaid)} ₫)`,
        entity_type: 'order',
        entity_ids: unpaidOrders.map(o => o.id),
        feature_id: 'ORDERS',
        action_id: 'open_unpaid_orders',
        evidence: unpaidOrders.slice(0, 3).map(o => `${o.code}`).join(', '),
      });
    }

    // 4. Check in-transit transfers (HIGH)
    const inTransitTransfers = transfers.filter(t => t.status === 'in_transit');
    if (inTransitTransfers.length > 0) {
      items.push({
        id: 'att_in_transit_transfers',
        type: 'waiting_receive_transfers',
        severity: 'HIGH',
        count: inTransitTransfers.length,
        summary: `${inTransitTransfers.length} phiếu chuyển kho đang chờ nhận hàng`,
        entity_type: 'transfer',
        entity_ids: inTransitTransfers.map(t => t.id),
        feature_id: 'WAREHOUSE_TRANSFER',
        action_id: 'open_transfers',
        evidence: inTransitTransfers.slice(0, 3).map(t => `Phiếu ${t.id.slice(-6)}`).join(', '),
      });
    }

    // 5. Check open shift & discrepancies
    const openShifts = shifts.filter(s => s.status === 'OPEN');
    if (openShifts.length > 0) {
      items.push({
        id: 'att_open_shift',
        type: 'open_shift',
        severity: 'LOW',
        count: openShifts.length,
        summary: `Đang có ca bán hàng mở (${openShifts[0].employee || 'Thiết bị này'})`,
        entity_type: 'shift',
        entity_ids: openShifts.map(s => s.id),
        feature_id: 'SHIFT',
        action_id: 'open_shift',
        evidence: `Tiền đầu ca: ${new Intl.NumberFormat('vi-VN').format(openShifts[0].opening_cash || 0)} ₫`,
      });
    }

    const closedWithDiff = shifts.filter(s => s.status === 'CLOSED' && s.difference != null && Number(s.difference) !== 0);
    if (closedWithDiff.length > 0) {
      const lastDiff = closedWithDiff[closedWithDiff.length - 1];
      items.push({
        id: 'att_shift_discrepancy',
        type: 'shift_discrepancy',
        severity: 'CRITICAL',
        count: closedWithDiff.length,
        summary: `Ca bán hàng gần nhất bị lệch tiền mặt (${new Intl.NumberFormat('vi-VN').format(lastDiff.difference)} ₫)`,
        entity_type: 'shift',
        entity_ids: [lastDiff.id],
        feature_id: 'SHIFT',
        action_id: 'open_shift',
        evidence: `Dự kiến: ${new Intl.NumberFormat('vi-VN').format(lastDiff.expected_cash || 0)} ₫, Thực tế: ${new Intl.NumberFormat('vi-VN').format(lastDiff.counted_cash || 0)} ₫`,
      });
    }

    const orderMap = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    items.sort((a, b) => (orderMap[a.severity] ?? 5) - (orderMap[b.severity] ?? 5));

    // Normalize items with title, detail, urgency, action
    const normalizedItems = items.map(it => ({
      ...it,
      title: it.summary,
      detail: it.evidence,
      action: it.action_id === 'open_low_stock' ? 'Mở hàng sắp hết' :
              it.action_id === 'open_pending_orders' ? 'Xử lý đơn chờ' :
              it.action_id === 'open_unpaid_orders' ? 'Thu tiền đơn' :
              it.action_id === 'open_transfers' ? 'Kiểm nhận hàng' :
              it.action_id === 'open_shift' ? 'Kiểm két tiền' : 'Xử lý ngay',
      urgency: it.severity,
    }));

    return {
      items: normalizedItems,
      totalCount: normalizedItems.length,
      isClean: normalizedItems.length === 0,
      isZeroState: normalizedItems.length === 0,
      zeroStateMessage: 'Chưa phát hiện việc cần xử lý trong các mục đang kiểm tra.',
    };
  },

  /**
   * STEP 2: Smart Replenishment Engine
   * Deterministic replenishment calculation based on stock, sales velocity, and lowStock threshold.
   */
  get_replenishment_suggestions(params = {}, state, envelope, actor) {
    const products = state?.data?.products || [];
    const sales = state?.data?.sales || [];
    const transfers = state?.data?.transfers || [];
    const windowDays = Number(params.windowDays || OPERATIONAL_THRESHOLDS.REPLENISHMENT_DEFAULT_COVERAGE_DAYS);

    const now = Date.now();
    const windowCutoff = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const unitsSoldMap = new Map();
    for (const s of sales) {
      const sTime = s.created_at || s.createdAt || '';
      if (sTime >= windowCutoff) {
        for (const it of (s.items || [])) {
          const pid = it.itemId || it.productId;
          unitsSoldMap.set(pid, (unitsSoldMap.get(pid) || 0) + Number(it.quantity || 1));
        }
      }
    }

    const incomingMap = new Map();
    for (const tr of transfers) {
      if (tr.status === 'in_transit') {
        for (const l of (tr.lines || [])) {
          incomingMap.set(l.productId, (incomingMap.get(l.productId) || 0) + Number(l.qty || 0));
        }
      }
    }

    const suggestions = [];
    const trackedProds = products.filter(p => p.active !== false && p.type !== 'SERVICE' && p.trackInventory !== false);

    for (const p of trackedProds) {
      const tot = totalFor(state.data, p.id);
      const recentSales = unitsSoldMap.get(p.id) || 0;
      const velocity = Number((recentSales / windowDays).toFixed(2));
      const incoming = incomingMap.get(p.id) || 0;
      const lowStock = Number(p.lowStock || 0);

      // Target = max(lowStock * 2, velocity * windowDays, 10)
      const targetStock = Math.max(lowStock * 2, Math.ceil(velocity * windowDays), 10);
      const netAvailable = tot.available + incoming;
      const suggestedQty = Math.max(0, targetStock - netAvailable);

      let reasonCode = 'NORMAL';
      let shortReason = '';
      let hasLowData = false;

      if (recentSales === 0 && tot.available > lowStock) {
        hasLowData = true;
        reasonCode = 'INSUFFICIENT_DATA';
        shortReason = `Mới có ít dữ liệu bán, chưa đủ cơ sở tính đề xuất chính xác (bán được 0 cái trong ${windowDays} ngày qua).`;
      } else if (tot.available <= 0) {
        reasonCode = 'STOCKOUT';
        shortReason = `Đã hết hàng hoàn toàn (tồn 0). Cần nhập tối thiểu ${targetStock} ${p.unit || 'cái'} để bù tồn.`;
      } else if (tot.available <= lowStock) {
        reasonCode = 'LOW_STOCK';
        shortReason = `Tồn kho (${tot.available}) chạm ngưỡng tối thiểu (${lowStock}). Cần nhập ${suggestedQty} ${p.unit || 'cái'}.`;
      } else if (velocity >= 0.5 && suggestedQty > 0) {
        reasonCode = 'HIGH_VELOCITY';
        shortReason = `Bán nhanh (${recentSales} cái / ${windowDays} ngày), cần nhập ${suggestedQty} ${p.unit || 'cái'} để tránh đứt hàng.`;
      } else {
        shortReason = `Tồn kho an toàn (${tot.available} ${p.unit || 'cái'}).`;
      }

      if (suggestedQty > 0 || tot.available <= lowStock || hasLowData) {
        suggestions.push({
          productId: p.id,
          productName: p.name,
          name: p.name,
          sku: p.sku || '',
          unit: p.unit || 'cái',
          currentStock: tot.onHand,
          availableStock: tot.available,
          incomingTransit: incoming,
          recentSales,
          velocity,
          dailyVelocity: velocity,
          lowStockThreshold: lowStock,
          targetStock,
          suggestedQuantity: suggestedQty,
          reasonCode,
          shortReason,
          hasLowData,
          calculationWindowDays: windowDays,
        });
      }
    }

    suggestions.sort((a, b) => {
      if (a.reasonCode === 'STOCKOUT') return -1;
      if (b.reasonCode === 'STOCKOUT') return 1;
      return b.suggestedQuantity - a.suggestedQuantity;
    });

    return {
      suggestions: suggestions.slice(0, 10),
      totalNeedingReplenishment: suggestions.length,
      windowDays,
      isClean: suggestions.length === 0,
    };
  },

  /**
   * STEP 3: Shop Health Check
   * Evidence-backed finding auditor with VIEW_COST data isolation.
   */
  get_shop_health_report(params = {}, state, envelope, actor) {
    const act = actor || (envelope && envelope.actor_role ? { id: envelope.actor_id, role: envelope.actor_role } : getCurrentActor());
    const canViewCost = hasCapability(act, PERMISSIONS.VIEW_COST);

    const products = state?.data?.products || [];
    const orders = state?.data?.orders || [];
    const transfers = state?.data?.transfers || [];
    const levels = state?.data?.levels || [];
    const findings = [];

    // 1. Duplicate SKU / Barcode check
    const skuMap = new Map();
    const barcodeMap = new Map();
    for (const p of products) {
      if (p.active === false) continue;
      if (p.sku && p.sku.trim()) {
        const s = p.sku.trim().toUpperCase();
        if (skuMap.has(s)) skuMap.get(s).push(p);
        else skuMap.set(s, [p]);
      }
      if (p.barcode && p.barcode.trim()) {
        const b = p.barcode.trim();
        if (barcodeMap.has(b)) barcodeMap.get(b).push(p);
        else barcodeMap.set(b, [p]);
      }
    }

    for (const [sku, list] of skuMap.entries()) {
      if (list.length > 1) {
        findings.push({
          finding_id: `dup_sku_${sku}`,
          finding_type: 'DUPLICATE_SKU',
          severity: 'HIGH',
          entity_type: 'product',
          entity_ids: list.map(x => x.id),
          evidence: `Mã SKU "${sku}" bị trùng lặp giữa: ${list.map(x => x.name).join(', ')}`,
          human_summary: `Trùng mã SKU "${sku}" giữa ${list.length} sản phẩm.`,
          feature_id: 'PRODUCTS',
          action_id: 'open_products',
        });
      }
    }

    for (const [barcode, list] of barcodeMap.entries()) {
      if (list.length > 1) {
        findings.push({
          finding_id: `dup_barcode_${barcode}`,
          finding_type: 'DUPLICATE_BARCODE',
          severity: 'HIGH',
          entity_type: 'product',
          entity_ids: list.map(x => x.id),
          evidence: `Mã Barcode "${barcode}" bị trùng lặp giữa: ${list.map(x => x.name).join(', ')}`,
          human_summary: `Trùng mã vạch "${barcode}" giữa ${list.length} sản phẩm.`,
          feature_id: 'PRODUCTS',
          action_id: 'open_products',
        });
      }
    }

    // 2. Product sanity checks
    for (const p of products) {
      if (!p.name || !p.name.trim()) {
        findings.push({
          finding_id: `missing_name_${p.id}`,
          finding_type: 'MISSING_DATA',
          severity: 'HIGH',
          entity_type: 'product',
          entity_id: p.id,
          evidence: `Sản phẩm ${p.id} không có tên.`,
          human_summary: `Sản phẩm thiếu tên gọi bắt buộc.`,
          feature_id: 'PRODUCT_DETAIL',
          action_id: 'open_product',
        });
      }
      if (p.price != null && (Number(p.price) < 0 || !Number.isFinite(Number(p.price)))) {
        findings.push({
          finding_id: `invalid_price_${p.id}`,
          finding_type: 'INVALID_PRICE',
          severity: 'CRITICAL',
          entity_type: 'product',
          entity_id: p.id,
          evidence: `Sản phẩm "${p.name}" có giá bán không hợp lệ (${p.price}).`,
          human_summary: `Giá bán không hợp lệ ở sản phẩm "${p.name}".`,
          feature_id: 'PRODUCT_DETAIL',
          action_id: 'open_product',
        });
      }

      // ACCEPTANCE_F: Only if actor has VIEW_COST
      if (canViewCost && p.cost != null && p.price != null) {
        const costNum = Number(p.cost);
        const priceNum = Number(p.price);
        if (costNum > 0 && priceNum > 0 && priceNum < costNum) {
          findings.push({
            finding_id: `price_below_cost_${p.id}`,
            finding_type: 'PRICE_BELOW_COST',
            severity: 'MEDIUM',
            entity_type: 'product',
            entity_id: p.id,
            evidence: `Giá bán (${new Intl.NumberFormat('vi-VN').format(priceNum)} ₫) thấp hơn giá vốn (${new Intl.NumberFormat('vi-VN').format(costNum)} ₫) ở "${p.name}".`,
            human_summary: `Sản phẩm "${p.name}" đang bán dưới giá vốn.`,
            feature_id: 'PRODUCT_DETAIL',
            action_id: 'open_product',
            permission_filtered: true,
          });
        }
      }
    }

    // 3. Negative stock check
    for (const lv of levels) {
      if (Number(lv.onHand || 0) < 0) {
        const prod = products.find(x => x.id === lv.productId);
        findings.push({
          id: `neg_stock_${lv.id || lv.productId}`,
          finding_id: `neg_stock_${lv.id || lv.productId}`,
          type: 'NEGATIVE_STOCK',
          finding_type: 'NEGATIVE_STOCK',
          severity: 'CRITICAL',
          title: `Tồn kho âm ở sản phẩm "${prod?.name || lv.productId}".`,
          entity_type: 'product',
          entity_id: lv.productId,
          evidence: `Tồn kho thực tế của "${prod?.name || lv.productId}" tại kho ${lv.warehouseId} bị âm (${lv.onHand}).`,
          detail: `Tồn kho thực tế của "${prod?.name || lv.productId}" tại kho ${lv.warehouseId} bị âm (${lv.onHand}).`,
          human_summary: `Tồn kho âm ở sản phẩm "${prod?.name || lv.productId}".`,
          action: 'Kiểm kê hoặc nhập điều chỉnh tồn kho',
          feature_id: 'PRODUCTS',
          action_id: 'open_products',
        });
      }
    }

    // 4. Stale orders check (> STALE_ORDER_HOURS)
    const now = Date.now();
    const staleOrderMs = OPERATIONAL_THRESHOLDS.STALE_ORDER_HOURS * 60 * 60 * 1000;
    for (const o of orders) {
      if (o.status !== 'COMPLETED' && o.status !== 'CANCELLED') {
        const oTime = new Date(o.created_at || o.createdAt || 0).getTime();
        if (oTime > 0 && (now - oTime) > staleOrderMs) {
          findings.push({
            finding_id: `stale_order_${o.id}`,
            finding_type: 'STALE_ORDER',
            severity: 'MEDIUM',
            entity_type: 'order',
            entity_id: o.id,
            evidence: `Đơn hàng ${o.code} tạo từ hơn ${OPERATIONAL_THRESHOLDS.STALE_ORDER_HOURS} giờ trước nhưng chưa hoàn tất (${o.status}).`,
            human_summary: `Đơn hàng ${o.code} tồn đọng kéo dài (> ${OPERATIONAL_THRESHOLDS.STALE_ORDER_HOURS}h).`,
            feature_id: 'ORDERS',
            action_id: 'open_order',
          });
        }
      }
    }

    // 5. Stale transfers check (> STALE_TRANSFER_HOURS)
    const staleTransferMs = OPERATIONAL_THRESHOLDS.STALE_TRANSFER_HOURS * 60 * 60 * 1000;
    for (const tr of transfers) {
      if (tr.status === 'in_transit') {
        const trTime = new Date(tr.createdAt || tr.created_at || 0).getTime();
        if (trTime > 0 && (now - trTime) > staleTransferMs) {
          findings.push({
            finding_id: `stale_transfer_${tr.id}`,
            finding_type: 'STALE_TRANSFER',
            severity: 'MEDIUM',
            entity_type: 'transfer',
            entity_id: tr.id,
            evidence: `Phiếu chuyển ${tr.id.slice(-6)} ở trạng thái đang chuyển quá 48 giờ chưa được kho nhận xác nhận.`,
            human_summary: `Phiếu chuyển kho ${tr.id.slice(-6)} chưa được xác nhận nhận hàng (> 48h).`,
            feature_id: 'WAREHOUSE_TRANSFER',
            action_id: 'open_transfers',
          });
        }
      }
    }

    // 6. Ledger reconciliation check on sample levels
    const movements = state?.data?.movements || [];
    const sums = new Map();
    for (const m of movements) {
      if (['reserve', 'release', 'damage'].includes(m.type)) continue;
      const k = `${m.productId}:${m.warehouseId}`;
      sums.set(k, (sums.get(k) || 0) + Number(m.qty || 0));
    }
    for (const lv of levels.slice(0, 15)) {
      const k = `${lv.productId}:${lv.warehouseId}`;
      const sum = sums.get(k) || 0;
      const onHand = Number(lv.onHand || 0);
      const diff = Math.abs(onHand - sum);
      if (diff > 0) {
        const prod = products.find(x => x.id === lv.productId);
        findings.push({
          finding_id: `ledger_mismatch_${lv.productId}_${lv.warehouseId}`,
          finding_type: 'LEDGER_MISMATCH',
          severity: 'CRITICAL',
          entity_type: 'product',
          entity_id: lv.productId,
          evidence: `Lệch sổ cái ở "${prod?.name || lv.productId}": Tồn thực tế là ${onHand}, tổng sổ phát sinh là ${sum} (lệch ${diff}).`,
          human_summary: `Lệch sổ cái tại kho cho sản phẩm "${prod?.name || lv.productId}".`,
          feature_id: 'PRODUCTS',
          action_id: 'open_products',
        });
      }
    }

    const needAction = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');
    const shouldReview = findings.filter(f => f.severity === 'MEDIUM');
    const normal = findings.filter(f => f.severity === 'LOW' || f.severity === 'INFO');

    const counts = {
      total: findings.length,
      critical: needAction.filter(f => f.severity === 'CRITICAL').length,
      high: needAction.filter(f => f.severity === 'HIGH').length,
      medium: shouldReview.length,
      low: normal.length,
    };

    return {
      findings,
      grouped: { needAction, shouldReview, normal },
      counts,
      count: findings.length,
      isHealthy: findings.length === 0,
    };
  },

  /**
   * STEP 4: Ledger Reconciliation Tool
   * Deterministically verifies onHand vs sum of movements across all stock levels.
   */
  reconcile_ledger(params = {}, state) {
    const products = state?.data?.products || [];
    const levels = state?.data?.levels || [];
    const movements = state?.data?.movements || [];
    const sums = new Map();
    for (const m of movements) {
      if (['reserve', 'release', 'damage'].includes(m.type)) continue;
      const k = `${m.productId}:${m.warehouseId}`;
      sums.set(k, (sums.get(k) || 0) + Number(m.qty || 0));
    }
    const mismatches = [];
    for (const lv of levels) {
      const k = `${lv.productId}:${lv.warehouseId}`;
      const sum = sums.get(k) || 0;
      const onHand = Number(lv.onHand || 0);
      const diff = Math.abs(onHand - sum);
      if (diff > 0) {
        const prod = products.find(x => x.id === lv.productId);
        mismatches.push({
          productId: lv.productId,
          warehouseId: lv.warehouseId,
          productName: prod?.name || lv.productId,
          onHand,
          ledgerSum: sum,
          diff,
        });
      }
    }
    return {
      mismatch: mismatches.length,
      mismatches,
      reconciled: mismatches.length === 0,
      checkedCount: levels.length,
    };
  },

  /**
   * STEP 5: Stock Diagnosis
   * Traces movements, transactions, and ledger reconciliation for a product.
   */
  diagnose_stock({ productId, query }, state, envelope, actor) {
    let targetId = productId || envelope?.current_product_id;
    if (!targetId && query) {
      const search = TOOLS.search_products({ query }, state);
      if (search.count === 1) targetId = search.candidates[0].id;
      else if (search.count > 1) {
        return {
          found: false,
          isAmbiguous: true,
          candidates: search.candidates,
          message: `Tìm thấy ${search.count} sản phẩm phù hợp. Vui lòng chọn sản phẩm cụ thể:`,
        };
      }
    }

    if (!targetId && (state.data?.products || []).length) {
      targetId = state.data.products[0].id;
    }

    const p = (state.data?.products || []).find(x => x.id === targetId);
    if (!p) return { found: false, error: `Không tìm thấy sản phẩm.` };

    const totals = totalFor(state.data, p.id);
    const movements = state.data?.movements || [];
    const prodMovements = movements
      .filter(m => m.productId === p.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const recentMovements = prodMovements.slice(0, 5).map(m => ({
      type: m.type,
      qty: Number(m.qty || 0),
      reason: m.reason || m.reference || m.type,
      time: m.createdAt || '—',
      warehouseId: m.warehouseId,
      after: m.after?.onHand ?? '—',
    }));

    const firstWh = (state.data?.warehouses || [])[0]?.id;
    let recon = { pass: true, mismatch: 0, onHand: totals.onHand, ledgerSum: totals.onHand };
    if (firstWh) {
      const k = `${p.id}:${firstWh}`;
      const mSums = new Map();
      for (const m of movements) {
        if (['reserve', 'release', 'damage'].includes(m.type)) continue;
        const mk = `${m.productId}:${m.warehouseId}`;
        mSums.set(mk, (mSums.get(mk) || 0) + Number(m.qty || 0));
      }
      const sum = mSums.get(k) || 0;
      const lv = levelFor(state.data, p.id, firstWh);
      const onHand = lv ? Number(lv.onHand || 0) : 0;
      const diff = Math.abs(onHand - sum);
      recon = { pass: diff === 0, mismatch: diff, onHand, ledgerSum: sum };
    }

    return {
      found: true,
      productId: p.id,
      productName: p.name,
      currentStock: totals.onHand,
      availableStock: totals.available,
      reservedStock: totals.reserved,
      recentMovements,
      totalMovementsCount: prodMovements.length,
      reconciliation: recon,
      summary: `Sản phẩm "${p.name}": Tồn thực tế ${totals.onHand}, khả dụng ${totals.available}. Đã ghi nhận ${prodMovements.length} giao dịch phát sinh trong sổ kho. Đối soát sổ cái: ${recon.pass ? 'Khớp 100% (mismatch: 0)' : `Lệch ${recon.mismatch}`}.`,
    };
  },

  /**
   * STEP 6: Transfer Diagnosis
   * Traces actual transfer lifecycle, source/destination evidence, and next valid action.
   */
  diagnose_transfer({ transferId }, state, envelope, actor) {
    const transfers = state.data?.transfers || [];
    let tr = null;
    if (transferId) {
      tr = transfers.find(t => t.id === transferId || t.operation_id === transferId);
    }
    if (!tr && transfers.length > 0) {
      tr = transfers.find(t => t.status === 'in_transit') || transfers[transfers.length - 1];
    }

    if (!tr) {
      return { found: false, message: 'Chưa có phiếu chuyển kho nào trong hệ thống.' };
    }

    const fromWh = (state.data?.warehouses || []).find(w => w.id === tr.fromWarehouseId);
    const toWh = (state.data?.warehouses || []).find(w => w.id === tr.toWarehouseId);
    const products = state.data?.products || [];

    const lines = (tr.lines || []).map(l => {
      const prod = products.find(p => p.id === l.productId);
      return {
        productId: l.productId,
        productName: prod?.name || l.productId,
        qty: l.qty,
      };
    });

    let nextAction = '';
    if (tr.status === 'in_transit') {
      nextAction = `Hàng đang chuyển từ "${fromWh?.name}" sang "${toWh?.name}". Kho nhận cần vào màn hình Kho để kiểm đếm và bấm "Xác nhận hàng".`;
    } else if (tr.status === 'received') {
      nextAction = `Phiếu chuyển đã hoàn tất thành công. Hàng hóa đã được nhập đủ vào kho "${toWh?.name}".`;
    } else if (tr.status === 'cancelled') {
      nextAction = `Phiếu chuyển đã bị hủy. Hàng hóa đã được hoàn trả nguyên vẹn về kho "${fromWh?.name}".`;
    }

    return {
      found: true,
      transferId: tr.id,
      status: tr.status,
      fromWarehouseName: fromWh?.name || tr.fromWarehouseId,
      toWarehouseName: toWh?.name || tr.toWarehouseId,
      lines,
      createdAt: tr.createdAt || tr.created_at || '—',
      receivedAt: tr.receivedAt || null,
      note: tr.note || '',
      nextAction,
    };
  },

  /**
   * STEP 7: Shift / Cash Diagnosis
   * Deterministic cash balance & shift discrepancy verification.
   */
  diagnose_shift({ shiftId }, state, envelope, actor) {
    const shifts = state.data?.shifts || [];
    let sh = null;
    if (shiftId) sh = shifts.find(s => s.id === shiftId);
    if (!sh && shifts.length > 0) {
      sh = shifts.find(s => s.status === 'OPEN') || shifts[shifts.length - 1];
    }

    if (!sh) {
      return {
        found: false,
        message: 'Chưa có ca bán hàng nào được mở trên thiết bị này.',
        expectedCash: 0,
        openingCash: 0,
        cashSalesTotal: 0,
        cashSalesCount: 0,
        countedCash: null,
        difference: 0,
        isBalanced: true,
      };
    }

    const openingCash = Number(sh.opening_cash || 0);
    const sales = state.data?.sales || [];
    const shiftStart = sh.opened_at || '';
    const shiftEnd = sh.closed_at || new Date().toISOString();

    let cashSalesTotal = 0;
    let cashSalesCount = 0;
    for (const s of sales) {
      const sTime = s.created_at || s.createdAt || '';
      if (sTime >= shiftStart && sTime <= shiftEnd) {
        for (const p of (s.payments || [])) {
          if (p.method === 'cash' && p.status === 'PAID') {
            cashSalesTotal += Number(p.amount || 0);
            cashSalesCount++;
          }
        }
      }
    }

    // Step 18: Account for cash refunds strictly matching engine.js line 86
    const refunds = state.data?.refunds || [];
    const salesMap = new Map(sales.map(s => [s.id, s]));
    let cashRefundsTotal = 0;
    let cashRefundsCount = 0;
    for (const r of refunds) {
      const rTime = r.created_at || r.createdAt || '';
      if (r.shift_id === sh.id || (rTime >= shiftStart && rTime <= shiftEnd)) {
        const origSale = salesMap.get(r.sale_id);
        const method = r.method === 'original' ? (origSale?.payment_method || 'cash') : (r.method || 'cash');
        if (method === 'cash') {
          cashRefundsTotal += Math.max(0, Number(r.amount || 0));
          cashRefundsCount++;
        }
      }
    }

    const expectedCash = Math.max(0, openingCash + cashSalesTotal - cashRefundsTotal);
    const isClosed = sh.status === 'CLOSED';
    const countedCash = isClosed ? Number(sh.counted_cash || 0) : null;
    const difference = isClosed ? Number(sh.difference || 0) : null;

    return {
      found: true,
      shiftId: sh.id,
      status: sh.status,
      employee: sh.employee || 'Thiết bị này',
      openedAt: sh.opened_at,
      closedAt: sh.closed_at,
      openingCash,
      cashSalesTotal,
      cashSalesCount,
      cashRefundsTotal,
      cashRefundsCount,
      expectedCash,
      countedCash,
      difference,
      isBalanced: isClosed ? difference === 0 : true,
      summary: `Ca ${sh.status === 'OPEN' ? 'đang mở' : 'đã đóng'}: Tiền đầu ca ${new Intl.NumberFormat('vi-VN').format(openingCash)} ₫, thu tiền mặt bán hàng ${new Intl.NumberFormat('vi-VN').format(cashSalesTotal)} ₫ (${cashSalesCount} lượt thu)${cashRefundsTotal > 0 ? `, chi hoàn tiền mặt ${new Intl.NumberFormat('vi-VN').format(cashRefundsTotal)} ₫` : ''}. Tiền mặt dự kiến: ${new Intl.NumberFormat('vi-VN').format(expectedCash)} ₫.${isClosed ? ` Thực kiểm: ${new Intl.NumberFormat('vi-VN').format(countedCash)} ₫ (Lệch: ${new Intl.NumberFormat('vi-VN').format(difference)} ₫).` : ''}`,
    };
  },

  clarify_ambiguity(params = {}) {
    return {
      message: 'Yêu cầu của bạn cần thêm thông tin xác nhận. Vui lòng chọn một trong các thao tác cụ thể.',
      isAmbiguous: true,
      status: 'NEEDS_CLARIFICATION',
    };
  },
};

/**
 * Execute a registered tool safely with context and state.
 * Section F Guard: Hard deny if tool is not in computed allowlist.
 * @param {string} toolName
 * @param {Object} params
 * @param {Object} state
 * @param {Object} envelope
 * @returns {*} Result of the tool execution
 */
export function executeTool(toolName, params = {}, state = {}, envelope = null) {
  const actor = (envelope && envelope.actor_role)
    ? { id: envelope.actor_id, role: envelope.actor_role }
    : getCurrentActor();

  const toolFn = TOOLS[toolName];
  if (!toolFn) {
    reportToolSelectedNotExecuted({
      userPrompt: envelope?.user_prompt || envelope?.raw_prompt || envelope?.prompt || '',
      toolName,
      toolSelected: toolName,
      route: envelope?.current_route || envelope?.route || 'dashboard',
      role: actor?.role || 'cashier',
      correlationId: envelope?.correlation_id || envelope?.correlationId,
      intakeUrl: envelope?.intakeUrl || envelope?.intake_url,
    }).catch(() => {});
    throw new Error(`Tool "${toolName}" không tồn tại trong Tool Registry.`);
  }

  // Section F: Dynamic Tool Allowlist Enforcement
  if (!isToolAllowed(toolName, actor, envelope)) {
    throw new Error(`HARD DENY: Tool "${toolName}" không được phép thực thi đối với vai trò ${actor.role} (Vi phạm Tool Allowlist).`);
  }

  try {
    return toolFn(params, state, envelope, actor);
  } catch (err) {
    reportToolError({
      userPrompt: envelope?.user_prompt || envelope?.raw_prompt || envelope?.prompt || '',
      toolName,
      toolSelected: toolName,
      toolParams: params,
      errorMessage: err?.message || String(err),
      route: envelope?.current_route || envelope?.route || 'dashboard',
      role: actor?.role || 'cashier',
      correlationId: envelope?.correlation_id || envelope?.correlationId,
      intakeUrl: envelope?.intakeUrl || envelope?.intake_url,
    }).catch(() => {});
    throw err;
  }
}
