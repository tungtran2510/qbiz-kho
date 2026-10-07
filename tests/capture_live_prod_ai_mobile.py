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

        # Enter retail demo shop
        print("[2] Initializing retail demo data...")
        await page.evaluate("""async () => {
            if (window.previewDemo) {
                await window.previewDemo('retail');
            } else {
                const demoBtn = document.querySelector('[data-action="preview-demo"]');
                if (demoBtn) demoBtn.click();
            }
            const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close]');
            if (modalClose) modalClose.click();
        }""")
        await page.wait_for_timeout(2500)

        # Click AI Assistant floating button
        print("[3] Opening AI Assistant floating bar...")
        ai_btn = page.locator('#globalAiFabBtn, [data-action="open-ai-chat"], .ai-fab-btn').first
        if await ai_btn.count() > 0:
            await ai_btn.click()
            await page.wait_for_timeout(1000)

        # Send command: "Khách mua 1 bàn chải Colgate và thay màn hình iPhone 13 1tr5"
        print("[4] Submitting query to live AI Assistant...")
        input_el = page.locator('#aiChatInput, input[placeholder*="Hỏi AI"], .ai-input').first
        if await input_el.count() > 0:
            await input_el.fill("Khách mua 1 bàn chải Colgate và thay màn hình iPhone 13 1tr5")
            send_btn = page.locator('#aiChatSendBtn, button:has-text("Gửi"), .ai-send-btn').first
            if await send_btn.count() > 0:
                await send_btn.click()
            else:
                await input_el.press("Enter")
            await page.wait_for_timeout(4000)

        path_live_ai = os.path.join(ARTIFACT_DIR, "live_prod_mobile_ai_proposal_sapphire.png")
        await page.screenshot(path=path_live_ai)
        print(f"Captured: {path_live_ai}")

        await browser.close()
        print("PASS: Live production mobile screenshot captured successfully!")

if __name__ == "__main__":
    asyncio.run(run())
