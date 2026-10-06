import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

PAGES_TO_TEST = [
    'dashboard',
    'sales',
    'products',
    'orders',
    'transfers',
    'customers',
    'suppliers',
    'debts',
    'cash',
    'reports',
    'settings',
    'print',
    'platform-admin'
]

def run_audit():
    print("=" * 60)
    print("   QBIZ KHO - TOÀN DIỆN RÀ LỖI HỆ THỐNG (FULL AUDIT)   ")
    print("=" * 60)

    issues = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # Test 1: Mobile Viewport 390px (iPhone 13)
        print("\n--- [PHASE 1] KIỂM THỬ TRÊN GIAO DIỆN MOBILE 390PX ---")
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ['error', 'warn'] else None)
        page.on('pageerror', lambda err: console_errors.append(f"[pageerror] {err}"))

        # Setup sovereign super admin session
        page.goto('http://localhost:4180', wait_until='networkidle')
        page.evaluate('''() => {
            sessionStorage.removeItem('qbiz_preview_demo');
            localStorage.setItem('qbiz_auth_session', JSON.stringify({
                access_token: 'valid-test-token',
                user: { id: 'usr-sovereign', email: 'tungtran2510@gmail.com' }
            }));
            localStorage.setItem('qbiz_active_shop', JSON.stringify({
                id: 'shop-dlc',
                name: 'DLC Care'
            }));
        }''')
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(500)

        # 1.1 Check Topbar height and styling
        print("\n1.1. Kiểm tra kích thước & độ khít của Topbar...")
        topbar = page.locator('.topbar')
        if topbar.is_visible():
            tb_box = topbar.bounding_box()
            print(f"  - Topbar Height: {tb_box['height']}px")
            if tb_box['height'] > 50:
                issues.append(f"Topbar height quá cao: {tb_box['height']}px (yêu cầu <= 48px)")
        else:
            issues.append("Topbar không hiển thị trên Dashboard!")

        # 1.2 Test All Main Pages
        print("\n1.2. Rà soát từng màn hình chính (Tràn ngang, Console error, Bố cục)...")
        for pg in PAGES_TO_TEST:
            page.evaluate(f"window.navigate('{pg}')")
            page.wait_for_timeout(350)
            
            # Check horizontal overflow
            scroll_width, client_width = page.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
            overflow_px = scroll_width - client_width
            
            # Check topbar visibility
            is_platform_admin = (pg == 'platform-admin')
            tb_visible = topbar.is_visible()
            
            status_str = f"Page: {pg:<15} | ScrollW: {scroll_width} vs ClientW: {client_width}"
            if overflow_px > 0:
                issues.append(f"Tràn màn hình ngang tại trang '{pg}': thừa {overflow_px}px!")
                status_str += f" | [LỖI TRÀN {overflow_px}px]"
            else:
                status_str += " | [OK 0px Tràn]"
                
            if is_platform_admin and tb_visible:
                issues.append("Topbar ứng dụng không ẩn trên trang Platform Admin!")
                status_str += " | [LỖI TOPBAR KHÔNG ẨN]"
            elif not is_platform_admin and not tb_visible:
                issues.append(f"Topbar bị mất trên trang '{pg}'!")
                status_str += " | [LỖI MẤT TOPBAR]"
                
            print(f"  - {status_str}")

        # 1.3 Test Modal Opening & Click-Interception
        print("\n1.3. Kiểm thử Modal Tài khoản & Cửa hàng (Apple Sheet)...")
        page.evaluate("window.navigate('dashboard')")
        page.wait_for_timeout(300)
        
        user_menu_btn = page.locator('[data-action="open-user-menu"]').first
        if user_menu_btn.is_visible():
            user_menu_btn.click()
            page.wait_for_timeout(400)
            
            modal = page.locator('#modalRoot .modal')
            if modal.is_visible():
                print("  - Modal Tài khoản & Cửa hàng mở thành công!")
                # Verify key elements
                assert page.locator('.account-sheet').is_visible(), "Account sheet class missing!"
                assert page.locator('.account-profile-card').is_visible(), "Profile card missing!"
                assert page.locator('.account-store-card').is_visible(), "Store card missing!"
                
                # Check modal overflow
                m_scroll_w, m_client_w = modal.evaluate("el => [el.scrollWidth, el.clientWidth]")
                if m_scroll_w > m_client_w + 2:
                    issues.append(f"Modal tài khoản bị tràn ngang: {m_scroll_w} > {m_client_w}")
                else:
                    print(f"  - Modal không bị tràn ngang ({m_client_w}px).")
                
                # Close modal
                close_btn = page.locator('#modalRoot .close-btn, #modalRoot [data-action="close-modal"]').first
                if close_btn.is_visible():
                    close_btn.click()
                    page.wait_for_timeout(200)
            else:
                issues.append("Nút mở User Menu không mở được Modal!")
        else:
            issues.append("Không tìm thấy nút [data-action='open-user-menu'] trên Topbar!")

        # 1.4 Test Scroll Auto-Hide and Auto-Show on Mobile
        print("\n1.4. Kiểm thử Cơ chế Cuộn Tự động Ẩn/Hiện...")
        # Scroll down 400px
        page.evaluate("window.scrollTo(0, 400)")
        page.wait_for_timeout(350)
        hidden_after_down = page.evaluate("document.body.classList.contains('topbar-hidden')")
        print(f"  - Vuốt xuống 400px -> body có class 'topbar-hidden': {hidden_after_down}")
        if not hidden_after_down:
            issues.append("Lỗi: Khi vuốt xuống thanh Header không tự động ẩn!")

        # Scroll up 150px
        page.evaluate("window.scrollTo(0, 250)")
        page.wait_for_timeout(350)
        hidden_after_up = page.evaluate("document.body.classList.contains('topbar-hidden')")
        print(f"  - Vuốt lên 150px -> body có class 'topbar-hidden': {hidden_after_up}")
        if hidden_after_up:
            issues.append("Lỗi: Khi vuốt lên thanh Header không tự động hiện lại!")

        # Scroll to 0
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(250)
        hidden_at_top = page.evaluate("document.body.classList.contains('topbar-hidden')")
        print(f"  - Về đỉnh trang -> body có class 'topbar-hidden': {hidden_at_top}")
        if hidden_at_top:
            issues.append("Lỗi: Khi về đỉnh trang thanh Header không hiện!")

        # 1.5 Test Platform Admin Console
        print("\n1.5. Kiểm thử Chuyên trang Platform Admin Console...")
        page.evaluate("window.navigate('platform-admin')")
        page.wait_for_timeout(500)
        
        # Verify root badge and tabs
        admin_screen = page.locator('.platform-admin-screen')
        if admin_screen.is_visible():
            print("  - Platform Admin Console hiển thị chuẩn xác!")
            # Check tabs
            tabs = page.locator('.admin-nav-tabs button')
            tab_count = tabs.count()
            print(f"  - Số lượng Tabs: {tab_count}")
            if tab_count < 5:
                issues.append(f"Thiếu Tabs quản trị: chỉ có {tab_count} tabs!")
                
            # Click commercial tab
            page.locator('[data-admin-tab="commercial"]').click()
            page.wait_for_timeout(400)
            comm_visible = page.locator('text=Bảng Gói Cước').is_visible()
            print(f"  - Tab Gói cước & VietQR mở được: {comm_visible}")
            if not comm_visible:
                issues.append("Tab Gói cước & VietQR không hiển thị nội dung!")
                
            # Exit back to shop
            exit_btn = page.locator('#exitPlatformAdminBtn')
            exit_btn.click()
            page.wait_for_timeout(400)
            
            # Check that topbar is restored
            if not topbar.is_visible():
                issues.append("Sau khi rời Platform Admin, Topbar ứng dụng không được phục hồi!")
            else:
                print("  - Quay về Shop thành công, Topbar được phục hồi nguyên vẹn.")
        else:
            issues.append("Platform Admin Console không hiển thị!")

        # Test 2: Desktop Viewport 1440px
        print("\n--- [PHASE 2] KIỂM THỬ TRÊN GIAO DIỆN DESKTOP 1440PX ---")
        context_dt = browser.new_context(viewport={'width': 1440, 'height': 900})
        page_dt = context_dt.new_page()
        page_dt.goto('http://localhost:4180', wait_until='networkidle')
        page_dt.evaluate('''() => {
            sessionStorage.removeItem('qbiz_preview_demo');
            localStorage.setItem('qbiz_auth_session', JSON.stringify({
                access_token: 'valid-test-token',
                user: { id: 'usr-sovereign', email: 'tungtran2510@gmail.com' }
            }));
            localStorage.setItem('qbiz_active_shop', JSON.stringify({
                id: 'shop-dlc',
                name: 'DLC Care'
            }));
        }''')
        page_dt.reload(wait_until='networkidle')
        page_dt.wait_for_timeout(500)

        # Check Desktop Sidebar and Navigation
        sidebar = page_dt.locator('.sidebar')
        print(f"  - Sidebar visible on Desktop: {sidebar.is_visible()}")
        if not sidebar.is_visible():
            issues.append("Sidebar không hiển thị trên Desktop 1440px!")

        topbar_dt = page_dt.locator('.topbar')
        tb_dt_box = topbar_dt.bounding_box()
        print(f"  - Topbar Height on Desktop: {tb_dt_box['height']}px")

        # Filter harmless console errors (e.g. Supabase 401 when using dummy test token)
        real_errors = [e for e in console_errors if '401' not in e and 'favicon' not in e]
        if real_errors:
            print("\n  - Các lỗi Console thực tế phát hiện:")
            for err in real_errors:
                print(f"    * {err}")
                issues.append(f"Console error: {err}")
        else:
            print("\n  - Console errors thực tế: 0 (Hoàn toàn sạch).")

    print("\n" + "=" * 60)
    print(" KẾT QUẢ RÀ LỖI TOÀN DIỆN:")
    print("=" * 60)
    if not issues:
        print(">>> 100% HOÀN HẢO - KHÔNG PHÁT HIỆN BẤT KỲ LỖI NÀO! <<<")
        return True
    else:
        print(f">>> PHÁT HIỆN {len(issues)} VẤN ĐỀ CẦN XỬ LÝ: <<<")
        for i, iss in enumerate(issues, 1):
            print(f"  {i}. {iss}")
        return False

if __name__ == '__main__':
    success = run_audit()
    sys.exit(0 if success else 1)
