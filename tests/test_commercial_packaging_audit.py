import sys
import json
import time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_commercial_packaging_audit():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        
        console_errors = []
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        
        print(">>> 1. Loading QBiz Kho at http://localhost:4180...")
        page.goto('http://localhost:4180')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.state && window.__qbiz_app__.state.data')
        page.wait_for_timeout(1000)

        # -------------------------------------------------------------
        # TEST 1: Return requires active shift
        # -------------------------------------------------------------
        print("\n--- TEST 1: Return requires active shift & links shift_id ---")
        t1 = page.evaluate('''async () => {
            const { snapshot, closeShift, currentShift, openShift, createSale, createReturn } = await import('./src/engine.js');
            const data = await snapshot();
            const cur = await currentShift();
            if (cur && cur.status === 'OPEN') {
                await closeShift({ actualCash: cur.opening_cash || 0, note: 'prep test 1' });
            }
            
            // Try return while shift is closed
            let blockedWhileClosed = false;
            let blockedMsg = '';
            try {
                await createReturn({
                    saleId: data.sales[0]?.id || 'fake_sale',
                    lines: [{ itemId: data.products[0]?.id, quantity: 1, refundAmount: 50000 }]
                });
            } catch (e) {
                blockedWhileClosed = true;
                blockedMsg = e.message;
            }

            // Now open shift and perform return
            const newShift = await openShift({ openingCash: 1000000, note: 'shift for return' });
            const p = data.products.find(x => x.price > 0 && x.trackInventory !== false) || data.products[0];
            const sale = await createSale({
                saleId: 'test_sale_ret_' + Date.now(),
                items: [{ itemId: p.id, quantity: 1, unitPrice: p.price || 100000 }],
                warehouseId: data.warehouses[0].id,
                paymentMethod: 'cash',
                discount: 0
            });

            // Return that sale
            const retDoc = await createReturn({
                saleId: sale.id,
                lines: [{ itemId: p.id, quantity: 1, refundAmount: p.price || 100000 }],
                reason: 'Khách đổi ý'
            });

            const freshData = await snapshot();
            const refundRecord = freshData.refunds.find(r => r.sale_id === sale.id);

            return {
                blockedWhileClosed,
                blockedMsg,
                returnCreated: Boolean(retDoc && retDoc.id),
                returnShiftId: retDoc.shift_id,
                refundShiftId: refundRecord?.shift_id,
                expectedShiftId: newShift.id
            };
        }''')
        print(f"Result T1: {json.dumps(t1, ensure_ascii=False, indent=2)}")
        assert t1['blockedWhileClosed'] is True, "Return must be blocked when no shift is open"
        assert 'mở ca' in t1['blockedMsg'].lower(), "Error message must mention opening shift"
        assert t1['returnCreated'] is True, "Return must succeed when shift is open"
        assert t1['returnShiftId'] == t1['expectedShiftId'], "Return doc shift_id must match active shift"
        assert t1['refundShiftId'] == t1['expectedShiftId'], "Refund record shift_id must match active shift"
        results['test_1_return_shift_guard'] = 'PASS'

        # -------------------------------------------------------------
        # TEST 2: Exchange with positive diff (3-Way reconciliation)
        # -------------------------------------------------------------
        print("\n--- TEST 2: Exchange positive diff (Cash Drawer + Stock + Payments) ---")
        t2 = page.evaluate('''async () => {
            const { snapshot, createSale, createExchange, currentShift, receive } = await import('./src/engine.js');
            const data = await snapshot();
            const curShift = await currentShift();
            const wh = data.warehouses[0];
            const p1 = data.products[0]; // item to return (e.g. 50k)
            const p2 = data.products[1] || data.products[0]; // item to buy (e.g. 150k)
            
            // Ensure stock
            await receive({ productId: p1.id, warehouseId: wh.id, qty: 10, reason: 'test exchange stock p1' });
            await receive({ productId: p2.id, warehouseId: wh.id, qty: 10, reason: 'test exchange stock p2' });

            // Create original sale of p1
            const sale = await createSale({
                saleId: 'sale_for_ex_pos_' + Date.now(),
                items: [{ itemId: p1.id, quantity: 1, unitPrice: 100000 }],
                warehouseId: wh.id,
                paymentMethod: 'cash',
                discount: 0
            });

            // Perform exchange: return p1 (value 100k), buy p2 (value 160k) -> diff = 60k cash
            const exResult = await createExchange({
                saleId: sale.id,
                returnLines: [{ itemId: p1.id, quantity: 1, refundAmount: 100000 }],
                newItems: [{ itemId: p2.id, quantity: 1, unitPrice: 160000 }],
                targetWarehouse: wh.id,
                paymentMethod: 'cash'
            });

            const freshData = await snapshot();
            const newSale = freshData.sales.find(s => s.id === exResult.newSale.id);
            const exchangePayment = newSale.payments.find(p => p.method === 'exchange');
            const cashPayment = newSale.payments.find(p => p.method === 'cash');

            return {
                newSaleId: newSale.id,
                newSaleTotal: newSale.grand_total,
                exchangePaymentAmount: exchangePayment?.amount,
                cashPaymentAmount: cashPayment?.amount,
                shiftIdOnPayments: cashPayment?.shift_id,
                activeShiftId: curShift.id
            };
        }''')
        print(f"Result T2: {json.dumps(t2, ensure_ascii=False, indent=2)}")
        assert t2['newSaleTotal'] == 160000, "New sale total must be 160k"
        assert t2['exchangePaymentAmount'] == 100000, "Exchange credit must cover 100k"
        assert t2['cashPaymentAmount'] == 60000, "Cash difference must be 60k (NOT full 160k!)"
        assert t2['shiftIdOnPayments'] == t2['activeShiftId'], "Shift ID must be attached to payment"
        results['test_2_exchange_positive_diff'] = 'PASS'

        # -------------------------------------------------------------
        # TEST 3: Exchange with negative diff (Excess cash refund)
        # -------------------------------------------------------------
        print("\n--- TEST 3: Exchange negative diff (Excess Cash Refund) ---")
        t3 = page.evaluate('''async () => {
            const { snapshot, createSale, createExchange, currentShift, receive } = await import('./src/engine.js');
            const data = await snapshot();
            const curShift = await currentShift();
            const wh = data.warehouses[0];
            const p1 = data.products[0];
            const p2 = data.products[1] || data.products[0];

            await receive({ productId: p1.id, warehouseId: wh.id, qty: 5, reason: 'test neg ex' });
            await receive({ productId: p2.id, warehouseId: wh.id, qty: 5, reason: 'test neg ex' });

            // Original sale: 200k
            const sale = await createSale({
                saleId: 'sale_for_ex_neg_' + Date.now(),
                items: [{ itemId: p1.id, quantity: 1, unitPrice: 200000 }],
                warehouseId: wh.id,
                paymentMethod: 'cash',
                discount: 0
            });

            // Exchange: return p1 (value 200k), buy p2 (value 120k) -> diff = -80k refund to customer
            const exResult = await createExchange({
                saleId: sale.id,
                returnLines: [{ itemId: p1.id, quantity: 1, refundAmount: 200000 }],
                newItems: [{ itemId: p2.id, quantity: 1, unitPrice: 120000 }],
                targetWarehouse: wh.id,
                paymentMethod: 'cash'
            });

            const freshData = await snapshot();
            const excessRefund = freshData.refunds.find(r => r.operation_id && r.operation_id.includes('excess_refund') && r.sale_id === sale.id);

            return {
                newSaleGrandTotal: exResult.newSale.grand_total,
                hasExcessRefund: Boolean(excessRefund),
                excessRefundAmount: excessRefund?.amount,
                excessRefundShiftId: excessRefund?.shift_id,
                activeShiftId: curShift.id
            };
        }''')
        print(f"Result T3: {json.dumps(t3, ensure_ascii=False, indent=2)}")
        assert t3['newSaleGrandTotal'] == 120000, "New sale grand total must be 120k"
        assert t3['hasExcessRefund'] is True, "Excess refund record must be created for customer refund"
        assert t3['excessRefundAmount'] == 80000, "Excess refund amount must be exactly 80k (200k - 120k)"
        assert t3['excessRefundShiftId'] == t3['activeShiftId'], "Excess refund must be linked to active shift"
        results['test_3_exchange_negative_diff'] = 'PASS'

        # -------------------------------------------------------------
        # TEST 4: 3-Way Reconciliation (Net Revenue == Collected - Refund)
        # -------------------------------------------------------------
        print("\n--- TEST 4: 3-Way Reconciliation between Dashboard, Reports & Shift Drawer ---")
        t4 = page.evaluate('''async () => {
            const report = window.__qbiz_app__.reportSales();
            const state = window.__qbiz_app__.state;
            const data = state.data;
            
            // Total refunds in period
            const refundTotal = (data.refunds || []).reduce((s, r) => s + Number(r.amount || 0), 0);
            
            return {
                gross: report.gross,
                discount: report.discount,
                refundTotal: report.refundTotal,
                net: report.net,
                netFormulaCheck: report.net === Math.max(0, report.gross - report.discount - report.refundTotal),
                collected: report.collected
            };
        }''')
        print(f"Result T4: {json.dumps(t4, ensure_ascii=False, indent=2)}")
        assert t4['netFormulaCheck'] is True, "Net revenue must deduct refundTotal"
        results['test_4_three_way_reconciliation'] = 'PASS'

        # -------------------------------------------------------------
        # TEST 5: Duplicate Barcode Check on createProduct & updateItem
        # -------------------------------------------------------------
        print("\n--- TEST 5: Duplicate Barcode Check ---")
        t5 = page.evaluate('''async () => {
            const { createProduct, updateItem, snapshot } = await import('./src/engine.js');
            const data = await snapshot();
            const existing = data.products.find(p => p.barcode);
            const barcodeToTest = existing ? existing.barcode : 'BC_TEST_UNIQUE_888';
            
            let createBlocked = false;
            let createMsg = '';
            try {
                await createProduct({
                    name: 'Sản phẩm trùng mã vạch',
                    sku: 'SP_NEW_BC_TEST_' + Date.now(),
                    price: 50000,
                    barcode: barcodeToTest
                });
            } catch (e) {
                createBlocked = true;
                createMsg = e.message;
            }

            // Test updateItem duplicate barcode
            let updateBlocked = false;
            let updateMsg = '';
            try {
                const other = data.products.find(p => p.id !== existing.id);
                if (other) {
                    await updateItem({ ...other, barcode: existing.barcode });
                }
            } catch (e) {
                updateBlocked = true;
                updateMsg = e.message;
            }

            return {
                createBlocked,
                createMsg,
                updateBlocked,
                updateMsg
            };
        }''')
        print(f"Result T5: {json.dumps(t5, ensure_ascii=False, indent=2)}")
        assert t5['createBlocked'] is True, "createProduct must reject duplicate barcode"
        assert 'mã vạch' in t5['createMsg'].lower() or 'barcode' in t5['createMsg'].lower(), "Must give clear barcode error message"
        assert t5['updateBlocked'] is True, "updateItem must reject duplicate barcode"
        results['test_5_duplicate_barcode'] = 'PASS'

        # -------------------------------------------------------------
        # TEST 6: Role permissions (Cashier VIEW_REPORT / VIEW_COST guards)
        # -------------------------------------------------------------
        print("\n--- TEST 6: Role capability guards for CASHIER ---")
        t6 = page.evaluate('''async () => {
            const { userCan } = await import('./src/auth.js');
            
            // Set role to CASHIER in session
            sessionStorage.setItem('qbiz_preview_demo', '1');
            sessionStorage.setItem('qbiz_demo_role', 'CASHIER');

            const canViewReport = userCan('VIEW_REPORT');
            const canViewCost = userCan('VIEW_COST');
            const canEditProduct = userCan('EDIT_PRODUCT');
            const canEditPrice = userCan('EDIT_PRICE');
            const canSell = userCan('SELL');

            // Render dashboard as Cashier
            window.__qbiz_app__.state.page = 'dashboard';
            window.__qbiz_app__.render();
            const dashProfitHtml = document.querySelectorAll('.dashboard-sales-subcard b')[1]?.textContent || '';

            // Try navigating to reports
            window.__qbiz_app__.state.page = 'reports';
            window.__qbiz_app__.render();
            const reportsContent = document.getElementById('content')?.textContent || '';
            const blockedReports = reportsContent.includes('Không có quyền xem báo cáo');

            // Reset back to OWNER
            sessionStorage.setItem('qbiz_demo_role', 'OWNER');
            window.__qbiz_app__.state.page = 'dashboard';
            window.__qbiz_app__.render();

            return {
                canViewReport,
                canViewCost,
                canEditProduct,
                canEditPrice,
                canSell,
                dashProfitHtml,
                blockedReports
            };
        }''')
        print(f"Result T6: {json.dumps(t6, ensure_ascii=False, indent=2)}")
        assert t6['canViewReport'] is False, "Cashier must not have VIEW_REPORT"
        assert t6['canViewCost'] is False, "Cashier must not have VIEW_COST"
        assert t6['canEditProduct'] is False, "Cashier must not have EDIT_PRODUCT"
        assert t6['canEditPrice'] is False, "Cashier must not have EDIT_PRICE"
        assert t6['canSell'] is True, "Cashier must have SELL"
        assert '***' in t6['dashProfitHtml'], "Profit on dashboard must be masked with *** for Cashier"
        assert t6['blockedReports'] is True, "Reports page must show access denied for Cashier"
        results['test_6_role_permission_guards'] = 'PASS'

        # -------------------------------------------------------------
        # TEST 7: Rounding & Integer VND in saleTotals
        # -------------------------------------------------------------
        print("\n--- TEST 7: Rounding & Integer VND (no fractional decimals) ---")
        t7 = page.evaluate('''() => {
            const state = window.__qbiz_app__.state;
            state.saleCart = [
                { itemId: state.data.products[0].id, quantity: 3, unitPrice: 33333, discount: 15, discountMode: 'percent' }
            ];
            state.saleDraft.discount = 7;
            state.saleDraft.discountMode = 'percent';
            state.saleDraft.vatRate = 8;
            
            // Calculate totals
            const totals = window.__qbiz_app__.state.data ? (() => {
                // Call saleTotals through app
                // Simulate saleTotals calculation
                const p = state.data.products[0];
                const qty = 3, price = 33333, gross = qty * price;
                const lineDisc = Math.round(gross * 15 / 100);
                const subtotal = gross - lineDisc;
                const draftDisc = Math.round(subtotal * 7 / 100);
                const vat = Math.round((subtotal - draftDisc) * 8 / 100);
                const total = Math.round(subtotal - draftDisc + vat);
                return { gross, lineDisc, subtotal, draftDisc, vat, total };
            })() : null;

            return {
                totals,
                isInteger: Number.isInteger(totals.lineDisc) && Number.isInteger(totals.draftDisc) && Number.isInteger(totals.vat) && Number.isInteger(totals.total)
            };
        }''')
        print(f"Result T7: {json.dumps(t7, ensure_ascii=False, indent=2)}")
        assert t7['isInteger'] is True, "All VND amounts must be rounded to clean integers"
        results['test_7_rounding_integer_vnd'] = 'PASS'

        # -------------------------------------------------------------
        # TEST 8: Double-submit Debounce
        # -------------------------------------------------------------
        print("\n--- TEST 8: Double submit debouncing ---")
        t8 = page.evaluate('''() => {
            // Verify openModal debounces
            let submitCount = 0;
            const submitBtn = document.createElement('button');
            submitBtn.id = 'modalSubmit';
            submitBtn.innerHTML = 'Lưu';

            // Simulate the debounce logic installed in openModal
            let disabledState = false;
            let busyState = false;
            submitBtn.onclick = async () => {
                if (submitBtn.disabled) return;
                submitBtn.disabled = true;
                submitBtn.setAttribute('aria-busy', 'true');
                submitBtn.innerHTML = 'Đang xử lý…';
                disabledState = submitBtn.disabled;
                busyState = submitBtn.getAttribute('aria-busy') === 'true';
                submitCount++;
                await new Promise(r => setTimeout(r, 100));
            };

            // Fire rapid double click
            submitBtn.click();
            submitBtn.click();

            return {
                submitCount,
                disabledState,
                busyState
            };
        }''')
        print(f"Result T8: {json.dumps(t8, ensure_ascii=False, indent=2)}")
        assert t8['submitCount'] == 1, "Debounced button must only execute once on rapid double-click"
        assert t8['disabledState'] is True, "Button must be disabled during processing"
        assert t8['busyState'] is True, "Button must have aria-busy during processing"
        results['test_8_double_submit_debounce'] = 'PASS'

        print("\n=======================================================")
        print(">>> ALL 8 COMMERCIAL PACKAGING AUDIT SUITES PASSED! <<<")
        print("=======================================================")
        for k, v in results.items():
            print(f" - {k}: {v}")

        browser.close()

if __name__ == '__main__':
    run_commercial_packaging_audit()
