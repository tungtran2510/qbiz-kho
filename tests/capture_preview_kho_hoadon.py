import sys, os, time
from playwright.sync_api import sync_playwright

os.makedirs('tests/evidence', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    # 1. Mobile iPhone 13 (390x844)
    ctx_m = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page_m = ctx_m.new_page()
    page_m.goto('http://localhost:4180/')
    page_m.wait_for_load_state('networkidle')
    time.sleep(1)
    
    # Open demo retail to ensure sample data
    page_m.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
    time.sleep(1)
    
    # Navigate to products
    page_m.evaluate("() => window.__qbiz_app__.navigate('products')")
    time.sleep(1)
    
    # Capture Mobile Goods screen with the new Kho hàng button
    page_m.screenshot(path='tests/evidence/preview_mobile_goods_warehouse_btn.png')
    print('Captured: tests/evidence/preview_mobile_goods_warehouse_btn.png')
    
    # Navigate to transactions (Hóa đơn)
    page_m.evaluate("() => window.__qbiz_app__.navigate('transactions')")
    time.sleep(1)
    page_m.screenshot(path='tests/evidence/preview_mobile_invoices_tab.png')
    print('Captured: tests/evidence/preview_mobile_invoices_tab.png')
    
    # Navigate to transfers (Kho)
    page_m.evaluate("() => window.__qbiz_app__.navigate('transfers')")
    time.sleep(1)
    page_m.screenshot(path='tests/evidence/preview_mobile_warehouse_screen.png')
    print('Captured: tests/evidence/preview_mobile_warehouse_screen.png')
    
    # 2. Desktop 1440x900
    ctx_d = browser.new_context(viewport={'width': 1440, 'height': 900})
    page_d = ctx_d.new_page()
    page_d.goto('http://localhost:4180/')
    page_d.wait_for_load_state('networkidle')
    time.sleep(1)
    page_d.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
    time.sleep(1)
    page_d.evaluate("() => window.__qbiz_app__.navigate('products')")
    time.sleep(1)
    page_d.screenshot(path='tests/evidence/preview_desktop_goods_screen.png')
    print('Captured: tests/evidence/preview_desktop_goods_screen.png')
    
    browser.close()
