import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

def test_compact_topbar_and_autohide():
    print("\n========================================================")
    print(" TESTING COMPACT TOPBAR & SCROLL AUTO-HIDE / AUTO-SHOW")
    print("========================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport iPhone 13 (390x844)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append(str(err)))

        print("\n[1] Navigating to http://localhost:4180 ...")
        page.goto('http://localhost:4180', wait_until='networkidle')

        # Login as owner/super admin without demo notice bar (matches user screen in media_1791231200802.jpg)
        page.evaluate('''() => {
            sessionStorage.removeItem('qbiz_preview_demo');
            localStorage.setItem('qbiz_auth_session', JSON.stringify({
                access_token: 'test-token',
                user: { id: 'usr-sovereign', email: 'tungtran2510@gmail.com' }
            }));
            localStorage.setItem('qbiz_active_shop', JSON.stringify({
                id: 'shop-dlc',
                name: 'DLC Care'
            }));
        }''')
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(600)

        # 1. Verify Topbar Height & Red-line Compactness
        print("\n[2] Verifying Compact Topbar Height (Chỉ đến vạch đỏ)...")
        topbar = page.locator('.topbar')
        assert topbar.is_visible(), "Topbar must be visible!"

        topbar_box = topbar.bounding_box()
        print(f"  - Topbar height: {topbar_box['height']}px (expected <= 48px)")
        assert topbar_box['height'] <= 48, f"Topbar height {topbar_box['height']}px exceeds 48px!"

        hero = page.locator('.dashboard-sales-hero')
        assert hero.is_visible(), "Dashboard sales hero must be visible!"
        hero_box = hero.bounding_box()
        gap = hero_box['y'] - (topbar_box['y'] + topbar_box['height'])
        print(f"  - Gap between bottom of topbar and hero card: {gap}px (expected <= 8px)")
        assert gap <= 8, f"Gap {gap}px exceeds 8px!"

        shot1 = "evidence_topbar_compact_redline.png"
        page.screenshot(path=shot1)
        print(f"  - Captured screenshot: {shot1}")

        # 2. Test Scroll Down -> Auto Hide
        print("\n[3] Testing Scroll Down (Vuốt xuống -> Tự động ẩn)...")
        # Scroll down 350px
        page.evaluate('window.scrollTo(0, 350)')
        page.wait_for_timeout(400)

        is_hidden = page.evaluate("document.body.classList.contains('topbar-hidden')")
        print(f"  - Body has 'topbar-hidden' class: {is_hidden}")
        assert is_hidden, "Body must have 'topbar-hidden' after scrolling down!"

        shot2 = "evidence_scroll_down_hidden.png"
        page.screenshot(path=shot2)
        print(f"  - Captured screenshot: {shot2}")

        # 3. Test Scroll Up -> Auto Show
        print("\n[4] Testing Scroll Up (Vuốt lên -> Tự động hiện lại)...")
        # Scroll up 100px (from 350 to 250)
        page.evaluate('window.scrollTo(0, 250)')
        page.wait_for_timeout(400)

        is_hidden_now = page.evaluate("document.body.classList.contains('topbar-hidden')")
        print(f"  - Body has 'topbar-hidden' class after scroll up: {is_hidden_now}")
        assert not is_hidden_now, "Body must NOT have 'topbar-hidden' after scrolling up!"

        shot3 = "evidence_scroll_up_restored.png"
        page.screenshot(path=shot3)
        print(f"  - Captured screenshot: {shot3}")

        # 4. Test Scroll back to top
        print("\n[5] Testing Scroll to top (Về đỉnh trang -> Luôn hiện)...")
        page.evaluate('window.scrollTo(0, 0)')
        page.wait_for_timeout(300)
        is_hidden_top = page.evaluate("document.body.classList.contains('topbar-hidden')")
        assert not is_hidden_top, "Body must not have 'topbar-hidden' at top of page!"

        # Copy screenshots to artifact directory
        artifact_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
        import shutil
        for shot in [shot1, shot2, shot3]:
            if os.path.exists(shot):
                shutil.copy(shot, os.path.join(artifact_dir, shot))
                print(f"Copied {shot} -> {artifact_dir}")

        # Filter harmless 401 background token validation check
        real_errors = [e for e in console_errors if '401' not in e]
        print(f"\nReal console errors count: {len(real_errors)}")
        assert len(real_errors) == 0, f"Found console errors: {real_errors}"
        print("\nALL VERIFICATIONS PASSED 100%!")

if __name__ == '__main__':
    test_compact_topbar_and_autohide()
