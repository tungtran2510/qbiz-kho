import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
BASE_URL = "http://127.0.0.1:4180"

def test_pwa_logo_and_install():
    print("[1] Launching Playwright browser...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ----------------------------------------------------
        # 1. DESKTOP TEST
        # ----------------------------------------------------
        print("\n--- DESKTOP TEST (1280x850) ---")
        context = browser.new_context(viewport={"width": 1280, "height": 850})
        page = context.new_page()

        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        print(f"Navigating to {BASE_URL}...")
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Check page title
        title = page.title()
        print(f"Page title: {title}")
        assert "Bán Hàng & Quản Lý Kho" in title or "QBiz" in title, f"Unexpected title: {title}"

        # 1A. Test Public Entry Card
        entry_card = page.locator(".public-entry-card")
        if entry_card.is_visible():
            print("[PASS] Public entry card is visible on initial visit.")
            entry_logo = page.locator(".public-entry-card .brand-mark img.brand-logo-img")
            assert entry_logo.is_visible(), "Logo in public entry card should be visible!"
            print("[PASS] Public entry card displays new emblem logo.")

            # Capture public entry screenshot
            public_entry_path = os.path.join(ARTIFACT_DIR, "evidence_desktop_public_entry.png")
            page.screenshot(path=public_entry_path)
            print(f"[OK] Saved public entry screenshot: {public_entry_path}")

            # Test clicking "Cài đặt ứng dụng về máy (PWA)" on the public card
            card_install_btn = page.locator(".public-entry-card [data-action='install-app']")
            assert card_install_btn.is_visible(), "Install app button should exist on public card!"
            card_install_btn.click()
            page.wait_for_timeout(500)

            modal = page.locator("#modalRoot .modal")
            assert modal.is_visible(), "Install modal should open from public card!"
            print("[PASS] Install modal opened from public card.")

            # Close modal
            page.locator("#modalRoot [data-close]").first.click()
            page.wait_for_timeout(400)
            assert not modal.is_visible(), "Install modal closed."

            # Enter demo mode to access full interactive dashboard
            print("Entering demo mode to test main dashboard...")
            page.locator(".public-entry-card [data-action='preview-demo']").click()
            page.wait_for_selector(".public-entry-overlay", state="detached", timeout=3000)
            page.wait_for_timeout(500)

        # 1B. Test Dashboard & Sidebar
        brand_logo = page.locator(".sidebar .brand-mark img.brand-logo-img")
        assert brand_logo.is_visible(), "Sidebar brand logo should be visible in dashboard!"
        print("[PASS] Sidebar brand logo is visible in dashboard.")

        install_banner = page.locator("#firstVisitInstallBanner")
        assert install_banner.is_visible(), "First visit install banner should be visible on dashboard!"
        print("[PASS] First visit install banner is visible.")

        header_install = page.locator(".header-install-btn")
        assert header_install.is_visible(), "Header install button is visible."
        print("[PASS] Header install button is visible.")

        # Capture desktop dashboard screenshot with banner and brand
        desktop_dash_path = os.path.join(ARTIFACT_DIR, "evidence_desktop_dashboard_install_banner.png")
        page.screenshot(path=desktop_dash_path)
        print(f"[OK] Saved desktop dashboard screenshot: {desktop_dash_path}")

        # Click Header install button to open install modal
        print("Clicking Header install button...")
        header_install.click()
        page.wait_for_timeout(500)

        modal = page.locator("#modalRoot .modal")
        assert modal.is_visible(), "Install modal should open after clicking Cài App!"
        print("[PASS] Install modal is open.")

        modal_logo = page.locator(".install-modal-logo")
        assert modal_logo.is_visible(), "Install modal logo emblem should be visible!"
        print("[PASS] Modal logo emblem is visible.")

        guides = page.locator(".install-device-card")
        assert guides.count() >= 3, f"Expected at least 3 device guide cards, found {guides.count()}"
        print(f"[PASS] Found {guides.count()} device guide cards in install modal.")

        # Capture desktop modal screenshot
        desktop_modal_path = os.path.join(ARTIFACT_DIR, "evidence_desktop_install_modal.png")
        page.screenshot(path=desktop_modal_path)
        print(f"[OK] Saved desktop modal screenshot: {desktop_modal_path}")

        # Close modal
        page.locator("#modalRoot [data-close]").first.click()
        page.wait_for_timeout(400)
        assert not modal.is_visible(), "Modal closed."

        # Test dismiss banner
        dismiss_btn = page.locator("#firstVisitInstallBanner [data-action='dismiss-install-banner']")
        dismiss_btn.click()
        page.wait_for_timeout(300)
        assert not install_banner.is_visible(), "Banner dismissed cleanly."
        print("[PASS] Banner dismissed.")

        # Test sidebar Cài ứng dụng
        print("Testing sidebar 'Cài ứng dụng'...")
        sidebar_install = page.locator(".sidebar-install-btn")
        sidebar_install.click()
        page.wait_for_timeout(500)
        assert modal.is_visible(), "Install modal opened from sidebar button."
        print("[PASS] Sidebar install button opened modal successfully.")
        page.locator("#modalRoot [data-close]").first.click()
        page.wait_for_timeout(400)

        # ----------------------------------------------------
        # 2. MOBILE VIEWPORT TEST (390x844 - iPhone 14)
        # ----------------------------------------------------
        print("\n--- MOBILE VIEWPORT TEST (390x844) ---")
        context_mobile = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        )
        page_mobile = context_mobile.new_page()
        page_mobile.on("pageerror", lambda err: errors.append(str(err)))

        print("Navigating on mobile...")
        page_mobile.goto(BASE_URL, wait_until="networkidle")
        page_mobile.wait_for_timeout(1000)

        # On mobile, if public entry shows, click demo preview
        mobile_entry = page_mobile.locator(".public-entry-card")
        if mobile_entry.is_visible():
            print("Mobile public entry visible. Entering demo mode...")
            page_mobile.locator(".public-entry-card [data-action='preview-demo']").click()
            page_mobile.wait_for_selector(".public-entry-overlay", state="detached", timeout=3000)
            page_mobile.wait_for_timeout(500)

        # Mobile install banner
        mobile_banner = page_mobile.locator("#firstVisitInstallBanner")
        assert mobile_banner.is_visible(), "Mobile install banner should be visible."
        print("[PASS] Mobile install banner is visible.")

        # Mobile header install button
        mobile_header_install = page_mobile.locator(".header-install-btn")
        assert mobile_header_install.is_visible(), "Mobile header install button is visible."
        print("[PASS] Mobile header install button is visible.")

        mobile_dash_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_dashboard_install_banner.png")
        page_mobile.screenshot(path=mobile_dash_path)
        print(f"[OK] Saved mobile dashboard screenshot: {mobile_dash_path}")

        # Open install modal on mobile
        mobile_header_install.click()
        page_mobile.wait_for_timeout(500)
        mobile_modal = page_mobile.locator("#modalRoot .modal")
        assert mobile_modal.is_visible(), "Mobile install modal should be visible."

        mobile_modal_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_install_modal.png")
        page_mobile.screenshot(path=mobile_modal_path)
        print(f"[OK] Saved mobile install modal screenshot: {mobile_modal_path}")

        # Check console errors
        if errors:
            print(f"[WARN/FAIL] Console page errors detected: {errors}")
            sys.exit(1)
        else:
            print("\n[SUCCESS] 0 console errors detected throughout all tests!")

        browser.close()
        print("\nALL PLAYWRIGHT TESTS PASSED CLEANLY!")

if __name__ == "__main__":
    test_pwa_logo_and_install()
