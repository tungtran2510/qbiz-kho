import sys
import io
import time
import json
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

TEST_QUERIES = [
    # Nhóm 1: Xuất file & Báo cáo
    {"category": "Xuất file & Báo cáo", "query": "xuất file hàng hóa", "expected_domain": "FILE_EXPORT"},
    {"category": "Xuất file & Báo cáo", "query": "xuất file excel danh sách sản phẩm", "expected_domain": "FILE_EXPORT"},
    {"category": "Xuất file & Báo cáo", "query": "tải file tồn kho các mặt hàng", "expected_domain": "FILE_EXPORT"},
    {"category": "Xuất file & Báo cáo", "query": "xuất file báo cáo xuất nhập tồn tháng này", "expected_domain": "REPORT_EXPORT"},
    {"category": "Xuất file & Báo cáo", "query": "xuất danh sách khách hàng ra excel", "expected_domain": "FILE_EXPORT"},

    # Nhóm 2: Nhập kho & Phiếu nhập hàng
    {"category": "Nhập kho", "query": "nhập hàng", "expected_domain": "INVENTORY_RECEIPT"},
    {"category": "Nhập kho", "query": "tạo phiếu nhập kho", "expected_domain": "INVENTORY_RECEIPT"},
    {"category": "Nhập kho", "query": "nhập 50 cái Bàn chải đánh răng Colgate SlimSoft vào kho trung tâm", "expected_domain": "INVENTORY_RECEIPT"},
    {"category": "Nhập kho", "query": "lập phiếu nhập kho cho Ghế sáng chế 135 số lượng 10 giá 40000000", "expected_domain": "INVENTORY_RECEIPT"},
    {"category": "Nhập kho", "query": "tháng này đã nhập vào bao nhiêu hàng?", "expected_domain": "INVENTORY_RECEIPT_QUERY"},

    # Nhóm 3: Xuất kho & Phiếu xuất hàng (Hủy/Nội bộ/Mẫu)
    {"category": "Xuất kho", "query": "xuất kho", "expected_domain": "INVENTORY_ISSUE"},
    {"category": "Xuất kho", "query": "tạo phiếu xuất kho", "expected_domain": "INVENTORY_ISSUE"},
    {"category": "Xuất kho", "query": "xuất kho hủy 5 cái bàn chải bị hỏng do ngập nước", "expected_domain": "INVENTORY_ISSUE"},
    {"category": "Xuất kho", "query": "xuất nội bộ 2 cái ghế sáng chế để phòng họp", "expected_domain": "INVENTORY_ISSUE"},
    {"category": "Xuất kho", "query": "xuất hàng mẫu cho khách hàng xem thử", "expected_domain": "INVENTORY_ISSUE"},
    {"category": "Xuất kho", "query": "xuất kho thanh lý hàng hết hạn sử dụng", "expected_domain": "INVENTORY_ISSUE"},

    # Nhóm 4: Xuất hóa đơn & In ấn
    {"category": "Hóa đơn & In ấn", "query": "xuất hóa đơn", "expected_domain": "INVOICE"},
    {"category": "Hóa đơn & In ấn", "query": "xuất hóa đơn điện tử", "expected_domain": "INVOICE"},
    {"category": "Hóa đơn & In ấn", "query": "xuất hóa đơn VAT cho Công ty TNHH ABC mã số thuế 0101234567", "expected_domain": "INVOICE"},
    {"category": "Hóa đơn & In ấn", "query": "in hóa đơn", "expected_domain": "PRINT"},
    {"category": "Hóa đơn & In ấn", "query": "in lại hóa đơn đơn hàng gần nhất", "expected_domain": "PRINT"},
    {"category": "Hóa đơn & In ấn", "query": "cấu hình máy in hóa đơn K80", "expected_domain": "PRINT"},

    # Nhóm 5: Quản lý hàng hóa & Tồn kho
    {"category": "Hàng hóa & Tồn kho", "query": "thêm hàng hóa mới", "expected_domain": "PRODUCT_MGMT"},
    {"category": "Hàng hóa & Tồn kho", "query": "sửa giá bán Bàn chải Colgate thành 42000", "expected_domain": "PRODUCT_MGMT"},
    {"category": "Hàng hóa & Tồn kho", "query": "xóa sản phẩm", "expected_domain": "PRODUCT_MGMT"},
    {"category": "Hàng hóa & Tồn kho", "query": "kiểm kê kho trung tâm", "expected_domain": "STOCKTAKE"},
    {"category": "Hàng hóa & Tồn kho", "query": "điều chuyển 10 cái bàn chải từ kho trung tâm sang kho hà đông", "expected_domain": "TRANSFER"},
    {"category": "Hàng hóa & Tồn kho", "query": "sản phẩm nào còn tồn nhiều nhất?", "expected_domain": "STOCK_QUERY"},
    {"category": "Hàng hóa & Tồn kho", "query": "hàng nào sắp hết cần nhập gấp?", "expected_domain": "STOCK_QUERY"},

    # Nhóm 6: Bán hàng, Khách hàng & Tài chính
    {"category": "Bán hàng & Tài chính", "query": "bán 2 cái Bàn chải Colgate cho anh Nam", "expected_domain": "SALES"},
    {"category": "Bán hàng & Tài chính", "query": "bán nợ cho khách quen hẹn cuối tháng trả", "expected_domain": "SALES"},
    {"category": "Bán hàng & Tài chính", "query": "xem công nợ của khách hàng", "expected_domain": "FINANCE"},
    {"category": "Bán hàng & Tài chính", "query": "doanh thu hôm nay được bao nhiêu?", "expected_domain": "FINANCE"},
    {"category": "Bán hàng & Tài chính", "query": "lợi nhuận tuần này thế nào?", "expected_domain": "FINANCE"},
    {"category": "Bán hàng & Tài chính", "query": "tạo mã VietQR thanh toán 500k", "expected_domain": "PAYMENT"}
]

def run_browser_battery(target_url="http://localhost:4180/?page=products", max_items=None):
    items = TEST_QUERIES[:max_items] if max_items else TEST_QUERIES
    results = []
    
    print(f"=== BẮT ĐẦU CHẠY KIỂM THỬ TRÌNH DUYỆT TRỰC TIẾP ({len(items)} CÂU HỎI) ===")
    print(f"Target: {target_url}\n")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Mobile viewport 390x844
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        
        # Capture console
        console_msgs = []
        page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text}"))
        
        page.goto(target_url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1500)
        
        # Mở AI Assistant Sheet
        trigger = page.locator("#qbizAiTrigger")
        if trigger.count() == 0:
            print("LỖI: Không tìm thấy #qbizAiTrigger trên màn hình!")
            browser.close()
            return []
        
        trigger.click()
        page.wait_for_timeout(1000)
        
        badge = page.locator("#aiProviderBadge")
        badge_text = badge.inner_text() if badge.count() > 0 else "UNKNOWN"
        print(f"Trạng thái Model Badge: {badge_text}\n")
        
        for idx, item in enumerate(items, 1):
            q = item["query"]
            cat = item["category"]
            
            # Nhập câu hỏi
            text_input = page.locator("#aiTextInput")
            send_btn = page.locator("#aiSendBtn")
            
            text_input.fill(q)
            send_btn.click()
            
            # Chờ phản hồi tối đa 6 giây
            page.wait_for_timeout(4500)
            
            # Lấy tin nhắn phản hồi cuối cùng
            bubbles = page.locator(".ai-msg.assistant .ai-bubble-content")
            total_bubbles = bubbles.count()
            last_text = bubbles.last.inner_text() if total_bubbles > 0 else ""
            
            # Đánh giá chất lượng câu trả lời
            assessment = "UNKNOWN"
            reason = ""
            
            q_norm = q.lower()
            resp_norm = last_text.lower()
            
            # Check for generic/irrelevant answers
            if "tất cả hàng hóa hiện đều ở mức tồn an toàn" in resp_norm:
                if "an toàn" in q_norm or "hàng sắp hết" in q_norm or "tồn" in q_norm:
                    assessment = "PASS"
                else:
                    assessment = "FAIL_IRRELEVANT"
                    reason = "Bị ngộ nhận thành câu hỏi kiểm tra tồn kho tối thiểu (find-low-stock)"
            elif "xin lỗi, tôi chưa hiểu rõ" in resp_norm or "chưa chắc hiểu đúng" in resp_norm or "chưa chắc chắn về yêu cầu" in resp_norm:
                assessment = "SAFE_REFUSE"
                reason = "AI từ chối an toàn do không hiểu câu lệnh ngữ nghĩa"
            elif "tạm thời không khả dụng" in resp_norm or "chưa khả dụng" in resp_norm or "chưa cấu hình" in resp_norm:
                assessment = "UNAVAILABLE"
                reason = "Hệ thống báo AI chưa khả dụng hoặc thiếu cấu hình"
            elif "từ chối" in resp_norm:
                assessment = "BLOCKED"
                reason = "Bị chặn bởi Policy Guard"
            else:
                # Kiểm tra xem phản hồi có liên quan tới category không
                if cat == "Xuất file & Báo cáo":
                    if "file" in resp_norm or "xuất" in resp_norm or "tải" in resp_norm or "excel" in resp_norm or "csv" in resp_norm:
                        assessment = "PASS"
                    else:
                        assessment = "FAIL_OFF_TOPIC"
                        reason = "Không thực hiện hoặc hướng dẫn xuất file"
                elif cat == "Nhập kho":
                    if "nhập" in resp_norm or "phiếu nhập" in resp_norm:
                        assessment = "PASS"
                    else:
                        assessment = "FAIL_OFF_TOPIC"
                        reason = "Không tạo hoặc xử lý phiếu nhập kho"
                elif cat == "Xuất kho":
                    if "xuất" in resp_norm or "phiếu xuất" in resp_norm:
                        assessment = "PASS"
                    else:
                        assessment = "FAIL_OFF_TOPIC"
                        reason = "Không tạo hoặc xử lý phiếu xuất kho"
                elif cat == "Hóa đơn & In ấn":
                    if "hóa đơn" in resp_norm or "in" in resp_norm or "vat" in resp_norm:
                        assessment = "PASS"
                    else:
                        assessment = "FAIL_OFF_TOPIC"
                        reason = "Không xử lý hóa đơn hoặc in ấn"
                elif cat == "Hàng hóa & Tồn kho":
                    if "sản phẩm" in resp_norm or "giá" in resp_norm or "tồn" in resp_norm or "kiểm kê" in resp_norm or "chuyển" in resp_norm or "xóa" in resp_norm:
                        assessment = "PASS"
                    else:
                        assessment = "FAIL_OFF_TOPIC"
                        reason = "Không xử lý đúng nghiệp vụ hàng hóa/tồn kho"
                elif cat == "Bán hàng & Tài chính":
                    if "bán" in resp_norm or "doanh thu" in resp_norm or "lợi nhuận" in resp_norm or "công nợ" in resp_norm or "qr" in resp_norm:
                        assessment = "PASS"
                    else:
                        assessment = "FAIL_OFF_TOPIC"
                        reason = "Không xử lý đúng nghiệp vụ tài chính/bán hàng"
            
            res_entry = {
                "id": idx,
                "category": cat,
                "query": q,
                "response": last_text.strip(),
                "assessment": assessment,
                "reason": reason
            }
            results.append(res_entry)
            
            # In ngắn gọn kết quả ra console
            status_icon = "✅" if assessment == "PASS" else ("⚠️" if "REFUSE" in assessment else "❌")
            print(f"[{idx:02d}] {status_icon} [{cat}] \"{q}\"")
            print(f"     -> Đánh giá: {assessment} {f'({reason})' if reason else ''}")
            first_line = last_text.strip().split('\n')[0][:90] if last_text.strip() else '(Trống)'
            print(f"     -> Trả lời: \"{first_line}...\"\n")
            
            # Chụp ảnh 2 câu tiêu biểu làm evidence
            if q == "xuất file hàng hóa":
                page.screenshot(path="docs/evidence_ai_battery_xuat_file.png")
            elif q == "xuất hóa đơn":
                page.screenshot(path="docs/evidence_ai_battery_xuat_hoa_don.png")
            elif q == "tạo phiếu xuất kho":
                page.screenshot(path="docs/evidence_ai_battery_xuat_kho.png")

        # Lưu file JSON kết quả
        with open("docs/ai_battery_test_results.json", "w", encoding="utf-8") as f:
            json.dump({
                "target_url": target_url,
                "badge_text": badge_text,
                "total_queries": len(items),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "results": results
            }, f, ensure_ascii=False, indent=2)
            
        print("=== HOÀN THÀNH TOÀN BỘ KIỂM THỬ TRÌNH DUYỆT ===")
        browser.close()
        return results

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4180/?page=products"
    os.makedirs("docs", exist_ok=True)
    run_browser_battery(target)
