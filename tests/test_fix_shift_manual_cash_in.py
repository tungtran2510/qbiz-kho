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

def test_shift_manual_cash_in():
    print("===========================================================================")
    print("TEST: SHIFT CASH RECONCILIATION WITH MANUAL CASH-IN (Phiếu thu)")
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
            const { openShift, closeShift, createSale, currentShift, getAll } = await import('/src/engine.js');
            const { getOne, put } = await import('/src/db.js');

            // 1. Ensure any previous shift is closed
            const prev = await currentShift();
            if (prev && prev.status === 'OPEN') {
                await closeShift({ shiftId: prev.id, countedCash: prev.opening_cash || 0 });
            }

            // 2. Open new shift with 1,000,000 VND opening cash
            const shift = await openShift({ openingCash: 1000000, note: 'Ca test Manual Cash-In' });

            // 3. Make a sale with 200,000 VND cash
            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const p = products.find(x => x.price > 0 && x.trackInventory !== false);
            const wh = warehouses[0]?.id || 'wh_default';

            await createSale({
                items: [{ itemId: p.id, quantity: 1, unitPrice: 200000 }],
                warehouseId: wh,
                payments: [{ method: 'cash', amount: 200000, status: 'PAID' }]
            });

            // 4. Record manual cash-in (Phiếu thu tiền mặt) of 300,000 VND
            const settingRow = await getOne('settings', 'module:cash_entries') || { id: 'module:cash_entries', value: [] };
            const currentEntries = Array.isArray(settingRow.value) ? settingRow.value : [];
            currentEntries.push({
                id: 'cs_test_' + Date.now(),
                kind: 'in',
                amount: 300000,
                method: 'Tiền mặt',
                shift_id: shift.id,
                date: new Date().toISOString().slice(0, 10),
                note: 'Chủ nạp thêm tiền lẻ vào két',
                created_at: new Date().toISOString()
            });
            await put('settings', { id: 'module:cash_entries', value: currentEntries });

            // 5. Close shift with exactly 1,500,000 VND counted cash
            // Expected: 1,000,000 (opening) + 200,000 (cash sales) + 300,000 (cash in) = 1,500,000 VND
            const closed = await closeShift({ shiftId: shift.id, countedCash: 1500000 });

            return {
                shiftId: closed.id,
                openingCash: closed.opening_cash,
                cashSales: closed.summary.cash_sales,
                manualCashIn: closed.summary.manual_cash_in,
                expectedCash: closed.expected_cash,
                countedCash: closed.counted_cash,
                difference: closed.difference
            };
        }
        """)

        print(f"  Shift Closed: {res['shiftId']}")
        print(f"  Opening Cash: {res['openingCash']:,} VND")
        print(f"  Cash Sales: {res['cashSales']:,} VND")
        print(f"  Manual Cash In: {res['manualCashIn']:,} VND")
        print(f"  Expected Cash: {res['expectedCash']:,} VND")
        print(f"  Counted Cash: {res['countedCash']:,} VND")
        print(f"  Difference: {res['difference']:,} VND")

        assert res['manualCashIn'] == 300000, f"Expected manual cash in 300,000, got {res['manualCashIn']}"
        assert res['expectedCash'] == 1500000, f"Expected 1,500,000, got {res['expectedCash']}"
        assert res['difference'] == 0, f"Expected difference 0, got {res['difference']}"

        print("\nAll shift manual cash-in reconciliation tests passed successfully!")
        browser.close()

if __name__ == '__main__':
    test_shift_manual_cash_in()
