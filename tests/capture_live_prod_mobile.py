import asyncio
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.async_api import async_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        )
        page = await context.new_page()

        print("[1] Opening LIVE PRODUCTION Vercel: https://qbiz-kho.vercel.app...")
        await page.goto("https://qbiz-kho.vercel.app", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # Enter demo shop
        print("[2] Entering demo shop on production...")
        await page.evaluate("""async () => {
            const demoBtn = document.querySelector('[data-action="preview-demo"]');
            if (demoBtn) {
                demoBtn.click();
            } else if (window.previewDemo) {
                await window.previewDemo('retail');
            }
            const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close]');
            if (modalClose) modalClose.click();
        }""")
        await page.wait_for_timeout(2500)

        # 1. Live Returns list
        print("[3] Navigating to Returns on live production...")
        await page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('returns');
            } else {
                location.hash = '#returns';
                if (window.renderReturnCenter) window.renderReturnCenter();
            }
        }""")
        await page.wait_for_timeout(1200)

        path_prod_returns = os.path.join(ARTIFACT_DIR, "live_prod_mobile_returns_list.png")
        await page.screenshot(path=path_prod_returns)
        print(f"Captured: {path_prod_returns}")

        # 2. Live Return Modal
        print("[4] Opening Return modal on live production...")
        sale_btn = page.locator("[data-return-sale]").first
        if await sale_btn.count() > 0:
            await sale_btn.click()
            await page.wait_for_timeout(800)

            # Check first item to reveal stepper
            first_card_cb = page.locator("[data-return-line]").first
            if await first_card_cb.count() > 0:
                await first_card_cb.check()
                await page.wait_for_timeout(400)
                plus_btn = page.locator("[data-step-plus]").first
                if await plus_btn.count() > 0:
                    await plus_btn.click()
                    await page.wait_for_timeout(300)

            path_prod_return_modal = os.path.join(ARTIFACT_DIR, "live_prod_mobile_return_modal.png")
            await page.screenshot(path=path_prod_return_modal)
            print(f"Captured: {path_prod_return_modal}")

            # 3. Live Exchange Modal
            print("[5] Switching to Exchange on live production...")
            await page.locator("#retTabExchange").click()
            await page.wait_for_timeout(600)

            ex_search = page.locator("#exSearch")
            if await ex_search.count() > 0:
                await ex_search.fill("a")
                await page.wait_for_timeout(500)
                pick_btn = page.locator("[data-ex-pick]").first
                if await pick_btn.count() > 0:
                    await pick_btn.click()
                    await page.wait_for_timeout(500)

            await page.evaluate("""() => {
                const b = document.querySelector('.modal-body') || document.querySelector('.modal');
                if (b) b.scrollTop = b.scrollHeight;
            }""")
            await page.wait_for_timeout(400)

            path_prod_exchange_modal = os.path.join(ARTIFACT_DIR, "live_prod_mobile_exchange_modal.png")
            await page.screenshot(path=path_prod_exchange_modal)
            print(f"Captured: {path_prod_exchange_modal}")

            # Close modal
            close_btn = page.locator("#modalRoot .close-btn, #modalRoot [data-close]").first
            if await close_btn.count() > 0:
                await close_btn.click()
                await page.wait_for_timeout(500)

        # 4. Live Customers Directory
        print("[6] Navigating to Customers on live production...")
        await page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('customers');
            } else {
                location.hash = '#customers';
                if (window.renderCustomers) window.renderCustomers();
            }
        }""")
        await page.wait_for_timeout(1200)

        path_prod_customers = os.path.join(ARTIFACT_DIR, "live_prod_mobile_customers.png")
        await page.screenshot(path=path_prod_customers)
        print(f"Captured: {path_prod_customers}")

        await browser.close()
        print("[DONE] Live production mobile verification successful!")

if __name__ == "__main__":
    asyncio.run(run())
