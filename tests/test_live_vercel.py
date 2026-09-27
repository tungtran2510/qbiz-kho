import sys, time
from playwright.sync_api import sync_playwright

def test_vercel_live():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        
        print("Navigating to https://qbiz-kho.vercel.app ...")
        page.goto("https://qbiz-kho.vercel.app", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)
        
        title = page.title()
        print("Page title:", title)
        
        script_src = page.evaluate("() => document.querySelector('script[type=\"module\"]')?.getAttribute('src') || ''")
        print("Script src on live Vercel:", script_src)
        
        css_href = page.evaluate("() => document.querySelector('link[rel=\"stylesheet\"]')?.getAttribute('href') || ''")
        print("CSS href on live Vercel:", css_href)
        
        # Dismiss landing overlay if present
        retail_btn = page.locator('button[data-industry="retail"]')
        if retail_btn.count() > 0 and retail_btn.first.is_visible():
            print("Dismissing landing with Retail button...")
            retail_btn.first.click()
            time.sleep(1)
        elif page.locator('[data-action="preview-demo"]').count() > 0:
            page.locator('[data-action="preview-demo"]').first.click()
            time.sleep(1)
            
        # Navigate to Sales / POS
        page.click('.mobile-nav button[data-page="sales"]')
        time.sleep(1)
        
        # Add a product to cart (click first product tile)
        first_prod = page.locator('.pos-product button.pos-product-main').first
        if first_prod.count() > 0:
            first_prod.click()
            time.sleep(0.5)
            
        # Open cart
        cart_bar = page.locator('.pos-cart-bar button[data-sale-step="cart"]')
        if cart_bar.count() > 0:
            cart_bar.first.click()
            time.sleep(1)
            
        disc_input = page.locator('#saleDiscount')
        print("Discount input #saleDiscount visible:", disc_input.is_visible())
        
        mode_btns = page.locator('.discount-mode')
        btn_texts = [mode_btns.nth(i).inner_text().strip() for i in range(mode_btns.count())]
        print(f"Discount mode buttons count: {len(btn_texts)}")
        
        # Select customer
        cust_select = page.locator('#saleCustomer')
        if cust_select.count() > 0:
            cust_select.select_option(index=1)
            time.sleep(0.5)
            
        page.screenshot(path="tests/evidence/evidence_live_vercel_cart_discount.png")
        print("Captured tests/evidence/evidence_live_vercel_cart_discount.png")
        
        # Click Proceed to checkout
        checkout_btn = page.locator('button[data-sale-step="checkout"]')
        if checkout_btn.count() > 0:
            checkout_btn.click()
            time.sleep(1)
            chk_disc = page.locator('#checkoutDiscount')
            print("Checkout discount input visible:", chk_disc.is_visible())
            page.screenshot(path="tests/evidence/evidence_live_vercel_checkout_discount.png")
            print("Captured tests/evidence/evidence_live_vercel_checkout_discount.png")
            
        browser.close()

if __name__ == "__main__":
    test_vercel_live()
