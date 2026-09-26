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

        print("1. Truy cập http://localhost:4180/...")
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')

        print("2. Chuyển sang Showroom Thời trang (Fashion)...")
        page.evaluate('() => window.__qbiz_app__.previewDemo("fashion")')
        page.wait_for_timeout(600)

        # Clear any old mute preference for a clean test
        page.evaluate('() => localStorage.removeItem("qbiz_ai_voice_muted")')

        # =====================================================================
        # TEST CASE 1: Kiểm tra nút Bật/Tắt âm lượng giọng đọc trên Header
        # =====================================================================
        print("\n=== TEST CASE 1: NÚT TẮT ÂM LƯỢNG GIỌNG ĐỌC (#aiVoiceMuteBtn) ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)

        btn_info = page.evaluate('''() => {
            const btn = document.getElementById('aiVoiceMuteBtn');
            return {
                exists: Boolean(btn),
                text: btn?.innerText || '',
                title: btn?.title || '',
                classes: btn?.className || '',
                isMuted: window.__qbiz_app__.isVoiceMuted ? window.__qbiz_app__.isVoiceMuted() : null
            };
        }''')

        print(f"-> Nút âm lượng: exists = {btn_info['exists']}, icon = '{btn_info['text']}', title = '{btn_info['title']}'")
        assert btn_info['exists'], "LỖI: Chưa có nút #aiVoiceMuteBtn trên thanh tiêu đề trợ lý AI!"
        assert btn_info['text'] == '🔊', f"LỖI: Icon ban đầu là '{btn_info['text']}', mong muốn '🔊'!"
        assert btn_info['isMuted'] is False, "LỖI: Trạng thái ban đầu phải là chưa tắt âm (isVoiceMuted = false)!"

        # Chụp ảnh nút loa khi đang bật
        os.makedirs('tests/evidence', exist_ok=True)
        screenshot1 = 'tests/evidence/owner_voice_unmuted_390.png'
        page.screenshot(path=screenshot1)
        print(f"-> PASS: Đã lưu ảnh trạng thái bật âm: {screenshot1}")

        # =====================================================================
        # TEST CASE 2: Bấm nút tắt âm lượng giọng đọc
        # =====================================================================
        print("\n=== TEST CASE 2: BẤM NÚT TẮT ÂM LƯỢNG ===")
        page.click('#aiVoiceMuteBtn')
        page.wait_for_timeout(400)

        btn_info_muted = page.evaluate('''() => {
            const btn = document.getElementById('aiVoiceMuteBtn');
            return {
                text: btn?.innerText || '',
                title: btn?.title || '',
                hasMutedClass: btn?.classList.contains('is-muted'),
                isMuted: window.__qbiz_app__.isVoiceMuted(),
                storedVal: localStorage.getItem('qbiz_ai_voice_muted')
            };
        }''')

        print(f"-> Sau khi bấm tắt: icon = '{btn_info_muted['text']}', isMuted = {btn_info_muted['isMuted']}, storedVal = '{btn_info_muted['storedVal']}'")
        assert btn_info_muted['text'] == '🔇', f"LỖI: Icon sau khi tắt là '{btn_info_muted['text']}', mong muốn '🔇'!"
        assert btn_info_muted['hasMutedClass'], "LỖI: Nút chưa có class .is-muted!"
        assert btn_info_muted['isMuted'] is True, "LỖI: isVoiceMuted() phải là True!"
        assert btn_info_muted['storedVal'] == 'true', "LỖI: Chưa lưu vào localStorage 'qbiz_ai_voice_muted'!"

        screenshot2 = 'tests/evidence/owner_voice_muted_390.png'
        page.screenshot(path=screenshot2)
        print(f"-> PASS: Đã lưu ảnh trạng thái tắt âm: {screenshot2}")

        # Bấm lại để bật âm
        print("Bấm lại để bật âm lượng...")
        page.click('#aiVoiceMuteBtn')
        page.wait_for_timeout(400)
        is_unmuted = page.evaluate('() => window.__qbiz_app__.isVoiceMuted()')
        assert is_unmuted is False, "LỖI: Bấm lại phải bật âm (isVoiceMuted = False)!"
        print("-> PASS: Bật âm lại thành công.")

        # =====================================================================
        # TEST CASE 3: Điều khiển tắt/bật âm bằng câu lệnh chat / giọng nói
        # =====================================================================
        print("\n=== TEST CASE 3: LỆNH CHAT / GIỌNG NÓI 'tắt giọng đọc' ===")
        page.fill('#aiTextInput', 'tắt giọng đọc')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        res_mute_cmd = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const btn = document.getElementById('aiVoiceMuteBtn');
            return {
                lastMsg: msgs[msgs.length - 1] || '',
                isMuted: window.__qbiz_app__.isVoiceMuted(),
                btnText: btn?.innerText || ''
            };
        }''')

        print(f"-> Phản hồi: {res_mute_cmd['lastMsg']}")
        assert 'Đã tắt giọng đọc trợ lý' in res_mute_cmd['lastMsg'], "LỖI: AI không phản hồi xác nhận tắt giọng đọc!"
        assert res_mute_cmd['isMuted'] is True, "LỖI: isVoiceMuted phải là True sau lệnh 'tắt giọng đọc'!"
        assert res_mute_cmd['btnText'] == '🔇', "LỖI: Icon nút chưa chuyển sang 🔇!"
        print("-> PASS: Lệnh 'tắt giọng đọc' hoạt động chuẩn xác.")

        print("\n=== LỆNH CHAT / GIỌNG NÓI 'bật giọng đọc' ===")
        page.fill('#aiTextInput', 'bật giọng đọc')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        res_unmute_cmd = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const btn = document.getElementById('aiVoiceMuteBtn');
            return {
                lastMsg: msgs[msgs.length - 1] || '',
                isMuted: window.__qbiz_app__.isVoiceMuted(),
                btnText: btn?.innerText || ''
            };
        }''')

        print(f"-> Phản hồi: {res_unmute_cmd['lastMsg']}")
        assert 'Đã bật giọng đọc trợ lý' in res_unmute_cmd['lastMsg'], "LỖI: AI không phản hồi xác nhận bật giọng đọc!"
        assert res_unmute_cmd['isMuted'] is False, "LỖI: isVoiceMuted phải là False sau lệnh 'bật giọng đọc'!"
        assert res_unmute_cmd['btnText'] == '🔊', "LỖI: Icon nút chưa chuyển sang 🔊!"
        print("-> PASS: Lệnh 'bật giọng đọc' hoạt động chuẩn xác.")

        # =====================================================================
        # TEST CASE 4: Lệnh 'tìm lấy hóa đơn gần nhất'
        # =====================================================================
        print("\n=== TEST CASE 4: LỆNH 'tìm lấy hóa đơn gần nhất' ===")
        page.fill('#aiTextInput', 'tìm lấy hóa đơn gần nhất')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        res_invoice = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const hasTxDetail = Boolean(document.querySelector('#modalRoot .transaction-detail'));
            return {
                lastMsg: msgs[msgs.length - 1] || '',
                hasTxDetail
            };
        }''')

        print(f"-> Phản hồi: {res_invoice['lastMsg']}")
        assert 'Tôi có thể hỗ trợ bạn:' not in res_invoice['lastMsg'], "LỖI: Rơi vào fallback menu!"
        assert 'HD-0001' in res_invoice['lastMsg'], "LỖI: Không tìm thấy mã hóa đơn HD-0001!"
        assert res_invoice['hasTxDetail'], "LỖI: Không mở modal chi tiết hóa đơn!"
        print("-> PASS: 'tìm lấy hóa đơn gần nhất' thành công.")

        screenshot_final = 'tests/evidence/owner_voice_and_invoice_final_390.png'
        page.screenshot(path=screenshot_final)
        print(f"-> PASS: Đã lưu ảnh toàn diện: {screenshot_final}")

        print("\n=======================================================")
        print("TẤT CẢ CÁC BÀI KIỂM THỬ NÚT ÂM LƯỢNG & TTS ĐỀU PASS 100%!")
        print("=======================================================")
        browser.close()

if __name__ == '__main__':
    run_test()
