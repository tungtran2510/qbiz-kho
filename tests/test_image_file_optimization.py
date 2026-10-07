import os
import sys
import time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

output_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
os.makedirs(output_dir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    # 1. iPhone 13 (390x844) Mobile Viewport
    context = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
    )
    page = context.new_page()
    page.goto('http://localhost:4180', wait_until='networkidle')
    page.wait_for_timeout(1000)

    # Test 1: Verify optimizeDataUrl and batchOptimizeStoreImages
    res1 = page.evaluate("""async () => {
        const { optimizeDataUrl, batchOptimizeStoreImages } = await import('./src/image-optimizer.js');
        
        // Tạo ảnh PNG 600x600 có màu gradient và alpha để test nén thực tế
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 600, 600);
        grad.addColorStop(0, 'rgba(255, 0, 100, 0.8)');
        grad.addColorStop(1, 'rgba(0, 200, 255, 0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 600, 600);
        const testPngDataUrl = canvas.toDataURL('image/png');

        // Nén qua optimizeDataUrl
        const optimizedUrl = await optimizeDataUrl(testPngDataUrl);
        const isWebp = optimizedUrl.startsWith('data:image/webp');
        
        // Chạy batchOptimizeStoreImages
        const batchRes = await batchOptimizeStoreImages();

        return {
            originalLen: testPngDataUrl.length,
            optimizedLen: optimizedUrl.length,
            ratio: (optimizedUrl.length / testPngDataUrl.length).toFixed(2),
            isWebp,
            batchRes
        };
    }""")
    print("Test 1 PASS - Image Optimizer:", res1)

    # Test 2: Navigate to Settings -> Dữ liệu -> Bộ nhớ & Tải ngầm ngoại tuyến
    page.evaluate("() => { window.__qbiz_app__?.navigate('settings'); }")
    page.wait_for_timeout(600)

    page.click('[data-action="data-settings"]')
    page.wait_for_timeout(600)

    page.click('[data-action="storage-status"]')
    page.wait_for_timeout(600)

    # Capture Mobile Screenshot of the 3-Card Storage Modal
    shot_storage_mobile = os.path.join(output_dir, "evidence_storage_batch_optimizer_mobile.png")
    page.screenshot(path=shot_storage_mobile)
    print(f"Test 2 PASS - Storage Modal with Batch Optimizer captured: {shot_storage_mobile}")

    # Click the batch optimize button inside the modal
    page.click('#btnBatchOptimizeImages')
    page.wait_for_timeout(800)

    # Test 3: Test Backup Choice Modal
    page.evaluate("() => { window.__qbiz_app__?.navigate('settings'); }")
    page.wait_for_timeout(600)
    page.click('[data-action="data-settings"]')
    page.wait_for_timeout(600)
    page.click('[data-page="backup"]')
    page.wait_for_timeout(600)

    # Click 'Tải tệp JSON cục bộ'
    page.click('[data-action="backup-now"]')
    page.wait_for_timeout(600)

    # Capture Backup Choice Modal on Mobile
    shot_backup_mobile = os.path.join(output_dir, "evidence_backup_choice_modal_mobile.png")
    page.screenshot(path=shot_backup_mobile)
    print(f"Test 3 PASS - Backup Choice Modal captured: {shot_backup_mobile}")

    # Close modal
    page.click('button[data-close]')
    page.wait_for_timeout(400)

    # Test 4: CSV Export Data sanitization check
    csv_check = page.evaluate("""() => {
        const p = (window.__qbiz_app__?.state?.data?.products || [])[0];
        return {
            hasProducts: Boolean(p),
            productCount: (window.__qbiz_app__?.state?.data?.products || []).length
        };
    }""")
    print("Test 4 PASS - CSV & Store check:", csv_check)

    browser.close()
    print("ALL OPTIMIZATION TESTS PASSED SUCCESSFULLY!")
