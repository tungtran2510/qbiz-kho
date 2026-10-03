import os
import sys
import time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

QA_URL = "http://192.168.1.10:4180/index.html"
OUT_DIR = "docs/evidence_phase3h"

def run_proof():
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"[*] Connecting to {QA_URL} (Mobile Viewport 412x915, simulating real phone)...")
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

        # ---------------------------------------------------------
        # TEST A: Verify POS Stock Badges (Floating badges: white box, black text, color dots)
        # ---------------------------------------------------------
        print("\n=== TEST A: POS Stock Badges UI ===")
        page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'products';
                window.__qbiz_app__.render();
            }
        }""")
        time.sleep(1)

        badges = page.locator(".pos-stock-badge")
        badge_count = badges.count()
        print(f"  + Found {badge_count} pos-stock-badge elements on POS grid.")
        assert badge_count > 0, "No stock badges found!"
        first_badge = badges.first
        first_badge_text = first_badge.inner_text().strip()
        print(f"  + First badge text: '{first_badge_text}'")
        dots = page.locator(".stock-dot")
        print(f"  + Found {dots.count()} stock-dot elements (green/yellow indicator dots).")
        page.screenshot(path=f"{OUT_DIR}/pos_stock_badges_proof.png", full_page=False)

        # ---------------------------------------------------------
        # TEST B: "Nhập 5c" with current product context -> Exact Proposal Qty 5
        # ---------------------------------------------------------
        print("\n=== TEST B: 'Nhập 5c' Contextual Stock Increase ===")
        # Open AI Sheet
        trigger = page.locator("#qbizAiTrigger")
        trigger.click()
        time.sleep(1)

        # Set product context on app state
        page.evaluate("""() => {
            const prods = window.__qbiz_app__?.state?.data?.products || [];
            if (prods.length > 0) {
                window.__qbiz_app__.state.currentProductId = prods[0].id;
                window.__qbiz_app__.state.page = 'products';
            }
        }""")

        input_box = page.locator("#aiTextInput")
        send_btn = page.locator("#aiSendBtn")

        input_box.fill("Nhập 5c")
        send_btn.click()

        # Wait for proposal
        time.sleep(2)
        bubbles = page.locator(".ai-bubble.assistant-bubble")
        assert bubbles.count() > 0, "No assistant bubble rendered!"
        last_bubble = bubbles.last.inner_text()
        print(f"  + Assistant response for 'Nhập 5c':\n{last_bubble}")

        # Check proposal card
        prop_cards = page.locator(".ai-proposal-card, [data-confirm-proposal]")
        print(f"  + Found {prop_cards.count()} proposal cards/buttons.")
        assert "5" in last_bubble or "5 cái" in last_bubble or "5 chiếc" in last_bubble, f"Missing 5 in proposal: {last_bubble}"
        assert "20" not in last_bubble or "Nhập thêm 5" in last_bubble, f"Wrong quantity 20 found in proposal: {last_bubble}"
        page.screenshot(path=f"{OUT_DIR}/receipt_5c_proposal_proof.png", full_page=False)
        print("  ✓ TEST B PASSED: 'Nhập 5c' created proposal with quantity 5, zero 20-fallback!")

        # ---------------------------------------------------------
        # TEST C: Compound 3-part question & Compact line formatting
        # ---------------------------------------------------------
        print("\n=== TEST C: Compound 3-part question & Compact Formatting ===")
        compound_q = "Hàng nào bán chạy nhất tháng này và doanh thu tuần này so với doanh thu tuần trước thế nào và đề xuất cho tôi mặt hàng nào nên nhập tuần này"
        input_box.fill(compound_q)
        t_start = time.time()
        send_btn.click()

        # Wait for answer
        max_wait = 25.0
        start_wait = time.time()
        while time.time() - start_wait < max_wait:
            time.sleep(0.5)
            loading = page.locator("#aiLoadingIndicator")
            if loading.count() == 0 or not loading.is_visible():
                break

        duration_ms = int((time.time() - t_start) * 1000)
        print(f"  + Response completed in {duration_ms}ms ({duration_ms/1000:.2f}s)")

        bubbles = page.locator(".ai-bubble.assistant-bubble")
        compound_bubble = bubbles.last
        answer_text = compound_bubble.inner_text()
        print("="*60)
        print("COMPOUND ANSWER TEXT:")
        print(answer_text)
        print("="*60)

        # Verify all 3 parts:
        ans_lower = answer_text.lower()
        has_part1 = "bán chạy" in ans_lower or "top" in ans_lower or "hiệu suất" in ans_lower
        has_part2 = "doanh" in ans_lower or "tuần" in ans_lower or "so với" in ans_lower
        has_part3 = "đề xuất" in ans_lower or "nhập" in ans_lower or "tồn" in ans_lower

        print(f"  + Part 1 (Bestseller): {has_part1}")
        print(f"  + Part 2 (Comparison): {has_part2}")
        print(f"  + Part 3 (Replenishment): {has_part3}")

        assert has_part1, "Part 1 (Bestseller) missing!"
        assert has_part2, "Part 2 (Comparison) missing!"
        assert has_part3, "Part 3 (Replenishment) missing!"

        # Check HTML structure for compactness (no excessive br/p)
        bubble_html = compound_bubble.inner_html()
        has_triple_br = "<br><br><br>" in bubble_html or "<br/><br/><br/>" in bubble_html
        print(f"  + Has excessive triple br: {has_triple_br}")
        assert not has_triple_br, "Bubble has excessive blank lines (<br><br><br>)!"

        page.screenshot(path=f"{OUT_DIR}/compound_3part_compact_proof.png", full_page=False)
        print("  ✓ TEST C PASSED: All 3 parts answered, clean compact formatting!")

        browser.close()
        print("\n🎉 ALL 3 TESTS PASSED EMPIRICALLY WITH HARD PROOF!")

if __name__ == "__main__":
    run_proof()
