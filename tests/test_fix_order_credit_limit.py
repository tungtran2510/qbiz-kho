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

def test_order_credit_limit():
    print("===========================================================================")
    print("TEST: ORDER CREDIT LIMIT ENFORCEMENT ACROSS UNPAID ORDERS")
    print("===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        res = page.evaluate("""
        async () => {
            const { createProduct, createOrder, markOrderPaid, getAll } = await import('/src/engine.js');
            const { put } = await import('/src/db.js');
            const warehouses = await getAll('warehouses');
            const whId = warehouses[0]?.id || 'wh_default';

            const custId = 'cust_credit_order_' + Date.now();
            const cust = {
                id: custId,
                name: 'Công ty TNHH Hạn Mức Đơn',
                phone: '0912345678',
                debt: 0,
                creditLimit: 2000000,
                credit_limit: 2000000,
                active: true
            };
            await put('customers', cust);

            const prodId = 'prod_credit_' + Date.now();
            const prod = await createProduct({
                id: prodId,
                name: 'Sản phẩm Test Đơn',
                sku: 'SP-DO-' + Date.now().toString().slice(-4),
                price: 100000,
                warehouse_id: whId
            });

            // 1. Create Order 1 for 1,200,000 VND (12 units) -> should succeed
            const order1 = await createOrder({
                items: [{ itemId: prod.id, quantity: 12, unitPrice: 100000 }],
                warehouseId: whId,
                customerId: custId,
                customerLabel: cust.name
            });

            // 2. Try to create Order 2 for 1,000,000 VND (10 units) -> should fail (1.2M + 1.0M = 2.2M > 2.0M limit)
            let order2Blocked = false;
            let order2Error = '';
            try {
                await createOrder({
                    items: [{ itemId: prod.id, quantity: 10, unitPrice: 100000 }],
                    warehouseId: whId,
                    customerId: custId,
                    customerLabel: cust.name
                });
            } catch (err) {
                order2Blocked = true;
                order2Error = err.message;
            }

            // 3. Create Order 2 with overrideCreditLimit = true -> should succeed
            const order2Overridden = await createOrder({
                items: [{ itemId: prod.id, quantity: 10, unitPrice: 100000 }],
                warehouseId: whId,
                customerId: custId,
                customerLabel: cust.name,
                overrideCreditLimit: true
            });

            // 4. Mark Order 1 as PAID -> releases 1.2M from credit exposure
            await markOrderPaid(order1.id, { paymentMethod: 'transfer' });

            return {
                order1Code: order1.code,
                order1GrandTotal: order1.grand_total,
                order2Blocked,
                order2Error,
                order2OverriddenCode: order2Overridden.code
            };
        }
        """)

        print(f"  Order 1 Created: {res['order1Code']} | Total: {res['order1GrandTotal']:,} VND")
        print(f"  Order 2 Blocked: {res['order2Blocked']} | Reason: {res['order2Error']}")
        print(f"  Order 2 with Override: {res['order2OverriddenCode']} | Succeeded!")

        assert res['order1GrandTotal'] == 1200000
        assert res['order2Blocked'] == True, "Order 2 must be blocked by credit limit"
        assert "vượt quá hạn mức công nợ cho phép" in res['order2Error'], f"Unexpected error message: {res['order2Error']}"
        assert res['order2OverriddenCode'], "Order 2 with override must succeed"

        print("\nAll order credit limit enforcement tests passed successfully!")
        browser.close()

if __name__ == '__main__':
    test_order_credit_limit()
