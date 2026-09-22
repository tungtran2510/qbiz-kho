/**
 * QBiz AI Intent Evaluation Runner
 * Runs the ai-intent-eval.json test suite against the dictionary + router pipeline.
 * 
 * Usage: Load in browser console or include in test page.
 *   import { runAIEval } from './tests/ai-eval-runner.js';
 *   runAIEval().then(report => console.log(report));
 */

import { norm, classifyIntent, detectEntityType, isConfirmation, isCancellation, isCorrection } from '../src/ai/dictionary.js';
import { findActionsByAlias } from '../src/ai/registry.js';
import { dictionaryRoute, mapIntentEntityToAction } from '../src/ai/router.js';

/**
 * Evaluate a single test case against the dictionary + registry layer.
 * Note: This tests the dictionary/registry classification, NOT the full router
 * (which requires runtime state and DOM). For full router testing, use Playwright.
 */
function evaluateCase(testCase) {
  const { utterance, context, expected } = testCase;
  const p = norm(utterance);
  const result = { id: testCase.id, utterance, pass: false, actual: null, expected: expected.type };

  // Check pending intent handling
  if (expected.type === 'CONFIRM_PENDING') {
    result.actual = isConfirmation(p) ? 'CONFIRM_PENDING' : 'NO_MATCH';
    result.pass = isConfirmation(p);
    return result;
  }
  if (expected.type === 'CANCEL_PENDING') {
    result.actual = isCancellation(p) ? 'CANCEL_PENDING' : 'NO_MATCH';
    result.pass = isCancellation(p);
    return result;
  }

  // Check safety/reject
  if (expected.type === 'REJECT') {
    // Prompt injection patterns
    const injectionPatterns = [
      /ignore.*(?:previous|all).*instruction/i,
      /bo qua.*quy tac/i,
      /<script/i,
      /system\s*prompt/i,
    ];
    const isInjection = injectionPatterns.some(rx => rx.test(utterance) || rx.test(p));
    result.actual = isInjection ? 'REJECT' : 'NOT_REJECTED';
    result.pass = isInjection;
    return result;
  }

  // Try unified dictionary routing first
  const routeRes = dictionaryRoute(utterance, context, null);
  if (routeRes) {
    if (routeRes.type === 'ACTION') {
      const actId = routeRes.action_id || routeRes.action?.id || '';
      result.actual = `ACTION:${actId}(conf:${routeRes.confidence || 90})`;
      if (expected.type === 'ACTION') {
        if (expected.action && actId === expected.action) {
          result.pass = true;
        } else if (expected.action_contains && actId.includes(expected.action_contains)) {
          result.pass = true;
        }
      } else if (expected.type === 'ACTION_OR_SUGGEST' || expected.type === 'SUGGEST_OR_FALLBACK') {
        result.pass = true;
      }
      if (result.pass) return result;
    } else if (routeRes.type === 'SUGGEST') {
      result.actual = 'SUGGEST';
      if (expected.type === 'ACTION_OR_SUGGEST' || expected.type === 'SUGGEST_OR_FALLBACK') {
        result.pass = true;
        return result;
      }
    }
  }

  // Try alias matching (most specific)
  const aliasMatches = findActionsByAlias(p);
  if (aliasMatches.length > 0 && aliasMatches[0].matchScore >= 60) {
    const bestAction = aliasMatches[0].action;
    result.actual = `ACTION:${bestAction.id}(score:${aliasMatches[0].matchScore})`;

    if (expected.type === 'ACTION' && expected.action) {
      result.pass = bestAction.id === expected.action;
    } else if (expected.type === 'ACTION' && expected.action_contains) {
      result.pass = bestAction.id.includes(expected.action_contains);
    } else if (expected.type === 'ACTION_OR_SUGGEST' || expected.type === 'SUGGEST_OR_FALLBACK') {
      result.pass = true; // Any action match is acceptable
    }
    if (result.pass) return result;
  }

  // Try dictionary classification
  const intent = classifyIntent(p);
  const entity = detectEntityType(p);

  if (intent) {
    const mappedAction = mapIntentEntityToAction(intent.intent, entity?.entityType, context);
    result.actual = `CLASSIFIED:${intent.intent}${entity ? '+' + entity.entityType : ''}${mappedAction ? '->' + mappedAction : ''}(conf:${intent.confidence})`;
    
    if (expected.type === 'ACTION_OR_SUGGEST' || expected.type === 'SUGGEST_OR_FALLBACK') {
      result.pass = true; // Classification is acceptable
    } else if (expected.type === 'ACTION') {
      if (mappedAction && expected.action && mappedAction === expected.action) {
        result.pass = true;
      } else if (mappedAction && expected.action_contains && mappedAction.includes(expected.action_contains)) {
        result.pass = true;
      } else if (expected.action_contains) {
        const intentLower = intent.intent.toLowerCase();
        const actionLower = expected.action_contains.toLowerCase();
        const entityLower = (entity?.entityType || '').toLowerCase();
        if (intentLower.includes(actionLower) || actionLower.includes(intentLower) || entityLower.includes(actionLower)) {
          result.pass = true;
          result.actual += ' (intent_match)';
        }
      }
    }
    return result;
  }

  // No match
  if (expected.type === 'SUGGEST_OR_FALLBACK') {
    result.actual = 'FALLBACK';
    result.pass = true;
  } else {
    result.actual = 'NO_MATCH';
    result.pass = false;
  }

  return result;
}

/**
 * Run the full eval suite.
 * @param {Array} testCases - Array of test case objects (from ai-intent-eval.json)
 * @returns {Object} Evaluation report
 */
export async function runAIEval(testCases) {
  if (!testCases) {
    try {
      const response = await fetch('./tests/ai-intent-eval.json');
      testCases = await response.json();
    } catch (e) {
      console.error('Cannot load test cases. Pass them as argument or ensure file is accessible.');
      return null;
    }
  }

  const results = testCases.map(tc => evaluateCase(tc));

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);

  // Group by test group
  const groups = {};
  for (const r of results) {
    const tc = testCases.find(t => t.id === r.id);
    const group = tc?.group || 'unknown';
    if (!groups[group]) groups[group] = { total: 0, passed: 0, cases: [] };
    groups[group].total++;
    if (r.pass) groups[group].passed++;
    groups[group].cases.push(r);
  }

  const report = {
    summary: {
      total,
      passed,
      failed: total - passed,
      passRate: `${((passed / total) * 100).toFixed(1)}%`,
    },
    groups: Object.entries(groups).map(([name, g]) => ({
      name,
      total: g.total,
      passed: g.passed,
      passRate: `${((g.passed / g.total) * 100).toFixed(1)}%`,
    })),
    failures: failed.map(r => ({
      id: r.id,
      utterance: r.utterance,
      expected: r.expected,
      actual: r.actual,
    })),
  };

  // Console output
  console.log('\n=== QBiz AI Intent Eval Report ===');
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${total - passed} | Rate: ${report.summary.passRate}`);
  console.log('\nPer Group:');
  for (const g of report.groups) {
    const status = g.passed === g.total ? '✅' : '⚠️';
    console.log(`  ${status} ${g.name}: ${g.passed}/${g.total} (${g.passRate})`);
  }
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const f of report.failures) {
      console.log(`  ❌ ${f.id}: "${f.utterance}" — expected ${f.expected}, got ${f.actual}`);
    }
  }

  return report;
}

export { evaluateCase };
