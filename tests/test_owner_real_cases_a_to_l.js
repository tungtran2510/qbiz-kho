import { routeIntent } from '../src/ai/router.js';
import { setLastResolvedProduct } from '../src/ai/context.js';

async function testCasesAToL() {
  const state = {
    data: {
      products: [
        { id: 'p1', name: 'Nước Lavie 500ml', price: 10000, cost: 6000, active: true },
        { id: 'p2', name: 'Bánh mì ngọt', price: 15000, cost: 0, active: true }, // missing cost
        { id: 'p3', name: 'Sữa tươi 1L', price: 35000, cost: 28000, active: true }
      ],
      levels: [
        { product_id: 'p1', warehouse_id: 'w1', on_hand: 2, reserved: 0 }, // low stock
        { product_id: 'p1', warehouse_id: 'w2', on_hand: 10, reserved: 0 },
        { product_id: 'p2', warehouse_id: 'w1', on_hand: 50, reserved: 0 },
        { product_id: 'p3', warehouse_id: 'w1', on_hand: 0, reserved: 0 } // out of stock
      ],
      warehouses: [
        { id: 'w1', name: 'Kho Chính' },
        { id: 'w2', name: 'Kho Hà Đông' }
      ],
      orders: [],
      shifts: [], // closed shift
      returns: [],
      movements: [],
      purchase_receipts: [],
      transfers: [],
      customers: [{ id: 'c1', name: 'Anh Nam VIP' }]
    }
  };

  const cases = [
    {
      id: 'A',
      desc: 'Hôm nay cần xử lý gì?',
      input: 'Hôm nay cần xử lý gì?',
      context: { current_route: 'dashboard', actor_role: 'owner' },
      expectedSkill: 'daily-ops-brief'
    },
    {
      id: 'B',
      desc: 'Có gì bất thường?',
      input: 'Có gì bất thường?',
      context: { current_route: 'dashboard', actor_role: 'owner' },
      expectedSkill: 'operational-anomaly-scan'
    },
    {
      id: 'C',
      desc: 'Nên nhập thêm gì?',
      input: 'Nên nhập thêm gì?',
      context: { current_route: 'warehouse', actor_role: 'owner' },
      expectedSkill: 'replenishment-suggestion'
    },
    {
      id: 'D',
      desc: 'Product context: Nhập thêm 20 cái này',
      input: 'Nhập thêm 20 cái này vào kho chính',
      context: { current_route: 'products', current_product_id: 'p1', actor_role: 'owner' },
      expectedSkill: 'create_receipt_proposal'
    },
    {
      id: 'E',
      desc: 'Warehouse: Chuyển 5 cái này sang kho Hà Đông',
      input: 'Chuyển 5 cái sang kho Hà Đông',
      context: { current_route: 'warehouse', current_product_id: 'p1', actor_role: 'owner' },
      expectedSkill: 'create_transfer_proposal'
    },
    {
      id: 'F',
      desc: 'POS: Thêm 2 cái này vào giỏ',
      input: 'Thêm 2 cái này vào giỏ',
      context: { current_route: 'sales', current_product_id: 'p1', actor_role: 'cashier' },
      expectedSkill: 'add-cart-draft'
    },
    {
      id: 'G',
      desc: 'POS: Tại sao không thanh toán được?',
      input: 'Tại sao không thanh toán được?',
      context: { current_route: 'sales', actor_role: 'cashier' },
      expectedSkill: 'explain-blocking-condition'
    },
    {
      id: 'H',
      desc: 'Vì sao doanh thu và tiền mặt khác nhau?',
      input: 'Vì sao doanh thu và tiền mặt khác nhau?',
      context: { current_route: 'dashboard', actor_role: 'owner' },
      expectedSkill: 'shift-cash-explanation'
    },
    {
      id: 'I_manager',
      desc: 'Món nào bán được mà lời thấp? (Role Owner/Manager)',
      input: 'Món nào bán được mà lời thấp?',
      context: { current_route: 'dashboard', actor_role: 'owner' },
      expectedSkill: 'high-revenue-low-margin'
    },
    {
      id: 'I_cashier',
      desc: 'Món nào bán được mà lời thấp? (Role Cashier -> HARD DENY)',
      input: 'Món nào bán được mà lời thấp?',
      context: { current_route: 'dashboard', actor_role: 'cashier' },
      expectedSkill: 'high-revenue-low-margin'
    },
    {
      id: 'J',
      desc: 'Provider unavailable -> Tier 0 Daily Ops',
      input: 'Hôm nay cần chú ý',
      context: { current_route: 'dashboard', actor_role: 'owner' },
      expectedSkill: 'daily-ops-brief'
    },
    {
      id: 'K',
      desc: 'Offline -> Local summary / stock check',
      input: 'Kiểm tồn',
      context: { current_route: 'sales', actor_role: 'cashier' },
      expectedSkill: 'check-stock'
    },
    {
      id: 'L',
      desc: 'Ambiguous: nhập thêm cái này without current product',
      input: 'nhập thêm cái này',
      context: { current_route: 'dashboard', actor_role: 'owner' },
      expectedSkill: 'NEEDS_CLARIFICATION'
    }
  ];

  console.log('============================================================');
  console.log('OWNER-REAL ACCEPTANCE TEST CASES A -> L');
  console.log('============================================================');

  const report = [];

  for (const c of cases) {
    setLastResolvedProduct(null);
    const beforeState = JSON.stringify({
      levels: state.data.levels.map(l => ({ ...l })),
      ordersCount: state.data.orders.length,
      movementsCount: state.data.movements.length
    });

    const res = await routeIntent(c.input, c.context, state);

    const afterState = JSON.stringify({
      levels: state.data.levels.map(l => ({ ...l })),
      ordersCount: state.data.orders.length,
      movementsCount: state.data.movements.length
    });

    const writeCount = beforeState === afterState ? 0 : 1;
    let verdict = 'FAIL';

    if (c.id === 'A') {
      verdict = (res.intent === 'DAILY_OPS_BRIEF' && writeCount === 0) ? 'PASS' : 'FAIL';
    } else if (c.id === 'B') {
      verdict = (res.intent === 'OPERATIONAL_ANOMALY_SCAN' && writeCount === 0) ? 'PASS' : 'FAIL';
    } else if (c.id === 'C') {
      verdict = (res.intent === 'QUERY_STOCK' || res.skillId === 'replenishment-suggestion') ? 'PASS' : 'FAIL';
    } else if (c.id === 'D') {
      verdict = (res.proposal?.intent === 'create_receipt_proposal' && res.proposal?.status === 'READY' && writeCount === 0) ? 'PASS' : 'FAIL';
    } else if (c.id === 'E') {
      verdict = (res.proposal?.intent === 'create_transfer_proposal' && res.proposal?.status === 'READY' && writeCount === 0) ? 'PASS' : 'FAIL';
    } else if (c.id === 'F') {
      verdict = (res.intent === 'ADD_CART_DRAFT' && state.data.orders.length === 0) ? 'PASS' : 'FAIL';
    } else if (c.id === 'G') {
      verdict = (res.intent === 'EXPLAIN_BLOCKING_CONDITION' && res.text.includes('ca bán hàng')) ? 'PASS' : 'FAIL';
    } else if (c.id === 'H') {
      verdict = (res.intent === 'SHIFT_CASH_EXPLANATION' && res.text.includes('Doanh thu')) ? 'PASS' : 'FAIL';
    } else if (c.id === 'I_manager') {
      verdict = (res.intent === 'HIGH_REVENUE_LOW_MARGIN' && !res.isBlocked) ? 'PASS' : 'FAIL';
    } else if (c.id === 'I_cashier') {
      verdict = (res.isBlocked && res.permissionDenied && (res.text.includes('HARD DENY') || res.text.includes('VIEW_COST'))) ? 'PASS' : 'FAIL';
    } else if (c.id === 'J') {
      verdict = (res.tier === 0 && res.intent === 'DAILY_OPS_BRIEF') ? 'PASS' : 'FAIL';
    } else if (c.id === 'K') {
      verdict = (res.tier === 0 && res.status !== 'PROVIDER_ERROR') ? 'PASS' : 'FAIL';
    } else if (c.id === 'L') {
      verdict = (res.status === 'NEEDS_CLARIFICATION' && !res.proposal && writeCount === 0) ? 'PASS' : 'FAIL';
    }

    report.push({
      caseId: c.id,
      input: c.input,
      route: c.context.current_route,
      tool: res.skillId || res.proposal?.intent || res.intent || 'NONE',
      writeCount,
      verdict,
      textSnippet: (res.text || '').substring(0, 80).replace(/\n/g, ' ')
    });

    console.log(`[Case ${c.id.padEnd(9, ' ')}] ${c.desc.padEnd(50, ' ')} -> Verdict=${verdict} | Tool=${res.skillId || res.intent} | Writes=${writeCount}`);
  }

  console.log('------------------------------------------------------------');
  const allPass = report.every(r => r.verdict === 'PASS');
  console.log(`OWNER-REAL CASES A->L OVERALL: ${allPass ? 'ALL PASS' : 'SOME FAILED'}`);
  return { allPass, report };
}

testCasesAToL().catch(console.error);
