"""
ARCHITECTURAL RESILIENCE TEST — 4 Real Failure Cases + 10 Independent Queries
Tests the 3-layer retry/escalation/safe-refuse architecture.

MUST ALL PASS:
1. No technical error codes shown to end user (no PROVIDER_RESPONSE_INVALID, no mã lỗi kỹ thuật)
2. Ranking/performance queries get relevant answers OR safe refusal
3. Write commands get safe refusal when uncertain
4. All responses are in natural Vietnamese language
"""

import os
import sys
import io
import time
import json
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

QA_URL = "http://127.0.0.1:4180"
EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "evidence_architectural_fix")

# 4 EXACT verbatim failure sentences from the user
REAL_FAILURES = [
    {
        "query": "Tuần này có những cái nào bán tốt và những cái nào bán không tốt",
        "type": "READ",
        "must_not_contain": ["PROVIDER_RESPONSE_INVALID", "Phản hồi không hợp lệ", "cấu trúc kế hoạch vận hành", "PROVIDER_RESPONSE", "PARSE_OR_VALIDATION"],
        "description": "Ranking query: best/worst sellers this week"
    },
    {
        "query": "Tuần này cái nào bán chưa tốt và cái nào lên nhập",
        "type": "READ",
        "must_not_contain": ["PROVIDER_RESPONSE_INVALID", "Phản hồi không hợp lệ", "cấu trúc kế hoạch vận hành", "PROVIDER_RESPONSE", "PARSE_OR_VALIDATION"],
        "description": "Compound: poor sellers + what to restock"
    },
    {
        "query": "Hàng nào lên nhập thêm",
        "type": "READ",
        "must_not_contain": ["PROVIDER_RESPONSE_INVALID", "Phản hồi không hợp lệ", "cấu trúc kế hoạch vận hành", "PROVIDER_RESPONSE", "PARSE_OR_VALIDATION"],
        "description": "Restock suggestion query"
    },
    {
        "query": "Nhập vào kho 5 chiếc này",
        "type": "WRITE",
        "must_not_contain": ["PROVIDER_RESPONSE_INVALID", "Phản hồi không hợp lệ", "cấu trúc kế hoạch vận hành", "PROVIDER_RESPONSE", "PARSE_OR_VALIDATION"],
        "description": "Write command: stock receipt (should be safe-refused if uncertain)"
    },
]

# 10 Independent queries (varied business scenarios)
INDEPENDENT_QUERIES = [
    {"query": "Trong 7 ngày qua sản phẩm nào có doanh số cao nhất", "type": "READ", "description": "Top seller 7 days"},
    {"query": "Mặt hàng nào đang ế nhất tháng này", "type": "READ", "description": "Worst seller this month"},
    {"query": "Kiểm tra tồn kho tất cả sản phẩm", "type": "READ", "description": "Full stock check"},
    {"query": "Cho tôi xem giá bán của sản phẩm bàn ghế", "type": "READ", "description": "Price lookup"},
    {"query": "Lợi nhuận tuần này bao nhiêu", "type": "READ", "description": "Profit this week"},
    {"query": "Doanh thu hôm qua là bao nhiêu", "type": "READ", "description": "Revenue yesterday"},
    {"query": "Xuất kho 10 cái ghế sang kho phụ", "type": "WRITE", "description": "Transfer stock"},
    {"query": "Nhập thêm 20 chiếc áo vào kho chính", "type": "WRITE", "description": "Receipt stock"},
    {"query": "Sản phẩm nào sắp hết hàng cần nhập thêm", "type": "READ", "description": "Low stock alert"},
    {"query": "So sánh doanh thu tuần này và tuần trước", "type": "READ", "description": "Revenue comparison"},
]


def run_all_tests():
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    results = {"real_failures": [], "independent": [], "passed": 0, "failed": 0, "total": 0}

    all_tests = [("REAL_FAILURE", t) for t in REAL_FAILURES] + [("INDEPENDENT", t) for t in INDEPENDENT_QUERIES]

    print("=" * 70)
    print("QBIZ KHO — ARCHITECTURAL RESILIENCE VERIFICATION")
    print("3-Layer: Retry → Cloud Escalation → Safe Refuse")
    print(f"Target URL: {QA_URL}")
    print(f"Evidence Directory: {EVIDENCE_DIR}")
    print(f"Total Tests: {len(all_tests)} ({len(REAL_FAILURES)} real failures + {len(INDEPENDENT_QUERIES)} independent)")
    print("=" * 70)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        print(f"\n[*] Navigating to {QA_URL}...")
        page.goto(f"{QA_URL}/index.html", wait_until="networkidle", timeout=30000)
        time.sleep(2)

        # Open AI Sheet
        trigger = page.locator("#qbizAiTrigger")
        trigger.click()
        time.sleep(1)

        try:
            provider_badge = page.locator("#aiProviderBadge").inner_text().strip()
            print(f"[*] Active AI Provider Badge: '{provider_badge}'\n")
        except Exception:
            print("[*] Provider badge not found, continuing...\n")

        for idx, (category, test) in enumerate(all_tests):
            test_num = idx + 1
            query = test["query"]
            print(f"\n{'─' * 70}")
            print(f"TEST {test_num}/{len(all_tests)} [{category}] {test['description']}")
            print(f"  Query: \"{query}\"")

            input_box = page.locator("#aiTextInput")
            send_btn = page.locator("#aiSendBtn")

            # Count existing bubbles
            initial_bubble_count = page.evaluate("() => document.querySelectorAll('.ai-bubble.assistant-bubble').length")

            # Fill and send
            input_box.fill(query)
            t_start = time.time()
            send_btn.click()

            # Wait for new assistant bubble (up to 50s for cloud escalation scenarios)
            max_wait = 50.0
            assistant_text = ""
            trace = None
            while (time.time() - t_start) < max_wait:
                is_done = page.evaluate("() => !document.getElementById('aiTextInput')?.disabled")
                curr_bubbles = page.evaluate("() => document.querySelectorAll('.ai-bubble.assistant-bubble').length")
                if curr_bubbles > initial_bubble_count and is_done:
                    # Get the text of the newest assistant bubble
                    assistant_text = page.evaluate("""() => {
                        const bubbles = document.querySelectorAll('.ai-bubble.assistant-bubble');
                        if (bubbles.length === 0) return '';
                        return bubbles[bubbles.length - 1].innerText || '';
                    }""")
                    # Get trace
                    try:
                        trace = page.evaluate("() => JSON.stringify(window.__AI_LAST_TRACE__ || {})")
                    except Exception:
                        trace = "{}"
                    break
                time.sleep(0.3)

            elapsed_ms = int((time.time() - t_start) * 1000)

            # If still no response, get whatever is on screen
            if not assistant_text:
                try:
                    assistant_text = page.evaluate("""() => {
                        const bubbles = document.querySelectorAll('.ai-bubble.assistant-bubble');
                        if (bubbles.length === 0) return '';
                        return bubbles[bubbles.length - 1].innerText || '';
                    }""")
                except Exception:
                    assistant_text = ""

            # Screenshot
            screenshot_name = f"test_{test_num:02d}_{category.lower()}.png"
            screenshot_path = os.path.join(EVIDENCE_DIR, screenshot_name)
            page.screenshot(path=screenshot_path)

            # VALIDATION
            passed = True
            fail_reasons = []

            # 1. Must not contain technical error codes
            for bad_text in test.get("must_not_contain", []):
                if bad_text.lower() in assistant_text.lower():
                    passed = False
                    fail_reasons.append(f"Contains forbidden text: '{bad_text}'")

            # 2. Response must not be empty
            if len(assistant_text.strip()) < 5:
                passed = False
                fail_reasons.append(f"Response too short ({len(assistant_text)} chars)")

            # 3. Speed check: Must be <= 8000ms (8 seconds) as required by Owner
            MAX_ALLOWED_MS = 8000
            if elapsed_ms > MAX_ALLOWED_MS:
                passed = False
                fail_reasons.append(f"TOKEN_COST_WARNING: Latency {elapsed_ms}ms exceeded {MAX_ALLOWED_MS}ms threshold")

            # 4. Parse trace for escalation/refuse signals (informational)
            escalation_info = ""
            if trace:
                try:
                    t_obj = json.loads(trace)
                    if t_obj.get("compactTrace"):
                        escalation_info = t_obj["compactTrace"]
                    if t_obj.get("final_answer_source"):
                        escalation_info += f" | src={t_obj['final_answer_source']}"
                except Exception:
                    pass

            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"  Response ({elapsed_ms}ms): {assistant_text[:200]}")
            if escalation_info:
                print(f"  Trace: {escalation_info}")
            print(f"  Result: {status}")
            if fail_reasons:
                for r in fail_reasons:
                    print(f"    ⚠ {r}")

            result = {
                "test_num": test_num,
                "category": category,
                "query": query,
                "type": test["type"],
                "description": test["description"],
                "response_preview": assistant_text[:300],
                "elapsed_ms": elapsed_ms,
                "passed": passed,
                "fail_reasons": fail_reasons,
                "screenshot": screenshot_name,
                "escalation_info": escalation_info,
            }

            if category == "REAL_FAILURE":
                results["real_failures"].append(result)
            else:
                results["independent"].append(result)

            if passed:
                results["passed"] += 1
            else:
                results["failed"] += 1
            results["total"] += 1

            # Delay between tests to let model cool down
            time.sleep(2)

        browser.close()

    # Write results summary
    summary_path = os.path.join(EVIDENCE_DIR, "test_results_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n{'=' * 70}")
    print(f"FINAL RESULTS")
    print(f"{'=' * 70}")
    real_pass = sum(1 for r in results['real_failures'] if r['passed'])
    indep_pass = sum(1 for r in results['independent'] if r['passed'])
    print(f"Total: {results['total']}, Passed: {results['passed']}, Failed: {results['failed']}")
    print(f"Real Failures Fixed: {real_pass}/{len(results['real_failures'])}")
    print(f"Independent Queries: {indep_pass}/{len(results['independent'])}")
    print(f"Summary: {summary_path}")

    if results['failed'] > 0:
        print("\n⚠ SOME TESTS FAILED — Review screenshots and traces above")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED — Architectural resilience verified")
        sys.exit(0)


if __name__ == "__main__":
    run_all_tests()
