import sys
import json
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

def run_audit():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:4180')
        page.wait_for_function('() => window.__qbiz_app__ && window.__qbiz_app__.state && window.__qbiz_app__.state.data')
        page.wait_for_timeout(1000)
        
        audit_data = page.evaluate('''async () => {
            const dbs = await indexedDB.databases();
            const dbList = dbs.map(d => d.name);
            const targetDbName = dbList.find(n => n.includes('qbiz')) || 'qbiz_kho_v1';
            
            const req = indexedDB.open(targetDbName);
            const db = await new Promise((resolve, reject) => {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            
            const getAll = (storeName) => new Promise((resolve) => {
                if (!db.objectStoreNames.contains(storeName)) return resolve([]);
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const r = store.getAll();
                r.onsuccess = () => resolve(r.result || []);
                r.onerror = () => resolve([]);
            });
            
            const sales = await getAll('sales');
            const orders = await getAll('orders');
            const movements = await getAll('movements');
            const shifts = await getAll('shifts');
            const levels = await getAll('levels');
            const products = await getAll('products');
            
            return { dbName: targetDbName, sales, orders, movements, shifts, levels, products };
        }''')
        
        sales = audit_data.get('sales', [])
        orders = audit_data.get('orders', [])
        movements = audit_data.get('movements', [])
        shifts = audit_data.get('shifts', [])
        levels = audit_data.get('levels', [])
        products = audit_data.get('products', [])
        
        print(f"=== HISTORICAL AUDIT REPORT ===")
        print(f"Total Sales: {len(sales)}")
        print(f"Total Orders: {len(orders)}")
        print(f"Total Movements: {len(movements)}")
        print(f"Total Shifts: {len(shifts)}")
        print(f"Total Levels: {len(levels)}")
        print(f"Total Products: {len(products)}")
        
        # 1. Audit Sales
        paid_sales_no_shift = []
        for s in sales:
            st = s.get('payment_status') or (s.get('payments', [{}])[0].get('status') if s.get('payments') else 'PAID')
            if st == 'PAID' and not s.get('shift_id'):
                paid_sales_no_shift.append(s)
                
        print(f"\n--- AUDIT BUG #1: PAID SALES WITHOUT SHIFT_ID ---")
        print(f"Count: {len(paid_sales_no_shift)}")
        total_unassigned_amount = 0
        for s in paid_sales_no_shift:
            amt = s.get('grand_total') if s.get('grand_total') is not None else s.get('total', 0)
            try:
                total_unassigned_amount += float(amt or 0)
            except:
                pass
            print(f"  * ID: {s.get('id')}, Code: {s.get('code')}, Total: {amt}, Created: {s.get('created_at')}")
        print(f"Total unassigned amount: {total_unassigned_amount:,} VND")
        
        # 2. Audit Orders
        completed_orders = [o for o in orders if str(o.get('status', '')).upper() == 'COMPLETED']
        print(f"\n--- AUDIT BUG #2: COMPLETED ORDERS WITHOUT MOVEMENTS ---")
        print(f"Total COMPLETED Orders: {len(completed_orders)}")
        
        unmoved_orders = []
        for o in completed_orders:
            oid = o.get('id')
            ocode = o.get('code')
            matching_movs = [
                m for m in movements 
                if m.get('reference_id') == oid or m.get('reference') == ocode or (m.get('reference_type') == 'order' and m.get('reference_id') == oid)
            ]
            if not matching_movs:
                items = o.get('items', [])
                total_qty = sum(it.get('quantity', 0) for it in items)
                unmoved_orders.append({
                    'order_id': oid,
                    'code': ocode,
                    'warehouse_id': o.get('warehouseId') or o.get('location_id') or 'N/A',
                    'items_count': len(items),
                    'total_qty': total_qty,
                    'items_detail': [{'id': it.get('itemId') or it.get('item_id'), 'qty': it.get('quantity')} for it in items]
                })
                
        print(f"COMPLETED Orders without inventory movements: {len(unmoved_orders)}")
        for uo in unmoved_orders:
            print(f"  * Order ID: {uo['order_id']}, Code: {uo['code']}, Warehouse: {uo['warehouse_id']}, Total Qty: {uo['total_qty']}")
            print(f"    Items: {uo['items_detail']}")
            
        browser.close()
        return {
            'paid_sales_no_shift_count': len(paid_sales_no_shift),
            'unmoved_orders_count': len(unmoved_orders)
        }

if __name__ == '__main__':
    run_audit()
