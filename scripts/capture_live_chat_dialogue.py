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
    
    # 4. Ask second question: "AI còn hoạt động ko"
    page.evaluate('async () => { await window.__qbiz_ai__.handleUserMessage("AI còn hoạt động ko"); }')
    page.wait_for_timeout(1000)

    # 5. Capture screenshot showing chat bubbles with exact answers
    screenshot_path = 'tests/evidence/owner_real_chat_service_answers_390.png'
    page.screenshot(path=screenshot_path)
    print(f'Evidence screenshot saved: {screenshot_path}')
    browser.close()
