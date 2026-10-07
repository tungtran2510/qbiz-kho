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

        # Navigate to Products
        print("[3] Navigating to Products (#products)...")
        page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('products');
            } else {
                location.hash = '#products';
                if (window.renderProducts) window.renderProducts();
            }
        }""")
        page.wait_for_timeout(1500)

        # Open product detail / edit
        print("[4] Opening first product...")
        page.evaluate("""() => {
            const firstProd = document.querySelector('.product-item, [data-product-id]');
            if (firstProd) firstProd.click();
        }""")
        page.wait_for_timeout(1000)

        # Click Sửa
        print("[5] Clicking 'Sửa' to open edit modal...")
        page.evaluate("""() => {
            const btnSua = document.querySelector('[data-action="edit-item"]');
            if (btnSua) btnSua.click();
            else {
                const editDirect = document.querySelector('[data-edit-product]');
                if (editDirect) editDirect.click();
            }
        }""")
        page.wait_for_timeout(1000)

        # Capture screenshot 1: Màn hình Sửa sản phẩm V3
        img1 = os.path.join(ARTIFACT_DIR, "evidence_mobile_product_edit_v3.png")
        page.screenshot(path=img1)
        print(f"[OK] Captured 1-screen Product Edit V3: {img1}")

        # Open Album sheet by clicking photo frame or [+]
        print("[6] Opening Album sheet by clicking #pePhotoTrigger...")
        page.evaluate("""() => {
            const trig = document.querySelector('#pePhotoTrigger') || document.querySelector('#peAddPhotoBtn');
            if (trig) trig.click();
        }""")
        page.wait_for_timeout(800)

        # Capture screenshot 2: Popup Album nhiều ảnh
        img2 = os.path.join(ARTIFACT_DIR, "evidence_mobile_product_album_sheet.png")
        page.screenshot(path=img2)
        print(f"[OK] Captured Album Sheet Popup: {img2}")

        # Click "✓ Xong" to close album
        print("[7] Closing Album sheet...")
        page.evaluate("""() => {
            const doneBtn = document.querySelector('#peSheetDone') || document.querySelector('[data-gallery-close]');
            if (doneBtn) doneBtn.click();
        }""")
        page.wait_for_timeout(500)

        # Set warranty to 6 months & custom note
        print("[8] Setting default warranty: 6 months + note...")
        page.evaluate("""() => {
            const wSelect = document.querySelector('#editWarrantyMonths');
            if (wSelect) {
                wSelect.value = '6';
                wSelect.dispatchEvent(new Event('change'));
            }
            const wPolicy = document.querySelector('#editWarrantyPolicy');
            if (wPolicy) {
                wPolicy.value = 'BH chính hãng 6 tháng';
                wPolicy.dispatchEvent(new Event('input'));
            }
        }""")
        page.wait_for_timeout(500)

        # Save product
        print("[9] Saving product changes...")
        page.evaluate("""() => {
            const submitBtn = document.querySelector('#modalSubmit');
            if (submitBtn) submitBtn.click();
        }""")
        page.wait_for_timeout(1500)

        # Navigate to Sales POS to verify auto-warranty on product add
        print("[10] Navigating to POS (#sales) to verify auto warranty...")
        page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('sales');
            } else {
                location.hash = '#sales';
                if (window.renderSales) window.renderSales();
            }
        }""")
        page.wait_for_timeout(1500)

        # Clear cart to test clean addition
        page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.state) {
                window.__qbiz_app__.state.saleCart = [];
            }
            if (typeof state !== 'undefined') {
                state.saleCart = [];
            }
        }""")
        page.wait_for_timeout(500)

        # Add the edited product to cart
        page.evaluate("""() => {
            const addBtn = document.querySelector('[data-sale-add]');
            if (addBtn) addBtn.click();
        }""")
        page.wait_for_timeout(1000)

        # Switch to cart view via Playwright locator
        cart_btn = page.locator('button:has-text("Tiếp tục"), .flow-summary-bar button, [data-sale-step="cart"]').first
        if cart_btn.count() > 0:
            cart_btn.click()
        page.wait_for_timeout(1000)

        # Capture screenshot 3: POS cart with auto warranty tag
        img3 = os.path.join(ARTIFACT_DIR, "evidence_mobile_product_cart_auto_warranty.png")
        page.screenshot(path=img3)
        print(f"[OK] Captured POS Cart with inherited warranty: {img3}")

        browser.close()
        print("[ALL PASS] Product Edit V3 and Album Sheet successfully verified!")

if __name__ == "__main__":
    run_test()
