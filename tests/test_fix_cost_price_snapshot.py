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

def test_cost_price_snapshot():
    print("===========================================================================")
    print("TEST: HISTORICAL COST_PRICE SNAPSHOT & PROFIT INTEGRITY")
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
                await openShift({ openingCash: 2000000, note: 'Ca test Cost Price' });
            }
        }
        """)

        # TEST 1: Create Sale with initial cost price = 40,000 VND
        print("\n[TEST 1] Creating product with cost_price = 40,000 VND, price = 100,000 VND...")
        res1 = page.evaluate("""
        async () => {
            const { createProduct, receive, createSale, createOrder, calculateSalesMetrics, getAll } = await import('/src/engine.js');
            const { put } = await import('/src/db.js');
            const warehouses = await getAll('warehouses');
            const whId = warehouses[0]?.id || 'wh_default';

            const prodId = 'prod_cost_test_' + Date.now();
            const prod = await createProduct({
                id: prodId,
                name: 'Sản phẩm Test Giá Vốn',
                sku: 'SP-GV-' + Date.now().toString().slice(-4),
                price: 100000,
                cost_price: 40000,
                purchase_price: 40000,
                warehouse_id: whId
            });

            await receive({
                productId: prod.id,
                warehouseId: whId,
                qty: 50,
                unitCost: 40000,
                reason: 'Nhập hàng đầu kỳ'
            });

            // 1. Create Sale of 2 units
            const sale = await createSale({
                items: [{ itemId: prod.id, quantity: 2, unitPrice: 100000 }],
                warehouseId: whId,
                payments: [{ method: 'cash', amount: 200000, status: 'PAID' }]
            });

            // Verify item in sale has cost_price snapshotted
            const snapCost = sale.items[0].cost_price;

            // 2. Later: Product purchase_price is updated to 80,000 VND
            prod.purchase_price = 80000;
            prod.cost_price = 80000;
            await put('products', prod);

            // 3. Calculate metrics for today
            const allSales = await getAll('sales');
            const allProducts = await getAll('products');

            // Find this specific sale metrics
            const relevantSale = allSales.find(s => s.id === sale.id);
            const metrics = calculateSalesMetrics({
                sales: [relevantSale],
                orders: [],
                refunds: [],
                expenses: [],
                products: allProducts,
                range: 'today'
            });

            // 4. Create Order and verify snapshot
            const order = await createOrder({
                items: [{ itemId: prod.id, quantity: 3, unitPrice: 100000 }],
                warehouseId: whId
            });
            const orderSnapCost = order.items[0].cost_price;

            return {
                saleSnapCost: snapCost,
                orderSnapCost: orderSnapCost,
                metricsCostTotal: metrics.cost,
                metricsGrossProfit: metrics.grossProfit
            };
        }
        """)

        print(f"  Sale Snapshotted Cost: {res1['saleSnapCost']:,} VND")
        print(f"  Order Snapshotted Cost (at new cost 80k): {res1['orderSnapCost']:,} VND")
        print(f"  Metrics Total Cost for 2 items: {res1['metricsCostTotal']:,} VND (Expected 80,000 VND, NOT 160,000 VND)")
        print(f"  Metrics Gross Profit: {res1['metricsGrossProfit']:,} VND (Expected 120,000 VND)")

        assert res1['saleSnapCost'] == 40000, f"Sale cost_price must be 40000, got {res1['saleSnapCost']}"
        assert res1['orderSnapCost'] == 80000, f"Order cost_price must be 80000, got {res1['orderSnapCost']}"
        assert res1['metricsCostTotal'] == 80000, f"Historical cost must remain 80,000 (40k * 2), got {res1['metricsCostTotal']}"
        assert res1['metricsGrossProfit'] == 120000, f"Gross profit must be 120,000, got {res1['metricsGrossProfit']}"

        print("\nAll historical cost price snapshot assertions passed successfully!")
        browser.close()

if __name__ == '__main__':
    test_cost_price_snapshot()
