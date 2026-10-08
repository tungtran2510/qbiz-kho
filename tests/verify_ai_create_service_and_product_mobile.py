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

        print("[1] Mở ứng dụng QBiz Kho tại http://127.0.0.1:4180...")
        await page.goto("http://127.0.0.1:4180", wait_until="networkidle")
        await page.wait_for_timeout(1500)

        # Khởi tạo dữ liệu demo
        print("[2] Khởi tạo dữ liệu retail demo...")
        await page.evaluate("""async () => {
            if (window.previewDemo) {
                await window.previewDemo('retail');
            } else {
                const demoBtn = document.querySelector('[data-action=\"preview-demo\"]');
                if (demoBtn) demoBtn.click();
            }
            const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close]');
            if (modalClose) modalClose.click();
        }""")
        await page.wait_for_timeout(1500)

        # Mở Trợ lý AI
        print("[3] Mở trợ lý AI QBiz...")
        ai_trigger = page.locator("#qbizAiTrigger")
        await ai_trigger.click()
        await page.wait_for_timeout(1000)

        # Prompt 1: thêm dịch vụ sửa khóa túi 50k
        print("[4] Nhập câu lệnh: 'thêm dịch vụ sửa khóa túi 50k'...")
        ai_input = page.locator("#aiTextInput")
        await ai_input.fill("thêm dịch vụ sửa khóa túi 50k")
        await page.wait_for_timeout(300)

        ai_send = page.locator("#aiSendBtn")
        await ai_send.click()
        print("[5] Đã gửi, chờ trợ lý phản hồi Thẻ đề xuất dịch vụ...")

        # Chờ proposal card xuất hiện
        await page.wait_for_selector(".ai-proposal-card", timeout=8000)
        await page.wait_for_timeout(1000)

        # Chụp ảnh bằng chứng 1: Proposal Card cho 'Sửa khóa túi'
        path_p1 = os.path.join(ARTIFACT_DIR, "evidence_ai_proposal_service_sua_khoa_tui_mobile.png")
        await page.screenshot(path=path_p1)
        print(f"Captured: {path_p1}")

        # Bấm Xác nhận tạo dịch vụ
        print("[6] Bấm Xác nhận tạo dịch vụ...")
        confirm_btn = page.locator(".ai-proposal-card [data-confirm-proposal]").last
        await confirm_btn.click()
        await page.wait_for_selector(".ai-prop-status-ok", timeout=5000)
        await page.wait_for_timeout(800)

        # Chụp ảnh bằng chứng 2: Trạng thái đã xác nhận thành công
        path_c1 = os.path.join(ARTIFACT_DIR, "evidence_ai_service_confirmed_sua_khoa_tui_mobile.png")
        await page.screenshot(path=path_c1)
        print(f"Captured: {path_c1}")

        # Bấm nút 'Xem danh sách dịch vụ'
        print("[7] Bấm 'Xem danh sách dịch vụ' để chuyển sang tab Dịch vụ...")
        nav_btn = page.locator(".ai-proposal-card [data-action-id=\"open_products\"]").last
        if await nav_btn.count() > 0:
            await nav_btn.click()
            await page.wait_for_timeout(1000)

            # Đóng modal AI sheet để xem rõ màn hình Hàng hóa / Dịch vụ
            close_btn = page.locator("#aiCloseBtn")
            if await close_btn.count() > 0:
                await close_btn.click()
                await page.wait_for_timeout(500)

            # Chuyển sang tab Dịch vụ nếu chưa active
            svc_tab_btn = page.locator('[data-product-type=\"SERVICE\"]')
            if await svc_tab_btn.count() > 0:
                await svc_tab_btn.click()
                await page.wait_for_timeout(800)

            # Chụp ảnh bằng chứng 3: Tab Dịch vụ hiển thị dịch vụ vừa tạo
            path_tab = os.path.join(ARTIFACT_DIR, "evidence_products_service_tab_after_creation_mobile.png")
            await page.screenshot(path=path_tab)
            print(f"Captured: {path_tab}")

        # Mở lại AI trợ lý cho câu lệnh 2
        print("[8] Mở lại Trợ lý AI và thử câu thứ 2: 'thêm sửa chữa cặp vào dịch vụ giá 100k'...")
        await ai_trigger.click()
        await page.wait_for_timeout(1000)

        await ai_input.fill("thêm sửa chữa cặp vào dịch vụ giá 100k")
        await page.wait_for_timeout(300)
        await ai_send.click()

        # Chờ proposal card thứ 2 xuất hiện
        await page.wait_for_timeout(2000)
        path_p2 = os.path.join(ARTIFACT_DIR, "evidence_ai_proposal_service_sua_chua_cap_mobile.png")
        await page.screenshot(path=path_p2)
        print(f"Captured: {path_p2}")

        # Xác nhận câu thứ 2
        print("[9] Bấm Xác nhận câu thứ 2...")
        confirm_btn2 = page.locator(".ai-proposal-card [data-confirm-proposal]").last
        if await confirm_btn2.count() > 0:
            await confirm_btn2.click()
            await page.wait_for_timeout(1000)
            path_c2 = os.path.join(ARTIFACT_DIR, "evidence_ai_service_confirmed_sua_chua_cap_mobile.png")
            await page.screenshot(path=path_c2)
            print(f"Captured: {path_c2}")

        print("=== HOÀN TẤT KIỂM THỬ PLAYWRIGHT VÀ CHỤP ẢNH MINH CHỨNG ===")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
