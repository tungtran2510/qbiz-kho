import asyncio
import os
import sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCREENSHOT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # iPhone 13 viewport (390 x 844)
        context = await browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        )
        page = await context.new_page()
        
        print("Navigating to http://localhost:4180 ...")
        await page.goto("http://localhost:4180/#sales", wait_until="networkidle")
        await page.wait_for_function("() => typeof window.getOfficialReportData === 'function'")
        await page.wait_for_timeout(500)

        # -------------------------------------------------------------
        # 1. SCREENSHOT & TEST: POS Extras Modal (Invoice accordion + VAT below)
        # -------------------------------------------------------------
        print("Testing POS Extras Modal...")
        # Open Extras modal via JS or clicking sale extras button
        await page.evaluate("() => { if (typeof openSaleExtrasModal === 'function') openSaleExtrasModal(); }")
        await page.wait_for_timeout(600)
        
        # Capture Extras modal
        p1 = os.path.join(SCREENSHOT_DIR, "evidence_mobile_pos_extras_modal.png")
        await page.screenshot(path=p1)
        print(f"Captured: {p1}")

        # Expand invoice accordion and verify
        await page.evaluate("""() => {
            const acc = document.querySelector('.invoice-accordion');
            if (acc) {
                acc.open = true;
                acc.dispatchEvent(new Event('toggle'));
                const chk = document.querySelector('#modalReqInvoice');
                if (chk) {
                    chk.checked = true;
                    chk.dispatchEvent(new Event('change'));
                }
            }
        }""")
        await page.wait_for_timeout(500)
        p1_expanded = os.path.join(SCREENSHOT_DIR, "evidence_mobile_pos_extras_invoice_expanded.png")
        await page.screenshot(path=p1_expanded)
        print(f"Captured: {p1_expanded}")

        # Close modal
        await page.evaluate("() => { if (typeof closeModal === 'function') closeModal(); }")
        await page.wait_for_timeout(500)

        # -------------------------------------------------------------
        # 2. SCREENSHOT & TEST: Sổ S2b-HKD TT 88 preview modal
        # -------------------------------------------------------------
        print("Testing Sổ S2b-HKD TT 88 preview modal...")
        await page.evaluate("() => { if (typeof openExportReportModal === 'function') openExportReportModal('doanh-thu-tt88'); }")
        await page.wait_for_timeout(800)
        
        # Check text wrapping and layout
        check_voucher = await page.evaluate("""() => {
            const compName = document.querySelector('.voucher-company-info strong');
            const btns = Array.from(document.querySelectorAll('.voucher-actions button')).map(b => ({
                text: b.innerText.trim(),
                width: b.offsetWidth,
                height: b.offsetHeight,
                scrollWidth: b.scrollWidth
            }));
            return {
                compNameText: compName ? compName.innerText : '',
                btns
            };
        }""")
        print("Voucher check result:", check_voucher)

        p2 = os.path.join(SCREENSHOT_DIR, "evidence_mobile_tt88_voucher_modal.png")
        await page.screenshot(path=p2)
        print(f"Captured: {p2}")

        # Close modal
        await page.evaluate("() => { if (typeof closeModal === 'function') closeModal(); }")
        await page.wait_for_timeout(500)

        # -------------------------------------------------------------
        # 3. SCREENSHOT & TEST: Báo cáo & Xuất dữ liệu (renderExports)
        # -------------------------------------------------------------
        print("Testing Báo cáo & Xuất dữ liệu screen...")
        await page.evaluate("() => { if (typeof renderExports === 'function') renderExports(); }")
        await page.wait_for_timeout(600)

        p3 = os.path.join(SCREENSHOT_DIR, "evidence_mobile_reports_export_center.png")
        await page.screenshot(path=p3)
        print(f"Captured: {p3}")

        # -------------------------------------------------------------
        # 4. SCREENSHOT & TEST: Báo cáo thuế Tab (renderFeatureReports tax tab)
        # -------------------------------------------------------------
        print("Testing Báo cáo thuế tab...")
        await page.evaluate("""() => {
            if (typeof state !== 'undefined') {
                state.page = 'reports';
                state.reportTab = 'tax';
                if (typeof renderFeatureReports === 'function') renderFeatureReports();
            }
        }""")
        await page.wait_for_timeout(600)

        p4 = os.path.join(SCREENSHOT_DIR, "evidence_mobile_tax_tab_official_books.png")
        await page.screenshot(path=p4)
        print(f"Captured: {p4}")

        # -------------------------------------------------------------
        # 5. TEST: Test CSV export data content verification
        # -------------------------------------------------------------
        print("Testing CSV Export generation...")
        csv_result = await page.evaluate("""() => {
            const rep = window.getOfficialReportData('doanh-thu-tt88');
            let downloaded = null;
            const origDownload = window.downloadText;
            window.downloadText = (name, text, type) => {
                downloaded = { name, text, type };
            };
            window.exportReportCsv(rep);
            window.downloadText = origDownload;
            return downloaded;
        }""")
        print(f"CSV exported file: {csv_result['name'] if csv_result else 'None'}")
        if csv_result:
            first_lines = csv_result['text'].split('\r\n')[:12]
            print("CSV Header lines:\n" + "\n".join(first_lines))

        await browser.close()
        print("Playwright Mobile QA complete!")

if __name__ == '__main__':
    asyncio.run(main())
