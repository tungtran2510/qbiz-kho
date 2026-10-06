# -*- coding: utf-8 -*-
import sys
import os
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def test_tax_and_profit():
    console_errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1/7] Navigating to http://localhost:4180...")
        page.goto("http://localhost:4180", wait_until="networkidle")
        time.sleep(1)

        print("[2/7] Checking Settings -> Thuế & Hộ kinh doanh...")
        page.evaluate("() => window.navigate('settings')")
        time.sleep(0.5)

        tax_btn = page.locator('[data-action="tax-preferences"]')
        if not tax_btn.is_visible():
            raise Exception("Nút [data-action='tax-preferences'] không hiển thị trong Cài đặt!")
        
        tax_btn.click()
        time.sleep(0.5)

        # Verify Modal
        modal = page.locator("#modalRoot .tax-settings-sheet")
        if not modal.is_visible():
            raise Exception("Modal Cấu hình Thuế không mở!")
        print("  ✓ Modal Cấu hình Thuế & Hộ kinh doanh mở thành công.")

        # Test selecting different options
        service_opt = page.locator("#taxIndustrySelect")
        service_opt.select_option("service")
        time.sleep(0.3)
        vat_val = page.locator("#taxVatRate").input_value()
        pit_val = page.locator("#taxPitRate").input_value()
        print(f"  ✓ Đã đổi sang Dịch vụ: VAT={vat_val}%, TNCN={pit_val}%")

        # Switch back to Retail 1.5%
        service_opt.select_option("retail")
        time.sleep(0.3)
        page.locator("#taxCodeInput").fill("0123456789-001")
        page.locator("#taxBizNameInput").fill("Hộ KD Tạp Hóa QBiz")
        
        # Save settings
        save_btn = page.locator("#modalSubmit")
        save_btn.click()
        time.sleep(0.8)
        print("  ✓ Đã lưu cấu hình Thuế thành công.")

        # Verify persisted tax settings in JS
        tax_stored = page.evaluate("() => window.getTaxSettings()")
        print(f"  ✓ Tax settings stored: biz_type={tax_stored.get('business_type')}, vat={tax_stored.get('vat_rate')}%, ecom={tax_stored.get('ecommerce_auto_deduct')}")
        assert tax_stored.get("business_type") == "hkd"
        assert tax_stored.get("tax_code") == "0123456789-001"

        print("[3/7] Checking POS Checkout Channel Selector...")
        page.evaluate("() => window.navigate('sales')")
        time.sleep(0.5)

        # Add first product to cart if cart is empty
        cart_count = page.evaluate("() => (window.state.saleCart || []).length")
        if cart_count == 0:
            add_btn = page.locator("[data-sale-add]").first
            if add_btn.is_visible():
                add_btn.click()
                time.sleep(0.3)

        # Open checkout
        page.evaluate("() => { window.state.saleStep = 'checkout'; window.render(); }")
        time.sleep(0.5)

        # Verify channel button on header row
        channel_btn = page.locator('[data-action="channel-picker"]')
        if not channel_btn.is_visible():
            raise Exception("Nút chọn kênh bán [data-action='channel-picker'] không hiển thị trên checkout header!")
        channel_btn.click()
        time.sleep(0.4)

        # Verify channel modal
        modal_ch = page.locator("#modalRoot .channel-picker-list")
        if not modal_ch.is_visible():
            raise Exception("Modal chọn kênh bán không mở!")
        page.screenshot(path="tests/evidence/channel_picker_modal_mobile.png")
        print("  ✓ Screenshot saved: tests/evidence/channel_picker_modal_mobile.png")
        
        # Select Shopee
        shopee_opt = page.locator('[data-select-channel="shopee"]')
        shopee_opt.click()
        time.sleep(0.3)
        current_ch = page.evaluate("() => window.state.saleDraft.channel")
        print(f"  ✓ Đã chọn kênh bán Shopee từ modal: channel={current_ch}")
        assert current_ch == "shopee"

        # Open channel modal again and select POS (Tại quầy)
        channel_btn = page.locator('[data-action="channel-picker"]')
        channel_btn.click()
        time.sleep(0.4)
        pos_opt = page.locator('[data-select-channel="pos"]')
        pos_opt.click()
        time.sleep(0.3)
        current_ch = page.evaluate("() => window.state.saleDraft.channel")
        print(f"  ✓ Đã chọn lại kênh tại quầy từ modal: channel={current_ch}")
        assert current_ch == "pos"

        print("[4/7] Checking Reports -> Nghĩa vụ thuế & Lợi nhuận sau thuế...")
        page.evaluate("() => window.navigate('reports')")
        time.sleep(0.5)

        tax_panel = page.locator(".tax-profit-panel")
        if not tax_panel.is_visible():
            raise Exception("Khối .tax-profit-panel không hiển thị trên trang Báo cáo!")
        print("  ✓ Khối Nghĩa vụ thuế & Lợi nhuận sau thuế hiển thị rõ ràng trên Báo cáo.")

        tax_panel.scroll_into_view_if_needed()
        time.sleep(0.3)
        page.screenshot(path="tests/evidence/tax_report_overview_desktop.png")
        print("  ✓ Screenshot saved: tests/evidence/tax_report_overview_desktop.png")

        # Test clicking 'Cài đặt thuế' from reports panel
        report_tax_config_btn = page.locator('.tax-profit-panel [data-action="tax-preferences"]')
        if not report_tax_config_btn.is_visible():
            raise Exception("Nút Cài đặt thuế trong thẻ Báo cáo không hiển thị!")
        report_tax_config_btn.click()
        time.sleep(0.5)
        if not page.locator("#modalRoot .tax-settings-sheet").is_visible():
            raise Exception("Nút Cài đặt thuế từ Báo cáo không mở được modal!")
        print("  ✓ Nút Cài đặt thuế trên Báo cáo mở trực tiếp Modal thiết lập thành công.")
        page.locator("#modalRoot [data-close], #modalRoot .close-btn").first.click()
        time.sleep(0.3)

        print("[5/7] Mobile Viewport QA (390x844 - iPhone 13)...")
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.5)

        # Check horizontal overflow on Mobile Reports
        overflow = page.evaluate("""() => {
            return {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                isOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        }""")
        print(f"  Mobile Reports scrollWidth={overflow['scrollWidth']}, clientWidth={overflow['clientWidth']}, isOverflow={overflow['isOverflow']}")
        assert not overflow["isOverflow"], "Phát hiện tràn ngang trên mobile!"

        tax_panel.scroll_into_view_if_needed()
        time.sleep(0.3)
        page.screenshot(path="tests/evidence/tax_report_overview_mobile.png")
        print("  ✓ Screenshot saved: tests/evidence/tax_report_overview_mobile.png")

        # Mobile Modal Test
        page.evaluate("() => window.openTaxPreferencesModal()")
        time.sleep(0.5)
        modal_overflow = page.evaluate("""() => {
            const m = document.querySelector('#modalRoot .modal-dialog, #modalRoot .tax-settings-sheet');
            return {
                dialogWidth: m ? m.clientWidth : 0,
                pageWidth: document.documentElement.clientWidth,
                isOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        }""")
        print(f"  Mobile Modal dialogWidth={modal_overflow['dialogWidth']}, isOverflow={modal_overflow['isOverflow']}")
        assert not modal_overflow["isOverflow"], "Modal bị tràn ngang trên mobile!"
        page.screenshot(path="tests/evidence/tax_settings_modal_mobile.png")
        print("  ✓ Screenshot saved: tests/evidence/tax_settings_modal_mobile.png")

        page.locator("#modalRoot [data-close], #modalRoot .close-btn").first.click()
        time.sleep(0.3)

        # Mobile POS Checkout Channel Chips
        page.evaluate("() => { window.navigate('sales'); window.state.saleStep = 'checkout'; window.render(); }")
        time.sleep(0.5)
        pos_overflow = page.evaluate("""() => {
            return {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                isOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        }""")
        assert not pos_overflow["isOverflow"], "Trang Checkout bị tràn ngang trên mobile!"
        page.screenshot(path="tests/evidence/pos_channel_checkout_mobile.png")
        print("  ✓ Screenshot saved: tests/evidence/pos_channel_checkout_mobile.png")

        print("[6/7] Checking Console Errors...")
        filtered_errors = [e for e in console_errors if "favicon" not in e.lower() and "manifest" not in e.lower()]
        if filtered_errors:
            print(f"  ⚠️ Console errors detected: {filtered_errors}")
            raise Exception(f"Console errors detected: {filtered_errors}")
        else:
            print("  ✓ 0 Console errors detected across all workflows.")

        print("[7/7] ALL TESTS PASSED SUCCESSFULLY! 🎉")
        browser.close()

if __name__ == "__main__":
    test_tax_and_profit()
