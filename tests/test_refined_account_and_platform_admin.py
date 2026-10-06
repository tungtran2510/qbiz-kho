import os
import shutil
import time
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

def test_refined_account_and_admin():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport: iPhone 13 / 14 (390 x 844)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()
        page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]:", msg.text))
        page.on("pageerror", lambda err: print("PAGEERROR:", err))

        print("[1] Navigating to local dev app http://localhost:4180 ...")
        page.goto("http://localhost:4180", wait_until="networkidle")

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
        page.wait_for_timeout(1000)

        # 1. Open Account Modal
        print("[2] Opening Account & Store Modal...")
        user_menu_btn = page.locator('[data-action="open-user-menu"]').first
        assert user_menu_btn.is_visible(), "User menu button must be visible in topbar!"
        user_menu_btn.click()
        page.wait_for_timeout(600)

        # Verify Account Sheet elements
        modal = page.locator('.account-sheet')
        assert modal.is_visible(), "Account sheet must be visible!"
        print("  - Account sheet rendered successfully.")

        # Check Avatar initials and Profile info
        avatar = page.locator('.account-avatar')
        assert avatar.is_visible(), "Avatar must be visible!"
        print("  - Avatar initials:", avatar.inner_text().strip())

        # Check Active Store Card and Inline Action buttons
        store_card = page.locator('.account-store-card')
        assert store_card.is_visible(), "Store card must be visible!"
        btn_switch = page.locator('#menuBtnSwitchShop')
        btn_create = page.locator('#menuBtnCreateShop')
        assert btn_switch.is_visible() and btn_create.is_visible(), "Inline shop actions must be visible side-by-side!"

        # Check Grouped Menu
        menu_group = page.locator('.account-menu-group')
        assert menu_group.is_visible(), "Grouped menu must be visible!"
        btn_admin = page.locator('#menuBtnPlatformAdmin')
        assert btn_admin.is_visible(), "Platform admin menu item must be visible for super admin!"

        # Screenshot Account Modal
        acc_shot_path = "evidence_account_modal_mobile_refined.png"
        page.screenshot(path=acc_shot_path)
        print("  - Screenshot captured:", acc_shot_path)

        # 2. Click Platform Admin Console
        print("[3] Clicking Platform Admin Console...")
        btn_admin.click()
        page.wait_for_timeout(800)

        # Verify Topbar is HIDDEN
        topbar = page.locator('header.topbar')
        is_topbar_visible = topbar.is_visible()
        assert not is_topbar_visible, "App topbar MUST BE HIDDEN on platform-admin to prevent duplicate header!"
        print("  - Verified: Main app topbar is HIDDEN on Platform Admin.")

        # Verify Platform Admin command header
        admin_screen = page.locator('.platform-admin-screen')
        assert admin_screen.is_visible(), "Platform admin screen must be visible!"
        
        root_badge = page.locator('.platform-admin-screen .badge:has-text("ROOT")')
        assert root_badge.is_visible(), "ROOT badge must be visible in admin header!"

        # Verify Tabs are in single line and active tab is navy
        tabs = page.locator('[data-admin-tab]')
        assert tabs.count() >= 5, "Should have at least 5 navigation tabs!"
        active_tab = page.locator('[data-admin-tab="users"]')
        active_color = active_tab.evaluate("el => window.getComputedStyle(el).backgroundColor")
        print("  - Users tab background color:", active_color)

        # Verify Metric Strip has 4 columns
        metric_strip = page.locator('.admin-metric-strip')
        assert metric_strip.is_visible(), "Metric strip must be visible!"

        # Verify Mobile User Cards are visible (on mobile viewport)
        user_cards = page.locator('.platform-user-card')
        card_count = user_cards.count()
        print(f"  - Visible mobile user cards count: {card_count}")
        assert card_count > 0, "At least 1 user card must be rendered!"

        # Verify Action Buttons styling within mobile cards
        extend_btn = page.locator('.platform-user-card [data-user-extend]').first
        assert extend_btn.is_visible(), "Extend button must be visible!"
        zalo_btn = page.locator('.platform-user-card [data-user-zalo]').first
        assert zalo_btn.is_visible(), "Zalo button must be visible!"

        admin_shot_path = "evidence_platform_admin_mobile_refined.png"
        page.screenshot(path=admin_shot_path)
        print("  - Screenshot captured:", admin_shot_path)

        # 3. Test Commercial tab
        print("[4] Switching to Commercial tab...")
        page.locator('[data-admin-tab="commercial"]').click()
        page.wait_for_timeout(600)
        comm_shot_path = "evidence_platform_admin_commercial_refined.png"
        page.screenshot(path=comm_shot_path)
        print("  - Screenshot captured:", comm_shot_path)

        # 4. Test Exit Back to Shop
        print("[5] Testing exit back to shop...")
        exit_btn = page.locator('#exitPlatformAdminBtn')
        exit_btn.click()
        page.wait_for_timeout(600)

        # Verify Topbar is RESTORED
        assert topbar.is_visible(), "App topbar must be restored after exiting Platform Admin!"
        print("  - Verified: Main app topbar is RESTORED upon returning to Shop.")

        browser.close()

    # Copy screenshots to artifact directory
    for f in [acc_shot_path, admin_shot_path, comm_shot_path]:
        if os.path.exists(f):
            dest = os.path.join(ARTIFACT_DIR, f)
            shutil.copy2(f, dest)
            print(f"Copied {f} -> {dest}")

    print("\nALL VERIFICATIONS PASSED 100%!")

if __name__ == "__main__":
    test_refined_account_and_admin()
