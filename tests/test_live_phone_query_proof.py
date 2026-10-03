import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

QA_URL = "http://192.168.1.10:4180/index.html"
PROMPT = "Tuần này hàng nào bán chậm và doanh thu bao nhiêu hàng nào nên nhập"
SCREENSHOT_PATH = "docs/evidence_phase3h/live_phone_compound_proof.png"

def run_proof():
    os.makedirs(os.path.dirname(SCREENSHOT_PATH), exist_ok=True)
    print(f"[*] Navigating to {QA_URL} (Mobile Viewport 412x915, simulating real phone)...")
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

        badge_before = page.locator("#aiProviderBadge").inner_text()
        print(f"  + Initial Provider Badge: '{badge_before}'")

        print(f"[*] Typing prompt: '{PROMPT}'")
        input_box = page.locator("#aiTextInput")
        send_btn = page.locator("#aiSendBtn")

        input_box.fill(PROMPT)
        t_start = time.time()
        send_btn.click()

        # Wait for assistant response
        max_wait = 25.0
        trace = None
        assistant_bubble = None
        start_wait = time.time()
        while time.time() - start_wait < max_wait:
            trace = page.evaluate("() => window.__AI_LAST_TRACE__")
            bubbles = page.locator(".ai-bubble.assistant-bubble")
            if trace and bubbles.count() > 0:
                # Ensure loading indicator is gone
                loading = page.locator("#aiLoadingIndicator")
                if loading.count() == 0 or not loading.is_visible():
                    assistant_bubble = bubbles.last
                    break
            time.sleep(0.1)

        duration_ms = int((time.time() - t_start) * 1000)
        print(f"[*] Response finished in: {duration_ms}ms ({duration_ms/1000:.2f}s)")

        badge_after = page.locator("#aiProviderBadge").inner_text()
        print(f"  + Post-response Provider Badge: '{badge_after}'")

        answer_text = assistant_bubble.inner_text() if assistant_bubble else ""
        print("="*60)
        print("ASSISTANT RESPONSE:")
        print(answer_text)
        print("="*60)

        # Take screenshot
        page.screenshot(path=SCREENSHOT_PATH, full_page=False)
        print(f"[*] Screenshot saved: {SCREENSHOT_PATH}")

        # Verification Checks
        checks = {
            "duration_under_8s": duration_ms <= 8000,
            "badge_shows_deepseek": "DeepSeek" in badge_after,
            "has_part1_ranking": ("bán chậm" in answer_text.lower() or "hiệu suất" in answer_text.lower() or "xếp hạng" in answer_text.lower() or "chưa bán được" in answer_text.lower() or "bán chạy" in answer_text.lower()),
            "has_part2_revenue": ("doanh thu" in answer_text.lower() or "doanh số" in answer_text.lower() or "thực thu" in answer_text.lower()),
            "has_part3_restock": ("nhập" in answer_text.lower() or "sắp hết" in answer_text.lower() or "cạn kho" in answer_text.lower() or "tồn" in answer_text.lower()),
            "no_duplicate_content": False,
        }

        # Check for duplication: see if the exact text appears twice
        first_line = [l.strip() for l in answer_text.split("\n") if len(l.strip()) > 10][:1]
        if first_line:
            occurrences = answer_text.count(first_line[0])
            checks["no_duplicate_content"] = (occurrences == 1)
        else:
            checks["no_duplicate_content"] = True

        print("[*] Verification Checks:")
        for k, v in checks.items():
            print(f"  - {k}: {'PASS' if v else 'FAIL'}")

        if trace:
            print("\n[*] Plan Trace Summary:")
            print(f"  - Provider: {trace.get('provider')}")
            print(f"  - Intent Count: {trace.get('plan_intent_count')}")
            print(f"  - Capabilities: {trace.get('capabilities')}")
            print(f"  - Compact Trace: {trace.get('compactTrace')}")

        browser.close()
        return all(checks.values())

if __name__ == "__main__":
    success = run_proof()
    sys.exit(0 if success else 1)
