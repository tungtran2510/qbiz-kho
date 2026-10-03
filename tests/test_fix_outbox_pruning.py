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

def test_outbox_pruning():
    print("===========================================================================")
    print("TEST: OUTBOX PRUNING & SAFE RETENTION")
    print("===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)

        # Set up test data in outbox store:
        # 1. Old SYNCED event (45 days old) -> SHOULD BE PRUNED
        # 2. Recent SYNCED event (1 day old) -> MUST BE KEPT
        # 3. Old PENDING event (45 days old) -> MUST BE KEPT (never prune unsynced data!)
        # 4. Old ERROR event (45 days old) -> MUST BE KEPT (never prune unsynced errors!)
        setup_result = page.evaluate("""
        async () => {
            const { put, getAll } = await import('/src/db.js');
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;
            const t45DaysAgo = new Date(now - 45 * dayMs).toISOString();
            const t1DayAgo = new Date(now - 1 * dayMs).toISOString();

            const eOldSynced = {
                id: 'test-outbox-old-synced',
                operation_id: 'test-outbox-old-synced',
                event_id: 'evt-old-synced',
                sync_status: 'SYNCED',
                created_at: t45DaysAgo,
                synced_at: t45DaysAgo,
                updated_at: t45DaysAgo
            };
            const eRecentSynced = {
                id: 'test-outbox-recent-synced',
                operation_id: 'test-outbox-recent-synced',
                event_id: 'evt-recent-synced',
                sync_status: 'SYNCED',
                created_at: t1DayAgo,
                synced_at: t1DayAgo,
                updated_at: t1DayAgo
            };
            const eOldPending = {
                id: 'test-outbox-old-pending',
                operation_id: 'test-outbox-old-pending',
                event_id: 'evt-old-pending',
                sync_status: 'PENDING',
                created_at: t45DaysAgo,
                updated_at: t45DaysAgo
            };
            const eOldError = {
                id: 'test-outbox-old-error',
                operation_id: 'test-outbox-old-error',
                event_id: 'evt-old-error',
                sync_status: 'ERROR',
                created_at: t45DaysAgo,
                updated_at: t45DaysAgo
            };

            await put('outbox', eOldSynced);
            await put('outbox', eRecentSynced);
            await put('outbox', eOldPending);
            await put('outbox', eOldError);

            return { success: true };
        }
        """)
        assert setup_result["success"], "Test outbox events setup failed"

        # Run pruneSyncedOutbox with default 30 days
        prune_result = page.evaluate("""
        async () => {
            const { pruneSyncedOutbox } = await import('/src/sync.js');
            const res = await pruneSyncedOutbox({ maxAgeDays: 30 });
            const { getAll } = await import('/src/db.js');
            const allOutbox = await getAll('outbox');
            return {
                pruneRes: res,
                remainingIds: allOutbox.map(o => o.id || o.operation_id)
            };
        }
        """)

        print(f"Prune result: {prune_result['pruneRes']}")
        print(f"Remaining IDs in outbox: {prune_result['remainingIds']}")

        # 1. The old SYNCED event MUST have been pruned
        assert 'test-outbox-old-synced' not in prune_result['remainingIds'], \
            "test-outbox-old-synced (45 days old SYNCED) MUST be pruned!"

        # 2. The recent SYNCED event MUST remain
        assert 'test-outbox-recent-synced' in prune_result['remainingIds'], \
            "test-outbox-recent-synced (1 day old SYNCED) MUST NOT be pruned!"

        # 3. The old PENDING event MUST remain
        assert 'test-outbox-old-pending' in prune_result['remainingIds'], \
            "test-outbox-old-pending (45 days old PENDING) MUST NEVER be pruned!"

        # 4. The old ERROR event MUST remain
        assert 'test-outbox-old-error' in prune_result['remainingIds'], \
            "test-outbox-old-error (45 days old ERROR) MUST NEVER be pruned!"

        # Clean up test events
        page.evaluate("""
        async () => {
            const { remove } = await import('/src/db.js');
            await remove('outbox', 'test-outbox-recent-synced');
            await remove('outbox', 'test-outbox-old-pending');
            await remove('outbox', 'test-outbox-old-error');
        }
        """)

        print("TEST_FIX_OUTBOX_PRUNING: ALL CHECKS PASS 100%")
        browser.close()

if __name__ == "__main__":
    test_outbox_pruning()
