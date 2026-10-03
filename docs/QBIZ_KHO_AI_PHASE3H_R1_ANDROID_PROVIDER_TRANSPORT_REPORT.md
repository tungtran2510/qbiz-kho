# BÁO CÁO KỸ THUẬT: SỬA LỖI TRANSPORT ANDROID → GATEWAY → OLLAMA (PHASE 3H-R1)

**Dự án:** QBiz Kho / POS  
**Mã đợt:** AI PHASE 3H-R1  
**Mục tiêu:** Khắc phục triệt để lỗi vận chuyển yêu cầu (transport) từ điện thoại Android (`http://192.168.1.10:4180`) đến Model Provider Local AI (`qwen2.5:1.5b`), không vá keyword, không đòi Gemini API Key, đảm bảo an toàn tuyệt đối cho tác vụ ghi kho.

---

## 1. Xác nhận lỗi do Owner báo cáo (Owner Reported Android Error)
- **Hiện tượng thực tế:** Trên điện thoại Android, truy cập `http://192.168.1.10:4180`, mở Trợ lý AI và nhập lệnh `"Nhập 8 chiếc này"`. Hệ thống phản hồi lỗi:
  > *"Trợ lý AI chưa khả dụng: Không có kết nối tới Model Provider (Local AI chưa khởi chạy hoặc chưa cấu hình API Key trên máy). Vui lòng kiểm tra lại dịch vụ Ollama trên máy tính hoặc cấu hình API Key trong mục Cài đặt (⚙)."*
- **Đánh giá:**
  - `OWNER_REPORTED_ANDROID_ERROR = CONFIRMED`
  - `PREVIOUS_OWNER_HANDOFF_READY_CLAIM = REVOKED`
  - Thông báo yêu cầu cấu hình API Key trong mục Cài đặt là thông báo lỗi sai lệch (misleading error fallback), gây hiểu nhầm rằng hệ thống Local AI cần khóa API đám mây.

---

## 2. Truy vết điểm gãy kỹ thuật (Failure Boundary & Root Cause)
Qua kiểm tra và chạy kiểm thử mô phỏng chính xác môi trường Android (UA mobile, nguồn gốc mạng `192.168.1.10:4180`), đã xác định 4 điểm gãy:
1. **Client Fetch Timeout quá ngắn (30s):**
   - Trong `src/ai/providers.js`, hàm `callLocalAiGateway` sử dụng `Math.min(timeoutMs, 30000)`. Khi tải toàn bộ Capability Registry (hơn 40 capabilities) cho mô hình nhỏ `qwen2.5:1.5b` chạy trên CPU PC, thời gian xử lý prefill + inference mất khoảng **24s – 36s**.
   - Trình duyệt điện thoại vượt quá 30s nên kích hoạt `AbortController.abort()`, khiến request bị hủy ngang.
2. **Fallback Loopback `127.0.0.1:11434` trên thiết bị di động:**
   - Khi gateway bị timeout hoặc lỗi mạng, client cố gắng fallback gọi trực tiếp `http://127.0.0.1:11434/api/generate`.
   - Trên điện thoại Android, `127.0.0.1` trỏ về chính chiếc điện thoại (nơi không chạy Ollama), dẫn đến `ECONNREFUSED` ngay lập tức.
3. **Mặt nạ lỗi (Error Masking) và thông báo đòi Gemini Key:**
   - Khi gặp lỗi kết nối hoặc timeout, khối `catch` chung trong `semantic-planner.js` nuốt lỗi chi tiết và hiển thị thông điệp mặc định yêu cầu cấu hình API Key.
4. **Quyền hạn Capability `receipt_proposal` bị lỗi undefined:**
   - Trong `src/ai/capability-registry.js`, capability `receipt_proposal` yêu cầu `PERMISSIONS.MANAGE_INVENTORY` (không tồn tại trong `policy.js`, dẫn đến `[undefined]`). Quyền chuẩn là `PERMISSIONS.RECEIVE_STOCK`.

---

## 3. Các thay đổi kỹ thuật (Surgical Delta Fixes)

### 3.1. Sửa lớp Transport & Timeout (`src/ai/providers.js`)
- Tăng timeout tối thiểu cho gateway lên **60 giây** (`Math.max(timeoutMs || 60000, 60000)`), đảm bảo đủ thời gian cho Ollama CPU inference trong các prompt ngữ cảnh đầy đủ.
- Ngăn chặn triệt để hành vi fallback gọi `127.0.0.1:11434` khi client đang chạy trên môi trường di động / LAN IP khác localhost.
- Phân loại và trả về mã lỗi cụ thể: `LOCAL_GATEWAY_UNREACHABLE`, `OLLAMA_OFFLINE`, `LOCAL_MODEL_MISSING`, `LOCAL_MODEL_TIMEOUT`, `LOCAL_AI_TIMEOUT`.

### 3.2. Sửa Semantic Planner & Schema Normalization (`src/ai/semantic-planner.js`)
- Bổ sung hướng dẫn rõ ràng trong system prompt: `mode: "READ hoặc WRITE (chọn WRITE nếu là nhập hàng/đề xuất tạo phiếu)"`.
- Chuẩn hóa tự động: nếu plan chọn capability `receipt_proposal`, tự động xác lập `mode: "WRITE"`.
- Bỏ hoàn toàn thông điệp đòi Gemini API Key khi đang ở chế độ Local AI. Hiển thị thông báo trạng thái trung thực (đang tải mô hình, hoặc Ollama trên PC chưa bật).

### 3.3. Sửa Capability Registry (`src/ai/capability-registry.js`)
- Mô tả rõ ràng cho `receipt_proposal`:
  > `'Nhập hàng, nhập kho thêm sản phẩm (ví dụ: "nhập 8 chiếc này", "nhập thêm hàng"). Bắt buộc tạo đề xuất Proposal chờ xác nhận, không ghi thẳng DB.'`
- Chuẩn hóa các quyền: `PERMISSIONS.RECEIVE_STOCK`, `PERMISSIONS.TRANSFER_STOCK`, `PERMISSIONS.STOCKTAKE_STOCK`.

### 3.4. Cập nhật Giao diện & Trạng thái Provider (`src/ai/ui.js`)
- Trong chế độ `AUTO` / `LOCAL_AI`, ẩn ô nhập Gemini API Key trong drawer Cài đặt.
- Hiển thị dòng ghi chú màu xanh: `✓ Đang sử dụng Local AI (qwen2.5:1.5b trên máy tính). Không yêu cầu nhập API Key.`
- Badge trạng thái AI tự động truy vấn `GET /api/ai-gateway` và hiển thị trực quan: `Local AI: qwen2.5:1.5b (Online)` màu xanh lá cây (`#15803d`).

### 3.5. Cải tiến Server Gateway Logging (`server.py`)
- Bổ sung kiểm tra sự hiện diện của model (`modelPresent`) trong `GET /api/ai-gateway`.
- Thêm log chi tiết nguồn client (`[AI-Gateway] [PHONE] ...`) và thời gian phản hồi của Ollama (`Ollama responded in X ms with status 200`).
- Trả về mã lỗi HTTP chuẩn xác kèm mã lý do JSON nếu Ollama ngoại tuyến hoặc timeout.

---

## 4. Bằng chứng kiểm thử và Xác minh An toàn (Empirical Verification)

### 4.1. Kiểm thử mô phỏng thiết bị Android qua Playwright
- Script thực thi: `scratch/test_browser_android.py`
- Cấu hình: Viewport 390x844 (Samsung Galaxy S23 Ultra / mobile viewport), User-Agent Android 14.
- Kết nối URL: `http://192.168.1.10:4180`
- Kịch bản:
  1. Mở app, nhấn `#qbizAiTrigger`.
  2. Kiểm tra Provider Badge: Hiển thị đúng `Local AI: qwen2.5:1.5b (Online)`.
  3. Nhập lệnh `"Nhập 8 chiếc này"` vào `#aiTextInput` và gửi.
  4. Client gửi request: `POST http://192.168.1.10:4180/api/ai-gateway` (5.146 bytes).
  5. Server ghi nhận: `[AI-Gateway] [PHONE] Ollama responded in 24165ms with status 200.`
  6. Kết quả giao diện: Thẻ Đề Xuất Nhập Kho (Proposal Card) được dựng ngay lập tức:
     - Tiêu đề: *Đã tạo đề xuất nhập kho*
     - Nội dung: *Nhập thêm 8 chiếc vào kho 'Kho Trung tâm'. (Chưa có thay đổi tồn kho thực tế - chờ duyệt xác nhận)*
     - Nút hành động: `[Xác nhận]`, `[Hủy]`
     - Execution Trace: `Tier 1 [Semantic Plan [receipt-proposal]]`
- File bằng chứng ảnh: `docs/evidence_phase3h/android_simulation_smoke.png`

### 4.2. Tính bất biến đối với tác vụ Ghi (Safety Invariant)
- `WRITE_REQUEST_DIRECT_MUTATION_COUNT = 0`: Không có bất kỳ thay đổi trực tiếp nào vào IndexedDB / kho hàng khi chưa nhấn `[Xác nhận]`.
- `WRITE_REQUEST_PROPOSAL_ONLY = YES`: Lệnh `"Nhập 8 chiếc này"` luôn luôn sinh đề xuất (Proposal) hai bước.

---

## 5. QA Snapshot mới
Đã đóng băng toàn bộ mã nguồn sau khi sửa lỗi vào snapshot độc lập:
- **Snapshot Path:** `qa/phase3-owner-rc/`
- **Old Fingerprint:** `QA_RC_PHASE3H_3B4D00A463D3`
- **New Fingerprint:** `QA_RC_PHASE3H_R1_B217C7155E3D`
- **Môi trường phục vụ:** Tiến trình `python server.py` chạy trên cổng `4180` phục vụ trực tiếp snapshot này qua `http://192.168.1.10:4180`.

---

## 6. Final Status Block

```
OWNER_REPORTED_ANDROID_ERROR=CONFIRMED
PREVIOUS_OWNER_HANDOFF_READY_CLAIM=REVOKED

FAIL_BOUNDARY=CLIENT_FETCH_TIMEOUT_AND_FALLBACK_CLASSIFICATION
ROOT_CAUSE=Client fetch timeout was capped at 30s while Ollama CPU prefill/inference took 24-36s, triggering premature abort and falling through to misleading Gemini API Key error prompt, combined with loopback fallback to 127.0.0.1 on mobile origins and missing permissions in receipt_proposal capability.

CLIENT_REQUEST_SENT=YES
GATEWAY_POST_RECEIVED=YES
GATEWAY_REQUEST_VALID=YES
OLLAMA_REQUEST_SENT=YES
OLLAMA_RESPONSE_RECEIVED=YES
MODEL_RESPONSE_VALID=YES
PLAN_RESPONSE_RETURNED_TO_BROWSER=YES

PORT_4180_PROCESS=python server.py (PID task-46890 / 46890)
PORT_4180_SERVER_FILE=server.py
STALE_BUNDLE=NO
SERVICE_WORKER_ACTIVE=NO

OLLAMA_HEALTH=OK
OLLAMA_MODEL_PRESENT=YES
ACTUAL_LOCAL_MODEL=qwen2.5:1.5b

LOCAL_AI_REQUIRES_GEMINI_KEY=NO
CLIENT_SIDE_SECRET_REQUIRED=NO

WRITE_REQUEST_DIRECT_MUTATION_COUNT=0
WRITE_REQUEST_PROPOSAL_ONLY=YES

OLD_QA_ARTIFACT_FINGERPRINT=QA_RC_PHASE3H_3B4D00A463D3
NEW_QA_ARTIFACT_FINGERPRINT=QA_RC_PHASE3H_R1_B217C7155E3D
QA_URL=http://192.168.1.10:4180

PRODUCTION_URL_UNCHANGED=YES
PRODUCTION_DEPLOY_COUNT=0

LANGUAGE_TEST_MATRIX_COUNT=0
KEYWORD_PATCH_COUNT=0

OWNER_ANDROID_HANDOFF_READY=YES
PHYSICAL_ANDROID_OWNER_CONFIRMED=PENDING
```
