import io
import sys
import json
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 390, 'height': 844})
    page.goto('http://localhost:4180/')
    page.wait_for_function('() => Boolean(window.__qbiz_app__)')
    page.evaluate('() => window.__qbiz_app__.previewDemo("fashion")')
    
    # Test 1: Non-variant product (Jean)
    res1 = page.evaluate('''async () => {
        const router = await import('./src/ai/router.js');
        const state = window.__qbiz_app__.state;
        const context = {
            current_route: 'products',
            current_product_id: 'p_fs_jean_flare',
            actor_role: 'owner',
            actor_id: 'usr_owner'
        };
        const query = 'giảm kho cái này đi hai cái';
        const r = await router.routeIntent(query, context, state);
        return {
            query,
            intent: r.intent,
            tier: r.tier,
            text: r.text,
            hasProposal: Boolean(r.proposal),
            proposalSummary: r.proposal?.human_summary
        };
    }''')
    print('TEST 1 (Jean - no variants):', json.dumps(res1, ensure_ascii=False, indent=2))

    # Test 2: Variant product (Linen dress)
    res2 = page.evaluate('''async () => {
        const router = await import('./src/ai/router.js');
        const state = window.__qbiz_app__.state;
        const context = {
            current_route: 'products',
            current_product_id: 'p_fs_dress_linen',
            actor_role: 'owner',
            actor_id: 'usr_owner'
        };
        const query = 'giảm kho cái này đi hai cái';
        const r = await router.routeIntent(query, context, state);
        return {
            query,
            isAmbiguous: r.isAmbiguous,
            candidateCount: (r.candidates || []).length,
            text: r.text,
            firstCandName: r.candidates?.[0]?.name
        };
    }''')
    print('TEST 2 (Dress - has variants):', json.dumps(res2, ensure_ascii=False, indent=2))

    b.close()
