/**
 * Verification Script for AI PHASE 3H-R2A: Compact Manifest Structural Integrity Lock
 * 
 * Verifies:
 * 1. COMPACT_MANIFEST_SOURCE = CANONICAL_CAPABILITY_REGISTRY
 * 2. DUPLICATE_MANIFEST_SOURCE_COUNT = 0
 * 3. REGISTERED_CAPABILITIES_STILL_DISCOVERABLE = YES
 * 4. All 25 canonical capabilities have compact_description
 * 5. Permission & route filtering functions correctly without hardcoding
 */

import fs from 'fs';
import path from 'path';
import {
  KHO_CAPABILITY_REGISTRY,
  generateCompactToolManifest,
  generateModelToolManifest,
  getRegistryStats
} from '../src/ai/capability-registry.js';
import { getCompactToolManifest } from '../src/ai/semantic-planner.js';

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

console.log('=== QBiz Kho AI PHASE 3H-R2A: Compact Manifest Integrity Verification ===\n');

// 1. Audit Source of Truth
console.log('1. Single Source of Truth & Zero Duplicate Dictionaries:');
const plannerCode = fs.readFileSync(path.resolve('src/ai/semantic-planner.js'), 'utf8');
const hasShortMap = plannerCode.includes('SHORT_MAP');
assert(!hasShortMap, 'semantic-planner.js contains NO hardcoded SHORT_MAP dictionary');

const duplicateMapMatches = plannerCode.match(/(?:const|let|var)\s+\w+Map\s*=\s*\{[\s\S]*?'check_stock'/g) || [];
assert(duplicateMapMatches.length === 0, `DUPLICATE_MANIFEST_SOURCE_COUNT = ${duplicateMapMatches.length} (Expected 0)`);

// 2. Canonical Capability Count & Compact Descriptions
console.log('\n2. Canonical Capability Registry Completeness:');
const capEntries = Object.entries(KHO_CAPABILITY_REGISTRY);
assert(capEntries.length === 26, `Canonical capabilities count = ${capEntries.length} (Expected 26)`);

let missingCompactDesc = 0;
for (const [id, cap] of capEntries) {
  if (!cap.compact_description || typeof cap.compact_description !== 'string') {
    missingCompactDesc++;
    console.error(`    Missing compact_description: ${id}`);
  }
}
assert(missingCompactDesc === 0, `All 26 capabilities have canonical compact_description (${26 - missingCompactDesc}/26)`);

// 3. Dynamic Generation & Discoverability
console.log('\n3. Dynamic Generation & Full Discoverability:');
const fullManifest = generateCompactToolManifest({ all: true });
const fullLines = fullManifest.trim().split('\n');
assert(fullLines.length === 26, `Full manifest exposes all 26 canonical capabilities (${fullLines.length}/26)`);

// Verify that all 25 capabilities are discoverable via context / queries
let discoverableCount = 0;
for (const [id, cap] of capEntries) {
  // Check if discoverable in full or via targeted query / route
  const byQuery = generateCompactToolManifest({ query: id.replace(/_/g, ' ') });
  const byRoutePos = generateCompactToolManifest({ route: 'sales' });
  const byRouteInv = generateCompactToolManifest({ route: 'inventory' });
  const byRouteDash = generateCompactToolManifest({ route: 'dashboard' });
  
  if (
    fullManifest.includes(id) &&
    (byQuery.includes(id) || byRoutePos.includes(id) || byRouteInv.includes(id) || byRouteDash.includes(id))
  ) {
    discoverableCount++;
  }
}
assert(discoverableCount === 26, `REGISTERED_CAPABILITIES_STILL_DISCOVERABLE = YES (${discoverableCount}/26 discoverable)`);

// 4. Role Permission Guard in Compact Manifest
console.log('\n4. Role-based Permission Filtering:');
const ownerManifest = generateCompactToolManifest({ role: 'owner', route: 'dashboard' });
const cashierManifest = generateCompactToolManifest({ role: 'cashier', route: 'dashboard' });

assert(ownerManifest.includes('get_profit_summary'), 'Owner manifest includes get_profit_summary');
assert(ownerManifest.includes('receipt_proposal'), 'Owner manifest includes receipt_proposal');
assert(!cashierManifest.includes('get_profit_summary'), 'Cashier manifest excludes get_profit_summary (no VIEW_COST permission)');
assert(!cashierManifest.includes('receipt_proposal'), 'Cashier manifest excludes receipt_proposal (no RECEIVE_STOCK permission)');
assert(!cashierManifest.includes('stocktake_proposal'), 'Cashier manifest excludes stocktake_proposal');

// 5. Prompt Character Length Budget (< 1,500 chars for fast CPU prefill)
console.log('\n5. Performance & Manifest Character Budget:');
const defaultManifest = generateCompactToolManifest({ route: 'dashboard' });
assert(defaultManifest.length > 200, `Default manifest has sufficient context (${defaultManifest.length} chars)`);
assert(defaultManifest.length < 1500, `Default manifest satisfies CPU prefill budget (${defaultManifest.length} < 1500 chars)`);

console.log(`\n=== Summary: ${passed}/${total} checks passed ===`);
if (passed === total) {
  console.log('STRUCTURAL_MANIFEST_INTEGRITY = PASS');
} else {
  console.log('STRUCTURAL_MANIFEST_INTEGRITY = FAIL');
  process.exit(1);
}
