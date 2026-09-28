import { routeIntent } from '../src/ai/router.js';
import { setLastResolvedProduct } from '../src/ai/context.js';

async function testAll20Chips() {
  const state = {
    data: {
      products: [{ id: 'p1', name: 'Nước Lavie 500ml', price: 10000, cost: 6000, active: true }],
      levels: [
        { product_id: 'p1', warehouse_id: 'w1', on_hand: 5, reserved: 0 },
        { product_id: 'p1', warehouse_id: 'w2', on_hand: 10, reserved: 0 }
      ],
      warehouses: [
        { id: 'w1', name: 'Kho Chính' },
        { id: 'w2', name: 'Kho Hà Đông' }
      ],
      orders: [],
      shifts: [],
      returns: [],
      movements: [],
      customers: [{ id: 'c1', name: 'Khách VIP' }]
    }
  };

  const chips = [
    { id: 1, route: 'dashboard', q: 'Hôm nay cần chú ý', expectedIntent: 'DAILY_OPS_BRIEF' },
    { id: 2, route: 'dashboard', q: 'Có gì bất thường', expectedIntent: 'OPERATIONAL_ANOMALY_SCAN' },
    { id: 3, route: 'dashboard', q: 'Hàng sắp hết', expectedIntent: 'LOW_STOCK_ALERT' },
    { id: 4, route: 'dashboard', q: 'Doanh thu', expectedIntent: 'SALES_SUMMARY' },
    { id: 5, route: 'products', q: 'Còn bao nhiêu', pid: 'p1', expectedIntent: 'CONTEXTUAL_STOCK' },
    { id: 6, route: 'products', q: 'Kho nào còn', pid: 'p1', expectedIntent: 'CHECK_MULTI_WAREHOUSE' },
    { id: 7, route: 'products', q: 'Bán gần đây', pid: 'p1', expectedIntent: 'RECENT_SALES' },
    { id: 8, route: 'products', q: 'Nhập thêm', pid: 'p1', expectedIntent: 'create_receipt_proposal' },
    { id: 9, route: 'sales', q: 'Tìm hàng', expectedIntent: 'SEARCH_PRODUCT' },
    { id: 10, route: 'sales', q: 'Kiểm tồn', expectedIntent: 'NAVIGATION' },
    { id: 11, route: 'sales', q: 'Chọn khách', expectedIntent: 'SELECT_CUSTOMER' },
    { id: 12, route: 'sales', q: 'Ca đang mở?', expectedIntent: 'CHECK_SHIFT_STATUS' },
    { id: 13, route: 'orders', q: 'Đơn vướng gì', expectedIntent: 'ORDER_DIAGNOSIS' },
    { id: 14, route: 'orders', q: 'Thanh toán', expectedIntent: 'CHECKOUT_GUARD' },
    { id: 15, route: 'orders', q: 'Thiếu hàng', expectedIntent: 'LOW_STOCK_ALERT' },
    { id: 16, route: 'warehouse', q: 'Hàng sắp hết', expectedIntent: 'LOW_STOCK_ALERT' },
    { id: 17, route: 'warehouse', q: 'Nhập', expectedIntent: 'RECEIPT' },
    { id: 18, route: 'warehouse', q: 'Chuyển', expectedIntent: 'TRANSFER' },
    { id: 19, route: 'warehouse', q: 'Kiểm kho', expectedIntent: 'STOCKTAKE' },
    { id: 20, route: 'warehouse', q: 'Có gì bất thường', expectedIntent: 'OPERATIONAL_ANOMALY_SCAN' }
  ];

  console.log('============================================================');
  console.log('VERIFY 20 ROUTE CHIPS (MỤC 11 GOOGLE DOC)');
  console.log('============================================================');

  let passed = 0;
  let dead = 0;
  let wrongRouting = 0;
  const results = [];

  for (const c of chips) {
    setLastResolvedProduct(null);
    try {
      const res = await routeIntent(c.q, { current_route: c.route, current_product_id: c.pid }, state);
      const isDead = !res || (!res.text && !res.proposal && !res.action && !res.candidates);
      const isError = res.isError || res.status === 'PROVIDER_ERROR';
      const intentFound = res.intent || res.proposal?.intent || res.action_id || res.skillId;
      const isPass = !isDead && !isError && res.tier === 0;

      if (isPass) passed++;
      if (isDead) dead++;
      if (isError) wrongRouting++;

      results.push({
        id: c.id,
        route: c.route,
        q: c.q,
        intent: intentFound,
        status: res.status || 'OK',
        tier: res.tier,
        text: (res.text || '').substring(0, 60),
        pass: isPass
      });

      console.log(`Chip ${c.id.toString().padStart(2, ' ')} [${c.route.padEnd(9, ' ')} -> ${c.q.padEnd(18, ' ')}]: Tier=${res.tier} | Status=${(res.status || 'OK').padEnd(19, ' ')} | Intent=${intentFound || 'NONE'} | PASS=${isPass}`);
    } catch (e) {
      dead++;
      wrongRouting++;
      console.log(`Chip ${c.id} [${c.route} -> ${c.q}]: EXCEPTION ${e.message}`);
    }
  }

  console.log('------------------------------------------------------------');
  console.log(`TOTAL EXPECTED: ${chips.length}`);
  console.log(`TOTAL TESTED:   ${results.length}`);
  console.log(`TOTAL PASSED:   ${passed}`);
  console.log(`TOTAL DEAD:     ${dead}`);
  console.log(`TOTAL WRONG:    ${wrongRouting}`);
  console.log('------------------------------------------------------------');

  return { expected: chips.length, tested: results.length, passed, dead, wrongRouting, results };
}

testAll20Chips().catch(console.error);
