import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

def inspect():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
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
        page.click('#mobileNav button[data-page="products"]')
        page.wait_for_timeout(500)
        page.screenshot(path='tests/evidence/test_goods_initial.png')
        
        # Scroll down 400px (vuốt lên)
        page.evaluate('window.scrollTo(0, 400)')
        page.wait_for_timeout(500)
        page.screenshot(path='tests/evidence/test_goods_scrolled.png')
        
        res = page.evaluate('''() => {
            const search = document.querySelector('.goods-search');
            const searchBox = search ? search.getBoundingClientRect() : null;
            const topbar = document.querySelector('.topbar');
            const topbarBox = topbar ? topbar.getBoundingClientRect() : null;
            return {
                scrollY: window.scrollY,
                searchBox: searchBox ? { y: searchBox.y, height: searchBox.height, bottom: searchBox.bottom } : null,
                topbarBox: topbarBox ? { y: topbarBox.y, height: topbarBox.height, bottom: topbarBox.bottom } : null,
                bodyClass: document.body.className
            };
        }''')
        print('Scrolled state:', res)
        browser.close()

if __name__ == '__main__':
    inspect()
