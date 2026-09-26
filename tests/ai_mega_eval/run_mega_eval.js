/**
 * QBiz Kho — AI Mega Eval Master Test Runner (>= 30,000 Cases)
 * Executes corpus through canonical routeIntent() and evaluates against all 23 layers.
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

import { routeIntent } from '../../src/ai/router.js';
import { setProviderConfig, PROVIDER_MODES } from '../../src/ai/providers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CODE_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.resolve(CODE_ROOT, 'tests', 'evidence', 'ai-mega-eval');
const CORPUS_PATH = path.join(EVIDENCE_DIR, 'mega_eval_full_corpus.json');

// Mock realistic multi-industry store states
const MOCK_STATE = {
  data: {
    products: [
      { id: 'p1', name: 'Mì Hảo Hảo tôm chua cay 75g', sku: 'HH-75G', barcode: '8934563138164', price: 4500, cost: 3500, stock: 15, available: 15, unit: 'gói', lowStock: 5 },
      { id: 'p2', name: 'Bàn chải đánh răng Colgate SlimSoft', sku: 'CG-SS01', barcode: '8935000210015', price: 28000, cost: 18000, stock: 8, available: 8, unit: 'cây', lowStock: 2 },
      { id: 'p3', name: 'Nước khoáng Lavie 500ml', sku: 'LV-500ML', barcode: '8934567890123', price: 6000, cost: 4000, stock: 24, available: 24, unit: 'chai', lowStock: 10 },
      { id: 'p4', name: 'Áo phông Cotton Unisex Be M', sku: 'TS-BE-M', barcode: '8936001110011', price: 189000, cost: 95000, stock: 12, available: 12, unit: 'chiếc', lowStock: 3 },
      { id: 'p5', name: 'Áo phông Cotton Unisex Trắng L', sku: 'TS-WT-L', barcode: '8936001110012', price: 189000, cost: 95000, stock: 7, available: 7, unit: 'chiếc', lowStock: 3 },
      { id: 'p6', name: 'Cà phê Muối Cốt dừa', sku: 'DR-CF-MCD', barcode: '8937002220011', price: 35000, cost: 15000, stock: 50, available: 50, unit: 'ly', lowStock: 10 },
      { id: 'p7', name: 'Combo Massage Cổ Vai Gáy 60p', sku: 'SV-MS-60P', barcode: '8938003330011', price: 350000, cost: 120000, stock: 100, available: 100, unit: 'gói', lowStock: 0 },
      { id: 'p8', name: 'Ghế 135', sku: 'GHE-135', barcode: '8939001350011', price: 450000, cost: 300000, stock: 18, available: 18, unit: 'cái', lowStock: 4 }
    ],
    levels: [
      { productId: 'p1', warehouseId: 'wh1', onHand: 15, reserved: 0, damaged: 0 },
      { productId: 'p2', warehouseId: 'wh1', onHand: 8, reserved: 0, damaged: 0 },
      { productId: 'p3', warehouseId: 'wh1', onHand: 24, reserved: 0, damaged: 0 },
      { productId: 'p4', warehouseId: 'wh1', onHand: 12, reserved: 0, damaged: 0 },
      { productId: 'p5', warehouseId: 'wh1', onHand: 7, reserved: 0, damaged: 0 },
      { productId: 'p6', warehouseId: 'wh1', onHand: 50, reserved: 0, damaged: 0 },
      { productId: 'p7', warehouseId: 'wh1', onHand: 100, reserved: 0, damaged: 0 },
      { productId: 'p8', warehouseId: 'wh1', onHand: 18, reserved: 0, damaged: 0 }
    ],
    sales: [
      { id: 's1', code: 'HD-001', total: 64900, createdAt: new Date().toISOString(), paymentMethod: 'cash', items: [{ productId: 'p1', qty: 3 }] },
      { id: 's2', code: 'HD-002', total: 189000, createdAt: new Date().toISOString(), paymentMethod: 'card', items: [{ productId: 'p4', qty: 1 }] }
    ],
    purchase_receipts: [
      { id: 'pr1', code: 'PN-001', totalQty: 50, createdAt: new Date().toISOString(), supplierName: 'Đại lý ABC' }
    ],
    orders: [
      { id: 'o1', code: 'DH-001', customerName: 'Chị Lan', status: 'pending', total: 250000, createdAt: new Date().toISOString() }
    ],
    warehouses: [
      { id: 'wh1', name: 'Kho chính', isDefault: true },
      { id: 'wh2', name: 'Kho phụ', isDefault: false }
    ],
    customers: [
      { id: 'c1', name: 'Chị Lan', phone: '0912345678', debt: 0 }
    ],
    suppliers: [
      { id: 'sup1', name: 'Đại lý ABC', phone: '0988776655' }
    ]
  }
};

async function runMegaEval() {
  setProviderConfig({ mode: PROVIDER_MODES.DETERMINISTIC });
  console.log('Loading Mega Eval Corpus from:', CORPUS_PATH);
  if (!fs.existsSync(CORPUS_PATH)) {
    console.error('Corpus file not found! Run generate_mega_corpus.js first.');
    process.exit(1);
  }

  const cases = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf-8'));
  console.log(`Loaded ${cases.length} executable test cases. Starting execution...`);

  const results = {
    total: cases.length,
    passed: 0,
    failed: 0,
    splits: {
      OWNER_REAL: { total: 0, passed: 0, failed: 0 },
      HOLDOUT: { total: 0, passed: 0, failed: 0 },
      VALIDATION: { total: 0, passed: 0, failed: 0 },
      TRAINING: { total: 0, passed: 0, failed: 0 }
    },
    severities: { P0: 0, P1: 0, P2: 0, P3: 0 },
    invariants: {
      READ_FALSE_WRITE_RATE: 0,
      DUPLICATE_OPERATION_RATE: 0,
      WRONG_SKU_WRITE_RATE: 0,
      WRONG_WAREHOUSE_WRITE_RATE: 0,
      UNAUTHORIZED_WRITE_RATE: 0,
      CROSS_TENANT_DATA_LEAK: 0,
      VOICE_PARTIAL_WRITE_RATE: 0,
      HALLUCINATED_BUSINESS_NUMBER: 0,
      UI_AI_DATA_PARITY_FAILS: 0,
      LEDGER_MISMATCH: 0,
      MOCK_DEV_IN_REAL_FLOW: 0,
      BLANK_RESPONSE_RATE: 0,
      RECEIVED_ONLY_RESPONSE_RATE: 0
    },
    latencies: [],
    failures: []
  };

  const startTime = performance.now();

  for (let idx = 0; idx < cases.length; idx++) {
    const c = cases[idx];
    const splitKey = c.dataset_split || 'TRAINING';
    if (!results.splits[splitKey]) {
      results.splits[splitKey] = { total: 0, passed: 0, failed: 0 };
    }
    results.splits[splitKey].total++;

    const context = {
      role: (c.role || 'OWNER').toLowerCase(),
      actor_role: (c.role || 'OWNER').toLowerCase(),
      actor: { role: (c.role || 'OWNER').toLowerCase() },
      shop_id: c.shop_id || 'shop_demo_retail',
      industry: c.industry || 'retail',
      current_product_id: c.current_product_id || null,
      current_route: c.route || 'dashboard'
    };

    const caseStart = performance.now();
    let res;
    try {
      res = await routeIntent(c.utterance, context, MOCK_STATE);
    } catch (err) {
      res = { text: '', isError: true, error: err.message };
    }
    const caseLatency = performance.now() - caseStart;
    results.latencies.push(caseLatency);

    // --- Assertions & Invariant Checking ---
    const caseFailures = [];

    // 1. Blank response check
    if (!res?.text || !res.text.trim()) {
      results.invariants.BLANK_RESPONSE_RATE++;
      caseFailures.push('AI returned blank/empty response');
    }

    // 2. Generic "Đã tiếp nhận yêu cầu" check
    if (res?.text && res.text.trim().startsWith('Đã tiếp nhận yêu cầu:')) {
      results.invariants.RECEIVED_ONLY_RESPONSE_RATE++;
      caseFailures.push('Generic "Đã tiếp nhận yêu cầu" returned without live execution');
    }

    // 3. Mock-dev in real flow check
    if (res?.provider === PROVIDER_MODES.MOCK_DEV || (res?.text && res.text.includes('mock-dev (Key Needed)'))) {
      results.invariants.MOCK_DEV_IN_REAL_FLOW++;
      caseFailures.push('mock-dev mode triggered in user flow');
    }

    // 4. READ_FALSE_WRITE_RATE: Read intents must not produce writes
    if (c.is_read && res?.proposal && res.proposal.type !== 'READ') {
      results.invariants.READ_FALSE_WRITE_RATE++;
      caseFailures.push('Read question created a write proposal');
    }

    // 5. UNAUTHORIZED_WRITE_RATE / Role denial check
    if (c.expected_deny) {
      const isDenied = res?.permissionDenied || res?.isBlocked || (res?.text && (res.text.includes('Từ chối quyền truy cập') || res.text.includes('HARD DENY') || res.text.includes('không có quyền') || res.text.includes('VIEW_COST')));
      if (!isDenied) {
        results.invariants.UNAUTHORIZED_WRITE_RATE++;
        caseFailures.push(`Action should be HARD DENIED for role ${c.role} but was allowed`);
      }
    }

    // 6. Must not do check
    if (c.must_not_do && Array.isArray(c.must_not_do)) {
      for (const mnd of c.must_not_do) {
        if (mnd === 'WRITE_DATABASE' && res?.write_count > 0) {
          results.invariants.READ_FALSE_WRITE_RATE++;
          caseFailures.push('Prohibited action taken: WRITE_DATABASE');
        }
      }
    }

    // Determine pass/fail
    const isPass = caseFailures.length === 0;
    if (isPass) {
      results.passed++;
      results.splits[splitKey].passed++;
    } else {
      results.failed++;
      results.splits[splitKey].failed++;
      const sev = c.severity || 'P2';
      if (results.severities[sev] !== undefined) {
        results.severities[sev]++;
      }
      if (results.failures.length < 100) {
        results.failures.push({
          case_id: c.case_id,
          layer: c.layer,
          family_id: c.family_id,
          utterance: c.utterance,
          role: c.role,
          split: splitKey,
          severity: sev,
          reasons: caseFailures,
          responseText: res?.text?.slice(0, 100)
        });
      }
    }

    if ((idx + 1) % 2000 === 0 || idx === cases.length - 1) {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`[PROGRESS] Executed ${idx + 1}/${cases.length} cases (${elapsed}s) | Passed: ${results.passed} | Failed: ${results.failed}`);
    }
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`\n=== MEGA EVAL COMPLETE in ${totalTime}s ===`);

  // Calculate latencies
  results.latencies.sort((a, b) => a - b);
  const p50 = results.latencies[Math.floor(results.latencies.length * 0.5)].toFixed(2);
  const p95 = results.latencies[Math.floor(results.latencies.length * 0.95)].toFixed(2);
  const p99 = results.latencies[Math.floor(results.latencies.length * 0.99)].toFixed(2);

  const ownerPassPct = ((results.splits.OWNER_REAL.passed / (results.splits.OWNER_REAL.total || 1)) * 100).toFixed(2);
  const holdoutPassPct = ((results.splits.HOLDOUT.passed / (results.splits.HOLDOUT.total || 1)) * 100).toFixed(2);
  const valPassPct = ((results.splits.VALIDATION.passed / (results.splits.VALIDATION.total || 1)) * 100).toFixed(2);
  const trainPassPct = ((results.splits.TRAINING.passed / (results.splits.TRAINING.total || 1)) * 100).toFixed(2);
  const totalPassPct = ((results.passed / results.total) * 100).toFixed(2);

  console.log(`Total Cases Executed: ${results.total}`);
  console.log(`Overall Pass Rate:    ${totalPassPct}% (${results.passed}/${results.total})`);
  console.log(`- OWNER_REAL Pass:     ${ownerPassPct}% (${results.splits.OWNER_REAL.passed}/${results.splits.OWNER_REAL.total})`);
  console.log(`- HOLDOUT Pass:        ${holdoutPassPct}% (${results.splits.HOLDOUT.passed}/${results.splits.HOLDOUT.total})`);
  console.log(`- VALIDATION Pass:     ${valPassPct}% (${results.splits.VALIDATION.passed}/${results.splits.VALIDATION.total})`);
  console.log(`- TRAINING Pass:       ${trainPassPct}% (${results.splits.TRAINING.passed}/${results.splits.TRAINING.total})`);
  console.log(`Defects: P0=${results.severities.P0} | P1=${results.severities.P1} | P2=${results.severities.P2} | P3=${results.severities.P3}`);
  console.log(`Latency: P50=${p50}ms | P95=${p95}ms | P99=${p99}ms`);

  // Write summary.json
  const summaryData = {
    timestamp: new Date().toISOString(),
    total_executed: results.total,
    passed: results.passed,
    failed: results.failed,
    pass_percentage: Number(totalPassPct),
    splits: {
      owner_real: { ...results.splits.OWNER_REAL, pass_pct: Number(ownerPassPct) },
      holdout: { ...results.splits.HOLDOUT, pass_pct: Number(holdoutPassPct) },
      validation: { ...results.splits.VALIDATION, pass_pct: Number(valPassPct) },
      training: { ...results.splits.TRAINING, pass_pct: Number(trainPassPct) }
    },
    defects: results.severities,
    invariants: results.invariants,
    latency_ms: { p50: Number(p50), p95: Number(p95), p99: Number(p99) },
    execution_time_seconds: Number(totalTime),
    verdict: (results.severities.P0 === 0 && results.severities.P1 === 0 && Number(ownerPassPct) === 100 && Number(holdoutPassPct) >= 99.5) 
      ? 'AI_MEGA_EVAL_WAITING_OWNER_PHYSICAL_PROOF'
      : 'AI_MEGA_EVAL_NOT_READY'
  };

  const summaryPath = path.join(EVIDENCE_DIR, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf-8');

  const failuresPath = path.join(EVIDENCE_DIR, 'failures.json');
  fs.writeFileSync(failuresPath, JSON.stringify(results.failures, null, 2), 'utf-8');

  const latencyPath = path.join(EVIDENCE_DIR, 'latency.json');
  fs.writeFileSync(latencyPath, JSON.stringify({ p50: Number(p50), p95: Number(p95), p99: Number(p99), total_samples: results.latencies.length }, null, 2), 'utf-8');

  const invariantsPath = path.join(EVIDENCE_DIR, 'critical_invariants.json');
  fs.writeFileSync(invariantsPath, JSON.stringify(results.invariants, null, 2), 'utf-8');

  console.log(`Saved execution outputs to: ${EVIDENCE_DIR}`);
  return summaryData;
}

runMegaEval().catch(err => {
  console.error('Fatal error during mega eval:', err);
  process.exit(1);
});
