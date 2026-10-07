import time, os
from playwright.sync_api import sync_playwright

def capture_hero():
    url = "http://localhost:4180/"
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

        # Ensure demo retail
        page.evaluate("() => window.__qbiz_app__ && window.__qbiz_app__.previewDemo('retail')")
        time.sleep(1)

        # 1. Screen 1: Dashboard with bottom nav showing the floating hero Bán hàng button
        page.evaluate("() => window.__qbiz_app__.navigate('dashboard')")
        time.sleep(1)
        ss1 = os.path.join(out_dir, "hero_sales_btn_dashboard_mobile.png")
        page.screenshot(path=ss1)
        print(f"Captured: {ss1}")
        with open(ss1, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "hero_sales_btn_dashboard_mobile.png"), "wb") as f:
            f.write(data)

        # 2. Screen 2: Goods (Hàng hóa) screen with bottom nav showing the floating hero Bán hàng button
        page.evaluate("() => window.__qbiz_app__.navigate('products')")
        time.sleep(1)
        ss2 = os.path.join(out_dir, "hero_sales_btn_goods_mobile.png")
        page.screenshot(path=ss2)
        print(f"Captured: {ss2}")
        with open(ss2, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "hero_sales_btn_goods_mobile.png"), "wb") as f:
            f.write(data)

        # 3. Screen 3: Sales (Bán hàng) active screen with floating hero button active
        page.evaluate("() => window.__qbiz_app__.navigate('sales')")
        time.sleep(1)
        ss3 = os.path.join(out_dir, "hero_sales_btn_active_sales_mobile.png")
        page.screenshot(path=ss3)
        print(f"Captured: {ss3}")
        with open(ss3, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "hero_sales_btn_active_sales_mobile.png"), "wb") as f:
            f.write(data)

        # 4. Screen 4: Invoices (Hóa đơn) screen with floating hero Bán hàng button
        page.evaluate("() => window.__qbiz_app__.navigate('transactions')")
        time.sleep(1)
        ss4 = os.path.join(out_dir, "hero_sales_btn_invoices_mobile.png")
        page.screenshot(path=ss4)
        print(f"Captured: {ss4}")
        with open(ss4, "rb") as f:
            data = f.read()
        with open(os.path.join(brain_dir, "hero_sales_btn_invoices_mobile.png"), "wb") as f:
            f.write(data)

        browser.close()
        print("All mobile hero sales screenshots captured successfully!")

if __name__ == "__main__":
    capture_hero()
