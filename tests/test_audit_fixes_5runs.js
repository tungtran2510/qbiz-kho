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
  {
    query: 'Phát hành hóa đơn điện tử VAT cho Công ty ABC MST 0101234567 mua 5 bột cacao',
    expectedIntent: 'electronic_invoice_proposal',
    shouldHaveProposal: true
  },
  {
    query: 'Kiểm tra kết nối hóa đơn điện tử VNPT và Viettel',
    expectedIntent: 'clarify_ambiguity',
    mustIncludeText: 'Hóa đơn điện tử'
  },
  {
    query: 'Kết nối với phần mềm KiotViet để đồng bộ tồn kho',
    expectedIntent: 'clarify_ambiguity',
    mustIncludeText: 'KiotViet'
  },
  {
    query: 'Lập đơn bán hàng cho khách hàng Nguyễn Văn An mua 2 bột cacao',
    expectedIntent: 'order_proposal',
    shouldHaveProposal: true
  }
];

async function runPass(passIdx) {
  console.log(`\n=================== PASS ${passIdx} ===================`);
  let passed = 0;
  for (const q of testQueries) {
    const planRes = await createSemanticPlan(q.query, { route: 'dashboard', actor: { role: 'owner' } }, mockState);
    const plan = planRes.plan || planRes;
    const intent = plan.intents?.[0]?.intent_name;

    const execRes = await executeSemanticPlan(plan, { rawPrompt: q.query }, mockState);
    const text = execRes.text || '';

    if (text.includes('chưa được đăng ký trong hệ thống')) {
      console.error(`❌ FAILED unregistered skill error for "${q.query}"`);
      return false;
    }

    if (q.shouldHaveProposal && !execRes.proposal) {
      console.error(`❌ FAILED proposal generation for "${q.query}":`, execRes);
      return false;
    }

    if (q.mustIncludeText && !text.includes(q.mustIncludeText)) {
      console.error(`❌ FAILED expected text "${q.mustIncludeText}" in "${q.query}":`, text);
      return false;
    }

    console.log(`✅ [PASS ${passIdx}] "${q.query}" -> ${intent} | Proposal: ${Boolean(execRes.proposal)} | Text: "${text.slice(0, 60)}..."`);
    passed++;
  }
  return passed === testQueries.length;
}

async function run5Passes() {
  console.log('🚀 RUNNING 5-PASS VERIFICATION FOR AUDIT FIXES (Invoice, Clarify Ambiguity, Order Proposal)...');
  for (let i = 1; i <= 5; i++) {
    const ok = await runPass(i);
    if (!ok) {
      console.error(`💥 Failed at pass ${i}`);
      process.exit(1);
    }
  }
  console.log('\n🎉 ALL 5 PASSES VERIFIED SUCCESSFULLY WITH ZERO DEFECTS (100% PASS)');
}

run5Passes().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
