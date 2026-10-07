import sys
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.goto('http://localhost:4180', wait_until='networkidle')
    page.wait_for_timeout(500)
    
    # 1. Navigate to settings
    page.evaluate("() => { if (window.__qbiz_app__?.navigate) window.__qbiz_app__.navigate('settings'); }")
    page.wait_for_timeout(500)
    
    # 2. Click business mode
    page.click('[data-action="business-mode-selector"]')
    page.wait_for_timeout(400)
    modal = page.query_selector('.modal')
    assert modal is not None, "Modal should open"
    title = page.text_content('.modal-head h3')
    print("Test 1 PASS - Opened:", title.strip())
    
    # Close modal
    page.click('button[data-close]')
    page.wait_for_timeout(300)
    
    # 3. Click UI Profile
    page.click('[data-action="ui-profile-selector"]')
    page.wait_for_timeout(400)
    modal2 = page.query_selector('.modal')
    assert modal2 is not None, "UI profile modal should open"
    title2 = page.text_content('.modal-head h3')
    print("Test 2 PASS - Opened:", title2.strip())
    
    browser.close()
    print("ALL INTERACTION TESTS PASSED!")
