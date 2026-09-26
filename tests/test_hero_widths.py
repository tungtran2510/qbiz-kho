import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for w in [320, 360, 375, 390, 412, 430]:
            page = await browser.new_page(viewport={'width': w, 'height': 800})
            await page.goto('http://localhost:4180/')
            await page.wait_for_timeout(800)
            btn = page.locator('button[data-industry="service"]').first
            if await btn.count() > 0 and await btn.is_visible():
                await btn.click()
            else:
                modal = page.locator('[data-action="open-demo-industry-modal"]').first
                if await modal.count() > 0:
                    await modal.click()
                    await page.wait_for_timeout(400)
                await page.click('button[data-industry="service"]')
            await page.wait_for_timeout(800)
            
            hero = await page.eval_on_selector(
                '.quick-hero-main strong',
                'el => ({text: el.innerText, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, isEllipsis: el.scrollWidth > el.clientWidth})'
            )
            text_safe = hero['text'].replace('\n', ' ')
            is_ok = not hero['isEllipsis']
            print(f"Width {w}px: scrollWidth={hero['scrollWidth']}, clientWidth={hero['clientWidth']}, isEllipsis={hero['isEllipsis']} (PASS: {is_ok})")
            
            # Crop hero element
            hero_el = page.locator('.dashboard-quick-grid .quick-tile.quick-hero').first
            await hero_el.screenshot(path=f"tests/evidence/crop_hero_{w}px.png")
            await page.close()
        await browser.close()
        print("All width tests completed!")

if __name__ == '__main__':
    asyncio.run(run())
