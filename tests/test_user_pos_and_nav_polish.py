import os
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run_tests():
    os.makedirs('tests/evidence', exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # Test 1: Mobile 390x844 (iPhone 12/13/14 size)
        context_mobile = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context_mobile.new_page()
        
        # Navigate to app on localhost:4180
        page.goto('http://localhost:4180/')
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        
        print("Page loaded successfully.")
        
        # Check if DoctorLoan button exists in landing overlay
        dl_btn = page.locator('button[data-industry="doctorloan"]')
        has_dl_btn = dl_btn.count() > 0
        print(f"DoctorLoan button in landing overlay: {has_dl_btn}")
        
        # Click DoctorLoan industry button
        if has_dl_btn:
            dl_btn.click()
            time.sleep(1)
        else:
            preview_btn = page.locator('[data-action="preview-demo"]')
            if preview_btn.count() > 0:
                preview_btn.click()
                time.sleep(1)
                
        # Check that we are in the app
        page.wait_for_selector('.mobile-nav')
        
        # Go to POS / Bán hàng
        page.click('.mobile-nav button[data-page="sales"]')
        time.sleep(1)
        
        # Verify POS category chips
        chips = page.locator('.pos-chips button')
        chip_count = chips.count()
        print(f"POS Category chips count: {chip_count}")
        chip_texts = [chips.nth(i).inner_text().strip() for i in range(chip_count)]
        print(f"POS Chips text: {chip_texts}")
        
        # Verify chip border-radius is 8px
        chip_radius = chips.first.evaluate('el => getComputedStyle(el).borderRadius')
        chip_height = chips.first.evaluate('el => el.offsetHeight')
        print(f"Chip border-radius: {chip_radius}, height: {chip_height}px")
        assert chip_radius == '8px', f"Expected border-radius 8px, got {chip_radius}"
        
        # Verify Product Card hierarchy
        first_product = page.locator('.pos-product').first
        assert first_product.count() > 0, "No product card found in POS"
        
        title_el = first_product.locator('.pos-prod-title')
        sku_el = first_product.locator('.pos-prod-sku')
        stock_el = first_product.locator('.pos-prod-stock')
        price_el = first_product.locator('.pos-prod-price')
        add_btn = first_product.locator('.pos-add')
        
        print(f"Product Title: {title_el.inner_text().strip()}")
        print(f"Product SKU: {sku_el.inner_text().strip()}")
        print(f"Product Stock: {stock_el.inner_text().strip()}")
        print(f"Product Price: {price_el.inner_text().strip()}")
        
        # Check DOM order of elements in pos-product-main
        dom_order = first_product.locator('.pos-product-main > *').evaluate_all(
            "nodes => nodes.map(n => n.className)"
        )
        print(f"DOM order inside product main: {dom_order}")
        assert 'pos-prod-title' in dom_order[1], f"Expected pos-prod-title at index 1, got {dom_order}"
        assert 'pos-prod-sku' in dom_order[2], f"Expected pos-prod-sku at index 2, got {dom_order}"
        assert 'pos-prod-stock' in dom_order[3], f"Expected pos-prod-stock at index 3, got {dom_order}"
        assert 'pos-prod-price-row' in dom_order[4], f"Expected pos-prod-price-row at index 4, got {dom_order}"
        
        # Verify Navigation Icons
        mobile_nav = page.locator('.mobile-nav')
        kho_btn = mobile_nav.locator('button[data-page="transfers"]')
        more_btn = mobile_nav.locator('button[data-page="more"]')
        sales_btn = mobile_nav.locator('button[data-page="sales"]')
        
        # Check warehouse icon SVG
        kho_svg = kho_btn.locator('svg').inner_html()
        print(f"Kho button icon contains warehouse path: {'M3 21V9.5L12 4' in kho_svg}")
        assert 'M3 21V9.5L12 4' in kho_svg, "Kho button does not use warehouse icon"
        
        # Check menu icon SVG
        more_svg = more_btn.locator('svg').inner_html()
        print(f"Thêm button icon contains menu path: {'x1=\"4\" x2=\"20\" y1=\"12\"' in more_svg}")
        assert 'x1="4" x2="20" y1="12"' in more_svg, "Thêm button does not use menu icon"
        
        # Check sales hero button styling
        has_hero_class = sales_btn.evaluate("el => el.classList.contains('nav-sales-hero')")
        print(f"Sales button has nav-sales-hero class: {has_hero_class}")
        assert has_hero_class, "Sales button missing nav-sales-hero class"
        
        sales_icon_bg = sales_btn.locator('svg').evaluate("el => getComputedStyle(el).background")
        sales_icon_color = sales_btn.locator('svg').evaluate("el => getComputedStyle(el).color")
        print(f"Sales icon background: {sales_icon_bg[:40]}..., color: {sales_icon_color}")
        assert 'rgb(255, 255, 255)' in sales_icon_color, f"Sales icon should be white, got {sales_icon_color}"
        
        # Capture mobile POS screenshot
        page.screenshot(path='tests/evidence/evidence_pos_hierarchy_mobile_390.png')
        print("Captured tests/evidence/evidence_pos_hierarchy_mobile_390.png")
        
        # Switch to list mode and verify
        page.evaluate("() => { const grid = document.querySelector('.pos-grid'); if(grid) grid.className = 'pos-grid list'; }")
        time.sleep(0.5)
        page.screenshot(path='tests/evidence/evidence_pos_list_hierarchy_mobile_390.png')
        print("Captured tests/evidence/evidence_pos_list_hierarchy_mobile_390.png")
        
        # Reset to grid mode
        page.evaluate("() => { const grid = document.querySelector('.pos-grid'); if(grid) grid.className = 'pos-grid grid3'; }")
        
        # Navigate to Kho and check active state color
        kho_btn.click()
        time.sleep(0.5)
        kho_color = kho_btn.evaluate("el => getComputedStyle(el).color")
        print(f"Kho button active color: {kho_color}")
        
        # Test 2: Desktop 1280x800
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 800})
        page_d = context_desktop.new_page()
        page_d.goto('http://localhost:4180/')
        page_d.wait_for_load_state('networkidle')
        time.sleep(1)
        
        # Enter DoctorLoan demo
        dl_btn_d = page_d.locator('button[data-industry="doctorloan"]')
        if dl_btn_d.count() > 0:
            dl_btn_d.click()
        else:
            page_d.locator('[data-action="preview-demo"]').click()
        time.sleep(1)
        
        page_d.click('.nav-btn[data-page="sales"]')
        time.sleep(1)
        page_d.screenshot(path='tests/evidence/evidence_pos_desktop_doctorloan.png')
        print("Captured tests/evidence/evidence_pos_desktop_doctorloan.png")
        
        # Also test switching to other shops to verify "áp dụng cho mọi shop"
        page_d.click('.header-shortcut')
        time.sleep(0.5)
        # Select another industry like retail
        retail_opt = page_d.locator('[data-switch-industry="retail"]')
        if retail_opt.count() > 0:
            retail_opt.click()
            time.sleep(1)
            page_d.click('.nav-btn[data-page="sales"]')
            time.sleep(0.5)
            chips_retail = page_d.locator('.pos-chips button')
            cr_radius = chips_retail.first.evaluate('el => getComputedStyle(el).borderRadius')
            print(f"Retail shop chip border-radius: {cr_radius}")
            assert cr_radius == '8px', f"Expected border-radius 8px in Retail shop, got {cr_radius}"
            page_d.screenshot(path='tests/evidence/evidence_pos_desktop_retail.png')
            print("Captured tests/evidence/evidence_pos_desktop_retail.png")
            
        browser.close()
        print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    run_tests()
