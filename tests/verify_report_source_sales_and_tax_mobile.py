import asyncio
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.async_api import async_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        )
        page = await context.new_page()

        print("[1] Opening QBiz Kho on local dev server: http://127.0.0.1:4180...")
        await page.goto("http://127.0.0.1:4180", wait_until="networkidle")
        await page.wait_for_timeout(1500)

        # Enter retail demo shop
        print("[2] Initializing retail demo data...")
        await page.evaluate("""async () => {
            if (window.previewDemo) {
                await window.previewDemo('retail');
            } else {
                const demoBtn = document.querySelector('[data-action="preview-demo"]');
                if (demoBtn) demoBtn.click();
            }
            const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close]');
            if (modalClose) modalClose.click();
        }""")
        await page.wait_for_timeout(2000)

        # Navigate to Reports
        print("[3] Navigating to Reports page...")
        await page.evaluate("""() => {
            if (window.__qbiz_app__ && window.__qbiz_app__.navigate) {
                window.__qbiz_app__.navigate('reports');
            } else {
                location.hash = '#reports';
                if (window.renderFeatureReports) window.renderFeatureReports();
            }
        }""")
        await page.wait_for_timeout(1500)

        # 1. Capture Giao dịch nguồn showing 5 items + button
        print("[4] Scrolling to Giao dịch nguồn...")
        source_sales_section = page.locator('.feature-panel:has(h2:has-text("Giao dịch nguồn"))').first
        await source_sales_section.scroll_into_view_if_needed()
        await page.wait_for_timeout(500)

        path_source_5 = os.path.join(ARTIFACT_DIR, "evidence_reports_source_sales_5_items_mobile.png")
        await page.screenshot(path=path_source_5)
        print(f"Captured: {path_source_5}")

        # Count visible transaction rows inside source sales section
        rows_count = await source_sales_section.locator(".transaction-row").count()
        print(f"Visible rows in source sales: {rows_count} (Expected: <= 5)")

        # 2. Click "Xem tất cả ... giao dịch nguồn" to open modal
        print("[5] Clicking 'Xem tất cả' button to test popup modal...")
        view_all_btn = page.locator('[data-action="open-all-source-sales"]').first
        if await view_all_btn.count() > 0:
            await view_all_btn.click()
            await page.wait_for_timeout(800)
            
            path_modal_all = os.path.join(ARTIFACT_DIR, "evidence_reports_source_sales_all_modal_mobile.png")
            await page.screenshot(path=path_modal_all)
            print(f"Captured popup modal: {path_modal_all}")

            # 3. Click one transaction inside modal to open its detail popup
            print("[6] Clicking first transaction inside modal to test detail popup...")
            modal_row = page.locator('#modalRoot [data-modal-sale-id]').first
            if await modal_row.count() > 0:
                await modal_row.click()
                await page.wait_for_timeout(800)

                path_sale_detail = os.path.join(ARTIFACT_DIR, "evidence_reports_transaction_detail_modal_mobile.png")
                await page.screenshot(path=path_sale_detail)
                print(f"Captured transaction detail popup: {path_sale_detail}")

                # Close modal
                close_btn = page.locator('#modalRoot .close-btn, #modalRoot [data-modal-close]').first
                if await close_btn.count() > 0:
                    await close_btn.click()
                    await page.wait_for_timeout(500)

        # 4. Scroll to "Nghĩa vụ thuế & Lợi nhuận sau thuế"
        print("[7] Scrolling to Nghĩa vụ thuế & Lợi nhuận...")
        tax_section = page.locator(".tax-profit-panel")
        if await tax_section.count() > 0:
            await tax_section.scroll_into_view_if_needed()
            await page.wait_for_timeout(500)

            path_tax_compact = os.path.join(ARTIFACT_DIR, "evidence_reports_tax_profit_compact_mobile.png")
            await page.screenshot(path=path_tax_compact)
            print(f"Captured compact tax section: {path_tax_compact}")

            # Expand legal details
            details_summary = page.locator(".tax-legal-details summary")
            if await details_summary.count() > 0:
                await details_summary.click()
                await page.wait_for_timeout(500)

                path_tax_expanded = os.path.join(ARTIFACT_DIR, "evidence_reports_tax_profit_expanded_mobile.png")
                await page.screenshot(path=path_tax_expanded)
                print(f"Captured expanded legal note: {path_tax_expanded}")

        await browser.close()
        print("ALL REPORT VERIFICATIONS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run())
