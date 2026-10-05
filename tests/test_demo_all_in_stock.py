import os
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        print("[TEST] 1. Mo trang chu...")
        page.goto('http://127.0.0.1:4180/')
        page.wait_for_load_state('networkidle')
        time.sleep(1)

        # Click "Xem shop demo"
        print("[TEST] 2. Click Xem shop demo (Retail)...")
        demo_btn = page.locator('[data-action="preview-demo"]')
        if demo_btn.is_visible():
            demo_btn.click()
        else:
            page.evaluate("window.__qbiz_app__.previewDemo('retail')")
        time.sleep(1.5)

        # Chuyen sang trang Hang hoa
        print("[TEST] 3. Kiem tra trang Hang hoa (Retail)...")
        page.evaluate("window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        
        # Kiem tra khong co san pham nao het hang
        out_of_stock = page.locator('text="Hết hàng"').all()
        print(f"   So huy hieu 'Het hang' tren trang Hang hoa: {len(out_of_stock)}")
        assert len(out_of_stock) == 0, f"Van con {len(out_of_stock)} san pham 'Het hang' trong Ban le!"

        # Kiem tra trang Ban hang POS
        print("[TEST] 4. Kiem tra trang POS (Retail)...")
        page.evaluate("window.__qbiz_app__.navigate('sales')")
        time.sleep(1)
        pos_out = page.locator('.pos-prod-stock.out-of-stock').all()
        print(f"   So san pham 'Het hang' tren POS: {len(pos_out)}")
        assert len(pos_out) == 0, f"Van con {len(pos_out)} san pham 'Het hang' tren POS!"

        # Chuyen sang nganh Thoi trang
        print("[TEST] 5. Chuyen sang demo Thoi trang (Fashion)...")
        page.evaluate("window.__qbiz_app__.previewDemo('fashion')")
        time.sleep(1.5)

        page.evaluate("window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        prods = page.evaluate("window.__qbiz_app__.state.data.products.map(p => ({ id: p.id, name: p.name, type: p.type }))")
        print(f"   Tong so san pham Thoi trang: {len(prods)}")
        for pr in prods:
            print(f"     - {pr['name']} ({pr['id']})")
        
        # Kiem tra khong bi tron san pham DoctorLoan
        dl_mixed = [pr for pr in prods if 'dl' in pr['id'].lower() or 'ghế' in pr['name'].lower() or 'gối' in pr['name'].lower()]
        print(f"   So san pham DoctorLoan bi tron vao: {len(dl_mixed)}")
        assert len(dl_mixed) == 0, f"Bi tron {len(dl_mixed)} san pham DoctorLoan vao Thoi trang!"

        out_of_stock_fashion = page.locator('text="Hết hàng"').all()
        print(f"   So huy hieu 'Het hang' trong Thoi trang: {len(out_of_stock_fashion)}")
        assert len(out_of_stock_fashion) == 0, f"Van con {len(out_of_stock_fashion)} san pham 'Het hang' trong Thoi trang!"

        # Test reload trang trong khi dang o demo Thoi trang
        print("[TEST] 6. Reload trang F5 de kiem tra tinh ben vung...")
        page.reload()
        page.wait_for_load_state('networkidle')
        time.sleep(1.5)

        page.evaluate("window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        prods_after_reload = page.evaluate("window.__qbiz_app__.state.data.products.map(p => ({ id: p.id, name: p.name }))")
        print(f"   So san pham sau reload: {len(prods_after_reload)}")
        dl_mixed_after = [pr for pr in prods_after_reload if 'dl' in pr['id'].lower() or 'ghế' in pr['name'].lower() or 'gối' in pr['name'].lower()]
        print(f"   So san pham DoctorLoan sau reload: {len(dl_mixed_after)}")
        assert len(dl_mixed_after) == 0, f"Sau reload bi inject {len(dl_mixed_after)} san pham DoctorLoan!"
        
        out_after_reload = page.locator('text="Hết hàng"').all()
        print(f"   So huy hieu 'Het hang' sau reload: {len(out_after_reload)}")
        assert len(out_after_reload) == 0, f"Sau reload co {len(out_after_reload)} san pham 'Het hang'!"

        # Chup anh bang chung
        page.screenshot(path="C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/evidence_demo_fashion_mobile.png")
        print("[TEST] Da chup anh evidence_demo_fashion_mobile.png")

        # Kiem tra F&B
        print("[TEST] 7. Kiem tra demo F&B...")
        page.evaluate("window.__qbiz_app__.previewDemo('food_beverage')")
        time.sleep(1.5)
        page.evaluate("window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        out_fnb = page.locator('text="Hết hàng"').all()
        print(f"   So huy hieu 'Het hang' trong F&B: {len(out_fnb)}")
        assert len(out_fnb) == 0, f"F&B co {len(out_fnb)} san pham het hang!"

        # Kiem tra Service
        print("[TEST] 8. Kiem tra demo Service...")
        page.evaluate("window.__qbiz_app__.previewDemo('service')")
        time.sleep(1.5)
        page.evaluate("window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        out_svc = page.locator('text="Hết hàng"').all()
        print(f"   So huy hieu 'Het hang' trong Service: {len(out_svc)}")
        assert len(out_svc) == 0, f"Service co {len(out_svc)} san pham het hang!"

        # Quay lai Retail chup anh
        print("[TEST] 9. Quay lai Retail va chup anh mobile evidence...")
        page.evaluate("window.__qbiz_app__.previewDemo('retail')")
        time.sleep(1.5)
        page.evaluate("window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        page.screenshot(path="C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/evidence_demo_retail_mobile.png")
        print("[TEST] Da chup anh evidence_demo_retail_mobile.png")

        browser.close()
        print("\n>>> TAT CA 9 BUOC TEST DEU PASS 100%! KHONG CON BAT KY SAN PHAM HET HANG NAO TRONG DEMO! <<<")

if __name__ == '__main__':
    run_test()
