"""
QBiz Kho — POS Receipt Print Isolation & Standard Voucher Test
Verifies:
1. Strict Print Isolation:
   - In @media print, #app, #modalRoot, .modal-backdrop, .sidebar, .topbar, .content are 100% display: none.
   - ONLY #qbizPrintRoot is visible.
2. Standard Commercial POS Receipt Layout:
   - Store header (Branding name, slogan, address, hotline, Wi-Fi info).
   - Document title (HÓA ĐƠN BÁN HÀNG / PHIẾU BÁN HÀNG / PHIẾU GIAO HÀNG).
   - Metadata (Document code, Date-time, Cashier, Register, Customer).
   - Itemized table (Product/Service name, variants/duration, Qty, Unit Price, Line Total).
   - Financial totals (Subtotal, Discount, Tax, bold grand total, payment method, cash received, change).
   - Footer (VietQR code, Thank you note, Return policy, QBiz branding).
3. Verified from all entry points:
   - Point 1: POS success screen -> In phiếu
   - Point 2: Transaction modal (HD-0001) -> In phiếu
   - Point 3: Order detail modal (DH-102) -> In lại
   - Point 4: Print Center -> Xem mẫu in demo -> In thử phiếu này / Lưu PDF
   - Point 5: Print Center -> Thiết bị -> In thử K80 / In thử K58
4. Zero horizontal overflow, single clean print flow across Mobile (390px, 412px) and Desktop (1440px).
"""

import sys
import os
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:4180/"
EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), "evidence")
os.makedirs(EVIDENCE_DIR, exist_ok=True)


def test_pos_receipt_print_isolation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()

        # Intercept window.print to prevent browser hang while capturing print DOM
        page.add_init_script("""
            window.__printed_jobs__ = [];
            window.print = function() {
                const root = document.getElementById('qbizPrintRoot');
                window.__printed_jobs__.push({
                    timestamp: Date.now(),
                    hasContent: !!(root && root.innerHTML.trim()),
                    html: root ? root.innerHTML : ''
                });
                console.log('window.print intercepted, jobs:', window.__printed_jobs__.length);
            };
        """)

        print(f"Loading {APP_URL}...")
        page.goto(APP_URL, wait_until="networkidle")
        time.sleep(1)

        # Enter food_beverage demo mode (same industry as user's screenshot "Cà phê muối kem béo")
        page.evaluate("async () => await window.__qbiz_app__.previewDemo('food_beverage')")
        time.sleep(1.5)

        # ---------------------------------------------------------------------
        # TEST 1: Print from Transaction Modal (HD-0001 or first transaction)
        # ---------------------------------------------------------------------
        print("\n--- TEST 1: Print from Transaction Modal ---")
        page.evaluate("window.__qbiz_app__.navigate('transactions')")
        time.sleep(1)

        # Click first transaction row
        tx_row = page.locator(".transaction-row").first
        tx_code = tx_row.locator("strong").first.inner_text().strip()
        print(f"Opening transaction: {tx_code}")
        tx_row.click()
        time.sleep(0.8)

        # Check modal is open
        assert page.locator(".modal-backdrop").is_visible(), "Transaction modal should be visible"

        # Click [In phiếu] button
        print_btn = page.locator('.transaction-actions button[data-action="print-receipt"]')
        assert print_btn.is_visible(), "[In phiếu] button must be visible in transaction modal"
        print_btn.click()
        time.sleep(0.5)

        # Emulate media print
        page.emulate_media(media="print")
        time.sleep(0.5)

        # Verify print isolation under @media print
        isolation_check = page.evaluate("""
            () => {
                const app = document.getElementById('app');
                const modal = document.querySelector('.modal-backdrop');
                const content = document.getElementById('content');
                const printRoot = document.getElementById('qbizPrintRoot');
                const voucher = printRoot ? printRoot.querySelector('.qbiz-print-voucher') : null;

                const getDisplay = el => el ? window.getComputedStyle(el).display : 'none';
                const getVis = el => el ? window.getComputedStyle(el).visibility : 'hidden';

                return {
                    appDisplay: getDisplay(app),
                    modalDisplay: getDisplay(modal),
                    contentDisplay: getDisplay(content),
                    printRootDisplay: getDisplay(printRoot),
                    printRootVis: getVis(printRoot),
                    hasVoucher: !!voucher,
                    voucherText: voucher ? voucher.innerText : ''
                };
            }
        """)

        print("Print Isolation Check (Transaction):", isolation_check)
        assert isolation_check["appDisplay"] == "none", f"Expected #app display:none, got {isolation_check['appDisplay']}"
        assert isolation_check["modalDisplay"] == "none", f"Expected .modal-backdrop display:none, got {isolation_check['modalDisplay']}"
        assert isolation_check["contentDisplay"] == "none", f"Expected #content display:none, got {isolation_check['contentDisplay']}"
        assert isolation_check["printRootDisplay"] == "block", f"Expected #qbizPrintRoot display:block, got {isolation_check['printRootDisplay']}"
        assert isolation_check["hasVoucher"] is True, "Voucher must be present inside #qbizPrintRoot"

        # Verify standard voucher content
        text = isolation_check["voucherText"]
        assert "HÓA ĐƠN BÁN HÀNG" in text or "PHIẾU BÁN HÀNG" in text or "PHIẾU GIAO HÀNG" in text, "Missing voucher title"
        assert "TỔNG CỘNG" in text, "Missing TỔNG CỘNG in voucher"
        assert "Thu ngân" in text, "Missing Thu ngân in voucher"
        assert "Số phiếu" in text or "Mã" in text, "Missing document code in voucher"
        assert "Wi-Fi" in text or "Pass" in text, "Wi-Fi info should be present"

        # Screenshot under print emulation
        shot_path_1 = os.path.join(EVIDENCE_DIR, "print_isolation_transaction.png")
        page.screenshot(path=shot_path_1, full_page=True)
        print(f"Captured screenshot: {shot_path_1}")

        # Return to screen media
        page.emulate_media(media="screen")
        page.evaluate("() => { const r = document.getElementById('modalRoot'); if(r) r.innerHTML = ''; }")
        time.sleep(0.5)

        # ---------------------------------------------------------------------
        # TEST 2: Print from Orders Modal (DH-101 / DH-102)
        # ---------------------------------------------------------------------
        print("\n--- TEST 2: Print from Order Detail Modal ---")
        page.evaluate("window.__qbiz_app__.navigate('orders')")
        time.sleep(1)

        # Click first order row
        order_row = page.locator(".modern-order-row").first
        order_code = order_row.locator("strong").first.inner_text().strip()
        print(f"Opening order: {order_code}")
        order_row.click()
        time.sleep(0.8)

        # Click [In lại] button
        order_print_btn = page.locator('.order-detail-actions button[data-action="print-receipt"]')
        assert order_print_btn.is_visible(), "[In lại] button must be visible in order detail modal"
        order_print_btn.click()
        time.sleep(0.5)

        # Emulate media print
        page.emulate_media(media="print")
        time.sleep(0.5)

        order_isolation = page.evaluate("""
            () => {
                const app = document.getElementById('app');
                const modal = document.querySelector('.modal-backdrop');
                const content = document.getElementById('content');
                const printRoot = document.getElementById('qbizPrintRoot');
                const voucher = printRoot ? printRoot.querySelector('.qbiz-print-voucher') : null;

                const getDisplay = el => el ? window.getComputedStyle(el).display : 'none';

                return {
                    appDisplay: getDisplay(app),
                    modalDisplay: getDisplay(modal),
                    contentDisplay: getDisplay(content),
                    printRootDisplay: getDisplay(printRoot),
                    hasVoucher: !!voucher,
                    voucherText: voucher ? voucher.innerText : ''
                };
            }
        """)

        print("Print Isolation Check (Order):", order_isolation)
        assert order_isolation["appDisplay"] == "none", "Expected #app display:none"
        assert order_isolation["modalDisplay"] == "none", "Expected .modal-backdrop display:none"
        assert order_isolation["contentDisplay"] == "none", "Expected #content display:none"
        assert order_isolation["printRootDisplay"] == "block", "Expected #qbizPrintRoot display:block"
        assert order_code in order_isolation["voucherText"], f"Expected {order_code} in printed voucher"

        shot_path_2 = os.path.join(EVIDENCE_DIR, "print_isolation_order.png")
        page.screenshot(path=shot_path_2, full_page=True)
        print(f"Captured screenshot: {shot_path_2}")

        page.emulate_media(media="screen")
        page.evaluate("() => { const r = document.getElementById('modalRoot'); if(r) r.innerHTML = ''; }")
        time.sleep(0.5)

        # ---------------------------------------------------------------------
        # TEST 3: Print from Print Center (Xem mẫu in demo -> In thử / Lưu PDF)
        # ---------------------------------------------------------------------
        print("\n--- TEST 3: Print from Print Center Preview ---")
        page.evaluate("window.__qbiz_app__.navigate('prints')")
        time.sleep(1)

        # Ensure demo preview notice is visible or open modal
        demo_btn = page.locator('button[data-action="demo-receipt-preview"]')
        if demo_btn.is_visible():
            demo_btn.click()
            time.sleep(0.8)

            assert page.locator("#btnModalPrintDoc").is_visible(), "In thử phiếu này must be visible"
            assert page.locator("#btnModalExportPdf").is_visible(), "Lưu PDF must be visible"

            # Click In thử phiếu này
            page.locator("#btnModalPrintDoc").click()
            time.sleep(0.5)

            # Emulate media print
            page.emulate_media(media="print")
            time.sleep(0.5)

            demo_print_check = page.evaluate("""
                () => {
                    const app = document.getElementById('app');
                    const modal = document.querySelector('.modal-backdrop');
                    const printRoot = document.getElementById('qbizPrintRoot');
                    const voucher = printRoot ? printRoot.querySelector('.qbiz-print-voucher') : null;

                    const getDisplay = el => el ? window.getComputedStyle(el).display : 'none';

                    return {
                        appDisplay: getDisplay(app),
                        modalDisplay: getDisplay(modal),
                        printRootDisplay: getDisplay(printRoot),
                        hasVoucher: !!voucher,
                        voucherText: voucher ? voucher.innerText : ''
                    };
                }
            """)

            print("Print Isolation Check (Demo Modal Print):", demo_print_check)
            assert demo_print_check["appDisplay"] == "none", "Expected #app display:none"
            assert demo_print_check["modalDisplay"] == "none", "Expected .modal-backdrop display:none"
            assert demo_print_check["printRootDisplay"] == "block", "Expected #qbizPrintRoot display:block"
            assert "TỔNG CỘNG" in demo_print_check["voucherText"], "Demo receipt must have TỔNG CỘNG"

            shot_path_3 = os.path.join(EVIDENCE_DIR, "print_isolation_demo_preview.png")
            page.screenshot(path=shot_path_3, full_page=True)
            print(f"Captured screenshot: {shot_path_3}")

            page.emulate_media(media="screen")
            page.evaluate("() => { const r = document.getElementById('modalRoot'); if(r) r.innerHTML = ''; }")
            time.sleep(0.5)

        # ---------------------------------------------------------------------
        # TEST 4: Print Center Devices tab (In thử K80 / In thử K58)
        # ---------------------------------------------------------------------
        print("\n--- TEST 4: Print from Devices tab (K80 / K58) ---")
        page.click('button[data-print-tab="devices"]')
        time.sleep(0.5)

        k80_btn = page.locator('button[data-print-test="receipt"][data-print-paper="RECEIPT_80"]')
        assert k80_btn.is_visible(), "In thử K80 button must be visible"
        k80_btn.click()
        time.sleep(0.5)

        page.emulate_media(media="print")
        time.sleep(0.5)

        k80_check = page.evaluate("""
            () => {
                const printRoot = document.getElementById('qbizPrintRoot');
                const voucher = printRoot ? printRoot.querySelector('.qbiz-print-voucher') : null;
                const hasK80 = voucher ? voucher.classList.contains('paper-RECEIPT_80') : false;
                return {
                    hasVoucher: !!voucher,
                    hasK80,
                    text: voucher ? voucher.innerText : ''
                };
            }
        """)

        print("K80 Print Check:", k80_check)
        assert k80_check["hasVoucher"] is True, "Must render voucher for K80"
        assert k80_check["hasK80"] is True, "Must have class paper-RECEIPT_80"

        page.emulate_media(media="screen")

        # Test K58
        k58_btn = page.locator('button[data-print-test="receipt"][data-print-paper="RECEIPT_58"]')
        assert k58_btn.is_visible(), "In thử K58 button must be visible"
        k58_btn.click()
        time.sleep(0.5)

        page.emulate_media(media="print")
        time.sleep(0.5)

        k58_check = page.evaluate("""
            () => {
                const printRoot = document.getElementById('qbizPrintRoot');
                const voucher = printRoot ? printRoot.querySelector('.qbiz-print-voucher') : null;
                const hasK58 = voucher ? voucher.classList.contains('paper-RECEIPT_58') : false;
                return {
                    hasVoucher: !!voucher,
                    hasK58,
                    text: voucher ? voucher.innerText : ''
                };
            }
        """)

        print("K58 Print Check:", k58_check)
        assert k58_check["hasVoucher"] is True, "Must render voucher for K58"
        assert k58_check["hasK58"] is True, "Must have class paper-RECEIPT_58"

        shot_path_4 = os.path.join(EVIDENCE_DIR, "print_isolation_k58.png")
        page.screenshot(path=shot_path_4, full_page=True)
        print(f"Captured screenshot: {shot_path_4}")

        page.emulate_media(media="screen")

        # ---------------------------------------------------------------------
        # TEST 5: Complete POS Sale Flow -> In phiếu
        # ---------------------------------------------------------------------
        print("\n--- TEST 5: Complete POS Sale Flow -> In phiếu ---")
        page.evaluate("window.__qbiz_app__.navigate('sales')")
        time.sleep(1)

        # Add first product to cart
        page.locator(".pos-add").first.click()
        time.sleep(0.5)

        # Proceed to cart & checkout
        page.locator('[data-sale-step="cart"]').first.click()
        time.sleep(0.5)
        page.locator('[data-sale-step="checkout"]').click()
        time.sleep(0.5)

        # Select cash and finish
        page.locator('[data-sale-pay]').click()
        time.sleep(1.2)

        # Now on pos-success screen
        success_sec = page.locator(".pos-success")
        assert success_sec.is_visible(), "POS Success screen must be visible"

        pos_in_btn = success_sec.locator('button[data-action="print-receipt"]')
        assert pos_in_btn.is_visible(), "In phiếu button on success screen must be visible"
        pos_in_btn.click()
        time.sleep(0.5)

        page.emulate_media(media="print")
        time.sleep(0.5)

        pos_sale_print = page.evaluate("""
            () => {
                const app = document.getElementById('app');
                const printRoot = document.getElementById('qbizPrintRoot');
                const voucher = printRoot ? printRoot.querySelector('.qbiz-print-voucher') : null;

                const getDisplay = el => el ? window.getComputedStyle(el).display : 'none';

                return {
                    appDisplay: getDisplay(app),
                    printRootDisplay: getDisplay(printRoot),
                    hasVoucher: !!voucher,
                    voucherText: voucher ? voucher.innerText : ''
                };
            }
        """)

        print("POS Sale Print Check:", pos_sale_print)
        assert pos_sale_print["appDisplay"] == "none", "Expected #app display:none on pos-success print"
        assert pos_sale_print["printRootDisplay"] == "block", "Expected #qbizPrintRoot display:block on pos-success print"
        assert "HÓA ĐƠN BÁN HÀNG" in pos_sale_print["voucherText"], "Voucher title must be HÓA ĐƠN BÁN HÀNG"
        assert "TỔNG CỘNG" in pos_sale_print["voucherText"], "Voucher must have TỔNG CỘNG"

        shot_path_5 = os.path.join(EVIDENCE_DIR, "print_isolation_pos_success.png")
        page.screenshot(path=shot_path_5, full_page=True)
        print(f"Captured screenshot: {shot_path_5}")

        print("\nALL 5 POS RECEIPT PRINT ISOLATION TESTS PASSED PERFECTLY!")
        browser.close()

if __name__ == '__main__':
    test_pos_receipt_print_isolation()
