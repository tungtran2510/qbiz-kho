import os
import sys
import io
import time
import json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

QA_URL = "http://127.0.0.1:4180"

REMAINING_QUERIES = [
    {
        "id": "EXP_04",
        "title": "Xuất kho vượt quá tồn khả dụng (Kiểm tra chặn âm kho)",
        "prompt": "Xuất kho 10 chiếc Ghế sáng chế 150 khỏi kho Trung tâm ngay bây giờ",
    },
    {
        "id": "EXP_05",
        "title": "Hóa đơn bán lẻ có Giảm giá, Phụ thu ship, Thông tin người nhận",
        "prompt": "Lập hóa đơn xuất bán 3 Gối cổ sáng chế F6 giảm giá 100.000đ, phí ship 30.000đ giao về 45 Nguyễn Huệ, người nhận Chị Lan SĐT 0909123456",
    }
]

def run_remaining():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(QA_URL, wait_until="networkidle", timeout=30000)

        for item in REMAINING_QUERIES:
            qid = item["id"]
            title = item["title"]
            prompt = item["prompt"]

            eval_script = f"""
            async () => {{
                const prompt = {json.dumps(prompt)};
                const {{ routeIntent }} = await import('/src/ai/router.js');
                const {{ buildContextEnvelope }} = await import('/src/ai/context.js');
                const state = window.__qbiz_app__?.state || {{}};
                const context = buildContextEnvelope(state);
                try {{
                    const res = await routeIntent(prompt, context, state);
                    return {{
                        success: true,
                        intent: res.intent,
                        text: res.text || '',
                        proposal: res.proposal ? {{
                            id: res.proposal.id,
                            summary: res.proposal.human_summary,
                            parameters: res.proposal.parameters || {{}},
                            status: res.proposal.status,
                            requires_confirmation: res.proposal.requires_confirmation
                        }} : null
                    }};
                }} catch (err) {{
                    return {{ success: false, error: String(err.message || err) }};
                }}
            }}
            """
            out = page.evaluate(eval_script)
            print(f"\n[{qid}] {title}")
            print(f"Prompt: {prompt}")
            print(f"Intent: {out.get('intent')}")
            print(f"Proposal: {json.dumps(out.get('proposal'), ensure_ascii=False)}")
            print(f"Text: {out.get('text', '')[:200]}")

        browser.close()

if __name__ == "__main__":
    run_remaining()
