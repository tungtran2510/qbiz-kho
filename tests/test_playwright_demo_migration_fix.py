"""
QBiz Kho — Playwright Test: Demo Loading & IndexedDB Migration (v12 -> v13)
Strict Assertions for Scenario A (Clean Context) and Scenario B (v12 Upgrade Context)
"""

import sys
import io
import time
import json
import tempfile
import shutil

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

V12_STORES = [
    'products', 'warehouses', 'levels', 'movements', 'transfers',
    'sales', 'orders', 'customers', 'suppliers', 'purchase_receipts',
    'returns', 'refunds', 'shifts', 'categories', 'settings',
    'outbox', 'devices', 'registers', 'print_templates', 'print_jobs'
]

ALL_22_STORES = V12_STORES + ['electronic_invoices', 'invoice_audit_logs']

def test_migration_and_demo():
    print("======================================================================")
    print(" QBiz Kho — KIỂM TRA TOÀN DIỆN FIX NẠP DEMO & MIGRATION V12 -> V13")
    print("======================================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------------------------------------------------------------------
        # KỊCH BẢN A: Trình duyệt hoàn toàn mới (Clean context, chưa từng có DB)
        # ---------------------------------------------------------------------
        print(">>> [KỊCH BẢN A] Trình duyệt HOÀN TOÀN MỚI (clean context)...")
        context_a = browser.new_context()
        page_a = context_a.new_page()

        page_a_errors = []
        page_a.on("pageerror", lambda err: page_a_errors.append(str(err)))
        page_a.on("console", lambda m: page_a_errors.append(m.text) if m.type == "error" else None)

        # Đảm bảo xóa DB sạch sẽ trước khi chạy Scenario A
        page_a.goto("http://localhost:4180/favicon.ico")
        page_a.evaluate("""() => new Promise((resolve) => {
            const req = indexedDB.deleteDatabase('qbiz_kho_v1');
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
        })""")

        print("    1. Mở trang chủ ứng dụng http://localhost:4180/ ...")
        page_a.goto("http://localhost:4180/")
        page_a.wait_for_selector(".demo-cta-btn", timeout=10000)
        time.sleep(0.5)

        print("    2. Bấm nút 'Xem shop demo' (.demo-cta-btn)...")
        page_a.click(".demo-cta-btn")
        time.sleep(1.5)

        toast_a = page_a.evaluate("""() => {
            const t = document.querySelector('.toast, [class*="toast"]');
            return t ? t.innerText : '';
        }""")
        print(f"    Toast hiển thị: {toast_a}")

        # Assert no IDBDatabase errors
        assert not any("IDBDatabase" in e or "Failed to execute 'transaction'" in e for e in page_a_errors), \
            f"Kịch bản A có lỗi IndexedDB: {page_a_errors}"
        assert "Lỗi nạp demo" not in toast_a, f"Kịch bản A bị lỗi nạp demo: {toast_a}"

        # Kiểm tra trạng thái DB
        db_state_a = page_a.evaluate("""() => new Promise((resolve) => {
            const req = indexedDB.open('qbiz_kho_v1');
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(['electronic_invoices', 'invoice_audit_logs'], 'readonly');
                const sInv = tx.objectStore('electronic_invoices');
                const sAudit = tx.objectStore('invoice_audit_logs');
                const info = {
                    version: db.version,
                    stores: Array.from(db.objectStoreNames),
                    invIndexes: Array.from(sInv.indexNames),
                    auditIndexes: Array.from(sAudit.indexNames)
                };
                db.close();
                resolve(info);
            };
        })""")

        print(f"    DB Version: {db_state_a['version']}")
        print(f"    Tổng số stores: {len(db_state_a['stores'])}")
        print(f"    Index electronic_invoices: {db_state_a['invIndexes']}")
        print(f"    Index invoice_audit_logs: {db_state_a['auditIndexes']}")

        assert db_state_a['version'] == 13, f"Expected DB version 13, got {db_state_a['version']}"
        assert len(db_state_a['stores']) == 22, f"Expected 22 stores, got {len(db_state_a['stores'])}"
        for s in ALL_22_STORES:
            assert s in db_state_a['stores'], f"Store {s} thiếu trong DB"
        assert 'by_sale_id' in db_state_a['invIndexes']
        assert 'by_idempotency_key' in db_state_a['invIndexes']
        assert 'by_invoice_id' in db_state_a['auditIndexes']
        assert 'by_sale_id' in db_state_a['auditIndexes']

        print("    => KỊCH BẢN A: PASS [OK]\n")
        context_a.close()

        # ---------------------------------------------------------------------
        # KỊCH BẢN B: Trình duyệt ĐÃ CÓ SẴN IndexedDB ở version 12
        # Giả lập chính xác thiết bị di động cũ kết nối qua LAN
        # ---------------------------------------------------------------------
        print(">>> [KỊCH BẢN B] Trình duyệt ĐÃ CÓ SẴN IndexedDB version 12 (20 stores)...")
        context_b = browser.new_context()
        page_b = context_b.new_page()

        page_b_errors = []
        page_b.on("pageerror", lambda err: page_b_errors.append(str(err)))
        page_b.on("console", lambda m: page_b_errors.append(m.text) if m.type == "error" else None)

        # 1. Khởi tạo DB v12 với 20 stores và nạp sẵn dữ liệu mẫu
        page_b.goto("http://localhost:4180/favicon.ico")
        page_b.evaluate(f"""() => new Promise((resolve, reject) => {{
            const del = indexedDB.deleteDatabase('qbiz_kho_v1');
            del.onsuccess = del.onerror = del.onblocked = () => {{
                const req = indexedDB.open('qbiz_kho_v1', 12);
                req.onupgradeneeded = (e) => {{
                    const db = req.result;
                    const stores = {json.dumps(V12_STORES)};
                    for (const s of stores) {{
                        if (!db.objectStoreNames.contains(s)) {{
                            db.createObjectStore(s, {{ keyPath: 'id' }});
                        }}
                    }}
                }};
                req.onsuccess = () => {{
                    const db = req.result;
                    const tx = db.transaction(['products', 'settings'], 'readwrite');
                    tx.objectStore('products').put({{ id: 'test-v12-item', name: 'Sản phẩm cũ v12' }});
                    tx.objectStore('settings').put({{ id: 'store_info', name: 'Cửa hàng cũ v12' }});
                    tx.oncomplete = () => {{
                        db.close();
                        resolve();
                    }};
                }};
                req.onerror = () => reject(req.error);
            }};
        }})""")

        # Kiểm tra trước khi mở app: chắc chắn là v12 với 20 stores
        v12_check = page_b.evaluate("""() => new Promise((resolve) => {
            const req = indexedDB.open('qbiz_kho_v1');
            req.onsuccess = () => {
                const db = req.result;
                resolve({ version: db.version, count: db.objectStoreNames.length, hasInv: db.objectStoreNames.contains('electronic_invoices') });
                db.close();
            };
        })""")
        print(f"    Trạng thái DB cũ trước nâng cấp: Version {v12_check['version']}, stores: {v12_check['count']}, có electronic_invoices? {v12_check['hasInv']}")
        assert v12_check['version'] == 12, "Pre-condition: DB phải ở version 12"
        assert v12_check['count'] == 20, "Pre-condition: DB phải có đúng 20 stores"
        assert not v12_check['hasInv'], "Pre-condition: Không được có electronic_invoices"

        # 2. Mở app đã cập nhật (sẽ kích hoạt auto-upgrade v12 -> v13)
        print("    1. Mở app đã cập nhật lên v13 tại http://localhost:4180/ ...")
        page_b.goto("http://localhost:4180/")
        page_b.wait_for_selector(".demo-cta-btn", timeout=10000)
        time.sleep(0.5)

        # 3. Bấm "Xem shop demo"
        print("    2. Bấm nút 'Xem shop demo' (.demo-cta-btn)...")
        page_b.click(".demo-cta-btn")
        time.sleep(1.5)

        toast_b = page_b.evaluate("""() => {
            const t = document.querySelector('.toast, [class*="toast"]');
            return t ? t.innerText : '';
        }""")
        print(f"    Toast hiển thị: {toast_b}")

        # Assert no IDBDatabase errors
        assert not any("IDBDatabase" in e or "Failed to execute 'transaction'" in e for e in page_b_errors), \
            f"Kịch bản B có lỗi IndexedDB: {page_b_errors}"
        assert "Lỗi nạp demo" not in toast_b, f"Kịch bản B bị lỗi nạp demo: {toast_b}"

        # Kiểm tra trạng thái DB sau upgrade
        db_state_b = page_b.evaluate("""() => new Promise((resolve) => {
            const req = indexedDB.open('qbiz_kho_v1');
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(['electronic_invoices', 'invoice_audit_logs'], 'readonly');
                const sInv = tx.objectStore('electronic_invoices');
                const sAudit = tx.objectStore('invoice_audit_logs');
                const info = {
                    version: db.version,
                    stores: Array.from(db.objectStoreNames),
                    invIndexes: Array.from(sInv.indexNames),
                    auditIndexes: Array.from(sAudit.indexNames)
                };
                db.close();
                resolve(info);
            };
        })""")

        print(f"    DB Version sau upgrade: {db_state_b['version']}")
        print(f"    Tổng số stores sau upgrade: {len(db_state_b['stores'])}")
        print(f"    Index electronic_invoices: {db_state_b['invIndexes']}")
        print(f"    Index invoice_audit_logs: {db_state_b['auditIndexes']}")

        assert db_state_b['version'] == 13, f"Expected DB version 13, got {db_state_b['version']}"
        assert len(db_state_b['stores']) == 22, f"Expected 22 stores, got {len(db_state_b['stores'])}"
        for s in ALL_22_STORES:
            assert s in db_state_b['stores'], f"Store {s} thiếu sau migration"
        assert 'by_sale_id' in db_state_b['invIndexes'], "Thiếu index by_sale_id trên electronic_invoices"
        assert 'by_idempotency_key' in db_state_b['invIndexes'], "Thiếu index by_idempotency_key trên electronic_invoices"
        assert 'by_invoice_id' in db_state_b['auditIndexes'], "Thiếu index by_invoice_id trên invoice_audit_logs"
        assert 'by_sale_id' in db_state_b['auditIndexes'], "Thiếu index by_sale_id trên invoice_audit_logs"

        print("    => KỊCH BẢN B: PASS [OK]\n")
        context_b.close()
        browser.close()

    print("======================================================================")
    print(" TOÀN BỘ PHÉP THỬ THÀNH CÔNG: MIGRATION V12->V13 & NẠP DEMO HOẠT ĐỘNG HOÀN HẢO")
    print("======================================================================")

if __name__ == '__main__':
    test_migration_and_demo()
