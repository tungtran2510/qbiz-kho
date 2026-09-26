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
    page.wait_for_function('() => Boolean(window.__qbiz_app__)')
    
    # 1. Preview Service demo
    page.evaluate('() => window.__qbiz_app__.previewDemo("service")')
    page.wait_for_timeout(600)
    
    # 2. Open AI Sheet
    page.evaluate('() => window.__qbiz_app__.openAiSheet?.()')
    page.wait_for_timeout(500)
    
    # 3. Ask first question: "báo cáo dịch vụ nào được bán nhiều nhất"
    page.evaluate('async () => { await window.__qbiz_app__.submitAiPrompt?.("báo cáo dịch vụ nào được bán nhiều nhất"); }')
    page.wait_for_timeout(1000)
    
    # 4. Ask second question: "dịch vụ nào được bán nhiều nhất"
    page.evaluate('async () => { await window.__qbiz_app__.submitAiPrompt?.("dịch vụ nào được bán nhiều nhất"); }')
    page.wait_for_timeout(1000)

    # 5. Ask third question: "AI còn hoạt động ko"
    page.evaluate('async () => { await window.__qbiz_app__.submitAiPrompt?.("AI còn hoạt động ko"); }')
    page.wait_for_timeout(1000)

    page.screenshot(path='tests/evidence/ai_chat_owner_all_questions_390.png')
    print('Evidence screenshot saved: tests/evidence/ai_chat_owner_all_questions_390.png')
    browser.close()
