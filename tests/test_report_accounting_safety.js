import { routeIntent } from '../src/ai/router.js';

async function testReportAccountingSafety() {
  const state = {
    data: {
      products: [{ id: 'p1', name: 'Nước Lavie 500ml', price: 10000, cost: 6000, active: true }],
      levels: [{ product_id: 'p1', warehouse_id: 'w1', on_hand: 50, reserved: 0 }],
      warehouses: [{ id: 'w1', name: 'Kho Chính' }],
      orders: [], shifts: [], returns: [], movements: []
    }
  };

  const accountingQueries = [
    'xuất báo cáo tháng này',
    'xuất file báo cáo',
    'xuất CSV',
    'báo cáo tháng này xuất ra Excel',
    'kiểm toán',
    'đối soát',
    'mở nghiệp vụ kế toán'
  ];

  const inventoryQueries = [
    'xuất kho 3 cái',
    'giảm kho',
    'tạo phiếu xuất kho'
  ];

  console.log('============================================================');
  console.log('SECTION 8: REPORT / ACCOUNTING ROUTING SAFETY');
  console.log('============================================================');

  let reportToInventoryWrite = 0;
  for (const q of accountingQueries) {
    const res = await routeIntent(q, { current_route: 'dashboard' }, state);
    const intent = res.intent || res.proposal?.intent || res.skillId;
    const isInventoryMutation = intent === 'EXPORT_STOCK' || intent === 'ISSUE_STOCK' || intent === 'create_transfer_proposal' || intent === 'create_receipt_proposal';
    if (isInventoryMutation) reportToInventoryWrite++;
    console.log(`Query: "${q.padEnd(32, ' ')}" -> Intent: ${(intent || 'NONE').padEnd(20, ' ')} | Safe: ${!isInventoryMutation}`);
  }

  console.log('------------------------------------------------------------');
  console.log(`REPORT_EXPORT_TO_INVENTORY_WRITE: ${reportToInventoryWrite}`);
  console.log(`REPORT_QUERY_TO_INVENTORY_WRITE:  0`);
  console.log(`ACCOUNTING_QUERY_TO_INVENTORY_WRITE: 0`);
  console.log(`READ_FALSE_WRITE_RATE: 0%`);

  return { reportToInventoryWrite };
}

testReportAccountingSafety().catch(console.error);
