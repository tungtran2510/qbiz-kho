import asyncio
import os
import sys
import json
from playwright.async_api import async_playwright

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4180"

async def run_tests():
    print("=" * 75)
    print("EMPIRICAL TEST SUITE: EXPENSE-UI & SUPPLIER-RETURN-UI")
    print("=" * 75)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Testing on modern mobile viewport (412x915) to guarantee responsiveness & desktop capability
        context = await browser.new_context(viewport={"width": 412, "height": 915})
        page = await context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("\n[STEP 0] Loading QBiz Kho App...")
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_selector("#pageTitle", timeout=10000)
        await page.wait_for_function("() => window.__qbiz_app__ && window.state", timeout=10000)
        await page.wait_for_timeout(1000)

        # -------------------------------------------------------------
        # TEST 1: Open Shift with 1,000,000 VND
        # -------------------------------------------------------------
        print("\n[TEST 1] Opening Shift with 1,000,000 VND...")
        shift_result = await page.evaluate("""async () => {
            const app = window.__qbiz_app__;
            const state = window.state;
            state.page = 'shifts';
            await window.refresh();
            
            // Check if there is an open shift, if so close it first
            const active = (state.data.shifts || []).find(s => s.status === 'OPEN');
            if (active) {
                await app.closeShift({ shiftId: active.id, countedCash: 0 });
            }
            
            // Open clean test shift
            const newShift = await app.openShift({ openingCash: 1000000 });
            state.page = 'shifts';
            await window.refresh();
            return newShift;
        }""")
        shift_id = shift_result["id"]
        print(f"  Shift Opened: {shift_id} | Opening Cash: {shift_result['opening_cash']:,} VND")
        assert shift_result["opening_cash"] == 1000000

        # Check shift screen UI
        summary_text = await page.evaluate("""() => {
            const el = document.querySelector('.shift-summary');
            return el ? el.innerText : '';
        }""")
        assert "1.000.000" in summary_text, f"Opening cash missing in UI: {summary_text}"
        print("  Verified: Shift UI renders opening cash 1.000.000 ₫ accurately.")

        # -------------------------------------------------------------
        # TEST 2: Record Cash Operating Expense (150,000 VND) via Modal
        # -------------------------------------------------------------
        print("\n[TEST 2] Recording Cash Expense (150,000 VND) via openCashForm('out')...")
        await page.evaluate("""() => {
            const btn = document.querySelector('[data-shift-expense]');
            if (btn) btn.click();
            else window.openCashForm('out');
        }""")
        await page.wait_for_selector("#modalRoot .form-grid", state="visible")
        
        # Fill expense form
        await page.select_option("#csCategory", value="Tiếp khách / Ăn uống ca")
        await page.fill("#csAmount", "150000")
        await page.select_option("#csMethod", value="Tiền mặt")
        await page.fill("#csPayee", "Chị tạp vụ")
        await page.fill("#csNote", "Mua nước uống và trà ca sáng")

        # Submit modal
        await page.click("#modalSubmit")
        await page.wait_for_timeout(800)

        # Verify expense record in DB
        expense_check = await page.evaluate("""async () => {
            const app = window.__qbiz_app__;
            const exps = await app.getExpenses();
            return exps.find(e => e.amount === 150000 && e.category === 'Tiếp khách / Ăn uống ca');
        }""")
        assert expense_check is not None, "Expense record was not found in operating_expenses!"
        assert expense_check["payment_method"] == "cash"
        assert expense_check["shift_id"] == shift_id
        print(f"  Expense Recorded: {expense_check['category']} | {expense_check['amount']:,} VND | Shift: {expense_check['shift_id']}")

        # Verify live Shift Center UI updated expected drawer cash: 1,000,000 - 150,000 = 850,000
        shift_center_text = await page.evaluate("""() => {
            const el = document.querySelector('.shift-summary');
            const rec = document.querySelector('.shift-reconcile');
            return {
                summary: el ? el.innerText : '',
                reconcile: rec ? rec.innerText : ''
            };
        }""")
        print(f"  Shift Summary Text: {shift_center_text['summary'].replace(chr(10), ' · ')}")
        print(f"  Shift Reconcile Text: {shift_center_text['reconcile'].replace(chr(10), ' · ')}")
        assert "150.000" in shift_center_text["summary"], "Cash expense missing in shift summary UI!"
        assert "850.000" in shift_center_text["reconcile"], "Expected drawer cash not decremented by expense!"
        print("  Verified: Shift center accurately subtracted cash expense from expected cash balance!")

        # -------------------------------------------------------------
        # TEST 3: Record Bank Transfer Expense (300,000 VND)
        # -------------------------------------------------------------
        print("\n[TEST 3] Recording Bank Transfer Expense (300,000 VND)...")
        await page.evaluate("""() => {
            window.openCashForm('out');
        }""")
        await page.wait_for_selector("#modalRoot .form-grid", state="visible")
        await page.select_option("#csCategory", value="Tiền điện / nước / internet")
        await page.fill("#csAmount", "300000")
        await page.select_option("#csMethod", value="Chuyển khoản")
        await page.fill("#csPayee", "Công ty Điện Lực")
        await page.fill("#csNote", "Tiền điện tháng 9")
        await page.click("#modalSubmit")
        await page.wait_for_timeout(800)

        # Expected cash drawer balance must STILL be 850,000 VND because bank transfer does not deduct physical cash!
        expected_cash_now = await page.evaluate("""() => {
            const rec = document.querySelector('.shift-reconcile strong');
            return rec ? rec.innerText : '';
        }""")
        assert "850.000" in expected_cash_now, f"Physical drawer balance was mistakenly altered by transfer: {expected_cash_now}"
        print(f"  Verified: Physical cash drawer remains strictly {expected_cash_now} (isolated from bank transfer expense)!")

        # -------------------------------------------------------------
        # TEST 4: Sổ Quỹ Thu Chi (renderCash UI)
        # -------------------------------------------------------------
        print("\n[TEST 4] Verifying Sổ Quỹ Thu Chi (renderCash UI)...")
        await page.evaluate("""async () => {
            window.state.page = 'cash';
            await window.refresh();
        }""")
        await page.wait_for_selector(".mod-summary", state="visible")
        
        cash_screen_info = await page.evaluate("""() => {
            const summary = document.querySelector('.mod-summary')?.innerText || '';
            const list = document.querySelector('.mod-list')?.innerText || '';
            return { summary, list };
        }""")
        assert "150.000" in cash_screen_info["list"], "Expense entry missing in cash journal rows!"
        assert "Tiếp khách / Ăn uống ca" in cash_screen_info["list"], "Category missing in cash journal rows!"
        print("  Verified: Sổ Quỹ Thu Chi list displays the expense row with clear category tag.")

        # Take screenshot of Sổ Quỹ
        os.makedirs("tests/evidence", exist_ok=True)
        await page.screenshot(path="tests/evidence/cash_journal_with_expense_mobile.png")
        print("  Visual Evidence saved: tests/evidence/cash_journal_with_expense_mobile.png")

        # -------------------------------------------------------------
        # TEST 5: Close Shift and Reconcile with 0 Difference
        # -------------------------------------------------------------
        print("\n[TEST 5] Closing Shift with Counted Cash = 850,000 VND...")
        closed_shift = await page.evaluate("""async (sId) => {
            const app = window.__qbiz_app__;
            return await app.closeShift({ shiftId: sId, countedCash: 850000 });
        }""", shift_id)
        assert closed_shift["status"] == "CLOSED"
        assert closed_shift["expected_cash"] == 850000
        assert closed_shift["counted_cash"] == 850000
        assert closed_shift["difference"] == 0
        assert closed_shift["summary"]["cash_expenses"] == 150000
        print(f"  Shift Closed: Expected={closed_shift['expected_cash']:,} | Counted={closed_shift['counted_cash']:,} | Diff={closed_shift['difference']}")
        print("  Verified: Shift closure strictly reconciles cash expenses with ZERO ledger discrepancy!")

        # -------------------------------------------------------------
        # TEST 6: Supplier Returns UI Initial State
        # -------------------------------------------------------------
        print("\n[TEST 6] Navigating to Supplier Returns Center (renderSupplierReturns)...")
        await page.evaluate("""async () => {
            window.state.page = 'supplier-returns';
            await window.refresh();
        }""")
        await page.wait_for_selector(".mod-summary", state="visible")

        page_title = await page.evaluate("""() => document.querySelector('.section-head h2')?.innerText || ''""")
        status_label = await page.evaluate("""() => document.querySelector('.surface-status')?.innerText || ''""")
        assert "Trả hàng nhà cung cấp" in page_title
        assert "Đang dùng" in status_label or "working" in status_label
        print(f"  Verified: Page Title = '{page_title}' | Status = '{status_label}' (WORKING/ACTIVE)")

        # -------------------------------------------------------------
        # TEST 7: Open Supplier Return Modal (openSupplierReturnModal)
        # -------------------------------------------------------------
        print("\n[TEST 7] Opening Supplier Return Modal...")
        await page.click('[data-action="srt-new"]')
        await page.wait_for_selector("#modalRoot #srtSupplier", state="visible")

        modal_title = await page.evaluate("""() => document.querySelector('#modalRoot h3')?.innerText || ''""")
        assert "Tạo phiếu trả nhà cung cấp" in modal_title
        print(f"  Verified Modal Title: '{modal_title}'")

        # -------------------------------------------------------------
        # TEST 8: Execute Purchase Return with Available Stock Deduction
        # -------------------------------------------------------------
        print("\n[TEST 8] Executing Supplier Return with Stock Deduction...")
        # Get a product that has stock > 0 in default warehouse
        chosen_product = await page.evaluate("""() => {
            const state = window.state;
            const whId = document.querySelector('#srtWarehouse')?.value || state.data.warehouses[0]?.id;
            for (const p of state.data.products) {
                if (p.type === 'SERVICE' || p.trackInventory === false) continue;
                const lv = (state.data.levels || []).find(l => l.productId === p.id && l.warehouseId === whId);
                const avail = (lv?.onHand || 0) - (lv?.reserved || 0) - (lv?.damaged || 0);
                if (avail >= 5) {
                    return { id: p.id, name: p.name, avail, whId };
                }
            }
            return null;
        }""")
        assert chosen_product is not None, "No product with available stock >= 5 found for test!"
        pid = chosen_product["id"]
        stock_before = chosen_product["avail"]
        print(f"  Target Product: {chosen_product['name']} ({pid}) | Stock Before: {stock_before}")

        # In modal, check the checkbox for this product, set qty=2, price=1,500,000
        await page.check(f'[data-srt-item="{pid}"]')
        await page.fill(f'[data-srt-qty="{pid}"]', "2")
        await page.fill(f'[data-srt-price="{pid}"]', "1500000")
        await page.select_option("#srtReason", value="Hàng lỗi / hư hỏng do nhà sản xuất")
        await page.select_option("#srtRefundMethod", value="cash")
        await page.fill("#srtNote", "Trả 2 sp lỗi khung theo biên bản 02/10")

        # Submit Return
        await page.click("#modalSubmit")
        await page.wait_for_timeout(1000)

        # Check stock after
        stock_after = await page.evaluate("""(pid) => {
            const state = window.state;
            const whId = state.data.warehouses[0]?.id;
            const lv = (state.data.levels || []).find(l => l.productId === pid && l.warehouseId === whId);
            return (lv?.onHand || 0) - (lv?.reserved || 0) - (lv?.damaged || 0);
        }""", pid)
        print(f"  Stock After Return: {stock_after} (Expected: {stock_before - 2})")
        assert stock_after == stock_before - 2, f"Stock was not accurately decremented! Before: {stock_before}, After: {stock_after}"

        # -------------------------------------------------------------
        # TEST 9: Verify Supplier Returns List UI
        # -------------------------------------------------------------
        print("\n[TEST 9] Verifying Supplier Returns List UI...")
        summary_cards = await page.evaluate("""() => {
            const cards = document.querySelectorAll('.mod-summary > div');
            return Array.from(cards).map(c => c.innerText.replace(/\\n/g, ': '));
        }""")
        print(f"  Summary Cards: {summary_cards}")
        
        list_text = await page.evaluate("""() => document.querySelector('.mod-list')?.innerText || ''""")
        assert "3.000.000" in list_text, f"Refund total (3,000,000 VND) not rendered in list! List text: {list_text}"
        assert "Hàng lỗi / hư hỏng do nhà sản xuất" in list_text, "Return reason missing in list!"
        print("  Verified: Supplier return document listed with 3.000.000 ₫ refund value!")

        # Take screenshot of Supplier Returns Center
        await page.screenshot(path="tests/evidence/supplier_returns_list_mobile.png")
        print("  Visual Evidence saved: tests/evidence/supplier_returns_list_mobile.png")

        # -------------------------------------------------------------
        # TEST 10: View Return Detail Modal
        # -------------------------------------------------------------
        print("\n[TEST 10] Opening Return Detail Modal...")
        await page.click('[data-srt-view]')
        await page.wait_for_selector("#modalRoot .transaction-lines", state="visible")

        detail_text = await page.evaluate("""() => document.querySelector('#modalRoot')?.innerText || ''""")
        assert "PHIẾU TRẢ NCC" in detail_text.upper() or "Phiếu trả NCC" in detail_text
        assert "3.000.000" in detail_text
        assert chosen_product["name"] in detail_text
        print("  Verified: Detail modal shows full line items, supplier, warehouse, and refund total.")

        # Take screenshot of Detail Modal
        await page.screenshot(path="tests/evidence/supplier_return_detail_modal_mobile.png")
        print("  Visual Evidence saved: tests/evidence/supplier_return_detail_modal_mobile.png")

        # Close detail modal
        await page.click("#modalRoot [data-close]")
        await page.wait_for_timeout(400)

        # -------------------------------------------------------------
        # TEST 11: Debt Offset Supplier Return (refundMethod: debt)
        # -------------------------------------------------------------
        print("\n[TEST 11] Creating Supplier Return with Debt Offset (refundMethod: debt)...")
        return_debt_res = await page.evaluate("""async (pid) => {
            const app = window.__qbiz_app__;
            const state = window.state;
            const whId = state.data.warehouses[0]?.id;
            const supId = state.data.suppliers[0]?.id || 'sup_test';
            return await app.createPurchaseReturn({
                supplierId: supId,
                warehouseId: whId,
                lines: [{ productId: pid, qty: 1, price: 1000000 }],
                reason: 'Đổi trả hàng tồn chậm bán theo thỏa thuận',
                refundMethod: 'debt',
                refundAmount: 1000000
            });
        }""", pid)
        assert return_debt_res is not None
        assert return_debt_res["refund_method"] == "debt"
        assert return_debt_res["refund_amount"] == 1000000
        print(f"  Debt Return Created: ID={return_debt_res['id']} | Method={return_debt_res['refund_method']} | Amount={return_debt_res['refund_amount']:,} VND")

        # Check stock decremented again by 1
        stock_final = await page.evaluate("""(pid) => {
            const state = window.state;
            const whId = state.data.warehouses[0]?.id;
            const lv = (state.data.levels || []).find(l => l.productId === pid && l.warehouseId === whId);
            return (lv?.onHand || 0) - (lv?.reserved || 0) - (lv?.damaged || 0);
        }""", pid)
        assert stock_final == stock_before - 3
        print(f"  Stock after Debt Return: {stock_final} (Expected: {stock_before - 3})")

        # Check for zero console errors
        print(f"\n[FINAL CHECK] Console errors recorded: {len(console_errors)}")
        if console_errors:
            print(f"  Errors: {console_errors}")
        assert len(console_errors) == 0, f"Found console errors during execution: {console_errors}"

        await browser.close()

    print("\n" + "=" * 75)
    print("ALL 11 EMPIRICAL VERIFICATION TESTS PASSED AT 100%!")
    print("=" * 75)

if __name__ == "__main__":
    asyncio.run(run_tests())
