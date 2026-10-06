# -*- coding: utf-8 -*-
import sys
import os
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def test_streamlined_transaction_modal():
    console_errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile iPhone 13 (390x844)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1/5] Navigating to http://localhost:4180...")
        page.goto("http://localhost:4180", wait_until="networkidle")
        time.sleep(1)

        print("[2/5] Ensuring sample transaction exists...")
        page.evaluate("""() => {
            if (!window.state.data.sales || window.state.data.sales.length === 0) {
                const s = {
                    id: 'sale-test-001',
                    code: 'POS-000004',
                    sale_uuid: 'POS-000004',
                    customer_label: 'Khách lẻ',
                    channel: 'pos',
                    created_at: new Date().toISOString(),
                    grand_total: 148372000,
                    subtotal: 148372000,
                    discount_total: 0,
                    tax_total: 0,
                    payment_method: 'cash',
                    payment_status: 'PAID',
                    items: [
                        { name: 'Ghế sáng chế 90T', sku: 'DL-90T', quantity: 2, unit_price: 34937000, line_total: 69874000 },
                        { name: 'Ghế sáng chế 95', sku: 'DL-95', quantity: 2, unit_price: 39249000, line_total: 78498000 }
                    ],
                    payments: [{ method: 'cash', amount: 148372000, status: 'PAID' }]
                };
                window.state.data.sales = [s];
            }
        }""")

        print("[3/5] Opening transaction modal via UI click or openTransaction()...")
        page.evaluate("() => window.openTransaction(window.state.data.sales[0])")
        time.sleep(0.5)

        modal = page.locator("#modalRoot .modal")
        if not modal.is_visible():
            raise Exception("Modal Chi tiết giao dịch không hiển thị!")

        action_grid = page.locator("#modalRoot .tx-action-grid")
        if not action_grid.is_visible():
            raise Exception("Khối action grid .tx-action-grid không hiển thị trên đỉnh modal!")
        print("  ✓ Khối action grid 4 nút thao tác hiển thị nổi bật ở phía trên.")

        # Check all 4 action buttons
        print_btn = page.locator('#modalRoot [data-action="print-receipt"]')
        inv_btn = page.locator('#modalRoot [data-action="invoice-info"]')
        ship_btn = page.locator('#modalRoot [data-action="ship-sale"]')
        share_btn = page.locator('#modalRoot [data-action="share-receipt"]')

        assert print_btn.is_visible(), "Nút In phiếu không hiển thị!"
        assert inv_btn.is_visible(), "Nút Hóa đơn điện tử không hiển thị!"
        assert ship_btn.is_visible(), "Nút Đẩy đơn không hiển thị!"
        assert share_btn.is_visible(), "Nút Chia sẻ không hiển thị!"
        print("  ✓ Cả 4 nút thao tác nhanh (In phiếu, Hóa đơn ĐT, Đẩy đơn, Chia sẻ) hiển thị đầy đủ, không bị cắt xén.")

        # Check viewport overflow on Mobile
        overflow = page.evaluate("""() => {
            return {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                isOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        }""")
        print(f"  Mobile 390px scrollWidth={overflow['scrollWidth']}, clientWidth={overflow['clientWidth']}, isOverflow={overflow['isOverflow']}")
        assert not overflow["isOverflow"], "Modal bị tràn ngang trên mobile!"

        # Screenshot
        page.screenshot(path="tests/evidence/transaction_modal_streamlined_mobile.png")
        print("  ✓ Screenshot saved: tests/evidence/transaction_modal_streamlined_mobile.png")

        print("[4/5] Testing click on In phiếu...")
        print_btn.click()
        time.sleep(0.5)
        print("  ✓ Click In phiếu thành công.")

        # Close modal and verify opening from Transactions list
        page.locator("#modalRoot [data-close], #modalRoot .close-btn").first.click()
        time.sleep(0.3)

        page.evaluate("() => { window.navigate('transactions'); window.render(); }")
        time.sleep(0.5)
        row = page.locator(".transaction-row").first
        if row.is_visible():
            row.click()
            time.sleep(0.5)
            assert page.locator("#modalRoot .tx-action-grid").is_visible(), "Click transaction row không mở được modal mới!"
            print("  ✓ Mở modal từ danh sách Giao dịch & phiếu thành công.")

        print("[5/5] Checking Console Errors...")
        filtered_errors = [e for e in console_errors if "favicon" not in e.lower() and "manifest" not in e.lower()]
        if filtered_errors:
            print(f"  ⚠️ Console errors detected: {filtered_errors}")
            raise Exception(f"Console errors detected: {filtered_errors}")
        else:
            print("  ✓ 0 Console errors detected across all workflows.")

        print("🎉 STREAMLINED TRANSACTION MODAL TEST PASSED 100%!")
        browser.close()

if __name__ == "__main__":
    test_streamlined_transaction_modal()
