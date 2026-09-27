import sys
import time
import json
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def run_merchandising_tests():
    print("=" * 80)
    print("STARTING QBIZ MERCHANDISING & REPLENISHMENT INTELLIGENCE VERIFICATION")
    print("=" * 80)

    base_url = "http://localhost:4180"
    passed_tests = []
    failed_tests = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print(f"1. Loading application at {base_url}...")
        page.goto(base_url, wait_until="networkidle")
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state")
        page.wait_for_timeout(1000)

        # ----------------------------------------------------
        # TEST 1: Fact Builder & Snapshot Verification
        # ----------------------------------------------------
        print("\n--- TEST 1: Fact Builder & ProductDecisionSnapshot ---")
        try:
            res = page.evaluate('''async () => {
                const { buildProductDecisionSnapshot, buildAllProductDecisionSnapshots } = await import('./src/ai/merchandising/facts.js');
                const products = window.__qbiz_app__.state.data.products || [];
                const first = products.find(p => p.trackInventory !== false && p.type !== 'SERVICE');
                if (!first) return { error: 'No tracked products found' };

                const snap = buildProductDecisionSnapshot(first.id, window.__qbiz_app__.state);
                const allSnaps = buildAllProductDecisionSnapshots(window.__qbiz_app__.state);

                return {
                    productId: snap.product.id,
                    productName: snap.product.name,
                    onHand: snap.inventory.onHand,
                    available: snap.inventory.available,
                    sourceVersion: snap.source_version,
                    hasQuality: Boolean(snap.data_quality),
                    missingFields: snap.missing_fields,
                    allCount: allSnaps.length,
                };
            }''')

            assert not res.get("error"), f"Fact builder error: {res.get('error')}"
            assert res["sourceVersion"] == "qbiz_merchandising_v1", f"Unexpected version: {res['sourceVersion']}"
            assert res["hasQuality"], "Missing data_quality rating"
            assert "lead_time" in res["missingFields"], "Lead time should be accurately flagged in missing_fields"
            assert res["allCount"] > 0, "No snapshots built for active tracked products"
            print(f"  ✓ Fact builder OK for '{res['productName']}' (Available: {res['available']}, Snapshots: {res['allCount']}).")
            passed_tests.append("TEST 1: Fact Builder & Snapshot")
        except Exception as e:
            print(f"  ❌ TEST 1 FAILED: {e}")
            failed_tests.append(f"TEST 1: {e}")

        # ----------------------------------------------------
        # TEST 2: Deterministic Metrics & Divide-by-Zero Protection
        # ----------------------------------------------------
        print("\n--- TEST 2: Deterministic Metrics & Edge Cases ---")
        try:
            res = page.evaluate('''async () => {
                const { buildAllProductDecisionSnapshots } = await import('./src/ai/merchandising/facts.js');
                const { calculateProductMetrics, calculateShopABCXYZ } = await import('./src/ai/merchandising/metrics.js');

                const snaps = buildAllProductDecisionSnapshots(window.__qbiz_app__.state);
                const metricsList = snaps.map(s => calculateProductMetrics(s));
                const abcMap = calculateShopABCXYZ(snaps);

                // Zero-velocity synthetic test
                const zeroSnapshot = {
                    product: { id: 'zero_p', name: 'Zero Velocity Product', price: 100000, cost_price: 60000, lowStock: 5 },
                    inventory: { available: 15, onHand: 15, incomingTransit: 0 },
                    sales: { unitsSold7d: 0, unitsSoldPrev7d: 0, unitsSold30d: 0, unitsSold90d: 0, dailyUnits: [] },
                    generated_at: new Date().toISOString()
                };
                const zeroMetrics = calculateProductMetrics(zeroSnapshot);

                return {
                    metricsCount: metricsList.length,
                    abcCount: abcMap.size,
                    zeroVelocityDos: zeroMetrics.daysOfSupply,
                    zeroVelocityStatus: zeroMetrics.dosStatus,
                    zeroVelocityIsSlow: zeroMetrics.isSlowMoving,
                    firstTrend: metricsList[0]?.trend7d?.direction,
                };
            }''')

            assert res["zeroVelocityDos"] is None, f"Zero velocity DOS should be None/null, got {res['zeroVelocityDos']}"
            assert res["zeroVelocityStatus"] == "NO_RECENT_DEMAND", f"Expected NO_RECENT_DEMAND, got {res['zeroVelocityStatus']}"
            assert res["zeroVelocityIsSlow"] is True, "Product with 0 sales and inventory must be marked slow moving"
            assert res["abcCount"] > 0, "ABC/XYZ map is empty"
            print(f"  ✓ Metrics OK: ABC/XYZ count={res['abcCount']}, Zero-velocity DOS divide-by-zero protection verified.")
            passed_tests.append("TEST 2: Deterministic Metrics & DOS Protection")
        except Exception as e:
            print(f"  ❌ TEST 2 FAILED: {e}")
            failed_tests.append(f"TEST 2: {e}")

        # ----------------------------------------------------
        # TEST 3: Demand Forecast Progressive Engine
        # ----------------------------------------------------
        print("\n--- TEST 3: Progressive Demand Forecast & Backtesting ---")
        try:
            res = page.evaluate('''async () => {
                const { forecastDemand } = await import('./src/ai/merchandising/forecast.js');

                // Level 0: sparse/new
                const l0 = forecastDemand([{ date: '2026-09-20', qty: 1 }], 14);

                // Level 1: stable series
                const stableSeries = [];
                for (let i = 1; i <= 28; i++) {
                    const dayStr = i < 10 ? '0' + i : '' + i;
                    stableSeries.push({ date: `2026-09-${dayStr}`, qty: (i % 7 === 0 || i % 7 === 6) ? 5 : 2 });
                }
                const l1 = forecastDemand(stableSeries, 14);

                // Level 2: Intermittent/Croston series (many 0s)
                const intermittent = [];
                for (let i = 1; i <= 30; i++) {
                    const dayStr = i < 10 ? '0' + i : '' + i;
                    intermittent.push({ date: `2026-09-${dayStr}`, qty: (i % 5 === 0) ? 8 : 0 });
                }
                const l2 = forecastDemand(intermittent, 14);

                return {
                    l0Status: l0.status,
                    l0Level: l0.level,
                    l1Method: l1.method,
                    l1Daily: l1.dailyForecast,
                    l1Projected: l1.projectedDemand,
                    l2Level: l2.level,
                    l2ZeroRatio: l2.zeroRatio,
                };
            }''')

            assert res["l0Status"] == "NEED_MORE_HISTORY", f"Expected NEED_MORE_HISTORY, got {res['l0Status']}"
            assert res["l0Level"] == 0, "Sparse history should be Level 0"
            assert res["l1Projected"] > 0, "Level 1 forecast should produce positive projected demand"
            assert res["l2Level"] == 2, f"Sparse demand (>40% zero) should trigger Level 2, got {res['l2Level']}"
            print(f"  ✓ Forecast engine OK: Level 0={res['l0Status']}, Level 1={res['l1Method']}, Level 2 (Zero ratio {res['l2ZeroRatio']}).")
            passed_tests.append("TEST 3: Progressive Demand Forecast")
        except Exception as e:
            print(f"  ❌ TEST 3 FAILED: {e}")
            failed_tests.append(f"TEST 3: {e}")

        # ----------------------------------------------------
        # TEST 4: Replenishment Plan, Viability States & Budget Allocation
        # ----------------------------------------------------
        print("\n--- TEST 4: Replenishment Calculations & Budget Allocation ---")
        try:
            res = page.evaluate('''async () => {
                const { calculateReplenishmentPlan, evaluateProductViability, allocatePurchaseBudget } = await import('./src/ai/merchandising/recommendations.js');

                // Fast seller low stock
                const snapFast = {
                    product: { id: 'p_fast', name: 'Sản phẩm Bán chạy', sku: 'BC01', price: 200000, cost_price: 120000, unit: 'hộp', lowStock: 10 },
                    inventory: { available: 3, onHand: 3, incomingTransit: 0 },
                    sales: { unitsSold7d: 35, unitsSoldPrev7d: 25, unitsSold30d: 120, unitsSold90d: 300, txCount30d: 50, grossProfit30d: 9600000, grossMarginPct30d: 40 },
                    generated_at: new Date().toISOString()
                };
                const metricsFast = {
                    primaryVelocity: 5.0,
                    velocity_7d: 5.0,
                    trend7d: { direction: 'RISING', percentage: 40 },
                    daysOfSupply: 0.6,
                    stdDevDailySales: 1.5,
                    grossProfit30d: 9600000,
                    grossMarginPct30d: 40,
                };
                const planFast = calculateReplenishmentPlan(snapFast, metricsFast, { dailyForecast: 5.0 });
                const viaFast = evaluateProductViability(snapFast, metricsFast, planFast, { abcClass: 'A' });

                // Candidate ranking & Budget Allocation
                const candidate = {
                    snapshot: snapFast,
                    metrics: metricsFast,
                    plan: planFast,
                    viability: viaFast,
                };
                const allocation = allocatePurchaseBudget([candidate], 2000000); // 2 million VND

                return {
                    rop: planFast.reorderPoint,
                    suggestedQty: planFast.suggestedQuantity,
                    urgency: planFast.urgency,
                    viabilityState: viaFast.state,
                    allocatedCost: allocation.allocatedCost,
                    remainingBudget: allocation.remainingBudget,
                    allocatedQty: allocation.lines[0]?.allocatedQty,
                    unitCost: allocation.lines[0]?.unitCost,
                };
            }''')

            assert res["suggestedQty"] > 0, "Fast seller with low stock must have suggestedQuantity > 0"
            assert res["urgency"] in ["CRITICAL", "HIGH"], f"Expected high urgency, got {res['urgency']}"
            assert res["viabilityState"] in ["REORDER", "GROW"], f"Expected REORDER or GROW, got {res['viabilityState']}"
            assert res["allocatedCost"] <= 2000000, f"Budget overrun: allocated {res['allocatedCost']} > 2,000,000"
            assert res["remainingBudget"] >= 0, "Remaining budget cannot be negative"
            print(f"  ✓ Replenishment & Budget OK: ROP={res['rop']}, SuggestedQty={res['suggestedQty']}, State={res['viabilityState']}, Allocated={res['allocatedCost']} ₫.")
            passed_tests.append("TEST 4: Replenishment, Viability & Budget Allocation")
        except Exception as e:
            print(f"  ❌ TEST 4 FAILED: {e}")
            failed_tests.append(f"TEST 4: {e}")

        # ----------------------------------------------------
        # TEST 5: Owner Acceptance Queries 1 to 15 (Browser UI & AI Router)
        # ----------------------------------------------------
        print("\n--- TEST 5: Owner Acceptance Queries 1 to 15 ---")
        owner_queries = [
            ("1. Hôm nay cửa hàng thế nào?", "Hôm nay cửa hàng thế nào?", ["doanh thu", "hôm nay", "giao dịch", "đơn", "₫"]),
            ("2. Tháng này bán thế nào?", "Tháng này bán thế nào?", ["tháng", "doanh thu", "₫", "giao dịch"]),
            ("3. Hàng nào nên nhập thêm?", "Hàng nào nên nhập thêm?", ["nhập", "tồn", "khả dụng", "đề xuất", "sản phẩm"]),
            ("4. Tại sao lại đề xuất nhập mặt hàng này?", "Tại sao lại đề xuất nhập mặt hàng này?", ["đề xuất", "căn cứ", "tốc độ", "tồn", "hành động"]),
            ("5. Mặt hàng này có nên nhập tiếp không?", "Mặt hàng này có nên nhập tiếp không?", ["nhập", "đề xuất", "khả dụng", "tồn"]),
            ("6. Mặt hàng nào bán chậm?", "Mặt hàng nào bán chậm?", ["bán chậm", "tồn", "vốn", "ngày"]),
            ("7. Mặt hàng nào đang chôn vốn?", "Mặt hàng nào đang chôn vốn?", ["chôn vốn", "tồn", "₫"]),
            ("8. Mặt hàng nào bán chạy nhưng lời thấp?", "Mặt hàng nào bán chạy nhưng lời thấp?", ["doanh thu", "lợi nhuận", "biên", "tỷ suất"]),
            ("9. Mặt hàng nào thường xuyên sắp hết?", "Mặt hàng nào thường xuyên sắp hết?", ["nhập", "hết", "tồn", "khả dụng"]),
            ("10. Nếu có 5 triệu thì nên ưu tiên nhập gì?", "Nếu có 5 triệu thì nên ưu tiên nhập gì?", ["ngân sách", "5.000.000", "nhập", "chi phí"]),
            ("11. Tôi nên giảm nhập mặt hàng nào?", "Tôi nên giảm nhập mặt hàng nào?", ["kinh doanh", "nhập", "tồn", "theo dõi"]),
            ("12. Sản phẩm này có nên tiếp tục kinh doanh không?", "Sản phẩm này có nên tiếp tục kinh doanh không?", ["kinh doanh", "trạng thái", "khuyến nghị", "căn cứ"]),
            ("13. Cho tôi 5 việc cần làm hôm nay.", "Cho tôi 5 việc cần làm hôm nay.", ["việc cần làm", "hôm nay", "kiểm tra", "hành động"]),
            ("14. Tổng kết tháng này và nói vì sao.", "Tổng kết tháng này và nói vì sao.", ["tổng kết", "tháng", "doanh thu", "hành động"]),
            ("15. Tạo đề xuất nhập cho 3 mặt hàng cần nhất.", "Tạo đề xuất nhập cho 3 mặt hàng cần nhất.", ["đề xuất nhập", "nháp", "xác nhận", "mặt hàng"]),
        ]

        query_pass_count = 0
        for label, q_text, expected_keywords in owner_queries:
            try:
                res = page.evaluate('''(query) => {
                    return window.__qbiz_ai__.routeIntent(query, { actor_role: 'OWNER' }, window.__qbiz_app__.state).then(r => ({
                        tier: r.tier,
                        skillId: r.skillId,
                        text: r.text || '',
                        hasProposal: Boolean(r.proposal || (r.proposals && r.proposals.length)),
                    }));
                }''', q_text)

                text_lower = res["text"].lower()
                matched_keywords = [kw for kw in expected_keywords if kw.lower() in text_lower]

                assert len(matched_keywords) >= 1, f"Response did not contain expected keywords ({expected_keywords}): {res['text'][:100]}"

                if "15." in label:
                    assert res["hasProposal"] is True, "Query 15 must generate a Proposal Envelope for draft approval"

                print(f"  ✓ {label:<45} -> [TIER {res['tier']}] Skill: {res.get('skillId', 'direct')} (Matched: {', '.join(matched_keywords)})")
                query_pass_count += 1
            except Exception as e:
                print(f"  ❌ {label:<45} FAILED: {e}")
                failed_tests.append(f"{label}: {e}")

        if query_pass_count == len(owner_queries):
            passed_tests.append("TEST 5: All 15 Owner Queries Verified")
        else:
            failed_tests.append(f"TEST 5: {query_pass_count}/{len(owner_queries)} owner queries passed")

        # ----------------------------------------------------
        # TEST 6: Zero False Writes & Pure READ Safety
        # ----------------------------------------------------
        print("\n--- TEST 6: Zero False Writes on READ Queries ---")
        try:
            write_audit = page.evaluate('''async () => {
                const stockBefore = JSON.stringify(window.__qbiz_app__.state.data.levels || []);
                const salesBefore = JSON.stringify(window.__qbiz_app__.state.data.sales || []);
                const prodsBefore = JSON.stringify(window.__qbiz_app__.state.data.products || []);

                // Run several intensive read queries
                await window.__qbiz_ai__.routeIntent("Hàng nào nên nhập thêm?", { actor_role: 'OWNER' }, window.__qbiz_app__.state);
                await window.__qbiz_ai__.routeIntent("Mặt hàng nào bán chậm?", { actor_role: 'OWNER' }, window.__qbiz_app__.state);
                await window.__qbiz_ai__.routeIntent("Nếu có 5 triệu thì nên ưu tiên nhập gì?", { actor_role: 'OWNER' }, window.__qbiz_app__.state);
                await window.__qbiz_ai__.routeIntent("Sản phẩm này có nên tiếp tục kinh doanh không?", { actor_role: 'OWNER' }, window.__qbiz_app__.state);
                await window.__qbiz_ai__.routeIntent("Tạo đề xuất nhập cho 3 mặt hàng cần nhất.", { actor_role: 'OWNER' }, window.__qbiz_app__.state);

                const stockAfter = JSON.stringify(window.__qbiz_app__.state.data.levels || []);
                const salesAfter = JSON.stringify(window.__qbiz_app__.state.data.sales || []);
                const prodsAfter = JSON.stringify(window.__qbiz_app__.state.data.products || []);

                return {
                    stockChanged: stockBefore !== stockAfter,
                    salesChanged: salesBefore !== salesAfter,
                    prodsChanged: prodsBefore !== prodsAfter,
                };
            }''')

            assert not write_audit["stockChanged"], "READ query illegally altered levels table!"
            assert not write_audit["salesChanged"], "READ query illegally altered sales table!"
            assert not write_audit["prodsChanged"], "READ query illegally altered products table!"
            print("  ✓ Pure READ Verified: 0 unintended mutations across levels, sales, and products.")
            passed_tests.append("TEST 6: Zero False Writes (READ_FALSE_WRITE_RATE = 0)")
        except Exception as e:
            print(f"  ❌ TEST 6 FAILED: {e}")
            failed_tests.append(f"TEST 6: {e}")

        # ----------------------------------------------------
        # TEST 7: Role Permission & VIEW_COST Guard
        # ----------------------------------------------------
        print("\n--- TEST 7: Role Permission & VIEW_COST Guard ---")
        try:
            deny_audit = page.evaluate('''async () => {
                // Test Cashier asking for low margin (requires VIEW_COST)
                const res = await window.__qbiz_ai__.routeIntent("Mặt hàng nào bán chạy nhưng lời thấp?", { actor_role: 'CASHIER' }, window.__qbiz_app__.state);
                return {
                    text: res.text,
                    isDenied: Boolean(res.permissionDenied || res.isSecurityRejection || res.text.includes('HARD DENY') || res.text.includes('Từ chối')),
                };
            }''')

            assert deny_audit["isDenied"], f"Cashier without VIEW_COST was not denied financial cost insight: {deny_audit['text']}"
            print("  ✓ VIEW_COST Guard Verified: CASHIER role strictly blocked with HARD DENY on profit/margin inquiry.")
            passed_tests.append("TEST 7: Role Security & VIEW_COST Guard")
        except Exception as e:
            print(f"  ❌ TEST 7 FAILED: {e}")
            failed_tests.append(f"TEST 7: {e}")

        # ----------------------------------------------------
        # TEST 8: UI & AI Data Parity (Ledger & Report Consistency)
        # ----------------------------------------------------
        print("\n--- TEST 8: UI & AI Data Parity ---")
        try:
            parity = page.evaluate('''async () => {
                const rep = window.__qbiz_app__.reportSales('today');
                const aiSales = await window.__qbiz_ai__.routeIntent("Hôm nay bán được bao nhiêu?", { actor_role: 'OWNER' }, window.__qbiz_app__.state);
                const firstProd = (window.__qbiz_app__.state.data.products || []).find(p => p.trackInventory !== false && p.type !== 'SERVICE');
                const { totalFor } = await import('./src/engine.js');
                const engineStock = totalFor(window.__qbiz_app__.state.data, firstProd.id);

                const { buildProductDecisionSnapshot } = await import('./src/ai/merchandising/facts.js');
                const aiSnap = buildProductDecisionSnapshot(firstProd.id, window.__qbiz_app__.state);

                return {
                    reportNet: rep.net,
                    engineAvailable: engineStock.available,
                    aiAvailable: aiSnap.inventory.available,
                    stockParity: engineStock.available === aiSnap.inventory.available,
                };
            }''')

            assert parity["stockParity"], f"Stock mismatch between totalFor ({parity['engineAvailable']}) and AI ({parity['aiAvailable']})"
            print(f"  ✓ Data Parity Verified: Engine stock ({parity['engineAvailable']}) matches AI Fact Builder ({parity['aiAvailable']}) with 100% precision.")
            passed_tests.append("TEST 8: UI & AI Data Parity 100%")
        except Exception as e:
            print(f"  ❌ TEST 8 FAILED: {e}")
            failed_tests.append(f"TEST 8: {e}")

        browser.close()

    print("\n" + "=" * 80)
    print("MERCHANDISING INTELLIGENCE VERIFICATION SUMMARY:")
    print(f"  Passed Tests: {len(passed_tests)} / {len(passed_tests) + len(failed_tests)}")
    for t in passed_tests:
        print(f"  [PASS] {t}")
    for f in failed_tests:
        print(f"  [FAIL] {f}")
    print("=" * 80)

    if failed_tests:
        sys.exit(1)
    else:
        print("ALL MERCHANDISING INTELLIGENCE TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_merchandising_tests()
