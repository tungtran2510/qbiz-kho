"""
QBiz Kho — Empirical Playwright E2E UI Test for HĐĐT Batch 3
Verifies:
1. "Xem thể hiện HĐ" calls getDocument() via Gateway and renders preview into DOM (#invDocPreviewArea).
2. "Làm mới trạng thái" calls getStatus() via Gateway and updates UI from DRAFT to ISSUED.
3. Strict Hard Assertions: Every check MUST fail the script with exit code != 0 if violated.
"""

import sys
import io
import time
import json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_batch3_status_document_e2e():
    print("================================================================")
    print(" QBiz Kho — Playwright E2E Test: getStatus() & getDocument()")
    print("================================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        gateway_requests = []
        gateway_responses = []

        def handle_request(req):
            if '/api/invoice-gateway' in req.url and req.method == 'POST':
                try:
                    body = json.loads(req.post_data or '{}')
                    gateway_requests.append({
                        'url': req.url,
                        'action': body.get('action'),
                        'idempotencyKey': body.get('idempotencyKey'),
                        'payload': body.get('payload')
                    })
                except Exception:
                    pass

        def handle_response(res):
            if '/api/invoice-gateway' in res.url and res.request.method == 'POST':
                try:
                    data = res.json()
                    gateway_responses.append({
                        'status': res.status,
                        'data': data
                    })
                except Exception:
                    pass

        page.on("request", handle_request)
        page.on("response", handle_response)

        # -------------------------------------------------------------
        # STEP 1: Boot app
        # -------------------------------------------------------------
        print("[Step 1] Mở ứng dụng QBiz Kho tại http://localhost:4180 ...")
        page.goto("http://localhost:4180/")
        page.wait_for_selector("#content", timeout=10000)
        page.wait_for_function("() => typeof window.openInvoiceModalForSale === 'function'", timeout=10000)
        print("         App đã tải thành công, openInvoiceModalForSale sẵn sàng.")

        # -------------------------------------------------------------
        # STEP 2: Initialize Sale & open modal in DRAFT status
        # -------------------------------------------------------------
        run_ts = int(time.time() * 1000)
        sale_id_1 = f"sale_pw_doc_{run_ts}"
        print(f"\n[Step 2] Mở modal HĐĐT cho phiếu bán {sale_id_1} ...")
        sale_data = {
            'id': sale_id_1,
            'code': f"PB-DOC-{run_ts}",
            'customer_label': 'Công ty Kiểm Thử Thể Hiện HĐ',
            'customer_phone': '0988776655',
            'customer_email': 'doc@test.vn',
            'customer_address': 'Tầng 3 Tòa Nhà Công Nghệ',
            'subtotal': 1500000,
            'discount': 100000,
            'tax_total': 140000,
            'grand_total': 1540000,
            'items': [
                {'itemId': 'item_doc_1', 'name': 'Gói Thiết Bị Kho', 'quantity': 1, 'unitPrice': 1500000, 'tax_amount': 140000, 'lineTotal': 1540000}
            ]
        }

        page.evaluate("(sale) => window.openInvoiceModalForSale(sale)", sale_data)
        page.wait_for_selector("#invModalBackdrop", timeout=5000)
        
        # Hard assert: Refresh status button must be visible in modal
        btn_refresh = page.query_selector("#btnRefreshInvStatus")
        if not btn_refresh or not btn_refresh.is_visible():
            raise AssertionError("HARD ASSERT FAILED: Nút 'Làm mới trạng thái' (#btnRefreshInvStatus) không hiển thị!")
        print("         Nút 'Làm mới trạng thái' (#btnRefreshInvStatus) hiển thị đúng.")

        # Hard assert: Initial badge is DRAFT
        badge_text = page.inner_text("#invStatusBadge")
        if "Bản nháp" not in badge_text:
            raise AssertionError(f"HARD ASSERT FAILED: Badge ban đầu phải là Bản nháp, nhận được: {badge_text}")
        print("         Trạng thái ban đầu: " + badge_text.strip())

        # -------------------------------------------------------------
        # STEP 3: Test Refresh Status on DRAFT (Provider has no record)
        # -------------------------------------------------------------
        print("\n[Step 3] Kiểm thử bấm 'Làm mới trạng thái' khi Provider chưa ghi nhận...")
        req_count_before = len([r for r in gateway_requests if r['action'] == 'getStatus'])
        page.click("#btnRefreshInvStatus")
        time.sleep(0.5)

        get_status_reqs = [r for r in gateway_requests if r['action'] == 'getStatus']
        if len(get_status_reqs) <= req_count_before:
            raise AssertionError("HARD ASSERT FAILED: Bấm 'Làm mới trạng thái' nhưng không có request action 'getStatus' gửi tới Gateway!")
        print("         Đã gọi API Gateway action 'getStatus' thành công.")

        # Re-check badge: remains Draft
        badge_text = page.inner_text("#invStatusBadge")
        if "Bản nháp" not in badge_text:
            raise AssertionError("HARD ASSERT FAILED: Khi provider chưa có bản ghi, trạng thái phải duy trì Bản nháp!")
        print("         Trạng thái vẫn là Bản nháp đúng như mong đợi.")

        # -------------------------------------------------------------
        # STEP 4: Issue invoice and verify transition to ISSUED
        # -------------------------------------------------------------
        print("\n[Step 4] Bấm 'Phát hành HĐĐT' (#btnIssueInvoice) ...")
        page.click("#btnIssueInvoice")
        page.wait_for_selector(".badge.ok", timeout=8000)
        
        issued_badge = page.inner_text("#invStatusBadge")
        if "Đã phát hành" not in issued_badge:
            raise AssertionError(f"HARD ASSERT FAILED: Sau khi phát hành, badge phải là Đã phát hành, nhận được: {issued_badge}")
        print("         Hóa đơn phát hành thành công: " + issued_badge.strip())

        # Extract issued invoice number from DOM
        inv_num_elem = page.query_selector(".invoice-modal-body")
        inv_text = inv_num_elem.inner_text() if inv_num_elem else ""
        if "Số hóa đơn:" not in inv_text:
            raise AssertionError("HARD ASSERT FAILED: Không tìm thấy trường 'Số hóa đơn:' trong chi tiết chứng thư!")
        print("         Chứng thư & Ký hiệu hóa đơn hiển thị đầy đủ trên giao diện.")

        # -------------------------------------------------------------
        # STEP 5: Test 'Xem thể hiện HĐ' -> getDocument() API & DOM render
        # -------------------------------------------------------------
        print("\n[Step 5] Kiểm thử bấm 'Xem thể hiện HĐ' (#btnPrintInvDoc) ...")
        btn_doc = page.query_selector("#btnPrintInvDoc")
        if not btn_doc or not btn_doc.is_visible():
            raise AssertionError("HARD ASSERT FAILED: Nút 'Xem thể hiện HĐ' (#btnPrintInvDoc) không hiển thị sau khi ISSUED!")

        doc_req_count_before = len([r for r in gateway_requests if r['action'] == 'getDocument'])
        page.click("#btnPrintInvDoc")
        
        # Wait for #invDocPreviewArea to become visible
        page.wait_for_selector("#invDocPreviewArea", state="visible", timeout=6000)
        
        # Hard Assert: Gateway received getDocument request
        get_doc_reqs = [r for r in gateway_requests if r['action'] == 'getDocument']
        if len(get_doc_reqs) <= doc_req_count_before:
            raise AssertionError("HARD ASSERT FAILED: Bấm 'Xem thể hiện HĐ' không tạo request action 'getDocument' tới Gateway!")
        
        last_doc_req = get_doc_reqs[-1]
        print(f"         Gateway nhận request action='getDocument', invoiceNumber='{last_doc_req['payload'].get('invoiceNumber')}'")

        # Hard Assert: Preview container contains mock document HTML
        preview_html = page.inner_html("#invDocPreviewArea")
        if "HÓA ĐƠN ĐIỆN TỬ (MOCK)" not in preview_html:
            raise AssertionError("HARD ASSERT FAILED: Vùng xem trước (#invDocPreviewArea) không chứa nội dung HÓA ĐƠN ĐIỆN TỬ (MOCK) trả về từ getDocument()!")
        
        preview_text = page.inner_text("#invDocPreviewArea")
        print(f"         Vùng xem trước đã render thành công:")
        print(f"         --> {preview_text.splitlines()[0]}")
        print(f"         --> {preview_text.splitlines()[-1] if len(preview_text.splitlines()) > 1 else ''}")

        # Test Close preview button
        page.click("#btnCloseDocPreview")
        page.wait_for_selector("#invDocPreviewArea", state="hidden", timeout=3000)
        print("         Nút '✕ Đóng xem trước' hoạt động tốt, đã ẩn vùng thể hiện.")

        # -------------------------------------------------------------
        # STEP 6: Test Refresh Status on an invoice issued in background
        # -------------------------------------------------------------
        print("\n[Step 6] Kiểm thử 'Làm mới trạng thái' cập nhật DRAFT -> ISSUED từ Provider...")
        # Close current modal
        page.click("#btnCloseInvModal")
        time.sleep(0.3)

        sale_bg = {
            'id': f'sale_pw_bg_{run_ts}',
            'code': f'PB-BG-{run_ts}',
            'customer_label': 'Khách hàng đối soát nền',
            'subtotal': 800000,
            'grand_total': 800000,
            'items': [{'itemId': 'p2', 'name': 'Dịch vụ đối soát', 'quantity': 1, 'unitPrice': 800000, 'lineTotal': 800000}]
        }

        # 1. Issue directly on provider in background (simulating another tab or background sync)
        bg_issue_res = page.evaluate("""
            async (sale) => {
                const lineageId = 'inv-' + sale.id;
                const idempotencyKey = 'ISSUE:' + sale.id + ':' + lineageId + ':v1';
                const resp = await fetch('/api/invoice-gateway', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        appScope: 'qbiz-kho',
                        action: 'issue',
                        idempotencyKey,
                        payload: { invoiceData: { sale_id: sale.id, sale_code: sale.code } }
                    })
                });
                return await resp.json();
            }
        """, sale_bg)

        bg_inv_num = bg_issue_res.get('data', {}).get('invoice_number')
        print(f"         Provider đã phát hành nền số hóa đơn: {bg_inv_num}")

        # 2. Open modal locally as DRAFT (without knowing it was issued on provider)
        page.evaluate("""
            async (sale) => {
                // Ensure local invoice is created in DRAFT status
                await window.openInvoiceModalForSale(sale);
            }
        """, sale_bg)
        page.wait_for_selector("#invModalBackdrop", timeout=5000)

        # Hard Assert: Local modal opens in DRAFT
        badge_before = page.inner_text("#invStatusBadge")
        if "Bản nháp" not in badge_before:
            raise AssertionError(f"HARD ASSERT FAILED: Modal ban đầu phải mở ở trạng thái Bản nháp, thực tế: {badge_before}")
        print("         Modal mở ra ở trạng thái Bản nháp (chưa đồng bộ).")

        # 3. Click 'Làm mới trạng thái' -> must query getStatus and transition UI to ISSUED!
        page.click("#btnRefreshInvStatus")
        page.wait_for_selector(".badge.ok", timeout=6000)

        badge_after = page.inner_text("#invStatusBadge")
        if "Đã phát hành" not in badge_after or bg_inv_num not in badge_after:
            raise AssertionError(f"HARD ASSERT FAILED: Sau khi bấm 'Làm mới trạng thái', badge không chuyển sang ISSUED với số {bg_inv_num}! Nhận được: {badge_after}")
        print(f"         Nút 'Làm mới trạng thái' đã đối soát thành công qua getStatus(): {badge_after.strip()}")

        # Verify action buttons appeared
        if not page.is_visible("#btnPrintInvDoc"):
            raise AssertionError("HARD ASSERT FAILED: Nút 'Xem thể hiện HĐ' không xuất hiện sau khi làm mới trạng thái sang ISSUED!")
        if not page.is_visible("#btnLookupOrigin"):
            raise AssertionError("HARD ASSERT FAILED: Nút 'Tra cứu gốc' không xuất hiện sau khi làm mới trạng thái sang ISSUED!")
        print("         Các nút 'Xem thể hiện HĐ' và 'Tra cứu gốc' đã hiển thị tự động.")

        # Close browser
        browser.close()

    print("\n================================================================")
    print(" ALL PLAYWRIGHT E2E BATCH 3 TESTS PASSED (100% HARD ASSERTIONS)")
    print("================================================================")

if __name__ == '__main__':
    run_batch3_status_document_e2e()
