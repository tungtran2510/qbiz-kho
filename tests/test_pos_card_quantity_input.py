import json
import os
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4180"
ARTIFACTS_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), 'evidence')
os.makedirs(EVIDENCE_DIR, exist_ok=True)

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # Test 1: Mobile Viewport (iPhone 14 / modern Android: 390x844)
        print("\n--- [TEST 1: Mobile Viewport (390x844)] ---")
        context_mobile = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            is_mobile=True,
            has_touch=True
        )
        page = context_mobile.new_page()
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1000)
        
        # Dismiss entry overlay if present
        entry_overlay = page.locator('#publicEntryOverlay')
        if entry_overlay.is_visible():
            btn_demo = page.locator('[data-action="preview-demo"]').first
            if btn_demo.is_visible():
                btn_demo.click()
                page.wait_for_timeout(800)
            else:
                page.evaluate("() => { if (window.__qbiz_app__) window.__qbiz_app__.state._bypassEntryOverlay = true; window.__qbiz_app__.render(); }")
                page.wait_for_timeout(400)
        
        # Switch to POS screen
        page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'browse';
                window.__qbiz_app__.state.saleCart = [];
                window.__qbiz_app__.render();
            }
        }""")
        page.wait_for_selector(".pos-grid", timeout=10000)
        page.wait_for_timeout(500)
        
        # Find first product card
        first_card = page.locator(".pos-product").first
        add_btn = first_card.locator(".pos-add")
        assert add_btn.is_visible(), "Initial card should have pos-add button"
        print("[PASS] Initial card displays '+' button")
        
        # Click '+' to add product
        add_btn.click()
        page.wait_for_timeout(400)
        
        # Now it should have .pos-inline-qty with input
        inline_qty = first_card.locator(".pos-inline-qty")
        assert inline_qty.is_visible(), "Card should show .pos-inline-qty"
        
        qty_input = first_card.locator("input.pos-inline-qty-input")
        assert qty_input.is_visible(), "Quantity input should be visible inside card"
        val = qty_input.input_value()
        assert val == "1", f"Default quantity should be 1, got {val}"
        print(f"[PASS] Added item to cart, input rendered with value: {val}")
        
        # Click on the input to focus and type '15' (within available stock of 24)
        qty_input.click()
        page.wait_for_timeout(200)
        qty_input.fill("15")
        qty_input.press("Enter")
        page.wait_for_timeout(400)
        
        # Re-fetch card (as renderSales re-rendered)
        first_card = page.locator(".pos-product").first
        qty_input = first_card.locator("input.pos-inline-qty-input")
        val2 = qty_input.input_value()
        assert val2 == "15", f"Quantity after typing should be 15, got {val2}"
        print(f"[PASS] Successfully typed '15' into quantity input, confirmed value: {val2}")
        
        # Verify cart bottom summary shows 15
        bottom_summary = page.locator(".sale-mobile-summary")
        summary_text = bottom_summary.inner_text()
        print(f"[*] Bottom bar summary: {summary_text}")
        assert "15" in summary_text, f"Bottom summary should mention 15, got: {summary_text}"
        print("[PASS] Bottom cart bar accurately reflects 15 items")
        
        # Screenshot of mobile card with 15 items
        mobile_screenshot_path = os.path.join(ARTIFACTS_DIR, "evidence_pos_card_qty_mobile.png")
        page.screenshot(path=mobile_screenshot_path)
        print(f"[SAVED] Screenshot saved to: {mobile_screenshot_path}")
        
        # Test Increment '+' button
        plus_btn = first_card.locator('[data-sale-adjust="1"]')
        plus_btn.click()
        page.wait_for_timeout(300)
        first_card = page.locator(".pos-product").first
        qty_input = first_card.locator("input.pos-inline-qty-input")
        val3 = qty_input.input_value()
        assert val3 == "16", f"Quantity after plus button should be 16, got {val3}"
        print(f"[PASS] Clicked '+' button: quantity incremented to {val3}")
        
        # Test Decrement '-' button
        minus_btn = first_card.locator('[data-sale-adjust="-1"]')
        minus_btn.click()
        page.wait_for_timeout(300)
        first_card = page.locator(".pos-product").first
        qty_input = first_card.locator("input.pos-inline-qty-input")
        val4 = qty_input.input_value()
        assert val4 == "15", f"Quantity after minus button should be 15, got {val4}"
        print(f"[PASS] Clicked '−' button: quantity decremented back to {val4}")

        # Test exceeding stock limit (type 99 when stock is 24)
        qty_input.click()
        qty_input.fill("99")
        qty_input.press("Enter")
        page.wait_for_timeout(400)
        first_card = page.locator(".pos-product").first
        qty_input = first_card.locator("input.pos-inline-qty-input")
        val_exceed = qty_input.input_value()
        assert val_exceed == "15", f"Exceeding stock should revert to allowed value 15, got {val_exceed}"
        print(f"[PASS] Exceeding stock limit (99 > 24) safely retained allowed value: {val_exceed}")
        
        # Test typing '0' to remove product from cart
        qty_input.click()
        page.wait_for_timeout(100)
        qty_input.fill("0")
        qty_input.press("Enter")
        page.wait_for_timeout(400)
        
        first_card = page.locator(".pos-product").first
        add_btn_again = first_card.locator(".pos-add")
        assert add_btn_again.is_visible(), "Typing 0 should remove product and revert card to '+' button"
        print("[PASS] Typing '0' successfully removed product and card reverted back to '+' button")
        
        # Test all 3 View modes (Grid 3, Grid 2, List)
        print("\n--- [TEST 2: Verify All 3 POS Layout Views (Grid3, Grid2, List)] ---")
        views = [
            ("grid3", "Grid 3 Columns"),
            ("grid2", "Grid 2 Columns"),
            ("list", "List View")
        ]
        
        for view_id, view_name in views:
            page.evaluate(f"""(v) => {{
                if (window.__qbiz_app__) {{
                    window.__qbiz_app__.state.displayPrefs.posView = v;
                    window.__qbiz_app__.render();
                }}
            }}""", view_id)
            page.wait_for_timeout(300)
            
            # Add first item
            first_card = page.locator(".pos-product").first
            first_card.locator(".pos-add").click()
            page.wait_for_timeout(300)
            
            first_card = page.locator(".pos-product").first
            qty_input = first_card.locator("input.pos-inline-qty-input")
            assert qty_input.is_visible(), f"In {view_name}, quantity input must be visible"
            
            # Type custom quantity
            qty_input.click()
            qty_input.fill("12")
            qty_input.press("Enter")
            page.wait_for_timeout(300)
            
            first_card = page.locator(".pos-product").first
            qty_input = first_card.locator("input.pos-inline-qty-input")
            assert qty_input.input_value() == "12", f"In {view_name}, quantity must be 12"
            print(f"[PASS] {view_name}: Successfully added item and typed quantity 12")
            
            # Screenshot for each view
            view_screen = os.path.join(ARTIFACTS_DIR, f"evidence_pos_view_{view_id}.png")
            page.screenshot(path=view_screen)
            print(f"[SAVED] Screenshot for {view_name}: {view_screen}")
            
            # Clean up cart for next test
            page.evaluate("""() => {
                if (window.__qbiz_app__) {
                    window.__qbiz_app__.state.saleCart = [];
                    window.__qbiz_app__.render();
                }
            }""")
            page.wait_for_timeout(200)

        # Test 3: Desktop Viewport (1280x800)
        print("\n--- [TEST 3: Desktop Viewport (1280x800)] ---")
        context_desktop = browser.new_context(
            viewport={"width": 1280, "height": 800}
        )
        page_desk = context_desktop.new_page()
        page_desk.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        page_desk.wait_for_timeout(800)
        
        page_desk.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state._bypassEntryOverlay = true;
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'browse';
                window.__qbiz_app__.state.saleCart = [];
                window.__qbiz_app__.render();
            }
        }""")
        page_desk.wait_for_selector(".pos-grid", timeout=10000)
        page_desk.wait_for_timeout(500)
        
        # Add 2 in-stock items and set custom quantities (nth(0) has stock 24, nth(2) has stock 30)
        cards = page_desk.locator(".pos-product")
        cards.nth(0).locator(".pos-add").click()
        page_desk.wait_for_timeout(200)
        cards.nth(2).locator(".pos-add").click()
        page_desk.wait_for_timeout(200)
        
        # Type '8' for item 1 and '14' for item 2
        cards = page_desk.locator(".pos-product")
        input1 = cards.nth(0).locator("input.pos-inline-qty-input")
        input1.click()
        input1.fill("8")
        input1.press("Enter")
        page_desk.wait_for_timeout(200)
        
        cards = page_desk.locator(".pos-product")
        input2 = cards.nth(2).locator("input.pos-inline-qty-input")
        input2.click()
        input2.fill("14")
        input2.press("Enter")
        page_desk.wait_for_timeout(300)
        
        cards = page_desk.locator(".pos-product")
        assert cards.nth(0).locator("input.pos-inline-qty-input").input_value() == "8"
        assert cards.nth(2).locator("input.pos-inline-qty-input").input_value() == "14"
        print("[PASS] Desktop: Successfully filled quantities 8 and 14 across two items")
        
        desktop_screenshot_path = os.path.join(ARTIFACTS_DIR, "evidence_pos_card_qty_desktop.png")
        page_desk.screenshot(path=desktop_screenshot_path)
        print(f"[SAVED] Desktop screenshot: {desktop_screenshot_path}")
        
        print("\n=======================================================")
        print(">>> ALL TESTS PASSED: POS Card Quantity Input Verified! <<<")
        print("=======================================================")
        browser.close()

if __name__ == '__main__':
    run_test()
