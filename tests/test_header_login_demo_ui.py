import sys
from playwright.sync_api import sync_playwright

def test_login_demo_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        # Clean session storage and local storage to start clean
        page.goto('http://127.0.0.1:4180/')
        page.evaluate("() => { sessionStorage.clear(); localStorage.removeItem('qbiz_auth_session'); localStorage.removeItem('qbiz_active_shop'); }")
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(1000)

        # 1. Verify 3 primary CTAs at top of page
        cta_bar = page.locator('.entry-cta-bar')
        assert cta_bar.is_visible(), "Entry CTA bar missing!"
        
        btn_shop = page.locator('.entry-cta-bar [data-action="create-shop-modal"]')
        assert btn_shop.is_visible(), "CTA 'Tạo shop' missing!"
        assert "Tạo shop" in btn_shop.inner_text(), f"CTA text unexpected: {btn_shop.inner_text()}"

        btn_login = page.locator('.entry-cta-bar [data-action="open-hero-auth"], .entry-cta-bar [data-action="open-auth-modal"]')
        assert btn_login.is_visible(), "CTA 'Đăng nhập' missing!"
        assert "Đăng nhập" in btn_login.inner_text(), f"CTA text unexpected: {btn_login.inner_text()}"

        btn_demo = page.locator('.entry-cta-bar [data-action="preview-demo"]')
        assert btn_demo.is_visible(), "CTA demo missing!"
        assert any(x in btn_demo.inner_text() for x in ["Xem shop demo", "Xem trước demo"]), f"CTA text unexpected: {btn_demo.inner_text()}"

        # 2. Verify quick login and google elements still present (prevent regression)
        assert page.locator('#quickGoogleLoginBtn').is_visible(), "Google Login button missing!"
        assert page.locator('#quickLoginEmail').is_visible(), "Quick login email missing!"
        assert page.locator('#quickLoginPassword').is_visible(), "Quick login password missing!"
        assert page.locator('#quickLoginBtn').is_visible(), "Quick login btn missing!"
        assert page.locator('[data-action="open-forgot-password-modal"]').is_visible(), "Forgot password link missing!"

        # Capture mobile screenshot 1: Initial unauthenticated screen with 3 CTAs
        screenshot_path_initial = 'tests/evidence/mobile_header_login_demo_initial_390.png'
        page.screenshot(path=screenshot_path_initial)
        print(f"Captured initial mobile screenshot: {screenshot_path_initial}")

        # 3. Test clicking 'Xem trước demo'
        btn_demo.click()
        page.wait_for_timeout(1000)

        # Verify demo banner appears
        demo_banner = page.locator('.demo-preview-banner')
        assert demo_banner.is_visible(), "Demo preview banner did not appear after clicking 'Xem trước demo'!"
        assert "DEMO" in demo_banner.inner_text(), "DEMO badge missing in demo banner!"

        # Capture mobile screenshot 2: Demo mode screen
        screenshot_path_demo = 'tests/evidence/mobile_header_demo_mode_390.png'
        page.screenshot(path=screenshot_path_demo)
        print(f"Captured demo mode mobile screenshot: {screenshot_path_demo}")

        # 4. Test clicking 'Thoát demo'
        btn_exit = page.locator('[data-action="exit-demo"]')
        assert btn_exit.is_visible(), "Exit demo button missing!"
        btn_exit.click()
        page.wait_for_timeout(600)
        assert not page.locator('.demo-preview-banner').is_visible(), "Demo banner still visible after exit demo!"
        assert page.locator('.entry-cta-bar').is_visible(), "CTA bar did not restore after exit demo!"

        # 5. Test clicking 'Tạo shop'
        page.locator('.entry-cta-bar [data-action="create-shop-modal"]').click()
        page.wait_for_timeout(500)
        backdrop = page.locator('.modal-backdrop')
        assert backdrop.is_visible(), "Modal backdrop not visible!"
        assert "Đăng ký" in backdrop.inner_text() or "Tạo" in backdrop.inner_text(), "Register/Shop modal did not open on 'Tạo shop'!"
        page.locator('[data-close]').first.click()
        page.wait_for_timeout(300)

        # 6. Test clicking 'Đăng nhập'
        page.locator('.entry-cta-bar [data-action="open-hero-auth"], .entry-cta-bar [data-action="open-auth-modal"]').click()
        page.wait_for_timeout(500)
        assert backdrop.is_visible(), "Modal backdrop not visible on 'Đăng nhập'!"
        assert "Đăng nhập" in backdrop.inner_text(), "Login modal did not open on 'Đăng nhập'!"
        page.locator('[data-close]').first.click()

        browser.close()
        print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    test_login_demo_ui()
