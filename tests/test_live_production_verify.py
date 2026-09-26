import sys, os
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        print('Testing live production at https://qbiz-kho.vercel.app...')
        page.goto('https://qbiz-kho.vercel.app', wait_until='networkidle')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
        page.evaluate("() => window.__qbiz_app__.previewDemo('fashion')")

        queries = [
            'xin chao',
            'cam on bot',
            'ban la ai',
            'hom nay the nao',
            'cai dat may in',
            'co vay linen ko',
            'vay linen gia bn'
        ]
        for q in queries:
            res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(r => ({
                    tier: r.tier,
                    intent: r.intent,
                    text: (r.text || '').replace(/\\n/g, ' ').slice(0, 65)
                }));
            }''', q)
            print(f"{q:<20} | Tier: {res['tier']} | Intent: {res['intent']:<18} | {res['text']}")
            assert res['tier'] == 0, f"Query '{q}' did not resolve at Tier 0 on production!"

        browser.close()
        print('\n=== LIVE PRODUCTION VERCEL VERIFIED 100% PASS ===')

if __name__ == '__main__':
    run_test()
