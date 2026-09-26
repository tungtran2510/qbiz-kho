import asyncio
from playwright.async_api import async_playwright

async def run_verification():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for w in [360, 390, 412, 430]:
            page = await browser.new_page(viewport={'width': w, 'height': 800})
            await page.goto('http://localhost:4180/')
            await page.wait_for_timeout(800)
            
            # Switch to F&B demo to match user's screenshot (The Coffee Garden & Bakery)
            fnb_btn = page.locator('button[data-industry="food_beverage"]').first
            if await fnb_btn.count() > 0 and await fnb_btn.is_visible():
                await fnb_btn.click()
            else:
                modal = page.locator('[data-action="open-demo-industry-modal"]').first
                if await modal.count() > 0:
                    await modal.click()
                    await page.wait_for_timeout(400)
                await page.click('button[data-industry="food_beverage"]')
            await page.wait_for_timeout(800)
            
            # 1. Verify 'Tổng quan' is strictly on 1 line
            title_info = await page.eval_on_selector(
                '#pageTitle',
                '''el => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    const lineHeight = parseFloat(style.lineHeight) || 24;
                    const lines = Math.round(rect.height / lineHeight);
                    return {
                        text: el.innerText.trim(),
                        width: rect.width,
                        height: rect.height,
                        lines: lines,
                        isNowrap: style.whiteSpace === 'nowrap'
                    };
                }'''
            )
            print(f"Viewport {w}px: lines={title_info['lines']}, isNowrap={title_info['isNowrap']}, height={title_info['height']}px")
            assert title_info['lines'] <= 1, f"Expected 1 line for title on {w}px, got {title_info['lines']} lines!"
            assert title_info['isNowrap'], f"Expected white-space: nowrap on #pageTitle!"
            
            # 2. Verify NO 'Dang nhap' text in topActions
            top_actions_text = await page.eval_on_selector('#topActions', 'el => el.innerText.trim()')
            print(f"Viewport {w}px: TopActions has_login_text={'Đăng nhập' in top_actions_text}")
            assert 'Đăng nhập' not in top_actions_text, f"Found 'Đăng nhập' in topActions text: {top_actions_text}"
            
            # 3. Verify user button exists as clean icon-only button
            user_btn = page.locator('#topActions .user-badge-btn')
            assert await user_btn.count() > 0, "Missing user-badge-btn in topActions"
            
            # Capture topbar screenshot
            topbar_el = page.locator('.topbar').first
            await topbar_el.screenshot(path=f"tests/evidence/topbar_clean_{w}px.png")
            print(f"Captured tests/evidence/topbar_clean_{w}px.png")
            
            # Also capture top half of page on 390px (matching user screenshot)
            if w == 390:
                await page.screenshot(path="tests/evidence/dashboard_clean_topbar_390px.png", clip={'x': 0, 'y': 0, 'width': 390, 'height': 380})
                print("Captured tests/evidence/dashboard_clean_topbar_390px.png")
                
            await page.close()
            
        await browser.close()
        print("\nALL TOPBAR VERIFICATION CHECKS PASSED!")

if __name__ == '__main__':
    asyncio.run(run_verification())
