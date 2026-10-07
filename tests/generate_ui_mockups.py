# -*- coding: utf-8 -*-
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"
APP_DIR = r"D:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\app"

def get_css():
    css_path = os.path.join(APP_DIR, "styles.css")
    with open(css_path, "r", encoding="utf-8") as f:
        return f.read()

def generate_mockups():
    css = get_css()
    extra_css = """
    /* Sleek Ultra-Compact QBiz Native Mockup Styles */
    .mockup-body {
        margin: 0;
        padding: 0;
        background: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #0f172a;
        -webkit-font-smoothing: antialiased;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
    }
    .mockup-mobile-frame {
        width: 390px;
        min-height: 844px;
        max-height: 844px;
        background: #ffffff;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
    }
    .mockup-status-bar {
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        font-size: 13px;
        font-weight: 600;
        color: #0f172a;
        flex-shrink: 0;
    }
    .mockup-content {
        flex: 1;
        overflow-y: auto;
        padding: 6px 12px 16px;
    }
    .sleek-cart-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0 8px;
    }
    .sleek-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .sleek-dv-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #0284c7;
        color: #ffffff;
        border: none;
        border-radius: 6px;
        padding: 5px 9px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        line-height: 1;
    }
    .sleek-dv-btn:hover {
        background: #0369a1;
    }
    .sleek-warranty-tag {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: #f1f5f9;
        color: #0369a1;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
    }
    .sleek-checkout-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        margin-top: 6px;
        border-radius: 9px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
    }
    .sleek-checkout-row > span {
        font-size: 12.5px;
        font-weight: 600;
        color: #475569;
        white-space: nowrap;
    }
    .sleek-checkout-row select {
        min-height: 32px;
        padding: 4px 8px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #ffffff;
        font-size: 12.5px;
        font-weight: 600;
        color: #0f172a;
        max-width: 200px;
    }
    .sleek-segmented-warranty {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px;
        margin-top: 4px;
    }
    .sleek-segmented-warranty button {
        padding: 6px 2px;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        border-radius: 6px;
        color: #334155;
        cursor: pointer;
    }
    .sleek-segmented-warranty button.active {
        background: #0284c7;
        border-color: #0284c7;
        color: #ffffff;
        font-weight: 700;
    }
    """

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()

        # =========================================================================
        # MOCKUP 1: Giỏ hàng Tinh Gọn (Cart V2 - Sleek, No clutter)
        # =========================================================================
        html_cart = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Giỏ Hàng Tinh Gọn</title>
            <style>
            {css}
            {extra_css}
            </style>
        </head>
        <body class="mockup-body" data-sale-step="cart">
            <div class="mockup-mobile-frame">
                <!-- Top Status Bar -->
                <div class="mockup-status-bar">
                    <span>9:41</span>
                    <span>●●● 5G 100%</span>
                </div>

                <!-- Navigation Header with Sleek + DV Button -->
                <header style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:18px;font-weight:bold;cursor:pointer">‹</span>
                        <h2 style="font-size:16px;margin:0;font-weight:800;color:#0f172a">Giỏ hàng</h2>
                        <span style="font-size:11px;background:#f1f5f9;color:#64748b;padding:2px 7px;border-radius:10px;font-weight:600">2 món</span>
                    </div>
                    <!-- Sleek Native + DV Trigger -->
                    <button type="button" class="sleek-dv-btn" title="Thêm dịch vụ & công thợ">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                        <span>+ DV</span>
                    </button>
                </header>

                <div class="mockup-content">
                    <!-- Customer Selector -->
                    <button class="customer-chip" style="width:100%;margin:4px 0 8px;min-height:38px;padding:4px 10px">
                        <span style="text-align:left">
                            <small style="font-size:10.5px">Khách hàng</small>
                            <b style="font-size:13px">Nguyễn Văn Hùng · 0912.345.678</b>
                        </span>
                        <span>›</span>
                    </button>

                    <!-- Cart List -->
                    <div class="cart-list">
                        <!-- Item 1: Sneaker with Inline Warranty Tag -->
                        <article class="cart-row" style="padding:6px 0">
                            <div class="pos-product-image" style="background:#f8fafc;color:#64748b;display:flex;align-items:center;justify-content:center;font-size:22px;border-radius:8px;width:54px;height:54px">
                                👟
                            </div>
                            <div class="cart-row-main">
                                <div class="cart-row-title">
                                    <div class="cart-name-group">
                                        <strong style="font-size:13.5px">Giày Sneaker Retro Classic</strong>
                                        <span class="sleek-warranty-tag" title="Bấm để chỉnh bảo hành">BH: 6 tháng ▾</span>
                                    </div>
                                    <button class="cart-remove-btn" style="width:24px;height:24px">×</button>
                                </div>

                                <div class="cart-row-bottom" style="margin-top:6px">
                                    <div class="cart-controls-group">
                                        <div class="quantity-control" style="grid-template-columns:26px 28px 26px;height:28px">
                                            <button>−</button>
                                            <input type="number" value="1"/>
                                            <button>+</button>
                                        </div>
                                        <button class="line-discount-trigger" style="font-size:11px">Giảm giá ›</button>
                                    </div>
                                    <div class="sale-price-group">
                                        <strong class="line-total-price" style="font-size:14px">650.000 ₫</strong>
                                    </div>
                                </div>
                            </div>
                        </article>

                        <!-- Item 2: Quick Service Item -->
                        <article class="cart-row" style="padding:6px 0">
                            <div class="pos-product-image" style="background:#f0f9ff;color:#0284c7;display:flex;align-items:center;justify-content:center;font-size:22px;border-radius:8px;width:54px;height:54px">
                                ✨
                            </div>
                            <div class="cart-row-main">
                                <div class="cart-row-title">
                                    <div class="cart-name-group">
                                        <strong style="font-size:13.5px">Vệ sinh & Spa giày</strong>
                                        <small class="cart-sku-badge" style="background:#e0f2fe;color:#0369a1">Dịch vụ</small>
                                    </div>
                                    <button class="cart-remove-btn" style="width:24px;height:24px">×</button>
                                </div>

                                <div class="cart-row-bottom" style="margin-top:6px">
                                    <div class="cart-controls-group">
                                        <div class="quantity-control" style="grid-template-columns:26px 28px 26px;height:28px">
                                            <button>−</button>
                                            <input type="number" value="1"/>
                                            <button>+</button>
                                        </div>
                                        <button class="line-discount-trigger" style="font-size:11px">Giảm giá ›</button>
                                    </div>
                                    <div class="sale-price-group">
                                        <strong class="line-total-price" style="font-size:14px">100.000 ₫</strong>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>

                    <!-- Discount Section -->
                    <div class="order-options-open" style="margin-top:10px">
                        <div class="discount-box">
                            <div class="discount-box-head">
                                <strong style="font-size:12.5px">Giảm giá đơn hàng</strong>
                            </div>
                            <div class="discount-control">
                                <input type="number" placeholder="0" value="0" style="height:34px"/>
                                <button type="button" class="discount-mode active" style="height:34px">₫</button>
                                <button type="button" class="discount-mode" style="height:34px">%</button>
                            </div>
                        </div>
                    </div>

                    <!-- Totals -->
                    <div class="cart-totals" style="margin-top:10px">
                        <div><span style="font-size:12.5px">Tạm tính (2 món)</span><b>750.000 ₫</b></div>
                        <div class="grand" style="border-top:1px dashed #cbd5e1;padding-top:6px">
                            <span style="font-size:14px">Tổng cộng</span>
                            <b style="color:#0284c7;font-size:19px">750.000 ₫</b>
                        </div>
                    </div>
                </div>

                <!-- Footer Checkout Button -->
                <div style="padding: 10px 12px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid #e2e8f0; background: #fff">
                    <button class="primary-btn" style="width:100%;height:44px;font-size:15px;font-weight:700;border-radius:10px;background:#0284c7;color:#fff;border:none">
                        Tiếp tục thanh toán · 750.000 ₫
                    </button>
                </div>
            </div>
        </body>
        </html>
        """
        page.set_content(html_cart)
        page.wait_for_timeout(500)
        ss1 = os.path.join(ARTIFACT_DIR, "evidence_mockup_cart_v2_sleek.png")
        page.screenshot(path=ss1)
        print(f"[OK] Generated: {ss1}")

        # =========================================================================
        # MOCKUP 2: Màn hình Thanh toán Tinh Gọn (Checkout V2 - Matches Native Form)
        # =========================================================================
        html_checkout = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Thanh Toán Tinh Gọn</title>
            <style>
            {css}
            {extra_css}
            </style>
        </head>
        <body class="mockup-body" data-sale-step="checkout">
            <div class="mockup-mobile-frame">
                <!-- Status Bar -->
                <div class="mockup-status-bar">
                    <span>9:42</span>
                    <span>●●● 5G 100%</span>
                </div>

                <!-- Navigation Header -->
                <header style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:18px;font-weight:bold;cursor:pointer">‹</span>
                        <h2 style="font-size:16px;margin:0;font-weight:800;color:#0f172a">Thanh toán</h2>
                    </div>
                    <!-- Quick + DV button on Checkout -->
                    <button type="button" class="sleek-dv-btn" title="Thêm dịch vụ / phụ phí nhanh">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                        <span>+ DV</span>
                    </button>
                </header>

                <div class="mockup-content">
                    <!-- Customer & Channel -->
                    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:6px;margin:4px 0 6px">
                        <button class="customer-chip" style="margin:0;padding:5px 8px;min-height:36px">
                            <span style="text-align:left"><small style="font-size:10px">Khách hàng</small><b style="font-size:12px">Nguyễn Văn Hùng</b></span>
                        </button>
                        <button class="customer-chip" style="margin:0;padding:5px 8px;min-height:36px">
                            <span style="text-align:left"><small style="font-size:10px">Kênh bán</small><b style="font-size:12px">Tại quầy</b></span>
                        </button>
                    </div>

                    <!-- Total box -->
                    <div class="checkout-total" style="background:#f8fafc;padding:10px 12px;border-radius:10px;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
                        <span style="font-size:13px;color:#64748b">Tổng thanh toán (2 món)</span>
                        <strong style="font-size:20px;color:#0f172a;font-weight:800">750.000 ₫</strong>
                    </div>

                    <!-- Payment methods -->
                    <div class="choice-section" style="margin:8px 0 6px">
                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px">
                            <button class="choice-row active" style="padding:6px 2px;font-weight:700;background:#eaf3ff;border:1.5px solid #0284c7;color:#0369a1;border-radius:8px;font-size:12.5px;min-height:36px">Tiền mặt</button>
                            <button class="choice-row" style="padding:6px 2px;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;color:#334155;min-height:36px">Chuyển khoản</button>
                            <button class="choice-row" style="padding:6px 2px;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;color:#334155;min-height:36px">Mã VietQR</button>
                        </div>
                    </div>

                    <!-- Cash received -->
                    <div style="background:#f8fafc;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:6px">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <span style="font-size:12px;color:#64748b">Khách đưa:</span>
                            <b style="font-size:14px;color:#0f172a">1.000.000 ₫</b>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
                            <span style="font-size:12px;color:#64748b">Tiền thừa:</span>
                            <b style="font-size:14px;color:#16a34a">250.000 ₫</b>
                        </div>
                    </div>

                    <!-- PROPOSED COMPACT ROW 1: Warranty / Policy for Receipt -->
                    <div class="sleek-checkout-row">
                        <span>Chính sách in bill</span>
                        <select>
                            <option selected>✓ Đổi size trong 7 ngày</option>
                            <option>✓ BH keo chỉ 6 tháng</option>
                            <option>✓ BH chính hãng 12 tháng</option>
                            <option>Không áp dụng đổi trả</option>
                        </select>
                    </div>

                    <!-- PROPOSED COMPACT ROW 2: Return Date / Appointment (Optional) -->
                    <div class="sleek-checkout-row">
                        <span>Hẹn trả đồ / khách</span>
                        <select>
                            <option selected>Lấy ngay tại quầy</option>
                            <option>Hẹn chiều nay (17:00)</option>
                            <option>Hẹn ngày mai (10:00)</option>
                            <option>Tùy chỉnh ngày giờ...</option>
                        </select>
                    </div>

                    <!-- Ghi chú đơn hàng -->
                    <div class="sleek-checkout-row">
                        <span>Ghi chú đơn</span>
                        <input placeholder="Nhập ghi chú (nếu có)..." style="border:1px solid #cbd5e1;border-radius:7px;height:32px;padding:0 8px;font-size:12px;flex:1;max-width:200px"/>
                    </div>

                    <!-- VAT -->
                    <div class="sleek-checkout-row">
                        <span>Thuế/VAT</span>
                        <span style="font-size:12.5px;color:#64748b">Không VAT (0 ₫)</span>
                    </div>
                </div>

                <!-- Submit Button -->
                <div style="padding: 10px 12px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid #e2e8f0; background: #fff">
                    <button class="primary-btn" style="width:100%;height:44px;font-size:15px;font-weight:700;border-radius:10px;background:#16a34a;color:#fff;border:none">
                        Thu tiền mặt · 750.000 ₫
                    </button>
                </div>
            </div>
        </body>
        </html>
        """
        page.set_content(html_checkout)
        page.wait_for_timeout(500)
        ss2 = os.path.join(ARTIFACT_DIR, "evidence_mockup_checkout_v2_sleek.png")
        page.screenshot(path=ss2)
        print(f"[OK] Generated: {ss2}")

        # =========================================================================
        # MOCKUP 3: Cài đặt Bảo hành trong Sửa Sản Phẩm (Form Edit V2 - Ultra Clean)
        # =========================================================================
        html_product = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sửa Sản Phẩm Tinh Gọn</title>
            <style>
            {css}
            {extra_css}
            </style>
        </head>
        <body class="mockup-body">
            <div class="mockup-mobile-frame" style="background:rgba(0,0,0,0.45);display:flex;align-items:flex-end">
                <div class="modal" style="width:100%;background:#fff;border-radius:14px 14px 0 0;max-height:90vh;display:flex;flex-direction:column">
                    <!-- Modal Header -->
                    <div class="modal-head" style="padding:12px 14px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <h3 style="margin:0;font-size:15px;font-weight:800;color:#0f172a">Sửa thông tin sản phẩm</h3>
                            <p style="margin:1px 0 0;font-size:11.5px;color:#64748b">Cài đặt giá, kho và bảo hành</p>
                        </div>
                        <button class="close-btn" style="border:none;background:#f1f5f9;width:28px;height:28px;border-radius:50%;font-size:15px">×</button>
                    </div>

                    <div class="modal-body" style="padding:12px 14px;overflow-y:auto;flex:1">
                        <div class="form-grid edit-primary-grid" style="display:grid;gap:8px">
                            <div class="field">
                                <label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Tên sản phẩm</label>
                                <input value="Giày Sneaker Retro Classic" style="width:100%;box-sizing:border-box;height:36px;border:1px solid #cbd5e1;border-radius:7px;padding:0 10px;font-size:13px"/>
                            </div>

                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                                <div class="field">
                                    <label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Giá bán (₫)</label>
                                    <input value="650000" style="width:100%;box-sizing:border-box;height:36px;border:1px solid #cbd5e1;border-radius:7px;padding:0 10px;font-size:13px;font-weight:700"/>
                                </div>
                                <div class="field">
                                    <label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Mã SKU</label>
                                    <input value="GI-01" readonly style="width:100%;box-sizing:border-box;height:36px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:7px;padding:0 10px;font-size:12.5px;color:#64748b"/>
                                </div>
                            </div>

                            <!-- PROPOSED COMPACT WARRANTY SECTION -->
                            <div style="padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                                    <span style="font-size:12px;font-weight:700;color:#334155">Bảo hành mặc định</span>
                                    <small style="font-size:10.5px;color:#64748b">Áp dụng khi bán</small>
                                </div>
                                <div class="sleek-segmented-warranty">
                                    <button type="button">K.BH</button>
                                    <button type="button">1 th</button>
                                    <button type="button">3 th</button>
                                    <button type="button" class="active">6 th</button>
                                    <button type="button">12 th</button>
                                </div>
                                <input value="Bảo hành keo & chỉ may 6 tháng" placeholder="Chính sách bảo hành in bill..." style="width:100%;box-sizing:border-box;height:32px;border:1px solid #cbd5e1;border-radius:6px;padding:0 8px;font-size:11.5px;margin-top:6px"/>
                            </div>

                            <div class="field">
                                <label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Mô tả tóm tắt</label>
                                <textarea style="width:100%;box-sizing:border-box;height:50px;border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;font-size:11.5px">Chất liệu da PU cao cấp, đế cao su lưu hóa bền bỉ...</textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Modal Foot -->
                    <div class="modal-foot" style="padding:8px 14px;border-top:1px solid #e2e8f0;display:flex;gap:8px">
                        <button class="secondary-btn" style="flex:1;height:38px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;font-weight:600;font-size:13px">Đóng</button>
                        <button class="primary-btn" style="flex:2;height:38px;background:#0284c7;color:#fff;border:none;border-radius:7px;font-weight:700;font-size:13px">Lưu thay đổi</button>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        page.set_content(html_product)
        page.wait_for_timeout(500)
        ss3 = os.path.join(ARTIFACT_DIR, "evidence_mockup_product_v2_sleek.png")
        page.screenshot(path=ss3)
        print(f"[OK] Generated: {ss3}")

        browser.close()
        print("\nALL 3 V2 MOCKUPS GENERATED!")

if __name__ == "__main__":
    generate_mockups()
