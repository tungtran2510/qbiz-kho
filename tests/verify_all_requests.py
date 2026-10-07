import os
import shutil
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
EVIDENCE_DIR = "tests/evidence"

os.makedirs(EVIDENCE_DIR, exist_ok=True)

def copy_to_artifact(src_path, filename):
    dst_path = os.path.join(ARTIFACT_DIR, filename)
    shutil.copy2(src_path, dst_path)
    print(f"Copied to artifact: {dst_path}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # 1. MOBILE VIEWPORT (390x844) - iPhone 13
    print("Testing Mobile...")
    context_m = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
    page_m = context_m.new_page()
    page_m.goto('http://localhost:4180', wait_until='networkidle')
    page_m.evaluate('''() => {
        sessionStorage.removeItem('qbiz_preview_demo');
        localStorage.setItem('qbiz_auth_session', JSON.stringify({
            access_token: 'test-token',
            user: { id: 'usr-sovereign', email: 'tungtran2510@gmail.com' }
        }));
        localStorage.setItem('qbiz_active_shop', JSON.stringify({
            id: 'shop-dlc',
            name: 'DLC Care'
        }));
    }''')
    page_m.goto('http://localhost:4180/?page=products', wait_until='networkidle')
    page_m.wait_for_selector('.goods-row')
    page_m.wait_for_timeout(400)

    # Mobile 1: Goods page 1-line tools
    p1 = f"{EVIDENCE_DIR}/m1_goods_tools_1row.png"
    page_m.screenshot(path=p1)
    copy_to_artifact(p1, "m1_goods_tools_1row.png")

    # Mobile 2: Click "Chọn" and select 2 items
    page_m.click('[data-toggle-select]')
    page_m.wait_for_timeout(400)
    sel_btns = page_m.locator('[data-select-product]')
    if sel_btns.count() > 0:
        sel_btns.nth(0).click()
        page_m.wait_for_timeout(300)
    sel_btns = page_m.locator('[data-select-product]')
    if sel_btns.count() > 1:
        sel_btns.nth(1).click()
        page_m.wait_for_timeout(300)

    p2 = f"{EVIDENCE_DIR}/m2_goods_selecting_straight_aligned.png"
    page_m.screenshot(path=p2)
    copy_to_artifact(p2, "m2_goods_selecting_straight_aligned.png")

    # Mobile 3: Modal Display Settings
    page_m.click('[data-display-settings]')
    page_m.wait_for_timeout(500)
    # Scroll modal to view the 3-device cards
    page_m.evaluate('''() => {
        const modal = document.querySelector('.modal-body, .display-settings');
        if (modal) modal.scrollTop = modal.scrollHeight;
    }''')
    page_m.wait_for_timeout(400)
    p3 = f"{EVIDENCE_DIR}/m3_modal_display_settings_3devices.png"
    page_m.screenshot(path=p3)
    copy_to_artifact(p3, "m3_modal_display_settings_3devices.png")

    # Close modal
    page_m.evaluate('''() => {
        const closeBtn = document.querySelector('[data-close]');
        if (closeBtn) closeBtn.click();
    }''')
    page_m.wait_for_timeout(300)
    context_m.close()

    # 2. DESKTOP VIEWPORT (1440x900)
    print("Testing Desktop PC...")
    context_d = browser.new_context(viewport={'width': 1440, 'height': 900})
    page_d = context_d.new_page()
    page_d.goto('http://localhost:4180', wait_until='networkidle')
    page_d.evaluate('''() => {
        sessionStorage.removeItem('qbiz_preview_demo');
        localStorage.setItem('qbiz_auth_session', JSON.stringify({
            access_token: 'test-token',
            user: { id: 'usr-sovereign', email: 'tungtran2510@gmail.com' }
        }));
        localStorage.setItem('qbiz_active_shop', JSON.stringify({
            id: 'shop-dlc',
            name: 'DLC Care'
        }));
    }''')

    # Desktop 1: POS Dedicated View (?page=sales)
    page_d.goto('http://localhost:4180/?page=sales', wait_until='networkidle')
    page_d.wait_for_timeout(600)
    p4 = f"{EVIDENCE_DIR}/d1_desktop_pos_tab_layout.png"
    page_d.screenshot(path=p4)
    copy_to_artifact(p4, "d1_desktop_pos_tab_layout.png")

    # Desktop 2: Add products to cart and inspect product card quantity balance
    cards = page_d.locator('.pos-product')
    if cards.count() > 0:
        # Click add on first card
        cards.nth(0).locator('.pos-add').click()
        page_d.wait_for_timeout(300)
    if cards.count() > 1:
        # Click add on second card twice
        cards.nth(1).locator('.pos-add').click()
        page_d.wait_for_timeout(300)
        # click '+' in inline qty
        cards.nth(1).locator('[data-sale-adjust="1"]').click()
        page_d.wait_for_timeout(300)

    p5 = f"{EVIDENCE_DIR}/d2_desktop_pos_cards_and_cart.png"
    page_d.screenshot(path=p5)
    copy_to_artifact(p5, "d2_desktop_pos_cards_and_cart.png")

    # Desktop 3: Warehouse Page (?page=transfers)
    page_d.goto('http://localhost:4180/?page=transfers', wait_until='networkidle')
    page_d.wait_for_timeout(600)
    p6 = f"{EVIDENCE_DIR}/d3_desktop_warehouse_5tiles.png"
    page_d.screenshot(path=p6)
    copy_to_artifact(p6, "d3_desktop_warehouse_5tiles.png")

    context_d.close()
    browser.close()
    print("All captures completed successfully!")
