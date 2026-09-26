import os
from playwright.sync_api import sync_playwright

VIEWPORTS = [
    {"name": "390x844", "width": 390, "height": 844, "is_mobile": True},
    {"name": "412x915", "width": 412, "height": 915, "is_mobile": True},
    {"name": "1440x900", "width": 1440, "height": 900, "is_mobile": False},
]

def capture_baseline():
    os.makedirs('tests/evidence', exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for vp in VIEWPORTS:
            context = browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                is_mobile=vp["is_mobile"],
                has_touch=vp["is_mobile"]
            )
            page = context.new_page()
            # Clean session to capture clean unauthenticated landing
            page.goto('http://127.0.0.1:4180/')
            page.evaluate("() => { sessionStorage.clear(); localStorage.removeItem('qbiz_auth_session'); localStorage.removeItem('qbiz_active_shop'); }")
            page.reload(wait_until='networkidle')
            page.wait_for_timeout(1000)
            
            out_path = f"tests/evidence/production_baseline_{vp['name']}.png"
            page.screenshot(path=out_path, full_page=False)
            print(f"Captured {vp['name']} -> {out_path}")
        browser.close()

if __name__ == '__main__':
    capture_baseline()
