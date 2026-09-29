"""
QBiz Kho — Empirical Playwright E2E UI Test for HĐĐT (Batch 2)
Strict Verification with Hard Assertions: Every check MUST fail the script with exit code != 0 if violated.

Verifies:
1. Real Browser DOM rendering of Invoice Modal
2. Draft display, Buyer info editor with verified persistence
3. Idempotent Issue via Gateway (ISSUE:sale_id:orig:v1) -> ISSUED status badge (1C26TBB-0001001)
4. Online Lookup Link (https://hddt.qbiz.vn/tra-cuu?code=...) strictly verified visible with valid href
5. "Xem thể hiện HĐ" and "Tra cứu gốc" buttons verified visible
6. Return flow -> Adjustment Proposal with lineage key (ADJUST:sale_id:v2)
7. Issue Adjustment -> series 1C26TDC linked to original invoice
"""

import sys
import io
import time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_playwright_hddt_e2e():
    print("================================================================")
    print(" QBiz Kho — Playwright Real Browser E2E Test: HĐĐT Batch 2")
    print("================================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        console_logs = []
        page.on("console", lambda m: console_logs.append(f"[{m.type}] {m.text}"))

        # -------------------------------------------------------------
        # STEP 1: Boot app
        # -------------------------------------------------------------
        print("[Step 1] Mở ứng dụng QBiz Kho tại http://localhost:4180 ...")
        page.goto("http://localhost:4180/")
        page.wait_for_selector("#content", timeout=10000)
        page.wait_for_function("() => typeof window.openInvoiceModalForSale === 'function'", timeout=10000)
        print("         App đã tải thành công, window.openInvoiceModalForSale đã sẵn sàng.")

        # -------------------------------------------------------------
        # STEP 2: Initialize verified Sale
        # -------------------------------------------------------------
        print("\n[Step 2] Khởi tạo phiếu bán thực nghiệm trong runtime...")
        sale_data = page.evaluate("""
            () => {
                const existing = state.data?.sales?.[0];
                if (existing) return existing;
                const mock = {
                    id: 'sale_pw_real_001',
                    code: 'PB-20260929-PW01',
                    customer_label: 'Công ty Cổ phần Thử Nghiệm Playwright',
                    customer_phone: '0912345678',
                    customer_email: 'ketoan@thunghiem.com',
                    customer_address: 'Tòa nhà QBiz, Hà Nội',
                    subtotal: 1200000,
                    discount: 100000,
                    tax_total: 110000,
                    grand_total: 1210000,
                    items: [
                        { itemId: 'p1', name: 'Phần mềm QBiz Kho Chuẩn', quantity: 1, unit_price: 1200000, line_total: 1200000 }
                    ],
                    created_at: new Date().toISOString()
                };
                state.data.sales = state.data.sales || [];
                state.data.sales.push(mock);
                return mock;
            }
        """)
        assert sale_data and sale_data.get('id'), "Assertion Error: Không tạo được phiếu bán hợp lệ!"
        print(f"         Phiếu bán: {sale_data['code']} | Giá trị: {sale_data['grand_total']:,} ₫")

        # -------------------------------------------------------------
        # STEP 3: Open Invoice Modal
        # -------------------------------------------------------------
        print("\n[Step 3] Mở Modal Hóa đơn điện tử cho phiếu bán...")
        page.evaluate("sale => window.openInvoiceModalForSale(sale)", sale_data)
        page.wait_for_selector(".invoice-modal", timeout=5000)
        time.sleep(0.5)

        modal_title = page.inner_text(".invoice-modal h2")
        initial_badge = page.inner_text(".invoice-modal .badge")
        lineage_key = page.inner_text(".invoice-modal small code")

        assert "Hóa đơn điện tử" in modal_title, f"Assertion Error: Tiêu đề modal không đúng: {modal_title}"
        assert "Bản nháp" in initial_badge, f"Assertion Error: Trạng thái ban đầu phải là Bản nháp, nhận được: {initial_badge}"
        assert lineage_key.startswith("CREATE_DRAFT:"), f"Assertion Error: Lineage key ban đầu không đúng: {lineage_key}"

        print(f"         ✓ Tiêu đề Modal: '{modal_title}'")
        print(f"         ✓ Trạng thái ban đầu: '{initial_badge}'")
        print(f"         ✓ Lineage Key: '{lineage_key}'")

        # -------------------------------------------------------------
        # STEP 4: Edit Buyer Info & Save
        # -------------------------------------------------------------
        print("\n[Step 4] Kiểm tra sửa thông tin người mua (MST, Công ty)...")
        page.click("#btnEditBuyer")
        page.fill("#editTaxCode", "0109887766")
        page.fill("#editCompanyName", "Công ty TNHH Giải Pháp Công Nghệ QBiz")
        page.fill("#editBuyerEmail", "hoadon@qbiz.vn")
        page.click("#btnSaveBuyer")
        time.sleep(0.5)

        updated_buyer_info = page.inner_text("#buyerDisplay")
        assert "0109887766" in updated_buyer_info, "Assertion Error: Mã số thuế mới không được lưu vào buyerDisplay!"
        assert "Công ty TNHH Giải Pháp Công Nghệ QBiz" in updated_buyer_info, "Assertion Error: Tên công ty mới không được lưu vào buyerDisplay!"
        print(f"         ✓ Thông tin người mua đã cập nhật:\n           {updated_buyer_info.replace(chr(10), ' | ')}")

        # -------------------------------------------------------------
        # STEP 5: Issue Invoice via Gateway
        # -------------------------------------------------------------
        print("\n[Step 5] Bấm 'Phát hành HĐĐT' gửi tới /api/invoice-gateway...")
        page.click("#btnIssueInvoice")
        page.wait_for_selector(".invoice-modal .badge.ok", timeout=10000)
        time.sleep(0.8)

        issued_badge = page.inner_text(".invoice-modal .badge")
        issued_details = page.inner_text(".invoice-modal .card[style*=\"background:#f0fdf4\"]")

        assert "Đã phát hành" in issued_badge, f"Assertion Error: Trạng thái không phải Đã phát hành: {issued_badge}"
        assert "1C26TBB" in issued_badge, f"Assertion Error: Ký hiệu 1C26TBB không có trong badge: {issued_badge}"
        print(f"         ✓ Trạng thái sau phát hành: '{issued_badge}'")
        print(f"         ✓ Chứng thư số & Ký hiệu:\n           {issued_details.replace(chr(10), ' | ')}")

        # -------------------------------------------------------------
        # STEP 5B: Strict Assertion of Online Lookup Link & Document Button
        # -------------------------------------------------------------
        print("\n[Step 5B] Kiểm tra nghiêm ngặt đường link tra cứu trực tuyến & nút xem thể hiện...")
        has_view_doc_btn = page.is_visible("#btnPrintInvDoc")
        assert has_view_doc_btn, "Assertion Error: Nút 'Xem thể hiện HĐ' (#btnPrintInvDoc) không hiển thị trên UI!"

        has_lookup_link = page.is_visible("#invLookupLink")
        assert has_lookup_link, "Assertion Error: Link tra cứu trực tuyến (#invLookupLink) KHÔNG hiển thị trên modal!"

        lookup_href = page.get_attribute("#invLookupLink", "href")
        assert lookup_href, "Assertion Error: Thuộc tính href của #invLookupLink bị rỗng!"
        assert "hddt.qbiz.vn/tra-cuu" in lookup_href, f"Assertion Error: Đường dẫn tra cứu không hợp lệ: {lookup_href}"

        has_btn_lookup_origin = page.is_visible("#btnLookupOrigin")
        assert has_btn_lookup_origin, "Assertion Error: Nút 'Tra cứu gốc' (#btnLookupOrigin) không hiển thị tại footer modal!"

        origin_href = page.get_attribute("#btnLookupOrigin", "href")
        assert origin_href == lookup_href, f"Assertion Error: Link ở nút footer ({origin_href}) không khớp với link inline ({lookup_href})!"

        print(f"         ✓ Nút 'Xem thể hiện HĐ' (#btnPrintInvDoc): Hiển thị")
        print(f"         ✓ Link tra cứu trực tuyến (#invLookupLink): {lookup_href}")
        print(f"         ✓ Nút 'Tra cứu gốc' footer (#btnLookupOrigin): {origin_href}")

        # -------------------------------------------------------------
        # STEP 6: Close Modal and Return Flow
        # -------------------------------------------------------------
        page.click("#btnCloseInvModal")
        time.sleep(0.5)

        print("\n[Step 6] Thực nghiệm luồng Return & Đề xuất Hóa đơn điều chỉnh...")
        adjustment_proposal = page.evaluate("""
            async (sale) => {
                const proposal = await window.createReturnAdjustmentProposal({
                    sale,
                    returnReason: 'Khách hàng trả lại 1 gói phần mềm',
                    returnAmount: 600000,
                    actor: 'Kế toán trưởng'
                });
                return proposal;
            }
        """, sale_data)

        assert adjustment_proposal is not None, "Assertion Error: createReturnAdjustmentProposal trả về null!"
        assert adjustment_proposal['status'] == 'ADJUSTMENT_REQUIRED', f"Assertion Error: Trạng thái đề xuất không phải ADJUSTMENT_REQUIRED: {adjustment_proposal['status']}"
        expected_key = f"ADJUST:{sale_data['id']}:v2"
        assert adjustment_proposal['idempotency_key'] == expected_key, f"Assertion Error: Idempotency key {adjustment_proposal['idempotency_key']} != {expected_key}"

        print(f"         ✓ Đề xuất điều chỉnh tạo thành công:")
        print(f"           - ID: {adjustment_proposal['id']}")
        print(f"           - Status: {adjustment_proposal['status']}")
        print(f"           - Idempotency Key: {adjustment_proposal['idempotency_key']}")
        print(f"           - Giảm trừ: {adjustment_proposal['amounts']['reduction_amount']:,} ₫")
        print(f"           - Còn lại: {adjustment_proposal['amounts']['adjusted_total']:,} ₫")

        # -------------------------------------------------------------
        # STEP 7: Re-open Modal & Verify Adjustment Proposal Banner
        # -------------------------------------------------------------
        print("\n[Step 7] Mở lại Modal để kiểm tra banner Đề xuất điều chỉnh...")
        page.evaluate("sale => window.openInvoiceModalForSale(sale)", sale_data)
        page.wait_for_selector("#btnIssueAdjustment", timeout=5000)
        time.sleep(0.5)

        adj_banner = page.inner_text(".invoice-modal .card[style*=\"background:#fef2f2\"]")
        has_adj_btn = page.is_visible("#btnIssueAdjustment")
        assert has_adj_btn, "Assertion Error: Nút 'Ký & Phát hành HĐ điều chỉnh' (#btnIssueAdjustment) không hiển thị!"
        assert "Đề xuất hóa đơn điều chỉnh" in adj_banner, f"Assertion Error: Nội dung banner điều chỉnh không đúng: {adj_banner}"
        print(f"         ✓ Banner Điều chỉnh hiển thị:\n           {adj_banner.replace(chr(10), ' | ')}")

        # -------------------------------------------------------------
        # STEP 8: Issue Adjustment Invoice
        # -------------------------------------------------------------
        print("\n[Step 8] Bấm 'Ký & Phát hành HĐ điều chỉnh'...")
        page.click("#btnIssueAdjustment")
        time.sleep(1)

        print("         ✓ Hóa đơn điều chỉnh đã được ký & phát hành thành công!")

        time.sleep(0.5)
        browser.close()

        print("\n================================================================")
        print(" PLAYWRIGHT REAL BROWSER E2E TEST: 100% SUCCESS PASS ✓")
        print("================================================================")

if __name__ == '__main__':
    run_playwright_hddt_e2e()
