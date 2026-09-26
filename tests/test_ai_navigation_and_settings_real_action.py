import sys, os, time, json
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_tests():
    evidence_dir = os.path.join(os.path.dirname(__file__), 'evidence')
    os.makedirs(evidence_dir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        console_errors = []
        page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)

        print("1. Truy cập http://localhost:4180/...")
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')

        print("2. Chuyển sang Showroom Thời trang (Fashion)...")
        page.evaluate('() => window.__qbiz_app__.previewDemo("fashion")')
        page.wait_for_timeout(800)

        # =====================================================================
        # TEST 1: User Request 'Vào cài đặt máy in' (Real browser execution)
        # =====================================================================
        print("\n=== TEST 1: USER REQUEST 'Vào cài đặt máy in' ===")
        # Switch to 'more' page first to replicate exact user condition
        page.evaluate("() => window.__qbiz_app__.navigate('more')")
        page.wait_for_timeout(400)
        assert page.evaluate("() => window.__qbiz_app__.state.page") == 'more'

        print("Opening AI sheet...")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        assert page.is_visible('#qbizAiSheet'), "AI Sheet must be visible"

        print("Sending command: 'Vào cài đặt máy in'...")
        page.fill('#aiTextInput', 'Vào cài đặt máy in')
        page.click('#aiSendBtn')
        # Wait for action + toast + auto-close sheet (400ms delay in code)
        page.wait_for_timeout(1500)

        app_state = page.evaluate('''() => {
            const state = window.__qbiz_app__.state;
            const sheet = document.getElementById('qbizAiSheet');
            const sheetVisible = sheet && sheet.style.display !== 'none' && sheet.classList.contains('is-open');
            const content = document.getElementById('content')?.innerHTML || '';
            const modalContent = document.getElementById('modalRoot')?.innerHTML || '';
            return {
                page: state.page,
                printTab: state.printTab,
                sheetVisible: Boolean(sheetVisible),
                hasPrintCenter: Boolean(document.querySelector('.print-center')),
                hasDeviceList: Boolean(document.querySelector('.device-list')),
                contentSnippet: content.slice(0, 300),
                modalContentSnippet: modalContent.slice(0, 300)
            };
        }''')

        print(f"-> State page: '{app_state['page']}'")
        print(f"-> State printTab: '{app_state['printTab']}'")
        print(f"-> AI Sheet visible: {app_state['sheetVisible']}")
        print(f"-> Print Center visible: {app_state['hasPrintCenter']}")
        print(f"-> Device List visible: {app_state['hasDeviceList']}")

        assert app_state['page'] in ('print', 'prints'), f"Expected page 'print', got '{app_state['page']}'"
        assert app_state['printTab'] == 'devices', f"Expected printTab 'devices', got '{app_state['printTab']}'"
        assert not app_state['sheetVisible'], "AI sheet must auto-close after navigation action!"
        assert app_state['hasPrintCenter'] or app_state['hasDeviceList'], "Print Center / Device list must be rendered!"

        ss_printer = os.path.join(evidence_dir, 'ai_nav_real_printer_settings_mobile.png')
        page.screenshot(path=ss_printer)
        print(f"-> PASS! Screenshot saved to {ss_printer}")

        # =====================================================================
        # TEST 2: User Request 'Vào cài đặt' (Settings Page)
        # =====================================================================
        print("\n=== TEST 2: 'Vào cài đặt' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        page.fill('#aiTextInput', 'Vào cài đặt')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        state_settings = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_visible = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display !== 'none' && document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        print(f"-> State page: '{state_settings}', Sheet visible: {sheet_visible}")
        assert state_settings == 'settings', f"Expected 'settings', got '{state_settings}'"
        assert not sheet_visible, "AI sheet must auto-close!"

        ss_settings = os.path.join(evidence_dir, 'ai_nav_real_settings_mobile.png')
        page.screenshot(path=ss_settings)
        print(f"-> PASS! Screenshot saved to {ss_settings}")

        # =====================================================================
        # TEST 3: User Request 'Thông tin cửa hàng' (Modal)
        # =====================================================================
        print("\n=== TEST 3: 'Thông tin cửa hàng' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        page.fill('#aiTextInput', 'Thông tin cửa hàng')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-title')?.innerText || document.querySelector('#modalRoot h3')?.innerText || ''")
        sheet_visible = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display !== 'none' && document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        print(f"-> Modal title: '{modal_title}', Sheet visible: {sheet_visible}")
        assert any(k in modal_title.lower() for k in ['cửa hàng', 'shop', 'hồ sơ']), f"Expected store info modal, got '{modal_title}'"
        assert not sheet_visible, "AI sheet must auto-close!"

        # Close modal
        page.evaluate("() => { if (window.__qbiz_app__?.closeModal) window.__qbiz_app__.closeModal(); else document.getElementById('modalRoot').innerHTML = ''; }")
        page.wait_for_timeout(400)

        # =====================================================================
        # TEST 4: User Request 'Mở bán hàng' (POS)
        # =====================================================================
        print("\n=== TEST 4: 'Mở bán hàng' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        page.fill('#aiTextInput', 'Mở bán hàng')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        state_sales = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_visible = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display !== 'none' && document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        print(f"-> State page: '{state_sales}', Sheet visible: {sheet_visible}")
        assert state_sales in ('pos', 'sales'), f"Expected 'pos' or 'sales', got '{state_sales}'"
        assert not sheet_visible, "AI sheet must auto-close!"

        ss_sales = os.path.join(evidence_dir, 'ai_nav_real_sales_pos_mobile.png')
        page.screenshot(path=ss_sales)
        print(f"-> PASS! Screenshot saved to {ss_sales}")

        # =====================================================================
        # TEST 5: User Request 'Kiểm kho' (Stocktake Modal)
        # =====================================================================
        print("\n=== TEST 5: 'Kiểm kho' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        page.fill('#aiTextInput', 'Kiểm kho')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        modal_text = page.evaluate("() => document.getElementById('modalRoot')?.innerText || ''")
        print(f"-> Modal text snippet: '{modal_text[:100]}'")
        assert 'kiểm' in modal_text.lower(), f"Expected stocktake modal, got '{modal_text[:100]}'"

        page.evaluate("() => { if (window.__qbiz_app__?.closeModal) window.__qbiz_app__.closeModal(); else document.getElementById('modalRoot').innerHTML = ''; }")
        page.wait_for_timeout(400)

        # =====================================================================
        # TEST 6: User Request 'Quản lý kho'
        # =====================================================================
        print("\n=== TEST 6: 'Quản lý kho' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        page.fill('#aiTextInput', 'Quản lý kho')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        state_wh = page.evaluate("() => window.__qbiz_app__.state.page")
        print(f"-> State page: '{state_wh}'")
        assert state_wh in ('warehouse', 'inventory', 'transfers'), f"Expected warehouse page (transfers), got '{state_wh}'"

        # =====================================================================
        # TEST 7: Comprehensive Routing Audit for All Simple Settings/Nav Queries
        # =====================================================================
        print("\n=== TEST 7: AUDIT ALL SIMPLE NAVIGATION & SETTINGS QUERIES ===")
        test_queries = [
            ("vào cài đặt máy in", "open_print_settings"),
            ("cài đặt máy in", "open_print_settings"),
            ("kết nối máy in", "open_print_settings"),
            ("cài đặt", "open_settings"),
            ("vào cài đặt", "open_settings"),
            ("thông tin cửa hàng", "open_store_info"),
            ("đổi tên shop", "open_store_info"),
            ("chế độ kinh doanh", "open_business_mode"),
            ("kiểu giao diện", "open_ui_profile"),
            ("cài đặt thanh toán", "open_sale_preferences"),
            ("quản lý kho", "open_warehouse"),
            ("mở kho", "open_warehouse"),
            ("kiểm kho", "open_stocktake"),
            ("nhập kho", "open_receipt"),
            ("chuyển kho", "open_transfer"),
            ("mở bán hàng", "open_sales"),
            ("vào pos", "open_sales"),
            ("đơn hàng", "open_orders"),
            ("sổ giao dịch", "open_transactions"),
            ("danh mục sản phẩm", "open_products"),
            ("khách hàng", "open_customers"),
            ("nhà cung cấp", "open_suppliers"),
            ("báo cáo", "open_reports"),
            ("trả hàng", "open_returns"),
            ("sổ quỹ", "open_cash"),
            ("ca làm việc", "open_shift"),
            ("sao lưu", "open_backup"),
            ("phân quyền", "open_permissions"),
            ("bảng giá", "open_prices"),
            ("khuyến mãi", "open_promos"),
            ("công nợ", "open_debts"),
            ("tổng quan", "open_dashboard")
        ]

        passed_count = 0
        for q, expected_action in test_queries:
            r = page.evaluate(f'''async () => {{
                const router = await import('./src/ai/router.js');
                const state = window.__qbiz_app__.state;
                const context = {{ current_route: 'more', actor_role: 'owner', actor_id: 'usr_owner' }};
                return await router.routeIntent('{q}', context, state);
            }}''')
            action = r.get('actionId')
            intent = r.get('intent')
            success = (action == expected_action)
            if success:
                passed_count += 1
                status = "PASS"
            else:
                status = "FAIL"
            act_str = str(action)
            print(f"   [{status}] '{q:25}' -> Expected: {expected_action:22} | Actual: {act_str:22} (Intent: {intent})")
            assert success, f"Query '{q}' failed: expected {expected_action}, got {action}"

        print(f"\n-> AUDIT PASSED: {passed_count}/{len(test_queries)} simple commands accurately routed!")
        print("\nALL NAVIGATION AND SETTINGS REAL ACTION TESTS PASSED SUCCESSFULLY! 🚀")

        browser.close()

if __name__ == '__main__':
    run_tests()
