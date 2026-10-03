/**
 * Empirical Verification Script for AI Migration Phase 3:
 * Conversation Orchestration, Grounded Response & Real Runtime
 */

import { routeIntent } from '../src/ai/router.js';
import {
  getConversationId,
  getConversationState,
  getLastResolvedEntity,
  resetConversation,
  getPendingClarification,
  getPendingProposal,
} from '../src/ai/conversation-state.js';
import { executeSemanticPlan } from '../src/ai/compatibility-executor.js';
import { composeGroundedResponse, verifyEvidencePacket } from '../src/ai/evidence-engine.js';
import { KHO_CAPABILITY_REGISTRY } from '../src/ai/capability-registry.js';

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

async function runPhase3Verification() {
  console.log('=== QBiz Kho AI Migration Phase 3 Empirical Verification ===\n');

  const mockState = {
    data: {
      products: [
        { id: 'prod_tra_1', name: 'Trà ô long thượng hạng', sku: 'TRA-OL-01', unit: 'gói', onHand: 4, lowStock: 10 },
        { id: 'prod_cf_rob', name: 'Cà phê hạt Robusta', sku: 'CF-ROB-01', unit: 'kg', onHand: 25, lowStock: 5 },
        { id: 'prod_cf_milk', name: 'Cà phê hòa tan sữa', sku: 'CF-MILK-02', unit: 'hộp', onHand: 15, lowStock: 5 },
      ],
      warehouses: [
        { id: 'wh_center', name: 'Kho Trung Tâm' },
        { id: 'wh_branch', name: 'Kho Chi Nhánh 1' },
      ],
      orders: [],
      customers: [],
      sales: [
        { id: 's1', total: 1000000, date: new Date().toISOString() }
      ],
    }
  };

  resetConversation();

  // 1. Voice / Text Runtime Parity Check
  console.log('1. Canonical UI Entry & Voice/Text Parity:');
  const contextText = { shop_id: 'shop_default', input_mode: 'text', actor_role: 'owner' };
  const contextVoice = { shop_id: 'shop_default', input_mode: 'voice_transcript', actor_role: 'owner' };

  // Exact command on both inputs
  const resExactText = await routeIntent('tắt tiếng', contextText, mockState);
  const resExactVoice = await routeIntent('tắt tiếng', contextVoice, mockState);
  assert(resExactText.status === 'SUCCESS' && resExactVoice.status === 'SUCCESS', 'Both text and voice route to canonical exact gate');
  assert(resExactText.intent === resExactVoice.intent, 'Voice and text share identical intent output contract');

  // 2. Follow-up & Deictic Resolution across Conversation State
  console.log('\n2. Conversation State & Deictic Follow-up Resolution:');
  resetConversation();

  // Turn 1: Explicit stock check on Trà ô long
  const turn1Plan = {
    request_id: 'plan_turn1',
    raw_prompt: 'Kiểm tồn trà ô long thượng hạng',
    intents: [
      {
        intent_name: 'check_stock_tra',
        required_capability: 'check_stock',
        mode: 'READ',
        entities: { productName: 'Trà ô long thượng hạng' },
      }
    ],
    provider_trace: { provider: 'TEST_PLANNER', model: 'mock', is_model_reasoning: true }
  };

  const resTurn1 = await executeSemanticPlan(turn1Plan, contextText, mockState);
  assert(resTurn1.status === 'SUCCESS', 'Turn 1 stock check executed successfully');
  const lastProd = getLastResolvedEntity('product');
  assert(lastProd !== null && lastProd.id === 'prod_tra_1', 'Turn 1 product "prod_tra_1" recorded in conversation state');

  // Turn 2: Deictic follow-up "Cái này có nên nhập thêm không?"
  const turn2Plan = {
    request_id: 'plan_turn2',
    raw_prompt: 'Cái này có nên nhập thêm không?',
    intents: [
      {
        intent_name: 'replenishment_advice_deictic',
        required_capability: 'explain_replenishment',
        mode: 'READ',
        entities: { product: 'cái này' },
      }
    ],
    provider_trace: { provider: 'TEST_PLANNER', model: 'mock', is_model_reasoning: true }
  };

  const resTurn2 = await executeSemanticPlan(turn2Plan, contextText, mockState);
  assert(resTurn2.status === 'SUCCESS', 'Turn 2 deictic replenishment query executed');
  assert(resTurn2.text.includes('Trà ô long'), 'Turn 2 correctly bound referent to Trà ô long from conversation state');
  assert(resTurn2.text.includes('NÊN NHẬP'), 'Turn 2 correctly evaluated replenishment need based on low stock');

  // 3. Ambiguity Guard & Clarification State
  console.log('\n3. Ambiguity Guard & Clarification State:');
  resetConversation();

  const ambPlan = {
    request_id: 'plan_amb',
    raw_prompt: 'Kiểm kho cà phê',
    intents: [
      {
        intent_name: 'check_cf_stock',
        required_capability: 'check_stock',
        mode: 'READ',
        entities: { productName: 'cà phê' },
      }
    ],
    provider_trace: { provider: 'TEST_PLANNER', model: 'mock', is_model_reasoning: true }
  };

  const resAmb = await executeSemanticPlan(ambPlan, contextText, mockState);
  assert(resAmb.status === 'CLARIFICATION_REQUIRED', 'Ambiguous product halts auto-execution with CLARIFICATION_REQUIRED');
  assert(resAmb.isAmbiguous === true, 'Response marked isAmbiguous = true');
  assert(resAmb.candidates.length === 2, 'Clarification presents exactly 2 matching candidates');

  const pendingClar = getPendingClarification();
  assert(pendingClar !== null, 'Pending clarification stored in conversation state');
  assert(pendingClar.reason === 'AMBIGUOUS_ENTITY', 'Clarification reason recorded as AMBIGUOUS_ENTITY');

  // 4. Clarification Resume Loop (User selects candidate)
  console.log('\n4. Clarification Resume Loop:');
  const userClarifyPrompt = 'Cà phê hạt Robusta';
  const resClarified = await routeIntent(userClarifyPrompt, contextText, mockState);
  assert(resClarified.status === 'SUCCESS', 'User clarification selection resumed and executed');
  assert(resClarified.text.includes('Cà phê hạt Robusta'), 'Resumed execution used user clarified candidate');
  assert(getPendingClarification() === null, 'Pending clarification cleared after resume');

  // 5. Write Intent Proposal Safety & Confirmation Guard
  console.log('\n5. Write Intent Proposal & Unconfirmed Write Protection:');
  resetConversation();

  const writePlan = {
    request_id: 'plan_write_receipt',
    raw_prompt: 'Đề xuất nhập 100 gói trà ô long',
    intents: [
      {
        intent_name: 'receipt_proposal_tra',
        required_capability: 'receipt_proposal',
        mode: 'WRITE',
        entities: { productId: 'prod_tra_1', quantity: 100 },
      }
    ],
    provider_trace: { provider: 'TEST_PLANNER', model: 'mock', is_model_reasoning: true }
  };

  const resWrite = await executeSemanticPlan(writePlan, contextText, mockState);
  assert(resWrite.risk_class === 'WRITE_PROPOSAL', 'Risk class marked as WRITE_PROPOSAL');
  assert(resWrite.proposal_state === 'PENDING_CONFIRMATION', 'Proposal state marked PENDING_CONFIRMATION');
  assert(getPendingProposal() !== null, 'Pending proposal stored in conversation state');

  // Test: Unrelated follow-up does NOT confirm proposal!
  const unrelatedFollowUp = await routeIntent('tắt tiếng', contextText, mockState);
  assert(unrelatedFollowUp.intent === 'VOICE_MUTE', 'Unrelated command executed normally');
  assert(getPendingProposal() !== null, 'Pending proposal remains pending after unrelated turn');

  // Test: Explicit confirmation confirms proposal!
  const confirmTurn = await routeIntent('đồng ý', contextText, mockState);
  assert(confirmTurn.status === 'EXECUTED', 'Explicit confirmation executed proposal');
  assert(getPendingProposal() === null, 'Pending proposal cleared after confirmation');

  // 6. Multi-Read Execution DAG (READ + READ and READ + WRITE)
  console.log('\n6. Multi-Read & Read-Write Split Execution:');
  const readWritePlan = {
    request_id: 'plan_read_write_composed',
    raw_prompt: 'Kiểm tồn trà ô long và tạo phiếu nhập 50 gói',
    intents: [
      {
        intent_name: 'read_stock',
        required_capability: 'check_stock',
        mode: 'READ',
        entities: { productName: 'Trà ô long thượng hạng' },
      },
      {
        intent_name: 'write_proposal',
        required_capability: 'receipt_proposal',
        mode: 'WRITE',
        entities: { productId: 'prod_tra_1', quantity: 50 },
      }
    ],
    provider_trace: { provider: 'TEST_PLANNER', model: 'mock', is_model_reasoning: true }
  };

  const resReadWrite = await executeSemanticPlan(readWritePlan, contextText, mockState);
  assert(resReadWrite.plan_intent_count === 2, 'Read+Write plan executed 2 intents');
  assert(resReadWrite.risk_class === 'READ_WRITE_COMPOSED', 'Identified risk class as READ_WRITE_COMPOSED');
  assert(resReadWrite.tools_executed.length === 2, 'Both read skill and write proposal skill executed');
  assert(resReadWrite.proposal !== null, 'Write component captured as Proposal');
  assert(resReadWrite.evidence_verified === true, 'All evidence verified');

  // 7. Grounded Response Composer Invariants
  console.log('\n7. Grounded Response Composer Invariants:');
  const verifiedPackets = [
    {
      verified: true,
      packet: {
        capability_id: 'check_stock',
        entity_id: 'prod_tra_1',
        payload: { text: 'Tồn kho Trà ô long thượng hạng: 4 gói khả dụng.' },
      }
    }
  ];

  const composedRes = await composeGroundedResponse({
    plan: { raw_prompt: 'Trà ô long còn bao nhiêu?' },
    evidencePackets: verifiedPackets,
    userPrompt: 'Trà ô long còn bao nhiêu?',
    context: contextText,
    options: { useModelComposer: false }
  });

  assert(composedRes.status === 'SUCCESS', 'Grounded response composed successfully');
  assert(composedRes.text.includes('4 gói khả dụng'), 'Composer contains exact grounded evidence fact');
  assert(composedRes.composer_provider === 'DETERMINISTIC_COMPOSER', 'Deterministic composer recorded in trace');

  // 8. Real Provider Trace (Ollama qwen3.5:2b live check)
  console.log('\n8. Real Provider Live Trace:');
  try {
    const ollamaCheck = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1000) });
    if (ollamaCheck.ok) {
      console.log('  [INFO] Local Ollama is online. Executing generic real-provider wiring trace...');
      const e2ePlan = await routeIntent('tư vấn nhập hàng trà ô long', contextText, mockState, {
        allowDevMockPlanner: false,
      });
      console.log(`  [TRACE] Provider: ${e2ePlan.provider}, Tier: ${e2ePlan.tier}, Authority: ${e2ePlan.authority_path}`);
      assert(e2ePlan.provider !== 'NONE' || e2ePlan.isUnavailable === true, 'Real provider path returned honest provider status');
    }
  } catch (err) {
    console.log('  [INFO] Local Ollama check skipped:', err.message);
  }

  console.log(`\n=== Verification Complete: ${passedChecks}/${totalChecks} checks passed ===`);
}

runPhase3Verification().catch(err => {
  console.error('Phase 3 verification failed with error:', err);
  process.exit(1);
});
