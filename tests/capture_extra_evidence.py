import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), 'evidence')
os.makedirs(EVIDENCE_DIR, exist_ok=True)
BASE_URL = "http://localhost:4180/"

def dismiss_overlay(page):
    page.wait_for_timeout(1000)
    btn_demo = page.locator('[data-action="preview-demo"]').first
    if btn_demo.count() > 0 and btn_demo.is_visible():
        btn_demo.click()
        page.wait_for_timeout(800)
    else:
        page.evaluate("() => { const ov = document.querySelector('.public-entry-overlay, #publicEntryOverlay'); if(ov) ov.remove(); }")
        page.wait_for_timeout(400)

def capture_extra_evidence():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Checkout with Quick Cash Pills on Mobile
        ctx = browser.new_context(
            viewport={'width': 412, 'height': 915},
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
        )
        page = ctx.new_page()
        page.goto(BASE_URL, wait_until="networkidle")
        dismiss_overlay(page)

        page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'browse';
                window.__qbiz_app__.render();
            }
        }""")
        page.wait_for_timeout(500)

        page.locator('.pos-product button.pos-add, .pos-product button.pos-product-main').first.click()
        page.wait_for_timeout(400)
        page.locator('button[data-sale-step="cart"]').first.click()
        page.wait_for_timeout(400)
        page.locator('button[data-sale-step="checkout"]').click()
        page.wait_for_timeout(500)

        # Capture Checkout with Quick Cash Pills
        checkout_pills_path = os.path.join(EVIDENCE_DIR, 'evidence_quick_cash_pills_mobile.png')
        page.screenshot(path=checkout_pills_path)
        print(f"[OK] Saved checkout quick pills: {checkout_pills_path}")

        # 2. Preferences modal on Mobile
        page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.openSalePreferences();
            }
        }""")
        page.wait_for_timeout(600)
        prefs_modal_path = os.path.join(EVIDENCE_DIR, 'evidence_preferences_modal_mobile.png')
        page.screenshot(path=prefs_modal_path)
        print(f"[OK] Saved preferences modal: {prefs_modal_path}")

        browser.close()

if __name__ == '__main__':
    capture_extra_evidence()
