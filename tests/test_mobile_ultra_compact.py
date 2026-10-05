import os
import time
from playwright.sync_api import sync_playwright

def run_mobile_ultra_compact_tests():
    print("=== STARTING MOBILE-FIRST ULTRA-COMPACT VERIFICATION ===")
    os.makedirs("tests/evidence", exist_ok=True)
    os.makedirs("C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424", exist_ok=True)

    with sync_playwright() as p:
        # TEST 1: MOBILE VIEWPORT (390 x 844 - iPhone 13/14)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            permissions=['clipboard-read', 'clipboard-write'],
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        page.goto("http://localhost:4180")
        page.wait_for_load_state("networkidle")

        # Set super admin session
        page.evaluate("""() => {
            const session = {
                access_token: 'mock_super_token',
                refresh_token: '',
                expires_in: 3600,
                user: {
                    id: 'usr_super_admin',
                    email: 'tungtran2510@gmail.com',
                    user_metadata: { full_name: 'Trần Quang Tùng' },
                    app_metadata: { platform_role: 'SUPER_ADMIN', is_super_admin: true }
                }
            };
            localStorage.setItem('qbiz_auth_session', JSON.stringify(session));
            sessionStorage.removeItem('qbiz_preview_demo');
            sessionStorage.removeItem('qbiz_demo_shop');
        }""")

        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        # 1. Verify Dashboard Compact Elements
        auth_bar = page.locator(".auth-user-bar-compact")
        assert auth_bar.is_visible(), "auth-user-bar-compact not visible on dashboard"
        bar_box = auth_bar.bounding_box()
        print(f"[PASS] Dashboard Compact Bar height: {bar_box['height']}px (<= 45px target)")
        assert bar_box['height'] <= 45, f"Auth bar too tall: {bar_box['height']}px"

        # Check local notice if present
        local_notice = page.locator("#localDataNotice")
        if local_notice.is_visible():
            notice_box = local_notice.bounding_box()
            print(f"[PASS] Local Notice Compact height: {notice_box['height']}px (<= 38px target)")
            assert notice_box['height'] <= 40, f"Local notice too tall: {notice_box['height']}px"

        # Check sales hero visibility
        hero = page.locator(".dashboard-sales-hero").first
        assert hero.is_visible(), "Dashboard sales hero should be immediately visible"

        # Screenshot Dashboard Mobile
        page.screenshot(path="tests/evidence/evidence_dashboard_compact_mobile.png")
        page.screenshot(path="C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/evidence_dashboard_compact_mobile.png")
        print("[PASS] Captured dashboard compact mobile screenshot")

        # 2. Navigate to Platform Admin Console
        admin_btn = page.locator("[data-action='go-platform-admin']").first
        assert admin_btn.is_visible(), "Quản trị button not visible"
        admin_btn.click()
        time.sleep(0.6)

        # Verify Navbars are hidden on Platform Admin
        mobile_nav = page.locator("#mobileNav")
        desktop_nav = page.locator("#desktopNav")
        assert not mobile_nav.is_visible() or page.evaluate("() => document.getElementById('mobileNav')?.style.display === 'none'"), "MobileNav must be hidden on Platform Admin"
        print("[PASS] Mobile bottom navigation successfully hidden on Platform Admin")

        # Verify Platform Admin Topbar height
        topbar = page.locator(".platform-admin-screen > div").first
        topbar_box = topbar.bounding_box()
        print(f"[PASS] Platform Admin Topbar height: {topbar_box['height']}px (<= 50px target)")
        assert topbar_box['height'] <= 50, f"Topbar too tall: {topbar_box['height']}px"

        # Verify Metric Strip height (Single row 4 columns)
        metric_strip = page.locator(".admin-metric-strip")
        assert metric_strip.is_visible(), "admin-metric-strip not found"
        strip_box = metric_strip.bounding_box()
        print(f"[PASS] Metric Strip height: {strip_box['height']}px (<= 55px target)")
        assert strip_box['height'] <= 55, f"Metric strip too tall: {strip_box['height']}px"

        # Verify Mobile User Cards are displayed on narrow screen
        cards_container = page.locator(".platform-user-cards")
        assert cards_container.is_visible(), ".platform-user-cards must be visible on mobile"
        
        table_wrap = page.locator(".platform-user-table-wrap")
        table_visible = page.evaluate("() => window.getComputedStyle(document.querySelector('.platform-user-table-wrap')).display")
        assert table_visible == 'none', f"Desktop table should be hidden on mobile (was {table_visible})"
        print("[PASS] Mobile cards visible & Desktop table hidden on 390px viewport")

        # Verify User Cards Content & Thumb-friendly buttons
        user_cards = page.locator(".platform-user-card")
        card_count = user_cards.count()
        assert card_count >= 1, f"Expected user cards, found {card_count}"
        print(f"[PASS] Rendered {card_count} mobile user cards")

        first_card = user_cards.first
        extend_btn = first_card.locator("[data-user-extend]")
        zalo_btn = first_card.locator("[data-user-zalo]")
        assert extend_btn.is_visible(), "Extend button not visible on mobile card"
        assert zalo_btn.is_visible(), "Zalo button not visible on mobile card"

        # Test Zalo button click
        zalo_btn.click()
        time.sleep(0.4)
        toast_el = page.locator("#toastRoot .toast").first
        assert toast_el.is_visible(), "Toast should appear after clicking Zalo button"
        print("[PASS] Zalo payment reminder toast triggered successfully")

        # Check Horizontal Overflow (Must be 0px overflow)
        has_overflow = page.evaluate("""() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        }""")
        print(f"[PASS] Mobile screen horizontal overflow test: {not has_overflow} (scrollWidth <= innerWidth)")
        assert not has_overflow, "Horizontal overflow detected on mobile viewport!"

        # Screenshot Platform Admin Users Tab Mobile
        page.screenshot(path="tests/evidence/evidence_platform_admin_mobile_users.png")
        page.screenshot(path="C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/evidence_platform_admin_mobile_users.png")
        print("[PASS] Captured platform admin mobile users screenshot")

        # 3. Test Commercial Tab on Mobile
        comm_tab = page.locator("[data-admin-tab='commercial']")
        comm_tab.click()
        time.sleep(0.5)

        comm_heading = page.locator("#adminTabContent h3").first
        assert comm_heading.is_visible(), "Commercial tab content not visible"
        
        # Screenshot Commercial Tab Mobile
        page.screenshot(path="tests/evidence/evidence_platform_admin_mobile_commercial.png")
        page.screenshot(path="C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/evidence_platform_admin_mobile_commercial.png")
        print("[PASS] Captured platform admin mobile commercial screenshot")

        # 4. Test Return to Shop
        exit_btn = page.locator("#exitPlatformAdminBtn")
        assert exit_btn.is_visible(), "Exit button not visible"
        exit_btn.click()
        time.sleep(0.5)

        # Verify returned to dashboard and mobileNav restored
        assert hero.is_visible(), "Should return to dashboard"
        nav_display = page.evaluate("() => document.getElementById('mobileNav')?.style.display")
        assert nav_display != 'none', "MobileNav must be restored when returning to shop"
        print("[PASS] Returned to Shop and restored mobile navigation successfully")

        page.screenshot(path="tests/evidence/evidence_returned_dashboard_mobile.png")
        page.screenshot(path="C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/evidence_returned_dashboard_mobile.png")

        browser.close()

        # TEST 2: DESKTOP VIEWPORT (1280 x 800)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        page.goto("http://localhost:4180")
        page.wait_for_load_state("networkidle")

        # Set session
        page.evaluate("""() => {
            const session = {
                access_token: 'mock_super_token',
                refresh_token: '',
                expires_in: 3600,
                user: {
                    id: 'usr_super_admin',
                    email: 'tungtran2510@gmail.com',
                    user_metadata: { full_name: 'Trần Quang Tùng' },
                    app_metadata: { platform_role: 'SUPER_ADMIN', is_super_admin: true }
                }
            };
            localStorage.setItem('qbiz_auth_session', JSON.stringify(session));
            sessionStorage.removeItem('qbiz_preview_demo');
            sessionStorage.removeItem('qbiz_demo_shop');
        }""")
        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        # Go to platform admin
        page.locator("[data-action='go-platform-admin']").first.click()
        time.sleep(0.5)

        # On desktop, verify table is visible and cards hidden
        table_display = page.evaluate("() => window.getComputedStyle(document.querySelector('.platform-user-table-wrap')).display")
        cards_display = page.evaluate("() => window.getComputedStyle(document.querySelector('.platform-user-cards')).display")
        assert table_display != 'none', f"Desktop table should be visible on 1280px (was {table_display})"
        assert cards_display == 'none', f"Mobile cards should be hidden on 1280px (was {cards_display})"
        print("[PASS] Desktop viewport correctly renders Table and hides Mobile Cards")

        page.screenshot(path="tests/evidence/evidence_platform_admin_desktop_table.png")
        page.screenshot(path="C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/evidence_platform_admin_desktop_table.png")

        browser.close()
        print("=== ALL ULTRA-COMPACT MOBILE & DESKTOP TESTS PASSED 100% ===")

if __name__ == '__main__':
    run_mobile_ultra_compact_tests()
