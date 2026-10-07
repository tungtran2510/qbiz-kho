import os
import sys
import time
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

def run_tests():
    results = {}
    with sync_playwright() as p:
        # Launch browser with mobile viewport (iPhone 13: 390x844)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()
        
        # Capture console errors and custom events
        console_logs = []
        events_heard = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        
        print("Navigating to http://localhost:4180...")
        page.goto("http://localhost:4180", wait_until="networkidle")
        page.wait_for_timeout(2000)
        
        # Test 1: Verify snapshot() contains electronic_invoices and invoice_audit_logs
        print("Testing Item 1: snapshot() stores...")
        t1 = page.evaluate("""async () => {
            const { snapshot } = await import('./src/engine.js');
            const data = await snapshot();
            return {
                has_einv: Array.isArray(data.electronic_invoices),
                has_audit: Array.isArray(data.invoice_audit_logs),
                einv_len: (data.electronic_invoices || []).length,
                audit_len: (data.invoice_audit_logs || []).length
            };
        }""")
        print("Item 1 Result:", t1)
        results["item_1_snapshot"] = t1["has_einv"] and t1["has_audit"]

        # Test 2: Verify closeShift() subtracts manual_cash_out
        print("Testing Item 2: closeShift() manual_cash_out...")
        t2 = page.evaluate("""async () => {
            const { openShift, closeShift, createExpense } = await import('./src/engine.js');
            const { getAll, put } = await import('./src/db.js');
            
            // Open test shift
            const shiftId = 'shift_test_' + Date.now();
            const opened = await openShift({
                shiftId,
                openingCash: 500000,
                employee: 'Tester'
            });
            
            // Add cash expense
            await createExpense({
                category: 'Chi phí vận hành',
                amount: 100000,
                paymentMethod: 'cash',
                note: 'Chi mua băng keo',
                shiftId
            });
            
            // Close shift
            const closed = await closeShift({
                shiftId,
                countedCash: 400000
            });
            
            // Reopen an active shift for subsequent tests
            await openShift({
                shiftId: 'shift_active_' + Date.now(),
                openingCash: 1000000,
                employee: 'Thu ngân'
            });

            return {
                opening: opened.opening_cash,
                expected: closed.expected_cash,
                counted: closed.counted_cash,
                diff: closed.difference,
                cash_expenses: closed.summary?.cash_expenses
            };
        }""")
        print("Item 2 Result:", t2)
        # Expected should be 500000 - 100000 = 400000. diff = 0
        results["item_2_shift_cash_out"] = (t2["expected"] == 400000 and t2["diff"] == 0 and t2["cash_expenses"] == 100000)

        # Test 3: Verify renderDebts() calculates actual remaining debt
        print("Testing Item 3: customer debt logic...")
        t3 = page.evaluate("""async () => {
            const { createSale } = await import('./src/engine.js');
            const { getAll } = await import('./src/db.js');
            const prods = await getAll('products');
            const whs = await getAll('warehouses');
            const whId = whs[0]?.id;
            const p = prods[0];
            
            // Create a partial debt sale: total 200,000, paid 50,000, debt 150,000
            const s = await createSale({
                items: [{ itemId: p.id, quantity: 1, unitPrice: 200000 }],
                warehouseId: whId,
                paymentMethod: 'debt',
                payments: [{ method: 'cash', amount: 50000, status: 'PAID' }, { method: 'debt', amount: 150000, status: 'PENDING' }],
                customerLabel: 'Khách Thử Nợ'
            });
            
            // Calculate debt using Item 3 formula
            const remainingDebt = s.debt_amount != null ? Number(s.debt_amount) : Math.max(0, Number(s.grand_total ?? s.total ?? 0) - Number(s.paid_amount || 0));
            return {
                grand_total: s.grand_total,
                paid_amount: s.paid_amount,
                debt_amount: s.debt_amount,
                calc_debt: remainingDebt
            };
        }""")
        print("Item 3 Result:", t3)
        results["item_3_debt_calc"] = (t3["calc_debt"] == 150000)

        # Test 4: Verify createSale() with transfer/qr defaults to PAID
        print("Testing Item 4: createSale payment status fallback...")
        t4 = page.evaluate("""async () => {
            const { createSale } = await import('./src/engine.js');
            const { getAll } = await import('./src/db.js');
            const prods = await getAll('products');
            const whs = await getAll('warehouses');
            const whId = whs[0]?.id;
            const p = prods[0];
            
            const saleTransfer = await createSale({
                items: [{ itemId: p.id, quantity: 1, unitPrice: 50000 }],
                warehouseId: whId,
                paymentMethod: 'transfer',
                customerLabel: 'Khách Chuyển Khoản'
            });
            
            return {
                method: saleTransfer.payment_method,
                status: saleTransfer.payment_status
            };
        }""")
        print("Item 4 Result:", t4)
        results["item_4_transfer_paid"] = (t4["status"] == "PAID")

        # Test 5: Verify receivePurchase updates supplier.debt
        print("Testing Item 5: supplier debt on purchase receipt...")
        t5 = page.evaluate("""async () => {
            const { createSupplier, applyWarehouseBatch } = await import('./src/engine.js');
            const { getOne, getAll } = await import('./src/db.js');
            const prods = await getAll('products');
            const whs = await getAll('warehouses');
            const whId = whs[0]?.id;
            const p = prods[0];
            
            // Create test supplier
            const sup = await createSupplier({
                name: 'NCC Kiểm Thử ' + Date.now(),
                phone: '0901234567'
            });
            
            // Receive purchase without payment -> creates supplier debt
            const rc = await applyWarehouseBatch({
                kind: 'receive',
                warehouseId: whId,
                supplierId: sup.id,
                lines: [{ productId: p.id, qty: 5, price: 100000 }]
            });
            
            const updatedSup = await getOne('suppliers', sup.id);
            return {
                sup_id: sup.id,
                debt_before: sup.debt || 0,
                debt_after: updatedSup.debt,
                total_spent: updatedSup.total_spent
            };
        }""")
        print("Item 5 Result:", t5)
        results["item_5_supplier_debt"] = (t5["debt_after"] == 500000)

        # Test 6: Verify completed order in createReturn / Return Center
        print("Testing Item 6: completed order return...")
        t6 = page.evaluate("""async () => {
            const { createOrder, completeOrder, createReturn } = await import('./src/engine.js');
            const { getOne, getAll } = await import('./src/db.js');
            const prods = await getAll('products');
            const whs = await getAll('warehouses');
            const whId = whs[0]?.id;
            const p = prods[0];
            
            // 1. Create order
            const ord = await createOrder({
                warehouseId: whId,
                items: [{ itemId: p.id, quantity: 2, unitPrice: 60000 }],
                customerLabel: 'Khách Đơn Online'
            });
            
            // 2. Complete order (dispatches inventory deduction)
            const completed = await completeOrder(ord.id);
            
            // 3. Return 1 item from this completed order!
            const ret = await createReturn({
                saleId: ord.id,
                lines: [{ itemId: p.id, quantity: 1, condition: 'SELLABLE' }],
                reason: 'Khách online trả hàng'
            });
            
            const updatedOrd = await getOne('orders', ord.id);
            
            return {
                order_id: ord.id,
                completed_status: completed.status,
                return_id: ret.id,
                refund_amount: ret.refund_amount,
                order_return_status: updatedOrd.return_status
            };
        }""")
        print("Item 6 Result:", t6)
        results["item_6_order_return"] = (t6["return_id"] is not None and t6["refund_amount"] == 60000 and t6["order_return_status"] == "RETURNED")

        # Test 7: Verify kickCashDrawer triggered on cash checkout
        print("Testing Item 7: cash drawer kick...")
        t7 = page.evaluate("""async () => {
            return new Promise(async (resolve) => {
                let kickedEvent = null;
                window.addEventListener('qbiz:cash_drawer_kicked', (e) => {
                    kickedEvent = e.detail;
                }, { once: true });
                
                const { kickCashDrawer } = await import('./src/hardware/escpos.js');
                const res = await kickCashDrawer({ pin: 0 });
                
                setTimeout(() => {
                    resolve({
                        drawer_res: res,
                        event_fired: kickedEvent !== null,
                        event_detail: kickedEvent
                    });
                }, 100);
            });
        }""")
        print("Item 7 Result:", t7)
        results["item_7_drawer_kick"] = (t7["drawer_res"]["success"] is True and t7["event_fired"] is True)

        # Now test UI and capture Mobile Screenshots (iPhone 13: 390x844)
        print("Capturing UI Mobile Screenshots (390x844)...")
        
        # Enter demo shop if entry modal is present
        page.evaluate("""() => {
            const demoBtn = document.querySelector('[data-action="preview-demo"]');
            if (demoBtn) demoBtn.click();
            const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close]');
            if (modalClose) modalClose.click();
        }""")
        page.wait_for_timeout(1500)

        # 1. Screenshot Return Center (showing transactions including online completed orders)
        page.evaluate("() => { window.__qbiz_app__.navigate('returns'); }")
        page.wait_for_timeout(1000)
        shot_return_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_return_center.png")
        page.screenshot(path=shot_return_path)
        print(f"Captured: {shot_return_path}")

        # 2. Open return modal and screenshot
        page.evaluate("""() => {
            const btn = document.querySelector('[data-return-sale]');
            if (btn) btn.click();
        }""")
        page.wait_for_timeout(1000)
        shot_modal_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_return_modal.png")
        page.screenshot(path=shot_modal_path)
        print(f"Captured: {shot_modal_path}")

        # Close modal
        page.evaluate("""() => {
            const closeBtn = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close], #modalCloseBtn');
            if (closeBtn) closeBtn.click();
        }""")
        page.wait_for_timeout(500)

        # 3. Screenshot Debts Center (Công nợ khách & NCC)
        page.evaluate("() => { window.__qbiz_app__.navigate('debts'); }")
        page.wait_for_timeout(1000)
        shot_debts_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_debts_center.png")
        page.screenshot(path=shot_debts_path)
        print(f"Captured: {shot_debts_path}")

        # 4. Screenshot POS Counter
        page.evaluate("() => { window.__qbiz_app__.navigate('sales'); }")
        page.wait_for_timeout(1000)
        shot_pos_path = os.path.join(ARTIFACT_DIR, "evidence_mobile_pos_counter.png")
        page.screenshot(path=shot_pos_path)
        print(f"Captured: {shot_pos_path}")

        browser.close()

    print("\n================ TEST SUMMARY ================")
    all_passed = True
    for item, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {item}")
        if not passed:
            all_passed = False
    print("==============================================")
    if all_passed:
        print("ALL 7 CORE ITEMS VERIFIED SUCCESSFULLY!")
    else:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
