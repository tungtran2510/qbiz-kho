import json
import os
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), 'evidence')
os.makedirs(EVIDENCE_DIR, exist_ok=True)

BASE_URL = "http://127.0.0.1:4180"

def check_overlap(box1, box2):
    # Two rectangles box1 and box2 overlap if and only if they overlap on both x and y
    x_overlap = max(0, min(box1['x'] + box1['width'], box2['x'] + box2['width']) - max(box1['x'], box2['x']))
    y_overlap = max(0, min(box1['y'] + box1['height'], box2['y'] + box2['height']) - max(box1['y'], box2['y']))
    return (x_overlap > 1.0 and y_overlap > 1.0)

def run_3views_verification():
    results = {
        "device": "Android Mobile (412x915)",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "modes": {},
        "verdict": "PENDING"
    }
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate Pixel 7 / Galaxy S20 Android device
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()
        
        print(f"[*] Connecting to {BASE_URL} on Mobile viewport (412x915)...")
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1500)
        
        # 1. Close entry overlay if present
        entry_overlay = page.locator('#publicEntryOverlay')
        if entry_overlay.is_visible():
            print("[*] Dismissing public entry overlay...")
            btn_demo = page.locator('[data-action="preview-demo"]').first
            if btn_demo.is_visible():
                btn_demo.click()
                page.wait_for_timeout(1000)
            else:
                page.evaluate("() => { if (window.__qbiz_app__) window.__qbiz_app__.state._bypassEntryOverlay = true; window.__qbiz_app__.render(); }")
                page.wait_for_timeout(500)
        
        # 2. Switch to Bán hàng (POS) screen
        print("[*] Switching to Bán hàng (POS) screen...")
        page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'browse';
                window.__qbiz_app__.render();
            }
        }""")
        page.wait_for_selector(".pos-grid", timeout=10000)
        page.wait_for_timeout(1000)
        
        # Define the 3 modes to test
        views = [
            {"id": "grid3", "name": "Lưới 3 ô (Grid 3 cols)"},
            {"id": "grid2", "name": "Lưới 2 ô (Grid 2 cols)"},
            {"id": "list",  "name": "Dạng danh sách (List view)"}
        ]
        
        for view in views:
            view_id = view["id"]
            view_name = view["name"]
            print(f"\n=======================================================")
            print(f"[*] TESTING MODE: {view_name} (id: {view_id})")
            print(f"=======================================================")
            
            # Switch to this posView preference and re-render
            page.evaluate(f"""(v) => {{
                if (window.__qbiz_app__) {{
                    window.__qbiz_app__.state.displayPrefs.posView = v;
                    try {{
                        localStorage.setItem('qbiz_display_preferences', JSON.stringify(window.__qbiz_app__.state.displayPrefs));
                    }} catch (e) {{}}
                    window.__qbiz_app__.state.saleCart = [];
                    window.__qbiz_app__.state.page = 'sales';
                    window.__qbiz_app__.state.saleStep = 'browse';
                    window.__qbiz_app__.render();
                }}
            }}""", view_id)
            page.wait_for_timeout(800)
            
            # Verify pos-grid has correct class
            grid_classes = page.locator(".pos-grid").get_attribute("class") or ""
            print(f"[*] .pos-grid class: '{grid_classes}'")
            assert view_id in grid_classes, f"Expected {view_id} in pos-grid class, got {grid_classes}"
            
            # 1. Test unselected state (qty = 0)
            first_card = page.locator(".pos-product").first
            price_el = first_card.locator(".pos-prod-price")
            add_btn = first_card.locator(".pos-add")
            
            price_text_unsel = price_el.inner_text().strip()
            price_box_unsel = price_el.bounding_box()
            add_box = add_btn.bounding_box()
            
            print(f"[*] Unselected: Price = '{price_text_unsel}'")
            print(f"[*] Price Box: {price_box_unsel}")
            print(f"[*] Add Btn Box: {add_box}")
            
            # Check overlap unselected
            unsel_overlap = check_overlap(price_box_unsel, add_box)
            print(f"[*] Unselected Price vs Add Btn Overlap: {unsel_overlap} (Should be False)")
            assert not unsel_overlap, f"Overlap detected in unselected state for {view_id}!"
            
            # Capture unselected screenshot
            ss_unsel_path = os.path.join(EVIDENCE_DIR, f"evidence_pos_{view_id}_unselected.png")
            page.screenshot(path=ss_unsel_path)
            print(f"[OK] Saved: {ss_unsel_path}")
            
            # 2. Add product to cart (qty = 1, then qty = 2)
            print("[*] Clicking product to add to cart...")
            # Click card to add item
            first_card.locator(".pos-product-main").click()
            page.wait_for_timeout(500)
            
            # Now stepper .pos-inline-qty should appear
            stepper = first_card.locator(".pos-inline-qty")
            stepper.wait_for(state="visible", timeout=3000)
            
            # Click '+' in stepper to increase quantity to 2
            plus_btn = stepper.locator('button[data-sale-adjust="1"]')
            plus_btn.click()
            page.wait_for_timeout(500)
            
            # Also add a second product to cart for a richer view
            second_card = page.locator(".pos-product").nth(1)
            if second_card.is_visible():
                second_card.locator(".pos-product-main").click()
                page.wait_for_timeout(400)
            
            # Measure bounding boxes with qty active
            price_box_sel = price_el.bounding_box()
            stepper_box = stepper.bounding_box()
            qty_text = stepper.locator("span").inner_text().strip()
            price_text_sel = price_el.inner_text().strip()
            card_box = first_card.bounding_box()
            
            print(f"[*] Selected: Quantity = {qty_text}, Price = '{price_text_sel}'")
            print(f"[*] Card Box: width={card_box['width']:.1f}, height={card_box['height']:.1f}")
            print(f"[*] Price Box: x={price_box_sel['x']:.1f}, y={price_box_sel['y']:.1f}, w={price_box_sel['width']:.1f}, h={price_box_sel['height']:.1f}")
            print(f"[*] Stepper Box: x={stepper_box['x']:.1f}, y={stepper_box['y']:.1f}, w={stepper_box['width']:.1f}, h={stepper_box['height']:.1f}")
            
            # Verify no overlap with stepper
            sel_overlap = check_overlap(price_box_sel, stepper_box)
            print(f"[*] Selected Price vs Stepper Overlap: {sel_overlap} (Should be False)")
            assert not sel_overlap, f"CRITICAL: Price and Stepper overlap in mode {view_id}!"
            
            # Verify price is completely above stepper in Grid modes, or to the left in List mode
            if view_id in ["grid3", "grid2"]:
                vert_separation = stepper_box['y'] - (price_box_sel['y'] + price_box_sel['height'])
                print(f"[*] Vertical separation (Stepper top - Price bottom): {vert_separation:.1f}px")
                assert vert_separation >= -1.0, f"Price is not above stepper in {view_id}!"
            else: # list mode
                horiz_separation = stepper_box['x'] - (price_box_sel['x'] + price_box_sel['width'])
                print(f"[*] Horizontal separation (Stepper left - Price right): {horiz_separation:.1f}px")
                assert horiz_separation >= 0, f"Price overlaps stepper horizontally in list view!"
            
            # Stepper size checks: must be compact and fit within card
            assert stepper_box['width'] <= card_box['width'] + 2.0, f"Stepper overflows card in {view_id}!"
            assert stepper_box['height'] <= 34.0, f"Stepper height too large: {stepper_box['height']}px"
            
            # Price text must be non-empty and visible
            assert len(price_text_sel) > 0, f"Price text is empty in {view_id}!"
            
            # Capture screenshot with qty active
            ss_sel_path = os.path.join(EVIDENCE_DIR, f"evidence_pos_{view_id}_with_qty.png")
            page.screenshot(path=ss_sel_path)
            print(f"[OK] Saved: {ss_sel_path}")
            
            results["modes"][view_id] = {
                "name": view_name,
                "card_width": round(card_box['width'], 1),
                "card_height": round(card_box['height'], 1),
                "price_text": price_text_sel,
                "price_box": {k: round(v, 1) for k, v in price_box_sel.items()},
                "stepper_box": {k: round(v, 1) for k, v in stepper_box.items()},
                "quantity": qty_text,
                "overlap_detected": sel_overlap,
                "stepper_height": round(stepper_box['height'], 1),
                "stepper_width": round(stepper_box['width'], 1),
                "price_fully_visible": True,
                "screenshot_unselected": os.path.relpath(ss_unsel_path, os.path.dirname(__file__)),
                "screenshot_with_qty": os.path.relpath(ss_sel_path, os.path.dirname(__file__)),
                "status": "PASS"
            }
        
        # Reset to default grid3 at end
        page.evaluate("""() => {
            if (window.__qbiz_app__) {
                window.__qbiz_app__.state.displayPrefs.posView = 'grid3';
                try {
                    localStorage.setItem('qbiz_display_preferences', JSON.stringify(window.__qbiz_app__.state.displayPrefs));
                } catch (e) {}
                window.__qbiz_app__.state.saleCart = [];
                window.__qbiz_app__.render();
            }
        }""")
        page.wait_for_timeout(500)
        
        browser.close()
    
    results["verdict"] = "ALL_PASS"
    results_path = os.path.join(os.path.dirname(__file__), "pos_layout_3views_results.json")
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n[ALL PASS] 3 Views Verification Completed Successfully!")
    print(f"Detailed JSON written to: {results_path}")
    return results

if __name__ == "__main__":
    res = run_3views_verification()
    sys.exit(0 if res["verdict"] == "ALL_PASS" else 1)
