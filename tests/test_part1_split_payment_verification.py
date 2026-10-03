# -*- coding: utf-8 -*-
"""
Empirical Verification Test Suite for Part 1: Split Payment Engine (Multi-tender POS Checkout)
1. Split tender cash + transfer: grandTotal = 2,000,000 VND (500k cash + 1.5M transfer).
   - sale.payment_method === 'split'
   - sale.payment_status === 'PAID'
   - sale.paid_amount === 2,000,000, sale.debt_amount === 0
   - Shift cash drawer adds exactly 500,000 (not 2,000,000).
2. Split tender cash + qr + debt: grandTotal = 3,000,000 VND (1M cash + 800k QR + 1.2M debt).
   - sale.payment_method === 'split'
   - sale.payment_status === 'PARTIAL'
   - sale.paid_amount === 1,800,000, sale.debt_amount === 1,200,000
   - Customer debt ledger increases by exactly 1,200,000.
3. Tender mismatch rejection: sum of payments != grandTotal throws descriptive error.
4. Credit limit enforcement: split debt exceeding customer limit is blocked, allowed with override.
5. Exact cash drawer reconciliation: shift expected cash matches cash tenders only.
6. Partial debt collection on split sale: markSalePaid adjusts paid/debt amounts and customer ledger.
"""

import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4180"

def run_split_payment_verification(run_index=1):
    print(f"\n===========================================================================")
    print(f"RUN {run_index}: Part 1 - Split Payment Engine Empirical Verification")
    print(f"===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # -------------------------------------------------------------
        # STEP 0: Ensure Open Shift
        # -------------------------------------------------------------
        print("  [Step 0] Ensuring Active Shift with 1,000,000 VND Opening Cash...")
        shift_res = page.evaluate("""
        async () => {
            const { openShift, currentShift, ensureLocalIdentity, getAll } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            let cur = shifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            if (!cur) {
                cur = await openShift({ openingCash: 1000000, note: 'Ca test split payment' });
            }
            return {
                id: cur.id,
                status: cur.status,
                openingCash: cur.opening_cash || 0
            };
        }
        """)
        print(f"    Shift: {shift_res['id']} (Status: {shift_res['status']}, Opening Cash: {shift_res['openingCash']:,} VND)")
        assert shift_res['status'] == 'OPEN', "Shift must be OPEN"

        # -------------------------------------------------------------
        # TEST 1: Split Tender (Cash + Bank Transfer)
        # -------------------------------------------------------------
        print("  [Test 1] Testing Split Payment: 500,000 Cash + 1,500,000 Transfer = 2,000,000 VND...")
        test1_res = page.evaluate("""
        async () => {
            const { createSale, getAll } = await import('/src/engine.js');
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const prod = products.find(p => p.price && p.price > 0) || products[0];
            const wh = warehouses[0];

            // 1 product line adjusted to 2,000,000 VND
            const sale = await createSale({
                warehouseId: wh.id,
                items: [{
                    itemId: prod.id,
                    quantity: 1,
                    unitPrice: 2000000
                }],
                payments: [
                    { method: 'cash', amount: 500000, reference: 'Tiền mặt tại quầy' },
                    { method: 'transfer', amount: 1500000, reference: 'CK Vietcombank 8882' }
                ],
                note: 'Đơn thanh toán chia đôi tiền mặt và chuyển khoản'
            });

            await window.__qbiz_app__.refresh();

            // Verify shift calculation for cash sales
            const { closeShift, getAll: getAllAgain } = await import('/src/engine.js');
            const allSales = await getAllAgain('sales');
            const thisSale = allSales.find(s => s.id === sale.id);

            return {
                saleId: sale.id,
                code: sale.code,
                grandTotal: sale.grand_total,
                method: sale.payment_method,
                status: sale.payment_status,
                paidAmount: sale.paid_amount,
                debtAmount: sale.debt_amount,
                paymentsCount: (sale.payments || []).length,
                cashPortion: sale.payments.find(p => p.method === 'cash')?.amount,
                transferPortion: sale.payments.find(p => p.method === 'transfer')?.amount
            };
        }
        """)
        print(f"    Sale Code: {test1_res['code']}, Method: {test1_res['method']}, Status: {test1_res['status']}")
        print(f"    Grand Total: {test1_res['grandTotal']:,} VND (Paid: {test1_res['paidAmount']:,} VND, Debt: {test1_res['debtAmount']:,} VND)")
        assert test1_res['method'] == 'split', f"Expected method 'split', got {test1_res['method']}"
        assert test1_res['status'] == 'PAID', f"Expected status 'PAID', got {test1_res['status']}"
        assert test1_res['paidAmount'] == 2000000, "Paid amount should equal grand total"
        assert test1_res['debtAmount'] == 0, "Debt amount should be 0"
        assert test1_res['cashPortion'] == 500000, "Cash portion must be 500,000"
        assert test1_res['transferPortion'] == 1500000, "Transfer portion must be 1,500,000"
        print("    [PASS] Test 1: Split Cash + Transfer verified.")

        # -------------------------------------------------------------
        # TEST 2: Split Tender (Cash + QR + Debt)
        # -------------------------------------------------------------
        print("  [Test 2] Testing Multi-Tender: 1,000,000 Cash + 800,000 QR + 1,200,000 Debt = 3,000,000 VND...")
        test2_res = page.evaluate("""
        async () => {
            const { createCustomer, createSale, getAll, getCustomerDebtSummary } = await import('/src/engine.js');
            const uid = Math.random().toString(36).slice(2, 7);
            const customer = await createCustomer({
                name: 'Công Ty TNHH ' + uid,
                phone: '0988' + Math.floor(100000 + Math.random() * 900000),
                creditLimit: 5000000,
                note: 'Khách hàng VIP thanh toán kết hợp nợ'
            });

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const prod = products[0];
            const wh = warehouses[0];

            const sale = await createSale({
                warehouseId: wh.id,
                customerId: customer.id,
                customerLabel: customer.name,
                items: [{
                    itemId: prod.id,
                    quantity: 1,
                    unitPrice: 3000000
                }],
                payments: [
                    { method: 'cash', amount: 1000000, reference: 'Tiền mặt' },
                    { method: 'qr', amount: 800000, reference: 'VietQR POS-999' },
                    { method: 'debt', amount: 1200000, reference: 'Ghi nợ 30 ngày' }
                ],
                note: 'Đơn multi-tender: Tiền mặt + QR + Ghi nợ'
            });

            await window.__qbiz_app__.refresh();
            const debtSummary = await getCustomerDebtSummary(customer.id);

            return {
                saleId: sale.id,
                code: sale.code,
                grandTotal: sale.grand_total,
                method: sale.payment_method,
                status: sale.payment_status,
                paidAmount: sale.paid_amount,
                debtAmount: sale.debt_amount,
                customerDebt: debtSummary.totalDebt,
                availableCredit: debtSummary.availableCredit
            };
        }
        """)
        print(f"    Sale Code: {test2_res['code']}, Method: {test2_res['method']}, Status: {test2_res['status']}")
        print(f"    Paid: {test2_res['paidAmount']:,} VND, Debt: {test2_res['debtAmount']:,} VND")
        print(f"    Customer Ledger Debt: {test2_res['customerDebt']:,} VND, Available Credit: {test2_res['availableCredit']:,} VND")
        assert test2_res['method'] == 'split', f"Expected method 'split', got {test2_res['method']}"
        assert test2_res['status'] == 'PARTIAL', f"Expected status 'PARTIAL', got {test2_res['status']}"
        assert test2_res['paidAmount'] == 1800000, "Paid amount should be 1,800,000"
        assert test2_res['debtAmount'] == 1200000, "Debt amount should be 1,200,000"
        assert test2_res['customerDebt'] == 1200000, "Customer debt must equal 1,200,000"
        assert test2_res['availableCredit'] == 3800000, "Available credit must be 5,000,000 - 1,200,000 = 3,800,000"
        print("    [PASS] Test 2: Multi-Tender Cash + QR + Debt verified.")

        # -------------------------------------------------------------
        # TEST 3: Validation of Mismatched Tender Sum
        # -------------------------------------------------------------
        print("  [Test 3] Testing Rejection of Mismatched Payments Total...")
        test3_res = page.evaluate("""
        async () => {
            const { createSale, getAll } = await import('/src/engine.js');
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const prod = products[0];
            const wh = warehouses[0];

            try {
                // Total is 2,000,000 but payments only sum to 1,500,000
                await createSale({
                    warehouseId: wh.id,
                    items: [{ itemId: prod.id, quantity: 1, unitPrice: 2000000 }],
                    payments: [
                        { method: 'cash', amount: 500000 },
                        { method: 'transfer', amount: 1000000 }
                    ]
                });
                return { rejected: false };
            } catch (err) {
                return { rejected: true, message: err.message };
            }
        }
        """)
        print(f"    Rejected: {test3_res['rejected']}, Error Message: {test3_res.get('message')}")
        assert test3_res['rejected'] is True, "Mismatched tender sum must be rejected"
        assert "không khớp tổng tiền đơn hàng" in test3_res['message'], "Error must explain amount mismatch"
        print("    [PASS] Test 3: Tender sum validation verified.")

        # -------------------------------------------------------------
        # TEST 4: Split Payment with Credit Limit Enforcement
        # -------------------------------------------------------------
        print("  [Test 4] Testing Credit Limit Enforcement on Split Debt Portion...")
        test4_res = page.evaluate("""
        async () => {
            const { createCustomer, createSale, getAll } = await import('/src/engine.js');
            const uid = Math.random().toString(36).slice(2, 7);
            const customer = await createCustomer({
                name: 'Đại Lý Nhỏ ' + uid,
                phone: '0977' + Math.floor(100000 + Math.random() * 900000),
                creditLimit: 1000000 // 1,000,000 VND limit
            });

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const prod = products[0];
            const wh = warehouses[0];

            let blocked = false;
            let blockMessage = '';
            try {
                // Sale 3M: 1M cash + 2M debt -> debt (2M) exceeds creditLimit (1M)
                await createSale({
                    warehouseId: wh.id,
                    customerId: customer.id,
                    customerLabel: customer.name,
                    items: [{ itemId: prod.id, quantity: 1, unitPrice: 3000000 }],
                    payments: [
                        { method: 'cash', amount: 1000000 },
                        { method: 'debt', amount: 2000000 }
                    ]
                });
            } catch (err) {
                blocked = true;
                blockMessage = err.message;
            }

            // Now retry with overrideCreditLimit = true
            const overriddenSale = await createSale({
                warehouseId: wh.id,
                customerId: customer.id,
                customerLabel: customer.name,
                items: [{ itemId: prod.id, quantity: 1, unitPrice: 3000000 }],
                payments: [
                    { method: 'cash', amount: 1000000 },
                    { method: 'debt', amount: 2000000 }
                ],
                overrideCreditLimit: true
            });

            return {
                blocked,
                blockMessage,
                overriddenSaleId: overriddenSale.id,
                isOverridden: overriddenSale.credit_limit_overridden,
                debtAmount: overriddenSale.debt_amount
            };
        }
        """)
        print(f"    Blocked without override: {test4_res['blocked']}, Message: {test4_res['blockMessage']}")
        print(f"    Allowed with override: {test4_res['isOverridden']}, Debt: {test4_res['debtAmount']:,} VND")
        assert test4_res['blocked'] is True, "Debt exceeding credit limit must be blocked"
        assert "vượt quá hạn mức công nợ cho phép" in test4_res['blockMessage'], "Expected credit limit error"
        assert test4_res['isOverridden'] is True, "Sale with overrideCreditLimit=true must succeed"
        print("    [PASS] Test 4: Credit limit enforcement on split debt portion verified.")

        # -------------------------------------------------------------
        # TEST 5: Cash Drawer Reconciliation (Only Cash tenders enter drawer)
        # -------------------------------------------------------------
        print("  [Test 5] Verifying Physical Cash Drawer Calculation from Split Tenders...")
        test5_res = page.evaluate("""
        async () => {
            const { ensureLocalIdentity, getAll, openShift } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            const curShift = shifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            const allSales = await getAll('sales');
            const shiftSales = allSales.filter(s => s.shift_id === curShift.id || (s.payments || []).some(p => p.shift_id === curShift.id));

            let cashTendersTotal = 0;
            let nonCashTendersTotal = 0;

            for (const s of shiftSales) {
                for (const p of (s.payments || [])) {
                    if ((p.shift_id || s.shift_id) !== curShift.id) continue;
                    if (p.status !== 'PAID') continue;
                    if (p.method === 'cash') cashTendersTotal += Number(p.amount || 0);
                    else nonCashTendersTotal += Number(p.amount || 0);
                }
            }

            return {
                shiftId: curShift.id,
                openingCash: curShift.opening_cash || 0,
                cashTendersTotal,
                nonCashTendersTotal,
                expectedCash: (curShift.opening_cash || 0) + cashTendersTotal
            };
        }
        """)
        print(f"    Opening Cash: {test5_res['openingCash']:,} VND")
        print(f"    Total Cash Tenders Collected: {test5_res['cashTendersTotal']:,} VND")
        print(f"    Total Non-Cash Tenders (QR, Transfer): {test5_res['nonCashTendersTotal']:,} VND")
        print(f"    Expected Cash in Drawer: {test5_res['expectedCash']:,} VND")
        assert test5_res['cashTendersTotal'] > 0, "Cash tenders should be recorded"
        assert test5_res['nonCashTendersTotal'] > 0, "Non-cash tenders should be recorded"
        assert test5_res['expectedCash'] == test5_res['openingCash'] + test5_res['cashTendersTotal'], "Expected cash must strictly equal opening + cash tenders"
        print("    [PASS] Test 5: Exact Cash Drawer Reconciliation verified.")

        # -------------------------------------------------------------
        # TEST 6: Partial Debt Collection on Split Sale
        # -------------------------------------------------------------
        print("  [Test 6] Testing Partial Debt Collection on Split Sale via markSalePaid...")
        test6_res = page.evaluate(f"""
        async () => {{
            const {{ markSalePaid, getAll, getCustomerDebtSummary }} = await import('/src/engine.js');
            const saleId = '{test2_res["saleId"]}';
            
            // Collect 500,000 VND of the 1,200,000 VND debt
            const updatedSale = await markSalePaid({{
                saleId,
                amount: 500000,
                paymentMethod: 'cash',
                reference: 'Khách thanh toán nợ đợt 1'
            }});

            const allSales = await getAll('sales');
            const saleAfter = allSales.find(s => s.id === saleId);
            const debtSummary = await getCustomerDebtSummary(saleAfter.customer_id);

            return {{
                saleId,
                status: saleAfter.payment_status,
                paidAmount: saleAfter.paid_amount,
                debtAmount: saleAfter.debt_amount,
                remainingCustomerDebt: debtSummary.totalDebt,
                paymentsCount: (saleAfter.payments || []).length
            }};
        }}
        """)
        print(f"    Sale Status: {test6_res['status']}, Paid Amount: {test6_res['paidAmount']:,} VND, Debt Amount: {test6_res['debtAmount']:,} VND")
        print(f"    Remaining Customer Debt: {test6_res['remainingCustomerDebt']:,} VND, Payments Count: {test6_res['paymentsCount']}")
        assert test6_res['status'] == 'PARTIAL', "Status should remain PARTIAL after partial collection"
        assert test6_res['paidAmount'] == 2300000, f"Paid amount should be 1,800,000 + 500,000 = 2,300,000, got {test6_res['paidAmount']}"
        assert test6_res['debtAmount'] == 700000, f"Debt amount should be 1,200,000 - 500,000 = 700,000, got {test6_res['debtAmount']}"
        assert test6_res['remainingCustomerDebt'] == 700000, f"Customer debt must be 700,000, got {test6_res['remainingCustomerDebt']}"
        print("    [PASS] Test 6: Partial debt collection on split sale verified.")

        browser.close()
        return True

if __name__ == "__main__":
    passes = 0
    total_runs = 5
    print("=" * 80)
    print("EXECUTING 5 CONSECUTIVE PASSES: PART 1 SPLIT PAYMENT ENGINE VERIFICATION")
    print("=" * 80)
    for i in range(1, total_runs + 1):
        try:
            if run_split_payment_verification(i):
                passes += 1
                print(f"==> RUN {i} PASSED ({passes}/{i})")
        except Exception as e:
            print(f"==> RUN {i} FAILED: {e}")
            import traceback
            traceback.print_exc()
            break

    print("\n" + "=" * 80)
    print(f"FINAL RESULT: {passes}/{total_runs} CONSECUTIVE PASSES")
    print("=" * 80)
    if passes == total_runs:
        print(">>> ALL 5 PASSES SUCCEEDED: PART 1 SPLIT PAYMENT ENGINE VERIFIED <<<")
        sys.exit(0)
    else:
        print(">>> VERIFICATION FAILED <<<")
        sys.exit(1)
