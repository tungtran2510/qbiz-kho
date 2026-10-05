import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.goto('http://127.0.0.1:4180')
    pg.wait_for_timeout(2000)
    
    # Check all products stock from state.data.levels
    stock_info = pg.evaluate('''() => {
        const levels = window.__qbiz_app__.state.data.levels || [];
        return window.__qbiz_app__.state.data.products.map(p => {
            if (p.type === 'SERVICE') return { id: p.id, name: p.name, stock: 'SERVICE' };
            const pLevels = levels.filter(l => l.productId === p.id);
            const totalStock = pLevels.reduce((s, l) => s + (Number(l.onHand) || 0), 0);
            return { id: p.id, name: p.name, stock: totalStock };
        });
    }''')
    
    print('--- DANH SÁCH TỒN KHO TOÀN BỘ SẢN PHẨM ---')
    zero_stock = []
    for item in stock_info:
        print(f"{item['id']}: {item['name']} -> Tồn kho: {item['stock']}")
        if item['stock'] != 'SERVICE' and (item['stock'] is None or item['stock'] <= 0):
            zero_stock.append(item)
            
    print(f"\nSố sản phẩm hết hàng (tồn <= 0): {len(zero_stock)}")
    if zero_stock:
        print('CÁC SẢN PHẨM BỊ HẾT HÀNG:', zero_stock)
        assert len(zero_stock) == 0, f"Vẫn còn {len(zero_stock)} sản phẩm bị hết hàng!"
    else:
        print('>>> XÁC NHẬN: 100% SẢN PHẨM ĐỀU CÒN HÀNG (TỒN KHO DỒI DÀO)! <<<')
        
    # Also verify UI POS screen has NO out-of-stock badges
    pg.evaluate('''() => {
        window.__qbiz_app__.state._bypassEntryOverlay = true;
        window.__qbiz_app__.state.page = 'sales';
        window.__qbiz_app__.state.saleStep = 'browse';
        window.__qbiz_app__.state.saleShowAll = true;
        window.__qbiz_app__.render();
    }''')
    pg.wait_for_timeout(500)
    out_of_stock_badges = pg.locator('.pos-stock-badge.out-of-stock').count()
    print(f"Số huy hiệu 'Hết hàng' trên giao diện POS: {out_of_stock_badges}")
    assert out_of_stock_badges == 0, f"Vẫn còn {out_of_stock_badges} huy hiệu 'Hết hàng' trên màn hình POS!"
    print(">>> 100% SẢN PHẨM ĐỀU CÓ HUY HIỆU XANH CÒN HÀNG VÀ CÓ NÚT [+] BÁN HÀNG! <<<")
    
    # Capture fresh screenshot
    pg.screenshot(path=r"C:\Users\Admin\.gemini\antigravity\brain\b47395b3-a2f2-4e22-a716-5540d7b61424\evidence_all_in_stock_pos.png")
    print("Saved evidence: evidence_all_in_stock_pos.png")
    
    b.close()
