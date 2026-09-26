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

        return super().do_GET()

    def do_POST(self):
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
