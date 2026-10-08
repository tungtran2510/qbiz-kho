import asyncio
import os
import sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCREENSHOT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

REPORTS = [
    {
        'key': 'nhap-xuat-ton',
        'title': 'Báo cáo Nhập - Xuất - Tồn tổng hợp',
        'standard': 'Chuẩn kế toán Việt Nam'
    },
    {
        'key': 'doanh-thu-tt88',
        'title': 'Sổ chi tiết doanh thu bán hàng (Hộ KD TT 88)',
        'standard': 'Mẫu số S2b-HKD (Thông tư 88/2021/TT-BTC)'
    },
    {
        'key': 'bang-ke-xuat-tt200',
        'title': 'Bảng kê chứng từ xuất kho (Doanh nghiệp TT 200/133)',
        'standard': 'Thông tư 200/2014 & TT 133/2016'
    }
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # PART A: DESKTOP AUDIT (1440x900)
        # -------------------------------------------------------------
        print("\n=== [1] TESTING DESKTOP REPORTS (1440x900) ===")
        context_dt = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page_dt = await context_dt.new_page()
        
        errors_dt = []
        page_dt.on('pageerror', lambda err: errors_dt.append(str(err)))
        
        await page_dt.goto("http://localhost:4180/#reports", wait_until="networkidle")
        await page_dt.wait_for_function("() => typeof window.getOfficialReportData === 'function'")

        # 1. Desktop Tax Tab
        await page_dt.evaluate("""() => {
            state.page = 'reports';
            state.reportTab = 'tax';
            renderFeatureReports();
        }""")
        await page_dt.wait_for_timeout(400)
        p_tax_dt = os.path.join(SCREENSHOT_DIR, "evidence_audit_desktop_tax_tab.png")
        await page_dt.screenshot(path=p_tax_dt)
        print(f"Captured Desktop Tax Tab: {p_tax_dt}")

        # 2. Desktop Official Report Modals
        for rep in REPORTS:
            key = rep['key']
            print(f"Testing Desktop Modal for: {rep['title']} ({key})...")
            await page_dt.evaluate(f"window.openExportReportModal('{key}')")
            await page_dt.wait_for_timeout(500)

            # Inspect modal content
            data_check = await page_dt.evaluate("""() => {
                const sheet = document.querySelector('.voucher-sheet');
                const title = document.querySelector('.voucher-heading h1')?.innerText;
                const standard = document.querySelector('.voucher-form-code b')?.innerText;
                const comp = document.querySelector('.voucher-company-info strong')?.innerText;
                const rows = document.querySelectorAll('.voucher-table tbody tr').length;
                const sigs = Array.from(document.querySelectorAll('.sig-col .sig-header strong')).map(s => s.innerText);
                const btns = Array.from(document.querySelectorAll('.voucher-actions button')).map(b => b.innerText.trim());
                return { title, standard, comp, rows, sigs, btns };
            }""")
            print(f"  -> Title: {data_check['title']}")
            print(f"  -> Standard: {data_check['standard']}")
            print(f"  -> Company: {data_check['comp']}")
            print(f"  -> Data rows in table: {data_check['rows']}")
            print(f"  -> Signatures: {', '.join(data_check['sigs'])}")
            print(f"  -> Action buttons: {', '.join(data_check['btns'])}")

            p_modal_dt = os.path.join(SCREENSHOT_DIR, f"evidence_audit_desktop_{key}.png")
            await page_dt.screenshot(path=p_modal_dt)
            print(f"  -> Screenshot: {p_modal_dt}")

            # Close modal
            await page_dt.evaluate("window.closeModal()")
            await page_dt.wait_for_timeout(300)

        await context_dt.close()

        # -------------------------------------------------------------
        # PART B: MOBILE AUDIT (390x844 - iPhone 13)
        # -------------------------------------------------------------
        print("\n=== [2] TESTING MOBILE REPORTS (390x844 - iPhone 13) ===")
        context_mb = await browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        )
        page_mb = await context_mb.new_page()
        errors_mb = []
        page_mb.on('pageerror', lambda err: errors_mb.append(str(err)))

        await page_mb.goto("http://localhost:4180/#reports", wait_until="networkidle")
        await page_mb.wait_for_function("() => typeof window.getOfficialReportData === 'function'")

        # 1. Mobile Tax Tab
        await page_mb.evaluate("""() => {
            state.page = 'reports';
            state.reportTab = 'tax';
            renderFeatureReports();
        }""")
        await page_mb.wait_for_timeout(400)
        p_tax_mb = os.path.join(SCREENSHOT_DIR, "evidence_audit_mobile_tax_tab.png")
        await page_mb.screenshot(path=p_tax_mb)
        print(f"Captured Mobile Tax Tab: {p_tax_mb}")

        # 2. Mobile Export Center
        await page_mb.evaluate("window.renderExports()")
        await page_mb.wait_for_timeout(400)
        p_exp_mb = os.path.join(SCREENSHOT_DIR, "evidence_audit_mobile_export_center.png")
        await page_mb.screenshot(path=p_exp_mb)
        print(f"Captured Mobile Export Center: {p_exp_mb}")

        # 3. Mobile Official Report Modals for all 3 reports
        for rep in REPORTS:
            key = rep['key']
            print(f"Testing Mobile Modal for: {rep['title']} ({key})...")
            await page_mb.evaluate(f"window.openExportReportModal('{key}')")
            await page_mb.wait_for_timeout(500)

            # Check button wrapping
            btn_wrapping = await page_mb.evaluate("""() => {
                const btns = Array.from(document.querySelectorAll('.voucher-actions button'));
                return btns.map(b => ({
                    text: b.innerText.trim(),
                    width: b.offsetWidth,
                    scrollWidth: b.scrollWidth,
                    wrapped: b.scrollWidth > b.offsetWidth + 1
                }));
            }""")
            print(f"  -> Mobile buttons geometry: {btn_wrapping}")

            p_modal_mb = os.path.join(SCREENSHOT_DIR, f"evidence_audit_mobile_{key}.png")
            await page_mb.screenshot(path=p_modal_mb)
            print(f"  -> Screenshot: {p_modal_mb}")

            # Close modal
            await page_mb.evaluate("window.closeModal()")
            await page_mb.wait_for_timeout(300)

        # -------------------------------------------------------------
        # PART C: TEST ALL 12 REPORTS TABS
        # -------------------------------------------------------------
        print("\n=== [3] TESTING ALL 12 REPORTS TABS (ZERO CRASH GATE) ===")
        tabs = ['overview', 'revenue', 'tax', 'orders', 'products', 'inventory', 'payments', 'returns', 'debt', 'customers', 'staff', 'shipping']
        tab_results = {}
        for t in tabs:
            res = await page_mb.evaluate(f"""() => {{
                try {{
                    state.page = 'reports';
                    state.reportTab = '{t}';
                    renderFeatureReports();
                    const content = document.querySelector('#content');
                    return {{
                        tab: '{t}',
                        hasContent: Boolean(content && content.innerText.trim()),
                        hasError: content && content.innerText.includes('Cannot read')
                    }};
                }} catch (e) {{
                    return {{ tab: '{t}', error: e.message }};
                }}
            }}""")
            tab_results[t] = res
            print(f"  Tab [{t}]: {res}")

        await context_mb.close()
        await browser.close()

        print("\n=== AUDIT SUMMARY ===")
        print(f"Desktop Errors: {len(errors_dt)}")
        print(f"Mobile Errors: {len(errors_mb)}")
        all_tabs_ok = all(r.get('hasContent') and not r.get('error') for r in tab_results.values())
        print(f"All 12 tabs render successfully: {all_tabs_ok}")

if __name__ == '__main__':
    asyncio.run(main())
