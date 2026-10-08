import sys, os, time
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
LOCAL_URL = "http://localhost:4180"

def run_stage2_verification():
    print("=== STARTING STAGE 2 POS HOOKS DEEP VERIFICATION ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        page.on("console", lambda msg: print(f"[CONSOLE] {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"[ERROR] {err}"))

        print(f"Navigating to {LOCAL_URL}...")
        page.goto(LOCAL_URL, wait_until="networkidle")
        time.sleep(2)

        # -------------------------------------------------------------
        # STEP 1: Setup Test Fixtures in IndexedDB
        # - 1 Agent customer with 80 loyalty points
        # - 1 Product with unit conversion (Cái -> Thùng x12)
        # - Wholesale Price List config (15% off for agents)
        # -------------------------------------------------------------
        print("\n--- STEP 1: Setting up Fixtures (Price List, Units, Loyalty Customer) ---")
        setup_res = page.evaluate("""
        async () => {
            const db = await import('./src/db.js');
            const engine = await import('./src/engine.js');

            // 1. Ensure an open shift
            const identity = await engine.ensureLocalIdentity();
            const existingShifts = await db.getAll('shifts');
            let shift = existingShifts.find(s => s.status === 'OPEN' && s.device_id === identity.device_id);
            if (!shift) {
                shift = await engine.openShift({ openingCash: 500000 });
            }

            // 2. Setup Wholesale Price List in settings: module:price_lists
            const priceLists = [
                {
                    id: 'pl_agent_vip',
                    name: 'Đại lý VIP',
                    kind: 'wholesale',
                    applies_to: 'agent',
                    discount: 15,
                    discount_percent: 15,
                    min_quantity: 1,
                    minQty: 1,
                    status: 'active'
                }
            ];
            await db.put('settings', {
                id: 'module:price_lists',
                value: priceLists,
                updated_at: new Date().toISOString()
            });

            // 3. Setup Agent Customer with 80 loyalty points
            const testCustomer = {
                id: 'cust_agent_stage2',
                name: 'Đại lý Toàn Cầu',
                phone: '0988776655',
                customer_type: 'agent',
                loyalty_points: 80,
                points: 80,
                total_spend: 8000000,
                order_count: 5
            };
            await db.put('customers', testCustomer);

            // 4. Setup Test Product with units conversion (Cái -> Thùng x12)
            const products = await db.getAll('products');
            let p = products.find(x => x.sku === 'TEST-UNIT-01');
            if (!p) {
                p = {
                    id: 'prod_stage2_unit_test',
                    name: 'Nước Ngọt Lon QBiz',
                    sku: 'TEST-UNIT-01',
                    barcode: '893000111222',
                    price: 10000, // 10.000 đ / cái
                    purchase_price: 7000,
                    unit: 'Cái',
                    type: 'PRODUCT',
                    trackInventory: true
                };
                await db.put('products', p);
            }

            // Setup level for product across all warehouses
            const warehouses = await db.getAll('warehouses');
            const mainWh = warehouses[0]?.id || 'wh_retail_main';
            for (const wh of (warehouses.length ? warehouses : [{ id: 'wh_retail_main' }])) {
                await db.put('levels', {
                    id: `${p.id}:${wh.id}`,
                    productId: p.id,
                    warehouseId: wh.id,
                    onHand: 240,
                    reserved: 0,
                    damaged: 0,
                    version: 1
                });
            }

            // Setup unit conversion in module:units
            const unitConfigs = [
                {
                    productId: p.id,
                    baseUnit: 'Cái',
                    conversions: [
                        { name: 'Thùng', factor: 12, barcode: '893000111999' },
                        { name: 'Lốc', factor: 6, barcode: '893000111666' }
                    ]
                }
            ];
            await db.put('settings', {
                id: 'module:units',
                value: unitConfigs,
                updated_at: new Date().toISOString()
            });

            // Reload fresh state from DB
            if (window.refresh) {
                await window.refresh();
            }

            return {
                customerId: testCustomer.id,
                productId: p.id,
                basePrice: p.price,
                shiftId: shift.id
            };
        }
        """)
        print(f"Fixtures created successfully: {setup_res}")
        time.sleep(2)

        # -------------------------------------------------------------
        # STEP 2: POS Cart with Agent Customer & Wholesale Price Badge
        # -------------------------------------------------------------
        print("\n--- STEP 2: Selecting Agent Customer & Verifying Wholesale Price ---")
        page.evaluate("""
        async () => {
            // Set customer on sale draft
            const db = await import('./src/db.js');
            const cust = await db.getOne('customers', 'cust_agent_stage2');
            const prod = await db.getOne('products', 'prod_stage2_unit_test');
            const warehouses = await db.getAll('warehouses');
            const mainWh = warehouses[0]?.id || 'wh_retail_main';

            // Simulate choosing customer and adding item to sale
            window.state.page = 'sales';
            window.state.saleCustomer = cust;
            window.state.saleDraft.customer = cust;
            window.state.saleDraft.warehouseId = mainWh;
            window.state.saleCart = [{
                itemId: prod.id,
                quantity: 1,
                unitPrice: prod.price,
                unitFactor: 1,
                unitName: 'Cái',
                discount: 0,
                discountMode: 'amount'
            }];
            window.state.saleStep = 'cart';
            window.renderSales();
        }
        """)
        time.sleep(1.5)

        # Verify Wholesale Badge in UI
        badge_text = page.locator(".cart-badge-pricelist").text_content()
        print(f"Wholesale Badge text: '{badge_text}'")
        assert "15%" in badge_text, f"Expected 15% wholesale discount, got {badge_text}"

        # Capture Screenshot 1: Wholesale Price in POS Cart
        img1_path = os.path.join(ARTIFACT_DIR, "evidence_stage2_pos_wholesale_price.png")
        page.screenshot(path=img1_path)
        print(f"Screenshot 1 saved: {img1_path}")

        # -------------------------------------------------------------
        # STEP 3: Unit Conversion Pill Click (Cái -> Thùng x12)
        # -------------------------------------------------------------
        print("\n--- STEP 3: Selecting Unit 'Thùng (x12)' in POS Cart ---")
        unit_pills = page.locator(".unit-pill")
        count = unit_pills.count()
        print(f"Found {count} unit pills")
        assert count >= 2, "Unit pills should show Cái, Thùng (x12), Lốc (x6)"

        # Click on 'Thùng (x12)' pill
        thung_btn = page.locator('.unit-pill[data-unit-name="Thùng"]')
        thung_btn.click()
        time.sleep(1)

        # Verify unitFactor is now 12 and price calculation
        unit_state = page.evaluate("""
        () => {
            const item = window.state.saleCart[0];
            const lines = window.saleLines();
            const totals = window.saleTotals();
            return {
                unitFactor: item.unitFactor,
                unitName: item.unitName,
                linePrice: lines[0].unitPrice,
                lineTotal: lines[0].lineTotal,
                lineDiscount: lines[0].lineDiscount,
                cartTotal: totals.total
            };
        }
        """)
        print(f"Cart after Unit Change to Thùng (x12): {unit_state}")
        # Base price = 10.000 -> Thùng (x12) = 120.000
        # Wholesale discount = 15% of 120.000 = 18.000 -> lineTotal = 102.000
        assert unit_state["unitFactor"] == 12, "Unit factor should be 12"
        assert unit_state["linePrice"] == 120000, f"Line price should be 120,000, got {unit_state['linePrice']}"
        assert unit_state["lineDiscount"] == 18000, f"Wholesale discount should be 18,000, got {unit_state['lineDiscount']}"
        assert unit_state["cartTotal"] == 102000, f"Cart total should be 102,000, got {unit_state['cartTotal']}"

        # Capture Screenshot 2: Unit Conversion active in POS Cart
        img2_path = os.path.join(ARTIFACT_DIR, "evidence_stage2_pos_unit_conversion.png")
        page.screenshot(path=img2_path)
        print(f"Screenshot 2 saved: {img2_path}")

        # -------------------------------------------------------------
        # STEP 4: Checkout Screen & Loyalty Points Redemption
        # -------------------------------------------------------------
        print("\n--- STEP 4: Proceeding to Checkout and Activating Loyalty Points ---")
        # Click button "Tiếp tục thanh toán"
        checkout_btn = page.locator("button[data-sale-step='checkout']").first
        checkout_btn.click()
        time.sleep(1.5)

        # Verify Loyalty panel is visible with 80 points
        loyalty_panel = page.locator(".checkout-loyalty-panel")
        assert loyalty_panel.is_visible(), "Loyalty panel should be visible for customer with points"
        loyalty_info = loyalty_panel.text_content()
        print(f"Loyalty Panel Info: {loyalty_info}")
        assert "80 điểm" in loyalty_info, f"Expected 80 points, got {loyalty_info}"

        # Toggle "Dùng điểm"
        loyalty_toggle = page.locator("#loyaltyUseToggle")
        loyalty_toggle.check()
        time.sleep(1)

        # Verify checkout total after loyalty discount: 102.000 - 80.000 = 22.000 đ
        checkout_state = page.evaluate("""
        () => {
            const totals = window.saleTotals();
            return {
                subtotal: totals.subtotal,
                discount: totals.discount,
                loyaltyDiscount: totals.loyaltyDiscount,
                pointsToUse: totals.pointsToUse,
                total: totals.total
            };
        }
        """)
        print(f"Checkout State after Loyalty Toggle: {checkout_state}")
        assert checkout_state["pointsToUse"] == 80, f"Expected 80 points used, got {checkout_state['pointsToUse']}"
        assert checkout_state["loyaltyDiscount"] == 80000, f"Expected 80,000 loyalty discount, got {checkout_state['loyaltyDiscount']}"
        assert checkout_state["total"] == 22000, f"Expected total 22,000 đ, got {checkout_state['total']}"

        # Capture Screenshot 3: Loyalty Points Toggle in Checkout
        img3_path = os.path.join(ARTIFACT_DIR, "evidence_stage2_pos_loyalty_checkout.png")
        page.screenshot(path=img3_path)
        print(f"Screenshot 3 saved: {img3_path}")

        # -------------------------------------------------------------
        # STEP 5: Complete Sale and Verify DB Persistence & Inventory Deduction
        # -------------------------------------------------------------
        print("\n--- STEP 5: Completing Sale & Verifying Physical Inventory & Customer Points ---")
        # Execute payment
        pay_res = page.evaluate("""
        async () => {
            try {
                window.state.saleDraft.payment = 'cash';
                window.state.saleDraft.cashReceived = 22000;
                window.renderSales();
                console.log('Directly executing submitSale()...');
                await window.submitSale();
                return { success: true };
            } catch (err) {
                return { success: false, error: err.message, stack: err.stack };
            }
        }
        """)
        print(f"SubmitSale Result: {pay_res}")
        time.sleep(2.5)

        # Print toasts and content for debugging
        toasts = page.locator(".toast").all_text_contents()
        print(f"Toasts on screen: {toasts}")

        # Verify success popup or success screen
        success_popup = page.locator("#paymentSuccessPopupRoot, .pos-success")
        assert success_popup.is_visible(), f"Should transition to payment success popup or pos-success screen. Result: {pay_res}, Toasts: {toasts}"

        # Capture Screenshot 4: Success Screen
        img4_path = os.path.join(ARTIFACT_DIR, "evidence_stage2_pos_success_loyalty.png")
        page.screenshot(path=img4_path)
        print(f"Screenshot 4 saved: {img4_path}")

        # Verify in DB:
        db_audit = page.evaluate("""
        async () => {
            const db = await import('./src/db.js');
            const sales = await db.getAll('sales');
            const latestSale = sales[sales.length - 1];

            const customers = await db.getAll('customers');
            const cust = customers.find(c => c.id === 'cust_agent_stage2');

            const levels = await db.getAll('levels');
            const lvl = levels.find(l => (l.productId === 'prod_stage2_unit_test' || l.product_id === 'prod_stage2_unit_test') && (l.warehouseId === latestSale.warehouseId || l.warehouse_id === latestSale.warehouseId));

            const movements = await db.getAll('movements');
            const latestMovement = movements.filter(m => m.productId === 'prod_stage2_unit_test' || m.product_id === 'prod_stage2_unit_test').pop();

            return {
                saleId: latestSale.id,
                saleTotal: latestSale.grand_total,
                loyaltyPointsUsed: latestSale.loyalty_points_used,
                loyaltyPointsEarned: latestSale.loyalty_points_earned,
                customerRemainingPoints: cust.loyalty_points,
                inventoryRemaining: lvl ? (lvl.onHand ?? lvl.on_hand) : null,
                movementQty: latestMovement ? (latestMovement.qty ?? latestMovement.quantity) : null
            };
        }
        """)
        print("\n=== STAGE 2 DB AUDIT VERIFICATION ===")
        print(f"Sale ID: {db_audit['saleId']}")
        print(f"Sale Grand Total: {db_audit['saleTotal']} đ")
        print(f"Loyalty Points Used: {db_audit['loyaltyPointsUsed']} pts")
        print(f"Loyalty Points Earned: {db_audit['loyaltyPointsEarned']} pts")
        print(f"Customer Balance: {db_audit['customerRemainingPoints']} pts")
        print(f"Inventory Remaining: {db_audit['inventoryRemaining']} units (Initial 240 - 12 = 228)")
        print(f"Movement Qty: {db_audit['movementQty']} (Physical deducted -12 units)")

        assert db_audit['saleTotal'] == 22000, f"Expected 22,000 đ grand total, got {db_audit['saleTotal']}"
        assert db_audit['loyaltyPointsUsed'] == 80, f"Expected 80 points used, got {db_audit['loyaltyPointsUsed']}"
        assert db_audit['inventoryRemaining'] == 228, f"Expected 228 units left, got {db_audit['inventoryRemaining']}"
        assert db_audit['movementQty'] == -12, f"Expected -12 physical movement, got {db_audit['movementQty']}"

        print("\n>>> ALL STAGE 2 POS HOOKS TESTS PASSED WITH 100% SUCCESS! <<<")
        browser.close()

if __name__ == "__main__":
    run_stage2_verification()
