from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
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
    page.click('#desktopNav button[data-page="products"]')
    page.wait_for_timeout(500)
    page.screenshot(path='tests/evidence/test_goods_desktop_initial.png')
    page.evaluate('window.scrollTo(0, 400)')
    page.wait_for_timeout(400)
    page.screenshot(path='tests/evidence/test_goods_desktop_scrolled.png')
    sticky = page.locator('.goods-search-sticky').bounding_box()
    print('Desktop sticky search bar:', sticky)
    browser.close()
