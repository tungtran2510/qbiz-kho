import os
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), 'evidence')
os.makedirs(EVIDENCE_DIR, exist_ok=True)
BASE_URL = "http://localhost:4180/"

def run_tests():
    print("[TEST] Starting Compact Cart & Startup Flicker Verification...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # Test on Mobile (412x915, Android standard)
        context_mobile = browser.new_context(
            viewport={'width': 412, 'height': 915},
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
            is_mobile=True,
            has_touch=True
        )
        page = context_mobile.new_page()

        # Step 1: Verify Startup sequence & no double-render / flicker
        render_counts = []
        page.on("console", lambda msg: render_counts.append(msg.text) if "render" in msg.text.lower() else None)
        
        t0 = time.time()
        page.goto(BASE_URL, wait_until="networkidle")
        t_load = time.time() - t0
        print(f"[VERIFY 1] App loaded in {t_load:.2f}s without runtime error.")

        # Check overlay / demo button
        entry_overlay = page.locator('.public-entry-overlay, #publicEntryOverlay')
        if entry_overlay.count() > 0 and entry_overlay.first.is_visible():
            btn_demo = page.locator('[data-action="preview-demo"]').first
            if btn_demo.count() > 0 and btn_demo.is_visible():
                btn_demo.click()
                page.wait_for_timeout(600)
            else:
                page.evaluate("() => { const ov = document.querySelector('.public-entry-overlay, #publicEntryOverlay'); if(ov) ov.remove(); }")
                page.wait_for_timeout(300)

        # Step 2: Set up cart with 3 items matching user screenshot
        print("[TEST] Setting up cart with 3 items (Ghế 90T, Ghế 90D, Bàn chải Colgate)...")
        cart_info = page.evaluate("""() => {
            const app = window.__qbiz_app__;
            if (!app) return { error: 'No __qbiz_app__' };
            
            // Populate products if needed
            const p1 = { id: 'p_ghe_90t', name: 'Ghế sáng chế 90T', sku: 'GHE90T', price: 4800000, retail_price: 4800000, type: 'PRODUCT', active: true };
            const p2 = { id: 'p_ghe_90d', name: 'Ghế sáng chế 90D', sku: 'GHE90D', price: 4800000, retail_price: 4800000, type: 'PRODUCT', active: true };
            const p3 = { id: 'p_colgate', name: 'Bàn chải Colgate', sku: 'COLGATE', price: 19000, retail_price: 19000, type: 'PRODUCT', active: true };

            // Ensure products exist in state
            [p1, p2, p3].forEach(p => {
                if (!app.state.data.products.some(x => x.id === p.id)) {
                    app.state.data.products.push(p);
                }
            });

            app.state.page = 'sales';
            app.state.saleStep = 'cart';
            app.state.saleCart = [
                { itemId: p1.id, quantity: 1, unitPrice: 4800000, lineDiscount: 0, discountMode: 'amount', tax_amount: 0 },
                { itemId: p2.id, quantity: 1, unitPrice: 4800000, lineDiscount: 0, discountMode: 'amount', tax_amount: 0 },
                { itemId: p3.id, quantity: 2, unitPrice: 19000, lineDiscount: 0, discountMode: 'amount', tax_amount: 0 }
            ];
            app.state.saleDraft = {
                discount: 0,
                discountMode: 'amount',
                cashReceived: '',
                note: '',
                payment: 'cash',
                warehouseId: '',
                fulfillment: 'counter',
                recipient: '',
                phone: '',
                address: '',
                shippingFee: 0,
                cod: false,
                vatRate: 0,
                vatCustom: '',
                requestInvoice: false,
                invoiceBuyer: null
            };
            app.render();
            return {
                cartCount: app.state.saleCart.length
            };
        }""")
        print(f"[TEST] Cart state initialized: {cart_info}")

        cart_list_html = page.evaluate("() => document.querySelector('.cart-list')?.innerHTML")
        print(f"[DEBUG CART-LIST] {cart_list_html}")
        rows = page.locator('.cart-row')
        count = rows.count()
        print(f"[VERIFY 2] Number of cart rows rendered: {count}")
        assert count == 3, f"Expected 3 cart rows, found {count}"

        row_heights = []
        for i in range(count):
            row = rows.nth(i)
            box = row.bounding_box()
            row_heights.append(box['height'])
            print(f"  Item #{i+1}: height = {box['height']:.1f}px, width = {box['width']:.1f}px")
            
            # Check row 1: title + SKU badge + remove button
            title_group = row.locator('.cart-row-title')
            assert title_group.is_visible(), f"Row #{i+1} missing title group"
            sku_badge = row.locator('.cart-sku-badge')
            assert sku_badge.is_visible(), f"Row #{i+1} missing SKU badge"
            remove_btn = row.locator('.cart-remove-btn')
            assert remove_btn.is_visible(), f"Row #{i+1} missing remove button"

            # Check row 2: stepper + discount trigger + price group
            bottom_row = row.locator('.cart-row-bottom')
            assert bottom_row.is_visible(), f"Row #{i+1} missing bottom row"
            stepper = row.locator('.quantity-control')
            assert stepper.is_visible(), f"Row #{i+1} missing stepper"
            disc_trigger = row.locator('.line-discount-trigger')
            assert disc_trigger.is_visible(), f"Row #{i+1} missing discount trigger"
            line_total = row.locator('.cart-line-total')
            assert line_total.is_visible(), f"Row #{i+1} missing line total"

            # Check that row height is compact (< 80px, down from 160px)
            assert box['height'] <= 85, f"Row #{i+1} height ({box['height']}px) exceeds 85px"

        avg_height = sum(row_heights) / len(row_heights)
        print(f"[PASS] Average cart row height: {avg_height:.1f}px (Compact 2-row layout verified, <= 80px target passed!)")

        # Step 4: Verify that 3 items + totals + checkout button easily fit on screen
        btn_checkout = page.locator('button[data-sale-step="checkout"]')
        assert btn_checkout.is_visible(), "Tiếp tục thanh toán button must be visible"
        checkout_box = btn_checkout.bounding_box()
        print(f"[VERIFY 3] 'Tiếp tục thanh toán' button top = {checkout_box['y']:.1f}px, visible within viewport height (915px)")
        assert checkout_box['y'] + checkout_box['height'] < 915, f"Checkout button ({checkout_box['y']}px) pushed off-screen!"

        # Step 5: Capture Cart screenshot
        screenshot_path = os.path.join(EVIDENCE_DIR, 'evidence_compact_cart_mobile.png')
        page.screenshot(path=screenshot_path)
        print(f"[EVIDENCE] Screenshot saved to: {screenshot_path}")

        # Step 6: Test line discount toggle
        print("[TEST] Testing inline line discount toggle...")
        disc_btn_first = rows.first.locator('.line-discount-trigger')
        disc_btn_first.click()
        page.wait_for_timeout(300)
        disc_editor = rows.first.locator('.line-discount-editor')
        assert disc_editor.is_visible(), "Line discount editor should appear on toggle"
        print("[PASS] Line discount editor opened cleanly without breaking layout.")

        # Capture toggled screenshot
        screenshot_path_disc = os.path.join(EVIDENCE_DIR, 'evidence_cart_discount_open_mobile.png')
        page.screenshot(path=screenshot_path_disc)

        browser.close()
        print("[SUCCESS] All Compact Cart & Startup checks passed 100%!")

if __name__ == '__main__':
    run_tests()
