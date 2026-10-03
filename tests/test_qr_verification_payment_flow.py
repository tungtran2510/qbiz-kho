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

def test_qr_payment_flow():
    print("[TEST] Starting Verified QR & Bank Transfer Payment Flow Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # ==========================================
        # 1. MOBILE VIEWPORT (412x915)
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

        # 1.1 Navigate to POS
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
        page.wait_for_timeout(400)

        # 1.3 Open cart & proceed to checkout
        print("[TEST] Opening Cart & going to Checkout...")
        page.locator('button[data-sale-step="cart"]').first.click()
        page.wait_for_timeout(400)
        page.locator('button[data-sale-step="checkout"]').click()
        page.wait_for_timeout(500)

        # 1.4 Select QR payment method
        print("[TEST] Selecting QR payment method...")
        qr_choice = page.locator('button[data-payment-choice="qr"]')
        qr_choice.click()
        page.wait_for_timeout(400)

        # 1.5 Verify QR payment panel
        print("[TEST] Verifying QR payment panel...")
        qr_panel = page.locator('.qr-payment-panel')
        assert qr_panel.is_visible(), "QR payment panel must be visible when QR is selected"
        
        qr_card = page.locator('.qr-payment-card')
        assert qr_card.is_visible(), "QR card must be visible"

        qr_img = page.locator('.vietqr-scan-img, .qr-placeholder')
        assert qr_img.is_visible(), "QR image or placeholder must be visible"

        # Check bank details
        bank_details = page.locator('.qr-details-group')
        assert bank_details.is_visible(), "Bank details group must be visible"
        assert "Ngân hàng:" in bank_details.inner_text()
        assert "Số TK:" in bank_details.inner_text()
        assert "Số tiền:" in bank_details.inner_text()
        print("  [OK] Bank details and transfer amount rendered correctly")

        # Check waiting status
        waiting_status = page.locator('#qrWaitingStatus')
        assert waiting_status.is_visible(), "Waiting status must be visible"
        assert "Chờ khách quét mã" in waiting_status.inner_text()
        print("  [OK] Live waiting status 'Chờ khách quét mã thanh toán' displayed")

        # Check Pay button text before verification
        pay_btn = page.locator('button[data-sale-pay]')
        pay_text = pay_btn.inner_text()
        assert "Xác thực đã nhận tiền (Xác thực QR)" in pay_text, f"Expected verify button text, got: {pay_text}"
        print(f"  [OK] Pay button clearly states: '{pay_text}'")

        # Wait for QR image to load
        page.wait_for_timeout(1500)

        # Capture QR checkout panel screenshot
        qr_panel_screenshot = os.path.join(EVIDENCE_DIR, 'evidence_qr_checkout_panel_mobile.png')
        page.screenshot(path=qr_panel_screenshot)
        print(f"  [OK] Captured mobile QR panel screenshot: {qr_panel_screenshot}")

        # 1.6 Test checking bank transaction
        print("[TEST] Clicking 'Kiểm tra giao dịch ngân hàng'...")
        check_btn = page.locator('#qrCheckBtn')
        assert check_btn.is_visible(), "Bank check button must be visible"
        check_btn.click()
        page.wait_for_timeout(1200)

        # Verify status changes to verified
        verified_status = page.locator('#qrWaitingStatus.verified')
        assert verified_status.is_visible(), "Waiting status should have 'verified' class after check"
        assert "Đã phát hiện giao dịch khớp" in verified_status.inner_text()
        print("  [OK] Transaction check simulated successfully, verified badge displayed")

        # 1.7 Submit & Verify Payment Gate (Chime, TTS, Popup)
        print("[TEST] Cashier clicks 'Xác thực đã nhận tiền'...")
        pay_btn.click()
        page.wait_for_timeout(800)

        # Verify Payment Success Popup
        popup = page.locator('.payment-popup-backdrop')
        assert popup.is_visible(), "Payment Success popup must be visible after verification"

        title = page.locator('.popup-title').inner_text()
        assert "Thanh toán thành công" in title

        method_text = page.locator('.popup-summary-row:has-text("Phương thức") b').inner_text()
        assert "QR (Đã xác thực)" in method_text, f"Expected 'QR (Đã xác thực)', got: {method_text}"
        print(f"  [OK] Success popup method badge: '{method_text}'")

        # Check that redundant QR code is NOT inside popup
        popup_qr = page.locator('.popup-qr-preview')
        assert popup_qr.count() == 0 or not popup_qr.is_visible(), "Redundant QR code must NOT be in success popup"
        print("  [OK] Redundant QR code eliminated from success popup")

        # Capture verified success popup screenshot
        popup_screenshot = os.path.join(EVIDENCE_DIR, 'evidence_qr_success_verified_mobile.png')
        page.screenshot(path=popup_screenshot)
        print(f"  [OK] Captured verified mobile success screenshot: {popup_screenshot}")

        # Close popup
        page.locator('#popupNewSaleBtn').click()
        page.wait_for_timeout(400)

        # ==========================================
        # 2. TEST CASH UNDERPAYMENT PREVENTION
        # ==========================================
        print("\n--- 2. Testing Cash Underpayment Protection ---")
        # Add product
        first_product.click()
        page.wait_for_timeout(400)
        page.locator('button[data-sale-step="cart"]').first.click()
        page.wait_for_timeout(300)
        page.locator('button[data-sale-step="checkout"]').click()
        page.wait_for_timeout(400)

        # Payment is cash by default. Enter 1000₫ (much less than total)
        print("[TEST] Entering underpayment amount (1000 ₫)...")
        cash_input = page.locator('#cashReceived')
        cash_input.fill('1000')
        page.wait_for_timeout(200)

        # Attempt to pay
        print("[TEST] Attempting to submit underpaid cash sale...")
        page.locator('button[data-sale-pay]').click()
        page.wait_for_timeout(500)

        # Popup should NOT be open
        assert not page.locator('.payment-popup-backdrop').is_visible(), "Underpaid sale must NOT complete!"
        print("  [OK] Underpaid sale successfully blocked with toast warning!")

        # ==========================================
        # 3. DESKTOP VIEWPORT (1280x800)
        # ==========================================
        print("\n--- 3. Testing Desktop Viewport (1280x800) ---")
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 800})
        d_page = context_desktop.new_page()
        d_page.goto(BASE_URL, wait_until="networkidle")
        dismiss_overlay_and_ready(d_page)

        d_page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'browse';
                window.__qbiz_app__.render();
            }
        }""")
        d_page.wait_for_timeout(500)

        # Add product on desktop
        d_page.locator('.pos-product button.pos-add, .pos-product button.pos-product-main').first.click()
        d_page.wait_for_timeout(400)
        d_page.locator('button[data-sale-step="cart"]').first.click()
        d_page.wait_for_timeout(400)
        d_page.locator('button[data-sale-step="checkout"]').click()
        d_page.wait_for_timeout(400)

        # Select QR on desktop
        d_page.locator('button[data-payment-choice="qr"]').click()
        d_page.wait_for_timeout(1500)

        desktop_qr_screenshot = os.path.join(EVIDENCE_DIR, 'evidence_qr_checkout_panel_desktop.png')
        d_page.screenshot(path=desktop_qr_screenshot)
        print(f"  [OK] Captured desktop QR panel screenshot: {desktop_qr_screenshot}")

        browser.close()
        print("\n==========================================")
        print("ALL QR VERIFICATION TESTS PASSED 100%!")
        print("==========================================")

if __name__ == '__main__':
    test_qr_payment_flow()
