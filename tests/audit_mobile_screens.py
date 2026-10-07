import os
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

pages_to_check = [
    ("shifts", "evidence_audit_shifts.png"),
    ("sales", "evidence_audit_sales.png"),
    ("orders", "evidence_audit_orders.png"),
    ("history", "evidence_audit_history.png"),
    ("products", "evidence_audit_products.png"),
    ("customers", "evidence_audit_customers.png"),
    ("suppliers", "evidence_audit_suppliers.png"),
    ("returns", "evidence_audit_returns.png")
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
    )
    page = context.new_page()
    page.goto("http://localhost:4180", wait_until="networkidle")
    page.wait_for_timeout(2000)
    
    # Enter demo if modal is present
    page.evaluate("""() => {
        const demoBtn = document.querySelector('[data-action="preview-demo"]');
        if (demoBtn) demoBtn.click();
        const modalClose = document.querySelector('#modalRoot .close-btn, #modalRoot [data-modal-close]');
        if (modalClose) modalClose.click();
    }""")
    page.wait_for_timeout(1500)
    
    for route, filename in pages_to_check:
        page.evaluate(f"() => {{ window.__qbiz_app__.navigate('{route}'); }}")
        page.wait_for_timeout(1000)
        out_path = os.path.join(ARTIFACT_DIR, filename)
        page.screenshot(path=out_path)
        print(f"Captured {route} -> {out_path}")
        
    browser.close()
print("Done capturing screen audit!")
