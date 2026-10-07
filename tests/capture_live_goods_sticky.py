import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

def capture_live():
    print("\n========================================================")
    print(" CAPTURING LIVE EVIDENCE FROM VERCEL PRODUCTION (390x844)")
    print("========================================================")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        
        print("\n[1] Navigating to https://qbiz-kho.vercel.app ...")
        page.goto('https://qbiz-kho.vercel.app', wait_until='networkidle')
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
        page.wait_for_timeout(600)
        
        # 1. Mở tab Hàng hóa ở đầu trang
        print("\n[2] Capturing Hàng hóa at top (scrollY=0)...")
        page.click('#mobileNav button[data-page="products"]')
        page.wait_for_timeout(600)
        page.screenshot(path='tests/evidence/live_vercel_goods_top.png')
        
        # 2. Vuốt lên (cuộn xuống 350px)
        print("\n[3] Capturing Hàng hóa scrolled (vuốt lên cuộn danh sách)...")
        page.evaluate('window.scrollTo(0, 350)')
        page.wait_for_timeout(500)
        page.screenshot(path='tests/evidence/live_vercel_goods_scrolled.png')
        
        # 3. Gõ tìm kiếm ngay trên thanh sticky
        print("\n[4] Capturing Hàng hóa searched while scrolled...")
        page.fill('#productSearch', 'Ghế')
        page.wait_for_timeout(500)
        page.screenshot(path='tests/evidence/live_vercel_goods_searched.png')
        
        # 4. Xóa tìm kiếm và cuộn sâu 700px
        print("\n[5] Capturing Hàng hóa deep scroll...")
        page.click('[data-clear-search]')
        page.wait_for_timeout(300)
        page.evaluate('window.scrollTo(0, 700)')
        page.wait_for_timeout(500)
        page.screenshot(path='tests/evidence/live_vercel_goods_deep.png')
        
        print("\n[OK] All live screenshots captured successfully!")
        browser.close()

if __name__ == '__main__':
    capture_live()
