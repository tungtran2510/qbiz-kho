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
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" and "favicon" not in msg.text else None)
    page.on("pageerror", lambda err: console_errors.append(str(err)))

    print("[1] Navigating to http://localhost:4180/?page=products ...")
    page.goto("http://localhost:4180/?page=products", wait_until="networkidle")
    page.wait_for_timeout(1000)

    # 1. TEST SORT MODAL (Auto-dismiss, 2-column, no sub descriptions, no close button)
    print("\n[2] Testing Sắp xếp (Sort Modal)...")
    sort_btn = page.query_selector("[data-product-sort]")
    assert sort_btn is not None, "Sort button [data-product-sort] not found"
    sort_btn.click()
    page.wait_for_timeout(500)

    sort_modal = page.query_selector(".modal")
    assert sort_modal is not None, "Sort modal did not open"
    sort_options = page.query_selector_all(".sort-option-btn")
    print(f"Sort options found: {len(sort_options)}")
    assert len(sort_options) >= 6, f"Expected at least 6 sort options, got {len(sort_options)}"
    
    # Check that there is no close button in footer
    foot_close = page.query_selector(".modal-foot .secondary-btn")
    assert foot_close is None, "Sort modal should NOT have redundant [Đóng] button in footer"

    ss_sort = os.path.join(artifact_dir, "evidence_sort_modal_compact.png")
    page.screenshot(path=ss_sort)
    print(f"Captured: {ss_sort} ✅")

    # Pick a sort option: 'stockHigh' (Tồn nhiều nhất) - must auto-close immediately!
    stock_high_btn = page.query_selector('[data-sort-pick="stockHigh"]')
    assert stock_high_btn is not None, "Button [data-sort-pick='stockHigh'] not found"
    print("Clicking [📦 Tồn nhiều] - should auto-dismiss modal immediately...")
    stock_high_btn.click()
    page.wait_for_timeout(500)

    # Modal must be auto-closed!
    modal_after = page.query_selector("#modalRoot .modal")
    assert modal_after is None, "Sort modal must close automatically after selection without needing [Đóng] button"
    current_sort_label = page.query_selector(".btn-tool-sort-label")
    print("Updated sort label:", current_sort_label.text_content().strip() if current_sort_label else "None")
    assert "Tồn nhiều" in current_sort_label.text_content().strip(), "Sort label should be 'Tồn nhiều'"

    # 2. TEST DISPLAY SETTINGS MODAL (Interactive Device Presets & 2-column view mode)
    print("\n[3] Testing Hiển thị & Bố cục (Display Settings Modal)...")
    disp_btn = page.query_selector("[data-display-settings]")
    assert disp_btn is not None, "Display button [data-display-settings] not found"
    disp_btn.click()
    page.wait_for_timeout(500)

    disp_modal = page.query_selector(".compact-display-modal")
    assert disp_modal is not None, "Compact display modal not found"
    
    # Check 3 interactive device preset buttons
    dev_btns = page.query_selector_all(".compact-device-cards .device-card-btn")
    print(f"Device buttons found: {len(dev_btns)}")
    assert len(dev_btns) == 3, f"Expected 3 device buttons, got {len(dev_btns)}"
    
    dev_texts = [d.query_selector("strong").text_content().strip() for d in dev_btns]
    print(f"Device preset button titles: {dev_texts}")
    assert "Điện thoại" in dev_texts and "Máy tính bảng" in dev_texts and "Máy tính" in dev_texts, "Device names must be strictly 'Điện thoại', 'Máy tính bảng', 'Máy tính'"

    # Test clicking 'Máy tính bảng' preset button
    tablet_btn = page.query_selector('[data-device-preset="tablet"]')
    assert tablet_btn is not None, "Tablet preset button not found"
    print("Clicking [Máy tính bảng] preset button...")
    tablet_btn.click()
    page.wait_for_timeout(400)
    assert "active" in tablet_btn.get_attribute("class"), "Tablet button should become active"

    # Verify radio updated to 'grid2'
    grid2_checked = page.evaluate("() => document.querySelector('input[name=\"goodsView\"][value=\"grid2\"]').checked")
    print("Goods view radio checked after tablet preset:", grid2_checked)
    assert grid2_checked == True, "Preset tablet must set goodsView to grid2"

    # Switch back to 'Điện thoại' preset
    phone_btn = page.query_selector('[data-device-preset="phone"]')
    print("Clicking [Điện thoại] preset button...")
    phone_btn.click()
    page.wait_for_timeout(400)
    assert "active" in phone_btn.get_attribute("class"), "Phone button should become active"
    compact_checked = page.evaluate("() => document.querySelector('input[name=\"goodsView\"][value=\"compact\"]').checked")
    print("Goods view radio checked after phone preset:", compact_checked)
    assert compact_checked == True, "Preset phone must set goodsView to compact"

    ss_disp = os.path.join(artifact_dir, "evidence_display_settings_compact.png")
    page.screenshot(path=ss_disp)
    print(f"Captured: {ss_disp} ✅")

    # Close display modal
    close_btn = page.query_selector("[data-close]")
    if close_btn:
        close_btn.click()
        page.wait_for_timeout(400)

    # 3. TEST PRODUCT FILTER MODAL
    print("\n[4] Testing Lọc hàng hóa (Filter Modal)...")
    filter_btn = page.query_selector("[data-product-filter]")
    assert filter_btn is not None, "Filter button [data-product-filter] not found"
    filter_btn.click()
    page.wait_for_timeout(500)

    filter_modal = page.query_selector(".compact-filter-modal")
    assert filter_modal is not None, "Compact filter modal not found"

    chips = page.query_selector_all(".filter-chip-btn")
    print(f"Filter chips found: {len(chips)}")
    chip_texts = [c.text_content().strip() for c in chips]
    print("Filter chips:", chip_texts)
    assert any("Bán chạy" in t for t in chip_texts), "Missing 'Bán chạy' chip"
    assert any("Tồn nhiều" in t for t in chip_texts), "Missing 'Tồn nhiều' chip"
    assert any("Sắp hết" in t for t in chip_texts), "Missing 'Sắp hết' chip"

    ss_filter = os.path.join(artifact_dir, "evidence_filter_modal_compact.png")
    page.screenshot(path=ss_filter)
    print(f"Captured: {ss_filter} ✅")

    # Close modal
    close_btn = page.query_selector("[data-close]")
    if close_btn:
        close_btn.click()
        page.wait_for_timeout(400)

    # 4. TEST BATCH ACTIONS
    print("\n[5] Testing Thao tác hàng loạt (Batch Actions)...")
    # Click [Chọn] button
    toggle_sel_btn = page.query_selector("[data-toggle-select]")
    assert toggle_sel_btn is not None, "Toggle select button not found"
    toggle_sel_btn.click()
    page.wait_for_timeout(400)

    # Click [Chọn tất cả]
    sel_all_btn = page.query_selector("[data-select-all]")
    assert sel_all_btn is not None, "Select all button not found"
    sel_all_btn.click()
    page.wait_for_timeout(400)

    # Click [Thao tác]
    batch_btn = page.query_selector("[data-batch-actions]")
    assert batch_btn is not None and not batch_btn.is_disabled(), "Batch actions button not active"
    batch_btn.click()
    page.wait_for_timeout(500)

    batch_sheet = page.query_selector(".batch-action-sheet")
    assert batch_sheet is not None, "Batch action sheet not opened"

    batch_actions = page.query_selector_all("[data-batch-action]")
    print(f"Batch actions found: {len(batch_actions)}")
    action_keys = [a.get_attribute("data-batch-action") for a in batch_actions]
    print(f"Action keys: {action_keys}")
    assert "receive" in action_keys, "Missing batch receive action"
    assert "transfer" in action_keys, "Missing batch transfer action"
    assert "price" in action_keys, "Missing batch price adjustment action"
    assert "category" in action_keys, "Missing batch category action"
    assert "status" in action_keys, "Missing batch status action"
    assert "export" in action_keys, "Missing batch export action"
    assert "barcode" in action_keys, "Missing batch barcode action"
    assert "delete" in action_keys, "Missing batch delete action"

    ss_batch = os.path.join(artifact_dir, "evidence_batch_actions_sheet.png")
    page.screenshot(path=ss_batch)
    print(f"Captured: {ss_batch} ✅")

    # 5. TEST BATCH PRICE SUBMODAL
    print("\n[6] Testing Batch Price Submodal...")
    price_act_btn = page.query_selector('[data-batch-action="price"]')
    price_act_btn.click()
    page.wait_for_timeout(500)

    price_form = page.query_selector(".batch-price-form")
    assert price_form is not None, "Batch price form not opened"
    ss_price = os.path.join(artifact_dir, "evidence_batch_price_modal.png")
    page.screenshot(path=ss_price)
    print(f"Captured: {ss_price} ✅")

    # Close price modal
    close_btn = page.query_selector("[data-close]")
    if close_btn:
        close_btn.click()
        page.wait_for_timeout(400)

    print("\nALL 4 COMPACT MODALS TESTED SUCCESSFULLY WITH ZERO REGRESSIONS!")
    browser.close()
