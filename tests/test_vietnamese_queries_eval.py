import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

TEST_QUERIES = [
    # 1. Teencode / viết tắt / doanh thu & lãi
    {"query": "hnay ban dc bn", "expected_category": "sales_revenue"},
    {"query": "hqua dthu bn", "expected_category": "sales_revenue"},
    {"query": "thg trc lai bn", "expected_category": "profit"},
    {"query": "co lai ko", "expected_category": "profit"},
    {"query": "loi dc bnhieu", "expected_category": "profit"},
    {"query": "dthu tru von con bn", "expected_category": "profit"},

    # 2. Bán chạy & hàng bán chậm
    {"query": "sp nao ban chay nhat", "expected_category": "top_selling"},
    {"query": "hang ban cham", "expected_category": "slow_moving"},

    # 3. Tiền mặt / Chuyển khoản / Két tiền
    {"query": "tien mat hom nay bn", "expected_category": "payment_breakdown"},
    {"query": "trong ket con bn tien", "expected_category": "payment_breakdown"},
    {"query": "chuyen khoan hom nay bn", "expected_category": "payment_breakdown"},
    {"query": "khach ck bn", "expected_category": "payment_breakdown"},
    {"query": "tien mat va chuyen khoan", "expected_category": "payment_breakdown"},

    # 4. Hàng sắp hết / Cảnh báo kho
    {"query": "hang nao sap het", "expected_category": "low_stock"},
    {"query": "sp sap het hang", "expected_category": "low_stock"},
    {"query": "cai gi sap het", "expected_category": "low_stock"},
    {"query": "mon nao sap het", "expected_category": "low_stock"},
    {"query": "canh bao ton kho", "expected_category": "low_stock"},

    # 5. Khách hàng
    {"query": "khach nao mua nhieu nhat", "expected_category": "top_customers"},
    {"query": "ai mua nhieu nhat", "expected_category": "top_customers"},
    {"query": "hom nay co may khach", "expected_category": "customer_count"},

    # 6. Tra cứu tồn sản phẩm cụ thể
    {"query": "con vay linen ko", "expected_category": "single_product_stock"},
    {"query": "con ao polo ko", "expected_category": "single_product_stock"},

    # 7. Hóa đơn & In ấn
    {"query": "tim lay hoa don gan nhat", "expected_category": "latest_invoice"},
    {"query": "in hd gan nhat", "expected_category": "print_invoice"},

    # 8. Bối rối / Lời giải thích / Teencode lạ
    {"query": "j co", "expected_category": "clarification_help"},
    {"query": "hieuw ko", "expected_category": "clarification_help"},
    {"query": "k hieu", "expected_category": "clarification_help"},
    {"query": "la sao", "expected_category": "clarification_help"},
    {"query": "j z tr", "expected_category": "clarification_help"},
    {"query": "noi j the", "expected_category": "clarification_help"},

    # 9. Khiếu nại / Bực mình / Báo lỗi
    {"query": "loi te le roi", "expected_category": "frustration_help"},
    {"query": "cha dc tich su j", "expected_category": "frustration_help"},
    {"query": "buc minh ghe", "expected_category": "frustration_help"},

    # 10. Đếm đơn trong ngày
    {"query": "co don nao chua", "expected_category": "sales_orders_count"},
    {"query": "nay dc may bill roi", "expected_category": "sales_orders_count"},

    # 11. Bán / Nhập tự nhiên
    {"query": "ban 2 vay linen", "expected_category": "cart_or_sale"},
    {"query": "nhap 5 ao thun", "expected_category": "receipt_proposal"},

    # 12. Điều khiển giọng đọc
    {"query": "tat tieng", "expected_category": "voice_mute"},
    {"query": "tat giong doc di", "expected_category": "voice_mute"},
    {"query": "im di dung noi nua", "expected_category": "voice_mute"},
    {"query": "bat tieng len", "expected_category": "voice_unmute"},

    # 13. Điều hướng ứng dụng
    {"query": "mo ban hang", "expected_category": "navigation"},
    {"query": "mo kho", "expected_category": "navigation"},
    {"query": "xem don hang", "expected_category": "navigation"},
    {"query": "cai dat may in", "expected_category": "print_settings"},

    # 14. Lịch sự / Ca trực / Giá
    {"query": "alo bot oi hnay ban the nao roi a", "expected_category": "sales_revenue"},
    {"query": "kiem tra ton kho giup em voi a", "expected_category": "stock_check"},
    {"query": "mon nay gia bn tien", "expected_category": "price_lookup"},
    {"query": "ai dang truc ca", "expected_category": "shift_info"}
]

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
        page.evaluate("() => window.__qbiz_app__.previewDemo('fashion')")
        page.wait_for_timeout(500)

        results = []
        for t in TEST_QUERIES:
            q = t['query']
            eval_res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(res => {
                    return {
                        query: query,
                        status: res.status || 'OK',
                        tier: res.tier,
                        skillId: res.skillId,
                        action_id: res.action_id || (res.action ? res.action.id : null),
                        intent: res.intent,
                        text: (res.text || '').slice(0, 150),
                        isFallback: (res.text || '').includes('Tôi có thể hỗ trợ bạn:') || (res.text || '').includes('Chưa hiểu') || (res.text || '').includes('không hiểu') || res.tier === 1 && !res.skillId
                    };
                }).catch(err => ({ query: query, error: err.message }));
            }''', q)
            results.append((t, eval_res))

        print(f"{'QUERY':<35} | {'TIER':<4} | {'SKILL/ACTION':<25} | {'FALLBACK?':<9} | TEXT PREVIEW")
        print("-" * 110)
        for t, r in results:
            skill_or_act = r.get('skillId') or r.get('action_id') or r.get('intent') or 'None'
            is_fb = "YES [FAIL]" if r.get('isFallback') else "NO [PASS]"
            txt = (r.get('text') or '').replace('\n', ' ')[:40]
            print(f"{t['query']:<35} | {str(r.get('tier')):<4} | {skill_or_act:<25} | {is_fb:<9} | {txt}")

        browser.close()

if __name__ == '__main__':
    main()
