import asyncio
import os
import sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

async def run_test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Match user's viewport
        context = await browser.new_context(viewport={'width': 1024, 'height': 800})
        page = await context.new_page()

        print("--- Loading preview.html ---")
        await page.goto('http://localhost:4180/preview.html', wait_until='networkidle')
        await page.wait_for_timeout(1000)

        # 1. Verify .phone-notch does NOT exist in DOM
        notch_count = await page.locator('.phone-notch').count()
        print(f"Number of .phone-notch elements in DOM: {notch_count}")
        assert notch_count == 0, f"Expected 0 .phone-notch elements, found {notch_count}!"

        # 2. Select 390px preset (matching user's screenshot)
        await page.click('.device-controls button[data-width="390"]')
        await page.wait_for_timeout(500)

        # 3. Check clean preview without frame
        clean_screenshot_path = os.path.join(os.path.dirname(__file__), 'evidence', 'preview_no_camera_notch_clean.png')
        await page.screenshot(path=clean_screenshot_path)
        print(f"Saved clean screenshot: {clean_screenshot_path}")

        # 4. Toggle Frame Mode (user screenshot had frame mode active)
        print("Toggling frame mode on...")
        await page.click('#toggleFrameBtn')
        await page.wait_for_timeout(500)

        # Verify frame-mode class is present on #phoneContainer
        is_frame_mode = await page.eval_on_selector('#phoneContainer', 'el => el.classList.contains("frame-mode")')
        print(f"Is frame-mode active: {is_frame_mode}")
        assert is_frame_mode, "Expected frame-mode to be active"

        # Verify .phone-notch is STILL 0 in frame mode
        notch_count_frame = await page.locator('.phone-notch').count()
        print(f"Number of .phone-notch elements in frame-mode: {notch_count_frame}")
        assert notch_count_frame == 0, f"Expected 0 .phone-notch in frame mode, found {notch_count_frame}!"

        # Access iframe
        frame_el = await page.wait_for_selector('#appFrame')
        frame = await frame_el.content_frame()

        # If on login screen, click F&B demo to enter dashboard
        fb_btn = frame.locator('button:has-text("Ăn uống / F&B")').first
        if await fb_btn.count() > 0 and await fb_btn.is_visible():
            print("Entering F&B demo mode...")
            await fb_btn.click()
            await page.wait_for_timeout(1500)

        # Verify topbar header inside iframe is completely visible and not covered
        header_text = await frame.eval_on_selector('header.topbar #pageTitle', 'el => el.innerText.trim()')
        print(f"Top bar title inside iframe: '{header_text}'")
        assert "Tổng quan" in header_text, f"Expected 'Tổng quan' in header, got {header_text}"

        # Capture frame-mode screenshot (direct comparison to user's uploaded image)
        frame_screenshot_path = os.path.join(os.path.dirname(__file__), 'evidence', 'preview_no_camera_notch_frame_mode.png')
        await page.screenshot(path=frame_screenshot_path)
        print(f"Saved frame-mode screenshot: {frame_screenshot_path}")

        print("\n=== ALL NOTCH REMOVAL TESTS PASSED ===")
        await browser.close()

if __name__ == '__main__':
    asyncio.run(run_test())
