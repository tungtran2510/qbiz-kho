"""
tests/business-profile-foundation.py
QBiz Kho — Business Profile / Business Mode Foundation (Phase 1)
Automated Operational Verification Suite (T01 - T08 & Core Invariants)

Usage:
    python tests/business-profile-foundation.py [BASE_URL]
    Default BASE_URL: http://127.0.0.1:4180
"""

import asyncio
import os
import sys
from playwright.async_api import async_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("QBIZ_BASE_URL", "http://127.0.0.1:4180")
if not BASE_URL.endswith('/'):
    BASE_URL += '/'

async def run_foundation_tests():
    print("================================================================")
    print("QBIZ KHO — BUSINESS PROFILE / BUSINESS MODE FOUNDATION (PHASE 1)")
    print(f"TARGET RUNTIME: {BASE_URL}")
    print("ZERO UI CHANGE | DATA IMMUTABILITY | CAPABILITY-DRIVEN ARCHITECTURE")
    print("================================================================\n")

    results = {}
    console_errors = []

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()

        def on_console(msg):
            if msg.type == "error":
                if "Failed to load resource" not in msg.text and "favicon" not in msg.text:
                    console_errors.append(f"[{msg.type}] {msg.text}")

        page.on("console", on_console)
        page.on("pageerror", lambda err: console_errors.append(f"[pageerror] {err}"))

        # ----------------------------------------------------
        # Prerequisite: Regression Harnesses
        # ----------------------------------------------------
        print("--- [Regression] Data Integrity Harness ---")
        await page.goto(f"{BASE_URL}tests/data-integrity.html")
        await page.wait_for_function("() => document.getElementById('out')?.innerText.includes('DONE:ALL_PASS')", timeout=15000)
        di_out = await page.inner_text("#out")
        di_pass = "DONE:ALL_PASS" in di_out and '"FAIL_COUNT": 0' in di_out and '"MISMATCH": 0' in di_out
        print(f"Data Integrity: {'PASS (30/30)' if di_pass else 'FAIL'}")
        assert di_pass, "Data integrity regression failed"
        results["DATA_INTEGRITY_REGRESSION"] = di_pass

        print("\n--- [Regression] POS Transaction Delta Harness ---")
        await page.goto(f"{BASE_URL}tests/pos-transaction-delta.html")
        await page.wait_for_function("() => document.body.dataset.result === 'PASS'", timeout=10000)
        ptd_res = await page.evaluate("() => document.body.dataset.result")
        print(f"POS Delta: {ptd_res} (7/7)")
        assert ptd_res == "PASS", "POS transaction delta regression failed"
        results["POS_TRANSACTION_DELTA_REGRESSION"] = (ptd_res == "PASS")

        # ----------------------------------------------------
        # Load Main App
        # ----------------------------------------------------
        print(f"\n--- Loading Main App from {BASE_URL} ---")
        await page.goto(BASE_URL)
        await page.wait_for_function("() => window.__qbiz_app__?.businessProfile")

        # ----------------------------------------------------
        # T01: DEFAULT Profile & App Behavior
        # ----------------------------------------------------
        print("\n--- [T01] DEFAULT Profile & App Behavior ---")
        t01_res = await page.evaluate("""() => {
            const bp = window.__qbiz_app__.businessProfile;
            const profile = bp.getBusinessProfile();
            const state = window.__qbiz_app__.state;
            return {
                isGeneral: profile.profile_id === 'general',
                isBusinessTypeGeneral: profile.business_type === 'GENERAL',
                hasInventory: bp.hasCapability('inventory'),
                hasService: bp.hasCapability('service'),
                hasRetail: bp.hasCapability('retail'),
                hasAppointment: bp.hasCapability('appointment'),
                productTerm: bp.getTerminology('PRODUCT'),
                customerTerm: bp.getTerminology('CUSTOMER'),
                dataProductsCount: (state.data?.products || []).length,
                dataWarehousesCount: (state.data?.warehouses || []).length
            };
        }""")
        print(f"T01 Result: {t01_res}")
        t01_pass = (
            t01_res["isGeneral"] and
            t01_res["isBusinessTypeGeneral"] and
            t01_res["hasInventory"] is True and
            t01_res["hasAppointment"] is False and
            t01_res["productTerm"] == "Hàng hóa" and
            t01_res["dataProductsCount"] > 0
        )
        results["T01_DEFAULT_PROFILE"] = t01_pass

        # ----------------------------------------------------
        # T02: Profile Switch & Business Data Safety
        # ----------------------------------------------------
        print("\n--- [T02] Profile Switch & Business Data Safety ---")
        t02_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;
            const state = window.__qbiz_app__.state;

            // 1. Snapshot business entities before any profile switch
            const initialCounts = {
                products: (state.data?.products || []).length,
                warehouses: (state.data?.warehouses || []).length,
                sales: (state.data?.sales || []).length,
                orders: (state.data?.orders || []).length,
                movements: (state.data?.movements || []).length,
                customers: (state.data?.customers || []).length,
                suppliers: (state.data?.suppliers || []).length,
                firstProductId: state.data?.products[0]?.id,
                firstProductStock: state.data?.levels?.find(l => l.productId === state.data?.products[0]?.id)?.onHand
            };

            // 2. Switch through all built-in profiles
            const r1 = await bp.setBusinessProfile('retail');
            const p1 = bp.getBusinessProfile();

            const r2 = await bp.setBusinessProfile('wholesale');
            const p2 = bp.getBusinessProfile();

            const r3 = await bp.setBusinessProfile('service');
            const p3 = bp.getBusinessProfile();

            // 3. Verify business entities after all profile switches
            const finalCounts = {
                products: (state.data?.products || []).length,
                warehouses: (state.data?.warehouses || []).length,
                sales: (state.data?.sales || []).length,
                orders: (state.data?.orders || []).length,
                movements: (state.data?.movements || []).length,
                customers: (state.data?.customers || []).length,
                suppliers: (state.data?.suppliers || []).length,
                firstProductId: state.data?.products[0]?.id,
                firstProductStock: state.data?.levels?.find(l => l.productId === state.data?.products[0]?.id)?.onHand
            };

            // 4. Restore to GENERAL
            await bp.resetToDefaultProfile();
            const pFinal = bp.getBusinessProfile();

            const dataUntouched = (
                initialCounts.products === finalCounts.products &&
                initialCounts.warehouses === finalCounts.warehouses &&
                initialCounts.sales === finalCounts.sales &&
                initialCounts.orders === finalCounts.orders &&
                initialCounts.movements === finalCounts.movements &&
                initialCounts.customers === finalCounts.customers &&
                initialCounts.suppliers === finalCounts.suppliers &&
                initialCounts.firstProductId === finalCounts.firstProductId &&
                initialCounts.firstProductStock === finalCounts.firstProductStock
            );

            return {
                r1Success: r1.success && p1.profile_id === 'retail',
                r2Success: r2.success && p2.profile_id === 'wholesale',
                r3Success: r3.success && p3.profile_id === 'service',
                restoredGeneral: pFinal.profile_id === 'general',
                dataUntouched
            };
        }""")
        print(f"T02 Result: {t02_res}")
        t02_pass = (
            t02_res["r1Success"] and
            t02_res["r2Success"] and
            t02_res["r3Success"] and
            t02_res["restoredGeneral"] and
            t02_res["dataUntouched"]
        )
        results["T02_PROFILE_SWITCH_DATA_SAFETY"] = t02_pass

        # ----------------------------------------------------
        # T03: Invalid Profile Fallback to DEFAULT
        # ----------------------------------------------------
        print("\n--- [T03] Invalid Profile Fallback ---")
        t03_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;

            // Non-existent string preset
            const r1 = await bp.setBusinessProfile('invalid_profile_name_xyz');
            const p1 = bp.getBusinessProfile();

            // Broken / incomplete object
            const r2 = await bp.setBusinessProfile({ incomplete: true });
            const p2 = bp.getBusinessProfile();

            // Null input
            const r3 = await bp.setBusinessProfile(null);
            const p3 = bp.getBusinessProfile();

            return {
                r1Fallback: r1.fallback === true && p1.profile_id === 'general',
                r2Fallback: r2.fallback === true && p2.profile_id === 'general',
                r3Fallback: r3.fallback === true && p3.profile_id === 'general',
            };
        }""")
        print(f"T03 Result: {t03_res}")
        t03_pass = t03_res["r1Fallback"] and t03_res["r2Fallback"] and t03_res["r3Fallback"]
        results["T03_INVALID_PROFILE_FALLBACK"] = t03_pass

        # ----------------------------------------------------
        # T04: Terminology Resolver (Resolver works, UI unchanged)
        # ----------------------------------------------------
        print("\n--- [T04] Terminology Resolver ---")
        t04_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;

            // General profile terminology
            await bp.setBusinessProfile('general');
            const termGenProduct = bp.getTerminology('PRODUCT');
            const termGenCustomer = bp.getTerminology('CUSTOMER');

            // Wholesale profile terminology
            await bp.setBusinessProfile('wholesale');
            const termWholesaleProduct = bp.getTerminology('PRODUCT');
            const termWholesaleCustomer = bp.getTerminology('CUSTOMER');

            // Service profile terminology
            await bp.setBusinessProfile('service');
            const termServiceProduct = bp.getTerminology('PRODUCT');
            const termServiceService = bp.getTerminology('SERVICE');

            // Reset back to general
            await bp.resetToDefaultProfile();

            // Check existing UI labels in the DOM (Must NOT have changed!)
            const topTitle = document.getElementById('pageTitle')?.textContent;
            const navLabels = Array.from(document.querySelectorAll('#mobileNav button span')).map(s => s.textContent);

            return {
                termGenProduct,
                termWholesaleCustomer,
                termServiceProduct,
                topTitle,
                navLabels
            };
        }""")
        print(f"T04 Terminology: {t04_res}")
        t04_pass = (
            t04_res["termGenProduct"] == "Hàng hóa" and
            t04_res["termWholesaleCustomer"] == "Đại lý / Đối tác" and
            t04_res["termServiceProduct"] == "Gói dịch vụ" and
            t04_res["topTitle"] == "Tổng quan" and
            "Hàng hóa" in t04_res["navLabels"] and
            "Bán hàng" in t04_res["navLabels"]
        )
        results["T04_TERMINOLOGY_RESOLVER"] = t04_pass

        # ----------------------------------------------------
        # T05: Capability Resolver
        # ----------------------------------------------------
        print("\n--- [T05] Capability Resolver ---")
        t05_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;

            await bp.setBusinessProfile('general');
            const genInv = bp.hasCapability('inventory');
            const genAppt = bp.hasCapability('appointment');

            await bp.setBusinessProfile('wholesale');
            const whoWholesale = bp.hasCapability('wholesale');
            const whoPriceLists = bp.hasCapability('price_lists');

            await bp.setBusinessProfile('service');
            const srvBooking = bp.hasCapability('booking');
            const srvAppt = bp.hasCapability('appointment');
            const srvInv = bp.hasCapability('inventory');

            // Unknown capability should return false
            const unknownCap = bp.hasCapability('space_exploration');

            await bp.resetToDefaultProfile();

            return {
                genInv,
                genAppt,
                whoWholesale,
                whoPriceLists,
                srvBooking,
                srvAppt,
                srvInv,
                unknownCap
            };
        }""")
        print(f"T05 Capability: {t05_res}")
        t05_pass = (
            t05_res["genInv"] is True and
            t05_res["genAppt"] is False and
            t05_res["whoWholesale"] is True and
            t05_res["whoPriceLists"] is True and
            t05_res["srvBooking"] is True and
            t05_res["srvAppt"] is True and
            t05_res["srvInv"] is False and
            t05_res["unknownCap"] is False
        )
        results["T05_CAPABILITY_RESOLVER"] = t05_pass

        # ----------------------------------------------------
        # T06: Persistence & Single Source of Truth
        # ----------------------------------------------------
        print("\n--- [T06] Persistence & Single Source of Truth ---")
        # Set profile to 'retail' and persist
        await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;
            await bp.setBusinessProfile('retail');
        }""")

        # Verify storage location before reload: uses existing 'settings' store and localStorage under qbiz_business_mode_profile
        storage_check = await page.evaluate("""async () => {
            const lsValue = localStorage.getItem('qbiz_business_mode_profile');
            let hasLs = Boolean(lsValue);
            let lsParsed = hasLs ? JSON.parse(lsValue) : null;
            return {
                hasLs,
                lsProfileId: lsParsed?.profile_id
            };
        }""")
        print(f"T06 Storage Check Before Reload: {storage_check}")

        # Reload page
        await page.reload()
        await page.wait_for_function("() => window.__qbiz_app__?.businessProfile")

        t06_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;
            const p = bp.getBusinessProfile();
            // Reset back to general for clean state
            await bp.resetToDefaultProfile();
            return {
                reloadedProfileId: p.profile_id,
                isRetail: p.profile_id === 'retail'
            };
        }""")
        print(f"T06 Persistence: {t06_res}")
        t06_pass = t06_res["isRetail"] is True and storage_check["lsProfileId"] == "retail"
        results["T06_PERSISTENCE_RELOAD"] = t06_pass

        # ----------------------------------------------------
        # T07: Backward Compatibility & Schema / Version Safety
        # ----------------------------------------------------
        print("\n--- [T07] Backward Compatibility & Version Safety ---")
        t07_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;
            const state = window.__qbiz_app__.state;

            // 1. Verify settings array in state.data is intact
            const settingsCount = (state.data?.settings || []).length;

            // 2. Test normalizing profile with unknown custom fields & future version (Must NOT crash)
            const futureProfile = {
                schema_version: 99,
                profile_version: 5,
                profile_id: 'custom_store',
                name: 'Cửa hàng tương lai',
                business_type: 'CUSTOM',
                capabilities: { inventory: true, custom_cap: true },
                terminology: { PRODUCT: { singular: 'Món đồ' } },
                navigation_preferences: {},
                workflow_preferences: {},
                visual_preferences: {},
                custom_extra_attribute: 'preserved_value_123'
            };

            const normalized = bp.normalizeBusinessProfile(futureProfile);
            const preservesExtra = normalized.custom_extra_attribute === 'preserved_value_123';
            const hasDefaultFallbacks = typeof normalized.capabilities.customer_management === 'boolean';
            const schemaVerClamped = typeof normalized.schema_version === 'number';
            const profileVerClamped = typeof normalized.profile_version === 'number';

            return {
                settingsCount,
                preservesExtra,
                hasDefaultFallbacks,
                schemaVerClamped,
                profileVerClamped
            };
        }""")
        print(f"T07 Backward Compatibility: {t07_res}")
        t07_pass = (
            t07_res["preservesExtra"] and
            t07_res["hasDefaultFallbacks"] and
            t07_res["schemaVerClamped"] and
            t07_res["profileVerClamped"]
        )
        results["T07_BACKWARD_COMPATIBILITY"] = t07_pass

        # ----------------------------------------------------
        # T08: Current UI Regression (390px, 412px, 1440px)
        # ----------------------------------------------------
        print("\n--- [T08] UI Regression (390px, 412px, 1440px) ---")
        for width in [390, 412, 1440]:
            await page.set_viewport_size({"width": width, "height": 900})
            await page.wait_for_timeout(300)
            overflow = await page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            print(f"Viewport {width}px overflow: {overflow}px")
            assert overflow <= 0, f"Overflow {overflow}px detected at {width}px!"

        # Ensure no UI elements modified or corrupted
        ui_check = await page.evaluate("""() => {
            const hasSidebarOnDesktop = Boolean(document.querySelector('.sidebar'));
            const hasMobileNav = Boolean(document.querySelector('#mobileNav'));
            const title = document.getElementById('pageTitle')?.textContent;
            return { hasSidebarOnDesktop, hasMobileNav, title };
        }""")
        print(f"T08 UI Structure Check: {ui_check}")
        t08_pass = ui_check["hasSidebarOnDesktop"] and ui_check["hasMobileNav"] and ui_check["title"] == "Tổng quan"
        results["T08_UI_REGRESSION"] = t08_pass

        # ----------------------------------------------------
        # T09: Store Profile Preservation (Thông tin cửa hàng)
        # ----------------------------------------------------
        print("\n--- [T09] STORE PROFILE PRESERVATION ---")
        # 1. Setup Thông tin cửa hàng in IndexedDB settings store under id='business_profile'
        await page.evaluate("""async () => {
            const storeData = {
                store_name: "QBiz Test",
                phone: "0900000000",
                address: "Hanoi",
                bank_account_number: "123456"
            };
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('qbiz_kho_v1', 12);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const tx = db.transaction('settings', 'readwrite');
            tx.objectStore('settings').put({ id: 'business_profile', value: storeData, updated_at: new Date().toISOString() });
            await new Promise(resolve => tx.oncomplete = resolve);
        }""")

        # 2. setBusinessProfile('retail')
        await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;
            await bp.setBusinessProfile('retail');
        }""")

        # 3. reload
        await page.reload()
        await page.wait_for_function("() => window.__qbiz_app__?.businessProfile")

        # 4. resetToDefaultProfile()
        await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;
            await bp.resetToDefaultProfile();
        }""")

        # 5. reload
        await page.reload()
        await page.wait_for_function("() => window.__qbiz_app__?.businessProfile")

        # 6. Check that store profile in settings store under id='business_profile' is 100% preserved
        t09_res = await page.evaluate("""async () => {
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('qbiz_kho_v1', 12);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const tx = db.transaction('settings', 'readonly');
            const req = tx.objectStore('settings').get('business_profile');
            const storeSetting = await new Promise(resolve => req.onsuccess = () => resolve(req.result));
            const bp = window.__qbiz_app__.businessProfile;
            const currentMode = bp.getBusinessProfile();

            const storeVal = storeSetting?.value || {};
            const storeNamePreserved = storeVal.store_name === "QBiz Test";
            const phonePreserved = storeVal.phone === "0900000000";
            const addressPreserved = storeVal.address === "Hanoi";
            const bankPreserved = storeVal.bank_account_number === "123456";

            return {
                storeNamePreserved,
                phonePreserved,
                addressPreserved,
                bankPreserved,
                currentModeId: currentMode.profile_id
            };
        }""")
        print(f"T09 Result: {t09_res}")
        t09_pass = (
            t09_res["storeNamePreserved"] and
            t09_res["phonePreserved"] and
            t09_res["addressPreserved"] and
            t09_res["bankPreserved"] and
            t09_res["currentModeId"] == "general"
        )
        results["T09_STORE_PROFILE_PRESERVATION"] = t09_pass

        # ----------------------------------------------------
        # T10: Key Separation
        # ----------------------------------------------------
        print("\n--- [T10] KEY SEPARATION ---")
        t10_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;
            // Mutate business mode to 'wholesale'
            await bp.setBusinessProfile('wholesale');

            // Read both settings records directly from IndexedDB
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('qbiz_kho_v1', 12);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const tx = db.transaction('settings', 'readonly');
            const storeStore = tx.objectStore('settings');
            const reqStore = storeStore.get('business_profile');
            const reqMode = storeStore.get('qbiz_business_mode_profile');

            const storeRec = await new Promise(resolve => reqStore.onsuccess = () => resolve(reqStore.result));
            const modeRec = await new Promise(resolve => reqMode.onsuccess = () => resolve(reqMode.result));

            // Reset back to general
            await bp.resetToDefaultProfile();

            const storeIntact = storeRec?.value?.store_name === "QBiz Test";
            const modeWholesale = modeRec?.value?.profile_id === "wholesale";
            const modeDistinct = modeRec?.id === "qbiz_business_mode_profile" && storeRec?.id === "business_profile";

            return {
                storeIntact,
                modeWholesale,
                modeDistinct
            };
        }""")
        print(f"T10 Result: {t10_res}")
        t10_pass = t10_res["storeIntact"] and t10_res["modeWholesale"] and t10_res["modeDistinct"]
        results["T10_KEY_SEPARATION"] = t10_pass

        # ----------------------------------------------------
        # T11: Legacy Collision Safety
        # ----------------------------------------------------
        print("\n--- [T11] LEGACY COLLISION SAFETY ---")
        t11_res = await page.evaluate("""async () => {
            const bp = window.__qbiz_app__.businessProfile;

            // Simulate settings containing store profile object under id: 'business_profile'
            const mockSettings = [
                {
                    id: 'business_profile',
                    value: {
                        store_name: "Cửa hàng thời trang",
                        phone: "0912345678",
                        address: "TP. Hồ Chí Minh"
                    }
                }
            ];

            // Initialize business profile with this settings data
            const profile = await bp.initBusinessProfile(mockSettings);

            // Verify:
            // 1. mockSettings[0] ('business_profile') is 100% UNTOUCHED
            const storeNotMutated = mockSettings[0].value.store_name === "Cửa hàng thời trang";
            // 2. Business mode cleanly initialized to DEFAULT ('general') without crash
            const isGeneral = profile.profile_id === 'general';
            // 3. hasInventory is true
            const hasInv = bp.hasCapability('inventory');

            return {
                storeNotMutated,
                isGeneral,
                hasInv
            };
        }""")
        print(f"T11 Result: {t11_res}")
        t11_pass = t11_res["storeNotMutated"] and t11_res["isGeneral"] and t11_res["hasInv"]
        results["T11_LEGACY_COLLISION_SAFETY"] = t11_pass

        # Check console errors
        print(f"\nConsole Errors Count: {len(console_errors)}")
        if console_errors:
            print(f"Console errors: {console_errors}")
        assert len(console_errors) == 0, "Console errors detected!"

        await browser.close()

    print("\n================================================================")
    print("FINAL TEST RESULTS (T01 - T08 & INVARIANTS)")
    print("================================================================")
    all_pass = True
    for k, v in results.items():
        status = "PASS" if v else "FAIL"
        print(f"{k}: {status}")
        if not v:
            all_pass = False

    print("================================================================")
    verdict = "VERIFY" if all_pass else "NOT READY"
    print(f"OVERALL VERDICT: {verdict}")
    print("================================================================")

    if not all_pass:
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(run_foundation_tests())
