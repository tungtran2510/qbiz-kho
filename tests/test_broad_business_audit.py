import os
import sys
import io
import time
import json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

QA_URL = "http://127.0.0.1:4180"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "evidence_broad_business_audit")
os.makedirs(OUTPUT_DIR, exist_ok=True)

AUDIT_QUERIES = [
    # --- DOMAIN 1: TÌNH TRẠNG HÀNG HÓA ---
    {
        "domain": "1. Tình trạng hàng hóa",
        "id": "STK_01",
        "title": "Hàng tồn kho nhiều nhất / đọng vốn",
        "prompt": "Những mặt hàng nào đang tồn kho nhiều nhất đọng vốn?",
        "expected_domain": "Kho / Tồn kho"
    },
    {
        "domain": "1. Tình trạng hàng hóa",
        "id": "STK_02",
        "title": "Lệch kho / Kiểm kê thất thoát",
        "prompt": "Có hàng nào bị lệch giữa sổ sách và tồn thực tế không?",
        "expected_domain": "Kho / Kiểm kê"
    },
    {
        "domain": "1. Tình trạng hàng hóa",
        "id": "STK_03",
        "title": "So sánh tồn kho đa chi nhánh (Kho Trung tâm vs Hà Đông)",
        "prompt": "So sánh tồn kho giữa kho Trung tâm và kho Hà Đông",
        "expected_domain": "Kho / Đa kho"
    },

    # --- DOMAIN 2: LỢI NHUẬN, DOANH THU & THUẾ ---
    {
        "domain": "2. Lợi nhuận & Thuế",
        "id": "FIN_01",
        "title": "Tỷ suất lợi nhuận biên của shop",
        "prompt": "Tỷ suất lợi nhuận biên của shop tháng này là bao nhiêu phần trăm?",
        "expected_domain": "Tài chính / Lợi nhuận"
    },
    {
        "domain": "2. Lợi nhuận & Thuế",
        "id": "FIN_02",
        "title": "Doanh thu tính thuế HKD Thông tư 88/2021",
        "prompt": "Doanh thu tính thuế theo Thông tư 88 từ đầu tháng đến nay là bao nhiêu?",
        "expected_domain": "Thuế HKD"
    },
    {
        "domain": "2. Lợi nhuận & Thuế",
        "id": "FIN_03",
        "title": "Bảng kê thuế GTGT đầu ra",
        "prompt": "Xuất bảng kê thuế GTGT đầu ra tháng này",
        "expected_domain": "Thuế VAT"
    },

    # --- DOMAIN 3: MÁY IN & IN ẤN ---
    {
        "domain": "3. Máy in & In ấn",
        "id": "PRN_01",
        "title": "In lại hóa đơn bán hàng vừa bán",
        "prompt": "In lại hóa đơn vừa bán",
        "expected_domain": "Máy in"
    },
    {
        "domain": "3. Máy in & In ấn",
        "id": "PRN_02",
        "title": "Đổi khổ giấy in bill (K58 / K80)",
        "prompt": "Đổi máy in sang khổ giấy K58",
        "expected_domain": "Máy in"
    },
    {
        "domain": "3. Máy in & In ấn",
        "id": "PRN_03",
        "title": "In vận đơn giao hàng cho đơn mới",
        "prompt": "In vận đơn giao hàng cho đơn mới nhất",
        "expected_domain": "Máy in / Vận đơn"
    },

    # --- DOMAIN 4: HÓA ĐƠN ĐIỆN TỬ (HĐĐT) ---
    {
        "domain": "4. Hóa đơn điện tử",
        "id": "INV_01",
        "title": "Trạng thái kết nối nhà cấp HĐĐT (VNPT, Viettel)",
        "prompt": "Kiểm tra kết nối hóa đơn điện tử VNPT và Viettel",
        "expected_domain": "HĐĐT"
    },
    {
        "domain": "4. Hóa đơn điện tử",
        "id": "INV_02",
        "title": "Phát hành hóa đơn điện tử có mã cơ quan thuế",
        "prompt": "Phát hành hóa đơn điện tử có mã cơ quan thuế cho đơn hàng vừa tạo",
        "expected_domain": "HĐĐT"
    },

    # --- DOMAIN 5: ĐƠN VỊ VẬN CHUYỂN & GIAO HÀNG ---
    {
        "domain": "5. Vận chuyển & Giao hàng",
        "id": "LOG_01",
        "title": "Kết nối Giao Hàng Nhanh (GHN) & GHTK",
        "prompt": "Kết nối Giao Hàng Nhanh GHN và GHTK",
        "expected_domain": "Vận chuyển"
    },
    {
        "domain": "5. Vận chuyển & Giao hàng",
        "id": "LOG_02",
        "title": "Tạo vận đơn gửi hàng qua GHTK",
        "prompt": "Tạo vận đơn gửi hàng qua Giao Hàng Tiết Kiệm",
        "expected_domain": "Vận chuyển"
    },
    {
        "domain": "5. Vận chuyển & Giao hàng",
        "id": "LOG_03",
        "title": "Tra cứu hành trình đơn vận chuyển",
        "prompt": "Tra cứu hành trình đơn hàng vận chuyển mã GHN123456",
        "expected_domain": "Vận chuyển"
    },

    # --- DOMAIN 6: SÀN TMĐT & PHẦN MỀM NGOÀI ---
    {
        "domain": "6. Sàn TMĐT & Đa kênh",
        "id": "MKT_01",
        "title": "Đồng bộ đơn hàng Shopee & TikTok Shop",
        "prompt": "Đồng bộ đơn hàng từ Shopee và TikTok Shop về kho",
        "expected_domain": "Sàn TMĐT"
    },
    {
        "domain": "6. Sàn TMĐT & Đa kênh",
        "id": "MKT_02",
        "title": "Kết nối phần mềm KiotViet để đồng bộ tồn kho",
        "prompt": "Kết nối với phần mềm KiotViet để đồng bộ tồn kho",
        "expected_domain": "Phần mềm ngoài"
    },

    # --- DOMAIN 7: MÁY POS & CA LÀM VIỆC ---
    {
        "domain": "7. POS & Ca thu ngân",
        "id": "POS_01",
        "title": "Kết nối máy POS thanh toán quẹt thẻ",
        "prompt": "Kết nối máy POS thanh toán cầm tay",
        "expected_domain": "Thiết bị POS"
    },
    {
        "domain": "7. POS & Ca thu ngân",
        "id": "POS_02",
        "title": "Mở ca thu ngân & tiền đầu ca",
        "prompt": "Mở ca thu ngân và kiểm tra tiền két đầu ca",
        "expected_domain": "Ca làm việc"
    },
    {
        "domain": "7. POS & Ca thu ngân",
        "id": "POS_03",
        "title": "Chốt ca làm việc & đối soát lệch két",
        "prompt": "Chốt ca làm việc hôm nay có bị lệch tiền không?",
        "expected_domain": "Ca làm việc"
    },

    # --- DOMAIN 8: THANH TOÁN QR & NGÂN HÀNG ---
    {
        "domain": "8. Thanh toán VietQR & Bank",
        "id": "PAY_01",
        "title": "Tạo mã QR thanh toán VietQR động",
        "prompt": "Tạo mã QR thanh toán VietQR ngân hàng ACB cho đơn 500k",
        "expected_domain": "VietQR"
    },
    {
        "domain": "8. Thanh toán VietQR & Bank",
        "id": "PAY_02",
        "title": "Kiểm tra biến động số dư ngân hàng",
        "prompt": "Kiểm tra tiền đã vào tài khoản ngân hàng chưa",
        "expected_domain": "Ngân hàng"
    }
]

def run_broad_audit():
    print("=" * 80)
    print("KHẢO SÁT & ĐÁNH GIÁ KHÁCH QUAN CÁC NGHIỆP VỤ BÁN HÀNG, KHO, VẬN CHUYỂN, HĐĐT, POS")
    print(f"Môi trường: {QA_URL}")
    print(f"Tổng số kịch bản kiểm thử: {len(AUDIT_QUERIES)}")
    print("=" * 80)

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

        page.locator("#qbizAiTrigger").click()
        time.sleep(1)

        input_box = page.locator("#aiTextInput")
        send_btn = page.locator("#aiSendBtn")

        for idx, item in enumerate(AUDIT_QUERIES):
            qid = item["id"]
            domain = item["domain"]
            title = item["title"]
            prompt = item["prompt"]

            print(f"\n[{idx+1}/{len(AUDIT_QUERIES)}] [{domain}] [{qid}] {title}")
            print(f"  Prompt: \"{prompt}\"")

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
                        status: res.status || 'OK',
                        proposal: res.proposal ? {{
                            id: res.proposal.id,
                            intent: res.proposal.intent,
                            summary: res.proposal.human_summary,
                            parameters: res.proposal.parameters || {{}},
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
            dur = out.get("duration_ms", 0)
            intent = out.get("intent", "UNKNOWN")
            intents = out.get("intents", [])
            txt = out.get("text", "")
            prop = out.get("proposal")
            provider = out.get("provider", "UNKNOWN")
            success = out.get("success", False)

            # Classify response health
            assessment = "UNKNOWN"
            note = ""
            if not success:
                assessment = "ERROR"
                note = f"Exception: {out.get('error')}"
            elif prop:
                assessment = "PROPOSAL_CREATED"
                note = f"Proposal: [{prop.get('id')}] {prop.get('summary')}"
            elif "⚠️" in txt or "chưa hỗ trợ" in txt.lower() or "chưa kết nối" in txt.lower() or "không thể" in txt.lower():
                assessment = "HONEST_BOUNDARY_OR_WARN"
                note = "Hệ thống trung thực báo chưa hỗ trợ hoặc cảnh báo nghiệp vụ"
            elif len(txt.strip()) > 20:
                assessment = "ANSWERED_WITH_DATA"
                note = "Trả lời trực tiếp từ dữ liệu hệ thống"
            else:
                assessment = "BRIEF_OR_UNCERTAIN"
                note = "Phản hồi ngắn hoặc chưa rõ ràng"

            print(f"  Latency: {dur}ms | Provider: {provider} | Intent: {intent}")
            print(f"  Assessment: {assessment}")
            print(f"  Note: {note}")
            preview = txt.replace('\n', ' ')[:160]
            print(f"  Text Output: {preview}...")

            # Screenshot via real UI input for sample checks
            if idx in [0, 3, 6, 9, 11, 14, 16, 18]:
                try:
                    input_box.fill(prompt)
                    send_btn.click()
                    time.sleep(2.5)
                    ss_path = os.path.join(OUTPUT_DIR, f"audit_{qid.lower()}.png")
                    page.screenshot(path=ss_path)
                except Exception as ss_e:
                    pass

            results.append({
                "id": qid,
                "domain": domain,
                "title": title,
                "prompt": prompt,
                "expected_domain": item["expected_domain"],
                "duration_ms": dur,
                "provider": provider,
                "intent": intent,
                "intents": intents,
                "proposal": prop,
                "text": txt,
                "assessment": assessment,
                "note": note
            })

        browser.close()

    # Save summary report
    report_file = os.path.join(OUTPUT_DIR, "broad_business_audit_report.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S+07:00"),
            "total_tested": len(results),
            "results": results
        }, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 80)
    print(f"BÁO CÁO ĐÁNH GIÁ HOÀN TẤT: Lưu tại {report_file}")
    print("=" * 80)

if __name__ == "__main__":
    run_broad_audit()
