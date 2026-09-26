import io, sys, json
from playwright.sync_api import sync_playwright
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 390, 'height': 844})
    page.goto('http://localhost:4180/')
    page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
    
    info = page.evaluate('''() => {
        return {
            role: window.__qbiz_app__.getRole ? window.__qbiz_app__.getRole() : 'unknown',
            shop: window.__qbiz_app__.getActiveShop ? window.__qbiz_app__.getActiveShop() : null,
            route: window.__qbiz_app__.getRoute ? window.__qbiz_app__.getRoute() : 'dashboard',
            demo: sessionStorage.getItem('qbiz_preview_demo'),
            providerConfig: window.__qbiz_app__.ai.getProviderConfig ? window.__qbiz_app__.ai.getProviderConfig() : null
        };
    }''')
    print('Info:', json.dumps(info, ensure_ascii=False, indent=2))
    
    # Open AI Sheet
    page.click('#qbizAiTrigger')
    page.wait_for_timeout(400)
    
    queries = [
        'tháng này lời bao nhiêu',
        'lợi nhuận hai ngày nay là bao nhiêu'
    ]
    
    for q in queries:
        page.fill('#aiTextInput', q)
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)
        
        last_msg = page.evaluate('''() => {
            const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg.assistant'));
            return msgs.length ? msgs[msgs.length - 1].innerText : 'NO_MSG';
        }''')
        print(f'Query: "{q}"')
        print(f'Response:\n{last_msg}')
        print('='*50)
    b.close()
