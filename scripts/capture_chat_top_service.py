import sys
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    page.goto('http://localhost:4180/')
    page.wait_for_function('() => Boolean(window.__qbiz_app__ && window.__qbiz_ai__)')
    
    # 1. Preview Service demo
    page.evaluate('() => window.__qbiz_app__.previewDemo("service")')
    page.wait_for_timeout(600)
    
    # 2. Open AI Sheet
    page.evaluate('() => window.__qbiz_ai__.openSheet()')
    page.wait_for_timeout(500)
    
    # 3. Ask first question: "báo cáo dịch vụ nào được bán nhiều nhất"
    page.evaluate('async () => { await window.__qbiz_ai__.handleUserMessage("báo cáo dịch vụ nào được bán nhiều nhất"); }')
    page.wait_for_timeout(1000)

    # Capture screenshot of Top Service answer
    screenshot_path1 = 'tests/evidence/owner_chat_top_service_answer_390.png'
    page.screenshot(path=screenshot_path1)
    print(f'Evidence 1 saved: {screenshot_path1}')

    # 4. Ask second question: "dịch vụ nào được bán nhiều nhất"
    page.evaluate('async () => { await window.__qbiz_ai__.handleUserMessage("dịch vụ nào được bán nhiều nhất"); }')
    page.wait_for_timeout(1000)

    screenshot_path2 = 'tests/evidence/owner_chat_top_service_second_answer_390.png'
    page.screenshot(path=screenshot_path2)
    print(f'Evidence 2 saved: {screenshot_path2}')

    browser.close()
