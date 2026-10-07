import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

artifact_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto("https://qbiz-kho.vercel.app/?page=products", wait_until="networkidle")
    page.wait_for_timeout(1000)
    
    # 1. Reveal swipe actions on second row (Ghế sáng chế 150)
    rows = page.query_selector_all(".goods-row")
    if len(rows) > 1:
        target_row = rows[1]
        target_row.evaluate("el => el.classList.add('reveal')")
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(artifact_dir, "live_vercel_swipe_edit_delete.png"))
        print("Live swipe screenshot saved!")
        
        # 2. Click [Xóa] on that row
        del_btn = target_row.query_selector("[data-delete-product]")
        if del_btn:
            del_btn.click()
            page.wait_for_timeout(500)
            page.screenshot(path=os.path.join(artifact_dir, "live_vercel_swipe_delete_modal.png"))
            print("Live delete modal screenshot saved!")
            
            # Close modal
            close_btn = page.query_selector(".modal-foot button[data-close]")
            if close_btn:
                close_btn.click()
                page.wait_for_timeout(400)
                
    # 3. Open more actions [...] on third row
    rows_after = page.query_selector_all(".goods-row")
    if len(rows_after) > 2:
        more_btn = rows_after[2].query_selector(".more-btn")
        if more_btn:
            more_btn.click()
            page.wait_for_timeout(500)
            page.screenshot(path=os.path.join(artifact_dir, "live_vercel_item_actions_delete.png"))
            print("Live action sheet screenshot saved!")
            
    ctx.close()
    browser.close()
print("ALL LIVE VERCEL CAPTURES COMPLETED SUCCESS!")
