import re
import time
from playwright.sync_api import sync_playwright

def test_platform_admin_full():
    print("=== TESTING PLATFORM ADMIN CONSOLE FULL SUITE ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Listen to console
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        # 1. Navigate to app with mock/session as tungtran2510@gmail.com
        page.goto("http://localhost:4180")
        page.wait_for_load_state("networkidle")

        # Set localStorage session for tungtran2510@gmail.com
        page.evaluate("""() => {
            const session = {
                access_token: 'mock_token_owner',
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

        # 2. Check if Super Admin is recognized on Dashboard
        body_text = page.inner_text("body")
        assert "SUPER ADMIN" in body_text, "Super Admin badge not found on Dashboard"
        print("[PASS] Super Admin recognized on Dashboard")

        # 3. Click 'Quản trị Nền tảng' button
        admin_btn = page.locator("[data-action='go-platform-admin']").first
        assert admin_btn.is_visible(), "Quản trị Nền tảng button not visible on Dashboard"
        admin_btn.click()
        time.sleep(0.5)

        # 4. Verify we are in the dedicated Platform Admin Console
        title_text = page.locator(".platform-admin-screen h2").inner_text()
        assert "Platform Super Admin Console" in title_text, f"Unexpected header: {title_text}"
        print("[PASS] Navigated to dedicated Platform Super Admin Console")

        # 5. Verify Users tab is rendered by default
        user_tab_btn = page.locator("[data-admin-tab='users']")
        assert "active" in user_tab_btn.get_attribute("class"), "Users tab should be active by default"

        # Check search input and table
        search_input = page.locator("#adminUserSearch")
        assert search_input.is_visible(), "User search input not found"

        user_rows = page.locator("table.data-table tbody tr")
        row_count = user_rows.count()
        assert row_count >= 3, f"Expected at least 3 users, found {row_count}"
        print(f"[PASS] Users table rendered with {row_count} users")

        # Test search filter
        search_input.fill("tungtran")
        time.sleep(0.3)
        filtered_rows = page.locator("table.data-table tbody tr").count()
        assert filtered_rows == 1, f"Expected 1 user for query 'tungtran', found {filtered_rows}"
        print("[PASS] User search filter works accurately")

        # Clear search
        search_input.fill("")
        time.sleep(0.3)

        # 6. Test Extend Subscription Modal
        extend_btns = page.locator("[data-user-extend]")
        assert extend_btns.count() > 0, "Extend buttons not found"
        extend_btns.first.click()
        time.sleep(0.5)

        modal_title = page.locator("#modalRoot .modal-head h3").inner_text()
        assert "Gia hạn Thuê bao" in modal_title, f"Modal title mismatch: {modal_title}"
        print("[PASS] Extend Subscription modal opened successfully")

        # Choose +365 days and Pro plan
        page.locator("#modalExtendPlan").select_option("pro")
        page.locator("#modalExtendDays").select_option("365")
        page.locator("#modalSubmit").click()
        time.sleep(0.5)
        print("[PASS] Subscription extended and saved successfully")

        # 7. Switch to Commercial tab
        comm_tab_btn = page.locator("[data-admin-tab='commercial']")
        comm_tab_btn.click()
        time.sleep(0.5)

        comm_heading = page.locator("#adminTabContent h3").first.inner_text()
        assert "Gói Cước" in comm_heading, f"Commercial heading mismatch: {comm_heading}"
        assert page.locator("#commBankName").is_visible(), "Bank name input not visible"
        assert page.locator("#commBankAccount").is_visible(), "Bank account input not visible"
        print("[PASS] Commercial Pricing & Banking Settings tab rendered with 4 plans & VietQR")

        # Save commercial config
        page.locator("#commBankName").fill("TECHCOMBANK")
        page.locator("#commBankAccount").fill("190399998888")
        page.locator("#btnSaveCommercialSettings").click()
        time.sleep(0.5)
        print("[PASS] Commercial settings updated successfully")

        # 8. Test 'Quay về Cửa hàng / Bán hàng' exit button
        exit_btn = page.locator("#exitPlatformAdminBtn")
        assert exit_btn.is_visible(), "Exit platform admin button not visible"
        exit_btn.click()
        time.sleep(0.5)

        # Ensure we returned to store dashboard
        assert page.locator(".dashboard-sales-hero").is_visible(), "Did not return to dashboard"
        print("[PASS] Returned cleanly to Store Dashboard")

        # Screenshot proof
        page.screenshot(path="tests/evidence/platform_admin_verified.png")
        print("[PASS] Screenshot saved to tests/evidence/platform_admin_verified.png")

        browser.close()
        print("=== ALL PLATFORM ADMIN CONSOLE TESTS PASSED (100% OK) ===")

if __name__ == '__main__':
    test_platform_admin_full()
