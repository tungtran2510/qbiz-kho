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

TEST_CASES = [
    {
        "id": "VAR_01",
        "name": "User Exact Compound Query (Top Selling This Week + Revenue This Month + Restock This Week)",
        "prompt": "Tuần này có những cái gì bán tốt và doanh thu tháng này là bao nhiêu cũng như là cái nào nên nhập tuần này",
        "expected_elements": ["Hiệu suất mặt hàng", "Doanh số", "nhập"],
        "disallowed_unwrapped_patterns": ["Ngưỡng cảnh báo:\n", "- Vốn:\n"]
    },
    {
        "id": "VAR_02",
        "name": "Mixed Timeframe: Revenue Today + Best Seller This Week",
        "prompt": "Hôm nay bán được bao nhiêu tiền và tuần này mặt hàng nào bán chạy nhất?",
        "expected_elements": ["Doanh số", "Hiệu suất mặt hàng"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_03",
        "name": "Inventory Warning + Revenue This Week",
        "prompt": "Có mặt hàng nào sắp hết hàng không và doanh thu tuần này là bao nhiêu?",
        "expected_elements": ["sắp hết hoặc đã hết", "Doanh số"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_04",
        "name": "Slow-Moving / Dead Capital + Month Revenue",
        "prompt": "Mặt hàng nào bán chậm hoặc chưa bán được tháng này và doanh thu tháng này là bao nhiêu?",
        "expected_elements": ["Hiệu suất mặt hàng", "Doanh số"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_05",
        "name": "Customer Debt Aging + Top Debtors",
        "prompt": "Cho tôi xem báo cáo tuổi nợ của khách hàng và những ai đang nợ quá hạn?",
        "expected_elements": ["tuổi nợ", "hạn"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_06",
        "name": "Specific Customer Debt + Transaction History",
        "prompt": "Khách hàng anh Nam còn nợ bao nhiêu tiền và lịch sử mua hàng như thế nào?",
        "expected_elements": ["nợ", "Nam"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_07",
        "name": "Operating Expenses Breakdown by Category",
        "prompt": "Báo cáo chi phí vận hành tháng này theo từng danh mục và phương thức thanh toán",
        "expected_elements": ["chi phí vận hành"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_08",
        "name": "Stock Inquiry + Restock Advice for Red Bull",
        "prompt": "Kiểm tra sản phẩm Nước tăng lực Red Bull 250ml còn bao nhiêu và có cần nhập thêm không?",
        "expected_elements": ["Red Bull", "Tồn"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_09",
        "name": "Replenishment Proposal Generation",
        "prompt": "Lập đề xuất nhập cho những mặt hàng cần nhập nhất",
        "expected_elements": ["đề xuất nhập", "nhập"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_10",
        "name": "Comma-Separated Multi-Clause (Today Revenue, Week Best Seller, Urgent Restock)",
        "prompt": "Doanh thu hôm nay, hàng bán chạy tuần này, và những món cần nhập hàng gấp",
        "expected_elements": ["Doanh số", "Hiệu suất mặt hàng"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_11",
        "name": "Business Period Review for Week",
        "prompt": "Tổng kết tình hình kinh doanh tuần này",
        "expected_elements": ["Doanh số", "Doanh thu"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_12",
        "name": "Overdue Debt Inquiry",
        "prompt": "Có khách hàng nào nợ quá hạn không?",
        "expected_elements": ["tuổi nợ"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_13",
        "name": "Expense Incurred in Period",
        "prompt": "Tháng này đã chi bao nhiêu tiền chi phí vận hành?",
        "expected_elements": ["chi phí vận hành"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_14",
        "name": "Top Performer Single Day",
        "prompt": "Mặt hàng nào bán chạy nhất hôm nay?",
        "expected_elements": ["Hiệu suất mặt hàng"],
        "disallowed_unwrapped_patterns": []
    },
    {
        "id": "VAR_15",
        "name": "Latest Transaction & Receipt Details",
        "prompt": "Tìm hóa đơn bán hàng gần nhất",
        "expected_elements": ["gần nhất"],
        "disallowed_unwrapped_patterns": []
    }
]

async def run():
    print("=" * 80)
    print("STARTING EMPIRICAL VARIATIONAL STRESS & PRESENTATION VERIFICATION")
    print("=" * 80)

    async with async_playwright() as p:
        browser = p.chromium
        b = await browser.launch(headless=True)
        # Emulate exact mobile viewport: Android 412x915 (like user's device)
        context = await b.new_context(
            viewport={"width": 412, "height": 915},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
        )
        page = await context.new_page()

        print("[*] Loading application at http://127.0.0.1:4180...", flush=True)
        await page.goto("http://127.0.0.1:4180", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(1000)

        # Ensure seed data has necessary customers, sales, and products for rich responses
        await page.evaluate("""
            async () => {
                const app = window.__qbiz_app__;
                const db = await import('/src/db.js');
                const engine = await import('/src/engine.js');
                
                // Ensure a test customer 'Anh Nam' with debt
                const customers = await db.getAll('customers') || [];
                let nam = customers.find(c => c.name && c.name.includes('Nam'));
                if (!nam) {
                    nam = {
                        id: 'cust_nam_test_01',
                        code: 'KH-NAM01',
                        name: 'Nguyễn Văn Nam',
                        phone: '0988776655',
                        creditLimit: 5000000,
                        debt: 1200000,
                        totalSpent: 4500000,
                        active: true,
                        created_at: new Date().toISOString()
                    };
                    await db.put('customers', nam);
                }

                // Ensure 'Nước tăng lực Red Bull 250ml' is in products
                const products = await db.getAll('products') || [];
                let redbull = products.find(p => p.name && p.name.includes('Red Bull'));
                if (!redbull) {
                    redbull = {
                        id: 'prod_redbull_01',
                        code: 'SP-REDBULL',
                        name: 'Nước tăng lực Red Bull 250ml',
                        unit: 'lon',
                        price: 15000,
                        cost: 11000,
                        lowStock: 24,
                        active: true
                    };
                    await db.put('products', redbull);
                    await db.put('levels', {
                        id: 'lvl_redbull_01',
                        productId: 'prod_redbull_01',
                        warehouseId: 'wh_center',
                        onHand: 10,
                        available: 10
                    });
                }

                // Ensure at least 1 completed sale for invoice lookup
                const sales = await db.getAll('sales') || [];
                if (sales.length === 0) {
                    await db.put('sales', {
                        id: 'sale_test_01',
                        code: 'HD-20261002-001',
                        customerLabel: 'Nguyễn Văn Nam',
                        customerId: 'cust_nam_test_01',
                        total: 350000,
                        grand_total: 350000,
                        payment_status: 'PAID',
                        payment_method: 'CASH',
                        createdAt: new Date().toISOString()
                    });
                }
            }
        """)

        results = []
        all_passed = True

        for tc in TEST_CASES:
            tc_id = tc["id"]
            name = tc["name"]
            prompt = tc["prompt"]
            print(f"\n[{tc_id}] Testing: '{prompt}'...")

            res = await page.evaluate(f"""
                async () => {{
                    const router = await import('/src/ai/router.js');
                    const app = window.__qbiz_app__;
                    const context = {{
                        actor_role: 'owner',
                        actor_id: 'user_owner',
                        rawPrompt: {json.dumps(prompt)},
                        user_prompt: {json.dumps(prompt)}
                    }};
                    const state = app ? app.state : {{}};
                    const res = await router.routeIntent({json.dumps(prompt)}, context, state, {{ allowLegacyFallback: true }});
                    return {{
                        text: res.text || '',
                        status: res.status || 'SUCCESS',
                        hasProposal: Boolean(res.proposal),
                        intent: res.intent || '',
                        tier: res.tier
                    }};
                }}
            """)

            text_output = res.get("text", "")
            has_error = False
            missing_elements = []

            for exp in tc["expected_elements"]:
                if exp.lower() not in text_output.lower():
                    missing_elements.append(exp)
                    has_error = True

            print(f"  Response Preview: {text_output[:120].strip()}...")
            if missing_elements:
                print(f"  [OBSERVATION] Missing expected elements: {missing_elements}")

            # Verify presentation formatting on the text output
            # Check for bad patterns like un-indented wrapping or single-digit line breaks
            has_format_issues = False
            if "(ngưỡng cảnh báo:\n" in text_output.lower():
                print("  [FORMAT ISSUE] Dangling threshold line wrap detected!")
                has_format_issues = True
            if "- vốn:\n" in text_output.lower():
                print("  [FORMAT ISSUE] Dangling cost label detected!")
                has_format_issues = True

            status = "PASS" if not missing_elements and not has_format_issues else "FAIL"
            if status == "FAIL":
                all_passed = False

            results.append({
                "test_id": tc_id,
                "name": name,
                "prompt": prompt,
                "status": status,
                "missing": missing_elements,
                "has_format_issues": has_format_issues,
                "text_length": len(text_output),
                "preview": text_output[:180]
            })
            print(f"  Result: {status}")

        print("\n" + "=" * 80)
        print(f"VARIATIONAL TEST SUMMARY: {'ALL PASSED' if all_passed else 'SOME FAILED'}")
        print("=" * 80)

        out_path = os.path.join(os.path.dirname(__file__), "variational_test_results.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"Results saved to: {out_path}")

        # Capture mobile chat screenshot for visual verification
        print("[*] Opening AI chat drawer to capture mobile UI screenshot...", flush=True)
        await page.evaluate("""
            () => {
                document.querySelectorAll('.entry-modal, .auth-modal, #authModal, .modal-backdrop, .entry-modal-backdrop, div[data-entry-modal]').forEach(el => el.remove());
            }
        """)
        await page.wait_for_timeout(500)
        await page.evaluate("""
            async () => {
                const ui = await import('/src/ai/ui.js');
                if (ui.openAiDrawer) ui.openAiDrawer();
                const btn = document.getElementById('aiSendBtn');
                const input = document.getElementById('aiInput');
                if (input && btn) {
                    input.value = "Tuần này có những cái gì bán tốt và doanh thu tháng này là bao nhiêu cũng như là cái nào nên nhập tuần này";
                    btn.click();
                }
            }
        """)
        try:
            await page.wait_for_selector(".ai-msg:not(.user)", timeout=15000)
        except Exception:
            pass
        await page.wait_for_timeout(3000)

        screenshot_path = os.path.join(os.path.dirname(__file__), "evidence", "mobile_variational_chat_412x915.png")
        os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
        await page.screenshot(path=screenshot_path)
        print(f"Captured visual mobile screenshot: {screenshot_path}", flush=True)

        await b.close()

if __name__ == "__main__":
    asyncio.run(run())
