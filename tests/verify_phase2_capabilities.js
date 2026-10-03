/**
 * Verification Script for AI Migration Phase 2: Capability Bridge & Evidence Execution
 * 
 * Verifies:
 * 1. Capability Registry single source of truth & dynamic manifest generation
 * 2. Strict capability validation in semantic planner
 * 3. Ambiguity guard blocks auto-execution on ambiguous entity references
 * 4. Multi-read sequential execution DAG (1_PLAN_N_TOOLS)
 * 5. Write intent remains Proposal-only (MODEL_DIRECT_DB_WRITE_COUNT = 0)
 * 6. Evidence packet construction and verification invariants
 */

import { KHO_CAPABILITY_REGISTRY, generateModelToolManifest, isValidCapability, getRegistryStats } from '../src/ai/capability-registry.js';
import { validateSemanticPlan, buildContextCapsule, TOOL_MANIFEST } from '../src/ai/semantic-planner.js';
import { executeSemanticPlan } from '../src/ai/compatibility-executor.js';
import { resolveIntentEntities, buildEvidencePacket, verifyEvidencePacket } from '../src/ai/evidence-engine.js';

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

async function runVerification() {
  console.log('=== QBiz Kho AI Migration Phase 2 Empirical Verification ===\n');

  // 1. Dynamic Tool Manifest & Single Source of Truth
  console.log('1. Capability Registry & Dynamic Manifest:');
  const manifest = generateModelToolManifest();
  const stats = getRegistryStats();
  assert(manifest.length === stats.canonical_capabilities_count, `Manifest length (${manifest.length}) equals canonical capabilities count (${stats.canonical_capabilities_count})`);
  assert(TOOL_MANIFEST.length === manifest.length, `semantic-planner TOOL_MANIFEST is dynamically generated from registry (${TOOL_MANIFEST.length} tools)`);
  assert(isValidCapability('check_stock') === true, 'Registered capability check_stock is recognized as valid');
  assert(isValidCapability('malicious_arbitrary_eval') === false, 'Unregistered capability is recognized as invalid');

  // 2. Strict Capability Validation in Semantic Plan
  console.log('\n2. Strict Capability Validation in Semantic Planner:');
  const validPlan = {
    request_id: 'plan_test_1',
    intents: [
      { intent_name: 'check_stock', required_capability: 'check_stock', mode: 'READ' }
    ]
  };
  assert(validateSemanticPlan(validPlan).valid === true, 'Valid plan with registered capability is accepted');

  const invalidPlan = {
    request_id: 'plan_test_2',
    intents: [
      { intent_name: 'arbitrary_exec', required_capability: 'drop_database', mode: 'WRITE' }
    ]
  };
  const invalidRes = validateSemanticPlan(invalidPlan);
  assert(invalidRes.valid === false, 'Plan with unregistered capability is rejected');
  assert(invalidRes.error.includes('UNREGISTERED_CAPABILITY_drop_database'), 'Rejection error specifies unregistered capability');

  // 3. Ambiguity Guard
  console.log('\n3. Ambiguity Guard on Entity Resolution:');
  const mockState = {
    data: {
      products: [
        { id: 'prod_cf_1', name: 'Cà phê hạt Robusta', sku: 'CF-ROB-01', unit: 'kg', onHand: 20 },
        { id: 'prod_cf_2', name: 'Cà phê hòa tan sữa', sku: 'CF-MILK-02', unit: 'hộp', onHand: 15 },
        { id: 'prod_tra_1', name: 'Trà ô long thượng hạng', sku: 'TRA-OL-01', unit: 'gói', onHand: 5 },
      ],
      warehouses: [
        { id: 'wh_center', name: 'Kho Trung Tâm' },
      ],
      orders: [],
      customers: [],
    }
  };

  const ambiguousIntent = {
    intent_name: 'check_ambiguous_stock',
    required_capability: 'check_stock',
    mode: 'READ',
    entities: { productName: 'cà phê' },
  };

  const resolved = resolveIntentEntities(ambiguousIntent, {}, mockState);
  assert(resolved.isAmbiguous === true, 'Ambiguous product query detected');
  assert(resolved.ambiguousCandidates.length === 2, 'Found 2 candidates matching "cà phê"');

  const ambiguousPlan = {
    request_id: 'plan_ambiguous',
    intents: [ambiguousIntent],
  };

  const ambExecRes = await executeSemanticPlan(ambiguousPlan, {}, mockState);
  assert(ambExecRes.isAmbiguous === true, 'Executor halted auto-execution for ambiguous product');
  assert(ambExecRes.status === 'CLARIFICATION_REQUIRED' || ambExecRes.status === 'AMBIGUOUS_CLARIFICATION_REQUIRED', 'Returned CLARIFICATION_REQUIRED status');
  assert(ambExecRes.toolExecuted === null, 'No tool auto-executed on ambiguous entity');

  // 4. Multi-Read Execution DAG (1_PLAN_N_TOOLS)
  console.log('\n4. Multi-Read Sequential Execution (1_PLAN_N_TOOLS):');
  const multiReadPlan = {
    request_id: 'plan_multi_read',
    intents: [
      { intent_name: 'query_tra_stock', required_capability: 'check_stock', mode: 'READ', entities: { productName: 'Trà ô long' } },
      { intent_name: 'find_low_stock_items', required_capability: 'find_low_stock', mode: 'READ', entities: {} },
    ],
    provider_trace: {
      provider: 'TEST_SUITE',
      model: 'test-model',
      is_model_reasoning: true,
    }
  };

  const multiRes = await executeSemanticPlan(multiReadPlan, { shop_id: 'shop_test' }, mockState);
  assert(multiRes.plan_intent_count === 2, 'Multi-read plan executed 2 intents');
  assert(multiRes.tools_executed.length === 2, '2 distinct tools executed');
  assert(multiRes.evidence_packets.length === 2, '2 evidence packets constructed');
  assert(multiRes.evidence_verified === true, 'All evidence packets verified');
  assert(multiRes.verification === 'PASS', 'Overall verification status is PASS');

  // 5. WRITE Intent as Proposal Only (MODEL_DIRECT_DB_WRITE_COUNT = 0)
  console.log('\n5. Write Intent Proposal Safety:');
  const writePlan = {
    request_id: 'plan_write_test',
    intents: [
      {
        intent_name: 'create_receipt',
        required_capability: 'receipt_proposal',
        mode: 'WRITE',
        entities: { productId: 'prod_tra_1', quantity: 50 }
      }
    ],
    provider_trace: {
      provider: 'TEST_SUITE',
      model: 'test-model',
      is_model_reasoning: true,
    }
  };

  const writeRes = await executeSemanticPlan(writePlan, { shop_id: 'shop_test' }, mockState);
  assert(writeRes.risk_class === 'WRITE_PROPOSAL', 'Risk class marked as WRITE_PROPOSAL');
  assert(writeRes.proposal !== null, 'Proposal object generated');
  assert(writeRes.proposal.isProposal === true || writeRes.proposal.status !== 'COMMITTED', 'Proposal status is not auto-committed to DB');

  // 6. Evidence Packet Invariants Verification
  console.log('\n6. Evidence Packet Verification Invariants:');
  const mockCap = KHO_CAPABILITY_REGISTRY['check_stock'];
  const validPacket = buildEvidencePacket({
    capability: mockCap,
    toolBinding: 'check-stock',
    resolvedContext: { productId: 'prod_tra_1', warehouseId: 'wh_center', timeRange: { label: 'today' } },
    rawResult: { text: 'Còn 5 gói', status: 'SUCCESS' },
    context: { shop_id: 'shop_test' },
    state: mockState,
  });

  const validVer = verifyEvidencePacket(validPacket, mockCap, { shop_id: 'shop_test' }, mockState);
  assert(validVer.verified === true, 'Valid evidence packet passes verification');

  // Tenant Boundary Mismatch Check
  const tenantMismatchVer = verifyEvidencePacket(validPacket, mockCap, { shop_id: 'different_tenant' }, mockState);
  assert(tenantMismatchVer.verified === false, 'Tenant mismatch caught by verifier');
  assert(tenantMismatchVer.failureReason === 'TENANT_BOUNDARY_MISMATCH', 'Failure reason is TENANT_BOUNDARY_MISMATCH');

  // Unauthorized Mutation in READ Check
  const mutPacket = { ...validPacket, payload: { mutationCommitted: true } };
  const mutVer = verifyEvidencePacket(mutPacket, mockCap, { shop_id: 'shop_test' }, mockState);
  assert(mutVer.verified === false, 'Unauthorized mutation in READ capability caught by verifier');
  assert(mutVer.failureReason === 'UNAUTHORIZED_MUTATION_IN_READ_CAPABILITY', 'Failure reason is UNAUTHORIZED_MUTATION_IN_READ_CAPABILITY');

  console.log(`\n=== Verification Complete: ${passedChecks}/${totalChecks} checks passed ===`);
}

runVerification().catch(err => {
  console.error('Verification failed with uncaught exception:', err);
  process.exit(1);
});
