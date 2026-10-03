import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
BASE_URL = "http://127.0.0.1:4180"

def inspect():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Desktop inspection
        page = browser.new_page(viewport={"width": 1280, "height": 850})
        # Clear storage
        page.goto(BASE_URL)
        page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_timeout(500)

        # If public entry card is visible, click preview-demo
        demo_btn = page.locator("[data-action='preview-demo']")
        if demo_btn.is_visible():
            demo_btn.click()
            page.wait_for_timeout(3500)

        # Wait for public-entry-overlay to be gone
        page.wait_for_selector(".public-entry-overlay", state="detached", timeout=3000)
        page.wait_for_timeout(500)

        # Capture clear desktop dashboard
        page.screenshot(path=os.path.join(ARTIFACT_DIR, "inspect_desktop_clean.png"))
        print("Captured inspect_desktop_clean.png")

        # Capture element screenshot of the banner
        banner = page.locator("#firstVisitInstallBanner")
        if banner.is_visible():
            banner.screenshot(path=os.path.join(ARTIFACT_DIR, "inspect_banner_close.png"))
            print("Captured inspect_banner_close.png")

        # Scroll desktop down to verify sticky behavior
        page.evaluate("window.scrollTo(0, 400)")
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(ARTIFACT_DIR, "inspect_desktop_scrolled_sticky.png"))
        print("Captured inspect_desktop_scrolled_sticky.png")

        # 2. Mobile inspection
        page_mobile = browser.new_page(viewport={"width": 390, "height": 844})
        page_mobile.goto(BASE_URL)
        page_mobile.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
        page_mobile.goto(BASE_URL, wait_until="networkidle")
        page_mobile.wait_for_timeout(500)

        m_demo = page_mobile.locator("[data-action='preview-demo']")
        if m_demo.is_visible():
            m_demo.click()
            page_mobile.wait_for_timeout(3500)

        page_mobile.wait_for_selector(".public-entry-overlay", state="detached", timeout=3000)
        page_mobile.wait_for_timeout(500)

        page_mobile.screenshot(path=os.path.join(ARTIFACT_DIR, "inspect_mobile_clean.png"))
        print("Captured inspect_mobile_clean.png")

        # Scroll mobile down to verify sticky behavior
        page_mobile.evaluate("window.scrollTo(0, 400)")
        page_mobile.wait_for_timeout(300)
        page_mobile.screenshot(path=os.path.join(ARTIFACT_DIR, "inspect_mobile_scrolled_sticky.png"))
        print("Captured inspect_mobile_scrolled_sticky.png")

        browser.close()

if __name__ == "__main__":
    inspect()
