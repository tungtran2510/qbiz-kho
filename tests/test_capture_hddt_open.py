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

        await page.goto(f"{VERCEL_URL}/#sales", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Add item and go to checkout
        add_btn = page.locator('.pos-add').first
        if await add_btn.count() > 0:
            await add_btn.click()
            await page.wait_for_timeout(400)

        await page.evaluate("""() => {
            state.saleStep = 'checkout';
            renderSales();
        }""")
        await page.wait_for_timeout(500)

        # Open extras modal
        await page.locator('#openCheckoutExtrasBtn').click()
        await page.wait_for_selector(".checkout-extras-modal-body", timeout=5000)
        await page.wait_for_timeout(300)

        # Click open accordion 4. Yêu cầu xuất hóa đơn điện tử
        hddt_summary = page.locator('#modalInvoiceAccordion summary')
        await hddt_summary.click()
        await page.wait_for_timeout(300)

        # Fill sample tax info
        await page.locator('#modalInvoiceTaxCode').fill("0102030405")
        await page.locator('#modalInvoiceCompanyName').fill("Công ty Cổ phần Công nghệ QBiz")
        await page.locator('#modalInvoiceAddress').fill("123 Phố Huế, Hai Bà Trưng, Hà Nội")

        shot_path = os.path.join(SCREENSHOT_DIR, "live_vercel_mobile_pos_extras_hddt_open.png")
        await page.screenshot(path=shot_path)
        print(f"Captured live POS extras with HDDT open: {shot_path}")

        # Now click [Đóng] button in footer
        await page.locator('.extras-btn-cancel').click()
        await page.wait_for_timeout(400)

        shot_checkout = os.path.join(SCREENSHOT_DIR, "live_vercel_mobile_checkout_main.png")
        await page.screenshot(path=shot_checkout)
        print(f"Captured live checkout screen: {shot_checkout}")

        await context.close()
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
