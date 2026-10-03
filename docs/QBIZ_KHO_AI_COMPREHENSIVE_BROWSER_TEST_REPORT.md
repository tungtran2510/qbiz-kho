# QBiz Kho — BÁO CÁO KIỂM THỬ TỰ ĐỘNG AI QUA TRÌNH DUYỆT (BROWSER AUTOMATION TEST REPORT)

**Thời gian thực thi:** 2026-10-01 11:51:30 (GMT+7)  
**Môi trường:** Frozen QA RC (`http://localhost:4180`, Snapshot Fingerprint: `QA_RC_PHASE3H_43BFE56BED9B`)  
**AI Runtime:** Local Ollama Model `qwen2.5:1.5b` via Server-Side Gateway (`/api/ai-gateway`)  
**Công cụ kiểm thử:** Playwright Chromium (Automated DOM Interaction & Screenshot Verification)  
**Production Status:** `PRODUCTION_DEPLOY_COUNT = 0` (Bảo toàn tuyệt đối Vercel `https://qbiz-kho.vercel.app`)

---

## 1. TỔNG KẾT KẾT QUẢ KIỂM THỬ (EXECUTIVE SUMMARY)

| Mã ca kiểm thử | Tên trường hợp kiểm thử | Yêu cầu kiểm tra | Thời gian LLM | Công cụ / Pipeline | Kết quả | Ảnh bằng chứng |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **P0-SETUP** | Kiểm tra thông số Dev Inspector | Build SHA, AI Arch PHASE3, Gateway token | 0.0s (DOM) | DOM Inspector | **PASS** | `00_dev_inspector.png` |
| **CASE 1** | Tra cứu tồn kho (Stock Lookup) | Tra cứu tồn kho 'Ghế sáng chế 150 tại kho trung tâm' | 32.83s | `SEMANTIC_PLANNER` → `check-stock` | **PASS** | `01_stock_lookup.png` |
| **CASE 2** | Tìm hàng sắp hết (Low Stock Alert) | Quét các sản phẩm dưới ngưỡng tồn tối thiểu | 15.89s | `SEMANTIC_PLANNER` → `find-low-stock` | **PASS** | `02_low_stock.png` |
| **CASE 3** | Tra cứu giá bán (Price Lookup) | Tra cứu giá niêm yết 'Ghế sáng chế 90D' | 45.74s | `SEMANTIC_PLANNER` → `price-lookup` | **PASS** | `03_price_lookup.png` |
| **CASE 4** | Hội thoại tiếp nối (Follow-up Turn) | Phân giải đại từ 'Món này giá bao nhiêu?' theo ngữ cảnh F1 | 16.90s | Context Resolver → `price-lookup` | **PASS** | `04_multiturn_followup.png` |
| **CASE 5** | Đa ý định đồng thời (Multi-intent) | Vừa kiểm kho Ghế 150 vừa tìm hàng sắp hết | 26.62s | Multi-intent Planner (2 intents) → Composer | **PASS** | `05_multi_intent.png` |
| **CASE 6** | Làm rõ khi mơ hồ (Clarification Guard) | Câu hỏi chung chung 'Hàng hóa thế nào?' | 58.96s | Ambiguity Guard & Safe Guidance | **PASS** | `06_clarification.png` |
| **CASE 7A** | Phân quyền vai trò (Cashier Hard Deny) | Thu ngân hỏi lợi nhuận cửa hàng (thiếu `VIEW_COST`) | 15.00s | `POST_PLAN_RISK_GUARD` (Hard Deny) | **PASS** | `07a_cashier_denied.png` |
| **CASE 7B** | Phân quyền vai trò (Owner Allowed) | Chủ shop hỏi doanh thu bán hàng hôm nay | 14.41s | `SEMANTIC_PLANNER` → `report-sales` | **PASS** | `07b_owner_allowed.png` |

---

## 2. CHI TIẾT BẰNG CHỨNG TỪNG TRƯỜNG HỢP KIỂM THỬ

### P0-SETUP: Dev Inspector & Kiến trúc QA Snapshot
- **Mục tiêu:** Xác minh thẻ Build Info và DEV Inspector hiển thị đúng định danh bản QA bất biến.
- **Dữ liệu thực tế từ DOM:**
  ```json
  {
    "baseGitSha": "9837b84a8b40126536874dfe53b613b46fff52f5",
    "qaArtifactFingerprint": "QA_RC_PHASE3H_20261001",
    "aiArchVersion": "PHASE3",
    "qaProvider": "LOCAL_AI",
    "qaModel": "qwen2.5:1.5b",
    "serverGateway": "SERVER_SIDE_GATEWAY"
  }
  ```
- **Bằng chứng:** [00_dev_inspector.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/00_dev_inspector.png)

---

### CASE 1: Tra cứu tồn kho (Stock Lookup - Single Read)
- **Câu lệnh người dùng:** `"Kiểm tra tồn kho Ghế sáng chế 150 tại kho trung tâm"`
- **Trace nội bộ:**
  - Authority: `SEMANTIC_PLANNER`
  - Model Provider: `LOCAL_AI` (`qwen2.5:1.5b`)
  - Công cụ thực thi: `['check-stock']`
  - Bằng chứng thực thi: `evidence_status = "PASS"`
- **Nội dung Assistant phản hồi:**
  > "Sản phẩm Ghế sáng chế 150: Tổng có thể bán: 0 chiếc (Thực tồn: 0, Đang giữ: 0). Chi tiết theo kho: Kho Trung tâm: Còn bán được 0, thực tế 0..."
- **Bằng chứng:** [01_stock_lookup.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/01_stock_lookup.png)

---

### CASE 2: Tìm hàng sắp hết (Low Stock Alert)
- **Câu lệnh người dùng:** `"Tìm những món hàng sắp hết trong kho"`
- **Trace nội bộ:**
  - Authority: `SEMANTIC_PLANNER`
  - Model Provider: `LOCAL_AI` (`qwen2.5:1.5b`)
  - Công cụ thực thi: `['find-low-stock']`
  - Bằng chứng thực thi: `evidence_status = "PASS"`
- **Nội dung Assistant phản hồi:**
  > "Hiện có 2 sản phẩm sắp hết hoặc đã hết hàng: Ghế sáng chế 150: Còn 0 chiếc (Ngưỡng cảnh báo: 1); Gối cổ sáng chế F6: Còn 0 cái (Ngưỡng cảnh báo: 6)..."
- **Bằng chứng:** [02_low_stock.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/02_low_stock.png)

---

### CASE 3: Tra cứu giá bán (Price Lookup)
- **Câu lệnh người dùng:** `"Ghế sáng chế 90D giá bao nhiêu?"`
- **Trace nội bộ:**
  - Authority: `SEMANTIC_PLANNER`
  - Model Provider: `LOCAL_AI` (`qwen2.5:1.5b`)
  - Công cụ thực thi: `['price-lookup']`
  - Bằng chứng thực thi: `evidence_status = "PASS"`
- **Nội dung Assistant phản hồi:**
  > "Giá bán của Ghế sáng chế 90D: Giá niêm yết: 34.937.000 ₫ / chiếc. Mã SKU: DL-90D. Trạng thái: Đang kinh doanh..."
- **Bằng chứng:** [03_price_lookup.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/03_price_lookup.png)

---

### CASE 4: Hội thoại tiếp nối & tham chiếu ngữ cảnh (Follow-up Context)
- **Lượt 1 (Context):** `"Kiểm tra tồn kho Gối lưng sáng chế F1"`
- **Lượt 2 (Deictic Turn):** `"Món này giá bao nhiêu?"`
- **Trace nội bộ:**
  - Authority: `SEMANTIC_PLANNER`
  - Phân giải thực thể: "Món này" → `Gối lưng sáng chế F1` (từ Conversation Context Capsule)
  - Công cụ thực thi: `['price-lookup']`
  - Bằng chứng thực thi: `evidence_status = "PASS"`
- **Nội dung Assistant phản hồi:**
  > "Giá bán của Gối lưng sáng chế F1: Giá niêm yết: 3.500.000 ₫ / cái. Mã SKU: DL-F1. Trạng thái: Đang kinh doanh..."
- **Bằng chứng:** [04_multiturn_followup.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/04_multiturn_followup.png)

---

### CASE 5: Đa ý định đồng thời (Multi-intent Composition)
- **Câu lệnh người dùng:** `"Kiểm tra tồn kho Ghế sáng chế 150 và tìm những món sắp hết hàng"`
- **Trace nội bộ:**
  - Authority: `SEMANTIC_PLANNER`
  - Số ý định nhận diện: `2` (`check_stock` và `find_low_stock`)
  - Composition mode: `MULTI`
  - Công cụ thực thi: `['check-stock', 'find-low-stock']`
  - Bằng chứng thực thi: `evidence_status = "PASS"`
- **Nội dung Assistant phản hồi:** Kết hợp liền mạch cả 2 khối bằng chứng:
  > "Sản phẩm Ghế sáng chế 150: Tổng có thể bán: 0 chiếc... Chi tiết theo kho: Kho Trung tâm: Còn bán được 0...  
  > --  
  > Hiện có 2 sản phẩm sắp hết hoặc đã hết hàng: Ghế sáng chế 150: Còn 0 chiếc; Gối cổ sáng chế F6: Còn 0 cái..."
- **Bằng chứng:** [05_multi_intent.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/05_multi_intent.png)

---

### CASE 6: Làm rõ khi mơ hồ (Clarification Guard)
- **Câu lệnh người dùng:** `"Hàng hóa thế nào?"`
- **Trace nội bộ:**
  - Ambiguity Guard phát hiện câu lệnh thiếu thực thể sản phẩm cụ thể.
  - Hệ thống không tự ý đoán mò hành động phá hoại, mà gửi hướng dẫn lựa chọn danh mục mặt hàng.
- **Bằng chứng:** [06_clarification.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/06_clarification.png)

---

### CASE 7: Phân quyền vai trò (Role-based Permission Guard: Cashier vs Owner)
- **Ca 7A (Thu ngân hỏi lợi nhuận):**
  - Chuyển vai trò sang `cashier` qua Dev Inspector: `Actor Role: cashier`.
  - Câu lệnh: `"Cho tôi xem báo cáo lợi nhuận và doanh thu tháng này"`
  - Trace nội bộ: `POST_PLAN_RISK_GUARD`
  - Cơ chế bảo vệ: Thiếu quyền `VIEW_COST` → Chặn đứng bằng `HARD DENY` trước khi bất kỳ công cụ tài chính nào được chạm tới.
  - Phản hồi:
    > "⚠️ Từ chối quyền truy cập (HARD DENY): Tài khoản vai trò cashier không được cấp quyền xem giá vốn và báo cáo lợi nhuận cửa hàng (yêu cầu quyền VIEW_COST)."
  - Bằng chứng: [07a_cashier_denied.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/07a_cashier_denied.png)

- **Ca 7B (Chủ shop hỏi doanh thu):**
  - Chuyển vai trò về `owner`: `Actor Role: owner`.
  - Câu lệnh: `"Cho tôi xem báo cáo doanh thu hôm nay"`
  - Trace nội bộ: `SEMANTIC_PLANNER`
  - Cơ chế bảo vệ: Vai trò `owner` sở hữu đầy đủ quyền → Cho phép thực thi.
  - Phản hồi:
    > "Doanh số hôm nay: Doanh thu thực thu: 0 ₫. Số phiếu hoàn tất: 0 phiếu..."
  - Bằng chứng: [07b_owner_allowed.png](file:///D:/google%20driver/Codex%20PC/Qu%E1%BA%A3n%20l%C3%BD%20kho%20-%20b%C3%A1n%20h%C3%A0ng%20tr%C3%AAn%20Qbiz/app/docs/evidence_phase3h_browser/07b_owner_allowed.png)

---

## 3. KẾT LUẬN & TRẠNG THÁI HỆ THỐNG
1. **100% các ca kiểm thử đạt PASS** thông qua trình duyệt thật Chromium Playwright tương tác trực tiếp lên DOM.
2. **Không có bất kỳ keyword rule nào bị vá**; tất cả câu hỏi được suy luận ngữ nghĩa bởi mô hình thật Ollama `qwen2.5:1.5b`.
3. **Môi trường Production Vercel (`https://qbiz-kho.vercel.app`) được bảo toàn tuyệt đối** (`PRODUCTION_DEPLOY_COUNT = 0`).
4. Toàn bộ bằng chứng ảnh chụp màn hình và JSON trace đã được lưu trữ vĩnh viễn tại `app/docs/evidence_phase3h_browser/` và nhân bản sang `DOC_ROOT/docs/evidence_phase3h_browser/`.
