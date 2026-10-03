# QBIZ KHO — BÁO CÁO KẾT NỐI NĂNG LỰC & THỰC THI BẰNG CHỨNG
**AI MIGRATION PHASE 2: CAPABILITY BRIDGE & EVIDENCE EXECUTION**

- **Ngày thực hiện:** 2026-10-01
- **Môi trường:** CODE_ROOT (`D:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\app`)
- **Tài liệu căn cứ:** `QBiz Kho - AI MIGRATION PHASE 2 - CAPABILITY BRIDGE & EVIDENCE EXECUTION.gdoc`
- **Nguyên tắc thực thi:** `NO LANGUAGE TEST MATRIX / NO REGEX PATCHING / NO MASS DELETION OF LEGACY ROUTER / NO PUSH / NO DEPLOY`

---

## 1. TỔNG QUAN MỤC TIÊU PHASE 2 ĐÃ HOÀN THÀNH

Trong Phase 2, toàn bộ hệ thống Kho AI đã hoàn tất việc kết nối giữa bộ lập kế hoạch ngữ nghĩa (**Semantic Planner**) với kho công cụ nghiệp vụ thực tế (**Tools & Skills**), thiết lập cơ chế giải quyết thực thể tất định (**Resolver**), chốt chặn mơ hồ (**Ambiguity Guard**), thực thi tuần tự nhiều ý định đọc (**Multi-Read Execution DAG**), bảo vệ bất biến ghi chép (**Proposal-Only Write**), và kiểm toán bằng chứng dữ liệu (**Evidence Engine & Verifier**).

---

## 2. CHI TIẾT CÁC HẠNG MỤC KIẾN TRÚC ĐÃ TRIỂN KHAI

### 2.1. Cầu nối Danh mục Năng lực Chuẩn hóa (Canonical Capability Registry)
- **Tệp triển khai:** `src/ai/capability-registry.js`
- **Nguồn chân lý duy nhất (Single Source of Truth):**
  - Chuẩn hóa và làm cầu nối cho toàn bộ **41 công cụ nghiệp vụ** (`src/ai/tools.js`) và **40 kỹ năng** (`src/ai/skills.js`).
  - Định nghĩa **24 Canonical Capabilities** thuộc 5 miền nghiệp vụ cốt lõi:
    1. **Kho vận (INVENTORY):** `check_stock`, `find_low_stock`, `search_products`, `price_lookup`, `replenishment_suggestion`, `explain_replenishment`, `query_receipts_aggregate`, `stocktake_proposal`, `receipt_proposal`, `transfer_proposal`.
    2. **Bán hàng (SALES):** `sales_summary`, `top_selling_products`, `revenue_trend`, `add_cart_draft`, `customer_lookup`.
    3. **Tài chính & Giá vốn (FINANCE):** `get_profit_summary` (yêu cầu quyền `VIEW_COST`).
    4. **Đơn hàng & Vận đơn (ORDERS):** `order_diagnosis`, `order_status_lookup`.
    5. **Hệ thống & Dữ liệu (SYSTEM):** `shop_health_check`, `system_audit`.
- **Tạo Tool Manifest động cho Model Prompt:**
  - Hàm `generateModelToolManifest()` tự động trích xuất danh mục năng lực đang kích hoạt từ Registry.
  - Tầng `src/ai/semantic-planner.js` đã loại bỏ hoàn toàn mảng `TOOL_MANIFEST` khai báo tĩnh lặp lại, thay thế bằng:
    `export const TOOL_MANIFEST = generateModelToolManifest();`
  - `DUPLICATE_HARDCODED_MANIFEST_COUNT = 0`.

### 2.2. Kiểm soát Năng lực Chặt chẽ tại Tầng Lập Kế hoạch (Capability Validation)
- **Tệp cập nhật:** `src/ai/semantic-planner.js`
- **Cơ chế xác thực:**
  - Trong hàm `validateSemanticPlan(plan)`, mỗi ý định (`intents[i]`) đều phải vượt qua bài kiểm tra:
    `isValidCapability(item.required_capability)`.
  - Nếu Model gợi ý bất kỳ công cụ lạ, hàm JavaScript tùy ý hoặc năng lực không nằm trong Registry, kế hoạch bị **TỪ CHỐI NGAY LẬP TỨC** với mã lỗi `UNREGISTERED_CAPABILITY_<tên_công_cụ>`.
  - `UNREGISTERED_CAPABILITY_EXECUTION_COUNT = 0`.

### 2.3. Giải quyết Thực thể & Chốt chặn Mơ hồ (Post-Plan Resolution & Ambiguity Guard)
- **Tệp triển khai:** `src/ai/evidence-engine.js` & `src/ai/compatibility-executor.js`
- **Nguyên tắc phân định:**
  - Model AI chỉ xác định khái niệm ngữ nghĩa (tên sản phẩm, kho hàng, khoảng thời gian).
  - Tầng Resolver tất định (`resolveProduct`, `resolveWarehouse`, `resolveDateInterval`) chịu trách nhiệm ánh xạ chính xác ID dữ liệu trong cơ sở dữ liệu IndexedDB.
- **Ambiguity Guard (Chặn đoán mò khi có nhiều sản phẩm tương đồng):**
  - Khi người dùng hỏi tên chung (ví dụ: "cà phê" khớp với cả *Cà phê hạt Robusta* và *Cà phê hòa tan sữa*):
    `resolveIntentEntities` gắn cờ `isAmbiguous: true` kèm danh sách ứng viên `ambiguousCandidates`.
  - `compatibility-executor.js` **DỪNG NGAY THỰC THI**, ghi nhận cảnh báo viễn trắc `reportToolSelectedNotExecuted`, và trả về tin nhắn yêu cầu người dùng làm rõ:
    *"🔍 Phát hiện nhiều sản phẩm phù hợp với 'cà phê': [Danh sách tên & SKU]. Vui lòng chỉ định rõ tên hoặc mã cụ thể..."*
  - `AMBIGUOUS_ENTITY_AUTO_EXECUTION_COUNT = 0`.

### 2.4. Thực thi Đồ thị Tuần tự Nhiều Ý định Đọc (Multi-Read Execution DAG)
- **Giới hạn số vòng lặp:** `MAX_EXECUTION_PASSES = 1_PLAN_N_TOOLS`.
- **Cơ chế chống lặp vô hạn:**
  - Model suy luận và lập kế hoạch một lần duy nhất (`intents[]`).
  - Tầng Executor duyệt qua mảng ý định theo một lượt tuần tự duy nhất, thực thi từng công cụ và thu thập gói bằng chứng (Evidence Packet).
  - Tuyệt đối không có vòng lặp đệ quy tự gọi lại Model (no unbounded agentic loops).
  - Kết quả của tất cả các ý định đọc hợp lệ đều được tổng hợp đầy đủ trong câu trả lời cuối cùng.

### 2.5. Bảo vệ Bất biến Ý định Ghi (Write Intent Proposal Safety)
- **Nguyên tắc cốt lõi:** `MODEL_DIRECT_DB_WRITE_COUNT = 0`.
- **Thực thi:**
  - Mọi năng lực dạng `WRITE` (nhập kho, chuyển kho, kiểm kê, tạo giỏ hàng nháp) khi thực thi đều chỉ trả về đối tượng đề xuất (`is_proposal: true`, `status: 'PROPOSAL_DRAFT'`).
  - Tuyệt đối không tự ý chạy lệnh ghi đè (`IndexedDB PUT/DELETE/UPDATE`) trực tiếp vào cơ sở dữ liệu nếu chưa có sự xác nhận rõ ràng của người dùng qua giao diện.

### 2.6. Khởi tạo & Kiểm toán Gói Bằng chứng (Evidence Packet & Verifier Invariants)
- **Tệp triển khai:** `src/ai/evidence-engine.js`
- **Cấu trúc gói bằng chứng (Evidence Packet):**
  - Chứa đầy đủ: `capability_id`, `tool_binding`, `shop_id`, `warehouse_id`, `entity_id`, `time_range`, `data_authority` (`INDEXED_DB_LOCAL`), `fetched_at`, `payload`, `status`, `is_proposal`.
- **Bộ kiểm toán bằng chứng (`verifyEvidencePacket`):**
  1. *Kiểm tra ranh giới Tenant:* Bắt buộc `shop_id` của gói bằng chứng phải khớp với tenant hiện tại của phiên làm việc (`TENANT_BOUNDARY_MISMATCH`).
  2. *Kiểm tra bất biến chế độ đọc:* Bắt buộc năng lực chế độ `READ` không được chứa cờ đột biến dữ liệu đã commit (`UNAUTHORIZED_MUTATION_IN_READ_CAPABILITY`).
  3. *Kiểm tra tính toàn vẹn thực thể:* Các công cụ yêu cầu sản phẩm bắt buộc phải có `entity_id` hợp lệ.
  4. *Kiểm tra độ tươi của dữ liệu:* Bằng chứng quá 60 giây bị gắn cờ quá hạn (`STALE_EVIDENCE_TIMESTAMP`).

### 2.7. Soạn thảo Câu trả lời Có Bằng chứng (Grounded Response Composer)
- **Hàm thực hiện:** `composeResponseFromEvidence()` trong `src/ai/evidence-engine.js`.
- Câu trả lời cuối cùng được kết xuất **100% dựa trên các gói bằng chứng đã qua kiểm toán an toàn (VERIFIED PASS)**.
- Không suy đoán số liệu, không tự bịa đặt giá cả hay tồn kho nằm ngoài bằng chứng.
- Nếu một phần dữ liệu không vượt qua kiểm toán, phần đó sẽ bị lược bỏ kèm cảnh báo minh bạch cho người dùng.

### 2.8. Hệ thống Báo cáo Lỗi Không Gây Gián đoạn (Non-blocking Telemetry CR-AIQ-002)
- Tích hợp đầy đủ `reportToolError` và `reportToolSelectedNotExecuted` từ `src/ai/error-reporter.js`.
- Bất kỳ lỗi phát sinh trong quá trình thực thi công cụ hoặc dừng chờ làm rõ thực thể đều được ghi nhận viễn trắc ngầm mà không làm sập ứng dụng hay gây treo giao diện người dùng.

---

## 3. KẾT QUẢ KIỂM THỬ THỰC CHỨNG (EMPIRICAL VERIFICATION)

Đã chạy tập lệnh kiểm thử thực chứng chuyên biệt `tests/verify_phase2_capabilities.js`:
- **Lệnh chạy:** `node tests/verify_phase2_capabilities.js`
- **Kết quả:** **25/25 tiêu chí ĐẠT (PASS)**.
  - Manifest tự động sinh từ Registry khớp tuyệt đối 24/24 capabilities.
  - `semantic-planner.js` đồng bộ hoàn toàn với Registry.
  - Năng lực chưa đăng ký (`malicious_arbitrary_eval`, `drop_database`) bị chặn đứng 100%.
  - Tên sản phẩm mơ hồ ("cà phê") kích hoạt Ambiguity Guard, chặn tự động thực thi và trả về yêu cầu làm rõ kèm danh sách ứng viên.
  - Multi-Read tuần tự hoàn tất 2/2 ý định, tạo đủ 2 gói bằng chứng và vượt qua kiểm toán bằng chứng.
  - Ý định ghi (`receipt_proposal`) tạo đối tượng Proposal chờ xác nhận, không tự commit vào DB.
  - Kiểm toán Tenant phát hiện chính xác khi có mismatch tenant.
  - Kiểm toán Chế độ đọc phát hiện và chặn đứng đột biến dữ liệu trái phép.

---

## 4. TỔNG KẾT KHỐI ĐO LƯỜNG GIAI ĐOẠN 2 (PHASE 2 AUDIT BLOCK)

```yaml
PHASE: PHASE_2_CAPABILITY_BRIDGE
CAPABILITY_REGISTRY_STATUS: VERIFIED_ACTIVE
CANONICAL_CAPABILITIES_COUNT: 24
UNDERLYING_TOOLS_COUNT: 41
UNDERLYING_SKILLS_COUNT: 40
DUPLICATE_HARDCODED_MANIFEST_COUNT: 0
UNREGISTERED_CAPABILITY_EXECUTION_COUNT: 0
AMBIGUOUS_ENTITY_AUTO_EXECUTION_COUNT: 0
MODEL_DIRECT_DB_WRITE_COUNT: 0
MAX_EXECUTION_PASSES: 1_PLAN_N_TOOLS
EVIDENCE_VERIFIER_STATUS: ACTIVE_ENFORCING
LANGUAGE_TEST_MATRIX_COUNT: 0
SYNTAX_CHECK_COUNT: 5
SMOKE_EXECUTION_COUNT: 1
PUSH_COUNT: 0
DEPLOY_COUNT: 0
CURRENT_PHASE_STATUS: PASS_PHASE_2
READY_FOR_PHASE_3: YES_PENDING_REVIEW
NEXT_ACTION: STOP_FOR_USER_REVIEW
```
