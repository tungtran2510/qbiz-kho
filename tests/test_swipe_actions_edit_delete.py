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
    
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: console_errors.append(str(err)))
    
    # 1. Goto localhost
    page.goto("http://localhost:4180/?page=products", wait_until="networkidle")
    page.wait_for_timeout(1000)
    
    # 2. Check product rows
    rows = page.query_selector_all(".goods-row")
    print(f"Total product rows found: {len(rows)}")
    assert len(rows) > 0, "No product rows found"
    
    # 3. Reveal swipe action on the first row
    first_row = rows[0]
    first_row.evaluate("el => el.classList.add('reveal')")
    page.wait_for_timeout(300)
    
    # Check buttons inside swipe-actions
    swipe_btns = first_row.query_selector_all(".swipe-actions button")
    print(f"Swipe buttons found: {len(swipe_btns)}")
    assert len(swipe_btns) == 2, f"Expected 2 swipe buttons, found {len(swipe_btns)}"
    
    btn1_text = swipe_btns[0].text_content().strip()
    btn2_text = swipe_btns[1].text_content().strip()
    print(f"Button 1: '{btn1_text}' | Button 2: '{btn2_text}'")
    assert btn1_text == "Sửa", f"Button 1 expected 'Sửa', got '{btn1_text}'"
    assert btn2_text == "Xóa", f"Button 2 expected 'Xóa', got '{btn2_text}'"
    
    # Check colors
    btn1_bg = swipe_btns[0].evaluate("el => getComputedStyle(el).backgroundColor")
    btn2_bg = swipe_btns[1].evaluate("el => getComputedStyle(el).backgroundColor")
    print(f"Button 1 bg: {btn1_bg} (expected blue) | Button 2 bg: {btn2_bg} (expected red)")
    
    # Capture screenshot of swipe revealed row
    ss1_path = os.path.join(artifact_dir, "m1_swipe_actions_edit_delete.png")
    page.screenshot(path=ss1_path)
    print(f"Saved: {ss1_path}")
    
    # 4. Click [Xóa] button and verify confirmation modal
    swipe_btns[1].click()
    page.wait_for_timeout(500)
    
    modal = page.query_selector(".modal")
    assert modal is not None, "Delete confirmation modal did not open"
    modal_title = page.query_selector(".modal-head h3")
    print(f"Modal title: '{modal_title.text_content().strip()}'")
    assert "Xóa" in modal_title.text_content(), "Modal title does not contain 'Xóa'"
    
    # Capture screenshot of delete modal
    ss2_path = os.path.join(artifact_dir, "m2_swipe_delete_confirm_modal.png")
    page.screenshot(path=ss2_path)
    print(f"Saved: {ss2_path}")
    
    # 5. Dismiss modal
    close_btn = page.query_selector(".modal-foot button[data-close]")
    if close_btn:
        close_btn.click()
        page.wait_for_timeout(400)
    
    # 6. Verify [Sửa] button opens edit modal
    active_row = page.query_selector(".goods-row")
    assert active_row is not None
    active_row.evaluate("el => el.classList.add('reveal')")
    page.wait_for_timeout(200)
    edit_btn = active_row.query_selector(".swipe-actions [data-edit-product]")
    assert edit_btn is not None
    edit_btn.click()
    page.wait_for_timeout(500)
    
    edit_modal = page.query_selector(".modal")
    assert edit_modal is not None, "Edit modal did not open"
    edit_title = page.query_selector(".modal-head h3")
    print(f"Edit modal title: '{edit_title.text_content().strip()}'")
    assert "Sửa" in edit_title.text_content(), "Edit modal title does not contain 'Sửa'"
    
    # Capture screenshot of edit modal
    ss3_path = os.path.join(artifact_dir, "m3_swipe_edit_modal.png")
    page.screenshot(path=ss3_path)
    print(f"Saved: {ss3_path}")
    
    ctx.close()
    browser.close()

print("\nALL SWIPE ACTION TESTS PASSED 100%!")
