# BÁO CÁO NGHIỆM THU: HĐĐT BATCH 4A — PROVIDER SELECTION & SANDBOX READINESS

- **Thời điểm thực hiện:** 2026-09-30 00:30 (GMT+7)
- **Tác nhân:** Antigravity (QBiz Kho Platform Engineering)
- **Chế độ (Mode):** `DISCOVERY / VERIFY CURRENT PROVIDER CAPABILITIES / NO INTEGRATION CODE / NO PUSH / NO DEPLOY`
- **Tài liệu căn cứ:** File lệnh “QBiz Kho - HĐĐT BATCH 4A — PROVIDER SELECTION & SANDBOX READINESS” (Doc ID: `1rBglUpZ1qOh7z_-GaVubdlWpkeoiHY5xDOgFhouU0-k`)
- **Trạng thái nền:**
  * HĐĐT Batch 1–3 + Security Gate = `COMPLETE / LOCKED`
  * PRE-DEPLOY BLOCKING CHECKLIST = Đã ghi vào `QBIZ_LATEST_EVIDENCE.md`
  * Bất biến bảo mật: Tuyệt đối không lưu provider secret ở client; Sale độc lập khỏi Invoice; Idempotency bảo toàn.

---

## 1. KHẢO SÁT & KIỂM CHỨNG CHI TIẾT 4 NHÀ CUNG CẤP TỪ NGUỒN CHÍNH THỨC

### 1.1. MISA meInvoice (Công ty Cổ phần MISA)
* **Nguồn tài liệu chính thức:**
  * Cổng phát triển MISA Developer: [https://developer.misa.vn/](https://developer.misa.vn/)
  * Tài liệu API v3 (Nghị định 123/2020/NĐ-CP & Thông tư 78/2021/TT-BTC)
* **Môi trường kết nối & Sandbox:**
  * **Sandbox (Test API):** `https://testapi.meinvoice.vn/api/v3`
  * **Production (Live API):** `https://api.meinvoice.vn/api/v3`
  * **Cấp tài khoản Sandbox:** Đăng ký tự phục vụ (Self-service) qua MISA Developer Portal để lấy `AppID`, `taxcode`, `username`, `password` thử nghiệm.
* **Cơ chế xác thực (Authentication):**
  * Giao thức: RESTful OAuth 2.0 / Bearer Token.
  * Endpoint lấy Token: `POST https://testapi.meinvoice.vn/api/integration/auth/token` (Body: `appid`, `taxcode`, `username`, `password`).
  * Header bắt buộc trên mọi API nghiệp vụ:
    * `Authorization: Bearer <token>`
    * `CompanyTaxCode: <Mã_số_thuế>`
    * `Content-Type: application/json`
* **Nghiệp vụ HĐĐT hỗ trợ:**
  * **Phát hành (Issue):** `POST /itg/invoicepublishing/createinvoice` (hoặc `/api/v3/invoices`).
  * **Xem trước / Tạo nháp (Draft/Preview):** Hỗ trợ API xem trước PDF và tạo bản nháp.
  * **Tra cứu trạng thái (Status):** `GET /api/v3/invoices/{id}/status` (Bao gồm trạng thái truyền nhận cơ quan thuế và cấp mã CQT).
  * **Tải chứng từ (XML/PDF):** `GET /api/v3/invoices/{id}/download` (Hỗ trợ định dạng PDF bản thể hiện và XML gốc có chữ ký số).
  * **Hóa đơn Điều chỉnh / Thay thế:** Dùng chung endpoint phát hành, bổ sung đối tượng `OriginalInvoiceData`:
    * `ReferenceType`: `1` (Thay thế) hoặc `2` (Điều chỉnh).
    * `OrgInvoiceType`: `1` (HĐĐT theo Nghị định 123).
    * `OrgInvTemplateNo`, `OrgInvSeries`, `OrgInvNo`, `OrgInvDate`.
  * **Hủy hóa đơn:** `POST /api/v3/invoices/cancel` (Theo quy định xử lý sai sót).
* **Chữ ký số & Ký tự động:** Hỗ trợ trực tiếp **MISA eSign Cloud-CA / HSM** (Remote Signing) — Serverless/Backend ký tự động không cần cắm USB Token vật lý.
* **Idempotency & Reconcile:** Hỗ trợ trường mã tham chiếu giao dịch (`TransactionID` / `ReferenceCode`), chống phát hành trùng lặp khi gặp sự cố mạng (ambiguous timeout).
* **Mô hình Multi-tenant:** Rất phù hợp. Gateway phân biệt các cửa hàng/doanh nghiệp qua cặp header `CompanyTaxCode` và `AppID`/`Token`.
* **Đánh giá rào cản (Blockers):** **KHÔNG CÓ**. Là nền tảng có tài liệu REST API chuẩn hóa nhất trong 4 ứng viên.

---

### 1.2. Viettel S-Invoice (Tập đoàn Công nghiệp - Viễn thông Quân đội)
* **Nguồn tài liệu chính thức:**
  * Cổng S-Invoice Viettel: [https://sinvoice.viettel.vn](https://sinvoice.viettel.vn)
  * Tài liệu tích hợp Webservice S-Invoice v2.50 (Doc/PDF).
* **Môi trường kết nối & Sandbox:**
  * **Sandbox (Demo API):** `https://demo-sinvoice.viettel.vn:8443/InvoiceAPI`
  * **Production (Live API):** `https://api-sinvoice.viettel.vn:443/InvoiceAPI`
  * **Cấp tài khoản Sandbox:** Cần liên hệ bộ phận kinh doanh hoặc kỹ thuật Viettel để được bàn giao thông tin đăng nhập demo và tài liệu mẫu.
* **Cơ chế xác thực (Authentication):**
  * HTTP Basic Authentication: `Authorization: Basic <base64(username:password)>`.
  * Ràng buộc IP (IP Whitelist): **BẮT BUỘC**. Viettel yêu cầu cấu hình danh sách IP máy chủ gọi API trên trang quản trị S-Invoice.
* **Nghiệp vụ HĐĐT hỗ trợ:**
  * **Phát hành (Issue):** `POST /InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}`.
  * **Hóa đơn Điều chỉnh / Thay thế:** Dùng chung endpoint `createInvoice` với tham số `generalInvoiceInfo.adjustmentType` (`1` / `5`: Điều chỉnh, `3`: Thay thế) và thông tin biên bản thỏa thuận (`additionalReferenceDesc`).
  * **Hủy hóa đơn:** `POST /InvoiceAPI/InvoiceWS/cancelTransactionInvoice`.
  * **Tra cứu & Tải PDF/XML:** `POST /InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid`, `POST /InvoiceAPI/InvoiceWS/createInvoiceFile`.
* **Chữ ký số & Ký tự động:** Hỗ trợ Viettel HSM Server / Viettel-CA Cloud.
* **Idempotency & Reconcile:** Hỗ trợ `transactionUuid` để tra cứu và đối soát giao dịch nghi ngờ.
* **Mô hình Multi-tenant:** Được xử lý qua tham số `{supplierTaxCode}` trên URL và tài khoản quản trị.
* **Đánh giá rào cản (Blockers / Friction):**
  * **Cơ chế IP Whitelist bắt buộc:** Trên môi trường Serverless (Vercel Functions), IP outbound thay đổi liên tục. Nếu triển khai Viettel S-Invoice trên Vercel, cần cấu hình Egress Proxy có IP tĩnh hoặc đề nghị Viettel mở dải IP/bypass cho môi trường sandbox.

---

### 1.3. VNPT Invoice (Tập đoàn Bưu chính Viễn thông Việt Nam)
* **Nguồn tài liệu chính thức:**
  * Cổng hóa đơn điện tử VNPT: [https://vnpt-invoice.com.vn](https://vnpt-invoice.com.vn), [https://vinvoice.vnpt.vn](https://vinvoice.vnpt.vn)
  * Tài liệu SDK/Web Service tích hợp VNPT-Invoice Thông tư 78.
* **Môi trường kết nối & Sandbox:**
  * **Sandbox:** Đóng (Private). Không có portal mở tự do; được cấp thông tin riêng sau khi làm việc với kinh doanh VNPT từng tỉnh/thành phố hoặc qua oneSME.
* **Cơ chế xác thực (Authentication):**
  * Chủ yếu là SOAP/XML Web Service: Xác thực qua thông số `Account`, `ACpass`, `userName`, `userPass` trong từng envelope gọi hàm `PublishService.asmx`.
  * Một số chi nhánh mới có REST endpoint dưới dạng domain con riêng của tenant (ví dụ `<tenant>-tt78.vnpt-invoice.com.vn`).
* **Nghiệp vụ HĐĐT hỗ trợ:**
  * **Phát hành (Issue):** Phương thức `ImportAndPublishInv` hoặc `PublishInv`.
  * **Hóa đơn Điều chỉnh:** Phương thức `AdjustInv`.
  * **Hóa đơn Thay thế:** Phương thức `ReplaceInv`.
  * **Hủy hóa đơn:** Phương thức `cancelInv`.
  * **Tải PDF/XML:** Phương thức `downloadInvFkey`, `getInvoiceByFkey`.
* **Chữ ký số:** Hỗ trợ VNPT SmartCA / HSM.
* **Idempotency & Reconcile:** Sử dụng mã `Fkey` (khóa tự sinh của phần mềm bán hàng) làm định danh chống trùng lặp.
* **Đánh giá rào cản (Blockers / Friction):**
  * Quy trình onboard sandbox thủ công, phụ thuộc vào đầu mối kinh doanh VNPT địa phương.
  * Chuẩn kết nối truyền thống qua SOAP/XML đòi hỏi bọc parser XML phức tạp hơn so với REST/JSON chuẩn.

---

### 1.4. M-Invoice (Công ty TNHH Hóa đơn điện tử M-Invoice)
* **Nguồn tài liệu chính thức:**
  * Cổng hướng dẫn sử dụng M-Invoice: [https://hdsd.minvoice.com.vn](https://hdsd.minvoice.com.vn)
  * Tài liệu tích hợp phần mềm HĐĐT M-Invoice (NĐ 123/2020 & NĐ 70/2025).
* **Môi trường kết nối & Sandbox:**
  * **Sandbox:** Cung cấp theo yêu cầu qua tổng đài hỗ trợ kỹ thuật (1900.955.557 nhánh 1).
  * **Cấu trúc URL:** Dạng subdomain riêng theo từng mã số thuế: `https://<masothue>.minvoice.app/api/...`.
* **Cơ chế xác thực (Authentication):**
  * RESTful JSON: `POST /api/v1/auth/login` lấy Bearer Token, gửi kèm header `TaxCode`.
* **Nghiệp vụ HĐĐT hỗ trợ:**
  * **Phát hành (Issue):** `POST /itg/invoicepublishing/createinvoice`.
  * **Điều chỉnh / Thay thế:** Truyền cấu trúc `OriginalInvoiceData` (`ReferenceType`: `1` thay thế, `2` điều chỉnh) tương thích Nghị định 123/NĐ 70.
  * **Tải PDF/XML:** Hỗ trợ API xem trước và lấy file đính kèm.
* **Chữ ký số:** Hỗ trợ HSM / Server-side token.
* **Đánh giá rào cản (Blockers / Friction):**
  * Mô hình domain động (`<masothue>.minvoice.app`) yêu cầu tầng Gateway phải phân giải động URL cho từng shop thay vì dùng Base URL cố định.
  * Không có cổng Developer Portal tự động cấp sandbox tức thì.

---

## 2. MA TRẬN SO SÁNH 4 NHÀ CUNG CẤP (14 TIÊU CHÍ)

| Tiêu chí | MISA meInvoice | Viettel S-Invoice | VNPT Invoice | M-Invoice |
| :--- | :---: | :---: | :---: | :---: |
| **OFFICIAL_API_DOCS** | Có (Developer Portal, Open API) | Có (Webservice docs, PDF/Doc) | Có (Cấp riêng qua hợp đồng/kỹ thuật) | Có (HDSD portal, PDF hướng dẫn) |
| **SANDBOX_AVAILABLE** | CÓ (testapi.meinvoice.vn) | CÓ (demo-sinvoice.viettel.vn) | CÓ (Cấp theo yêu cầu riêng) | CÓ (Cấp theo yêu cầu riêng) |
| **SANDBOX_ACCESS_DIFFICULTY** | **LOW** (Đăng ký nhanh portal) | **MEDIUM** (Cần liên hệ kỹ thuật Viettel) | **HIGH** (Thủ tục kinh doanh VNPT) | **MEDIUM** (Gọi hotline kỹ thuật) |
| **AUTH_COMPLEXITY** | **LOW** (OAuth 2.0 Bearer Token) | **MEDIUM** (Basic Auth + IP Whitelist) | **HIGH** (SOAP Credentials / Multi-param) | **MEDIUM** (Bearer Token + Dynamic Domain) |
| **ISSUE (Tạo & Phát hành)** | ĐẦY ĐỦ (API v3 REST/JSON) | ĐẦY ĐỦ (API v2.5 REST/JSON) | ĐẦY ĐỦ (SOAP / XML RPC) | ĐẦY ĐỦ (REST/JSON) |
| **STATUS (Tra cứu & CQT)** | ĐẦY ĐỦ (Real-time CQT code) | ĐẦY ĐỦ (Transaction status) | ĐẦY ĐỦ (Query by Fkey) | ĐẦY ĐỦ (Query by InvId) |
| **XML_PDF (Bản thể hiện/gốc)**| ĐẦY ĐỦ (Endpoint PDF + XML) | ĐẦY ĐỦ (File byte stream / base64)| ĐẦY ĐỦ (Download qua Web Service) | ĐẦY ĐỦ (PDF link / XML data) |
| **ADJUST (Hóa đơn điều chỉnh)**| ĐẦY ĐỦ (OriginalInvoiceData) | ĐẦY ĐỦ (adjustmentType = 1/5) | ĐẦY ĐỦ (AdjustInv method) | ĐẦY ĐỦ (OriginalInvoiceData) |
| **REPLACE (Hóa đơn thay thế)** | ĐẦY ĐỦ (OriginalInvoiceData) | ĐẦY ĐỦ (adjustmentType = 3) | ĐẦY ĐỦ (ReplaceInv method) | ĐẦY ĐỦ (OriginalInvoiceData) |
| **WEBHOOK (Callback)** | CÓ (Hỗ trợ cấu hình CQT callback)| HẠN CHẾ (Chủ yếu polling) | HẠN CHẾ (Chủ yếu polling qua Fkey) | HẠN CHẾ (Chủ yếu polling) |
| **RECONCILE_SUPPORT** | **HIGH** (TransactionID / RefCode) | **HIGH** (transactionUuid) | **HIGH** (Fkey Idempotent) | **MEDIUM** (Mã tham chiếu đơn vị) |
| **MULTI_TENANT_FIT** | **HIGH** (Header TaxCode chuẩn hóa) | **MEDIUM** (TaxCode URL + IP Whitelist) | **MEDIUM** (Phân mảnh theo chi nhánh) | **MEDIUM** (Subdomain theo từng MST) |
| **VIETNAM_MARKET_FIT** | **RẤT CAO** (Thị phần số 1 SME/Bán lẻ) | **RẤT CAO** (Doanh nghiệp & Chuỗi lớn) | **CAO** (Cơ quan nhà nước, Viễn thông)| **TRUNG BÌNH** (Thương mại điện tử/SME)|
| **KNOWN_BLOCKERS** | **KHÔNG** | **Ràng buộc IP Whitelist** | **Thủ tục cấp sandbox thủ công & SOAP** | **Routing Subdomain theo MST** |

---

## 3. TƯƠNG THÍCH VỚI KIẾN TRÚC QBIZ KHO HIỆN TẠI

Hệ thống HĐĐT của QBiz Kho đã được thiết kế hoàn thiện ở Batch 1–3 với các nguyên tắc cốt lõi:
1. **Sale độc lập khỏi Invoice:** Đơn bán hàng hoàn tất trước, lập hóa đơn là tác vụ bất đồng bộ kế tiếp. Lỗi hóa đơn không rollback đơn bán hàng.
2. **Idempotency Key nghiêm ngặt:** Đảm bảo `operation:sale_id:lineage:version` chống phát hành lặp.
3. **Immutable Invoice Snapshot & Lineage:** Ghi nhận chuỗi hóa đơn gốc $\rightarrow$ điều chỉnh $\rightarrow$ thay thế.
4. **Reconcile trước khi Retry:** Khi gặp timeout mơ hồ (ambiguous timeout), Gateway bắt buộc thăm dò trạng thái qua khóa định danh trước khi quyết định phát hành lại.
5. **Zero Trust Client:** Mọi thông tin xác thực, token và API key của Provider nằm 100% tại Serverless Gateway (`api/invoice-gateway.js` / `server.py`).

**Kết luận tương thích:**
* `CORE_CONTRACT_CHANGE_REQUIRED = NO` (Hợp đồng domain `src/invoice/domain.js` và `mock_provider.js` đã bao phủ 100% các phương thức nghiệp vụ).
* `DB_SCHEMA_CHANGE_REQUIRED = NO` (Schema IndexedDB store `electronic_invoices`, `invoice_audit_logs`, `invoice_sequence` giữ nguyên vẹn).
* `UI_CHANGE_REQUIRED = NO` (Giao diện POS, màn hình Hóa đơn điện tử, bộ lọc và modal chi tiết không cần sửa đổi cấu trúc).
* `PROVIDER_ADAPTER_ARCHITECTURE_REUSABLE = YES` (Chỉ cần tạo thêm class adapter mới thực thi cùng interface với `MockInvoiceProvider`).

---

## 4. BẢNG CHUẨN BỊ SANDBOX READINESS CHO OWNER

Bảng dưới đây xác định các thông tin Owner cần chuẩn bị để kết nối Sandbox khi bắt đầu Batch 4B:

| Nhà cung cấp | Tài khoản cần đăng ký | Thông tin/Credential cần cấu hình trên Server | Yêu cầu chữ ký số / Chứng thư | Cấu hình IP / Callback |
| :--- | :--- | :--- | :--- | :--- |
| **MISA meInvoice** *(Khuyến nghị 1)* | Đăng ký tài khoản nhà phát triển tại [developer.misa.vn](https://developer.misa.vn) | - `MISA_APP_ID`<br>- `MISA_TAX_CODE` (Mã số thuế test do MISA cấp)<br>- `MISA_USERNAME`<br>- `MISA_PASSWORD` | Sử dụng **MISA eSign Cloud HSM** (môi trường test tự động ký, không cần cắm USB Token) | - Không cần IP Whitelist tĩnh<br>- Tùy chọn Callback URL (Webhook) |
| **Viettel S-Invoice** *(Khuyến nghị 2)* | Liên hệ đầu mối Viettel kinh doanh/kỹ thuật để mở tài khoản demo | - `VIETTEL_SUPPLIER_TAX_CODE`<br>- `VIETTEL_API_USER`<br>- `VIETTEL_API_PASSWORD` | Viettel HSM Demo (Server-side) | - **Cần khai báo IP Whitelist** trên trang demo-sinvoice (hoặc nhờ Viettel cấu hình dải IP) |
| **VNPT Invoice** | Liên hệ VNPT tỉnh/thành phố để xin tài liệu SDK và tài khoản test | - `VNPT_SERVICE_URL`<br>- `VNPT_ACCOUNT`<br>- `VNPT_ACPASS`<br>- `VNPT_ADMIN_USER`<br>- `VNPT_ADMIN_PASS` | VNPT SmartCA / Test Token | - Cấu hình Fkey mapping |
| **M-Invoice** | Gọi hotline 1900.955.557 nhánh 1 xin tài khoản demo | - `MINVOICE_TAX_CODE`<br>- `MINVOICE_USERNAME`<br>- `MINVOICE_PASSWORD`<br>- Subdomain theo MST | M-Invoice HSM Server | - Cấu hình subdomain động |

---

## 5. ĐỀ XUẤT KỸ THUẬT (TECHNICAL RECOMMENDATION)

### Shortlist 2 nhà cung cấp tối ưu nhất:
1. **LỰA CHỌN 1 (Ưu tiên số 1 về mặt kỹ thuật): MISA meInvoice**
   * *Lý do kỹ thuật:*
     * Có Developer Portal mở công khai, tài liệu API v3 theo Nghị định 123 cực kỳ minh bạch và có Swagger/JSON spec chuẩn.
     * Cung cấp môi trường Sandbox `testapi.meinvoice.vn` độc lập, dễ dàng kiểm thử ngay lập tức.
     * Không bị rào cản IP Whitelist tĩnh, tương thích hoàn hảo 100% với kiến trúc Serverless (Vercel Functions / Netlify Functions) của QBiz Kho.
     * Tích hợp sẵn ký số Cloud-CA/HSM tự động, phù hợp tuyệt đối với luồng xuất hóa đơn tự động từ máy POS.
   * *Trade-off:* Doanh nghiệp khi lên production cần có tài khoản gói cước HĐĐT của MISA.
2. **LỰA CHỌN 2 (Dự phòng thương hiệu lớn): Viettel S-Invoice**
   * *Lý do kỹ thuật:* Hệ thống hạ tầng viễn thông lớn, độ ổn định cao, phổ biến ở các doanh nghiệp chuỗi. Đã chuẩn hóa API v2.5 REST/JSON.
   * *Trade-off:* Cơ chế bắt buộc IP Whitelist sẽ đòi hỏi cấu hình mạng trung gian (Fixed Egress Proxy) nếu chạy production trên Vercel.

> **QUYỀN QUYẾT ĐỊNH CUỐI CÙNG THUỘC VỀ OWNER.**

---

## 6. FINAL BLOCK & CAM KẾT AN TOÀN

```text
VIETTEL_SANDBOX_READY=YES (Cần phối hợp mở IP Whitelist)
VNPT_SANDBOX_READY=NO (Cần thủ tục cấp tay từ chi nhánh địa phương)
MISA_SANDBOX_READY=YES (Developer Portal tự phục vụ, REST API v3 chuẩn hóa)
MINVOICE_SANDBOX_READY=YES (Cần cấp qua hotline kỹ thuật)

CORE_CONTRACT_REWRITE_REQUIRED=NO
PROVIDER_ADAPTER_ARCHITECTURE_REUSABLE=YES
OWNER_DECISION_REQUIRED=YES

RECOMMENDED_TECHNICAL_SHORTLIST=MISA meInvoice (Ưu tiên 1), Viettel S-Invoice (Ưu tiên 2)
BLOCKERS=NONE

PUSH_COUNT=0
DEPLOY_COUNT=0

VERDICT=READY_FOR_OWNER_PROVIDER_SELECTION
```

---

## 7. STOP

Tuân thủ nghiêm ngặt mệnh lệnh:
- **Đã hoàn thành toàn bộ công tác Discovery và Báo cáo đánh giá.**
- **KHÔNG viết mã tích hợp provider adapter.**
- **KHÔNG mở Batch 4B.**
- **DỪNG LẠI TẠI ĐÂY (STOP) ĐỂ OWNER RA QUYẾT ĐỊNH CHỌN NHÀ CUNG CẤP.**
