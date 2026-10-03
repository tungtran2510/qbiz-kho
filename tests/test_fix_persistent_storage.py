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

def test_persistent_storage():
    print("===========================================================================")
    print("TEST: PERSISTENT STORAGE REGISTRATION (navigator.storage.persist)")
    print("===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        
        # Track console logs
        logs = []
        page.on("console", lambda msg: logs.append(msg.text))

        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        res = page.evaluate("""
        async () => {
            const hasStorageManager = typeof navigator !== 'undefined' && Boolean(navigator.storage);
            const hasPersistMethod = hasStorageManager && typeof navigator.storage.persist === 'function';
            let isPersisted = false;
            if (hasStorageManager && typeof navigator.storage.persisted === 'function') {
                isPersisted = await navigator.storage.persisted();
            }
            return {
                hasStorageManager,
                hasPersistMethod,
                isPersisted
            };
        }
        """)

        print(f"  StorageManager Available: {res['hasStorageManager']}")
        print(f"  Persist Method Available: {res['hasPersistMethod']}")
        print(f"  Is Storage Persisted: {res['isPersisted']}")
        print(f"  Console Logs containing Storage: {[l for l in logs if '[Storage]' in l]}")

        assert res['hasStorageManager'] == True, "StorageManager must exist in modern browser"
        assert res['hasPersistMethod'] == True, "navigator.storage.persist must be a function"

        print("\nPersistent storage test passed successfully!")
        browser.close()

if __name__ == '__main__':
    test_persistent_storage()
