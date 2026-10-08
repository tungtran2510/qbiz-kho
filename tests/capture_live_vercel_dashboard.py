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
    page.evaluate("() => { window.__qbiz_app__.navigate('dashboard'); }")
    page.wait_for_timeout(1000)

    card = page.locator(".dash-analytics-card")
    card.scroll_into_view_if_needed()
    page.wait_for_timeout(500)

    live_path = os.path.join(ARTIFACT_DIR, "evidence_live_vercel_dashboard_tax_profit_mobile.png")
    page.screenshot(path=live_path)
    print(f"Live Vercel Screenshot saved: {live_path}")

    # Also test 30d toggle on live Vercel
    page.evaluate("() => { const b = document.querySelector('[data-dash-range=\"30d\"]'); if (b) b.click(); }")
    page.wait_for_timeout(800)
    card.scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    live_30d_path = os.path.join(ARTIFACT_DIR, "evidence_live_vercel_dashboard_tax_profit_30d_mobile.png")
    page.screenshot(path=live_30d_path)
    print(f"Live Vercel 30d Screenshot saved: {live_30d_path}")

    browser.close()
    print("Done!")
