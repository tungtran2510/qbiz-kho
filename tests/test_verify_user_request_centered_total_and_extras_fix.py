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

        # 2. Set up cart with 148.372.000 đ sample (matching user's screenshot exactly)
        print(">>> 2. Setting up cart with 148.372.000 đ and moving to Checkout...")
        cart_info = await page.evaluate("""async () => {
            const app = window.qbiz || window.__qbiz_app__;
            try {
                if (app?.openShift) {
                    await app.openShift({ openingCash: 1000000 });
                }
            } catch (err) {}
            if (app?.refresh) await app.refresh();

            state.page = 'sales';
            state.saleStep = 'checkout';
            const prod = state.data?.products?.[0] || { id: 'p1', name: 'Đơn hàng mẫu', price: 148372000 };
            if (!state.data.products) state.data.products = [prod];
            prod.price = 148372000;
            state.saleCart = [{
                itemId: prod.id,
                name: prod.name,
                quantity: 1,
                unitPrice: 148372000,
                discount: 0
            }];
            state.saleDraft = state.saleDraft || {};
            state.saleDraft.discount = 0;
            state.saleDraft.discountMode = 'amount';
            state.saleDraft.vatRate = 0;
            state.saleDraft.vatCustom = '';
            state.saleDraft.fulfillment = 'counter';
            state.saleDraft.payment = 'cash';
            renderSales();
            return {
                subtotal: saleTotals().subtotal,
                total: saleTotals().total
            };
        }""")
        print(f"    Cart info: subtotal={cart_info['subtotal']}, total={cart_info['total']}")
        await page.wait_for_timeout(600)

        # 3. Inspect Centered Grand Total & Price Typography
        print(">>> 3. Inspecting Centered Grand Total & Price Typography...")
        grand_total = page.locator('.billing-grand-total')
        assert await grand_total.count() > 0, "Expected .billing-grand-total to exist!"

        styles = await grand_total.evaluate("""el => {
            const cs = window.getComputedStyle(el);
            const strong = el.querySelector('strong');
            const strongCs = strong ? window.getComputedStyle(strong) : {};
            const span = el.querySelector('.grand-total-label-row');
            const spanCs = span ? window.getComputedStyle(span) : {};
            return {
                alignItems: cs.alignItems,
                justifyContent: cs.justifyContent,
                textAlign: cs.textAlign,
                labelJustify: spanCs.justifyContent,
                priceFontSize: strongCs.fontSize,
                priceFontWeight: strongCs.fontWeight,
                priceColor: strongCs.color,
                priceTextAlign: strongCs.textAlign,
                priceText: strong ? strong.textContent.trim() : ''
            };
        }""")
        print(f"  Grand total styles: {styles}")

        # Assert centered alignment
        assert styles['alignItems'] == 'center', f"Expected alignItems='center', got {styles['alignItems']}"
        assert styles['priceTextAlign'] == 'center', f"Expected priceTextAlign='center', got {styles['priceTextAlign']}"
        assert styles['labelJustify'] == 'center', f"Expected labelJustify='center', got {styles['labelJustify']}"

        # Assert font size >= 32px
        price_size_val = float(styles['priceFontSize'].replace('px', ''))
        print(f"  Price font size: {price_size_val}px (weight: {styles['priceFontWeight']})")
        assert price_size_val >= 32.0, f"Expected price font size >= 32px, got {price_size_val}px"
        assert int(styles['priceFontWeight']) >= 900, f"Expected weight >= 900, got {styles['priceFontWeight']}"
        assert styles['priceText'] == '148.372.000 ₫', f"Expected '148.372.000 ₫', got '{styles['priceText']}'"

        # Check visual centering of price in mobile viewport
        strong_box = await page.locator('.billing-grand-total strong').bounding_box()
        screen_center_x = 390 / 2.0
        price_center_x = strong_box['x'] + (strong_box['width'] / 2.0)
        center_offset = abs(screen_center_x - price_center_x)
        print(f"  [PRICE HORIZONTAL CENTERING] Screen center: {screen_center_x}px, Price center: {price_center_x}px, Offset: {center_offset:.2f}px")
        assert center_offset < 10.0, f"Expected price to be centered horizontally within 10px, got offset {center_offset}px"

        # Capture evidence of Centered Grand Total
        path_centered = os.path.join(EVIDENCE_DIR, "evidence_fix8_centered_grand_total_mobile.png")
        await page.screenshot(path=path_centered)
        print(f"  [SAVED EVIDENCE] {path_centered}")

        # 4. Open 'Tùy chọn thêm' Modal to inspect Section 4 fix
        print(">>> 4. Testing 'Tùy chọn thêm' modal & Section 4 fix...")
        await page.locator('#openCheckoutExtrasBtn').click()
        await page.wait_for_timeout(600)

        modal = page.locator('#modalRoot .modal')
        assert await modal.count() > 0, "Expected Extras modal to be open!"

        # Inspect Section 4 elements
        sec4_summary = page.locator('.extras-accordion-summary')
        assert await sec4_summary.count() > 0, "Expected .extras-accordion-summary to exist!"

        sec4_title = page.locator('.extras-accordion-title')
        sec4_badge = page.locator('#modalAccordionToggleBadge')

        title_text = (await sec4_title.text_content()).strip()
        badge_text = (await sec4_badge.text_content()).strip()
        print(f"  Section 4 title: '{title_text}'")
        print(f"  Section 4 badge: '{badge_text}'")

        assert "4. Hẹn trả & Chính sách in bill" in title_text, f"Unexpected title text: {title_text}"
        assert "+ Mở rộng" in badge_text, f"Expected '+ Mở rộng' in badge, got: {badge_text}"

        title_box = await sec4_title.bounding_box()
        badge_box = await sec4_badge.bounding_box()
        print(f"  Title box: y={title_box['y']}, h={title_box['height']}, w={title_box['width']}")
        print(f"  Badge box: y={badge_box['y']}, h={badge_box['height']}, w={badge_box['width']}")

        # Ensure title and badge are on the exact same row (zero line wrap)
        y_diff = abs(title_box['y'] - badge_box['y'])
        print(f"  [SECTION 4 TITLE VS BADGE Y-DIFF] {y_diff:.2f}px")
        assert y_diff < 5.0, f"Expected Section 4 title and badge on 1 single row! Y-diff={y_diff}px"

        # Capture evidence of Section 4 closed state
        path_sec4_closed = os.path.join(EVIDENCE_DIR, "evidence_fix8_modal_extras_clean_section4_closed_mobile.png")
        await page.screenshot(path=path_sec4_closed)
        print(f"  [SAVED EVIDENCE] {path_sec4_closed}")

        # 5. Test expanding Section 4
        print(">>> 5. Testing expanding Section 4 accordion...")
        await sec4_summary.click()
        await page.wait_for_timeout(400)

        updated_badge_text = (await sec4_badge.text_content()).strip()
        print(f"  Badge text after expanding: '{updated_badge_text}'")
        assert "Đang mở" in updated_badge_text, f"Expected 'Đang mở', got: {updated_badge_text}"

        policy_select = page.locator('#modalWarrantyPolicy')
        assert await policy_select.is_visible(), "Expected warranty policy select to be visible when opened!"

        # Capture evidence of Section 4 opened state
        path_sec4_opened = os.path.join(EVIDENCE_DIR, "evidence_fix8_modal_extras_clean_section4_opened_mobile.png")
        await page.screenshot(path=path_sec4_opened)
        print(f"  [SAVED EVIDENCE] {path_sec4_opened}")

        # 6. Test collapsing Section 4
        print(">>> 6. Testing collapsing Section 4 accordion...")
        await sec4_summary.click()
        await page.wait_for_timeout(400)
        collapsed_badge_text = (await sec4_badge.text_content()).strip()
        print(f"  Badge text after collapsing: '{collapsed_badge_text}'")
        assert "+ Mở rộng" in collapsed_badge_text, f"Expected '+ Mở rộng', got: {collapsed_badge_text}"

        # Close modal
        await page.locator('#modalSubmit').click()
        await page.wait_for_timeout(600)

        # Summary
        print(f"\n>>> VERIFICATION SUMMARY:")
        print(f"  Console Errors: {len(console_errors)}")
        assert len(console_errors) == 0, f"Found console errors: {console_errors}"
        print(">>> ALL VERIFICATION CHECKS PASSED WITH 0 CONSOLE ERRORS! <<<")

if __name__ == "__main__":
    asyncio.run(run_verification())
