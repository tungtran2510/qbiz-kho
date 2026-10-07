from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(
        viewport={'width': 390, 'height': 844},
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15"
    )
    page.goto('http://localhost:4180/', wait_until='domcontentloaded')
    page.wait_for_timeout(1500)
    page.evaluate("""async () => {
        const demoBtn = document.querySelector('[data-action="preview-demo"]');
        if (demoBtn) demoBtn.click();
        else if (window.previewDemo) await window.previewDemo('retail');
        const modalClose = document.querySelector('#modalRoot [data-close], #modalRoot .close-btn');
        if (modalClose) modalClose.click();
    }""")
    page.wait_for_timeout(1000)

    # Click Goods tab
    page.click("[data-page='products']")
    page.wait_for_timeout(1000)
    page.screenshot(path='C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/debug_products_tab.png')

    # Click Service segment
    page.click("[data-product-type='SERVICE']")
    page.wait_for_timeout(1000)
    page.screenshot(path='C:/Users/Admin/.gemini/antigravity/brain/b47395b3-a2f2-4e22-a716-5540d7b61424/debug_services_tab.png')

    browser.close()
print('DONE')
