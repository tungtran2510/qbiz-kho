import sys, os, time
from playwright.sync_api import sync_playwright

artifact_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    # --- 1. MOBILE 390x844 ---
    ctx_m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page_m = ctx_m.new_page()
    page_m.goto("https://qbiz-kho.vercel.app/?page=products", wait_until="networkidle")
    page_m.wait_for_timeout(1000)
    
    # M1: Hàng hóa bình thường, thanh công cụ 1 dòng
    page_m.screenshot(path=os.path.join(artifact_dir, "live_m1_goods_tools_1row.png"))
    print("M1 saved")
    
    # M2: Bấm nút 'Chọn' & chọn sản phẩm đầu tiên
    page_m.evaluate("""() => {
        const btn = document.querySelector('[data-toggle-select]');
        if (btn) btn.click();
    }""")
    page_m.wait_for_timeout(400)
    page_m.evaluate("""() => {
        const firstChk = document.querySelector('.row-select');
        if (firstChk) firstChk.click();
    }""")
    page_m.wait_for_timeout(300)
    page_m.screenshot(path=os.path.join(artifact_dir, "live_m2_goods_selecting_aligned.png"))
    print("M2 saved")
    
    # M3: Thoát chọn bằng nút Xong, sau đó bấm [ 㗊 ] mở Modal Cài đặt hiển thị
    page_m.evaluate("""() => {
        const doneBtn = document.querySelector('[data-toggle-select]');
        if (doneBtn) doneBtn.click();
    }""")
    page_m.wait_for_timeout(300)
    page_m.evaluate("""() => {
        const dispBtn = document.querySelector('[data-display-settings]');
        if (dispBtn) dispBtn.click();
    }""")
    page_m.wait_for_timeout(500)
    # Scroll modal to bottom to show 3 device cards
    page_m.evaluate("""() => {
        const modal = document.querySelector('.modal-card, .apple-sheet, .modal-body');
        if (modal) modal.scrollTop = modal.scrollHeight;
    }""")
    page_m.wait_for_timeout(300)
    page_m.screenshot(path=os.path.join(artifact_dir, "live_m3_display_settings_modal.png"))
    print("M3 saved")
    ctx_m.close()

    # --- 2. DESKTOP 1440x900 ---
    ctx_d = browser.new_context(viewport={"width": 1440, "height": 900}, is_mobile=False)
    page_d = ctx_d.new_page()
    
    # D1: POS Tab riêng ban đầu
    page_d.goto("https://qbiz-kho.vercel.app/?page=sales", wait_until="networkidle")
    page_d.wait_for_timeout(1000)
    page_d.screenshot(path=os.path.join(artifact_dir, "live_d1_pos_desktop_split.png"))
    print("D1 saved")
    
    # D2: POS Thêm sản phẩm vào giỏ hàng & kiểm tra thẻ có nút [-] 1 [+]
    page_d.evaluate("""() => {
        const addBtns = document.querySelectorAll('[data-sale-add]');
        if (addBtns.length > 0) addBtns[0].click();
        if (addBtns.length > 1) addBtns[1].click();
    }""")
    page_d.wait_for_timeout(600)
    page_d.screenshot(path=os.path.join(artifact_dir, "live_d2_pos_desktop_with_cart.png"))
    print("D2 saved")
    
    # D3: Warehouse Transfers 5 tiles
    page_d.goto("https://qbiz-kho.vercel.app/?page=transfers", wait_until="networkidle")
    page_d.wait_for_timeout(1000)
    page_d.screenshot(path=os.path.join(artifact_dir, "live_d3_warehouse_transfers_pc.png"))
    print("D3 saved")
    ctx_d.close()

    browser.close()
print("ALL LIVE SCREENSHOTS CAPTURED SUCCESS!")
