import os
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
    )
    page = context.new_page()
    page.goto("http://localhost:4180", wait_until="networkidle")
    page.wait_for_timeout(2000)
    
    # Enter demo
    page.evaluate("""() => {
        const demoBtn = document.querySelector('[data-action="preview-demo"]');
        if (demoBtn) demoBtn.click();
        const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close]');
        if (modalClose) modalClose.click();
    }""")
    page.wait_for_timeout(1500)
    
    # Navigate to returns
    page.evaluate("() => { window.__qbiz_app__.navigate('returns'); }")
    page.wait_for_timeout(1000)
    
    # 1. Open Return modal on HD-0001
    page.evaluate("""() => {
        const btn = document.querySelector('[data-return-sale]');
        if (btn) btn.click();
    }""")
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(ARTIFACT_DIR, "inspect_return_tab.png"))
    
    # 2. Click "Đổi hàng" tab
    page.evaluate("""() => {
        const tabEx = document.querySelector('#retTabExchange');
        if (tabEx) tabEx.click();
    }""")
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(ARTIFACT_DIR, "inspect_exchange_tab.png"))
    
    browser.close()
print("Captured inspection screenshots!")
