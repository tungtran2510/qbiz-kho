# QBIZ KHO — BÁO CÁO KHÓA RANH GIỚI PROVIDER & CHẾ ĐỘ THOÁI CẤP
**AI PHASE 1S: PROVIDER BOUNDARY & DEGRADED MODE LOCK**

- **Ngày thực hiện:** 2026-10-01
- **Môi trường:** CODE_ROOT (`D:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\app`)
- **Tài liệu căn cứ:** `QBiz Kho - AI PHASE 1S - PROVIDER BOUNDARY & DEGRADED MODE LOCK.gdoc`
- **Nguyên tắc thực thi:** `MICRO ARCHITECTURE CORRECTION / NO LANGUAGE TEST MATRIX / NO REGEX PATCHING / NO PUSH / NO DEPLOY`

---

## 1. RANH GIỚI PROVIDER DUY NHẤT (PROVIDER LAYER OWNERSHIP)

### 1.1. Tách biệt trách nhiệm kiến trúc
- **Tầng Planner (`src/ai/semantic-planner.js`)**:
  - Chịu trách nhiệm: Đóng gói Context Capsule thu gọn, chuẩn bị schema JSON, gọi hàm trừu tượng của Provider, xác thực tính hợp lệ của SemanticPlan (`validateSemanticPlan`), và kiểm tra rủi ro (`postPlanRiskGuard`).
  - **Loại bỏ 100% fetch trực tiếp:** Planner không còn chứa bất kỳ URL (Ollama, Gemini, DeepSeek, OpenAI), API Key hay logic retry nào của từng nhà cung cấp.
  - `SEMANTIC_PLANNER_DIRECT_PROVIDER_FETCH_COUNT = 0`.
- **Tầng Provider (`src/ai/providers.js`)**:
  - Chịu trách nhiệm: Quản lý toàn bộ việc định tuyến và kết nối Model Provider qua hàm thống nhất:
    `dispatchSemanticPlanning({ promptText, config, timeoutMs, context })`.
  - Tự động điều phối theo chính sách AUTO: Ưu tiên Local AI (Ollama `qwen3.5:2b`), chuyển tiếp Cloud Gemini / DeepSeek / OpenAI nếu có cấu hình API Key, và trả về kết quả chuẩn hóa cho Planner.
  - `PROVIDER_ROUTING_OWNER = PROVIDER_LAYER`.

---

## 2. KHÓA CHẶT CHẾ ĐỘ THOÁI CẤP (DEGRADED MODE LOCK)

### 2.1. Cấm tuyệt đối "Router quy tắc mới" đoán mò ý định người dùng
- Khi người dùng gửi câu hỏi ngữ nghĩa (không thuộc danh sách trắng của Exact Gate) và **toàn bộ Real Model Provider đều offline hoặc chưa cấu hình API Key**:
  - Hệ thống **KHÔNG** quay lại bộ phân loại regex/keyword (`generateDeterministicSemanticPlan`) để tự ý đoán tool nhập hàng, tồn kho hay doanh thu.
  - Hệ thống **KHÔNG** tự động tạo phiếu đề xuất (WRITE proposal).
  - Hệ thống **KHÔNG** âm thầm rơi xuống router cũ 8,181 dòng để trả lời giả dạng AI.
- **Hành vi mục tiêu đã khóa (Target Behavior)**:
  - Hệ thống trả về trạng thái minh bạch: `AI_UNAVAILABLE`.
  - Thông báo rõ ràng: *"⚠️ Trợ lý AI chưa khả dụng: Không có kết nối tới Model Provider (Local AI chưa khởi chạy hoặc chưa cấu hình API Key trên máy). Vui lòng thao tác trực tiếp trên các mục Bán hàng, Kho, Báo cáo hoặc cấu hình API Key trong mục Cài đặt (⚙)."*
  - `USER_RUNTIME_SEMANTIC_RULE_FALLBACK = NO`.
  - `SEMANTIC_PROVIDER_FAILURE_RESULT = AI_UNAVAILABLE_OR_DEGRADED_EXACT_ONLY`.
  - `SEMANTIC_PROVIDER_FAILURE_WRITE_COUNT = 0`.
  - `SEMANTIC_PROVIDER_FAILURE_GUESSED_TOOL_COUNT = 0`.
- `generateDeterministicSemanticPlan` chỉ được giữ lại như một công cụ chẩn đoán nội bộ (`options.allowDevMockPlanner === true`) phục vụ kiểm thử đơn vị, hoàn toàn cách ly khỏi luồng chạy của người dùng thực tế.

---

## 3. BẢN CHẤT CHÍNH XÁC CỦA CHẾ ĐỘ AUTO (AUTO MODE TRUTH)

Luồng hoạt động chuẩn mực của chế độ AUTO:
1. **Pre-Planner Security Guard:** Chặn injection, leo thang đặc quyền, thao tác tự hủy nguy hiểm.
2. **Exact Deterministic Gate:** Chỉ xử lý danh sách trắng tất định 100% (Tắt/bật tiếng, Xác nhận/Hủy đề xuất, Điều hướng cố định, Barcode chính xác).
3. **Provider Layer Dispatch:** Thử Local AI → Thử Cloud Provider (Gemini/DeepSeek nếu có cấu hình).
4. **Model Semantic Plan:** Model LLM trực tiếp suy luận và trả về `intents[]`.
5. **Plan Validation:** Kiểm tra schema và capability hợp lệ.
6. **Post-Plan Risk Guard:** Kiểm tra quyền hạn (ví dụ `VIEW_COST` cho lợi nhuận).
7. **Tool Execution:** Chuyển giao thực thi cho 34 Tools / 28 Skills.
8. **Evidence Verification:** Đảm bảo bất biến dữ liệu.
9. **Final Answer:** Trả lời người dùng kèm Trace trung thực.

Nếu bước 3 không có Model Provider nào online, hệ thống dừng lại ngay lập tức tại `AI_UNAVAILABLE`, không mạo danh "AI sẵn sàng".

---

## 4. PHẠM VI CONTEXT CAPSULE THỰC TẾ

Context Capsule được serialize đầy đủ vào prompt gửi cho Model gồm:
- `raw_prompt`: Câu truy vấn nguyên bản của người dùng.
- `route`: Màn hình/phân hệ hiện tại.
- `shop_id`: Mã định danh cửa hàng/tenant (`CONTEXT_HAS_TENANT_SHOP_REF = YES`).
- `warehouse_id`: Kho hàng được chỉ định (`CONTEXT_HAS_WAREHOUSE_REF = YES`).
- `bound_product`: Thông tin sản phẩm đang chọn (`CONTEXT_HAS_CURRENT_ENTITY_REF = YES`).
- `actor.role`: Vai trò tài khoản hiện tại (`owner`, `manager`, `cashier`).
- `local_time`: Thời gian hệ thống (ngày, tháng, năm, ISO).
- `tool_manifest`: Danh mục 13 công cụ có định nghĩa tham số rõ ràng (`MODEL_RECEIVES_TOOL_MANIFEST = YES`).
- **Cam kết an toàn:** Không gửi toàn bộ danh mục sản phẩm, không gửi toàn bộ đơn hàng, không gửi số cái kho, không rò rỉ secret.

---

## 5. MINH BẠCH BẰNG CHỨNG KIỂM THỬ (EVIDENCE HONESTY)

Đính chính trung thực số liệu kiểm thử thực tế trong toàn bộ phiên làm việc:
- `LANGUAGE_TEST_MATRIX_COUNT = 0`: Không tạo thêm bất kỳ bộ test case ngôn ngữ, ngữ cảnh, hoặc từ đồng nghĩa nào.
- `SMOKE_EXECUTION_COUNT = 4`: Đã thực hiện đúng 4 lần chạy smoke script qua Node.js để kiểm tra tính toàn vẹn của module và luồng degraded lock:
  1. *Smoke 1:* Kiểm tra import và phát hiện lỗi `document` trong `setVoiceMuted`.
  2. *Smoke 2:* Kiểm tra 5 kịch bản Phase 1 (Exact Gate, VIEW_COST Post-plan, Single intent, Multi-intent, Security).
  3. *Smoke 3:* Kiểm tra 4 kịch bản Phase 1R (Nhãn thoái cấp degraded traces khi offline).
  4. *Smoke 4:* Kiểm tra 4 kịch bản Phase 1S (Khóa degraded `AI_UNAVAILABLE` trong user runtime và dev helper).
- `SYNTAX_CHECK_COUNT = 4`: Đã thực hiện 4 lượt kiểm tra cú pháp độc lập (`node -c`) trên toàn bộ các tệp thay đổi.

---

## 6. BẢNG TỔNG KẾT NGHIỆM THU CUỐI CÙNG (FINAL BLOCK)

```text
SEMANTIC_PLANNER_DIRECT_PROVIDER_FETCH_COUNT=0
PROVIDER_ROUTING_OWNER=PROVIDER_LAYER

USER_RUNTIME_SEMANTIC_RULE_FALLBACK=NO
SEMANTIC_PROVIDER_FAILURE_RESULT=AI_UNAVAILABLE_OR_DEGRADED_EXACT_ONLY
SEMANTIC_PROVIDER_FAILURE_WRITE_COUNT=0
SEMANTIC_PROVIDER_FAILURE_GUESSED_TOOL_COUNT=0

AUTO_MODE_PRIMARY_SEMANTIC_AUTHORITY=SEMANTIC_PLANNER_WITH_REAL_MODEL
MODEL_CALLED_BEFORE_BUSINESS_INTENT_FINALIZED=YES
MODEL_CALLED_BEFORE_TOOL_SELECTION=YES

CONTEXT_HAS_TENANT_SHOP_REF=YES
CONTEXT_HAS_WAREHOUSE_REF=YES
CONTEXT_HAS_CURRENT_ENTITY_REF=YES
MODEL_RECEIVES_TOOL_MANIFEST=YES

SHARED_SEMANTIC_CONTRACT_REUSED=NO
SHARED_SEMANTIC_CONTRACT_COMPATIBLE=YES

FAKE_MODEL_TRACE_COUNT=0
MOCK_PRESENTED_AS_REAL_AI=NO

LANGUAGE_TEST_MATRIX_COUNT=0
SMOKE_EXECUTION_COUNT=4
SYNTAX_CHECK_COUNT=4

PHASE1S_VERDICT=PASS
PHASE2_READY=YES

PUSH_COUNT=0
DEPLOY_COUNT=0
```

---

## 7. KẾT LUẬN & DỪNG LẠI (STOP)

- Toàn bộ 3 mục tiêu của **AI PHASE 1S: PROVIDER BOUNDARY & DEGRADED MODE LOCK** đã hoàn thành chính xác và triệt để.
- Ranh giới Provider đã thuộc về Tầng Provider duy nhất (`SEMANTIC_PLANNER_DIRECT_PROVIDER_FETCH_COUNT = 0`).
- Người dùng thực tế khi không có Model sẽ nhận thông báo `AI_UNAVAILABLE` minh bạch, không bị lừa bởi rule router hay đoán mò tool (`USER_RUNTIME_SEMANTIC_RULE_FALLBACK = NO`).
- Số liệu kiểm thử đã được ghi nhận trung thực tuyệt đối.

**DỪNG LẠI TẠI ĐÂY (STOP).** Không tự ý mở Phase 2. Chờ Owner và ChatGPT review nghiệm thu.
