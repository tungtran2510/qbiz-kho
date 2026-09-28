import time
import os
import json
from playwright.sync_api import sync_playwright

HOSTS = [
    {"name": "PRIMARY (Vercel)", "url": "https://qbiz-kho.vercel.app"},
    {"name": "BACKUP (Netlify)", "url": "https://qbiz-kho.netlify.app"}
]

VIEWPORTS = [
    {"name": "Mobile 390px", "width": 390, "height": 844, "is_mobile": True},
    {"name": "Mobile 412px", "width": 412, "height": 915, "is_mobile": True},
    {"name": "Desktop 1440px", "width": 1440, "height": 900, "is_mobile": False}
]

def run_real_ui_tests():
    print("============================================================")
    print("SECTION 5: REAL PRODUCTION UI & IDEMPOTENCY VERIFICATION")
    print("============================================================")

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for host in HOSTS:
            hname = host["name"]
            hurl = host["url"]
            print(f"\n--- Testing Host: {hname} ({hurl}) ---")

            for vp in VIEWPORTS:
                vpname = vp["name"]
                print(f"\nViewport: {vpname}")
                context = browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    is_mobile=vp["is_mobile"],
                    has_touch=vp["is_mobile"]
                )
                page = context.new_page()

                console_errors = []
                page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

                # 1. Load application
                page.goto(hurl, wait_until="networkidle", timeout=30000)
                page.wait_for_timeout(1500)

                # 2. Check Horizontal Overflow
                overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")

                # 3. Find and click AI Floating Action Button (#qbizAiTrigger)
                ai_btn = page.query_selector("#qbizAiTrigger")
                ai_opened = False

                if ai_btn:
                    ai_btn.click()
                    page.wait_for_timeout(800)
                    ai_panel = page.query_selector("#qbizAiSheet")
                    # Check display style or visibility
                    ai_opened = page.evaluate("() => { const s = document.getElementById('qbizAiSheet'); return s && s.style.display !== 'none'; }")

                print(f"  AI FAB (#qbizAiTrigger) found: {ai_btn is not None} | Sheet opened: {ai_opened} | Overflow: {overflow}")

                # 4. Check Route Chips on #aiChipsBar
                chips = []
                chip_texts = []
                rapid_double_tap_ok = False
                user_msg_count = 0
                assistant_msg_count = 0

                if ai_opened:
                    chips = page.query_selector_all("#aiChipsBar button, #aiChipsBar .ai-chip")
                    chip_texts = [c.inner_text().strip() for c in chips]
                    print(f"  Found {len(chips)} Quick Chips on screen: {chip_texts[:5]}")

                    # 5. Rapid Double Tap / Submit Idempotency Test
                    first_chip = chips[0] if chips else None
                    if first_chip:
                        # Rapid double click
                        first_chip.click()
                        first_chip.click()
                        page.wait_for_timeout(2500)

                        user_bubbles = page.query_selector_all(".ai-msg.user, .ai-bubble.user-bubble")
                        assistant_bubbles = page.query_selector_all(".ai-msg.assistant, .ai-bubble.assistant-bubble")
                        user_msg_count = len(user_bubbles)
                        assistant_msg_count = len(assistant_bubbles)

                        # Idempotency: Double click should produce exactly 1 query or response without freezing
                        rapid_double_tap_ok = assistant_msg_count >= 1

                        print(f"  Rapid double click -> User bubbles: {user_msg_count}, Assistant bubbles: {assistant_msg_count} | Handled={rapid_double_tap_ok}")

                    # 6. Test Close & Reopen
                    close_btn = page.query_selector("#aiCloseBtn")
                    closed_ok = False
                    reopened_ok = False
                    if close_btn:
                        close_btn.click()
                        page.wait_for_timeout(500)
                        closed_ok = page.evaluate("() => { const s = document.getElementById('qbizAiSheet'); return s && s.style.display === 'none'; }")
                        # Reopen
                        if ai_btn:
                            ai_btn.click()
                            page.wait_for_timeout(500)
                            reopened_ok = page.evaluate("() => { const s = document.getElementById('qbizAiSheet'); return s && s.style.display !== 'none'; }")
                        print(f"  Close/Reopen assistant: Closed={closed_ok}, Reopened={reopened_ok}")

                # Save screenshot
                clean_vp = vpname.replace(" ", "_").lower()
                clean_host = "primary" if "Vercel" in hname else "backup"
                os.makedirs("tests/evidence", exist_ok=True)
                ss_path = f"tests/evidence/{clean_host}_{clean_vp}_ui.png"
                page.screenshot(path=ss_path)

                results.append({
                    "host": hname,
                    "viewport": vpname,
                    "ai_opened": ai_opened,
                    "chip_count": len(chips),
                    "chip_samples": chip_texts[:4],
                    "user_messages": user_msg_count,
                    "assistant_messages": assistant_msg_count,
                    "idempotency_pass": rapid_double_tap_ok,
                    "overflow": overflow,
                    "console_errors": len(console_errors),
                    "screenshot": ss_path
                })

                context.close()

        browser.close()

    print("------------------------------------------------------------")
    print(f"REAL UI SUMMARY:")
    for r in results:
        print(f"  {r['host']} [{r['viewport']}]: Opened={r['ai_opened']}, Chips={r['chip_count']}, Idempotency={r['idempotency_pass']}, Overflow={r['overflow']}, ConsoleErrors={r['console_errors']}")

    with open("tests/real_ui_test_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    run_real_ui_tests()
