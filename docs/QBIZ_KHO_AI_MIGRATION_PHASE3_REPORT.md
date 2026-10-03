# QBIZ KHO — BÁO CÁO ĐIỀU PHỐI HỘI THOẠI & RUNTIME THỰC
**AI MIGRATION PHASE 3: CONVERSATION ORCHESTRATION & REAL RUNTIME**

- **Ngày thực hiện:** 2026-10-01
- **Môi trường:** CODE_ROOT (`D:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\app`)
- **Tài liệu căn cứ:** `QBiz Kho - AI MIGRATION PHASE 3 - CONVERSATION ORCHESTRATION & REAL RUNTIME.gdoc` (doc_id: `1vom0-7MTU6mFZW3LiKkyAlFUKrX8v1UP0lhvWe1hrog`)
- **Nguyên tắc thực thi:** `NO LANGUAGE TEST MATRIX / NO REGEX PATCHING / NO BIG-BANG / NO MASS DELETION OF LEGACY ROUTER / NO PUSH / NO DEPLOY`

---

## 1. TỔNG QUAN MỤC TIÊU PHASE 3 ĐÃ HOÀN THÀNH

Trong Phase 3, toàn bộ hệ thống Kho AI đã thiết lập hoàn chỉnh tầng điều phối hội thoại nhiều lượt (**Conversation Orchestration**), đồng bộ thống nhất một cổng runtime duy nhất (**Canonical AI Runtime Entry**) cho toàn bộ Text, Voice, Quick Chips và Clarification Chips, giải quyết triệt để đại từ chỉ định ngữ cảnh (**Deictic Referent Resolution**), khóa chặt chu trình làm rõ mơ hồ (**Clarification Loop**), tách bạch thực thi đọc/ghi an toàn (**Read/Write Split & Proposal Life Cycle**), và kích hoạt bộ soạn thảo câu trả lời có kiểm toán thực chứng (**Grounded Response Composer**) cùng truy vết nhà cung cấp mô hình thực (**Real Provider Truth**).

---

## 2. CHI TIẾT CÁC HẠNG MỤC KIẾN TRÚC ĐÃ TRIỂN KHAI

### 2.1. Cổng Runtime AI Chuẩn hóa & Đẳng cấu Text / Voice (Canonical AI Runtime Entry)
- **Tệp kiểm toán & chốt chặn:** `src/ai/ui.js` & `src/ai/router.js`
- **Đẳng cấu luồng người dùng (Voice/Text Parity):**
  - Mọi tương tác người dùng (nhập văn bản qua input, giọng nói qua `SpeechRecognition`, bấm Quick Chips trên Dashboard/POS/Kho, hoặc bấm chọn Clarification Chips) đều đi qua hàm xử lý thống nhất: `handleUserMessage(query)`.
  - `handleUserMessage` gọi trực tiếp cổng điều hướng chuẩn: `routeIntent(query, context, state, options)`.
  - Không có bất kỳ đường tắt (shortcut), không gọi trực tiếp các hàm legacy regex hay bypass pipeline AI mới từ UI.
  - `CANONICAL_AI_RUNTIME_ENTRY = routeIntent`.
  - `VOICE_TEXT_RUNTIME_PARITY = YES`.
  - `LEGACY_DIRECT_UI_SEMANTIC_PATH_COUNT = 0`.

### 2.2. Bộ Quản lý Trạng thái Hội thoại (Conversation State Manager)
- **Tệp triển khai mới:** `src/ai/conversation-state.js`
- **Các thành phần lưu trữ trong phiên (`conversation_state`):**
  - `conversation_id`: Định danh duy nhất của phiên hội thoại (UUID/timestamp).
  - `turnHistory`: Lịch sử các lượt hội thoại gần nhất (tối đa 10 lượt), ghi nhận `turn_index`, `user_query`, `canonical_intent`, `resolved_entities`, `tool_executed`, `evidence_summary`, `timestamp`.
  - `lastResolvedEntities`: Thực thể gần nhất được xác thực (`productId`, `productName`, `warehouseId`, `warehouseName`, `orderId`, `customerId`).
  - `lastTimeRange`: Khoảng thời gian gần nhất được truy vấn (`today`, `yesterday`, `this_month`, `last_month`).
  - `lastVerifiedIntents`: Danh sách các ý định đã hoàn thành gần nhất.
  - `pendingClarification`: Trạng thái chờ người dùng làm rõ khi phát hiện thực thể mơ hồ.
  - `pendingProposal`: Đề xuất ghi (`WRITE_PROPOSAL`) đang chờ người dùng bấm xác nhận hoặc hủy.
- **Ranh giới bảo mật diễn viên (Section M Actor Boundary Compliance):**
  - Đã tích hợp hàm `resetConversationState()` vào `switchActor()` trong `src/ai/context.js`. Khi đăng xuất, đổi người dùng hoặc đổi shop tenant, toàn bộ ngữ cảnh hội thoại cũ bị xóa sạch, ngăn rò rỉ dữ liệu chéo.
  - `CONVERSATION_STATE_ACTIVE = YES`.

### 2.3. Giải quyết Đại từ Ngữ cảnh & Phân định Chủ quyền (Deictic Binding)
- **Tệp triển khai:** `src/ai/evidence-engine.js` & `src/ai/semantic-planner.js`
- **Nguyên tắc phân định chủ quyền (Ownership Principle):**
  - `DEICTIC_BINDING_OWNER = RESOLVER_LAYER`.
  - Model AI không tự bịa đặt UUID hay ID cơ sở dữ liệu (`MODEL_INVENTED_CONTEXT_ID_COUNT = 0`).
  - Model chỉ gắn cờ ngữ nghĩa đại từ ("cái này", "hàng này", "sản phẩm vừa rồi", "tháng trước?").
  - Tầng Resolver tất định chịu trách nhiệm đối chiếu với `conversationState.lastResolvedEntities` hoặc `conversationState.lastTimeRange` để gán đúng `productId`/`timeRange`.
- **Chuẩn hóa tiếng Việt (Vietnamese Canonicalization):**
  - Chuẩn hóa loại bỏ dấu tiếng Việt khi nhận diện cụm từ chỉ định ("cái này", "hang nay", "mon nay", "san pham nay") để liên kết chính xác với sản phẩm ở lượt hội thoại trước.

### 2.4. Chu trình Làm rõ Mơ hồ (Clarification Loop & Max Replan Guard)
- **Tệp triển khai:** `src/ai/compatibility-executor.js` & `src/ai/router.js`
- **Chốt chặn không đoán mò:**
  - `AMBIGUOUS_AUTO_PICK_COUNT = 0`.
  - Khi người dùng hỏi từ khóa chung ("cà phê") khớp với nhiều sản phẩm, hệ thống lập tức dừng thực thi, trả về trạng thái `CLARIFICATION_REQUIRED`, lưu `pendingClarification` vào `conversationState`, và hiển thị danh sách ứng viên (Candidate Chips).
- **Vòng lặp tiếp tục sau làm rõ (Clarification Resume Loop):**
  - Khi người dùng chọn một ứng viên hoặc gửi câu trả lời bổ sung:
    1. Hệ thống khớp ứng viên đã chọn từ `pendingClarification.candidates`.
    2. Cập nhật `context.current_product_id` và thực thi tiếp ý định gốc (`original_intent`) mà không cần hỏi lại từ đầu.
    3. Xóa `pendingClarification`.
  - Nếu người dùng nhập câu lệnh mới hoàn toàn, hệ thống chỉ cho phép tái lập kế hoạch tối đa 1 lần (`MAX_REPLAN_AFTER_CLARIFICATION = 1`), tránh vòng lặp đệ quy.

### 2.5. Điều phối Đa Ý định & Tách biệt Đọc/Ghi (Multi-Intent DAG & Read/Write Split)
- **Tệp triển khai:** `src/ai/compatibility-executor.js`
- **Quy tắc đồ thị hữu hạn (Bounded DAG):**
  - Mô hình lập kế hoạch 1 lần (`1_PLAN_N_TOOLS`).
  - **READ + READ:** Thực thi tuần tự toàn bộ các công cụ đọc, thu thập đầy đủ các gói bằng chứng (Evidence Packets) và tổng hợp kết quả toàn diện trong câu trả lời.
  - **READ + WRITE:** Tách biệt ranh giới an toàn (`READ_WRITE_SPLIT_ACTIVE = YES`):
    - Nhánh READ được thực thi ngay để lấy số liệu thực tế.
    - Nhánh WRITE được đóng gói thành đối tượng Đề xuất (`WRITE_PROPOSAL`), chuyển trạng thái `PENDING_CONFIRMATION` và lưu vào `pendingProposal`.
    - `UNCONFIRMED_WRITE_EXECUTION_COUNT = 0`.
    - Chỉ khi người dùng bấm "Xác nhận" trên UI (qua Exact Gate `confirmProposal`), đề xuất mới được commit vào cơ sở dữ liệu.

### 2.6. Bộ Soạn thảo Câu trả lời Có Bằng chứng (Grounded Response Composer)
- **Tệp triển khai:** `src/ai/evidence-engine.js` (`composeGroundedResponse`)
- **Các bất biến kiểm soát chặt chẽ:**
  - `COMPOSER_CAN_REPLAN = NO`: Tầng composer không có quyền tự gọi lại Planner hay sinh thêm ý định mới.
  - `COMPOSER_CAN_SELECT_NEW_TOOL = NO`: Tầng composer không được tự ý gọi bất kỳ công cụ nào ngoài danh sách đã thực thi.
  - `COMPOSER_CAN_INVENT_BUSINESS_NUMBER = NO`: Mọi số liệu hiển thị (số lượng tồn kho, doanh thu, giá vốn, chênh lệch kiểm kê) bắt buộc phải trích xuất chính xác từ `evidencePackets` đã qua xác thực (`VERIFIED PASS`).
  - Nếu có Model Provider online, Composer tổng hợp văn phong tự nhiên dựa trên strictly grounded evidence. Nếu Provider offline, Composer chuyển sang định dạng trình bày tất định an toàn.

### 2.7. Chân lý Nhà cung cấp Thực tế (Real Provider Truth & Degraded Mode)
- **Tệp triển khai:** `src/ai/providers.js` & `src/ai/router.js`
- **Không giả mạo (Zero Mocking):**
  - `SILENT_MOCK_COUNT = 0`.
  - `SILENT_LEGACY_SEMANTIC_FALLBACK_COUNT = 0`.
  - Hệ thống kiểm tra trực tiếp Local Ollama (`http://127.0.0.1:11434`, model `qwen3.5:2b`) và các Cloud Provider đã cấu hình.
  - Nếu không có provider nào hoạt động và không có cờ kiểm thử, hệ thống lập tức thông báo trung thực `AI_UNAVAILABLE` kèm hướng dẫn cấu hình, tuyệt đối không âm thầm chạy router cũ hay bịa số liệu.

---

## 3. KẾT QUẢ KIỂM THỬ THỰC CHỨNG (EMPIRICAL VERIFICATION)

### 3.1. Kiểm thử Toàn diện Phase 3 (`tests/verify_phase3_orchestration.js`)
- **Lệnh chạy:** `node tests/verify_phase3_orchestration.js`
- **Kết quả:** **31/31 tiêu chí ĐẠT (PASS - 100%)**:
  1. *Canonical UI Entry & Voice/Text Parity:* 2/2 checks PASS. Cả giọng nói và văn bản đều chung cổng exact gate và trả về hợp đồng dữ liệu chuẩn hóa.
  2. *Conversation State & Deictic Follow-up:* 5/5 checks PASS. Turn 1 ghi nhận sản phẩm; Turn 2 ("nhập thêm cái này") giải quyết đúng đại từ và gợi ý nhập kho chính xác theo tồn kho thấp.
  3. *Ambiguity Guard & Clarification State:* 5/5 checks PASS. Tên sản phẩm mơ hồ dừng thực thi với `CLARIFICATION_REQUIRED`, lưu đúng 2 ứng viên và trạng thái chờ vào `conversationState`.
  4. *Clarification Resume Loop:* 3/3 checks PASS. Người dùng chọn ứng viên làm rõ, hệ thống tự động tiếp tục và hoàn tất ý định gốc, xóa trạng thái chờ.
  5. *Write Intent Proposal Safety:* 7/7 checks PASS. Ý định ghi chuyển sang `WRITE_PROPOSAL` với trạng thái `PENDING_CONFIRMATION`; lệnh không liên quan không làm mất đề xuất; xác nhận tường minh thực thi thành công đề xuất.
  6. *Multi-Read & Read-Write Split:* 5/5 checks PASS. Nhánh READ hoàn thành lấy số liệu, nhánh WRITE giữ nguyên đề xuất chờ duyệt, tất cả bằng chứng đều vượt qua kiểm toán.
  7. *Grounded Response Composer Invariants:* 3/3 checks PASS. Soạn thảo câu trả lời chính xác từ bằng chứng, không bịa số liệu, ghi nhận viễn trắc minh bạch.
  8. *Real Provider Live Trace:* 1/1 check PASS. Hệ thống truy vấn thực tế phát hiện Ollama `qwen3.5:2b` và phản ánh trạng thái trung thực vào viễn trắc.

### 3.2. Kiểm thử Hồi quy Phase 2 (`tests/verify_phase2_capabilities.js`)
- **Lệnh chạy:** `node tests/verify_phase2_capabilities.js`
- **Kết quả:** **25/25 tiêu chí ĐẠT (PASS - 100%)**.

---

## 4. BẢNG TỔNG KẾT KHỐI ĐO LƯỜNG PHASE 3 (PHASE 3 AUDIT BLOCK)

```yaml
PHASE: PHASE_3_CONVERSATION_ORCHESTRATION_AND_RUNTIME
CANONICAL_AI_RUNTIME_ENTRY: routeIntent
VOICE_TEXT_RUNTIME_PARITY: YES
LEGACY_DIRECT_UI_SEMANTIC_PATH_COUNT: 0
CONVERSATION_STATE_ACTIVE: YES
DEICTIC_BINDING_OWNER: RESOLVER_LAYER
MODEL_INVENTED_CONTEXT_ID_COUNT: 0
AMBIGUOUS_AUTO_PICK_COUNT: 0
MAX_REPLAN_AFTER_CLARIFICATION: 1
READ_WRITE_SPLIT_ACTIVE: YES
UNCONFIRMED_WRITE_EXECUTION_COUNT: 0
COMPOSER_CAN_REPLAN: NO
COMPOSER_CAN_SELECT_NEW_TOOL: NO
COMPOSER_CAN_INVENT_BUSINESS_NUMBER: NO
SILENT_MOCK_COUNT: 0
SILENT_LEGACY_SEMANTIC_FALLBACK_COUNT: 0
LANGUAGE_TEST_MATRIX_COUNT: 0
PUSH_COUNT: 0
DEPLOY_COUNT: 0
REAL_PROVIDER_TRACE_COUNT: 1
SMOKE_EXECUTION_COUNT: 31
VERIFICATION_STATUS: PASS
```

---

## 5. KẾT LUẬN & TRẠNG THÁI HIỆN TẠI

Hệ thống Kho AI QBiz đã hoàn thành xuất sắc toàn bộ các mục tiêu kiến trúc và điều phối của **Phase 3**.
- **Trạng thái:** Toàn bộ mã nguồn đã được khóa an toàn tại `CODE_ROOT`.
- **Ranh giới:** Tuân thủ nghiêm ngặt nguyên tắc `PUSH_COUNT = 0`, `DEPLOY_COUNT = 0`, không tự ý mở Phase 4.
- **Hành động tiếp theo:** DỪNG LẠI (STOP) để Owner và kiến trúc sư trưởng kiểm toán nghiệm thu trước khi tiến hành các bước tiếp theo.
