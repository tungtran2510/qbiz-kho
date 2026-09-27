import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

def test_kiem_ton():
    with sync_playwright() as p:
        # Test 1: Desktop
        print("--- Testing Desktop ---")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.goto('http://localhost:4180')
        page.wait_for_timeout(1000)

        # Enter demo
        page.evaluate('''async () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            const { loadDemoIndustry } = await import('./src/demo-showroom.js');
            await loadDemoIndustry('retail');
            await window.__qbiz_app__.refresh();
            window.__qbiz_app__.navigate('dashboard');
        }''')
        page.wait_for_timeout(1000)

        # Find and click "Kiểm tồn" quick tile
        count_btn = page.locator('button.quick-tile[data-kind="count"]')
        assert count_btn.count() > 0, "Kiểm tồn button not found on desktop"
        print("Found Kiểm tồn button on desktop. Clicking...")
        count_btn.click()
        page.wait_for_timeout(500)

        # Check modal open
        modal_head = page.locator('#modalRoot h3')
        assert modal_head.inner_text() == 'Kiểm tồn kho', f"Unexpected modal title: {modal_head.inner_text()}"
        print("Modal opened successfully:", modal_head.inner_text())

        # Check that product suggestions are visible
        prod_btns = page.locator('#stockProductResults [data-stock-product]')
        prod_count = prod_btns.count()
        print(f"Product suggestions rendered: {prod_count} items")
        assert prod_count > 0, "No product suggestions rendered"

        # Click the first product
        first_prod_name = prod_btns.first.locator('strong').inner_text()
        print("Selecting product:", first_prod_name)
        prod_btns.first.click()
        page.wait_for_timeout(300)

        # Check selected product card
        selected_text = page.locator('#selectedStockProduct strong').inner_text()
        assert selected_text == first_prod_name, f"Expected {first_prod_name}, got {selected_text}"
        print("Selected product displayed:", selected_text)

        # Set count quantity to 99
        page.fill('#qty', '99')
        page.wait_for_timeout(200)

        # Click "Lưu dòng này"
        page.click('#addLine')
        page.wait_for_timeout(300)

        # Check line added in line-list
        line_item = page.locator('#lineList .line-item')
        assert line_item.count() == 1, "Line item was not added"
        print("Line added:", line_item.inner_text())

        # Submit stocktake
        page.click('#modalSubmit')
        page.wait_for_timeout(1000)

        # Verify modal closed
        assert page.locator('#modalRoot').inner_text().strip() == '', "Modal did not close after submit"
        print("Stocktake submitted and modal closed cleanly on Desktop!")

        # Verify movement in state
        movement = page.evaluate('''() => {
            const moves = window.__qbiz_app__.state.data.movements || [];
            return moves.filter(m => m.type === 'count').slice(-1)[0] || null;
        }''')
        print("Count movement created:", movement)
        assert movement is not None, "Count movement not found"
        browser.close()

        # Test 2: Mobile (iPhone 14 viewport 390x844)
        print("\n--- Testing Mobile (390x844) ---")
        browser_mobile = p.chromium.launch(headless=True)
        ctx_mobile = browser_mobile.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
        page_mobile = ctx_mobile.new_page()
        page_mobile.goto('http://localhost:4180')
        page_mobile.wait_for_timeout(1000)

        page_mobile.evaluate('''async () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            const { loadDemoIndustry } = await import('./src/demo-showroom.js');
            await loadDemoIndustry('retail');
            await window.__qbiz_app__.refresh();
            window.__qbiz_app__.navigate('dashboard');
        }''')
        page_mobile.wait_for_timeout(1000)

        count_btn_m = page_mobile.locator('button.quick-tile[data-kind="count"]')
        assert count_btn_m.count() > 0, "Kiểm tồn button not found on mobile"
        print("Found Kiểm tồn button on mobile. Clicking...")
        count_btn_m.click()
        page_mobile.wait_for_timeout(500)

        modal_head_m = page_mobile.locator('#modalRoot h3')
        assert modal_head_m.inner_text() == 'Kiểm tồn kho', f"Mobile modal title: {modal_head_m.inner_text()}"
        print("Mobile modal opened successfully:", modal_head_m.inner_text())

        # Test close button
        close_btn = page_mobile.locator('#modalRoot .close-btn')
        close_btn.click()
        page_mobile.wait_for_timeout(300)
        assert page_mobile.locator('#modalRoot').inner_text().strip() == '', "Modal did not close on mobile close button"
        print("Mobile modal closed cleanly on close button!")

        browser_mobile.close()
        print("\nALL KIEM TON TESTS PASSED!")

if __name__ == '__main__':
    test_kiem_ton()
