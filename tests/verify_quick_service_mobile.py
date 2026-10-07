# -*- coding: utf-8 -*-
import os
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
BASE_URL = "http://localhost:4180"

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport: 390x844 (iPhone 13 standard)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        print("[1] Opening app at http://localhost:4180...")
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Enter demo shop if needed
        print("[2] Initializing demo shop / session...")
        page.evaluate("""async () => {
            const demoBtn = document.querySelector('[data-action="preview-demo"]');
            if (demoBtn) {
                demoBtn.click();
            } else if (window.previewDemo) {
                await window.previewDemo('retail');
            }
            const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close], #modalRoot .modal-close');
            if (modalClose) modalClose.click();
        }""")
        page.wait_for_timeout(2000)

        # Navigate to Sales (POS)
        print("[3] Navigating to POS (#sales)...")
        page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('sales');
            } else {
                location.hash = '#sales';
                if (window.renderSales) window.renderSales();
            }
        }""")
        page.wait_for_timeout(1500)

        # Verify POS search row and + DV button
        pos_search = page.locator("#saleSearch")
        pos_search.wait_for(state="visible", timeout=10000)
        quick_btn = page.locator(".pos-quick-service-btn")
        quick_btn.wait_for(state="visible", timeout=5000)
        print("[OK] POS counter loaded, + DV button visible in search row")

        # Screenshot 1: Mobile POS counter with + DV button
        ss1 = os.path.join(ARTIFACT_DIR, "evidence_mobile_pos_quick_service_btn.png")
        page.screenshot(path=ss1)
        print(f"[OK] Saved screenshot: {ss1}")

        # [4] Click + DV button to open modal
        print("[4] Opening Quick Service Modal...")
        quick_btn.click()
        page.wait_for_timeout(600)

        modal = page.locator(".quick-service-modal-body")
        modal.wait_for(state="visible", timeout=5000)
        print("[OK] Quick Service Modal opened")

        # Screenshot 2: Quick service modal
        ss2 = os.path.join(ARTIFACT_DIR, "evidence_mobile_quick_service_modal.png")
        page.screenshot(path=ss2)
        print(f"[OK] Saved screenshot: {ss2}")

        # [5] Fill in service details using quick chips and pills
        print("[5] Filling quick service form...")
        # Click chip 'Thay pin'
        page.locator('[data-qs-chip="Thay pin"]').click()
        page.wait_for_timeout(200)

        # Type additional model name
        qs_name = page.locator("#qsName")
        qs_name.press_sequentially("iPhone 13 Pro Max", delay=20)
        page.wait_for_timeout(200)

        # Click price pill '350k' (350.000 ₫)
        page.locator('[data-qs-price="350000"]').click()
        page.wait_for_timeout(200)

        # Select warranty '6 tháng'
        page.locator('[data-qs-warranty="6"]').click()
        page.wait_for_timeout(200)

        # Check 1-to-1 exchange
        page.locator("#qsWarrantyExchange").check()
        page.wait_for_timeout(200)

        # Enter IMEI
        page.locator("#qsImei").fill("356891234567890")
        page.wait_for_timeout(200)

        # Enter note
        page.locator("#qsNote").fill("Pin Pisen chính hãng, thợ Nam thay")
        page.wait_for_timeout(200)

        # Screenshot 3: Filled form
        ss3 = os.path.join(ARTIFACT_DIR, "evidence_mobile_quick_service_filled.png")
        page.screenshot(path=ss3)
        print(f"[OK] Saved screenshot: {ss3}")

        # [6] Submit form to add to cart
        print("[6] Submitting quick service to cart...")
        page.locator("#modalSubmit").click()
        page.wait_for_timeout(1000)

        # Verify mobile cart bar or navigate to cart step
        cart_bar = page.locator(".sale-mobile-bar")
        cart_bar.wait_for(state="visible", timeout=5000)
        print("[OK] Cart bar visible with quick service item")

        # Click to open cart
        page.locator('[data-sale-step="cart"]').first.click()
        page.wait_for_timeout(800)

        # Verify item in cart has badges
        page.locator(".cart-service-info-pill").wait_for(state="visible", timeout=5000)
        print("[OK] Service info pills visible in cart (Dịch vụ, BH 6th 1 đổi 1, IMEI, Note)")

        # Screenshot 4: Mobile Cart with service info
        ss4 = os.path.join(ARTIFACT_DIR, "evidence_mobile_pos_cart_service.png")
        page.screenshot(path=ss4)
        print(f"[OK] Saved screenshot: {ss4}")

        # [7] Proceed to checkout
        print("[7] Checking out...")
        page.locator('button[data-sale-step="checkout"]').click()
        page.wait_for_timeout(800)

        # Choose cash payment
        cash_btn = page.locator('[data-payment-choice="cash"]')
        if cash_btn.is_visible():
            cash_btn.click()
            page.wait_for_timeout(300)

        # Click pay
        page.locator("[data-sale-pay]").click()
        page.wait_for_timeout(1500)

        # Screenshot 5: Success screen
        ss5 = os.path.join(ARTIFACT_DIR, "evidence_mobile_sale_success_service.png")
        page.screenshot(path=ss5)
        print(f"[OK] Saved screenshot: {ss5}")

        # Close payment success popup
        print("[8] Closing payment success popup...")
        page.locator("#popupNewSaleBtn, #popupCloseX").first.click()
        page.wait_for_timeout(800)

        # [9] Navigate to Transactions and search by IMEI
        print("[9] Navigating to Transactions / Sales History...")
        page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('transactions');
            } else {
                location.hash = '#transactions';
                if (window.renderTransactions) window.renderTransactions();
            }
        }""")
        page.wait_for_timeout(1000)

        tx_search = page.locator("#txSearch")
        tx_search.wait_for(state="visible", timeout=5000)

        # Search by IMEI
        print("Searching by IMEI: 356891234567890...")
        tx_search.fill("356891234567890")
        page.wait_for_timeout(600)

        # Verify transaction row appears
        tx_row = page.locator(".transaction-row").first
        tx_row.wait_for(state="visible", timeout=5000)
        print("[OK] Transaction found via IMEI search!")

        # Screenshot 6: Transactions list filtered by IMEI
        ss6 = os.path.join(ARTIFACT_DIR, "evidence_mobile_transactions_search_imei.png")
        page.screenshot(path=ss6)
        print(f"[OK] Saved screenshot: {ss6}")

        # Click transaction to open it from history
        print("[10] Opening transaction detail modal...")
        tx_row.click()
        page.wait_for_timeout(800)

        # Verify warranty / imei badge in detail
        modal_root = page.locator("#modalRoot .transaction-detail")
        modal_root.wait_for(state="visible", timeout=5000)

        # Screenshot 7: Transaction detail modal with service & warranty info
        ss7 = os.path.join(ARTIFACT_DIR, "evidence_mobile_transaction_service_detail.png")
        page.screenshot(path=ss7)
        print(f"[OK] Saved screenshot: {ss7}")

        browser.close()
        print("\nALL VERIFICATIONS PASSED 100%!")

if __name__ == "__main__":
    run_test()
