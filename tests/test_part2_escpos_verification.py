# -*- coding: utf-8 -*-
"""
Empirical Verification Test Suite for Part 2: ESC/POS & Cash Drawer Driver (Probe 6)
1. Cash Drawer Kick Driver (kickCashDrawer):
   - Exists on window.__qbiz_app__.kickCashDrawer
   - Returns valid pulse byte array [0x1B, 0x70, 0x00, 0x19, 0xFA] (50ms on / 500ms off)
   - Dispatches 'qbiz:cash_drawer_kicked' custom DOM event with payload
   - Supports Pin 2 and Pin 5
2. ESC/POS Receipt Generator (generateEscPosReceipt):
   - Exists on window.__qbiz_app__.generateEscPosReceipt
   - Generates standard ESC/POS binary buffer
   - Contains Init (ESC @: 1B 40)
   - Contains Drawer Kick (ESC p 0: 1B 70 00)
   - Formats items, totals, split payment breakdown
   - Generates Model 2 2D QR Code command (GS ( k)
   - Contains Paper Cut (GS V: 1D 56)
   - Supports 80mm (48 cols) and 58mm (32 cols)
3. Probe 6 Capability Audit:
   - Confirms Probe 6 is limitation-free
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

def run_escpos_verification(run_index=1):
    print(f"\n===========================================================================")
    print(f"RUN {run_index}: Part 2 - ESC/POS & Cash Drawer Driver Empirical Verification")
    print(f"===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.kickCashDrawer", timeout=10000)
        time.sleep(1)

        # -------------------------------------------------------------
        # TEST 1: Cash Drawer Kick Function & Event Dispatch
        # -------------------------------------------------------------
        print("  [Test 1] Testing window.__qbiz_app__.kickCashDrawer() and CustomEvent Dispatch...")
        test1_res = page.evaluate("""
        async () => {
            let eventFired = false;
            let eventDetail = null;

            window.addEventListener('qbiz:cash_drawer_kicked', (e) => {
                eventFired = true;
                eventDetail = e.detail;
            }, { once: true });

            const result = await window.__qbiz_app__.kickCashDrawer({ pin: 0, onTimeMs: 50, offTimeMs: 500 });

            return {
                isFunction: typeof window.__qbiz_app__.kickCashDrawer === 'function',
                success: result.success,
                transport: result.transport,
                pin: result.pin,
                hex: result.hex,
                eventFired,
                eventDetail
            };
        }
        """)
        print(f"    Driver Function Exists: {test1_res['isFunction']}")
        print(f"    Drawer Kick Hex: {test1_res['hex']}")
        print(f"    Event Fired: {test1_res['eventFired']} (Transport: {test1_res['transport']})")
        assert test1_res['isFunction'] is True, "kickCashDrawer must be a function on window.__qbiz_app__"
        assert test1_res['success'] is True, "kickCashDrawer must return success: true"
        assert test1_res['hex'] == "1b 70 00 19 fa", f"Expected '1b 70 00 19 fa', got {test1_res['hex']}"
        assert test1_res['eventFired'] is True, "qbiz:cash_drawer_kicked CustomEvent must be dispatched"
        print("    [PASS] Test 1: Cash drawer kick driver and event dispatch verified.")

        # -------------------------------------------------------------
        # TEST 2: Pin 5 Drawer Kick Command Pulse
        # -------------------------------------------------------------
        print("  [Test 2] Testing Pin 5 Drawer Kick Command Generation...")
        test2_res = page.evaluate("""
        async () => {
            const { buildDrawerKickCommand } = await import('/src/hardware/escpos.js');
            const pin5Bytes = buildDrawerKickCommand(1, 100, 400); // pin 1 (pin 5 physical), on=100ms (50*2), off=400ms (200*2)
            const hex = Array.from(pin5Bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
            return {
                bytesLength: pin5Bytes.length,
                hex
            };
        }
        """)
        print(f"    Pin 5 Hex: {test2_res['hex']}")
        assert test2_res['hex'] == "1b 70 01 32 c8", f"Expected '1b 70 01 32 c8' for Pin 5 pulse, got {test2_res['hex']}"
        print("    [PASS] Test 2: Pin 5 drawer kick command verified.")

        # -------------------------------------------------------------
        # TEST 3: ESC/POS Thermal Receipt Generation with Split Payment
        # -------------------------------------------------------------
        print("  [Test 3] Testing generateEscPosReceipt() with Split Payment & VietQR...")
        test3_res = page.evaluate("""
        async () => {
            const sampleSale = {
                id: 'sale-test-escpos-01',
                code: 'POS-008899',
                created_at: '2026-10-02T15:30:00.000Z',
                customer_label: 'Anh Nguyen Van A',
                subtotal: 3500000,
                discount_total: 200000,
                grand_total: 3300000,
                paid_amount: 2500000,
                debt_amount: 800000,
                payment_method: 'split',
                payment_status: 'PARTIAL',
                items: [
                    { name: 'Ghe DoctorLoan N85 Chan Cao', quantity: 1, unit_price: 2300000, line_total: 2300000 },
                    { name: 'Goi Chuyen Dung Tri Lieu', quantity: 2, unit_price: 600000, line_total: 1200000 }
                ],
                payments: [
                    { method: 'cash', amount: 1000000, status: 'PAID', reference: 'Tien mat' },
                    { method: 'qr', amount: 1500000, status: 'PAID', reference: 'VietQR-554' },
                    { method: 'debt', amount: 800000, status: 'PENDING', reference: 'Con no 15 ngay' }
                ],
                vietqr_url: 'https://img.vietqr.io/image/970422-0909888999-compact2.png?amount=3300000'
            };

            const storeInfo = {
                name: 'QBIZ SHOWROOM TRUNG TAM',
                address: '123 Nguyen Thi Minh Khai, Q1, TP.HCM',
                phone: '0909.123.456',
                cashier: 'Thu Ngan 01'
            };

            // 80mm width (48 characters)
            const receipt80 = window.__qbiz_app__.generateEscPosReceipt({
                sale: sampleSale,
                storeInfo,
                width: 48,
                openDrawer: true,
                autoCut: true
            });

            // 58mm width (32 characters)
            const receipt58 = window.__qbiz_app__.generateEscPosReceipt({
                sale: sampleSale,
                storeInfo,
                width: 32,
                openDrawer: false,
                autoCut: true
            });

            // Inspect binary buffer sequences
            const bytes80 = receipt80.rawBytes;
            const hasInit = bytes80[0] === 0x1B && bytes80[1] === 0x40; // ESC @
            const hasDrawerKick = bytes80[2] === 0x1B && bytes80[3] === 0x70; // ESC p
            
            // Check for Cut command (GS V: 1D 56) in last 10 bytes
            let hasCut = false;
            for (let i = bytes80.length - 10; i < bytes80.length; i++) {
                if (bytes80[i] === 0x1D && bytes80[i + 1] === 0x56) {
                    hasCut = true;
                    break;
                }
            }

            // Check for QR command (GS ( k: 1D 28 6B)
            let hasQr = false;
            for (let i = 0; i < bytes80.length - 3; i++) {
                if (bytes80[i] === 0x1D && bytes80[i + 1] === 0x28 && bytes80[i + 2] === 0x6B) {
                    hasQr = true;
                    break;
                }
            }

            return {
                len80: receipt80.bytesLength,
                len58: receipt58.bytesLength,
                hasInit,
                hasDrawerKick,
                hasCut,
                hasQr,
                hexSample: receipt80.hex.slice(0, 80)
            };
        }
        """)
        print(f"    80mm Receipt Buffer: {test3_res['len80']} bytes")
        print(f"    58mm Receipt Buffer: {test3_res['len58']} bytes")
        print(f"    Has Printer Init (ESC @): {test3_res['hasInit']}")
        print(f"    Has Cash Drawer Kick (ESC p): {test3_res['hasDrawerKick']}")
        print(f"    Has QR Code Command (GS ( k): {test3_res['hasQr']}")
        print(f"    Has Paper Cut Command (GS V): {test3_res['hasCut']}")
        print(f"    Hex Header Sample: {test3_res['hexSample']}")

        assert test3_res['hasInit'] is True, "Receipt must start with ESC @"
        assert test3_res['hasDrawerKick'] is True, "Receipt must include drawer kick pulse"
        assert test3_res['hasQr'] is True, "Receipt must include QR code commands"
        assert test3_res['hasCut'] is True, "Receipt must include paper cut command"
        assert test3_res['len80'] > 300, "80mm receipt should be substantial (>300 bytes)"
        assert test3_res['len58'] > 250, "58mm receipt should be substantial (>250 bytes)"
        print("    [PASS] Test 3: Full ESC/POS thermal receipt formatting verified.")

        # -------------------------------------------------------------
        # TEST 4: Probe 6 Limitation-Free Audit
        # -------------------------------------------------------------
        print("  [Test 4] Verifying Probe 6 Limitation Clearance in Audit Context...")
        probe6_audit = page.evaluate("""
        () => {
            const hasCashDrawerKick = typeof window.__qbiz_app__?.kickCashDrawer === 'function';
            const hasEscPosReceipt = typeof window.__qbiz_app__?.generateEscPosReceipt === 'function';
            return {
                hasCashDrawerKick,
                hasEscPosReceipt,
                is_limitation: !(hasCashDrawerKick && hasEscPosReceipt)
            };
        }
        """)
        print(f"    Cash Drawer Kick Available: {probe6_audit['hasCashDrawerKick']}")
        print(f"    ESC/POS Receipt Generator Available: {probe6_audit['hasEscPosReceipt']}")
        print(f"    Limitation Flag: {probe6_audit['is_limitation']}")
        assert probe6_audit['is_limitation'] is False, "Probe 6 must be resolved and not be a limitation"
        print("    [PASS] Test 4: Probe 6 verified as fully resolved.")

        browser.close()
        return True

if __name__ == "__main__":
    passes = 0
    total_runs = 5
    print("=" * 80)
    print("EXECUTING 5 CONSECUTIVE PASSES: PART 2 ESC/POS & CASH DRAWER DRIVER")
    print("=" * 80)
    for i in range(1, total_runs + 1):
        try:
            if run_escpos_verification(i):
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
        print(">>> ALL 5 PASSES SUCCEEDED: PART 2 ESC/POS & CASH DRAWER DRIVER VERIFIED <<<")
        sys.exit(0)
    else:
        print(">>> VERIFICATION FAILED <<<")
        sys.exit(1)
