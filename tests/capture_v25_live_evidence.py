import asyncio
import os
from playwright.async_api import async_playwright

EVIDENCE_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Mobile Viewport 390x844 (iPhone 13 / Modern smartphone)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        )
        page = await context.new_page()

        print("1. Loading https://qbiz-kho.vercel.app ...")
        # Go to live vercel URL with cache-busting reload
        await page.goto("https://qbiz-kho.vercel.app/", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # Evidence 1: Dashboard
        path_dash = os.path.join(EVIDENCE_DIR, "evidence_live_v25_dashboard_mobile.png")
        await page.screenshot(path=path_dash)
        print("Captured:", path_dash)

        # Evidence 2: Reports (Báo cáo) -> Tax Tab
        print("2. Navigating to Reports -> Tax Tab...")
        await page.evaluate("() => { if (window.render) { state.page = 'reports'; state.reportTab = 'tax'; render(); } }")
        await page.wait_for_timeout(1500)
        path_tax = os.path.join(EVIDENCE_DIR, "evidence_live_v25_tax_tab_mobile.png")
        await page.screenshot(path=path_tax)
        print("Captured:", path_tax)

        # Evidence 3: More Screen (Menu Thêm)
        print("3. Navigating to More Screen...")
        await page.evaluate("() => { if (window.render) { state.page = 'more'; render(); } }")
        await page.wait_for_timeout(1000)
        path_more = os.path.join(EVIDENCE_DIR, "evidence_live_v25_more_screen_mobile.png")
        await page.screenshot(path=path_more)
        print("Captured:", path_more)

        # Evidence 4: Settings -> System Diag (Showing v25)
        print("4. Opening System Info Diagnostic...")
        await page.evaluate("() => { if (window.openSystemInfoModal) { openSystemInfoModal(); } }")
        await page.wait_for_timeout(1000)
        path_diag = os.path.join(EVIDENCE_DIR, "evidence_live_v25_system_info_mobile.png")
        await page.screenshot(path=path_diag)
        print("Captured:", path_diag)

        await browser.close()
        print("All live screenshots captured successfully!")

if __name__ == "__main__":
    asyncio.run(main())
