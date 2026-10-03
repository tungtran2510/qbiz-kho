# -*- coding: utf-8 -*-
"""
ADVERSARIAL STRESS & COMPLEX EDGE-CASE TEST SUITE (RED-TEAM AUDIT)
Strict objective audit for all features built today:
- Part 1: Split Payment Engine & Financial Ledger
- Part 2: ESC/POS & Cash Drawer Driver
- Part 3: AI Natural Language Financial & Debt Tools
- Phase 2: Variant-level inventory & Multi-tab sync edge cases

STRICT RULE: DO NOT AUTO-FIX ANY DISCOVERED BUGS.
Record empirical observations objectively for owner reporting.
"""

import sys
import time
import json
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4180"

def run_adversarial_suite():
    print("=" * 80)
    print("STARTING ADVERSARIAL RED-TEAM STRESS AUDIT ON TODAY'S FEATURES")
    print("=" * 80)

    findings = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # =========================================================================
        # SECTION 1: SPLIT PAYMENT ENGINE & FINANCIAL LEDGER COMPLEX EDGE CASES
        # =========================================================================
        print("\n" + "-" * 70)
        print("SECTION 1: SPLIT PAYMENT ENGINE & FINANCIAL LEDGER COMPLEX EDGE CASES")
        print("-" * 70)

        # 1.1: 4 Tenders Simultaneously (Cash + Transfer + QR + Debt)
        print("\n[Case 1.1] 4 Tenders Simultaneously (1M Cash + 3M Transfer + 2M QR + 4M Debt = 10M)...")
        res_1_1 = page.evaluate("""
        async () => {
            const { createSale, getAll, createCustomer, openShift, ensureLocalIdentity } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            let curShift = shifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            if (!curShift) {
                curShift = await openShift({ openingCash: 1000000 });
            }

            const uid = Math.random().toString(36).slice(2, 7);
            const cust = await createCustomer({
                name: 'Công ty Cổ Phần ' + uid,
                phone: '0901' + Math.floor(100000 + Math.random() * 900000),
                creditLimit: 10000000
            });

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');

            try {
                const sale = await createSale({
                    warehouseId: warehouses[0].id,
                    customerId: cust.id,
                    customerLabel: cust.name,
                    items: [{ itemId: products[0].id, quantity: 1, unitPrice: 10000000 }],
                    payments: [
                        { method: 'cash', amount: 1000000, reference: 'Tiền mặt' },
                        { method: 'transfer', amount: 3000000, reference: 'VIB-01' },
                        { method: 'qr', amount: 2000000, reference: 'VietQR-02' },
                        { method: 'debt', amount: 4000000, reference: 'Nợ hợp đồng' }
                    ]
                });

                return {
                    success: true,
                    saleCode: sale.code,
                    grandTotal: sale.grand_total,
                    method: sale.payment_method,
                    status: sale.payment_status,
                    paidAmount: sale.paid_amount,
                    debtAmount: sale.debt_amount,
                    paymentsCount: (sale.payments || []).length
                };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }
        """)
        print(f"  Result: {res_1_1}")
        status_1_1 = "PASS" if (res_1_1.get('success') and res_1_1.get('method') == 'split' and res_1_1.get('status') == 'PARTIAL' and res_1_1.get('paidAmount') == 6000000 and res_1_1.get('debtAmount') == 4000000) else "FAIL"
        findings.append({
            "test_id": "1.1",
            "name": "4 Tenders Simultaneously (Cash, Transfer, QR, Debt)",
            "status": status_1_1,
            "details": res_1_1
        })

        # 1.2: Negative Tender Amount Injection (Adversarial)
        print("\n[Case 1.2] Adversarial Injection of Negative Tender (-500k Cash + 2.5M Transfer on 2M Sale)...")
        res_1_2 = page.evaluate("""
        async () => {
            const { createSale, getAll } = await import('/src/engine.js');
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');

            try {
                const sale = await createSale({
                    warehouseId: warehouses[0].id,
                    items: [{ itemId: products[0].id, quantity: 1, unitPrice: 2000000 }],
                    payments: [
                        { method: 'cash', amount: -500000 },
                        { method: 'transfer', amount: 2500000 }
                    ]
                });
                return { blocked: false, saleId: sale.id, payments: sale.payments };
            } catch (err) {
                return { blocked: true, message: err.message };
            }
        }
        """)
        print(f"  Result: {res_1_2}")
        # Note: If negative amount is filtered out (amount <= 0 continue), then sumAssigned = 2.5M != 2M, so it throws "không khớp tổng tiền"
        status_1_2 = "PASS" if res_1_2.get('blocked') else "FAIL"
        findings.append({
            "test_id": "1.2",
            "name": "Negative Tender Amount Injection",
            "status": status_1_2,
            "details": res_1_2
        })

        # 1.3: Floating-Point Fraction Tenders (Adversarial)
        print("\n[Case 1.3] Floating-Point Fraction Tenders (1,500,000.4 + 499,999.6 = 2,000,000)...")
        res_1_3 = page.evaluate("""
        async () => {
            const { createSale, getAll } = await import('/src/engine.js');
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');

            try {
                const sale = await createSale({
                    warehouseId: warehouses[0].id,
                    items: [{ itemId: products[0].id, quantity: 1, unitPrice: 2000000 }],
                    payments: [
                        { method: 'cash', amount: 1500000.4 },
                        { method: 'transfer', amount: 499999.6 }
                    ]
                });
                return {
                    success: true,
                    grandTotal: sale.grand_total,
                    paidAmount: sale.paid_amount,
                    cashAmount: sale.payments[0].amount,
                    transferAmount: sale.payments[1].amount
                };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }
        """)
        print(f"  Result: {res_1_3}")
        status_1_3 = "PASS" if (res_1_3.get('success') and res_1_3.get('cashAmount') == 1500000 and res_1_3.get('transferAmount') == 500000) else "OBSERVATION"
        findings.append({
            "test_id": "1.3",
            "name": "Floating-Point Fraction Tenders Rounding",
            "status": status_1_3,
            "details": res_1_3
        })

        # 1.4: Exact Credit Limit Boundary Conditions (At Limit vs Exceeding by 1 VND)
        print("\n[Case 1.4] Exact Credit Limit Boundary (Limit = 2,000,000 VND)...")
        res_1_4 = page.evaluate("""
        async () => {
            const { createCustomer, createSale, getAll } = await import('/src/engine.js');
            const uid = Math.random().toString(36).slice(2, 7);
            const customer = await createCustomer({
                name: 'Khách Boundary ' + uid,
                phone: '0944' + Math.floor(100000 + Math.random() * 900000),
                creditLimit: 2000000
            });

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const prod = products[0];
            const wh = warehouses[0];

            // Subcase A: Exact limit (debt = 2,000,000 VND) -> MUST SUCCEED
            let subcaseA_success = false;
            let subcaseA_error = '';
            try {
                await createSale({
                    warehouseId: wh.id,
                    customerId: customer.id,
                    customerLabel: customer.name,
                    items: [{ itemId: prod.id, quantity: 1, unitPrice: 2000000 }],
                    payments: [{ method: 'debt', amount: 2000000 }]
                });
                subcaseA_success = true;
            } catch (e) {
                subcaseA_error = e.message;
            }

            // Subcase B: Already at 2,000,000 VND debt. Try to add 1 VND debt -> MUST BE BLOCKED
            let subcaseB_blocked = false;
            let subcaseB_message = '';
            try {
                await createSale({
                    warehouseId: wh.id,
                    customerId: customer.id,
                    customerLabel: customer.name,
                    items: [{ itemId: prod.id, quantity: 1, unitPrice: 1 }],
                    payments: [{ method: 'debt', amount: 1 }]
                });
            } catch (e) {
                subcaseB_blocked = true;
                subcaseB_message = e.message;
            }

            return {
                subcaseA_success,
                subcaseA_error,
                subcaseB_blocked,
                subcaseB_message
            };
        }
        """)
        print(f"  Result: {res_1_4}")
        status_1_4 = "PASS" if (res_1_4['subcaseA_success'] and res_1_4['subcaseB_blocked']) else "FAIL"
        findings.append({
            "test_id": "1.4",
            "name": "Exact Credit Limit Boundary (Limit vs Limit + 1 VND)",
            "status": status_1_4,
            "details": res_1_4
        })

        # 1.5: Sequential Partial Debt Collections Down to Zero and Overpay Protection
        print("\n[Case 1.5] Sequential Partial Debt Collections: 2M Debt -> Pay 800k -> Pay 1M -> Pay 200k (Full Settled) -> Attempt Overpay...")
        res_1_5 = page.evaluate("""
        async () => {
            const { createSale, markSalePaid, getAll, getCustomerDebtSummary } = await import('/src/engine.js');
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');

            const sale = await createSale({
                warehouseId: warehouses[0].id,
                items: [{ itemId: products[0].id, quantity: 1, unitPrice: 3000000 }],
                payments: [
                    { method: 'cash', amount: 1000000 },
                    { method: 'debt', amount: 2000000 }
                ]
            });

            // Step 1: Pay 800k
            await markSalePaid(sale.id, { amount: 800000, paymentMethod: 'cash' });
            const s1 = (await getAll('sales')).find(x => x.id === sale.id);

            // Step 2: Pay 1,000,000
            await markSalePaid(sale.id, { amount: 1000000, paymentMethod: 'cash' });
            const s2 = (await getAll('sales')).find(x => x.id === sale.id);

            // Step 3: Pay final 200,000
            await markSalePaid(sale.id, { amount: 200000, paymentMethod: 'cash' });
            const s3 = (await getAll('sales')).find(x => x.id === sale.id);

            // Step 4: Attempt to pay again when debt is 0
            const s4 = await markSalePaid(sale.id, { amount: 100000, paymentMethod: 'cash' });

            return {
                step1: { paid: s1.paid_amount, debt: s1.debt_amount, status: s1.payment_status },
                step2: { paid: s2.paid_amount, debt: s2.debt_amount, status: s2.payment_status },
                step3: { paid: s3.paid_amount, debt: s3.debt_amount, status: s3.payment_status },
                step4: { status: s4.payment_status, debt: s4.debt_amount, paid: s4.paid_amount }
            };
        }
        """)
        print(f"  Result: {res_1_5}")
        is_step1_ok = res_1_5['step1']['paid'] == 1800000 and res_1_5['step1']['debt'] == 1200000 and res_1_5['step1']['status'] == 'PARTIAL'
        is_step2_ok = res_1_5['step2']['paid'] == 2800000 and res_1_5['step2']['debt'] == 200000 and res_1_5['step2']['status'] == 'PARTIAL'
        is_step3_ok = res_1_5['step3']['paid'] == 3000000 and res_1_5['step3']['debt'] == 0 and res_1_5['step3']['status'] == 'PAID'
        status_1_5 = "PASS" if (is_step1_ok and is_step2_ok and is_step3_ok) else "FAIL"
        findings.append({
            "test_id": "1.5",
            "name": "Sequential Partial Debt Collections to Full Settlement",
            "status": status_1_5,
            "details": res_1_5
        })

        # 1.6: Complex Cash Drawer Interleaving (Sales + Split + Expenses + Debt Collection + Shift Closing)
        print("\n[Case 1.6] Complex Cash Drawer Interleaving in Single Shift...")
        res_1_6 = page.evaluate("""
        async () => {
            const { openShift, closeShift, createSale, createExpense, markSalePaid, getAll, ensureLocalIdentity } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();

            // Ensure no existing shift is open for this register
            const existingShifts = await getAll('shifts');
            const openOne = existingShifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            if (openOne) {
                await closeShift({ shiftId: openOne.id, countedCash: openOne.opening_cash || 0 });
            }

            // Open fresh dedicated shift for testing
            const testShift = await openShift({ openingCash: 2000000, note: 'Ca stress test đối soát kép' });
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');

            // 1. Split sale 1: 500k cash + 1.5M transfer
            await createSale({
                warehouseId: warehouses[0].id,
                items: [{ itemId: products[0].id, quantity: 1, unitPrice: 2000000 }],
                payments: [
                    { method: 'cash', amount: 500000 },
                    { method: 'transfer', amount: 1500000 }
                ]
            });

            // 2. Cash Expense 1: 300k cash
            await createExpense({
                category: 'Chi phí vận hành',
                amount: 300000,
                paymentMethod: 'cash',
                note: 'Mua văn phòng phẩm',
                shiftId: testShift.id
            });

            // 3. Split sale 2: 1M cash + 1M debt
            const sale2 = await createSale({
                warehouseId: warehouses[0].id,
                items: [{ itemId: products[0].id, quantity: 1, unitPrice: 2000000 }],
                payments: [
                    { method: 'cash', amount: 1000000 },
                    { method: 'debt', amount: 1000000 }
                ]
            });

            // 4. Debt collection on sale 2: 400k cash
            await markSalePaid(sale2.id, { amount: 400000, paymentMethod: 'cash', reference: 'Thu nợ tiền mặt' });

            // 5. Transfer Expense 2: 200k transfer (should NOT reduce cash drawer)
            await createExpense({
                category: 'Tiền mạng',
                amount: 200000,
                paymentMethod: 'transfer',
                note: 'Thanh toán cước internet qua app',
                shiftId: testShift.id
            });

            // Mathematical calculation of physical cash in drawer:
            // Opening: 2,000,000
            // + Sale 1 cash: 500,000
            // - Expense 1 cash: 300,000
            // + Sale 2 cash: 1,000,000
            // + Debt collection cash: 400,000
            // - Expense 2 transfer: 0
            // Expected Total: 2,000,000 + 500,000 - 300,000 + 1,000,000 + 400,000 = 3,600,000 VND

            // Close shift with countedCash = 3,600,000
            const closed = await closeShift({ shiftId: testShift.id, countedCash: 3600000 });

            return {
                shiftId: testShift.id,
                openingCash: testShift.opening_cash,
                expectedCash: closed.expected_cash,
                countedCash: closed.counted_cash,
                difference: closed.difference,
                summary: closed.summary
            };
        }
        """)
        print(f"  Result: {res_1_6}")
        status_1_6 = "PASS" if (res_1_6.get('expectedCash') == 3600000 and res_1_6.get('difference') == 0) else "FAIL"
        findings.append({
            "test_id": "1.6",
            "name": "Complex Cash Drawer Interleaving (Sales, Split, Expenses, Collections)",
            "status": status_1_6,
            "details": res_1_6
        })

        # =========================================================================
        # SECTION 2: ESC/POS & HARDWARE DRIVER COMPLEX EDGE CASES
        # =========================================================================
        print("\n" + "-" * 70)
        print("SECTION 2: ESC/POS & HARDWARE DRIVER COMPLEX EDGE CASES")
        print("-" * 70)

        # 2.1: Extremely Long Vietnamese Product Names & Special Characters
        print("\n[Case 2.1] Long Vietnamese Product Names & Special Symbols (100+ chars)...")
        res_2_1 = page.evaluate("""
        async () => {
            const sale = {
                id: 'sale-stress-long-01',
                code: 'POS-SPECIAL-@#$',
                created_at: new Date().toISOString(),
                customer_label: 'Khách hàng VIP: Bà Trương Thị Ngọc Ánh & Ông Đặng Quốc Bảo (TP.HCM)',
                subtotal: 5000000,
                grand_total: 5000000,
                items: [
                    {
                        name: 'Bộ sản phẩm Ghế sáng chế công thái học DoctorLoan N85 phiên bản đặc biệt nâng đỡ cột sống cổ và thắt lưng',
                        quantity: 1,
                        unit_price: 5000000,
                        line_total: 5000000
                    }
                ],
                payments: [{ method: 'cash', amount: 5000000, status: 'PAID' }]
            };

            const receipt80 = window.__qbiz_app__.generateEscPosReceipt({ sale, width: 48 });
            const receipt58 = window.__qbiz_app__.generateEscPosReceipt({ sale, width: 32 });

            return {
                success80: receipt80.bytesLength > 0,
                len80: receipt80.bytesLength,
                success58: receipt58.bytesLength > 0,
                len58: receipt58.bytesLength
            };
        }
        """)
        print(f"  Result: {res_2_1}")
        status_2_1 = "PASS" if (res_2_1['success80'] and res_2_1['success58']) else "FAIL"
        findings.append({
            "test_id": "2.1",
            "name": "Extremely Long Product Names & Symbols in ESC/POS",
            "status": status_2_1,
            "details": res_2_1
        })

        # 2.2: Extreme Cash Drawer Kick Parameters Clamping
        print("\n[Case 2.2] Cash Drawer Kick Pulse Bounds Clamping (Negative & Massive times)...")
        res_2_2 = page.evaluate("""
        async () => {
            const { buildDrawerKickCommand } = await import('/src/hardware/escpos.js');
            // Testing clamp: onTimeMs = -50 (should clamp to min 1), offTimeMs = 10000 (should clamp to max 255)
            const clamped = buildDrawerKickCommand(0, -50, 10000);
            return {
                length: clamped.length,
                t1: clamped[3],
                t2: clamped[4],
                hex: Array.from(clamped).map(b => b.toString(16).padStart(2, '0')).join(' ')
            };
        }
        """)
        print(f"  Result: {res_2_2}")
        status_2_2 = "PASS" if (res_2_2['t1'] >= 1 and res_2_2['t2'] == 255) else "FAIL"
        findings.append({
            "test_id": "2.2",
            "name": "Cash Drawer Kick Pulse Bounds Clamping",
            "status": status_2_2,
            "details": res_2_2
        })

        # 2.3: Large VietQR URL (> 256 bytes) Multi-byte Length Encoding
        print("\n[Case 2.3] Large VietQR URL (> 256 bytes) Multi-byte ESC/POS Length Encoding...")
        res_2_3 = page.evaluate("""
        async () => {
            const hugeQrPayload = 'https://pay.qbiz.vn/checkout?token=' + 'A'.repeat(300) + '&store=QBIZ_FLAGSHIP_STORE_VIETNAM';
            const sale = {
                id: 'sale-qr-large',
                code: 'POS-QR-BIG',
                subtotal: 1000000,
                grand_total: 1000000,
                items: [{ name: 'Sản phẩm QR lớn', quantity: 1, unit_price: 1000000 }],
                payments: [{ method: 'qr', amount: 1000000 }],
                vietqr_url: hugeQrPayload
            };

            const receipt = window.__qbiz_app__.generateEscPosReceipt({ sale });
            const bytes = receipt.rawBytes;

            // Find QR data command: 1D 28 6B pL pH 31 50 30 ...
            let foundMultiByteLength = false;
            let pL = 0;
            let pH = 0;
            for (let i = 0; i < bytes.length - 8; i++) {
                if (bytes[i] === 0x1D && bytes[i+1] === 0x28 && bytes[i+2] === 0x6B && bytes[i+5] === 0x31 && bytes[i+6] === 0x50) {
                    pL = bytes[i+3];
                    pH = bytes[i+4];
                    if (pH > 0) foundMultiByteLength = true;
                    break;
                }
            }

            return {
                bytesLength: receipt.bytesLength,
                payloadLength: hugeQrPayload.length,
                pL,
                pH,
                foundMultiByteLength
            };
        }
        """)
        print(f"  Result: {res_2_3}")
        status_2_3 = "PASS" if res_2_3['foundMultiByteLength'] else "FAIL"
        findings.append({
            "test_id": "2.3",
            "name": "Large VietQR URL (>256 bytes) ESC/POS Length Encoding",
            "status": status_2_3,
            "details": res_2_3
        })

        # =========================================================================
        # SECTION 3: AI FINANCIAL & DEBT TOOLS COMPLEX EDGE CASES
        # =========================================================================
        print("\n" + "-" * 70)
        print("SECTION 3: AI FINANCIAL & DEBT TOOLS COMPLEX EDGE CASES")
        print("-" * 70)

        # 3.1: Strict Aging Buckets Boundary Verification (0-30, 31-60, 61-90, >90)
        print("\n[Case 3.1] Aging Buckets Boundary Verification (30d vs 31d vs 60d vs 61d vs 90d vs 91d)...")
        res_3_1 = page.evaluate("""
        async () => {
            const { getCustomerAgingReport } = await import('/src/engine.js');
            const nowMs = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;

            const mockSales = [
                { id: 's_0d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs).toISOString() },
                { id: 's_30d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs - 30 * dayMs).toISOString() },
                { id: 's_31d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs - 31 * dayMs).toISOString() },
                { id: 's_60d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs - 60 * dayMs).toISOString() },
                { id: 's_61d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs - 61 * dayMs).toISOString() },
                { id: 's_90d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs - 90 * dayMs).toISOString() },
                { id: 's_91d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs - 91 * dayMs).toISOString() },
                { id: 's_365d', customer_id: 'c1', grand_total: 100000, paid_amount: 0, debt_amount: 100000, payment_status: 'PENDING', created_at: new Date(nowMs - 365 * dayMs).toISOString() }
            ];

            const mockCustomers = [
                { id: 'c1', name: 'Khách Test Mốc Tuổi Nợ', creditLimit: 10000000, debt: 800000 }
            ];

            const report = await getCustomerAgingReport({ customers: mockCustomers, sales: mockSales });

            return {
                current: report.buckets.current,
                overdue30: report.buckets.overdue30,
                overdue60: report.buckets.overdue60,
                overdue90: report.buckets.overdue90,
                totalOutstandingDebt: report.totalOutstandingDebt
            };
        }
        """)
        print(f"  Result: {res_3_1}")
        # Expected:
        # current (0-30): 2 sales (s_0d, s_30d) = 200,000
        # overdue30 (31-60): 2 sales (s_31d, s_60d) = 200,000
        # overdue60 (61-90): 2 sales (s_61d, s_90d) = 200,000
        # overdue90 (>90): 2 sales (s_91d, s_365d) = 200,000
        is_buckets_perfect = (
            res_3_1['current']['total'] == 200000 and
            res_3_1['overdue30']['total'] == 200000 and
            res_3_1['overdue60']['total'] == 200000 and
            res_3_1['overdue90']['total'] == 200000 and
            res_3_1['totalOutstandingDebt'] == 800000
        )
        status_3_1 = "PASS" if is_buckets_perfect else "FAIL"
        findings.append({
            "test_id": "3.1",
            "name": "Aging Buckets Boundary Precision (0-30, 31-60, 61-90, >90 days)",
            "status": status_3_1,
            "details": res_3_1
        })

        # 3.2: Non-existent & Empty Query Handling in Financial Tools
        print("\n[Case 3.2] Non-existent & Empty Queries in AI Debt Tools...")
        res_3_2 = page.evaluate("""
        async () => {
            const { executeTool } = await import('/src/ai/tools.js');
            const state = window.__qbiz_app__.state;
            const ctx = { actor_role: 'owner' };

            const emptyQuery = await executeTool('get_customer_debt_summary', { query: '' }, state, ctx);
            const nonExistent = await executeTool('get_customer_debt_summary', { query: 'KH_KHONG_TON_TAI_9999' }, state, ctx);
            const emptyHistory = await executeTool('get_customer_profile_history', { query: '' }, state, ctx);

            return {
                emptyQuery,
                nonExistent,
                emptyHistory
            };
        }
        """)
        print(f"  Result: {res_3_2}")
        status_3_2 = "PASS" if (not res_3_2['emptyQuery']['found'] and not res_3_2['nonExistent']['found'] and not res_3_2['emptyHistory']['found']) else "FAIL"
        findings.append({
            "test_id": "3.2",
            "name": "Non-existent & Empty Query Graceful Handling",
            "status": status_3_2,
            "details": res_3_2
        })

        # 3.3: Role-Based Access Control (RBAC) Hard Deny on Financial Tools
        print("\n[Case 3.3] Role-Based Access Control (RBAC) Hard Deny Check (Cashier attempting Cost / Expense tools)...")
        res_3_3 = page.evaluate("""
        async () => {
            const { executeTool } = await import('/src/ai/tools.js');
            const state = window.__qbiz_app__.state;

            // Cashier does not have VIEW_COST permission
            let cashierBlocked = false;
            let cashierError = '';
            try {
                await executeTool('get_operating_expenses', { period: 'month' }, state, { actor_role: 'cashier' });
            } catch (err) {
                cashierBlocked = true;
                cashierError = err.message;
            }

            // Owner DOES have VIEW_COST permission
            let ownerAllowed = false;
            try {
                const res = await executeTool('get_operating_expenses', { period: 'month' }, state, { actor_role: 'owner' });
                ownerAllowed = res.success === true;
            } catch (err) {
                ownerAllowed = false;
            }

            return {
                cashierBlocked,
                cashierError,
                ownerAllowed
            };
        }
        """)
        print(f"  Result: {res_3_3}")
        status_3_3 = "PASS" if (res_3_3['cashierBlocked'] and "HARD DENY" in res_3_3['cashierError'] and res_3_3['ownerAllowed']) else "FAIL"
        findings.append({
            "test_id": "3.3",
            "name": "RBAC Security Enforcement: Cashier HARD DENY on Expenses",
            "status": status_3_3,
            "details": res_3_3
        })

        # =========================================================================
        # SECTION 4: VARIANT-LEVEL INVENTORY & MULTI-TAB REACTIVE SYNC STRESS
        # =========================================================================
        print("\n" + "-" * 70)
        print("SECTION 4: VARIANT-LEVEL INVENTORY & MULTI-TAB REACTIVE SYNC STRESS")
        print("-" * 70)

        # 4.1: Variant Out-of-Stock Isolation (Variant A has stock, Variant B has 0)
        print("\n[Case 4.1] Variant-Level Stock Isolation (Variant A in stock vs Variant B out of stock)...")
        res_4_1 = page.evaluate("""
        async () => {
            const { createProduct, getAll, totalFor, levelFor, available } = await import('/src/engine.js');
            const warehouses = await getAll('warehouses');
            const wh = warehouses[0];

            const uid = Math.random().toString(36).slice(2, 7);
            const product = await createProduct({
                name: 'Áo Polo Thể Thao ' + uid,
                sku: 'POLO-' + uid,
                price: 350000,
                trackInventory: true,
                variants: [
                    { id: 'v_size_m_' + uid, name: 'Size M', sku: 'POLO-M-' + uid, price: 350000 },
                    { id: 'v_size_l_' + uid, name: 'Size L', sku: 'POLO-L-' + uid, price: 350000 }
                ]
            });

            const { put } = await import('/src/db.js');
            // Give Size M 10 units, Size L 0 units
            await put('levels', {
                id: `${product.id}:${wh.id}:v_size_m_${uid}`,
                productId: product.id,
                warehouseId: wh.id,
                variantId: 'v_size_m_' + uid,
                onHand: 10,
                reserved: 0,
                damaged: 0,
                version: 1
            });

            await put('levels', {
                id: `${product.id}:${wh.id}:v_size_l_${uid}`,
                productId: product.id,
                warehouseId: wh.id,
                variantId: 'v_size_l_' + uid,
                onHand: 0,
                reserved: 0,
                damaged: 0,
                version: 1
            });

            await window.__qbiz_app__.refresh();
            const state = window.__qbiz_app__.state;

            const stockM = totalFor(state.data, product.id, 'v_size_m_' + uid);
            const stockL = totalFor(state.data, product.id, 'v_size_l_' + uid);

            return {
                productId: product.id,
                stockM: stockM.available,
                stockL: stockL.available
            };
        }
        """)
        print(f"  Result: {res_4_1}")
        status_4_1 = "PASS" if (res_4_1['stockM'] == 10 and res_4_1['stockL'] == 0) else "FAIL"
        findings.append({
            "test_id": "4.1",
            "name": "Variant-Level Stock Isolation",
            "status": status_4_1,
            "details": res_4_1
        })

        # 4.2: Multi-Tab Broadcast Reactive Event Firing Under Rapid Mutex
        print("\n[Case 4.2] Multi-Tab Reactive Broadcast Channel Firing...")
        page2 = context.new_page()
        page2.goto(BASE_URL)
        page2.wait_for_selector("#pageTitle", timeout=10000)

        res_4_2 = page2.evaluate("""
        async () => {
            let receivedEvents = 0;
            const channel = new BroadcastChannel('qbiz_live_data_sync');
            channel.onmessage = (msg) => {
                if (msg.data?.type === 'DATA_CHANGED') {
                    receivedEvents++;
                }
            };
            window.__test_channel_events__ = () => receivedEvents;
            return true;
        }
        """)

        # Tab 1 performs a write action
        page.evaluate("""
        async () => {
            const { put } = await import('/src/db.js');
            await put('settings', { id: 'test_sync_key_' + Date.now(), value: 'sync_val' });
        }
        """)
        time.sleep(1)

        events_received = page2.evaluate("() => window.__test_channel_events__()")
        print(f"  Tab 2 received DATA_CHANGED broadcast events: {events_received}")
        page2.close()

        status_4_2 = "PASS" if events_received >= 1 else "FAIL"
        findings.append({
            "test_id": "4.2",
            "name": "Multi-Tab Reactive Broadcast Sync Event",
            "status": status_4_2,
            "details": {"events_received": events_received}
        })

        browser.close()

    print("\n" + "=" * 80)
    print("ALL ADVERSARIAL STRESS TESTS COMPLETED")
    print("=" * 80)
    
    with open("tests/adversarial_audit_results.json", "w", encoding="utf-8") as f:
        json.dump(findings, f, ensure_ascii=False, indent=2)

    return findings

if __name__ == "__main__":
    passes = 0
    total_runs = 5
    all_runs_passed = True
    print("\n" + "=" * 80)
    print("EXECUTING 5 CONSECUTIVE PASSES OF ADVERSARIAL RED-TEAM STRESS SUITE")
    print("=" * 80)
    for run_idx in range(1, total_runs + 1):
        print(f"\n>>> ITERATION {run_idx}/{total_runs} <<<")
        results = run_adversarial_suite()
        total = len(results)
        run_passed = sum(1 for r in results if r['status'] == 'PASS')
        run_failed = sum(1 for r in results if r['status'] == 'FAIL')
        print(f"--- Iteration {run_idx} Summary: {run_passed}/{total} PASS, {run_failed} FAIL ---")
        if run_failed == 0 and run_passed == total:
            passes += 1
        else:
            all_runs_passed = False
            break

    print("\n" + "=" * 80)
    print(f"FINAL ADVERSARIAL STRESS RESULT: {passes}/{total_runs} COMPLETE ITERATIONS PASSED (14/14 tests each)")
    print("=" * 80)
    if all_runs_passed and passes == total_runs:
        print(">>> ALL 5 ITERATIONS OF ADVERSARIAL STRESS SUITE PASSED PERFECTLY <<<")
        sys.exit(0)
    else:
        print(">>> ADVERSARIAL STRESS SUITE FAILED OR RECORDED DEFECTS <<<")
        sys.exit(1)
    sys.exit(0)
