import sys
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:4180/')
    page.wait_for_function('() => window.__qbiz_app__')
    page.evaluate('() => window.__qbiz_app__.previewDemo("service")')
    page.wait_for_timeout(1000)
    
    res = page.evaluate('''async () => {
        const skills = await import('./src/ai/skills.js');
        return await skills.executeSkill('top-selling-products', { period: 'month' }, {}, window.__qbiz_app__.state);
    }''')
    print('Service Top Selling Result:')
    print(res.get('text'))
    browser.close()
