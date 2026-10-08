# -*- coding: utf-8 -*-
import sys
import os
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True
    )
    page = context.new_page()
    print("Navigating to https://qbiz-kho.vercel.app...")
    page.goto("https://qbiz-kho.vercel.app", wait_until="networkidle")
    page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

    page.evaluate("async () => { await window.__qbiz_app__.previewDemo('retail'); }")
    page.wait_for_timeout(1500)

    page.evaluate("""() => {
        window.state.page = 'reports';
        window.state.reportTab = 'tax';
        window.render();
    }""")
    page.wait_for_timeout(1000)

    # 1. Collapsed screenshot
    path_col = os.path.join(ARTIFACT_DIR, "live_vercel_tax_tab_collapsed_mobile.png")
    page.screenshot(path=path_col)
    print(f"Saved: {path_col}")

    # 2. Expanded screenshot
    page.evaluate("() => { const a = document.querySelector('.tax-official-accordion summary'); if (a) a.click(); }")
    page.wait_for_timeout(500)

    accordion = page.locator(".tax-official-accordion")
    accordion.scroll_into_view_if_needed()
    page.wait_for_timeout(300)

    path_exp = os.path.join(ARTIFACT_DIR, "live_vercel_tax_tab_expanded_mobile.png")
    page.screenshot(path=path_exp)
    print(f"Saved: {path_exp}")

    browser.close()
    print("Live Vercel verification complete!")
