import os
import sys
import io
import time
import json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

QA_URL = "http://127.0.0.1:4180"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "evidence_phase3h")
os.makedirs(OUTPUT_DIR, exist_ok=True)

COMPLEX_QUERIES = [
    # Group 1: 3-in-1 Compound Queries (Revenue + Profit + Replenishment)
    {
        "id": "Q01",
        "group": "Compound 3-in-1",
        "prompt": "Hôm nay bán được nhiều không Tuần này lời được bao nhiêu và lên nhập cái gì trong tháng này",
        "expected_intents": ["sales_summary", "get_profit_summary", "replenishment_suggestion"]
    },
    {
        "id": "Q02",
        "group": "Compound 3-in-1",
        "prompt": "Doanh thu hôm nay thế nào tuần này lãi hay lỗ và cần nhập thêm hàng gì",
        "expected_intents": ["sales_summary", "get_profit_summary", "replenishment_suggestion"]
    },
    {
        "id": "Q03",
        "group": "Compound 3-in-1",
        "prompt": "Tháng này doanh số bao nhiêu tuần này lời được bao nhiêu và nên lấy hàng gì",
        "expected_intents": ["sales_summary", "get_profit_summary", "replenishment_suggestion"]
    },
    {
        "id": "Q04",
        "group": "Compound 3-in-1",
        "prompt": "Hôm nay có bán được gì không so với hôm qua thế nào và hàng nào đang hết cần nhập",
        "expected_intents": ["sales_summary", "find_low_stock"]
    },
    {
        "id": "Q05",
        "group": "Compound 3-in-1",
        "prompt": "Doanh số 7 ngày qua thế nào trừ chi phí thì lãi bao nhiêu và cần đặt thêm món gì",
        "expected_intents": ["sales_summary", "get_profit_summary", "replenishment_suggestion"]
    },

    # Group 2: Merchandising Classification (Restock vs Discontinue / Slow-moving)
    {
        "id": "Q06",
        "group": "Merchandising Strategy",
        "prompt": "Những mặt hàng nào nên nhập trong tháng này và những hàng nào không nên bán nữa đấy",
        "expected_intents": ["replenishment_suggestion", "product_performance_ranking"]
    },
    {
        "id": "Q07",
        "group": "Merchandising Strategy",
        "prompt": "Hàng nào đang bán chạy cần lấy thêm và hàng nào tồn đọng lâu ngày không nên nhập nữa",
        "expected_intents": ["product_performance_ranking", "replenishment_suggestion"]
    },
    {
        "id": "Q08",
        "group": "Merchandising Strategy",
        "prompt": "Mặt hàng nào đang ế chôn vốn và mặt hàng nào sắp hết cần nhập gấp",
        "expected_intents": ["product_performance_ranking", "find_low_stock"]
    },
    {
        "id": "Q09",
        "group": "Merchandising Strategy",
        "prompt": "Cửa hàng có món nào bán chậm cần thanh lý và món nào bán tốt cần duy trì",
        "expected_intents": ["product_performance_ranking"]
    },
    {
        "id": "Q10",
        "group": "Merchandising Strategy",
        "prompt": "Hàng nào không ai mua và hàng nào bán chạy nhất tuần này",
        "expected_intents": ["product_performance_ranking", "top_selling_products"]
    },

    # Group 3: Quarterly, Financial Calculation & Broad Summary
    {
        "id": "Q11",
        "group": "Financial & Period Report",
        "prompt": "Báo cáo cho tôi doanh thu của quý và tính toán lợi nhuận cũng như những hàng nào không nên tiếp tục nhập hãy gợi ý",
        "expected_intents": ["sales_summary", "get_profit_summary", "replenishment_suggestion"]
    },
    {
        "id": "Q12",
        "group": "Financial & Period Report",
        "prompt": "Doanh thu quý này được bao nhiêu tiền tính lãi gộp và cho biết hàng nào bán kém nhất",
        "expected_intents": ["sales_summary", "get_profit_summary", "product_performance_ranking"]
    },
    {
        "id": "Q13",
        "group": "Financial & Period Report",
        "prompt": "Tổng kết kinh doanh tháng này doanh thu lợi nhuận và sức khỏe cửa hàng ra sao",
        "expected_intents": ["sales_summary", "get_profit_summary", "shop_health_check"]
    },
    {
        "id": "Q14",
        "group": "Financial & Period Report",
        "prompt": "Báo cáo tài chính tháng này bán được bao nhiêu lãi bao nhiêu và tiền vốn đang nằm ở đâu nhiều nhất",
        "expected_intents": ["sales_summary", "get_profit_summary"]
    },
    {
        "id": "Q15",
        "group": "Financial & Period Report",
        "prompt": "Tình hình kinh doanh 30 ngày qua doanh thu chi phí lợi nhuận và rủi ro tồn kho",
        "expected_intents": ["sales_summary", "get_profit_summary", "replenishment_suggestion"]
    },

    # Group 4: Multi-dimensional Stock & Operational Cross-Check
    {
        "id": "Q16",
        "group": "Stock & Operations",
        "prompt": "Hàng nào còn tồn nhiều hàng nào còn tồn ít và hàng nào nên lấy",
        "expected_intents": ["check_stock", "find_low_stock", "replenishment_suggestion"]
    },
    {
        "id": "Q17",
        "group": "Stock & Operations",
        "prompt": "Hàng nào tồn nhiều nhất hàng nào sắp đứt hàng và tổng vốn tồn kho hiện tại là bao nhiêu",
        "expected_intents": ["check_stock", "find_low_stock"]
    },
    {
        "id": "Q18",
        "group": "Stock & Operations",
        "prompt": "Kiểm tra tồn kho ghế 150 ghế 90D và gối F6 xem cái nào cần nhập",
        "expected_intents": ["check_stock", "replenishment_suggestion"]
    },
    {
        "id": "Q19",
        "group": "Stock & Operations",
        "prompt": "Có hàng nào bị âm kho hay sai lệch số liệu không và doanh thu hôm nay thế nào",
        "expected_intents": ["shop_health_check", "sales_summary"]
    },
    {
        "id": "Q20",
        "group": "Stock & Operations",
        "prompt": "Đơn hàng nào chưa thanh toán hàng nào thiếu và ca hiện tại tiền mặt bao nhiêu",
        "expected_intents": ["search_orders", "find_low_stock"]
    },

    # Group 5: Strategic Advice & Direct Action
    {
        "id": "Q21",
        "group": "Action & Advisory",
        "prompt": "Hôm nay tôi cần làm những việc gì quan trọng nhất trong kho",
        "expected_intents": ["shop_health_check", "get_five_actions_today"]
    },
    {
        "id": "Q22",
        "group": "Action & Advisory",
        "prompt": "Có nên nhập thêm Ghế sáng chế 150 lúc này không và nhập bao nhiêu thì hợp lý",
        "expected_intents": ["replenishment_suggestion", "evaluate_product_viability"]
    },
    {
        "id": "Q23",
        "group": "Action & Advisory",
        "prompt": "Đánh giá hiệu quả kinh doanh của Gối cổ sáng chế F6 và cho tôi lời khuyên",
        "expected_intents": ["evaluate_product_viability", "product_performance_ranking"]
    },
    {
        "id": "Q24",
        "group": "Action & Advisory",
        "prompt": "Nếu nhập hàng đợt này cần chuẩn bị bao nhiêu tiền vốn và gom cho nhà cung cấp nào",
        "expected_intents": ["replenishment_suggestion"]
    },
    {
        "id": "Q25",
        "group": "Action & Advisory",
        "prompt": "So sánh doanh thu tuần này với tuần trước và tìm ra mặt hàng tăng trưởng tốt nhất",
        "expected_intents": ["sales_summary", "product_performance_ranking"]
    }
]

def run_benchmark():
    print("=" * 70)
    print("BENCHMARK: 25 COMPLEX & COMPOUND AI QUERIES TEST")
    print(f"Target Server: {QA_URL}")
    print("=" * 70)

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/116.0 Mobile"
        )
        page = context.new_page()

        print(f"Navigating to {QA_URL}...")
        page.goto(QA_URL, wait_until="networkidle", timeout=30000)
        time.sleep(2)

        # Open AI Sheet to initialize context
        trigger = page.locator("#qbizAiTrigger")
        trigger.click()
        time.sleep(1)

        for idx, item in enumerate(COMPLEX_QUERIES):
            qid = item["id"]
            prompt = item["prompt"]
            group = item["group"]

            print(f"\n[{idx+1}/25] [{qid}] ({group})")
            print(f"  Prompt: \"{prompt}\"")

            t0 = time.time()
            try:
                # Execute routeIntent directly inside page context
                eval_script = f"""
                async () => {{
                    const prompt = {json.dumps(prompt)};
                    const {{ routeIntent }} = await import('/src/ai/router.js');
                    const {{ buildContextEnvelope }} = await import('/src/ai/context.js');
                    const state = window.__qbiz_app__?.state || {{}};
                    const context = buildContextEnvelope(state);
                    const tStart = performance.now();
                    try {{
                        const res = await routeIntent(prompt, context, state);
                        const dur = Math.round(performance.now() - tStart);
                        return {{
                            success: true,
                            duration_ms: dur,
                            intent: res.intent,
                            isMulti: res.composition === 'MULTI' || (res.semantic_plan?.intents?.length > 1),
                            intents: res.semantic_plan?.intents?.map(i => i.required_capability || i.intent_name) || [res.intent],
                            text: res.text || '',
                            proposal: res.proposal ? {{
                                id: res.proposal.id,
                                summary: res.proposal.human_summary,
                                action: res.proposal.action
                            }} : null,
                            provider: res.provider || res.semantic_plan?.provider_trace?.provider || 'UNKNOWN',
                            model: res.model || res.semantic_plan?.provider_trace?.model || 'unknown'
                        }};
                    }} catch (err) {{
                        return {{
                            success: false,
                            error: String(err.message || err),
                            duration_ms: Math.round(performance.now() - tStart)
                        }};
                    }}
                }}
                """
                out = page.evaluate(eval_script)
                dur = out.get("duration_ms", int((time.time() - t0) * 1000))
                
                if out.get("success"):
                    intents = out.get("intents", [])
                    txt = out.get("text", "")
                    provider = out.get("provider", "UNKNOWN")
                    model = out.get("model", "unknown")
                    is_multi = out.get("isMulti", False)

                    # Assess quality
                    # 1. Did it detect multiple intents for compound query?
                    # 2. Does text contain substantial answer?
                    is_compound_query = len(item.get("expected_intents", [])) > 1
                    compound_handled = (not is_compound_query) or is_multi or (len(intents) > 1)
                    has_content = len(txt) > 50

                    status = "PASS_FULL" if (compound_handled and has_content) else "PASS_PARTIAL" if has_content else "WEAK_RESPONSE"
                    
                    print(f"  Result: {status} | Latency: {dur}ms | Provider: {provider} ({model})")
                    print(f"  Intents detected: {intents}")
                    preview = txt.replace('\n', ' ')[:140]
                    print(f"  Answer preview: {preview}...")

                    results.append({
                        "id": qid,
                        "group": group,
                        "prompt": prompt,
                        "status": status,
                        "duration_ms": dur,
                        "provider": provider,
                        "model": model,
                        "is_multi": is_multi,
                        "intents": intents,
                        "text": txt,
                        "proposal": out.get("proposal")
                    })
                else:
                    print(f"  Result: ERROR | Error: {out.get('error')}")
                    results.append({
                        "id": qid,
                        "group": group,
                        "prompt": prompt,
                        "status": "ERROR",
                        "duration_ms": dur,
                        "error": out.get("error")
                    })

            except Exception as e:
                dur = int((time.time() - t0) * 1000)
                print(f"  Result: EXCEPTION | Error: {e}")
                results.append({
                    "id": qid,
                    "group": group,
                    "prompt": prompt,
                    "status": "EXCEPTION",
                    "duration_ms": dur,
                    "error": str(e)
                })

        # Capture a live chat session for the 3 key user queries
        print("\n--- Capturing Live Chat Dialogues for User Key Queries ---")
        input_box = page.locator("#aiTextInput")
        send_btn = page.locator("#aiSendBtn")

        # Query 1 Live
        user_q1 = "Hôm nay bán được nhiều không Tuần này lời được bao nhiêu và lên nhập cái gì trong tháng này"
        input_box.fill(user_q1)
        send_btn.click()
        time.sleep(3.5)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "live_eval_user_q1.png"))

        # Query 2 Live
        user_q2 = "Những mặt hàng nào nên nhập trong tháng này và những hàng nào không nên bán nữa đấy"
        input_box.fill(user_q2)
        send_btn.click()
        time.sleep(3.5)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "live_eval_user_q2.png"))

        # Query 3 Live
        user_q3 = "Báo cáo cho tôi doanh thu của quý và tính toán lợi nhuận cũng như những hàng nào không nên tiếp tục nhập hãy gợi ý"
        input_box.fill(user_q3)
        send_btn.click()
        time.sleep(3.5)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "live_eval_user_q3.png"))

        browser.close()

    # Save summary report
    summary_path = os.path.join(OUTPUT_DIR, "complex_queries_eval_report.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+07:00"),
            "total_queries": len(results),
            "pass_full": sum(1 for r in results if r.get("status") == "PASS_FULL"),
            "pass_partial": sum(1 for r in results if r.get("status") == "PASS_PARTIAL"),
            "errors": sum(1 for r in results if r.get("status") in ["ERROR", "EXCEPTION"]),
            "average_latency_ms": round(sum(r.get("duration_ms", 0) for r in results) / len(results), 1) if results else 0,
            "results": results
        }, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 70)
    print(f"BENCHMARK COMPLETE: Saved report to {summary_path}")
    print("=" * 70)

if __name__ == "__main__":
    run_benchmark()
