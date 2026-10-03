# QBiz Kho — AI PHASE 3H: FROZEN QA RC & OWNER MOBILE HANDOFF REPORT

**MODE:** OWNER HANDOFF / QA ONLY / NO LANGUAGE BENCHMARK / NO KEYWORD PATCH / NO PRODUCTION CUTOVER / NO PHASE 4  
**DATE:** 2026-10-01T06:12:00+07:00  
**APP SCOPE:** `qbiz-kho`  

---

## 1. ĐÍNH CHÍNH & LÀM RÕ PHASE 3R

| Thông số | Giá trị thực tế | Ghi chú kỹ thuật |
|---|---|---|
| **BASE_GIT_SHA** | `9837b84a8b40126536874dfe53b613b46fff52f5` | Git commit SHA thật từ `git rev-parse HEAD`. |
| **WORKTREE_DIRTY** | `YES` | Có các thay đổi local cho Phase 1–3 + file tài liệu mới. |
| **QA_SOURCE_DIFF_HASH** | `df0209bf5f675300` | SHA256 (16 ký tự đầu) của toàn bộ `git diff`. |
| **QA_ARTIFACT_FINGERPRINT** | `QA_RC_PHASE3H_3B4D00A463D3` | Băm độc lập từ toàn bộ 91 file trong artifact snapshot. |
| **QA_ARTIFACT_IMMUTABLE** | `YES` | Snapshot độc lập tại `qa/phase3-owner-rc/`, server phục vụ snapshot, không phục vụ worktree sống. |
| **DESKTOP_PLAYWRIGHT_PROOF** | `PASS` | Kiểm chứng trên Chromium Desktop (R1, R2, R3 đều PASS). Không gộp với bằng chứng Android. |
| **PHYSICAL_ANDROID_CONFIRMED**| `PENDING` | Chờ Owner mở URL thực tế trên thiết bị di động Android. |

*Lưu ý đính chính:* Nhãn `9837b84-qa-phase3r` trong Phase 3R chỉ là label định danh build, không phải Git commit SHA. Báo cáo này ghi nhận chính xác `BASE_GIT_SHA` và `QA_SOURCE_DIFF_HASH`.

---

## 2. FREEZE QA ARTIFACT IMMUTABLE

- **Vị trí Snapshot:** `qa/phase3-owner-rc/`
- **File Manifest:** `docs/evidence_phase3h/qa_artifact_manifest.json` (đã sao lưu sang `DOC_ROOT/docs/evidence_phase3h/`)
- **Tổng số file trong artifact:** 91 files (gồm `index.html`, `styles.css`, `manifest.webmanifest`, `qr-mobile.html`, `sw.js`, `favicon.ico`, toàn bộ thư mục `src/`, `icons/`, `assets/`).
- **Quy tắc bất biến:** Server QA (`server.py`) được cấu hình tự động trỏ thư mục phục vụ static file trực tiếp vào `qa/phase3-owner-rc/`. Mọi chỉnh sửa ở worktree live bên ngoài không ảnh hưởng đến QA runtime đang chạy.

---

## 3. OWNER-ACCESSIBLE QA URL (ĐƯỜNG LINK CHO CHỦ SHOP)

Hệ thống cung cấp đồng thời 2 đường link độc lập, bảo mật, cùng origin với AI Gateway:

### [1] LINK TRUY CẬP TỪ XA CHO ANDROID (4G / 5G / Wi-Fi ngoài đường)
> 🌐 **URL:** `https://multiple-handed-assistant-charlotte.trycloudflare.com`  
- Giao thức: HTTPS bảo mật qua Cloudflare Tunnel.
- Không cần mở port router, không lộ địa chỉ IP nhà riêng.
- Server-side gateway proxy an toàn tới Ollama trên PC.

### [2] LINK TRUY CẬP MẠNG NỘI BỘ (Khi điện thoại kết nối cùng Wi-Fi với PC)
> 🏠 **URL:** `http://192.168.1.10:4180`  
- Tốc độ phản hồi tức thì (zero internet delay).

---

## 4. PROVIDER TRUTH — KHÓA MODEL THỰC TẾ

```ini
CONFIGURED_LOCAL_MODEL=qwen2.5:1.5b
ACTUAL_LOCAL_MODEL_USED=qwen2.5:1.5b
CONFIGURED_CLOUD_MODEL=gemini-2.5-flash
ACTUAL_QA_PROVIDER=LOCAL_AI
ACTUAL_QA_MODEL=qwen2.5:1.5b
MODEL_CONFIG_MISMATCH=NONE
```

- **Lý do khóa model:** Model `qwen2.5:1.5b` đã được kiểm chứng hoạt động ổn định, suy luận sạch dạng JSON trong 4–8 giây, không bị nghẽn thinking tokens như model `qwen3.5:2b` trên phần cứng máy trạm.
- **Trung thực dữ liệu (Zero Mock):** Loại bỏ toàn bộ regex keyword matching mock fallback trong gateway. Nếu Ollama offline hoặc timeout, gateway trả về mã lỗi `503 LOCAL_AI_UNAVAILABLE` minh bạch.

---

## 5. QA PROVIDER CHO ANDROID & BẢO MẬT GATEWAY

```ini
ANDROID_BROWSER_DIRECT_OLLAMA_CALL=NO
SERVER_SIDE_PROVIDER_GATEWAY=YES
```

- Trình duyệt Android **tuyệt đối không gọi trực tiếp** tới `127.0.0.1:11434` hay expose port Ollama ra ngoài.
- Điện thoại Android gửi request POST tới route cùng origin: `/api/ai-gateway`.
- `server.py` trên PC nhận request, kiểm tra `appScope === 'qbiz-kho'`, chuyển tiếp tới Ollama nội bộ qua `http://127.0.0.1:11434/api/chat`.
- Kết quả được trả về điện thoại để chạy chuỗi: `Universal Semantic Plan` → `Capability Registry` → `Local Tool Execution` → `Evidence Grounding` → `Composer`.
- Không có bất kỳ API key hay token nhạy cảm nào bị gửi xuống client.

---

## 6. BUILD / RUNTIME MARKER TRÊN GIAO DIỆN

- **DOM Marker:** `window.__QBIZ_BUILD_INFO__`:
  - `qaArtifactFingerprint: "QA_RC_PHASE3H_3B4D00A463D3"`
  - `aiArchVersion: "PHASE3"`
  - `qaProvider: "LOCAL_AI"`
  - `qaModel: "qwen2.5:1.5b"`
- **Trace Marker:** `window.__AI_LAST_TRACE__` ghi nhận đầy đủ fingerprint, request_id, authority_path (`SEMANTIC_PLANNER`), provider (`LOCAL_AI`), model (`qwen2.5:1.5b`), tools và evidence status (`PASS`).
- **Giao diện Trợ lý:** Mở sheet AI bấm nút **DEV** sẽ thấy bảng thông số kỹ thuật hiển thị rõ `QA Snapshot: QA_RC_PHASE3H_3B4D00A463D3` và `AI Arch: PHASE3`.

---

## 7. HƯỚNG DẪN DÀNH CHO OWNER (CHỦ SHOP TEST THỰC TẾ)

1. **Mở app trên điện thoại Android:**
   - Dùng Chrome / Samsung Internet mở link:  
     👉 **`https://multiple-handed-assistant-charlotte.trycloudflare.com`**  
     *(hoặc `http://192.168.1.10:4180` nếu đang bắt cùng Wi-Fi với PC)*.
2. **Mở Trợ lý AI:**
   - Bấm vào nút tròn biểu tượng chữ **Q** (hoặc nút Trợ lý) ở góc phải dưới màn hình.
3. **Thử nghiệm ngôn ngữ tự nhiên:**
   - Owner có thể hỏi tự nhiên theo bất kỳ cách nói thông thường nào trong vận hành kho:
     - *"Kiểm tra cho tôi tồn kho Ghế sáng chế 150 tại kho trung tâm"*
     - *"Tìm xem có những món nào sắp hết hàng không"*
     - *"Món này giá bao nhiêu?"* (khi đang ở màn hình sản phẩm hoặc sau khi vừa hỏi về ghế)
     - *"Hàng hóa trong kho thế nào?"* (kiểm tra tính năng làm rõ / clarification)
4. **Nếu cảm thấy "vẫn chưa thông minh":**
   - Không vội sửa code hay vá từ khóa.
   - Bấm nút **DEV** trên góc sheet trợ lý, chụp ảnh màn hình bảng DEV Inspector và câu trả lời.
   - Trace sẽ chỉ chính xác nguyên nhân nằm ở tầng nào (Planner, Capability, Tool, hay Composer).

---

## 8. CAM KẾT KHÔNG CAN THIỆP PRODUCTION

```ini
PRODUCTION_URL_BEFORE=https://qbiz-kho.vercel.app
PRODUCTION_URL_AFTER=https://qbiz-kho.vercel.app
PRODUCTION_DEPLOY_COUNT=0
PRODUCTION_ALIAS_CHANGE_COUNT=0
PRODUCTION_URL_UNCHANGED=YES
```

- Bản production chính thức `https://qbiz-kho.vercel.app` (và `kho.qbiz.vn`) hoàn toàn không bị đụng tới.
- Toàn bộ môi trường thử nghiệm độc lập trên QA Snapshot và Tunnel URL.

---

## 9. BẢN KIỂM CHỨNG & VERDICT

```ini
============================================================
BASE_GIT_SHA=9837b84a8b40126536874dfe53b613b46fff52f5
WORKTREE_DIRTY=YES
QA_ARTIFACT_FINGERPRINT=QA_RC_PHASE3H_3B4D00A463D3
QA_SOURCE_DIFF_HASH=df0209bf5f675300
QA_ARTIFACT_IMMUTABLE=YES

QA_URL=https://multiple-handed-assistant-charlotte.trycloudflare.com
QA_ACCESS_MODE=SECURE_TUNNEL / LAN (http://192.168.1.10:4180)
PRODUCTION_URL_UNCHANGED=YES

CONFIGURED_LOCAL_MODEL=qwen2.5:1.5b
ACTUAL_LOCAL_MODEL_USED=qwen2.5:1.5b
MODEL_CONFIG_MISMATCH=NONE
ACTUAL_QA_PROVIDER=LOCAL_AI
ACTUAL_QA_MODEL=qwen2.5:1.5b

ANDROID_BROWSER_DIRECT_OLLAMA_CALL=NO
SERVER_SIDE_PROVIDER_GATEWAY=YES

AI_ARCH_VERSION=PHASE3
QA_RUNTIME_MARKER_VISIBLE=YES

DESKTOP_PLAYWRIGHT_PROOF=PASS
OWNER_ANDROID_HANDOFF_READY=YES
PHYSICAL_ANDROID_OWNER_CONFIRMED=PENDING

LANGUAGE_TEST_MATRIX_COUNT=0
KEYWORD_PATCH_COUNT=0

PRODUCTION_DEPLOY_COUNT=0
PRODUCTION_ALIAS_CHANGE_COUNT=0

VERDICT=READY_FOR_OWNER_MOBILE_QA
PHASE4_READY=NO
============================================================
```

**STOP.**  
Không mở Phase 4.  
Không production cutover.  
Bàn giao URL cho Owner trải nghiệm và phản hồi trực tiếp.
