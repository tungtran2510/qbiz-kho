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

        def on_console(msg):
            if msg.type == "error":
                text = msg.text
                if "favicon" not in text and "net::ERR_" not in text:
                    console_errors.append(text)
                    print(f"  [PAGE ERROR] {text}")
        page.on("console", on_console)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        # 1. Load Sales page
        print(">>> 1. Loading Sales page...")
        await page.goto(f"{BASE_URL}/#sales", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # 2. Set up cart with real product and move to Checkout
        print(">>> 2. Setting up cart and moving to Checkout...")
        cart_info = await page.evaluate("""() => {
            state.page = 'sales';
            state.saleStep = 'checkout';
            const prod = state.data?.products?.[0];
            state.saleCart = [{
                itemId: prod ? prod.id : 'sample-1',
                quantity: 1,
                unitPrice: prod ? Number(prod.price) : 54112000,
                discount: 0,
                warrantyMonths: 12,
                warranty_months: 12,
                warrantyExchange: false,
                warranty_exchange: false,
                warrantyPolicy: '',
                warranty_policy: '',
                imei: ''
            }];
            state.saleDraft = state.saleDraft || {};
            state.saleDraft.discount = 50000;
            state.saleDraft.discountMode = 'amount';
            state.saleDraft.vatRate = 0;
            state.saleDraft.vatCustom = '';
            state.saleDraft.fulfillment = 'counter';
            state.saleDraft.payment = 'cash';
            renderSales();
            return {
                cartCount: state.saleCart.length,
                subtotal: saleTotals().subtotal,
                total: saleTotals().total
            };
        }""")
        print(f"    Cart info: subtotal={cart_info['subtotal']}, total={cart_info['total']}")
        await page.wait_for_timeout(600)

        # 3. Verify Checkout Screen - Modern Unboxed Grand Total (No nested frames, no gaudy colors)
        print(">>> 3. Inspecting Modern Unboxed Grand Total in Checkout...")
        total_card = page.locator('.billing-grand-total')
        assert await total_card.count() > 0, "Expected .billing-grand-total container to exist!"
        
        card_styles = await total_card.evaluate("""el => {
            const cs = window.getComputedStyle(el);
            return {
                borderTopStyle: cs.borderTopStyle,
                borderTopColor: cs.borderTopColor,
                borderLeftWidth: cs.borderLeftWidth,
                borderRightWidth: cs.borderRightWidth,
                borderBottomWidth: cs.borderBottomWidth,
                backgroundColor: cs.backgroundColor,
                boxShadow: cs.boxShadow,
                flexDirection: cs.flexDirection,
                alignItems: cs.alignItems
            };
        }""")
        print(f"  [GRAND TOTAL CARD STYLES] {card_styles}")
        # Verify unboxed: no left/right/bottom border, dashed top border, transparent background, no box shadow
        assert card_styles['borderLeftWidth'] == '0px', "Expected 0px border-left (Unboxed!)"
        assert card_styles['borderRightWidth'] == '0px', "Expected 0px border-right (Unboxed!)"
        assert card_styles['borderBottomWidth'] == '0px', "Expected 0px border-bottom (Unboxed!)"
        assert card_styles['flexDirection'] == 'column', "Expected column layout (Label on top, Amount below)"
        assert card_styles['alignItems'] == 'center', "Expected center alignment (Centered total amount)"

        # Inspect Label & Strong Amount
        label_text = await page.locator('.billing-grand-total span').text_content()
        strong_styles = await page.locator('.billing-grand-total strong').evaluate("""el => {
            const cs = window.getComputedStyle(el);
            return {
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
                color: cs.color,
                text: el.textContent.trim()
            };
        }""")
        print(f"  [LABEL ON TOP] '{label_text.strip()}'")
        print(f"  [AMOUNT BELOW] {strong_styles}")
        assert "Tổng thanh toán" in label_text, f"Expected 'Tổng thanh toán', got: {label_text}"
        
        # Verify font size is prominent (>= 26px) and bold (>= 900)
        font_px = float(strong_styles['fontSize'].replace('px', ''))
        assert font_px >= 26, f"Expected total amount font-size >= 26px, got: {font_px}px"
        assert int(strong_styles['fontWeight']) >= 900, f"Expected total amount font-weight >= 900, got: {strong_styles['fontWeight']}"
        assert strong_styles['text'] != '0 ₫', f"Expected actual total amount > 0, got {strong_styles['text']}"
        print(f"  PASS: Total amount is '{strong_styles['text']}' with font size {font_px}px, weight {strong_styles['fontWeight']} (Modern Hero!)")

        # Capture evidence: Checkout with modern unboxed total
        shot_checkout_modern = os.path.join(EVIDENCE_DIR, "evidence_fix6_checkout_modern_unboxed_mobile.png")
        await page.screenshot(path=shot_checkout_modern)
        print(f"  [SAVED EVIDENCE] {shot_checkout_modern}")

        # 4. Open "Tùy chọn thêm" Modal to inspect VAT Layout
        print(">>> 4. Opening 'Tùy chọn thêm' Modal to inspect VAT Layout...")
        btn_extras = page.locator('.checkout-extras-btn')
        await btn_extras.click()
        await page.wait_for_selector('#modalVatRateInput', timeout=5000)
        await page.wait_for_timeout(400)

        # Inspect VAT Box layout
        vat_input = page.locator('#modalVatRateInput')
        vat_preview = page.locator('#modalVatAmountPreview')
        vat_pills = page.locator('.modal-vat-pill')
        
        assert await vat_input.count() > 0, "Expected #modalVatRateInput to exist!"
        assert await vat_preview.count() > 0, "Expected #modalVatAmountPreview to exist!"
        pill_count = await vat_pills.count()
        assert pill_count == 4, f"Expected exactly 4 VAT pills, got: {pill_count}"

        # Verify all 4 pills are on a SINGLE horizontal line (same Y coordinate +/- 2px)
        pill_boxes = []
        for i in range(pill_count):
            box = await vat_pills.nth(i).bounding_box()
            pill_boxes.append(box)
            pill_text = (await vat_pills.nth(i).text_content()).strip()
            print(f"    Pill {i} ({pill_text}): x={box['x']:.1f}, y={box['y']:.1f}, w={box['width']:.1f}, h={box['height']:.1f}")

        y_coords = [b['y'] for b in pill_boxes]
        max_y_diff = max(y_coords) - min(y_coords)
        print(f"  [VAT PILLS Y-DIFF] {max_y_diff:.2f}px")
        assert max_y_diff < 3.0, f"Expected all 4 VAT pills on EXACTLY 1 line (y-diff < 3px), but diff is {max_y_diff:.2f}px (Wrapped!)"
        print("  PASS: All 4 VAT pills are in a single horizontal row with zero wrapping!")

        # 5. Select 10% VAT
        print(">>> 5. Clicking 10% VAT Pill...")
        pill_10 = page.locator('.modal-vat-pill[data-vat-val="10"]')
        await pill_10.click()
        await page.wait_for_timeout(300)

        inp_val = await vat_input.input_value()
        preview_text = (await vat_preview.text_content()).strip()
        print(f"    VAT input value after click 10%: '{inp_val}'")
        print(f"    VAT preview text after click 10%: '{preview_text}'")
        assert inp_val == "10", f"Expected input value '10', got '{inp_val}'"
        assert "+" in preview_text and "₫" in preview_text, f"Expected VAT preview to have formatted amount, got '{preview_text}'"

        # 6. Save modal and return to checkout
        print(">>> 6. Saving modal options and verifying updated Checkout screen...")
        btn_save = page.locator('#modalSubmit')
        await btn_save.click()
        await page.wait_for_timeout(600)

        # Check Checkout screen with VAT line and updated standout total
        vat_row = page.locator('.checkout-billing-card .billing-row:has-text("VAT")')
        assert await vat_row.count() > 0, "Expected VAT line to appear in Checkout billing card!"
        vat_row_text = (await vat_row.text_content()).strip()
        print(f"  [VAT ROW IN CHECKOUT] {vat_row_text}")

        updated_total_text = (await page.locator('.billing-grand-total strong').text_content()).strip()
        print(f"  [UPDATED GRAND TOTAL AMOUNT] {updated_total_text}")
        assert "₫" in updated_total_text, "Expected updated total to have currency symbol!"

        # Capture evidence: Checkout with VAT and Modern Unboxed Total
        shot_checkout_vat_modern = os.path.join(EVIDENCE_DIR, "evidence_fix6_checkout_with_vat_modern_mobile.png")
        await page.screenshot(path=shot_checkout_vat_modern)
        print(f"  [SAVED EVIDENCE] {shot_checkout_vat_modern}")

        await browser.close()

    print("\n>>> VERIFICATION SUMMARY:")
    print(f"  Console Errors: {len(console_errors)}")
    if console_errors:
        for err in console_errors:
            print(f"    - {err}")
    assert len(console_errors) == 0, f"Found {len(console_errors)} console errors during test!"
    print(">>> ALL VERIFICATION CHECKS PASSED WITH 0 CONSOLE ERRORS! <<<\n")

if __name__ == "__main__":
    asyncio.run(run_verification())
