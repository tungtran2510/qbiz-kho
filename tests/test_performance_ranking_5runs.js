import { createSemanticPlan } from '../src/ai/semantic-planner.js';
import { executeSemanticPlan } from '../src/ai/compatibility-executor.js';

const mockState = {
  data: {
    products: [
      { id: 'p1', name: 'Bột cacao nguyên chất', onHand: 50, price: 120000, retail_price: 120000, wholesale_price: 95000, cost_price: 80000 },
      { id: 'p2', name: 'Trà ô long thượng hạng', onHand: 20, price: 150000, retail_price: 150000, wholesale_price: 120000, cost_price: 90000 }
    ],
    sales: [],
    receipts: [],
    customers: []
  }
};

const query = 'Mặt hàng nào bán chạy nhất tuần này?';

async function run5() {
  console.log('🚀 TESTING PRODUCT PERFORMANCE RANKING 5 CONSECUTIVE PASSES...');
  for (let i = 1; i <= 5; i++) {
    const planRes = await createSemanticPlan(query, { route: 'dashboard', actor: { role: 'owner' } }, mockState);
    const plan = planRes.plan || planRes;
    const execRes = await executeSemanticPlan(plan, { rawPrompt: query }, mockState);
    const text = execRes.text || '';
    if (text.includes('chưa được đăng ký trong hệ thống')) {
      console.error(`❌ FAILED at pass ${i}:`, text);
      process.exit(1);
    }
    console.log(`✅ [PASS ${i}] "${query}" -> Status: ${execRes.status || 'SUCCESS'} | Text: "${text.slice(0, 70)}..."`);
  }
  console.log('\n🎉 ALL 5 PASSES VERIFIED PERFECTLY (100% PASS)');
}

run5().catch(e => {
  console.error(e);
  process.exit(1);
});
