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

def test_pos_quick_shift():
    print("===========================================================================")
    print("TEST: POS QUICK SHIFT OPENING & OPTIONAL SHIFT")
    print("===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # Step 1: Close all open shifts so state has NO open shift
        print("\n[STEP 1] Closing any existing open shift...")
        page.evaluate("""
        async () => {
            const { getAll, closeShift, ensureLocalIdentity } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            for (const s of shifts) {
                if (s.status === 'OPEN' && s.device_id === identity.device_id && s.register_id === identity.register_id) {
                    try {
                        await closeShift(s.id, { actualCash: s.opening_cash || 0, note: 'Close for test' });
                    } catch (e) {}
                }
            }
            if (window.__qbiz_app__) {
                await window.__qbiz_app__.refresh();
            }
        }
        """)
        time.sleep(1)

        # Step 2: Navigate to POS (Bán hàng)
        print("\n[STEP 2] Navigating to POS and adding product to cart...")
        page.evaluate("""
        () => {
            window.__qbiz_app__.navigate('sales');
        }
        """)
        time.sleep(1)

        # Add first product to cart
        page.evaluate("""
        () => {
            const p = window.__qbiz_app__.state.data.products.find(x => x.price > 0);
            if (p) {
                window.__qbiz_app__.addSaleItem(p.id);
            }
        }
        """)
        time.sleep(1)

        # Step 3: Trigger payment when no shift is open
        print("\n[STEP 3] Triggering checkout with no shift open...")
        page.evaluate("""
        () => {
            window.__qbiz_app__.submitSale();
        }
        """)
        time.sleep(1)

        # Verify quick shift modal popped up
        modal_title = page.evaluate("() => document.querySelector('#modalRoot h3')?.textContent || ''")
        print(f"  Modal Title: {modal_title}")
        assert "Mở ca bán hàng nhanh" in modal_title, f"Expected quick shift modal, got: {modal_title}"

        # Step 4: Submit modal with 500,000 opening cash
        print("\n[STEP 4] Submitting quick shift with 500,000 VND...")
        page.evaluate("""
        () => {
            const cashInput = document.querySelector('#posQuickOpeningCash');
            if (cashInput) cashInput.value = 500000;
            const submitBtn = document.querySelector('#modalSubmit');
            if (submitBtn) submitBtn.click();
        }
        """)
        time.sleep(2)

        # Verify shift is now OPEN and payment completed
        active_shift = page.evaluate("""
        async () => {
            const { currentShift } = await import('/src/engine.js');
            const s = await currentShift();
            return s ? { id: s.id, status: s.status, openingCash: s.opening_cash } : null;
        }
        """)
        print(f"  Active Shift: {active_shift}")
        assert active_shift is not None, "Active shift must exist"
        assert active_shift['status'] == 'OPEN'
        assert active_shift['openingCash'] == 500000

        # Step 5: Test CONFIG.FEATURE_FLAGS.shift = false allows sale without shift
        print("\n[STEP 5] Testing optional shift when FEATURE_FLAGS.shift = false...")
        res_opt = page.evaluate("""
        async () => {
            const { createSale, closeShift, getAll } = await import('/src/engine.js');
            const { CONFIG } = await import('/src/config.js');
            
            // Close current shift
            const shifts = await getAll('shifts');
            const openS = shifts.find(s => s.status === 'OPEN');
            if (openS) {
                await closeShift({ shiftId: openS.id, countedCash: openS.opening_cash || 0 });
            }

            // Temporarily disable shift requirement
            const oldFlag = CONFIG.FEATURE_FLAGS.shift;
            CONFIG.FEATURE_FLAGS.shift = false;

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const p = products.find(x => x.price > 0 && x.trackInventory !== false);
            const wh = warehouses[0]?.id || 'wh_default';

            let saleSuccess = false;
            let saleObj = null;
            let errMessage = '';
            try {
                saleObj = await createSale({
                    items: [{ itemId: p.id, quantity: 1, unitPrice: p.price }],
                    warehouseId: wh,
                    payments: [{ method: 'cash', amount: p.price, status: 'PAID' }]
                });
                saleSuccess = true;
            } catch (e) {
                saleSuccess = false;
                errMessage = e.message;
            } finally {
                CONFIG.FEATURE_FLAGS.shift = oldFlag;
            }

            return { saleSuccess, saleCode: saleObj?.code, shiftId: saleObj?.shift_id, errMessage };
        }
        """)
        print(f"  Optional Shift Sale: Success={res_opt['saleSuccess']}, Code={res_opt['saleCode']}, ShiftId={res_opt['shiftId']}, Error={res_opt.get('errMessage')}")
        assert res_opt['saleSuccess'] == True, "Sale must succeed when shift feature flag is disabled"

        print("\nAll POS quick shift and optional shift tests passed successfully!")
        browser.close()

if __name__ == '__main__':
    test_pos_quick_shift()
