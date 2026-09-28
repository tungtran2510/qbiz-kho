import sys
import io
import json
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

PRIMARY_URL = "https://qbiz-kho.vercel.app"
BACKUP_URL = "https://qbiz-kho.netlify.app"

def run_2check_gate():
    print("=" * 70)
    print("QBIZ KHO — FINAL 2-CHECK GATE BEFORE PHASE 2A")
    print("MODE: VERIFY-ONLY / NO CODE CHANGES / NO PHASE 2A")
    print("=" * 70)

    results = {
        'PRINT_REGRESSION': 'FAIL',
        'PRINT_PLACEHOLDER_AS_BUSINESS_VALUE': 1,
        'BACKUP_HOST': 'FAIL',
        'DUAL_HOST_SMOKE': 'FAIL',
        'STALE_BACKUP_RELEASE': 1,
        'FATAL_BACKUP_RUNTIME_ERROR': 1,
        'P0': 0,
        'P1': 0,
        'BLOCKERS': 0,
        'PHASE2_ENTRY': 'NOT_AUTHORIZED',
        'VERDICT': 'FAIL'
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})

        # =====================================================================
        # CHECK #1: PRINT_REGRESSION TRÊN PRODUCTION BUILD (PRIMARY: VERCEL)
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> CHECK #1: PRINT_REGRESSION TRÊN PRIMARY PRODUCTION (VERCEL)")
        print(f"URL: {PRIMARY_URL}")
        print("=" * 60)

        page_primary = context.new_page()
        primary_console_errors = []
        page_primary.on('console', lambda msg: primary_console_errors.append(msg.text) if msg.type == 'error' else None)

        page_primary.goto(PRIMARY_URL, wait_until='networkidle')
        page_primary.wait_for_timeout(1500)

        # Enter demo on Primary to have warehouse and product context
        page_primary.evaluate('''async () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            const { loadDemoIndustry } = await import('./src/demo-showroom.js');
            await loadDemoIndustry('retail');
            await window.__qbiz_app__.refresh();
        }''')
        page_primary.wait_for_timeout(1000)

        # Execute voucher render with empty optional fields
        voucher_test = page_primary.evaluate('''() => {
            const renderWarehouseVoucherHtml = window.renderWarehouseVoucherHtml || window.__qbiz_app__.renderWarehouseVoucherHtml;
            const app = window.__qbiz_app__;
            const prod = (app.state.data.products || [])[0] || { id: 'p_135', name: 'Ghế sáng chế 135', sku: 'DL-135' };
            const wh = (app.state.data.warehouses || [])[0] || { id: 'wh_main', name: 'Kho Trung tâm' };

            // Explicitly empty optional fields
            const doc = {
                id: 'PNK-PROD-VERIFY-001',
                code: 'PNK-PROD-VERIFY-001',
                created_at: new Date().toISOString(),
                kind: 'receive',
                sub_type: 'PURCHASE',
                warehouse_id: wh.id,
                deliverer_name: '',
                receiver_name: '',
                supplier_id: '',
                reference: '',
                note: '',
                lines: [{
                    productId: prod.id,
                    name: prod.name,
                    sku: prod.sku,
                    unit: 'chiếc',
                    qty: 5,
                    price: 80000,
                    line_total: 400000
                }]
            };

            const html = renderWarehouseVoucherHtml(doc, 'receive');

            // Render into dedicated container for visual inspection
            let host = document.getElementById('verifyPrintHost');
            if (!host) {
                host = document.createElement('div');
                host.id = 'verifyPrintHost';
                host.style.position = 'relative';
                host.style.padding = '20px';
                host.style.background = '#fff';
                document.body.appendChild(host);
            }
            host.innerHTML = html;

            // Check leaked placeholders / undefined / null
            const hasUndefined = html.includes('undefined');
            const hasNull = html.includes('null');
            const hasNan = html.includes('NaN');
            const hasDelivererPlaceholder = html.includes('Họ tên người giao') || html.includes('placeholder');
            const hasReceiverPlaceholder = html.includes('Họ tên người nhận');
            const hasRefPlaceholder = html.includes('Số chứng từ / Ghi chú');

            // Check dashes for optional empty fields
            const hasDashes = html.includes('—');

            return {
                htmlLength: html.length,
                hasUndefined,
                hasNull,
                hasNan,
                hasDelivererPlaceholder,
                hasReceiverPlaceholder,
                hasRefPlaceholder,
                hasDashes,
                code: doc.code
            };
        }''')

        # Take screenshot of print preview on Primary production
        page_primary.locator('#verifyPrintHost').screenshot(path='tests/evidence/primary_print_preview_evidence.png')
        print(f"Screenshot saved to: tests/evidence/primary_print_preview_evidence.png")

        print("Print voucher check results:")
        print(f"  - Leaked 'undefined': {voucher_test['hasUndefined']}")
        print(f"  - Leaked 'null': {voucher_test['hasNull']}")
        print(f"  - Leaked 'NaN': {voucher_test['hasNan']}")
        print(f"  - Leaked Deliverer placeholder: {voucher_test['hasDelivererPlaceholder']}")
        print(f"  - Leaked Receiver placeholder: {voucher_test['hasReceiverPlaceholder']}")
        print(f"  - Leaked Reference placeholder: {voucher_test['hasRefPlaceholder']}")
        print(f"  - Uses clean '—' for empty optional values: {voucher_test['hasDashes']}")

        leaked_any = (
            voucher_test['hasUndefined'] or
            voucher_test['hasNull'] or
            voucher_test['hasNan'] or
            voucher_test['hasDelivererPlaceholder'] or
            voucher_test['hasReceiverPlaceholder'] or
            voucher_test['hasRefPlaceholder']
        )

        if not leaked_any and voucher_test['hasDashes']:
            print(">>> CHECK #1 (PRINT_REGRESSION): PASS")
            results['PRINT_REGRESSION'] = 'PASS'
            results['PRINT_PLACEHOLDER_AS_BUSINESS_VALUE'] = 0
        else:
            print(">>> CHECK #1 (PRINT_REGRESSION): FAIL")
            results['PRINT_REGRESSION'] = 'FAIL'
            results['PRINT_PLACEHOLDER_AS_BUSINESS_VALUE'] = 1

        page_primary.close()

        # =====================================================================
        # CHECK #2: BACKUP NETLIFY / DUAL-HOST RELEASE
        # =====================================================================
        print("\n" + "=" * 60)
        print(">>> CHECK #2: BACKUP NETLIFY / DUAL-HOST VERIFICATION")
        print(f"Backup URL: {BACKUP_URL}")
        print("=" * 60)

        page_backup = context.new_page()
        backup_console_errors = []
        page_backup.on('console', lambda msg: backup_console_errors.append(msg.text) if msg.type == 'error' else None)
        page_backup.on('pageerror', lambda err: backup_console_errors.append(str(err)))

        # A. Availability
        resp = page_backup.goto(BACKUP_URL, wait_until='networkidle')
        status_code = resp.status if resp else 0
        backup_title = page_backup.title()
        print(f"Backup Availability: HTTP {status_code} | Title: '{backup_title}'")
        avail_ok = (status_code == 200 and 'QBiz Kho' in backup_title)

        # B. Runtime & Navigation
        # Enter demo
        page_backup.evaluate('''async () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            const { loadDemoIndustry } = await import('./src/demo-showroom.js');
            await loadDemoIndustry('retail');
            await window.__qbiz_app__.refresh();
            window.__qbiz_app__.navigate('dashboard');
        }''')
        page_backup.wait_for_timeout(1000)

        routes_tested = {}
        for route in ['sales', 'products', 'warehouse', 'orders', 'dashboard']:
            page_backup.evaluate(f"window.__qbiz_app__.navigate('{route}')")
            page_backup.wait_for_timeout(500)
            cur_page = page_backup.evaluate("window.__qbiz_app__.state.page")
            routes_tested[route] = (cur_page == route)
            print(f"  - Route '{route}': OK={routes_tested[route]}")

        # Targeted smoke: "Kiểm tồn" quick action
        page_backup.evaluate("window.__qbiz_app__.navigate('dashboard')")
        page_backup.wait_for_timeout(500)
        kiem_ton_btn = page_backup.locator('button.quick-tile[data-kind="count"]')
        kiem_ton_btn.click()
        page_backup.wait_for_timeout(500)
        modal_title = page_backup.locator('#modalRoot h3').inner_text()
        prods_rendered = page_backup.locator('#stockProductResults [data-stock-product]').count()
        page_backup.locator('#modalRoot .close-btn').click()
        page_backup.wait_for_timeout(300)
        print(f"  - Quick Action 'Kiểm tồn': Modal='{modal_title}', Suggestions={prods_rendered}")
        kiem_ton_ok = (modal_title == 'Kiểm tồn kho' and prods_rendered > 0)

        # Targeted smoke: AI Assistant Read Query
        ai_resp = page_backup.evaluate('''async () => {
            const ai = window.__qbiz_ai__ || window.__qbiz_app__.ai;
            const res = await ai.handleUserMessage('doanh thu hôm nay');
            return {
                hasText: Boolean(res && res.text),
                status: res?.status,
                textPreview: (res?.text || '').slice(0, 100)
            };
        }''')
        print(f"  - AI Assistant Read Query: Status='{ai_resp['status']}', Response: '{ai_resp['textPreview']}...'")
        ai_ok = ai_resp['hasText']

        # C. Assets / Console
        # Filter benign external errors
        filtered_errors = [e for e in backup_console_errors if not any(x in e for x in ['net::ERR_', 'favicon', '404', 'rpc/'])]
        print(f"  - Fatal Console Errors: {len(filtered_errors)}")
        if filtered_errors:
            for fe in filtered_errors:
                print(f"    * {fe}")

        # D. Release parity comparison (Asset hash & file size comparison)
        import urllib.request, hashlib
        def get_asset_info(url):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req, timeout=10) as r:
                    b = r.read()
                    return {'hash': hashlib.sha256(b).hexdigest(), 'size': len(b)}
            except Exception as ex:
                return {'error': str(ex)}

        primary_appjs = get_asset_info(f"{PRIMARY_URL}/src/app.js")
        backup_appjs = get_asset_info(f"{BACKUP_URL}/src/app.js")
        primary_index = get_asset_info(f"{PRIMARY_URL}/index.html")
        backup_index = get_asset_info(f"{BACKUP_URL}/index.html")

        is_same_appjs = (primary_appjs.get('hash') == backup_appjs.get('hash'))
        is_same_index = (primary_index.get('hash') == backup_index.get('hash'))
        is_stale_release = not (is_same_appjs and is_same_index)

        print("\n  Asset Parity Evidence:")
        print(f"    - Primary Vercel app.js:  size={primary_appjs.get('size')} bytes, sha256={primary_appjs.get('hash')}")
        print(f"    - Backup Netlify app.js:  size={backup_appjs.get('size')} bytes, sha256={backup_appjs.get('hash')}")
        print(f"    - Parity app.js match:    {is_same_appjs}")
        print(f"    - Primary Vercel index:   size={primary_index.get('size')} bytes, sha256={primary_index.get('hash')}")
        print(f"    - Backup Netlify index:   size={backup_index.get('size')} bytes, sha256={backup_index.get('hash')}")
        print(f"    - Parity index match:     {is_same_index}")
        print(f"    - Stale Backup Release:   {is_stale_release}")

        # Screenshot Backup Host runtime
        page_backup.screenshot(path='tests/evidence/backup_host_runtime_evidence.png')
        print("Screenshot saved to: tests/evidence/backup_host_runtime_evidence.png")

        page_backup.close()
        browser.close()

        # Evaluation
        smoke_features_ok = (
            avail_ok and
            all(routes_tested.values()) and
            kiem_ton_ok and
            len(filtered_errors) == 0
        )
        dual_smoke_ok = smoke_features_ok and (not is_stale_release)

        results['BACKUP_HOST'] = 'PASS' if (avail_ok and not is_stale_release) else 'FAIL'
        results['DUAL_HOST_SMOKE'] = 'PASS' if dual_smoke_ok else 'FAIL'
        results['STALE_BACKUP_RELEASE'] = 1 if is_stale_release else 0
        results['FATAL_BACKUP_RUNTIME_ERROR'] = len(filtered_errors)

        if results['PRINT_REGRESSION'] == 'PASS' and results['BACKUP_HOST'] == 'PASS' and results['DUAL_HOST_SMOKE'] == 'PASS':
            results['PHASE2_ENTRY'] = 'AUTHORIZED_FULLY_VERIFIED'
            results['VERDICT'] = 'PASS'
            results['P0'] = 0
            results['P1'] = 0
            results['BLOCKERS'] = 0
        else:
            results['PHASE2_ENTRY'] = 'NOT_AUTHORIZED'
            results['VERDICT'] = 'FAIL'
            results['P0'] = 0
            results['P1'] = 1 if is_stale_release else 0
            results['BLOCKERS'] = 1 if is_stale_release else 0
        results['DUAL_HOST_SMOKE'] = 'PASS' if dual_smoke_ok else 'FAIL'
        results['STALE_BACKUP_RELEASE'] = 0 if dual_smoke_ok else 1
        results['FATAL_BACKUP_RUNTIME_ERROR'] = len(filtered_errors)

        if results['PRINT_REGRESSION'] == 'PASS' and results['BACKUP_HOST'] == 'PASS' and results['DUAL_HOST_SMOKE'] == 'PASS':
            results['PHASE2_ENTRY'] = 'AUTHORIZED_FULLY_VERIFIED'
            results['VERDICT'] = 'PASS'
        else:
            results['PHASE2_ENTRY'] = 'NOT_AUTHORIZED'
            results['VERDICT'] = 'FAIL'

        print("\n" + "=" * 70)
        print("FINAL 2-CHECK GATE EXECUTION COMPLETE")
        print(f"PHASE 2A ENTRY: {results['PHASE2_ENTRY']}")
        print(f"VERDICT: {results['VERDICT']}")
        print("=" * 70)
        print(json.dumps(results, indent=2, ensure_ascii=False))

        return results

if __name__ == '__main__':
    run_2check_gate()
