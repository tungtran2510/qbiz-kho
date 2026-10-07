import sys, io, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

TEST_QUERIES = [
    'xuất file hàng hóa',
    'xuất hóa đơn',
    'nhập hàng',
    'tạo phiếu xuất kho',
    'kiểm kê kho',
    'bán hàng',
    'thêm hàng hóa mới',
    'sửa giá bán sản phẩm',
    'xem công nợ',
    'doanh thu hôm nay'
]

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        page.goto('https://qbiz-kho.vercel.app/?page=products', wait_until='networkidle')
        page.wait_for_timeout(1500)
        page.locator('#qbizAiTrigger').click()
        page.wait_for_timeout(1500)
        
        badge_el = page.locator('#aiProviderBadge')
        badge = badge_el.inner_text() if badge_el.count() > 0 else 'UNKNOWN'
        print('=== KIỂM THỬ TRỰC TIẾP TRÊN VERCEL PRODUCTION (KHO.QBIZ.VN) ===')
        print('Vercel Badge:', badge)
        
        prod_results = []
        for idx, q in enumerate(TEST_QUERIES, 1):
            page.locator('#aiTextInput').fill(q)
            page.locator('#aiSendBtn').click()
            page.wait_for_timeout(3500)
            bubbles = page.locator('.ai-msg.assistant .ai-bubble-content')
            txt = bubbles.last.inner_text() if bubbles.count() > 0 else ''
            first_line = txt.strip().split('\n')[0] if txt.strip() else '(Trống)'
            print(f'[{idx:02d}] Query: "{q}"')
            print(f'     Resp : "{first_line}"\n')
            prod_results.append({'id': idx, 'query': q, 'response': txt})
            if q == 'xuất file hàng hóa':
                page.screenshot(path='docs/evidence_vercel_xuat_file.png')
        
        page.screenshot(path='docs/evidence_vercel_ai_battery.png')
        with open('docs/vercel_ai_results.json', 'w', encoding='utf-8') as f:
            json.dump({'badge': badge, 'results': prod_results}, f, ensure_ascii=False, indent=2)
        browser.close()

if __name__ == '__main__':
    run()
