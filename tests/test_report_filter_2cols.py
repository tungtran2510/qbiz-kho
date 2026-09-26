import os
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def test_report_filter():
    os.makedirs('tests/evidence', exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        # 1. MOBILE TEST (390 x 844)
        print("--- Running Mobile Test (390x844) ---")
        context_mobile = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context_mobile.new_page()
        
        page.goto('http://localhost:4180/')
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        
        # Dismiss landing overlay if present
        retail_btn = page.locator('button[data-industry="retail"]')
        if retail_btn.count() > 0:
            retail_btn.click()
            time.sleep(1)
        elif page.locator('[data-action="preview-demo"]').count() > 0:
            page.locator('[data-action="preview-demo"]').click()
            time.sleep(1)
            
        # Navigate to Reports
        page.evaluate("() => { if (window.__qbiz_app__ && window.__qbiz_app__.navigate) window.__qbiz_app__.navigate('reports'); else if (window.qbiz && window.qbiz.navigate) window.qbiz.navigate('reports'); }")
        time.sleep(1)
        
        # Verify dropdowns exist
        report_range = page.locator('#reportRange')
        report_wh = page.locator('#reportWarehouse')
        
        assert report_range.count() == 1, "Expected #reportRange dropdown"
        assert report_wh.count() == 1, "Expected #reportWarehouse dropdown"
        
        # Verify 2 columns on 1 row
        box_range = report_range.bounding_box()
        box_wh = report_wh.bounding_box()
        print(f"Mobile #reportRange box: {box_range}")
        print(f"Mobile #reportWarehouse box: {box_wh}")
        
        # Check Y position alignment (same row)
        y_diff = abs(box_range['y'] - box_wh['y'])
        print(f"Y difference between range and wh selects: {y_diff:.2f}px")
        assert y_diff < 10, f"Dropdowns should be on the same row, y_diff={y_diff}"
        
        # Check widths are balanced (~40-60% of container width)
        assert box_range['width'] > 120, f"Range width too small: {box_range['width']}"
        assert box_wh['width'] > 120, f"Warehouse width too small: {box_wh['width']}"
        
        # Screenshot mobile default
        page.screenshot(path='tests/evidence/evidence_report_filter_mobile_390.png')
        print("Captured tests/evidence/evidence_report_filter_mobile_390.png")
        
        # 2. Select 'custom' in #reportRange
        print("Selecting 'custom' in #reportRange...")
        report_range.select_option('custom')
        time.sleep(0.5)
        
        custom_range = page.locator('.report-custom-range')
        assert custom_range.count() == 1, "Expected .report-custom-range to appear"
        start_input = page.locator('#reportCustomStart')
        end_input = page.locator('#reportCustomEnd')
        apply_btn = page.locator('[data-report-custom-apply]')
        
        assert start_input.count() == 1, "Expected #reportCustomStart"
        assert end_input.count() == 1, "Expected #reportCustomEnd"
        assert apply_btn.count() == 1, "Expected apply button"
        
        box_custom = custom_range.bounding_box()
        print(f"Custom range box: {box_custom}")
        assert box_custom['y'] >= box_range['y'] + box_range['height'], "Custom range should be below the 2 dropdowns"
        
        # Screenshot mobile custom range
        page.screenshot(path='tests/evidence/evidence_report_custom_range_390.png')
        print("Captured tests/evidence/evidence_report_custom_range_390.png")
        
        # 3. Select 'month' to ensure custom range collapses cleanly
        print("Selecting 'month' in #reportRange...")
        report_range.select_option('month')
        time.sleep(0.5)
        assert page.locator('.report-custom-range').count() == 0, ".report-custom-range should disappear when not 'custom'"
        print("Custom range collapsed successfully.")
        
        # Test warehouse change
        report_wh.select_option(index=1)
        time.sleep(0.5)
        print("Warehouse select changed successfully.")
        
        context_mobile.close()
        
        # 4. DESKTOP TEST (1280 x 800)
        print("\n--- Running Desktop Test (1280x800) ---")
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 800})
        page_d = context_desktop.new_page()
        page_d.goto('http://localhost:4180/')
        page_d.wait_for_load_state('networkidle')
        time.sleep(1)
        
        page_d.evaluate("() => { if (window.__qbiz_app__ && window.__qbiz_app__.navigate) window.__qbiz_app__.navigate('reports'); else if (window.qbiz && window.qbiz.navigate) window.qbiz.navigate('reports'); }")
        time.sleep(1)
        
        report_range_d = page_d.locator('#reportRange')
        report_wh_d = page_d.locator('#reportWarehouse')
        box_range_d = report_range_d.bounding_box()
        box_wh_d = report_wh_d.bounding_box()
        print(f"Desktop #reportRange box: {box_range_d}")
        print(f"Desktop #reportWarehouse box: {box_wh_d}")
        assert abs(box_range_d['y'] - box_wh_d['y']) < 10, "Dropdowns should be aligned on desktop"
        
        page_d.screenshot(path='tests/evidence/evidence_report_filter_desktop.png')
        print("Captured tests/evidence/evidence_report_filter_desktop.png")
        context_desktop.close()
        
        browser.close()
        print("\nALL REPORT FILTER TESTS PASSED!")

if __name__ == '__main__':
    test_report_filter()
