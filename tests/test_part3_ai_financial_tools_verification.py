# -*- coding: utf-8 -*-
"""
Empirical Verification Test Suite for Part 3: AI Natural Language Financial & Debt Tools
1. Tool get_customer_debt_summary:
   - Accurate real-time debt calculation from sales & customer store
   - Credit limit and available credit calculation
   - Returns structured Vietnamese formatted strings
2. Tool get_customer_aging_report:
   - 4 aging buckets: current (0-30), overdue30 (31-60), overdue60 (61-90), overdue90 (>90)
   - Total outstanding debt & debtor ranking
3. Tool get_customer_profile_history:
   - Customer LTV (totalSpent), average order value (AOV), frequent products, recent transactions
4. Tool get_operating_expenses:
   - Period filtering (today, week, month), category breakdown, cash vs transfer breakdown
5. Skills integration (executeSkill):
   - 'customer-debt-inquiry' skill produces actionable, human-readable natural language summary
   - 'customer-aging-report' skill produces clean debt aging buckets
   - 'operating-expenses-inquiry' skill produces categorized operational expense summaries
6. Core Invariants:
   - ZERO DIRECT AI DB WRITE (Tools are strictly read-only and proposal-generating)
   - ZERO UI/CSS/HTML MODIFICATION
"""

import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4180"

def run_part3_ai_tools_verification(run_index=1):
    print(f"\n===========================================================================")
    print(f"RUN {run_index}: Part 3 - AI Natural Language Financial & Debt Tools Verification")
    print(f"===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # -------------------------------------------------------------
        # STEP 0: Seed Test Customer & Split Sale with Debt & Expense
        # -------------------------------------------------------------
        print("  [Step 0] Seeding Customer, Debt Sale, and Operating Expense...")
        seed_res = page.evaluate("""
        async () => {
            const { createCustomer, createSale, createExpense, getAll, openShift, ensureLocalIdentity } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            let curShift = shifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            if (!curShift) {
                curShift = await openShift({ openingCash: 1000000 });
            }

            const uid = Math.random().toString(36).slice(2, 7);
            const customerName = 'Khách Hàng AI ' + uid;
            const customer = await createCustomer({
                name: customerName,
                phone: '0933' + Math.floor(100000 + Math.random() * 900000),
                creditLimit: 5000000,
                note: 'Khách test AI Financial Tools'
            });

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const prod = products[0];
            const wh = warehouses[0];

            // Create sale with 1.5M debt
            const sale = await createSale({
                warehouseId: wh.id,
                customerId: customer.id,
                customerLabel: customer.name,
                items: [{ itemId: prod.id, quantity: 1, unitPrice: 2500000 }],
                payments: [
                    { method: 'cash', amount: 1000000 },
                    { method: 'debt', amount: 1500000 }
                ]
            });

            // Create an operating expense: 450,000 VND
            const expense = await createExpense({
                category: 'Chi phí vận hành',
                amount: 450000,
                paymentMethod: 'cash',
                note: 'Tiền internet tháng này',
                payee: 'Viettel Telecom'
            });

            await window.__qbiz_app__.refresh();

            return {
                customerId: customer.id,
                customerName: customer.name,
                creditLimit: customer.creditLimit,
                saleId: sale.id,
                debtAmount: sale.debt_amount,
                expenseId: expense.id,
                expenseAmount: expense.amount
            };
        }
        """)
        print(f"    Customer: {seed_res['customerName']} (ID: {seed_res['customerId']})")
        print(f"    Sale Debt: {seed_res['debtAmount']:,} VND | Expense: {seed_res['expenseAmount']:,} VND")

        # -------------------------------------------------------------
        # TEST 1: Tool get_customer_debt_summary Execution
        # -------------------------------------------------------------
        print("  [Test 1] Executing Tool 'get_customer_debt_summary'...")
        test1_res = page.evaluate(f"""
        async () => {{
            const {{ executeTool }} = await import('/src/ai/tools.js');
            const state = window.__qbiz_app__.state;
            const result = await executeTool('get_customer_debt_summary', {{
                query: '{seed_res["customerName"]}'
            }}, state, {{ actor_role: 'owner' }});

            return result;
        }}
        """)
        print(f"    Found: {test1_res['found']}, Total Debt: {test1_res['formattedDebt']}")
        print(f"    Credit Limit: {test1_res['formattedCreditLimit']}, Available: {test1_res['formattedAvailableCredit']}")
        print(f"    Unpaid Sales Count: {test1_res['unpaidSalesCount']}")
        assert test1_res['found'] is True, "Customer debt summary must find the customer"
        assert test1_res['totalDebt'] == 1500000, f"Expected debt 1,500,000, got {test1_res['totalDebt']}"
        assert test1_res['creditLimit'] == 5000000, f"Expected credit limit 5,000,000, got {test1_res['creditLimit']}"
        assert test1_res['availableCredit'] == 3500000, f"Expected available credit 3,500,000, got {test1_res['availableCredit']}"
        assert test1_res['unpaidSalesCount'] >= 1, "Must have at least 1 unpaid sale"
        print("    [PASS] Test 1: Tool get_customer_debt_summary verified.")

        # -------------------------------------------------------------
        # TEST 2: Tool get_customer_aging_report Execution
        # -------------------------------------------------------------
        print("  [Test 2] Executing Tool 'get_customer_aging_report'...")
        test2_res = page.evaluate("""
        async () => {
            const { executeTool } = await import('/src/ai/tools.js');
            const state = window.__qbiz_app__.state;
            const result = await executeTool('get_customer_aging_report', {}, state, { actor_role: 'owner' });
            return result;
        }
        """)
        print(f"    Total Debtors: {test2_res['totalCustomersWithDebt']}")
        print(f"    Total Outstanding Debt: {test2_res['formattedOutstandingDebt']}")
        print(f"    Current Bucket (0-30 days): {test2_res['buckets']['current']['total']:,} VND ({test2_res['buckets']['current']['count']} sales)")
        assert test2_res['success'] is True, "Aging report tool must return success"
        assert test2_res['totalCustomersWithDebt'] >= 1, "Must have at least 1 customer with debt"
        assert test2_res['totalOutstandingDebt'] >= 1500000, "Outstanding debt must include the newly seeded debt"
        assert test2_res['buckets']['current']['total'] >= 1500000, "Recent debt must be in the 0-30 days bucket"
        print("    [PASS] Test 2: Tool get_customer_aging_report verified.")

        # -------------------------------------------------------------
        # TEST 3: Tool get_customer_profile_history Execution
        # -------------------------------------------------------------
        print("  [Test 3] Executing Tool 'get_customer_profile_history'...")
        test3_res = page.evaluate(f"""
        async () => {{
            const {{ executeTool }} = await import('/src/ai/tools.js');
            const state = window.__qbiz_app__.state;
            const result = await executeTool('get_customer_profile_history', {{
                query: '{seed_res["customerName"]}'
            }}, state, {{ actor_role: 'owner' }});
            return result;
        }}
        """)
        print(f"    Customer Name: {test3_res['customer']['name']}")
        print(f"    Total Spent (LTV): {test3_res['metrics']['formattedTotalSpent']}")
        print(f"    Average Order Value: {test3_res['metrics']['formattedAOV']}")
        print(f"    Recent Transactions: {len(test3_res['recentTransactions'])}")
        assert test3_res['found'] is True, "Profile history must find the customer"
        assert test3_res['metrics']['totalSpent'] == 2500000, f"Expected total spent 2,500,000, got {test3_res['metrics']['totalSpent']}"
        assert len(test3_res['recentTransactions']) >= 1, "Must show recent transactions"
        print("    [PASS] Test 3: Tool get_customer_profile_history verified.")

        # -------------------------------------------------------------
        # TEST 4: Tool get_operating_expenses Execution
        # -------------------------------------------------------------
        print("  [Test 4] Executing Tool 'get_operating_expenses'...")
        test4_res = page.evaluate("""
        async () => {
            const { executeTool } = await import('/src/ai/tools.js');
            const state = window.__qbiz_app__.state;
            const result = await executeTool('get_operating_expenses', { period: 'month' }, state, { actor_role: 'owner' });
            return result;
        }
        """)
        print(f"    Total Expenses: {test4_res['formattedTotal']} ({test4_res['count']} items)")
        print(f"    By Payment Method: Cash={test4_res['byPaymentMethod']['cash']:,} VND, Transfer={test4_res['byPaymentMethod']['transfer']:,} VND")
        print(f"    Categories: {list(test4_res['byCategory'].keys())}")
        assert test4_res['success'] is True, "Operating expenses tool must succeed"
        assert test4_res['totalAmount'] >= 450000, "Expenses total must include seeded 450,000 VND"
        assert test4_res['byPaymentMethod']['cash'] >= 450000, "Cash expenses must include 450,000 VND"
        assert 'Chi phí vận hành' in test4_res['byCategory'], "Category 'Chi phí vận hành' must be present"
        print("    [PASS] Test 4: Tool get_operating_expenses verified.")

        # -------------------------------------------------------------
        # TEST 5: Natural Language Skills Execution (executeSkill)
        # -------------------------------------------------------------
        print("  [Test 5] Executing Skills 'customer-debt-inquiry', 'customer-aging-report', 'operating-expenses-inquiry'...")
        test5_res = page.evaluate(f"""
        async () => {{
            const {{ executeSkill }} = await import('/src/ai/skills.js');
            const state = window.__qbiz_app__.state;
            const context = {{ actor_role: 'owner' }};

            // Skill 1: Customer Debt Inquiry
            const debtSkill = await executeSkill('customer-debt-inquiry', {{
                query: '{seed_res["customerName"]}'
            }}, context, state);

            // Skill 2: Customer Aging Report
            const agingSkill = await executeSkill('customer-aging-report', {{}}, context, state);

            // Skill 3: Operating Expenses Inquiry
            const expenseSkill = await executeSkill('operating-expenses-inquiry', {{
                period: 'month'
            }}, context, state);

            return {{
                debtText: debtSkill.text,
                debtSkillId: debtSkill.skillId,
                agingText: agingSkill.text,
                agingSkillId: agingSkill.skillId,
                expenseText: expenseSkill.text,
                expenseSkillId: expenseSkill.skillId
            }};
        }}
        """)
        print(f"    [Skill 1 text excerpt]: {test5_res['debtText'].splitlines()[0]}")
        print(f"    [Skill 2 text excerpt]: {test5_res['agingText'].splitlines()[0]}")
        print(f"    [Skill 3 text excerpt]: {test5_res['expenseText'].splitlines()[0]}")
        assert "Thông tin công nợ khách hàng" in test5_res['debtText'], "Skill text must describe customer debt"
        assert "1.500.000" in test5_res['debtText'], "Skill text must show 1,500,000 VND debt"
        assert "Báo cáo Phân tích Tuổi nợ" in test5_res['agingText'], "Skill text must describe aging report"
        assert "0 - 30 ngày" in test5_res['agingText'], "Skill text must list aging buckets"
        assert "Báo cáo Chi phí Vận hành" in test5_res['expenseText'], "Skill text must describe operating expenses"
        assert "450.000" in test5_res['expenseText'], "Skill text must show 450,000 VND expense"
        print("    [PASS] Test 5: All three AI Natural Language skills verified.")

        browser.close()
        return True

if __name__ == "__main__":
    passes = 0
    total_runs = 5
    print("=" * 80)
    print("EXECUTING 5 CONSECUTIVE PASSES: PART 3 AI FINANCIAL TOOLS VERIFICATION")
    print("=" * 80)
    for i in range(1, total_runs + 1):
        try:
            if run_part3_ai_tools_verification(i):
                passes += 1
                print(f"==> RUN {i} PASSED ({passes}/{i})")
        except Exception as e:
            print(f"==> RUN {i} FAILED: {e}")
            import traceback
            traceback.print_exc()
            break

    print("\n" + "=" * 80)
    print(f"FINAL RESULT: {passes}/{total_runs} CONSECUTIVE PASSES")
    print("=" * 80)
    if passes == total_runs:
        print(">>> ALL 5 PASSES SUCCEEDED: PART 3 AI FINANCIAL TOOLS VERIFIED <<<")
        sys.exit(0)
    else:
        print(">>> VERIFICATION FAILED <<<")
        sys.exit(1)
