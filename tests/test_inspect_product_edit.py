# -*- coding: utf-8 -*-
import os
import sys
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
BASE_URL = "http://localhost:4180"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15"
        )
        page = context.new_page()
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_timeout(1500)
        
        # Enter demo shop if needed
        page.evaluate("""async () => {
            const demoBtn = document.querySelector('[data-action="preview-demo"]');
            if (demoBtn) demoBtn.click();
            else if (window.previewDemo) await window.previewDemo('retail');
            const modalClose = document.querySelector('#modalRoot [data-close], #modalRoot .close-btn');
            if (modalClose) modalClose.click();
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('products');
            } else {
                location.hash = '#products';
            }
        }""")
        page.wait_for_timeout(1500)
        
        # Open edit modal on the first product
        page.evaluate("""() => {
            const firstProd = document.querySelector('.product-item, [data-product-id]');
            if (firstProd) firstProd.click();
        }""")
        page.wait_for_timeout(800)
        
        # Click "Sửa"
        page.evaluate("""() => {
            const btnSua = document.querySelector('[data-action="edit-item"]');
            if (btnSua) {
                btnSua.click();
            } else {
                const editDirect = document.querySelector('[data-edit-product]');
                if (editDirect) editDirect.click();
            }
        }""")
        page.wait_for_timeout(1000)
        
        out_path = os.path.join(ARTIFACT_DIR, "evidence_current_product_edit_mobile.png")
        page.screenshot(path=out_path)
        print(f"[OK] Screenshot saved to: {out_path}")
        browser.close()

if __name__ == "__main__":
    main()
