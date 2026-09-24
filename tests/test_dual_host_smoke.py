import sys, os, time
from playwright.sync_api import sync_playwright

HOSTS = [
    {"name": "PRIMARY (Vercel)", "url": "https://qbiz-kho.vercel.app"},
    {"name": "BACKUP (Netlify)", "url": "https://qbiz-kho.netlify.app"}
]

VIEWPORTS = [
    {"name": "Mobile 390px (iPhone 13)", "width": 390, "height": 844, "is_mobile": True},
    {"name": "Mobile 412px (Android)", "width": 412, "height": 915, "is_mobile": True},
    {"name": "Desktop 1440px", "width": 1440, "height": 900, "is_mobile": False}
]

def run_tests():
    all_passed = True
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for host in HOSTS:
            hname = host["name"]
            hurl = host["url"]
            print(f"\n==========================================")
            print(f" TESTING {hname}: {hurl}")
            print(f"==========================================")

            for vp in VIEWPORTS:
                vpname = vp["name"]
                print(f"\n--- Viewport: {vpname} ---")
                
                context = browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    is_mobile=vp["is_mobile"],
                    has_touch=vp["is_mobile"]
                )
                page = context.new_page()

                console_errors = []
                page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
                page.on("pageerror", lambda err: console_errors.append(str(err)))

                # 1. Navigation & HTTP status
                t0 = time.time()
                resp = page.goto(hurl, wait_until="networkidle", timeout=30000)
                dur = round(time.time() - t0, 2)
                status = resp.status if resp else 0
                title = page.title()

                print(f"Status: {status} (took {dur}s) | Title: '{title}'")
                if status != 200:
                    print(f"FAIL: HTTP status {status} != 200")
                    all_passed = False

                # 2. Content integrity
                page.wait_for_timeout(1500)
                content_html = page.evaluate("() => document.getElementById('content') ? document.getElementById('content').innerHTML : ''")
                c_len = len(content_html)
                print(f"Content innerHTML length: {c_len}")
                if c_len < 5000:
                    print(f"FAIL: Content too short ({c_len} chars)")
                    all_passed = False

                # 3. Check horizontal overflow
                overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
                print(f"Horizontal overflow: {overflow}")
                if overflow:
                    print(f"FAIL: Horizontal overflow detected on {vpname}")
                    all_passed = False

                # 4. Check AI Button
                ai_btn = page.query_selector("[data-action='open-ai'], .ai-floating-btn, button:has-text('Trợ lý')")
                print(f"AI button found: {bool(ai_btn)}")
                if not ai_btn:
                    print("WARN: AI button element not matched by selector")

                # 5. Screenshot
                clean_name = hname.split()[0].lower()
                clean_vp = vpname.split()[0].lower()
                ss_path = f"tests/evidence/{clean_name}_{clean_vp}.png"
                os.makedirs("tests/evidence", exist_ok=True)
                page.screenshot(path=ss_path)
                print(f"Screenshot saved: {ss_path}")

                # 6. Check console errors
                # Filter benign errors if any (e.g. favicon 404 or analytics)
                critical_errors = [e for e in console_errors if "favicon" not in e.lower()]
                print(f"Console errors: {len(critical_errors)}")
                if critical_errors:
                    print(f"Errors: {critical_errors}")
                    all_passed = False

                context.close()

            # 7. IndexedDB persistence across reload test
            print(f"\n--- Testing IndexedDB persistence on {hname} ---")
            ctx = browser.new_context()
            p2 = ctx.new_page()
            p2.goto(hurl, wait_until="networkidle")
            p2.wait_for_timeout(1000)
            
            # Check DB version and DB name
            db_info = p2.evaluate("""() => {
                return new Promise((resolve) => {
                    const req = indexedDB.open('qbiz_kho_v1');
                    req.onsuccess = (e) => {
                        const db = e.target.result;
                        const v = db.version;
                        const stores = Array.from(db.objectStoreNames);
                        db.close();
                        resolve({ version: v, stores: stores });
                    };
                    req.onerror = () => resolve(null);
                });
            }""")
            print(f"IndexedDB info: {db_info}")
            if not db_info or db_info.get("version") != 12:
                print(f"FAIL: DB version is not 12 ({db_info})")
                all_passed = False

            # Reload test
            p2.reload(wait_until="networkidle")
            p2.wait_for_timeout(1000)
            reloaded_content = p2.evaluate("() => document.getElementById('content').innerHTML.length")
            print(f"Content length after reload: {reloaded_content}")
            if reloaded_content < 5000:
                print("FAIL: Content lost after reload")
                all_passed = False

            ctx.close()

        browser.close()

    print("\n==========================================")
    if all_passed:
        print("OVERALL RESULT: ALL HOST TESTS PASSED (100% OK)")
    else:
        print("OVERALL RESULT: FAILED CHECKS DETECTED")
    print("==========================================")
    return all_passed

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
