"""
QBIZ KHO PRODUCTION V1 — GATE 2 LOCAL BACKUP EXPORTER
Spec: CMD_20260925_GATE2_INITIAL_MIGRATION_CATALOG_SYNC.txt (§1 BACKUP FIRST)

Exports full IndexedDB data with metadata:
- local DB version (12)
- export timestamp
- counts by store
- device_id, register_id
- SHA-256 checksum
"""

import sys
import os
import json
import time
import hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

APP_DIR = Path(__file__).resolve().parent.parent
BACKUP_DIR = APP_DIR / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

def create_backup():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:4180", wait_until="networkidle")
        page.wait_for_timeout(1000)
        
        dump = page.evaluate("""async () => {
            const req = indexedDB.open('qbiz_kho_v1');
            return new Promise((resolve) => {
                req.onsuccess = () => {
                    const db = req.result;
                    const storeNames = Array.from(db.objectStoreNames);
                    const results = {};
                    let remaining = storeNames.length;
                    if (!remaining) return resolve({ version: db.version, stores: results });
                    
                    const tx = db.transaction(storeNames, 'readonly');
                    for (const name of storeNames) {
                        const s = tx.objectStore(name);
                        const q = s.getAll();
                        q.onsuccess = () => {
                            results[name] = q.result;
                            remaining--;
                            if (remaining === 0) resolve({ version: db.version, stores: results });
                        };
                        q.onerror = () => {
                            results[name] = [];
                            remaining--;
                            if (remaining === 0) resolve({ version: db.version, stores: results });
                        };
                    }
                };
            });
        }""")
        browser.close()

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_filename = f"local_v12_backup_{timestamp}.json"
    backup_path = BACKUP_DIR / backup_filename

    counts_by_store = {k: len(v) for k, v in dump["stores"].items()}
    settings_map = {item["id"]: item.get("value") for item in dump["stores"].get("settings", [])}

    metadata = {
        "db_version": dump["version"],
        "export_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "device_id": settings_map.get("device_id", "unknown"),
        "register_id": settings_map.get("register_id", "unknown"),
        "counts_by_store": counts_by_store,
        "total_records": sum(counts_by_store.values()),
    }

    full_backup = {
        "metadata": metadata,
        "data": dump["stores"]
    }

    backup_bytes = json.dumps(full_backup, indent=2, ensure_ascii=False).encode("utf-8")
    checksum = hashlib.sha256(backup_bytes).hexdigest()
    full_backup["metadata"]["sha256"] = checksum

    backup_path.write_bytes(json.dumps(full_backup, indent=2, ensure_ascii=False).encode("utf-8"))

    print("=== LOCAL BACKUP CREATED SUCCESSFULLY ===")
    print(f"File: {backup_path.name}")
    print(f"Path: {backup_path}")
    print(f"DB Version: {metadata['db_version']}")
    print(f"Total Records: {metadata['total_records']}")
    print(f"Device ID: {metadata['device_id']}")
    print(f"Register ID: {metadata['register_id']}")
    print(f"SHA256 Checksum: {checksum}")
    print("\nCounts by Store:")
    for k, v in sorted(counts_by_store.items()):
        if v > 0:
            print(f"  - {k}: {v}")

    return str(backup_path), checksum, metadata

if __name__ == "__main__":
    create_backup()
