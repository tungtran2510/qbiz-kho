import os
from playwright.sync_api import sync_playwright

output_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
os.makedirs(output_dir, exist_ok=True)

with sync_playwright() as p:
    # 1. Mobile (iPhone 13 - 390x844)
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
    )
    page = context.new_page()
    page.goto('http://localhost:4180', wait_until='networkidle')
    page.wait_for_timeout(600)
    
    # Navigate to Settings
    page.evaluate("() => { if (window.__qbiz_app__?.navigate) window.__qbiz_app__.navigate('settings'); }")
    page.wait_for_timeout(600)
    
    # Top view
    shot_top = os.path.join(output_dir, "evidence_settings_optimized_top.png")
    page.screenshot(path=shot_top, full_page=False)
    print(f"Captured: {shot_top}")
    
    # Scroll down view
    page.evaluate("window.scrollTo(0, 420)")
    page.wait_for_timeout(400)
    shot_bottom = os.path.join(output_dir, "evidence_settings_optimized_bottom.png")
    page.screenshot(path=shot_bottom, full_page=False)
    print(f"Captured: {shot_bottom}")
    
    # 2. Desktop view (1280x800)
    context_dt = browser.new_context(viewport={'width': 1280, 'height': 800})
    page_dt = context_dt.new_page()
    page_dt.goto('http://localhost:4180', wait_until='networkidle')
    page_dt.wait_for_timeout(600)
    page_dt.evaluate("() => { if (window.__qbiz_app__?.navigate) window.__qbiz_app__.navigate('settings'); }")
    page_dt.wait_for_timeout(600)
    shot_dt = os.path.join(output_dir, "evidence_settings_optimized_desktop.png")
    page_dt.screenshot(path=shot_dt, full_page=False)
    print(f"Captured: {shot_dt}")
    
    browser.close()
