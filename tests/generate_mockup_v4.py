# -*- coding: utf-8 -*-
import os
import sys
from playwright.sync_api import sync_playwright

ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424"

html_content = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=780, initial-scale=1.0">
<title>Mockup Edit Product V3 with Multi-image Popup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  body { background: #0b1329; display: flex; justify-content: center; align-items: flex-start; min-height: 844px; padding: 20px; gap: 20px; }
  
  .phone-screen { width: 375px; min-height: 800px; background: #f8fafc; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column; }
  .screen-title { background: #1e293b; color: #94a3b8; font-size: 11px; font-weight: 700; text-align: center; padding: 8px 0; letter-spacing: 0.5px; }
  
  /* Modal Container */
  .modal-container { flex: 1; background: #ffffff; display: flex; flex-direction: column; }
  .modal-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f1f5f9; }
  .modal-head h3 { font-size: 15.5px; font-weight: 800; color: #0f172a; }
  .modal-head p { font-size: 11px; color: #64748b; margin-top: 1px; }
  .modal-head .close-btn { width: 28px; height: 28px; border-radius: 50%; border: 0; background: #f1f5f9; color: #64748b; font-size: 15px; font-weight: bold; cursor: pointer; display: grid; place-items: center; }
  
  .modal-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
  
  /* 1. HERO PHOTO ROW WITH MULTI-IMAGE INDICATOR */
  .hero-photo-row { display: flex; gap: 10px; align-items: stretch; }
  .photo-frame-group { position: relative; width: 88px; height: 88px; flex-shrink: 0; cursor: pointer; }
  .photo-frame { width: 88px; height: 88px; border-radius: 12px; border: 1.5px solid #cbd5e1; background: #f1f5f9; overflow: hidden; position: relative; }
  .photo-frame img { width: 100%; height: 100%; object-fit: cover; }
  
  /* Multi-photo badge & plus button */
  .badge-photo-count { position: absolute; top: 4px; right: 4px; background: rgba(15,23,42,0.85); color: #ffffff; font-size: 10px; font-weight: 750; padding: 2px 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); }
  .btn-photo-action { position: absolute; bottom: 0; inset-inline: 0; background: rgba(15,23,42,0.78); color: #ffffff; font-size: 9.5px; font-weight: 700; text-align: center; padding: 3px 0; backdrop-filter: blur(2px); }
  
  /* Mini thumb dots / plus next to photo */
  .mini-thumbs-col { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
  .mini-thumb { width: 24px; height: 24px; border-radius: 6px; border: 1px solid #cbd5e1; object-fit: cover; }
  .mini-plus-btn { width: 24px; height: 24px; border-radius: 6px; border: 1px dashed #94a3b8; background: #f8fafc; color: #1485ee; font-size: 13px; font-weight: 800; display: grid; place-items: center; cursor: pointer; }
  
  .name-block { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
  .name-block label { font-size: 11px; font-weight: 700; color: #334155; }
  .name-block textarea { width: 100%; height: 66px; padding: 7px 9px; border: 1px solid #cbd5e1; border-radius: 9px; font-size: 13px; font-weight: 600; color: #0f172a; resize: none; outline: none; line-height: 1.35; }
  
  /* 2-Column Grid */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field label { font-size: 11px; font-weight: 700; color: #475569; }
  .field input, .field select { width: 100%; height: 38px; padding: 0 9px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 600; color: #0f172a; background: #ffffff; outline: none; }
  
  .price-sell input { color: #0284c7; font-weight: 800; font-size: 14px; background: #f0f9ff; border-color: #bae6fd; }
  
  /* Bảo hành gọn */
  .warranty-compact-bar { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: end; background: #f8fafc; padding: 8px 10px; border-radius: 9px; border: 1px solid #e2e8f0; }
  .warranty-compact-bar label { font-size: 10.5px; font-weight: 750; color: #0369a1; display: block; margin-bottom: 2px; }
  .warranty-compact-bar select, .warranty-compact-bar input { height: 34px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 12px; background: #ffffff; }
  
  /* Details */
  details.more-box { border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 2px; }
  details.more-box summary { font-size: 11.5px; font-weight: 750; color: #1485ee; cursor: pointer; user-select: none; padding: 4px 0; }
  
  .modal-foot { display: flex; gap: 10px; padding: 10px 14px; border-top: 1px solid #f1f5f9; background: #ffffff; }
  .btn-close { flex: 1; height: 40px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-size: 13px; font-weight: 700; }
  .btn-save { flex: 1.5; height: 40px; border-radius: 10px; border: 0; background: #1485ee; color: #ffffff; font-size: 13px; font-weight: 700; box-shadow: 0 4px 12px rgba(20,133,238,0.25); }

  /* ================= SECOND SCREEN: POPUP ALBUM ẢNH ================= */
  .album-popup-overlay { flex: 1; background: rgba(15,23,42,0.6); display: flex; flex-direction: column; justify-content: flex-end; }
  .album-sheet { background: #ffffff; border-radius: 20px 20px 0 0; display: flex; flex-direction: column; max-height: 85%; box-shadow: 0 -10px 30px rgba(0,0,0,0.2); }
  .album-sheet-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; }
  .album-sheet-head h4 { font-size: 15px; font-weight: 800; color: #0f172a; }
  .album-sheet-head span { font-size: 11.5px; color: #1485ee; font-weight: 700; }
  
  .album-sheet-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .gallery-item { position: relative; aspect-ratio: 1/1; border-radius: 12px; overflow: hidden; border: 1.5px solid #e2e8f0; background: #f8fafc; }
  .gallery-item img { width: 100%; height: 100%; object-fit: cover; }
  .gallery-item.cover-item { border-color: #1485ee; border-width: 2px; }
  .tag-cover { position: absolute; top: 4px; left: 4px; background: #1485ee; color: #fff; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 4px; }
  .btn-del-img { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; background: rgba(15,23,42,0.75); color: #fff; border: 0; font-size: 13px; font-weight: bold; cursor: pointer; display: grid; place-items: center; }
  
  .btn-add-slot { aspect-ratio: 1/1; border-radius: 12px; border: 2px dashed #93c5fd; background: #eff6ff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; color: #1485ee; }
  .btn-add-slot strong { font-size: 20px; line-height: 1; }
  .btn-add-slot span { font-size: 10px; font-weight: 700; }
  
  .album-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
  .btn-cam-shoot { height: 40px; border-radius: 10px; border: 1px solid #1485ee; background: #f0f7ff; color: #1485ee; font-size: 12.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  .btn-choose-file { height: 40px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-size: 12.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  
  .album-sheet-foot { padding: 12px 16px; border-top: 1px solid #f1f5f9; display: flex; }
  .btn-album-done { width: 100%; height: 42px; border-radius: 10px; border: 0; background: #1485ee; color: #fff; font-size: 13.5px; font-weight: 700; }
</style>
</head>
<body>

<!-- MÀN 1: MÀN HÌNH SỬA SẢN PHẨM CHÍNH (GIỮ NGUYÊN GỌN GÀNG) -->
<div class="phone-screen">
  <div class="screen-title">MÀN HÌNH CHÍNH · SỬA SẢN PHẨM</div>
  <div class="modal-container">
    <div class="modal-head">
      <div>
        <h3>Sửa sản phẩm</h3>
        <p>Giao diện tinh gọn 1 màn hình</p>
      </div>
      <button class="close-btn">✕</button>
    </div>
    
    <div class="modal-body">
      <!-- 1. KHUNG ẢNH CHÍNH CÓ SỐ LƯỢNG ẢNH + NÚT CỘNG ẢNH -->
      <div class="hero-photo-row">
        <div class="photo-frame-group" title="Chạm để mở album ảnh">
          <div class="photo-frame">
            <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88' viewBox='0 0 88 88'><rect width='88' height='88' fill='%23eff6ff'/><text x='44' y='52' font-size='34' text-anchor='middle' fill='%233b82f6'>👟</text></svg>" alt="Ảnh chính">
            <span class="badge-photo-count">3 ảnh</span>
            <div class="btn-photo-action">📷 Xem / Thêm</div>
          </div>
        </div>
        
        <!-- CỘNG CÁC ẢNH NHỎ BÊN CẠNH -->
        <div class="mini-thumbs-col">
          <div class="mini-plus-btn" title="Thêm ảnh nhanh">+</div>
        </div>
        
        <div class="name-block">
          <label>Tên sản phẩm *</label>
          <textarea placeholder="Nhập tên sản phẩm...">Giày Sneaker Nam Retro Classic (Trắng - 42)</textarea>
        </div>
      </div>
      
      <!-- 2. GIÁ BÁN & GIÁ VỐN -->
      <div class="grid-2">
        <div class="field price-sell">
          <label>Giá bán (đ)</label>
          <input type="text" value="650.000">
        </div>
        <div class="field">
          <label>Giá nhập gần nhất</label>
          <input type="text" value="420.000">
        </div>
      </div>
      
      <!-- 3. TỒN KHO & ĐƠN VỊ TÍNH -->
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
          </select>
        </div>
      </div>
      
      <!-- 4. DANH MỤC & MÃ VẠCH (BARCODE) -->
      <div class="grid-2">
        <div class="field">
          <label>Danh mục</label>
          <select>
            <option selected>Giày dép nam</option>
            <option>Phụ kiện</option>
          </select>
        </div>
        <div class="field">
          <label>Mã vạch (Barcode)</label>
          <input type="text" value="GI-01-W42">
        </div>
      </div>
      
      <!-- 5. BẢO HÀNH GỌN GÀNG -->
      <div class="warranty-compact-bar">
        <div>
          <label>🛡️ Bảo hành</label>
          <select>
            <option>Không BH</option>
            <option selected>6 tháng</option>
            <option>12 tháng</option>
          </select>
        </div>
        <div style="flex:1;">
          <label style="color:#64748b;">Chi tiết in bill</label>
          <input type="text" value="BH keo & chỉ may">
        </div>
      </div>
      
      <!-- 6. NÂNG CAO -->
      <details class="more-box">
        <summary>⚙️ Thông tin thêm (Cảnh báo hết hàng, IMEI...) ▸</summary>
      </details>
    </div>
    
    <div class="modal-foot">
      <button class="btn-close">Đóng</button>
      <button class="btn-save">Lưu thay đổi</button>
    </div>
  </div>
</div>

<!-- MÀN 2: POPUP QUẢN LÝ ALBUM NHIỀU ẢNH (BẬT LÊN KHI ẤN VÀO ẢNH HOẶC NÚT +) -->
<div class="phone-screen">
  <div class="screen-title">BẬT POPUP KHI BẤM ẢNH HOẶC NÚT (+)</div>
  <div class="album-popup-overlay">
    <div class="album-sheet">
      <div class="album-sheet-head">
        <div>
          <h4>Album ảnh sản phẩm</h4>
          <p style="font-size:11px;color:#64748b;margin-top:2px;">Tối đa 6 ảnh · Ảnh đầu tiên là ảnh bìa</p>
        </div>
        <span>3 / 6 ảnh</span>
      </div>
      
      <div class="album-sheet-body">
        <div class="gallery-grid">
          <!-- Ảnh 1: Ảnh bìa -->
          <div class="gallery-item cover-item">
            <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23eff6ff'/><text x='50' y='60' font-size='42' text-anchor='middle' fill='%233b82f6'>👟</text></svg>" alt="Ảnh 1">
            <span class="tag-cover">Ảnh bìa</span>
            <button class="btn-del-img">✕</button>
          </div>
          <!-- Ảnh 2 -->
          <div class="gallery-item">
            <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23fef2f2'/><text x='50' y='60' font-size='42' text-anchor='middle' fill='%23ef4444'>🏷️</text></svg>" alt="Ảnh 2">
            <button class="btn-del-img">✕</button>
          </div>
          <!-- Ảnh 3 -->
          <div class="gallery-item">
            <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23f0fdf4'/><text x='50' y='60' font-size='42' text-anchor='middle' fill='%2322c55e'>📦</text></svg>" alt="Ảnh 3">
            <button class="btn-del-img">✕</button>
          </div>
          <!-- Slot thêm ảnh -->
          <div class="btn-add-slot">
            <strong>+</strong>
            <span>Thêm ảnh</span>
          </div>
        </div>
        
        <!-- Nút chụp camera hoặc chọn từ máy -->
        <div class="album-actions">
          <button class="btn-cam-shoot">📷 Chụp camera</button>
          <button class="btn-choose-file">🖼️ Chọn từ máy</button>
        </div>
      </div>
      
      <div class="album-sheet-foot">
        <button class="btn-album-done">✓ Xong (Áp dụng album)</button>
      </div>
    </div>
  </div>
</div>

</body>
</html>
"""

temp_html = os.path.join(ARTIFACT_DIR, "temp_mockup_v4_album.html")
with open(temp_html, "w", encoding="utf-8") as f:
    f.write(html_content)

out_img = os.path.join(ARTIFACT_DIR, "evidence_mockup_product_gallery_popup.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 780, "height": 844})
    page.goto(f"file:///{temp_html.replace(os.sep, '/')}")
    page.wait_for_timeout(600)
    page.screenshot(path=out_img)
    print("Rendered:", out_img)
    browser.close()

if os.path.exists(temp_html):
    os.remove(temp_html)
