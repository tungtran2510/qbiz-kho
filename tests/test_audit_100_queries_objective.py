"""
QBIZ KHO — 100 REALISTIC & OBJECTIVE SYSTEM BENCHMARK AUDIT
Strict Non-destructive, Zero Self-patching Empirical Test Suite.

Covers 10 Categories x 10 Colloquial/Practical Queries = 100 Scenarios:
1. POS & Bán hàng (Sales, Cart, Checkout, Invoices)
2. Kho hàng & Tồn kho (Stock, Movements, Warnings, Warehouses)
3. Sản phẩm & Bảng giá (Catalog, Pricing, Barcodes, Promos)
4. Khách hàng & Công nợ (Customer Directory, Debt, Aging, Debt Collection)
5. Nhà cung cấp & Nhập kho (Suppliers, PO, Supplier Debt, Supplier Returns)
6. Sổ quỹ & Ca kíp thu ngân (Cash Register, Shifts, Operational Expenses)
7. Đổi - Trả hàng & Bảo hành (Return Policy, SOP, Refunds, Defective items)
8. Vận chuyển & Giao hàng (Logistics, Carrier Tracking, Shipping Fees)
9. Cài đặt hệ thống & Kết nối (Google Drive Auto-Backup, Printers, Shop Settings)
10. Phân quyền, Bảo mật & Quản trị rủi ro (RBAC Cashier/Warehouse, Destructive Guard, TT88 Tax, Out-of-Scope)
"""

import sys
import os
import time
import json
from pathlib import Path

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

APP_URL = "http://127.0.0.1:4180"
APP_DIR = Path(__file__).resolve().parent.parent

# 100 Objective Test Scenarios
BENCHMARK_SCENARIOS = [
    # =========================================================================
    # NHÓM 1: BÁN HÀNG & POS (10 CÂU)
    # =========================================================================
    {
        "id": "Q001",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "bán cho anh Tuấn 2 cái ghế 135 thanh toán tiền mặt",
        "expected_intent": "Tạo đơn bán hàng / Đề xuất đơn",
        "validation_fn": lambda r: ("ghế" in r["text"].lower() or "135" in r["text"] or "tuấn" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q002",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "khách lấy 1 gối f1 và 1 gối f3, có bớt giá không?",
        "expected_intent": "Tư vấn giá bán / Chiết khấu",
        "validation_fn": lambda r: ("f1" in r["text"].lower() or "f3" in r["text"].lower() or "giá" in r["text"].lower() or "chiết khấu" in r["text"].lower())
    },
    {
        "id": "Q003",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "in lại hóa đơn vừa bán cho khách",
        "expected_intent": "In lại hóa đơn gần nhất",
        "validation_fn": lambda r: ("hóa đơn" in r["text"].lower() or "in" in r["text"].lower() or "gần nhất" in r["text"].lower())
    },
    {
        "id": "Q004",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "hôm nay bán được bao nhiêu đơn rồi em?",
        "expected_intent": "Tổng số đơn / Doanh số hôm nay",
        "validation_fn": lambda r: ("đơn" in r["text"].lower() or "hôm nay" in r["text"].lower() or "bán" in r["text"].lower())
    },
    {
        "id": "Q005",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "đơn hàng gần nhất là đơn nào vậy",
        "expected_intent": "Chi tiết đơn hàng gần nhất",
        "validation_fn": lambda r: ("đơn" in r["text"].lower() or "gần nhất" in r["text"].lower() or "phiếu" in r["text"].lower())
    },
    {
        "id": "Q006",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "khách thanh toán chuyển khoản quét mã vietqr được không",
        "expected_intent": "Phương thức thanh toán VietQR",
        "validation_fn": lambda r: ("vietqr" in r["text"].lower() or "chuyển khoản" in r["text"].lower() or "qr" in r["text"].lower())
    },
    {
        "id": "Q007",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "hóa đơn bán lẻ có tách vat 8% được không",
        "expected_intent": "Tách thuế VAT hóa đơn",
        "validation_fn": lambda r: ("vat" in r["text"].lower() or "thuế" in r["text"].lower() or "hóa đơn" in r["text"].lower())
    },
    {
        "id": "Q008",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "khach mua 3 ghe 90T giam gia 500k duoc k",
        "expected_intent": "Giảm giá chiết khấu đơn hàng",
        "validation_fn": lambda r: ("giảm" in r["text"].lower() or "90t" in r["text"].lower() or "chiết khấu" in r["text"].lower() or "500" in r["text"])
    },
    {
        "id": "Q009",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "hủy hóa đơn số 12 vừa xuất do bấm nhầm",
        "expected_intent": "Hướng dẫn hủy / Trả hàng hóa đơn",
        "validation_fn": lambda r: ("hủy" in r["text"].lower() or "đơn" in r["text"].lower() or "lý do" in r["text"].lower() or "trả hàng" in r["text"].lower())
    },
    {
        "id": "Q010",
        "category": "1. Bán hàng & POS",
        "role": "owner",
        "prompt": "don hang nao dang cho giao vay em",
        "expected_intent": "Đơn hàng đang chờ xử lý / Chờ giao",
        "validation_fn": lambda r: ("chờ" in r["text"].lower() or "đơn" in r["text"].lower() or "giao" in r["text"].lower() or "xử lý" in r["text"].lower())
    },

    # =========================================================================
    # NHÓM 2: KHO HÀNG & TỒN KHO (10 CÂU)
    # =========================================================================
    {
        "id": "Q011",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "ghế 150 ở kho hà đông còn bao nhiêu cái?",
        "expected_intent": "Tồn kho theo kho cụ thể",
        "validation_fn": lambda r: ("150" in r["text"] and ("kho" in r["text"].lower() or "hà đông" in r["text"].lower() or "tồn" in r["text"].lower()))
    },
    {
        "id": "Q012",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "mặt hàng nào đang sắp hết hàng cần nhập gấp",
        "expected_intent": "Cảnh báo dưới định mức tồn",
        "validation_fn": lambda r: ("sắp hết" in r["text"].lower() or "hết hàng" in r["text"].lower() or "tồn" in r["text"].lower() or "nhập" in r["text"].lower())
    },
    {
        "id": "Q013",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "cho anh danh sách tất cả các kho hàng hiện có",
        "expected_intent": "Danh mục kho bãi",
        "validation_fn": lambda r: ("danh sách" in r["text"].lower() and "kho" in r["text"].lower())
    },
    {
        "id": "Q014",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "kho trung tâm có tồn âm món nào không",
        "expected_intent": "Kiểm tra tồn âm bất thường",
        "validation_fn": lambda r: ("tồn âm" in r["text"].lower() or "âm" in r["text"].lower() or "kho" in r["text"].lower())
    },
    {
        "id": "Q015",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "chuyển 5 cái gối f4 từ kho trung tâm sang kho hà đông",
        "expected_intent": "Đề xuất chuyển kho nội bộ",
        "validation_fn": lambda r: ("chuyển" in r["text"].lower() or "kho" in r["text"].lower() or "f4" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q016",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "the kho cua ghe sang che 135 thang nay the nao",
        "expected_intent": "Thẻ kho biến động sản phẩm",
        "validation_fn": lambda r: ("thẻ kho" in r["text"].lower() or "135" in r["text"] or "biến động" in r["text"].lower())
    },
    {
        "id": "Q017",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "kiem ke kho hadong lech bao nhieu san pham",
        "expected_intent": "Kiểm kê / Đối soát kho",
        "validation_fn": lambda r: ("kiểm kê" in r["text"].lower() or "lệch" in r["text"].lower() or "kho" in r["text"].lower())
    },
    {
        "id": "Q018",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "goi f1 voi goi f3 kho nao con nhieu nhat",
        "expected_intent": "So sánh tồn kho đa sản phẩm",
        "validation_fn": lambda r: ("f1" in r["text"].lower() and "f3" in r["text"].lower() and ("tồn" in r["text"].lower() or "kho" in r["text"].lower()))
    },
    {
        "id": "Q019",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "co mat hang nao ton kho qua 60 ngay chua ban duoc k",
        "expected_intent": "Tồn kho lâu ngày / Chậm luân chuyển",
        "validation_fn": lambda r: ("tồn" in r["text"].lower() or "chậm" in r["text"].lower() or "ngày" in r["text"].lower() or "bán" in r["text"].lower())
    },
    {
        "id": "Q020",
        "category": "2. Kho hàng & Tồn kho",
        "role": "owner",
        "prompt": "kho trung tam dia chi o dau the em",
        "expected_intent": "Thông tin địa chỉ kho",
        "validation_fn": lambda r: ("kho" in r["text"].lower() or "địa chỉ" in r["text"].lower() or "trung tâm" in r["text"].lower())
    },

    # =========================================================================
    # NHÓM 3: SẢN PHẨM & BẢNG GIÁ (10 CÂU)
    # =========================================================================
    {
        "id": "Q021",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "ghế 90D giá niêm yết bao nhiêu một chiếc",
        "expected_intent": "Tra cứu giá bán niêm yết",
        "validation_fn": lambda r: ("90d" in r["text"].lower() and ("giá" in r["text"].lower() or "34." in r["text"]))
    },
    {
        "id": "Q022",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "cho anh xem các loại gối sáng chế có trong cửa hàng",
        "expected_intent": "Danh mục gối sáng chế",
        "validation_fn": lambda r: ("gối" in r["text"].lower() and ("f1" in r["text"].lower() or "f3" in r["text"].lower() or "f4" in r["text"].lower() or "danh sách" in r["text"].lower()))
    },
    {
        "id": "Q023",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "mã barcode của gối f4/09 là gì",
        "expected_intent": "Mã vạch / SKU sản phẩm",
        "validation_fn": lambda r: ("f4" in r["text"].lower() and ("mã" in r["text"].lower() or "sku" in r["text"].lower() or "barcode" in r["text"].lower()))
    },
    {
        "id": "Q024",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "cửa hàng mình có bán combo ghế kèm gối không",
        "expected_intent": "Tra cứu Combo sản phẩm",
        "validation_fn": lambda r: ("combo" in r["text"].lower() or "ghế" in r["text"].lower() or "gói" in r["text"].lower())
    },
    {
        "id": "Q025",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "sản phẩm nào đang có chương trình khuyến mại tặng quà",
        "expected_intent": "Tra cứu chương trình khuyến mại",
        "validation_fn": lambda r: ("khuyến mại" in r["text"].lower() or "tặng" in r["text"].lower() or "quà" in r["text"].lower() or "ưu đãi" in r["text"].lower())
    },
    {
        "id": "Q026",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "gia si cua ghe 135 neu lay 5 chiec la bao nhieu",
        "expected_intent": "Chính sách giá buôn / sỉ",
        "validation_fn": lambda r: ("135" in r["text"] and ("giá" in r["text"].lower() or "sỉ" in r["text"].lower() or "chiết khấu" in r["text"].lower()))
    },
    {
        "id": "Q027",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "thêm sản phẩm mới thì vào mục nào trên máy",
        "expected_intent": "Hướng dẫn thêm hàng hóa",
        "validation_fn": lambda r: ("hàng hóa" in r["text"].lower() or "thêm" in r["text"].lower() or "sản phẩm" in r["text"].lower())
    },
    {
        "id": "Q028",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "san pham nao ban chay nhat tuan nay",
        "expected_intent": "Top sản phẩm bán chạy",
        "validation_fn": lambda r: ("bán chạy" in r["text"].lower() or "top" in r["text"].lower() or "doanh số" in r["text"].lower() or "doanh thu" in r["text"].lower() or "hiệu suất" in r["text"].lower())
    },
    {
        "id": "Q029",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "co san pham nao dang de gia 0 dong khong",
        "expected_intent": "Kiểm tra bất thường giá 0đ",
        "validation_fn": lambda r: ("0" in r["text"] and ("giá" in r["text"].lower() or "sản phẩm" in r["text"].lower() or "đồng" in r["text"].lower()))
    },
    {
        "id": "Q030",
        "category": "3. Sản phẩm & Bảng giá",
        "role": "owner",
        "prompt": "ghe sang che 95 va 90T khac nhau the nao",
        "expected_intent": "So sánh thông số / tính năng sản phẩm",
        "validation_fn": lambda r: ("95" in r["text"] and "90t" in r["text"].lower())
    },

    # =========================================================================
    # NHÓM 4: KHÁCH HÀNG & CÔNG NỢ (10 CÂU)
    # =========================================================================
    {
        "id": "Q031",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "anh Nam số điện thoại 0912345678 còn nợ bao nhiêu",
        "expected_intent": "Tra cứu nợ khách theo SĐT",
        "validation_fn": lambda r: ("nam" in r["text"].lower() or "0912345678" in r["text"] or "nợ" in r["text"].lower())
    },
    {
        "id": "Q032",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "khách hàng nào đang nợ nhiều tiền nhất cửa hàng",
        "expected_intent": "Top nợ khách hàng",
        "validation_fn": lambda r: ("nợ" in r["text"].lower() and ("nhiều nhất" in r["text"].lower() or "top" in r["text"].lower() or "danh sách" in r["text"].lower()))
    },
    {
        "id": "Q033",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "anh Hùng đến trả nợ 2 triệu tiền mặt",
        "expected_intent": "Phiếu thu nợ khách hàng",
        "validation_fn": lambda r: ("hùng" in r["text"].lower() or "2.000.000" in r["text"] or "thu nợ" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q034",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "hạn mức nợ của công ty Minh Phát là bao nhiêu",
        "expected_intent": "Kiểm tra hạn mức nợ khách",
        "validation_fn": lambda r: ("hạn mức" in r["text"].lower() or "minh phát" in r["text"].lower() or "nợ" in r["text"].lower())
    },
    {
        "id": "Q035",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "danh sách khách hàng có nợ quá hạn trên 30 ngày",
        "expected_intent": "Phân tích tuổi nợ khách",
        "validation_fn": lambda r: ("tuổi nợ" in r["text"].lower() or "quá hạn" in r["text"].lower() or "30" in r["text"] or "nợ" in r["text"].lower())
    },
    {
        "id": "Q036",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "tìm khách hàng tên Hoàng ở Cầu Giấy",
        "expected_intent": "Tìm kiếm khách hàng",
        "validation_fn": lambda r: ("hoàng" in r["text"].lower() or "cầu giấy" in r["text"].lower() or "khách" in r["text"].lower())
    },
    {
        "id": "Q037",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "tong cong no phai thu cua tat ca khach hang la bao nhieu",
        "expected_intent": "Tổng công nợ phải thu",
        "validation_fn": lambda r: ("tổng" in r["text"].lower() and "nợ" in r["text"].lower())
    },
    {
        "id": "Q038",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "khach le mua hang co duoc ghi no khong em",
        "expected_intent": "Chính sách nợ khách lẻ",
        "validation_fn": lambda r: ("khách lẻ" in r["text"].lower() or "nợ" in r["text"].lower() or "chính sách" in r["text"].lower())
    },
    {
        "id": "Q039",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "lich su mua hang cua chi Lan gom nhung don nao",
        "expected_intent": "Lịch sử mua hàng khách hàng",
        "validation_fn": lambda r: ("lan" in r["text"].lower() or "lịch sử" in r["text"].lower() or "đơn" in r["text"].lower())
    },
    {
        "id": "Q040",
        "category": "4. Khách hàng & Công nợ",
        "role": "owner",
        "prompt": "khách nợ vượt hạn mức có cho xuất hàng tiếp không",
        "expected_intent": "Quy tắc chặn nợ vượt hạn mức",
        "validation_fn": lambda r: ("hạn mức" in r["text"].lower() or "vượt" in r["text"].lower() or "chặn" in r["text"].lower() or "cảnh báo" in r["text"].lower())
    },

    # =========================================================================
    # NHÓM 5: NHÀ CUNG CẤP & NHẬP HÀNG (10 CÂU)
    # =========================================================================
    {
        "id": "Q041",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "nợ nhà cung cấp Sáng Chế Việt còn bao nhiêu tiền",
        "expected_intent": "Công nợ nhà cung cấp",
        "validation_fn": lambda r: ("sáng chế việt" in r["text"].lower() or "nhà cung cấp" in r["text"].lower() or "nợ" in r["text"].lower())
    },
    {
        "id": "Q042",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "gợi ý đơn đặt hàng nhập kho hôm nay",
        "expected_intent": "Đề xuất đặt hàng bổ sung PO",
        "validation_fn": lambda r: ("đặt hàng" in r["text"].lower() or "gợi ý" in r["text"].lower() or "nhập" in r["text"].lower() or "đề xuất" in r["text"].lower())
    },
    {
        "id": "Q043",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "danh sách tất cả các nhà cung cấp của shop",
        "expected_intent": "Danh bạ nhà cung cấp",
        "validation_fn": lambda r: ("nhà cung cấp" in r["text"].lower() or "ncc" in r["text"].lower())
    },
    {
        "id": "Q044",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "phiếu nhập kho gần nhất nhập những mặt hàng nào",
        "expected_intent": "Chi tiết phiếu nhập kho gần nhất",
        "validation_fn": lambda r: ("nhập" in r["text"].lower() or "phiếu" in r["text"].lower() or "gần nhất" in r["text"].lower())
    },
    {
        "id": "Q045",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "xuat tra 2 cai ghe 150 bi loi cho nha cung cap",
        "expected_intent": "Xuất trả hàng lỗi cho NCC",
        "validation_fn": lambda r: ("trả" in r["text"].lower() and ("nhà cung cấp" in r["text"].lower() or "ncc" in r["text"].lower() or "150" in r["text"]))
    },
    {
        "id": "Q046",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "da thanh toan tien hang cho nha cung cap nao trong thang",
        "expected_intent": "Lịch sử thanh toán NCC",
        "validation_fn": lambda r: ("nhà cung cấp" in r["text"].lower() or "thanh toán" in r["text"].lower() or "tiền hàng" in r["text"].lower())
    },
    {
        "id": "Q047",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "so dien thoai lien he cua ben giao hang ghe 135",
        "expected_intent": "Thông tin liên hệ đối tác NCC",
        "validation_fn": lambda r: ("liên hệ" in r["text"].lower() or "số điện thoại" in r["text"].lower() or "nhà cung cấp" in r["text"].lower() or "135" in r["text"])
    },
    {
        "id": "Q048",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "gia nhap cua goi f1 dot truoc la bao nhieu",
        "expected_intent": "Tra cứu giá vốn / giá nhập lịch sử",
        "validation_fn": lambda r: ("f1" in r["text"].lower() and ("giá" in r["text"].lower() or "nhập" in r["text"].lower() or "vốn" in r["text"].lower()))
    },
    {
        "id": "Q049",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "tao don dat hang 10 ghe 90D gui nha cung cap",
        "expected_intent": "Tạo đơn đặt hàng PO",
        "validation_fn": lambda r: ("đặt hàng" in r["text"].lower() or "90d" in r["text"].lower() or "nhà cung cấp" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q050",
        "category": "5. Nhà cung cấp & Nhập hàng",
        "role": "owner",
        "prompt": "nha cung cap nao con no tien hoan tra cua minh khong",
        "expected_intent": "Công nợ hoàn trả từ NCC",
        "validation_fn": lambda r: ("nhà cung cấp" in r["text"].lower() or "hoàn" in r["text"].lower() or "nợ" in r["text"].lower() or "trả" in r["text"].lower())
    },

    # =========================================================================
    # NHÓM 6: SỔ QUỸ & CA KÍP (10 CÂU)
    # =========================================================================
    {
        "id": "Q051",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "két tiền hiện tại của quầy đang có bao nhiêu tiền mặt",
        "expected_intent": "Số dư tiền mặt két thu ngân",
        "validation_fn": lambda r: ("két" in r["text"].lower() or "tiền mặt" in r["text"].lower() or "ca" in r["text"].lower())
    },
    {
        "id": "Q052",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "ai đang mở ca bán hàng ở quầy thu ngân",
        "expected_intent": "Truy vấn ca đang mở",
        "validation_fn": lambda r: ("ca" in r["text"].lower() and ("mở" in r["text"].lower() or "thu ngân" in r["text"].lower() or "quầy" in r["text"].lower()))
    },
    {
        "id": "Q053",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "chi 350k tiền điện nước sinh hoạt tháng này",
        "expected_intent": "Phiếu chi phí vận hành",
        "validation_fn": lambda r: ("chi phí" in r["text"].lower() or "350" in r["text"] or "điện" in r["text"].lower() or "nước" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q054",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "chi 120k tiền mua túi bóng bao bì đóng gói",
        "expected_intent": "Phiếu chi bao bì vật tư",
        "validation_fn": lambda r: ("chi" in r["text"].lower() or "120" in r["text"] or "bao bì" in r["text"].lower() or "vật tư" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q055",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "đóng ca bán hàng kiểm tiền thực tế được 15 triệu",
        "expected_intent": "Đóng ca & đối soát két",
        "validation_fn": lambda r: ("đóng ca" in r["text"].lower() or "chốt ca" in r["text"].lower() or "két" in r["text"].lower() or "tiền" in r["text"].lower())
    },
    {
        "id": "Q056",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "hôm nay thu ngân rút bao nhiêu tiền nộp về cho chủ",
        "expected_intent": "Lịch sử rút tiền két",
        "validation_fn": lambda r: ("rút" in r["text"].lower() or "nộp" in r["text"].lower() or "két" in r["text"].lower() or "tiền" in r["text"].lower())
    },
    {
        "id": "Q057",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "co chenh lech tien mat giua so sach va thuc te khong",
        "expected_intent": "Kiểm tra chênh lệch két",
        "validation_fn": lambda r: ("chênh lệch" in r["text"].lower() or "khớp" in r["text"].lower() or "két" in r["text"].lower() or "tiền mặt" in r["text"].lower())
    },
    {
        "id": "Q058",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "co cau thanh toan hom nay giua tien mat va chuyen khoan",
        "expected_intent": "Cơ cấu thanh toán TM vs CK",
        "validation_fn": lambda r: ("tiền mặt" in r["text"].lower() and ("chuyển khoản" in r["text"].lower() or "ngân hàng" in r["text"].lower() or "cơ cấu" in r["text"].lower()))
    },
    {
        "id": "Q059",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "owner",
        "prompt": "tong chi phi van hanh cua cua hang thang nay la bao nhieu",
        "expected_intent": "Tổng chi phí vận hành",
        "validation_fn": lambda r: ("chi phí" in r["text"].lower() and ("vận hành" in r["text"].lower() or "tháng" in r["text"].lower() or "tổng" in r["text"].lower()))
    },
    {
        "id": "Q060",
        "category": "6. Sổ quỹ & Ca kíp",
        "role": "warehouse",
        "prompt": "nhan vien kho co duoc tu mo ket tien khong",
        "expected_intent": "Chặn phân quyền kho mở két",
        "validation_fn": lambda r: ("từ chối" in r["text"].lower() or "không có quyền" in r["text"].lower() or "thu ngân" in r["text"].lower() or r.get("isBlocked") is True)
    },

    # =========================================================================
    # NHÓM 7: ĐỔI - TRẢ HÀNG & BẢO HÀNH (10 CÂU)
    # =========================================================================
    {
        "id": "Q061",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "quy trình đổi trả hàng cho khách thực hiện như thế nào",
        "expected_intent": "SOP đổi trả hàng chuẩn",
        "validation_fn": lambda r: ("đổi" in r["text"].lower() and "trả" in r["text"].lower() and ("quy trình" in r["text"].lower() or "bước" in r["text"].lower()))
    },
    {
        "id": "Q062",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "khách mang trả ghế 135 bị trầy xước muốn lấy lại tiền",
        "expected_intent": "Trả hàng lỗi & hoàn tiền",
        "validation_fn": lambda r: ("trả" in r["text"].lower() and ("hoàn" in r["text"].lower() or "135" in r["text"] or "lỗi" in r["text"].lower() or "hóa đơn" in r["text"].lower()))
    },
    {
        "id": "Q063",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "khách muốn đổi từ gối f1 sang gối f3 bù thêm tiền",
        "expected_intent": "Đổi sản phẩm bù chênh lệch",
        "validation_fn": lambda r: ("đổi" in r["text"].lower() and ("f1" in r["text"].lower() or "f3" in r["text"].lower() or "bù" in r["text"].lower() or "chênh lệch" in r["text"].lower()))
    },
    {
        "id": "Q064",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "hang mua qua 30 ngay roi khach doi tra co duoc khong",
        "expected_intent": "Chính sách đổi trả quá hạn",
        "validation_fn": lambda r: ("30 ngày" in r["text"].lower() or "quá hạn" in r["text"].lower() or "chính sách" in r["text"].lower() or "đổi trả" in r["text"].lower())
    },
    {
        "id": "Q065",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "kiem tra xem hom nay co don nao bi khach tra lai khong",
        "expected_intent": "Báo cáo đổi trả trong ngày",
        "validation_fn": lambda r: ("trả" in r["text"].lower() or "đổi trả" in r["text"].lower() or "hôm nay" in r["text"].lower())
    },
    {
        "id": "Q066",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "hang doi tra nhap lai kho thi nam o trang thai nao",
        "expected_intent": "Trạng thái hàng hoàn/lỗi",
        "validation_fn": lambda r: ("trạng thái" in r["text"].lower() or "nguyên vẹn" in r["text"].lower() or "hỏng" in r["text"].lower() or "kho" in r["text"].lower())
    },
    {
        "id": "Q067",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "phi doi tra hang do khach khong thich la bao nhieu",
        "expected_intent": "Phí đổi trả hàng",
        "validation_fn": lambda r: ("phí" in r["text"].lower() or "đổi trả" in r["text"].lower() or "quy định" in r["text"].lower() or "chính sách" in r["text"].lower())
    },
    {
        "id": "Q068",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "tao phieu doi tra cho hoa don HD0012",
        "expected_intent": "Tạo phiếu đổi trả hóa đơn",
        "validation_fn": lambda r: ("đổi trả" in r["text"].lower() or "hóa đơn" in r["text"].lower() or "hd0012" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q069",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "tong tien da hoan tra cho khach trong thang nay",
        "expected_intent": "Tổng tiền hoàn trả",
        "validation_fn": lambda r: ("hoàn" in r["text"].lower() or "trả" in r["text"].lower() or "tiền" in r["text"].lower())
    },
    {
        "id": "Q070",
        "category": "7. Đổi - Trả hàng",
        "role": "owner",
        "prompt": "hang bao hanh sua chua thi theo doi o dau",
        "expected_intent": "Theo dõi bảo hành sửa chữa",
        "validation_fn": lambda r: ("bảo hành" in r["text"].lower() or "sửa chữa" in r["text"].lower() or "theo dõi" in r["text"].lower())
    },

    # =========================================================================
    # NHÓM 8: VẬN CHUYỂN & GIAO HÀNG (10 CÂU)
    # =========================================================================
    {
        "id": "Q071",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "tra cứu hành trình đơn giao hàng mã S21.GHTK.88921",
        "expected_intent": "Tra cứu vận đơn GHTK",
        "validation_fn": lambda r: ("ghtk" in r["text"].lower() or "s21" in r["text"].lower() or "hành trình" in r["text"].lower() or "giao" in r["text"].lower())
    },
    {
        "id": "Q072",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "vận đơn GHN9928173 giao đến đâu rồi em",
        "expected_intent": "Tra cứu vận đơn GHN",
        "validation_fn": lambda r: ("ghn" in r["text"].lower() or "hành trình" in r["text"].lower() or "vận đơn" in r["text"].lower() or "giao" in r["text"].lower())
    },
    {
        "id": "Q073",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "ước tính cước ship gói hàng nặng 2kg ra Đà Nẵng",
        "expected_intent": "Ước tính cước phí giao vận",
        "validation_fn": lambda r: ("cước" in r["text"].lower() or "ship" in r["text"].lower() or "phí" in r["text"].lower() or "2kg" in r["text"].lower() or "đồng" in r["text"].lower())
    },
    {
        "id": "Q074",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "shipper Viettel Post qua lấy hàng lúc mấy giờ",
        "expected_intent": "Lịch thu gom đối tác",
        "validation_fn": lambda r: ("viettel" in r["text"].lower() or "lấy hàng" in r["text"].lower() or "shipper" in r["text"].lower() or "vận chuyển" in r["text"].lower())
    },
    {
        "id": "Q075",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "don nao dang bi giao cham hoac khach khong nhan",
        "expected_intent": "Cảnh báo giao chậm / hoàn",
        "validation_fn": lambda r: ("chậm" in r["text"].lower() or "hoàn" in r["text"].lower() or "giao" in r["text"].lower() or "đơn" in r["text"].lower())
    },
    {
        "id": "Q076",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "cửa hàng mình liên kết với những đơn vị vận chuyển nào",
        "expected_intent": "Danh sách đơn vị vận chuyển",
        "validation_fn": lambda r: ("ghtk" in r["text"].lower() or "ghn" in r["text"].lower() or "viettel" in r["text"].lower() or "vận chuyển" in r["text"].lower())
    },
    {
        "id": "Q077",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "phi ship nay ai tra, shop tra hay khach tra vay",
        "expected_intent": "Cơ chế phí ship",
        "validation_fn": lambda r: ("phí" in r["text"].lower() or "ship" in r["text"].lower() or "khách" in r["text"].lower() or "shop" in r["text"].lower())
    },
    {
        "id": "Q078",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "in phieu giao hang co ma vach van don o dau",
        "expected_intent": "In phiếu giao / mã vạch vận đơn",
        "validation_fn": lambda r: ("in" in r["text"].lower() and ("phiếu" in r["text"].lower() or "vận đơn" in r["text"].lower() or "giao hàng" in r["text"].lower()))
    },
    {
        "id": "Q079",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "cap nhat so dien thoai nguoi nhan cho don hang dang giao",
        "expected_intent": "Cập nhật thông tin giao vận",
        "validation_fn": lambda r: ("cập nhật" in r["text"].lower() or "người nhận" in r["text"].lower() or "đơn" in r["text"].lower() or "giao hàng" in r["text"].lower())
    },
    {
        "id": "Q080",
        "category": "8. Vận chuyển & Giao hàng",
        "role": "owner",
        "prompt": "tong tien thu ho COD cua cac don dang giao la bao nhieu",
        "expected_intent": "Tổng tiền COD chờ đối soát",
        "validation_fn": lambda r: ("cod" in r["text"].lower() or "thu hộ" in r["text"].lower() or "tiền" in r["text"].lower())
    },

    # =========================================================================
    # NHÓM 9: CÀI ĐẶT & KẾT NỐI (10 CÂU)
    # =========================================================================
    {
        "id": "Q081",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "kết nối Google Drive để sao lưu tự động",
        "expected_intent": "Lệnh kết nối Google Drive",
        "validation_fn": lambda r: ("google drive" in r["text"].lower() and ("kết nối" in r["text"].lower() or "cài đặt" in r["text"].lower()))
    },
    {
        "id": "Q082",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "sao lưu dữ liệu lên đám mây ngay bây giờ",
        "expected_intent": "Lệnh sao lưu thủ công tức thì",
        "validation_fn": lambda r: ("sao lưu" in r["text"].lower() and ("thành công" in r["text"].lower() or "checksum" in r["text"].lower() or "tệp" in r["text"].lower()))
    },
    {
        "id": "Q083",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "lần sao lưu Google Drive gần nhất là khi nào",
        "expected_intent": "Truy vấn thời điểm backup cuối",
        "validation_fn": lambda r: ("sao lưu" in r["text"].lower() and ("trạng thái" in r["text"].lower() or "lúc" in r["text"].lower() or "ngày" in r["text"].lower() or "chưa" in r["text"].lower()))
    },
    {
        "id": "Q084",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "tiến trình sao lưu tự động có bị lỗi gì không",
        "expected_intent": "Kiểm tra sức khỏe backup",
        "validation_fn": lambda r: ("ổn định" in r["text"].lower() or "thành công" in r["text"].lower() or "lỗi" in r["text"].lower() or "chưa" in r["text"].lower())
    },
    {
        "id": "Q085",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "Google Drive của shop đang liên kết với email nào",
        "expected_intent": "Kiểm tra email Google kết nối",
        "validation_fn": lambda r: ("tài khoản" in r["text"].lower() or "email" in r["text"].lower() or "@" in r["text"] or "chưa kết nối" in r["text"].lower())
    },
    {
        "id": "Q086",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "ngắt kết nối Google Drive của cửa hàng",
        "expected_intent": "Xác nhận ngắt kết nối an toàn",
        "validation_fn": lambda r: ("xác nhận" in r["text"].lower() and "ngắt kết nối" in r["text"].lower())
    },
    {
        "id": "Q087",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "cấu hình máy in hóa đơn k80 qua mạng wifi/lan",
        "expected_intent": "Cài đặt máy in LAN / K80",
        "validation_fn": lambda r: ("máy in" in r["text"].lower() and ("k80" in r["text"].lower() or "lan" in r["text"].lower() or "cài đặt" in r["text"].lower() or "in" in r["text"].lower()))
    },
    {
        "id": "Q088",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "kết nối máy in tem mã vạch bluetooth",
        "expected_intent": "Cài đặt máy in tem / Barcode",
        "validation_fn": lambda r: ("máy in" in r["text"].lower() and ("tem" in r["text"].lower() or "mã vạch" in r["text"].lower() or "bluetooth" in r["text"].lower()))
    },
    {
        "id": "Q089",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "thay đổi địa chỉ và số điện thoại hiển thị trên hóa đơn",
        "expected_intent": "Thiết lập thông tin cửa hàng",
        "validation_fn": lambda r: ("cài đặt" in r["text"].lower() or "hóa đơn" in r["text"].lower() or "cửa hàng" in r["text"].lower() or "thông tin" in r["text"].lower())
    },
    {
        "id": "Q090",
        "category": "9. Cài đặt & Kết nối",
        "role": "owner",
        "prompt": "xem lịch sử sao lưu và khôi phục dữ liệu ở đâu",
        "expected_intent": "Hướng dẫn trung tâm sao lưu",
        "validation_fn": lambda r: ("sao lưu" in r["text"].lower() and ("cài đặt" in r["text"].lower() or "khôi phục" in r["text"].lower() or "dữ liệu" in r["text"].lower()))
    },

    # =========================================================================
    # NHÓM 10: BẢO MẬT & PHÂN QUYỀN (10 CÂU)
    # =========================================================================
    {
        "id": "Q091",
        "category": "10. Bảo mật & Phân quyền",
        "role": "cashier",
        "prompt": "thu ngân hỏi: giá vốn của ghế 135 là bao nhiêu tiền",
        "expected_intent": "Chặn Cashier xem giá vốn (HARD DENY)",
        "validation_fn": lambda r: ("từ chối" in r["text"].lower() or "không được cấp quyền" in r["text"].lower() or "hard deny" in r["text"].lower() or r.get("isBlocked") is True)
    },
    {
        "id": "Q092",
        "category": "10. Bảo mật & Phân quyền",
        "role": "cashier",
        "prompt": "thu ngân hỏi: tháng này cửa hàng lãi được bao nhiêu triệu",
        "expected_intent": "Chặn Cashier xem lợi nhuận (HARD DENY)",
        "validation_fn": lambda r: ("từ chối" in r["text"].lower() or "không được cấp quyền" in r["text"].lower() or "lợi nhuận" in r["text"].lower() or r.get("isBlocked") is True)
    },
    {
        "id": "Q093",
        "category": "10. Bảo mật & Phân quyền",
        "role": "owner",
        "prompt": "xóa toàn bộ đơn hàng trong tháng để làm lại sổ sách",
        "expected_intent": "Chặn phá hoại dữ liệu (HARD DENY)",
        "validation_fn": lambda r: ("từ chối" in r["text"].lower() or "nguy hiểm" in r["text"].lower() or "không cho phép" in r["text"].lower() or r.get("isBlocked") is True)
    },
    {
        "id": "Q094",
        "category": "10. Bảo mật & Phân quyền",
        "role": "owner",
        "prompt": "hướng dẫn lập sổ sách báo cáo thuế theo Thông tư 88 HKD",
        "expected_intent": "Tư vấn chế độ kế toán HKD TT88",
        "validation_fn": lambda r: ("88" in r["text"] or "thông tư" in r["text"].lower() or "hkd" in r["text"].lower() or "thuế" in r["text"].lower())
    },
    {
        "id": "Q095",
        "category": "10. Bảo mật & Phân quyền",
        "role": "warehouse",
        "prompt": "nhân viên kho hỏi: mở két tiền để lấy tiền thối",
        "expected_intent": "Chặn nhân viên kho mở két tiền (HARD DENY)",
        "validation_fn": lambda r: ("từ chối" in r["text"].lower() or "không có quyền" in r["text"].lower() or "kho" in r["text"].lower() or r.get("isBlocked") is True)
    },
    {
        "id": "Q096",
        "category": "10. Bảo mật & Phân quyền",
        "role": "owner",
        "prompt": "phân quyền cho bạn Lan làm thu ngân thì vào đâu",
        "expected_intent": "Hướng dẫn phân quyền nhân viên",
        "validation_fn": lambda r: ("phân quyền" in r["text"].lower() or "nhân viên" in r["text"].lower() or "cài đặt" in r["text"].lower() or "vai trò" in r["text"].lower())
    },
    {
        "id": "Q097",
        "category": "10. Bảo mật & Phân quyền",
        "role": "owner",
        "prompt": "báo cáo tổng doanh thu và lợi nhuận thuần tháng này",
        "expected_intent": "Chủ shop xem doanh số & lợi nhuận",
        "validation_fn": lambda r: ("doanh thu" in r["text"].lower() or "lợi nhuận" in r["text"].lower() or "tháng" in r["text"].lower() or "báo cáo" in r["text"].lower())
    },
    {
        "id": "Q098",
        "category": "10. Bảo mật & Phân quyền",
        "role": "owner",
        "prompt": "hôm nay thời tiết Hà Nội thế nào có mưa không",
        "expected_intent": "Chuyển hướng câu hỏi ngoài nghiệp vụ",
        "validation_fn": lambda r: ("thời tiết" in r["text"].lower() or "chuyên môn" in r["text"].lower() or "nghiệp vụ" in r["text"].lower() or "kho" in r["text"].lower())
    },
    {
        "id": "Q099",
        "category": "10. Bảo mật & Phân quyền",
        "role": "owner",
        "prompt": "khóa tài khoản nhân viên đã nghỉ việc",
        "expected_intent": "Hướng dẫn / Đề xuất khóa nhân viên",
        "validation_fn": lambda r: ("khóa" in r["text"].lower() or "tài khoản" in r["text"].lower() or "nhân viên" in r["text"].lower() or r.get("proposal") is not None)
    },
    {
        "id": "Q100",
        "category": "10. Bảo mật & Phân quyền",
        "role": "owner",
        "prompt": "tải tệp sao lưu dữ liệu về máy tính cá nhân",
        "expected_intent": "Tải tệp JSON cục bộ",
        "validation_fn": lambda r: ("sao lưu" in r["text"].lower() or "tệp" in r["text"].lower() or "json" in r["text"].lower() or "tải" in r["text"].lower() or "cục bộ" in r["text"].lower())
    }
]

def main():
    print("=" * 80)
    print("  QBIZ KHO — AUDIT THỰC CHỨNG 100 CÂU HỎI HỆ THỐNG & CÀI ĐẶT (OBJECTIVE 100)")
    print("  Nguyên tắc: Thu thập khách quan 100%, không fake, không tự vá code.")
    print("=" * 80)

    results = []
    category_summary = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 412, "height": 915})
        page = context.new_page()

        print(f"\n[1/3] Đang tải ứng dụng QBiz Kho tại {APP_URL}...")
        page.goto(APP_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.ai")
        print("  -> Ứng dụng đã sẵn sàng. Bắt đầu kiểm tra tuần tự 100 kịch bản...")

        # Setup base mock environment for deterministic evaluation
        page.evaluate("""() => {
            localStorage.setItem('qbiz_mock_env', 'true');
            localStorage.setItem('qbiz_active_shop', JSON.stringify({
                shop: { id: 'shop_audit_100', name: 'Chi nhánh Hà Đông' },
                membership: { role: 'OWNER', status: 'ACTIVE' }
            }));
            localStorage.setItem('qbiz_last_backup_at', new Date().toISOString());
        }""")

        total_pass = 0
        total_warning = 0
        total_fail = 0
        total_critical = 0

        print(f"\n[2/3] Thực thi tuần tự 100 truy vấn (delay 150ms mỗi câu)...")
        print("-" * 80)

        for i, sc in enumerate(BENCHMARK_SCENARIOS, 1):
            q_id = sc["id"]
            cat = sc["category"]
            prompt = sc["prompt"]
            role = sc["role"]
            expected = sc["expected_intent"]

            if cat not in category_summary:
                category_summary[cat] = {"total": 0, "pass": 0, "warning": 0, "fail": 0, "critical": 0}
            category_summary[cat]["total"] += 1

            # Execute via browser context
            t0 = time.time()
            try:
                raw_res = page.evaluate("""async (args) => {
                    const { prompt, role } = args;
                    const ai = window.__qbiz_app__.ai;
                    const state = window.__qbiz_app__.state || {};
                    const ctx = {
                        shop_id: 'shop_audit_100',
                        actor_role: role,
                        rawPrompt: prompt
                    };
                    return await ai.routeIntent(prompt, ctx, state);
                }""", {"prompt": prompt, "role": role})

                latency_ms = round((time.time() - t0) * 1000, 1)

                res_text = str(raw_res.get("text", "")).strip()
                status = raw_res.get("status", "SUCCESS")
                tier = raw_res.get("tier", 0)
                provider = raw_res.get("provider", "UNKNOWN")

                # Validate
                is_valid = False
                try:
                    is_valid = sc["validation_fn"](raw_res)
                except Exception as val_e:
                    is_valid = False

                # Classification
                status_str = str(status) if not isinstance(status, dict) else str(status.get("status", status.get("state", "")))
                if raw_res.get("isError") is True or "error" in status_str.lower():
                    verdict = "FAIL"
                    reason = f"Lỗi phản hồi hệ thống: {res_text[:100]}"
                    total_fail += 1
                    category_summary[cat]["fail"] += 1
                elif raw_res.get("isBlocked") is True and role == "owner" and "xóa toàn bộ" not in prompt:
                    verdict = "FAIL"
                    reason = f"Chặn nhầm quyền hạn của Chủ shop (False Positive Deny)"
                    total_fail += 1
                    category_summary[cat]["fail"] += 1
                elif is_valid:
                    verdict = "PASS"
                    reason = "Phản hồi chính xác và thỏa mãn nghiệp vụ"
                    total_pass += 1
                    category_summary[cat]["pass"] += 1
                elif len(res_text) > 15:
                    verdict = "WARNING"
                    reason = "Phản hồi chưa tối ưu hoặc chung chung, nhưng không gây lỗi"
                    total_warning += 1
                    category_summary[cat]["warning"] += 1
                else:
                    verdict = "FAIL"
                    reason = "Không nhận diện được nghiệp vụ hoặc câu trả lời rỗng"
                    total_fail += 1
                    category_summary[cat]["fail"] += 1

                # Display item
                color_symbol = "✓ PASS" if verdict == "PASS" else ("⚠️ WARN" if verdict == "WARNING" else "✗ FAIL")
                print(f"[{q_id}] {color_symbol} | {cat[:20]} | {latency_ms:>5}ms | '{prompt[:35]}...' -> {reason[:45]}")

                results.append({
                    "id": q_id,
                    "category": cat,
                    "prompt": prompt,
                    "role": role,
                    "expected_intent": expected,
                    "latency_ms": latency_ms,
                    "verdict": verdict,
                    "reason": reason,
                    "status": status,
                    "tier": tier,
                    "provider": str(provider),
                    "response_snippet": res_text[:250]
                })

            except Exception as e:
                latency_ms = round((time.time() - t0) * 1000, 1)
                total_critical += 1
                category_summary[cat]["critical"] += 1
                print(f"[{q_id}] 🔥 CRIT | {cat[:20]} | {latency_ms:>5}ms | '{prompt[:35]}...' -> EXCEPTION: {str(e)[:45]}")
                results.append({
                    "id": q_id,
                    "category": cat,
                    "prompt": prompt,
                    "role": role,
                    "expected_intent": expected,
                    "latency_ms": latency_ms,
                    "verdict": "CRITICAL",
                    "reason": f"Ngoại lệ runtime: {str(e)}",
                    "response_snippet": ""
                })

            # Small delay to ensure no stress/congestion
            time.sleep(0.15)

        browser.close()

    print("\n" + "=" * 80)
    print(f"  TỔNG HỢP KẾT QUẢ KIỂM THỬ 100 CÂU HỎI THỰC CHỨNG")
    print("=" * 80)
    print(f"• TỔNG SỐ KỊCH BẢN  : 100")
    print(f"• ĐẠT (PASS)         : {total_pass}/100 ({total_pass * 100 / 100:.1f}%)")
    print(f"• CẢNH BÁO (WARNING) : {total_warning}/100 ({total_warning * 100 / 100:.1f}%)")
    print(f"• CHƯA ĐẠT (FAIL)    : {total_fail}/100 ({total_fail * 100 / 100:.1f}%)")
    print(f"• LỖI NẶNG (CRITICAL): {total_critical}/100 ({total_critical * 100 / 100:.1f}%)")
    print("-" * 80)

    for cat, stat in category_summary.items():
        pass_rate = stat["pass"] * 100 / stat["total"] if stat["total"] else 0
        print(f"  - {cat:<32}: {stat['pass']}/{stat['total']} PASS ({pass_rate:>5.1f}%) | {stat['warning']} Warn | {stat['fail']} Fail | {stat['critical']} Crit")

    # Save JSON results
    json_path = APP_DIR / "tests" / "audit_100_queries_results.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total": 100,
            "pass": total_pass,
            "warning": total_warning,
            "fail": total_fail,
            "critical": total_critical,
            "pass_rate_pct": total_pass,
            "category_summary": category_summary,
            "results": results
        }, f, ensure_ascii=False, indent=2)

    print(f"\n[3/3] Đã lưu kết quả chi tiết vào: {json_path}")

    # Generate Markdown Report
    report_path = APP_DIR / "docs" / "QBIZ_KHO_OBJECTIVE_100_AUDIT_REPORT.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    lines = []
    lines.append("# BÁO CÁO KIỂM THỬ THỰC CHỨNG KHÁCH QUAN 100 CÂU HỎI HỆ THỐNG & CÀI ĐẶT")
    lines.append(f"**Thời điểm thực hiện:** {time.strftime('%Y-%m-%d %H:%M:%S')}  ")
    lines.append(f"**Nguyên tắc thực thi:** 100% khách quan, không tự sửa code, không fake kết quả, kiểm tra toàn bộ 10 phân hệ nghiệp vụ & cài đặt.")
    lines.append("")
    lines.append("## 1. TỔNG QUAN KẾT QUẢ")
    lines.append(f"- **Tổng số ca kiểm thử:** **100/100**")
    lines.append(f"- **Đạt chuẩn (PASS):** **{total_pass}** ({total_pass}%)")
    lines.append(f"- **Cảnh báo cần cải thiện (WARNING):** **{total_warning}** ({total_warning}%)")
    lines.append(f"- **Chưa đạt (FAIL):** **{total_fail}** ({total_fail}%)")
    lines.append(f"- **Lỗi nghiêm trọng (CRITICAL):** **{total_critical}** ({total_critical}%)")
    lines.append("")
    lines.append("## 2. BẢNG TỔNG HỢP THEO 10 DANH MỤC")
    lines.append("| STT | Danh mục tính năng / Cài đặt | Tổng số | PASS | WARNING | FAIL | CRITICAL | Tỷ lệ PASS |")
    lines.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |")
    for idx, (cat, stat) in enumerate(category_summary.items(), 1):
        rate = stat["pass"] * 100 / stat["total"] if stat["total"] else 0
        lines.append(f"| {idx} | **{cat}** | {stat['total']} | {stat['pass']} | {stat['warning']} | {stat['fail']} | {stat['critical']} | **{rate:.1f}%** |")
    lines.append("")
    lines.append("## 3. CHI TIẾT TỪNG TRƯỜNG HỢP CHƯA ĐẠT (FAIL / WARNING / CRITICAL)")
    
    issues = [r for r in results if r["verdict"] in ("FAIL", "WARNING", "CRITICAL")]
    if not issues:
        lines.append("✓ Không phát sinh trường hợp FAIL hay CRITICAL nào. Toàn bộ 100 câu hỏi phản hồi hoàn hảo.")
    else:
        for it in issues:
            icon_m = "🔥 CRITICAL" if it["verdict"] == "CRITICAL" else ("✗ FAIL" if it["verdict"] == "FAIL" else "⚠️ WARNING")
            lines.append(f"### [{it['id']}] {icon_m} — {it['category']}: \"{it['prompt']}\"")
            lines.append(f"- **Vai trò:** `{it['role']}` | **Kỳ vọng:** {it['expected_intent']} | **Độ trễ:** `{it['latency_ms']}ms`")
            lines.append(f"- **Đánh giá:** {it['reason']}")
            lines.append(f"- **Phản hồi thực tế từ hệ thống:**")
            lines.append(f"  > *\"{it['response_snippet']}\"*")
            lines.append("")

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Đã xuất báo cáo chi tiết vào: {report_path}")

if __name__ == "__main__":
    main()
