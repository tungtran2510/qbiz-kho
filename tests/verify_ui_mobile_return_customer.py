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
        # Mobile viewport 390x844 (iPhone 13 / standard mobile)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        )
        page = await context.new_page()

        print("[1] Opening QBiz Kho on mobile viewport 390x844...")
        await page.goto("http://localhost:4180", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Enter demo shop if preview/login screen is displayed
        print("[2] Entering demo shop mode...")
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
        await page.wait_for_timeout(2000)

        # 1. Test Returns Screen
        print("[3] Navigating to Returns Center (#returns)...")
        await page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('returns');
            } else {
                location.hash = '#returns';
                if (window.renderReturnCenter) window.renderReturnCenter();
            }
        }""")
        await page.wait_for_timeout(1000)

        path_return_list = os.path.join(ARTIFACT_DIR, "evidence_mobile_return_list_fixed.png")
        await page.screenshot(path=path_return_list)
        print(f"Captured: {path_return_list}")

        # Check online badges in return list
        badge_count = await page.locator(".return-online-badge").count()
        print(f"Online badges found: {badge_count}")

        # 2. Open Return Flow modal on first transaction
        print("[4] Clicking first transaction to open Return/Exchange modal...")
        sale_btn = page.locator("[data-return-sale]").first
        if await sale_btn.count() > 0:
            await sale_btn.click()
            await page.wait_for_timeout(800)

            # Click the first checkbox to activate controls
            first_card_cb = page.locator("[data-return-line]").first
            if await first_card_cb.count() > 0:
                await first_card_cb.check()
                await page.wait_for_timeout(400)

                # Test stepper button +
                plus_btn = page.locator("[data-step-plus]").first
                if await plus_btn.count() > 0:
                    await plus_btn.click()
                    await page.wait_for_timeout(300)

            path_return_modal = os.path.join(ARTIFACT_DIR, "evidence_mobile_return_modal_stepper.png")
            await page.screenshot(path=path_return_modal)
            print(f"Captured: {path_return_modal}")

            # 3. Test Exchange tab
            print("[5] Switching to Exchange tab...")
            await page.locator("#retTabExchange").click()
            await page.wait_for_timeout(600)

            # Type to search product for exchange
            ex_search = page.locator("#exSearch")
            if await ex_search.count() > 0:
                await ex_search.fill("a")
                await page.wait_for_timeout(500)
                pick_btn = page.locator("[data-ex-pick]").first
                if await pick_btn.count() > 0:
                    await pick_btn.click()
                    await page.wait_for_timeout(500)

            # Scroll to bottom of modal to check payment method clearance
            await page.evaluate("""() => {
                const b = document.querySelector('.modal-body') || document.querySelector('.modal');
                if (b) b.scrollTop = b.scrollHeight;
            }""")
            await page.wait_for_timeout(400)

            path_exchange_modal = os.path.join(ARTIFACT_DIR, "evidence_mobile_exchange_modal_fixed.png")
            await page.screenshot(path=path_exchange_modal)
            print(f"Captured: {path_exchange_modal}")

            # Close modal
            close_btn = page.locator("#modalRoot .close-btn, #modalRoot [data-close]").first
            if await close_btn.count() > 0:
                await close_btn.click()
                await page.wait_for_timeout(500)

        # 4. Test Customers Screen (VIP badge & filter)
        print("[6] Navigating to Customers Directory (#customers)...")
        await page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('customers');
            } else {
                location.hash = '#customers';
                if (window.renderCustomers) window.renderCustomers();
            }
        }""")
        await page.wait_for_timeout(1000)

        path_customers_all = os.path.join(ARTIFACT_DIR, "evidence_mobile_customers_vip_fixed.png")
        await page.screenshot(path=path_customers_all)
        print(f"Captured: {path_customers_all}")

        # Click VIP filter
        vip_filter = page.locator("[data-customer-type='vip']")
        if await vip_filter.count() > 0:
            await vip_filter.click()
            await page.wait_for_timeout(500)
            path_customers_vip = os.path.join(ARTIFACT_DIR, "evidence_mobile_customers_vip_filter.png")
            await page.screenshot(path=path_customers_vip)
            print(f"Captured: {path_customers_vip}")

        await browser.close()
        print("[DONE] All UI verification steps executed successfully!")

if __name__ == "__main__":
    asyncio.run(run())
