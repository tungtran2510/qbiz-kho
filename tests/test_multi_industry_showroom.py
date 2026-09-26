"""
QBiz Kho Multi-Industry Demo Showroom + Role Switch + Mobile QA Test Suite
Tests:
- 3 Landing CTAs: Tạo shop, Đăng nhập, Xem shop demo
- 4 Industry Showrooms: retail, fashion, food_beverage, service
- 4 Role Switching: OWNER, MANAGER, CASHIER, WAREHOUSE & capability enforcement
- Demo Printer simulation & simulated receipt preview
- Reset demo & Clean exit (zero production leak)
- 5 Viewports Responsive QA: 360x800, 390x844, 412x915, 430x932, 1440x900
"""

import sys
import os
import json

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from playwright.sync_api import sync_playwright

BASE_URL = 'http://127.0.0.1:4180/'
VIEWPORTS = [
    {'name': 'mobile_360', 'width': 360, 'height': 800},
    {'name': 'mobile_390', 'width': 390, 'height': 844},
    {'name': 'mobile_412', 'width': 412, 'height': 915},
    {'name': 'mobile_430', 'width': 430, 'height': 932},
    {'name': 'desktop_1440', 'width': 1440, 'height': 900},
]

def check_no_overflow(page, context_label=""):
    overflow = page.evaluate("""
        () => {
            const body = document.body;
            const doc = document.documentElement;
            const scrollWidth = Math.max(body.scrollWidth, doc.scrollWidth);
            const clientWidth = Math.max(body.clientWidth, doc.clientWidth);
            return {
                overflow: scrollWidth > clientWidth + 1,
                scrollWidth,
                clientWidth
            };
        }
    """)
    assert not overflow['overflow'], f"Horizontal overflow detected at {context_label}: scrollWidth={overflow['scrollWidth']} > clientWidth={overflow['clientWidth']}"

def nav_page(page, target_page):
    btn = page.locator(f'#mobileNav button[data-page="{target_page}"]:visible, #desktopNav button[data-page="{target_page}"]:visible').first
    btn.click()

def run_tests():
    evidence_dir = 'tests/evidence'
    os.makedirs(evidence_dir, exist_ok=True)
    report = {
        'industries_tested': [],
        'roles_tested': [],
        'viewports_tested': [],
        'overflow_clean': True,
        'zero_production_leak': True,
    }

    with sync_playwright() as p:
        browser = p.chromium.launch()
        
        # -------------------------------------------------------------
        # 1. TEST 5 VIEWPORTS & LANDING HERO ON EACH
        # -------------------------------------------------------------
        print("=== Step 1: Testing Landing & Viewports ===")
        for vp in VIEWPORTS:
            context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']})
            page = context.new_page()
            
            page.goto(BASE_URL)
            page.evaluate("() => { sessionStorage.clear(); localStorage.removeItem('qbiz_auth_session'); localStorage.removeItem('qbiz_active_shop'); }")
            page.reload(wait_until='networkidle')
            page.wait_for_timeout(1000)

            # Check 3 CTAs
            btn_shop = page.locator('.entry-cta-bar [data-action="create-shop-modal"]')
            btn_login = page.locator('.entry-cta-bar [data-action="open-hero-auth"], .entry-cta-bar [data-action="open-auth-modal"]')
            btn_demo = page.locator('.entry-cta-bar [data-action="preview-demo"]')
            assert btn_shop.is_visible(), f"[{vp['name']}] CTA 'Tạo shop' missing"
            assert btn_login.is_visible(), f"[{vp['name']}] CTA 'Đăng nhập' missing"
            assert btn_demo.is_visible(), f"[{vp['name']}] CTA 'Xem shop demo' missing"

            # Check 4 Industry Buttons
            for ind in ['retail', 'fashion', 'food_beverage', 'service']:
                btn_ind = page.locator(f'.entry-industry-section [data-industry="{ind}"]')
                assert btn_ind.is_visible(), f"[{vp['name']}] Industry button '{ind}' missing"

            check_no_overflow(page, f"Landing {vp['name']}")
            shot_path = f"{evidence_dir}/showroom_landing_{vp['name']}.png"
            page.screenshot(path=shot_path)
            report['viewports_tested'].append(vp['name'])
            context.close()

        # -------------------------------------------------------------
        # 2. TEST ALL 4 INDUSTRIES
        # -------------------------------------------------------------
        print("=== Step 2: Testing 4 Industries Data & Identity ===")
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        page.goto(BASE_URL)
        page.evaluate("() => { sessionStorage.clear(); localStorage.removeItem('qbiz_auth_session'); }")
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(1000)

        industries = [
            {'key': 'retail', 'expected_name': 'QBiz Mart', 'badge': 'Bán lẻ'},
            {'key': 'fashion', 'expected_name': 'Mây Boutique', 'badge': 'Thời trang'},
            {'key': 'food_beverage', 'expected_name': 'The Coffee Garden', 'badge': 'Ăn uống'},
            {'key': 'service', 'expected_name': 'Sen Spa', 'badge': 'Dịch vụ'},
        ]

        for ind in industries:
            ind_key = ind['key']
            print(f"Testing industry: {ind_key}...")
            # Click industry button from landing or switch via app
            btn = page.locator(f'[data-action="select-demo-industry"][data-industry="{ind_key}"]').first
            if btn.is_visible():
                btn.click()
            else:
                page.evaluate(f"() => window.__qbiz_app__.previewDemo('{ind_key}')")
            page.wait_for_timeout(1200)

            # Verify banner indicates demo mode and current industry
            banner = page.locator('.demo-preview-banner, .demo-compact-header')
            assert banner.is_visible(), f"Demo banner not visible for {ind['key']}"
            assert ind['badge'] in banner.inner_text(), f"Expected badge '{ind['badge']}' in banner text"
            assert ind['expected_name'] in banner.inner_text(), f"Expected shop name '{ind['expected_name']}' in banner text"

            # Check 30-day operational ledger: Net revenue > 0
            today_metric = page.locator('.dashboard-today strong').inner_text()
            month_metric = page.locator('.dashboard-month strong').inner_text()
            print(f"  [{ind['key']}] Today: {today_metric} | Month: {month_metric}")
            assert "0 ₫" != month_metric, f"Month revenue should be non-zero for {ind['key']}, got {month_metric}"

            # Check products screen has industry items with SVG icons
            nav_page(page, 'products')
            page.wait_for_timeout(1000)
            check_no_overflow(page, f"Products {ind['key']}")
            
            # Verify SVG thumbs exist (no broken external images)
            svg_thumbs = page.locator('.product-photo img[src^="data:image/svg+xml"]')
            assert svg_thumbs.count() > 0, f"Expected SVG data thumbnails for {ind['key']}"

            # Screenshot
            shot_path = f"{evidence_dir}/showroom_products_{ind['key']}_390.png"
            page.screenshot(path=shot_path)
            report['industries_tested'].append(ind['key'])

            # Return to dashboard
            nav_page(page, 'dashboard')
            page.wait_for_timeout(800)

        # -------------------------------------------------------------
        # 3. TEST ROLE SWITCHING & PERMISSION GUARDS
        # -------------------------------------------------------------
        print("=== Step 3: Testing 4 Roles & Permission Enforcement ===")
        # We are in demo mode. Let's test role switcher
        role_btn = page.locator('.demo-role-btn')
        assert role_btn.is_visible(), "Demo role switcher button missing!"
        
        # A. Switch to CASHIER: View cost masked, POS allowed
        role_btn.click()
        page.wait_for_timeout(500)
        page.locator('[data-choose-role="CASHIER"]').click()
        page.wait_for_timeout(1000)
        assert "Thu ngân" in page.locator('.demo-role-btn').inner_text()
        report['roles_tested'].append('CASHIER')

        # Check product details: Cost is masked
        nav_page(page, 'products')
        page.wait_for_timeout(800)
        first_product = page.locator('.goods-row').first
        first_product.click()
        page.wait_for_timeout(800)
        modal_text = page.locator('#modalRoot').inner_text()
        assert "*** (Ẩn)" in modal_text, "Expected cost price to be masked for CASHIER!"
        page.locator('#modalRoot [data-close]').first.click()
        page.wait_for_timeout(500)

        # Cashier CAN sell
        nav_page(page, 'sales')
        page.wait_for_timeout(800)
        assert page.locator('.pos-browser').is_visible(), "Cashier should be able to access POS!"

        # B. Switch to WAREHOUSE: POS locked (!userCan('SELL'))
        nav_page(page, 'dashboard')
        page.wait_for_timeout(600)
        page.locator('.demo-role-btn').click()
        page.wait_for_timeout(500)
        page.locator('[data-choose-role="WAREHOUSE"]').click()
        page.wait_for_timeout(1000)
        assert "Thủ kho" in page.locator('.demo-role-btn').inner_text()
        report['roles_tested'].append('WAREHOUSE')

        # Check POS is locked
        nav_page(page, 'sales')
        page.wait_for_timeout(800)
        assert "Vai trò không có quyền bán hàng" in page.locator('#content').inner_text(), "Expected POS lock notification for WAREHOUSE!"
        shot_path = f"{evidence_dir}/showroom_warehouse_pos_locked_390.png"
        page.screenshot(path=shot_path)

        # Warehouse CAN access Transfers / Kho
        page.locator('[data-action="go-to-transfers"]').click()
        page.wait_for_timeout(800)
        assert page.locator('.warehouse-center').is_visible() or page.locator('.inventory-actions').is_visible() or page.locator('.transfers-section').is_visible() or "Kho" in page.locator('header').inner_text()

        # C. Switch to MANAGER and OWNER
        nav_page(page, 'dashboard')
        page.wait_for_timeout(600)
        page.locator('.demo-role-btn').click()
        page.wait_for_timeout(500)
        page.locator('[data-choose-role="MANAGER"]').click()
        page.wait_for_timeout(1000)
        assert "Quản lý" in page.locator('.demo-role-btn').inner_text()
        report['roles_tested'].append('MANAGER')

        page.locator('.demo-role-btn').click()
        page.wait_for_timeout(500)
        page.locator('[data-choose-role="OWNER"]').click()
        page.wait_for_timeout(1000)
        assert any(x in page.locator('.demo-role-btn').inner_text() for x in ['Chủ shop', 'Chủ cửa hàng'])
        report['roles_tested'].append('OWNER')

        # -------------------------------------------------------------
        # 4. TEST DEMO PRINTER & RECEIPT PREVIEW
        # -------------------------------------------------------------
        print("=== Step 4: Testing Demo Printer Simulation ===")
        # Go to more -> settings -> prints
        nav_page(page, 'more')
        page.wait_for_timeout(800)
        page.locator('[data-page="settings"]').click()
        page.wait_for_timeout(800)
        page.locator('[data-page="prints"]').click()
        page.wait_for_timeout(800)

        # Check demo printer banner
        assert page.locator('.demo-printer-notice').is_visible(), "Demo printer banner missing!"
        assert "Máy in demo · Chưa kết nối thiết bị thật" in page.locator('.demo-printer-notice').inner_text()

        # Click preview receipt modal
        page.locator('[data-action="demo-receipt-preview"]').click()
        page.wait_for_timeout(800)
        assert page.locator('.demo-receipt-modal').is_visible(), "Simulated receipt modal missing!"
        assert "HÓA ĐƠN BÁN HÀNG" in page.locator('.demo-receipt-modal').inner_text()
        shot_path = f"{evidence_dir}/showroom_demo_receipt_preview_390.png"
        page.screenshot(path=shot_path)
        page.locator('#modalRoot [data-close]').first.click()
        page.wait_for_timeout(500)

        # -------------------------------------------------------------
        # 5. TEST RESET DEMO & CLEAN EXIT (ZERO LEAK)
        # -------------------------------------------------------------
        print("=== Step 5: Testing Reset Demo & Clean Exit ===")
        nav_page(page, 'dashboard')
        page.wait_for_timeout(800)

        # Accept confirm for reset demo
        page.on("dialog", lambda dialog: dialog.accept())
        page.locator('[data-action="reset-demo"]').click()
        page.wait_for_timeout(1500)

        # Verify exit demo restores production landing
        page.locator('[data-action="exit-demo"]').click()
        page.wait_for_timeout(1200)

        # Verify demo banner is GONE
        assert not page.locator('.demo-preview-banner, .demo-compact-header').is_visible(), "Demo banner must NOT be visible after exit!"
        # Verify 3 CTAs are BACK
        assert page.locator('.entry-cta-bar').is_visible(), "Standard landing entry bar must return!"
        assert page.locator('.entry-industry-section').is_visible(), "Industry selector must return!"
        
        # Verify zero session storage demo residue
        demo_session = page.evaluate("() => sessionStorage.getItem('qbiz_preview_demo')")
        assert demo_session is None, "sessionStorage qbiz_preview_demo must be null!"

        shot_path = f"{evidence_dir}/showroom_exit_clean_production_390.png"
        page.screenshot(path=shot_path)
        print("Zero production leak verified!")

        context.close()
        browser.close()

    print("\n=======================================================")
    print("ALL MULTI-INDUSTRY SHOWROOM & ROLE TESTS PASSED (100%)!")
    print(f"Industries: {report['industries_tested']}")
    print(f"Roles: {report['roles_tested']}")
    print(f"Viewports: {report['viewports_tested']}")
    print("=======================================================\n")

if __name__ == '__main__':
    run_tests()
