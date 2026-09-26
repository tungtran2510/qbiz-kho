import io
import sys
import os
import json
import time
from playwright.sync_api import sync_playwright

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = 'http://localhost:4180/'
INDUSTRIES = ['retail', 'fashion', 'food_beverage', 'service']

REQUIRED_QUERIES = [
    {
        'id': 'Q1',
        'query': 'tháng này lời bao nhiêu',
        'expected_period': 'month',
        'is_profit': True,
        'description': 'Owner Query 1 Exact'
    },
    {
        'id': 'Q2',
        'query': 'lợi nhuận hai ngày nay là bao nhiêu',
        'expected_period': '2_days',
        'is_profit': True,
        'description': 'Owner Query 2 Exact'
    },
    {
        'id': 'Q3',
        'query': 'hôm nay lãi bao nhiêu',
        'expected_period': 'today',
        'is_profit': True,
        'description': 'Daily profit inquiry'
    },
    {
        'id': 'Q4',
        'query': 'tuần này lợi nhuận bao nhiêu',
        'expected_period': '7d',
        'is_profit': True,
        'description': 'Weekly profit inquiry'
    },
    {
        'id': 'Q5',
        'query': 'doanh thu tháng này bao nhiêu',
        'expected_period': 'month',
        'is_profit': False,
        'expected_intent': 'SALES_SUMMARY',
        'description': 'Monthly revenue contrast query'
    },
    {
        'id': 'Q6',
        'query': 'lãi gộp tháng này bao nhiêu',
        'expected_period': 'month',
        'is_profit': True,
        'description': 'Monthly gross profit inquiry'
    },
    {
        'id': 'Q7',
        'query': '2 ngày nay bán được bao nhiêu',
        'expected_period': '2_days',
        'is_profit': False,
        'expected_intent': 'SALES_SUMMARY',
        'description': '2-day sales contrast query'
    },
    {
        'id': 'Q8',
        'query': 'từ đầu tháng đến nay lời bao nhiêu',
        'expected_period': 'month',
        'is_profit': True,
        'description': 'Month-to-date profit inquiry'
    },
]

def run_real_ui_verification():
    evidence_dir = os.path.join(os.path.dirname(__file__), 'evidence')
    os.makedirs(evidence_dir, exist_ok=True)

    results_matrix = []
    overall_pass = True

    print("==================================================================")
    print("STARTING REAL UI PLAYWRIGHT VERIFICATION FOR OWNER PROFIT QUERIES")
    print(f"Target URL: {BASE_URL}")
    print("==================================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 390x844 iPhone 12/13 mobile viewport
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        page.goto(BASE_URL)
        page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

        for ind in INDUSTRIES:
            print(f"\n>>> TESTING DEMO INDUSTRY: {ind.upper()} <<<")
            page.evaluate(f"() => window.__qbiz_app__.previewDemo('{ind}')")
            page.wait_for_timeout(800)

            # Get Ground Truth Profit from UI Engine (reportSales)
            ground_truth = page.evaluate("""() => {
                const repMonth = window.__qbiz_app__.reportSales('month');
                const rep2Days = window.__qbiz_app__.reportSales('2_days');
                const repToday = window.__qbiz_app__.reportSales('today');
                const repWeek = window.__qbiz_app__.reportSales('7d');
                return {
                    month: {
                        revenue: repMonth.net,
                        cost: repMonth.cost,
                        profit: repMonth.profit,
                        hasCost: repMonth.hasCost,
                        formattedProfit: new Intl.NumberFormat('vi-VN').format(repMonth.profit) + ' ₫'
                    },
                    twoDays: {
                        revenue: rep2Days.net,
                        cost: rep2Days.cost,
                        profit: rep2Days.profit,
                        hasCost: rep2Days.hasCost,
                        formattedProfit: new Intl.NumberFormat('vi-VN').format(rep2Days.profit) + ' ₫'
                    },
                    today: {
                        revenue: repToday.net,
                        cost: repToday.cost,
                        profit: repToday.profit,
                        hasCost: repToday.hasCost,
                        formattedProfit: new Intl.NumberFormat('vi-VN').format(repToday.profit) + ' ₫'
                    },
                    week: {
                        revenue: repWeek.net,
                        cost: repWeek.cost,
                        profit: repWeek.profit,
                        hasCost: repWeek.hasCost,
                        formattedProfit: new Intl.NumberFormat('vi-VN').format(repWeek.profit) + ' ₫'
                    }
                };
            }""")

            print(f"  Ground Truth [{ind}]: Month Profit = {ground_truth['month']['formattedProfit']} (Revenue: {ground_truth['month']['revenue']}, Cost: {ground_truth['month']['cost']})")
            print(f"  Ground Truth [{ind}]: 2 Days Profit = {ground_truth['twoDays']['formattedProfit']}")

            # Open AI Assistant Sheet
            ai_sheet = page.locator('#qbizAiSheet')
            if not ai_sheet.is_visible():
                page.click('#qbizAiTrigger')
                page.wait_for_timeout(400)

            for q_spec in REQUIRED_QUERIES:
                q_text = q_spec['query']
                page.fill('#aiTextInput', q_text)
                page.click('#aiSendBtn')
                page.wait_for_timeout(700)

                # Extract rendered assistant response from DOM and internal message store
                res_data = page.evaluate("""() => {
                    const history = window.__qbiz_app__.ai.getMessageHistory();
                    const last = history[history.length - 1];
                    const msgEls = document.querySelectorAll('.chat-message.assistant');
                    const lastMsgEl = msgEls[msgEls.length - 1];
                    const renderedDOM = lastMsgEl ? lastMsgEl.innerText : '';
                    return {
                        text: last?.text || '',
                        renderedDOM: renderedDOM,
                        tier: last?.tier,
                        provider: last?.provider,
                        intent: last?.intent,
                        skillId: last?.skillId,
                        summary: last?.summary,
                        hasCost: last?.hasCost,
                        isError: last?.isError,
                        permissionDenied: last?.permissionDenied
                    };
                }""")

                # Validate Grounding & Parity
                is_generic = 'Tôi có thể hỗ trợ bạn:' in (res_data.get('text') or '')
                pass_status = True

                expected_val_str = ""
                actual_val_str = ""

                if q_spec['is_profit']:
                    p_key = q_spec['expected_period']
                    gt = ground_truth.get('month' if p_key == 'month' else ('twoDays' if p_key == '2_days' else ('today' if p_key == 'today' else 'week')))
                    expected_val_str = gt['formattedProfit'] if gt else "N/A"
                    actual_val_str = (res_data.get('summary') or {}).get('formattedGrossProfit', 'N/A')

                    # Check parity if data has cost
                    if gt and gt['hasCost']:
                        if actual_val_str != expected_val_str and res_data.get('hasCost') != False:
                            pass_status = False
                    if is_generic:
                        pass_status = False
                    if res_data.get('intent') != 'PROFIT_INQUIRY' and res_data.get('skillId') != 'profit-inquiry':
                        pass_status = False
                else:
                    # Sales query
                    if is_generic or res_data.get('intent') != q_spec.get('expected_intent', 'SALES_SUMMARY'):
                        pass_status = False
                    actual_val_str = (res_data.get('summary') or {}).get('formattedRevenue', 'N/A')
                    expected_val_str = "Revenue Data"

                if not pass_status:
                    overall_pass = False

                status_label = "PASS" if pass_status else "FAIL"
                print(f"  [{q_spec['id']}] '{q_text}' -> {status_label}")
                print(f"      Intent: {res_data.get('intent')} | Expected: {expected_val_str} | Actual: {actual_val_str}")
                print(f"      DOM Rendered: {res_data.get('text', '')[:100]}...")

                results_matrix.append({
                    'industry': ind,
                    'query_id': q_spec['id'],
                    'query': q_text,
                    'expected_period': q_spec['expected_period'],
                    'expected_value': expected_val_str,
                    'actual_value': actual_val_str,
                    'tool': 'get_profit_summary' if q_spec['is_profit'] else 'get_sales_summary',
                    'intent': res_data.get('intent'),
                    'source': 'deterministic_report',
                    'ui_rendered': res_data.get('text'),
                    'pass': pass_status
                })

            # Capture Industry AI Verification Screenshot
            screenshot_path = os.path.join(evidence_dir, f"owner_real_profit_chat_{ind}.png")
            page.screenshot(path=screenshot_path)
            print(f"  Captured screenshot: {screenshot_path}")

        browser.close()

    print("\n==================================================================")
    print("FINAL SUMMARY OF REAL UI PLAYWRIGHT VERIFICATION:")
    total_checks = len(results_matrix)
    passed_checks = sum(1 for r in results_matrix if r['pass'])
    print(f"Total checks: {total_checks} | Passed: {passed_checks} | Failed: {total_checks - passed_checks}")
    print(f"Overall Real UI Verdict: {'PASS' if overall_pass else 'FAIL'}")
    print("==================================================================")

    # Save JSON report
    report_file = os.path.join(evidence_dir, "owner_real_profit_ui_report.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            'overall_pass': overall_pass,
            'total_checks': total_checks,
            'passed_checks': passed_checks,
            'results_matrix': results_matrix
        }, f, ensure_ascii=False, indent=2)

    return overall_pass

if __name__ == '__main__':
    ok = run_real_ui_verification()
    if not ok:
        sys.exit(1)
