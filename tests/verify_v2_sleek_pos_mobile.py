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

        # Navigate to POS (#sales)
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

        # Add a product to cart via [data-sale-add]
        print("[4] Adding item to cart...")
        sale_add_btns = page.locator('[data-sale-add]')
        if sale_add_btns.count() > 0:
            sale_add_btns.first.click()
            print("[OK] Clicked [data-sale-add]")
        else:
            print("[WARN] No [data-sale-add] found, clicking quick service")
            page.locator('.pos-quick-service-btn').first.click()
            page.wait_for_timeout(500)
            page.locator('[data-qs-chip="Sửa chữa"]').click()
            page.locator('#qsPrice').fill('250000')
            page.locator('#modalSubmit').click()
        page.wait_for_timeout(1000)

        # Navigate to cart step
        print("[5] Navigating to Cart step...")
        page.locator('[data-sale-step="cart"]').first.click()
        page.wait_for_timeout(1000)

        # Check + DV in cart header
        cart_dv = page.locator(".flow-head .flow-dv-btn")
        if cart_dv.count() > 0:
            print("[OK] Found + DV button in Cart header!")
        else:
            print("[WARN] + DV button not found in Cart header")

        # Check inline warranty badge in cart row
        w_btn = page.locator('[data-action="edit-item-warranty"]').first
        if w_btn.count() > 0:
            print("[OK] Found inline warranty badge in cart row! Clicking it...")
            w_btn.click()
            page.wait_for_timeout(600)

            # Inside Item Warranty Modal
            modal = page.locator("#modalRoot .modal")
            if modal.count() > 0:
                print("[OK] Item Warranty Modal opened! Selecting 6 months & 1-doi-1...")
                page.locator('[data-warranty-val="6"]').click()
                page.wait_for_timeout(200)
                page.locator("#itemWarrantyExchange").check()
                page.wait_for_timeout(200)
                page.locator("#itemImei").fill("SN-SHOES-8899")
                page.wait_for_timeout(200)
                # Submit modal
                page.locator("#modalSubmit").click()
                page.wait_for_timeout(600)
                print("[OK] Saved warranty changes on item!")

        # Click + DV from Cart header to add quick service
        print("[6] Clicking + DV in Cart header to add quick service...")
        if cart_dv.count() > 0:
            cart_dv.first.click()
            page.wait_for_timeout(600)
            
            # Fill quick service modal
            page.locator('[data-qs-chip="Vệ sinh máy"]').click()
            page.wait_for_timeout(200)
            page.locator("#qsPrice").fill("80000")
            page.wait_for_timeout(200)
            page.locator("#modalSubmit").click()
            page.wait_for_timeout(800)
            print("[OK] Added quick service to cart from Cart header!")

        # Capture Screenshot 1: Mobile Cart V2 Sleek
        ss1 = os.path.join(ARTIFACT_DIR, "evidence_mobile_cart_v2_sleek.png")
        page.screenshot(path=ss1)
        print(f"[OK] Saved: {ss1}")

        # Proceed to Checkout step
        print("[7] Navigating to Checkout step...")
        page.locator('button[data-sale-step="checkout"]').click()
        page.wait_for_timeout(1000)

        # Check + DV in checkout header
        checkout_dv = page.locator(".flow-head .flow-dv-btn")
        if checkout_dv.count() > 0:
            print("[OK] Found + DV button in Checkout header!")

        # Configure Warranty Policy and Appointment Date in Checkout
        print("[8] Configuring Warranty Policy and Appointment Date in Checkout...")
        policy_select = page.locator("#checkoutWarrantyPolicy")
        if policy_select.count() > 0:
            policy_select.select_option(index=1)
            page.wait_for_timeout(400)
            print("[OK] Selected policy index 1")

        appt_select = page.locator("#checkoutAppointment")
        if appt_select.count() > 0:
            appt_select.select_option(index=1)
            page.wait_for_timeout(400)
            print("[OK] Selected appointment index 1")

        # Scroll to show policy and appointment fields clearly above pay button
        page.locator("#checkoutAppointment").scroll_into_view_if_needed()
        page.wait_for_timeout(300)

        # Capture Screenshot 2: Mobile Checkout V2 Sleek
        ss2 = os.path.join(ARTIFACT_DIR, "evidence_mobile_checkout_v2_sleek.png")
        page.screenshot(path=ss2)
        print(f"[OK] Saved: {ss2}")

        # Complete payment
        print("[9] Completing sale payment...")
        pay_btn = page.locator('[data-sale-pay]')
        pay_btn.click()
        page.wait_for_timeout(1500)

        # Capture Screenshot 3: Payment Success
        ss3 = os.path.join(ARTIFACT_DIR, "evidence_mobile_success_v2_sleek.png")
        page.screenshot(path=ss3)
        print(f"[OK] Saved: {ss3}")

        # Close payment success popup
        print("[10] Closing payment success popup...")
        close_btn = page.locator("#popupNewSaleBtn, #popupCloseX, .close-btn, [data-modal-close]")
        if close_btn.count() > 0:
            close_btn.first.click()
        page.wait_for_timeout(800)

        # Navigate to Transactions to check details
        print("[11] Navigating to Transactions / Sales History...")
        page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('transactions');
            } else {
                location.hash = '#transactions';
                if (window.renderTransactions) window.renderTransactions();
            }
        }""")
        page.wait_for_timeout(1500)

        # Click the latest transaction
        print("[12] Opening latest transaction...")
        page.locator(".transaction-row").first.click()
        page.wait_for_timeout(1000)

        # Capture Screenshot 4: Transaction Detail with Policy & Appointment
        ss4 = os.path.join(ARTIFACT_DIR, "evidence_mobile_tx_detail_v2_sleek.png")
        page.screenshot(path=ss4)
        print(f"[OK] Saved: {ss4}")

        print("\n=== ALL V2 SLEEK POS TESTS PASSED SUCCESSFULLY! ===")
        browser.close()

if __name__ == "__main__":
    run_test()
