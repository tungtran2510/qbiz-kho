if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = { getItem: () => 'owner', setItem: () => {}, removeItem: () => {} };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

import { routeIntent } from '../src/ai/router.js';

const mockState = {
  data: {
    products: [
      { id: 'p1', name: 'Bàn chải đánh răng Colgate SlimSoft', sku: 'CG-SLIM', price: 38000, cost_price: 25000, onHand: 115, unit: 'cái' },
      { id: 'p2', name: 'Ghế sáng chế 135', sku: 'DL-135', price: 53762000, cost_price: 35000000, onHand: 47, unit: 'chiếc' }
    ],
    levels: [
      { productId: 'p1', warehouseId: 'wh_center', onHand: 115, reserved: 0 },
      { productId: 'p2', warehouseId: 'wh_center', onHand: 47, reserved: 0 }
    ],
    warehouses: [{ id: 'wh_center', name: 'Kho Trung tâm' }],
    categories: [{ id: 'c1', name: 'Hàng tiêu dùng' }],
    sales: [],
    receipts: [],
    movements: []
  }
};

const queries = [
  'xuất file hàng hóa',
  'xuất file excel danh sách sản phẩm',
  'tải file tồn kho các mặt hàng',
  'xuất file báo cáo xuất nhập tồn tháng này',
  'nhập hàng',
  'tạo phiếu xuất kho',
  'kiểm kê kho'
];

async function run() {
  console.log('=== TEST KIỂM TRA ROUTE INTENT STAGE 1 ===\n');
  for (const q of queries) {
    const res = await routeIntent(q, { route: 'products', actor: { role: 'owner' } }, mockState, { allowLegacyFallback: true });
    console.log(`[QUERY] "${q}"`);
    console.log(` -> Intent: ${res.intent || res.skillId} | Tier: ${res.tier} | Provider: ${res.provider}`);
    const firstLine = (res.text || '').split('\n')[0];
    console.log(` -> Text: "${firstLine}"`);
    if ((res.text || '').includes('Tất cả hàng hóa hiện đều ở mức tồn an toàn') && !q.includes('an toàn')) {
      console.error(`❌ REGRESSION: Câu "${q}" bị ngộ nhận thành tồn an toàn!`);
      process.exit(1);
    }
    console.log(' ✅ PASS\n');
  }
  console.log('🎉 TOÀN BỘ 7/7 CÂU KIỂM THỬ ĐẠT CHUẨN 100%!');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
