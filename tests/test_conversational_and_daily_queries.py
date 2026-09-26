import sys, os
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
        page.evaluate("() => window.__qbiz_app__.previewDemo('fashion')")

        test_cases = [
            # Chào hỏi
            ("xin chao", 0, "GREETING"),
            ("chao bot", 0, "GREETING"),
            ("alo bot", 0, "GREETING"),
            ("hello", 0, "GREETING"),
            ("alo em oi", 0, "GREETING"),
            # Cảm ơn
            ("cam on bot", 0, "GRATITUDE"),
            ("thanks", 0, "GRATITUDE"),
            ("cam on nha", 0, "GRATITUDE"),
            ("tuyet voi", 0, "GRATITUDE"),
            # Danh tính
            ("ban la ai", 0, "BOT_IDENTITY"),
            ("may la ai", 0, "BOT_IDENTITY"),
            ("bot la ai", 0, "BOT_IDENTITY"),
            # Tình hình tổng quan hôm nay
            ("hom nay the nao", 0, "DAILY_OVERVIEW"),
            ("tinh hinh hom nay the nao", 0, "DAILY_OVERVIEW"),
            ("tinh hinh ban hang the nao", 0, "DAILY_OVERVIEW"),
            ("buon ban the nao roi", 0, "DAILY_OVERVIEW"),
            # Hỏi tồn kho với 'có ... ko'
            ("co vay linen ko", 0, "PRODUCT_STOCK_INFO"),
            ("co quan jean ko", 0, "PRODUCT_STOCK_INFO"),
            # Hỏi giá trực tiếp
            ("vay linen gia bn", 0, "PRICE_LOOKUP"),
            ("gia vay linen", 0, "PRICE_LOOKUP"),
        ]

        print(f"{'QUERY':<30} | {'TIER':<4} | {'INTENT':<20} | {'STATUS':<7} | TEXT PREVIEW")
        print("-" * 110)

        all_passed = True
        for q, expected_tier, expected_intent in test_cases:
            res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(r => ({
                    tier: r.tier,
                    intent: r.intent,
                    text: (r.text || '').replace(/\\n/g, ' ')
                }));
            }''', q)

            tier = res['tier']
            intent = res['intent']
            txt = res['text'][:45]
            pass_tier = (tier == expected_tier)
            pass_intent = (intent == expected_intent)
            is_ok = pass_tier and pass_intent

            status = "PASS" if is_ok else "FAIL"
            if not is_ok:
                all_passed = False

            print(f"{q:<30} | {tier:<4} | {intent:<20} | {status:<7} | {txt}")
            assert pass_tier, f"Query '{q}' expected tier {expected_tier}, got {tier}"
            assert pass_intent, f"Query '{q}' expected intent {expected_intent}, got {intent}"

        print("\n" + "=" * 50)
        print("TẤT CẢ 20 TEST CASES HỘI THOẠI & THƯỜNG NGÀY ĐỀU PASS 100%!")
        print("=" * 50)
        browser.close()

if __name__ == '__main__':
    run_test()
