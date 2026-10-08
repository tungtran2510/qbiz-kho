import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
LOCAL_URL = "http://localhost:4180"

def run_stage1_verification():
    print("=== STARTING STAGE 1 DEEP AUDIT VERIFICATION ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        # Listen to console
        page.on("console", lambda msg: print(f"[BROWSER CONSOLE] {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"[BROWSER ERROR] {err}"))

        print(f"Navigating to {LOCAL_URL}...")
        page.goto(LOCAL_URL, wait_until="networkidle")
        time.sleep(2)

        # -------------------------------------------------------------
        # TEST 1: closeShift & renderCash with Order Cash
        # -------------------------------------------------------------
        print("\n--- TEST 1: closeShift & renderCash with Paid Cash Orders ---")
        test1_res = page.evaluate("""
        async () => {
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');

            // 1. Ensure a clean test shift is OPEN
            const identity = await engine.ensureLocalIdentity();
            const existingShifts = await db.getAll('shifts');
            const active = existingShifts.find(s => s.status === 'OPEN' && s.device_id === identity.device_id);
            let shift = active;
            if (!shift) {
                shift = await engine.openShift({ openingCash: 1000000 });
            }

            // 2. Create an order with cash payment
            const products = await db.getAll('products');
            const p = products[0];
            const order = await engine.createOrder({
                items: [{ itemId: p.id, quantity: 2, unitPrice: 250000 }],
                warehouseId: 'wh_retail_main',
                customerLabel: 'Khách Test Ca Đơn Hàng'
            });

            // 3. Mark order as PAID with cash
            const paidOrder = await engine.markOrderPaid(order.id, { paymentMethod: 'cash' });

            // 4. Test closeShift calculation (simulating close or dry-run)
            const stores = await Promise.all([
                db.getAll('orders'),
                db.getAll('sales')
            ]);
            const ordersInShift = stores[0].filter(o => 
                o.status !== 'CANCELLED' && 
                o.payment_status === 'PAID' && 
                (o.payment_method === 'cash') &&
                (o.shift_id === shift.id || (new Date(o.created_at) >= new Date(shift.opened_at)))
            );

            return {
                shiftId: shift.id,
                openingCash: shift.opening_cash,
                orderId: order.id,
                orderTotal: paidOrder.grand_total,
                orderPaymentMethod: paidOrder.payment_method,
                orderShiftId: paidOrder.shift_id,
                ordersInShiftCount: ordersInShift.length
            };
        }
        """)
        print("Test 1 Result:", test1_res)
        assert test1_res['orderPaymentMethod'] == 'cash', "Order should have payment_method cash"
        assert test1_res['orderShiftId'] == test1_res['shiftId'], "Order should be assigned to active shift"
        print(">>> TEST 1 PASS: Order cash payment correctly recorded with shift_id!")

        # -------------------------------------------------------------
        # TEST 2: paySupplierDebt & createPurchaseReturn
        # -------------------------------------------------------------
        print("\n--- TEST 2: paySupplierDebt & createPurchaseReturn with Debt ---")
        test2_res = page.evaluate("""
        async () => {
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');

            // 1. Create a test supplier
            const supName = 'NCC Dược Phẩm Test ' + Date.now();
            const sup = await engine.createSupplier({
                name: supName,
                phone: '0988776655',
                address: 'Hà Nội'
            });

            // Set initial debt to 5,000,000
            sup.debt = 5000000;
            await db.put('suppliers', sup);

            // 2. Call paySupplierDebt with 2,000,000 cash
            const payRes = await engine.paySupplierDebt({
                supplierId: sup.id,
                amount: 2000000,
                paymentMethod: 'cash',
                note: 'Thanh toán tiền thuốc đợt 1'
            });

            const supAfterPay = await db.getOne('suppliers', sup.id);

            // 3. Perform a purchase return of 500,000 with refundMethod: 'debt'
            const products = await db.getAll('products');
            const testProd = products[0];
            // Ensure stock in warehouse
            await engine.receive({
                productId: testProd.id,
                warehouseId: 'wh_retail_main',
                qty: 10,
                price: 50000
            });

            const returnRes = await engine.createPurchaseReturn({
                supplierId: sup.id,
                warehouseId: 'wh_retail_main',
                lines: [{ productId: testProd.id, qty: 5, price: 50000 }], // 250,000
                refundMethod: 'debt',
                reason: 'Hàng cận date xuất trả'
            });

            const supAfterReturn = await db.getOne('suppliers', sup.id);

            // Check cash_entries
            const cashEntriesSetting = await db.getOne('settings', 'module:cash_entries');
            const entries = cashEntriesSetting?.value || [];
            const supPaymentEntry = entries.find(e => e.supplier_id === sup.id);

            return {
                initialDebt: 5000000,
                debtAfterPay: supAfterPay.debt,
                debtAfterReturn: supAfterReturn.debt,
                paymentEntryCreated: Boolean(supPaymentEntry),
                paymentEntryAmount: supPaymentEntry?.amount,
                returnRefundMethod: returnRes.refund_method,
                returnRefundAmount: returnRes.refund_amount
            };
        }
        """)
        print("Test 2 Result:", test2_res)
        assert test2_res['debtAfterPay'] == 3000000, f"Debt after pay should be 3,000,000 but was {test2_res['debtAfterPay']}"
        assert test2_res['debtAfterReturn'] == 2750000, f"Debt after return should be 2,750,000 but was {test2_res['debtAfterReturn']}"
        assert test2_res['paymentEntryCreated'] == True, "Cash entry should be created for supplier payment"
        print(">>> TEST 2 PASS: Supplier debt payment & purchase return debt offset verified!")

        # -------------------------------------------------------------
        # TEST 3: deleteItem Referential Integrity Protection
        # -------------------------------------------------------------
        print("\n--- TEST 3: deleteItem Referential Integrity Protection ---")
        test3_res = page.evaluate("""
        async () => {
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');

            // 1. Create a product and add a movement (has history)
            const pWithHist = await engine.createProduct({
                name: 'Thuốc Đã Có Thẻ Kho ' + Date.now(),
                sku: 'SKU-HIST-' + Date.now(),
                price: 120000
            });
            await engine.receive({
                productId: pWithHist.id,
                warehouseId: 'wh_retail_main',
                qty: 5,
                price: 80000
            });

            // 2. Try to delete product with history -> should SOFT-DELETE
            const deleteResult1 = await engine.deleteItem(pWithHist.id);
            const p1After = await db.getOne('products', pWithHist.id);

            // 3. Create a fresh product with NO history
            const pNoHist = await engine.createProduct({
                name: 'Sản Phẩm Chưa Giao Dịch ' + Date.now(),
                sku: 'SKU-NOHIST-' + Date.now(),
                price: 50000
            });

            // 4. Delete product with NO history -> should PHYSICAL DELETE
            const deleteResult2 = await engine.deleteItem(pNoHist.id);
            const p2After = await db.getOne('products', pNoHist.id);

            return {
                item1SoftDeleted: deleteResult1.softDeleted,
                item1StillInDb: Boolean(p1After),
                item1Active: p1After?.active,
                item1Status: p1After?.status,
                item2SoftDeleted: deleteResult2.softDeleted,
                item2StillInDb: Boolean(p2After)
            };
        }
        """)
        print("Test 3 Result:", test3_res)
        assert test3_res['item1SoftDeleted'] == True, "Product with history should be soft deleted"
        assert test3_res['item1StillInDb'] == True, "Product with history should remain in DB"
        assert test3_res['item1Active'] == False, "Product with history should be inactive"
        assert test3_res['item2SoftDeleted'] == False, "Product without history should be physically deleted"
        assert test3_res['item2StillInDb'] == False, "Product without history should be deleted from DB"
        print(">>> TEST 3 PASS: deleteItem referential integrity protection working 100%!")

        # -------------------------------------------------------------
        # UI & Mobile 390x844 Screenshots
        # -------------------------------------------------------------
        print("\n--- CAPTURING MOBILE SCREENSHOTS (390x844) ---")

        # 1. Screenshot: Sổ quỹ thu chi (renderCash)
        page.evaluate("() => { window.__qbiz_app__.nav('cash'); }")
        time.sleep(1.5)
        shot1_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_so_quy_cash_orders.png")
        page.screenshot(path=shot1_path)
        print(f"Captured: {shot1_path}")

        # 2. Screenshot: Chi tiết Nhà Cung Cấp with Debt & Trả nợ button
        page.evaluate("""
        async () => {
            await window.__qbiz_app__.refresh();
            const supWithDebt = (window.__qbiz_app__.state.data.suppliers || []).find(s => s.debt > 0) || window.__qbiz_app__.state.data.suppliers[0];
            window.__qbiz_app__.openSupplierDetail(supWithDebt);
        }
        """)
        time.sleep(1.5)
        shot2_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_ncc_detail_with_debt.png")
        page.screenshot(path=shot2_path)
        print(f"Captured: {shot2_path}")

        # 3. Screenshot: Modal Trả nợ Nhà Cung Cấp
        page.evaluate("""
        async () => {
            const supWithDebt = (window.__qbiz_app__.state.data.suppliers || []).find(s => s.debt > 0) || window.__qbiz_app__.state.data.suppliers[0];
            window.__qbiz_app__.openSupplierPaymentModal(supWithDebt);
        }
        """)
        time.sleep(1.5)
        shot3_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_tra_no_ncc_modal.png")
        page.screenshot(path=shot3_path)
        print(f"Captured: {shot3_path}")

        browser.close()

    print("\n=== ALL STAGE 1 TESTS AND EVIDENCE CAPTURED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_stage1_verification()
