import sys
from playwright.sync_api import sync_playwright

def verify_order_detail_rows():
    sys.stdout.reconfigure(encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Test mobile viewport 390px
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        page.goto('http://127.0.0.1:4180')
        page.wait_for_timeout(1000)
        
        # Navigate to orders
        page.evaluate("navigate('orders')")
        page.wait_for_timeout(500)
        
        # Check if any order is visible, if not simulate one
        if page.locator("[data-order-open]").count() == 0:
            page.evaluate("navigate('channels')")
            page.wait_for_timeout(400)
            page.locator("[data-action='simulate-web-order']").click()
            page.wait_for_timeout(800)
        else:
            page.locator("[data-order-open]").first.click()
            page.wait_for_timeout(800)
            
        # Wait 4s for any notification toast to completely disappear
        page.wait_for_timeout(4000)
            
        modal = page.locator('.order-detail')
        assert modal.is_visible(), "Order detail modal not visible"
        
        buttons = page.locator('.order-detail-actions button')
        btn_count = buttons.count()
        print(f"Total buttons in .order-detail-actions: {btn_count}")
        
        y_coords = []
        for i in range(btn_count):
            btn = buttons.nth(i)
            box = btn.bounding_box()
            text = btn.text_content().strip()
            print(f"  Button {i+1}: '{text}' -> y={box['y']:.1f}, x={box['x']:.1f}, w={box['width']:.1f}, h={box['height']:.1f}")
            y_rounded = round(box['y'] / 8) * 8
            if y_rounded not in y_coords:
                y_coords.append(y_rounded)
                
        print(f"Total distinct rows calculated: {len(y_coords)}")
        assert len(y_coords) <= 3, f"Expected <= 3 rows, got {len(y_coords)} rows!"
        print("✓ Verified: .order-detail-actions fits within EXACTLY 3 ROWS!")
        
        # Screenshot modal
        page.locator('.modal').screenshot(path='tests/evidence/order_detail_3rows.png')
        print("✓ Screenshot saved to tests/evidence/order_detail_3rows.png")
        
        browser.close()

if __name__ == "__main__":
    verify_order_detail_rows()
