import { routeIntent } from '../src/ai/router.js';
import { evaluateExactDeterministicGate } from '../src/ai/exact-gate.js';
import { parseVietnameseNumberWord } from '../src/ai/vietnamese-nlp.js';

function fmtMarkdown(text) {
  if (!text) return '';
  let s = String(text).trim();

  // Strip trailing whitespace per line & collapse excessive newlines
  s = s.replace(/[ \t]+$/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');

  // Markdown inline bold, italic, code
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Dividers: consume surrounding newlines
  s = s.replace(/\s*\n\s*---+\s*\n\s*/g, '<hr class="ai-divider"/>');
  s = s.replace(/\s*---+\s*$/g, '');

  // Bullets (• or - ) into <li>
  s = s.replace(/(?:^|\n)\s*[•\-]\s+(.*?)(?=\n|$)/g, '<li class="ai-bullet">$1</li>');

  // Wrap contiguous <li> into <ul class="ai-list">
  s = s.replace(/(?:<li class="ai-bullet">.*?<\/li>\s*)+/g, (match) => {
    return `<ul class="ai-list">${match.trim()}</ul>`;
  });

  // Clean whitespace immediately next to block tags
  s = s.replace(/\s*<ul class="ai-list">/g, '<ul class="ai-list">');
  s = s.replace(/<\/ul>\s*/g, '</ul>');
  s = s.replace(/\s*<hr class="ai-divider"\/>\s*/g, '<hr class="ai-divider"/>');

  // Paragraph gap for double newline, simple <br/> for single newline
  s = s.replace(/\n\n+/g, '<span class="ai-p-gap"></span>');
  s = s.replace(/\n/g, '<br/>');

  // Strip redundant <br/> right next to block elements
  s = s.replace(/(?:<br\s*\/?>)+<ul/g, '<ul');
  s = s.replace(/<\/ul>(?:<br\s*\/?>)+/g, '</ul>');
  s = s.replace(/(?:<br\s*\/?>)+<hr/g, '<hr');
  s = s.replace(/<hr class="ai-divider"\/?>(?:<br\s*\/?>)+/g, '<hr class="ai-divider"/>');

  // Strip leading and trailing <br/>
  s = s.replace(/^(?:<br\s*\/?>)+/, '').replace(/(?:<br\s*\/?>)+$/, '');

  return s;
}

async function testAll() {
  console.log('--- TEST 1: Number & Unit Parsing ---');
  const n1 = parseVietnameseNumberWord('5c');
  const n2 = parseVietnameseNumberWord('10 cái');
  const n3 = parseVietnameseNumberWord('nhập 5c');
  console.log(`5c -> ${n1} (expected 5)`);
  console.log(`10 cái -> ${n2} (expected 10)`);
  console.log(`nhập 5c -> ${n3} (expected 5)`);
  if (n1 !== 5 || n2 !== 10) throw new Error('Number parsing failed!');

  const state = {
    data: {
      warehouses: [
        { id: 'wh_main', name: 'Kho Tổng Trung Tâm' }
      ],
      products: [
        { id: 'p_90d', name: 'Ghế sáng chế 90D', sku: 'G90D', unit: 'cái', onHand: 2, available: 2, price: 350000, cost_price: 200000, lowStock: 5 },
        { id: 'p_ban', name: 'Bàn ăn gỗ sồi', sku: 'BG01', unit: 'cái', onHand: 15, available: 15, price: 1200000, cost_price: 800000, lowStock: 3 }
      ],
      levels: [
        { productId: 'p_90d', warehouseId: 'wh_main', onHand: 2, available: 2 },
        { productId: 'p_ban', warehouseId: 'wh_main', onHand: 15, available: 15 }
      ],
      sales: [
        {
          id: 's_last_week',
          status: 'COMPLETED',
          createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
          total: 337500,
          items: [{ productId: 'p_90d', quantity: 1, line_total: 337500 }]
        },
        {
          id: 's_this_month',
          status: 'COMPLETED',
          createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          total: 700000,
          items: [{ productId: 'p_90d', quantity: 2, line_total: 700000 }]
        }
      ]
    }
  };

  console.log('\n--- TEST 2: Exact Deterministic Gate for "Nhập 5c" ---');
  const gateRes = await evaluateExactDeterministicGate('Nhập 5c', { current_product_id: 'p_90d' }, state);
  console.log('Gate matched:', gateRes?.matched);
  console.log('Gate capability:', gateRes?.capability);
  const gateExec = await gateRes.handler();
  const gateQty = gateExec?.proposal?.parameters?.qty ?? gateExec?.proposal?.payload?.changes?.[0]?.quantity;
  console.log('Proposal qty:', gateQty);
  console.log('Proposal text:', gateExec?.text);
  if (gateQty !== 5) {
    throw new Error(`Gate proposal quantity is not 5, got ${gateQty}!`);
  }

  console.log('\n--- TEST 3: routeIntent for "Nhập 5c" ---');
  const routeRes = await routeIntent('Nhập 5c', { current_product_id: 'p_90d' }, state);
  console.log('routeIntent tier:', routeRes.tier);
  console.log('routeIntent provider:', routeRes.provider);
  const routeQty = routeRes.proposal?.parameters?.qty ?? routeRes.proposal?.payload?.changes?.[0]?.quantity;
  console.log('routeIntent qty:', routeQty);
  if (routeQty !== 5) {
    throw new Error(`routeIntent proposal quantity is not 5, got ${routeQty}!`);
  }

  console.log('\n--- TEST 4: Compound 3-part question ---');
  const compoundQuery = "Hàng nào bán chạy nhất tháng này và doanh thu tuần này so với doanh thu tuần trước thế nào và đề xuất cho tôi mặt hàng nào nên nhập tuần này";
  const compoundRes = await routeIntent(compoundQuery, { current_route: 'dashboard' }, state, { allowDevMockPlanner: true });
  console.log('Status:', compoundRes.status);
  console.log('Raw Composed Text:\n' + compoundRes.text);
  console.log('\nFormatted HTML:\n' + fmtMarkdown(compoundRes.text));

  // Check that all 3 parts are covered:
  const text = compoundRes.text.toLowerCase();
  const hasBestseller = text.includes('bán chạy') || text.includes('ghế sáng chế');
  const hasComparison = text.includes('doanh số') || text.includes('tuần trước') || text.includes('tuần này');
  const hasReplenishment = text.includes('đề xuất') || text.includes('nhập thêm') || text.includes('tồn');
  console.log(`\nCoverage check: Bestseller: ${hasBestseller} | Comparison: ${hasComparison} | Replenishment: ${hasReplenishment}`);
  if (!hasBestseller || !hasComparison || !hasReplenishment) {
    throw new Error('Compound query failed to cover all 3 sub-questions!');
  }

  console.log('\n✅ ALL VERIFICATION TESTS PASSED EMPIRICALLY!');
}

testAll().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
