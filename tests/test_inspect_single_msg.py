import io
import sys
import json
from playwright.sync_api import sync_playwright
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 390, 'height': 844})
    page.goto('http://localhost:4180/')
    page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
    page.click('#qbizAiTrigger')
    page.wait_for_timeout(400)
    page.fill('#aiTextInput', 'hôm nay bán được bao nhiêu')
    page.click('#aiSendBtn')
    page.wait_for_timeout(800)
    
    data = page.evaluate("""() => {
        const msgs = Array.from(document.querySelectorAll('#aiMessagesList .ai-msg')).map(m => ({
            role: m.className,
            html: m.innerHTML
        }));
        return {
            msgCount: msgs.length,
            msgs,
            history: window.__qbiz_app__.ai.getMessageHistory ? window.__qbiz_app__.ai.getMessageHistory() : 'no getMessageHistory'
        };
    }""")
    print('Message count:', data['msgCount'])
    for idx, m in enumerate(data['msgs']):
        print(f"Msg {idx} ({m['role']}):")
        print(m['html'])
        print('---')
    if isinstance(data.get('history'), list):
        print('History length:', len(data['history']))
        for idx, h in enumerate(data['history']):
            print(f"History {idx}:", json.dumps(h, ensure_ascii=False))
    b.close()
