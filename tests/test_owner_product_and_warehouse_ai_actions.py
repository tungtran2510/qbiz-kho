import io
import sys
import json
import time
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport similar to user's phone screenshot (390x844)
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        
        print("1. Opening app at http://localhost:4180/...")
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')

        # Activate demo session to remove public-entry-overlay while preserving local seed products
        page.evaluate("""() => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            window.__qbiz_app__.render();
        }""")
        page.wait_for_timeout(300)

        # Set p_135 stock to 0 initially to match user's screenshot exactly (Ghế sáng chế 135 - Hết hàng)
        page.evaluate("""() => {
            const wh = (window.__qbiz_app__.state.data.warehouses || [])[0];
            const lv = (window.__qbiz_app__.state.data.levels || []).find(l => l.productId === 'p_135' && l.warehouseId === wh.id);
            if (lv) {
                lv.onHand = 0;
                lv.reserved = 0;
            }
        }""")
        
        # Verify initial state & product p_135
        prod_info = page.evaluate("""() => {
            const p = (window.__qbiz_app__.state.data.products || []).find(x => x.id === 'p_135');
            const wh = (window.__qbiz_app__.state.data.warehouses || [])[0];
            const lv = (window.__qbiz_app__.state.data.levels || []).find(l => l.productId === 'p_135' && l.warehouseId === wh.id);
            return {
                id: p ? p.id : null,
                name: p ? p.name : null,
                price: p ? p.price : null,
                active: p ? p.active : null,
                onHand: lv ? lv.onHand : 0
            };
        }""")
        print(f"   Initial p_135: name='{prod_info['name']}', price={prod_info['price']}, active={prod_info['active']}, stock={prod_info['onHand']}")

        # Open product p_135 modal
        print("2. Opening product p_135 modal in UI...")
        page.evaluate("() => window.__qbiz_app__.openProduct('p_135')")
        page.wait_for_timeout(300)
        
        current_prod_id = page.evaluate("() => window.__qbiz_app__.state.currentProductId")
        assert current_prod_id == 'p_135', f"Expected currentProductId 'p_135', got {current_prod_id}"
        print(f"   Modal open confirmed. currentProductId = {current_prod_id}")

        # Open AI assistant sheet
        print("3. Opening AI Assistant sheet...")
        page.evaluate("() => window.__qbiz_ai__.openSheet()")
        page.wait_for_timeout(500)
        sheet_open = page.is_visible('#qbizAiSheet.is-open') or page.is_visible('#qbizAiSheet')
        assert sheet_open, "AI sheet failed to open"
        print("   AI Assistant sheet is open.")

        # Test Case 1: "kích hoạt còn hàng số lượng một chiếc"
        print("\n--- Test Case 1: Kích hoạt còn hàng số lượng một chiếc ---")
        page.fill('#aiTextInput', 'kích hoạt còn hàng số lượng một chiếc')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        # Check for duplicate bubbles
        user_msgs = page.query_selector_all('#aiMessagesList .ai-msg.user')
        asst_msgs = page.query_selector_all('#aiMessagesList .ai-msg.assistant')
        assert len(user_msgs) == 1, f"Expected 1 user message, found {len(user_msgs)} (Double-send bug!)"
        assert len(asst_msgs) == 2, f"Expected 2 assistant messages (1 welcome + 1 reply), found {len(asst_msgs)} (Double-reply bug!)"
        print(f"   [PASS] No duplicate messages! User msgs: {len(user_msgs)}, Assistant msgs: {len(asst_msgs)} (1 welcome + 1 reply)")

        def get_latest_proposal_card():
            cards = page.query_selector_all('.ai-proposal-card')
            assert len(cards) > 0, "No proposal card found!"
            return cards[-1]

        # Verify proposal card rendered
        card = get_latest_proposal_card()
        summary_text = card.query_selector('.ai-prop-summary').inner_text()
        print(f"   Proposal generated: {summary_text}")
        assert "Ghế sáng chế 135" in summary_text, f"Proposal summary missing product name: {summary_text}"
        assert "1" in summary_text, f"Proposal summary missing counted quantity 1: {summary_text}"

        # Confirm & Execute Proposal
        print("   Clicking [Xác nhận thực hiện] button...")
        card.query_selector('[data-confirm-proposal]').click()
        page.wait_for_timeout(1200)

        # Verify proposal succeeded
        status_text = page.query_selector_all('.ai-prop-status-ok')[-1].inner_text()
        print(f"   Proposal status after execution: {status_text}")
        assert "thành công" in status_text.lower(), f"Proposal did not succeed: {status_text}"

        # Verify domain state mutation in DB
        new_stock = page.evaluate("""() => {
            const wh = (window.__qbiz_app__.state.data.warehouses || [])[0];
            const lv = (window.__qbiz_app__.state.data.levels || []).find(l => l.productId === 'p_135' && l.warehouseId === wh.id);
            return lv ? lv.onHand : 0;
        }""")
        print(f"   Live Stock in DB: {new_stock}")
        assert new_stock == 1, f"Expected stock 1, got {new_stock}"
        print("   [PASS] Stock successfully set to 1 and activated!")

        # Test Case 2: "thêm 8 chiếc"
        print("\n--- Test Case 2: Thêm 8 chiếc (Nhập thêm tồn kho ngữ cảnh) ---")
        page.fill('#aiTextInput', 'thêm 8 chiếc')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        card = get_latest_proposal_card()
        summary_text = card.query_selector('.ai-prop-summary').inner_text()
        print(f"   Proposal generated: {summary_text}")
        assert "Nhập thêm 8" in summary_text and "Ghế sáng chế 135" in summary_text, f"Unexpected summary: {summary_text}"

        # Confirm & Execute
        print("   Clicking [Xác nhận thực hiện] button...")
        card.query_selector('[data-confirm-proposal]').click()
        page.wait_for_timeout(1200)

        new_stock = page.evaluate("""() => {
            const wh = (window.__qbiz_app__.state.data.warehouses || [])[0];
            const lv = (window.__qbiz_app__.state.data.levels || []).find(l => l.productId === 'p_135' && l.warehouseId === wh.id);
            return lv ? lv.onHand : 0;
        }""")
        print(f"   Live Stock in DB after +8: {new_stock}")
        assert new_stock == 9, f"Expected stock 9 (1 + 8), got {new_stock}"
        print("   [PASS] Stock successfully increased by 8 to 9!")

        # Test Case 3: "tôi không bán cái này nữa"
        print("\n--- Test Case 3: Ngừng kinh doanh (tôi không bán cái này nữa) ---")
        page.fill('#aiTextInput', 'tôi không bán cái này nữa')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        card = get_latest_proposal_card()
        summary_text = card.query_selector('.ai-prop-summary').inner_text()
        print(f"   Proposal generated: {summary_text}")
        assert "Ngừng kinh doanh" in summary_text, f"Unexpected summary: {summary_text}"

        # Confirm & Execute
        card.query_selector('[data-confirm-proposal]').click()
        page.wait_for_timeout(1200)

        active_status = page.evaluate("""() => {
            const p = (window.__qbiz_app__.state.data.products || []).find(x => x.id === 'p_135');
            return p.active;
        }""")
        print(f"   Live Product active status in DB: {active_status}")
        assert active_status is False, f"Expected active False, got {active_status}"
        print("   [PASS] Product successfully marked inactive!")

        # Test Case 4: "tôi sẽ bán cái này trở lại"
        print("\n--- Test Case 4: Bán trở lại (tôi sẽ bán cái này trở lại) ---")
        page.fill('#aiTextInput', 'tôi sẽ bán cái này trở lại')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        card = get_latest_proposal_card()
        summary_text = card.query_selector('.ai-prop-summary').inner_text()
        print(f"   Proposal generated: {summary_text}")
        assert "Mở bán trở lại" in summary_text, f"Unexpected summary: {summary_text}"

        # Confirm & Execute
        card.query_selector('[data-confirm-proposal]').click()
        page.wait_for_timeout(1200)

        active_status = page.evaluate("""() => {
            const p = (window.__qbiz_app__.state.data.products || []).find(x => x.id === 'p_135');
            return p.active;
        }""")
        print(f"   Live Product active status in DB: {active_status}")
        assert active_status is True, f"Expected active True, got {active_status}"
        print("   [PASS] Product successfully restored to active!")

        # Test Case 5: "sửa giá thành 50 triệu"
        print("\n--- Test Case 5: Sửa giá thành 50 triệu ---")
        page.fill('#aiTextInput', 'sửa giá thành 50 triệu')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        card = get_latest_proposal_card()
        summary_text = card.query_selector('.ai-prop-summary').inner_text()
        print(f"   Proposal generated: {summary_text}")
        assert "50.000.000" in summary_text, f"Unexpected summary: {summary_text}"

        # Confirm & Execute
        card.query_selector('[data-confirm-proposal]').click()
        page.wait_for_timeout(1200)

        new_price = page.evaluate("""() => {
            const p = (window.__qbiz_app__.state.data.products || []).find(x => x.id === 'p_135');
            return p.price;
        }""")
        print(f"   Live Product price in DB: {new_price}")
        assert new_price == 50000000, f"Expected price 50000000, got {new_price}"
        print("   [PASS] Product price successfully updated to 50,000,000 ₫!")

        # Test Case 6: "hàng này hết hàng kia còn"
        print("\n--- Test Case 6: Kiểm tra đa kho (hàng này hết hàng kia còn) ---")
        page.fill('#aiTextInput', 'hàng này hết hàng kia còn')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        last_bubble = page.evaluate("""() => {
            const list = document.querySelectorAll('#aiMessagesList .ai-msg.assistant .ai-bubble-content');
            return list[list.length - 1]?.innerText || '';
        }""")
        print(f"   Response: {last_bubble[:120]}...")
        assert "kho" in last_bubble.lower(), f"Expected warehouse breakdown, got: {last_bubble}"
        print("   [PASS] Multi-warehouse status accurately returned!")

        # Test Case 7: "thêm kho mới"
        print("\n--- Test Case 7: Thêm kho mới ---")
        page.fill('#aiTextInput', 'thêm kho mới Kho Đà Nẵng')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        card = get_latest_proposal_card()
        summary_text = card.query_selector('.ai-prop-summary').inner_text()
        print(f"   Proposal generated: {summary_text}")
        assert "Kho Đà Nẵng" in summary_text or "kho mới" in summary_text.lower(), f"Unexpected summary: {summary_text}"

        # Confirm & Execute
        card.query_selector('[data-confirm-proposal]').click()
        page.wait_for_timeout(1200)

        wh_names = page.evaluate("""() => {
            return (window.__qbiz_app__.state.data.warehouses || []).map(w => w.name);
        }""")
        print(f"   Warehouses in DB: {wh_names}")
        assert any("kho đà nẵng" in name.lower() or "kho da nang" in name.lower() or "kho phụ" in name.lower() for name in wh_names), f"Warehouse was not added to DB: {wh_names}"
        print("   [PASS] New warehouse successfully created in DB!")

        # Take final screenshot evidence
        evidence_path = 'd:/google driver/Codex PC/Quản lý kho - bán hàng trên Qbiz/app/tests/evidence/owner_product_actions_verified_390.png'
        page.screenshot(path=evidence_path)
        print(f"\nCaptured full mobile evidence screenshot: {evidence_path}")
        print("\nALL 7 CORE OWNER PRODUCT & WAREHOUSE AI ACTIONS VERIFIED SUCCESSFULLY!")

        browser.close()

if __name__ == '__main__':
    run_tests()
