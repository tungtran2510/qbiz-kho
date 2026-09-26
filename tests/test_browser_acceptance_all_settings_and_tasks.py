import sys, os, time, json
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_acceptance_suite():
    evidence_dir = os.path.join(os.path.dirname(__file__), 'evidence')
    os.makedirs(evidence_dir, exist_ok=True)

    results = []

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

        print("=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG BẰNG TRÌNH DUYỆT THẬT (ACCEPTANCE SUITE) ===")
        print("1. Mở ứng dụng QBiz Kho tại http://localhost:4180/...")
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')

        print("2. Chuyển sang Showroom Thời trang (Fashion Demo Mode)...")
        page.evaluate('() => window.__qbiz_app__.previewDemo("fashion")')
        page.wait_for_timeout(800)

        # Helper to execute user command through the real AI Assistant UI
        def execute_ai_command(command_text):
            # Close any open modal first
            page.evaluate("() => { if (window.__qbiz_app__?.closeModal) window.__qbiz_app__.closeModal(); else if (document.getElementById('modalRoot')) document.getElementById('modalRoot').innerHTML = ''; }")
            page.wait_for_timeout(200)

            # Ensure trigger is available and click it
            trigger = page.locator('#qbizAiTrigger')
            assert trigger.is_visible(), "Nút AI Trigger không hiển thị trên giao diện!"
            trigger.click()
            page.wait_for_timeout(400)

            # Ensure sheet is opened
            sheet = page.locator('#qbizAiSheet')
            assert sheet.is_visible(), "Bảng AI Sheet không mở ra khi bấm trigger!"

            # Fill text input and send
            inp = page.locator('#aiTextInput')
            inp.fill(command_text)
            send_btn = page.locator('#aiSendBtn')
            send_btn.click()

            # Wait for execution + auto-toast + auto-close sheet (400ms delay in ui.js)
            page.wait_for_timeout(1400)

        # -------------------------------------------------------------
        # TÁC VỤ 1: Cài đặt máy in & thiết bị
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 1] Ra lệnh: 'Vào cài đặt máy in'...")
        execute_ai_command('Vào cài đặt máy in')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        print_tab = page.evaluate("() => window.__qbiz_app__.state.printTab")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_devices = page.locator('.device-list').is_visible()
        has_k80 = page.locator('text=Máy in nhiệt K80').is_visible()

        assert state_page == 'print', f"Sai trang: {state_page}"
        assert print_tab == 'devices', f"Sai tab máy in: {print_tab}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_devices and has_k80, "Màn hình chưa hiển thị danh sách thiết bị in (K80)!"

        ss_path = os.path.join(evidence_dir, 'acceptance_01_printer_settings.png')
        page.screenshot(path=ss_path)
        results.append(("Cài đặt máy in", "Vào cài đặt máy in", "PASS", "Trang In thiết bị K80/K58 hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 2: Cài đặt hệ thống
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 2] Ra lệnh: 'Vào cài đặt'...")
        execute_ai_command('Vào cài đặt')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_settings = page.locator('.settings-center').is_visible()

        assert state_page == 'settings', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_settings, "Màn hình chưa hiển thị trung tâm Cài đặt!"

        ss_path = os.path.join(evidence_dir, 'acceptance_02_system_settings.png')
        page.screenshot(path=ss_path)
        results.append(("Cài đặt hệ thống", "Vào cài đặt", "PASS", "Trung tâm cài đặt .settings-center hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 3: Thông tin cửa hàng (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 3] Ra lệnh: 'Thông tin cửa hàng'...")
        execute_ai_command('Thông tin cửa hàng')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")
        has_store_name_input = page.locator('#profileStoreName').is_visible()
        has_address_input = page.locator('#profileAddress').is_visible()

        assert 'cửa hàng' in modal_title.lower() or 'shop' in modal_title.lower(), f"Sai tiêu đề modal: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_store_name_input and has_address_input, "Modal chưa hiển thị trường nhập tên/địa chỉ shop!"

        ss_path = os.path.join(evidence_dir, 'acceptance_03_store_profile_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Thông tin cửa hàng", "Thông tin cửa hàng", "PASS", "Modal Thông tin shop với form nhập tên/địa chỉ hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 4: Chế độ kinh doanh (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 4] Ra lệnh: 'Chế độ kinh doanh'...")
        execute_ai_command('Chế độ kinh doanh')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")
        modal_content = page.evaluate("() => document.getElementById('modalRoot')?.innerText || ''")

        assert 'chế độ kinh doanh' in modal_title.lower(), f"Sai tiêu đề modal: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert any(k in modal_content.lower() for k in ['thời trang', 'bán lẻ', 'ăn uống', 'dịch vụ']), "Modal chưa có danh sách ngành nghề!"

        ss_path = os.path.join(evidence_dir, 'acceptance_04_business_mode_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Chế độ kinh doanh", "Chế độ kinh doanh", "PASS", "Modal Chế độ kinh doanh 4 ngành hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 5: Kiểu giao diện (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 5] Ra lệnh: 'Kiểu giao diện'...")
        execute_ai_command('Kiểu giao diện')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")

        assert 'giao diện' in modal_title.lower(), f"Sai tiêu đề modal: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"

        ss_path = os.path.join(evidence_dir, 'acceptance_05_ui_profile_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Kiểu giao diện", "Kiểu giao diện", "PASS", "Modal Kiểu giao diện hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 6: Bán hàng & Thanh toán (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 6] Ra lệnh: 'Cài đặt thanh toán'...")
        execute_ai_command('Cài đặt thanh toán')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")

        assert 'thanh toán' in modal_title.lower() or 'bán hàng' in modal_title.lower(), f"Sai tiêu đề: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"

        ss_path = os.path.join(evidence_dir, 'acceptance_06_sale_preferences_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Cài đặt thanh toán", "Cài đặt thanh toán", "PASS", "Modal Bán hàng & thanh toán hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 7: Cài đặt kho hàng (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 7] Ra lệnh: 'Cài đặt kho'...")
        execute_ai_command('Cài đặt kho')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")
        has_new_wh_btn = page.locator('[data-action="new-warehouse"]').is_visible()

        assert 'kho' in modal_title.lower(), f"Sai tiêu đề: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_new_wh_btn, "Modal chưa hiển thị nút Thêm kho!"

        ss_path = os.path.join(evidence_dir, 'acceptance_07_warehouse_mgmt_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Cài đặt kho", "Cài đặt kho", "PASS", "Modal Quản lý kho hàng hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 8: Cài đặt dữ liệu (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 8] Ra lệnh: 'Cài đặt dữ liệu'...")
        execute_ai_command('Cài đặt dữ liệu')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")

        assert 'dữ liệu' in modal_title.lower(), f"Sai tiêu đề: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"

        ss_path = os.path.join(evidence_dir, 'acceptance_08_data_settings_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Cài đặt dữ liệu", "Cài đặt dữ liệu", "PASS", "Modal Cài đặt Dữ liệu hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 9: Kiểm kho nhanh (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 9] Ra lệnh: 'Kiểm kho'...")
        execute_ai_command('Kiểm kho')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")
        has_search = page.locator('#stockProductSearch').is_visible()
        has_actual = page.locator('#qty').is_visible()

        assert 'kiểm kho' in modal_title.lower(), f"Sai tiêu đề: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_search and has_actual, "Modal Kiểm kho chưa có ô tìm kiếm sản phẩm và số lượng!"

        ss_path = os.path.join(evidence_dir, 'acceptance_09_stocktake_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Kiểm kho nhanh", "Kiểm kho", "PASS", "Modal Kiểm kho với ô tìm kiếm & số lượng hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 10: Nhập kho nhanh (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 10] Ra lệnh: 'Nhập kho'...")
        execute_ai_command('Nhập kho')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")
        has_price = page.locator('#purchasePrice').is_visible()
        has_wh = page.locator('#wh').is_visible()

        assert 'nhập hàng' in modal_title.lower() or 'nhập kho' in modal_title.lower(), f"Sai tiêu đề: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_price and has_wh, "Modal Nhập kho chưa có ô giá nhập và chọn kho!"

        ss_path = os.path.join(evidence_dir, 'acceptance_10_receipt_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Nhập kho nhanh", "Nhập kho", "PASS", "Modal Nhập kho với giá nhập & chọn kho hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 11: Chuyển kho (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 11] Ra lệnh: 'Chuyển kho'...")
        execute_ai_command('Chuyển kho')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")
        has_from_wh = page.locator('#fromWh').is_visible()
        has_to_wh = page.locator('#toWh').is_visible()

        assert 'chuyển kho' in modal_title.lower(), f"Sai tiêu đề: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_from_wh and has_to_wh, "Modal Chuyển kho chưa có ô chọn kho đi và kho nhận!"

        ss_path = os.path.join(evidence_dir, 'acceptance_11_transfer_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Chuyển kho", "Chuyển kho", "PASS", "Modal Chuyển kho với Kho đi / Kho nhận hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 12: Quét mã vạch / QR (Modal)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 12] Ra lệnh: 'Quét mã'...")
        execute_ai_command('Quét mã')
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        modal_title = page.evaluate("() => document.querySelector('#modalRoot .modal-head h3, #modalRoot h3, #modalRoot .modal-title')?.innerText || ''")
        has_manual_code = page.locator('#manualCode').is_visible()

        assert 'quét' in modal_title.lower(), f"Sai tiêu đề: {modal_title}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_manual_code, "Modal Quét mã chưa có ô nhập mã bằng tay!"

        ss_path = os.path.join(evidence_dir, 'acceptance_12_scan_modal.png')
        page.screenshot(path=ss_path)
        results.append(("Quét mã vạch", "Quét mã", "PASS", "Modal Quét barcode/QR với ô nhập mã hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # -------------------------------------------------------------
        # TÁC VỤ 13: Bán hàng (POS Screen)
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 13] Ra lệnh: 'Mở bán hàng'...")
        execute_ai_command('Mở bán hàng')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_sales_pos = page.locator('.pos-browser, #saleSearch, .pos-grid').first.is_visible()

        assert state_page == 'sales', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_sales_pos, "Màn hình POS Bán hàng chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_13_pos_sales_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Mở bán hàng POS", "Mở bán hàng", "PASS", "Màn hình Bán hàng POS hiển thị đầy đủ", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 14: Báo cáo tài chính & doanh thu
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 14] Ra lệnh: 'Báo cáo'...")
        execute_ai_command('Báo cáo')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_reports = page.locator('.report-center, .report-tabs, .report-metrics').first.is_visible()

        assert state_page == 'reports', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_reports, "Màn hình Báo cáo chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_14_reports_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Báo cáo", "Báo cáo", "PASS", "Màn hình Báo cáo hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 15: Sổ quỹ tiền mặt
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 15] Ra lệnh: 'Sổ quỹ'...")
        execute_ai_command('Sổ quỹ')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_cash = page.locator('.feature-center, .mod-summary, [data-action="cash-in"]').first.is_visible()

        assert state_page == 'cash', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_cash, "Màn hình Sổ quỹ tiền mặt chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_15_cash_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Sổ quỹ tiền mặt", "Sổ quỹ", "PASS", "Màn hình Sổ quỹ tiền mặt hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 16: Sổ giao dịch / Hóa đơn
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 16] Ra lệnh: 'Sổ giao dịch'...")
        execute_ai_command('Sổ giao dịch')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_transactions = page.locator('.tx-search, #txSearch, .tx-summary, .tx-list').first.is_visible()

        assert state_page == 'transactions', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_transactions, "Màn hình Giao dịch chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_16_transactions_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Sổ giao dịch", "Sổ giao dịch", "PASS", "Màn hình Giao dịch & Hóa đơn hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 17: Danh mục sản phẩm
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 17] Ra lệnh: 'Danh mục sản phẩm'...")
        execute_ai_command('Danh mục sản phẩm')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_products = page.locator('.goods-toolbar, #productSearch, .goods-segments').first.is_visible()

        assert state_page == 'products', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_products, "Màn hình Hàng hóa chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_17_products_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Danh mục sản phẩm", "Danh mục sản phẩm", "PASS", "Màn hình Danh sách Hàng hóa hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 18: Danh bạ khách hàng
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 18] Ra lệnh: 'Khách hàng'...")
        execute_ai_command('Khách hàng')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_customers = page.locator('.directory-screen, #customerDirectorySearch, .directory-toolbar').first.is_visible()

        assert state_page == 'customers', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_customers, "Màn hình Khách hàng chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_18_customers_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Khách hàng", "Khách hàng", "PASS", "Màn hình Khách hàng hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 19: Nhà cung cấp
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 19] Ra lệnh: 'Nhà cung cấp'...")
        execute_ai_command('Nhà cung cấp')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_suppliers = page.locator('.directory-screen, [data-action="new-supplier"]').first.is_visible()

        assert state_page == 'suppliers', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_suppliers, "Màn hình Nhà cung cấp chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_19_suppliers_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Nhà cung cấp", "Nhà cung cấp", "PASS", "Màn hình Nhà cung cấp hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 20: Đơn hàng
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 20] Ra lệnh: 'Đơn hàng'...")
        execute_ai_command('Đơn hàng')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_orders = page.locator('.orders-screen, #orderSearch, .orders-toolbar').first.is_visible()

        assert state_page == 'orders', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_orders, "Màn hình Đơn hàng chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_20_orders_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Đơn hàng", "Đơn hàng", "PASS", "Màn hình Đơn hàng hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        # -------------------------------------------------------------
        # TÁC VỤ 21: Màn hình Tổng quan
        # -------------------------------------------------------------
        print("\n[TÁC VỤ 21] Ra lệnh: 'Tổng quan'...")
        execute_ai_command('Tổng quan')
        state_page = page.evaluate("() => window.__qbiz_app__.state.page")
        sheet_closed = page.evaluate("() => document.getElementById('qbizAiSheet')?.style.display === 'none' || !document.getElementById('qbizAiSheet')?.classList.contains('is-open')")
        has_dashboard = page.locator('.overview-grid, .overview-hero, .dashboard, .stat-grid, .brand-card, .quick-tile').first.is_visible()

        assert state_page == 'dashboard', f"Sai trang: {state_page}"
        assert sheet_closed, "AI Sheet chưa tự đóng!"
        assert has_dashboard, "Màn hình Tổng quan chưa hiển thị!"

        ss_path = os.path.join(evidence_dir, 'acceptance_21_dashboard_screen.png')
        page.screenshot(path=ss_path)
        results.append(("Tổng quan", "Tổng quan", "PASS", "Màn hình Tổng quan hiển thị", ss_path))
        print(f"-> PASS! Đã lưu ảnh: {ss_path}")

        print("\n" + "="*80)
        print(f"{'TÁC VỤ':<25} | {'CÂU LỆNH':<22} | {'KẾT QUẢ':<8} | {'CHI TIẾT XÁC MINH'}")
        print("="*80)
        for name, cmd, res, detail, _ in results:
            print(f"{name:<25} | {cmd:<22} | {res:<8} | {detail}")
        print("="*80)
        print(f"TỔNG KẾT: {len(results)}/{len(results)} TÁC VỤ THỰC THI TRÊN TRÌNH DUYỆT ĐẠT 100% PASS! 🚀")

        browser.close()

if __name__ == '__main__':
    run_acceptance_suite()
