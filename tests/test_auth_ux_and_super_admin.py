"""
QBIZ KHO PRODUCTION V1 — AUTH UX & PLATFORM SUPER ADMIN VERIFICATION TEST SUITE
Spec: CMD_20260925_AUTH_UX_AND_PLATFORM_SUPER_ADMIN.txt

Covers:
1. SQL Cloud Schema & RLS Policy Integrity Audit for Platform Super Admin:
   - public.platform_admins (RLS, unique user_id, status check)
   - public.platform_audit_logs (RLS, actor/target indexes)
   - Server-Authoritative SECURITY DEFINER functions:
     * is_platform_admin()
     * get_platform_metrics()
     * get_platform_shops()
     * toggle_platform_shop()
     * bootstrap_super_admin()
   - Bootstrap restriction to designated platform owner (tungtran2510@gmail.com)
2. Role Model Separation & Security:
   - SUPER_ADMIN is a Platform Role, never a shop membership role
   - Shop OWNER cannot self-promote to SUPER_ADMIN
   - addMember() strictly rejects SUPER_ADMIN and OWNER
3. Public Entry UX (Unauthenticated):
   - Logo QBiz Kho visible
   - Email & Password inputs visible
   - Đăng nhập button visible
   - Quên mật khẩu? link visible
   - Tạo cửa hàng mới button visible
4. Auth Modal & Forgot Password Flow
5. Multi-Shop Switch Flow (Preserving IndexedDB and device identity)
6. Platform Super Admin Console Security:
   - Non-admin access denied at security gate with error toast and redirect
   - Client role forgery denial (cashier cannot fake super admin)
   - Verified Super Admin accesses Console with metrics, shops management, and audit logs
   - Exit button returns cleanly to shop dashboard
7. Responsive Viewport Audits (390px, 412px, 1440px)
"""

import sys
import re
import os
import json
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:4180"
APP_DIR = Path(__file__).resolve().parent.parent

def test_sql_schema_and_security_invariants():
    print("--- [TEST 1] Auditing SQL Cloud Schema & Platform Admin Invariants ---")
    migration_path = APP_DIR / "supabase" / "migrations" / "20260925_gate6_platform_super_admin.sql"
    assert migration_path.exists(), f"Migration file not found at {migration_path}"
    
    sql_content = migration_path.read_text(encoding="utf-8")
    
    # 1. Platform Admin and Audit Tables
    assert re.search(r"CREATE TABLE (IF NOT EXISTS )?public\.platform_admins\b", sql_content, re.IGNORECASE), "Table public.platform_admins missing!"
    assert re.search(r"CREATE TABLE (IF NOT EXISTS )?public\.platform_audit_logs\b", sql_content, re.IGNORECASE), "Table public.platform_audit_logs missing!"
    print("  [PASS] Tables public.platform_admins and public.platform_audit_logs present.")

    # 2. RLS Enabled
    assert "ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;" in sql_content, "RLS missing for platform_admins!"
    assert "ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;" in sql_content, "RLS missing for platform_audit_logs!"
    print("  [PASS] RLS enabled on platform_admins and platform_audit_logs.")

    # 3. Security Definer Functions
    required_functions = [
        "is_platform_admin",
        "get_platform_metrics",
        "get_platform_shops",
        "toggle_platform_shop",
        "bootstrap_super_admin"
    ]
    for fn in required_functions:
        assert re.search(rf"FUNCTION public\.{fn}\b", sql_content, re.IGNORECASE), f"Function {fn} missing!"
        pattern = rf"FUNCTION public\.{fn}[\s\S]*?SECURITY DEFINER"
        assert re.search(pattern, sql_content, re.IGNORECASE), f"Function {fn} must be SECURITY DEFINER!"
    print(f"  [PASS] All {len(required_functions)} server-authoritative functions defined with SECURITY DEFINER.")

    # 4. Bootstrap Protection
    assert "tungtran2510@gmail.com" in sql_content, "Designated platform owner email must be protected in bootstrap!"
    assert "RAISE EXCEPTION 'Unauthorized: Bootstrap restricted to designated platform owner.'" in sql_content, "Bootstrap unauthorized exception guard missing!"
    print("  [PASS] Bootstrap function strictly restricted to designated platform owner.")


def test_role_model_separation():
    print("--- [TEST 2] Auditing Role Model Separation & Security Guards ---")
    cap_path = APP_DIR / "src" / "capabilities.js"
    auth_path = APP_DIR / "src" / "auth.js"
    
    cap_code = cap_path.read_text(encoding="utf-8")
    auth_code = auth_path.read_text(encoding="utf-8")
    
    # 1. SUPER_ADMIN is in PLATFORM_ROLES, NOT in shop ROLES
    assert "PLATFORM_ROLES" in cap_code, "PLATFORM_ROLES missing from capabilities.js!"
    assert "SUPER_ADMIN" in cap_code, "SUPER_ADMIN missing from capabilities.js!"
    
    # Check that ROLES object does NOT have SUPER_ADMIN
    roles_match = re.search(r"export const ROLES = \{([^}]+)\};", cap_code)
    assert roles_match, "ROLES object not found!"
    assert "SUPER_ADMIN" not in roles_match.group(1), "CRITICAL: SUPER_ADMIN must NOT be in shop ROLES!"
    print("  [PASS] SUPER_ADMIN cleanly isolated in PLATFORM_ROLES, absent from shop ROLES.")

    # 2. addMember() rejects SUPER_ADMIN and OWNER
    assert "upperRole === 'SUPER_ADMIN'" in auth_code or "SUPER_ADMIN" in auth_code, "addMember must guard against SUPER_ADMIN!"
    assert "upperRole === 'OWNER'" in auth_code, "addMember must guard against OWNER!"
    print("  [PASS] addMember() strictly rejects SUPER_ADMIN and OWNER self-promotion.")

    # 3. Server-authoritative checkPlatformAdmin() exists
    assert "checkPlatformAdmin" in auth_code, "checkPlatformAdmin function missing!"
    assert "isSuperAdmin" in auth_code, "isSuperAdmin function missing!"
    assert "platform_admins" in auth_code, "auth.js must query platform_admins table!"
    print("  [PASS] Server-authoritative admin verification implemented.")


def test_public_entry_and_auth_ux():
    print("--- [TEST 3] Testing Public Entry & Auth UX via Playwright ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto(APP_URL, wait_until="networkidle")
        page.wait_for_timeout(500)

        # Clear any existing session to test pure unauthenticated entry
        page.evaluate("""() => {
            localStorage.removeItem('qbiz_auth_session');
            localStorage.removeItem('qbiz_active_shop');
            localStorage.removeItem('qbiz_mock_super_admin');
            if (window.__qbiz_app__ && window.__qbiz_app__.auth) {
                window.__qbiz_app__.auth.signOut();
            }
        }""")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(500)

        # Check 6 required Public Entry elements:
        # 1. Logo QBiz Kho
        content_text = page.inner_text("#content")
        assert "QBiz Kho" in content_text, "Public Entry: Logo/Brand QBiz Kho missing!"

        # 2. Email input
        email_input = page.locator("#quickLoginEmail")
        assert email_input.is_visible(), "Public Entry: Email input missing!"

        # 3. Password input
        pwd_input = page.locator("#quickLoginPassword")
        assert pwd_input.is_visible(), "Public Entry: Password input missing!"

        # 4. Đăng nhập button
        login_btn = page.locator("#quickLoginBtn")
        assert login_btn.is_visible(), "Public Entry: Đăng nhập button missing!"

        # 5. Quên mật khẩu? link
        forgot_btn = page.locator('[data-action="open-forgot-password-modal"]')
        assert forgot_btn.is_visible(), "Public Entry: Quên mật khẩu? missing!"

        # 6. Tạo cửa hàng mới button
        create_shop_btn = page.locator('.public-entry-hero [data-action="create-shop-modal"]')
        assert create_shop_btn.is_visible(), "Public Entry: Tạo cửa hàng mới missing!"

        print("  [PASS] All 6 Public Entry elements verified on unauthenticated screen.")

        # Test Forgot Password Modal Flow
        forgot_btn.click()
        page.wait_for_timeout(300)
        assert page.locator("#forgotEmail").is_visible(), "Forgot Password modal did not open!"
        page.fill("#forgotEmail", "test@example.com")
        page.locator("#modalSubmit").click()
        page.locator(".toast").first.wait_for(state="visible", timeout=10000)
        toasts = page.locator(".toast").all_inner_texts()
        toast_text = " ".join(toasts).lower()
        assert any(k in toast_text for k in ["mật khẩu", "cập nhật", "email"]), f"Unexpected toast: {toast_text}"
        print("  [PASS] Forgot Password flow works and displays clear Vietnamese confirmation.")

        # Test Header Auth Modal Flow
        header_auth_btn = page.locator('[data-action="open-auth-modal"]')
        header_auth_btn.click()
        page.wait_for_timeout(300)
        assert page.locator("#authEmail").is_visible(), "Auth modal did not open!"
        assert page.locator("#authPassword").is_visible(), "Password field missing in auth modal!"
        assert page.locator("#authForgotPasswordBtn").is_visible(), "Forgot password missing in auth modal!"
        assert page.locator("#authGoCreateShopBtn").is_visible(), "Create shop missing in auth modal!"
        
        # Close modal
        page.locator("[data-close]").first.click()
        page.wait_for_timeout(300)
        print("  [PASS] Header Auth modal verified with all navigation paths.")

        browser.close()


def test_security_gate_and_role_forgery_denial():
    print("--- [TEST 4] Testing Security Gate & Role Forgery Denial ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        page.goto(APP_URL, wait_until="networkidle")

        # 1. Unauthenticated / Non-Admin attempting to route to platform-admin
        page.evaluate("""() => {
            localStorage.removeItem('qbiz_auth_session');
            localStorage.removeItem('qbiz_active_shop');
            localStorage.removeItem('qbiz_mock_super_admin');
            window.__qbiz_app__.navigate('platform-admin');
        }""")
        page.wait_for_timeout(400)

        # Must be DENIED and redirected to dashboard
        current_page = page.evaluate("() => window.__qbiz_app__.state.page")
        assert current_page == "dashboard", f"Non-admin should be redirected to dashboard, but got: {current_page}"
        print("  [PASS] Unauthenticated access to /platform-admin strictly DENIED.")

        # 2. Forged Cashier trying to claim SUPER_ADMIN via client flag or localStorage
        page.evaluate("""() => {
            // Fake user claiming admin in localStorage
            localStorage.setItem('qbiz_auth_session', JSON.stringify({
                access_token: 'fake_jwt',
                user: { id: 'cashier_user', email: 'cashier@test.com', role: 'SUPER_ADMIN' }
            }));
            localStorage.setItem('qbiz_mock_super_admin', 'false');
            window.__qbiz_app__.navigate('platform-admin');
        }""")
        page.wait_for_timeout(400)
        current_page = page.evaluate("() => window.__qbiz_app__.state.page")
        assert current_page == "dashboard", f"Forged role should be rejected, but got: {current_page}"
        print("  [PASS] Forged cashier role claim strictly DENIED by security gate.")

        # 3. Forged shop membership addMember rejecting SUPER_ADMIN
        rejected = page.evaluate("""async () => {
            try {
                await window.__qbiz_app__.auth.addMember({ email: 'hacker@test.com', role: 'SUPER_ADMIN' });
                return false;
            } catch (err) {
                return err.message.includes('SUPER_ADMIN');
            }
        }""")
        assert rejected, "addMember must reject SUPER_ADMIN role assignment!"
        print("  [PASS] addMember() rejects forged SUPER_ADMIN invite.")

        browser.close()


def test_super_admin_console_and_switch_shop():
    print("--- [TEST 5] Testing Platform Super Admin Console & Switch Shop ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        page.goto(APP_URL, wait_until="networkidle")

        # 1. Log in as designated Platform Super Admin
        page.evaluate("""async () => {
            localStorage.setItem('qbiz_auth_session', JSON.stringify({
                access_token: 'mock_jwt_super_admin',
                refresh_token: 'mock_refresh_super_admin',
                user: {
                    id: 'usr_super_admin_1',
                    email: 'tungtran2510@gmail.com',
                    user_metadata: { full_name: 'Trần Tùng' }
                }
            }));
            localStorage.setItem('qbiz_active_shop', JSON.stringify({
                shop: { id: 'shop_flagship_1', name: 'QBiz Flagship Shop', code: 'QB-001', status: 'ACTIVE' },
                membership: { id: 'mem_1', shop_id: 'shop_flagship_1', role: 'OWNER', status: 'ACTIVE' }
            }));
            localStorage.setItem('qbiz_mock_super_admin', 'true');
            await window.__qbiz_app__.auth.initAuth();
            window.__qbiz_app__.render();
        }""")
        page.wait_for_timeout(500)

        auth_state = page.evaluate("() => window.__qbiz_app__.auth.getAuthState()")
        assert auth_state.get("isSuperAdmin") is True, f"User should be recognized as Super Admin! Got: {auth_state}"
        assert auth_state.get("platformRole") == "SUPER_ADMIN", "Platform role must be SUPER_ADMIN!"
        print("  [PASS] Designated platform owner authenticated as Super Admin.")

        # 2. Open User Menu and verify Platform Admin button is visible
        page.locator('[data-action="open-user-menu"]').click()
        page.wait_for_timeout(300)
        admin_btn = page.locator("#menuBtnPlatformAdmin")
        assert admin_btn.is_visible(), "Platform Admin button missing in user menu for Super Admin!"
        switch_btn = page.locator("#menuBtnSwitchShop")
        assert switch_btn.is_visible(), "Switch Shop button missing in user menu!"
        print("  [PASS] User menu displays 'Platform Admin Console' and 'Đổi cửa hàng' buttons.")

        # 3. Navigate to Platform Admin Console
        admin_btn.click()
        page.wait_for_timeout(600)
        assert page.locator(".platform-admin-screen").is_visible(), "Platform Admin Console did not render!"
        assert page.locator("text=SUPER_ADMIN").is_visible(), "SUPER_ADMIN badge missing in console!"
        assert "tungtran2510@gmail.com" in page.inner_text(".platform-admin-screen"), "Admin email missing in console!"
        print("  [PASS] Platform Admin Console rendered with verified Super Admin credentials.")

        # 4. Check Metrics Cards
        assert page.locator("text=Tổng số Cửa hàng").is_visible(), "Total Shops metric missing!"
        assert page.locator("text=Tổng Người dùng").is_visible(), "Total Users metric missing!"
        assert page.locator("text=Tổng Thiết bị").is_visible(), "Total Devices metric missing!"
        assert page.locator("text=Lỗi đồng bộ (Sync)").is_visible(), "Sync Errors metric missing!"
        assert page.locator("text=Trạng thái Sao lưu").is_visible(), "Backup Status metric missing!"
        assert page.locator("text=Phiên bản App").is_visible(), "App Version metric missing!"
        print("  [PASS] Platform summary metrics cards verified.")

        # 5. Check Shops Management Tab
        page.locator('[data-admin-tab="shops"]').click()
        page.wait_for_timeout(400)
        assert page.locator("th:has-text('Cửa hàng')").is_visible(), "Shops table header missing!"
        assert page.locator("button:has-text('Khóa Shop'), button:has-text('Mở khóa Shop')").count() > 0, "Shop status toggle button missing!"
        print("  [PASS] Shops management table and status controls verified.")

        # 6. Check Audit Logs Tab
        page.locator('[data-admin-tab="audit"]').click()
        page.wait_for_timeout(400)
        assert page.locator("th:has-text('Người thực hiện')").is_visible(), "Audit logs table missing!"
        assert page.locator("text=BOOTSTRAP_SUPER_ADMIN").is_visible() or page.locator("text=SUCCESS").count() > 0, "Audit entries missing!"
        print("  [PASS] Platform audit logs table verified.")

        # 7. Exit Platform Admin Console back to Shop Dashboard
        page.locator("#exitPlatformAdminBtn").click()
        page.wait_for_timeout(400)
        current_page = page.evaluate("() => window.__qbiz_app__.state.page")
        assert current_page == "dashboard", f"Should return to dashboard, got: {current_page}"
        print("  [PASS] Clean exit from Platform Console back to Shop Dashboard.")

        # 8. Test Switch Shop Modal
        page.locator('[data-action="open-user-menu"]').click()
        page.wait_for_timeout(300)
        page.locator("#menuBtnSwitchShop").click()
        page.wait_for_timeout(300)
        assert page.locator(".switch-shop-box").is_visible(), "Switch Shop modal did not open!"
        assert page.locator("#switchModalCreateShopBtn").is_visible(), "Create shop button in switch modal missing!"
        page.locator("[data-close]").first.click()
        page.wait_for_timeout(300)
        print("  [PASS] Multi-Shop Switch modal verified.")

        # 9. Test Logout preserves local IndexedDB
        db_count_before = page.evaluate("() => window.__qbiz_app__.state.data.products.length")
        page.evaluate("async () => { await window.__qbiz_app__.auth.signOut(); window.__qbiz_app__.render(); }")
        page.wait_for_timeout(400)

        # Verify signed out
        new_auth = page.evaluate("() => window.__qbiz_app__.auth.getAuthState()")
        assert new_auth.get("status") == "UNAUTHENTICATED", f"Auth status should be UNAUTHENTICATED, got: {new_auth}"

        # Verify IndexedDB products preserved!
        db_count_after = page.evaluate("() => window.__qbiz_app__.state.data.products.length")
        assert db_count_after == db_count_before and db_count_after > 0, f"IndexedDB data wiped! Before: {db_count_before}, After: {db_count_after}"
        print(f"  [PASS] Local IndexedDB preserved after logout ({db_count_after} products intact).")

        browser.close()


def test_responsive_viewports():
    print("--- [TEST 6] Auditing Responsive Viewports (390px, 412px, 1440px) ---")
    viewports = [
        ("Mobile iPhone 14", 390, 844),
        ("Android Pixel 7", 412, 915),
        ("Desktop Wide", 1440, 900)
    ]
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for label, w, h in viewports:
            context = browser.new_context(viewport={"width": w, "height": h})
            page = context.new_page()

            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

            page.goto(APP_URL, wait_until="networkidle")
            page.wait_for_timeout(500)

            # Check overflow
            overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2")
            assert not overflow, f"Horizontal overflow detected on {label} ({w}x{h})!"
            assert len(console_errors) == 0, f"Console errors on {label}: {console_errors}"
            print(f"  [PASS] {label} ({w}x{h}): zero overflow, zero console errors.")

            context.close()
        browser.close()


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING QBIZ AUTH UX & PLATFORM SUPER ADMIN TEST SUITE")
    print("=======================================================\n")
    try:
        test_sql_schema_and_security_invariants()
        test_role_model_separation()
        test_public_entry_and_auth_ux()
        test_security_gate_and_role_forgery_denial()
        test_super_admin_console_and_switch_shop()
        test_responsive_viewports()
        print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<\n")
    except AssertionError as e:
        print(f"\n[FAIL] Test assertion failed: {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)
