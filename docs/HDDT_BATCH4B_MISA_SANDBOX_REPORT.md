# QBiz Kho — HĐĐT BATCH 4B-LIVE-R1: MISA Credential Onboarding & Template Discovery Report

**Dự án:** QBiz Kho / Bán hàng POS  
**Giai đoạn:** Batch 4B-LIVE-R1 — MISA Real Sandbox Acceptance (Provider #1: MISA meInvoice Open API Integration)  
**Tiêu chuẩn tuân thủ:** Nghị định 123/2020/NĐ-CP & Thông tư 78/2021/TT-BTC  
**Tài liệu tham chiếu:** `QBiz Kho - HĐĐT BATCH 4B-LIVE-R1 — MISA CREDENTIAL ONBOARDING & TEMPLATE DISCOVERY` (Doc ID: `1reJqq-roORbmfS3K_86fcuWnFBOc8ElUhLA8oi_kW0k`)  
**Thời gian cập nhật:** 2026-09-30T03:16:00+07:00  
**Tác giả:** Antigravity Engineering Agent  
**Trạng thái tích hợp:** `BLOCKED_WAITING_CREDENTIALS` (Chưa cấu hình credential Sandbox thật trong biến môi trường server; không dùng Mock thay thế)  
**Sẵn sàng cho Batch 4C Production:** `NO`  

---

## 1. Mục tiêu & Kiến trúc 2 Gate (Two-Stage Preflight Protocol)

Theo yêu cầu của tài liệu **BATCH 4B-LIVE-R1**, runner kiểm thử sandbox thực tế được thiết kế lại thành quy trình 2 chốt chặn rõ ràng nhằm giải phóng Owner khỏi việc phải đoán trước ký hiệu series (`InvSeries`) và mã mẫu hóa đơn (`InvTemplateNo`):

### Gate A — Connect + Discover (Kết nối & Khám phá mẫu hóa đơn thật từ MISA)
- **Biến môi trường bắt buộc:**
  ```ini
  MISA_APP_ID=<AppID do MISA cấp>
  MISA_TAX_CODE=<Mã số thuế tài khoản Sandbox>
  MISA_USERNAME=<Tên đăng nhập meInvoice>
  MISA_PASSWORD=<Mật khẩu đăng nhập meInvoice>
  QBIZ_INVOICE_PROVIDER=MISA_MEINVOICE
  ```
- **Không bắt buộc ở Gate A:** `MISA_TEMPLATE_CODE`, `MISA_INVOICE_SERIES`, `MISA_SIGN_TYPE`.
- **Thực thi:**
  1. **M01 AUTH:** `POST {BaseURL}/auth/token` lấy Bearer Token thực tế từ MISA.
  2. **A02 TEMPLATE DISCOVERY:**
     - Gọi song song `GET {BaseURL}/invoice/templates?invoiceWithCode=true&ticket=false` và `GET {BaseURL}/invoice/templates?invoiceWithCode=false&ticket=false`.
     - Hợp nhất (merge), loại trừ trùng lặp, phân tách mẫu `Active` và `Inactive`.
     - Phân tích ký hiệu Nghị định 123: Ký tự thứ 2 (`C` -> Có mã CQT, `K` -> Không mã), Ký tự thứ 5 (`T` -> Hóa đơn thường, `M` -> Máy tính tiền MTT).
     - Định dạng bảng metadata an toàn (Zero Secret Leakage):
       `SERIES | TEMPLATE_NO | WITH_CODE | CALCULATING_MACHINE | ACTIVE | TEMPLATE_NAME`
  3. **Chốt chặn an toàn:**
     - Nếu không có mẫu Active: Dừng với `BLOCKED_NO_ACTIVE_TEMPLATE`.
     - Nếu chưa có `MISA_INVOICE_SERIES` và `MISA_SIGN_TYPE`: Dừng với `READY_FOR_OWNER_TEMPLATE_SELECTION=YES`. Tuyệt đối không tự ý chọn series thay Owner khi có nhiều lựa chọn.

### Gate B — Issue Acceptance (Kiểm thử phát hành hóa đơn thật M02–M09)
- **Kích hoạt:** Chỉ sau khi Gate A thành công và Owner/Provider cấu hình lựa chọn:
  - `MISA_INVOICE_SERIES`: 1 trong các ký hiệu Active được liệt kê từ Gate A.
  - `MISA_SIGN_TYPE`: Khớp hình thức ký số của tài khoản MISA (1=USB/File mềm, 2=HSM có hiển thị CKS, 5=Ký sau MTT).
  - `MISA_TEMPLATE_CODE`: **KHÔNG BẮT BUỘC OWNER NHẬP**. Runner và Adapter tự động trích xuất `InvTemplateNo` từ bản ghi template tương ứng trong danh sách đã khám phá từ MISA API.
- **Thực thi:** M02 (Phát hành gốc), M03 (Idempotency Replay), M04 (Tra cứu trạng thái), M05 (Tải XML), M06 (Tải PDF), M07 (Hóa đơn điều chỉnh), M08 (Hóa đơn thay thế), M09 (Đối soát Reconcile sau timeout).

---

## 2. Kiểm tra Môi trường Hiện tại

Kết quả kiểm tra biến môi trường tại thời điểm chạy:
- `MISA_APP_ID`: CHƯA CẤU HÌNH
- `MISA_TAX_CODE`: CHƯA CẤU HÌNH
- `MISA_USERNAME`: CHƯA CẤU HÌNH
- `MISA_PASSWORD`: CHƯA CẤU HÌNH
- `QBIZ_INVOICE_PROVIDER`: CHƯA CẤU HÌNH

Hệ thống tuân thủ nghiêm ngặt quy định:
- Dừng ngay lập tức với mã lỗi `BLOCKED_WAITING_CREDENTIALS` (Exit Code 2).
- Không gọi ra ngoài Internet khi thiếu thông tin xác thực.
- Tuyệt đối **KHÔNG dùng Mock** để giả mạo kết quả PASS cho M01–M09.

---

## 3. Kết quả Kiểm thử Tiêu cực (Negative Controls M10–M12)

Lệnh chạy: `python -u tests/test_hddt_batch4b_misa_real_sandbox.py`

1. **M10: Auth Failure Control (Missing Credentials Protection)**
   - Thao tác phát hành khi thiếu credential bị từ chối ở tầng Gateway với HTTP 401 `AUTH_ERROR` (`MISSING_MISA_CREDENTIALS`).
   - Kết quả: **PASS**.
2. **M11: Provider-Off Control (Service Isolation)**
   - Khi endpoint MISA không kết nối được hoặc bị ngắt -> Chuẩn hóa an toàn thành `PROVIDER_UNAVAILABLE`.
   - Kết quả: **PASS**.
3. **M12: Cross-Tenant Isolation**
   - Shop A cố gắng thao tác hóa đơn của Shop B bị từ chối với HTTP 403 `FORBIDDEN_TENANT_ACCESS`.
   - Kết quả: **PASS**.

---

## 4. Kết quả Bộ Kiểm thử Đơn vị Chuyên biệt P01–P07

File kiểm thử: [`tests/test_hddt_batch4b_live_r1_discovery.js`](file:///d:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/tests/test_hddt_batch4b_live_r1_discovery.js)  
Kết quả: **7/7 PASS (100%)**

| Mã Test | Mô tả theo Đặc tả Batch 4B-LIVE-R1 | Trạng thái | Ghi chú kiểm chứng |
| :--- | :--- | :---: | :--- |
| **P01** | No auth creds => blocked before network call | **PASS** | `hasCredentials() === false`, ném `MISSING_MISA_CREDENTIALS` trước khi gọi fetch |
| **P02** | Auth creds present, no series/sign type => runner attempts only M01+A02, not issue | **PASS** | Chỉ gọi `/auth/token` và `/invoice/templates`, không gọi `/invoice` issue; dừng với `READY_FOR_OWNER_TEMPLATE_SELECTION=YES` |
| **P03** | Template discovery parses active InvSeries correctly (char 2 & char 5) | **PASS** | Phân tích chính xác `withCode` (ký tự 2 C/K), `invoiceCalcu` (ký tự 5 M/T), nhãn nghiệp vụ |
| **P04** | Multiple templates => no automatic owner selection | **PASS** | Khi có nhiều mẫu active, không tự ý chọn thay Owner |
| **P05** | Inactive templates excluded from selectable list | **PASS** | Các mẫu `Inactive: true` được tách riêng, không xuất hiện trong `activeTemplates` |
| **P06** | Series/sign type missing => M02 not executed | **PASS** | `validateSignType` từ chối an toàn với `CONFIG_UNRESOLVED` hoặc `MISSING_SIGNTYPE` |
| **P07** | No secret or token in output | **PASS** | Không lộ mật khẩu, token Bearer trong log hoặc bảng hiển thị |

---

## 5. Chỉ số An toàn Nghiệp vụ (Business Safety Metrics)

- `SALE_ROLLBACK_ON_PROVIDER_ERROR = 0`
- `STOCK_MUTATION_FROM_PROVIDER = 0`
- `PAYMENT_MUTATION_FROM_PROVIDER = 0`
- `INVENTORY_LEDGER_MUTATION_FROM_PROVIDER = 0`
- `DUPLICATE_ORIGINAL_INVOICE = 0`
- `BLIND_REISSUE_AFTER_TIMEOUT = 0`
- `SECRET_LEAK_COUNT = 0`
- `CROSS_TENANT_PROVIDER_LEAK_COUNT = 0`

---

## 6. Final Status Block (Batch 4B-LIVE-R1)

```ini
LIVE_PREFLIGHT_TWO_STAGE=YES
TEMPLATE_SOURCE=MISA_INVOICE_TEMPLATES_API
MANUAL_SERIES_GUESS_REQUIRED=NO
MISA_TEMPLATE_CODE_REQUIRED=NO

M01_AUTH=BLOCKED (MISSING_CREDENTIALS)
A02_TEMPLATE_DISCOVERY=BLOCKED (MISSING_CREDENTIALS)
M02_ORIGINAL_ISSUE=BLOCKED (MISSING_CREDENTIALS)
M03_IDEMPOTENT_REPLAY=BLOCKED (MISSING_CREDENTIALS)
M04_STATUS=BLOCKED (MISSING_CREDENTIALS)
M05_XML_DOWNLOAD=BLOCKED (MISSING_CREDENTIALS)
M06_PDF_DOWNLOAD=BLOCKED (MISSING_CREDENTIALS)
M07_ADJUST=BLOCKED (MISSING_CREDENTIALS)
M08_REPLACE=BLOCKED (MISSING_CREDENTIALS)
M09_TIMEOUT_RECONCILE=BLOCKED (MISSING_CREDENTIALS)
M10_AUTH_FAILURE_CONTROL=PASS
M11_PROVIDER_OFF_CONTROL=PASS
M12_CROSS_TENANT_CONTROL=PASS

REAL_MISA_SANDBOX=BLOCKED
BLOCKED_REASON=WAITING_REAL_MISA_SANDBOX_CREDENTIALS
MISSING_VARIABLES=MISA_APP_ID,MISA_TAX_CODE,MISA_USERNAME,MISA_PASSWORD,QBIZ_INVOICE_PROVIDER
VERDICT=BLOCKED
READY_FOR_BATCH4C_PRODUCTION_READINESS=NO

PUSH_COUNT=0
DEPLOY_COUNT=0
```

---

## 7. Hướng dẫn Kích hoạt 2 Gate khi Owner có Credential MISA Sandbox

### Bước 1 (Gate A): Cấu hình 4 thông tin xác thực
Chỉ cần set 4 biến xác thực cơ bản trong terminal/server:
```bash
export MISA_APP_ID="<AppID_MISA>"
export MISA_TAX_CODE="<MST_MISA_Sandbox>"
export MISA_USERNAME="<Username_MISA>"
export MISA_PASSWORD="<Password_MISA>"
export QBIZ_INVOICE_PROVIDER="MISA_MEINVOICE"
```
Chạy runner:
```bash
python -u tests/test_hddt_batch4b_misa_real_sandbox.py
```
Runner sẽ thực hiện xác thực và in ra bảng mẫu hóa đơn/ký hiệu thật từ MISA:
```
SERIES    | TEMPLATE_NO | WITH_CODE  | CALCULATING_MACHINE | ACTIVE          | TEMPLATE_NAME
1C26TDC   | 1           | CÓ (C)     | KHÔNG (T - Thường)  | YES (Hoạt động) | Hóa đơn GTGT có mã CQT
```
Và thông báo `READY_FOR_OWNER_TEMPLATE_SELECTION=YES`.

### Bước 2 (Gate B): Cấu hình Series & SignType đã chọn
Sau khi xem danh sách ở Gate A, Owner chọn 1 ký hiệu phù hợp và hình thức ký số:
```bash
export MISA_INVOICE_SERIES="1C26TDC" # Chọn từ bảng trên
export MISA_SIGN_TYPE=2 # 2=HSM có CKS, 5=Ký sau MTT
```
*(Lưu ý: `MISA_TEMPLATE_CODE` không cần điền, hệ thống tự động gán từ bảng mẫu).*  
Chạy lại:
```bash
python -u tests/test_hddt_batch4b_misa_real_sandbox.py
```
Runner sẽ tự động hoàn tất toàn bộ M02–M09 trên sandbox MISA thật.
