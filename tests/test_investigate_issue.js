import { routeIntent } from '../src/ai/router.js';
import { createSemanticPlan } from '../src/ai/semantic-planner.js';
import { generateCompactToolManifest } from '../src/ai/capability-registry.js';
import { evaluateExactDeterministicGate } from '../src/ai/exact-gate.js';

async function run() {
  const query = "Tuần này có những cái nào bán tốt và những cái nào bán không tốt";
  console.log("=== Investigating query:", query);

  const exact = await evaluateExactDeterministicGate(query, {}, {});
  console.log("1. Exact deterministic gate matched:", exact?.matched);

  const manifest = generateCompactToolManifest({ route: 'dashboard', query });
  console.log("\n2. Compact Tool Manifest for this query:\n" + manifest);

  const state = {
    data: {
      products: [
        { id: 'p1', name: 'Ghế giám đốc', onHand: 10, price: 1500000, active: true },
        { id: 'p2', name: 'Bàn làm việc', onHand: 5, price: 2000000, active: true },
        { id: 'p3', name: 'Tủ tài liệu', onHand: 2, price: 800000, active: true },
        { id: 'p4', name: 'Kệ sách mini', onHand: 20, price: 300000, active: true }
      ],
      sales: [
        {
          id: 's1',
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
          items: [{ productId: 'p1', quantity: 3, line_total: 4500000 }]
        }
      ]
    }
  };

  const planRes = await createSemanticPlan(query, { current_route: 'dashboard' }, state);
  console.log("\n3. Semantic Plan Result:", JSON.stringify(planRes, null, 2));

  const result = await routeIntent(query, { current_route: 'dashboard' }, state);
  console.log("\n4. routeIntent Result:", JSON.stringify(result, null, 2));
}

run().catch(console.error);
