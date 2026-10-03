import asyncio
import sys
from playwright.async_api import async_playwright

async def test_offline_qr():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()

        # Block any external CDN requests (including unpkg.com) to simulate offline/isolated environment
        await context.route("**/*unpkg.com*", lambda route: route.abort())

        page = await context.new_page()
        page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGEERROR: {err}"))

        # Navigate to local dev server
        await page.goto("http://127.0.0.1:4180/index.html")
        await page.wait_for_selector("#pageTitle", timeout=10000)
        await page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)

        # 1. Check window.QRCodeStyling is available from local vendor script
        has_qr_styling = await page.evaluate("() => typeof window.QRCodeStyling !== 'undefined'")
        print(f"window.QRCodeStyling defined: {has_qr_styling}")
        assert has_qr_styling, "QRCodeStyling should be loaded from local vendor script even when unpkg is blocked!"

        # 2. Trigger openQR for an existing product
        product_id = await page.evaluate("""
            async () => {
                const prods = window.__qbiz_app__.state.data?.products || [];
                if (prods.length > 0) return prods[0].id;
                const { createProduct } = await import('/src/engine.js');
                const newP = await createProduct({
                    name: 'Test QR Offline Product',
                    sku: 'TEST-QR-001',
                    retail_price: 50000,
                    stock: 10
                });
                window.__qbiz_app__.state.data.products.push(newP);
                return newP.id;
            }
        """)

        # Call openQR
        await page.evaluate(f"() => window.__qbiz_app__.openQR('{product_id}')")
        await page.wait_for_timeout(1000)

        # 3. Check modal content
        modal_visible = await page.locator("#modalRoot .modal").is_visible()
        print(f"Modal visible: {modal_visible}")
        assert modal_visible, "QR modal should be visible"

        qr_svg_count = await page.locator("#qrCanvas svg").count()
        print(f"QR SVG elements rendered: {qr_svg_count}")
        assert qr_svg_count >= 1, "QR code SVG should be rendered inside #qrCanvas"

        # Check that empty error line is NOT present
        has_error = await page.locator("#qrCanvas:has-text('Không tải được bộ tạo QR')").count()
        print(f"Error count: {has_error}")
        assert has_error == 0, "QR code should render without 'Không tải được bộ tạo QR' error"

        # 4. Verify download buttons
        png_btn = await page.locator("button[data-qr-download='png']").is_visible()
        svg_btn = await page.locator("button[data-qr-download='svg']").is_visible()
        print(f"PNG btn: {png_btn}, SVG btn: {svg_btn}")
        assert png_btn and svg_btn, "Download PNG and SVG buttons must exist"

        print("TEST_FIX_OFFLINE_QR: PASS")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_offline_qr())
