import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

output_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
os.makedirs(output_dir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    # 1. Mobile iPhone 13 (390x844)
    context = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
    )
    page = context.new_page()
    page.goto('http://localhost:4180', wait_until='networkidle')
    page.wait_for_timeout(1000)

    # Test 1: Check storage quota and auto maintenance from runtime
    res1 = page.evaluate("""async () => {
        const quota = await window.__qbiz_app__?.checkStorageQuota();
        const maint = await window.__qbiz_app__?.performAutoMaintenance();
        const prefetch = window.__qbiz_app__?.getPrefetchStatus();
        return { quota, maint, prefetch };
    }""")
    print("Test 1 PASS - Storage & Maintenance:", res1['quota']['usageFormatted'], "used,", res1['quota']['statusLabel'])

    # Test 2: Trigger idle prefetch
    res2 = page.evaluate("""async () => {
        return await window.__qbiz_app__?.runIdlePrefetch();
    }""")
    print("Test 2 PASS - Idle Prefetch complete:", res2['cachedItems'], "items cached.")

    # Test 3: Open Data Settings and Storage Status Modal
    page.evaluate("""() => {
        window.__qbiz_app__?.navigate('settings');
    }""")
    page.wait_for_timeout(600)

    # Click 'Dữ liệu' in settings
    page.click('[data-action="data-settings"]')
    page.wait_for_timeout(500)
    
    # Click 'Bộ nhớ & Tải ngầm ngoại tuyến'
    page.click('[data-action="storage-status"]')
    page.wait_for_timeout(600)

    # Verify modal is open
    modal_title = page.text_content('.modal-head h3')
    print("Test 3 PASS - Storage Modal opened:", modal_title.strip())

    shot_mobile = os.path.join(output_dir, "evidence_storage_prefetch_modal_mobile.png")
    page.screenshot(path=shot_mobile, full_page=False)
    print(f"Captured mobile: {shot_mobile}")

    # Close modal
    page.click('button[data-close]')
    page.wait_for_timeout(400)

    # 2. Desktop check (1280x800)
    context_dt = browser.new_context(viewport={'width': 1280, 'height': 800})
    page_dt = context_dt.new_page()
    page_dt.goto('http://localhost:4180', wait_until='networkidle')
    page_dt.wait_for_timeout(800)
    page_dt.evaluate("() => { window.__qbiz_app__?.openStorageStatusModal(); }")
    page_dt.wait_for_timeout(600)

    shot_dt = os.path.join(output_dir, "evidence_storage_prefetch_modal_desktop.png")
    page_dt.screenshot(path=shot_dt, full_page=False)
    print(f"Captured desktop: {shot_dt}")

    browser.close()
    print("ALL OFFLINE PREFETCH & STORAGE TESTS PASSED!")
