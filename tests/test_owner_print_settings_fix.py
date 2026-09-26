import sys, os, time, json
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_test():
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
        page.wait_for_timeout(600)

        # =====================================================================
        # TEST CASE 1: Lệnh chính xác của Chủ shop - 'Mở cài đặt máy in'
        # =====================================================================
        print("\n=== TEST CASE 1: LỆNH CHÍNH XÁC 'Mở cài đặt máy in' ===")
        print("2. Mở AI Assistant Sheet (#qbizAiTrigger)...")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)

        print("3. Nhập câu lệnh chính xác của Chủ shop: 'Mở cài đặt máy in'...")
        page.fill('#aiTextInput', 'Mở cài đặt máy in')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1200)

        # Inspect AI response
        ai_res = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const state = window.__qbiz_app__.state;
            const content = document.getElementById('content')?.innerHTML || '';
            return {
                lastMsg: msgs[msgs.length - 1],
                allMsgs: msgs,
                page: state.page,
                printTab: state.printTab,
                hasPrintCenter: Boolean(document.querySelector('.print-center')),
                hasDeviceList: Boolean(document.querySelector('.device-list')),
                hasK80: content.includes('Máy in nhiệt K80'),
                hasK58: content.includes('Máy in nhiệt K58'),
                hasBarcodePrinter: content.includes('Máy in tem mã vạch')
            };
        }''')

        print(f"-> Phản hồi AI:\n{ai_res['lastMsg']}\n")
        print(f"-> Trạng thái App: page = '{ai_res['page']}', printTab = '{ai_res['printTab']}'")
        print(f"-> Màn hình hiển thị: PrintCenter = {ai_res['hasPrintCenter']}, DeviceList = {ai_res['hasDeviceList']}")
        print(f"-> Có Máy in nhiệt K80: {ai_res['hasK80']}, K58: {ai_res['hasK58']}, In tem: {ai_res['hasBarcodePrinter']}")

        # Assertions
        assert 'Tôi có thể hỗ trợ bạn' not in ai_res['lastMsg'], "LỖI: AI vẫn rơi vào fallback menu chung!"
        assert 'máy in' in ai_res['lastMsg'].lower() or 'thiết bị' in ai_res['lastMsg'].lower(), "LỖI: Phản hồi không đề cập đến máy in/thiết bị!"
        assert ai_res['page'] in ('print', 'prints'), f"LỖI: state.page là '{ai_res['page']}', mong muốn 'print'!"
        assert ai_res['hasPrintCenter'], "LỖI: Màn hình chưa chuyển sang trung tâm In & Thiết bị!"
        assert ai_res['hasDeviceList'], "LỖI: Chưa hiển thị danh sách thiết bị in!"

        screenshot1 = 'tests/evidence/owner_print_settings_chat_390.png'
        page.screenshot(path=screenshot1)
        print(f"-> PASS: Đã lưu ảnh chat: {screenshot1}")

        # Đóng AI sheet để kiểm tra giao diện nền
        print("4. Đóng AI Sheet để kiểm tra màn hình Cấu hình máy in & thiết bị...")
        page.click('#aiCloseBtn')
        page.wait_for_timeout(500)

        screenshot2 = 'tests/evidence/owner_print_settings_devices_390.png'
        page.screenshot(path=screenshot2)
        print(f"-> PASS: Đã lưu ảnh màn hình thiết bị in: {screenshot2}")

        # =====================================================================
        # TEST CASE 2: Yêu cầu 'Mẫu in' / 'Xem mẫu in'
        # =====================================================================
        print("\n=== TEST CASE 2: YÊU CẦU 'Mẫu in' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)

        print("5. Nhập lệnh: 'mẫu in'...")
        page.fill('#aiTextInput', 'mẫu in')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        ai_res2 = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const state = window.__qbiz_app__.state;
            return {
                lastMsg: msgs[msgs.length - 1],
                page: state.page,
                printTab: state.printTab,
                hasTemplateList: Boolean(document.querySelector('.print-template-list'))
            };
        }''')

        print(f"-> Phản hồi AI: {ai_res2['lastMsg']}")
        print(f"-> printTab = '{ai_res2['printTab']}', hasTemplateList = {ai_res2['hasTemplateList']}")
        assert ai_res2['printTab'] == 'templates', f"Expected printTab 'templates', got {ai_res2['printTab']}"

        screenshot3 = 'tests/evidence/owner_print_settings_templates_390.png'
        page.click('#aiCloseBtn')
        page.wait_for_timeout(400)
        page.screenshot(path=screenshot3)
        print(f"-> PASS: Đã lưu ảnh tab mẫu in: {screenshot3}")

        # =====================================================================
        # TEST CASE 3: Các từ đồng nghĩa khác liên quan đến máy in
        # =====================================================================
        print("\n=== TEST CASE 3: TỪ ĐỒNG NGHĨA CÀI ĐẶT MÁY IN ===")
        synonyms = [
            'cài đặt máy in',
            'máy in',
            'mở máy in',
            'kết nối máy in',
            'cấu hình máy in',
            'thiết lập máy in',
            'nhật ký in',
            'in thử'
        ]
        for q in synonyms:
            r = page.evaluate(f'''async () => {{
                const router = await import('./src/ai/router.js');
                const state = window.__qbiz_app__.state;
                const context = {{ current_route: 'more', actor_role: 'owner', actor_id: 'usr_owner' }};
                return await router.routeIntent('{q}', context, state);
            }}''')
            tier = r.get('tier')
            intent = r.get('intent')
            action = r.get('actionId') or r.get('skillId')
            msg = (r.get('text') or r.get('message') or '').replace('\n', ' ')[:45]
            print(f"   [Query]: '{q:20}' -> Tier: {tier}, Intent: {intent}, Action: {action}")
            assert tier == 0, f"Query '{q}' did not resolve at Tier 0!"
            assert intent == 'OPEN_PRINT_SETTINGS', f"Query '{q}' expected OPEN_PRINT_SETTINGS, got {intent}!"
            assert action == 'open_print_settings', f"Query '{q}' expected open_print_settings, got {action}!"

        print("\n=== TOÀN BỘ CÁC TEST CASES ĐÃ PASS 100% ===")
        browser.close()

if __name__ == '__main__':
    run_test()
