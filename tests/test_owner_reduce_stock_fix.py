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

        print("1. Truy cập http://localhost:4180/...")
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')

        print("2. Chuyển sang Showroom Thời trang (Fashion)...")
        page.evaluate('() => window.__qbiz_app__.previewDemo("fashion")')
        page.wait_for_timeout(600)

        # =====================================================================
        # TEST CASE 1: Lỗi thực tế của Chủ Shop trên ảnh (Quần Jean Ống Loe)
        # =====================================================================
        print("\n=== TEST CASE 1: QUẦN JEAN ỐNG LOE - 'giảm kho cái này đi hai cái' ===")
        print("3. Mở chi tiết sản phẩm Quần Jean Ống Loe Co Giãn 4 Chiều (p_fs_jean_flare)...")
        page.evaluate('() => window.__qbiz_app__.openProduct("p_fs_jean_flare")')
        page.wait_for_timeout(600)

        print("4. Mở AI Assistant Sheet (#qbizAiTrigger)...")
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(400)

        print("5. Nhập câu lệnh chính xác của Chủ shop: 'giảm kho cái này đi hai cái'...")
        page.fill('#aiTextInput', 'giảm kho cái này đi hai cái')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        # Inspect AI messages
        res1 = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            const proposalCard = document.querySelector('.ai-proposal-card');
            return {
                lastMsg: msgs[msgs.length - 1],
                allMsgs: msgs,
                hasProposal: Boolean(proposalCard),
                proposalText: proposalCard ? proposalCard.innerText : null
            };
        }''')

        print(f"-> Phản hồi AI:\n{res1['lastMsg']}")

        # Assert NO generic fallback
        assert 'Tôi có thể hỗ trợ bạn:' not in res1['lastMsg'], "LỖI: Vẫn bị rơi vào câu trả lời chung 'Tôi có thể hỗ trợ bạn:'!"
        assert res1['hasProposal'], "LỖI: Chưa tạo được Proposal Card đề xuất xuất kho!"

        prop_text = res1['proposalText'] or ''
        print(f"\n-> Proposal Card Text:\n{prop_text}")
        assert 'Quần Jean Ống Loe' in prop_text, "LỖI: Proposal không chứa tên sản phẩm Quần Jean Ống Loe!"
        assert '2' in prop_text, "LỖI: Proposal không chứa số lượng 2 chiếc!"
        assert ('Xuất kho' in prop_text or 'Giảm' in prop_text), "LỖI: Proposal không phải là loại Xuất kho / Giảm tồn!"

        # Chụp ảnh bằng chứng
        screenshot1 = 'tests/evidence/owner_reduce_stock_proposal_fixed_390.png'
        page.screenshot(path=screenshot1)
        print(f"-> PASS: Đã lưu ảnh bằng chứng: {screenshot1}")

        # Duyệt phiếu đề xuất xuất kho
        print("6. Bấm duyệt phiếu đề xuất xuất kho...")
        approve_btn = page.locator('.ai-proposal-card [data-confirm-proposal]').first
        if approve_btn.count() > 0:
            approve_btn.click()
            page.wait_for_timeout(800)
            exec_btn = page.locator('.ai-proposal-card [data-execute-proposal]').first
            if exec_btn.count() > 0:
                exec_btn.click()
                page.wait_for_timeout(1000)

        # Verify stock decreased in local DB
        post_stock = page.evaluate('''() => {
            const prod = window.__qbiz_app__.state.data.products.find(p => p.id === 'p_fs_jean_flare');
            const total = window.__qbiz_app__.state.warehouse === 'all'
                ? (window.__qbiz_app__.state.data.levels || []).filter(l => l.productId === 'p_fs_jean_flare').reduce((s, l) => s + l.onHand, 0)
                : 0;
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            return {
                totalOnHand: total,
                lastMsg: msgs[msgs.length - 1]
            };
        }''')
        print(f"-> Tồn kho thực tế sau khi giảm 2 cái: {post_stock['totalOnHand']} (ban đầu là 24 -> 22)")
        print(f"-> Thông báo sau duyệt: {post_stock['lastMsg']}")
        assert post_stock['totalOnHand'] == 22, f"Expected onHand 22, got {post_stock['totalOnHand']}"
        print("-> PASS: Tồn kho đã giảm chuẩn xác từ 24 xuống 22 chiếc!")

        screenshot2 = 'tests/evidence/owner_reduce_stock_approved_390.png'
        page.screenshot(path=screenshot2)
        print(f"-> PASS: Đã lưu ảnh sau duyệt: {screenshot2}")

        # =====================================================================
        # TEST CASE 2: Sản phẩm có phân loại (Váy Linen)
        # =====================================================================
        print("\n=== TEST CASE 2: SẢN PHẨM CÓ PHÂN LOẠI (VÁY LINEN) ===")
        page.evaluate('() => window.__qbiz_app__.openProduct("p_fs_dress_linen")')
        page.wait_for_timeout(500)

        print("7. Nhập lệnh: 'giảm kho cái này đi 1 cái'...")
        page.fill('#aiTextInput', 'giảm kho cái này đi 1 cái')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        # Check candidate cards
        res2 = page.evaluate('''() => {
            const list = document.querySelectorAll('.ai-candidate-row');
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            return {
                lastMsg: msgs[msgs.length - 1],
                candCount: list.length,
                cands: Array.from(list).map(b => b.innerText)
            };
        }''')

        print(f"-> Tìm thấy {res2['candCount']} phân loại cho Váy Linen:")
        for c in res2['cands']:
            print(f"   * {c.replace(chr(10), ' · ')}")
        assert res2['candCount'] == 3, f"Expected 3 variants, got {res2['candCount']}"

        # Bấm chọn phân loại Be / S
        print("8. Bấm chọn phân loại 'Be / S'...")
        page.locator('.ai-candidate-row').first.click()
        page.wait_for_timeout(1200)

        res2_post = page.evaluate('''() => {
            const cards = document.querySelectorAll('.ai-proposal-card');
            const proposalCard = cards.length > 0 ? cards[cards.length - 1] : null;
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => m.innerText);
            return {
                lastMsg: msgs[msgs.length - 1],
                hasProposal: Boolean(proposalCard),
                propText: proposalCard ? proposalCard.innerText : null
            };
        }''')

        print(f"-> Đề xuất tạo ra cho phân loại Be / S:\n{res2_post['propText']}")
        assert res2_post['hasProposal'], "LỖI: Chưa tạo được Proposal cho phân loại Be / S!"
        assert 'Be / S' in res2_post['propText'], "LỖI: Proposal không chứa tên phân loại Be / S!"

        screenshot3 = 'tests/evidence/owner_variant_reduce_stock_fixed_390.png'
        page.screenshot(path=screenshot3)
        print(f"-> PASS: Đã lưu ảnh: {screenshot3}")

        # =====================================================================
        # TEST CASE 3: Các từ đồng nghĩa khác (bớt 2 cái, xuất kho 3 cái, trừ kho 1 cái)
        # =====================================================================
        print("\n=== TEST CASE 3: TỪ ĐỒNG NGHĨA KHO / GIẢM / XUẤT / TRỪ / BỚT ===")
        synonym_queries = [
            'bớt đi hai cái',
            'xuất kho 3 cái này',
            'trừ kho 1 cái',
            'giảm tồn 2 cái'
        ]
        for q in synonym_queries:
            r = page.evaluate(f'''async () => {{
                const router = await import('./src/ai/router.js');
                const state = window.__qbiz_app__.state;
                const context = {{
                    current_route: 'products',
                    current_product_id: 'p_fs_jean_flare',
                    actor_role: 'owner',
                    actor_id: 'usr_owner'
                }};
                return await router.routeIntent('{q}', context, state);
            }}''')
            print(f"   [Query]: '{q}' -> Intent: {r.get('intent')}, HasProposal: {bool(r.get('proposal'))}")
            assert r.get('intent') == 'ISSUE_STOCK', f"Query '{q}' failed intent check, got {r.get('intent')}"
            assert r.get('proposal'), f"Query '{q}' did not create proposal"

        print("\n=== TOÀN BỘ 3 TEST CASES ĐỀU ĐẠT CHUẨN XÁC 100% (PASS) ===")
        browser.close()

if __name__ == '__main__':
    run_test()
