import os
import sys
import time
from playwright.sync_api import sync_playwright

def run():
    evidence_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
    os.makedirs(evidence_dir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport 390x844 (iPhone 13)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        print("Navigating to http://localhost:4180...")
        page.goto("http://localhost:4180", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # 1. Navigate to Hàng hóa (products)
        print("Clicking goods menu...")
        goods_btn = page.locator('button[data-page="products"], a[data-page="products"]').first
        if goods_btn.is_visible():
            goods_btn.click()
        else:
            page.evaluate("window.location.hash = '#products'; if(window.navigate) window.navigate('products');")
        page.wait_for_timeout(1000)

        # 1. Capture Toolbar
        print("Capturing Toolbar...")
        toolbar_path = os.path.join(evidence_dir, "evidence_toolbar_perfect_center.png")
        page.screenshot(path=toolbar_path)
        print(f"Saved {toolbar_path}")

        # 2. Select items and open Batch Actions
        print("Opening Batch Actions...")
        select_btn = page.locator('[data-toggle-select]').first
        if select_btn.is_visible():
            select_btn.click()
            page.wait_for_timeout(400)
            
            # Select 2 items
            checkboxes = page.locator('.row-select')
            count = checkboxes.count()
            for i in range(min(2, count)):
                checkboxes.nth(i).click()
                page.wait_for_timeout(200)

            # Click "Thao tác"
            batch_btn = page.locator('[data-batch-actions]').first
            batch_btn.click()
            page.wait_for_timeout(600)

            batch_path = os.path.join(evidence_dir, "evidence_batch_actions_info_first.png")
            page.screenshot(path=batch_path)
            print(f"Saved {batch_path}")

            # Close modal
            close_btn = page.locator('#modalRoot .modal-close, #modalRoot [data-modal-close], #modalRoot button.secondary-btn').first
            if close_btn.is_visible():
                close_btn.click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(400)

        # 3. Open Display Settings
        print("Opening Display Settings...")
        display_btn = page.locator('[data-display-settings]').first
        display_btn.click()
        page.wait_for_timeout(600)

        # Scroll modal to view bottom preview
        page.evaluate("const m = document.querySelector('#modalRoot .modal-body') || document.querySelector('#modalRoot'); if(m) m.scrollTop = m.scrollHeight;")
        page.wait_for_timeout(300)

        disp_phone_path = os.path.join(evidence_dir, "evidence_display_settings_preview_phone.png")
        page.screenshot(path=disp_phone_path)
        print(f"Saved {disp_phone_path}")

        # Click Tablet preview tab
        tablet_tab = page.locator('[data-preview-device="tablet"]').first
        if tablet_tab.is_visible():
            tablet_tab.click()
            page.wait_for_timeout(400)
            disp_tablet_path = os.path.join(evidence_dir, "evidence_display_settings_preview_tablet.png")
            page.screenshot(path=disp_tablet_path)
            print(f"Saved {disp_tablet_path}")

        # Click PC preview tab
        pc_tab = page.locator('[data-preview-device="pc"]').first
        if pc_tab.is_visible():
            pc_tab.click()
            page.wait_for_timeout(400)
            disp_pc_path = os.path.join(evidence_dir, "evidence_display_settings_preview_pc.png")
            page.screenshot(path=disp_pc_path)
            print(f"Saved {disp_pc_path}")

        browser.close()
        print("Finished capturing all evidence screenshots successfully!")

if __name__ == '__main__':
    run()
