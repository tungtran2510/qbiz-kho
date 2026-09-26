import asyncio
from playwright.async_api import async_playwright

async def run_verification():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # TEST 1: User's exact screenshot size (1024x616)
        # -------------------------------------------------------------
        print("--- TEST 1: User viewport 1024x616 ---")
        context1 = await browser.new_context(viewport={'width': 1024, 'height': 616})
        page1 = await context1.new_page()
        await page1.goto('http://localhost:4180/preview.html', wait_until='networkidle')
        await page1.wait_for_timeout(1000)

        # Check phoneContainer dimensions
        box1 = await page1.eval_on_selector('#phoneContainer', 'el => ({width: el.offsetWidth, height: el.offsetHeight})')
        print(f"Phone container size at 1024x616: {box1['width']}x{box1['height']}")
        assert box1['height'] >= 880, f"Expected height >= 880, got {box1['height']}"

        # Switch to 390px (matching user's screenshot)
        await page1.click('.device-controls button[data-width="390"]')
        await page1.wait_for_timeout(500)
        box_390 = await page1.eval_on_selector('#phoneContainer', 'el => ({width: el.offsetWidth, height: el.offsetHeight})')
        print(f"Phone container at 390px preset: {box_390['width']}x{box_390['height']}")
        assert box_390['width'] == 390, f"Expected width 390, got {box_390['width']}"
        assert box_390['height'] >= 880, f"Expected height >= 880, got {box_390['height']}"

        # Access iframe to test Service industry demo and check "Thanh toán" text
        frame_el = await page1.wait_for_selector('#appFrame')
        frame = await frame_el.content_frame()
        service_btn = frame.locator('button[data-industry="service"]').first
        if await service_btn.count() > 0 and await service_btn.is_visible():
            await service_btn.click()
        else:
            modal_trigger = frame.locator('[data-action="open-demo-industry-modal"]').first
            if await modal_trigger.count() > 0:
                await modal_trigger.click()
                await page1.wait_for_timeout(500)
            await frame.click('button[data-industry="service"]')
        await page1.wait_for_timeout(1500)

        # Verify hero button text "Thanh toán" is NOT truncated
        hero_info = await frame.eval_on_selector(
            '.quick-hero-main strong',
            'el => ({text: el.innerText.trim(), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, isEllipsis: el.scrollWidth > el.clientWidth})'
        )
        print(f"Hero button in Service mode: text='{hero_info['text']}', scrollWidth={hero_info['scrollWidth']}, clientWidth={hero_info['clientWidth']}, isEllipsis={hero_info['isEllipsis']}")
        assert 'Thanh to' in hero_info['text'], f"Expected 'Thanh toán' in text, got {hero_info['text']}"
        assert not hero_info['isEllipsis'], f"Text is truncated! scrollWidth ({hero_info['scrollWidth']}) > clientWidth ({hero_info['clientWidth']})"

        # Verify quick grid tiles are rendered
        grid_tiles = await frame.eval_on_selector_all(
            '.dashboard-quick-grid .quick-tile',
            'tiles => tiles.map(t => t.innerText.trim().replace(/\\n+/g, " "))'
        )
        print(f"Rendered {len(grid_tiles)} quick tiles")
        assert len(grid_tiles) >= 5, f"Expected at least 5 quick tiles, got {len(grid_tiles)}"

        # Capture screenshot for evidence at 1024x616 (390px tall phone, Service demo)
        await page1.screenshot(path='tests/evidence/preview_tall_screen_1024x616.png')
        print("Captured tests/evidence/preview_tall_screen_1024x616.png")

        # -------------------------------------------------------------
        # TEST 2: Height controls interactivity (960px, fit, tall)
        # -------------------------------------------------------------
        print("\n--- TEST 2: Height Presets Interactivity ---")
        # Click 960px height
        await page1.click('.height-controls button[data-height="xtall"]')
        await page1.wait_for_timeout(400)
        box_xtall = await page1.eval_on_selector('#phoneContainer', 'el => ({width: el.offsetWidth, height: el.offsetHeight})')
        print(f"Height after clicking 960px: {box_xtall['height']}")
        assert box_xtall['height'] >= 960, f"Expected height >= 960, got {box_xtall['height']}"

        # Click Vừa khung (fit window)
        await page1.click('.height-controls button[data-height="fit"]')
        await page1.wait_for_timeout(400)
        box_fit = await page1.eval_on_selector('#phoneContainer', 'el => ({width: el.offsetWidth, height: el.offsetHeight})')
        print(f"Height after clicking Vua khung: {box_fit['height']}")
        assert box_fit['height'] <= 616, f"Expected fit height <= 616, got {box_fit['height']}"

        # Click Dài (880px)
        await page1.click('.height-controls button[data-height="tall"]')
        await page1.wait_for_timeout(400)
        box_tall = await page1.eval_on_selector('#phoneContainer', 'el => ({width: el.offsetWidth, height: el.offsetHeight})')
        print(f"Height after clicking Dai (880px): {box_tall['height']}")
        assert box_tall['height'] >= 880, f"Expected height >= 880, got {box_tall['height']}"

        await context1.close()

        # -------------------------------------------------------------
        # TEST 3: Standard Desktop 1280x850 and 1920x1080
        # -------------------------------------------------------------
        print("\n--- TEST 3: Standard Desktop Viewports ---")
        context2 = await browser.new_context(viewport={'width': 1280, 'height': 850})
        page2 = await context2.new_page()
        await page2.goto('http://localhost:4180/preview.html', wait_until='networkidle')
        await page2.wait_for_timeout(1000)
        box_1280 = await page2.eval_on_selector('#phoneContainer', 'el => ({width: el.offsetWidth, height: el.offsetHeight})')
        print(f"Phone container size at 1280x850: {box_1280['width']}x{box_1280['height']}")
        assert box_1280['height'] >= 880
        await page2.screenshot(path='tests/evidence/preview_tall_screen_1280x850.png')
        print("Captured tests/evidence/preview_tall_screen_1280x850.png")
        await context2.close()

        context3 = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page3 = await context3.new_page()
        await page3.goto('http://localhost:4180/preview.html', wait_until='networkidle')
        await page3.wait_for_timeout(1000)
        box_1920 = await page3.eval_on_selector('#phoneContainer', 'el => ({width: el.offsetWidth, height: el.offsetHeight})')
        print(f"Phone container size at 1920x1080: {box_1920['width']}x{box_1920['height']}")
        assert box_1920['height'] >= 1016, f"Expected full height >= 1016, got {box_1920['height']}"
        await page3.screenshot(path='tests/evidence/preview_tall_screen_1920x1080.png')
        print("Captured tests/evidence/preview_tall_screen_1920x1080.png")
        await context3.close()

        await browser.close()
        print("\nALL VERIFICATION CHECKS PASSED!")

if __name__ == '__main__':
    asyncio.run(run_verification())
