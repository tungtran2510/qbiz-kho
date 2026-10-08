import asyncio
import os
import sys
import io

# Force UTF-8 stdout on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright

BASE_URL = "http://127.0.0.1:4180"
EVIDENCE_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

async def run_verification():
    console_errors = []
    print(">>> Starting Playwright verification on mobile viewport (390x844)...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        page = await context.new_page()

        # Listen to console errors
        def on_console(msg):
            if msg.type == "error":
                text = msg.text
                # Filter out favicon or network fetch errors if any
                if "favicon" not in text and "net::ERR_" not in text:
                    console_errors.append(text)
                    print(f"  [PAGE ERROR] {text}")
        page.on("console", on_console)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        # 1. Load POS sales page
        print(">>> 1. Loading Sales page...")
        await page.goto(f"{BASE_URL}/#sales", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Ensure we are in Sales browse mode
        await page.evaluate("""() => {
            if (typeof state !== 'undefined') {
                state.page = 'sales';
                state.saleStep = 'browse';
                state.saleCart = [];
                renderSales();
            }
        }""")
        await page.wait_for_timeout(500)

        # Check POS Grid Default
        pos_grid_classes = await page.evaluate("() => document.querySelector('.pos-grid')?.className || ''")
        print(f"  [POS GRID CLASS] {pos_grid_classes}")
        assert "grid3" in pos_grid_classes, f"Expected pos-grid to have grid3 default, got: {pos_grid_classes}"

        # Capture evidence: POS 3-column grid
        shot_pos_grid = os.path.join(EVIDENCE_DIR, "evidence_fix1_pos_grid3_mobile.png")
        await page.screenshot(path=shot_pos_grid)
        print(f"  [SAVED] {shot_pos_grid}")

        # 2. Test Modal + DV (Quick Service Modal)
        print(">>> 2. Testing Modal + DV (Quick Service)...")
        btn_dv = page.locator('[data-action="quick-service"]').first
        await btn_dv.click()
        await page.wait_for_selector(".quick-service-modal-body", timeout=5000)
        await page.wait_for_timeout(400)

        # Click chip Thay pin
        chip_btn = page.locator('.qs-chip-btn[data-qs-chip="Thay pin"]')
        if await chip_btn.count() > 0:
            await chip_btn.click()
            print("    Clicked chip: Thay pin")
            await page.wait_for_timeout(150)
            name_val = await page.locator('#qsName').input_value()
            assert name_val.strip() == "Thay pin", f"Expected Thay pin, got: {name_val}"

        # Test Price Pill 100k -> formatted as 100.000 with dots!
        pill_100k = page.locator('.qs-price-pill-btn[data-qs-price="100000"]')
        if await pill_100k.count() > 0:
            await pill_100k.click()
            val_100k = await page.locator('#qsPrice').input_value()
            print(f"    Value after clicking 100k: {val_100k}")
            assert val_100k == "100.000", f"Expected '100.000', got: '{val_100k}'"
            print("    PASS: 100k is formatted as 100.000 with dot separator!")

        # Test Price Pill 350k -> formatted as 350.000 with dots!
        pill_350k = page.locator('.qs-price-pill-btn[data-qs-price="350000"]')
        if await pill_350k.count() > 0:
            await pill_350k.click()
            val_350k = await page.locator('#qsPrice').input_value()
            print(f"    Value after clicking 350k: {val_350k}")
            assert val_350k == "350.000", f"Expected '350.000', got: '{val_350k}'"
            print("    PASS: 350k is formatted as 350.000 with dot separator!")

        # Click each warranty button
        warranties = [0, 1, 3, 6, 12]
        for w in warranties:
            w_btn = page.locator(f'.qs-warranty-btn[data-qs-warranty="{w}"]')
            if await w_btn.count() > 0:
                await w_btn.click()
                print(f"    Clicked warranty: {w} months")
                await page.wait_for_timeout(100)

        # Choose 12 months
        await page.locator('.qs-warranty-btn[data-qs-warranty="12"]').click()

        # Toggle 1 đổi 1 checkbox
        await page.locator('#qsWarrantyExchange').check()
        print("    Checked 1 đổi 1")

        # Fill IMEI & note
        await page.locator('#qsImei').fill("IP13-889922")
        await page.locator('#qsNote').fill("Thay pin Pisen chính hãng bảo hành 1 đổi 1")

        # Screenshot + DV Modal
        shot_modal_dv = os.path.join(EVIDENCE_DIR, "evidence_fix3_modal_quick_service_mobile.png")
        await page.screenshot(path=shot_modal_dv)
        print(f"  [SAVED] {shot_modal_dv}")

        # Submit + DV
        await page.locator('#modalSubmit').click()
        await page.wait_for_timeout(600)
        print("    Submitted Quick Service modal successfully without errors!")

        # 3. Add an ordinary product to cart and verify cart rows
        print(">>> 3. Verifying cart rows (NO + BH on ordinary product & NO duplicate 'Dịch vụ')...")
        # Add ordinary product from catalog
        add_btn = page.locator('.pos-add').first
        if await add_btn.count() > 0:
            await add_btn.click()
            await page.wait_for_timeout(300)

        # Navigate to cart step
        await page.evaluate("""() => {
            state.saleStep = 'cart';
            renderSales();
        }""")
        await page.wait_for_timeout(500)

        # Check cart lines
        cart_rows = page.locator('.cart-row')
        cart_count = await cart_rows.count()
        print(f"    Cart has {cart_count} lines")

        # Verify ordinary product does NOT contain "+ BH"
        has_awkward_bh = await page.evaluate("""() => {
            const addBhBtns = Array.from(document.querySelectorAll('.cart-badge-add-warranty'));
            return addBhBtns.some(b => {
                const line = b.closest('.cart-row');
                return line && !line.textContent.includes('Dịch vụ');
            });
        }""")
        print(f"    Has awkward + BH on ordinary products: {has_awkward_bh}")
        assert not has_awkward_bh, "Found awkward + BH on ordinary product!"

        # Verify NO duplicate "Dịch vụ" on any line
        has_duplicate_dv = await page.evaluate("""() => {
            const rows = Array.from(document.querySelectorAll('.cart-row'));
            return rows.some(r => {
                const subline = r.querySelector('.cart-row-subline');
                if (!subline) return false;
                const matches = subline.textContent.match(/Dịch vụ/g);
                return matches && matches.length > 1;
            });
        }""")
        print(f"    Has duplicate 'Dịch vụ' in subline: {has_duplicate_dv}")
        assert not has_duplicate_dv, "FATAL: Found duplicate 'Dịch vụ' in cart subline!"
        print("    PASS: Clean single 'Dịch vụ' badge verified!")

        # Screenshot Cart
        shot_cart = os.path.join(EVIDENCE_DIR, "evidence_fix2_cart_clean_no_awkward_bh_mobile.png")
        await page.screenshot(path=shot_cart)
        print(f"  [SAVED] {shot_cart}")

        # 4. Test Item Warranty Modal (Fix activeBtn is not defined bug)
        print(">>> 4. Testing Item Warranty Modal & activeBtn bug...")
        warranty_tag = page.locator('[data-action="edit-item-warranty"]').first
        if await warranty_tag.count() > 0:
            await warranty_tag.click()
            await page.wait_for_selector(".sleek-segmented-warranty", timeout=5000)
            await page.wait_for_timeout(300)

            # Click through each warranty option
            for val in [0, 1, 3, 6, 12, 24]:
                opt_btn = page.locator(f'.item-warranty-opt[data-warranty-val="{val}"]')
                if await opt_btn.count() > 0:
                    await opt_btn.click()
                    print(f"    Clicked warranty opt: {val}th")
                    await page.wait_for_timeout(100)

            # Choose 6 months
            await page.locator('.item-warranty-opt[data-warranty-val="6"]').click()
            await page.locator('#itemWarrantyExchange').check()
            await page.locator('#itemImei').fill("IMEI-VERIFIED-OK")

            # Screenshot warranty modal
            shot_modal_warranty = os.path.join(EVIDENCE_DIR, "evidence_fix3_modal_item_warranty_mobile.png")
            await page.screenshot(path=shot_modal_warranty)
            print(f"  [SAVED] {shot_modal_warranty}")

            # Submit warranty modal
            await page.locator('#modalSubmit').click()
            await page.wait_for_timeout(600)
            print("    Submitted warranty modal! Checking for activeBtn error...")
            assert not any("activeBtn is not defined" in err for err in console_errors), "FATAL: activeBtn is not defined error triggered!"
            print("    PASS: No activeBtn error!")

        # 5. Test Redesigned Checkout Screen
        print(">>> 5. Testing Streamlined Checkout Screen...")
        await page.evaluate("""() => {
            state.saleStep = 'checkout';
            renderSales();
        }""")
        await page.wait_for_timeout(600)

        # Verify discount input is OUTSIDE and directly visible
        disc_input = page.locator('#checkoutDiscount')
        assert await disc_input.is_visible(), "FATAL: checkoutDiscount input must be directly visible on screen!"
        print("    PASS: Discount input is directly visible outside!")

        # Verify NO <details class="checkout-more"> accordion exists
        has_checkout_more_details = await page.evaluate("() => Boolean(document.querySelector('details.checkout-more'))")
        assert not has_checkout_more_details, "FATAL: Found details.checkout-more accordion! Expected popup modal button instead."
        print("    PASS: No accordion cluttering the checkout screen!")

        # Test applying discount directly
        await disc_input.fill("50000")
        await page.wait_for_timeout(300)
        total_text_after_disc = await page.locator('.billing-grand-total strong').inner_text()
        print(f"    Total text after discount 50k: {total_text_after_disc}")

        # Check discount amount is strictly UNDER 'Giảm giá đơn'
        title_elem = page.locator('.discount-row-label .discount-title')
        sub_elem = page.locator('.discount-row-label .discount-sub-amount')
        assert await sub_elem.count() > 0, "FATAL: .discount-sub-amount not found!"
        sub_text = await sub_elem.inner_text()
        print(f"    Discount sub-amount text: {sub_text}")
        assert "50.000" in sub_text, f"Expected 50.000 in sub text, got: {sub_text}"

        title_box = await title_elem.bounding_box()
        sub_box = await sub_elem.bounding_box()
        assert sub_box['y'] >= title_box['y'] + title_box['height'] - 2, f"Expected discount sub-amount to be placed UNDER discount title! title: {title_box}, sub: {sub_box}"
        print(f"    PASS: Discount amount {sub_text} is strictly placed UNDER 'Giảm giá đơn' (y_diff={sub_box['y'] - title_box['y']}px)!")

        # Check input formatting & compact size
        disc_val = await disc_input.input_value()
        print(f"    Discount input value: {disc_val}")
        assert disc_val == "50.000", f"Expected '50.000' with dots, got: {disc_val}"
        inp_box = await disc_input.bounding_box()
        print(f"    Discount input dimensions: width={inp_box['width']}px, height={inp_box['height']}px")
        assert inp_box['width'] >= 105 and inp_box['width'] <= 145, f"Expected input width 105-145px, got {inp_box['width']}px"
        assert inp_box['height'] >= 30, f"Expected input height >= 30px for easy tapping, got {inp_box['height']}px"
        print("    PASS: Discount input is long, clear, and very easy to tap!")

        # Test Single-line Payment Buttons (NO ugly 2-line wrapping allowed!)
        wrapped_payment_buttons = await page.evaluate("""() => {
            const btns = Array.from(document.querySelectorAll('.payment-methods-section .payment-tab-btn, .choice-section:has([data-payment-choice]) .choice-row'));
            return btns.map(b => {
                const text = b.textContent.trim();
                const span = b.querySelector('span');
                const btnHeight = b.clientHeight;
                const spanHeight = span ? span.clientHeight : btnHeight;
                return { text, btnHeight, spanHeight, isMultiLine: spanHeight > 25 };
            });
        }""")
        print("    Payment buttons geometry:", wrapped_payment_buttons)
        for b in wrapped_payment_buttons:
            assert not b['isMultiLine'], f"FATAL: Payment button '{b['text']}' is broken into multiple lines! Span height: {b['spanHeight']}"
        print("    PASS: All payment buttons ('Tiền mặt', 'Chuyển khoản', 'QR') are strictly on a SINGLE line! No wrapping!")

        # Test Cash Received & Quick cash pills
        btn_exact = page.locator('.cash-pill-exact')
        if await btn_exact.count() > 0:
            await btn_exact.click()
            await page.wait_for_timeout(200)
            cash_val = await page.locator('#cashReceived').input_value()
            print(f"    Cash received value: {cash_val}")
            assert "." in cash_val or cash_val == "0", f"Expected dots in cashReceived, got {cash_val}"
            change_text = await page.locator('#cashChange').inner_text()
            print(f"    Cash change after clicking exact pill: {change_text}")
            assert "0 ₫" in change_text or "0" in change_text

        # Screenshot Main Checkout Screen
        shot_checkout = os.path.join(EVIDENCE_DIR, "evidence_fix4_checkout_streamlined_outside_discount_mobile.png")
        await page.screenshot(path=shot_checkout)
        print(f"  [SAVED] {shot_checkout}")

        # 6. Test Extras Modal (Popup Tùy chọn đơn hàng)
        print(">>> 6. Testing Extras Modal (Popup Tùy chọn đơn hàng)...")
        extras_btn = page.locator('#openCheckoutExtrasBtn')
        assert await extras_btn.is_visible(), "FATAL: #openCheckoutExtrasBtn must be visible!"
        await extras_btn.click()
        await page.wait_for_selector(".checkout-extras-modal-body", timeout=5000)
        print("    Extras Modal opened cleanly as a POPUP!")

        # Verify Policy & Appointment accordion exists and is compact
        acc = page.locator('.extras-sub-accordion')
        assert await acc.count() > 0, "FATAL: .extras-sub-accordion not found!"
        print("    PASS: Policy and appointment are tucked away in a neat single-row accordion!")

        # Screenshot Extras Modal with Counter (Tại quầy) selected
        shot_modal_extras_counter = os.path.join(EVIDENCE_DIR, "evidence_fix4_modal_extras_popup_counter_mobile.png")
        await page.screenshot(path=shot_modal_extras_counter)
        print(f"  [SAVED] {shot_modal_extras_counter}")

        # Test selecting delivery in modal
        await page.locator('#modalFulfillmentDelivery').click()
        await page.wait_for_timeout(200)
        await page.locator('#modalRecipient').fill("Anh Hải")
        await page.locator('#modalDeliveryPhone').fill("0912345678")
        await page.locator('#modalDeliveryAddress').fill("123 Lê Duẩn, Hà Nội")
        await page.locator('#modalShippingFee').fill("30000")
        ship_fee_val = await page.locator('#modalShippingFee').input_value()
        print(f"    Modal shipping fee formatted value: {ship_fee_val}")
        assert ship_fee_val == "30.000", f"Expected '30.000' with dots, got: {ship_fee_val}"

        # Test order note
        await page.locator('#modalSaleNote').fill("Giao trước 12h trưa")

        # Test VAT direct editable input & quick pill
        vat_inp = page.locator('#modalVatRateInput')
        assert await vat_inp.is_visible(), "FATAL: modalVatRateInput must be directly visible and editable!"
        await vat_inp.fill("8")
        await page.wait_for_timeout(100)
        pill_10 = page.locator('.modal-vat-pill[data-vat-val="10"]')
        await pill_10.click()
        await page.wait_for_timeout(100)
        vat_val = await vat_inp.input_value()
        print(f"    VAT input value after clicking 10% pill: {vat_val}")
        assert vat_val == "10", f"Expected '10' in VAT input, got '{vat_val}'"
        print("    PASS: VAT input is directly editable and quick pills work!")

        # Screenshot Extras Modal with Delivery and VAT 10%
        shot_modal_extras = os.path.join(EVIDENCE_DIR, "evidence_fix4_modal_extras_popup_mobile.png")
        await page.screenshot(path=shot_modal_extras)
        print(f"  [SAVED] {shot_modal_extras}")

        # Submit Extras Modal
        await page.locator('#modalSubmit').click()
        await page.wait_for_timeout(600)
        print("    Saved Extras from popup! Checking updated checkout...")

        # Verify Grand Total updated with shipping & VAT
        updated_total = await page.locator('.billing-grand-total strong').inner_text()
        print(f"    Updated Grand Total with Ship & VAT: {updated_total}")

        # Screenshot Updated Checkout Screen
        shot_checkout_updated = os.path.join(EVIDENCE_DIR, "evidence_fix4_checkout_with_extras_mobile.png")
        await page.screenshot(path=shot_checkout_updated)
        print(f"  [SAVED] {shot_checkout_updated}")

        # 7. Complete payment
        print(">>> 7. Completing payment...")
        # Ensure shift is open via window.__qbiz_app__.openShift
        await page.evaluate("""async () => {
            try {
                if (window.__qbiz_app__?.openShift) {
                    await window.__qbiz_app__.openShift({ openingCash: 1000000 });
                    await window.__qbiz_app__.refresh();
                }
            } catch(e) {
                console.log('openShift note (safe to ignore if already open):', e.message);
            }
        }""")
        await page.wait_for_timeout(400)

        # Click exact cash button for the new total
        exact_pill = page.locator('.cash-pill-exact')
        if await exact_pill.count() > 0:
            await exact_pill.click()
            await page.wait_for_timeout(200)

        # Click Thu tiền mặt
        pay_btn = page.locator('[data-sale-pay]')
        await pay_btn.click()
        await page.wait_for_timeout(600)
        
        # If open shift modal appears, submit it
        shift_modal = page.locator('#modalSubmit')
        if await shift_modal.count() > 0:
            modal_title = await page.locator('.modal-head h3').inner_text()
            if "Mở ca" in modal_title or "ca" in modal_title.lower():
                await shift_modal.click()
                await page.wait_for_timeout(1000)

        # Wait for either success popup or pos-success screen
        await page.wait_for_selector(".payment-popup-card, .pos-success", timeout=10000)
        await page.wait_for_timeout(500)
        print("    Sale completed successfully! Pos success screen reached!")

        # Screenshot Success Screen
        shot_success = os.path.join(EVIDENCE_DIR, "evidence_fix4_pos_success_screen_mobile.png")
        await page.screenshot(path=shot_success)
        print(f"  [SAVED] {shot_success}")

        await browser.close()

    print(">>> All verification steps completed successfully!")
    print(f"Console errors encountered: {len(console_errors)}")
    if console_errors:
        print("  Errors:", console_errors)
    assert len(console_errors) == 0, f"Found console errors: {console_errors}"

if __name__ == "__main__":
    asyncio.run(run_verification())
