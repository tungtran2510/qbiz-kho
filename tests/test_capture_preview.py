import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 850})
        page = await context.new_page()
        await page.goto('http://localhost:4180/preview.html', wait_until='networkidle')
        await page.wait_for_timeout(1000)

        # Get iframe
        frame_element = await page.wait_for_selector('#appFrame')
        frame = await frame_element.content_frame()
        
        # Click retail demo industry button or close modal
        btn = frame.locator('button', has_text='Bán lẻ / Tổng hợp').first
        if await btn.count() > 0 and await btn.is_visible():
            await btn.click()
            await page.wait_for_timeout(1500)

        await page.screenshot(path='tests/evidence/preview_phone_dashboard.png')
        print('Captured preview_phone_dashboard.png successfully!')
        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
