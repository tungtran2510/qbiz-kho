import { DEMO_INDUSTRIES } from '../src/demo-showroom.js';

console.log('=== DEMO SHOWROOM ALL INDUSTRIES & STOCK ===');
for (const [key, ind] of Object.entries(DEMO_INDUSTRIES)) {
  console.log(`\n--- Industry: ${key} (${ind.name}) ---`);
  console.log(`Products count: ${ind.products.length}`);
  ind.products.forEach(p => {
    if (p.type === 'SERVICE') {
      console.log(`  [SERVICE] ${p.name} (${p.sku || 'no sku'}) - Dịch vụ`);
    } else {
      console.log(`  [PRODUCT] ${p.name} (${p.sku || 'no sku'}): onHandMain=${p.onHandMain}, onHandPos=${p.onHandPos}, lowStock=${p.lowStock}`);
    }
  });
}
