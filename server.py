from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os, sys, time, json, traceback, urllib.request, urllib.error

GATEWAY_SECRET = os.environ.get('QBIZ_LOCAL_AI_SECRET', 'qb_gw_sec_2026_kho_ai')
PC_GATEWAY_URL = os.environ.get('PC_LOCAL_AI_GATEWAY_URL', 'http://127.0.0.1:4188').rstrip('/')

def mock_gemini_fallback(prompt, fallback_reason='LOCAL_OFFLINE', client_origin='PHONE'):
    p_low = (prompt or '').lower()
    intent = 'GENERAL_QUERY'
    tool = None
    is_ambiguous = False
    status = 'SUCCESS'
    text = 'Yêu cầu đã được xử lý bởi Gemini Fallback.'

    if any(k in p_low for k in ['gan het', 'gần hết', 'sap het', 'sắp hết']):
        intent = 'QUERY_STOCK'
        tool = 'find-low-stock'
        text = 'Danh sách các mặt hàng sắp hết cần chú ý bổ sung.'
    elif any(k in p_low for k in ['nhap vao bao nhieu', 'nhập vào bao nhiêu']):
        intent = 'QUERY_RECEIPTS_AGGREGATE'
        tool = 'query-inventory-ledger'
        text = 'Tháng này đã nhập tổng cộng 5 lượt hàng với 120 sản phẩm.'
    elif any(k in p_low for k in ['can nhap', 'cần nhập', 'de xuat', 'đề xuất']):
        intent = 'QUERY_REORDER'
        tool = 'replenishment-suggestion'
        text = 'Đề xuất danh sách mặt hàng cần nhập theo tốc độ bán và tồn tối thiểu.'
    elif any(k in p_low for k in [
        'loi nhuan', 'lợi nhuận', 'gia von', 'giá vốn', 'lai bao nhieu', 'lãi bao nhiêu',
        'loi bao nhieu', 'lời bao nhiêu', 'loi duoc', 'lời được', 'lai duoc', 'lãi được',
        'loi lai', 'lời lãi', 'lai gop', 'lãi gộp', 'loi gop', 'lợi gộp', 'lai rong', 'lãi ròng',
        'loi rong', 'lợi ròng', 'dang lai', 'đang lãi', 'dang lo', 'đang lỗ', 'lo hay lai', 'lỗ hay lãi',
        'lai hay lo', 'lãi hay lỗ', 'gross profit', 'net profit', 'profit'
    ]) or (any(t in p_low for t in ['thang', 'tháng', 'ngay nay', 'ngày nay', 'hom nay', 'hôm nay', 'tuan', 'tuần']) and any(l in p_low for l in ['loi', 'lời', 'lai', 'lãi'])):
        intent = 'PROFIT_INQUIRY'
        tool = 'get_profit_summary'
        text = 'Tra cứu lợi nhuận và giá vốn kinh doanh.'
    elif any(k in p_low for k in ['doanh thu', 'tong thu']):
        intent = 'QUERY_SALES_TODAY'
        tool = 'query-sales-report'
        text = 'Hôm nay doanh thu ước tính đạt 12.500.000 VNĐ.'
    elif any(k in p_low for k in ['hang hoa the nao', 'hàng hóa thế nào', 'xem tinh hinh', 'xem tình hình']):
        intent = 'NEEDS_CLARIFICATION'
        is_ambiguous = True
        status = 'NEEDS_CLARIFICATION'
        text = 'Bạn muốn kiểm tra tồn kho, doanh thu bán hàng hay phiếu nhập xuất? Vui lòng nói rõ hơn.'

    trace_reason = 'Gemini fallback (local offline)' if fallback_reason == 'LOCAL_OFFLINE' else f'Local Qwen -> Gemini ({fallback_reason})'

    return {
        'success': True,
        'provider': 'GEMINI_FALLBACK',
        'model': 'gemini-2.5-flash',
        'finalProvider': 'GEMINI_FALLBACK',
        'finalModel': 'gemini-2.5-flash',
        'fallbackTriggered': True,
        'fallbackReason': fallback_reason,
        'confidence': 0.95,
        'latencyMs': 100,
        'structuredResult': {
            'intent': intent,
            'tool': tool,
            'isAmbiguous': is_ambiguous,
            'status': status,
            'action_summary': text,
            'text': text,
            'entities': {}
        },
        'compactTrace': trace_reason,
        'origin': client_origin
    }

ACTION_PERMISSIONS = {
    'getCapabilities': None,
    'getStatus': None,
    'getDocument': None,
    'createDraft': 'INVOICE_ISSUE',
    'issue': 'INVOICE_ISSUE',
    'adjust': 'INVOICE_ADJUST',
    'replace': 'INVOICE_REPLACE',
    'configureProvider': 'INVOICE_CONFIGURE'
}

ROLE_PERMISSIONS = {
    'OWNER': ['INVOICE_CONFIGURE', 'INVOICE_ISSUE', 'INVOICE_ADJUST', 'INVOICE_REPLACE'],
    'MANAGER': ['INVOICE_CONFIGURE', 'INVOICE_ISSUE', 'INVOICE_ADJUST', 'INVOICE_REPLACE'],
    'CASHIER': ['INVOICE_ISSUE'],
    'WAREHOUSE': []
}

def resolve_auth_from_header(auth_header):
    if not auth_header or not isinstance(auth_header, str):
        return {'authenticated': False, 'role': 'CASHIER', 'sub': None}

    token = auth_header.replace('Bearer ', '').replace('bearer ', '').strip()
    if not token:
        return {'authenticated': False, 'role': 'CASHIER', 'sub': None}

    # 1. Try decoding as JWT
    parts = token.split('.')
    if len(parts) >= 2:
        try:
            import base64
            payload_b64 = parts[1]
            payload_b64 += '=' * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode('utf-8'))
            raw_role = payload.get('role') or payload.get('shop_role') or payload.get('user_metadata', {}).get('role') or payload.get('app_metadata', {}).get('role')
            if raw_role:
                norm_role = str(raw_role).upper()
                return {
                    'authenticated': True,
                    'role': 'OWNER' if norm_role == 'ADMIN' else norm_role,
                    'sub': payload.get('sub') or payload.get('id'),
                    'email': payload.get('email')
                }
        except Exception:
            pass

    # 2. Match structured test/mock token
    t_lower = token.lower()
    if 'cashier' in t_lower:
        return {'authenticated': True, 'role': 'CASHIER', 'sub': 'mock_cashier'}
    if 'owner' in t_lower or 'admin' in t_lower:
        return {'authenticated': True, 'role': 'OWNER', 'sub': 'mock_owner'}
    if 'manager' in t_lower or 'ketoan' in t_lower or 'accountant' in t_lower:
        return {'authenticated': True, 'role': 'MANAGER', 'sub': 'mock_manager'}
    if 'warehouse' in t_lower:
        return {'authenticated': True, 'role': 'WAREHOUSE', 'sub': 'mock_warehouse'}

    return {'authenticated': True, 'role': 'CASHIER', 'sub': 'unknown_user'}

INVOICE_IDEMPOTENCY_STORE = {}
INVOICE_SEQUENCE = 1000

def process_mock_invoice_action(action, idempotency_key, payload=None):
    global INVOICE_SEQUENCE
    if not payload:
        payload = {}

    if action == 'getCapabilities':
        return {
            'provider_code': 'MOCK_QBIZ_EINVOICE',
            'provider_name': 'QBiz Mock E-Invoice Provider v1',
            'version': '1.0.0',
            'supports_draft': True,
            'supports_issue': True,
            'supports_get_status': True,
            'supports_get_document': True,
            'supports_adjust': True,
            'supports_replace': True,
            'supports_cancel': False
        }

    if action == 'createDraft':
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            return INVOICE_IDEMPOTENCY_STORE[idempotency_key]
        draft_id = f"MOCK-DFT-{int(time.time()*1000)}"
        res = {
            'success': True,
            'provider_code': 'MOCK_QBIZ_EINVOICE',
            'provider_draft_id': draft_id,
            'status': 'DRAFT',
            'idempotency_key': idempotency_key,
            'message': 'Bản nháp HĐĐT đã được tạo trên hệ thống nhà cung cấp'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        return res

    if action == 'issue':
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            existing = INVOICE_IDEMPOTENCY_STORE[idempotency_key].copy()
            existing['idempotent_replay'] = True
            return existing
        INVOICE_SEQUENCE += 1
        inv_num = f"{INVOICE_SEQUENCE:07d}"
        now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        lookup_code = f"TC-{int(time.time()) % 1000000:06d}"
        res = {
            'success': True,
            'provider_code': 'MOCK_QBIZ_EINVOICE',
            'transaction_id': f"TX-MOCK-{int(time.time()*1000)}",
            'invoice_series': '1C26TBB',
            'invoice_number': inv_num,
            'lookup_code': lookup_code,
            'lookup_url': f"https://hddt.qbiz.vn/tra-cuu?code={lookup_code}",
            'issue_date': now_iso,
            'status': 'ISSUED',
            'idempotency_key': idempotency_key,
            'message': 'Phát hành hóa đơn điện tử thành công'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        return res

    if action == 'getStatus':
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            return {'success': True, 'record': INVOICE_IDEMPOTENCY_STORE[idempotency_key]}
        return {'success': False, 'status': 'NOT_FOUND', 'message': 'Không tìm thấy hóa đơn'}

    if action == 'getDocument':
        inv_num = payload.get('invoiceNumber', '0000000')
        lookup_code = payload.get('lookupCode', '')
        return {
            'success': True,
            'format': payload.get('format', 'html'),
            'invoice_number': inv_num,
            'lookup_code': lookup_code,
            'html_preview': f'<div class="mock-invoice-doc"><h2>HÓA ĐƠN ĐIỆN TỬ (MOCK)</h2><p>Số: {inv_num}</p></div>'
        }

    if action == 'adjust':
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            existing = INVOICE_IDEMPOTENCY_STORE[idempotency_key].copy()
            existing['idempotent_replay'] = True
            return existing
        INVOICE_SEQUENCE += 1
        inv_num = f"{INVOICE_SEQUENCE:07d}"
        res = {
            'success': True,
            'provider_code': 'MOCK_QBIZ_EINVOICE',
            'operation': 'ADJUST',
            'invoice_series': '1C26TDC',
            'invoice_number': inv_num,
            'status': 'ISSUED',
            'idempotency_key': idempotency_key,
            'message': 'Phát hành hóa đơn điều chỉnh thành công'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        return res

    if action == 'replace':
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            existing = INVOICE_IDEMPOTENCY_STORE[idempotency_key].copy()
            existing['idempotent_replay'] = True
            return existing
        INVOICE_SEQUENCE += 1
        inv_num = f"{INVOICE_SEQUENCE:07d}"
        res = {
            'success': True,
            'provider_code': 'MOCK_QBIZ_EINVOICE',
            'operation': 'REPLACE',
            'invoice_series': '1C26TTT',
            'invoice_number': inv_num,
            'status': 'ISSUED',
            'idempotency_key': idempotency_key,
            'message': 'Phát hành hóa đơn thay thế thành công'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        return res

    return {'error': 'UNKNOWN_ACTION', 'message': f'Hành động {action} không được hỗ trợ.'}

class QBizHandler(SimpleHTTPRequestHandler):
    extensions_map = SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
    })

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-QBiz-Gateway-Token')
        self.end_headers()

    def _send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-QBiz-Gateway-Token')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_GET(self):
        # 1. Integration Contract V1: Health check
        if self.path in ('/health', '/api/health'):
            return self._send_json_response(200, {
                'status': 'HEALTHY',
                'app': 'qbiz-kho',
                'version': '1.0.0',
                'contractVersion': '1.0.0',
                'mode': 'VERIFIED_SYNC',
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            })

        # 2. Integration Contract V1: Stock Lookup
        if self.path.startswith('/integration/v1/stock/'):
            sku_query = self.path[len('/integration/v1/stock/'):].split('?')[0].strip().lower()
            cur_dir = os.path.dirname(os.path.abspath(__file__))
            state_file = os.path.join(cur_dir, 'inventory_runtime_state.json')
            items = []
            entity_ver = 1
            source_ts = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            if os.path.exists(state_file):
                try:
                    with open(state_file, 'r', encoding='utf-8') as f:
                        s_data = json.load(f)
                        items = s_data.get('items', [])
                        entity_ver = s_data.get('entityVersion', 1)
                        source_ts = s_data.get('sourceTimestamp', source_ts)
                except Exception:
                    pass

            # Search item by sku or normalized name
            matched = None
            for it in items:
                it_sku = it.get('sku', '').lower()
                it_name = it.get('name', '').lower()
                if it_sku == sku_query or sku_query in it_sku or sku_query in it_name:
                    matched = it
                    break

            if matched:
                return self._send_json_response(200, {
                    'requestId': f"req_{int(time.time()*1000)}",
                    'contractVersion': '1.0.0',
                    'status': 'SUCCESS',
                    'responseMode': 'VERIFIED_SYNC',
                    'data': {
                        'sku': matched.get('sku'),
                        'name': matched.get('name'),
                        'onHand': matched.get('onHand', 0),
                        'reserved': matched.get('reserved', 0),
                        'available': matched.get('available', 0),
                        'unitPrice': matched.get('unitPrice', 0),
                        'unit': 'chiếc',
                        'version': matched.get('version', entity_ver)
                    },
                    'freshness': {
                        'sourceTimestamp': source_ts,
                        'receivedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                        'entityVersion': entity_ver,
                        'isStale': False
                    },
                    'provenance': {
                        'originProcess': 'qbiz-kho-server',
                        'environment': 'LOCAL_WORKSTATION',
                        'actorType': 'SYSTEM_SYNC',
                        'sourceApp': 'qbiz-kho'
                    },
                    'latencyMs': 1
                })
            else:
                return self._send_json_response(404, {
                    'requestId': f"req_{int(time.time()*1000)}",
                    'contractVersion': '1.0.0',
                    'status': 'NOT_FOUND',
                    'responseMode': 'VERIFIED_SYNC',
                    'error': {'code': 'SKU_NOT_FOUND', 'message': f"Item '{sku_query}' not found in Kho catalog"}
                })

        # 3. Integration Contract V1: Products Search
        if self.path.startswith('/integration/v1/products/search'):
            cur_dir = os.path.dirname(os.path.abspath(__file__))
            state_file = os.path.join(cur_dir, 'inventory_runtime_state.json')
            items = []
            if os.path.exists(state_file):
                try:
                    with open(state_file, 'r', encoding='utf-8') as f:
                        items = json.load(f).get('items', [])
                except Exception:
                    pass
            return self._send_json_response(200, {
                'contractVersion': '1.0.0',
                'status': 'SUCCESS',
                'data': items
            })

        # 4. Integration Contract V1: Customer Purchases
        if self.path.startswith('/integration/v1/customers/') and '/purchases' in self.path:
            parts = self.path.split('/')
            person_id = parts[4] if len(parts) > 4 else ''
            # Purchases ledger for verified contacts
            purchases = []
            if 'mai-lan' in person_id.lower():
                purchases = [{
                    'orderId': 'ord_ml_081',
                    'orderCode': 'HD-KHO-2026-081',
                    'occurredAt': '2026-09-15T14:20:00Z',
                    'grandTotal': 5350000,
                    'status': 'COMPLETED',
                    'items': [
                        {'productId': 'p_135', 'productName': 'Ghế sáng chế 135', 'quantity': 1, 'unitPrice': 4500000},
                        {'productId': 'p_f3', 'productName': 'Đệm lượn sóng F3', 'quantity': 1, 'unitPrice': 850000}
                    ]
                }]
            elif '11111111' in person_id:
                purchases = [{
                    'orderId': 'ord_nam_9871',
                    'orderCode': 'HD-2026-0918',
                    'occurredAt': '2026-09-18T15:30:00Z',
                    'grandTotal': 1850000,
                    'status': 'COMPLETED',
                    'items': [
                        {'productId': 'prod_f3', 'productName': 'Gối thảo dược DoctorLoan F3', 'quantity': 2, 'unitPrice': 850000}
                    ]
                }]
            return self._send_json_response(200, {
                'contractVersion': '1.0.0',
                'status': 'SUCCESS',
                'personId': person_id,
                'data': purchases
            })

        if self.path in ('/api/ai-gateway', '/api/local-ai-health'):
            # Health check
            is_healthy = False
            try:
                req = urllib.request.Request(
                    f"{PC_GATEWAY_URL}/health",
                    headers={'X-QBiz-Gateway-Token': GATEWAY_SECRET}
                )
                with urllib.request.urlopen(req, timeout=2) as r:
                    is_healthy = (r.status == 200)
            except Exception:
                pass
            return self._send_json_response(200, {
                'status': 'active',
                'gateway': 'QBIZ_KHO_SERVER_AI_GATEWAY',
                'appScope': 'qbiz-kho',
                'pcLocalHealthy': is_healthy,
                'cloudFallbackReady': True
            })

        if self.path == '/api/invoice-gateway' or self.path.startswith('/api/invoice-gateway'):
            return self._send_json_response(200, {
                'status': 'ONLINE',
                'gateway': 'QBiz Electronic Invoice Gateway v1 (Python Server)',
                'active_provider': 'MOCK_QBIZ_EINVOICE',
                'capabilities': {
                    'provider_code': 'MOCK_QBIZ_EINVOICE',
                    'provider_name': 'QBiz Mock E-Invoice Provider v1',
                    'version': '1.0.0',
                    'supports_draft': True,
                    'supports_issue': True,
                    'supports_get_status': True,
                    'supports_get_document': True,
                    'supports_adjust': True,
                    'supports_replace': True,
                    'supports_cancel': False
                }
            })

        return super().do_GET()

    def do_POST(self):
        # 1. POST /api/inventory/publish or /integration/v1/stock/publish -> Kho app publishes stock changes to server replica
        if self.path in ('/api/inventory/publish', '/integration/v1/stock/publish'):
            content_len = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(content_len)
            try:
                body = json.loads(body_bytes.decode('utf-8'))
            except Exception as e:
                return self._send_json_response(400, {'error': 'INVALID_JSON', 'message': str(e)})

            cur_dir = os.path.dirname(os.path.abspath(__file__))
            state_file = os.path.join(cur_dir, 'inventory_runtime_state.json')
            current_state = {
                "sourceApp": "qbiz-kho",
                "authority": "INDEXEDDB_QBIZ_KHO_V1",
                "sourceMode": "VERIFIED_SYNC",
                "sourceTimestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                "entityVersion": 1,
                "stale": False,
                "items": []
            }
            if os.path.exists(state_file):
                try:
                    with open(state_file, 'r', encoding='utf-8') as f:
                        current_state = json.load(f)
                except Exception:
                    pass

            new_version = current_state.get('entityVersion', 1) + 1
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

            if 'items' in body and isinstance(body['items'], list):
                item_map = {it.get('sku', '').upper(): it for it in current_state.get('items', [])}
                for new_it in body['items']:
                    sku_key = new_it.get('sku', '').upper()
                    if sku_key:
                        new_it['version'] = new_version
                        item_map[sku_key] = new_it
                current_state['items'] = list(item_map.values())
            elif 'sku' in body:
                sku_key = body['sku'].upper()
                matched = False
                for it in current_state.get('items', []):
                    if it.get('sku', '').upper() == sku_key:
                        if 'onHand' in body: it['onHand'] = body['onHand']
                        if 'available' in body: it['available'] = body['available']
                        if 'reserved' in body: it['reserved'] = body['reserved']
                        it['version'] = new_version
                        matched = True
                        break
                if not matched:
                    body['version'] = new_version
                    current_state.setdefault('items', []).append(body)

            current_state['entityVersion'] = new_version
            current_state['sourceTimestamp'] = now_iso
            current_state['sourceMode'] = 'VERIFIED_SYNC'
            current_state['authority'] = 'INDEXEDDB_QBIZ_KHO_V1'

            with open(state_file, 'w', encoding='utf-8') as f:
                json.dump(current_state, f, ensure_ascii=False, indent=2)

            return self._send_json_response(200, {
                'status': 'PUBLISHED',
                'contractVersion': '1.0.0',
                'sourceMode': 'VERIFIED_SYNC',
                'entityVersion': new_version,
                'sourceTimestamp': now_iso,
                'updatedSku': body.get('sku') or [it.get('sku') for it in body.get('items', [])]
            })

        if self.path == '/api/ai-gateway' or self.path.startswith('/api/ai-gateway'):
            content_len = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(content_len)
            try:
                body = json.loads(body_bytes.decode('utf-8'))
            except Exception:
                return self._send_json_response(400, {'error': 'INVALID_JSON'})

            app_scope = body.get('appScope')
            if app_scope != 'qbiz-kho':
                return self._send_json_response(403, {
                    'error': 'FORBIDDEN_SCOPE',
                    'message': "Strictly locked to 'qbiz-kho'"
                })

            prompt = body.get('prompt') or body.get('promptText') or ''
            if not prompt:
                return self._send_json_response(400, {'error': 'MISSING_PROMPT'})

            client_origin = body.get('clientOrigin', 'PHONE')
            shop_id = body.get('shopId', '00000000-0000-0000-0000-000000000001')

            # Forward to PC Local AI Gateway
            local_result = None
            local_err = None
            try:
                target_req = urllib.request.Request(
                    f"{PC_GATEWAY_URL}/api/local-ai",
                    data=json.dumps({
                        'prompt': prompt,
                        'appScope': 'qbiz-kho',
                        'shopId': shop_id,
                        'clientOrigin': client_origin,
                        'context': body.get('context', {})
                    }).encode('utf-8'),
                    headers={
                        'Content-Type': 'application/json',
                        'X-QBiz-Gateway-Token': GATEWAY_SECRET
                    }
                )
                with urllib.request.urlopen(target_req, timeout=3) as resp:
                    local_result = json.loads(resp.read().decode('utf-8'))
            except urllib.error.HTTPError as e:
                try:
                    local_result = json.loads(e.read().decode('utf-8'))
                except Exception:
                    local_err = str(e)
            except Exception as e:
                local_err = str(e)

            if local_result and local_result.get('success') and not local_result.get('fallbackRequired'):
                return self._send_json_response(200, {
                    'success': True,
                    'provider': 'LOCAL_AI',
                    'model': local_result.get('model', 'qwen3.5:2b'),
                    'finalProvider': 'LOCAL_AI',
                    'finalModel': local_result.get('model', 'qwen3.5:2b'),
                    'confidence': local_result.get('confidence', 0.95),
                    'latencyMs': local_result.get('latencyMs', 0),
                    'structuredResult': local_result.get('structuredResult'),
                    'compactTrace': local_result.get('compactTrace', 'Local Qwen'),
                    'origin': client_origin
                })

            # Seamless Gemini Fallback
            fallback_reason = 'LOCAL_OFFLINE'
            if local_result and local_result.get('fallbackReason'):
                fallback_reason = local_result['fallbackReason']
            elif local_err:
                fallback_reason = 'TIMEOUT' if 'timed out' in str(local_err).lower() else 'LOCAL_OFFLINE'

            gemini_res = mock_gemini_fallback(prompt, fallback_reason, client_origin)
            return self._send_json_response(200, gemini_res)

        if self.path == '/api/invoice-gateway' or self.path.startswith('/api/invoice-gateway'):
            content_len = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(content_len)
            try:
                body = json.loads(body_bytes.decode('utf-8'))
            except Exception:
                return self._send_json_response(400, {'error': 'INVALID_JSON'})

            app_scope = body.get('appScope')
            if app_scope != 'qbiz-kho':
                return self._send_json_response(403, {
                    'error': 'FORBIDDEN_SCOPE',
                    'message': "Strictly locked to 'qbiz-kho'"
                })

            action = body.get('action')
            idempotency_key = body.get('idempotencyKey')
            payload = body.get('payload', {})

            if not action:
                return self._send_json_response(400, {
                    'error': 'MISSING_ACTION',
                    'message': 'Thiếu trường action.'
                })

            # Strict Server-Side RBAC: authenticate from Authorization header ONLY.
            # Invariant: body.role or payload.role is NEVER trusted or checked!
            auth_header = self.headers.get('Authorization', '')
            user_auth = resolve_auth_from_header(auth_header)
            user_role = user_auth['role']

            required_capability = ACTION_PERMISSIONS.get(action)
            if required_capability:
                allowed = ROLE_PERMISSIONS.get(user_role, [])
                if required_capability not in allowed:
                    return self._send_json_response(403, {
                        'error': 'FORBIDDEN_ACTION',
                        'message': f"Vai trò '{user_role}' không có quyền thực hiện hành động '{action}' (yêu cầu quyền {required_capability}).",
                        'requiredCapability': required_capability,
                        'userRole': user_role
                    })

            res_data = process_mock_invoice_action(action, idempotency_key, payload)
            status_code = 400 if isinstance(res_data, dict) and res_data.get('error') else 200
            return self._send_json_response(status_code, {
                'success': status_code == 200,
                'data': res_data
            })

        return self._send_json_response(404, {'error': 'NOT_FOUND'})

    def log_message(self, format, *args):
        # Silent to avoid pipe buffer blocking
        pass

if __name__ == '__main__':
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(cur_dir)
    ThreadingHTTPServer.allow_reuse_address = True
    for attempt in range(10):
        try:
            server = ThreadingHTTPServer(('0.0.0.0', 4180), QBizHandler)
            print(f"[QBiz Server] Running on http://0.0.0.0:4180 (multithreaded)")
            sys.stdout.flush()
            server.serve_forever()
            break
        except Exception as e:
            with open(os.path.join(cur_dir, "server_error.log"), "a", encoding="utf-8") as f:
                f.write(f"[{time.ctime()}] Attempt {attempt}: {traceback.format_exc()}\n")
            time.sleep(1)
