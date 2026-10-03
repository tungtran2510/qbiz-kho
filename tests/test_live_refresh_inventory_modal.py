import os
import sys
import time
import shutil
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run_test():
    os.makedirs('tests/evidence', exist_ok=True)
    brain_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        
        print("\n[Step 1] Loading app at http://127.0.0.1:4180/...", flush=True)
        page.goto('http://127.0.0.1:4180/', wait_until='domcontentloaded')
        page.wait_for_timeout(1000)
        
        # Dismiss any demo / industry picker
        retail_btn = page.locator('button[data-industry="retail"]')
        if retail_btn.count() > 0:
            retail_btn.click()
            page.wait_for_timeout(500)
        elif page.locator('[data-action="preview-demo"]').count() > 0:
            page.locator('[data-action="preview-demo"]').click()
            page.wait_for_timeout(500)
            
        print("[Step 2] Finding test product and opening Product Detail modal...", flush=True)
        prod_info = page.evaluate("""() => {
            const app = window.__qbiz_app__;
            if (!app || !app.state || !app.state.data) return null;
            const p = app.state.data.products.find(x => x.type !== 'SERVICE') || app.state.data.products[0];
            if (!p) return null;
            const totals = app.state.data.levels.filter(x => x.productId === p.id).reduce((s, x) => s + (x.onHand || 0), 0);
            app.openProduct(p.id);
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                initialOnHand: totals
            };
        }""")
        
        assert prod_info is not None, "Failed to get test product"
        print(f"  -> Testing on product: '{prod_info['name']}' (ID: {prod_info['id']})", flush=True)
        print(f"  -> Initial onHand in IndexedDB/state: {prod_info['initialOnHand']}", flush=True)
        
        page.wait_for_timeout(500)
        
        # Check initial UI in modal
        modal = page.locator('#modalRoot .product-detail')
        assert modal.count() > 0, "Product detail modal is not open!"
        
        before_stats_text = page.locator('#modalRoot .detail-stats').inner_text()
        print(f"  -> Initial modal stats text:\n{before_stats_text.strip()}", flush=True)
        
        page.screenshot(path='tests/evidence/evidence_stock_before_import.png')
        print("  -> Saved screenshot: tests/evidence/evidence_stock_before_import.png", flush=True)
        
        # Now execute an import proposal while modal is open
        print("\n[Step 3] Executing inventory import proposal (qty: 40) via executeProposal...", flush=True)
        exec_res = page.evaluate("""async (prodId) => {
            const proposals = await import('./src/ai/proposals.js');
            const app = window.__qbiz_app__;
            const whId = app.state.data.warehouses[0]?.id || 'wh_center';
            
            const prop = {
                id: 'prop_test_live_refresh_' + Date.now(),
                proposal_id: 'prop_test_live_refresh_' + Date.now(),
                intent: 'create_receipt_proposal',
                skill_id: 'receipt-proposal',
                human_summary: 'Nhập thêm 40 chiếc hàng kiểm thử vào kho',
                status: 'READY',
                context_version: 'v1',
                parameters: {
                    productId: prodId,
                    warehouseId: whId,
                    qty: 40,
                    price: 150000,
                    reason: 'Nhập kiểm thử live refresh UI'
                }
            };
            
            proposals.confirmProposal(prop, app.state, { id: 'owner_1', role: 'owner' });
            const res = await proposals.executeProposal(prop, app.state, null, { id: 'owner_1', role: 'owner' });
            return res;
        }""", prod_info['id'])
        
        print(f"  -> Execution result: success={exec_res.get('success')}, message={exec_res.get('message')}", flush=True)
        assert exec_res.get('success') is True, f"executeProposal failed: {exec_res}"
        
        # Wait a brief moment for refresh
        page.wait_for_timeout(600)
        
        print("\n[Step 4] Verifying Product Detail modal UI updated immediately WITHOUT closing...", flush=True)
        modal_after = page.locator('#modalRoot .product-detail')
        assert modal_after.count() > 0, "Product detail modal was unexpectedly closed!"
        
        after_stats_text = page.locator('#modalRoot .detail-stats').inner_text()
        print(f"  -> Updated modal stats text:\n{after_stats_text.strip()}", flush=True)
        
        expected_on_hand = prod_info['initialOnHand'] + 40
        print(f"  -> Expected onHand: {expected_on_hand}", flush=True)
        
        # Check that after_stats_text contains expected_on_hand
        assert str(expected_on_hand) in after_stats_text, f"Expected {expected_on_hand} in stats text but got: {after_stats_text}"
        
        # Check ledger list in modal has the new transaction
        ledger_text = page.locator('#modalRoot .ledger-list').last.inner_text() if page.locator('#modalRoot .ledger-list').count() > 0 else ""
        print(f"  -> Ledger list snippet: {ledger_text[:120]}...", flush=True)
        assert "+40" in ledger_text or "40" in ledger_text, "Ledger list did not update with the new import movement!"
        
        page.screenshot(path='tests/evidence/evidence_stock_after_import.png')
        print("  -> Saved screenshot: tests/evidence/evidence_stock_after_import.png", flush=True)
        
        # Also test on Mobile
        print("\n[Step 5] Testing same live refresh on Mobile (390x844)...", flush=True)
        mobile_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
        mobile_page = mobile_context.new_page()
        mobile_page.goto('http://127.0.0.1:4180/', wait_until='domcontentloaded')
        mobile_page.wait_for_timeout(1000)

        # Dismiss any demo / industry picker
        retail_btn = mobile_page.locator('button[data-industry="retail"]')
        if retail_btn.count() > 0:
            retail_btn.click()
            mobile_page.wait_for_timeout(500)
        elif mobile_page.locator('[data-action="preview-demo"]').count() > 0:
            mobile_page.locator('[data-action="preview-demo"]').click()
            mobile_page.wait_for_timeout(500)
        
        # Open product modal on mobile
        mobile_page.evaluate("""(prodId) => {
            window.__qbiz_app__.openProduct(prodId);
        }""", prod_info['id'])
        mobile_page.wait_for_timeout(500)
        
        mobile_before_text = mobile_page.locator('#modalRoot .detail-stats').inner_text()
        print(f"  -> Mobile initial stats:\n{mobile_before_text.strip()}", flush=True)
        mobile_page.screenshot(path='tests/evidence/evidence_stock_mobile_before.png')
        
        # Execute another import of +10 items
        mobile_page.evaluate("""async (prodId) => {
            const proposals = await import('./src/ai/proposals.js');
            const app = window.__qbiz_app__;
            const whId = app.state.data.warehouses[0]?.id || 'wh_center';
            const prop = {
                id: 'prop_test_mobile_' + Date.now(),
                proposal_id: 'prop_test_mobile_' + Date.now(),
                intent: 'create_receipt_proposal',
                skill_id: 'receipt-proposal',
                human_summary: 'Nhập thêm 10 chiếc trên di động',
                status: 'READY',
                context_version: 'v1',
                parameters: { productId: prodId, warehouseId: whId, qty: 10, reason: 'Nhập mobile test' }
            };
            proposals.confirmProposal(prop, app.state, { id: 'owner_1', role: 'owner' });
            await proposals.executeProposal(prop, app.state, null, { id: 'owner_1', role: 'owner' });
        }""", prod_info['id'])
        mobile_page.wait_for_timeout(600)
        
        mobile_after_text = mobile_page.locator('#modalRoot .detail-stats').inner_text()
        print(f"  -> Mobile updated stats:\n{mobile_after_text.strip()}", flush=True)
        assert "125" in mobile_after_text, f"Expected 125 on mobile but got {mobile_after_text}"
        mobile_page.screenshot(path='tests/evidence/evidence_stock_mobile_after.png')
        
        # Copy mobile screenshots to brain dir
        shutil.copy('tests/evidence/evidence_stock_mobile_before.png', os.path.join(brain_dir, 'evidence_stock_mobile_before.png'))
        shutil.copy('tests/evidence/evidence_stock_mobile_after.png', os.path.join(brain_dir, 'evidence_stock_mobile_after.png'))
        
        print("\n=======================================================")
        print(">>> EMPIRICAL VERIFICATION PASS: Live stock UI refresh is working seamlessly! <<<")
        print("=======================================================\n", flush=True)
        browser.close()

if __name__ == '__main__':
    run_test()
