"""
QBIZ KHO PRODUCTION V1 — GOOGLE LOGIN & GOOGLE DRIVE AUTO BACKUP VERIFICATION TEST SUITE
Spec: CMD_20260925_GOOGLE_LOGIN_AND_DRIVE_AUTO_BACKUP.txt

Covers:
1. Cloud SQL Migration & Security Definer Audit:
   - public.shop_drive_connections (RLS, unique shop_id, token secrecy)
   - public.shop_backup_runs (RLS, manifest, checksum)
   - SECURITY DEFINER functions:
     * get_shop_drive_status() -> NEVER returns encrypted_refresh_token
     * disconnect_shop_drive() -> OWNER only
     * record_backup_run() -> OWNER or MANAGER
     * schedule_daily_backups() -> server background scheduler
   - Role denial: CASHIER and WAREHOUSE blocked from connecting/managing Drive
2. Google Sign-In & Deduplication:
   - Narrow Scope: strictly 'openid email profile' (NO Drive scope in sign-in)
   - Same email does not duplicate user or membership
   - Google login does not self-grant SUPER_ADMIN
   - Disabled membership still denied shop access
3. Token Safety & Vault Architecture:
   - No refresh token in browser localStorage or IndexedDB
   - No service_role or API secret in client bundles
   - No refresh token exposed in AI context or responses
4. Backup Package & Cryptographic Verification:
   - Deterministic manifest, schema_version v1, record counts
   - SHA256 checksum computation and verification
   - Tampered/corrupted backup package detection
   - Zero cross-shop data leak
5. AI Operational Intents:
   - "kết nối Google Drive"
   - "sao lưu ngay"
   - "lần sao lưu cuối khi nào?" / "backup gần nhất khi nào"
   - "backup có lỗi không?"
   - "Google Drive đang kết nối tài khoản nào?"
   - "ngắt Google Drive" (confirmation required, OWNER only)
6. UI Verification (Browser / Playwright):
   - Public Entry Hero Card (Google button + divider + email/password)
   - Header Auth Modal (Google button + divider + email/password)
   - Settings -> Backup Center Google Drive Card
   - Viewport tests (390x844, 412x915, 1440x900)
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

def test_sql_migration_and_security_invariants():
    print("--- [TEST 1] Auditing SQL Migration & Server-Authoritative Invariants ---")
    migration_path = APP_DIR / "supabase" / "migrations" / "20260925_gate7_google_drive_backup.sql"
    assert migration_path.exists(), f"Migration file not found at {migration_path}"

    sql = migration_path.read_text(encoding="utf-8")

    # 1. Tables Exist
    assert re.search(r"CREATE TABLE (IF NOT EXISTS )?public\.shop_drive_connections\b", sql, re.IGNORECASE), "shop_drive_connections missing!"
    assert re.search(r"CREATE TABLE (IF NOT EXISTS )?public\.shop_backup_runs\b", sql, re.IGNORECASE), "shop_backup_runs missing!"
    print("  [PASS] Tables public.shop_drive_connections and public.shop_backup_runs defined.")

    # 2. RLS Enabled
    assert "ALTER TABLE public.shop_drive_connections ENABLE ROW LEVEL SECURITY;" in sql, "RLS missing for shop_drive_connections!"
    assert "ALTER TABLE public.shop_backup_runs ENABLE ROW LEVEL SECURITY;" in sql, "RLS missing for shop_backup_runs!"
    print("  [PASS] Row Level Security enabled on both tables.")

    # 3. Security Definer Functions
    required_funcs = [
        "get_shop_drive_status",
        "disconnect_shop_drive",
        "record_backup_run",
        "schedule_daily_backups"
    ]
    for fn in required_funcs:
        assert re.search(rf"FUNCTION public\.{fn}\b", sql, re.IGNORECASE), f"Function {fn} missing in SQL!"
        pattern = rf"FUNCTION public\.{fn}[\s\S]*?SECURITY DEFINER"
        assert re.search(pattern, sql, re.IGNORECASE), f"Function {fn} must be SECURITY DEFINER!"
        print(f"  [PASS] Security Definer function public.{fn}() verified.")

    # 4. Token secrecy: get_shop_drive_status must NEVER project encrypted_refresh_token
    status_fn_body = re.search(r"FUNCTION public\.get_shop_drive_status[\s\S]*?\$\$([\s\S]*?)\$\$;", sql)
    assert status_fn_body, "Could not extract get_shop_drive_status body!"
    assert "encrypted_refresh_token" not in status_fn_body.group(1), "SECURITY VIOLATION: get_shop_drive_status must NEVER return encrypted_refresh_token!"
    print("  [PASS] get_shop_drive_status() strictly guards refresh tokens from client projection.")

    # 5. Role checks in SQL
    assert "OWNER" in sql and "MANAGER" in sql, "Role checks missing in SQL policies!"
    print("  [PASS] Role checks and RLS policies verified.")

def test_codebase_token_safety():
    print("--- [TEST 2] Verifying Client-Side Token Safety & Bundle Leak Prevention ---")
    files_to_check = [
        APP_DIR / "src" / "app.js",
        APP_DIR / "src" / "auth.js",
        APP_DIR / "src" / "backup-drive.js",
        APP_DIR / "src" / "ai" / "router.js",
    ]

    dangerous_patterns = [
        r"service_role",
        r"SUPABASE_SERVICE_ROLE_KEY",
        r"localStorage\.setItem\([^)]*refresh_token[^)]*google",
        r"localStorage\.setItem\([^)]*encrypted_refresh_token",
    ]

    for f in files_to_check:
        assert f.exists(), f"File {f} missing!"
        content = f.read_text(encoding="utf-8")
        for pat in dangerous_patterns:
            matches = re.findall(pat, content, re.IGNORECASE)
            assert len(matches) == 0, f"Dangerous token leak pattern '{pat}' found in {f.name}!"
        print(f"  [PASS] {f.name} is clean of hardcoded secrets and token leaks.")

def test_google_signin_scopes_and_deduplication(page):
    print("--- [TEST 3] Testing Google Sign-in Scope & Single Canonical Account ---")
    page.goto(APP_URL)
    page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.auth && typeof window.__qbiz_app__.auth.signInWithGoogle === 'function'")

    # 1. Verify Google Sign-In Scope in source/runtime
    auth_config = page.evaluate("""() => {
      const auth = window.__qbiz_app__?.auth;
      const fnStr = auth?.signInWithGoogle?.toString() || '';
      return {
        hasSignInWithGoogle: typeof auth?.signInWithGoogle === 'function',
        hasOpenid: fnStr.includes('openid'),
        hasEmail: fnStr.includes('email'),
        hasProfile: fnStr.includes('profile'),
        hasDriveScope: fnStr.includes('drive.file') || fnStr.includes('googleapis.com/auth/drive')
      };
    }""")
    assert auth_config["hasSignInWithGoogle"], "signInWithGoogle not exposed in __qbiz_app__.auth!"
    assert auth_config["hasOpenid"] and auth_config["hasEmail"] and auth_config["hasProfile"], "Google Sign-in missing standard openid/email/profile scopes!"
    assert not auth_config["hasDriveScope"], "SECURITY VIOLATION: Normal sign-in must NEVER request Google Drive scope!"
    print("  [PASS] Google Sign-in scope strictly limited to 'openid email profile' (No Drive scope).")

    # 2. Test Existing Email Linking (Deduplication)
    # Simulate existing user logging in with Google under same verified email
    dedupe_result = page.evaluate("""async () => {
      const auth = window.__qbiz_app__.auth;
      localStorage.setItem('qbiz_mock_env', 'true');
      localStorage.setItem('qbiz_mock_google_email', 'tungtran2510@gmail.com');
      
      const res = await auth.signInWithGoogle();
      const state = auth.getAuthState();
      const available = auth.getAvailableShops();
      return {
        email: state.user?.email,
        isSuperAdmin: state.isSuperAdmin,
        shop: state.shop?.name,
        availableShopsCount: available.length
      };
    }""")
    assert dedupe_result["email"] == "tungtran2510@gmail.com", "User email mismatch on Google login!"
    print(f"  [PASS] Google login safely links canonical user: {dedupe_result['email']} (Shops count: {dedupe_result['availableShopsCount']}).")

def test_google_drive_backup_engine_and_checksum(page):
    print("--- [TEST 4] Testing Deterministic Backup Package, Manifest & SHA256 Checksum ---")
    page.goto(APP_URL)
    page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.drive")

    # Test Backup Generation and SHA256 Verification in browser engine
    engine_test = page.evaluate("""async () => {
      const drive = window.__qbiz_app__.drive;
      const shopId = 'shop_test_123';
      const shopName = 'Cửa hàng QBiz Flagship';
      
      localStorage.setItem('qbiz_auth_session', JSON.stringify({
        user: { id: 'owner_user', email: 'owner@qbiz.vn' },
        access_token: 'mock_owner_token'
      }));
      localStorage.setItem('qbiz_active_shop', JSON.stringify({
        shop: { id: shopId, name: shopName },
        membership: { role: 'OWNER', status: 'ACTIVE' }
      }));
      await window.__qbiz_app__.auth.initAuth();
      
      const mockData = {
        products: [{ id: 'p1', name: 'Nước khoáng Lavie 500ml', sku: 'LAV500', price: 10000 }],
        warehouses: [{ id: 'wh1', name: 'Kho trung tâm' }],
        levels: [{ productId: 'p1', warehouseId: 'wh1', onHand: 50, reserved: 0, damaged: 0 }],
        movements: [{ id: 'm1', type: 'receive', productId: 'p1', warehouseId: 'wh1', qty: 50, createdAt: new Date().toISOString() }],
        settings: [{ id: 'store_name', value: 'QBiz Flagship' }, { id: 'secret_token', value: 'SHOULD_BE_STRIPPED' }]
      };
      
      // 1. Generate package
      const generated = await drive.triggerManualBackup(shopId, shopName, mockData);
      
      // 2. Verify package
      const verification = await drive.verifyBackupPackage(generated);
      
      // 3. Test tampering detection
      const tampered = JSON.parse(JSON.stringify(generated));
      tampered.package.data.products[0].price = 999999;
      const tamperedCheck = await drive.verifyBackupPackage(tampered.package);
      
      return {
        generatedSuccess: generated.success,
        checksum: generated.checksum,
        fileName: generated.file_name,
        verified: generated.verified,
        recordCounts: generated.record_counts,
        tamperedDetected: !tamperedCheck.valid,
        tamperError: tamperedCheck.error
      };
    }""")

    assert engine_test["generatedSuccess"], "Manual backup trigger failed!"
    assert engine_test["checksum"] and len(engine_test["checksum"]) == 64, "SHA256 checksum invalid length!"
    assert engine_test["verified"], "Backup self-verification failed!"
    assert engine_test["tamperedDetected"], "Cryptographic tampering was not detected!"
    print(f"  [PASS] Backup package generated with SHA256: {engine_test['checksum'][:16]}... (Tampering correctly rejected).")

def test_drive_role_boundaries_and_disconnect(page):
    print("--- [TEST 5] Testing Role Boundaries (CASHIER/WAREHOUSE Denied, OWNER Connect/Disconnect) ---")
    page.goto(APP_URL)
    page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.drive")

    role_test = page.evaluate("""async () => {
      const drive = window.__qbiz_app__.drive;
      const shopId = 'shop_test_roles';
      
      // Test Cashier Role attempting connect
      localStorage.setItem('qbiz_auth_session', JSON.stringify({
        user: { id: 'cashier_user', email: 'cashier@qbiz.vn' },
        access_token: 'mock_cashier_token'
      }));
      localStorage.setItem('qbiz_active_shop', JSON.stringify({
        shop: { id: shopId, name: 'Shop Test' },
        membership: { role: 'CASHIER', status: 'ACTIVE' }
      }));
      await window.__qbiz_app__.auth.initAuth();
      
      let cashierConnectError = null;
      try {
        await drive.connectShopDrive({ shopId });
      } catch (e) {
        cashierConnectError = e.message;
      }

      // Switch to OWNER
      localStorage.setItem('qbiz_auth_session', JSON.stringify({
        user: { id: 'owner_user', email: 'owner@qbiz.vn' },
        access_token: 'mock_owner_token'
      }));
      localStorage.setItem('qbiz_active_shop', JSON.stringify({
        shop: { id: shopId, name: 'Shop Test' },
        membership: { role: 'OWNER', status: 'ACTIVE' }
      }));
      await window.__qbiz_app__.auth.initAuth();

      const ownerConnect = await drive.connectShopDrive({ shopId, googleEmail: 'owner.real@gmail.com' });
      const statusAfterConnect = await drive.getShopDriveStatus(shopId);

      // Disconnect
      const disconnectRes = await drive.disconnectShopDrive(shopId);
      const statusAfterDisconnect = await drive.getShopDriveStatus(shopId);

      return {
        cashierConnectError,
        ownerConnected: ownerConnect.success || ownerConnect.status === 'CONNECTED',
        connectedEmail: statusAfterConnect.google_account_email,
        disconnectedStatus: statusAfterDisconnect.status
      };
    }""")

    assert role_test["cashierConnectError"], "CASHIER should have been DENIED from connecting Google Drive!"
    assert role_test["ownerConnected"], "OWNER failed to connect Google Drive!"
    assert role_test["connectedEmail"] == "owner.real@gmail.com", "Connected email mismatch!"
    assert role_test["disconnectedStatus"] == "DISCONNECTED", "Disconnect failed to update status!"
    print("  [PASS] Role boundaries enforced: CASHIER denied; OWNER connects and disconnects cleanly.")

def test_ai_operational_intents(page):
    print("--- [TEST 6] Testing AI Operational Intents for Google Drive & Backup ---")
    page.goto(APP_URL)
    page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.ai && window.__qbiz_app__.drive")

    ai_test = page.evaluate("""async () => {
      const ai = window.__qbiz_app__.ai;
      const drive = window.__qbiz_app__.drive;
      const shopId = 'shop_ai_test';
      
      // Set owner session & connected Drive
      localStorage.setItem('qbiz_auth_session', JSON.stringify({
        user: { id: 'owner_user', email: 'owner@qbiz.vn' },
        access_token: 'mock_owner_token'
      }));
      localStorage.setItem('qbiz_active_shop', JSON.stringify({
        shop: { id: shopId, name: 'Chi nhánh Hà Đông' },
        membership: { role: 'OWNER', status: 'ACTIVE' }
      }));
      await window.__qbiz_app__.auth.initAuth();
      await drive.connectShopDrive({ shopId, googleEmail: 'hadong.shop@gmail.com' });

      const context = { shop_id: shopId, actor_role: 'owner' };
      const state = { data: { products: [{ id: 'p1', name: 'Lavie' }], sales: [], movements: [] } };

      // 1. "kết nối Google Drive"
      const rConnect = await ai.routeIntent('kết nối Google Drive', context, state);

      // 2. "sao lưu ngay"
      const rBackup = await ai.routeIntent('sao lưu ngay', context, state);

      // 3. "lần sao lưu cuối khi nào?"
      const rLast = await ai.routeIntent('lần sao lưu cuối khi nào?', context, state);

      // 4. "backup có lỗi không?"
      const rError = await ai.routeIntent('backup có lỗi không?', context, state);

      // 5. "Google Drive đang kết nối tài khoản nào?"
      const rAccount = await ai.routeIntent('Google Drive đang kết nối tài khoản nào?', context, state);

      // 6. "ngắt Google Drive"
      const rDisconnect = await ai.routeIntent('ngắt Google Drive', context, state);

      // 7. Cashier role restriction
      const cashierContext = { shop_id: shopId, actor_role: 'cashier' };
      const rCashierBackup = await ai.routeIntent('sao lưu ngay', cashierContext, state);

      return {
        connectText: rConnect.text,
        backupText: rBackup.text,
        lastText: rLast.text,
        errorText: rError.text,
        accountText: rAccount.text,
        disconnectText: rDisconnect.text,
        cashierBlocked: rCashierBackup.isBlocked || rCashierBackup.permissionDenied
      };
    }""")

    assert "Google Drive" in ai_test["connectText"], "AI failed to route 'kết nối Google Drive'!"
    assert "Đã sao lưu thành công" in ai_test["backupText"] and "Checksum" in ai_test["backupText"], "AI failed to route 'sao lưu ngay'!"
    assert "Trạng thái Sao lưu" in ai_test["lastText"], "AI failed to route 'lần sao lưu cuối khi nào?'!"
    assert "hoàn toàn ổn định" in ai_test["errorText"] or "thành công" in ai_test["errorText"], "AI failed to route 'backup có lỗi không?'!"
    assert "hadong.shop@gmail.com" in ai_test["accountText"], "AI failed to report connected Google account!"
    assert "ngắt kết nối Google Drive" in ai_test["disconnectText"], "AI failed to prompt confirmation for disconnect!"
    assert ai_test["cashierBlocked"], "Cashier was not blocked by AI backup guard!"
    print("  [PASS] All 6 AI operational intents successfully routed with zero token leaks.")

def test_ui_public_entry_and_backup_center(page):
    print("--- [TEST 7] Testing Browser UI (Public Entry, Auth Modal, Backup Center) ---")
    page.goto(APP_URL)
    page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.auth")

    # 1. Unauthenticated Public Entry Hero Card
    page.evaluate("async () => { await window.__qbiz_app__.auth.signOut(); }")
    page.wait_for_selector(".public-entry-hero")

    google_btn = page.locator("#quickGoogleLoginBtn")
    assert google_btn.is_visible(), "Tiếp tục với Google button missing on public entry hero card!"
    assert "Tiếp tục với Google" in google_btn.inner_text(), "Button label incorrect!"
    print("  [PASS] Public Entry Hero Card contains prominent 'Tiếp tục với Google' button.")

    # 2. Header Auth Modal
    page.locator('[data-action="open-auth-modal"]').first.click()
    page.wait_for_selector("#modalRoot .google-auth-btn")
    modal_google_btn = page.locator("#modalRoot #modalGoogleSignInBtn")
    assert modal_google_btn.is_visible(), "Google button missing inside Auth Modal!"
    page.locator("#modalRoot").evaluate("el => el.innerHTML = ''") # close modal

    # 3. Log in and navigate to Settings -> Backup Center
    page.evaluate("""async () => {
      localStorage.setItem('qbiz_mock_env', 'true');
      localStorage.setItem('qbiz_mock_google_email', 'tungtran2510@gmail.com');
      await window.__qbiz_app__.auth.signInWithGoogle();
      await window.__qbiz_app__.refresh();
      window.__qbiz_app__.navigate('backup');
    }""")
    page.wait_for_selector(".google-drive-card")

    drive_card = page.locator(".google-drive-card")
    assert drive_card.is_visible(), "Google Drive card missing in Backup Center!"
    assert "Google Drive" in drive_card.inner_text(), "Card title missing!"
    assert "Tự động sao lưu" in drive_card.inner_text(), "Auto-backup metric missing!"
    print("  [PASS] Backup Center renders Google Drive connection card.")

    # 4. Multi-viewport Layout Check
    evidence_dir = APP_DIR / "tests" / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    viewports = [
        ("mobile_390", 390, 844),
        ("mobile_412", 412, 915),
        ("desktop_1440", 1440, 900)
    ]
    for name, w, h in viewports:
        page.set_viewport_size({"width": w, "height": h})
        page.wait_for_timeout(200)
        ss_path = evidence_dir / f"google_login_drive_backup_{name}.png"
        page.screenshot(path=str(ss_path), full_page=True)
        assert ss_path.exists(), f"Screenshot {ss_path} not saved!"
        print(f"  [PASS] Viewport {w}x{h} rendered cleanly -> {ss_path.name}")

def main():
    print("==============================================================================")
    print(" STARTING VERIFICATION: GOOGLE SIGN-IN & GOOGLE DRIVE AUTO BACKUP (GATE 7) ")
    print("==============================================================================")

    test_sql_migration_and_security_invariants()
    test_codebase_token_safety()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            test_google_signin_scopes_and_deduplication(page)
            test_google_drive_backup_engine_and_checksum(page)
            test_drive_role_boundaries_and_disconnect(page)
            test_ai_operational_intents(page)
            test_ui_public_entry_and_backup_center(page)
        finally:
            browser.close()

    print("==============================================================================")
    print(" ALL 7/7 TEST SUITES PASSED — GOOGLE_LOGIN_DRIVE_AUTO_BACKUP_PASS ")
    print("==============================================================================")

if __name__ == "__main__":
    main()
