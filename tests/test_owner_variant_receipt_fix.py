import io
import sys
import json
import time
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        print("1. Đang truy cập http://localhost:4180/...")
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')

        print("2. Chuyển sang Showroom Thời trang (Fashion)...")
        page.evaluate('() => window.__qbiz_app__.previewDemo("fashion")')
        page.wait_for_timeout(600)

        print("3. Mở chi tiết sản phẩm Váy Linen Dáng Xòe Cổ V (p_fs_dress_linen)...")
        page.evaluate('() => window.__qbiz_app__.openProduct("p_fs_dress_linen")')
        page.wait_for_timeout(600)

        print("4. Mở AI Assistant Sheet (#qbizAiTrigger)...")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(400)

        print("5. Nhập câu lệnh: 'nhập thêm năm cái này'...")
        page.fill('#aiTextInput', 'nhập thêm năm cái này')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        # Inspect candidate cards
        candidates_data = page.evaluate('''() => {
            const list = document.querySelectorAll('.ai-candidate-row');
            return Array.from(list).map(btn => ({
                id: btn.dataset.pickCandidate,
                name: btn.dataset.candidateName,
                variant: btn.dataset.candidateVariant,
                productId: btn.dataset.candidateProductId,
                html: btn.innerHTML,
                text: btn.innerText
            }));
        }''')

        print(f"-> Tìm thấy {len(candidates_data)} phân loại:")
        assert len(candidates_data) == 3, f"Expected 3 variants, got {len(candidates_data)}"

        has_object_object = False
        has_undefined = False
        has_nan = False

        for idx, c in enumerate(candidates_data):
            print(f"   [{idx}] Name: {c['name']} | Variant: {c['variant']} | Text: {c['text']}")
            if '[object Object]' in c['name'] or '[object Object]' in c['text']:
                has_object_object = True
            if 'undefined' in c['text']:
                has_undefined = True
            if 'NaN' in c['text']:
                has_nan = True

        assert not has_object_object, "LỖI: Vẫn còn [object Object] trong phân loại!"
        assert not has_undefined, "LỖI: Vẫn còn undefined trong phân loại!"
        assert not has_nan, "LỖI: Vẫn còn NaN trong phân loại!"
        print("-> PASS: Các thẻ phân loại hiển thị chuẩn xác (Không có [object Object], undefined, NaN đ).")

        page.screenshot(path='tests/evidence/owner_variant_cards_fixed_390.png')
        print("-> Đã lưu ảnh danh sách phân loại: tests/evidence/owner_variant_cards_fixed_390.png")

        # Click on candidate 1: 'Be / M'
        print("6. Bấm chọn phân loại: 'Be / M'...")
        cand_btn = page.locator('.ai-candidate-row').nth(1) # Be / M
        cand_btn.click()
        page.wait_for_timeout(1200)

        # Inspect message history and proposals
        result_data = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const proposalCard = document.querySelector('.ai-proposal-card');
            return {
                lastMsgs: msgs.slice(-3),
                hasProposal: Boolean(proposalCard),
                proposalText: proposalCard ? proposalCard.innerText : null
            };
        }''')

        print("-> Kết quả phản hồi sau khi chọn phân loại:")
        for m in result_data['lastMsgs']:
            print(f"   Msg: {m.replace(chr(10), ' ')}")

        # Verify it did NOT fall back to 'Kiểm tồn'
        last_msgs_text = " ".join(result_data['lastMsgs'])
        assert 'Kiểm tồn' not in last_msgs_text, "LỖI: Vẫn bị rơi vào 'Kiểm tồn' thay vì tạo phiếu nhập hàng!"
        assert result_data['hasProposal'], "LỖI: Chưa render Structured Proposal card!"
        print("-> PASS: Không bị rơi vào 'Kiểm tồn'!")
        print(f"-> PASS: Proposal Card hiển thị:\n{result_data['proposalText']}")

        # Verify proposal content mentions 5 pieces and variant
        prop_text = result_data['proposalText'] or ''
        assert '5' in prop_text, "LỖI: Không tìm thấy số lượng 5 trong đề xuất nhập!"
        assert 'Váy Linen' in prop_text, "LỖI: Không tìm thấy tên sản phẩm trong đề xuất nhập!"
        assert 'Be / M' in prop_text, "LỖI: Không tìm thấy phân loại Be / M trong đề xuất nhập!"

        # Chụp ảnh bằng chứng
        screenshot_path = 'tests/evidence/owner_variant_receipt_fixed_390.png'
        page.screenshot(path=screenshot_path)
        print(f"-> Đã lưu ảnh bằng chứng: {screenshot_path}")

        # 7. Test Approval: Click 'Duyệt' on proposal card
        print("7. Bấm 'Duyệt' phiếu đề xuất nhập kho...")
        approve_btn = page.locator('.ai-proposal-card [data-confirm-proposal]').first
        if approve_btn.count() > 0:
            approve_btn.click()
            page.wait_for_timeout(1000)
            execute_btn = page.locator('.ai-proposal-card [data-execute-proposal]').first
            if execute_btn.count() > 0:
                execute_btn.click()
                page.wait_for_timeout(1000)
            
            post_exec_msgs = page.evaluate('''() => {
                const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
                return msgs.slice(-2);
            }''')
            print("-> Phản hồi sau khi duyệt đề xuất:")
            for m in post_exec_msgs:
                print(f"   Msg: {m.replace(chr(10), ' ')}")

        page.screenshot(path='tests/evidence/owner_variant_receipt_approved_390.png')
        print("-> Đã lưu ảnh sau duyệt: tests/evidence/owner_variant_receipt_approved_390.png")
        print("\n=== HOÀN TẤT KIỂM THỬ: TẤT CẢ ACCEPTANCE CRITERIA ĐỀU ĐẠT (PASS) ===")
        browser.close()

if __name__ == '__main__':
    run_test()
