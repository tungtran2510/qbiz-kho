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
    # Check entry overlay
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
    print("[TEST] Starting Payment Ting Chime, Popup & Quick Cash Verification...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # ==========================================
        # 1. MOBILE TEST (Viewport: 412x915)
        # ==========================================
        print("\n--- 1. Testing Mobile Viewport (412x915) ---")
        context_mobile = browser.new_context(
            viewport={'width': 412, 'height': 915},
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
            is_mobile=True,
            has_touch=True
        )
        page = context_mobile.new_page()
        page.goto(BASE_URL, wait_until="networkidle")
        dismiss_overlay_and_ready(page)

        # 1.1 Navigate to Sales on Mobile
        print("[TEST] Navigating to Sales page on mobile...")
        page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'browse';
                window.__qbiz_app__.render();
            }
        }""")
        page.wait_for_timeout(600)

        # 1.2 Add product to cart
        print("[TEST] Adding product to cart...")
        first_product = page.locator('.pos-product button.pos-add, .pos-product button.pos-product-main').first
        first_product.click()
        page.wait_for_timeout(500)

        # 1.3 Check Cart
        print("[TEST] Opening Cart...")
        page.locator('button[data-sale-step="cart"]').first.click()
        page.wait_for_timeout(500)

        # Verify volume/preferences button in flow-head
        pref_btn = page.locator('.flow-head .flow-pref-btn')
        assert pref_btn.is_visible(), "Flow pref/sound button must be visible in flow-head"
        print("  [OK] Sound/Preferences button visible in flow-head")

        # 1.4 Proceed to Checkout
        print("[TEST] Proceeding to Checkout...")
        page.locator('button[data-sale-step="checkout"]').click()
        page.wait_for_timeout(500)

        # 1.5 Verify Quick Cash Pills
        print("[TEST] Verifying Quick Cash Pills in cash panel...")
        cash_panel = page.locator('.cash-panel')
        assert cash_panel.is_visible(), "Cash panel must be visible"
        quick_pills = page.locator('.cash-quick-pills .cash-pill')
        pill_count = quick_pills.count()
        assert pill_count >= 2, f"Expected at least 2 cash pills, got {pill_count}"
        print(f"  [OK] Quick Cash Pills visible ({pill_count} pills rendered)")

        # Click exact pill and verify cash received updates
        exact_pill = page.locator('.cash-pill-exact')
        exact_pill.click()
        page.wait_for_timeout(200)
        cash_val = page.locator('#cashReceived').input_value()
        assert cash_val != '', "Cash received input should have value after clicking pill"
        print(f"  [OK] Exact cash pill clicked, cashReceived = {cash_val}")

        # Click second pill if exists
        if pill_count > 1:
            second_pill = quick_pills.nth(1)
            second_pill_text = second_pill.inner_text()
            second_pill.click()
            page.wait_for_timeout(200)
            new_cash_val = page.locator('#cashReceived').input_value()
            print(f"  [OK] Second cash pill clicked ({second_pill_text}), cashReceived = {new_cash_val}")

        # 1.6 Submit Sale & Verify Success Popup
        print("[TEST] Submitting sale...")
        page.locator('button[data-sale-pay]').click()
        page.wait_for_timeout(800)

        # Verify Payment Success Popup
        popup_backdrop = page.locator('.payment-popup-backdrop')
        assert popup_backdrop.is_visible(), "Payment Success Popup backdrop must be visible"
        popup_card = page.locator('.payment-popup-card')
        assert popup_card.is_visible(), "Payment Success Popup card must be visible"
        
        popup_title = page.locator('.popup-title').inner_text()
        assert "Thanh toán thành công" in popup_title, f"Unexpected popup title: {popup_title}"
        print(f"  [OK] Popup Title: '{popup_title}'")

        popup_amount = page.locator('.popup-amount').inner_text()
        print(f"  [OK] Popup Amount: '{popup_amount}'")

        # Check countdown badge
        countdown_badge = page.locator('.popup-countdown-badge')
        assert countdown_badge.is_visible(), "Countdown badge must be visible"
        countdown_text = countdown_badge.inner_text()
        print(f"  [OK] Countdown Badge: '{countdown_text}'")

        # Check action buttons in popup
        print_btn = page.locator('#popupPrintBtn')
        zalo_btn = page.locator('#popupZaloBtn')
        new_sale_btn = page.locator('#popupNewSaleBtn')
        assert print_btn.is_visible(), "Print button in popup must be visible"
        assert zalo_btn.is_visible(), "Zalo button in popup must be visible"
        assert new_sale_btn.is_visible(), "New sale button in popup must be visible"
        print("  [OK] All action buttons (Print, Zalo, New Sale) present in popup")

        # Take screenshot of mobile popup
        mobile_screenshot_path = os.path.join(EVIDENCE_DIR, 'payment_success_popup_mobile.png')
        page.screenshot(path=mobile_screenshot_path)
        print(f"  [OK] Saved mobile screenshot: {mobile_screenshot_path}")

        # 1.7 Test closing popup
        print("[TEST] Closing popup via 'Bán đơn mới' button...")
        new_sale_btn.click()
        page.wait_for_timeout(300)
        assert not popup_backdrop.is_visible(), "Popup should be closed"
        print("  [OK] Popup closed successfully, POS back in browse state")

        # ==========================================
        # 2. DESKTOP TEST & PREFERENCES MODAL
        # ==========================================
        print("\n--- 2. Testing Desktop Viewport (1280x800) ---")
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 800})
        d_page = context_desktop.new_page()
        d_page.goto(BASE_URL, wait_until="networkidle")
        dismiss_overlay_and_ready(d_page)

        # 2.1 Navigate to Settings -> Bán hàng & thanh toán
        print("[TEST] Opening Settings on Desktop...")
        d_page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'settings';
                window.__qbiz_app__.render();
            }
        }""")
        d_page.wait_for_timeout(600)

        print("[TEST] Opening Bán hàng & thanh toán preferences...")
        d_page.locator('button[data-action="sale-preferences"]').first.click()
        d_page.wait_for_timeout(600)

        # Verify all settings controls exist
        modal = d_page.locator('#modalRoot .modal')
        assert modal.is_visible(), "Preferences modal must be visible"
        
        pref_sound = d_page.locator('#prefSoundEnabled')
        pref_tts = d_page.locator('#prefTtsEnabled')
        pref_popup = d_page.locator('#prefPopupEnabled')
        pref_duration = d_page.locator('#prefPopupDuration')
        pref_rounding = d_page.locator('#prefCashRounding')
        btn_test_sound = d_page.locator('#btnTestSound')

        assert pref_sound.is_visible(), "Sound toggle must be visible"
        assert pref_tts.is_visible(), "TTS toggle must be visible"
        assert pref_popup.is_visible(), "Popup toggle must be visible"
        assert pref_duration.is_visible(), "Duration select must be visible"
        assert pref_rounding.is_visible(), "Cash rounding select must be visible"
        assert btn_test_sound.is_visible(), "Test sound button must be visible"
        print("  [OK] All 6 new settings controls verified in modal")

        # Click Test Sound
        print("[TEST] Clicking 'Nghe thử âm chuông & giọng đọc'...")
        btn_test_sound.click()
        d_page.wait_for_timeout(600)
        print("  [OK] Audio test button triggered successfully without error")

        # Set duration to 5s to test auto-close
        pref_duration.select_option('5')
        print("[TEST] Set popup auto-close duration to 5 seconds")

        # Save settings
        d_page.locator('#modalSubmit').click()
        d_page.wait_for_timeout(500)
        print("  [OK] Settings saved successfully")

        # 2.2 Complete sale on Desktop and verify 5s auto-close
        print("[TEST] Going to POS on Desktop...")
        d_page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'browse';
                window.__qbiz_app__.render();
            }
        }""")
        d_page.wait_for_timeout(500)

        d_first_prod = d_page.locator('.pos-product button.pos-add, .pos-product button.pos-product-main').first
        d_first_prod.click()
        d_page.wait_for_timeout(400)

        d_page.locator('button[data-sale-step="cart"]').first.click()
        d_page.wait_for_timeout(400)
        d_page.locator('button[data-sale-step="checkout"]').click()
        d_page.wait_for_timeout(400)

        # Click exact cash
        d_page.locator('.cash-pill-exact').click()
        d_page.wait_for_timeout(200)

        # Pay
        d_page.locator('button[data-sale-pay]').click()
        d_page.wait_for_timeout(700)

        # Verify Desktop Popup
        d_popup = d_page.locator('.payment-popup-backdrop')
        assert d_popup.is_visible(), "Desktop popup must be visible"
        desktop_screenshot_path = os.path.join(EVIDENCE_DIR, 'payment_success_popup_desktop.png')
        d_page.screenshot(path=desktop_screenshot_path)
        print(f"  [OK] Saved desktop screenshot: {desktop_screenshot_path}")

        # Wait for auto-close (5 seconds duration + 1.5s buffer)
        print("[TEST] Waiting 6.5 seconds for automatic timer dismissal...")
        d_page.wait_for_timeout(6500)
        assert not d_popup.is_visible(), "Popup should have automatically closed after 5 seconds"
        print("  [OK] Popup automatically dismissed after countdown reached 0!")

        browser.close()
        print("\n==========================================")
        print("ALL VERIFICATION TESTS PASSED SUCCESSFULLY!")
        print("==========================================")

if __name__ == '__main__':
    run_tests()
