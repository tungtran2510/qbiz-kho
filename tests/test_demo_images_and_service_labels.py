import asyncio
import os
import sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), 'evidence')
os.makedirs(EVIDENCE_DIR, exist_ok=True)

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        print("1. Mo trang ung dung http://localhost:4180/...")
        await page.goto("http://localhost:4180/", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # ----------------------------------------------------
        # TEST 1: Thoi trang (Fashion) - Kiem tra anh that Unsplash
        # ----------------------------------------------------
        print("\n--- [TEST 1] THOI TRANG (FASHION) - ANH THAT ---")
        await page.evaluate("""async () => {
            await window.__qbiz_app__.previewDemo('fashion');
        }""")
        await page.wait_for_timeout(1000)

        # Chuyen sang trang Hang hoa cua Thoi trang
        await page.click('[data-page="products"]')
        await page.wait_for_timeout(1000)

        fashion_imgs = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('.p-row, .product-card'));
            return cards.map(c => {
                const name = c.querySelector('strong, h3')?.textContent?.trim();
                const img = c.querySelector('img')?.getAttribute('src') || '';
                return { name, img, isUnsplash: img.includes('images.unsplash.com') };
            });
        }""")
        print(f"Fashion products count: {len(fashion_imgs)}")
        for item in fashion_imgs:
            print(f"  + {item['name']}: {'REAL PHOTO' if item['isUnsplash'] else 'NOT UNSPLASH'} ({item['img'][:60]}...)")
            assert item['isUnsplash'], f"Anh cua {item['name']} khong phai anh that Unsplash!"

        await page.screenshot(path=os.path.join(EVIDENCE_DIR, "demo_fashion_real_photos.png"))
        print("-> DA CHUP ANH: demo_fashion_real_photos.png")

        # ----------------------------------------------------
        # TEST 2: An uong (F&B) - Kiem tra anh that Unsplash
        # ----------------------------------------------------
        print("\n--- [TEST 2] AN UONG (F&B) - ANH THAT ---")
        await page.evaluate("""async () => {
            await window.__qbiz_app__.previewDemo('food_beverage');
        }""")
        await page.wait_for_timeout(1000)

        # Chuyen sang trang san pham F&B
        await page.click('[data-page="products"]')
        await page.wait_for_timeout(1000)

        fnb_imgs = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('.p-row, .product-card'));
            return cards.map(c => {
                const name = c.querySelector('strong, h3')?.textContent?.trim();
                const img = c.querySelector('img')?.getAttribute('src') || '';
                return { name, img, isUnsplash: img.includes('images.unsplash.com') };
            });
        }""")
        print(f"F&B products count: {len(fnb_imgs)}")
        for item in fnb_imgs:
            print(f"  + {item['name']}: {'REAL PHOTO' if item['isUnsplash'] else 'NOT UNSPLASH'} ({item['img'][:60]}...)")
            assert item['isUnsplash'], f"Anh cua {item['name']} khong phai anh that Unsplash!"

        await page.screenshot(path=os.path.join(EVIDENCE_DIR, "demo_fnb_real_photos.png"))
        print("-> DA CHUP ANH: demo_fnb_real_photos.png")

        # ----------------------------------------------------
        # TEST 3: DICH VU (SERVICE) - Thao tac nhanh 'Thanh toan' & Trang 'Dich vu'
        # ----------------------------------------------------
        print("\n--- [TEST 3] DICH VU (SERVICE) - THANH TOAN & TRANG DICH VU ---")
        await page.evaluate("""async () => {
            await window.__qbiz_app__.previewDemo('service');
        }""")
        await page.wait_for_timeout(1000)

        # 3.1 Kiem tra man hinh Thao tac nhanh (Dashboard)
        await page.click('[data-page="dashboard"]')
        await page.wait_for_timeout(1000)

        quick_actions_text = await page.evaluate("""() => {
            const tiles = Array.from(document.querySelectorAll('.dashboard-quick-grid .quick-tile, .dashboard-quick-grid button'));
            return tiles.map(t => t.textContent.trim());
        }""")
        print(f"Quick action tiles text: {quick_actions_text}")

        # Kiem tra tile dau tien (hero button) phai co chu 'Thanh toán' va KHONG con 'Gói dịch vụ'
        has_thanh_toan = any('Thanh toán' in t for t in quick_actions_text)
        has_goi_dich_vu = any('Gói dịch vụ' in t for t in quick_actions_text)
        print(f"  + Has 'Thanh toán': {has_thanh_toan}")
        print(f"  + Has 'Gói dịch vụ' (must be False): {has_goi_dich_vu}")

        assert has_thanh_toan, "Man hinh thao tac nhanh chua co chu 'Thanh toán'!"
        assert not has_goi_dich_vu, "Man hinh thao tac nhanh van con chu 'Gói dịch vụ'!"

        await page.screenshot(path=os.path.join(EVIDENCE_DIR, "demo_service_quick_actions.png"))
        print("-> DA CHUP ANH: demo_service_quick_actions.png")

        # 3.2 Kiem tra nhan dieu huong (Nav) va Tieu de trang khi vao trang Dich vu
        # Nhan nav cua 'products' phai hien thi la 'Dịch vụ' thay vi 'Hàng hóa'
        nav_product_label = await page.evaluate("""() => {
            const btn = document.querySelector('#desktopNav [data-page="products"]') || document.querySelector('#mobileNav [data-page="products"]');
            return btn?.textContent?.trim();
        }""")
        print(f"Nav products label in service mode: '{nav_product_label}'")
        assert 'Dịch vụ' in nav_product_label, f"Nhan nav phai la 'Dịch vụ', thuc te la '{nav_product_label}'"

        # Bam vao trang Dich vu
        await page.click('[data-page="products"]')
        await page.wait_for_timeout(1000)

        page_title = await page.evaluate("""() => document.getElementById('pageTitle')?.textContent?.trim()""")
        print(f"Page title when entering services: '{page_title}'")
        assert page_title == 'Dịch vụ', f"Tieu de trang phai la 'Dịch vụ', thuc te la '{page_title}'"

        # Kiem tra cac dich vu duoc hien thi voi anh that Unsplash
        service_items = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('.p-row, .product-card'));
            return cards.map(c => {
                const name = c.querySelector('strong, h3')?.textContent?.trim();
                const img = c.querySelector('img')?.getAttribute('src') || '';
                return { name, img, isUnsplash: img.includes('images.unsplash.com') };
            });
        }""")
        print(f"Service items count: {len(service_items)}")
        for item in service_items:
            print(f"  + {item['name']}: {'REAL PHOTO' if item['isUnsplash'] else 'NOT UNSPLASH'} ({item['img'][:60]}...)")
            assert item['isUnsplash'], f"Anh cua dich vu {item['name']} khong phai anh that Unsplash!"

        await page.screenshot(path=os.path.join(EVIDENCE_DIR, "demo_service_catalog.png"))
        print("-> DA CHUP ANH: demo_service_catalog.png")

        # ----------------------------------------------------
        # TEST 4: Kiem tra thoat demo va quay ve ban le binh thuong
        # ----------------------------------------------------
        print("\n--- [TEST 4] EXIT DEMO & RETAIL VERIFICATION ---")
        await page.evaluate("""() => window.__qbiz_app__.exitDemo()""")
        await page.wait_for_timeout(1000)

        retail_nav_label = await page.evaluate("""() => {
            const btn = document.querySelector('#desktopNav [data-page="products"]') || document.querySelector('#mobileNav [data-page="products"]');
            return btn?.textContent?.trim();
        }""")
        print(f"Retail nav products label: '{retail_nav_label}'")
        assert 'Hàng hóa' in retail_nav_label, f"Sau khi thoat demo, nav phai tro ve 'Hàng hóa', thuc te la '{retail_nav_label}'"

        print("\n========================================================")
        print("=== ALL DEMO REAL PHOTOS & SERVICE LABELS TESTS PASSED 100% ===")
        print("========================================================")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
