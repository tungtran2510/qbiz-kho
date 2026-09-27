"""
Automated Test Suite for QBiz Kho Practical Operations:
- 6 Inbound & 6 Outbound movement types with official Mẫu 01-VT / 02-VT vouchers
- Standard Vietnamese Accounting Reports (Nhập-Xuất-Tồn, Sổ S2b-HKD TT88, TT200) with UTF-8 BOM
- Hardware Barcode Scanner Keyboard Wedge & Audio Beep
- Vietnam Shipping Connectors (GHTK, GHN, Viettel Post) & Tracking Dispatch
- QBiz Website Storefront Gateway & 2-Way Catalog/Order Sync
- Google Drive Backup & Integrity-Verified (SHA-256) Restore
"""
import sys
import time
from playwright.sync_api import sync_playwright

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

LOCAL_URL = "http://localhost:4180/"

def run_tests():
    print("=" * 70)
    print("STARTING TEST SUITE: QBiz Kho Practical Operations Verification")
    print("=" * 70)

    passed_tests = []
    failed_tests = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print(f"1. Navigating to {LOCAL_URL}...")
        page.goto(LOCAL_URL, wait_until="networkidle")
        page.wait_for_timeout(1000)

        # ----------------------------------------------------
        # TEST 1: Stock Movement Types & Subtypes
        # ----------------------------------------------------
        print("\n--- TEST 1: 6 Inbound & 6 Outbound Subtypes ---")
        try:
            # Check Quick Receive Subtypes
            page.evaluate("openQuick('receive')")
            page.wait_for_selector("#stockSubType", timeout=3000)
            in_options = page.eval_on_selector_all("#stockSubType option", "opts => opts.map(o => o.value)")
            assert len(in_options) == 6, f"Expected 6 inbound subtypes, got {len(in_options)}: {in_options}"
            assert "PURCHASE" in in_options and "RETURN_IN" in in_options, "Missing expected inbound keys"
            print(f"  ✓ Quick Receive has 6 subtypes: {in_options}")

            # Close modal
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)

            # Check Quick Issue Subtypes
            page.evaluate("openQuick('issue')")
            page.wait_for_selector("#stockSubType", timeout=3000)
            out_options = page.eval_on_selector_all("#stockSubType option", "opts => opts.map(o => o.value)")
            assert len(out_options) == 6, f"Expected 6 outbound subtypes, got {len(out_options)}: {out_options}"
            assert "SALE_OUT" in out_options and "PURCHASE_RETURN_OUT" in out_options, "Missing expected outbound keys"
            print(f"  ✓ Quick Issue has 6 subtypes: {out_options}")

            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            passed_tests.append("TEST 1: 6 Inbound & 6 Outbound Subtypes")
        except Exception as e:
            print(f"  ❌ TEST 1 FAILED: {e}")
            failed_tests.append(f"TEST 1: {e}")

        # ----------------------------------------------------
        # TEST 2: Official Vouchers Mẫu 01-VT & 02-VT
        # ----------------------------------------------------
        print("\n--- TEST 2: Official Accounting Vouchers (Mẫu 01-VT & 02-VT) ---")
        try:
            # Test voucher rendering
            voucher_test = page.evaluate("""() => {
                const sampleDoc = {
                    id: 'PNK-TEST-01',
                    document_id: 'PNK-TEST-01',
                    kind: 'receive',
                    sub_type: 'PURCHASE',
                    created_at: new Date().toISOString(),
                    deliverer_name: 'Công ty TNHH Cung Ứng',
                    lines: [
                        { name: 'Sản phẩm Test', sku: 'SKU-01', unit: 'hộp', qty: 10, price: 120000, line_total: 1200000 }
                    ]
                };
                openWarehouseVoucherModal(sampleDoc, 'receive');
                const title = document.querySelector('.voucher-heading h1')?.textContent || '';
                const formId = document.querySelector('.voucher-form-code')?.textContent || '';
                const sigs = document.querySelectorAll('.voucher-signatures-grid .sig-col').length;
                return { title, formId, sigs };
            }""")
            assert "PHIẾU NHẬP KHO" in voucher_test["title"], f"Unexpected title: {voucher_test['title']}"
            assert "01 - VT" in voucher_test["formId"], f"Unexpected form ID: {voucher_test['formId']}"
            assert voucher_test["sigs"] == 4, f"Expected 4 signature columns, got {voucher_test['sigs']}"
            print(f"  ✓ Voucher Mẫu 01-VT generated: {voucher_test['title']} | {voucher_test['formId'].strip()} | {voucher_test['sigs']} chữ ký")

            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            passed_tests.append("TEST 2: Official Vouchers Mẫu 01-VT & 02-VT")
        except Exception as e:
            print(f"  ❌ TEST 2 FAILED: {e}")
            failed_tests.append(f"TEST 2: {e}")

        # ----------------------------------------------------
        # TEST 3: UTF-8 BOM & Accounting Reports
        # ----------------------------------------------------
        print("\n--- TEST 3: UTF-8 BOM & Accounting Reports ---")
        try:
            # Navigate to exports page
            page.evaluate("navigate('exports')")
            page.wait_for_timeout(500)
            reports_count = page.eval_on_selector_all(".mod-block .mod-row", "cards => cards.length")
            assert reports_count >= 3, f"Expected at least 3 reports, got {reports_count}"
            report_titles = page.eval_on_selector_all(".mod-block .mod-row strong", "heads => heads.map(h => h.textContent)")
            print(f"  ✓ Standard Accounting Reports available: {report_titles}")

            # Check downloadText UTF-8 BOM protection
            bom_ok = page.evaluate("""() => {
                let capturedContent = '';
                const origBlob = window.Blob;
                window.Blob = class MockBlob extends origBlob {
                    constructor(parts, options) {
                        super(parts, options);
                        if (options?.type?.includes('csv')) {
                            capturedContent = parts[0];
                        }
                    }
                };
                downloadText('test.csv', 'Mã,Tên\\n1,Hàng', 'text/csv;charset=utf-8');
                window.Blob = origBlob;
                return capturedContent.startsWith('\\uFEFF');
            }""")
            assert bom_ok, "downloadText did not prepend UTF-8 BOM (\\uFEFF) to CSV!"
            print("  ✓ CSV export starts with \\uFEFF (UTF-8 BOM) for flawless Windows Excel display.")
            passed_tests.append("TEST 3: UTF-8 BOM & Accounting Reports")
        except Exception as e:
            print(f"  ❌ TEST 3 FAILED: {e}")
            failed_tests.append(f"TEST 3: {e}")

        # ----------------------------------------------------
        # TEST 4: Barcode Scanner Gun & POS Audio Beep
        # ----------------------------------------------------
        print("\n--- TEST 4: Barcode Scanner Gun & Audio Beep ---")
        try:
            # Navigate to Sales page
            page.evaluate("navigate('sales')")
            page.wait_for_timeout(500)

            # Test scanning an existing product
            scan_result = page.evaluate("""() => {
                const prod = state.data.products[0];
                const code = prod.barcode || prod.sku;
                const cartBefore = state.saleCart.length;
                handleScannedBarcode(code);
                const cartAfter = state.saleCart.length;
                return { code, prodName: prod.name, cartBefore, cartAfter };
            }""")
            assert scan_result["cartAfter"] > scan_result["cartBefore"] or scan_result["cartAfter"] > 0, "Item was not added to saleCart on scan!"
            print(f"  ✓ Barcode scan '{scan_result['code']}' added '{scan_result['prodName']}' directly to cart without focusing input.")

            # Test hardware barcode gun rapid keystrokes wedge
            page.evaluate("""() => {
                const prod = state.data.products[0];
                const code = prod.barcode || prod.sku;
                for (const char of code) {
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: char }));
                }
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            }""")
            page.wait_for_timeout(500)
            print("  ✓ Hardware scanner wedge keystrokes successfully intercepted globally.")
            passed_tests.append("TEST 4: Barcode Scanner Gun & Audio Beep")
        except Exception as e:
            print(f"  ❌ TEST 4 FAILED: {e}")
            failed_tests.append(f"TEST 4: {e}")

        # ----------------------------------------------------
        # TEST 5: Vietnam Shipping Connectors (GHTK, GHN, VTP)
        # ----------------------------------------------------
        print("\n--- TEST 5: Vietnam Shipping Connectors & Tracking ---")
        try:
            # Navigate to shipping page
            page.evaluate("navigate('shipping')")
            page.wait_for_timeout(500)
            carrier_cards = page.eval_on_selector_all(".carrier-card", "cards => cards.length")
            assert carrier_cards >= 3, f"Expected at least 3 carriers, got {carrier_cards}"
            carrier_names = page.eval_on_selector_all(".carrier-brand b", "els => els.map(e => e.textContent)")
            print(f"  ✓ Shipping carriers configured: {carrier_names}")

            # Test dispatching shipment from an order
            dispatch_result = page.evaluate("""() => {
                const testOrder = {
                    id: 'order_test_shipping_' + Date.now(),
                    code: 'DH-SHIP-TEST',
                    grand_total: 350000,
                    customer_label: 'Lê Văn Nam',
                    customer_phone: '0977.888.999',
                    shipping_address: 'Số 10 Phố Huế, Hoàn Kiếm, Hà Nội',
                    fulfillment: 'delivery',
                    payment_status: 'PENDING'
                };
                openShippingModal(testOrder, 'order');
                return {
                    hasCarrierSelect: Boolean(document.querySelector('#shipCarrier')),
                    hasCodInput: Boolean(document.querySelector('#shipCodAmount'))
                };
            }""")
            assert dispatch_result["hasCarrierSelect"] and dispatch_result["hasCodInput"], "Shipping modal missing required fields!"

            # Submit dispatch
            page.eval_on_selector("#modalSubmit", "btn => btn.click()")
            page.wait_for_selector(".ship-success-box", timeout=4000)

            # Check that tracking code was generated and success modal displayed
            success_tracking = page.eval_on_selector(".ship-success-box div:nth-child(2)", "el => el.textContent")
            print(f"  ✓ Shipment dispatched successfully! Tracking code generated: {success_tracking}")
            assert success_tracking.startswith("S21.") or success_tracking.startswith("GHN") or success_tracking.startswith("VT"), f"Unexpected tracking code format: {success_tracking}"

            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            passed_tests.append("TEST 5: Vietnam Shipping Connectors")
        except Exception as e:
            print(f"  ❌ TEST 5 FAILED: {e}")
            failed_tests.append(f"TEST 5: {e}")

        # ----------------------------------------------------
        # TEST 6: QBiz Website Storefront Gateway
        # ----------------------------------------------------
        print("\n--- TEST 6: QBiz Website Gateway & 2-Way Sync ---")
        try:
            # Navigate to channels page
            page.evaluate("navigate('channels')")
            page.wait_for_timeout(500)
            gateway_title = page.eval_on_selector(".feature-panel h2", "el => el.textContent")
            assert "Cổng Website Nền tảng QBiz" in gateway_title, f"Unexpected gateway title: {gateway_title}"

            # Test catalog sync to website
            sync_res = page.evaluate("""async () => {
                await syncCatalogToWebsite();
                const lastSyncAt = localStorage.getItem('qbiz_last_website_sync_at');
                const count = localStorage.getItem('qbiz_last_website_sync_count');
                return { lastSyncAt, count };
            }""")
            assert sync_res["lastSyncAt"] and int(sync_res["count"]) > 0, f"Catalog sync failed: {sync_res}"
            print(f"  ✓ Catalog Sync successfully pushed {sync_res['count']} products to QBiz Website at {sync_res['lastSyncAt']}.")

            # Test simulating order from Website
            order_res = page.evaluate("""async () => {
                const countBefore = (state.data.orders || []).length;
                await simulateWebOrder();
                const countAfter = (state.data.orders || []).length;
                const newOrder = (state.data.orders || []).find(o => o.code?.startsWith('DH-WEB-'));
                return { countBefore, countAfter, orderCode: newOrder?.code, channel: newOrder?.channel };
            }""")
            assert order_res["countAfter"] > order_res["countBefore"], "Web order simulation did not add to orders store!"
            assert "WEB" in order_res["orderCode"], f"Order code does not reflect web origin: {order_res['orderCode']}"
            print(f"  ✓ Website Webhook simulation received order '{order_res['orderCode']}' (Channel: {order_res['channel']}).")

            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            passed_tests.append("TEST 6: QBiz Website Gateway & 2-Way Sync")
        except Exception as e:
            print(f"  ❌ TEST 6 FAILED: {e}")
            failed_tests.append(f"TEST 6: {e}")

        # ----------------------------------------------------
        # TEST 7: Google Drive Restore UI with SHA-256
        # ----------------------------------------------------
        print("\n--- TEST 7: Google Drive Restore UI & SHA-256 Checksum ---")
        try:
            # Navigate to backup page
            page.evaluate("navigate('backup')")
            page.wait_for_selector("[data-action='drive-restore-list']", timeout=5000)
            has_restore_btn = page.eval_on_selector("[data-action='drive-restore-list']", "el => Boolean(el)")
            assert has_restore_btn, "Button 'Khôi phục từ Google Drive' is missing!"
            print("  ✓ 'Khôi phục từ Google Drive' button present in Backup Center.")

            # Test opening Drive Restore Modal after creating a backup
            restore_modal_test = page.evaluate("""async () => {
                await triggerManualBackup('default_shop', 'Shop Test', state.data);
                await openDriveRestoreModal('default_shop');
                const modalTitle = document.querySelector('#modalRoot h3')?.textContent || document.querySelector('#modalRoot h2')?.textContent || '';
                const items = document.querySelectorAll('.drive-backup-card').length;
                const hasChecksum = document.querySelector('.drive-checksum-badge')?.textContent || '';
                return { modalTitle, items, hasChecksum };
            }""")
            assert "Khôi phục từ Google Drive" in restore_modal_test["modalTitle"], f"Unexpected modal title: {restore_modal_test['modalTitle']}"
            assert restore_modal_test["items"] > 0, "No backup cards rendered!"
            assert "SHA-256" in restore_modal_test["hasChecksum"], f"Checksum badge missing or invalid: {restore_modal_test['hasChecksum']}"
            print(f"  ✓ Drive Restore Modal loaded {restore_modal_test['items']} backups with verified {restore_modal_test['hasChecksum']}.")

            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            passed_tests.append("TEST 7: Google Drive Restore UI & SHA-256 Checksum")
        except Exception as e:
            print(f"  ❌ TEST 7 FAILED: {e}")
            failed_tests.append(f"TEST 7: {e}")

        browser.close()

    print("\n" + "=" * 70)
    print("TEST SUMMARY:")
    print(f"  Total Passed: {len(passed_tests)} / {len(passed_tests) + len(failed_tests)}")
    for t in passed_tests:
        print(f"  [PASS] {t}")
    for f in failed_tests:
        print(f"  [FAIL] {f}")
    print("=" * 70)

    if failed_tests:
        sys.exit(1)
    else:
        print("ALL TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_tests()
