import os
import sys
import time
import json
import io
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

QA_URL = "http://127.0.0.1:4180"
EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "evidence_ranking")

VARIANTS = [
    {
        "id": 1,
        "query": "Tuần này bán tốt/không tốt mặt hàng nào?",
        "expected_period": "tuần này",
        "description": "Tuần này bán tốt/không tốt mặt hàng nào? (Bán tốt / không tốt)"
    },
    {
        "id": 2,
        "query": "Tháng này mặt hàng nào bán chạy nhất?",
        "expected_period": "tháng này",
        "description": "Tháng này mặt hàng nào bán chạy nhất? (Bán chạy nhất)"
    },
    {
        "id": 3,
        "query": "Hôm nay có mặt hàng nào ế không?",
        "expected_period": "hôm nay",
        "description": "Hôm nay có mặt hàng nào ế không? (Hàng ế)"
    },
    {
        "id": 4,
        "query": "Tuần trước bán được những gì, cái gì không bán được?",
        "expected_period": "tuần trước",
        "description": "Tuần trước bán được những gì, cái gì không bán được? (Bán được / không bán được)"
    },
    {
        "id": 5,
        "query": "Những món nào bán chạy trong tuần này?",
        "expected_period": "tuần này",
        "description": "Những món nào bán chạy trong tuần này? (Món bán chạy tuần này)"
    },
    {
        "id": 6,
        "query": "Tuần này mặt hàng nào bán kém nhất?",
        "expected_period": "tuần này",
        "description": "Tuần này mặt hàng nào bán kém nhất? (Bán kém nhất)"
    },
    {
        "id": 7,
        "query": "Sản phẩm nào nổi bật và sản phẩm nào ế ẩm tháng này?",
        "expected_period": "tháng này",
        "description": "Sản phẩm nào nổi bật và sản phẩm nào ế ẩm tháng này? (Nổi bật / ế ẩm)"
    },
    {
        "id": 8,
        "query": "Hôm nay mặt hàng nào bán được nhiều, cái nào ít người mua?",
        "expected_period": "hôm nay",
        "description": "Hôm nay mặt hàng nào bán được nhiều, cái nào ít người mua? (Nhiều / ít người mua)"
    }
]

def run_8_variants():
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    summary_path = os.path.join(EVIDENCE_DIR, "variants_summary.json")
    results = []

    print("=" * 70)
    print("QBIZ KHO — EMPIRICAL VERIFICATION OF 8 PRODUCT PERFORMANCE RANKING VARIANTS")
    print(f"Target URL: {QA_URL}")
    print(f"Evidence Directory: {EVIDENCE_DIR}")
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

        print(f"[*] Navigating to {QA_URL}...")
        page.goto(f"{QA_URL}/index.html", wait_until="networkidle", timeout=30000)
        time.sleep(2)

        # Open AI Sheet
        trigger = page.locator("#qbizAiTrigger")
        trigger.click()
        time.sleep(1)

        provider_badge = page.locator("#aiProviderBadge").inner_text().strip()
        print(f"[*] Active AI Provider Badge: '{provider_badge}'\n")

        all_passed = True

        for v in VARIANTS:
            v_id = v["id"]
            query = v["query"]
            print(f"----------------------------------------------------------------------")
            print(f"[{v_id}/8] Testing: \"{query}\"")

            input_box = page.locator("#aiTextInput")
            send_btn = page.locator("#aiSendBtn")

            initial_bubble_count = page.evaluate("() => document.querySelectorAll('.ai-bubble.assistant-bubble').length")
            input_box.fill(query)
            t_start = time.time()
            send_btn.click()

            # 1. Measure initial feedback latency
            feedback_visible = False
            for _ in range(30):
                is_disabled = page.evaluate("() => document.getElementById('aiTextInput')?.disabled === true")
                has_indicator = page.evaluate("() => Boolean(document.getElementById('aiLoadingIndicator'))")
                if is_disabled or has_indicator:
                    feedback_visible = True
                    break
                time.sleep(0.02)
            feedback_ms = int((time.time() - t_start) * 1000)

            # 2. Wait for NEW assistant bubble to arrive and AI processing to complete
            max_wait = 25.0
            trace = None
            assistant_text = ""
            while (time.time() - t_start) < max_wait:
                is_done = page.evaluate("() => !document.getElementById('aiTextInput')?.disabled")
                curr_bubbles = page.evaluate("() => document.querySelectorAll('.ai-bubble.assistant-bubble').length")
                if is_done and curr_bubbles > initial_bubble_count:
                    trace = page.evaluate("() => window.__AI_LAST_TRACE__")
                    assistant_text = page.evaluate("() => { const msgs = document.querySelectorAll('.ai-bubble.assistant-bubble'); return msgs.length ? msgs[msgs.length - 1].innerText : ''; }")
                    break
                time.sleep(0.3)

            elapsed_s = round(time.time() - t_start, 2)

            # 3. Capture screenshot
            shot_file = f"variant_{v_id}.png"
            shot_path = os.path.join(EVIDENCE_DIR, shot_file)
            page.screenshot(path=shot_path)

            # 4. Strict assertions
            is_sales_summary_fallback = (
                "Doanh số hôm nay" in assistant_text and
                "Doanh thu thực thu" in assistant_text and
                "Số phiếu hoàn tất" in assistant_text and
                "Hiệu suất mặt hàng" not in assistant_text and
                "bán chạy" not in assistant_text
            )
            has_ranking_intent = (
                trace and trace.get("intent") in ["PRODUCT_PERFORMANCE_RANKING", "product_performance_ranking", "TOP_SELLING", "top_selling_products"]
            )
            has_ranking_text = (
                "Hiệu suất mặt hàng" in assistant_text or
                "bán chạy" in assistant_text or
                "bán chậm" in assistant_text or
                "chưa phát sinh" in assistant_text or
                "chưa bán được" in assistant_text or
                "mặt hàng" in assistant_text or
                "sản phẩm" in assistant_text
            )

            passed = (
                trace is not None and
                trace.get("isUnavailable") is not True and
                not is_sales_summary_fallback and
                has_ranking_intent and
                has_ranking_text
            )

            if not passed:
                all_passed = False

            print(f"  + Result: {'PASS' if passed else 'FAIL'}")
            print(f"  + Feedback Latency: {feedback_ms}ms | Total Latency: {elapsed_s}s")
            print(f"  + Intent: {trace.get('intent') if trace else 'None'}")
            print(f"  + Tools Executed: {trace.get('tools_executed') or trace.get('toolsExecuted') if trace else 'None'}")
            print(f"  + Provider Badge: {provider_badge}")
            print(f"  + Assistant Preview: {assistant_text[:120].replace(chr(10), ' ')}...")
            print(f"  + Screenshot: {shot_path}")

            results.append({
                "id": v_id,
                "query": query,
                "description": v["description"],
                "passed": passed,
                "intent": trace.get("intent") if trace else None,
                "tools_executed": trace.get("tools_executed") or trace.get("toolsExecuted") if trace else None,
                "provider_badge": provider_badge,
                "feedback_ms": feedback_ms,
                "total_latency_s": elapsed_s,
                "assistant_text": assistant_text,
                "screenshot": shot_path,
                "trace": trace
            })

            time.sleep(1)

        browser.close()

    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({"all_passed": all_passed, "total": len(VARIANTS), "passed": sum(1 for r in results if r["passed"]), "results": results}, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 70)
    print(f"FINAL RESULT: {'ALL 8 VARIANTS PASSED' if all_passed else 'SOME VARIANTS FAILED'}")
    print(f"Passed: {sum(1 for r in results if r['passed'])}/{len(VARIANTS)}")
    print(f"Summary saved: {summary_path}")
    print("=" * 70)

    assert all_passed, "Not all 8 variants passed!"

if __name__ == "__main__":
    run_8_variants()
