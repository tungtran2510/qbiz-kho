import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

def test_sticky_goods_search():
    print("\n========================================================")
    print(" TESTING STICKY GOODS SEARCH BAR ON MOBILE (390x844)")
    print("========================================================")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        
        console_errors = []
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' and 'status of 401' not in msg.text and 'favicon' not in msg.text else None)
        page.on('pageerror', lambda err: console_errors.append(str(err)))
        
        print("\n[1] Navigating to http://localhost:4180 ...")
        page.goto('http://localhost:4180', wait_until='networkidle')
        page.evaluate('''() => {
            sessionStorage.removeItem('qbiz_preview_demo');
            localStorage.setItem('qbiz_auth_session', JSON.stringify({
                access_token: 'test-token',
                user: { id: 'usr-sovereign', email: 'tungtran2510@gmail.com' }
            }));
            localStorage.setItem('qbiz_active_shop', JSON.stringify({
                id: 'shop-dlc',
                name: 'DLC Care'
            }));
        }''')
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(500)
        
        print("\n[2] Opening Hàng hóa tab...")
        page.click('#mobileNav button[data-page="products"]')
        page.wait_for_timeout(500)
        page.screenshot(path='tests/evidence/test_goods_sticky_initial.png')
        
        # Verify initial sticky search box
        initial_search = page.locator('.goods-search-sticky')
        assert initial_search.is_visible(), "Sticky search container must be visible!"
        init_box = initial_search.bounding_box()
        print(f"  - Initial search bar y: {init_box['y']}px, height: {init_box['height']}px")
        
        # Step 3: Scroll down 350px (vuốt lên màn hình)
        print("\n[3] Scrolling down 350px (vuốt lên)...")
        page.evaluate('window.scrollTo(0, 350)')
        page.wait_for_timeout(400)
        page.screenshot(path='tests/evidence/test_goods_sticky_scrolled.png')
        
        scrolled_state = page.evaluate('''() => {
            const sticky = document.querySelector('.goods-search-sticky');
            const box = sticky ? sticky.getBoundingClientRect() : null;
            const topbar = document.querySelector('.topbar');
            const topbarBox = topbar ? topbar.getBoundingClientRect() : null;
            const input = document.querySelector('#productSearch');
            const inputBox = input ? input.getBoundingClientRect() : null;
            return {
                scrollY: window.scrollY,
                stickyBox: box ? { y: box.y, height: box.height, bottom: box.bottom } : null,
                inputBox: inputBox ? { y: inputBox.y, height: inputBox.height } : null,
                topbarHidden: document.body.classList.contains('topbar-hidden')
            };
        }''')
        print(f"  - Scrolled state at scrollY={scrolled_state['scrollY']}:")
        print(f"    stickyBox y={scrolled_state['stickyBox']['y']}px, height={scrolled_state['stickyBox']['height']}px")
        print(f"    inputBox y={scrolled_state['inputBox']['y']}px, height={scrolled_state['inputBox']['height']}px")
        print(f"    topbarHidden={scrolled_state['topbarHidden']}")
        
        # Verify that stickyBox is docked right at top: 0!
        assert abs(scrolled_state['stickyBox']['y']) <= 2, f"Search bar must be at top (y=0)! Actual: {scrolled_state['stickyBox']['y']}"
        assert scrolled_state['stickyBox']['height'] <= 58, f"Search bar must be ultra-compact (<=58px)! Actual: {scrolled_state['stickyBox']['height']}"
        
        # Step 4: Scroll down deeply 800px
        print("\n[4] Scrolling down deeply 800px...")
        page.evaluate('window.scrollTo(0, 800)')
        page.wait_for_timeout(400)
        page.screenshot(path='tests/evidence/test_goods_sticky_scrolled_deep.png')
        
        deep_state = page.evaluate('''() => {
            const sticky = document.querySelector('.goods-search-sticky');
            const box = sticky ? sticky.getBoundingClientRect() : null;
            return { y: box ? box.y : null, height: box ? box.height : null };
        }''')
        print(f"  - Deep scrolled y={deep_state['y']}px, height={deep_state['height']}px")
        assert abs(deep_state['y']) <= 2, f"Deep scroll: Search bar must remain at top (y=0)! Actual: {deep_state['y']}"
        
        # Step 5: Test typing into the sticky search bar while scrolled!
        print("\n[5] Typing 'Ghế' into sticky search bar while scrolled...")
        page.fill('#productSearch', 'Ghế')
        page.wait_for_timeout(400)
        page.screenshot(path='tests/evidence/test_goods_sticky_searched.png')
        
        matched_count = page.evaluate('''() => {
            return document.querySelectorAll('.goods-row, .product-card').length;
        }''')
        print(f"  - Matched items for 'Ghế': {matched_count}")
        assert matched_count > 0, "Must find matching items for 'Ghế'!"
        
        # Step 6: Test clear search button
        print("\n[6] Testing clear search button...")
        clear_btn = page.locator('[data-clear-search]')
        assert clear_btn.is_visible(), "Clear search button must be visible when there is text!"
        clear_btn.click()
        page.wait_for_timeout(400)
        
        val_after_clear = page.evaluate('document.querySelector("#productSearch").value')
        print(f"  - Value after clear: '{val_after_clear}'")
        assert val_after_clear == '', "Input must be cleared!"
        
        # Step 7: Scroll back to top
        print("\n[7] Scrolling back to top (scrollY=0)...")
        page.evaluate('window.scrollTo(0, 0)')
        page.wait_for_timeout(500)
        page.screenshot(path='tests/evidence/test_goods_sticky_back_to_top.png')
        
        top_state = page.evaluate('''() => {
            return {
                scrollY: window.scrollY,
                topbarHidden: document.body.classList.contains('topbar-hidden')
            };
        }''')
        print(f"  - Back to top: scrollY={top_state['scrollY']}, topbarHidden={top_state['topbarHidden']}")
        assert not top_state['topbarHidden'], "Topbar must be visible at top of page!"
        
        print("\n[8] Console errors:", console_errors)
        assert len(console_errors) == 0, f"Must have 0 console errors! Got: {console_errors}"
        
        print("\n>>> ALL STICKY GOODS SEARCH TESTS PASSED SUCCESSFULLY! <<<")
        browser.close()

if __name__ == '__main__':
    test_sticky_goods_search()
