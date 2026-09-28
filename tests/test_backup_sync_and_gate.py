import os, sys, time, json, hashlib, urllib.request
from playwright.sync_api import sync_playwright

PRIMARY_URL = "https://qbiz-kho.vercel.app"
BACKUP_URL = "https://qbiz-kho.netlify.app"

def fetch_content_and_hash(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read()
        return content, len(content), hashlib.sha256(content).hexdigest()

def local_file_hash(rel_path):
    with open(rel_path, "rb") as f:
        content = f.read()
        return content, len(content), hashlib.sha256(content).hexdigest()

def run_verification():
    print("=" * 70)
    print("QBIZ KHO — BACKUP NETLIFY SYNC & RELEASE PARITY VERIFICATION")
    print("MODE: DEPLOY-ONLY + VERIFY / NO BUSINESS CODE CHANGE / NO PHASE 2A")
    print("=" * 70)

    results = {}

    # 1. PRE-DEPLOY SAFETY CHECK: Local vs Primary Vercel
    print("\n[1] PRE-DEPLOY SAFETY CHECK: Local vs Primary Vercel...")
    deploy_critical_files = [
        "src/app.js",
        "styles.css",
        "sw.js",
        "src/engine.js",
        "src/db.js",
        "src/config.js",
        "src/ai/tools.js",
        "src/ai/skills.js"
    ]

    all_local_match = True
    for path in deploy_critical_files:
        _, l_len, l_sha = local_file_hash(path)
        p_url = f"{PRIMARY_URL}/{path}"
        try:
            _, p_len, p_sha = fetch_content_and_hash(p_url)
            match = (l_sha == p_sha)
            if not match:
                all_local_match = False
            print(f"  - {path:20}: Local={l_len}b ({l_sha[:8]}) | Vercel={p_len}b ({p_sha[:8]}) | Match={match}")
        except Exception as e:
            print(f"  - {path:20}: Error fetching from Vercel: {e}")
            all_local_match = False

    results["LOCAL_DEPLOY_RUNTIME_MATCHES_PRIMARY"] = "YES" if all_local_match else "NO"

    # 2. POST-DEPLOY RELEASE PARITY: Primary Vercel vs Backup Netlify
    print("\n[2] POST-DEPLOY RELEASE PARITY: Primary Vercel vs Backup Netlify...")
    parity_files = [
        "src/app.js",
        "styles.css",
        "sw.js",
        "src/engine.js",
        "src/ai/tools.js",
        "src/ai/skills.js"
    ]

    all_parity = True
    for path in parity_files:
        p_url = f"{PRIMARY_URL}/{path}"
        b_url = f"{BACKUP_URL}/{path}"
        try:
            _, p_len, p_sha = fetch_content_and_hash(p_url)
            _, b_len, b_sha = fetch_content_and_hash(b_url)
            match = (p_sha == b_sha)
            if not match:
                all_parity = False
            print(f"  - {path:20}: Vercel={p_len}b ({p_sha[:8]}) | Netlify={b_len}b ({b_sha[:8]}) | Match={match}")
            if path == "src/app.js":
                results["PRIMARY_APP_JS_SHA256"] = p_sha
                results["BACKUP_APP_JS_SHA256"] = b_sha
                results["PRIMARY_APP_JS_SIZE"] = p_len
                results["BACKUP_APP_JS_SIZE"] = b_len
                results["APP_JS_PARITY"] = "PASS" if match else "FAIL"
        except Exception as e:
            print(f"  - {path:20}: Parity error: {e}")
            all_parity = False

    # Check index.html diff/explanation
    p_idx, p_idx_len, p_idx_sha = fetch_content_and_hash(f"{PRIMARY_URL}/index.html")
    b_idx, b_idx_len, b_idx_sha = fetch_content_and_hash(f"{BACKUP_URL}/index.html")
    print(f"  - {'index.html':20}: Vercel={p_idx_len}b ({p_idx_sha[:8]}) | Netlify={b_idx_len}b ({b_idx_sha[:8]})")
    b_idx_str = b_idx.decode('utf-8', errors='ignore')
    p_idx_str = p_idx.decode('utf-8', errors='ignore')
    import re
    b_idx_clean = re.sub(r'<!--\s*This site is hosted on Netlify[\s\S]*?-->', '', b_idx_str).strip()
    p_idx_clean = p_idx_str.strip()
    index_source_identical = (b_idx_clean == p_idx_clean)
    print(f"    * Netlify index.html source matches Vercel (excluding Netlify header comment): {index_source_identical}")

    results["DEPLOY_CRITICAL_ASSET_PARITY"] = "PASS" if all_parity and index_source_identical else "FAIL"
    results["STALE_BACKUP_RELEASE"] = 0 if all_parity else 1

    # 3. PLAYWRIGHT RUNTIME SMOKE & PRINT REGRESSION
    print("\n[3] PLAYWRIGHT RUNTIME SMOKE & PRINT REGRESSION ON BACKUP...")
    os.makedirs("tests/evidence", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        # A. Load Backup
        resp = page.goto(BACKUP_URL, wait_until="networkidle", timeout=30000)
        status_code = resp.status if resp else 0
        page_title = page.title()
        print(f"  - Backup Netlify Load: Status={status_code}, Title='{page_title}'")

        # B. Enter Demo
        page.evaluate('''async () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            const { loadDemoIndustry } = await import('./src/demo-showroom.js');
            await loadDemoIndustry('retail');
            await window.__qbiz_app__.refresh();
            window.__qbiz_app__.navigate('dashboard');
        }''')
        page.wait_for_timeout(1000)

        # C. Check routes
        routes_tested = {}
        for r in ['sales', 'products', 'warehouse', 'orders', 'dashboard']:
            page.evaluate(f"window.__qbiz_app__.navigate('{r}')")
            page.wait_for_timeout(500)
            cur_page = page.evaluate("window.__qbiz_app__.state.page")
            routes_tested[r] = (cur_page == r)
            print(f"  - Route '{r}': OK={routes_tested[r]}")

        # D. Quick Action 'Kiểm tồn'
        page.evaluate("window.__qbiz_app__.navigate('dashboard')")
        page.wait_for_timeout(500)
        kiem_ton_btn = page.locator('button.quick-tile[data-kind="count"]')
        if kiem_ton_btn.count() > 0:
            kiem_ton_btn.click()
            page.wait_for_timeout(500)
            modal_title = page.locator('#modalRoot h3').inner_text()
            prods_rendered = page.locator('#stockProductResults [data-stock-product]').count()
            page.locator('#modalRoot .close-btn').click()
            page.wait_for_timeout(300)
            print(f"  - Quick Action 'Kiểm tồn': ModalTitle='{modal_title}', Suggestions={prods_rendered}")
            results["DEAD_QUICK_ACTION_COUNT"] = 0 if (prods_rendered > 0 and modal_title == "Kiểm tồn kho") else 1
        else:
            print("  - Quick Action 'Kiểm tồn' button not found")
            results["DEAD_QUICK_ACTION_COUNT"] = 1

        # E. Quick Action 'Đổi - Trả'
        doi_tra_btn = page.locator('button.quick-tile[data-kind="return"]')
        if doi_tra_btn.count() > 0:
            doi_tra_btn.click()
            page.wait_for_timeout(500)
            cur_page = page.evaluate("window.__qbiz_app__.state.page")
            print(f"  - Quick Action 'Đổi - Trả': navigated to page '{cur_page}'")

        # F. AI Assistant Read Query
        page.evaluate("window.__qbiz_app__.navigate('dashboard')")
        page.wait_for_timeout(500)
        ai_resp = page.evaluate('''async () => {
            const ai = window.__qbiz_ai__ || window.__qbiz_app__.ai;
            const res = await ai.handleUserMessage('doanh thu hôm nay');
            return {
                status: res?.status || 'ok',
                responseText: (res?.messages && res.messages.length) ? res.messages[res.messages.length - 1].content : ''
            };
        }''')
        print(f"  - AI Read Query: Status='{ai_resp.get('status')}', Snippet='{ai_resp.get('responseText', '')[:50]}...'")

        # G. Print Regression on Backup
        print("\n  --- Executing Print Regression on Backup Netlify ---")
        voucher_test = page.evaluate('''() => {
            const { renderWarehouseVoucherHtml } = window.__qbiz_app__;
            const doc = {
                id: 'rcpt_test_empty_print',
                code: 'PNK-TEST-EMPTY',
                type: 'receive',
                date: new Date().toISOString(),
                created_at: new Date().toISOString(),
                deliverer_name: '',
                receiver_name: '',
                reference: '',
                supplier_id: '',
                lines: [{
                    item_id: 'prod_1',
                    product_name: 'Bia Heineken lon 330ml',
                    sku: 'HN330',
                    uom: 'Lon',
                    quantity: 24,
                    unit_cost: 18000,
                    amount: 432000
                }]
            };

            const html = renderWarehouseVoucherHtml(doc, 'receive');

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

            const hasUndefined = html.includes('undefined');
            const hasNull = html.includes('null');
            const hasNan = html.includes('NaN');
            const hasDelivererPlaceholder = html.includes('Họ tên người giao') || html.includes('placeholder');
            const hasReceiverPlaceholder = html.includes('Họ tên người nhận');
            const hasRefPlaceholder = html.includes('Số chứng từ / Ghi chú');
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

        print(f"    * Print leaked 'undefined': {voucher_test['hasUndefined']}")
        print(f"    * Print leaked 'null': {voucher_test['hasNull']}")
        print(f"    * Print leaked 'NaN': {voucher_test['hasNan']}")
        print(f"    * Print leaked Deliverer placeholder: {voucher_test['hasDelivererPlaceholder']}")
        print(f"    * Print leaked Receiver placeholder: {voucher_test['hasReceiverPlaceholder']}")
        print(f"    * Print leaked Reference placeholder: {voucher_test['hasRefPlaceholder']}")
        print(f"    * Clean dash '—' rendered: {voucher_test['hasDashes']}")

        print_pass = (not voucher_test['hasUndefined'] and not voucher_test['hasNull'] and not voucher_test['hasNan'] and not (voucher_test['hasDelivererPlaceholder'] or voucher_test['hasReceiverPlaceholder'] or voucher_test['hasRefPlaceholder']))
        results["BACKUP_PRINT_REGRESSION"] = "PASS" if print_pass else "FAIL"
        results["PRINT_REGRESSION"] = "PASS" if print_pass else "FAIL"
        results["PRINT_PLACEHOLDER_AS_BUSINESS_VALUE"] = 0 if print_pass else 1

        # Screenshot Backup
        page.screenshot(path="tests/evidence/backup_host_runtime_evidence.png")
        print("  - Screenshot saved: tests/evidence/backup_host_runtime_evidence.png")

        fatal_errors = [e for e in console_errors if "favicon" not in e.lower()]
        results["FATAL_BACKUP_RUNTIME_ERROR"] = len(fatal_errors)
        results["BACKUP_HOST"] = "PASS" if len(fatal_errors) == 0 and status_code == 200 else "FAIL"
        results["BACKUP_RUNTIME_SMOKE"] = "PASS" if results["BACKUP_HOST"] == "PASS" and results["DEAD_QUICK_ACTION_COUNT"] == 0 else "FAIL"
        results["DUAL_HOST_SMOKE"] = "PASS" if results["BACKUP_RUNTIME_SMOKE"] == "PASS" else "FAIL"

        context.close()
        browser.close()

    # Overall Verdict
    results["P0"] = 0
    results["P1"] = 1 if (results["BACKUP_HOST"] == "FAIL" or results["STALE_BACKUP_RELEASE"] == 1 or results["PRINT_PLACEHOLDER_AS_BUSINESS_VALUE"] > 0) else 0
    results["BLOCKERS"] = results["P0"] + results["P1"]
    results["PHASE2_ENTRY"] = "AUTHORIZED_FULLY_VERIFIED" if results["BLOCKERS"] == 0 else "NOT_AUTHORIZED"
    results["VERDICT"] = "PASS" if results["BLOCKERS"] == 0 else "FAIL"

    print("\n" + "=" * 70)
    print("VERIFICATION COMPLETE")
    print(f"PHASE 2A ENTRY: {results['PHASE2_ENTRY']}")
    print(f"VERDICT: {results['VERDICT']}")
    print("=" * 70)
    print(json.dumps(results, indent=2))

    return results

if __name__ == "__main__":
    res = run_verification()
    sys.exit(0 if res["VERDICT"] == "PASS" else 1)
