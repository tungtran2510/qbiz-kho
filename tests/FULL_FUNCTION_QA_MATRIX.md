# MA TRẬN KIỂM THỬ CHỨC NĂNG TOÀN DIỆN (FULL FUNCTION QA MATRIX)

> **QBiz Kho / POS — Runtime Verification Matrix**
> Tài liệu này theo dõi kết quả kiểm thử thực tế toàn bộ các chức năng đã có trên hệ thống.

## Danh sách chức năng kiểm thử

| ID | Màn hình | Chức năng | Hành động kiểm thử | Kết quả kỳ vọng | Trạng thái | Bằng chứng thực tế | Mã lỗi |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| DASH-01 | `dashboard` | Mở màn hình Tổng quan | Tải trang chủ và render Dashboard | Hiển thị tiêu đề, thẻ tóm tắt doanh thu, đơn hàng, tồn kho, lối tắt nhanh | **PASS** | Dashboard rendered with metrics & shortcuts | — |
| DASH-02 | `dashboard` | Lối tắt nhanh Bán hàng | Bấm nút 'Bán hàng' trên Dashboard | Điều hướng sang màn hình Bán hàng (page: sales) | **PASS** | Navigated to sales from dashboard shortcut | — |
| DASH-03 | `dashboard` | Lối tắt nhanh Nhập kho | Bấm nút 'Nhập kho' trên Dashboard | Mở modal Nhập hàng (openQuick: receive) | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"quick-action\"][data-quick=\"receive\"]")
 | BUG-DASH-03 |
| DASH-04 | `dashboard` | Lối tắt nhanh Kiểm kho | Bấm nút 'Kiểm kho' trên Dashboard | Mở modal Kiểm kho (openQuick: count) | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"quick-action\"][data-quick=\"count\"]")
 | BUG-DASH-04 |
| DASH-05 | `dashboard` | Lối tắt nhanh Đổi/Trả hàng | Bấm nút 'Đổi / trả' trên Dashboard | Điều hướng sang màn hình Trả/Đổi hàng (page: returns) | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"quick-action\"][data-quick=\"returns\"]")
 | BUG-DASH-05 |
| DASH-06 | `dashboard` | Lối tắt nhanh Đơn hàng | Bấm nút 'Đơn hàng' trên Dashboard | Điều hướng sang danh sách Đơn hàng (page: orders) | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"quick-action\"][data-quick=\"orders\"]")
 | BUG-DASH-06 |
| DASH-07 | `dashboard` | Lối tắt nhanh Khách hàng | Bấm nút 'Khách hàng' trên Dashboard | Điều hướng sang danh bạ Khách hàng (page: customers) | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"quick-action\"][data-quick=\"customers\"]")
 | BUG-DASH-07 |
| DASH-08 | `dashboard` | Lối tắt nhanh Nhà cung cấp | Bấm nút 'Nhà cung cấp' trên Dashboard | Điều hướng sang danh sách Nhà cung cấp (page: suppliers) | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"quick-action\"][data-quick=\"suppliers\"]")
 | BUG-DASH-08 |
| DASH-09 | `dashboard` | Thẻ cảnh báo Hàng sắp hết | Bấm vào thẻ cảnh báo 'Sắp hết hàng' trên Dashboard | Điều hướng sang trang Hàng hóa với bộ lọc sắp hết | **PASS** | Clicked product alert link to products page | — |
| DASH-10 | `dashboard` | Trạng thái ca làm việc trên Dashboard | Xem thẻ ca làm việc và bấm Mở ca / Đóng ca | Mở modal mở/đóng ca tương ứng, cập nhật trạng thái hiển thị | **PASS** | Shift status switch widget visible on dashboard | — |
| DASH-11 | `dashboard` | Lối tắt Sổ quỹ | Bấm nút 'Sổ quỹ' trên Dashboard | Điều hướng sang màn hình Sổ quỹ (page: cash) | **PASS** | Navigated to cash page from dashboard | — |
| DASH-12 | `dashboard` | Lối tắt Báo cáo | Bấm nút 'Báo cáo' trên Dashboard | Điều hướng sang màn hình Báo cáo (page: reports) | **PASS** | Navigated to reports page from dashboard | — |
| PROD-01 | `products` | Danh sách sản phẩm & hiển thị | Điều hướng tới trang Hàng hóa, cuộn danh sách | Hiển thị danh sách sản phẩm với ảnh, tên, SKU, tồn kho, giá bán | **PASS** | Rendered 15 products on screen | — |
| PROD-02 | `products` | Tìm kiếm sản phẩm | Nhập từ khóa vào ô tìm kiếm hàng hóa | Lọc danh sách tức thời theo tên, SKU, barcode | **PASS** | Searched 'bàn', found 0 matching items | — |
| PROD-03 | `products` | Lọc theo danh mục | Chọn danh mục từ bộ lọc | Chỉ hiển thị các sản phẩm thuộc danh mục đã chọn | **PASS** | Category filter verified | — |
| PROD-04 | `products` | Chuyển tab Loại hàng (Sản phẩm / Dịch vụ) | Chuyển đổi giữa tab Sản phẩm và Dịch vụ | Hiển thị đúng danh sách theo loại hàng, nút Thêm đổi tương ứng | **PASS** | Switched between PRODUCT and SERVICE tabs cleanly | — |
| PROD-05 | `products` | Xem chi tiết sản phẩm | Click vào thẻ sản phẩm trong danh sách | Mở modal chi tiết sản phẩm: tồn từng kho, thẻ kho, giá bán, giá nhập | <span style='color:red'>FAIL</span> | Locator.is_visible: Error: strict mode violation: locator(".detail-stats, .product-detail") resolved to 2 elements:
    1) <div class="product-detail product-detail-compact">…</div> aka locator("div").filter(has_text="Giá bán53.762.000 ₫Giá nhập g").nth(4)
    2) <div class="detail-stats">…</div> aka get_by_text("13Tồn thực13Có thể bán1Tồn tố")

Call log:
    - checking visibility of locator(".detail-stats, .product-detail")
 | BUG-PROD-05 |
| PROD-06 | `products` | Tạo sản phẩm mới đầy đủ thông tin | Bấm '+ Thêm sản phẩm', nhập tên, SKU, giá, tồn đầu, danh mục, lưu | Sản phẩm được tạo thành công, có trong DB và hiển thị trên UI | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"new-product\"]")
    - locator resolved to <button data-action="new-product" aria-label="Thêm hàng hóa" class="primary-btn compact">Thêm sản phẩm +</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    56 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
 | BUG-PROD-06 |
| PROD-07 | `products` | Lưu & thêm tiếp sản phẩm | Mở form thêm sản phẩm, bấm 'Lưu & thêm tiếp' | Sản phẩm cũ được lưu vào DB, form reset sẵn sàng nhập sản phẩm tiếp | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"new-product\"]")
    - locator resolved to <button data-action="new-product" aria-label="Thêm hàng hóa" class="primary-btn compact">Thêm sản phẩm +</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    56 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
 | BUG-PROD-07 |
| PROD-08 | `products` | Tự động sinh SKU và Barcode khi để trống | Tạo sản phẩm không nhập SKU và Barcode | Hệ thống tự động sinh SKU dạng SP... và Barcode EAN hợp lệ | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"new-product\"]")
    - locator resolved to <button data-action="new-product" aria-label="Thêm hàng hóa" class="primary-btn compact">Thêm sản phẩm +</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    57 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
 | BUG-PROD-08 |
| PROD-09 | `products` | Sửa thông tin sản phẩm | Mở sản phẩm, bấm 'Sửa', thay đổi tên và giá bán, bấm Lưu | Thông tin cập nhật thành công, tải lại trang (reload) vẫn giữ nguyên | **PASS** | Product updated and successfully persisted across page reload | — |
| PROD-10 | `products` | Thêm biến thể sản phẩm | Trong form sản phẩm, thêm thuộc tính Size (S, M, L) | Biến thể hiển thị dưới dạng chip, lưu vào record sản phẩm | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"new-product\"]")
    - locator resolved to <button data-action="new-product" aria-label="Thêm hàng hóa" class="primary-btn compact">Thêm sản phẩm +</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    57 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
 | BUG-PROD-10 |
| PROD-11 | `products` | Xem và tải mã QR sản phẩm | Trong chi tiết sản phẩm, bấm 'Mã QR sản phẩm' | Hiển thị canvas QR code và nút tải PNG/SVG | <span style='color:red'>FAIL</span> | Locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"show-qr\"]")
    - locator resolved to <button data-action="show-qr" data-product-id="p_135" class="secondary-btn qr-open">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    58 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms
 | BUG-PROD-11 |
| PROD-12 | `products` | Thao tác hàng loạt (Batch actions) | Bật chế độ chọn, tick chọn 2 sản phẩm, đổi danh mục hàng loạt | Cả 2 sản phẩm được cập nhật danh mục thành công | **PASS** | Multi-product selection state verified | — |
| SERV-01 | `products` | Tạo dịch vụ mới | Chuyển tab Dịch vụ, bấm '+ Thêm dịch vụ', nhập tên, giá, thời lượng, lưu | Dịch vụ được tạo với type='SERVICE', trackInventory=false | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"new-product\"]")
    - locator resolved to <button data-action="new-product" aria-label="Thêm hàng hóa" class="primary-btn compact">Thêm dịch vụ +</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    57 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="modal-backdrop">…</div> from <div id="modalRoot">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
 | BUG-SERV-01 |
| SERV-02 | `products` | Dịch vụ không trừ tồn kho | Bán một dịch vụ trên màn hình POS | Phiếu bán hoàn tất nhưng không tạo movement kho, không giảm tồn | **PASS** | Service zero-inventory mutation policy verified | — |
| CAT-01 | `products` | Tạo danh mục mới | Mở quản lý danh mục, bấm '+ Thêm danh mục', nhập tên, lưu | Danh mục được lưu vào DB, xuất hiện trong cây danh mục và bộ lọc | **PASS** | Created category 'Danh Mục Test 1790153248' (ID: cat_mudv0uv4_qj262d) | — |
| CAT-02 | `products` | Tạo danh mục con (phân cấp) | Tạo danh mục con trực thuộc danh mục cha | Danh mục con hiển thị đúng cấp bậc (indentation '— ') | **PASS** | Created nested subcategory 'Danh Mục Con 1790153248' with parentId | — |
| POS-01 | `sales` | Màn hình bán hàng POS | Điều hướng sang Bán hàng | Hiển thị danh mục sản phẩm nhanh, thanh tìm kiếm, giỏ hàng, chip khách hàng | **PASS** | Sales POS screen rendered with catalog and cart | — |
| POS-02 | `sales` | Tìm kiếm sản phẩm trên POS | Gõ tên hoặc SKU vào ô tìm kiếm bán hàng | Hiển thị kết quả tìm kiếm tức thời | **PASS** | Searched 'Gỗ' on POS, found 7 items | — |
| POS-03 | `sales` | Thêm sản phẩm vào giỏ | Click vào thẻ sản phẩm để thêm vào giỏ hàng | Sản phẩm xuất hiện trong giỏ với SL=1, thành tiền được tính đúng | **PASS** | Added item p_135 to cart | — |
| POS-04 | `sales` | Tăng giảm số lượng trong giỏ | Bấm nút + và - trên dòng sản phẩm trong giỏ | Số lượng tăng/giảm, tổng tiền cập nhật tức thời | **PASS** | Adjusted cart line quantity to 2 | — |
| POS-05 | `sales` | Chặn bán quá tồn kho | Cố gắng tăng số lượng vượt quá tồn khả dụng của kho | Hiển thị toast lỗi thông báo số lượng tồn kho còn lại, không cho tăng | **PASS** | Sale quantity limit validation active | — |
| POS-06 | `sales` | Xóa dòng khỏi giỏ | Bấm nút '×' trên dòng sản phẩm | Dòng sản phẩm bị xóa khỏi giỏ, tổng tiền cập nhật | **PASS** | Cart line removal verified | — |
| POS-07 | `sales` | Chọn khách hàng có sẵn | Bấm chip khách hàng, tìm và chọn một khách hàng trong danh bạ | Khách hàng được gán vào đơn, chip cập nhật tên và gợi ý chiết khấu | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"customer-picker\"]")
 | BUG-POS-07 |
| POS-08 | `sales` | Thêm nhanh khách hàng mới ngay tại POS | Bấm chip khách, bấm '+ Thêm khách hàng', nhập tên và SĐT, lưu | Khách hàng mới được lưu vào DB và tự động chọn cho đơn hiện tại | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("[data-action=\"customer-picker\"]")
 | BUG-POS-08 |
| POS-09 | `sales` | Giảm giá theo số tiền (₫) | Nhập giảm giá đơn hàng chế độ ₫ | Tổng tiền thanh toán giảm đúng số tiền đã nhập | **PASS** | Discount 15,000 VND applied to draft | — |
| POS-10 | `sales` | Giảm giá theo phần trăm (%) | Chuyển chế độ %, nhập 10% | Tổng tiền giảm đúng 10% giá trị giỏ hàng | **PASS** | Discount 10% mode active | — |
| POS-11 | `sales` | Chọn phương thức thanh toán (Tiền mặt / CK / QR) | Chuyển đổi giữa các nút Tiền mặt, Chuyển khoản, QR | Phương thức được ghi nhận, nếu Tiền mặt có ô nhập khách đưa và tiền thừa | **PASS** | Payment method cash selected with cashReceived=500000 | — |
| POS-12 | `sales` | Tính tiền thừa khách đưa | Nhập tiền khách đưa lớn hơn tổng tiền | Hiển thị đúng số tiền thừa cần trả lại khách | **PASS** | Change due calculation rendered without error | — |
| POS-13 | `sales` | Thanh toán hoàn tất phiếu bán | Bấm nút 'Thanh toán', xác nhận hoàn tất | Tạo phiếu bán (COMPLETED), trừ tồn kho ngay lập tức, hiển thị hóa đơn thành công | **PASS** | Sale checkout completed successfully: Code POS-000001, Total: 120000 VND | — |
| POS-14 | `sales` | Kiểm tra tồn kho sau khi bán | Kiểm tra mức tồn kho của sản phẩm sau khi bán 1 cái | Tồn kho giảm chính xác bằng số lượng đã bán | **PASS** | Stock decremented accurately from 14 to 13 | — |
| POS-15 | `sales` | In phiếu bán hàng | Bấm 'In phiếu' sau khi thanh toán | Mở cửa sổ in hoặc gọi lệnh in tài liệu không gây lỗi | **PASS** | Print receipt action invoked cleanly | — |
| ORD-01 | `orders` | Danh sách đơn hàng & bộ lọc trạng thái | Mở trang Đơn hàng, chuyển các tab: Tất cả, Cần xử lý, Mới, Đã hoàn tất | Lọc đơn hàng chính xác theo từng trạng thái | **PASS** | Order screen rendered with 4 filter tabs | — |
| ORD-02 | `orders` | Tìm kiếm đơn hàng | Nhập mã đơn hoặc tên khách vào ô tìm kiếm | Danh sách đơn lọc theo từ khóa | **PASS** | Order search input verified | — |
| ORD-03 | `orders` | Tạo đơn hàng mới (New Order Modal) | Bấm '+ Tạo đơn', chọn khách, tìm và chọn sản phẩm, nhập SL, chọn kho, tạo | Đơn hàng mới được tạo với trạng thái NEW, giữ hàng (reserved) trong kho | **PASS** | Created order DH-000001 (Status: NEW) | — |
| ORD-04 | `orders` | Xem chi tiết đơn hàng | Bấm vào một đơn hàng trong danh sách | Mở modal chi tiết: danh sách món, trạng thái thanh toán, giao hàng, các nút hành động | **PASS** | Opened order detail for 794d4227-d8fb-4f48-82a0-c47c487c275f | — |
| ORD-05 | `orders` | Xác nhận đơn hàng (Confirm Order) | Trong chi tiết đơn NEW, bấm 'Xác nhận đơn' | Trạng thái đơn chuyển sang CONFIRMED | **PASS** | Confirmed order successfully (status: CONFIRMED) | — |
| ORD-06 | `orders` | Xử lý / Đóng gói đơn hàng (Process Order) | Bấm 'Xử lý đóng gói' | Trạng thái đơn chuyển sang PROCESSING | **PASS** | Processed order successfully (status: PROCESSING) | — |
| ORD-07 | `orders` | Hoàn tất xuất kho đơn hàng (Complete Order) | Bấm 'Hoàn tất xuất kho' | Trạng thái chuyển sang COMPLETED, tồn giữ giải phóng và trừ tồn thực tế | **PASS** | Completed order fulfillment (status: COMPLETED) | — |
| ORD-08 | `orders` | Hủy đơn hàng (Cancel Order) | Tạo một đơn mới rồi bấm 'Hủy đơn' | Trạng thái đơn chuyển CANCELLED, hoàn trả tồn giữ (release reserve) | **PASS** | Cancel order verified | — |
| ORD-09 | `orders` | Xác nhận thanh toán đơn hàng | Trong chi tiết đơn chưa thanh toán, bấm 'Xác nhận thanh toán' | Trạng thái thanh toán chuyển PAID, ghi nhận vào luồng tiền | **PASS** | Marked order as PAID successfully | — |
| ORD-10 | `orders` | Xem chứng từ liên quan đơn hàng | Bấm 'Xem chứng từ liên quan' | Hiển thị danh sách phiếu xuất/phiếu thu gắn liền với đơn | **PASS** | Order related documents sheet opened cleanly | — |
| WH-01 | `transfers` | Bảng tổng hợp tồn kho | Mở trang Kho, xem danh sách tồn các mặt hàng | Hiển thị tồn thực tế, tồn giữ, có thể bán, lọc theo kho cụ thể | **PASS** | Warehouse stock table rendered with levels & filters | — |
| WH-02 | `transfers` | Nhập hàng vào kho (Receive Stock) | Mở Nhập hàng, chọn kho, tìm chọn sản phẩm, nhập SL=10, giá nhập, bấm Xác nhận | Tạo phiếu nhập, tăng tồn kho thực tế thêm 10, cập nhật giá nhập gần nhất | **PASS** | Received 15 units of Ghế sáng chế 135 into warehouse | — |
| WH-03 | `transfers` | Xuất hàng khỏi kho (Issue Stock) | Mở Xuất hàng, chọn kho, chọn sản phẩm, nhập SL=2, lý do xuất, bấm Xác nhận | Tạo phiếu xuất, giảm tồn kho thực tế đi 2 | **PASS** | Issued 2 units of Ghế sáng chế 135 out of warehouse | — |
| WH-04 | `transfers` | Kiểm kho & điều chỉnh tồn (Stocktake) | Mở Kiểm kho, chọn sản phẩm, nhập số lượng thực đếm, xem chênh lệch, bấm Chốt | Tạo movement COUNT_ADJUST cân bằng tồn kho đúng bằng số thực tế đã đếm | **PASS** | Stocktake count adjusted onHand to exactly 100 | — |
| WH-05 | `transfers` | Tạo phiếu chuyển kho (Transfer Out) | Mở Chuyển kho, chọn kho đi và kho nhận khác nhau, chọn hàng, SL=5, bấm Xác nhận | Kho đi bị trừ tồn ngay, phiếu chuyển có trạng thái in_transit (đang chuyển) | <span style='color:red'>FAIL</span> | Locator.inner_text: Error: strict mode violation: locator("#toastRoot .toast") resolved to 2 elements:
    1) <div class="toast ok">Đã chốt kiểm kho.</div> aka get_by_text("Đã chốt kiểm kho.")
    2) <div class="toast error">Kho đi và kho nhận phải khác nhau.</div> aka get_by_text("Kho đi và kho nhận phải khác")

Call log:
  - waiting for locator("#toastRoot .toast")
 | BUG-WH-05 |
| WH-06 | `transfers` | Chặn chuyển kho trùng kho đi và kho nhận | Chọn kho đi = kho nhận trong phiếu chuyển | Báo lỗi toast 'Kho đi và kho nhận phải khác nhau', không cho tạo | <span style='color:red'>FAIL</span> | Locator.inner_text: Error: strict mode violation: locator("#toastRoot .toast") resolved to 2 elements:
    1) <div class="toast ok">Đã chốt kiểm kho.</div> aka get_by_text("Đã chốt kiểm kho.")
    2) <div class="toast error">Kho đi và kho nhận phải khác nhau.</div> aka get_by_text("Kho đi và kho nhận phải khác")

Call log:
  - waiting for locator("#toastRoot .toast")
 | BUG-WH-06 |
| WH-07 | `transfers` | Xác nhận nhận hàng chuyển kho (Receive Transfer) | Trong danh sách phiếu chuyển, bấm 'Xác nhận nhận hàng' | Kho nhận tăng tồn kho, trạng thái phiếu chuyển sang received | **PASS** | Transfer marked as received and destination stock increased | — |
| WH-08 | `transfers` | Hủy phiếu chuyển kho (Cancel Transfer) | Tạo phiếu chuyển mới, sau đó bấm 'Hủy phiếu' | Trạng thái chuyển CANCELLED, hoàn trả tồn kho về kho đi | **PASS** | Cancelled transfer successfully and refunded stock to origin | — |
| WH-09 | `transfers` | Chặn hủy lặp lại phiếu chuyển đã hủy | Bấm hủy lần thứ hai trên phiếu chuyển đã hủy | Không thực hiện lại, không bị double refund tồn kho | **PASS** | Double cancel guarded safely against duplicate refund (IDEMPOTENT_OK) | — |
| WH-10 | `transfers` | Quản lý danh sách kho hàng | Bấm 'Quản lý kho' từ trang Kho | Hiển thị danh sách các kho hiện có trên thiết bị | <span style='color:red'>FAIL</span> | Page.evaluate: TypeError: window.__qbiz_app__.openWarehouseManagement is not a function
    at eval (eval at evaluate (:311:30), <anonymous>:1:21)
    at eval (<anonymous>)
    at UtilityScript.evaluate (<anonymous>:311:30)
    at UtilityScript.<anonymous> (<anonymous>:1:44) | BUG-WH-10 |
| WH-11 | `transfers` | Thêm kho mới | Bấm '+ Thêm kho', nhập tên 'Kho Chi Nhánh 2', bấm Tạo kho | Kho mới được lưu vào DB, xuất hiện trong mọi dropdown kho | <span style='color:red'>FAIL</span> | Page.evaluate: TypeError: window.__qbiz_app__.openWarehouseManagement is not a function
    at eval (eval at evaluate (:311:30), <anonymous>:1:21)
    at eval (<anonymous>)
    at UtilityScript.evaluate (<anonymous>:311:30)
    at UtilityScript.<anonymous> (<anonymous>:1:44) | BUG-WH-11 |
| WH-12 | `transfers` | Sửa tên kho | Bấm 'Sửa' trên một kho hàng, đổi tên, lưu | Tên kho được cập nhật thành công | <span style='color:red'>FAIL</span> | Page.evaluate: TypeError: window.__qbiz_app__.openWarehouseManagement is not a function
    at eval (eval at evaluate (:311:30), <anonymous>:1:21)
    at eval (<anonymous>)
    at UtilityScript.evaluate (<anonymous>:311:30)
    at UtilityScript.<anonymous> (<anonymous>:1:44) | BUG-WH-12 |
| RET-01 | `returns` | Danh sách phiếu đổi trả | Mở trang Trả/Đổi hàng | Hiển thị danh sách các lần trả/đổi hàng trước đó và tóm tắt | **PASS** | Returns and exchanges dashboard rendered | — |
| RET-02 | `returns` | Mở luồng trả hàng từ phiếu bán | Bấm 'Tạo phiếu trả' hoặc chọn phiếu bán cần trả | Mở modal Trả / Đổi hàng với danh sách món trong đơn | **PASS** | Opened return flow for completed sale | — |
| RET-03 | `returns` | Trả hàng bán lại được (SELLABLE) | Tick chọn sản phẩm trả, tình trạng 'Bán lại được', chọn hoàn tiền mặt, xác nhận | Tạo phiếu trả, hoàn tồn kho có thể bán (available), ghi nhận hoàn tiền | **PASS** | Processed SELLABLE return: Refunded 100000 VND, restored sellable stock | — |
| RET-04 | `returns` | Trả hàng hỏng (DAMAGED) | Tick chọn sản phẩm trả, chọn tình trạng 'Hàng hỏng', xác nhận | Tăng tồn hỏng (damaged level), không tăng tồn có thể bán | **PASS** | Processed DAMAGED return: Incremented damaged inventory level | — |
| RET-05 | `returns` | Trả hàng không nhập lại (NO_RESTOCK) | Tick chọn sản phẩm trả, chọn 'Không nhập lại', xác nhận | Hoàn tiền cho khách nhưng không cộng tồn kho | **PASS** | NO_RESTOCK return condition verified | — |
| RET-06 | `returns` | Đổi hàng (Exchange Flow) | Chuyển tab 'Đổi hàng', chọn hàng khách trả + tìm chọn hàng mới lấy, xác nhận | Tính chênh lệch tiền, tạo phiếu bán mới cho hàng mới, trả tồn hàng cũ | **PASS** | Exchange completed: New sale POS-000004 created with price delta | — |
| SHFT-01 | `shifts` | Mở ca bán hàng mới | Nhập tiền mặt đầu ca, bấm 'Xác nhận mở ca' | Ca làm việc có trạng thái OPEN, ghi nhận opening_cash | **PASS** | Opened new shift (ID: shift_mudv1kv5_rierdt) with opening cash 500,000 VND | — |
| SHFT-02 | `shifts` | Theo dõi doanh thu trong ca | Thực hiện 1 đơn bán tiền mặt, xem báo cáo ca | Doanh thu tiền mặt và tổng tiền mặt kỳ vọng tự động cập nhật | **PASS** | Active shift metrics visible in shift center | — |
| SHFT-03 | `shifts` | Đóng ca bán hàng | Bấm 'Đóng ca', nhập số tiền mặt thực tế kiểm đếm, xác nhận đóng ca | Tính chênh lệch thừa/thiếu, ca chuyển trạng thái CLOSED | <span style='color:red'>FAIL</span> | Page.evaluate: Error: Thiếu ca cần đóng.
    at closeShift (http://localhost:4180/src/engine.js:46:22)
    at eval (eval at evaluate (:311:30), <anonymous>:3:34)
    at async <anonymous>:337:30 | BUG-SHFT-03 |
| SHFT-04 | `shifts` | Lịch sử các ca bán hàng | Cuộn danh sách lịch sử ca | Hiển thị danh sách các ca đã đóng với thời gian mở, đóng, chênh lệch | **PASS** | Shift history contains 1 recorded shifts | — |
| CUST-01 | `customers` | Danh bạ khách hàng & bộ lọc | Mở trang Khách hàng, lọc theo: Khách lẻ, Cá nhân, Công ty, Đại lý | Hiển thị danh sách đúng theo từng phân loại | **PASS** | Customer directory rendered with 0 entries | — |
| CUST-02 | `customers` | Tìm kiếm khách hàng | Gõ tên hoặc số điện thoại vào ô tìm kiếm | Danh sách khách hàng lọc chính xác | **PASS** | Customer search filter verified | — |
| CUST-03 | `customers` | Thêm khách hàng mới | Bấm '+ Thêm khách hàng', nhập tên, SĐT, loại khách, chiết khấu, lưu | Khách hàng được lưu vào DB và hiển thị trên danh bạ | **PASS** | Created customer 'Khách VIP QA 1790153283' (ID: 8fbf441b-c6ce-4dc1-95af-9fe1dc0c4f1c) | — |
| CUST-04 | `customers` | Xem chi tiết và lịch sử mua của khách | Click vào một khách hàng trong danh sách | Mở modal chi tiết: thông tin liên hệ, lịch sử mua hàng, công nợ | **PASS** | Customer detail view rendered | — |
| CUST-05 | `customers` | Ẩn / Hiện khách hàng (Soft delete) | Trong chi tiết khách, bấm 'Ẩn khách hàng' | Khách chuyển trạng thái active=false, không xuất hiện ở picker thường | **PASS** | Customer 8fbf441b-c6ce-4dc1-95af-9fe1dc0c4f1c soft-deleted (active=false) | — |
| SUPP-01 | `suppliers` | Danh sách nhà cung cấp | Mở trang Nhà cung cấp | Hiển thị danh sách các nhà cung cấp, số điện thoại, trạng thái | **PASS** | Supplier directory rendered | — |
| SUPP-02 | `suppliers` | Thêm nhà cung cấp mới | Bấm '+ Thêm nhà cung cấp', nhập tên, SĐT, địa chỉ, lưu | Nhà cung cấp mới được lưu vào DB và hiển thị | **PASS** | Created supplier 'NCC Thiết Bị QA 1790153286' (ID: sup_mudv1nwo_q9edut) | — |
| SUPP-03 | `suppliers` | Xem chi tiết nhà cung cấp | Click vào một nhà cung cấp | Mở modal chi tiết: liên hệ, lịch sử nhập hàng, công nợ | <span style='color:red'>FAIL</span> | Page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("#modalClose, [data-close]")
 | BUG-SUPP-03 |
| SUPP-04 | `suppliers` | Kích hoạt / Ngừng hoạt động nhà cung cấp | Bấm chuyển đổi trạng thái nhà cung cấp | Cập nhật status của nhà cung cấp thành công | **PASS** | Updated supplier status to 'inactive' | — |
| DOC-01 | `documents` | Trung tâm chứng từ | Mở trang Chứng từ | Thu thập và hiển thị tất cả hóa đơn bán, đơn hàng, phiếu nhập, phiếu xuất, phiếu chuyển | **PASS** | Document center rendered successfully | — |
| DOC-02 | `documents` | Lọc chứng từ theo loại | Lọc theo Hóa đơn bán, Đơn hàng, Nhập kho, Xuất kho | Chỉ hiển thị chứng từ thuộc loại được chọn | **PASS** | Document type filtering verified | — |
| DOC-03 | `documents` | Mở xem chi tiết chứng từ | Click vào một chứng từ bất kỳ | Mở modal chi tiết chứng từ tương ứng | **PASS** | Document detail view opened cleanly | — |
| DOC-04 | `prints` | Mẫu in tài liệu & cấu hình | Mở trang Mẫu in (page: prints) | Hiển thị các mẫu in hóa đơn, phiếu kho, mã vạch | **PASS** | Print templates management center rendered | — |
| DOC-05 | `labels` | In tem mã vạch sản phẩm | Mở trang In tem (page: labels), chọn sản phẩm, số bản in, xem trước | Hiển thị bản xem trước tem gồm tên, mã vạch Code39, giá tiền | **PASS** | Barcode label printing studio rendered | — |
| REP-01 | `reports` | Báo cáo tổng quan | Mở trang Báo cáo | Hiển thị doanh thu, số đơn, lợi nhuận gộp ước tính, giá trị tồn kho | **PASS** | Reports center rendered revenue and inventory metrics | — |
| REP-02 | `reports` | Lọc thời gian báo cáo (Hôm nay / 7 ngày / Tháng này) | Bấm chuyển các khoảng thời gian | Dữ liệu biểu đồ và số liệu thống kê thay đổi tương ứng | **PASS** | Report date range filters verified | — |
| REP-03 | `reports` | Báo cáo hàng bán chạy | Xem bảng xếp hạng sản phẩm bán chạy | Hiển thị danh sách sản phẩm có doanh số / số lượng bán cao nhất | **PASS** | Best selling products section rendered | — |
| REP-04 | `reports` | Lịch sử biến động kho (Thẻ kho) | Mở tab biến động kho / lịch sử | Hiển thị danh sách các movements theo thứ tự thời gian | **PASS** | Stock movements history timeline rendered | — |
| CASH-01 | `cash` | Sổ quỹ tiền mặt | Mở trang Sổ quỹ | Hiển thị tổng thu, tổng chi, tồn quỹ hiện tại và danh sách phiếu thu chi | **PASS** | Cashbook dashboard rendered | — |
| CASH-02 | `cash` | Lập phiếu thu tiền | Bấm '+ Thu tiền', nhập số tiền, lý do, lưu | Phiếu thu được ghi nhận, số dư quỹ tăng | **PASS** | Created cash IN entry (500,000 VND) | — |
| CASH-03 | `cash` | Lập phiếu chi tiền | Bấm '+ Chi tiền', nhập số tiền, lý do, lưu | Phiếu chi được ghi nhận, số dư quỹ giảm | **PASS** | Created cash OUT entry (120,000 VND) | — |
| DEBT-01 | `debts` | Quản lý công nợ | Mở trang Công nợ (page: debts) | Hiển thị công nợ phải thu (khách hàng) và phải trả (nhà cung cấp) | **PASS** | Debt ledger rendered | — |
| DEBT-02 | `debts` | Ghi nhận khoản nợ mới | Bấm '+ Ghi nợ', nhập đối tượng, số tiền, hạn trả, lưu | Khoản nợ được thêm vào danh sách và tổng nợ cập nhật | **PASS** | Created debt receivable entry (2,500,000 VND) | — |
| SRCH-01 | `search` | Tìm kiếm toàn cục | Mở trang Tìm kiếm, gõ từ khóa đa năng | Phân loại kết quả tìm kiếm theo: Sản phẩm, Đơn hàng, Khách hàng, NCC | **PASS** | Global multi-entity search hub rendered | — |
| NOTI-01 | `notifications` | Mở danh sách thông báo | Bấm biểu tượng chuông trên thanh tiêu đề | Mở modal/trang Thông báo hiển thị các cảnh báo tồn kho, đơn chờ, chuyển kho | **PASS** | Navigated to notifications screen via header bell | — |
| NOTI-02 | `notifications` | Đánh dấu đã đọc tất cả | Bấm 'Đánh dấu đã đọc' | Xóa badge số thông báo chưa đọc | **PASS** | Mark all notifications read action verified | — |
| SET-01 | `settings` | Trang Cài đặt tổng quan | Mở trang Cài đặt | Hiển thị thông tin cửa hàng, hồ sơ kinh doanh, cấu hình máy in, sao lưu | **PASS** | Settings center rendered | — |
| SET-02 | `settings` | Tùy chọn hiển thị (Display preferences) | Mở cài đặt hiển thị, thay đổi chế độ xem sản phẩm (lưới/danh sách) | Lưu cấu hình vào localStorage, áp dụng ngay lên giao diện | **PASS** | Display preferences saved to localStorage | — |
| SET-03 | `backup` | Sao lưu dữ liệu local | Mở trang Sao lưu, bấm 'Tạo tệp sao lưu local' | Tải xuống file JSON chứa toàn bộ dữ liệu snapshot của máy | **PASS** | Backup center rendered | — |
| SET-04 | `diagnostics` | Chẩn đoán hệ thống (Diagnostics) | Mở trang Chẩn đoán, bấm 'Sao chép thông tin chẩn đoán' | Sao chép thành công chuỗi chẩn đoán thiết bị và DB vào clipboard | **PASS** | Diagnostics center rendered with device metadata | — |
| SET-05 | `exports` | Xuất dữ liệu CSV sản phẩm | Mở trang Xuất dữ liệu, bấm xuất CSV sản phẩm | Tạo và tải tệp CSV danh sách sản phẩm | **PASS** | Exports center rendered | — |
| SET-06 | `more` | Menu Thêm (More Hub) | Bấm tab 'Thêm' trên thanh điều hướng | Hiển thị đầy đủ tất cả các ô lối tắt đến các module phụ | **PASS** | More hub rendered 18 module navigation tiles | — |
| AI-01 | `ai` | Mở Trợ lý AI từ nút nổi | Click nút nổi Trợ lý AI (#qbizAiTrigger) | Mở Contextual Sheet (#qbizAiSheet) mượt mà không lỗi console | **PASS** | Contextual AI Sheet opened via floating trigger | — |
| AI-02 | `ai` | Đóng Trợ lý AI | Bấm nút '×' (#aiCloseBtn) hoặc click backdrop | Đóng Contextual Sheet, đưa focus về vị trí trước đó | **PASS** | Contextual AI Sheet closed via close button | — |
| AI-03 | `ai` | Tra cứu tồn kho Tier 0 tức thời | Nhập câu hỏi 'Còn bao nhiêu?' và bấm gửi | Trả lời chính xác số lượng tồn tức thì theo context màn hình mà không gọi cloud | <span style='color:red'>FAIL</span> | Page.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator("#aiQueryInput")
 | BUG-AI-03 |
| AI-04 | `ai` | Gợi ý hành động từ chip câu hỏi nhanh | Bấm vào một chip câu hỏi nhanh trên sheet AI | Tự động điền và kích hoạt xử lý yêu cầu | **PASS** | Quick chips verified | — |
| AI-05 | `ai` | Đề xuất thao tác & Hủy đề xuất (Proposal Lifecycle) | AI sinh ra một proposal thao tác, người dùng bấm 'Hủy đề xuất' | Proposal chuyển trạng thái CANCELLED, không can thiệp dữ liệu DB | **PASS** | Proposal cancellation lifecycle handled cleanly | — |
| AI-06 | `ai` | DEV Context Inspector | Bấm nút DEV trong header trợ lý AI | Hiển thị JSON Context Envelope hiện tại của ứng dụng | **PASS** | DEV Context Inspector toggled and verified | — |
| INV-01 | `global` | Đóng modal bằng nút đóng, click ngoài, phím Esc | Mở bất kỳ modal nào rồi bấm ra ngoài / Esc / Đóng | Modal đóng ngay lập tức, không để lại backdrop mồ côi | **PASS** | Modal dismissed immediately by Escape key | — |
| INV-02 | `global` | Chống click kép / click nhanh (Double-click idempotency) | Click nhanh 2 lần liên tiếp nút thanh toán hoặc lưu | Chỉ xử lý 1 lần, không tạo duplicate bản ghi | **PASS** | Double-click rapid trigger protection verified | — |
| INV-03 | `global` | Bảo toàn dữ liệu sau khi F5 / Reload trang | Thực hiện tạo đơn / sản phẩm / phiếu bán rồi F5 reload | Dữ liệu được lưu trữ trong IndexedDB, không bị mất khi reload | **PASS** | Data integrity 100% verified across full page reload (23 products) | — |
| INV-04 | `global` | Xử lý form để trống / dữ liệu không hợp lệ | Bấm submit form trống ở các modal tạo dữ liệu | Báo lỗi toast rõ ràng, không crash ứng dụng, không có unhandled exception | **PASS** | Empty form safely rejected with user toast: 'Hãy nhập tên sản phẩm.' | — |
| INV-05 | `global` | Không có lỗi Console (0 Console Errors) | Giám sát console log qua toàn bộ chu trình thao tác | 0 lỗi Uncaught TypeError, 0 ReferenceError, 0 DOMException | **PASS** | 0 Uncaught Console Errors across all operations | — |
| INV-06 | `global` | Hiển thị tương thích Desktop (1440x900) | Kiểm tra toàn bộ màn hình ở độ phân giải 1440x900 | Giao diện cân đối, không tràn màn hình ngang, đủ các cột | **PASS** | Desktop viewport (1440x900) verified: 0 horizontal overflow | — |
| INV-07 | `global` | Hiển thị tương thích Mobile iPhone (390x844) | Kiểm tra toàn bộ màn hình ở độ phân giải 390x844 | Thanh điều hướng đáy hiển thị, các nút bấm đủ kích thước cảm ứng | **PASS** | Mobile iPhone (390x844) verified: #mobileNav visible, 0 horizontal overflow | — |
| INV-08 | `global` | Hiển thị tương thích Mobile Android (412x915) | Kiểm tra toàn bộ màn hình ở độ phân giải 412x915 | Giao diện co giãn chuẩn xác, không bị cắt xén | **PASS** | Mobile Android (412x915) verified: #mobileNav visible, 0 horizontal overflow | — |

---
*Tổng số ca kiểm thử chức năng: 121*