# -*- coding: utf-8 -*-
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4180"

def test_debt_refund():
    print("===========================================================================")
    print("TEST: DEBT REFUND LOGIC & CASH DRAWER PROTECTION")
    print("===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # Step 0: Ensure Open Shift
        page.evaluate("""
        async () => {
            const { openShift, ensureLocalIdentity, getAll } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            let cur = shifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            if (!cur) {
                await openShift({ openingCash: 2000000, note: 'Ca test Debt Refund' });
            }
        }
        """)

        # SCENARIO 1: 100% Debt Sale -> Customer returns goods. Even if refundMethod='cash', must NOT drain cash, must reduce debt!
        print("\n[SCENARIO 1] 100% Debt Sale -> Return with refundMethod='cash'")
        res1 = page.evaluate("""
        async () => {
            const { createSale, createReturn, getAll } = await import('/src/engine.js');
            const { put } = await import('/src/db.js');
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const whId = warehouses[0]?.id || 'wh_default';
            const p = products.find(x => x.price > 0 && x.trackInventory !== false);

            const custId = 'cust_debt_test_' + Date.now();
            const cust = {
                id: custId,
                name: 'Khách Test Nợ 100%',
                phone: '0901234567',
                debt: 0,
                creditLimit: 5000000,
                credit_limit: 5000000,
                active: true
            };
            await put('customers', cust);

            // Sale of 1,000,000 VND entirely on debt (paid_amount = 0)
            const sale = await createSale({
                items: [{ itemId: p.id, quantity: 2, unitPrice: 500000 }],
                warehouseId: whId,
                customerId: custId,
                customerLabel: cust.name,
                payments: [{ method: 'debt', amount: 1000000, status: 'PENDING', reference: 'Nợ 100%' }]
            });

            // Return 1 item (500,000 VND) with refundMethod: 'cash'
            const ret = await createReturn({
                saleId: sale.id,
                lines: [{ itemId: p.id, quantity: 1, condition: 'SELLABLE' }],
                reason: 'Khách đổi ý trả lại',
                refundMethod: 'cash',
                refundAmount: 500000
            });

            const sales = await getAll('sales');
            const updatedSale = sales.find(s => s.id === sale.id);

            const customers = await getAll('customers');
            const updatedCust = customers.find(c => c.id === custId);

            const refunds = await getAll('refunds');
            const retRefunds = refunds.filter(r => r.return_id === ret.id);
            const cashRefundAmount = retRefunds.filter(r => r.method === 'cash').reduce((sum, r) => sum + Number(r.amount || 0), 0);

            return {
                saleDebt: updatedSale.debt_amount,
                custDebt: updatedCust.debt,
                refundMethod: ret.refund_method,
                cashRefundAmount
            };
        }
        """)

        print(f"  Result 1: Sale Debt = {res1['saleDebt']}, Cust Debt = {res1['custDebt']}, Refund Method = {res1['refundMethod']}, Cash Refunded = {res1['cashRefundAmount']}")
        assert res1['saleDebt'] == 500000, f"Expected sale debt 500,000, got {res1['saleDebt']}"
        assert res1['custDebt'] == 500000, f"Expected cust debt 500,000, got {res1['custDebt']}"
        assert res1['cashRefundAmount'] == 0, f"Cash refund must be 0 for unpaid debt sale, got {res1['cashRefundAmount']}"

        # SCENARIO 2: Split Sale (300k cash + 700k debt) -> Return 800k.
        # Should clear 700k debt, and refund remaining 100k in cash (since 300k was paid).
        print("\n[SCENARIO 2] Split Sale (300k cash + 700k debt) -> Return 800k with refundMethod='cash'")
        res2 = page.evaluate("""
        async () => {
            const { createSale, createReturn, getAll } = await import('/src/engine.js');
            const { put } = await import('/src/db.js');
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const whId = warehouses[0]?.id || 'wh_default';
            const p = products.find(x => x.price > 0 && x.trackInventory !== false);

            const custId = 'cust_split_test_' + Date.now();
            const cust = {
                id: custId,
                name: 'Khách Test Split',
                phone: '0901234568',
                debt: 0,
                creditLimit: 5000000,
                credit_limit: 5000000,
                active: true
            };
            await put('customers', cust);

            // Sale of 1,000,000 VND: 300,000 cash + 700,000 debt
            const sale = await createSale({
                items: [{ itemId: p.id, quantity: 10, unitPrice: 100000 }],
                warehouseId: whId,
                customerId: custId,
                customerLabel: cust.name,
                payments: [
                    { method: 'cash', amount: 300000, status: 'PAID' },
                    { method: 'debt', amount: 700000, status: 'PENDING' }
                ]
            });

            // Return 8 items (800,000 VND)
            const ret = await createReturn({
                saleId: sale.id,
                lines: [{ itemId: p.id, quantity: 8, condition: 'SELLABLE' }],
                reason: 'Khách trả 8 món',
                refundMethod: 'cash',
                refundAmount: 800000
            });

            const sales = await getAll('sales');
            const updatedSale = sales.find(s => s.id === sale.id);

            const customers = await getAll('customers');
            const updatedCust = customers.find(c => c.id === custId);

            const refunds = await getAll('refunds');
            const retRefunds = refunds.filter(r => r.return_id === ret.id);
            const cashRefundAmount = retRefunds.filter(r => r.method === 'cash').reduce((sum, r) => sum + Number(r.amount || 0), 0);

            return {
                saleDebt: updatedSale.debt_amount,
                saleStatus: updatedSale.payment_status,
                custDebt: updatedCust.debt,
                cashRefundAmount
            };
        }
        """)

        print(f"  Result 2: Sale Debt = {res2['saleDebt']}, Status = {res2['saleStatus']}, Cust Debt = {res2['custDebt']}, Cash Refunded = {res2['cashRefundAmount']}")
        assert res2['saleDebt'] == 0, f"Expected sale debt 0, got {res2['saleDebt']}"
        assert res2['saleStatus'] == 'PAID', f"Expected sale status PAID, got {res2['saleStatus']}"
        assert res2['custDebt'] == 0, f"Expected cust debt 0, got {res2['custDebt']}"
        assert res2['cashRefundAmount'] == 100000, f"Expected cash refund 100,000, got {res2['cashRefundAmount']}"

        print("\nAll debt refund scenarios passed!")
        browser.close()

if __name__ == '__main__':
    test_debt_refund()
