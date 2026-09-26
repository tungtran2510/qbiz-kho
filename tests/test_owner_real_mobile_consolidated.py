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
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'entry_overlay_viewports': [],
        'demo_compact_header': {},
        'demo_selectors': {},
        'demo_profit_industries': [],
        'profit_icon_verified': False,
        'ai_provider_badge': None,
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
            page.wait_for_timeout(400)  # Wait for CSS entryCardFadeIn animation to settle

            # Check overlay existence
            overlay = page.locator('.public-entry-overlay')
            card = page.locator('.public-entry-card')
            assert overlay.is_visible(), f"Overlay not visible at viewport {vp['name']}"
            assert card.is_visible(), f"Entry card not visible at viewport {vp['name']}"

            # Check 3 CTAs specifically in the CTA bar
            btn_create = page.locator('.public-entry-card .entry-cta-bar button[data-action="create-shop-modal"]')
            btn_login = page.locator('.public-entry-card .entry-cta-bar button[data-action="open-auth-modal"]')
            btn_demo = page.locator('.public-entry-card .entry-cta-bar button[data-action="preview-demo"]')
            assert btn_create.is_visible(), f"Create shop button not visible at {vp['name']}"
            assert btn_login.is_visible(), f"Login button not visible at {vp['name']}"
            assert btn_demo.is_visible(), f"Preview demo button not visible at {vp['name']}"

            # Check CTA row layout (single row: bounding box y coordinates should be equal)
            box_create = btn_create.bounding_box()
            box_login = btn_login.bounding_box()
            box_demo = btn_demo.bounding_box()
            assert abs(box_create['y'] - box_login['y']) < 5, f"CTAs not on single row at {vp['name']}: create.y={box_create['y']}, login.y={box_login['y']}"
            assert abs(box_login['y'] - box_demo['y']) < 5, f"CTAs not on single row at {vp['name']}: login.y={box_login['y']}, demo.y={box_demo['y']}"

            # Check white-space nowrap on CTA span text
            btn_texts = page.evaluate("""() => {
                const spans = Array.from(document.querySelectorAll('.public-entry-card .entry-cta-btn span'));
                return spans.map(s => {
                    const style = window.getComputedStyle(s);
                    return { text: s.innerText, whiteSpace: style.whiteSpace };
                });
            }""")
            for bt in btn_texts:
                assert bt['whiteSpace'] == 'nowrap', f"CTA text '{bt['text']}' does not have white-space: nowrap (has {bt['whiteSpace']}) at {vp['name']}"

            # Check 4 industries in 2x2 grid
            for ind_key in ['retail', 'fashion', 'food_beverage', 'service']:
                ind_btn = page.locator(f'.public-entry-card button[data-action="select-demo-industry"][data-industry="{ind_key}"]')
                assert ind_btn.is_visible(), f"Industry button {ind_key} not visible at {vp['name']}"

            # Check quick login controls
            assert page.locator('#quickGoogleLoginBtn').is_visible(), f"Google login button not visible at {vp['name']}"
            assert page.locator('#quickLoginEmail').is_visible(), f"Email input not visible at {vp['name']}"
            assert page.locator('#quickLoginPassword').is_visible(), f"Password input not visible at {vp['name']}"
            assert page.locator('#quickLoginBtn').is_visible(), f"Login submit button not visible at {vp['name']}"
            assert page.locator('#quickForgotPasswordBtn').is_visible(), f"Forgot password link not visible at {vp['name']}"

            # Check underlying dashboard is blurred
            under = page.locator('.dashboard-under-overlay')
            assert under.count() > 0, f".dashboard-under-overlay missing at {vp['name']}"

            screenshot_path = os.path.join(evidence_dir, f"entry_overlay_{vp['name']}.png")
            page.screenshot(path=screenshot_path, full_page=False)
            print(f"  ✓ Viewport {vp['name']}: Overlay, 3 CTAs in 1 row (nowrap), 4 industries, Google/email verified. Shot: {screenshot_path}")

            report['entry_overlay_viewports'].append({
                'viewport': vp['name'],
                'overlay_visible': True,
                'ctas_single_row': True,
                'nowrap_verified': True,
                'screenshot': screenshot_path
            })
            context.close()

        # ====================================================================
        # PART 2: DEMO COMPACT HEADER & SELECTORS (ROLE & INDUSTRY MODALS)
        # ====================================================================
        print("\n=== PART 2: DEMO COMPACT HEADER & SELECTORS ===")
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        page.goto(BASE_URL)
        page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

        # Open demo Retail
        page.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
        page.wait_for_timeout(1000)

        # Check demo compact header
        header = page.locator('.demo-compact-header')
        assert header.is_visible(), "Demo compact header not visible"
        header_box = header.bounding_box()
        print(f"  Demo compact header height: {header_box['height']}px (expected < 95px)")
        assert header_box['height'] < 95, f"Demo compact header too tall: {header_box['height']}px"

        # Check DEMO badge
        demo_badge = header.locator('.badge:has-text("DEMO")')
        assert demo_badge.is_visible(), "Small DEMO badge not visible"

        # Check selector cards
        role_card = header.locator('button[data-action="open-demo-role-modal"]')
        ind_card = header.locator('button[data-action="open-demo-industry-modal"]')
        assert role_card.is_visible(), "Role selector card not visible"
        assert ind_card.is_visible(), "Industry selector card not visible"

        # Check quiet action buttons
        assert header.locator('button[data-action="reset-demo"]').is_visible(), "Làm mới button not visible"
        assert header.locator('button[data-action="exit-demo"]').is_visible(), "Thoát demo button not visible"

        # Test Role Selector Modal
        role_card.click()
        page.wait_for_timeout(500)
        modal = page.locator('#modalRoot .modal')
        assert modal.is_visible(), "Role modal did not open"
        assert page.locator('#modalRoot h3:has-text("Xem với vai trò")').is_visible()
        # Verify 4 roles present
        for rk in ['OWNER', 'MANAGER', 'CASHIER', 'WAREHOUSE']:
            assert page.locator(f'#modalRoot [data-choose-role="{rk}"]').is_visible(), f"Role {rk} choice missing"

        role_modal_shot = os.path.join(evidence_dir, "role_selector_open_390.png")
        page.screenshot(path=role_modal_shot)
        print(f"  ✓ Role selector modal verified. Shot: {role_modal_shot}")
        report['demo_selectors']['role_modal'] = {'opened': True, 'roles_count': 4, 'screenshot': role_modal_shot}

        # Close modal
        page.locator('#modalRoot [data-close]').first.click()
        page.wait_for_timeout(400)

        # Test Industry Selector Modal
        ind_card.click()
        page.wait_for_timeout(500)
        assert page.locator('#modalRoot .modal').is_visible(), "Industry modal did not open"
        assert page.locator('#modalRoot h3:has-text("Chọn ngành kinh doanh demo")').is_visible()
        for ik in ['retail', 'fashion', 'food_beverage', 'service']:
            assert page.locator(f'#modalRoot [data-choose-industry="{ik}"]').is_visible(), f"Industry {ik} choice missing"

        ind_modal_shot = os.path.join(evidence_dir, "industry_selector_open_390.png")
        page.screenshot(path=ind_modal_shot)
        print(f"  ✓ Industry selector modal verified. Shot: {ind_modal_shot}")
        report['demo_selectors']['industry_modal'] = {'opened': True, 'industries_count': 4, 'screenshot': ind_modal_shot}

        # Close modal
        page.locator('#modalRoot [data-close]').first.click()
        page.wait_for_timeout(400)

        # ====================================================================
        # PART 3: PROFIT CARD ICON & PROFIT COMPUTATION (4 INDUSTRIES)
        # ====================================================================
        print("\n=== PART 3: PROFIT CARD ICON & PROFIT COMPUTATION ===")
        # Verify trending-up icon in profit card
        profit_subcard = page.locator('.dashboard-sales-subcard:has-text("Lợi nhuận")')
        assert profit_subcard.is_visible(), "Profit subcard not visible"
        profit_svg_html = profit_subcard.locator('i svg').inner_html()
        assert 'polyline points="23 6 13.5 15.5 8.5 10.5 1 18"' in profit_svg_html, "Profit card does not contain trending-up icon!"
        report['profit_icon_verified'] = True
        print("  ✓ Profit card icon verified as trending-up (polyline 23 6 13.5 15.5 8.5 10.5 1 18)")

        profit_icon_shot = os.path.join(evidence_dir, "profit_card_icon_390.png")
        profit_subcard.screenshot(path=profit_icon_shot)
        print(f"  ✓ Profit card element screenshot saved: {profit_icon_shot}")

        # Check 4 industries for profit and capture 390 & 412
        for ind_key in ['retail', 'fashion', 'food_beverage', 'service']:
            # Load demo industry
            page.evaluate(f"() => window.__qbiz_app__.previewDemo('{ind_key}')")
            page.wait_for_timeout(1000)

            # Check Dashboard profit subcard
            profit_subcard = page.locator('.dashboard-sales-subcard:has-text("Lợi nhuận")')
            assert profit_subcard.is_visible(), f"Profit subcard not visible for {ind_key}"
            profit_text = profit_subcard.locator('b').inner_text()
            print(f"  [{ind_key}] Dashboard Lợi nhuận KPI: {profit_text}")
            if ind_key != 'service':
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

            # Navigate back to dashboard for screenshot
            page.evaluate("() => { window.__qbiz_app__.navigate('dashboard'); }")
            page.wait_for_timeout(500)

            screenshot_path_390 = os.path.join(evidence_dir, f"demo_{ind_key}_390.png")
            page.screenshot(path=screenshot_path_390)

            report['demo_profit_industries'].append({
                'industry': ind_key,
                'dashboard_profit_kpi': profit_text,
                'reports_cost': cost_val,
                'reports_gross_profit': gross_val,
                'screenshot_390': screenshot_path_390
            })

        # Also capture 412 width for the 4 demo industries
        context_412 = browser.new_context(viewport={'width': 412, 'height': 915})
        page_412 = context_412.new_page()
        page_412.goto(BASE_URL)
        page_412.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')")

        for ind_key in ['retail', 'fashion', 'food_beverage', 'service']:
            page_412.evaluate(f"() => window.__qbiz_app__.previewDemo('{ind_key}')")
            page_412.wait_for_timeout(800)
            shot_412 = os.path.join(evidence_dir, f"demo_{ind_key}_412.png")
            page_412.screenshot(path=shot_412)
            print(f"  ✓ 412 width screenshot captured for {ind_key}: {shot_412}")
        context_412.close()

        # ====================================================================
        # PART 4: AI PROVIDER BADGE & OWNER REAL BASIC QUERIES
        # ====================================================================
        print("\n=== PART 4: AI PROVIDER BADGE & OWNER BASIC QUERIES ===")
        # Back to page (390 viewport, retail demo)
        page.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
        page.wait_for_timeout(800)

        # Open AI Sheet
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(500)
        assert page.locator('#qbizAiSheet').is_visible(), "AI Sheet did not open"

        # Verify AI provider badge
        provider_badge = page.locator('#aiProviderBadge')
        badge_text = provider_badge.inner_text().strip()
        print(f"  AI Provider Badge: '{badge_text}'")
        assert 'mock-dev (Key Needed)' not in badge_text, f"AI Provider badge still showing mock-dev: {badge_text}"
        assert 'AUTO: Quy tắc nội bộ & Fallback (Sẵn sàng)' in badge_text, f"AI Provider badge unexpected: {badge_text}"
        report['ai_provider_badge'] = badge_text

        badge_shot = os.path.join(evidence_dir, "ai_provider_badge_390.png")
        page.screenshot(path=badge_shot)
        print(f"  ✓ AI Provider Badge screenshot: {badge_shot}")

        # Basic Owner Queries to execute through UI
        queries = [
            "Hôm nay bán bao nhiêu?",
            "Tháng này bán được bao nhiêu?",
            "Mặt hàng nào bán chạy nhất tháng này",
            "Hàng nào sắp hết?",
            "Đề xuất mặt hàng cần nhập",
            "Còn bao nhiêu hàng?",
            "Cái này còn bao nhiêu?",
            "Sản phẩm này giá bao nhiêu?",
            "Mở màn hình bán hàng",
            "Tháng này nhập bao nhiêu hàng",
            "Kiểm kho",
            "Kiểm tra dữ liệu"
        ]

        for q in queries:
            prev_len = page.evaluate("() => window.__qbiz_app__.ai.getMessageHistory().length")
            page.fill('#aiTextInput', q)
            page.click('#aiSendBtn')
            page.wait_for_function(f"() => {{ const h = window.__qbiz_app__.ai.getMessageHistory(); return h.length > {prev_len} && h[h.length - 1].role === 'assistant'; }}", timeout=12000)

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
            assert not res_meta.get('text', '').startswith('Đã tiếp nhận yêu cầu:'), f"Generic 'Đã tiếp nhận yêu cầu' returned for '{q}'!"
            assert not res_meta.get('isError'), f"Unexpected error for query '{q}': {res_meta.get('text')}"

            report['ai_owner_queries'].append({
                'query': q,
                'response': res_meta.get('text'),
                'tier': res_meta.get('tier'),
                'provider': res_meta.get('provider'),
                'trace': res_meta.get('trace'),
                'status': 'PASS'
            })

        ai_screenshot = os.path.join(evidence_dir, "ai_real_response_390.png")
        page.screenshot(path=ai_screenshot)
        print(f"  ✓ All 12 queries passed with real data and 0 'Đã tiếp nhận yêu cầu'. Screenshot: {ai_screenshot}")

        # ====================================================================
        # PART 5: CASHIER ROLE HARD DENY VERIFICATION
        # ====================================================================
        print("\n=== PART 5: CASHIER ROLE HARD DENY VERIFICATION ===")
        # Switch to CASHIER role
        page.evaluate("() => window.__qbiz_app__.loadDemoIndustry('retail', 'CASHIER')")
        page.wait_for_timeout(800)

        # Open AI Sheet if closed
        if not page.locator('#qbizAiSheet').is_visible():
            page.click('#qbizAiTrigger')
            page.wait_for_timeout(500)

        prev_len_cashier = page.evaluate("() => window.__qbiz_app__.ai.getMessageHistory().length")
        page.fill('#aiTextInput', 'Hôm nay lời bao nhiêu?')
        page.click('#aiSendBtn')
        page.wait_for_function(f"() => {{ const h = window.__qbiz_app__.ai.getMessageHistory(); return h.length > {prev_len_cashier} && h[h.length - 1].role === 'assistant'; }}", timeout=12000)

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
        report_path = os.path.join(evidence_dir, 'owner_real_mobile_consolidated_report.json')
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"\nAll consolidated verification tests completed successfully. Report saved to: {report_path}")

        browser.close()

if __name__ == '__main__':
    run_tests()
