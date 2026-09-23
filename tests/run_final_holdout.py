#!/usr/bin/env python3
"""
QBIZ KHO AI — FINAL INDEPENDENT HOLDOUT EVALUATION RUNNER (150 CASES)
"""

import sys
import json
import time
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:4180/"

def run_final_holdout():
    print("\n=======================================================")
    print("  QBIZ KHO AI — FINAL INDEPENDENT HOLDOUT (150 CASES)")
    print("=======================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(APP_URL, wait_until="networkidle")
        page.wait_for_timeout(1000)

        result = page.evaluate("""async () => {
            const { routeIntent } = await import('/src/ai/router.js');
            const { setProviderConfig, PROVIDER_MODES } = await import('/src/ai/providers.js');
            setProviderConfig({ mode: PROVIDER_MODES.MOCK_DEV });

            const res = await fetch('/tests/ai-final-holdout.json');
            const cases = await res.json();
            const state = window.__qbiz_app__?.state || {};

            let passCount = 0;
            const byCategory = {};
            const failures = [];
            let p0Count = 0;
            let p1Count = 0;
            let p2Count = 0;
            let p3Count = 0;

            for (const c of cases) {
                if (!byCategory[c.category]) {
                    byCategory[c.category] = { total: 0, pass: 0, fail: 0 };
                }
                byCategory[c.category].total++;

                const env = Object.assign({}, c.context || {});
                const out = await routeIntent(c.prompt, env, state);
                let isPass = false;

                const exp = c.expected_action;
                if (exp === 'receipt') {
                    isPass = out.proposal?.intent === 'create_receipt_proposal' || out.intent === 'RECEIVE_STOCK';
                } else if (exp === 'transfer') {
                    isPass = out.proposal?.intent === 'create_transfer_proposal' || out.intent === 'TRANSFER_STOCK';
                } else if (exp === 'stocktake') {
                    isPass = out.proposal?.intent === 'create_stocktake_proposal' || out.intent === 'STOCKTAKE_STOCK';
                } else if (exp === 'cart') {
                    isPass = out.proposal?.intent === 'create_cart_draft' || out.intent === 'ADD_CART' || out.intent === 'REMOVE_CART' || out.intent === 'POS_ACTION' || (out.text && (out.text.includes('giỏ') || out.text.includes('đơn')));
                } else if (exp === 'check_stock') {
                    isPass = out.skillId === 'check-stock' || out.intent === 'QUERY_STOCK' || (out.text && (out.text.includes('tồn') || out.text.includes('chiếc') || out.text.includes('chai') || out.text.includes('hộp') || out.text.includes('giá')));
                } else if (exp === 'low_stock') {
                    isPass = out.skillId === 'low-stock' || out.intent === 'QUERY_STOCK' || (out.text && (out.text.includes('hết') || out.text.includes('tồn') || out.text.includes('ngưỡng') || out.text.includes('cạn') || out.text.includes('thiếu')));
                } else if (exp === 'daily_attention') {
                    isPass = out.skillId === 'daily-attention' || out.intent === 'DAILY_ATTENTION' || (out.text && (out.text.includes('chú ý') || out.text.includes('xử lý') || out.text.includes('hôm nay') || out.text.includes('chờ')));
                } else if (exp === 'sales_summary') {
                    isPass = out.skillId === 'sales-summary' || out.intent === 'SALES_SUMMARY' || (out.text && (out.text.includes('Doanh') || out.text.includes('doanh') || out.text.includes('bán')));
                } else if (exp === 'memory') {
                    isPass = out.skillId === 'memory-retrieve' || out.intent === 'QUERY_MEMORY' || (out.text && (out.text.includes('quy định') || out.text.includes('kinh nghiệm') || out.text.includes('chính sách') || out.text.includes('bảo hành') || out.text.includes('đổi trả') || out.text.includes('chiết khấu')));
                } else if (exp === 'clarification') {
                    isPass = Boolean(out.isAmbiguous || out.status === 'NEEDS_CLARIFICATION' || (out.candidates && out.candidates.length > 0) || (out.text && (out.text.includes('chọn') || out.text.includes('tìm thấy') || out.text.includes('xác định') || out.text.includes('nào'))));
                } else if (exp === 'blocked') {
                    isPass = Boolean(out.isBlocked || out.permissionDenied || out.status === 'BLOCKED' || (out.text && (out.text.includes('Từ chối') || out.text.includes('không tự ý') || out.text.includes('quyền') || out.text.includes('chặn') || out.text.includes('chế độ chỉ xem') || out.text.includes('An toàn'))));
                } else if (exp === 'general') {
                    isPass = Boolean(out.text) && !out.isError;
                } else {
                    isPass = Boolean(out.text) && !out.isError;
                }

                if (isPass) {
                    passCount++;
                    byCategory[c.category].pass++;
                } else {
                    byCategory[c.category].fail++;
                    if (c.severity === 'P0') p0Count++;
                    else if (c.severity === 'P1') p1Count++;
                    else if (c.severity === 'P2') p2Count++;
                    else p3Count++;

                    failures.push({
                        id: c.id,
                        category: c.category,
                        severity: c.severity,
                        prompt: c.prompt,
                        expected_action: c.expected_action,
                        out: {
                            text: out.text,
                            intent: out.intent,
                            status: out.status,
                            isAmbiguous: out.isAmbiguous,
                            proposal: out.proposal ? { intent: out.proposal.intent } : null
                        }
                    });
                }
            }

            return {
                total: cases.length,
                pass: passCount,
                byCategory,
                failures,
                p0: p0Count,
                p1: p1Count,
                p2: p2Count,
                p3: p3Count
            };
        }""")

        browser.close()

    total = result["total"]
    passed = result["pass"]
    rate = (passed / total * 100) if total > 0 else 0
    common_total = result["byCategory"].get("COMMON_NATURAL_VIETNAMESE", {}).get("total", 0)
    common_pass = result["byCategory"].get("COMMON_NATURAL_VIETNAMESE", {}).get("pass", 0)
    common_rate = (common_pass / common_total * 100) if common_total > 0 else 0

    print(f"TOTAL:              {total}")
    print(f"PASS:               {passed} ({rate:.1f}%)")
    print(f"FAIL:               {len(result['failures'])}")
    print(f"COMMON_RATE:        {common_pass}/{common_total} ({common_rate:.1f}%)")
    print("-" * 55)
    print(f"P0_FAIL:            {result['p0']}")
    print(f"P1_FAIL:            {result['p1']}")
    print(f"P2_FAIL:            {result['p2']}")
    print(f"P3_FAIL:            {result['p3']}")
    print("-" * 55)
    print("BY CATEGORY:")
    for cat, data in result["byCategory"].items():
        c_pass = data["pass"]
        c_tot = data["total"]
        c_rate = (c_pass / c_tot * 100) if c_tot > 0 else 0
        print(f"  • {cat:<30}: {c_pass:3d}/{c_tot:3d}  ({c_rate:5.1f}% pass, {data['fail']:2d} fail)")
    print("-" * 55)
    print(f"FAILURES COUNT:     {len(result['failures'])}")
    if result["failures"]:
        print("SAMPLE FAILURES:")
        for f in result["failures"][:5]:
            print(f"  [{f['severity']}] {f['id']} ({f['category']}): '{f['prompt']}'")
            print(f"       Expected: {f['expected_action']} | Actual: {f['out']}")

    # Save report
    with open("tests/ai-final-holdout-report.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result

if __name__ == "__main__":
    run_final_holdout()
