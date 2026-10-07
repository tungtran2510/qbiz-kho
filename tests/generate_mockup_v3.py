# -*- coding: utf-8 -*-
import os
import sys
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

html_content = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=390, initial-scale=1.0">
<title>Mockup Edit Product V3</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  body { background: #0b1329; display: flex; justify-content: center; align-items: flex-start; min-height: 844px; padding: 10px 0; }
  .phone-screen { width: 390px; min-height: 824px; background: #f8fafc; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column; }
  
  /* Topbar phone header */
  .phone-status { height: 28px; background: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; font-size: 11px; font-weight: 700; color: #0f172a; }
  
  /* Modal Card */
  .modal-container { flex: 1; background: #ffffff; display: flex; flex-direction: column; }
  .modal-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; background: #ffffff; }
  .modal-head h3 { font-size: 16px; font-weight: 800; color: #0f172a; }
  .modal-head p { font-size: 11.5px; color: #64748b; margin-top: 1px; }
  .modal-head .close-btn { width: 30px; height: 30px; border-radius: 50%; border: 0; background: #f1f5f9; color: #64748b; font-size: 16px; font-weight: bold; cursor: pointer; display: grid; place-items: center; }
  
  .modal-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
  
  /* 1. HERO ROW: ẢNH TO RÕ NẰM TRANG TRỌNG NGAY CẠNH TÊN */
  .hero-photo-row { display: flex; gap: 10px; align-items: stretch; background: #ffffff; }
  .photo-frame { width: 88px; height: 88px; border-radius: 12px; border: 1.5px dashed #cbd5e1; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; cursor: pointer; flex-shrink: 0; overflow: hidden; }
  .photo-frame img { width: 100%; height: 100%; object-fit: cover; }
  .photo-badge { position: absolute; bottom: 0; inset-inline: 0; background: rgba(15,23,42,0.78); color: #ffffff; font-size: 10px; font-weight: 700; text-align: center; padding: 3px 0; backdrop-filter: blur(2px); }
  
  .name-block { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
  .name-block label { font-size: 11.5px; font-weight: 700; color: #334155; }
  .name-block textarea { width: 100%; height: 66px; padding: 7px 9px; border: 1px solid #cbd5e1; border-radius: 9px; font-size: 13px; font-weight: 600; color: #0f172a; resize: none; outline: none; line-height: 1.35; }
  .name-block textarea:focus { border-color: #1485ee; }
  
  /* 2-Column Grid */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field label { font-size: 11px; font-weight: 700; color: #475569; }
  .field input, .field select { width: 100%; height: 38px; padding: 0 9px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 600; color: #0f172a; background: #ffffff; outline: none; }
  .field input:focus, .field select:focus { border-color: #1485ee; }
  
  .price-sell input { color: #0284c7; font-weight: 800; font-size: 14px; background: #f0f9ff; border-color: #bae6fd; }
  .price-cost input { color: #475569; font-weight: 600; }
  
  /* BẢO HÀNH SIÊU GỌN - 1 DÒNG DUY NHẤT */
  .warranty-compact-bar { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: end; background: #f8fafc; padding: 8px 10px; border-radius: 9px; border: 1px solid #e2e8f0; }
  .warranty-compact-bar .wb-item label { font-size: 10.5px; font-weight: 750; color: #0369a1; display: block; margin-bottom: 2px; }
  .warranty-compact-bar select { height: 34px; padding: 0 6px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 12px; font-weight: 600; color: #0f172a; background: #ffffff; width: 100%; }
  .warranty-compact-bar input { height: 34px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 12px; width: 100%; background: #ffffff; }
  
  /* Details fold */
  details.more-box { border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 2px; }
  details.more-box summary { font-size: 11.5px; font-weight: 750; color: #1485ee; cursor: pointer; user-select: none; padding: 4px 0; }
  .more-inner { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; }
  
  /* Modal Foot */
  .modal-foot { display: flex; gap: 10px; padding: 10px 14px; border-top: 1px solid #f1f5f9; background: #ffffff; }
  .btn-close { flex: 1; height: 42px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-size: 13.5px; font-weight: 700; cursor: pointer; }
  .btn-save { flex: 1.5; height: 42px; border-radius: 10px; border: 0; background: #1485ee; color: #ffffff; font-size: 13.5px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(20,133,238,0.25); }
</style>
</head>
<body>
<div class="phone-screen">
  <div class="phone-status">
    <span>9:41</span>
    <span>QBiz Kho POS · Mobile 390x844</span>
    <span>100% 🔋</span>
  </div>
  
  <div class="modal-container">
    <div class="modal-head">
      <div>
        <h3>Sửa sản phẩm</h3>
        <p>Kho hàng & Giá bán trực tiếp</p>
      </div>
      <button class="close-btn">✕</button>
    </div>
    
    <div class="modal-body">
      <!-- 1. ẢNH ĐƯỢC ƯU TIÊN SỐ 1: NẰM TRANG TRỌNG CẠNH TÊN SẢN PHẨM -->
      <div class="hero-photo-row">
        <div class="photo-frame" title="Chạm để chụp camera hoặc chọn ảnh từ máy">
          <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88' viewBox='0 0 88 88'><rect width='88' height='88' fill='%23f1f5f9'/><text x='44' y='50' font-size='32' text-anchor='middle' fill='%2364748b'>👟</text></svg>" alt="Ảnh sản phẩm">
          <div class="photo-badge">📷 Đổi ảnh</div>
        </div>
        <div class="name-block">
          <label>Tên sản phẩm *</label>
          <textarea placeholder="Nhập tên sản phẩm...">Giày Sneaker Nam Retro Classic (Trắng - 42)</textarea>
        </div>
      </div>
      
      <!-- 2. GIÁ BÁN & GIÁ VỐN (2 CỘT 50/50 GỌN GÀNG) -->
      <div class="grid-2">
        <div class="field price-sell">
          <label>Giá bán (đ)</label>
          <input type="text" value="650.000">
        </div>
        <div class="field price-cost">
          <label>Giá nhập (vốn gần nhất)</label>
          <input type="text" value="420.000">
        </div>
      </div>
      
      <!-- 3. TỒN KHO & ĐƠN VỊ TÍNH (2 CỘT) -->
      <div class="grid-2">
        <div class="field">
          <label>Tồn kho hiện tại</label>
          <input type="number" value="18">
        </div>
        <div class="field">
          <label>Đơn vị tính</label>
          <select>
            <option selected>Đôi</option>
            <option>Cái / Chiếc</option>
            <option>Hộp</option>
            <option>Bộ</option>
            <option>Kg</option>
          </select>
        </div>
      </div>
      
      <!-- 4. DANH MỤC & MÃ VẠCH (BARCODE QUÉT TÍT TÍT) -->
      <div class="grid-2">
        <div class="field">
          <label>Danh mục</label>
          <select>
            <option selected>Giày dép nam</option>
            <option>Phụ kiện</option>
            <option>Thời trang thể thao</option>
          </select>
        </div>
        <div class="field">
          <label>Mã vạch (Barcode / SKU)</label>
          <input type="text" value="GI-01-W42" placeholder="Bắn mã vạch vào đây...">
        </div>
      </div>
      
      <!-- 5. BẢO HÀNH SIÊU TINH GỌN (CHỈ 1 DÒNG DUY NHẤT, KHÔNG RƯỜM RÀ) -->
      <div class="warranty-compact-bar">
        <div class="wb-item">
          <label>🛡️ Bảo hành</label>
          <select>
            <option>Không BH</option>
            <option>1 tháng</option>
            <option>3 tháng</option>
            <option selected>6 tháng</option>
            <option>12 tháng</option>
            <option>24 tháng</option>
          </select>
        </div>
        <div class="wb-item" style="flex:1;">
          <label style="color:#64748b;">Chi tiết in bill (tùy chọn)</label>
          <input type="text" value="BH keo & chỉ may" placeholder="Vd: Đổi size 7 ngày...">
        </div>
      </div>
      
      <!-- 6. NÂNG CAO (GẬP LẠI CHO GỌN) -->
      <details class="more-box">
        <summary>⚙️ Thông tin thêm (Cảnh báo hết hàng, IMEI, Mô tả...) ▸</summary>
        <div class="more-inner">
          <div class="grid-2">
            <div class="field">
              <label>Báo động khi tồn dưới</label>
              <input type="number" value="5">
            </div>
            <div class="field">
              <label>Serial / IMEI</label>
              <select>
                <option selected>Không quản lý IMEI</option>
                <option>Bắt buộc IMEI khi bán</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Mô tả sản phẩm</label>
            <input type="text" placeholder="Chất liệu, ghi chú nội bộ...">
          </div>
        </div>
      </details>
    </div>
    
    <div class="modal-foot">
      <button class="btn-close">Đóng</button>
      <button class="btn-save">Lưu thay đổi</button>
    </div>
  </div>
</div>
</body>
</html>
"""

temp_html = os.path.join(ARTIFACT_DIR, "temp_mockup_v3.html")
with open(temp_html, "w", encoding="utf-8") as f:
    f.write(html_content)

out_img = os.path.join(ARTIFACT_DIR, "evidence_mockup_product_edit_v3_image_first.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto(f"file:///{temp_html.replace(os.sep, '/')}")
    page.wait_for_timeout(600)
    page.screenshot(path=out_img)
    print("Rendered:", out_img)
    browser.close()

if os.path.exists(temp_html):
    os.remove(temp_html)
