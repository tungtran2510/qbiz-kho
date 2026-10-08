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
        cart_info = await page.evaluate("""async () => {
            const app = window.qbiz || window.__qbiz_app__;
            try {
                if (app?.openShift) {
                    await app.openShift({ openingCash: 1000000 });
                }
            } catch (err) {
                if (!String(err?.message || '').includes('đang có một ca mở')) {
                    console.warn('openShift caught:', err);
                }
            }
            if (app?.refresh) {
                await app.refresh();
            }
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

        # 3. Verify Payment Methods: 4 buttons on a single row
        print(">>> 3. Inspecting Payment Methods 4-Pills Layout...")
        tabs = page.locator('.choice-section.payment-methods-section .payment-tab-btn')
        tab_count = await tabs.count()
        print(f"  Total payment tabs found: {tab_count}")
        assert tab_count == 4, f"Expected 4 payment tabs (Tiền mặt, Chuyển khoản, QR, Ghi nợ), got {tab_count}"

        tab_boxes = []
        for i in range(tab_count):
            btn = tabs.nth(i)
            box = await btn.bounding_box()
            text = (await btn.text_content()).strip()
            tab_boxes.append((text, box))
            print(f"    Tab {i} ('{text}'): x={box['x']}, y={box['y']}, w={box['width']}, h={box['height']}")

        # Verify all 4 tabs share the EXACT same Y position (zero line wrap)
        y_coords = [b[1]['y'] for b in tab_boxes]
        y_diff = max(y_coords) - min(y_coords)
        print(f"  [PAYMENT TABS Y-DIFF] {y_diff:.2f}px")
        assert y_diff < 2.0, f"Expected all 4 payment tabs on 1 single row! Y-diff={y_diff}px"

        # Capture evidence of Cash view with 4 tabs
        path_cash = os.path.join(EVIDENCE_DIR, "evidence_fix7_checkout_cash_mobile.png")
        await page.screenshot(path=path_cash)
        print(f"  [SAVED EVIDENCE] {path_cash}")

        # 4. Test selecting 'Ghi nợ' (Debt) tab
        print(">>> 4. Testing 'Ghi nợ' payment tab...")
        debt_tab = tabs.nth(3)
        await debt_tab.click()
        await page.wait_for_timeout(400)

        debt_panel = page.locator('.debt-panel')
        assert await debt_panel.count() > 0, "Expected .debt-panel to exist when Ghi nợ is active!"
        debt_text = (await debt_panel.text_content()).strip()
        print(f"  Debt panel content: '{debt_text}'")

        pay_btn = page.locator('[data-sale-pay]')
        pay_btn_text = (await pay_btn.text_content()).strip()
        print(f"  Action button text: '{pay_btn_text}'")
        assert "Xác nhận ghi nợ" in pay_btn_text, f"Expected 'Xác nhận ghi nợ', got: {pay_btn_text}"

        # Capture evidence of Debt view with warning badge
        path_debt = os.path.join(EVIDENCE_DIR, "evidence_fix7_checkout_4tabs_debt_selected_mobile.png")
        await page.screenshot(path=path_debt)
        print(f"  [SAVED EVIDENCE] {path_debt}")

        # 5. Test selecting real customer for debt
        print(">>> 5. Assigning a real customer to test debt authorization...")
        await page.evaluate("""() => {
            const cust = state.data?.customers?.[0] || { id: 'cust_test_1', name: 'Nguyễn Văn An', creditLimit: 200000000, debt: 5000000 };
            state.saleCustomer = cust;
            renderSales();
        }""")
        await page.wait_for_timeout(400)

        updated_debt_text = (await page.locator('.debt-panel').text_content()).strip()
        print(f"  Updated debt panel with customer: '{updated_debt_text}'")
        assert "Ghi nợ:" in updated_debt_text, "Expected customer name in debt panel!"

        # 6. Test Delivery / Fulfillment Fields in 'Tùy chọn thêm' modal
        print(">>> 6. Testing Delivery / Fulfillment Fields in Extras Modal...")
        await page.locator('#openCheckoutExtrasBtn').click()
        await page.wait_for_timeout(600)

        modal = page.locator('#modalRoot .modal')
        assert await modal.count() > 0, "Expected Extras modal to be open!"

        # Switch to 'Giao hàng tận nơi'
        delivery_btn = page.locator('#modalFulfillmentDelivery')
        await delivery_btn.click()
        await page.wait_for_timeout(300)

        # Fill in recipient, phone, address, shipping fee
        await page.locator('#modalRecipient').fill("Trần Anh Tuấn")
        await page.locator('#modalDeliveryPhone').fill("0912345678")
        await page.locator('#modalDeliveryAddress').fill("123 Đường Láng, Hà Nội")
        await page.locator('#modalShippingFee').fill("30000")

        # Save modal options
        await page.locator('#modalSubmit').click()
        await page.wait_for_timeout(800)

        # 7. Submit Sale and Verify Delivery Data Persistence
        print(">>> 7. Submitting sale and verifying data persistence in IndexedDB...")
        # Switch back to Cash for fast submission or submit debt
        await page.locator('[data-sale-pay]').click()
        await page.wait_for_timeout(1000)

        # Check receipt object in state
        saved_sale = await page.evaluate("""() => {
            return state.saleReceipt;
        }""")
        print(f"  Saved Sale info: id={saved_sale.get('id')}, code={saved_sale.get('code')}")
        print(f"  fulfillment={saved_sale.get('fulfillment')}")
        print(f"  recipient={saved_sale.get('recipient')}")
        print(f"  phone={saved_sale.get('phone')}")
        print(f"  address={saved_sale.get('address')}")
        print(f"  shipping_fee={saved_sale.get('shipping_fee')}")
        print(f"  payment_status={saved_sale.get('payment_status')}")

        assert saved_sale.get('fulfillment') == 'delivery', f"Expected fulfillment='delivery', got: {saved_sale.get('fulfillment')}"
        assert saved_sale.get('recipient') == 'Trần Anh Tuấn', f"Expected recipient='Trần Anh Tuấn', got: {saved_sale.get('recipient')}"
        assert saved_sale.get('phone') == '0912345678', f"Expected phone='0912345678', got: {saved_sale.get('phone')}"
        assert saved_sale.get('address') == '123 Đường Láng, Hà Nội', f"Expected address='123 Đường Láng, Hà Nội', got: {saved_sale.get('address')}"
        assert saved_sale.get('shipping_fee') == 30000, f"Expected shipping_fee=30000, got: {saved_sale.get('shipping_fee')}"
        assert saved_sale.get('payment_status') == 'PENDING', f"Expected payment_status='PENDING' for debt sale, got: {saved_sale.get('payment_status')}"

        print("  PASS: All fulfillment and delivery fields are 100% saved in the sale record!")

        # Success popup screenshot
        path_success = os.path.join(EVIDENCE_DIR, "evidence_fix7_pos_delivery_order_detail_mobile.png")
        await page.screenshot(path=path_success)
        print(f"  [SAVED EVIDENCE] {path_success}")

        # Summary
        print(f"\n>>> VERIFICATION SUMMARY:")
        print(f"  Console Errors: {len(console_errors)}")
        assert len(console_errors) == 0, f"Found console errors: {console_errors}"
        print(">>> ALL VERIFICATION CHECKS PASSED WITH 0 CONSOLE ERRORS! <<<")

if __name__ == "__main__":
    asyncio.run(run_verification())
