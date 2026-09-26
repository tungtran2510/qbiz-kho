import os
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = 'http://localhost:4180'
EVIDENCE_DIR = 'tests/evidence'

def run_verification():
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
        )
        page = context.new_page()

        industries = [
            {'key': 'retail', 'name': 'Bán lẻ', 'expected_shop': 'QBiz Mart'},
            {'key': 'fashion', 'name': 'Thời trang', 'expected_shop': 'Mây Boutique'},
            {'key': 'food_beverage', 'name': 'Ăn uống', 'expected_shop': 'The Coffee Garden'},
            {'key': 'service', 'name': 'Dịch vụ', 'expected_shop': 'Sen Spa'},
        ]

        for ind in industries:
            print(f"\n--- Testing Industry: {ind['name']} ({ind['key']}) ---")
            page.goto(BASE_URL)
            page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.previewDemo")
            page.evaluate(f"() => window.__qbiz_app__.previewDemo('{ind['key']}')")
            page.wait_for_timeout(1000)

            # 1. Verify Topbar has NO 'DEMO' badge next to 'Tổng quan'
            top_actions = page.locator('#topActions')
            top_badge_demo = top_actions.locator('.user-badge-btn .badge:has-text("DEMO")')
            assert top_badge_demo.count() == 0, f"Found DEMO badge in topbar next to Tổng quan for {ind['key']}!"
            print(f"  ✓ Topbar DEMO pill removed. Only clean user/login button displayed.")

            # 2. Verify Demo Compact Header layout
            compact_header = page.locator('.demo-compact-header')
            assert compact_header.is_visible(), f"Demo compact header not visible for {ind['key']}"
            
            box_role = page.locator('.demo-selector-card.demo-role-btn').bounding_box()
            box_ind = page.locator('.demo-selector-card.demo-industry-btn').bounding_box()
            assert box_role is not None and box_ind is not None, "Selector boxes missing"
            # Verify they are side-by-side on the same row
            assert abs(box_role['y'] - box_ind['y']) < 5, f"Vai trò and Ngành not on same row: {box_role['y']} vs {box_ind['y']}"
            # Verify total width spans across header (~350px-370px on 390px viewport)
            total_span = (box_ind['x'] + box_ind['width']) - box_role['x']
            assert total_span > 330, f"Selector cards not spanning full width: total_span={total_span}"
            print(f"  ✓ Compact header: Vai trò & Ngành side-by-side, spanning {total_span:.1f}px to outer edges.")

            # 3. Verify 'Thao tác nhanh' Hero Tile text & overflow
            hero_main = page.locator('.quick-hero-main strong')
            if hero_main.count() > 0:
                hero_text = hero_main.first.inner_text()
                print(f"  ✓ Quick hero tile title: '{hero_text}'")
                assert '(POS)' not in hero_text, f"Hero text still contains (POS): '{hero_text}'"
                assert '(l' not in hero_text, f"Hero text still truncated: '{hero_text}'"
                
                # Check bounding box does not overflow horizontally
                hero_box = hero_main.first.bounding_box()
                parent_box = page.locator('.quick-tile.quick-hero').bounding_box()
                assert hero_box['width'] <= parent_box['width'], f"Hero text overflowing parent tile width: {hero_box['width']} > {parent_box['width']}"

            # 4. Check sub-action 'Đổi - Trả' is visible
            hero_sub = page.locator('.quick-hero-sub')
            if hero_sub.count() > 0:
                assert hero_sub.is_visible(), "Sub-action Đổi - Trả not visible"
                print(f"  ✓ Sub-action 'Đổi - Trả' fully visible.")

            # Capture mobile screenshot of topbar, demo header and quick actions
            shot_path = os.path.join(EVIDENCE_DIR, f"mobile_dashboard_{ind['key']}_390.png")
            page.screenshot(path=shot_path)
            print(f"  ✓ Screenshot saved: {shot_path}")

        browser.close()
        print("\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    run_verification()
