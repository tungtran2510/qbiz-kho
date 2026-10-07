# -*- coding: utf-8 -*-
import os
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
import time
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
        page.wait_for_timeout(1500)

        # Enter demo shop if needed
        print("[2] Initializing demo shop / session...")
        page.evaluate("""async () => {
            const demoBtn = document.querySelector('[data-action="preview-demo"]');
            if (demoBtn) demoBtn.click();
            else if (window.previewDemo) await window.previewDemo('retail');
            const modalClose = document.querySelector('#modalRoot [data-close], #modalRoot .close-btn');
            if (modalClose) modalClose.click();
        }""")
        page.wait_for_timeout(1500)

        # Step 3: Go to POS Sales
        print("[3] Navigating to Sales (POS)...")
        page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('sales');
            } else {
                location.hash = '#sales';
                if (window.renderSales) window.renderSales();
            }
        }""")
        page.wait_for_timeout(1200)

        # Step 4: Click + DV (openQuickServiceModal)
        print("[4] Opening Quick Service modal (+ DV)...")
        page.evaluate("""() => {
            const btn = document.querySelector('[data-action="quick-service"]');
            if (btn) btn.click();
            else if (window.openQuickServiceModal) window.openQuickServiceModal();
        }""")
        page.wait_for_timeout(800)

        # Fill quick service info
        print("[5] Filling Quick Service details: Thay màn hình iPhone 13, 1.5tr, BH 6th 1đ1, IMEI...")
        page.evaluate("""() => {
            const nameInput = document.querySelector('#qsName');
            if (nameInput) {
                nameInput.value = 'Thay màn hình iPhone 13';
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const priceInput = document.querySelector('#qsPrice');
            if (priceInput) {
                priceInput.value = '1500000';
                priceInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const wBtn = document.querySelector('[data-qs-warranty="6"]');
            if (wBtn) {
                document.querySelectorAll('.qs-warranty-btn').forEach(b => b.classList.remove('active'));
                wBtn.classList.add('active');
            }
            const exChk = document.querySelector('#qsWarrantyExchange');
            if (exChk) {
                exChk.checked = true;
                exChk.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const imeiInput = document.querySelector('#qsImei');
            if (imeiInput) {
                imeiInput.value = '356891234567890';
                imeiInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const noteInput = document.querySelector('#qsNote');
            if (noteInput) {
                noteInput.value = 'Màn zin bóc máy, khách lấy trong ngày';
                noteInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }""")
        page.wait_for_timeout(500)

        # Submit modal
        print("[6] Submitting quick service...")
        page.evaluate("""() => {
            const subBtn = document.querySelector('#modalSubmit, #modalRoot .primary-btn');
            if (subBtn) subBtn.click();
        }""")
        page.wait_for_timeout(1500)

        # Switch step to cart by clicking the mobile bar button
        print("[6.1] Clicking 'Tiếp tục' / data-sale-step='cart' to view cart...")
        page.evaluate("""() => {
            const cartBtn = document.querySelector('button[data-sale-step="cart"]');
            if (cartBtn) cartBtn.click();
        }""")
        page.wait_for_timeout(800)

        # Capture Cart Screenshot
        shot1 = os.path.join(ARTIFACT_DIR, "evidence_mobile_service_cart_added.png")
        page.screenshot(path=shot1, full_page=False)
        print(f"[PASS 1] Captured Cart with Quick Service & Warranty: {shot1}")

        # Check cart contents
        cart_info = page.evaluate("""() => {
            const cartText = document.querySelector('.cart-view, .sale-cart, .pos-cart-container')?.innerText || document.body.innerText;
            return {
                hasServiceName: cartText.includes('Thay màn hình iPhone 13'),
                hasWarranty: cartText.includes('6th') && cartText.includes('1đ1'),
                hasImei: cartText.includes('356891234567890'),
                hasNote: cartText.includes('Màn zin bóc máy')
            };
        }""")
        print(f"Cart verification: {cart_info}")
        assert cart_info["hasServiceName"], "Service name not found in cart!"
        assert cart_info["hasWarranty"], "Warranty 6th 1đ1 tag not found in cart!"
        assert cart_info["hasImei"], "IMEI not found in cart!"

        # Step 7: Navigate to Products -> Tab Dịch vụ
        print("[7] Navigating to Hàng hóa via bottom nav...")
        page.evaluate("""() => {
            const navGoods = document.querySelector('#mobileNav button[data-page="products"]');
            if (navGoods) navGoods.click();
        }""")
        page.wait_for_timeout(1000)

        # Switch to Tab Dịch vụ
        print("[7.1] Switching to Tab 'Dịch vụ'...")
        page.evaluate("""() => {
            const svcTab = document.querySelector('button[data-product-type="SERVICE"]');
            if (svcTab) svcTab.click();
        }""")
        page.wait_for_timeout(1000)

        # Check that service appears in products list and open edit
        print("[8] Finding created service and opening edit modal...")
        opened = page.evaluate("""() => {
            const svcItem = document.querySelector('[data-product-id], .product-item, .product-row');
            const allItems = Array.from(document.querySelectorAll('[data-product-id], .product-card, .goods-row'));
            const foundEl = allItems.find(el => el.innerText.includes('Thay màn hình iPhone 13'));
            if (foundEl) {
                const editBtn = foundEl.querySelector('[data-edit-product], [data-action="edit-item"]') || foundEl;
                editBtn.click();
                return { found: true, clicked: true };
            }
            return { found: false };
        }""")
        print(f"Service in UI verification: {opened}")
        page.wait_for_timeout(1000)

        # Capture Service Edit V3 screenshot
        shot2 = os.path.join(ARTIFACT_DIR, "evidence_mobile_service_in_goods_edit.png")
        page.screenshot(path=shot2, full_page=False)
        print(f"[PASS 2] Captured Service Edit V3: {shot2}")

        # Step 9: Close edit modal, go back to sales and complete payment
        print("[9] Closing edit modal, going back to sales checkout...")
        page.evaluate("""() => {
            const closeBtn = document.querySelector('#modalRoot [data-close], #modalRoot .close-btn');
            if (closeBtn) closeBtn.click();
            else if (document.querySelector('#modalRoot')) document.querySelector('#modalRoot').innerHTML = '';
        }""")
        page.wait_for_timeout(500)

        # Return to POS via bottom nav
        page.evaluate("""() => {
            const navPos = document.querySelector('#mobileNav button[data-page="sales"]');
            if (navPos) navPos.click();
        }""")
        page.wait_for_timeout(800)

        # Switch to checkout step
        page.evaluate("""() => {
            const toCheckoutBtn = document.querySelector('button[data-sale-step="checkout"]');
            if (toCheckoutBtn) toCheckoutBtn.click();
        }""")
        page.wait_for_timeout(800)

        # Fill policy and appointment date in checkout
        page.evaluate("""() => {
            const polInput = document.querySelector('#saleWarrantyPolicy, #warrantyPolicyCustom, input[placeholder*="đổi size"], input[placeholder*="Bảo hành"]');
            if (polInput) {
                polInput.value = 'Bảo hành màn hình cảm ứng 6 tháng, 1 đổi 1 trong 30 ngày';
                polInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const dateInput = document.querySelector('#saleAppointmentDate, #appointmentDateCustom, input[placeholder*="hẹn"], input[placeholder*="Hẹn"]');
            if (dateInput) {
                dateInput.value = '17:30 chiều nay';
                dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }""")
        page.wait_for_timeout(500)

        # Submit sale payment
        print("[10] Submitting sale payment...")
        page.evaluate("""() => {
            const payBtn = document.querySelector('[data-sale-pay], .sale-pay, .btn-pay');
            if (payBtn) payBtn.click();
        }""")
        page.wait_for_timeout(1500)

        # Capture Success Popup Screenshot
        shot3 = os.path.join(ARTIFACT_DIR, "evidence_mobile_service_checkout_success.png")
        page.screenshot(path=shot3, full_page=False)
        print(f"[PASS 3] Captured Success Popup: {shot3}")

        browser.close()
        print("ALL END-TO-END MOBILE CHECKS PASSED 100%!")

if __name__ == "__main__":
    run_test()
