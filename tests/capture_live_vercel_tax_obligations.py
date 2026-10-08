# -*- coding: utf-8 -*-
import sys
import os
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

def capture_live():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        print("Navigating to live production: https://qbiz-kho.vercel.app...")
        page.goto("https://qbiz-kho.vercel.app", wait_until="networkidle")
        page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

        print("Loading demo and navigating to tax reports tab...")
        page.evaluate("async () => { await window.__qbiz_app__.previewDemo('retail'); }")
        page.wait_for_timeout(1500)

        page.evaluate("""() => {
            window.state.page = 'reports';
            window.state.reportTab = 'tax';
            window.render();
        }""")
        page.wait_for_timeout(1000)

        page.locator(".tax-profit-panel").scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        p1 = os.path.join(ARTIFACT_DIR, "live_vercel_tax_obligations_collapsed_mobile.png")
        page.screenshot(path=p1)
        print(f"Saved: {p1}")

        # Expand formula accordion
        page.locator(".tax-formula-accordion summary").click()
        page.wait_for_timeout(500)
        page.locator(".tax-formula-accordion").scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        p2 = os.path.join(ARTIFACT_DIR, "live_vercel_tax_obligations_expanded_mobile.png")
        page.screenshot(path=p2)
        print(f"Saved: {p2}")

        browser.close()

if __name__ == '__main__':
    capture_live()
