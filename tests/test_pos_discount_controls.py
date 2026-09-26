import os
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def test_pos_discount():
    os.makedirs('tests/evidence', exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # 1. MOBILE 390x844 TEST
        print("--- Testing POS Discount on Mobile (390x844) ---")
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        
        page.goto('http://localhost:4180/')
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        
        # Dismiss landing overlay if present
        retail_btn = page.locator('button[data-industry="retail"]')
        if retail_btn.count() > 0:
            retail_btn.click()
            time.sleep(1)
        elif page.locator('[data-action="preview-demo"]').count() > 0:
            page.locator('[data-action="preview-demo"]').click()
            time.sleep(1)
            
        # Navigate to Sales / POS
        page.click('.mobile-nav button[data-page="sales"]')
        time.sleep(1)
        
        # Add a product to cart (e.g. click first product tile)
        first_prod = page.locator('.pos-product button.pos-product-main').first
        first_prod.click()
        time.sleep(0.5)
        
        # Open cart bar
        cart_bar = page.locator('.pos-cart-bar button[data-sale-step="cart"]')
        cart_bar.first.click()
        time.sleep(1)
        
        # Open customer picker and select Anh Hoàng Minh (VIP) who has 5% discount
        page.locator('.customer-chip').click()
        time.sleep(0.5)
        vip_cust = page.locator('button.customer-row:has-text("Anh Hoàng Minh")')
        if vip_cust.count() > 0:
            vip_cust.click()
            time.sleep(1)
        else:
            page.locator('.modal-close').click()
            time.sleep(0.5)
            
        # Re-ensure we are on Cart
        page.evaluate("() => { window.__qbiz_app__.state.saleStep = 'cart'; window.__qbiz_app__.render(); }")
        time.sleep(0.5)
        
        # 1. Check Customer Discount Hint & Apply button
        hint_banner = page.locator('.customer-discount-hint')
        assert hint_banner.count() == 1, "Expected customer-discount-hint banner to be visible"
        print(f"Customer discount hint text: {hint_banner.inner_text()}")
        
        apply_btn = page.locator('[data-apply-customer-discount]')
        assert apply_btn.count() == 1, "Expected 'Áp dụng ngay' button inside customer-discount-hint"
        
        # 2. Check Order Discount Box on Cart
        discount_box = page.locator('.pos-flow .discount-box')
        assert discount_box.count() >= 1, "Expected .discount-box to be visible in cart"
        
        sale_discount_input = page.locator('#saleDiscount')
        btn_amount = page.locator('.pos-flow .discount-mode[data-discount-mode="amount"]')
        btn_percent = page.locator('.pos-flow .discount-mode[data-discount-mode="percent"]')
        
        assert sale_discount_input.is_visible(), "Expected #saleDiscount input to be visible"
        assert btn_amount.is_visible(), "Expected ₫ button to be visible"
        assert btn_percent.is_visible(), "Expected % button to be visible"
        
        # Click Apply 5% discount from hint
        print("Clicking 'Áp dụng ngay' 5%...")
        apply_btn.click()
        time.sleep(0.5)
        
        # Verify 5% is applied
        discount_val = page.locator('#saleDiscount').input_value()
        is_pct_active = 'active' in btn_percent.first.get_attribute('class')
        print(f"Discount input value: {discount_val}, % button active: {is_pct_active}")
        assert discount_val == '5', f"Expected discount value 5, got {discount_val}"
        assert is_pct_active, "Expected % button to be active after applying 5%"
        
        # Capture screenshot of Cart with discount applied
        page.screenshot(path='tests/evidence/evidence_cart_discount_applied_390.png')
        print("Captured tests/evidence/evidence_cart_discount_applied_390.png")
        
        # 3. Check Line Discount editor (item discount)
        line_disc_trigger = page.locator('.line-discount-trigger').first
        line_disc_trigger.click()
        time.sleep(0.5)
        
        line_editor = page.locator('.line-discount-editor')
        assert line_editor.count() == 1, "Expected .line-discount-editor to open"
        line_btn_amount = line_editor.locator('[data-line-discount-mode="amount"]')
        line_btn_percent = line_editor.locator('[data-line-discount-mode="percent"]')
        assert line_btn_amount.count() == 1, "Expected line discount ₫ button"
        assert line_btn_percent.count() == 1, "Expected line discount % button"
        
        # Toggle line discount to %
        line_btn_percent.click()
        time.sleep(0.5)
        assert 'active' in line_btn_percent.get_attribute('class'), "Expected line discount % button to be active"
        print("Line discount % button toggle verified.")
        
        # 4. Proceed to Checkout screen
        page.locator('button[data-sale-step="checkout"]').click()
        time.sleep(1)
        
        # Check that we are on Checkout screen
        checkout_box = page.locator('.checkout-discount-card')
        assert checkout_box.count() == 1, "Expected .checkout-discount-card to be visible on Checkout screen"
        
        checkout_discount_input = page.locator('#checkoutDiscount')
        chk_btn_amount = checkout_box.locator('[data-discount-mode="amount"]')
        chk_btn_percent = checkout_box.locator('[data-discount-mode="percent"]')
        
        assert checkout_discount_input.is_visible(), "Expected #checkoutDiscount on checkout screen"
        assert chk_btn_amount.is_visible(), "Expected ₫ button on checkout screen"
        assert chk_btn_percent.is_visible(), "Expected % button on checkout screen"
        assert 'active' in chk_btn_percent.get_attribute('class'), "Expected % mode to remain active on checkout"
        print(f"Checkout discount value: {checkout_discount_input.input_value()}")
        
        # Capture screenshot of Checkout with discount controls visible
        page.screenshot(path='tests/evidence/evidence_checkout_discount_visible_390.png')
        print("Captured tests/evidence/evidence_checkout_discount_visible_390.png")
        
        # Test changing discount on Checkout to ₫ mode with 20.000 VND
        chk_btn_amount.click()
        time.sleep(0.5)
        checkout_discount_input.fill('20000')
        time.sleep(0.5)
        
        # Complete checkout
        print("Clicking 'Hoàn tất thanh toán'...")
        page.locator('button[data-sale-pay]').click()
        time.sleep(1)
        
        # Verify success screen
        success_msg = page.locator('.pos-success')
        assert success_msg.count() == 1, "Expected pos-success screen after checkout"
        print("Checkout completed successfully with discount!")
        
        page.screenshot(path='tests/evidence/evidence_sale_success_with_discount_390.png')
        print("Captured tests/evidence/evidence_sale_success_with_discount_390.png")
        
        context.close()
        browser.close()
        print("\nALL POS DISCOUNT TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    test_pos_discount()
