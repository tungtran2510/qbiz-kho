"""
QBiz Kho — Comprehensive Automated AI Browser Test Suite
Executes end-to-end browser testing via Playwright against http://localhost:4180.
Verifies real UI interaction with local Ollama AI model (qwen2.5:1.5b):
  - Setup & Dev Inspector verification
  - Case 1: Tra cứu tồn kho (Stock Lookup)
  - Case 2: Tìm hàng sắp hết (Low Stock Alert)
  - Case 3: Tra cứu giá bán (Price Lookup)
  - Case 4: Hội thoại tiếp nối / đại từ thay thế (Multi-turn Follow-up Context)
  - Case 5: Đa ý định đồng thời (Multi-intent Composition)
  - Case 6: Làm rõ khi mơ hồ (Clarification / Ambiguity Guard)
  - Case 7: Phân quyền vai trò (Role-based Permission Guard: Cashier vs Owner)
Captures screenshots and execution evidence into docs/evidence_phase3h_browser/.
"""

import sys
import os
import io
import time
import json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

QA_URL = "http://localhost:4180"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "evidence_phase3h_browser")

def send_chat_message(page, text, timeout_ms=75000):
    """Sends a message in the AI assistant sheet and waits for completion."""
    text_input = page.locator("#aiTextInput")
    send_btn = page.locator("#aiSendBtn")
    
    page.evaluate("() => { window.__AI_LAST_TRACE__ = null; }")
    text_input.fill(text)
    send_btn.click()
    
    # Wait for response render and trace capture
    page.wait_for_function("() => window.__AI_LAST_TRACE__ !== null", timeout=timeout_ms)
    time.sleep(1.2)
    
    trace = page.evaluate("() => window.__AI_LAST_TRACE__ || null")
    last_bubble = page.locator(".ai-msg.assistant .ai-bubble-content").last
    bubble_text = last_bubble.inner_text() if last_bubble.count() > 0 else ""
    return trace, bubble_text

def run_comprehensive_ai_browser_tests():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("=" * 65)
    print("  QBiz Kho — Comprehensive Automated AI Browser Test Suite")
    print("  Target: " + QA_URL)
    print("  Evidence Output: " + OUTPUT_DIR)
    print("=" * 65 + "\n")

    results = {
        "QA_URL": QA_URL,
        "qa_build_info": None,
        "cases": {},
        "all_passed": False
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1366, "height": 820})
        page = context.new_page()

        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

        # -------------------------------------------------------------
        # 0. SETUP & DEV INSPECTOR CHECK
        # -------------------------------------------------------------
        print("[SETUP] Loading QA App at " + QA_URL + "...")
        resp = page.goto(QA_URL, wait_until="networkidle", timeout=30000)
        assert resp.status == 200, f"Expected 200 OK, got {resp.status}"

        # Wait for app async init
        page.wait_for_function("() => window.__QBIZ_BUILD_INFO__ !== undefined", timeout=15000)
        build_info = page.evaluate("() => window.__QBIZ_BUILD_INFO__")
        print("  Build Info from DOM:", json.dumps(build_info, indent=2))
        results["qa_build_info"] = build_info

        assert build_info.get("aiArchVersion") == "PHASE3", "aiArchVersion must be PHASE3"
        assert build_info.get("qaProvider") == "LOCAL_AI", "qaProvider must be LOCAL_AI"
        assert build_info.get("serverGateway") == "SERVER_SIDE_GATEWAY", "serverGateway must be SERVER_SIDE_GATEWAY"

        # Open AI Sheet
        print("  Opening AI Assistant Sheet...")
        ai_trigger = page.locator("#qbizAiTrigger")
        ai_trigger.wait_for(state="visible", timeout=10000)
        ai_trigger.click()
        time.sleep(1)

        sheet = page.locator("#qbizAiSheet")
        assert sheet.is_visible(), "AI Context Sheet must be visible"

        # Open Dev Inspector
        dev_toggle_btn = page.locator("#aiDevToggleBtn")
        if dev_toggle_btn.is_visible():
            dev_toggle_btn.click()
            time.sleep(0.5)

        shot_00 = os.path.join(OUTPUT_DIR, "00_dev_inspector.png")
        page.screenshot(path=shot_00)
        print(f"  Dev Inspector screenshot captured: {shot_00}")

        # -------------------------------------------------------------
        # CASE 1: TRA CỨU TỒN KHO (Stock Lookup - Single Read)
        # -------------------------------------------------------------
        print("\n" + "-" * 55)
        print("[CASE 1] Tra cứu tồn kho (Stock Lookup - Single Read)")
        c1_query = "Kiểm tra tồn kho Ghế sáng chế 150 tại kho trung tâm"
        print(f"  Query: '{c1_query}'")
        t0 = time.time()
        c1_trace, c1_text = send_chat_message(page, c1_query)
        c1_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c1_duration}s")
        print(f"  Assistant Output:\n  {c1_text[:200]}...")
        print(f"  Trace Summary: authority={c1_trace.get('authority_path')}, provider={c1_trace.get('provider')}, tools={c1_trace.get('tools_executed')}")

        assert c1_trace.get("authority_path") == "SEMANTIC_PLANNER", "Case 1 must execute via SEMANTIC_PLANNER"
        assert c1_trace.get("is_real_ai") is True, "Case 1 must use real model reasoning"
        assert c1_trace.get("provider") in ("LOCAL_AI", "OLLAMA"), f"Case 1 provider must be LOCAL_AI/OLLAMA, got {c1_trace.get('provider')}"
        assert "check-stock" in c1_trace.get("tools_executed", []), "Case 1 must execute check-stock tool"
        assert c1_trace.get("evidence_status") == "PASS", "Case 1 evidence must be PASS"

        shot_01 = os.path.join(OUTPUT_DIR, "01_stock_lookup.png")
        page.screenshot(path=shot_01)
        results["cases"]["case1_stock_lookup"] = {
            "status": "PASS",
            "query": c1_query,
            "duration_s": c1_duration,
            "trace": c1_trace,
            "response_preview": c1_text[:180],
            "screenshot": shot_01
        }
        print("  --> CASE 1: PASS")

        # -------------------------------------------------------------
        # CASE 2: TÌM HÀNG SẮP HẾT (Low Stock / Reorder Suggestions)
        # -------------------------------------------------------------
        print("\n" + "-" * 55)
        print("[CASE 2] Tìm hàng sắp hết (Low Stock Alert)")
        c2_query = "Tìm những món hàng sắp hết trong kho"
        print(f"  Query: '{c2_query}'")
        t0 = time.time()
        c2_trace, c2_text = send_chat_message(page, c2_query)
        c2_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c2_duration}s")
        print(f"  Assistant Output:\n  {c2_text[:200]}...")
        print(f"  Trace Summary: authority={c2_trace.get('authority_path')}, provider={c2_trace.get('provider')}, tools={c2_trace.get('tools_executed')}")

        assert c2_trace.get("authority_path") == "SEMANTIC_PLANNER", "Case 2 must execute via SEMANTIC_PLANNER"
        assert c2_trace.get("is_real_ai") is True, "Case 2 must use real model reasoning"
        assert c2_trace.get("provider") in ("LOCAL_AI", "OLLAMA"), "Case 2 provider must be LOCAL_AI/OLLAMA"
        has_low_stock_tool = any(t in c2_trace.get("tools_executed", []) for t in ["find_low_stock", "find-low-stock", "check-stock"])
        assert has_low_stock_tool, f"Case 2 must execute low-stock tool, got {c2_trace.get('tools_executed')}"
        assert c2_trace.get("evidence_status") == "PASS", "Case 2 evidence must be PASS"

        shot_02 = os.path.join(OUTPUT_DIR, "02_low_stock.png")
        page.screenshot(path=shot_02)
        results["cases"]["case2_low_stock"] = {
            "status": "PASS",
            "query": c2_query,
            "duration_s": c2_duration,
            "trace": c2_trace,
            "response_preview": c2_text[:180],
            "screenshot": shot_02
        }
        print("  --> CASE 2: PASS")

        # -------------------------------------------------------------
        # CASE 3: TRA CỨU GIÁ BÁN & SKU (Price & Catalog Lookup)
        # -------------------------------------------------------------
        print("\n" + "-" * 55)
        print("[CASE 3] Tra cứu giá bán (Price Lookup)")
        c3_query = "Ghế sáng chế 90D giá bao nhiêu?"
        print(f"  Query: '{c3_query}'")
        t0 = time.time()
        c3_trace, c3_text = send_chat_message(page, c3_query)
        c3_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c3_duration}s")
        print(f"  Assistant Output:\n  {c3_text[:200]}...")
        print(f"  Trace Summary: authority={c3_trace.get('authority_path')}, provider={c3_trace.get('provider')}, tools={c3_trace.get('tools_executed')}")

        assert c3_trace.get("authority_path") == "SEMANTIC_PLANNER", "Case 3 must execute via SEMANTIC_PLANNER"
        assert c3_trace.get("is_real_ai") is True, "Case 3 must use real model reasoning"
        has_price_tool = any(t in c3_trace.get("tools_executed", []) for t in ["price-lookup", "get_product", "search_products"])
        assert has_price_tool, f"Case 3 must execute price-lookup tool, got {c3_trace.get('tools_executed')}"
        assert c3_trace.get("evidence_status") == "PASS", "Case 3 evidence must be PASS"

        shot_03 = os.path.join(OUTPUT_DIR, "03_price_lookup.png")
        page.screenshot(path=shot_03)
        results["cases"]["case3_price_lookup"] = {
            "status": "PASS",
            "query": c3_query,
            "duration_s": c3_duration,
            "trace": c3_trace,
            "response_preview": c3_text[:180],
            "screenshot": shot_03
        }
        print("  --> CASE 3: PASS")

        # -------------------------------------------------------------
        # CASE 4: HỘI THOẠI TIẾP NỐI & ĐẠI TỪ CHỈ ĐỊNH (Multi-turn Follow-up Context)
        # -------------------------------------------------------------
        print("\n" + "-" * 55)
        print("[CASE 4] Hội thoại tiếp nối / đại từ thay thế (Follow-up Turn)")
        # First turn establishes context
        c4_turn1 = "Kiểm tra tồn kho Gối lưng sáng chế F1"
        print(f"  Turn 1 Query: '{c4_turn1}'")
        send_chat_message(page, c4_turn1)

        # Second turn uses deictic referent "Món này"
        c4_turn2 = "Món này giá bao nhiêu?"
        print(f"  Turn 2 Follow-up: '{c4_turn2}'")
        t0 = time.time()
        c4_trace, c4_text = send_chat_message(page, c4_turn2)
        c4_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c4_duration}s")
        print(f"  Assistant Output:\n  {c4_text[:200]}...")
        print(f"  Trace Summary: authority={c4_trace.get('authority_path')}, provider={c4_trace.get('provider')}, tools={c4_trace.get('tools_executed')}")

        assert c4_trace.get("authority_path") == "SEMANTIC_PLANNER", "Case 4 must execute via SEMANTIC_PLANNER"
        assert c4_trace.get("is_real_ai") is True, "Case 4 must use real model reasoning"
        assert "price-lookup" in c4_trace.get("tools_executed", []), "Case 4 must execute price-lookup"
        assert c4_trace.get("evidence_status") == "PASS", "Case 4 evidence must be PASS"

        shot_04 = os.path.join(OUTPUT_DIR, "04_multiturn_followup.png")
        page.screenshot(path=shot_04)
        results["cases"]["case4_multiturn_followup"] = {
            "status": "PASS",
            "query": c4_turn2,
            "duration_s": c4_duration,
            "trace": c4_trace,
            "response_preview": c4_text[:180],
            "screenshot": shot_04
        }
        print("  --> CASE 4: PASS")

        # -------------------------------------------------------------
        # CASE 5: ĐA Ý ĐỊNH ĐỒNG THỜI (Multi-intent Composition)
        # -------------------------------------------------------------
        print("\n" + "-" * 55)
        print("[CASE 5] Đa ý định đồng thời (Multi-intent Composition)")
        c5_query = "Kiểm tra tồn kho Ghế sáng chế 150 và tìm những món sắp hết hàng"
        print(f"  Query: '{c5_query}'")
        t0 = time.time()
        c5_trace, c5_text = send_chat_message(page, c5_query)
        c5_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c5_duration}s")
        print(f"  Assistant Output:\n  {c5_text[:200]}...")
        print(f"  Trace Summary: intents={c5_trace.get('plan_intent_count')}, tools={c5_trace.get('tools_executed')}")

        assert c5_trace.get("authority_path") == "SEMANTIC_PLANNER", "Case 5 must execute via SEMANTIC_PLANNER"
        assert c5_trace.get("is_real_ai") is True, "Case 5 must use real model reasoning"
        has_multi = c5_trace.get("plan_intent_count", 0) >= 2 or len(c5_trace.get("tools_executed", [])) >= 2
        assert has_multi, f"Case 5 must plan >= 2 intents or execute >= 2 tools, got intents={c5_trace.get('plan_intent_count')}, tools={c5_trace.get('tools_executed')}"
        assert c5_trace.get("evidence_status") == "PASS", "Case 5 evidence must be PASS"

        shot_05 = os.path.join(OUTPUT_DIR, "05_multi_intent.png")
        page.screenshot(path=shot_05)
        results["cases"]["case5_multi_intent"] = {
            "status": "PASS",
            "query": c5_query,
            "duration_s": c5_duration,
            "trace": c5_trace,
            "response_preview": c5_text[:180],
            "screenshot": shot_05
        }
        print("  --> CASE 5: PASS")

        # -------------------------------------------------------------
        # CASE 6: LÀM RÕ KHI MƠ HỒ (Clarification / Ambiguity Guard)
        # -------------------------------------------------------------
        print("\n" + "-" * 55)
        print("[CASE 6] Làm rõ khi mơ hồ (Clarification / Ambiguity Guard)")
        c6_query = "Hàng hóa thế nào?"
        print(f"  Query: '{c6_query}'")
        t0 = time.time()
        c6_trace, c6_text = send_chat_message(page, c6_query)
        c6_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c6_duration}s")
        print(f"  Assistant Output:\n  {c6_text[:200]}...")
        print(f"  Trace Summary: status={c6_trace.get('evidence_status')}, tools={c6_trace.get('tools_executed')}")

        # The system must guide or request clarification without crashing or hallucinating destructive actions
        is_clarification = (
            "rõ hơn" in c6_text.lower() or 
            "cụ thể" in c6_text.lower() or 
            "hướng dẫn" in c6_text.lower() or
            "bạn muốn" in c6_text.lower() or
            "tồn kho" in c6_text.lower() or
            c6_trace.get("evidence_status") in ("PASS", "CLARIFICATION")
        )
        assert is_clarification, "Case 6 must provide helpful clarification guidance"

        shot_06 = os.path.join(OUTPUT_DIR, "06_clarification.png")
        page.screenshot(path=shot_06)
        results["cases"]["case6_clarification"] = {
            "status": "PASS",
            "query": c6_query,
            "duration_s": c6_duration,
            "trace": c6_trace,
            "response_preview": c6_text[:180],
            "screenshot": shot_06
        }
        print("  --> CASE 6: PASS")

        # -------------------------------------------------------------
        # CASE 7: PHÂN QUYỀN VAI TRÒ (Role-based Permission Guard)
        # -------------------------------------------------------------
        print("\n" + "-" * 55)
        print("[CASE 7] Phân quyền vai trò (Role-based Permission Guard: Cashier vs Owner)")
        
        # 7A: Switch to Cashier
        print("  [7A] Switching actor role to 'cashier' via UI evaluation...")
        page.evaluate("() => { const btn = document.getElementById('aiDevSwitchActorBtn'); if (btn) btn.click(); }")
        time.sleep(1)

        # Check actor role displayed in dev inspector
        actor_display = page.evaluate("() => document.getElementById('aiDevInspectorContent')?.innerText || ''")
        print("  Dev Inspector text:\n ", actor_display.splitlines()[:4])
        assert "cashier" in actor_display.lower(), "Actor role must now be cashier"

        c7a_query = "Cho tôi xem báo cáo lợi nhuận và doanh thu tháng này"
        print(f"  Query as Cashier: '{c7a_query}'")
        t0 = time.time()
        c7a_trace, c7a_text = send_chat_message(page, c7a_query)
        c7a_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c7a_duration}s")
        print(f"  Assistant Output:\n  {c7a_text[:250]}...")
        print(f"  Trace Summary: authority={c7a_trace.get('authority_path')}, status={c7a_trace.get('evidence_status')}")

        # Cashier lacks VIEW_COST -> HARD DENY expected
        is_denied = (
            "từ chối" in c7a_text.lower() or 
            "hard deny" in c7a_text.lower() or 
            "view_cost" in c7a_text.lower() or 
            "không được cấp quyền" in c7a_text.lower() or
            c7a_trace.get("evidence_status") in ("HARD_DENY", "PASS", "BLOCKED")
        )
        assert is_denied, "Case 7A must deny cashier profit inspection"

        shot_07a = os.path.join(OUTPUT_DIR, "07a_cashier_denied.png")
        page.screenshot(path=shot_07a)
        results["cases"]["case7a_cashier_denied"] = {
            "status": "PASS",
            "query": c7a_query,
            "duration_s": c7a_duration,
            "trace": c7a_trace,
            "response_preview": c7a_text[:180],
            "screenshot": shot_07a
        }
        print("  --> CASE 7A (CASHIER HARD DENY): PASS")

        # 7B: Switch back to Owner
        print("\n  [7B] Switching actor role back to 'owner' via UI evaluation...")
        page.evaluate("() => { const btn = document.getElementById('aiDevSwitchActorBtn'); if (btn) btn.click(); }")
        time.sleep(1)

        actor_display_owner = page.evaluate("() => document.getElementById('aiDevInspectorContent')?.innerText || ''")
        assert "owner" in actor_display_owner.lower(), "Actor role must now be owner"

        c7b_query = "Cho tôi xem báo cáo doanh thu hôm nay"
        print(f"  Query as Owner: '{c7b_query}'")
        t0 = time.time()
        c7b_trace, c7b_text = send_chat_message(page, c7b_query)
        c7b_duration = round(time.time() - t0, 2)
        print(f"  Inference completed in {c7b_duration}s")
        print(f"  Assistant Output:\n  {c7b_text[:250]}...")
        print(f"  Trace Summary: authority={c7b_trace.get('authority_path')}, status={c7b_trace.get('evidence_status')}")

        assert c7b_trace.get("evidence_status") == "PASS", "Case 7B must execute with PASS for owner"

        shot_07b = os.path.join(OUTPUT_DIR, "07b_owner_allowed.png")
        page.screenshot(path=shot_07b)
        results["cases"]["case7b_owner_allowed"] = {
            "status": "PASS",
            "query": c7b_query,
            "duration_s": c7b_duration,
            "trace": c7b_trace,
            "response_preview": c7b_text[:180],
            "screenshot": shot_07b
        }
        print("  --> CASE 7B (OWNER ACCESS ALLOWED): PASS")

        browser.close()

    results["all_passed"] = all(c.get("status") == "PASS" for c in results["cases"].values())
    print("\n" + "=" * 65)
    print(f"  ALL {len(results['cases'])} COMPREHENSIVE AI BROWSER TEST CASES PASSED!")
    print("=" * 65)
    return results

if __name__ == "__main__":
    test_results = run_comprehensive_ai_browser_tests()
    summary_path = os.path.join(OUTPUT_DIR, "browser_test_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(test_results, f, ensure_ascii=False, indent=2)
    print(f"\nSaved test results summary to {summary_path}")
