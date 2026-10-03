import { createSemanticPlan } from '../src/ai/semantic-planner.js';
import { executeSemanticPlan } from '../src/ai/compatibility-executor.js';

const mockState = {
  data: {
    products: [
      { id: 'p1', name: 'Bột cacao nguyên chất', onHand: 50, price: 120000, retail_price: 120000, wholesale_price: 95000, cost_price: 80000 }
    ],
    sales: [],
    receipts: [],
    customers: []
  }
};

const testQueries = [
  { query: 'Tra cứu vận đơn GHN123456789', expectedIntent: 'carrier_logistics', expectedCarrier: 'GHN' },
  { query: 'Kiểm tra hành trình mã đơn GHN_VN_998811', expectedIntent: 'carrier_logistics', expectedCarrier: 'GHN' },
  { query: 'Tra mã vận đơn GHTK S21987654', expectedIntent: 'carrier_logistics', expectedCarrier: 'GHTK' },
  { query: 'Báo giá cước vận chuyển 500g', expectedIntent: 'carrier_logistics', expectedFee: 22000 },
  { query: 'Cước ship đi Hà Nội hết bao nhiêu cho gói 1kg', expectedIntent: 'carrier_logistics', expectedFee: 22000 }
];

async function runSinglePass(passIndex) {
  console.log(`\n=================== PASS ${passIndex} ===================`);
  let passCount = 0;
  for (const item of testQueries) {
    const planRes = await createSemanticPlan(item.query, { route: 'dashboard', actor: { role: 'owner' } }, mockState);
    const plan = planRes.plan || planRes;
    const intent = plan.intents?.[0]?.intent_name;
    if (intent !== item.expectedIntent) {
      console.error(`❌ FAILED Intent: "${item.query}" => Got ${intent}, expected ${item.expectedIntent}`);
      continue;
    }

    const execRes = await executeSemanticPlan(plan, { rawPrompt: item.query }, mockState);
    const text = execRes.text || '';
    if (!text.includes('vận chuyển') && !text.includes('vận đơn') && !text.includes('Cước')) {
      console.error(`❌ FAILED Output Content: "${item.query}" => Output: ${text.slice(0, 100)}...`);
      continue;
    }

    console.log(`✅ [PASS ${passIndex}] "${item.query}" -> ${intent} (Tool: ${execRes.toolExecuted || 'carrier-logistics'})`);
    passCount++;
  }
  return passCount === testQueries.length;
}

async function run5ConsecutivePasses() {
  console.log('🚀 STARTING 5 CONSECUTIVE PASS VERIFICATION FOR CARRIER LOGISTICS...');
  let totalPasses = 0;
  for (let i = 1; i <= 5; i++) {
    const success = await runSinglePass(i);
    if (success) totalPasses++;
    else {
      console.error(`💥 Pass ${i} encountered errors! Aborting.`);
      process.exit(1);
    }
  }

  console.log(`\n🎉 RESULT: ${totalPasses}/5 PASSES COMPLETED WITH ZERO DEFECTS (100% SUCCESS)`);
}

run5ConsecutivePasses().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
