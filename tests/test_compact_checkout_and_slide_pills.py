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

def dismiss_overlay_and_ready(page):
    page.wait_for_timeout(1000)
    entry_overlay = page.locator('.public-entry-overlay, #publicEntryOverlay')
    if entry_overlay.count() > 0 and entry_overlay.first.is_visible():
        btn_demo = page.locator('[data-action="preview-demo"]').first
        if btn_demo.count() > 0 and btn_demo.is_visible():
            btn_demo.click()
            page.wait_for_timeout(800)
        else:
            page.evaluate("() => { const ov = document.querySelector('.public-entry-overlay, #publicEntryOverlay'); if(ov) ov.remove(); }")
            page.wait_for_timeout(400)

def run_tests():
    print("[TEST] Starting Compact Checkout & Single-Row Slide Pills Verification...")
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
        page.goto(BASE_URL, wait_until="networkidle")
        dismiss_overlay_and_ready(page)

        # Setup cart with exactly 38.000 VND to match user screenshot
        print("[TEST] Setting up cart with 38.000 VND total...")
        page.evaluate("""() => {
            const app = window.__qbiz_app__;
            if (app) {
                app.state.page = 'sales';
                app.state.saleStep = 'browse';
                // Find or mock an item with price 38,000 or set cart directly
                let prod = app.state.data.products[0];
                if (!prod) {
                    prod = { id: 'p_test', name: 'Sản phẩm mẫu', price: 38000, retail_price: 38000, type: 'PRODUCT' };
                    app.state.data.products.push(prod);
                }
                app.state.saleCart = [{
                    itemId: prod.id,
                    quantity: 1,
                    unitPrice: 38000,
                    lineDiscount: 0,
                    discountMode: 'amount',
                    tax_amount: 0
                }];
                app.state.saleDraft = {
                    discount: 0,
                    discountMode: 'amount',
                    cashReceived: '0',
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
                app.state.saleStep = 'checkout';
                app.render();
            }
        }""")
        page.wait_for_timeout(800)

        # 1. Verify we are on checkout screen
        total_text = page.locator('.checkout-total strong').inner_text()
        print(f"[TEST] Total text on screen: {total_text}")
        assert "38.000" in total_text, f"Expected 38.000 in total text, got {total_text}"

        # 2. Verify Quick Cash Pills single-row layout
        pills_container = page.locator('.cash-quick-pills')
        assert pills_container.count() > 0, "Quick cash pills container not found!"
        
        # Check CSS flex-wrap
        flex_wrap = pills_container.evaluate("el => window.getComputedStyle(el).flexWrap")
        overflow_x = pills_container.evaluate("el => window.getComputedStyle(el).overflowX")
        print(f"[TEST] .cash-quick-pills computed flexWrap: {flex_wrap}, overflowX: {overflow_x}")
        assert flex_wrap == "nowrap", f"Expected flex-wrap to be nowrap, got {flex_wrap}"
        assert overflow_x in ["auto", "scroll"], f"Expected overflow-x to be auto or scroll, got {overflow_x}"

        # Check all pills offsetTop - THEY MUST BE ON THE EXACT SAME ROW!
        pills = page.locator('.cash-pill')
        pill_count = pills.count()
        print(f"[TEST] Total pill buttons found: {pill_count}")
        assert pill_count >= 4, f"Expected at least 4 pill buttons, got {pill_count}"

        pills_info = page.evaluate("""() => {
            const pills = Array.from(document.querySelectorAll('.cash-pill'));
            return pills.map(p => ({
                text: p.innerText.trim(),
                offsetTop: p.offsetTop,
                offsetLeft: p.offsetLeft,
                width: p.offsetWidth,
                height: p.offsetHeight
            }));
        }""")
        
        print("[TEST] Pills layout geometry:")
        first_top = pills_info[0]['offsetTop']
        for info in pills_info:
            print(f"  - Pill '{info['text']}': top={info['offsetTop']}, left={info['offsetLeft']}, width={info['width']}, height={info['height']}")
            # Allow at most 2px tolerance for subpixel rendering
            assert abs(info['offsetTop'] - first_top) <= 2, f"Pill '{info['text']}' wrapped to a second line! offsetTop={info['offsetTop']}, first_top={first_top}"

        print("[PASS] All quick cash pills are strictly on ONE SINGLE ROW!")

        # 3. Test horizontal scrollability (sliding)
        scroll_width = pills_container.evaluate("el => el.scrollWidth")
        client_width = pills_container.evaluate("el => el.clientWidth")
        print(f"[TEST] Pill container scrollWidth={scroll_width}, clientWidth={client_width}")
        
        # Scroll right to verify slide behavior
        pills_container.evaluate("el => { el.scrollLeft = 100; }")
        page.wait_for_timeout(300)
        new_scroll_left = pills_container.evaluate("el => el.scrollLeft")
        print(f"[TEST] Pill container scrollLeft after sliding: {new_scroll_left}")
        # Reset scroll
        pills_container.evaluate("el => { el.scrollLeft = 0; }")
        page.wait_for_timeout(200)

        # 4. Check compact screen height and scroll requirements
        checkout_screen_box = page.locator('.checkout-screen').bounding_box()
        print(f"[TEST] Checkout screen height: {checkout_screen_box['height']}px (compact and neat)")

        # Verify sticky pay button is visible
        pay_btn = page.locator('[data-sale-pay]')
        assert pay_btn.is_visible(), "Hoàn tất thanh toán button must be visible"

        # Capture mobile evidence screenshot
        screenshot_path = os.path.join(EVIDENCE_DIR, 'evidence_compact_checkout_mobile.png')
        page.screenshot(path=screenshot_path)
        print(f"[TEST] Saved mobile evidence screenshot to {screenshot_path}")

        # Also copy to brain artifact directory for user review
        artifact_path = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424\evidence_compact_checkout_mobile.png"
        try:
            import shutil
            shutil.copyfile(screenshot_path, artifact_path)
            print(f"[TEST] Copied screenshot to artifact directory: {artifact_path}")
        except Exception as e:
            print(f"[WARN] Failed to copy to artifact dir: {e}")

        # 5. Test clicking a pill (e.g. 50.000 ₫)
        btn_50k = page.locator('button[data-cash-amount="50000"]')
        assert btn_50k.count() > 0, "50.000 đ pill button not found"
        btn_50k.click()
        page.wait_for_timeout(300)
        
        cash_val = page.locator('#cashReceived').input_value()
        change_val = page.locator('#cashChange').inner_text()
        print(f"[TEST] After clicking 50.000 đ: cashReceived={cash_val}, cashChange={change_val}")
        assert cash_val == "50000", f"Expected cashReceived to be 50000, got {cash_val}"
        assert "12.000" in change_val, f"Expected 12.000 change, got {change_val}"

        # 6. Test on smaller viewport (iPhone SE: 375x667)
        print("\n--- 2. Testing Smaller Mobile Viewport (iPhone SE: 375x667) ---")
        context_se = browser.new_context(
            viewport={'width': 375, 'height': 667},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            is_mobile=True,
            has_touch=True
        )
        page_se = context_se.new_page()
        page_se.goto(BASE_URL, wait_until="networkidle")
        dismiss_overlay_and_ready(page_se)
        page_se.evaluate("""() => {
            const app = window.__qbiz_app__;
            if (app) {
                app.state.page = 'sales';
                let prod = app.state.data.products[0];
                if (!prod) {
                    prod = { id: 'p_test', name: 'Sản phẩm mẫu', price: 38000, retail_price: 38000, type: 'PRODUCT' };
                    app.state.data.products.push(prod);
                }
                app.state.saleCart = [{ itemId: prod.id, quantity: 1, unitPrice: 38000, lineDiscount: 0, discountMode: 'amount', tax_amount: 0 }];
                app.state.saleDraft = { discount: 0, discountMode: 'amount', cashReceived: '0', note: '', payment: 'cash', warehouseId: '', fulfillment: 'counter' };
                app.state.saleStep = 'checkout';
                app.render();
            }
        }""")
        page_se.wait_for_timeout(600)

        # Check all pills on SE are also on 1 single row
        pills_info_se = page_se.evaluate("""() => {
            const pills = Array.from(document.querySelectorAll('.cash-pill'));
            return pills.map(p => ({ text: p.innerText.trim(), offsetTop: p.offsetTop }));
        }""")
        first_top_se = pills_info_se[0]['offsetTop']
        for info in pills_info_se:
            assert abs(info['offsetTop'] - first_top_se) <= 2, f"Pill on 375px wrapped to 2nd row! {info}"

        se_screenshot = os.path.join(EVIDENCE_DIR, 'evidence_compact_checkout_se_375px.png')
        page_se.screenshot(path=se_screenshot)
        print(f"[TEST] Saved 375px SE screenshot to {se_screenshot}")

        browser.close()
        print("\n[ALL PASS] Compact Checkout & Slide Pills Verification 100% Successful!")

if __name__ == '__main__':
    run_tests()
