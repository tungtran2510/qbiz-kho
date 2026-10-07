import time, os
from playwright.sync_api import sync_playwright

def capture_live():
    url = "https://qbiz-kho.vercel.app"
    out_dir = "tests/evidence"
    brain_dir = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
    os.makedirs(out_dir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile iPhone 13 (390x844)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            device_scale_factor=2
        )
        page = context.new_page()
        page.goto(url, wait_until="networkidle", timeout=30000)
        time.sleep(1)

        # Ensure demo retail loaded
        page.evaluate("() => window.__qbiz_app__ && window.__qbiz_app__.previewDemo('retail')")
        time.sleep(1)

        # 1. Hàng hóa (Products) screen with Kho hàng button
        page.evaluate("() => window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        ss1 = os.path.join(out_dir, "live_vercel_mobile_goods.png")
        page.screenshot(path=ss1)
        print(f"Captured: {ss1}")
        with open(ss1, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "live_vercel_mobile_goods.png"), "wb") as f:
            f.write(data)

        # 2. Click on Kho hàng button to open Warehouse
        page.evaluate("() => window.__qbiz_app__.navigate('transfers')")
        time.sleep(1)
        ss2 = os.path.join(out_dir, "live_vercel_mobile_warehouse.png")
        page.screenshot(path=ss2)
        print(f"Captured: {ss2}")
        with open(ss2, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "live_vercel_mobile_warehouse.png"), "wb") as f:
            f.write(data)

        # 3. Invoices screen (Tab 4: Hóa đơn)
        page.evaluate("() => window.__qbiz_app__.navigate('transactions')")
        time.sleep(1)
        ss3 = os.path.join(out_dir, "live_vercel_mobile_invoices.png")
        page.screenshot(path=ss3)
        print(f"Captured: {ss3}")
        with open(ss3, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "live_vercel_mobile_invoices.png"), "wb") as f:
            f.write(data)

        # 4. Sales POS screen (Tab 3: Bán hàng)
        page.evaluate("() => window.__qbiz_app__.navigate('sales')")
        time.sleep(1)
        ss4 = os.path.join(out_dir, "live_vercel_mobile_sales.png")
        page.screenshot(path=ss4)
        print(f"Captured: {ss4}")
        with open(ss4, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "live_vercel_mobile_sales.png"), "wb") as f:
            f.write(data)

        browser.close()
        print("All live Vercel mobile screenshots captured and saved to brain directory successfully!")

if __name__ == "__main__":
    capture_live()
