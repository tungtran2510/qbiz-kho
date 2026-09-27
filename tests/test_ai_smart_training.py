import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        
        # 1. Open app on local port 4180
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
        page.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
        page.wait_for_timeout(600)

        test_cases = [
            {
                "id": "SCENARIO_1_NEW_ORDERS",
                "query": "Có đơn nào mới",
                "expected_intent": "DAILY_ORDERS_COUNT",
                "must_contain": ["Đơn", "Hôm nay"],
            },
            {
                "id": "SCENARIO_2_SHIPPING",
                "query": "Kết nối đơn vị vận chuyển",
                "expected_intent": "SHIPPING_INQUIRY",
                "must_contain": ["vận chuyển", "GHTK", "GHN"],
            },
            {
                "id": "SCENARIO_3_CONTEXTUAL_PRODUCT",
                "query": "Hàng này hết",
                "expected_intent": "CONTEXTUAL_STOCK",
                "must_contain": ["HÀNG", "tồn thực"],
            },
            {
                "id": "SCENARIO_4_INVOICE_REPORT",
                "query": "Báo cáo hoa đơn",
                "expected_intent": "INVOICE_REPORT",
                "must_contain": ["hóa đơn", "doanh thu"],
            },
            {
                "id": "SCENARIO_5_ACCOUNTING_CASHFLOW",
                "query": "Sổ quỹ",
                "expected_intent": "ACCOUNTING_CASHFLOW",
                "must_contain": ["Sổ quỹ", "Tiền mặt", "chuyển khoản"],
            },
            {
                "id": "SCENARIO_6_CUSTOMER_DEBT",
                "query": "công nợ khách",
                "expected_intent": "CUSTOMER_DEBT",
                "must_contain": ["công nợ"],
            },
            {
                "id": "SCENARIO_7_FALLBACK_COMPACT",
                "query": "câu hỏi hoàn toàn xa lạ không có trong dữ liệu xyz12345",
                "must_not_contain": ["Bạn có thể thử:", "Kiểm tra tồn kho:", "Lợi nhuận:", "Hàng sắp hết:"],
                "must_contain": ["Em chưa hiểu rõ câu này"],
            }
        ]

        print("=== RUNNING AI SMART TRAINING TEST SUITE ===")
        all_passed = True
        
        for tc in test_cases:
            res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(r => {
                    return {
                        text: r.text || '',
                        intent: r.intent || '',
                        tier: r.tier,
                        status: r.status
                    };
                });
            }''', tc['query'])

            print(f"\n[TEST {tc['id']}] Query: '{tc['query']}'")
            print(f" -> Intent: {res.get('intent')}, Tier: {res.get('tier')}")
            print(f" -> Output: {res.get('text')[:90]}...")

            if 'expected_intent' in tc and res.get('intent') != tc['expected_intent']:
                print(f"FAILED: Expected intent '{tc['expected_intent']}', got '{res.get('intent')}'")
                all_passed = False
                continue

            if 'must_contain' in tc:
                for mc in tc['must_contain']:
                    if mc.lower() not in res.get('text', '').lower():
                        print(f"FAILED: Expected output to contain '{mc}'")
                        all_passed = False

            if 'must_not_contain' in tc:
                for mnc in tc['must_not_contain']:
                    if mnc.lower() in res.get('text', '').lower():
                        print(f"FAILED: Output contained forbidden text '{mnc}'")
                        all_passed = False

        # Proposal Card HTML Verification
        print("\n[TEST PROPOSAL CARD COMPACT RENDERING]")
        card_html = page.evaluate('''() => {
            const p = {
                id: 'prop_test_1',
                intent: 'create_receipt_proposal',
                risk_level: 'HIGH_RISK_WRITE',
                human_summary: 'Đề xuất nhập thêm 5 cái cho sản phẩm "Ghế sáng chế 135" vào Kho Mặc Định',
                parameters: {
                    productId: 'p_135',
                    productName: 'Ghế sáng chế 135',
                    warehouseId: 'wh_default',
                    variantId: '',
                    variantName: '',
                    quantity: 5,
                    costPrice: 0,
                    notes: 'AI đề xuất'
                },
                status: 'PENDING'
            };
            // Mock render card
            const m = { proposal: p };
            // Call formatMessage from ui
            return window.__qbiz_app__.ai.renderProposalHtml ? window.__qbiz_app__.ai.renderProposalHtml(p) : 'N/A';
        }''')
        
        # Test rendering directly by checking ui format
        ui_test = page.evaluate('''() => {
            // Check if DOM contains ai-proposal-card styles and ui module
            return {
                hasStyles: !!document.querySelector('link[href*="styles.css"]'),
                hasAi: !!window.__qbiz_app__.ai
            };
        }''')
        print(f"UI checks: {ui_test}")

        browser.close()
        
        if all_passed:
            print("\n>>> ALL AI SMART TRAINING TESTS PASSED! <<<")
            sys.exit(0)
        else:
            print("\n>>> SOME TESTS FAILED <<<")
            sys.exit(1)

if __name__ == '__main__':
    run_tests()
