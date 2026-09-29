import time
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def test_mobile_pos_stock():
    with sync_playwright() as p:
        # iPhone 13/14 viewport (390 x 844)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
        )
        page = context.new_page()
        page.goto('http://localhost:4180/')
        page.wait_for_timeout(2000)

        # 1. Close entry overlay if present or open demo
        entry_overlay = page.locator('#publicEntryOverlay')
        if entry_overlay.is_visible():
            print("Closing entry overlay via 'Xem shop demo' or close button...")
            btn_demo = page.locator('[data-action="preview-demo"]').first
            if btn_demo.is_visible():
                btn_demo.click()
                page.wait_for_timeout(1500)
            else:
                page.evaluate("() => { if (window.__qbiz_app__) window.__qbiz_app__.state._bypassEntryOverlay = true; window.__qbiz_app__.render(); }")
                page.wait_for_timeout(500)

        # 2. Navigate to POS / Bán hàng
        page.evaluate("() => { window.__qbiz_app__.state.page = 'sales'; window.__qbiz_app__.state.saleStep = 'browse'; window.__qbiz_app__.render(); }")
        page.wait_for_timeout(1000)

        # 3. Capture screenshot
        screenshot_path = 'tests/evidence/mobile_pos_generous_stock.png'
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to: {screenshot_path}")

        # 4. Extract all product cards rendered in POS grid
        tiles = page.evaluate('''() => {
            const articles = document.querySelectorAll('.pos-product');
            return Array.from(articles).map(art => {
                const title = art.querySelector('.pos-prod-title')?.textContent?.trim() || '';
                const sku = art.querySelector('.pos-prod-sku')?.textContent?.trim() || '';
                const price = art.querySelector('.pos-prod-price')?.textContent?.trim() || '';
                const badge = art.querySelector('.pos-stock-badge')?.textContent?.trim() || '';
                const isOutOfStock = badge.includes('Hết hàng');
                return { title, sku, price, badge, isOutOfStock };
            });
        }''')

        print(f"\nTotal product tiles rendered in POS: {len(tiles)}")
        out_of_stock_count = 0
        in_stock_count = 0
        service_count = 0

        for t in tiles:
            status_indicator = "🔴 HẾT HÀNG" if t['isOutOfStock'] else ("🔵 DỊCH VỤ" if 'Dịch vụ' in t['badge'] else "🟢 CÒN HÀNG")
            print(f" - {t['title']} ({t['sku']}): {t['price']} | Badge: '{t['badge']}' | {status_indicator}")
            if t['isOutOfStock']:
                out_of_stock_count += 1
            elif 'Dịch vụ' in t['badge']:
                service_count += 1
            else:
                in_stock_count += 1

        print(f"\nSummary:")
        print(f" - Còn hàng (in-stock): {in_stock_count}")
        print(f" - Hết hàng (out-of-stock): {out_of_stock_count}")
        print(f" - Dịch vụ: {service_count}")

        # Invariants:
        assert out_of_stock_count <= 2, f"Expected at most 2 out-of-stock items, got {out_of_stock_count}"
        assert in_stock_count >= 5, f"Expected at least 5 in-stock items with generous stock, got {in_stock_count}"
        print("\n✓ TEST PASS: Shop mẫu có tồn kho dồi dào, chỉ có tối đa 1-2 mặt hàng hết hàng đúng như yêu cầu!")

        browser.close()

if __name__ == '__main__':
    test_mobile_pos_stock()
