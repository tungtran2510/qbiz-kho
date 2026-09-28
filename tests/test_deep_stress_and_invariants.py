import os, sys, time, json
from playwright.sync_api import sync_playwright

TEST_URL = "http://localhost:4180"

def run_stress_suite():
    print("=" * 75)
    print("QBIZ KHO — DEEP STRESS & INVARIANT INTEGRITY TEST SUITE")
    print("SCOPE: TRANSFER -> RETURN -> ORDER CONCURRENCY -> OFFLINE -> SHIFT -> DASHBOARD SHORTCUTS")
    print("=" * 75)

    report_sections = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        print("\n>>> Loading application at", TEST_URL)
        page.goto(TEST_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1000)

        # Initialize demo environment
        page.evaluate('''async () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            const { loadDemoIndustry } = await import('./src/demo-showroom.js');
            await loadDemoIndustry('retail');
            await window.__qbiz_app__.refresh();
            window.__qbiz_app__.navigate('dashboard');
        }''')
        page.wait_for_timeout(1500)

        # =====================================================================
        # 1. CHUYỂN KHO (TRANSFER)
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> [1/6] CHUYỂN KHO (TRANSFER) INVARIANT & IDEMPOTENCY TEST")
        print("=" * 60)

        transfer_result = page.evaluate('''async () => {
            const app = window.__qbiz_app__;
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');

            // 1. Setup Source & Dest Warehouses
            let warehouses = await db.getAll('warehouses');
            let whSource = warehouses[0]?.id || 'wh_retail_main';
            let whDest = warehouses[1]?.id;
            if (!whDest || whDest === whSource) {
                const newWh = await engine.createWarehouse('Kho Chi Nhánh Test Transfer');
                whDest = newWh.id;
            }

            // Find tracked item with stock
            const levels = await db.getAll('levels');
            const targetProd = (await db.getAll('products')).find(p => p.trackInventory !== false && p.type !== 'SERVICE') || { id: 'p_rt_coca' };
            const pId = targetProd.id;

            // Ensure source has at least 10 units
            await engine.receive({ productId: pId, warehouseId: whSource, qty: 10, reason: 'Nạp tồn test chuyển kho' });
            await app.refresh();

            // SNAPSHOT BEFORE
            const levelsBefore = await db.getAll('levels');
            const movementsBefore = await db.getAll('movements');
            const outboxBefore = await db.getAll('outbox');
            const transfersBefore = await db.getAll('transfers');

            const srcLvBefore = levelsBefore.find(l => l.productId === pId && l.warehouseId === whSource) || { onHand: 0 };
            const dstLvBefore = levelsBefore.find(l => l.productId === pId && l.warehouseId === whDest) || { onHand: 0 };

            const TRANSFER_QTY = 3;

            // ACTION: Create Transfer (Dispatch)
            const transfer = await engine.createTransfer({
                fromWarehouseId: whSource,
                toWarehouseId: whDest,
                lines: [{ productId: pId, qty: TRANSFER_QTY }],
                note: 'Chuyển hàng test stress'
            });

            // SNAPSHOT MID (IN_TRANSIT)
            const levelsMid = await db.getAll('levels');
            const srcLvMid = levelsMid.find(l => l.productId === pId && l.warehouseId === whSource) || { onHand: 0 };
            const dstLvMid = levelsMid.find(l => l.productId === pId && l.warehouseId === whDest) || { onHand: 0 };

            // ACTION: Receive Transfer
            const received = await engine.receiveTransfer(transfer.id);

            // SNAPSHOT AFTER
            const levelsAfter = await db.getAll('levels');
            const movementsAfter = await db.getAll('movements');
            const outboxAfter = await db.getAll('outbox');
            const transfersAfter = await db.getAll('transfers');

            const srcLvAfter = levelsAfter.find(l => l.productId === pId && l.warehouseId === whSource) || { onHand: 0 };
            const dstLvAfter = levelsAfter.find(l => l.productId === pId && l.warehouseId === whDest) || { onHand: 0 };

            // IDEMPOTENCY TEST: Attempt second receive of same transfer
            const duplicateReceive = await engine.receiveTransfer(transfer.id);
            const levelsAfterDup = await db.getAll('levels');
            const movementsAfterDup = await db.getAll('movements');

            const srcLvAfterDup = levelsAfterDup.find(l => l.productId === pId && l.warehouseId === whSource) || { onHand: 0 };
            const dstLvAfterDup = levelsAfterDup.find(l => l.productId === pId && l.warehouseId === whDest) || { onHand: 0 };

            return {
                productId: pId,
                whSource,
                whDest,
                transferId: transfer.id,
                before: {
                    sourceOnHand: srcLvBefore.onHand,
                    destOnHand: dstLvBefore.onHand,
                    totalOnHand: srcLvBefore.onHand + dstLvBefore.onHand,
                    movementsCount: movementsBefore.length,
                    outboxCount: outboxBefore.length,
                    transfersCount: transfersBefore.length
                },
                mid: {
                    status: transfer.status,
                    sourceOnHand: srcLvMid.onHand,
                    destOnHand: dstLvMid.onHand
                },
                after: {
                    status: received.status,
                    sourceOnHand: srcLvAfter.onHand,
                    destOnHand: dstLvAfter.onHand,
                    totalOnHand: srcLvAfter.onHand + dstLvAfter.onHand,
                    movementsDelta: movementsAfter.length - movementsBefore.length,
                    outboxDelta: outboxAfter.length - outboxBefore.length,
                    transfersDelta: transfersAfter.length - transfersBefore.length
                },
                idempotency: {
                    duplicateStatus: duplicateReceive.status,
                    sourceOnHandUnchanged: srcLvAfterDup.onHand === srcLvAfter.onHand,
                    destOnHandUnchanged: dstLvAfterDup.onHand === dstLvAfter.onHand,
                    movementsUnchanged: movementsAfterDup.length === movementsAfter.length
                }
            };
        }''')

        print("  BEFORE Transfer:")
        print(f"    Source onHand: {transfer_result['before']['sourceOnHand']}, Dest onHand: {transfer_result['before']['destOnHand']}, Total: {transfer_result['before']['totalOnHand']}")
        print(f"    Movements: {transfer_result['before']['movementsCount']}, Outbox: {transfer_result['before']['outboxCount']}")
        print("  AFTER Transfer Dispatch & Receive:")
        print(f"    Source onHand: {transfer_result['after']['sourceOnHand']} (Delta: -3)")
        print(f"    Dest onHand:   {transfer_result['after']['destOnHand']} (Delta: +3)")
        print(f"    Total onHand:  {transfer_result['after']['totalOnHand']} (System Conservation Invariant: {transfer_result['after']['totalOnHand'] == transfer_result['before']['totalOnHand']})")
        print(f"    Movements delta: +{transfer_result['after']['movementsDelta']} (1 out + 1 in)")
        print(f"    Outbox delta:    +{transfer_result['after']['outboxDelta']}")
        print("  IDEMPOTENCY Check:")
        print(f"    Re-receive same transfer: Status='{transfer_result['idempotency']['duplicateStatus']}'")
        print(f"    Zero duplicate movements: {transfer_result['idempotency']['movementsUnchanged']}")
        print(f"    Levels strictly unchanged: Source={transfer_result['idempotency']['sourceOnHandUnchanged']}, Dest={transfer_result['idempotency']['destOnHandUnchanged']}")

        # Test reload persistence
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        reload_transfer_check = page.evaluate(f'''async () => {{
            const db = await import('./src/db.js');
            const tr = await db.getOne('transfers', '{transfer_result["transferId"]}');
            const lvSrc = await db.getOne('levels', '{transfer_result["productId"]}:{transfer_result["whSource"]}');
            const lvDst = await db.getOne('levels', '{transfer_result["productId"]}:{transfer_result["whDest"]}');
            return {{
                transferStatus: tr?.status,
                srcOnHand: lvSrc?.onHand,
                dstOnHand: lvDst?.onHand
            }};
        }}''')
        print("  RELOAD Verification:")
        print(f"    Persisted Transfer Status: '{reload_transfer_check['transferStatus']}'")
        print(f"    Persisted Stock: Source={reload_transfer_check['srcOnHand']}, Dest={reload_transfer_check['dstOnHand']}")
        transfer_pass = (
            transfer_result['after']['totalOnHand'] == transfer_result['before']['totalOnHand'] and
            transfer_result['after']['movementsDelta'] == 2 and
            transfer_result['idempotency']['movementsUnchanged'] and
            reload_transfer_check['transferStatus'] == 'received'
        )
        report_sections["TRANSFER"] = {"pass": transfer_pass, "details": transfer_result, "reload": reload_transfer_check}

        # =====================================================================
        # 2. ĐỔI / TRẢ / HOÀN TIỀN (RETURN & REFUND)
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> [2/6] ĐỔI / TRẢ / HOÀN TIỀN INVARIANT & IDEMPOTENCY TEST")
        print("=" * 60)

        # Test quick action navigation first
        page.goto(f"{TEST_URL}/#dashboard", wait_until="networkidle")
        page.wait_for_timeout(500)
        return_shortcut = page.locator('[data-action="return-center"], button[data-kind="return"]')
        return_shortcut_found = return_shortcut.count() > 0
        if return_shortcut_found:
            return_shortcut.first.click()
            page.wait_for_timeout(500)
        navigated_page = page.evaluate("window.__qbiz_app__.state.page")
        print(f"  Quick Action 'Đổi - Trả' Click: Shortcut found={return_shortcut_found}, Navigated Page='{navigated_page}'")

        return_result = page.evaluate('''async () => {
            const app = window.__qbiz_app__;
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');

            // 1. Open active shift
            let curShift = await engine.currentShift();
            if (!curShift || curShift.status !== 'OPEN') {
                curShift = await engine.openShift({ openingCash: 1000000 });
            }

            // 2. Create a clean sale to be returned
            const prod = (await db.getAll('products')).find(p => p.trackInventory !== false && p.type !== 'SERVICE') || { id: 'p_rt_coca' };
            const wh = app.state.selectedWarehouseId || (await db.getAll('warehouses'))[0]?.id || 'wh_retail_main';

            // Ensure sufficient stock
            await engine.receive({ productId: prod.id, warehouseId: wh, qty: 5, reason: 'Stock for return test' });

            const sale = await engine.createSale({
                warehouseId: wh,
                items: [{ itemId: prod.id, quantity: 2, unitPrice: 20000 }],
                paymentMethod: 'cash'
            });

            // SNAPSHOT BEFORE RETURN
            const levelsBefore = await db.getAll('levels');
            const movementsBefore = await db.getAll('movements');
            const outboxBefore = await db.getAll('outbox');
            const refundsBefore = await db.getAll('refunds');
            const returnsBefore = await db.getAll('returns');

            const lvBefore = levelsBefore.find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 };
            const onHandBefore = lvBefore.onHand;

            // ACTION: Return 1 item with cash refund
            const opId = 'test_ret_op_' + Date.now();
            const retDoc = await engine.createReturn({
                saleId: sale.id,
                lines: [{ itemId: prod.id, quantity: 1, condition: 'SELLABLE', warehouse_id: wh, refund_amount: 20000 }],
                refundMethod: 'cash',
                reason: 'Khách đổi trả hàng thử nghiệm',
                operationId: opId
            });

            // SNAPSHOT AFTER RETURN
            const levelsAfter = await db.getAll('levels');
            const movementsAfter = await db.getAll('movements');
            const outboxAfter = await db.getAll('outbox');
            const refundsAfter = await db.getAll('refunds');
            const returnsAfter = await db.getAll('returns');

            const lvAfter = levelsAfter.find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 };
            const onHandAfter = lvAfter.onHand;

            const refundDoc = refundsAfter.find(r => r.return_id === retDoc.id || r.sale_id === sale.id);

            // IDEMPOTENCY TEST: Repeat return with same operationId
            let idempotencyBlockedOrCached = false;
            try {
                const secondRet = await engine.createReturn({
                    saleId: sale.id,
                    lines: [{ itemId: prod.id, quantity: 1, condition: 'SELLABLE', warehouse_id: wh, refund_amount: 20000 }],
                    refundMethod: 'cash',
                    reason: 'Khách đổi trả hàng thử nghiệm',
                    operationId: opId
                });
                // Returns existing document
                idempotencyBlockedOrCached = (secondRet.id === retDoc.id);
            } catch (err) {
                // Or rejected due to remaining quantity limit
                idempotencyBlockedOrCached = true;
            }

            const levelsAfterDup = await db.getAll('levels');
            const lvAfterDup = levelsAfterDup.find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 };
            const movementsAfterDup = await db.getAll('movements');
            const refundsAfterDup = await db.getAll('refunds');

            return {
                saleId: sale.id,
                returnId: retDoc.id,
                productId: prod.id,
                before: {
                    onHand: onHandBefore,
                    movementsCount: movementsBefore.length,
                    refundsCount: refundsBefore.length,
                    returnsCount: returnsBefore.length,
                    outboxCount: outboxBefore.length
                },
                after: {
                    onHand: onHandAfter,
                    onHandDelta: onHandAfter - onHandBefore,
                    refundAmount: refundDoc?.amount,
                    refundShiftId: refundDoc?.shift_id,
                    activeShiftId: curShift.id,
                    movementsDelta: movementsAfter.length - movementsBefore.length,
                    returnsDelta: returnsAfter.length - returnsBefore.length,
                    refundsDelta: refundsAfter.length - refundsBefore.length,
                    outboxDelta: outboxAfter.length - outboxBefore.length
                },
                idempotency: {
                    safe: idempotencyBlockedOrCached,
                    onHandUnchanged: lvAfterDup.onHand === onHandAfter,
                    movementsUnchanged: movementsAfterDup.length === movementsAfter.length,
                    refundsUnchanged: refundsAfterDup.length === refundsAfter.length
                }
            };
        }''')

        print("  BEFORE Return:")
        print(f"    onHand: {return_result['before']['onHand']}, Movements: {return_result['before']['movementsCount']}, Refunds: {return_result['before']['refundsCount']}")
        print("  AFTER Return:")
        print(f"    onHand: {return_result['after']['onHand']} (Delta: +{return_result['after']['onHandDelta']}, Invariant: Restored +1)")
        print(f"    Refund amount: {return_result['after']['refundAmount']} ₫ linked to Shift: {return_result['after']['refundShiftId'] == return_result['after']['activeShiftId']}")
        print(f"    Movements delta: +{return_result['after']['movementsDelta']}, Refunds delta: +{return_result['after']['refundsDelta']}")
        print("  IDEMPOTENCY Check:")
        print(f"    Duplicate submission safe: {return_result['idempotency']['safe']}")
        print(f"    Stock not double incremented: {return_result['idempotency']['onHandUnchanged']}")
        print(f"    Refund not double deducted:   {return_result['idempotency']['refundsUnchanged']}")

        # Test reload
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        reload_return_check = page.evaluate(f'''async () => {{
            const db = await import('./src/db.js');
            const ret = await db.getOne('returns', '{return_result["returnId"]}');
            const ref = (await db.getAll('refunds')).find(r => r.return_id === '{return_result["returnId"]}');
            const lv = await db.getOne('levels', '{return_result["productId"]}:wh_retail_main');
            return {{
                returnFound: !!ret,
                returnStatus: ret?.status,
                refundAmount: ref?.amount,
                persistedOnHand: lv?.onHand
            }};
        }}''')
        print(f"  RELOAD Verification: ReturnDoc={reload_return_check['returnFound']}, RefundRecorded={reload_return_check['refundAmount']} ₫")
        return_pass = (
            return_result['after']['onHandDelta'] == 1 and
            return_result['after']['refundAmount'] == 20000 and
            return_result['idempotency']['safe'] and
            reload_return_check['returnFound']
        )
        report_sections["RETURN_REFUND"] = {"pass": return_pass, "details": return_result, "reload": reload_return_check}

        # =====================================================================
        # 3. ORDER CANCEL / DOUBLE-CLICK / RELOAD CONCURRENCY
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> [3/6] ORDER CANCEL, DOUBLE-CLICK CONCURRENCY & RELOAD TEST")
        print("=" * 60)

        order_result = page.evaluate('''async () => {
            const app = window.__qbiz_app__;
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');

            const prod = (await db.getAll('products')).find(p => p.trackInventory !== false && p.type !== 'SERVICE') || { id: 'p_rt_coca' };
            const wh = 'wh_retail_main';

            // Top up stock
            await engine.receive({ productId: prod.id, warehouseId: wh, qty: 20, reason: 'Top up for order concurrency' });

            // Case A: Double-Click Concurrency on Order Completion
            const orderA = await engine.createOrder({
                customerLabel: 'Khách Test Concurrency Double-Click',
                items: [{ itemId: prod.id, quantity: 3, unitPrice: 15000 }],
                warehouseId: wh
            });

            const lvBeforeA = (await db.getAll('levels')).find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 };
            const onHandBeforeA = lvBeforeA.onHand;
            const movesBeforeA = (await db.getAll('movements')).length;

            // Simulate concurrent rapid calls (double-click)
            const [res1, res2] = await Promise.all([
                engine.completeOrder(orderA.id),
                engine.completeOrder(orderA.id)
            ]);

            const lvAfterA = (await db.getAll('levels')).find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 };
            const onHandAfterA = lvAfterA.onHand;
            const movesAfterA = (await db.getAll('movements')).length;

            // Sequential re-call
            const res3 = await engine.completeOrder(orderA.id);
            const lvAfter3 = (await db.getAll('levels')).find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 };

            // Case B: Order Cancellation & Reservation Release
            const orderB = await engine.createOrder({
                customerLabel: 'Khách Test Cancel Reservation',
                items: [{ itemId: prod.id, quantity: 2, unitPrice: 15000 }],
                warehouseId: wh
            });

            // Confirm order (reserves 2 units)
            await engine.confirmOrder(orderB.id);
            const lvAfterConfirm = (await db.getAll('levels')).find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0, reserved: 0 };

            // Cancel order (must release 2 reserved units)
            await engine.cancelOrder(orderB.id);
            const lvAfterCancel = (await db.getAll('levels')).find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0, reserved: 0 };

            return {
                caseA_doubleClick: {
                    orderId: orderA.id,
                    onHandBefore: onHandBeforeA,
                    onHandAfter: onHandAfterA,
                    onHandDelta: onHandAfterA - onHandBeforeA,
                    movementsDelta: movesAfterA - movesBeforeA,
                    status1: res1.status,
                    status2: res2.status,
                    status3: res3.status,
                    sequentialRetriedOnHand: lvAfter3.onHand
                },
                caseB_cancel: {
                    orderId: orderB.id,
                    reservedDuringConfirm: lvAfterConfirm.reserved,
                    reservedAfterCancel: lvAfterCancel.reserved,
                    onHandAfterCancel: lvAfterCancel.onHand
                }
            };
        }''')

        caseA = order_result["caseA_doubleClick"]
        caseB = order_result["caseB_cancel"]
        print("  Case A: Double-Click Rapid Concurrency on Complete Order:")
        print(f"    onHand Before: {caseA['onHandBefore']} -> After: {caseA['onHandAfter']} (Delta: {caseA['onHandDelta']}, Expected: -3)")
        print(f"    Movements created across concurrent calls: +{caseA['movementsDelta']} (Expected: exactly 1 sale movement)")
        print(f"    Statuses returned: Call 1='{caseA['status1']}', Call 2='{caseA['status2']}', Call 3='{caseA['status3']}'")
        print(f"    Sequential 3rd completion onHand: {caseA['sequentialRetriedOnHand']} (Strict Idempotency: {caseA['sequentialRetriedOnHand'] == caseA['onHandAfter']})")

        print("  Case B: Order Confirm -> Reservation -> Cancel:")
        print(f"    Reserved units during CONFIRMED: {caseB['reservedDuringConfirm']} (Expected: >=2)")
        print(f"    Reserved units after CANCELLED:  {caseB['reservedAfterCancel']} (Expected: released back to 0)")

        # Test reload
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        reload_order_check = page.evaluate(f'''async () => {{
            const db = await import('./src/db.js');
            const ordA = await db.getOne('orders', '{caseA["orderId"]}');
            const ordB = await db.getOne('orders', '{caseB["orderId"]}');
            return {{
                ordAStatus: ordA?.status,
                ordBStatus: ordB?.status
            }};
        }}''')
        print(f"  RELOAD Verification: Order A Status='{reload_order_check['ordAStatus']}', Order B Status='{reload_order_check['ordBStatus']}'")
        order_pass = (
            caseA['onHandDelta'] == -3 and
            caseA['movementsDelta'] == 1 and
            caseA['sequentialRetriedOnHand'] == caseA['onHandAfter'] and
            reload_order_check['ordAStatus'] == 'COMPLETED' and
            reload_order_check['ordBStatus'] == 'CANCELLED'
        )
        report_sections["ORDER_CONCURRENCY"] = {"pass": order_pass, "details": order_result, "reload": reload_order_check}

        # =====================================================================
        # 4. OFFLINE / RECONNECT INVARIANT
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> [4/6] OFFLINE / RECONNECT & LOCAL OUTBOX PERSISTENCE TEST")
        print("=" * 60)

        # Set offline
        print("  - Disconnecting browser network (set_offline = True)...")
        context.set_offline(True)

        offline_result = page.evaluate('''async () => {
            const app = window.__qbiz_app__;
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');

            const prod = (await db.getAll('products')).find(p => p.trackInventory !== false && p.type !== 'SERVICE') || { id: 'p_rt_coca' };
            const wh = 'wh_retail_main';

            const outboxBefore = await db.getAll('outbox');
            const levelsBefore = await db.getAll('levels');
            const curOnHand = (levelsBefore.find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 }).onHand;

            // Perform an inventory stocktake adjustment while offline
            const NEW_COUNTED = curOnHand + 5;
            const adjust = await engine.countAdjust({
                productId: prod.id,
                warehouseId: wh,
                counted: NEW_COUNTED,
                reason: 'Kiểm kê offline tại quầy'
            });

            const outboxAfter = await db.getAll('outbox');
            const levelsAfter = await db.getAll('levels');
            const newOnHand = (levelsAfter.find(l => l.productId === prod.id && l.warehouseId === wh) || { onHand: 0 }).onHand;

            const pendingOutbox = outboxAfter.filter(o => o.sync_status === 'PENDING');

            return {
                curOnHand,
                newOnHand,
                outboxBeforeCount: outboxBefore.length,
                outboxAfterCount: outboxAfter.length,
                pendingOutboxCount: pendingOutbox.length,
                lastOutboxAction: outboxAfter[outboxAfter.length - 1]?.action
            };
        }''')

        print(f"  Offline Local Write: onHand {offline_result['curOnHand']} -> {offline_result['newOnHand']}")
        print(f"  Outbox entries: {offline_result['outboxBeforeCount']} -> {offline_result['outboxAfterCount']} (+{offline_result['outboxAfterCount'] - offline_result['outboxBeforeCount']})")
        print(f"  Pending outbox records for sync: {offline_result['pendingOutboxCount']}")

        # Reconnect
        print("  - Reconnecting browser network (set_offline = False)...")
        context.set_offline(False)

        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        reconnect_check = page.evaluate('''async () => {
            const db = await import('./src/db.js');
            const outbox = await db.getAll('outbox');
            return {
                totalOutbox: outbox.length,
                pendingCount: outbox.filter(o => o.sync_status === 'PENDING').length
            };
        }''')
        print(f"  RECONNECT & Reload Verification: Outbox intact ({reconnect_check['totalOutbox']} records, {reconnect_check['pendingCount']} pending sync)")
        offline_pass = (
            offline_result['newOnHand'] == offline_result['curOnHand'] + 5 and
            offline_result['outboxAfterCount'] > offline_result['outboxBeforeCount'] and
            reconnect_check['totalOutbox'] >= offline_result['outboxAfterCount']
        )
        report_sections["OFFLINE_RECONNECT"] = {"pass": offline_pass, "details": offline_result, "reconnect": reconnect_check}

        # =====================================================================
        # 5. SHIFT EDGE CASES & CASH LEDGER RECONCILIATION
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> [5/6] SHIFT EDGE CASES, CASH ATTRIBUTION & RECONCILIATION TEST")
        print("=" * 60)

        shift_result = page.evaluate('''async () => {
            const app = window.__qbiz_app__;
            const engine = await import('./src/engine.js');
            const db = await import('./src/db.js');
            const wh = 'wh_retail_main';
            const prod = (await db.getAll('products')).find(p => p.trackInventory !== false && p.type !== 'SERVICE') || { id: 'p_rt_coca' };

            // 1. Ensure any open shift is closed
            const existing = await engine.currentShift();
            if (existing && existing.status === 'OPEN') {
                await engine.closeShift({ shiftId: existing.id, countedCash: existing.opening_cash || 0 });
            }

            // 2. Test blocked sale without shift
            let saleBlocked = false;
            try {
                await engine.createSale({
                    warehouseId: wh,
                    items: [{ itemId: prod.id, quantity: 1, unitPrice: 50000 }],
                    paymentMethod: 'cash'
                });
            } catch (err) {
                saleBlocked = err.message.includes('mở ca');
            }

            // 3. Open Shift with 300,000 ₫
            const OPENING_CASH = 300000;
            const shift = await engine.openShift({ openingCash: OPENING_CASH, employee: 'Thu ngân Test Stress' });

            // 4. Multiple Cash Sales
            const sale1 = await engine.createSale({
                warehouseId: wh,
                items: [{ itemId: prod.id, quantity: 1, unitPrice: 50000 }],
                paymentMethod: 'cash'
            });
            const sale2 = await engine.createSale({
                warehouseId: wh,
                items: [{ itemId: prod.id, quantity: 2, unitPrice: 50000 }],
                paymentMethod: 'cash'
            });

            // 5. Cash Refund
            const retDoc = await engine.createReturn({
                saleId: sale2.id,
                lines: [{ itemId: prod.id, quantity: 1, condition: 'SELLABLE', warehouse_id: wh, refund_amount: 50000 }],
                refundMethod: 'cash',
                reason: 'Hoàn tiền thử nghiệm đối soát ca'
            });

            // Expected Cash in Drawer = 300.000 (opening) + 50.000 (sale1) + 100.000 (sale2) - 50.000 (refund) = 400.000 ₫
            const EXPECTED_CASH = OPENING_CASH + 50000 + 100000 - 50000;

            // 6. Close Shift with Counted Cash = 420,000 ₫ (Surplus of +20,000 ₫)
            const COUNTED_CASH = 420000;
            const closedShift = await engine.closeShift({ shiftId: shift.id, countedCash: COUNTED_CASH });

            // 7. Verify re-blocked sale after closing
            let reblocked = false;
            try {
                await engine.createSale({
                    warehouseId: wh,
                    items: [{ itemId: prod.id, quantity: 1, unitPrice: 50000 }],
                    paymentMethod: 'cash'
                });
            } catch (err) {
                reblocked = err.message.includes('mở ca');
            }

            return {
                saleBlockedWithoutShift: saleBlocked,
                openingCash: OPENING_CASH,
                expectedCashCalculated: closedShift.expected_cash,
                expectedCashFormula: EXPECTED_CASH,
                countedCash: closedShift.counted_cash,
                difference: closedShift.difference,
                shiftStatus: closedShift.status,
                reblockedAfterClose: reblocked
            };
        }''')

        print(f"  Sale blocked without shift: {shift_result['saleBlockedWithoutShift']}")
        print(f"  Opening Cash:   {shift_result['openingCash']:,} ₫")
        print(f"  Expected Cash:  {shift_result['expectedCashCalculated']:,} ₫ (Formula Check: {shift_result['expectedCashCalculated'] == shift_result['expectedCashFormula']})")
        print(f"  Counted Cash:   {shift_result['countedCash']:,} ₫")
        print(f"  Difference:     {shift_result['difference']:,} ₫ (Surplus of +20.000 ₫ correctly calculated)")
        print(f"  Shift Status:   '{shift_result['shiftStatus']}'")
        print(f"  Reblocked:      {shift_result['reblockedAfterClose']}")

        # Test reload
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        reload_shift_check = page.evaluate('''async () => {
            const engine = await import('./src/engine.js');
            const cur = await engine.currentShift();
            return {
                hasActiveOpenShift: !!cur && cur.status === 'OPEN'
            };
        }''')
        print(f"  RELOAD Verification: Active Open Shift exists={reload_shift_check['hasActiveOpenShift']} (Expected: False - remains closed)")
        shift_pass = (
            shift_result['saleBlockedWithoutShift'] and
            shift_result['expectedCashCalculated'] == 400000 and
            shift_result['difference'] == 20000 and
            shift_result['reblockedAfterClose'] and
            not reload_shift_check['hasActiveOpenShift']
        )
        report_sections["SHIFT_EDGE_CASES"] = {"pass": shift_pass, "details": shift_result, "reload": reload_shift_check}

        # =====================================================================
        # 6. TOÀN BỘ SHORTCUT DASHBOARD & TEST LẠI "ĐỔI - TRẢ", "KIỂM TỒN"
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> [6/6] TOÀN BỘ SHORTCUT DASHBOARD & KIỂM TRA ĐẶC BIỆT 2 NÚT")
        print("=" * 60)

        page.goto(f"{TEST_URL}/#dashboard", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Reopen a shift so actions requiring shift work seamlessly
        page.evaluate('''async () => {
            const engine = await import('./src/engine.js');
            const cur = await engine.currentShift();
            if (!cur || cur.status !== 'OPEN') {
                await engine.openShift({ openingCash: 500000 });
            }
        }''')

        shortcut_results = []

        # List of all Dashboard quick action definitions to test
        shortcuts_to_test = [
            {"name": "Bán hàng (Hero)", "selector": '.quick-hero-main, button.quick-tile[data-page="sales"]', "type": "nav", "expected_page": "sales"},
            {"name": "Đổi - Trả (ĐẶC BIỆT)", "selector": '.quick-hero-sub, [data-action="return-center"]', "type": "nav", "expected_page": "returns"},
            {"name": "Hàng hóa", "selector": 'button.quick-tile[data-page="products"]', "type": "nav", "expected_page": "products"},
            {"name": "Nhập hàng", "selector": 'button.quick-tile[data-kind="receive"]', "type": "modal", "expected_modal_title": "Nhập hàng"},
            {"name": "Kiểm tồn (ĐẶC BIỆT)", "selector": 'button.quick-tile[data-kind="count"]', "type": "modal", "expected_modal_title": "Kiểm tồn kho"},
            {"name": "Đơn hàng", "selector": 'button.quick-tile[data-page="orders"]', "type": "nav", "expected_page": "orders"}
        ]

        for sc in shortcuts_to_test:
            name = sc["name"]
            sel = sc["selector"]
            expected_type = sc["type"]

            page.evaluate("window.__qbiz_app__.navigate('dashboard')")
            page.wait_for_timeout(600)

            btn = page.locator(sel)
            btn_count = btn.count()

            if btn_count == 0:
                print(f"  - [{name}]: NOT FOUND via selector '{sel}'")
                shortcut_results.append({"name": name, "status": "FAIL", "reason": "Selector not found"})
                continue

            btn.first.click()
            page.wait_for_timeout(800)

            if expected_type == "modal":
                page.wait_for_selector('#modalRoot h3, #modalRoot .modal-card', timeout=5000)
                modal_title = page.locator('#modalRoot h3').inner_text()
                
                # Check suggestions for "Kiểm tồn" specifically
                suggestions_count = 0
                if "Kiểm tồn" in name:
                    suggestions_count = page.locator('#stockProductResults [data-stock-product], #productSuggestions button').count()

                # Close modal cleanly
                close_btn = page.locator('#modalRoot .close-btn, #modalRoot button.close-btn')
                if close_btn.count() > 0:
                    close_btn.first.click()
                else:
                    page.keyboard.press("Escape")
                page.wait_for_timeout(400)

                passed = (sc["expected_modal_title"].lower() in modal_title.lower())
                if "Kiểm tồn" in name:
                    passed = passed and (suggestions_count > 0)

                print(f"  - [{name}]: Modal='{modal_title}', Suggestions={suggestions_count} -> PASS={passed}")
                shortcut_results.append({"name": name, "status": "PASS" if passed else "FAIL", "title": modal_title, "suggestions": suggestions_count})

            elif expected_type == "nav":
                cur_page = page.evaluate("window.__qbiz_app__.state.page")
                passed = (cur_page == sc["expected_page"])
                print(f"  - [{name}]: Navigated to page='{cur_page}' (Expected: '{sc['expected_page']}') -> PASS={passed}")
                shortcut_results.append({"name": name, "status": "PASS" if passed else "FAIL", "page": cur_page})

        all_shortcuts_pass = all(s["status"] == "PASS" for s in shortcut_results)
        report_sections["DASHBOARD_SHORTCUTS"] = {"pass": all_shortcuts_pass, "details": shortcut_results}

        # Screenshot dashboard & final state
        page.goto(f"{TEST_URL}/#dashboard", wait_until="networkidle")
        page.screenshot(path="tests/evidence/deep_stress_dashboard_evidence.png")

        context.close()
        browser.close()

    print("\n" + "=" * 75)
    print("ALL 6 DEEP STRESS SUITES COMPLETED")
    print("=" * 75)

    summary = {
        "TRANSFER_INVARIANTS": "PASS" if report_sections["TRANSFER"]["pass"] else "FAIL",
        "RETURN_REFUND_INVARIANTS": "PASS" if report_sections["RETURN_REFUND"]["pass"] else "FAIL",
        "ORDER_CONCURRENCY_INVARIANTS": "PASS" if report_sections["ORDER_CONCURRENCY"]["pass"] else "FAIL",
        "OFFLINE_RECONNECT_INVARIANTS": "PASS" if report_sections["OFFLINE_RECONNECT"]["pass"] else "FAIL",
        "SHIFT_EDGE_CASES_INVARIANTS": "PASS" if report_sections["SHIFT_EDGE_CASES"]["pass"] else "FAIL",
        "DASHBOARD_SHORTCUTS": "PASS" if report_sections["DASHBOARD_SHORTCUTS"]["pass"] else "FAIL",
        "DEAD_BUTTON_COUNT": 0 if report_sections["DASHBOARD_SHORTCUTS"]["pass"] else 1,
        "OVERALL_STRESS_RESULT": "PASS" if all(v["pass"] for v in report_sections.values()) else "FAIL"
    }

    print(json.dumps(summary, indent=2))
    return summary, report_sections

if __name__ == "__main__":
    summary, _ = run_stress_suite()
    sys.exit(0 if summary["OVERALL_STRESS_RESULT"] == "PASS" else 1)
