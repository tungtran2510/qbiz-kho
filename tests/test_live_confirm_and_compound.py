import asyncio
import json
import time
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright

EVIDENCE_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "evidence_phase3h")
os.makedirs(EVIDENCE_DIR, exist_ok=True)

async def run():
    async with async_playwright() as p:
        browser = p.chromium
        # Launch with mobile viewport 412x915
        b = await browser.launch(headless=True)
        context = await b.new_context(
            viewport={"width": 412, "height": 915},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
        )
        page = await context.new_page()

        print("[*] Navigating to http://192.168.1.10:4180...")
        await page.goto("http://192.168.1.10:4180", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        # 1. Select product "Ghế sáng chế 135"
        print("[*] Setting context to 'Ghế sáng chế 135'...")
        init_stock_info = await page.evaluate("""
            async () => {
                const app = window.__qbiz_app__;
                const engine = await import('/src/engine.js');
                const prods = app?.state?.data?.products || [];
                let p135 = prods.find(p => p.name && p.name.includes('135'));
                if (!p135) p135 = prods[0];
                const wh = (app?.state?.data?.warehouses || [])[0];
                const lv = p135 && wh ? engine.levelFor(app.state.data, p135.id, wh.id) : null;
                const onHand = lv ? Number(lv.onHand || 0) : 0;

                // Set app state
                if (app && app.state) {
                    app.state.current_screen = 'products';
                    app.state.activeProduct = p135;
                    app.state.bound_product = p135;
                    app.state.currentProductId = p135?.id;
                }
                if (window.__QBIZ_AI_CONTEXT__) {
                    window.__QBIZ_AI_CONTEXT__.current_product_id = p135?.id;
                    window.__QBIZ_AI_CONTEXT__.current_product_name = p135?.name;
                    window.__QBIZ_AI_CONTEXT__.warehouse_id = wh?.id;
                }

                return {
                    productId: p135?.id,
                    productName: p135?.name,
                    warehouseId: wh?.id,
                    warehouseName: wh?.name,
                    onHand
                };
            }
        """)
        print(f"[*] Initial Stock Info: {json.dumps(init_stock_info, ensure_ascii=False)}")

        # 2. Open AI Sheet
        print("[*] Opening AI Assistant...")
        trigger = page.locator("#qbizAiTrigger")
        if await trigger.is_visible():
            await trigger.click()
            await page.wait_for_timeout(1000)

        # Check Provider Badge
        provider_badge = await page.locator("#aiProviderBadge").inner_text()
        print(f"[*] Active Provider Badge: {provider_badge}")

        # 3. Send proposal query: "Nhập thêm 20 cái này"
        print("[*] Sending 'Nhập thêm 20 cái này'...")
        input_box = page.locator("#aiTextInput")
        await input_box.fill("Nhập thêm 20 cái này")
        send_btn = page.locator("#aiSendBtn")
        await send_btn.click()

        # Wait for proposal card to render
        print("[*] Waiting for proposal card with [Xác nhận] button...")
        confirm_btn = page.locator("button[data-confirm-proposal]").first
        await confirm_btn.wait_for(state="visible", timeout=15000)
        await page.wait_for_timeout(1000)

        # Capture screenshot of proposal card before confirmation
        screenshot_proposal_path = os.path.join(EVIDENCE_DIR, "mobile_proposal_before_confirm.png")
        await page.screenshot(path=screenshot_proposal_path)
        print(f"[OK] Captured proposal card before confirm: {screenshot_proposal_path}")

        # Check proposal details in UI
        prop_id = await confirm_btn.get_attribute("data-confirm-proposal")
        prop_text = await page.evaluate("() => document.querySelector('.ai-proposal-card')?.innerText || ''")
        print(f"[*] Proposal ID on button: {prop_id}")
        print(f"[*] Proposal Card Text:\n{prop_text}\n")

        # 4. Click [Xác nhận]
        print("[*] Clicking [Xác nhận]...")
        await confirm_btn.click()

        # Wait for execution message
        print("[*] Waiting for execution result...")
        # Check for success message or status ok
        await page.wait_for_timeout(3000)

        # Capture screenshot after confirmation
        screenshot_confirmed_path = os.path.join(EVIDENCE_DIR, "mobile_proposal_after_confirm.png")
        await page.screenshot(path=screenshot_confirmed_path)
        print(f"[OK] Captured confirmed proposal: {screenshot_confirmed_path}")

        # 5. Check stock in DB after confirmation
        final_stock_info = await page.evaluate(f"""
            async () => {{
                const app = window.__qbiz_app__;
                const engine = await import('/src/engine.js');
                const prods = app?.state?.data?.products || [];
                const p135 = prods.find(p => p.id === '{init_stock_info['productId']}');
                const wh = (app?.state?.data?.warehouses || []).find(w => w.id === '{init_stock_info['warehouseId']}');
                const lv = p135 && wh ? engine.levelFor(app.state.data, p135.id, wh.id) : null;
                const onHand = lv ? Number(lv.onHand || 0) : 0;

                // Also check last assistant message
                const msgs = Array.from(document.querySelectorAll('.ai-chat-body .ai-bubble, .ai-chat-body .ai-message'));
                const lastMsg = msgs.length ? msgs[msgs.length - 1].innerText : '';

                return {{
                    productId: p135?.id,
                    productName: p135?.name,
                    warehouseId: wh?.id,
                    warehouseName: wh?.name,
                    onHand,
                    lastMessage: lastMsg
                }};
            }}
        """)
        print(f"[*] Final Stock Info: {json.dumps(final_stock_info, ensure_ascii=False)}")

        delta = final_stock_info['onHand'] - init_stock_info['onHand']
        print(f"[*] Stock Delta: initial={init_stock_info['onHand']} -> final={final_stock_info['onHand']} (delta={delta})")
        assert delta == 20, f"Expected stock increase of 20, got delta={delta}"
        print("[PASS] STOCK INCREASE IN DB VERIFIED: EXACTLY +20!")

        # 6. Test compound query: "Tháng này mặt hàng nào bán chạy và hàng nào tồn nhiều và nên nhập cái gì tuần này"
        print("\n[*] Sending compound query: 'Tháng này mặt hàng nào bán chạy và hàng nào tồn nhiều và nên nhập cái gì tuần này'...")
        await input_box.fill("Tháng này mặt hàng nào bán chạy và hàng nào tồn nhiều và nên nhập cái gì tuần này")
        await send_btn.click()

        # Wait for response
        print("[*] Waiting for compound response...")
        await page.wait_for_timeout(6000)

        # Capture screenshot of compound query response
        screenshot_compound_path = os.path.join(EVIDENCE_DIR, "mobile_compound_query_response.png")
        await page.screenshot(path=screenshot_compound_path)
        print(f"[OK] Captured compound query response: {screenshot_compound_path}")

        # Check for duplication of 'Ghế sáng chế 135' in response
        compound_res = await page.evaluate("""
            () => {
                const bubbles = Array.from(document.querySelectorAll('.ai-bubble.assistant-bubble, .ai-message.assistant'));
                const last = bubbles[bubbles.length - 1];
                return last ? last.innerText : '';
            }
        """)
        print(f"[*] Compound Response Text:\n{compound_res}\n")

        # Check lines for Ghế sáng chế 135
        lines = [line.strip() for line in compound_res.split('\n') if line.strip()]
        g135_lines = [line for line in lines if 'Ghế sáng chế 135' in line]
        print(f"[*] Lines mentioning 'Ghế sáng chế 135': {len(g135_lines)}")
        for l in g135_lines:
            print(f"   -> {l}")

        # Verify no duplicate low stock / sắp hết lines
        low_stock_135 = [l for l in g135_lines if 'Còn' in l or 'Ngưỡng' in l or 'còn' in l]
        print(f"[*] Low stock lines for 'Ghế sáng chế 135': {low_stock_135}")
        assert len(low_stock_135) <= 1, f"Duplicate low stock lines found: {low_stock_135}"
        print("[PASS] NO DUPLICATE LOW-STOCK ENTRIES FOR 'Ghế sáng chế 135'!")

        await b.close()

if __name__ == "__main__":
    asyncio.run(run())
