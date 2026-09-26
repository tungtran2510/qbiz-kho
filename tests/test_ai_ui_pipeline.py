import io
import sys
import json
import time
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

queries = [
    ('dashboard', 'hôm nay bán được bao nhiêu'),
    ('dashboard', 'hàng nào sắp hết'),
    ('dashboard', 'xem mặt hàng nào gần hết'),
    ('dashboard', 'tháng này nhập vào bao nhiêu hàng'),
    ('dashboard', 'đề xuất những mặt hàng nào cần nhập'),
    ('products', 'còn bao nhiêu hàng'),
    ('products', 'cái này còn bao nhiêu'),
    ('products', 'nhập thêm 10 cái này vào kho chính'),
    ('pos', 'mở bán hàng'),
    ('pos', 'thêm 2 gối F1 vào giỏ'),
    ('warehouse', 'tháng này nhập vào bao nhiêu hàng'),
    ('warehouse', 'kiểm kho')
]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 390, 'height': 844})
    page.goto('http://localhost:4180/')
    page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
    page.evaluate('() => window.__qbiz_app__.previewDemo("retail")')
    page.wait_for_timeout(500)
    
    # Open AI sheet
    page.click('#qbizAiTrigger')
    page.wait_for_timeout(400)
    
    for route, q in queries:
        page.evaluate(f"""() => {{
            window.__qbiz_app__.state.view = '{route}';
            if (window.__qbiz_app__.router) window.__qbiz_app__.router.navigate('{route}');
        }}""")
        page.wait_for_timeout(100)
        
        # Fill input and click send
        page.fill('#aiTextInput', q)
        page.click('#aiSendBtn')
        page.wait_for_timeout(600)
        
        last_msg = page.evaluate("""() => {
            const list = document.querySelectorAll('#aiMessagesList .ai-msg.assistant');
            if (!list.length) return { error: 'NO_ASSISTANT_MSG' };
            const last = list[list.length - 1];
            const bubble = last.querySelector('.ai-bubble-content');
            const cards = Array.from(last.querySelectorAll('.ai-candidates-box, .ai-proposal-card, .ai-attention-card, .ai-replenish-card, .ai-health-card, .ai-diagnosis-card')).map(el => el.className);
            return {
                bubbleText: bubble ? bubble.innerText.trim() : '',
                hasCards: cards.length > 0,
                cardClasses: cards,
                time: last.querySelector('.ai-msg-time')?.innerText || ''
            };
        }""")
        txt = last_msg.get('bubbleText', '').replace('\n', ' ')
        cards = last_msg.get('cardClasses', [])
        print(f"[{route:9}] '{q:35}' -> TXT: '{txt[:60]}...' | CARDS: {cards}")

    b.close()
