import json
import sys
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:4180')
        page.wait_for_timeout(2000)
        
        # Check initial state
        data = page.evaluate('''() => {
            const prods = window.__qbiz_app__.state.data.products || [];
            const levels = window.__qbiz_app__.state.data.levels || [];
            const warehouses = window.__qbiz_app__.state.data.warehouses || [];
            return {
                warehouses,
                productsCount: prods.length,
                levelsCount: levels.length,
                products: prods.map(p => {
                    const lvs = levels.filter(l => l.productId === p.id);
                    const stock = lvs.reduce((m, l) => Math.max(m, Math.max(0, (l.onHand || 0) - (l.reserved || 0) - (l.damaged || 0))), 0);
                    return {
                        id: p.id,
                        name: p.name,
                        sku: p.sku,
                        price: p.price,
                        type: p.type,
                        stock,
                        levels: lvs.map(l => ({ warehouseId: l.warehouseId, onHand: l.onHand, reserved: l.reserved }))
                    };
                })
            };
        }''')
        
        with open('tests/browser_stock_dump.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Initial state saved to tests/browser_stock_dump.json")
        print(f"Warehouses: {len(data['warehouses'])}, Products: {data['productsCount']}, Levels: {data['levelsCount']}")
        
        # Check after clicking "Xem shop demo"
        print("Now clicking 'Xem shop demo' (preview-demo)...")
        page.evaluate("() => window.__qbiz_app__.previewDemo('retail')")
        page.wait_for_timeout(2000)
        
        data_demo = page.evaluate('''() => {
            const prods = window.__qbiz_app__.state.data.products || [];
            const levels = window.__qbiz_app__.state.data.levels || [];
            const warehouses = window.__qbiz_app__.state.data.warehouses || [];
            return {
                warehouses,
                productsCount: prods.length,
                levelsCount: levels.length,
                products: prods.map(p => {
                    const lvs = levels.filter(l => l.productId === p.id);
                    const stock = lvs.reduce((m, l) => Math.max(m, Math.max(0, (l.onHand || 0) - (l.reserved || 0) - (l.damaged || 0))), 0);
                    return {
                        id: p.id,
                        name: p.name,
                        sku: p.sku,
                        price: p.price,
                        type: p.type,
                        stock,
                        levels: lvs.map(l => ({ warehouseId: l.warehouseId, onHand: l.onHand, reserved: l.reserved }))
                    };
                })
            };
        }''')
        
        with open('tests/browser_demo_stock_dump.json', 'w', encoding='utf-8') as f:
            json.dump(data_demo, f, ensure_ascii=False, indent=2)
        print("Demo state saved to tests/browser_demo_stock_dump.json")
        print(f"Warehouses: {len(data_demo['warehouses'])}, Products: {data_demo['productsCount']}, Levels: {data_demo['levelsCount']}")
        
        browser.close()

if __name__ == '__main__':
    main()
