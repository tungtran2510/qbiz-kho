import sys, os
from playwright.sync_api import sync_playwright

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.goto('http://localhost:4180/')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.ai')
        page.evaluate("() => window.__qbiz_app__.previewDemo('fashion')")
        page.wait_for_timeout(600)

        # Open AI chat using #qbizAiTrigger
        page.click('#qbizAiTrigger')
        page.wait_for_timeout(800)

        # Send first question: E-commerce Shopee / TikTok tax policy
        page.fill('#aiTextInput', 'Bán trên shopee với tiktok thì thuế tính sao?')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        os.makedirs('tests/evidence', exist_ok=True)
        page.screenshot(path='tests/evidence/evidence_ai_tax_chat_ecom.png')
        print('Saved: tests/evidence/evidence_ai_tax_chat_ecom.png')

        # Send second question: Live tax calculation
        page.fill('#aiTextInput', 'Tháng này shop phải nộp bao nhiêu thuế?')
        page.click('#aiSendBtn')
        page.wait_for_timeout(1500)

        page.screenshot(path='tests/evidence/evidence_ai_tax_chat_calculation.png')
        print('Saved: tests/evidence/evidence_ai_tax_chat_calculation.png')

        browser.close()

if __name__ == '__main__':
    capture()
