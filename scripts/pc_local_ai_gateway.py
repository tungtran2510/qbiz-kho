#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QBiz Kho — PC Local AI Gateway
Listens on: 127.0.0.1:4188
Acts as a secure, authenticated boundary in front of Ollama (127.0.0.1:11434).

Security & Invariants:
1. Rejects any request without valid X-QBiz-Gateway-Token (HTTP 401).
2. Strictly enforces APP_SCOPE == 'qbiz-kho' (rejects forged scopes with HTTP 403).
3. Payload limit: 64KB max; sanitizes input (rejects command/shell injections).
4. Strictly read-only planner: never executes write mutations to the business DB.
5. Uses Ollama qwen3.5:2b with assistant prefill '{\\n' to bypass reasoning thinking tokens.
6. Computes composite confidence score; flags LOW_CONFIDENCE for server-side fallback.
7. Multithreaded via ThreadingHTTPServer.
"""

import sys
import os
import io
import json
import time
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

GATEWAY_PORT = int(os.environ.get('QBIZ_GATEWAY_PORT', 4188))
GATEWAY_SECRET = os.environ.get('QBIZ_LOCAL_AI_SECRET', 'qb_gw_sec_2026_kho_ai')
OLLAMA_ENDPOINT = os.environ.get('OLLAMA_ENDPOINT', 'http://127.0.0.1:11434').rstrip('/')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'qwen3.5:2b')
APP_SCOPE = 'qbiz-kho'
AUDIT_LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'phone_correlation_audit.jsonl')

def log_correlation_audit(entry):
    try:
        with open(AUDIT_LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    except Exception as e:
        pass

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def check_ollama_health():
    """Verify Ollama is reachable and model is available."""
    try:
        req = urllib.request.Request(f"{OLLAMA_ENDPOINT}/api/tags")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            models = [m.get('name', '') for m in data.get('models', [])]
            return {
                'reachable': True,
                'models': models,
                'target_model_available': any(OLLAMA_MODEL in m for m in models)
            }
    except Exception as e:
        return {'reachable': False, 'error': str(e), 'target_model_available': False}

def compute_gateway_confidence(parsed, prompt_text):
    """
    Gateway Confidence Formula:
    0.25*intentScore + 0.25*entityScore + 0.20*validToolScore + 0.15*schemaScore + 0.15*readWriteConsistent
    """
    if not isinstance(parsed, dict):
        return 0.0, ['MALFORMED_OUTPUT']

    p_low = prompt_text.lower()
    intent = parsed.get('intent', 'UNKNOWN')
    entities = parsed.get('entities', {}) if isinstance(parsed.get('entities'), dict) else {}
    tool = parsed.get('tool') or parsed.get('action')

    # Intent score
    intent_score = 0.9 if intent != 'UNKNOWN' else 0.2
    
    # Entity score
    has_product = bool(entities.get('product_name') or entities.get('barcode'))
    has_candidate = bool(entities.get('candidate_names') or entities.get('category'))
    entity_score = 0.9 if (has_product or has_candidate) else 0.5

    # Specific query heuristics
    is_low_stock_query = any(k in p_low for k in ['gan het', 'gần hết', 'sap het', 'sắp hết'])
    is_aggregate_query = any(k in p_low for k in ['nhap vao bao nhieu', 'nhập vào bao nhiêu', 'tong thu']) or (any(k in p_low for k in ['thang nay', 'tháng này']) and not any(k in p_low for k in ['hom nay', 'hôm nay']))
    is_reorder_query = any(k in p_low for k in ['can nhap', 'cần nhập', 'de xuat', 'đề xuất'])
    is_ambiguous = any(k in p_low for k in ['hang hoa the nao', 'hàng hóa thế nào', 'xem tinh hinh', 'xem tình hình', 'chuyen cai do', 'chuyển cái đó'])

    if is_low_stock_query:
        intent_score = 1.0
        entity_score = 0.9
        valid_tool_score = 1.0
    elif is_reorder_query:
        intent_score = 0.95
        entity_score = 0.85
        valid_tool_score = 0.95
    elif is_aggregate_query:
        # Aggregate queries require server/cloud calculation
        valid_tool_score = 0.4
    elif is_ambiguous:
        intent_score = 0.3
        entity_score = 0.2
        valid_tool_score = 0.3
    else:
        valid_tool_score = 0.8 if tool else 0.5

    schema_score = 1.0 if ('intent' in parsed and 'entities' in parsed) else 0.4
    read_write_consistent = 1.0

    # If prompt is a read query but model attempted a write tool
    if any(k in p_low for k in ['xem', 'bao nhieu', 'thang nay', 'hom nay']) and 'receive' in str(tool).lower():
        read_write_consistent = 0.0

    score = (
        0.25 * intent_score +
        0.25 * entity_score +
        0.20 * valid_tool_score +
        0.15 * schema_score +
        0.15 * read_write_consistent
    )

    reasons = []
    if score < 0.70:
        reasons.append('LOW_CONFIDENCE')
    if is_aggregate_query:
        reasons.append('UNSUPPORTED_LOCAL_AGGREGATE')
    if is_ambiguous:
        reasons.append('AMBIGUOUS_QUERY')
    if read_write_consistent == 0.0:
        reasons.append('READ_WRITE_MISMATCH')

    return round(score, 2), reasons

def call_ollama_qwen(prompt_text, system_prompt=None):
    """Call Ollama qwen3.5:2b with assistant prefill to skip reasoning tokens."""
    if not system_prompt:
        system_prompt = (
            "Bạn là Trợ lý vận hành QBiz Kho (App Scope: qbiz-kho). "
            "Phân tích yêu cầu người dùng và trả về DUY NHẤT 1 JSON object hợp lệ: "
            '{"intent":"...","tool":"...","entities":{...},"action_summary":"...","isAmbiguous":false}. '
            "Tuyệt đối không giải thích thêm, không sinh suy nghĩ bên ngoài JSON."
        )

    # Format user prompt with compact schema if raw prompt passed
    if "[SCHEMA YÊU CẦU" not in prompt_text:
        formatted_prompt = (
            '[SCHEMA YÊU CẦU: Trả về DUY NHẤT 1 JSON object hợp lệ: '
            '{"intent":"QUERY_STOCK"|"RECEIVE_STOCK"|"TRANSFER_STOCK"|"STOCKTAKE_STOCK"|"ADD_CART"|"REMOVE_CART"|"QUERY_MEMORY"|"GENERAL_QUERY"|"UNKNOWN",'
            '"entities":{"product_name":string|null,"warehouse_name":string|null,"quantity":number|null},"confidence":0.0-1.0,"explanation":"ngắn gọn"}]\n'
            f'[USER QUERY]\n{prompt_text}'
        )
    else:
        formatted_prompt = prompt_text

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": formatted_prompt},
        {"role": "assistant", "content": "{\n"}  # Assistant prefill skips thinking tokens on Qwen 3.5
    ]

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "options": {
            "num_predict": 90,
            "num_thread": 8,
            "temperature": 0.1
        },
        "stream": False
    }

    t0 = time.time()
    req = urllib.request.Request(
        f"{OLLAMA_ENDPOINT}/api/chat",
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode('utf-8'))
        raw_content = res_data.get('message', {}).get('content', '')
        if not raw_content.strip().startswith('{'):
            raw_content = "{\n" + raw_content
        latency_ms = int((time.time() - t0) * 1000)
        return raw_content, latency_ms

class LocalAIGatewayHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data):
        try:
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-QBiz-Gateway-Token, Authorization')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def do_OPTIONS(self):
        try:
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-QBiz-Gateway-Token, Authorization')
            self.end_headers()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def do_GET(self):
        if self.path in ('/health', '/health/'):
            # Verify gateway token
            token = self.headers.get('X-QBiz-Gateway-Token')
            if token != GATEWAY_SECRET:
                return self._send_json(401, {'error': 'UNAUTHORIZED_GATEWAY_TOKEN', 'status': 'unauthorized'})
            
            ollama_health = check_ollama_health()
            return self._send_json(200, {
                'status': 'healthy' if ollama_health.get('reachable') else 'degraded',
                'gateway': 'QBIZ_KHO_PC_LOCAL_AI_GATEWAY',
                'appScope': APP_SCOPE,
                'provider': 'OLLAMA',
                'model': OLLAMA_MODEL,
                'ollama': ollama_health
            })
        
        self._send_json(404, {'error': 'NOT_FOUND'})

    def do_POST(self):
        # 1. Path check
        if self.path not in ('/api/local-ai', '/api/local-ai/'):
            return self._send_json(404, {'error': 'NOT_FOUND', 'message': 'Unknown endpoint'})

        # 2. Authentication check (Header token)
        token = self.headers.get('X-QBiz-Gateway-Token')
        if not token or token != GATEWAY_SECRET:
            return self._send_json(401, {
                'error': 'UNAUTHORIZED_GATEWAY_TOKEN',
                'message': 'Direct access without valid gateway credentials denied.'
            })

        # 3. Read body with 64KB size limit
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 65536:
            return self._send_json(413, {'error': 'PAYLOAD_TOO_LARGE', 'message': 'Max payload is 64KB'})
        
        try:
            body_bytes = self.rfile.read(content_length)
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception as e:
            return self._send_json(400, {'error': 'INVALID_JSON', 'message': str(e)})

        # Extract correlation metadata
        request_id = self.headers.get('X-Request-Id') or body.get('requestId') or f"req_{int(time.time()*1000)}"
        user_agent = self.headers.get('User-Agent') or body.get('userAgent') or 'unknown'
        client_origin = body.get('clientOrigin') or self.headers.get('X-Client-Origin') or 'PHONE'
        shop_id = body.get('shopId', '00000000-0000-0000-0000-000000000001')
        source_origin = self.headers.get('Origin') or body.get('origin') or 'https://kho.qbiz.vn'
        timestamp = time.strftime('%Y-%m-%dT%H:%M:%S+07:00')

        # 4. Strictly enforce APP_SCOPE == 'qbiz-kho'
        req_scope = body.get('appScope')
        if req_scope != APP_SCOPE:
            return self._send_json(403, {
                'error': 'FORBIDDEN_SCOPE',
                'message': f"Request appScope '{req_scope}' denied. Strictly locked to '{APP_SCOPE}'."
            })

        # 5. Sanitize: Reject command injection or unexpected parameters
        prompt = body.get('prompt') or body.get('promptText') or ''
        if not prompt or not isinstance(prompt, str):
            return self._send_json(400, {'error': 'MISSING_PROMPT', 'message': 'prompt is required'})

        for forbidden_term in ['__import__', 'os.system', 'subprocess', 'exec(', 'eval(']:
            if forbidden_term in prompt:
                return self._send_json(400, {'error': 'REJECTED_POTENTIAL_INJECTION'})

        # 6. Execute Local AI via Ollama
        try:
            raw_text, latency_ms = call_ollama_qwen(prompt)
            
            # Clean JSON
            json_text = raw_text.strip()
            first_brace = json_text.find('{')
            last_brace = json_text.rfind('}')
            if first_brace != -1 and last_brace != -1:
                json_text = json_text[first_brace:last_brace+1]
            
            parsed = json.loads(json_text)
            confidence, reasons = compute_gateway_confidence(parsed, prompt)

            # Heuristics for the 4 dashboard cases:
            p_low = prompt.lower()
            if any(k in p_low for k in ['gan het', 'gần hết', 'sap het', 'sắp hết']):
                parsed['tool'] = 'find-low-stock'
                parsed['intent'] = 'QUERY_STOCK'
                confidence = max(confidence, 0.95)
                reasons = [r for r in reasons if r in ('UNSUPPORTED_LOCAL_AGGREGATE', 'AMBIGUOUS_QUERY')]
            elif any(k in p_low for k in ['con bao nhieu hang', 'còn bao nhiêu hàng']) and not parsed.get('entities', {}).get('product_name'):
                parsed['intent'] = 'NEEDS_CLARIFICATION'
                parsed['isAmbiguous'] = True
                parsed['status'] = 'NEEDS_CLARIFICATION'
                confidence = max(confidence, 0.90)
            elif any(k in p_low for k in ['can nhap', 'cần nhập', 'de xuat', 'đề xuất']):
                parsed['tool'] = 'replenishment-suggestion'
                parsed['intent'] = 'QUERY_REORDER'
                confidence = max(confidence, 0.92)
                reasons = [r for r in reasons if r in ('UNSUPPORTED_LOCAL_AGGREGATE', 'AMBIGUOUS_QUERY')]
            elif any(k in p_low for k in ['hom nay doanh thu bao nhieu', 'hôm nay doanh thu bao nhiêu', 'doanh thu']):
                parsed['tool'] = 'query-sales-report'
                parsed['intent'] = 'QUERY_SALES_TODAY'
                confidence = max(confidence, 0.92)
                reasons = [r for r in reasons if r in ('UNSUPPORTED_LOCAL_AGGREGATE', 'AMBIGUOUS_QUERY')]
            elif any(k in p_low for k in [
                'loi nhuan', 'lợi nhuận', 'gia von', 'giá vốn', 'lai bao nhieu', 'lãi bao nhiêu',
                'loi bao nhieu', 'lời bao nhiêu', 'loi duoc', 'lời được', 'lai duoc', 'lãi được',
                'loi lai', 'lời lãi', 'lai gop', 'lãi gộp', 'loi gop', 'lợi gộp', 'dang lai', 'đang lãi',
                'dang lo', 'đang lỗ', 'gross profit', 'profit'
            ]) or (any(t in p_low for t in ['thang', 'tháng', 'ngay nay', 'ngày nay', 'hom nay', 'hôm nay', 'tuan', 'tuần']) and any(l in p_low for l in ['loi', 'lời', 'lai', 'lãi'])):
                parsed['tool'] = 'get_profit_summary'
                parsed['intent'] = 'PROFIT_INQUIRY'
                confidence = max(confidence, 0.95)
                reasons = [r for r in reasons if r in ('UNSUPPORTED_LOCAL_AGGREGATE', 'AMBIGUOUS_QUERY')]

            is_target_correlation = ('9251' in prompt)
            is_local_pass = (confidence >= 0.70 and not reasons)

            # Record Correlation Audit Log
            audit_entry = {
                'timestamp': timestamp,
                'requestId': request_id,
                'clientOrigin': client_origin,
                'sourceOrigin': source_origin,
                'shopId': shop_id,
                'userAgent': user_agent,
                'prompt': prompt,
                'isTargetCorrelation': is_target_correlation,
                'provider': 'LOCAL_AI' if is_local_pass else 'GEMINI_FALLBACK',
                'model': OLLAMA_MODEL,
                'confidence': confidence,
                'latencyMs': latency_ms,
                'tool': parsed.get('tool'),
                'intent': parsed.get('intent'),
                'explanation': parsed.get('explanation') or parsed.get('action_summary'),
                'hops': [
                    'PHONE_BROWSER',
                    'SERVER_AI_GATEWAY',
                    'CLOUDFLARE_TUNNEL',
                    'PC_LOCAL_AI_GATEWAY',
                    'OLLAMA_QWEN3.5_2B'
                ]
            }
            log_correlation_audit(audit_entry)
            print(f"[CORRELATION AUDIT] {request_id} | Phone={client_origin} | Target={'YES' if is_target_correlation else 'NO'} | Provider={audit_entry['provider']} | Latency={latency_ms}ms", flush=True)

            if is_local_pass:
                return self._send_json(200, {
                    'success': True,
                    'provider': 'LOCAL_AI',
                    'model': OLLAMA_MODEL,
                    'confidence': confidence,
                    'latencyMs': latency_ms,
                    'structuredResult': parsed,
                    'rawText': raw_text,
                    'compactTrace': f"Local Qwen ({round(latency_ms/1000, 1)}s, conf {confidence})"
                })
            else:
                # Trigger Fallback
                primary_reason = reasons[0] if reasons else 'LOW_CONFIDENCE'
                return self._send_json(200, {
                    'success': False,
                    'fallbackRequired': True,
                    'fallbackReason': primary_reason,
                    'confidence': confidence,
                    'latencyMs': latency_ms,
                    'structuredResult': parsed,
                    'rawText': raw_text,
                    'compactTrace': f"Local Qwen -> Gemini ({primary_reason})"
                })

        except urllib.error.URLError as e:
            audit_entry = {
                'timestamp': timestamp,
                'requestId': request_id,
                'clientOrigin': client_origin,
                'sourceOrigin': source_origin,
                'shopId': shop_id,
                'userAgent': user_agent,
                'prompt': prompt,
                'isTargetCorrelation': ('9251' in prompt),
                'provider': 'GEMINI_FALLBACK',
                'model': 'gemini-2.5-flash',
                'fallbackReason': 'LOCAL_OFFLINE',
                'latencyMs': 0,
                'error': str(e)
            }
            log_correlation_audit(audit_entry)
            return self._send_json(503, {
                'success': False,
                'fallbackRequired': True,
                'fallbackReason': 'LOCAL_OFFLINE',
                'error': str(e),
                'compactTrace': 'Gemini fallback (local offline)'
            })
        except Exception as e:
            return self._send_json(500, {
                'success': False,
                'fallbackRequired': True,
                'fallbackReason': 'LOCAL_ERROR',
                'error': str(e)
            })

    def log_message(self, format, *args):
        # Keep quiet on standard console unless debugging
        pass

def run_server():
    server = ThreadedHTTPServer(('127.0.0.1', GATEWAY_PORT), LocalAIGatewayHandler)
    print(f"[PC Local AI Gateway] Listening on http://127.0.0.1:{GATEWAY_PORT} (threaded)", flush=True)
    print(f"[PC Local AI Gateway] Bound to Ollama at {OLLAMA_ENDPOINT} ({OLLAMA_MODEL})", flush=True)
    print(f"[PC Local AI Gateway] Security: Token protected, APP_SCOPE='{APP_SCOPE}' enforced.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PC Local AI Gateway] Stopping...", flush=True)
        server.server_close()

if __name__ == '__main__':
    run_server()
