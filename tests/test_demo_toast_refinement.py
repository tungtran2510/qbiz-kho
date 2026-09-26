import asyncio
import sys
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding='utf-8')

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Mobile viewport 390x844 (iPhone 14 / modern smartphone)
        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()

        print("1. Mo trang ung dung http://localhost:4180/...")
        await page.goto('http://localhost:4180/', wait_until='networkidle')
        await page.wait_for_timeout(600)

        # Neu modal dang nhap / demo dang hien
        modal = page.locator('#modalRoot')
        demo_btn = page.locator('button:has-text("Xem shop demo"), [data-action="demo-shop"]').first
        if await demo_btn.count() > 0 and await demo_btn.is_visible():
            print("2. Bam 'Xem shop demo' tren modal...")
            await demo_btn.click()
            await page.wait_for_timeout(400)

        # Chon nganh Thoi trang (giong thao tac nguoi dung chup anh)
        fashion_btn = page.locator('[data-industry="fashion"], button:has-text("Thời trang")').first
        if await fashion_btn.count() > 0 and await fashion_btn.is_visible():
            print("3. Bam chon nganh 'Thời trang'...")
            await fashion_btn.click()

        # Cho toast xuat hien
        toast = page.locator('#toastRoot .toast').first
        await toast.wait_for(state='visible', timeout=5000)

        # Kiem tra so luong toast (khong duoc bi chong 3 khoi to nhu truoc)
        toast_count = await page.locator('#toastRoot .toast').count()
        print(f"-> So luong toast dang hien: {toast_count} (Toi da 1-2, khong chong 3 khoi)")
        assert toast_count <= 2, f"Too many toasts stacked: {toast_count}"

        toast_text = await toast.inner_text()
        print(f"-> Noi dung toast: '{toast_text}'")

        # Kiem tra styling cua toast
        box = await toast.bounding_box()
        font_size = await toast.evaluate("el => window.getComputedStyle(el).fontSize")
        border_radius = await toast.evaluate("el => window.getComputedStyle(el).borderRadius")
        print(f"-> Kich thuoc toast: Chieu cao = {box['height']}px, Chieu rong = {box['width']}px")
        print(f"-> Font size: {font_size}, Border radius: {border_radius}")

        assert box['height'] <= 36, f"Toast is too tall: {box['height']}px"
        assert any(x in font_size for x in ['11.5px', '12px', '13px']), f"Font size not compact: {font_size}"

        # Chup anh bang chung toast nho gon
        await page.screenshot(path='tests/evidence/demo_toast_compact.png')
        print("-> DA CHUP ANH: tests/evidence/demo_toast_compact.png")

        # Cho toast tu dong bien mat sau 1.8s
        print("4. Cho toast tu dong bien mat sau 1.8s...")
        await page.wait_for_timeout(1800)

        # Toast phai bien mat khoi man hinh
        visible_toasts = await page.locator('#toastRoot .toast').count()
        print(f"-> So luong toast con lai sau 1.8s: {visible_toasts}")
        assert visible_toasts == 0, f"Toast did not auto-dismiss quickly! Remaining: {visible_toasts}"

        await page.screenshot(path='tests/evidence/demo_toast_dismissed.png')
        print("-> DA CHUP ANH: tests/evidence/demo_toast_dismissed.png (Toast da bien mat hoan toan)")

        print("=== TEST DEMO TOAST REFINEMENT PASSED 100% ===")
        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
