import asyncio
import os
import sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SCREENSHOT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
VERCEL_URL = "https://qbiz-kho.vercel.app"

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

        # MOBILE 390x844 (iPhone 13)
        print(f"\n=== VERIFYING LIVE VERCEL PRODUCTION: {VERCEL_URL} (Mobile 390x844) ===")
        context_mb = await browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        )
        page = await context_mb.new_page()

        console_errors = []
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: console_errors.append(str(err)))

        print("Navigating to live Vercel reports...")
        resp = await page.goto(f"{VERCEL_URL}/#reports", wait_until="networkidle", timeout=45000)
        print(f"HTTP Status: {resp.status if resp else 'N/A'}")
        await page.wait_for_timeout(2000)

        # 1. Tax tab with official report cards
        print("\n--- 1. Testing Tax Reports Tab on Vercel ---")
        await page.evaluate("""() => {
            state.page = 'reports';
            state.reportTab = 'tax';
            renderFeatureReports();
        }""")
        await page.wait_for_timeout(800)
        p_tax = os.path.join(SCREENSHOT_DIR, "live_vercel_mobile_tax_tab.png")
        await page.screenshot(path=p_tax)
        print(f"Captured: {p_tax}")

        # Check report cards in tax tab
        card_info = await page.evaluate("""() => {
            const cards = Array.from(document.querySelectorAll('.mod-report-card'));
            return cards.map(c => ({
                title: c.querySelector('h4')?.innerText,
                badge: c.querySelector('.mod-report-badge')?.innerText,
                hasPreviewBtn: Boolean(c.querySelector("button[onclick*='openExportReportModal']")),
                hasExcelBtn: Boolean(c.querySelector("button[onclick*='exportReportExcel']")),
                hasCsvBtn: Boolean(c.querySelector("button[onclick*='exportReportCsv']"))
            }));
        }""")
        print(f"Tax cards detected: {len(card_info)}")
        for c in card_info:
            print(f"  - Card: {c['title']} | Badge: {c['badge']} | Btns: Preview={c['hasPreviewBtn']}, Excel={c['hasExcelBtn']}, CSV={c['hasCsvBtn']}")

        # 2. Test opening each official report modal on live Vercel
        print("\n--- 2. Testing Official Report Modals on Vercel ---")
        for rep in REPORTS:
            key = rep['key']
            print(f"\nOpening Modal for {rep['title']} ({key})...")
            await page.evaluate(f"window.openExportReportModal('{key}')")
            await page.wait_for_timeout(800)

            modal_data = await page.evaluate("""() => {
                const sheet = document.querySelector('.voucher-sheet');
                const title = document.querySelector('.voucher-heading h1')?.innerText;
                const standard = document.querySelector('.voucher-form-code b')?.innerText;
                const comp = document.querySelector('.voucher-company-info strong')?.innerText;
                const rows = document.querySelectorAll('.voucher-table tbody tr').length;
                const sigs = Array.from(document.querySelectorAll('.sig-col .sig-header strong')).map(s => s.innerText);
                const btns = Array.from(document.querySelectorAll('.voucher-actions button')).map(b => ({
                    text: b.innerText.trim(),
                    w: b.offsetWidth,
                    sw: b.scrollWidth,
                    wrapped: b.scrollWidth > b.offsetWidth + 1
                }));
                return { hasSheet: Boolean(sheet), title, standard, comp, rows, sigs, btns };
            }""")
            print(f"  -> Modal sheet rendered: {modal_data['hasSheet']}")
            print(f"  -> Title: {modal_data['title']}")
            print(f"  -> Standard: {modal_data['standard']}")
            print(f"  -> Company: {modal_data['comp']}")
            print(f"  -> Data rows: {modal_data['rows']}")
            print(f"  -> Signatures: {modal_data['sigs']}")
            print(f"  -> Buttons: {modal_data['btns']}")

            p_modal = os.path.join(SCREENSHOT_DIR, f"live_vercel_mobile_modal_{key}.png")
            await page.screenshot(path=p_modal)
            print(f"  -> Screenshot: {p_modal}")

            # Close modal
            await page.evaluate("window.closeModal()")
            await page.wait_for_timeout(400)

        # 3. Test POS Checkout Extras Modal (HĐĐT Accordion & Thuế VAT underneath)
        print("\n--- 3. Testing POS Checkout Extras Modal on Vercel ---")
        await page.goto(f"{VERCEL_URL}/#sales", wait_until="networkidle")
        await page.wait_for_timeout(1000)

        # Open checkout extras modal
        await page.evaluate("window.openCheckoutExtrasModal()")
        await page.wait_for_timeout(800)

        extras_check = await page.evaluate("""() => {
            const modal = document.querySelector('.checkout-extras-modal, .modal-sheet, .modal-content');
            const hddtSummary = document.querySelector('.checkout-extras-details summary')?.innerText;
            const hddtOpen = document.querySelector('.checkout-extras-details')?.open;
            const vatSection = document.querySelector('.tax-rate-quick');
            return {
                hasModal: Boolean(modal),
                hddtSummary,
                hddtOpen,
                hasVatPills: Boolean(vatSection)
            };
        }""")
        print(f"POS Extras Modal Rendered: {extras_check['hasModal']}")
        print(f"HĐĐT Accordion Summary: {extras_check['hddtSummary']} (open={extras_check['hddtOpen']})")
        print(f"VAT Section Present: {extras_check['hasVatPills']}")

        p_pos_extras = os.path.join(SCREENSHOT_DIR, "live_vercel_mobile_pos_extras_modal.png")
        await page.screenshot(path=p_pos_extras)
        print(f"Captured: {p_pos_extras}")

        # Close modal
        await page.evaluate("window.closeModal()")
        await page.wait_for_timeout(400)

        # 4. Check Desktop Viewport (1440x900)
        print("\n=== VERIFYING LIVE VERCEL PRODUCTION (Desktop 1440x900) ===")
        context_dt = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page_dt = await context_dt.new_page()
        await page_dt.goto(f"{VERCEL_URL}/#reports", wait_until="networkidle", timeout=45000)
        await page_dt.wait_for_timeout(1500)

        # Open S2b-HKD modal on desktop
        await page_dt.evaluate("window.openExportReportModal('doanh-thu-tt88')")
        await page_dt.wait_for_timeout(800)
        p_dt_s2b = os.path.join(SCREENSHOT_DIR, "live_vercel_desktop_modal_doanh-thu-tt88.png")
        await page_dt.screenshot(path=p_dt_s2b)
        print(f"Captured Desktop S2b-HKD: {p_dt_s2b}")
        await page_dt.evaluate("window.closeModal()")
        await page_dt.wait_for_timeout(400)

        # Open Nhap-Xuat-Ton on desktop
        await page_dt.evaluate("window.openExportReportModal('nhap-xuat-ton')")
        await page_dt.wait_for_timeout(800)
        p_dt_nxt = os.path.join(SCREENSHOT_DIR, "live_vercel_desktop_modal_nhap-xuat-ton.png")
        await page_dt.screenshot(path=p_dt_nxt)
        print(f"Captured Desktop Nhap-Xuat-Ton: {p_dt_nxt}")
        await page_dt.evaluate("window.closeModal()")
        await page_dt.wait_for_timeout(400)

        # Open Bang-ke-xuat on desktop
        await page_dt.evaluate("window.openExportReportModal('bang-ke-xuat-tt200')")
        await page_dt.wait_for_timeout(800)
        p_dt_bk = os.path.join(SCREENSHOT_DIR, "live_vercel_desktop_modal_bang-ke-xuat-tt200.png")
        await page_dt.screenshot(path=p_dt_bk)
        print(f"Captured Desktop Bang-ke-xuat: {p_dt_bk}")

        await context_dt.close()
        await context_mb.close()
        await browser.close()

        print("\n=== LIVE VERCEL VERIFICATION COMPLETE ===")
        print(f"Total Console Errors: {len(console_errors)}")
        if console_errors:
            print("Errors:", console_errors)

if __name__ == '__main__':
    asyncio.run(main())
