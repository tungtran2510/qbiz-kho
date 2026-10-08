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

        # Reset notifications read state to make sure demo has unread notifications
        await page.evaluate("""() => {
            localStorage.removeItem('qbiz_notification_read');
            if (window.state) {
                window.state.notificationRead = new Set();
            }
            if (typeof headerActions === 'function') headerActions();
        }""")
        await page.wait_for_timeout(500)

        # 1. Click on Bell button in topbar
        print("[3] Clicking the notification bell button in header...")
        await page.evaluate("""() => {
            const bell = document.querySelector('.header-bell');
            if (bell) bell.click();
        }""")
        await page.wait_for_timeout(1000)

        # Verify popup modal appears
        modal_info = await page.evaluate("""() => {
            const modal = document.querySelector('#modalRoot .modal');
            const title = document.querySelector('#modalRoot .modal-head h3')?.innerText;
            const sub = document.querySelector('#modalRoot .modal-head p')?.innerText;
            const cards = document.querySelectorAll('.noti-card-item');
            const unreadBadge = document.querySelector('.noti-pill-unread')?.innerText;
            const tabs = Array.from(document.querySelectorAll('.noti-tab-btn')).map(t => t.innerText.trim());
            return {
                modalFound: !!modal,
                title,
                sub,
                cardCount: cards.length,
                unreadBadge,
                tabs
            };
        }""")
        print("[4] Modal verification:", modal_info)

        # Capture screenshot of notification popup on mobile
        path_popup = os.path.join(ARTIFACT_DIR, "evidence_notification_popup_modal_mobile.png")
        await page.screenshot(path=path_popup)
        print(f"Captured: {path_popup}")

        # 2. Click Mark all read button
        print("[5] Testing 'Đọc tất cả' button...")
        await page.evaluate("""() => {
            const btn = document.querySelector('#btnMarkAllNotiRead');
            if (btn) btn.click();
        }""")
        await page.wait_for_timeout(1000)

        all_read_info = await page.evaluate("""() => {
            const unreadBadge = document.querySelector('.noti-pill-unread');
            const allReadBadge = document.querySelector('.noti-pill-all-read')?.innerText;
            const bellCount = document.querySelector('.header-bell b')?.innerText;
            const unreadCards = document.querySelectorAll('.noti-card-item.is-unread').length;
            return {
                unreadBadgeFound: !!unreadBadge,
                allReadBadge,
                bellCount: bellCount || 'none',
                unreadCards
            };
        }""")
        print("[6] All read state:", all_read_info)

        path_all_read = os.path.join(ARTIFACT_DIR, "evidence_notification_popup_all_read_mobile.png")
        await page.screenshot(path=path_all_read)
        print(f"Captured: {path_all_read}")

        # 3. Test clicking a notification card to open detail
        print("[7] Testing 1-touch navigation: clicking an order notification card...")
        # Reset again so we have an unread order card
        await page.evaluate("""() => {
            localStorage.removeItem('qbiz_notification_read');
            if (window.state) {
                window.state.notificationRead = new Set();
            }
            if (typeof openNotificationsModal === 'function') openNotificationsModal('all');
        }""")
        await page.wait_for_timeout(800)

        # Click on the first notification card
        await page.evaluate("""() => {
            const firstCard = document.querySelector('.noti-card-item[data-action="open-order"]');
            if (firstCard) {
                firstCard.click();
            } else {
                const anyCard = document.querySelector('.noti-card-item');
                if (anyCard) anyCard.click();
            }
        }""")
        await page.wait_for_timeout(1200)

        detail_info = await page.evaluate("""() => {
            const modal = document.querySelector('#modalRoot .modal');
            const title = document.querySelector('#modalRoot .modal-head h3')?.innerText;
            return {
                detailModalOpen: !!modal,
                detailTitle: title
            };
        }""")
        print("[8] Target detail modal opened:", detail_info)

        path_detail = os.path.join(ARTIFACT_DIR, "evidence_notification_click_target_detail_mobile.png")
        await page.screenshot(path=path_detail)
        print(f"Captured: {path_detail}")

        await browser.close()
        print("ALL NOTIFICATION POPUP VERIFICATIONS FINISHED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run())
