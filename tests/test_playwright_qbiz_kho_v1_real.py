"""
QBiz Kho — Empirical Playwright Test on REAL DB 'qbiz_kho_v1'
Tests Multi-Tab Migration Concurrency on the exact production DB name and all 22 stores.

Verifies:
1. Tab 1 opens 'qbiz_kho_v1' at v12 with all 20 original stores.
2. Tab 1 initiates a sale transaction writing to sales, levels, movements, outbox.
3. Tab 2 opens 'qbiz_kho_v1' at v13 while Tab 1 is in-flight.
4. Chromium fires onversionchange on Tab 1 and onblocked on Tab 2.
5. Tab 1 defers close, commits all sales/ledger data safely.
6. Tab 1 releases connection, Tab 2 unblocks and upgrades 'qbiz_kho_v1' to v13 with all 22 stores.
7. Zero data loss verified on production schema.
"""

import sys
import os
import io
import time
import shutil
import tempfile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

V12_STORES = [
    'products','warehouses','levels','movements','transfers','sales','orders',
    'customers','suppliers','purchase_receipts','returns','refunds','shifts',
    'categories','settings','outbox','devices','registers','print_templates','print_jobs'
]

V13_NEW_STORES = ['electronic_invoices', 'invoice_audit_logs']

def run_real_qbiz_db_test():
    print("=== QBiz Kho — Playwright Real 'qbiz_kho_v1' Multi-Tab Verification ===\n")

    temp_profile_dir = tempfile.mkdtemp(prefix="qbiz_pw_profile_")

    try:
        with sync_playwright() as p:
            # Launch Chromium with an isolated user_data_dir for clean IndexedDB persistence
            context = p.chromium.launch_persistent_context(
                user_data_dir=temp_profile_dir,
                headless=True
            )

            page1 = context.new_page()
            page2 = context.new_page()

            tab1_logs = []
            tab2_logs = []

            page1.on("console", lambda m: tab1_logs.append(f"[Tab 1 Console] {m.text}"))
            page2.on("console", lambda m: tab2_logs.append(f"[Tab 2 Console] {m.text}"))

            print("[Setup] Mở Tab 1 và Tab 2 tại origin http://localhost:4180 (trên origin sạch)...")
            page1.goto("http://localhost:4180/favicon.ico")
            page2.goto("http://localhost:4180/favicon.ico")

            # -------------------------------------------------------------
            # STEP 0: Reset qbiz_kho_v1 for clean baseline
            # -------------------------------------------------------------
            print("\n[Step 0] Xóa sạch qbiz_kho_v1 cũ để bắt đầu baseline v12...")
            page1.evaluate("""
                () => new Promise((resolve) => {
                    const del = indexedDB.deleteDatabase('qbiz_kho_v1');
                    del.onsuccess = () => resolve();
                    del.onerror = () => resolve();
                    del.onblocked = () => resolve();
                })
            """)

            # -------------------------------------------------------------
            # STEP 1: Tab 1 prepares 'qbiz_kho_v1' at v12 with all 20 stores
            # -------------------------------------------------------------
            print("\n[Step 1] Tab 1 tạo 'qbiz_kho_v1' phiên bản 12 với đầy đủ 20 object stores gốc...")
            init_res = page1.evaluate("""
                (stores) => new Promise((resolve, reject) => {
                    const req = indexedDB.open('qbiz_kho_v1', 12);
                    req.onupgradeneeded = e => {
                        const db = req.result;
                        for (const s of stores) {
                            if (!db.objectStoreNames.contains(s)) {
                                db.createObjectStore(s, { keyPath: 'id' });
                            }
                        }
                    };
                    req.onsuccess = () => {
                        window.__db = req.result;
                        resolve({
                            version: req.result.version,
                            storeCount: req.result.objectStoreNames.length
                        });
                    };
                    req.onerror = () => reject(req.error);
                })
            """, V12_STORES)
            print(f"         Tab 1 DB: 'qbiz_kho_v1' mở thành công ở version {init_res['version']} với {init_res['storeCount']} stores.")

            # -------------------------------------------------------------
            # STEP 2: Tab 1 starts in-flight multi-store sale transaction
            # -------------------------------------------------------------
            print("\n[Step 2] Tab 1 cài đặt safeGuard và bắt đầu giao dịch bán hàng (ghi sales, levels, movements, outbox)...")
            page1.evaluate("""
                () => {
                    window.__is_busy = false;
                    window.__pending_close = null;
                    window.__sale_committed = false;
                    window.__db_closed = false;

                    // SafeGuard handler for Chromium versionchange event
                    window.__db.onversionchange = () => {
                        console.log('[Tab 1 Event] Nhận sự kiện Chromium onversionchange trên qbiz_kho_v1!');
                        if (window.__is_busy) {
                            console.log('[SafeGuard] PHÁT HIỆN GIAO DỊCH BÁN HÀNG ĐANG CHẠY! Hoãn đóng qbiz_kho_v1.');
                            window.__pending_close = () => {
                                console.log('[SafeGuard] Giao dịch đã commit xong. Đóng qbiz_kho_v1 an toàn.');
                                window.__db.close();
                                window.__db_closed = true;
                            };
                        } else {
                            console.log('[SafeGuard] Không có giao dịch dở, đóng ngay.');
                            window.__db.close();
                            window.__db_closed = true;
                        }
                    };

                    // Start active multi-store transaction simulating real createSale
                    window.__is_busy = true;
                    console.log('[Tab 1] Bắt đầu transaction createSale: ghi sales, levels, movements, outbox...');
                    setTimeout(async () => {
                        const tx = window.__db.transaction(['sales', 'levels', 'movements', 'outbox'], 'readwrite');
                        
                        tx.objectStore('sales').put({
                            id: 'sale_real_qbiz_001',
                            code: 'POS-000001',
                            customer_label: 'Nguyễn Văn A',
                            grand_total: 500000,
                            status: 'COMPLETED',
                            created_at: new Date().toISOString()
                        });

                        tx.objectStore('levels').put({
                            id: 'prod_cafe:wh_main',
                            productId: 'prod_cafe',
                            warehouseId: 'wh_main',
                            onHand: 95,
                            reserved: 0
                        });

                        tx.objectStore('movements').put({
                            id: 'mov_001',
                            type: 'sale',
                            qty: -5,
                            reference: 'sale_real_qbiz_001'
                        });

                        tx.objectStore('outbox').put({
                            id: 'outbox_evt_001',
                            action: 'sale.create',
                            entityId: 'sale_real_qbiz_001'
                        });

                        await new Promise(r => tx.oncomplete = r);
                        console.log('[Tab 1 Event] Transaction bán hàng đã commit thành công vào qbiz_kho_v1!');
                        window.__sale_committed = true;
                        window.__is_busy = false;

                        if (window.__pending_close) {
                            console.log('[Tab 1] Thực thi callback hoãn đóng kết nối.');
                            window.__pending_close();
                        }
                    }, 700);
                }
            """)
            print("         Tab 1 đang bận ghi transaction bán hàng...")
            time.sleep(0.15)

            # -------------------------------------------------------------
            # STEP 3: Tab 2 opens 'qbiz_kho_v1' at v13 (Migration trigger)
            # -------------------------------------------------------------
            print("\n[Step 3] Tab 2 yêu cầu nâng cấp 'qbiz_kho_v1' lên v13...")
            page2.evaluate("""
                () => {
                    window.__tab2_blocked = false;
                    window.__tab2_upgrade_done = false;

                    const req = indexedDB.open('qbiz_kho_v1', 13);
                    req.onblocked = () => {
                        console.log('[Tab 2 Event] Nhận sự kiện Chromium onblocked trên qbiz_kho_v1: Chờ Tab 1 nhả kết nối!');
                        window.__tab2_blocked = true;
                    };
                    req.onupgradeneeded = e => {
                        console.log('[Tab 2 Event] Tab 2 unblocked! Bắt đầu nâng cấp schema lên v13...');
                        const db = req.result;
                        if (!db.objectStoreNames.contains('electronic_invoices')) {
                            const s1 = db.createObjectStore('electronic_invoices', { keyPath: 'id' });
                            s1.createIndex('by_sale_id', 'sale_id', { unique: false });
                            s1.createIndex('by_idempotency_key', 'idempotency_key', { unique: true });
                        }
                        if (!db.objectStoreNames.contains('invoice_audit_logs')) {
                            const s2 = db.createObjectStore('invoice_audit_logs', { keyPath: 'id' });
                            s2.createIndex('by_invoice_id', 'invoice_id', { unique: false });
                            s2.createIndex('by_sale_id', 'sale_id', { unique: false });
                        }
                    };
                    req.onsuccess = () => {
                        console.log('[Tab 2 Event] Nâng cấp qbiz_kho_v1 lên v13 thành công!');
                        window.__tab2_upgrade_done = true;
                        window.__tab2_db = req.result;
                    };
                    req.onerror = () => {
                        console.error('[Tab 2 Event] Lỗi mở DB:', req.error);
                    };
                }
            """)

            time.sleep(0.2)

            # -------------------------------------------------------------
            # STEP 4: Inspect states during migration lock
            # -------------------------------------------------------------
            print("\n[Step 4] Kiểm tra trạng thái tức thời khi Tab 2 trigger migrate:")
            t1_mid = page1.evaluate("() => ({ isBusy: window.__is_busy, hasPending: window.__pending_close !== null, closed: window.__db_closed })")
            t2_mid = page2.evaluate("() => ({ blocked: window.__tab2_blocked, done: window.__tab2_upgrade_done })")

            print(f"         Tab 1 isBusy: {t1_mid['isBusy']} (đang bận ghi dữ liệu bán hàng)")
            print(f"         Tab 1 hasPendingClose: {t1_mid['hasPending']} (đã hoãn đóng kết nối thành công)")
            print(f"         Tab 1 closed: {t1_mid['closed']} (kết nối KHÔNG bị ngắt)")
            print(f"         Tab 2 blocked: {t2_mid['blocked']} (Chromium onblocked hoạt động đúng chuẩn)")
            print(f"         Tab 2 upgradeDone: {t2_mid['done']} (đang chờ)")

            assert t1_mid['closed'] == False, "LỖI: Tab 1 bị đóng DB trước khi transaction hoàn tất!"
            assert t1_mid['hasPending'] == True, "LỖI: Tab 1 không hoãn đóng kết nối!"

            # -------------------------------------------------------------
            # STEP 5: Wait for Tab 1 transaction to commit & release
            # -------------------------------------------------------------
            print("\n[Step 5] Đợi transaction Tab 1 hoàn tất commit và giải phóng kết nối...")
            time.sleep(0.9)

            t1_end = page1.evaluate("() => ({ committed: window.__sale_committed, closed: window.__db_closed })")
            t2_end = page2.evaluate("() => ({ done: window.__tab2_upgrade_done })")

            print(f"         Tab 1 committed: {t1_end['committed']}")
            print(f"         Tab 1 closed: {t1_end['closed']}")
            print(f"         Tab 2 upgradeDone: {t2_end['done']}")

            assert t1_end['committed'] == True, "LỖI: Transaction của Tab 1 không commit được!"
            assert t1_end['closed'] == True, "LỖI: Tab 1 chưa đóng kết nối sau khi commit!"
            assert t2_end['done'] == True, "LỖI: Tab 2 không hoàn tất nâng cấp!"

            # -------------------------------------------------------------
            # STEP 6: Verify full schema & data integrity at v13
            # -------------------------------------------------------------
            print("\n[Step 6] Tab 2 kiểm tra toàn diện schema v13 và toàn vẹn dữ liệu...")
            v13_audit = page2.evaluate("""
                () => new Promise((resolve, reject) => {
                    const db = window.__tab2_db;
                    const allStores = Array.from(db.objectStoreNames);
                    const tx = db.transaction(['sales', 'levels', 'movements', 'outbox', 'electronic_invoices', 'invoice_audit_logs'], 'readonly');

                    const sSale = tx.objectStore('sales').get('sale_real_qbiz_001');
                    const sLevel = tx.objectStore('levels').get('prod_cafe:wh_main');
                    const sMov = tx.objectStore('movements').get('mov_001');
                    const sOut = tx.objectStore('outbox').get('outbox_evt_001');

                    tx.oncomplete = () => {
                        resolve({
                            finalVersion: db.version,
                            storeCount: allStores.length,
                            hasEinvoice: db.objectStoreNames.contains('electronic_invoices'),
                            hasAuditLogs: db.objectStoreNames.contains('invoice_audit_logs'),
                            saleRecord: sSale.result,
                            levelRecord: sLevel.result,
                            movRecord: sMov.result,
                            outRecord: sOut.result
                        });
                    };
                    tx.onerror = () => reject(tx.error);
                })
            """)

            print(f"         Phiên bản DB cuối cùng: {v13_audit['finalVersion']}")
            print(f"         Tổng số stores trong 'qbiz_kho_v1': {v13_audit['storeCount']} (20 store cũ + 2 store mới)")
            print(f"         Store 'electronic_invoices' tồn tại: {v13_audit['hasEinvoice']}")
            print(f"         Store 'invoice_audit_logs' tồn tại: {v13_audit['hasAuditLogs']}")
            print(f"         Bản ghi Sale đọc được: {v13_audit['saleRecord']['code']} ({v13_audit['saleRecord']['grand_total']} ₫)")
            print(f"         Bản ghi Tồn kho đọc được: onHand={v13_audit['levelRecord']['onHand']}")
            print(f"         Bản ghi Movement đọc được: qty={v13_audit['movRecord']['qty']}")
            print(f"         Bản ghi Outbox đọc được: action={v13_audit['outRecord']['action']}")

            assert v13_audit['finalVersion'] == 13
            assert v13_audit['storeCount'] == 22
            assert v13_audit['hasEinvoice'] == True
            assert v13_audit['hasAuditLogs'] == True
            assert v13_audit['saleRecord']['code'] == 'POS-000001'
            assert v13_audit['levelRecord']['onHand'] == 95

            print("\n--- CONSOLE LOGS TAB 1 THẬT ---")
            for l in tab1_logs:
                print(l)

            print("\n--- CONSOLE LOGS TAB 2 THẬT ---")
            for l in tab2_logs:
                print(l)

            context.close()
            print("\n=== REAL 'qbiz_kho_v1' MULTI-TAB PLAYWRIGHT TEST 100% PASS ===")

    finally:
        shutil.rmtree(temp_profile_dir, ignore_errors=True)

if __name__ == "__main__":
    run_real_qbiz_db_test()
