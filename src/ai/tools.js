/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — TOOL LAYER
 * Strict rule: Tools MUST NOT access IndexedDB directly.
 * All tools wrap existing business engine read functions and produce Structured Proposals.
 */

import { totalFor, levelFor, available, calculateSalesMetrics } from '../engine.js';
import { createProposal } from './proposals.js';
import { isToolAllowed, hasCapability, PERMISSIONS, OPERATIONAL_THRESHOLDS } from './policy.js';
import { getCurrentActor } from './context.js';
import { MERCHANDISING_TOOLS } from './merchandising/tools.js';
import { reportToolError, reportToolSelectedNotExecuted } from './error-reporter.js';

/**
 * Normalizes a Vietnamese string for case and diacritic-insensitive matching.
 */
function norm(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
    pNorm === '7d' || pNorm === 'week' ||
    pNorm.includes('tuan nay') || pNorm.includes('7 ngay qua') || pNorm.includes('7 ngay gan day')
  ) {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    label = 'tuần này';
  } else if (pNorm === 'last_week' || pNorm.includes('tuan truoc')) {
    start.setDate(now.getDate() - 13);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 7);
    end.setHours(23, 59, 59, 999);
    label = 'tuần trước';
  } else if (pNorm === '30d' || pNorm.includes('30 ngay qua') || pNorm.includes('30 ngay gan day')) {
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

export const TOOLS = {
  ...MERCHANDISING_TOOLS,

  /**
   * Search products by text query (name, SKU, barcode).
   * If query is ambiguous (multiple matches), returns array of candidate items.
   */
  search_products({ query }, state) {
    const q = norm(query);
    const products = state?.data?.products || [];
    if (!q) {
      return { count: 0, candidates: [] };
    }

    const matches = products.filter(p => {
      if (p.active === false) return false;
      return (
        norm(p.name).includes(q) ||
        norm(p.sku).includes(q) ||
        norm(p.barcode).includes(q)
      );
    });

    const candidates = matches.map(p => {
      const tot = totalFor(state.data, p.id);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        price: p.price || 0,
        available: tot.available,
        onHand: tot.onHand,
        unit: p.unit || 'cái',
      };
    });

    return {
      count: candidates.length,
      candidates,
      isAmbiguous: candidates.length > 1,
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
  get_available_stock({ productId }, state) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    if (!p) return { found: false, available: 0 };
    const tot = totalFor(state.data, p.id);
    return { found: true, productId: p.id, productName: p.name, available: tot.available };
  },

  /**
   * Find products whose available stock is less than or equal to their lowStock threshold.
   */
  find_low_stock(params, state) {
    const products = state?.data?.products || [];
    const lowStockItems = [];

    for (const p of products) {
      if (p.type === 'SERVICE' || p.trackInventory === false) continue;
      const tot = totalFor(state.data, p.id);
      const threshold = Number(p.lowStock || 0);
      if (tot.available <= threshold) {
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
  get_sales_summary({ period = 'today', customStart = null, customEnd = null }, state) {
    const { start, end, label } = resolveDateInterval(period, new Date(), customStart, customEnd);
    const metrics = calculateSalesMetrics({
      sales: state?.data?.sales || [],
      orders: state?.data?.orders || [],
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
    const q = norm(query);
    const customers = state?.data?.customers || [];
    if (!q) return { count: 0, customers: [] };

    const matches = customers.filter(c => {
      if (c.active === false) return false;
      return (
        norm(c.name).includes(q) ||
        norm(c.phone).includes(q) ||
        norm(c.customer_code).includes(q)
      );
    });

    return {
      count: matches.length,
      customers: matches.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        code: c.customer_code || c.code || '',
        default_discount: c.default_discount || 0,
      })),
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
  create_issue_proposal({ productId, warehouseId, qty, reason = 'Đề xuất xuất kho / giảm tồn', variantId, variantName }, state, envelope) {
    const p = (state?.data?.products || []).find(x => x.id === productId);
    const wh = (state?.data?.warehouses || []).find(w => w.id === warehouseId) || (state?.data?.warehouses || [])[0];
    const nQty = Number(qty || 1);
    const targetWhId = wh?.id || warehouseId;
    const curLevel = targetWhId ? levelFor(state?.data, productId, targetWhId) : null;
    const avail = curLevel ? available(curLevel) : 0;
    const inventorySnapshot = {
      productId,
      warehouseId: targetWhId,
      onHand: curLevel ? Number(curLevel.onHand || 0) : 0,
      reserved: curLevel ? Number(curLevel.reserved || 0) : 0,
      available: avail,
    };

    const displayProdName = p ? (variantName ? `${p.name} (${variantName})` : p.name) : productId;

    return createProposal({
      requestId: envelope?.request_id,
      skillId: 'issue-proposal',
      intent: 'create_issue_proposal',
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
      humanSummary: `Xuất kho / Giảm ${nQty} ${p?.unit || 'cái'} "${displayProdName}" khỏi kho "${wh?.name || 'Kho chính'}"`,
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
