import { routeIntent } from '../src/ai/router.js';
import { setLastResolvedProduct } from '../src/ai/context.js';

async function runTests() {
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
      shifts: [], // NO OPEN SHIFT
      returns: [],
      movements: []
    }
  };

  console.log('--- TEST D: Product context: Nhập thêm 20 cái này ---');
  setLastResolvedProduct(null);
  let res = await routeIntent('Nhập thêm 20 cái này vào kho chính', { current_route: 'products', current_product_id: 'p1' }, state);
  console.log('Intent:', res.intent || res.proposal?.intent);
  console.log('Proposal:', res.proposal?.intent, 'Status:', res.proposal?.status);
  console.log('Stock mutated?:', state.data.levels[0].on_hand === 5 ? 'NO (PASS)' : 'YES (MUTATED)');

  console.log('--- TEST E: Warehouse: Chuyển 5 cái sang kho Hà Đông ---');
  setLastResolvedProduct(null);
  res = await routeIntent('Chuyển 5 cái sang kho Hà Đông', { current_route: 'warehouse', current_product_id: 'p1' }, state);
  console.log('Intent:', res.intent || res.proposal?.intent);
  console.log('Proposal:', res.proposal?.intent, 'Status:', res.proposal?.status);
  console.log('Stock mutated?:', (state.data.levels[0].on_hand === 5 && state.data.levels[1].on_hand === 10) ? 'NO (PASS)' : 'YES (MUTATED)');

  console.log('--- TEST F: POS: Thêm 2 cái này vào giỏ ---');
  setLastResolvedProduct(null);
  res = await routeIntent('Thêm 2 cái này vào giỏ', { current_route: 'sales', current_product_id: 'p1' }, state);
  console.log('Intent:', res.intent);
  console.log('Text:', (res.text || '').substring(0, 80));
  console.log('Auto checked out?:', state.data.orders.length === 0 ? 'NO (PASS)' : 'YES');

  console.log('--- TEST G: POS: Tại sao không thanh toán được? (Shift closed) ---');
  setLastResolvedProduct(null);
  res = await routeIntent('Tại sao không thanh toán được?', { current_route: 'sales' }, state);
  console.log('Intent:', res.intent, 'Status:', res.status);
  console.log('Mentions Shift closed?:', res.text.includes('chưa mở ca bán hàng') || res.text.includes('Chưa mở ca bán hàng'));

  console.log('--- TEST I: Role cashier asks: Món nào bán được mà lời thấp? ---');
  setLastResolvedProduct(null);
  res = await routeIntent('Món nào bán được mà lời thấp?', { current_route: 'dashboard', actor_role: 'cashier' }, state);
  console.log('Intent:', res.intent, 'isBlocked:', res.isBlocked, 'permissionDenied:', res.permissionDenied);
  console.log('Hard deny?:', res.text.includes('HARD DENY') || res.text.includes('VIEW_COST'));

  console.log('--- TEST L: Ambiguous: nhập thêm cái này without current product ---');
  setLastResolvedProduct(null);
  res = await routeIntent('nhập thêm cái này', { current_route: 'dashboard' }, state);
  console.log('Status:', res.status, 'isAmbiguous:', res.isAmbiguous);
  console.log('Guessed SKU?:', res.proposal ? 'YES (FAIL)' : 'NO (PASS)');
  console.log('Text:', res.text);

  console.log('--- TEST CHIPS: Section 11 Route Chips ---');
  const chips = [
    { route: 'dashboard', query: 'Hôm nay cần chú ý' },
    { route: 'dashboard', query: 'Có gì bất thường' },
    { route: 'dashboard', query: 'Hàng sắp hết' },
    { route: 'dashboard', query: 'Doanh thu' },
    { route: 'products', query: 'Còn bao nhiêu', pid: 'p1' },
    { route: 'products', query: 'Kho nào còn', pid: 'p1' },
    { route: 'products', query: 'Bán gần đây', pid: 'p1' },
    { route: 'sales', query: 'Tìm hàng' },
    { route: 'sales', query: 'Kiểm tồn' },
    { route: 'sales', query: 'Chọn khách' },
    { route: 'sales', query: 'Ca đang mở?' },
    { route: 'orders', query: 'Đơn vướng gì' },
    { route: 'orders', query: 'Thiếu hàng' },
    { route: 'warehouse', query: 'Có gì bất thường' }
  ];
  for (const c of chips) {
    setLastResolvedProduct(null);
    const chipRes = await routeIntent(c.query, { current_route: c.route, current_product_id: c.pid }, state);
    console.log('CHIP [' + c.route + ' -> ' + c.query + ']:', chipRes.intent || chipRes.skillId, chipRes.status || 'OK');
  }
}

runTests().catch(console.error);
