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
VIEWPORTS = [
    {'name': '360', 'width': 360, 'height': 800},
    {'name': '390', 'width': 390, 'height': 844},
    {'name': '412', 'width': 412, 'height': 915},
    {'name': '430', 'width': 430, 'height': 932},
    {'name': '1440', 'width': 1440, 'height': 900},
]

def run_tests():
    evidence_dir = os.path.join(os.path.dirname(__file__), 'evidence')
    os.makedirs(evidence_dir, exist_ok=True)
    report = {
        'entry_overlay_viewports': [],
        'demo_profit_industries': [],
        'ai_owner_queries': [],
        'cashier_security_check': None,
        'overall_status': 'PENDING'
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ====================================================================
        # PART 1: ENTRY OVERLAY ACROSS 5 VIEWPORTS
        # ====================================================================
        print("=== PART 1: ENTRY OVERLAY ACROSS 5 VIEWPORTS ===")
        for vp in VIEWPORTS:
            context = browser.new_context(viewport={'width': vp['width'], 'height': vp['height']})
            page = context.new_page()
            page.goto(BASE_URL)
            page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

            # Check overlay existence
            overlay = page.locator('.public-entry-overlay')
            card = page.locator('.public-entry-card')
            assert overlay.is_visible(), f"Overlay not visible at viewport {vp['name']}"
            assert card.is_visible(), f"Entry card not visible at viewport {vp['name']}"

            # Check 3 CTAs
            btn_create = page.locator('.public-entry-card button[data-action="create-shop-modal"]')
            btn_login = page.locator('.public-entry-card button[data-action="open-auth-modal"]')
            btn_demo = page.locator('.public-entry-card button[data-action="preview-demo"]')
            assert btn_create.is_visible(), f"Create shop button not visible at {vp['name']}"
            assert btn_login.is_visible(), f"Login button not visible at {vp['name']}"
            assert btn_demo.is_visible(), f"Preview demo button not visible at {vp['name']}"

            # Check 4 industries
            for ind_key in ['retail', 'fashion', 'food_beverage', 'service']:
                ind_btn = page.locator(f'.public-entry-card button[data-action="select-demo-industry"][data-industry="{ind_key}"]')
                assert ind_btn.is_visible(), f"Industry button {ind_key} not visible at {vp['name']}"

            # Check quick login
            assert page.locator('#quickGoogleLoginBtn').is_visible()
            assert page.locator('#quickLoginEmail').is_visible()
            assert page.locator('#quickLoginPassword').is_visible()
            assert page.locator('#quickLoginBtn').is_visible()

            # Check underlying dashboard is blurred
            under = page.locator('.dashboard-under-overlay')
            assert under.count() > 0, f".dashboard-under-overlay missing at {vp['name']}"

            screenshot_path = os.path.join(evidence_dir, f"entry_overlay_{vp['name']}.png")
            page.screenshot(path=screenshot_path, full_page=False)
            print(f"  ✓ Viewport {vp['name']}: Overlay, 3 CTAs, 4 industries, Google/email verified. Shot: {screenshot_path}")

            report['entry_overlay_viewports'].append({
                'viewport': vp['name'],
                'overlay_visible': True,
                'ctas_present': ['Tạo shop', 'Đăng nhập', 'Xem shop demo'],
                'screenshot': screenshot_path
            })
            context.close()

        # ====================================================================
        # PART 2: DEMO SHOWROOM & DETERMINISTIC PROFIT
        # ====================================================================
        print("\n=== PART 2: DEMO SHOWROOM & PROFIT COMPUTATION ===")
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        page.goto(BASE_URL)
        page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

        for ind_key in ['retail', 'fashion', 'food_beverage', 'service']:
            # Load demo industry
            page.evaluate(f"() => window.__qbiz_app__.previewDemo('{ind_key}')")
            page.wait_for_timeout(1000)

            # Check demo banner
            banner = page.locator('.demo-preview-banner')
            assert banner.is_visible(), f"Demo preview banner not visible for {ind_key}"

            # Check overlay is gone
            assert page.locator('.public-entry-overlay').count() == 0, f"Overlay still present for {ind_key}"

            # Check Dashboard profit subcard
            profit_subcard = page.locator('.dashboard-sales-subcard:has-text("Lợi nhuận")')
            assert profit_subcard.is_visible(), f"Profit subcard not visible for {ind_key}"
            profit_text = profit_subcard.locator('b').inner_text()
            print(f"  [{ind_key}] Dashboard Lợi nhuận KPI: {profit_text}")
            assert profit_text != 'Chưa đủ dữ liệu', f"Profit KPI is still 'Chưa đủ dữ liệu' for {ind_key}!"
            assert '₫' in profit_text, f"Profit KPI format missing ₫ for {ind_key}: {profit_text}"

            # Check reports page
            page.evaluate("() => { window.__qbiz_app__.navigate('reports'); }")
            page.wait_for_timeout(800)
            page.wait_for_selector('.report-center', timeout=5000)

            gross_profit_section = page.locator('section:has-text("Lợi nhuận gộp")').first
            assert gross_profit_section.is_visible(), f"Gross profit section not visible in reports for {ind_key}"
            gross_val = gross_profit_section.locator('div:has-text("Lợi nhuận gộp") b').first.inner_text()
            cost_val = gross_profit_section.locator('div:has-text("Tổng giá vốn") b').first.inner_text()
            print(f"  [{ind_key}] Reports: Giá vốn = {cost_val}, Lợi nhuận gộp = {gross_val}")
            assert '₫' in gross_val, f"Reports gross profit missing ₫ for {ind_key}"
            assert '₫' in cost_val, f"Reports cost missing ₫ for {ind_key}"

            screenshot_path = os.path.join(evidence_dir, f"demo_profit_{ind_key}.png")
            page.screenshot(path=screenshot_path)

            report['demo_profit_industries'].append({
                'industry': ind_key,
                'dashboard_profit_kpi': profit_text,
                'reports_cost': cost_val,
                'reports_gross_profit': gross_val,
                'screenshot': screenshot_path
            })

            # Navigate back to dashboard
            page.evaluate("() => { window.__qbiz_app__.navigate('dashboard'); }")
            page.wait_for_timeout(500)

        # ====================================================================
        # PART 3: OWNER BASIC AI QUERIES ON REAL UI
        # ====================================================================
        print("\n=== PART 3: OWNER BASIC AI QUERIES ON REAL UI ===")
        # Ensure we are in Retail industry as OWNER
        page.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
        page.wait_for_timeout(800)

        # Open AI Sheet
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        assert page.locator('#qbizAiSheet').is_visible(), "AI Sheet did not open"

        queries = [
            "Hôm nay bán bao nhiêu?",
            "Tháng này bán được bao nhiêu?",
            "Hôm nay lời bao nhiêu?",
            "Tháng này lợi nhuận thế nào?",
            "Hàng nào sắp hết?",
            "Cần nhập thêm hàng gì?",
            "Sản phẩm này giá bao nhiêu?",
            "Mở màn hình bán hàng",
            "Mở kho hàng",
            "Mở sổ ca",
            "Mở sổ quỹ",
            "Kiểm tra dữ liệu"
        ]

        for q in queries:
            page.fill('#aiTextInput', q)
            page.click('#aiSendBtn')
            try:
                page.wait_for_function("() => { const h = window.__qbiz_app__?.ai?.getMessageHistory?.() || []; return h.length > 0 && h[h.length - 1].role === 'assistant'; }", timeout=3000)
            except Exception:
                page.wait_for_timeout(500)

            # Get latest assistant response
            res_meta = page.evaluate("""() => {
                const history = window.__qbiz_app__.ai.getMessageHistory();
                const last = history[history.length - 1];
                return {
                    historyLen: history.length,
                    role: last?.role,
                    text: last?.text,
                    tier: last?.tier,
                    provider: last?.provider,
                    trace: last?.trace,
                    compactTrace: last?.compactTrace,
                    skillId: last?.skillId,
                    actionId: last?.actionId,
                    isError: last?.isError,
                    permissionDenied: last?.permissionDenied
                };
            }""")

            print(f"  Query: '{q}'")
            print(f"    -> Tier: {res_meta.get('tier')} | Provider: {res_meta.get('provider')} | Trace: {res_meta.get('trace')}")
            print(f"    -> Text: {res_meta.get('text', '')[:120]}...")
            assert res_meta.get('role') == 'assistant', f"Expected assistant response for '{q}'"
            assert res_meta.get('text'), f"Empty assistant response for '{q}'"
            assert not res_meta.get('isError'), f"Unexpected error for query '{q}': {res_meta.get('text')}"

            report['ai_owner_queries'].append({
                'query': q,
                'response': res_meta.get('text'),
                'tier': res_meta.get('tier'),
                'provider': res_meta.get('provider'),
                'trace': res_meta.get('trace'),
                'status': 'PASS'
            })

        ai_screenshot = os.path.join(evidence_dir, "owner_basic_queries_ai_chat.png")
        page.screenshot(path=ai_screenshot)
        print(f"  ✓ All 12 queries passed. Screenshot: {ai_screenshot}")

        # ====================================================================
        # PART 4: CASHIER ROLE HARD DENY VERIFICATION
        # ====================================================================
        print("\n=== PART 4: CASHIER ROLE HARD DENY VERIFICATION ===")
        # Switch to CASHIER role
        page.evaluate("() => window.__qbiz_app__.loadDemoIndustry('retail', 'CASHIER')")
        page.wait_for_timeout(800)

        # Open AI Sheet if closed
        if not page.locator('#qbizAiSheet').is_visible():
            page.click('#qbizAiTrigger')
            page.wait_for_timeout(500)

        page.fill('#aiTextInput', 'Hôm nay lời bao nhiêu?')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1000)

        cashier_res = page.evaluate("""() => {
            const history = window.__qbiz_app__.ai.getMessageHistory();
            const last = history[history.length - 1];
            return {
                text: last?.text,
                permissionDenied: last?.permissionDenied,
                isError: last?.isError
            };
        }""")

        print(f"  Cashier profit query response: {cashier_res.get('text')}")
        assert 'Từ chối truy cập' in cashier_res.get('text') or 'HARD DENY' in cashier_res.get('text') or 'VIEW_COST' in cashier_res.get('text'), "Cashier was not denied profit query!"
        print("  ✓ Cashier HARD DENY successfully enforced for financial query.")

        report['cashier_security_check'] = {
            'query': 'Hôm nay lời bao nhiêu?',
            'response': cashier_res.get('text'),
            'denied': True,
            'status': 'PASS'
        }

        report['overall_status'] = 'ALL_PASS'
        report_path = os.path.join(evidence_dir, 'owner_basic_queries_and_entry_report.json')
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"\nAll verification tests completed successfully. Report saved to: {report_path}")

        browser.close()

if __name__ == '__main__':
    run_tests()
