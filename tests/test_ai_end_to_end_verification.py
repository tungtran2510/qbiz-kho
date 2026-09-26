import io
import sys
import json
import time
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

test_suite = [
    # Dashboard
    ('dashboard', 'hôm nay bán được bao nhiêu', False),
    ('dashboard', 'hàng nào sắp hết', False),
    ('dashboard', 'xem mặt hàng nào gần hết', False),
    ('dashboard', 'tháng này nhập vào bao nhiêu hàng', False),
    ('dashboard', 'đề xuất những mặt hàng nào cần nhập', False),
    # Products
    ('products', 'còn bao nhiêu hàng', False),
    ('products', 'cái này còn bao nhiêu', False),
    ('products', 'nhập thêm 10 cái này vào kho chính', False),
    # POS
    ('pos', 'mở bán hàng', False),
    ('pos', 'thêm 2 gối F1 vào giỏ', False),
    # Warehouse
    ('warehouse', 'tháng này nhập vào bao nhiêu hàng', False),
    ('warehouse', 'kiểm kho', False),
    # Voice simulated tests across screens
    ('dashboard', 'tháng này nhập vào bao nhiêu hàng', True),
    ('pos', 'thêm 2 gối F1 vào giỏ', True),
    ('products', 'xem mặt hàng nào gần hết', True)
]

failures = []
results = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={'width': 390, 'height': 844})
    
    # Pre-inject mock speechSynthesis
    page.add_init_script("""
        window.__spokenUtterances__ = [];
        window.speechSynthesis = {
            speak: (u) => { window.__spokenUtterances__.push(u.text); },
            cancel: () => {},
            getVoices: () => [{ lang: 'vi-VN', name: 'Vietnamese Standard' }]
        };
    """)
    
    page.goto('http://localhost:4180/')
    page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
    
    # Open AI sheet
    page.click('#qbizAiTrigger')
    page.wait_for_timeout(400)
    
    for route, query, is_voice in test_suite:
        # Switch route
        page.evaluate(f"""() => {{
            window.__qbiz_app__.state.view = '{route}';
            if (window.__qbiz_app__.router) window.__qbiz_app__.router.navigate('{route}');
        }}""")
        page.wait_for_timeout(100)
        
        mode_label = "VOICE" if is_voice else "TEXT "
        
        if is_voice:
            # Simulate speech recognition end via canonical voice pipeline
            page.evaluate(f"""(text) => {{
                if (window.__qbiz_ai__ && window.__qbiz_ai__.submitVoiceTranscript) {{
                    window.__qbiz_ai__.submitVoiceTranscript(text);
                }}
            }}""", query)
        else:
            page.fill('#aiTextInput', query)
            page.click('#aiSendBtn')
            
        page.wait_for_timeout(600)
        
        eval_data = page.evaluate("""() => {
            const list = document.querySelectorAll('#aiMessagesList .ai-msg.assistant');
            if (!list.length) return { error: 'NO_ASSISTANT_MSG' };
            const last = list[list.length - 1];
            const bubble = last.querySelector('.ai-bubble-content');
            const cards = Array.from(last.querySelectorAll('.ai-candidates-box, .ai-proposal-card, .ai-attention-card, .ai-replenish-card, .ai-health-card, .ai-diagnosis-card')).map(el => el.className);
            const spoken = window.__spokenUtterances__ || [];
            return {
                bubbleText: bubble ? bubble.innerText.trim() : '',
                htmlLen: bubble ? bubble.innerHTML.length : 0,
                hasCards: cards.length > 0,
                cardClasses: cards,
                time: last.querySelector('.ai-msg-time')?.innerText || '',
                totalAssistantMsgs: list.length,
                spokenCount: spoken.length,
                lastSpoken: spoken.length > 0 ? spoken[spoken.length - 1] : null
            };
        }""")
        
        txt = eval_data.get('bubbleText', '')
        cards = eval_data.get('cardClasses', [])
        err = eval_data.get('error')
        spoken = eval_data.get('lastSpoken')
        
        if err or not txt or eval_data.get('htmlLen', 0) == 0:
            failures.append({
                'route': route,
                'query': query,
                'mode': mode_label,
                'error': err or 'BLANK_BUBBLE'
            })
            print(f"❌ [{route:9}] [{mode_label}] '{query}' -> FAILED: {err or 'BLANK_BUBBLE'}")
        else:
            res_item = {
                'route': route,
                'query': query,
                'mode': mode_label,
                'snippet': txt[:65].replace('\n', ' '),
                'cards': cards,
                'spoken': spoken[:50] if spoken else None
            }
            results.append(res_item)
            spoken_info = f" | TTS: '{spoken[:35]}...'" if is_voice and spoken else ""
            print(f"✅ [{route:9}] [{mode_label}] '{query:33}' -> '{txt[:50].replace(chr(10), ' ')}...' | CARDS: {cards}{spoken_info}")

    b.close()

print("\n" + "="*70)
print(f"TOTAL TESTS: {len(test_suite)} | PASSED: {len(results)} | FAILED: {len(failures)}")
print("="*70)

if failures:
    sys.exit(1)
