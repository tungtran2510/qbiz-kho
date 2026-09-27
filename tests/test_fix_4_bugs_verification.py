import sys
import json
import time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def test_all_4_bugs():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        
        # Track console errors
        console_errors = []
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        
        print(">>> 1. Loading QBiz Kho at http://localhost:4180...")
        page.goto('http://localhost:4180')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.state && window.__qbiz_app__.state.data')
        page.wait_for_timeout(1000)
        
        # Helper to query IndexedDB
        def get_idb_data():
            return page.evaluate('''async () => {
                const dbs = await indexedDB.databases();
                const targetDbName = dbs.map(d=>d.name).find(n => n.includes('qbiz')) || 'qbiz_kho_v1';
                const req = indexedDB.open(targetDbName);
                const db = await new Promise((res, rej) => {
                    req.onsuccess = () => res(req.result);
                    req.onerror = () => rej(req.error);
                });
                const getAll = (name) => new Promise((res) => {
                    if (!db.objectStoreNames.contains(name)) return res([]);
                    const tx = db.transaction(name, 'readonly');
                    const store = tx.objectStore(name);
                    const r = store.getAll();
                    r.onsuccess = () => res(r.result || []);
                    r.onerror = () => res([]);
                });
                return {
                    dbName: targetDbName,
                    sales: await getAll('sales'),
                    orders: await getAll('orders'),
                    levels: await getAll('levels'),
                    movements: await getAll('movements'),
                    shifts: await getAll('shifts')
                };
            }''')

        # =========================================================================
        # TEST BUG #1: SHIFT REQUIRED FOR SALES & VALID SHIFT_ID
        # =========================================================================
        print("\n==================================================")
        print(">>> TESTING BUG #1: Sale requires active shift & valid shift_id")
        print("==================================================")
        
        # Ensure no shift is currently open
        shift_setup = page.evaluate('''async () => {
            const cur = await window.__qbiz_engine_test_shift__?.() || null;
            // Close any existing open shift for clean test
            const shifts = window.__qbiz_app__.state.data.shifts || [];
            const open = shifts.find(s => s.status === 'OPEN');
            if (open) {
                const { closeShift } = await import('./src/engine.js');
                await closeShift({ shiftId: open.id, countedCash: 0 });
                await window.__qbiz_app__.state.data;
            }
            return { closed_previous: Boolean(open) };
        }''')
        page.wait_for_timeout(500)
        
        idb_before_blocked = get_idb_data()
        sales_count_before = len(idb_before_blocked['sales'])
        
        # 1. Attempt sale when no shift is open -> MUST FAIL
        attempt_no_shift = page.evaluate('''async () => {
            try {
                const { createSale } = await import('./src/engine.js');
                const prods = window.__qbiz_app__.state.data.products.filter(p => p.type !== 'SERVICE');
                const whs = window.__qbiz_app__.state.data.warehouses;
                await createSale({
                    items: [{ itemId: prods[0].id, quantity: 1, unitPrice: prods[0].price || 10000 }],
                    warehouseId: whs[0].id,
                    paymentMethod: 'cash',
                    customerLabel: 'Khách test Bug 1'
                });
                return { success: true };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }''')
        
        idb_after_blocked = get_idb_data()
        sales_count_after = len(idb_after_blocked['sales'])
        
        print(f"Blocked attempt without shift result: success={attempt_no_shift.get('success')}, error='{attempt_no_shift.get('error')}'")
        assert not attempt_no_shift.get('success'), "Sale must FAIL when no shift is open!"
        assert "Chưa mở ca" in attempt_no_shift.get('error', ''), f"Unexpected error message: {attempt_no_shift.get('error')}"
        assert sales_count_after == sales_count_before, f"Atomicity violation! Sales increased from {sales_count_before} to {sales_count_after}"
        print("✓ Atomicity verified: 0 records committed when shift is closed.")

        # 2. Open shift via engine/UI
        open_shift_res = page.evaluate('''async () => {
            const { openShift } = await import('./src/engine.js');
            const shift = await openShift({ openingCash: 100000 });
            return shift;
        }''')
        print(f"Shift opened: ID={open_shift_res.get('id')}, status={open_shift_res.get('status')}")
        assert open_shift_res.get('status') == 'OPEN', "Shift must be OPEN!"
        active_shift_id = open_shift_res.get('id')
        
        # 3. Complete sale with open shift -> MUST SUCCEED with shift_id == active_shift_id
        sale_with_shift = page.evaluate('''async () => {
            const { createSale } = await import('./src/engine.js');
            const prods = window.__qbiz_app__.state.data.products.filter(p => p.type !== 'SERVICE');
            const whs = window.__qbiz_app__.state.data.warehouses;
            const sale = await createSale({
                items: [{ itemId: prods[0].id, quantity: 1, unitPrice: prods[0].price || 20000 }],
                warehouseId: whs[0].id,
                paymentMethod: 'cash',
                customerLabel: 'Khách test Bug 1 thành công'
            });
            return sale;
        }''')
        print(f"Sale completed: ID={sale_with_shift.get('id')}, shift_id={sale_with_shift.get('shift_id')}")
        assert sale_with_shift.get('shift_id') == active_shift_id, f"Sale shift_id ({sale_with_shift.get('shift_id')}) does NOT match active shift ({active_shift_id})!"
        assert sale_with_shift.get('payments', [{}])[0].get('shift_id') == active_shift_id, "Payment shift_id must match active shift!"
        print("✓ Shift_id persistence verified: Sale and Payment both have valid active shift_id.")

        # 4. Close shift
        close_shift_res = page.evaluate('''(shiftId) => {
            return (async () => {
                const { closeShift } = await import('./src/engine.js');
                return await closeShift({ shiftId, countedCash: 120000 });
            })();
        }''', active_shift_id)
        assert close_shift_res.get('status') == 'CLOSED', "Shift must be CLOSED!"
        print(f"Shift closed: ID={close_shift_res.get('id')}")

        # 5. Attempt another sale now that shift is closed -> MUST FAIL
        attempt_after_closed = page.evaluate('''async () => {
            try {
                const { createSale } = await import('./src/engine.js');
                const prods = window.__qbiz_app__.state.data.products.filter(p => p.type !== 'SERVICE');
                const whs = window.__qbiz_app__.state.data.warehouses;
                await createSale({
                    items: [{ itemId: prods[0].id, quantity: 1, unitPrice: prods[0].price || 10000 }],
                    warehouseId: whs[0].id,
                    paymentMethod: 'cash'
                });
                return { success: true };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }''')
        assert not attempt_after_closed.get('success'), "Sale must FAIL after shift is closed!"
        assert "Chưa mở ca" in attempt_after_closed.get('error', '')
        print("✓ Re-block after shift close verified.")
        results['BUG_1'] = 'PASS'

        # =========================================================================
        # TEST BUG #2: ORDER COMPLETION DECREMENTS STOCK ATOMICALLY & IDEMPOTENTLY
        # =========================================================================
        print("\n==================================================")
        print(">>> TESTING BUG #2: Order completion stock decrement & idempotency")
        print("==================================================")
        
        # 1. Create a test order
        order_creation = page.evaluate('''async () => {
            const { createOrder } = await import('./src/engine.js');
            const whs = window.__qbiz_app__.state.data.warehouses;
            const targetWh = whs[0];
            const levels = window.__qbiz_app__.state.data.levels;
            const prods = window.__qbiz_app__.state.data.products.filter(p => {
                if (p.type === 'SERVICE' || p.trackInventory === false) return false;
                const lv = levels.find(l => l.productId === p.id && l.warehouseId === targetWh.id);
                return lv && lv.onHand >= 5;
            });
            const targetProd = prods[0];
            
            const order = await createOrder({
                warehouseId: targetWh.id,
                items: [{ itemId: targetProd.id, quantity: 2, unitPrice: targetProd.price || 50000 }],
                customerLabel: 'Khách test Bug 2 Đơn hàng',
                note: 'Đơn hàng kiểm tra trừ tồn'
            });
            return { order, prodId: targetProd.id, whId: targetWh.id };
        }''')
        test_order = order_creation['order']
        test_prod_id = order_creation['prodId']
        test_wh_id = order_creation['whId']
        print(f"Created test order: ID={test_order['id']}, Code={test_order.get('code')}")

        # Capture BEFORE state directly from IndexedDB
        idb_before_order = get_idb_data()
        lv_before = next((l for l in idb_before_order['levels'] if l['productId'] == test_prod_id and l['warehouseId'] == test_wh_id), None)
        before_on_hand = lv_before['onHand'] if lv_before else 0
        before_reserved = lv_before.get('reserved', 0) if lv_before else 0
        before_mov_count = len([m for m in idb_before_order['movements'] if m.get('reference_id') == test_order['id']])
        print(f"BEFORE completion (from IDB): onHand={before_on_hand}, reserved={before_reserved}, order_movements={before_mov_count}")

        # 2. Complete the order
        completion_res = page.evaluate('''(orderId) => {
            return (async () => {
                const { completeOrder } = await import('./src/engine.js');
                return await completeOrder(orderId);
            })();
        }''', test_order['id'])
        print(f"Order completed status: {completion_res.get('status')}")
        assert completion_res.get('status') == 'COMPLETED', "Order status must be COMPLETED!"

        # Refresh state in memory
        page.evaluate('async () => { await window.__qbiz_app__.state.data; }')
        
        # Capture AFTER state directly from IndexedDB
        idb_after_order = get_idb_data()
        lv_after = next((l for l in idb_after_order['levels'] if l['productId'] == test_prod_id and l['warehouseId'] == test_wh_id), None)
        assert lv_after is not None, "Level record must exist!"
        
        expected_on_hand = before_on_hand - 2
        actual_on_hand = lv_after['onHand']
        print(f"AFTER completion (from IDB): onHand={actual_on_hand} (expected {expected_on_hand}), reserved={lv_after.get('reserved', 0)}")
        assert actual_on_hand == expected_on_hand, f"Stock decrement mismatch! Expected {expected_on_hand}, got {actual_on_hand}"

        # Verify movement in IndexedDB
        order_movs = [m for m in idb_after_order['movements'] if m.get('reference_id') == test_order['id'] or m.get('reference') == test_order.get('code')]
        print(f"Matching inventory movements found: {len(order_movs)}")
        assert len(order_movs) >= 1, "There MUST be at least 1 inventory movement for the completed order!"
        mov = order_movs[0]
        assert mov.get('reference_type') == 'order', f"Movement reference_type ({mov.get('reference_type')}) must be 'order'!"
        assert mov.get('qty') == -2, f"Movement qty ({mov.get('qty')}) must be -2!"
        assert mov.get('productId') == test_prod_id, "Movement productId mismatch!"
        assert mov.get('warehouseId') == test_wh_id, "Movement warehouseId mismatch!"
        print("✓ Inventory movement verified in IndexedDB with reference_type='order' and exact qty -2.")

        # 3. IDEMPOTENCY TEST: Complete again -> Must NOT decrement stock a second time!
        print(">>> Testing idempotency (completing already-COMPLETED order)...")
        recomplete_res = page.evaluate('''(orderId) => {
            return (async () => {
                const { completeOrder } = await import('./src/engine.js');
                return await completeOrder(orderId);
            })();
        }''', test_order['id'])
        
        idb_after_recomplete = get_idb_data()
        lv_recomplete = next((l for l in idb_after_recomplete['levels'] if l['productId'] == test_prod_id and l['warehouseId'] == test_wh_id), None)
        print(f"AFTER 2nd completion: onHand={lv_recomplete['onHand']} (must remain {expected_on_hand})")
        assert lv_recomplete['onHand'] == expected_on_hand, f"Idempotency violated! Stock decremented twice to {lv_recomplete['onHand']}"
        
        order_movs_2 = [m for m in idb_after_recomplete['movements'] if m.get('reference_id') == test_order['id'] or m.get('reference') == test_order.get('code')]
        assert len(order_movs_2) == len(order_movs), f"Idempotency violated! Duplicate movements created: {len(order_movs_2)} vs {len(order_movs)}"
        print("✓ Idempotency verified: Re-completing order did not create extra movements or double-deduct stock.")
        results['BUG_2'] = 'PASS'

        # =========================================================================
        # TEST BUG #3: DASHBOARD QUICK ACTIONS (Đổi - Trả & Kiểm tồn)
        # =========================================================================
        print("\n==================================================")
        print(">>> TESTING BUG #3: Dashboard Quick Actions (Đổi - Trả & Kiểm tồn)")
        print("==================================================")
        
        # Enable demo mode so dashboard is interactive (no public-entry-overlay)
        page.evaluate('''() => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            window.__qbiz_app__.navigate('dashboard');
        }''')
        page.wait_for_timeout(600)
        
        # 1. Test "Đổi - Trả" button
        print("Testing 'Đổi - Trả' quick action click...")
        doi_tra_btn = page.locator('button.quick-hero-sub, button[data-action="return-center"]').first
        assert doi_tra_btn.is_visible(), "Button 'Đổi - Trả' must be visible on Dashboard!"
        
        doi_tra_btn.click()
        page.wait_for_timeout(500)
        
        # Verify navigation to returns page
        current_page = page.evaluate("() => window.__qbiz_app__.state.page")
        print(f"Current page after clicking 'Đổi - Trả': {current_page}")
        assert current_page == 'returns', f"Expected page 'returns', but got '{current_page}'!"
        
        # Verify return center content rendered
        return_head = page.locator('h2:has-text("Trả hàng / Đổi hàng theo giao dịch")')
        assert return_head.is_visible(), "Return Center heading must be visible!"
        print("✓ 'Đổi - Trả' successfully navigated to Return Center.")

        # 2. Return to Dashboard
        page.evaluate("() => { window.__qbiz_app__.navigate('dashboard'); }")
        page.wait_for_timeout(500)
        
        # 3. Test "Kiểm tồn" quick action
        print("Testing 'Kiểm tồn' quick action click...")
        kiem_ton_btn = page.locator('button.quick-tile:has-text("Kiểm tồn"), button[data-action="quick-action"][data-kind="count"]').first
        assert kiem_ton_btn.is_visible(), "Button 'Kiểm tồn' must be visible on Dashboard!"
        
        kiem_ton_btn.click()
        page.wait_for_timeout(600)
        
        # Verify modal opened
        modal_title = page.locator('#modalRoot h3, #modalRoot .modal-head h3').first
        assert modal_title.is_visible(), "Modal title must be visible!"
        modal_title_text = modal_title.text_content()
        print(f"Modal title: '{modal_title_text}'")
        assert "Kiểm" in modal_title_text, f"Modal title should mention Kiểm, got '{modal_title_text}'"
        
        # Verify warehouse label in modal is 'Kho kiểm kê'
        wh_label = page.locator('#modalRoot .form-grid label').first.text_content()
        print(f"Warehouse label in count modal: '{wh_label}'")
        assert "Kho kiểm kê" in wh_label, f"Expected 'Kho kiểm kê' label, but got '{wh_label}'!"
        
        # Close modal
        close_btn = page.locator('#modalClose, button.close-btn, [data-close]').first
        if close_btn.is_visible():
            close_btn.click()
        else:
            page.evaluate("() => { document.getElementById('modalRoot').innerHTML = ''; }")
        page.wait_for_timeout(300)
        print("✓ 'Kiểm tồn' modal opened with correct 'Kho kiểm kê' label.")

        # 4. Mobile layout check (390x844)
        print("Testing mobile viewport 390x844...")
        page.set_viewport_size({'width': 390, 'height': 844})
        page.evaluate("() => { window.__qbiz_app__.render(); }")
        page.wait_for_timeout(500)
        
        m_doi_tra = page.locator('button.quick-hero-sub').first
        assert m_doi_tra.is_visible(), "Mobile: 'Đổi - Trả' must be visible!"
        m_doi_tra.click()
        page.wait_for_timeout(400)
        assert page.evaluate("() => window.__qbiz_app__.state.page") == 'returns', "Mobile: navigation to returns works!"
        
        page.set_viewport_size({'width': 1280, 'height': 800})
        page.evaluate("() => { window.__qbiz_app__.navigate('dashboard'); }")
        page.wait_for_timeout(500)
        print("✓ Mobile layout tested successfully.")
        results['BUG_3'] = 'PASS'

        # =========================================================================
        # TEST BUG #4: PRINT RECEIPT / VOUCHER CLEAN DATA (NO LABEL LEAKAGE)
        # =========================================================================
        print("\n==================================================")
        print(">>> TESTING BUG #4: Voucher print template clean data rendering")
        print("==================================================")
        
        vouchers = page.evaluate('''() => {
            const docReceive = {
                document_id: 'PNK-TEST-001',
                warehouse_id: 'wh_main',
                deliverer_name: '',
                supplier_id: '',
                note: '',
                lines: [
                    { productId: 'p1', name: 'Sản phẩm mẫu', qty: 10, price: 50000, line_total: 500000 }
                ]
            };
            const docIssue = {
                document_id: 'PXK-TEST-002',
                warehouse_id: 'wh_main',
                receiver_name: '',
                customer_label: '',
                note: '',
                lines: [
                    { productId: 'p1', name: 'Sản phẩm mẫu', qty: 5, price: 50000, line_total: 250000 }
                ]
            };
            return {
                receive: renderWarehouseVoucherHtml(docReceive, 'receive', { standard: 'enterprise' }),
                issue: renderWarehouseVoucherHtml(docIssue, 'issue', { standard: 'enterprise' })
            };
        }''')
        
        # Test Receive Voucher
        page.set_content(vouchers['receive'])
        
        # Check meta info: "Họ và tên người giao hàng:" must be "—", NOT "Người giao hàng"
        meta_val = page.locator('.voucher-meta-info .v-row').first.locator('.v-val').text_content().strip()
        print(f"Receive voucher deliverer meta value: '{meta_val}'")
        assert meta_val == "—", f"Deliverer meta value should be '—', but got '{meta_val}'! (Label leaked as data!)"
        
        # Check signature: under "Người giao hàng", .sig-name must be empty "", NOT "Người giao hàng"
        sig_deliverer_name = page.locator('.sig-col:has-text("Người giao hàng") .sig-name').text_content().strip()
        print(f"Receive voucher signature name: '{sig_deliverer_name}'")
        assert sig_deliverer_name == "", f"Signature name should be empty '', but got '{sig_deliverer_name}'!"
        
        # Test Issue Voucher
        page.set_content(vouchers['issue'])
        
        issue_meta_val = page.locator('.voucher-meta-info .v-row').first.locator('.v-val').text_content().strip()
        print(f"Issue voucher receiver meta value: '{issue_meta_val}'")
        assert issue_meta_val == "—", f"Receiver meta value should be '—', but got '{issue_meta_val}'!"
        
        sig_receiver_name = page.locator('.sig-col:has-text("Người nhận hàng") .sig-name').text_content().strip()
        print(f"Issue voucher signature name: '{sig_receiver_name}'")
        assert sig_receiver_name == "", f"Signature name should be empty '', but got '{sig_receiver_name}'!"
        assert sig_receiver_name == "", f"Signature name should be empty '', but got '{sig_receiver_name}'!"

        # Check company address fallback
        company_addr = page.locator('.voucher-company-info span:has-text("Địa chỉ")').text_content().strip()
        print(f"Company address rendered: '{company_addr}'")
        assert "Hà Nội, Việt Nam" not in company_addr or "Địa chỉ:" in company_addr, "Address should not blindly inject hardcoded placeholder."

        print("✓ Bug #4 verified: No label strings leak into data values or signatures.")
        results['BUG_4'] = 'PASS'

        # Check console errors
        print(f"\nConsole errors during test execution: {len(console_errors)}")
        for err in console_errors:
            print(f"  Console error: {err}")
        assert len(console_errors) == 0, f"Found {len(console_errors)} console errors!"

        browser.close()
        
    print("\n==================================================")
    print("ALL 4 BUGS EMPIRICALLY VERIFIED AND PASSED!")
    print(f"Results summary: {json.dumps(results, indent=2)}")
    print("==================================================")

if __name__ == '__main__':
    test_all_4_bugs()
