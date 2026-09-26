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

        print("2. Chuyển sang Showroom Thời trang (Fashion) có sẵn giao dịch...")
        page.evaluate('() => window.__qbiz_app__.previewDemo("fashion")')
        page.wait_for_timeout(600)

        # Check existing sales in state
        sales_count = page.evaluate('() => (window.__qbiz_app__.state.data.sales || []).length')
        print(f"-> Số phiếu bán trong demo fashion: {sales_count}")
        assert sales_count > 0, "LỖI: Chưa có dữ liệu phiếu bán hàng demo!"

        # =====================================================================
        # TEST CASE 1: Câu lệnh thực tế của Chủ shop: "tìm lấy hóa đơn gần nhất"
        # =====================================================================
        print("\n=== TEST CASE 1: CÂU LỆNH GỐC 'tìm lấy hóa đơn gần nhất' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)

        print("3. Nhập câu lệnh: 'tìm lấy hóa đơn gần nhất'...")
        page.fill('#aiTextInput', 'tìm lấy hóa đơn gần nhất')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        res1 = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const lastMsg = msgs[msgs.length - 1] || '';
            const modal = document.querySelector('#modalRoot .modal');
            const hasTxDetail = Boolean(document.querySelector('#modalRoot .transaction-detail'));
            const modalTitle = document.querySelector('#modalRoot .modal-head h3')?.innerText || '';
            const detailList = Boolean(document.querySelector('#modalRoot .detail-list'));
            const txTotal = document.querySelector('#modalRoot .transaction-total')?.innerText || '';
            return {
                lastMsg,
                hasModal: Boolean(modal),
                hasTxDetail,
                modalTitle,
                detailList,
                txTotal
            };
        }''')

        print(f"-> Phản hồi AI:\n{res1['lastMsg']}\n")
        print(f"-> Modal mở: {res1['hasModal']}, Chi tiết giao dịch: {res1['hasTxDetail']}")
        print(f"-> Tiêu đề Modal: {res1['modalTitle']}, Tổng tiền: {res1['txTotal']}")

        # Assertions for Test Case 1
        assert 'Tôi có thể hỗ trợ bạn:' not in res1['lastMsg'], "LỖI: AI vẫn rơi vào generic fallback menu!"
        assert 'hóa đơn' in res1['lastMsg'].lower() or 'phiếu bán' in res1['lastMsg'].lower(), "LỖI: AI không phản hồi thông tin hóa đơn!"
        assert res1['hasTxDetail'], "LỖI: Chưa tự động mở modal chi tiết hóa đơn (.transaction-detail)!"

        os.makedirs('tests/evidence', exist_ok=True)
        screenshot1 = 'tests/evidence/owner_recent_invoice_chat_390.png'
        page.screenshot(path=screenshot1)
        print(f"-> PASS: Đã lưu ảnh chat: {screenshot1}")

        # Đóng AI Sheet để xem modal chi tiết hóa đơn
        print("4. Thu nhỏ AI Sheet để chụp ảnh chi tiết hóa đơn trên màn hình...")
        page.click('#aiCloseBtn')
        page.wait_for_timeout(500)

        screenshot_modal = 'tests/evidence/owner_recent_invoice_modal_390.png'
        page.screenshot(path=screenshot_modal)
        print(f"-> PASS: Đã lưu ảnh modal hóa đơn: {screenshot_modal}")

        # Đóng modal
        page.evaluate('() => window.__qbiz_app__.closeModal()')
        page.wait_for_timeout(400)

        # =====================================================================
        # TEST CASE 2: Lệnh "hóa đơn gần nhất"
        # =====================================================================
        print("\n=== TEST CASE 2: LỆNH 'hóa đơn gần nhất' ===")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(400)

        page.fill('#aiTextInput', 'hóa đơn gần nhất')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        res2 = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const lastMsg = msgs[msgs.length - 1] || '';
            const hasTxDetail = Boolean(document.querySelector('#modalRoot .transaction-detail'));
            return { lastMsg, hasTxDetail };
        }''')
        print(f"-> Phản hồi AI:\n{res2['lastMsg']}\n")
        assert 'Tôi có thể hỗ trợ bạn:' not in res2['lastMsg'], "LỖI: Rơi vào generic fallback!"
        assert res2['hasTxDetail'], "LỖI: Không mở chi tiết hóa đơn!"

        # Close modal
        page.evaluate('() => window.__qbiz_app__.closeModal()')
        page.wait_for_timeout(400)

        # =====================================================================
        # TEST CASE 3: Lệnh "in hóa đơn gần nhất" (KHÔNG mở cài đặt máy in!)
        # =====================================================================
        print("\n=== TEST CASE 3: LỆNH 'in hóa đơn gần nhất' ===")
        page.evaluate('''() => {
            window.__lastPrintCall = null;
            const origPrint = window.__qbiz_app__.printDocument;
            window.__qbiz_app__.printDocument = (opts) => {
                window.__lastPrintCall = opts;
                return origPrint(opts);
            };
        }''')

        page.fill('#aiTextInput', 'in hóa đơn gần nhất')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        res3 = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const lastMsg = msgs[msgs.length - 1] || '';
            const state = window.__qbiz_app__.state;
            const printCall = window.__lastPrintCall;
            const hasPrintCenter = Boolean(document.querySelector('.print-center'));
            return {
                lastMsg,
                page: state.page,
                hasPrintCenter,
                printCall
            };
        }''')

        print(f"-> Phản hồi AI:\n{res3['lastMsg']}\n")
        print(f"-> Trang hiện tại: {res3['page']}, Có PrintCenter: {res3['hasPrintCenter']}")
        print(f"-> printDocument được gọi: {res3['printCall']}")

        # Assertions for print command
        assert res3['page'] != 'print', "LỖI NGHIÊM TRỌNG: 'in hóa đơn gần nhất' bị mở nhầm cài đặt máy in (state.page = print)!"
        assert not res3['hasPrintCenter'], "LỖI: Mở nhầm trung tâm thiết bị in!"
        assert 'in' in res3['lastMsg'].lower() or 'phiếu' in res3['lastMsg'].lower(), "LỖI: Phản hồi không xác nhận lệnh in!"
        assert res3['printCall'] is not None, "LỖI: window.__qbiz_app__.printDocument chưa được gọi!"
        assert res3['printCall'].get('type') == 'receipt', f"LỖI: Loại chứng từ in là {res3['printCall'].get('type')}, mong muốn 'receipt'!"

        screenshot_print = 'tests/evidence/owner_recent_invoice_print_390.png'
        page.screenshot(path=screenshot_print)
        print(f"-> PASS: Đã lưu ảnh in hóa đơn: {screenshot_print}")

        # Close modal if open
        page.evaluate('() => window.__qbiz_app__.closeModal()')
        page.wait_for_timeout(400)

        # =====================================================================
        # TEST CASE 4: Các từ đồng nghĩa khác
        # =====================================================================
        synonyms = [
            "phiếu bán gần nhất",
            "đơn gần nhất",
            "giao dịch gần nhất",
            "xem hóa đơn gần nhất"
        ]

        for syn in synonyms:
            print(f"\n--- Kiểm tra từ đồng nghĩa: '{syn}' ---")
            page.fill('#aiTextInput', syn)
            page.click('#aiSendBtn')
            page.wait_for_timeout(1400)

            res_syn = page.evaluate('''() => {
                const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
                const lastMsg = msgs[msgs.length - 1] || '';
                const hasTxDetail = Boolean(document.querySelector('#modalRoot .transaction-detail'));
                return { lastMsg, hasTxDetail };
            }''')

            assert 'Tôi có thể hỗ trợ bạn:' not in res_syn['lastMsg'], f"LỖI: '{syn}' rơi vào generic fallback!"
            assert res_syn['hasTxDetail'], f"LỖI: '{syn}' không mở chi tiết hóa đơn!"
            print(f"-> PASS: '{syn}' mở chi tiết thành công.")
            page.evaluate('() => window.__qbiz_app__.closeModal()')
            page.wait_for_timeout(300)

        print("\n=======================================================")
        print("TẤT CẢ CÁC BÀI TEST 'TÌM LẤY HÓA ĐƠN GẦN NHẤT' ĐỀU PASS 100%!")
        print("=======================================================")
        browser.close()

if __name__ == '__main__':
    run_test()
