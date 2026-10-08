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

def test_tax_official_accordion():
    console_errors = []

    with sync_playwright() as p:
        # iPhone 13 viewport (390x844) as required by AGENTS.md
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

        print("[2/5] Initializing demo showroom and navigating to Reports -> Tax tab...")
        page.evaluate("async () => { await window.__qbiz_app__.previewDemo('retail'); }")
        page.wait_for_timeout(1500)

        page.evaluate("""() => {
            window.state.page = 'reports';
            window.state.reportTab = 'tax';
            window.render();
        }""")
        page.wait_for_timeout(1000)

        # Verify accordion exists
        accordion = page.locator(".tax-official-accordion")
        assert accordion.is_visible(), "LỖI: .tax-official-accordion không tồn tại!"
        print("  ✓ .tax-official-accordion hiển thị.")

        # Check collapsed height: should be < 50px
        box_collapsed = accordion.bounding_box()
        print(f"  ✓ Collapsed height: {box_collapsed['height']}px (Expected < 50px)")
        assert box_collapsed['height'] < 50, f"Accordion should be ultra-compact when closed, got {box_collapsed['height']}px"

        # Scroll into view and capture collapsed screenshot
        page.locator(".tax-profit-panel").scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        path_collapsed = os.path.join(ARTIFACT_DIR, "evidence_tax_tab_collapsed_mobile.png")
        page.screenshot(path=path_collapsed)
        print(f"  ✓ Saved collapsed screenshot: {path_collapsed}")

        print("[3/5] Testing click to expand accordion...")
        summary = page.locator(".tax-official-accordion summary")
        summary.click()
        page.wait_for_timeout(500)

        # Check expanded state
        is_open = page.evaluate("() => document.querySelector('.tax-official-accordion').hasAttribute('open')")
        print(f"  ✓ Accordion open state: {is_open}")
        assert is_open is True

        cards = page.locator(".tax-official-books .mod-report-card")
        card_count = cards.count()
        print(f"  ✓ Report cards inside: {card_count} (Expected: 3)")
        assert card_count == 3

        # Capture expanded screenshot
        accordion.scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        path_expanded = os.path.join(ARTIFACT_DIR, "evidence_tax_tab_expanded_mobile.png")
        page.screenshot(path=path_expanded)
        print(f"  ✓ Saved expanded screenshot: {path_expanded}")

        print("[4/5] Testing click on a report button (preview In A4)...")
        btn_preview = page.locator('.tax-official-books [data-action="preview-report"]').first
        btn_preview.click()
        page.wait_for_timeout(800)

        # Modal should open
        modal = page.locator("#modalRoot .modal")
        modal_visible = modal.is_visible()
        print(f"  ✓ Export preview modal opened: {modal_visible}")
        assert modal_visible, "Modal xem trước biểu mẫu phải mở khi bấm In A4"

        # Close modal
        close_btn = page.locator("#modalRoot [data-close], #modalRoot .close-btn").first
        if close_btn.is_visible():
            close_btn.click()
            page.wait_for_timeout(400)

        print("[5/5] Checking console errors...")
        print(f"  Console errors: {len(console_errors)}")
        if console_errors:
            for err in console_errors:
                print(f"    - {err}")
        assert len(console_errors) == 0, "Không được có console error!"

        browser.close()
        print("\n=== ALL MOBILE ACCORDION TESTS PASSED 100% ===")

if __name__ == "__main__":
    test_tax_official_accordion()
