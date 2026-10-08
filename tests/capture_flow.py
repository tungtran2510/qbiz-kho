import asyncio
import os
from playwright.async_api import async_playwright

EVIDENCE_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15"
        )
        page = await context.new_page()

        print("1. Opening app...")
        await page.goto("https://qbiz-kho.vercel.app/", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Click retail demo if auth modal shows
        retail = page.get_by_text("Bán lẻ / Tổng hợp")
        if await retail.count() > 0:
            print("Clicking retail demo...")
            await retail.first.click()
            await page.wait_for_timeout(2000)

        path_dash = os.path.join(EVIDENCE_DIR, "evidence_live_v25_retail_demo_mobile.png")
        await page.screenshot(path=path_dash)
        print("Captured dashboard:", path_dash)

        # Click More -> So sach & Bao cao thue
        print("Opening More menu...")
        await page.locator('nav#mobileNav button').filter(has_text="Thêm").click()
        await page.wait_for_timeout(1000)
        
        path_more = os.path.join(EVIDENCE_DIR, "evidence_live_v25_more_screen_mobile.png")
        await page.screenshot(path=path_more)
        print("Captured more:", path_more)

        print("Clicking So sach & Bao cao thue...")
        await page.get_by_text("Sổ sách & Báo cáo thuế").first.click()
        await page.wait_for_timeout(1500)
        path_tt88 = os.path.join(EVIDENCE_DIR, "evidence_live_v25_tt88_modal_mobile.png")
        await page.screenshot(path=path_tt88)
        print("Captured TT88 modal:", path_tt88)

        # Close modal and go to POS
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)

        print("Going to POS...")
        await page.locator('nav#mobileNav button').filter(has_text="Bán hàng").click()
        await page.wait_for_timeout(1500)
        path_pos = os.path.join(EVIDENCE_DIR, "evidence_live_v25_sales_pos_mobile.png")
        await page.screenshot(path=path_pos)
        print("Captured POS:", path_pos)

        # Go to Reports -> Tax tab
        print("Going to Reports Tax tab...")
        await page.evaluate("""() => {
            state.page = 'reports';
            state.reportTab = 'tax';
            render();
        }""")
        await page.wait_for_timeout(1500)
        path_tax = os.path.join(EVIDENCE_DIR, "evidence_live_v25_tax_tab_mobile.png")
        await page.screenshot(path=path_tax)
        print("Captured Tax tab:", path_tax)

        await browser.close()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
