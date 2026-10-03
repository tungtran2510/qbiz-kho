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
    print("[TEST] Starting Discount Words & Remaining Price Verification...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # Mobile viewport matching user's phone / tablet
        context = browser.new_context(
            viewport={'width': 412, 'height': 915},
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()
        page.goto(BASE_URL, wait_until="networkidle")

        # Dismiss overlay safely
        page.wait_for_timeout(800)
        page.evaluate("() => { const ov = document.querySelector('.public-entry-overlay, #publicEntryOverlay'); if(ov) ov.remove(); }")
        page.wait_for_timeout(400)

        # Setup cart with Ghế sáng chế 135 DL-135, price 53.762.000, qty 2
        print("[TEST] Setting up cart matching user screenshot...")
        cart_info = page.evaluate("""() => {
            const app = window.__qbiz_app__;
            if (!app) return { error: 'No app' };
            const p = app.state.data?.products?.find(x => x.id === 'p_135');
            if (p) {
                p.price = 53762000;
                p.retail_price = 53762000;
            }
            app.state.page = 'sales';
            app.state.saleStep = 'cart';
            app.state.saleCart = [
                { itemId: 'p_135', quantity: 2, unitPrice: 53762000, discount: 0, lineDiscount: 0, discountMode: 'amount', tax_amount: 0 }
            ];
            app.render();
            return {
                productsCount: app.state.data?.products?.length,
                pFound: Boolean(p),
                cartLen: app.state.saleCart.length,
                rowsRendered: document.querySelectorAll('.cart-row').length
            };
        }""")
        print(f"[TEST] Cart setup result: {cart_info}")
        page.wait_for_timeout(500)

        # Step 1: Click the line discount trigger to open editor
        print("[TEST] Clicking discount trigger button for p_135...")
        page.wait_for_selector('[data-line-discount="p_135"]', timeout=5000)
        btn_disc = page.locator('[data-line-discount="p_135"]').first
        btn_disc.click()
        page.wait_for_timeout(400)

        disc_input = page.locator('input[data-sale-field="discount"][data-sale-id="p_135"]')
        assert disc_input.is_visible(), "Discount input for p_135 must be visible"

        # Step 2: Type 50000000 (Năm mươi triệu đồng)
        print("[TEST] Typing 50000000 into discount input...")
        disc_input.fill("50000000")
        disc_input.dispatch_event("input")
        page.wait_for_timeout(300)

        # Check words badge
        words_badge = page.locator("#discHint_p_135 .disc-words-badge").inner_text()
        print(f"[VERIFY 1] Words badge for 50000000: '{words_badge}'")
        assert "Năm mươi triệu đồng" in words_badge, f"Expected 'Năm mươi triệu đồng', got '{words_badge}'"

        # Verify remain badge is completely removed
        remain_badge_count = page.locator("#discHint_p_135 .disc-remain-badge").count()
        print(f"[VERIFY 2] Redundant remain badge count: {remain_badge_count}")
        assert remain_badge_count == 0, f"Expected disc-remain-badge to be completely removed, got count={remain_badge_count}"

        # Verify line-discount-trigger does NOT have has-disc class
        btn_disc_class = btn_disc.get_attribute("class") or ""
        btn_disc_text = btn_disc.inner_text().strip()
        print(f"[VERIFY 3] Discount trigger class: '{btn_disc_class}', text: '{btn_disc_text}'")
        assert "has-disc" not in btn_disc_class, f"Trigger should NOT have has-disc class, got: '{btn_disc_class}'"
        assert "Giảm giá" in btn_disc_text, f"Trigger text should remain 'Giảm giá ›', got: '{btn_disc_text}'"

        # Check right-side price group
        price_group = page.locator("#cartPriceGroup_p_135")
        orig_text = price_group.locator(".cart-orig-total").inner_text()
        final_text = price_group.locator(".cart-line-total").inner_text()
        con_label = price_group.locator(".cart-con-label").inner_text()
        print(f"[VERIFY 4] Right-side price: orig={orig_text}, label={con_label}, final={final_text}")
        assert "107.524.000" in orig_text, f"Expected original gross 107.524.000, got '{orig_text}'"
        assert "còn" in con_label.lower(), f"Expected 'Còn' (case-insensitive), got '{con_label}'"
        assert "57.524.000" in final_text, f"Expected final price 57.524.000, got '{final_text}'"

        # Step 3: Capture screenshot of 50.000.000 VND discount
        screenshot_path_50m = os.path.join(EVIDENCE_DIR, 'evidence_discount_50m_words_and_price.png')
        page.screenshot(path=screenshot_path_50m)
        print(f"[EVIDENCE] Screenshot saved: {screenshot_path_50m}")

        # Step 4: Now test typing 50000 (Năm mươi nghìn đồng)
        print("[TEST] Typing 50000 into discount input...")
        disc_input.fill("50000")
        disc_input.dispatch_event("input")
        page.wait_for_timeout(300)

        words_badge_50k = page.locator("#discHint_p_135 .disc-words-badge").inner_text()
        remain_badge_50k_count = page.locator("#discHint_p_135 .disc-remain-badge").count()
        final_text_50k = page.locator("#cartPriceGroup_p_135 .cart-line-total").inner_text()
        print(f"[VERIFY 5] Words badge for 50000: '{words_badge_50k}'")
        print(f"[VERIFY 6] Remain badge count for 50000: {remain_badge_50k_count}")
        print(f"[VERIFY 7] Right-side final price for 50000: '{final_text_50k}'")
        assert "Năm mươi nghìn đồng" in words_badge_50k, f"Expected 'Năm mươi nghìn đồng', got '{words_badge_50k}'"
        assert remain_badge_50k_count == 0, "Remain badge should be 0 count"
        assert "107.474.000" in final_text_50k, f"Expected 107.474.000 in final text, got '{final_text_50k}'"

        # Capture screenshot for 50k
        screenshot_path_50k = os.path.join(EVIDENCE_DIR, 'evidence_discount_50k_words_and_price.png')
        page.screenshot(path=screenshot_path_50k)
        print(f"[EVIDENCE] Screenshot saved: {screenshot_path_50k}")

        screenshot_path_clean = os.path.join(EVIDENCE_DIR, 'evidence_clean_discount_no_redundancy.png')
        page.screenshot(path=screenshot_path_clean)
        print(f"[EVIDENCE] Screenshot saved: {screenshot_path_clean}")

        browser.close()
        print("[SUCCESS] All Discount Words and Remaining Price tests PASSED 100%!")

if __name__ == '__main__':
    run_tests()
