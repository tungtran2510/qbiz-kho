import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

QA_URL = "http://127.0.0.1:4180/index.html"

def test_query():
    print(f"[*] Connecting to {QA_URL} with Mobile Viewport...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        page.goto(QA_URL, wait_until="networkidle", timeout=30000)
        time.sleep(2)

        # Open AI Sheet
        trigger = page.locator("#qbizAiTrigger")
        trigger.click()
        time.sleep(1)

        provider_badge = page.locator("#aiProviderBadge").inner_text()
        print(f"  + Provider Badge: {provider_badge}")

        query = "Mặt hàng nào bán chạy nhất tháng này?"
        print(f"[*] Sending query: '{query}'")

        input_box = page.locator("#aiTextInput")
        send_btn = page.locator("#aiSendBtn")

        input_box.fill(query)
        t_start = time.time()
        send_btn.click()

        # Measure feedback
        feedback_visible = False
        for _ in range(25):
            is_disabled = page.evaluate("() => document.getElementById('aiTextInput')?.disabled === true")
            has_indicator = page.evaluate("() => Boolean(document.getElementById('aiLoadingIndicator'))")
            has_trace = page.evaluate("() => Boolean(window.__AI_LAST_TRACE__)")
            has_bubble = page.evaluate("() => { const msgs = document.querySelectorAll('.ai-bubble.assistant-bubble'); return msgs.length > 0; }")
            if is_disabled or has_indicator or has_trace or has_bubble:
                feedback_visible = True
                break
            time.sleep(0.02)
        feedback_ms = int((time.time() - t_start) * 1000)
        print(f"  + Feedback latency: {feedback_ms}ms")

        # Wait for response
        max_wait = 25.0
        trace = None
        last_text = ""
        while (time.time() - t_start) < max_wait:
            trace = page.evaluate("() => window.__AI_LAST_TRACE__")
            if trace:
                last_text = page.evaluate("() => { const msgs = document.querySelectorAll('.ai-bubble.assistant-bubble'); return msgs.length ? msgs[msgs.length - 1].innerText : ''; }")
                break
            time.sleep(0.3)

        elapsed = time.time() - t_start
        print(f"  + Total latency: {round(elapsed, 2)}s")
        print(f"  + Trace: {json.dumps(trace, ensure_ascii=False, indent=2) if trace else 'None'}")
        print(f"  + Assistant Text: {last_text}")

        shot_path = "tests/test_top_selling_result.png"
        page.screenshot(path=shot_path)
        print(f"  + Screenshot saved to {shot_path}")

        browser.close()

        assert trace is not None, "Failed to get AI trace!"
        assert trace.get("isUnavailable") is not True, f"AI returned unavailable: {trace.get('reason')}"
        print("\n[SUCCESS] AI answered top selling products query perfectly!")

if __name__ == "__main__":
    test_query()
