import asyncio
import os
import sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCREENSHOT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
VERCEL_URL = "https://qbiz-kho.vercel.app"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        )
        page = await context.new_page()

        print(f"Navigating to {VERCEL_URL}/#sales...")
        await page.goto(f"{VERCEL_URL}/#sales", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Add first item using UI
        add_btn = page.locator('.pos-add').first
        if await add_btn.count() > 0:
            await add_btn.click()
            await page.wait_for_timeout(400)

        # Transition to checkout
        await page.evaluate("""() => {
            state.saleStep = 'checkout';
            renderSales();
        }""")
        await page.wait_for_timeout(600)

        # Click extras button
        extras_btn = page.locator('#openCheckoutExtrasBtn')
        if await extras_btn.count() > 0:
            print("Clicking #openCheckoutExtrasBtn...")
            await extras_btn.click()
            await page.wait_for_selector(".checkout-extras-modal-body", timeout=5000)
            await page.wait_for_timeout(500)

            # Check VAT rate pills and direct input
            vat_val = await page.locator('#modalVatRateInput').input_value()
            print(f"Modal VAT input initial value: {vat_val}")

            # Click VAT 10% pill
            pill10 = page.locator('.modal-vat-pill[data-vat-val="10"]')
            if await pill10.count() > 0:
                await pill10.click()
                await page.wait_for_timeout(200)

            shot_path = os.path.join(SCREENSHOT_DIR, "live_vercel_mobile_pos_extras_modal.png")
            await page.screenshot(path=shot_path)
            print(f"Captured live POS extras modal: {shot_path}")

        # Also take screenshot of streamlined checkout screen with outside discount
        await page.locator('.modal-close, #modalCancel').click()
        await page.wait_for_timeout(400)
        shot_checkout = os.path.join(SCREENSHOT_DIR, "live_vercel_mobile_checkout_streamlined.png")
        await page.screenshot(path=shot_checkout)
        print(f"Captured live streamlined checkout screen: {shot_checkout}")

        await context.close()
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
