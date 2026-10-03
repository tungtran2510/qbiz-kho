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

QUERIES = [
    {
        "id": "EXP_01",
        "title": "Xuất kho kèm Khách hàng, Chiết khấu, Công nợ",
        "prompt": "Lập phiếu xuất kho cho khách hàng Nguyễn Văn Tuấn 5 chiếc Ghế sáng chế 150 kho Trung tâm, chiết khấu 10%, hẹn thanh toán sau 7 ngày",
        "target_aspects": ["Khách hàng", "Chiết khấu", "Hạn nợ", "Kiểm tra tồn khả dụng"]
    },
    {
        "id": "EXP_02",
        "title": "Xuất hóa đơn GTGT / VAT Doanh nghiệp có MST, Địa chỉ",
        "prompt": "Xuất hóa đơn bán hàng cho Công ty TNHH Giải Pháp QBiz, MST: 0312345678, địa chỉ 123 Lê Lợi Q1, gồm 2 Ghế 90D và 5 Gối F6, thanh toán chuyển khoản ACB",
        "target_aspects": ["MST", "Tên Công ty", "Địa chỉ", "Nhiều mặt hàng (Multi-line)", "Hình thức thanh toán"]
    },
    {
        "id": "EXP_03",
        "title": "Phiếu xuất kho nhiều mặt hàng (Multi-line issue)",
        "prompt": "Tạo phiếu xuất kho xuất đồng thời 2 Ghế sáng chế 150 và 5 Gối cổ sáng chế F6 lý do xuất mẫu cho đối tác xem hàng",
        "target_aspects": ["Xuất nhiều mặt hàng cùng 1 phiếu", "Lý do xuất kho mẫu"]
    },
    {
        "id": "EXP_04",
        "title": "Xuất kho vượt quá tồn khả dụng (Kiểm tra chặn âm kho)",
        "prompt": "Xuất kho 10 chiếc Ghế sáng chế 150 khỏi kho Trung tâm ngay bây giờ",
        "target_aspects": ["Chặn xuất âm", "Bảo vệ tồn kho an toàn"]
    },
    {
        "id": "EXP_05",
        "title": "Hóa đơn bán lẻ có Giảm giá, Phụ thu ship, Thông tin người nhận",
        "prompt": "Lập hóa đơn xuất bán 3 Gối cổ sáng chế F6 giảm giá 100.000đ, phí ship 30.000đ giao về 45 Nguyễn Huệ, người nhận Chị Lan SĐT 0909123456",
        "target_aspects": ["Giảm giá tiền mặt", "Phí ship", "Địa chỉ giao", "SĐT người nhận"]
    }
]

def run_tests():
    print("=" * 70)
    print("TEST SUITE: PHIẾU XUẤT KHO & HÓA ĐƠN PHỨC TẠP")
    print(f"Target: {QA_URL}")
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
        page.goto(QA_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_function("() => window.__qbiz_app__ && document.querySelector('#content')", timeout=15000)
        try:
            page.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
        except Exception as e:
            print("previewDemo warning:", e)
        time.sleep(2)

        # Open AI Sheet
        page.locator("#qbizAiTrigger").click()
        time.sleep(1)

        input_box = page.locator("#aiTextInput")
        send_btn = page.locator("#aiSendBtn")

        for idx, item in enumerate(QUERIES):
            qid = item["id"]
            title = item["title"]
            prompt = item["prompt"]

            print(f"\n[{idx+1}/{len(QUERIES)}] [{qid}] {title}")
            print(f"  Prompt: \"{prompt}\"")

            t0 = time.time()

            # Execute via routeIntent in page
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
                        composition: res.composition,
                        intents: res.semantic_plan?.intents?.map(i => i.required_capability || i.intent_name) || [res.intent],
                        text: res.text || '',
                        proposal: res.proposal ? {{
                            id: res.proposal.id,
                            intent: res.proposal.intent,
                            summary: res.proposal.human_summary,
                            parameters: res.proposal.parameters || {{}},
                            status: res.proposal.status,
                            requires_confirmation: res.proposal.requires_confirmation
                        }} : null,
                        provider: res.provider || res.semantic_plan?.provider_trace?.provider || 'UNKNOWN'
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

            # Also submit in real chat input to capture screenshot
            input_box.fill(prompt)
            send_btn.click()
            time.sleep(3)
            ss_path = os.path.join(OUTPUT_DIR, f"live_export_{qid.lower()}.png")
            page.screenshot(path=ss_path)

            intent = out.get("intent")
            intents = out.get("intents", [])
            txt = out.get("text", "")
            prop = out.get("proposal")
            provider = out.get("provider", "UNKNOWN")

            print(f"  Latency: {dur}ms | Provider: {provider} | Intent: {intent} (Sub-intents: {intents})")
            if prop:
                print(f"  Proposal Created: [{prop.get('id')}] {prop.get('summary')}")
                print(f"  Proposal Params: {json.dumps(prop.get('parameters'), ensure_ascii=False)}")
            else:
                print(f"  Proposal: None")
            preview = txt.replace('\n', ' ')[:160]
            print(f"  Text Output: {preview}...")

            results.append({
                "id": qid,
                "title": title,
                "prompt": prompt,
                "target_aspects": item["target_aspects"],
                "duration_ms": dur,
                "provider": provider,
                "intent": intent,
                "intents": intents,
                "proposal": prop,
                "text": txt,
                "screenshot": f"docs/evidence_phase3h/live_export_{qid.lower()}.png"
            })

        browser.close()

    # Save summary report
    report_file = os.path.join(OUTPUT_DIR, "export_invoice_eval_report.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+07:00"),
            "total_tested": len(results),
            "results": results
        }, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 70)
    print(f"EVALUATION COMPLETE: Report saved to {report_file}")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
