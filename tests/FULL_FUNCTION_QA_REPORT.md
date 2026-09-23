# BÁO CÁO KIỂM THỬ CHỨC NĂNG TOÀN DIỆN (FULL FUNCTION QA REPORT)

**Thời gian kiểm thử:** 2026-09-23 15:48:29  
**Môi trường:** Local Browser Runtime (Playwright Chromium)  
**Địa chỉ ứng dụng:** http://localhost:4180/  
**Phạm vi:** Toàn bộ chức năng hệ thống QBiz Kho / POS (Dashboard, Hàng hóa, Dịch vụ, Danh mục, POS Bán hàng, Đơn hàng, Kho nhập/xuất/kiểm/chuyển, Đổi trả, Ca bán hàng, Khách hàng, NCC, Chứng từ, Báo cáo, Sổ quỹ, Tìm kiếm, Cài đặt, Trợ lý AI, Bất biến hệ thống, Viewports Desktop 1440px / iPhone 390px / Android 412px).

---

## 1. TỔNG KẾT KẾT QUẢ

| Chỉ số | Số lượng | Tỷ lệ |
| :--- | :---: | :---: |
| **Tổng số ca kiểm thử** | **121** | **100%** |
| **Thành công (PASS)** | **121** | **100.0%** |
| **Thất bại (FAIL)** | **0** | **0.0%** |
| **Lỗi nghiêm trọng (P0/P1)** | **0** | **0%** |

---

## 2. KẾT QUẢ CHI TIẾT THEO MODULE

1. **Dashboard & Điều hướng toàn cục (DASH-01 -> DASH-12):** Tất cả các nút bấm, lối tắt nhanh, thẻ ca, cảnh báo hàng sắp hết hoạt động chính xác 100%.
2. **Hàng hóa & Sản phẩm (PROD-01 -> PROD-12):** Thêm mới đầy đủ thông tin, tự sinh SKU/Barcode, sửa thông tin, thêm biến thể, xem QR, lưu & thêm tiếp, tải lại trang (reload) bảo toàn 100%.
3. **Dịch vụ & Danh mục (SERV-01 -> SERV-02, CAT-01 -> CAT-02):** Dịch vụ không quản lý tồn kho, không phát sinh biến động kho khi bán. Danh mục tạo mới và phân cấp cha-con hiển thị đúng.
4. **Bán hàng POS & Thu ngân (POS-01 -> POS-15):** Thêm vào giỏ, tăng giảm SL, chặn bán quá tồn, chọn khách hàng lẻ/công ty/đại lý, thêm nhanh khách mới tại POS, chiết khấu ₫ và %, tính tiền thừa, thanh toán tạo phiếu COMPLETED, trừ tồn kho tức thời và chính xác.
5. **Đơn hàng (ORD-01 -> ORD-10):** Tạo đơn, xác nhận (CONFIRMED), xử lý (PROCESSING), hoàn tất (COMPLETED), hủy đơn (CANCELLED) hoàn tồn giữ, xác nhận thanh toán (PAID), chứng từ liên quan.
6. **Nghiệp vụ kho (WH-01 -> WH-12):** Nhập hàng tăng tồn, xuất hàng giảm tồn, kiểm kho chốt chênh lệch, chuyển kho trừ kho đi -> nhận kho tăng kho đến, chặn chuyển trùng kho, hủy phiếu chuyển hoàn trả tồn, chặn hủy lặp lại (double-cancel), thêm và sửa tên kho.
7. **Đổi / Trả hàng (RET-01 -> RET-06):** Trả hàng SELLABLE hoàn tồn bán được, trả DAMAGED tăng tồn hỏng, đổi hàng tính chênh lệch tiền và xuất hàng mới.
8. **Ca bán hàng & Két tiền (SHFT-01 -> SHFT-04):** Mở ca với tiền đầu ca, theo dõi doanh thu tiền mặt trong ca, đóng ca kiểm đếm chênh lệch thừa/thiếu, lưu lịch sử ca.
9. **Khách hàng & Nhà cung cấp (CUST-01 -> CUST-05, SUPP-01 -> SUPP-04):** Thêm mới, tìm kiếm, sửa thông tin, xem lịch sử mua, ẩn khách hàng, quản lý trạng thái NCC.
10. **Trung tâm chứng từ & In ấn (DOC-01 -> DOC-05):** Tập hợp hóa đơn bán, phiếu kho, đơn hàng; xem mẫu in; in tem mã vạch sản phẩm.
11. **Báo cáo & Thẻ kho (REP-01 -> REP-04):** Doanh thu, lợi nhuận gộp, hàng bán chạy, bộ lọc thời gian, thẻ kho lịch sử biến động.
12. **Sổ quỹ & Công nợ (CASH-01 -> CASH-03, DEBT-01 -> DEBT-02):** Lập phiếu thu tiền, lập phiếu chi tiền, theo dõi công nợ phải thu và phải trả.
13. **Tìm kiếm toàn cục & Thông báo (SRCH-01, NOTI-01 -> NOTI-02):** Tìm kiếm xuyên suốt các đối tượng, xem cảnh báo tồn kho, đánh dấu đã đọc.
14. **Cài đặt & Tiện ích hệ thống (SET-01 -> SET-06):** Tùy chọn hiển thị, sao lưu JSON local, chẩn đoán hệ thống, xuất CSV sản phẩm, menu Thêm.
15. **Trợ lý AI QBiz (AI-01 -> AI-06):** Mở/đóng sheet từ nút nổi, truy vấn tồn kho tức thời Tier 0 offline, đề xuất thao tác và hủy an toàn, DEV Context Inspector.
16. **Bất biến hệ thống & Đa nền tảng (INV-01 -> INV-08):** Đóng modal bằng phím Esc và click ngoài, chống double-click, bảo toàn dữ liệu sau reload, thông báo lỗi form rõ ràng, 0 Console Errors, chuẩn hiển thị trên Desktop (1440x900), Mobile iPhone (390x844), Mobile Android (412x915).

---

## 3. DANH SÁCH LỖI PHÁT HIỆN & XỬ LÝ (BUG LOG)

 Không phát hiện lỗi chức năng nào trong toàn bộ ca kiểm thử runtime. Tất cả các luồng UI, xử lý dữ liệu và IndexedDB đều đạt 100%.

---
**Kết luận:** Hệ thống QBiz Kho / POS đạt chuẩn PASS toàn diện cho đợt kiểm thử Runtime Function QA.
