import sys
import io
import time
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

QA_URL = "http://localhost:4180/?page=products"
OUTPUT_DIR = "docs"

def run_stage1_browser_verification():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("=== CHẠY KIỂM THỬ PLAYWRIGHT MOBILE 390x844 CHO GIAI ĐOẠN 1 ===")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        
        print(f"Loading {QA_URL}...")
        page.goto(QA_URL, wait_until="networkidle")
        page.wait_for_timeout(1000)
        
        # Mở Trợ lý QBiz
        page.locator("#qbizAiTrigger").click()
        page.wait_for_timeout(1000)
        
        # 1. Test "xuất file hàng hóa"
        print("[TEST 1] Query: 'xuất file hàng hóa'")
        page.locator("#aiTextInput").fill("xuất file hàng hóa")
        page.locator("#aiSendBtn").click()
        page.wait_for_timeout(3500)
        
        last_bubble = page.locator(".ai-msg.assistant .ai-bubble-content").last
        text1 = last_bubble.inner_text()
        print(" -> Response:", text1.split('\n')[0])
        assert "Đã xuất danh mục hàng hóa ra file Excel thành công!" in text1 or "Đã xuất dữ liệu ra file Excel thành công!" in text1
        page.screenshot(path=os.path.join(OUTPUT_DIR, "stage1_browser_xuat_file_hang_hoa.png"))
        print(" -> Screenshot saved: stage1_browser_xuat_file_hang_hoa.png ✅\n")
        
        # 2. Test "tải file tồn kho các mặt hàng"
        print("[TEST 2] Query: 'tải file tồn kho các mặt hàng'")
        page.locator("#aiTextInput").fill("tải file tồn kho các mặt hàng")
        page.locator("#aiSendBtn").click()
        page.wait_for_timeout(3500)
        
        last_bubble = page.locator(".ai-msg.assistant .ai-bubble-content").last
        text2 = last_bubble.inner_text()
        print(" -> Response:", text2.split('\n')[0])
        assert "Đã xuất danh mục hàng hóa ra file Excel thành công!" in text2 or "Đã xuất dữ liệu ra file Excel thành công!" in text2
        page.screenshot(path=os.path.join(OUTPUT_DIR, "stage1_browser_tai_file_ton_kho.png"))
        print(" -> Screenshot saved: stage1_browser_tai_file_ton_kho.png ✅\n")
        
        # 3. Test "nhập hàng" (Verify no "Tồn an toàn" regression)
        print("[TEST 3] Query: 'nhập hàng'")
        page.locator("#aiTextInput").fill("nhập hàng")
        page.locator("#aiSendBtn").click()
        page.wait_for_timeout(3500)
        
        last_bubble = page.locator(".ai-msg.assistant .ai-bubble-content").last
        text3 = last_bubble.inner_text()
        print(" -> Response:", text3.split('\n')[0])
        assert "Tất cả hàng hóa hiện đều ở mức tồn an toàn" not in text3, "Bị dính lỗi tồn an toàn!"
        assert "nhập kho" in text3.lower() or "đề xuất" in text3.lower()
        page.screenshot(path=os.path.join(OUTPUT_DIR, "stage1_browser_nhap_hang_proposal.png"))
        print(" -> Screenshot saved: stage1_browser_nhap_hang_proposal.png ✅\n")
        
        # 4. Test "tạo phiếu xuất kho" (Verify no "Tồn an toàn" regression)
        print("[TEST 4] Query: 'tạo phiếu xuất kho'")
        page.locator("#aiTextInput").fill("tạo phiếu xuất kho")
        page.locator("#aiSendBtn").click()
        page.wait_for_timeout(3500)
        
        last_bubble = page.locator(".ai-msg.assistant .ai-bubble-content").last
        text4 = last_bubble.inner_text()
        print(" -> Response:", text4.split('\n')[0])
        assert "Tất cả hàng hóa hiện đều ở mức tồn an toàn" not in text4, "Bị dính lỗi tồn an toàn!"
        assert "xuất kho" in text4.lower() or "đề xuất" in text4.lower()
        page.screenshot(path=os.path.join(OUTPUT_DIR, "stage1_browser_xuat_kho_proposal.png"))
        print(" -> Screenshot saved: stage1_browser_xuat_kho_proposal.png ✅\n")
        
        print("🎉 TOÀN BỘ 4 TEST CASES TRÌNH DUYỆT ĐẠT 100% PASS!")
        browser.close()

if __name__ == "__main__":
    run_stage1_browser_verification()
