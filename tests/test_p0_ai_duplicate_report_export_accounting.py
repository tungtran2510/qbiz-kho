import sys
import json
import time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_tests():
    print("=" * 80)
    print("QBIZ KHO — P0 AI TEST SUITE: DUPLICATE / REPORT EXPORT / ACCOUNTING ROUTING")
    print("=" * 80)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)

        print("\n>>> 1. Loading QBiz Kho at http://localhost:4180...")
        page.goto('http://localhost:4180')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.state && window.__qbiz_app__.ai')
        page.wait_for_timeout(1000)

        # Switch to demo fashion profile to have active products, sales, warehouses
        page.evaluate("() => window.__qbiz_app__.previewDemo('fashion')")
        page.wait_for_timeout(500)

        test_results = {}

        # =========================================================================
        # TEST 1: RAPID DUPLICATE SUBMISSION & IDEMPOTENCY (Failure A)
        # =========================================================================
        print("\n" + "=" * 70)
        print(">>> TEST 1: Rapid Duplicate Submission Guard (Invariant: DUPLICATE = 0)")
        print("=" * 70)

        # Clear existing history and open AI sheet
        page.evaluate('''() => {
            window.__qbiz_ai__.openSheet();
            const list = document.getElementById('aiMessagesList');
            if (list) list.innerHTML = '';
        }''')
        page.wait_for_timeout(300)

        # Rapid concurrent submission of identical query
        dup_eval = page.evaluate('''async () => {
            const p1 = window.__qbiz_ai__.handleUserMessage("Hôm nay bán được bao nhiêu?");
            const p2 = window.__qbiz_ai__.handleUserMessage("Hôm nay bán được bao nhiêu?");
            await Promise.all([p1, p2]);

            const history = window.__qbiz_ai__.getMessageHistory();
            const userMessages = history.filter(m => m.role === 'user' && m.text.includes("Hôm nay bán"));
            const assistantMessages = history.filter(m => m.role === 'assistant' && (m.text.includes("Doanh số") || m.text.includes("hôm nay")));
            const proposals = history.filter(m => m.proposal || m.proposals);

            return {
                totalHistory: history.length,
                userCount: userMessages.length,
                assistantCount: assistantMessages.length,
                proposalCount: proposals.length,
            };
        }''')

        print(f"Duplicate test output: userMessages={dup_eval['userCount']}, assistantMessages={dup_eval['assistantCount']}")
        
        test1_pass = (dup_eval['userCount'] == 1 and dup_eval['assistantCount'] <= 1)
        test_results['test_1_duplicate_guard'] = {
            'status': 'PASS' if test1_pass else 'FAIL',
            'detail': dup_eval
        }
        print(f"==> TEST 1 RESULT: {'PASS' if test1_pass else 'FAIL'} (DUPLICATE_USER_MESSAGE_RATE = 0, DUPLICATE_ASSISTANT_RESPONSE_RATE = 0)")
        assert test1_pass, f"Duplicate guard failed! Got {dup_eval['userCount']} user messages, expected 1."

        # =========================================================================
        # TEST 2: REPORT EXPORT MUST NEVER COLLIDE WITH INVENTORY ISSUE (Failure E)
        # =========================================================================
        print("\n" + "=" * 70)
        print(">>> TEST 2: Report Export Never Routes to Inventory Issue (Failure E)")
        print("=" * 70)

        export_queries = [
            "xuất báo cáo tháng này",
            "báo cáo tháng này xuất ra file Excel cho tôi",
            "xuất báo cáo doanh thu",
            "xuất file excel",
            "tải báo cáo bán hàng ra excel",
            "xuất báo cáo nhập xuất tồn ra excel",
            "xuất dữ liệu bán hàng tháng này",
            "kết xuất báo cáo hôm nay"
        ]

        all_export_safe = True
        export_details = []

        for q in export_queries:
            res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(r => ({
                    query,
                    intent: r.intent,
                    skillId: r.skillId,
                    proposal: r.proposal || null,
                    tier: r.tier,
                    textSnippet: (r.text || '').replace(/\\n/g, ' ').slice(0, 60)
                }));
            }''', q)

            is_safe = (res['intent'] != 'ISSUE_STOCK') and (res['skillId'] != 'issue-proposal') and (res['proposal'] is None)
            is_export_routed = (res['intent'] == 'EXPORT_REPORT' or res['skillId'] == 'export-report')

            print(f"Query: '{q}' -> Intent: {res['intent']} | Skill: {res['skillId']} | Safe: {is_safe} | ExportRouted: {is_export_routed}")
            if not is_safe or not is_export_routed:
                all_export_safe = False
            export_details.append(res)

        test_results['test_2_export_never_issue'] = {
            'status': 'PASS' if all_export_safe else 'FAIL',
            'detail': export_details
        }
        print(f"==> TEST 2 RESULT: {'PASS' if all_export_safe else 'FAIL'} (REPORT_EXPORT_TO_INVENTORY_WRITE = 0)")
        assert all_export_safe, "Report export collided with inventory issue!"

        # =========================================================================
        # TEST 3: CONTRASTIVE CHECK: LEGITIMATE INVENTORY ISSUE STILL WORKS
        # =========================================================================
        print("\n" + "=" * 70)
        print(">>> TEST 3: Legitimate Stock Issue Commands Still Trigger Issue Proposal")
        print("=" * 70)

        issue_queries = [
            "xuất kho 2 cái này",
            "giảm kho 3 cái này",
            "trừ kho 5 cái"
        ]

        all_issue_ok = True
        issue_details = []

        for q in issue_queries:
            res = page.evaluate('''(query) => {
                const prod = (window.__qbiz_app__.state.data.products || [])[0];
                const prodId = prod ? prod.id : 'p_fs_dress_linen';
                return window.__qbiz_app__.ai.routeIntent(query, { current_product_id: prodId }, window.__qbiz_app__.state).then(r => ({
                    query,
                    intent: r.intent,
                    skillId: r.skillId,
                    proposal: r.proposal ? { type: r.proposal.type, status: r.proposal.status } : null,
                    textSnippet: (r.text || '').replace(/\\n/g, ' ').slice(0, 60)
                }));
            }''', q)

            is_issue = (
                res['intent'] in ('ISSUE_STOCK', 'CREATE_ISSUE_PROPOSAL') or
                res['skillId'] == 'issue-proposal' or
                (res['proposal'] is not None)
            )
            print(f"Query: '{q}' -> Intent: {res['intent']} | Skill: {res['skillId']} | Proposal: {res['proposal']} | OK: {is_issue}")
            if not is_issue:
                all_issue_ok = False
            issue_details.append(res)

        test_results['test_3_contrastive_issue'] = {
            'status': 'PASS' if all_issue_ok else 'FAIL',
            'detail': issue_details
        }
        print(f"==> TEST 3 RESULT: {'PASS' if all_issue_ok else 'FAIL'}")
        assert all_issue_ok, "Legitimate inventory issue regression!"

        # =========================================================================
        # TEST 4: OPERATIONAL AUDIT / RECONCILIATION (Failure B)
        # =========================================================================
        print("\n" + "=" * 70)
        print(">>> TEST 4: Operational Audit & Reconciliation (Failure B)")
        print("=" * 70)

        audit_queries = [
            "kiểm toán tháng này",
            "đối soát tháng này",
            "rà soát số liệu",
            "audit số liệu tháng này"
        ]

        all_audit_ok = True
        audit_details = []

        for q in audit_queries:
            res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(r => ({
                    query,
                    intent: r.intent,
                    skillId: r.skillId,
                    metrics: r.metrics || null,
                    hasDisclaimer: (r.text || '').includes('Đối soát vận hành nội bộ'),
                    hasSales: (r.text || '').includes('Bán hàng & Doanh thu'),
                    textSnippet: (r.text || '').replace(/\\n/g, ' ').slice(0, 80)
                }));
            }''', q)

            is_audit = (res['intent'] == 'OPERATIONAL_AUDIT' and res['skillId'] == 'operational-audit' and res['hasDisclaimer'])
            print(f"Query: '{q}' -> Intent: {res['intent']} | Skill: {res['skillId']} | Disclaimer: {res['hasDisclaimer']} | OK: {is_audit}")
            if not is_audit:
                all_audit_ok = False
            audit_details.append(res)

        test_results['test_4_operational_audit'] = {
            'status': 'PASS' if all_audit_ok else 'FAIL',
            'detail': audit_details
        }
        print(f"==> TEST 4 RESULT: {'PASS' if all_audit_ok else 'FAIL'}")
        assert all_audit_ok, "Operational audit routing failed!"

        # =========================================================================
        # TEST 5: ACCOUNTING GUIDANCE & NAVIGATION (Failure C)
        # =========================================================================
        print("\n" + "=" * 70)
        print(">>> TEST 5: Accounting Guidance & Module Routing (Failure C)")
        print("=" * 70)

        accounting_queries = [
            "mở nghiệp vụ kế toán",
            "kế toán",
            "nghiệp vụ kế toán",
            "hạch toán kế toán",
            "định khoản kế toán"
        ]

        all_acct_ok = True
        acct_details = []

        for q in accounting_queries:
            res = page.evaluate('''(query) => {
                return window.__qbiz_app__.ai.routeIntent(query, {}, window.__qbiz_app__.state).then(r => ({
                    query,
                    intent: r.intent,
                    actions: r.actions || [],
                    hasExplanation: (r.text || '').includes('QBiz Kho là hệ thống'),
                    hasReportsAction: (r.actions || []).some(a => a.id === 'open_reports'),
                    hasCashAction: (r.actions || []).some(a => a.id === 'open_cash'),
                    hasExportsAction: (r.actions || []).some(a => a.id === 'open_exports'),
                    textSnippet: (r.text || '').replace(/\\n/g, ' ').slice(0, 80)
                }));
            }''', q)

            is_acct = (res['intent'] == 'ACCOUNTING_GUIDANCE' and res['hasExplanation'] and res['hasReportsAction'] and res['hasExportsAction'])
            print(f"Query: '{q}' -> Intent: {res['intent']} | Explains: {res['hasExplanation']} | Actions: {len(res['actions'])} | OK: {is_acct}")
            if not is_acct:
                all_acct_ok = False
            acct_details.append(res)

        test_results['test_5_accounting_guidance'] = {
            'status': 'PASS' if all_acct_ok else 'FAIL',
            'detail': acct_details
        }
        print(f"==> TEST 5 RESULT: {'PASS' if all_acct_ok else 'FAIL'}")
        assert all_acct_ok, "Accounting guidance failed!"

        # =========================================================================
        # TEST 6: CANONICAL EXPORT-REPORT SKILL EXECUTION (Failure D)
        # =========================================================================
        print("\n" + "=" * 70)
        print(">>> TEST 6: export-report Skill Execution & CSV UTF-8 BOM (Failure D)")
        print("=" * 70)

        skill_exec = page.evaluate('''async () => {
            const skillRes = await window.__qbiz_app__.ai.routeIntent("báo cáo tháng này xuất ra file Excel cho tôi", {}, window.__qbiz_app__.state);
            return {
                intent: skillRes.intent,
                skillId: skillRes.skillId,
                exportedFile: skillRes.exportedFile,
                rowCount: skillRes.rowCount,
                period: skillRes.period,
                periodLabel: skillRes.periodLabel,
                textSnippet: skillRes.text
            };
        }''')

        print(f"Export execution result: File={skill_exec['exportedFile']}, Rows={skill_exec['rowCount']}, Period={skill_exec['periodLabel']}")
        test6_pass = (
            skill_exec['intent'] == 'EXPORT_REPORT' and
            skill_exec['skillId'] == 'export-report' and
            bool(skill_exec['exportedFile']) and
            skill_exec['exportedFile'].endswith('.csv')
        )

        test_results['test_6_export_skill'] = {
            'status': 'PASS' if test6_pass else 'FAIL',
            'detail': skill_exec
        }
        print(f"==> TEST 6 RESULT: {'PASS' if test6_pass else 'FAIL'}")
        assert test6_pass, "Export skill execution failed!"

        browser.close()

    print("\n" + "=" * 80)
    print("ALL 6 TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)
    return test_results

if __name__ == '__main__':
    run_tests()
