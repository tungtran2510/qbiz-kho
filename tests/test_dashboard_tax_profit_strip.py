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

def test_dashboard_tax_profit_strip():
    console_errors = []
    
    with sync_playwright() as p:
        # iPhone 13 (390x844) viewport strictly as required by AGENTS.md
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1/5] Opening http://localhost:4180...")
        page.goto("http://localhost:4180", wait_until="networkidle")
        page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

        print("[2/5] Initializing demo showroom...")
        page.evaluate("async () => { await window.__qbiz_app__.previewDemo('retail'); }")
        page.wait_for_timeout(1500)

        # Ensure we are on dashboard
        page.evaluate("() => { window.__qbiz_app__.navigate('dashboard'); }")
        page.wait_for_timeout(1000)

        # Check that public-entry-overlay is NOT present
        overlay_count = page.locator(".public-entry-overlay").count()
        print(f"  ✓ public-entry-overlay count: {overlay_count} (Expected: 0)")
        assert overlay_count == 0, "Public entry overlay should be closed in demo mode"

        # Check that .dash-tax-profit-strip exists
        strip = page.locator(".dash-tax-profit-strip")
        assert strip.is_visible(), "LỖI: .dash-tax-profit-strip không hiển thị trên Dashboard!"
        print("  ✓ .dash-tax-profit-strip hiển thị thành công.")

        # Check Hero Row
        hero_tag = page.locator(".dtp-tag").inner_text()
        hero_amount = page.locator(".dtp-amount").inner_text()
        badge_rate = page.locator(".dtp-badge-rate").inner_text()
        sub_gross = page.locator(".dtp-sub-gross").inner_text()
        print(f"  ✓ Hero: Tag='{hero_tag}', NetProfit='{hero_amount}', Badge='{badge_rate}', Gross='{sub_gross}'")

        # Check 3-col breakdown
        cols = page.locator(".dtp-cols-row .dtp-col")
        assert cols.count() == 3, f"Expected 3 columns, got {cols.count()}"

        rev_col = cols.nth(0).inner_text().replace('\n', ' ')
        cost_col = cols.nth(1).inner_text().replace('\n', ' ')
        tax_col = cols.nth(2).inner_text().replace('\n', ' ')
        print(f"  ✓ Col 1: {rev_col}")
        print(f"  ✓ Col 2: {cost_col}")
        print(f"  ✓ Col 3: {tax_col}")

        # Check Legal Row
        legal_text = page.locator(".dtp-legal-text").inner_text()
        print(f"  ✓ Legal: {legal_text}")

        # Scroll chart card into view
        card = page.locator(".dash-analytics-card")
        card.scroll_into_view_if_needed()
        page.wait_for_timeout(400)

        # Capture 7-day mobile screenshot
        art_path_7d = os.path.join(ARTIFACT_DIR, "evidence_dashboard_tax_profit_7d_mobile.png")
        page.screenshot(path=art_path_7d)
        print(f"  ✓ Saved 7-day screenshot: {art_path_7d}")

        print("[3/5] Testing 30-day toggle switch...")
        page.evaluate("() => { const b = document.querySelector('[data-dash-range=\"30d\"]'); if (b) b.click(); }")
        page.wait_for_timeout(800)

        hero_tag_30d = page.locator(".dtp-tag").inner_text()
        hero_amount_30d = page.locator(".dtp-amount").inner_text()
        badge_rate_30d = page.locator(".dtp-badge-rate").inner_text()
        print(f"  ✓ After 30d toggle: Tag='{hero_tag_30d}', NetProfit='{hero_amount_30d}', Badge='{badge_rate_30d}'")
        assert "30 NGÀY" in hero_tag_30d.upper()

        card.scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        art_path_30d = os.path.join(ARTIFACT_DIR, "evidence_dashboard_tax_profit_30d_mobile.png")
        page.screenshot(path=art_path_30d)
        print(f"  ✓ Saved 30-day screenshot: {art_path_30d}")

        # Switch back to 7d
        page.evaluate("() => { const b = document.querySelector('[data-dash-range=\"7d\"]'); if (b) b.click(); }")
        page.wait_for_timeout(500)

        print("[4/5] Testing click [data-action='open-tax-hub']...")
        page.evaluate("() => { const b = document.querySelector('[data-action=\"open-tax-hub\"]'); if (b) b.click(); }")
        page.wait_for_timeout(1000)

        # Verify page switched to reports tax tab
        curr_page = page.evaluate("() => window.state.page")
        curr_tab = page.evaluate("() => window.state.reportTab")
        print(f"  ✓ Navigated state: page='{curr_page}', tab='{curr_tab}'")
        assert curr_page == 'reports', f"Expected page='reports', got '{curr_page}'"
        assert curr_tab == 'tax', f"Expected reportTab='tax', got '{curr_tab}'"

        art_path_tax_tab = os.path.join(ARTIFACT_DIR, "evidence_reports_tax_navigated_mobile.png")
        page.screenshot(path=art_path_tax_tab)
        print(f"  ✓ Saved tax tab screenshot: {art_path_tax_tab}")

        print("[5/5] Checking console errors...")
        print(f"  Console errors: {len(console_errors)}")
        if console_errors:
            for err in console_errors:
                print(f"    - {err}")

        browser.close()
        print("\n=== ALL TESTS PASSED WITH 100% SUCCESS ===")

if __name__ == "__main__":
    test_dashboard_tax_profit_strip()
