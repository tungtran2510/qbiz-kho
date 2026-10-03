import os
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run_tests():
    os.makedirs('tests/evidence', exist_ok=True)
    results = {}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        viewports = [
            ('mobile', 390, 844),
            ('tablet', 768, 1024),
            ('desktop', 1440, 900)
        ]
        
        for name, width, height in viewports:
            print(f"\n=================== TESTING ON {name.upper()} ({width}x{height}) ===================", flush=True)
            context = browser.new_context(viewport={'width': width, 'height': height})
            page = context.new_page()
            
            page.goto('http://127.0.0.1:4180/', wait_until='domcontentloaded')
            page.wait_for_timeout(1000)
            
            # Dismiss demo modal if shown
            retail_btn = page.locator('button[data-industry="retail"]')
            if retail_btn.count() > 0:
                retail_btn.click()
                page.wait_for_timeout(500)
            elif page.locator('[data-action="preview-demo"]').count() > 0:
                page.locator('[data-action="preview-demo"]').click()
                page.wait_for_timeout(500)
                
            # Go directly to Sales and Cart with sample cart
            page.evaluate("""() => {
                const p = window.__qbiz_app__.state.data.products[0];
                window.__qbiz_app__.state.saleCart = [{
                    itemId: p.id,
                    p: p,
                    quantity: 1,
                    unitPrice: p.price,
                    discount: 0,
                    discountMode: 'amount',
                    lineDiscount: 0,
                    lineTotal: p.price
                }];
                window.__qbiz_app__.state.saleDraft.discount = 0;
                window.__qbiz_app__.state.saleDraft.discountMode = 'amount';
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'cart';
                window.__qbiz_app__.render();
            }""")
            page.wait_for_timeout(600)
            
            # 1. VERIFY STEPPER
            minus_btn = page.locator('.cart-row-bottom .quantity-control button[data-sale-adjust="-1"]').first
            plus_btn = page.locator('.cart-row-bottom .quantity-control button[data-sale-adjust="1"]').first
            qty_input = page.locator('.cart-row-bottom .quantity-control input').first
            discount_btn = page.locator('.cart-row-bottom .line-discount-trigger').first
            
            assert minus_btn.is_visible(), f"[{name}] Minus button must be visible"
            assert plus_btn.is_visible(), f"[{name}] Plus button must be visible"
            assert qty_input.is_visible(), f"[{name}] Qty input must be visible"
            assert discount_btn.is_visible(), f"[{name}] Discount trigger button must be visible"
            
            minus_box = minus_btn.bounding_box()
            plus_box = plus_btn.bounding_box()
            disc_box = discount_btn.bounding_box()
            
            print(f"[{name}] Minus box: {minus_box}", flush=True)
            print(f"[{name}] Plus box: {plus_box}", flush=True)
            print(f"[{name}] Discount trigger box: {disc_box}", flush=True)
            
            assert plus_box['width'] >= 24, f"[{name}] Plus button width should be at least 24px, got {plus_box['width']}"
            assert plus_box['x'] > minus_box['x'], f"[{name}] Plus button must be to the right of minus button"
            assert disc_box['x'] >= plus_box['x'] + plus_box['width'], f"[{name}] Discount button must be to the right of plus button, not overlapping!"
            
            # Test clicking '+' increases quantity
            initial_val = int(qty_input.input_value())
            plus_btn.click()
            page.wait_for_timeout(300)
            new_val = int(page.locator('.cart-row-bottom .quantity-control input').first.input_value())
            assert new_val == initial_val + 1, f"[{name}] Plus button click should increment qty"
            print(f"[{name}] Plus button click incremented qty from {initial_val} to {new_val}", flush=True)
            
            # 2. VERIFY LINE DISCOUNT & SUMMARY TEXT
            discount_btn.click()
            page.wait_for_timeout(400)
            
            line_disc_input = page.locator('.line-discount-editor input[data-sale-field="discount"]').first
            assert line_disc_input.is_visible(), f"[{name}] Line discount editor should be visible"
            line_disc_input.fill("25000")
            line_disc_input.dispatch_event('input')
            page.wait_for_timeout(300)
            
            line_badge = page.locator('.line-discount-editor .disc-words-badge').first
            line_badge_text = line_badge.inner_text().strip()
            print(f"[{name}] Line discount badge text: '{line_badge_text}'", flush=True)
            assert "25.000" in line_badge_text, f"[{name}] Expected 25.000 in badge text, got '{line_badge_text}'"
            assert "đồng" not in line_badge_text.lower(), f"[{name}] Spelled-out words should NOT appear in badge text"
            
            # Check font size and weight
            badge_font_size = line_badge.evaluate("el => window.getComputedStyle(el).fontSize")
            badge_font_weight = line_badge.evaluate("el => window.getComputedStyle(el).fontWeight")
            badge_color = line_badge.evaluate("el => window.getComputedStyle(el).color")
            print(f"[{name}] Line badge CSS: size={badge_font_size}, weight={badge_font_weight}, color={badge_color}", flush=True)
            
            # Settle input
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)

            # 3. VERIFY ORDER DISCOUNT TEXT
            order_disc_input = page.locator('#saleDiscount')
            order_disc_input.scroll_into_view_if_needed()
            order_disc_input.click()
            order_disc_input.fill("506000")
            order_disc_input.dispatch_event('input')
            page.wait_for_timeout(300)
            
            order_badge = page.locator('#orderDiscountHint .disc-words-badge')
            order_badge_text = order_badge.inner_text().strip()
            print(f"[{name}] Order discount badge text: '{order_badge_text}'", flush=True)
            assert "506.000" in order_badge_text, f"[{name}] Expected 506.000 in order badge, got '{order_badge_text}'"
            assert "năm trăm" not in order_badge_text.lower(), f"[{name}] Spelled-out words should NOT appear in order badge"
            
            # Screenshot of Cart with fixes
            cart_shot_path = f"tests/evidence/evidence_cart_fixed_{name}.png"
            page.screenshot(path=cart_shot_path)
            print(f"[{name}] Saved cart screenshot: {cart_shot_path}", flush=True)
            
            # 4. VERIFY CHECKOUT AND QR ZOOM MODAL
            page.evaluate("""() => {
                window.__qbiz_app__.state.saleDraft.payment = 'qr';
                window.__qbiz_app__.state.page = 'sales';
                window.__qbiz_app__.state.saleStep = 'checkout';
                window.__qbiz_app__.render();
            }""")
            page.wait_for_timeout(600)
            
            qr_wrap = page.locator('#checkoutQrImgWrap')
            assert qr_wrap.is_visible(), f"[{name}] Checkout QR wrap should be visible"
            assert "qr-zoomable" in qr_wrap.get_attribute("class"), f"[{name}] QR wrap should have qr-zoomable class"
            
            qr_shot_path = f"tests/evidence/evidence_checkout_qr_{name}.png"
            page.screenshot(path=qr_shot_path)
            print(f"[{name}] Saved checkout screenshot: {qr_shot_path}", flush=True)
            
            # Click QR to open popup
            qr_wrap.click()
            page.wait_for_timeout(600)
            
            modal = page.locator('.modal-backdrop .modal')
            assert modal.is_visible(), f"[{name}] Enlarged QR modal must be visible after click"
            modal_title = page.locator('.modal-head h3').inner_text()
            assert "Mã QR thanh toán" in modal_title, f"[{name}] Modal title should be 'Mã QR thanh toán', got '{modal_title}'"
            
            modal_img = page.locator('.modal-body img')
            assert modal_img.is_visible(), f"[{name}] Enlarged QR image must be visible in modal"
            
            modal_shot_path = f"tests/evidence/evidence_qr_modal_{name}.png"
            page.screenshot(path=modal_shot_path)
            print(f"[{name}] Saved enlarged QR modal screenshot: {modal_shot_path}", flush=True)
            
            # Close modal
            page.locator('.modal-foot button[data-close]').click()
            page.wait_for_timeout(400)
            assert not page.locator('.modal-backdrop').is_visible(), f"[{name}] Modal should close cleanly"
            
            results[name] = "PASS"
            context.close()
            
        browser.close()
        
    print("\n=================== SUMMARY ===================", flush=True)
    for k, v in results.items():
        print(f"  {k.upper()}: {v}", flush=True)

if __name__ == '__main__':
    run_tests()
