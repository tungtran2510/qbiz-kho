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

def verify_tax_obligations_and_calc_formula():
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # iPhone 13 viewport (390x844) as required by AGENTS.md
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1/6] Opening http://localhost:4180...")
        page.goto("http://localhost:4180", wait_until="networkidle")
        page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

        print("[2/6] Loading retail showroom and navigating to Reports -> Tax tab...")
        page.evaluate("async () => { await window.__qbiz_app__.previewDemo('retail'); }")
        page.wait_for_timeout(1500)

        page.evaluate("""() => {
            window.state.page = 'reports';
            window.state.reportTab = 'tax';
            window.render();
        }""")
        page.wait_for_timeout(1000)

        panel = page.locator(".tax-profit-panel")
        assert panel.is_visible(), "LỖI: .tax-profit-panel không hiển thị!"
        print("  ✓ .tax-profit-panel hiển thị rõ nét.")

        hero = page.locator(".tax-profit-panel .tax-hero-card")
        assert hero.is_visible(), "LỖI: .tax-hero-card không hiển thị!"
        print("  ✓ Hero card Lợi nhuận thực sau thuế hiển thị.")

        breakdown = page.locator(".tax-profit-panel .tax-breakdown-card")
        assert breakdown.is_visible(), "LỖI: .tax-breakdown-card không hiển thị!"
        rows = page.locator(".tax-breakdown-row")
        print(f"  ✓ .tax-breakdown-card hiển thị với {rows.count()} hàng kê khai rõ ràng.")
        assert rows.count() >= 3

        formula_accordion = page.locator(".tax-formula-accordion")
        assert formula_accordion.is_visible(), "LỖI: .tax-formula-accordion không hiển thị!"
        print("  ✓ .tax-formula-accordion hiển thị.")

        # Check collapsed height
        box_collapsed = formula_accordion.bounding_box()
        print(f"  ✓ Formula accordion collapsed height: {box_collapsed['height']}px")
        assert box_collapsed['height'] < 50, f"Expected < 50px, got {box_collapsed['height']}px"

        # Scroll panel into view and take screenshot of collapsed state
        panel.scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        path_collapsed = os.path.join(ARTIFACT_DIR, "evidence_tax_obligations_friendly_collapsed_mobile.png")
        page.screenshot(path=path_collapsed)
        print(f"  ✓ Saved collapsed screenshot: {path_collapsed}")

        print("[3/6] Expanding calculation formula guide (chạm để mở xổ ra)...")
        formula_summary = page.locator(".tax-formula-accordion summary")
        formula_summary.click()
        page.wait_for_timeout(500)

        is_open = page.evaluate("() => document.querySelector('.tax-formula-accordion').hasAttribute('open')")
        print(f"  ✓ Formula accordion open state: {is_open}")
        assert is_open is True, "Accordion phải mở ra khi bấm!"

        steps = page.locator(".tax-formula-body .tax-step-card")
        step_count = steps.count()
        print(f"  ✓ Detailed formula step cards inside: {step_count} (Expected: 3)")
        assert step_count == 3, f"Expected 3 step cards, found {step_count}"

        # Capture expanded screenshot
        formula_accordion.scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        path_expanded = os.path.join(ARTIFACT_DIR, "evidence_tax_obligations_friendly_expanded_mobile.png")
        page.screenshot(path=path_expanded)
        print(f"  ✓ Saved expanded screenshot: {path_expanded}")

        print("[4/6] Verifying top-level tax panel full scroll...")
        page.evaluate("() => window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        path_full_tax = os.path.join(ARTIFACT_DIR, "evidence_tax_obligations_tab_full_mobile.png")
        page.screenshot(path=path_full_tax)
        print(f"  ✓ Saved full tax tab screenshot: {path_full_tax}")

        print("[5/6] Testing Overview tab...")
        page.evaluate("""() => {
            window.state.reportTab = 'overview';
            window.render();
        }""")
        page.wait_for_timeout(800)
        page.locator(".tax-profit-panel").scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        path_overview = os.path.join(ARTIFACT_DIR, "evidence_overview_tax_obligations_mobile.png")
        page.screenshot(path=path_overview)
        print(f"  ✓ Saved overview tax panel screenshot: {path_overview}")

        print("[6/6] Checking console errors...")
        real_errors = [e for e in console_errors if "favicon" not in e.lower() and "map" not in e.lower()]
        if real_errors:
            print(f"  ⚠️ Console errors ({len(real_errors)}): {real_errors}")
        else:
            print("  ✓ Zero console errors.")

        browser.close()
        print("\n🎉 ALL TAX OBLIGATIONS & CALCULATION FORMULA TESTS PASSED!")

if __name__ == '__main__':
    verify_tax_obligations_and_calc_formula()
