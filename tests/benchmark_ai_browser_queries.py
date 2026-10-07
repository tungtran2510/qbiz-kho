# -*- coding: utf-8 -*-
import os
import sys
import json
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
BASE_URL = "http://localhost:4180"

TEST_QUERIES = [
    {
        "id": "Q1_QUICK_SERVICE_WARRANTY",
        "category": "Dịch vụ & Bảo hành nhanh",
        "prompt": "Khách thay màn hình iPhone 13 giá 1tr5 bảo hành 6 tháng 1 đổi 1",
        "expectation": "Tạo dịch vụ hoặc đề xuất vào giỏ hàng POS với giá 1.500.000đ, BH 6 tháng, 1 đổi 1"
    },
    {
        "id": "Q2_SERVICE_NO_STOCK",
        "category": "Dịch vụ công thợ thuần túy",
        "prompt": "Khách sửa loa laptop Dell tiền công 200k",
        "expectation": "Nhận diện là dịch vụ không trừ tồn kho"
    },
    {
        "id": "Q3_SEARCH_BY_IMEI",
        "category": "Tra cứu theo số máy / IMEI",
        "prompt": "Tìm cho tôi đơn hàng có số IMEI 356891234567890",
        "expectation": "Tra cứu lịch sử phiếu bán hoặc thông tin máy theo IMEI"
    },
    {
        "id": "Q4_NAVIGATE_PRODUCTS",
        "category": "Điều hướng khu vực",
        "prompt": "Vào khu sản phẩm",
        "expectation": "Chuyển sang trang Hàng hóa (Products)"
    },
    {
        "id": "Q5_NAVIGATE_SERVICES",
        "category": "Điều hướng Dịch vụ",
        "prompt": "Cho xem danh sách dịch vụ sửa chữa",
        "expectation": "Chuyển sang trang Hàng hóa tab Dịch vụ"
    },
    {
        "id": "Q6_CHECK_STOCK",
        "category": "Kiểm tra tồn kho sản phẩm",
        "prompt": "Kiểm tra còn bao nhiêu Bàn chải đánh răng Colgate",
        "expectation": "Báo chính xác số lượng tồn kho sản phẩm Colgate ngắn gọn"
    },
    {
        "id": "Q7_CHECK_LOW_STOCK",
        "category": "Cảnh báo hàng sắp hết",
        "prompt": "Sản phẩm nào sắp hết hàng trong kho",
        "expectation": "Liệt kê các mặt hàng có tồn kho dưới mức tối thiểu không lặp ý"
    },
    {
        "id": "Q8_REVENUE_TODAY",
        "category": "Báo cáo doanh thu",
        "prompt": "Doanh thu hôm nay được bao nhiêu tiền",
        "expectation": "Tính toán và trả lời doanh thu trong ngày ngắn gọn"
    },
    {
        "id": "Q9_CUSTOMER_DEBT",
        "category": "Quản lý công nợ",
        "prompt": "Ai đang còn nợ tiền cửa hàng",
        "expectation": "Báo cáo công nợ sắc nét, không in danh sách 0đ rác"
    },
    {
        "id": "Q10_COMPLEX_APPOINTMENT",
        "category": "Hẹn giờ & Tiếp nhận phức tạp",
        "prompt": "Khách hẹn 5h chiều nay lấy máy iPhone 13 sửa nguồn 350k nhé",
        "expectation": "Bóc tách dịch vụ sửa nguồn 350k và không nhầm 5h hay 13 thành giá"
    },
    {
        "id": "Q11_SLANG_100_CANH",
        "category": "Tiếng lóng & Đơn vị dân gian",
        "prompt": "Cài lại win cho khách lấy 100 cành",
        "expectation": "Nhận diện dịch vụ cài win với giá 100.000đ"
    },
    {
        "id": "Q12_SLANG_5_XI_WARRANTY",
        "category": "Tiếng lóng 5 xị & Bảo hành",
        "prompt": "Ép kính màn hình Samsung 5 xị bảo hành 3 tháng",
        "expectation": "Nhận diện dịch vụ ép kính giá 500.000đ và BH 3 tháng"
    },
    {
        "id": "Q13_MIXED_ORDER",
        "category": "Đơn kết hợp Hàng hóa + Dịch vụ",
        "prompt": "Khách mua 1 bàn chải Colgate và thay màn hình iPhone 13 1tr5",
        "expectation": "Đề xuất đơn hàng gồm cả Bàn chải Colgate và dịch vụ thay màn hình 1.500.000đ"
    },
    {
        "id": "Q14_PRICE_AND_STOCK",
        "category": "Tra cứu Giá & Tồn",
        "prompt": "Bàn chải Colgate giá bao nhiêu tiền còn không",
        "expectation": "Trả lời đầy đủ giá bán và tồn kho khả dụng"
    }
]

def run_benchmark():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        print(f"[*] Opening QBiz Kho at {BASE_URL}...", flush=True)
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(2000)

        # Initialize demo session
        page.evaluate("""async () => {
            const demoBtn = document.querySelector('[data-action="preview-demo"]');
            if (demoBtn) demoBtn.click();
            else if (window.previewDemo) await window.previewDemo('retail');
            const modalClose = document.querySelector('#modalRoot [data-close], #modalRoot .close-btn');
            if (modalClose) modalClose.click();
        }""")
        page.wait_for_timeout(1500)

        # ==========================================
        # STEP 1: VERIFY GOODS / SERVICES UI LAYOUT
        # ==========================================
        print("\n==========================================", flush=True)
        print(" VERIFYING GOODS / SERVICES MOBILE LAYOUT", flush=True)
        print("==========================================", flush=True)

        # Navigate to Products page
        page.evaluate("""() => {
            if (window.navigate) window.navigate('products');
            else if (window.renderProducts) window.renderProducts();
        }""")
        page.wait_for_timeout(1500)

        # 1. In Products Tab:
        prod_wh_btn = page.query_selector(".goods-warehouse-btn")
        prod_scan_btn = page.query_selector(".goods-search button[data-action='scan']")
        prod_wh_visible = prod_wh_btn.is_visible() if prod_wh_btn else False
        prod_scan_visible = prod_scan_btn.is_visible() if prod_scan_btn else False
        print(f"-> [Products Tab] Warehouse button visible: {prod_wh_visible} (Expect: True)")
        print(f"-> [Products Tab] Scan QR button visible: {prod_scan_visible} (Expect: True)")
        
        ss_prod_path = os.path.join(ARTIFACT_DIR, "evidence_goods_products_tab_mobile.png")
        page.screenshot(path=ss_prod_path)
        print(f"-> Screenshot saved: {ss_prod_path}")

        # Switch to Service Tab
        page.click("[data-product-type='SERVICE']")
        page.wait_for_timeout(1500)

        # 2. In Services Tab:
        svc_wh_btn = page.query_selector(".goods-warehouse-btn")
        svc_scan_btn = page.query_selector(".goods-search button[data-action='scan']")
        svc_search_placeholder = page.evaluate("""() => document.getElementById('productSearch')?.placeholder || ''""")
        svc_wh_visible = svc_wh_btn.is_visible() if svc_wh_btn else False
        svc_scan_visible = svc_scan_btn.is_visible() if svc_scan_btn else False
        
        # Check that search input and scan button are on the same line (same top offset ± 2px)
        same_row = page.evaluate("""() => {
            const input = document.getElementById('productSearch');
            const btn = document.querySelector('.goods-search button[data-action="scan"]');
            if (!input || !btn) return false;
            const r1 = input.getBoundingClientRect();
            const r2 = btn.getBoundingClientRect();
            return Math.abs(r1.top - r2.top) <= 4;
        }""")
        
        print(f"-> [Service Tab] Warehouse button visible: {svc_wh_visible} (Expect: False - Bỏ ở tab dịch vụ)")
        print(f"-> [Service Tab] Scan QR button visible: {svc_scan_visible} (Expect: True - Cùng hàng)")
        print(f"-> [Service Tab] Search placeholder: '{svc_search_placeholder}'")
        print(f"-> [Service Tab] Search input & Scan button on SAME ROW: {same_row} (Expect: True)")

        ss_svc_path = os.path.join(ARTIFACT_DIR, "evidence_goods_services_tab_mobile.png")
        page.screenshot(path=ss_svc_path)
        print(f"-> Screenshot saved: {ss_svc_path}")

        ui_passed = (prod_wh_visible and not svc_wh_visible and svc_scan_visible and same_row)
        print(f"[*] Goods / Services UI Layout Check: {'PASS' if ui_passed else 'FAIL'}\n")

        # ==========================================
        # STEP 2: VERIFY AI OPERATING LAYER BENCHMARK
        # ==========================================
        print("==========================================", flush=True)
        print(" RUNNING 14-QUERY AI CONCISE BENCHMARK", flush=True)
        print("==========================================", flush=True)

        # Open AI Assistant floating trigger
        opened_ai = page.evaluate("""() => {
            const trigger = document.getElementById('qbizAiTrigger');
            if (trigger) {
                trigger.click();
                return true;
            }
            return false;
        }""")
        page.wait_for_timeout(1000)

        for q in TEST_QUERIES:
            qid = q["id"]
            cat = q["category"]
            prompt = q["prompt"]
            exp = q["expectation"]

            print(f"\n--- Testing [{qid}] ({cat}) ---", flush=True)
            print(f"Prompt: \"{prompt}\"", flush=True)
            print(f"Expectation: {exp}", flush=True)

            try:
                # Ensure AI sheet is open
                page.evaluate("""() => {
                    const sheet = document.getElementById('qbizAiSheet');
                    if (!sheet || sheet.style.display === 'none' || !sheet.classList.contains('is-open')) {
                        const trigger = document.getElementById('qbizAiTrigger');
                        if (trigger) trigger.click();
                        else if (window.qbizAi && window.qbizAi.openSheet) window.qbizAi.openSheet();
                    }
                }""")
                page.wait_for_timeout(600)

                # Type query and submit
                page.fill("#aiTextInput", prompt)
                page.click("#aiSendBtn")

                # Wait for AI processing to finish
                page.wait_for_timeout(300)
                page.wait_for_function("() => !document.querySelector('.ai-msg.assistant.is-loading') && !document.querySelector('#aiTextInput').disabled", timeout=35000)
                page.wait_for_timeout(500)

                # Extract last assistant message text and proposal if any
                eval_data = page.evaluate("""() => {
                    const msgs = document.querySelectorAll('.ai-msg.assistant:not(.is-loading)');
                    const lastMsg = msgs[msgs.length - 1];
                    if (!lastMsg) return { text: '', proposal: null, error: 'No message found' };
                    
                    const textEl = lastMsg.querySelector('.ai-msg-text');
                    const propCard = lastMsg.querySelector('.ai-proposal-card');
                    
                    let propInfo = null;
                    if (propCard) {
                        const title = propCard.querySelector('.ai-prop-title')?.textContent?.trim() || '';
                        const summary = propCard.querySelector('.ai-prop-summary')?.textContent?.trim() || '';
                        propInfo = { title, summary };
                    }
                    
                    return {
                        text: textEl ? textEl.innerText.trim() : lastMsg.innerText.trim(),
                        proposal: propInfo,
                        badge: lastMsg.querySelector('.ai-msg-trace')?.textContent?.trim() || ''
                    };
                }""")

                resp_text = eval_data.get("text", "")
                proposal = eval_data.get("proposal")
                clean_resp = " ".join(resp_text.split())

                print(f"Response ({len(clean_resp)} chars): {clean_resp[:180]}...", flush=True)
                if proposal:
                    print(f"Proposal Card: [{proposal.get('title')}] {proposal.get('summary')[:120]}...", flush=True)

                # Capture screenshot for key queries
                screenshot_path = ""
                if qid in ["Q1_QUICK_SERVICE_WARRANTY", "Q6_CHECK_STOCK", "Q7_CHECK_LOW_STOCK", "Q9_CUSTOMER_DEBT", "Q11_SLANG_100_CANH", "Q12_SLANG_5_XI_WARRANTY", "Q13_MIXED_ORDER"]:
                    clean_id = qid.lower()
                    screenshot_path = os.path.join(ARTIFACT_DIR, f"evidence_ai_eval_{clean_id}.png")
                    page.screenshot(path=screenshot_path)
                    print(f"Screenshot saved: {screenshot_path}", flush=True)

                results.append({
                    "id": qid,
                    "category": cat,
                    "prompt": prompt,
                    "expectation": exp,
                    "response": clean_resp,
                    "has_proposal": bool(proposal),
                    "proposal_title": proposal.get("title") if proposal else "",
                    "proposal_summary": proposal.get("summary") if proposal else "",
                    "screenshot": screenshot_path
                })

            except Exception as e:
                print(f"ERROR executing {qid}: {str(e)}", flush=True)
                results.append({
                    "id": qid,
                    "category": cat,
                    "prompt": prompt,
                    "expectation": exp,
                    "response": f"ERROR: {str(e)}",
                    "has_proposal": False,
                    "proposal_title": "",
                    "proposal_summary": "",
                    "screenshot": ""
                })

        browser.close()

    # Save benchmark report json
    report_file = os.path.join(ARTIFACT_DIR, "ai_benchmark_report_v2.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({"ui_layout_pass": ui_passed, "queries": results}, f, ensure_ascii=False, indent=2)
    print(f"\n[+] Full report saved to {report_file}", flush=True)

if __name__ == "__main__":
    run_benchmark()
