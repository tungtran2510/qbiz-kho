from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os, sys, time, json, traceback, urllib.request, urllib.error, hmac, hashlib, base64, secrets

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

def _load_env_file():
    if os.environ.get('QBIZ_IGNORE_ENV_FILE'):
        return
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        k, v = k.strip(), v.strip()
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

_load_env_file()

def get_gateway_jwt_secret():
    secret = os.environ.get('QBIZ_JWT_SECRET') or os.environ.get('QBIZ_INVOICE_JWT_SECRET')
    if secret:
        return secret
    # If not configured in environment, check mode and generate an ephemeral cryptographically secure random secret
    # unique to this running process instance. NEVER use a predictable hardcoded static string!
    if is_production_mode():
        if not getattr(get_gateway_jwt_secret, '_warned_prod', False):
            sys.stderr.write("[CRITICAL_SECURITY_CONFIG] QBIZ_JWT_SECRET is NOT configured in production environment! Using ephemeral in-memory fallback will cause auth failures on serverless cold starts. Set QBIZ_JWT_SECRET in Vercel/environment immediately.\n")
            get_gateway_jwt_secret._warned_prod = True
    elif not getattr(get_gateway_jwt_secret, '_warned_dev', False):
        sys.stderr.write("[DEV_SECURITY_NOTICE] QBIZ_JWT_SECRET is not set; using ephemeral random in-memory secret for local dev session.\n")
        get_gateway_jwt_secret._warned_dev = True
    if not hasattr(get_gateway_jwt_secret, '_ephemeral_secret'):
        get_gateway_jwt_secret._ephemeral_secret = secrets.token_hex(32)
    return get_gateway_jwt_secret._ephemeral_secret

def mask_tax_code(tax_code):
    if not tax_code or not isinstance(tax_code, str):
        return ''
    clean = tax_code.strip()
    if len(clean) <= 3:
        return '***'
    return '*' * (len(clean) - 3) + clean[-3:]

def mask_phone(phone):
    if not phone or not isinstance(phone, str):
        return ''
    clean = phone.strip()
    if len(clean) <= 3:
        return '***'
    return '*' * (len(clean) - 3) + clean[-3:]

def mask_email(email):
    if not email or not isinstance(email, str):
        return ''
    if '@' not in email:
        return '***'
    name, domain = email.split('@', 1)
    if len(name) <= 2:
        return f"*@{domain}"
    return f"{name[0]}***{name[-1]}@{domain}"

def mask_sensitive_data(data):
    if not data:
        return data
    if isinstance(data, str):
        if data.lower().startswith('bearer '):
            return 'Bearer [REDACTED]'
        return data
    if isinstance(data, list):
        return [mask_sensitive_data(item) for item in data]
    if isinstance(data, dict):
        masked = {}
        for k, v in data.items():
            k_lower = k.lower()
            if any(s in k_lower for s in ('token', 'authorization', 'secret', 'jwt')):
                masked[k] = '[REDACTED]'
            elif any(s in k_lower for s in ('tax', 'tax_code')):
                masked[k] = mask_tax_code(v) if isinstance(v, str) else v
            elif any(s in k_lower for s in ('phone', 'buyer_phone')):
                masked[k] = mask_phone(v) if isinstance(v, str) else v
            elif any(s in k_lower for s in ('email', 'buyer_email')):
                masked[k] = mask_email(v) if isinstance(v, str) else v
            elif isinstance(v, (dict, list)):
                masked[k] = mask_sensitive_data(v)
            else:
                masked[k] = v
        return masked
    return data

def log_gateway_error(context, err):
    err_obj = {
        'message': str(err),
        'details': getattr(err, 'details', {})
    } if isinstance(err, Exception) else err
    safe_err = mask_sensitive_data(err_obj)
    sys.stderr.write(f"[Invoice Gateway Error] {context}: {json.dumps(safe_err, ensure_ascii=False)}\n")
    return safe_err

# In-memory Rate Limiting for critical invoice mutation actions (issue, adjust, replace)
INVOICE_MUTATION_RATE_LIMITS = {}
RATE_LIMIT_MUTATION_WINDOW_SECONDS = 60
RATE_LIMIT_MUTATION_MAX = int(os.environ.get('QBIZ_RATE_LIMIT_MUTATION_MAX', '30'))

def check_mutation_rate_limit(key, max_requests=None, window_seconds=RATE_LIMIT_MUTATION_WINDOW_SECONDS):
    if max_requests is None:
        max_requests = int(os.environ.get('QBIZ_RATE_LIMIT_MUTATION_MAX', '30'))
    now = time.time()
    timestamps = INVOICE_MUTATION_RATE_LIMITS.get(key, [])
    valid_timestamps = [t for t in timestamps if now - t < window_seconds]
    if len(valid_timestamps) >= max_requests:
        INVOICE_MUTATION_RATE_LIMITS[key] = valid_timestamps
        return False
    valid_timestamps.append(now)
    INVOICE_MUTATION_RATE_LIMITS[key] = valid_timestamps
    return True

def is_production_mode(headers=None):
    # Strictly determined by server-side environment variables ONLY.
    # Client headers (like X-QBiz-Env) are NEVER trusted or checked!
    return (
        os.environ.get('QBIZ_ENV') == 'production' or
        os.environ.get('NODE_ENV') == 'production' or
        os.environ.get('VERCEL_ENV') == 'production'
    )

# Server-Side Session Store: mapping opaque server-issued token -> session data
SERVER_SESSION_STORE = {
    'mock_token_owner': {'role': 'OWNER', 'sub': 'system_owner', 'shop_id': 'shop_a'},
    'mock_token_cashier': {'role': 'CASHIER', 'sub': 'system_cashier', 'shop_id': 'shop_a'},
    'mock_token_manager': {'role': 'MANAGER', 'sub': 'system_manager', 'shop_id': 'shop_a'},
    'mock_token_warehouse': {'role': 'WAREHOUSE', 'sub': 'system_warehouse', 'shop_id': 'shop_a'}
}

def create_server_signed_jwt(role, user_id='local_user', email='owner@qbiz.vn', exp_seconds=86400, shop_id='shop_a'):
    header = {'alg': 'HS256', 'typ': 'JWT'}
    payload = {
        'sub': user_id,
        'email': email,
        'role': role,
        'shop_role': role,
        'shop_id': shop_id,
        'iat': int(time.time()),
        'exp': int(time.time()) + exp_seconds
    }
    def b64url(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode('utf-8')).decode('utf-8').rstrip('=')
    
    msg = f"{b64url(header)}.{b64url(payload)}".encode('utf-8')
    sig = base64.urlsafe_b64encode(
        hmac.new(get_gateway_jwt_secret().encode('utf-8'), msg, hashlib.sha256).digest()
    ).decode('utf-8').rstrip('=')
    return f"{b64url(header)}.{b64url(payload)}.{sig}"

def create_server_session_token(role, user_id='local_user', shop_id='shop_a'):
    token = f"qbiz_sess_{secrets.token_hex(24)}"
    SERVER_SESSION_STORE[token] = {
        'role': role,
        'sub': user_id,
        'shop_id': shop_id,
        'created_at': time.time()
    }
    return token

def resolve_auth_from_header(auth_header, is_prod=False):
    if not auth_header or not isinstance(auth_header, str):
        return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'MISSING_AUTHORIZATION_HEADER'}

    token = auth_header.replace('Bearer ', '').replace('bearer ', '').strip()
    if not token:
        return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'EMPTY_TOKEN'}

    # 1. Lookup in Server-Side Session Store
    if token in SERVER_SESSION_STORE:
        if is_prod:
            return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'MOCK_SESSION_NOT_ALLOWED_IN_PRODUCTION'}
        sess = SERVER_SESSION_STORE[token]
        return {
            'authenticated': True,
            'role': sess.get('role', 'CASHIER'),
            'shop_id': sess.get('shop_id', 'shop_a'),
            'sub': sess.get('sub'),
            'source': 'SERVER_SESSION'
        }

    # 2. Cryptographic JWT Verification with Server Secret
    parts = token.split('.')
    if len(parts) == 3:
        header_b64, payload_b64, signature = parts
        try:
            padded_hdr = header_b64 + '=' * (-len(header_b64) % 4)
            hdr = json.loads(base64.urlsafe_b64decode(padded_hdr).decode('utf-8'))
            if hdr.get('alg') != 'HS256':
                return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'UNSUPPORTED_OR_FORBIDDEN_ALGORITHM'}

            msg = f"{header_b64}.{payload_b64}".encode('utf-8')
            expected_sig = base64.urlsafe_b64encode(
                hmac.new(get_gateway_jwt_secret().encode('utf-8'), msg, hashlib.sha256).digest()
            ).decode('utf-8').rstrip('=')

            # Constant-time comparison to prevent timing attacks
            if not hmac.compare_digest(signature, expected_sig):
                return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'INVALID_TOKEN_SIGNATURE'}

            padded = payload_b64 + '=' * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode('utf-8'))

            # Check expiration
            exp = payload.get('exp')
            if exp and exp < time.time():
                return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'TOKEN_EXPIRED'}

            # Check not-before
            nbf = payload.get('nbf')
            if nbf and nbf > time.time():
                return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'TOKEN_NOT_YET_VALID'}

            raw_role = payload.get('role') or payload.get('shop_role') or payload.get('user_metadata', {}).get('role') or payload.get('app_metadata', {}).get('role')
            if not raw_role:
                return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'MISSING_ROLE_IN_PAYLOAD'}

            norm_role = str(raw_role).upper()
            shop_id = payload.get('shop_id') or payload.get('app_metadata', {}).get('shop_id') or 'shop_a'

            return {
                'authenticated': True,
                'role': 'OWNER' if norm_role == 'ADMIN' else norm_role,
                'shop_id': shop_id,
                'sub': payload.get('sub') or payload.get('id'),
                'email': payload.get('email'),
                'source': 'VERIFIED_JWT'
            }
        except Exception as e:
            return {'authenticated': False, 'role': None, 'shop_id': None, 'error': f'MALFORMED_JWT: {str(e)}'}

    # Reject any other arbitrary string
    return {'authenticated': False, 'role': None, 'shop_id': None, 'error': 'UNAUTHORIZED_OR_UNKNOWN_SESSION'}

INVOICE_IDEMPOTENCY_STORE = {}
INVOICE_BY_NUMBER_STORE = {}
INVOICE_SEQUENCE = 1000

def resolve_active_invoice_provider(headers=None, is_prod=False):
    # STRICT SECURITY INVARIANT (BATCH 4B-R2):
    # 1. Provider authority is resolved SOLELY from trusted server-side configuration.
    # 2. Client headers (e.g. X-Invoice-Provider) and request body fields are NEVER trusted and MUST NOT override active provider.
    # 3. PRODUCTION FAIL-CLOSED:
    #    - If QBIZ_INVOICE_PROVIDER is missing: FAIL CLOSED (INVOICE_PROVIDER_NOT_CONFIGURED).
    #    - If QBIZ_INVOICE_PROVIDER == 'MOCK_QBIZ_EINVOICE': FAIL CLOSED (MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION).
    # 4. In non-production: default to 'MOCK_QBIZ_EINVOICE' if not set.
    # 5. Test override is ONLY permitted if server environment explicitly sets QBIZ_ALLOW_TEST_OVERRIDE === '1' AND is NOT production.
    provider_code = os.environ.get('QBIZ_INVOICE_PROVIDER')

    if is_prod:
        if not provider_code:
            return None, 'INVOICE_PROVIDER_NOT_CONFIGURED'
        if provider_code == 'MOCK_QBIZ_EINVOICE':
            return None, 'MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION'
        return provider_code, None

    allow_test_override = (os.environ.get('QBIZ_ALLOW_TEST_OVERRIDE') == '1')
    if allow_test_override and headers:
        test_header = headers.get('X-Test-Invoice-Provider') or headers.get('x-test-invoice-provider')
        if test_header:
            provider_code = test_header

    return provider_code or 'MOCK_QBIZ_EINVOICE', None

def process_mock_invoice_action(action, idempotency_key, payload=None, user_auth=None, body=None, active_provider=None):
    global INVOICE_SEQUENCE
    if not payload:
        payload = {}
    if not body:
        body = {}
    if not user_auth:
        user_auth = {'authenticated': False, 'role': None, 'shop_id': 'shop_a'}

    principal_shop = user_auth.get('shop_id', 'shop_a')
    if not active_provider:
        active_provider, _ = resolve_active_invoice_provider(is_prod=False)
    if action == 'getCapabilities':
        if active_provider == 'MISA_MEINVOICE':
            return {
                'provider_code': 'MISA_MEINVOICE',
                'active_provider': 'MISA_MEINVOICE',
                'provider_name': 'MISA meInvoice Open API Integration Provider',
                'version': '4.0.0-openapi',
                'api_family': 'OPEN_API_INTEGRATION',
                'supports_draft': True,
                'supports_issue': True,
                'supports_get_status': True,
                'supports_get_document': True,
                'supports_adjust': True,
                'supports_replace': True,
                'supports_cancel': False
            }
        return {
            'provider_code': 'MOCK_QBIZ_EINVOICE',
            'active_provider': 'MOCK_QBIZ_EINVOICE',
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

    # Tenant check: Client body cannot request action for another shop
    req_shop = payload.get('shopId') or payload.get('shop_id') or body.get('shopId') or body.get('shop_id')
    if req_shop and req_shop != principal_shop:
        return {
            'error': 'FORBIDDEN_TENANT_ACCESS',
            'status_code': 403,
            'message': 'Không có quyền thao tác trên cửa hàng khác.'
        }

    # If MISA provider active and credentials missing, return 401 AUTH_ERROR - never fake PASS
    if active_provider == 'MISA_MEINVOICE':
        misa_app_id = os.environ.get('MISA_APP_ID')
        misa_tax_code = os.environ.get('MISA_TAX_CODE')
        misa_username = os.environ.get('MISA_USERNAME')
        misa_password = os.environ.get('MISA_PASSWORD')
        if not (misa_app_id and misa_tax_code and misa_username and misa_password):
            return {
                'error': 'AUTH_ERROR',
                'rawCode': 'MISSING_MISA_CREDENTIALS',
                'status_code': 401,
                'message': 'Chưa cấu hình thông tin xác thực MISA meInvoice (MISA_APP_ID, MISA_TAX_CODE, MISA_USERNAME, MISA_PASSWORD) trong biến môi trường server.'
            }

        misa_sign_type = os.environ.get('MISA_SIGN_TYPE')
        if action in ('issue', 'adjust', 'replace'):
            if not misa_sign_type:
                return {
                    'error': 'CONFIG_ERROR',
                    'rawCode': 'MISSING_SIGNTYPE',
                    'status_code': 400,
                    'message': 'Chưa cấu hình hình thức ký số MISA meInvoice (MISA_SIGN_TYPE: 1=USB/File, 2=HSM có hiển thị CKS, 3=HSM bất đồng bộ, 4=Ký sau vé không mã, 5=Ký sau MTT không hiển thị CKS, 6=Ký sau MTT bất đồng bộ).'
                }
            try:
                st = int(misa_sign_type)
            except (ValueError, TypeError):
                st = None
            if st not in (1, 2, 3, 4, 5, 6):
                return {
                    'error': 'CONFIG_ERROR',
                    'rawCode': 'INVALID_SIGNTYPE',
                    'status_code': 400,
                    'message': f'Hình thức ký MISA (MISA_SIGN_TYPE={misa_sign_type}) không hợp lệ theo tài liệu MISA Open API (chấp nhận 1..6).'
                }
            if st in (3, 6):
                return {
                    'error': 'CAPABILITY_NOT_AVAILABLE',
                    'rawCode': 'CAPABILITY_NOT_IMPLEMENTED',
                    'status_code': 400,
                    'message': f'Hình thức ký bất đồng bộ (SignType {st}) chưa được hỗ trợ trong phiên bản adapter hiện tại.'
                }

    if action == 'createDraft':
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            existing = INVOICE_IDEMPOTENCY_STORE[idempotency_key]
            if existing.get('shop_id') != principal_shop:
                return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền truy cập.'}
            return existing
        draft_id = f"MOCK-DFT-{int(time.time()*1000)}"
        res = {
            'success': True,
            'provider_code': 'MOCK_QBIZ_EINVOICE',
            'provider_draft_id': draft_id,
            'status': 'DRAFT',
            'shop_id': principal_shop,
            'idempotency_key': idempotency_key,
            'message': 'Bản nháp HĐĐT đã được tạo trên hệ thống nhà cung cấp'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        return res

    if action == 'issue':
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            existing = INVOICE_IDEMPOTENCY_STORE[idempotency_key].copy()
            if existing.get('shop_id') != principal_shop:
                return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền truy cập.'}
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
            'shop_id': principal_shop,
            'idempotency_key': idempotency_key,
            'message': 'Phát hành hóa đơn điện tử thành công'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        INVOICE_BY_NUMBER_STORE[inv_num] = res
        return res

    if action == 'getStatus':
        rec = None
        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            rec = INVOICE_IDEMPOTENCY_STORE[idempotency_key]
        elif payload.get('invoiceNumber') and payload['invoiceNumber'] in INVOICE_BY_NUMBER_STORE:
            rec = INVOICE_BY_NUMBER_STORE[payload['invoiceNumber']]
        elif payload.get('transactionId'):
            for r in INVOICE_IDEMPOTENCY_STORE.values():
                if r.get('transaction_id') == payload['transactionId']:
                    rec = r
                    break
        if rec:
            if rec.get('shop_id') and rec.get('shop_id') != principal_shop:
                return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền truy cập hóa đơn của cửa hàng khác.'}
            return {'success': True, 'record': rec}
        return {'success': False, 'status': 'NOT_FOUND', 'status_code': 404, 'message': 'Không tìm thấy hóa đơn'}

    if action == 'getDocument':
        inv_num = payload.get('invoiceNumber', '')
        lookup_code = payload.get('lookupCode', '')
        rec = None
        if inv_num and inv_num in INVOICE_BY_NUMBER_STORE:
            rec = INVOICE_BY_NUMBER_STORE[inv_num]
        elif idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            rec = INVOICE_IDEMPOTENCY_STORE[idempotency_key]

        if rec and rec.get('shop_id') and rec.get('shop_id') != principal_shop:
            return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền xem chứng từ của cửa hàng khác.'}

        return {
            'success': True,
            'format': payload.get('format', 'html'),
            'invoice_number': inv_num or '0000000',
            'lookup_code': lookup_code,
            'html_preview': f'<div class="mock-invoice-doc"><h2>HÓA ĐƠN ĐIỆN TỬ (MOCK)</h2><p>Số: {inv_num}</p></div>'
        }

    if action == 'adjust':
        orig_ref = payload.get('originalInvoiceRef') or {}
        orig_num = orig_ref.get('invoice_number') or payload.get('original_invoice_number')
        if orig_num and orig_num in INVOICE_BY_NUMBER_STORE:
            orig_rec = INVOICE_BY_NUMBER_STORE[orig_num]
            if orig_rec.get('shop_id') and orig_rec.get('shop_id') != principal_shop:
                return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền điều chỉnh hóa đơn của cửa hàng khác.'}

        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            existing = INVOICE_IDEMPOTENCY_STORE[idempotency_key].copy()
            if existing.get('shop_id') != principal_shop:
                return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền truy cập.'}
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
            'shop_id': principal_shop,
            'idempotency_key': idempotency_key,
            'message': 'Phát hành hóa đơn điều chỉnh thành công'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        INVOICE_BY_NUMBER_STORE[inv_num] = res
        return res

    if action == 'replace':
        orig_ref = payload.get('originalInvoiceRef') or {}
        orig_num = orig_ref.get('invoice_number') or payload.get('original_invoice_number')
        if orig_num and orig_num in INVOICE_BY_NUMBER_STORE:
            orig_rec = INVOICE_BY_NUMBER_STORE[orig_num]
            if orig_rec.get('shop_id') and orig_rec.get('shop_id') != principal_shop:
                return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền thay thế hóa đơn của cửa hàng khác.'}

        if idempotency_key and idempotency_key in INVOICE_IDEMPOTENCY_STORE:
            existing = INVOICE_IDEMPOTENCY_STORE[idempotency_key].copy()
            if existing.get('shop_id') != principal_shop:
                return {'error': 'FORBIDDEN_TENANT_ACCESS', 'status_code': 403, 'message': 'Không có quyền truy cập.'}
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
            'shop_id': principal_shop,
            'idempotency_key': idempotency_key,
            'message': 'Phát hành hóa đơn thay thế thành công'
        }
        if idempotency_key:
            INVOICE_IDEMPOTENCY_STORE[idempotency_key] = res
        INVOICE_BY_NUMBER_STORE[inv_num] = res
        return res

    if action == 'configureProvider':
        return {
            'success': True,
            'shop_id': principal_shop,
            'message': 'Cấu hình nhà cung cấp thành công'
        }

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

    def __init__(self, *args, **kwargs):
        qa_snapshot_dir = os.environ.get('QBIZ_QA_SNAPSHOT_DIR')
        if qa_snapshot_dir and os.path.exists(qa_snapshot_dir):
            super().__init__(*args, directory=qa_snapshot_dir, **kwargs)
        else:
            super().__init__(*args, **kwargs)

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

    def _send_json_response(self, status_code, data, extra_headers=None):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-QBiz-Gateway-Token')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, str(v))
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

        if self.path in ('/api/ai-deepseek', '/api/ai-deepseek-health'):
            deepseek_key = os.environ.get('DEEPSEEK_API_KEY', '')
            has_key = bool(deepseek_key and len(deepseek_key) > 10)
            deepseek_model = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')
            return self._send_json_response(200, {
                'status': 'active' if has_key else 'key_missing',
                'gateway': 'QBIZ_KHO_DEEPSEEK_GATEWAY',
                'appScope': 'qbiz-kho',
                'hasKey': has_key,
                'provider': 'DEEPSEEK',
                'model': deepseek_model,
                'aiArchVersion': 'PHASE3'
            })

        if self.path in ('/api/ai-gateway', '/api/local-ai-health'):
            # Health check for live Ollama instance + DeepSeek availability
            is_healthy = False
            model_present = False
            active_model = os.environ.get('OLLAMA_MODEL', 'qwen2.5:1.5b')
            deepseek_key = os.environ.get('DEEPSEEK_API_KEY', '')
            has_deepseek = bool(deepseek_key and len(deepseek_key) > 10)
            try:
                req = urllib.request.Request('http://127.0.0.1:11434/api/tags')
                with urllib.request.urlopen(req, timeout=3) as r:
                    is_healthy = (r.status == 200)
                    tag_data = json.loads(r.read().decode('utf-8'))
                    model_names = [m.get('name') for m in tag_data.get('models', [])]
                    model_present = any(active_model in m for m in model_names)
            except Exception:
                pass
            return self._send_json_response(200, {
                'status': 'active',
                'gateway': 'QBIZ_KHO_SERVER_AI_GATEWAY',
                'appScope': 'qbiz-kho',
                'pcLocalHealthy': is_healthy,
                'modelPresent': model_present,
                'deepseekHealthy': has_deepseek,
                'defaultProvider': 'DEEPSEEK' if has_deepseek else 'LOCAL_AI',
                'provider': 'DEEPSEEK' if has_deepseek else 'LOCAL_AI',
                'model': os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat') if has_deepseek else active_model,
                'aiArchVersion': 'PHASE3'
            })

        if self.path == '/api/invoice-gateway' or self.path.startswith('/api/invoice-gateway'):
            is_prod = is_production_mode(self.headers)
            active_provider, err_code = resolve_active_invoice_provider(self.headers, is_prod=is_prod)
            if err_code:
                return self._send_json_response(500, {
                    'status': 'CONFIG_ERROR',
                    'error': err_code,
                    'message': f"Lỗi cấu hình nhà cung cấp HĐĐT trong production: {err_code}"
                })
            if active_provider == 'MISA_MEINVOICE':
                caps = {
                    'provider_code': 'MISA_MEINVOICE',
                    'provider_name': 'MISA meInvoice Open API Integration Provider',
                    'version': '4.0.0-openapi',
                    'api_family': 'OPEN_API_INTEGRATION',
                    'supports_draft': True,
                    'supports_issue': True,
                    'supports_get_status': True,
                    'supports_get_document': True,
                    'supports_adjust': True,
                    'supports_replace': True,
                    'supports_cancel': False
                }
            else:
                caps = {
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
            return self._send_json_response(200, {
                'status': 'ONLINE',
                'gateway': 'QBiz Electronic Invoice Gateway v1 (Python Server)',
                'active_provider': active_provider,
                'capabilities': caps
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

            # Direct Ollama Local AI Call on PC (Server-Side Provider Gateway)
            start_t = time.time()
            ollama_url = os.environ.get('OLLAMA_ENDPOINT', 'http://127.0.0.1:11434').rstrip('/')
            ollama_model = os.environ.get('OLLAMA_MODEL', 'qwen2.5:1.5b')

            print(f"[AI-Gateway] [{client_origin}] Received prompt ({len(prompt)} chars), forwarding to Ollama ({ollama_model})...")
            sys.stdout.flush()

            try:
                messages = [
                    {
                        'role': 'system',
                        'content': 'Bạn là Trợ lý vận hành QBiz Kho (App Scope: qbiz-kho). Nhiệm vụ: Phân tích câu hỏi người dùng, đối chiếu danh mục công cụ và trả về DUY NHẤT 1 JSON object hợp lệ theo schema quy định có mảng "intents". Tuyệt đối không sinh thêm văn bản hay suy nghĩ bên ngoài JSON.'
                    },
                    {'role': 'user', 'content': prompt}
                ]
                ollama_payload = {
                    'model': ollama_model,
                    'messages': messages,
                    'format': 'json',
                    'stream': False,
                    'options': {
                        'num_predict': 220,
                        'num_thread': 10,
                        'temperature': 0.1
                    },
                    'keep_alive': '30m'
                }
                target_req = urllib.request.Request(
                    f"{ollama_url}/api/chat",
                    data=json.dumps(ollama_payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                with urllib.request.urlopen(target_req, timeout=22.0) as resp:
                    ollama_res = json.loads(resp.read().decode('utf-8'))
                    raw_content = ollama_res.get('message', {}).get('content', '').strip()
                    latency_ms = int((time.time() - start_t) * 1000)
                    print(f"[AI-Gateway] [{client_origin}] Ollama responded in {latency_ms}ms with status 200.")
                    sys.stdout.flush()
                    try:
                        structured = json.loads(raw_content)
                    except Exception:
                        structured = None
                    return self._send_json_response(200, {
                        'success': True,
                        'provider': 'LOCAL_AI',
                        'model': ollama_model,
                        'finalProvider': 'LOCAL_AI',
                        'finalModel': ollama_model,
                        'confidence': 0.95,
                        'latencyMs': latency_ms,
                        'rawText': raw_content,
                        'structuredResult': structured,
                        'compactTrace': f"Ollama {ollama_model} ({latency_ms}ms)",
                        'origin': client_origin
                    })
            except Exception as e:
                latency_ms = int((time.time() - start_t) * 1000)
                err_str = str(e).lower()
                status_code = 503
                if 'not found' in err_str:
                    fallback_reason = 'LOCAL_MODEL_MISSING'
                elif 'timed out' in err_str or 'timeout' in err_str:
                    fallback_reason = 'LOCAL_MODEL_TIMEOUT'
                    status_code = 504
                else:
                    fallback_reason = 'OLLAMA_OFFLINE'
                print(f"[AI-Gateway] [{client_origin}] Ollama call failed ({fallback_reason}) in {latency_ms}ms: {e}")
                sys.stdout.flush()
                return self._send_json_response(status_code, {
                    'success': False,
                    'error': fallback_reason,
                    'fallbackReason': fallback_reason,
                    'message': f"Ollama gateway error: {e}",
                    'latencyMs': latency_ms,
                    'origin': client_origin
                })

        # POST /api/ai-deepseek -> DeepSeek V3 primary engine (replaces 3-layer chain)
        if self.path == '/api/ai-deepseek' or self.path.startswith('/api/ai-deepseek'):
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

            is_retry = body.get('isRetry', False)
            client_origin = body.get('clientOrigin', 'PC')

            deepseek_key = os.environ.get('DEEPSEEK_API_KEY', '')
            if not deepseek_key:
                print(f"[AI-DeepSeek] [{client_origin}] ADMIN WARNING: No DEEPSEEK_API_KEY configured.")
                sys.stdout.flush()
                return self._send_json_response(503, {
                    'success': False,
                    'error': 'DEEPSEEK_KEY_NOT_CONFIGURED',
                    'message': 'No DEEPSEEK_API_KEY environment variable configured on server.'
                })

            start_t = time.time()
            deepseek_model = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')
            deepseek_url = 'https://api.deepseek.com/chat/completions'

            retry_label = ' (RETRY)' if is_retry else ''
            print(f"[AI-DeepSeek] [{client_origin}]{retry_label} Calling DeepSeek ({deepseek_model}), prompt ({len(prompt)} chars)...")
            sys.stdout.flush()

            try:
                deepseek_payload = json.dumps({
                    'model': deepseek_model,
                    'messages': [
                        {'role': 'system', 'content': 'You are QBiz Kho AI semantic planner. Always output a valid JSON object matching the requested schema.'},
                        {'role': 'user', 'content': prompt}
                    ],
                    'temperature': 0.1,
                    'response_format': {'type': 'json_object'},
                }).encode('utf-8')
                deepseek_req = urllib.request.Request(
                    deepseek_url,
                    data=deepseek_payload,
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {deepseek_key}',
                    }
                )
                with urllib.request.urlopen(deepseek_req, timeout=18.0) as resp:
                    deepseek_res = json.loads(resp.read().decode('utf-8'))
                    raw_content = ''
                    choices = deepseek_res.get('choices', [])
                    if choices:
                        raw_content = choices[0].get('message', {}).get('content', '')
                    latency_ms = int((time.time() - start_t) * 1000)

                    # Extract token usage for cost tracking
                    usage = deepseek_res.get('usage', {})
                    input_tokens = usage.get('prompt_tokens', 0)
                    output_tokens = usage.get('completion_tokens', 0)
                    # DeepSeek-V3 pricing: $0.27/M input, $1.10/M output (cache miss)
                    cost_usd = (input_tokens * 0.27 + output_tokens * 1.10) / 1_000_000

                    print(f"[AI-DeepSeek] [{client_origin}]{retry_label} DeepSeek responded in {latency_ms}ms. Tokens: {input_tokens}+{output_tokens}, Cost: ${cost_usd:.6f}")
                    sys.stdout.flush()

                    try:
                        structured = json.loads(raw_content)
                    except Exception:
                        structured = None

                    return self._send_json_response(200, {
                        'success': True,
                        'provider': 'DEEPSEEK',
                        'model': deepseek_model,
                        'finalProvider': 'DEEPSEEK',
                        'finalModel': deepseek_model,
                        'confidence': 0.95,
                        'latencyMs': latency_ms,
                        'rawText': raw_content,
                        'structuredResult': structured,
                        'compactTrace': f"DeepSeek {deepseek_model} ({latency_ms}ms)",
                        'origin': client_origin,
                        'tokenUsage': {'input': input_tokens, 'output': output_tokens},
                        'estimatedCostUSD': round(cost_usd, 6),
                    })
            except Exception as e:
                err_detail = str(e)
                if hasattr(e, 'read'):
                    try:
                        err_detail += " - " + e.read().decode('utf-8')
                    except Exception:
                        pass
                latency_ms = int((time.time() - start_t) * 1000)
                print(f"[AI-DeepSeek] [{client_origin}]{retry_label} DeepSeek call failed in {latency_ms}ms: {err_detail}")
                sys.stdout.flush()
                return self._send_json_response(503, {
                    'success': False,
                    'error': 'DEEPSEEK_CALL_FAILED',
                    'message': f"DeepSeek API error: {e}",
                    'latencyMs': latency_ms,
                    'origin': client_origin
                })

        # POST /api/ai-cloud-escalation -> Cloud AI fallback when local model fails
        if self.path == '/api/ai-cloud-escalation' or self.path.startswith('/api/ai-cloud-escalation'):
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

            escalation_reason = body.get('escalationReason', 'PROVIDER_RESPONSE_INVALID')
            client_origin = body.get('clientOrigin', 'PHONE')

            gemini_key = os.environ.get('GEMINI_API_KEY', '')
            if not gemini_key:
                print(f"[AI-Cloud-Escalation] [{client_origin}] No GEMINI_API_KEY configured, cannot escalate.")
                sys.stdout.flush()
                return self._send_json_response(503, {
                    'success': False,
                    'error': 'CLOUD_KEY_NOT_CONFIGURED',
                    'message': 'No GEMINI_API_KEY environment variable configured on server.'
                })

            start_t = time.time()
            configured_model = os.environ.get('GEMINI_MODEL', '').strip()
            models_to_try = [m for m in [configured_model, 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest'] if m]
            
            gemini_res = None
            raw_content = ''
            used_model = None
            last_err = None

            for gemini_model in models_to_try:
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
                print(f"[AI-Cloud-Escalation] [{client_origin}] Escalating to Gemini ({gemini_model}), reason: {escalation_reason}, prompt ({len(prompt)} chars)...")
                sys.stdout.flush()

                try:
                    gemini_payload = json.dumps({
                        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
                        'generationConfig': {'temperature': 0.1, 'responseMimeType': 'application/json'}
                    }).encode('utf-8')
                    gemini_req = urllib.request.Request(
                        gemini_url,
                        data=gemini_payload,
                        headers={'Content-Type': 'application/json'}
                    )
                    with urllib.request.urlopen(gemini_req, timeout=12.0) as resp:
                        gemini_res = json.loads(resp.read().decode('utf-8'))
                        candidates = gemini_res.get('candidates', [])
                        if candidates:
                            parts = candidates[0].get('content', {}).get('parts', [])
                            if parts:
                                raw_content = parts[0].get('text', '')
                        used_model = gemini_model
                        break
                except Exception as e:
                    last_err = e
                    print(f"[AI-Cloud-Escalation] [{client_origin}] Gemini ({gemini_model}) attempt failed: {e}")
                    sys.stdout.flush()
                    continue

            latency_ms = int((time.time() - start_t) * 1000)
            if raw_content and used_model:
                print(f"[AI-Cloud-Escalation] [{client_origin}] Gemini ({used_model}) succeeded in {latency_ms}ms.")
                sys.stdout.flush()
                try:
                    structured = json.loads(raw_content)
                except Exception:
                    structured = None
                return self._send_json_response(200, {
                    'success': True,
                    'provider': 'GEMINI',
                    'model': used_model,
                    'finalProvider': 'GEMINI',
                    'finalModel': used_model,
                    'confidence': 0.95,
                    'latencyMs': latency_ms,
                    'rawText': raw_content,
                    'structuredResult': structured,
                    'compactTrace': f"Gemini Cloud Escalation {used_model} ({latency_ms}ms)",
                    'origin': client_origin,
                    'escalationReason': escalation_reason
                })
            else:
                print(f"[AI-Cloud-Escalation] [{client_origin}] All Gemini models failed in {latency_ms}ms: {last_err}")
                sys.stdout.flush()
                return self._send_json_response(503, {
                    'success': False,
                    'error': 'CLOUD_ESCALATION_FAILED',
                    'message': f"Gemini cloud escalation error: {last_err}",
                    'latencyMs': latency_ms,
                    'origin': client_origin
                })

        # POST /api/auth/session or /api/auth/token -> Issue server-controlled session token
        if self.path in ('/api/auth/session', '/api/auth/token'):
            content_len = int(self.headers.get('Content-Length', 0))
            body = {}
            if content_len > 0:
                try:
                    body = json.loads(self.rfile.read(content_len).decode('utf-8'))
                except Exception:
                    pass

            is_prod = is_production_mode(self.headers)
            if is_prod:
                return self._send_json_response(401, {
                    'success': False,
                    'error': 'UNAUTHORIZED',
                    'message': 'Cấp phiên thử nghiệm không được phép trong môi trường production.'
                })

            auth_header = self.headers.get('Authorization', '')
            caller_auth = resolve_auth_from_header(auth_header, is_prod=is_prod)

            requested_role = (body.get('role') or 'CASHIER').upper()
            if requested_role not in ROLE_PERMISSIONS:
                requested_role = 'CASHIER'

            # Role escalation prevention: unauthenticated or CASHIER cannot request OWNER/MANAGER/ADMIN
            if requested_role in ('OWNER', 'MANAGER', 'ADMIN'):
                if not caller_auth.get('authenticated'):
                    return self._send_json_response(403, {
                        'success': False,
                        'error': 'FORBIDDEN_ROLE_ESCALATION',
                        'message': 'Không thể cấp quyền OWNER/MANAGER cho yêu cầu không xác thực.'
                    })
                caller_role = caller_auth.get('role')
                if caller_role not in ('OWNER', 'ADMIN'):
                    return self._send_json_response(403, {
                        'success': False,
                        'error': 'FORBIDDEN_ROLE_ESCALATION',
                        'message': f"Vai trò '{caller_role}' không được phép nâng quyền thành '{requested_role}'."
                    })

            target_shop = caller_auth.get('shop_id') if caller_auth.get('authenticated') else (body.get('shop_id') or body.get('shopId') or 'shop_a')
            target_user = body.get('user_id') or (caller_auth.get('sub') if caller_auth.get('authenticated') else 'local_user')

            token = create_server_session_token(requested_role, target_user, shop_id=target_shop)
            jwt_token = create_server_signed_jwt(requested_role, target_user, shop_id=target_shop)
            return self._send_json_response(200, {
                'success': True,
                'token': token,
                'jwt': jwt_token,
                'role': requested_role,
                'shop_id': target_shop
            })

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

            is_prod = is_production_mode(self.headers)
            auth_header = self.headers.get('Authorization', '')
            user_auth = resolve_auth_from_header(auth_header, is_prod=is_prod)

            # Strict Server-Side Authentication: all actions other than getCapabilities require auth
            if action != 'getCapabilities':
                if not user_auth.get('authenticated'):
                    return self._send_json_response(401, {
                        'success': False,
                        'error': 'UNAUTHORIZED',
                        'message': f"Xác thực thất bại: {user_auth.get('error', 'Token không hợp lệ hoặc chữ ký không khớp')}."
                    })

            # Strict Server-Side RBAC capability check
            required_capability = ACTION_PERMISSIONS.get(action)
            if required_capability:
                user_role = user_auth.get('role')
                allowed = ROLE_PERMISSIONS.get(user_role, [])
                if required_capability not in allowed:
                    return self._send_json_response(403, {
                        'success': False,
                        'error': 'FORBIDDEN_ACTION',
                        'message': f"Vai trò '{user_role}' không có quyền thực hiện hành động '{action}' (yêu cầu quyền {required_capability}).",
                        'requiredCapability': required_capability,
                        'userRole': user_role
                    })

            # In-memory Rate Limiting for critical mutation actions (issue, adjust, replace)
            if action in ('issue', 'adjust', 'replace'):
                token_val = auth_header.replace('Bearer ', '').strip() if auth_header else ''
                rate_key = user_auth.get('sub') or token_val or self.client_address[0]
                if not check_mutation_rate_limit(rate_key):
                    return self._send_json_response(429, {
                        'success': False,
                        'error': 'RATE_LIMIT_EXCEEDED',
                        'message': 'Quá số lần yêu cầu thao tác hóa đơn cho phép (vui lòng thử lại sau).'
                    }, extra_headers={'Retry-After': str(RATE_LIMIT_MUTATION_WINDOW_SECONDS)})

            active_provider, err_code = resolve_active_invoice_provider(self.headers, is_prod=is_prod)
            if err_code:
                return self._send_json_response(500, {
                    'success': False,
                    'error': err_code,
                    'message': f"Lỗi cấu hình nhà cung cấp HĐĐT trong production: {err_code}"
                })
            res_data = process_mock_invoice_action(action, idempotency_key, payload, user_auth=user_auth, body=body, active_provider=active_provider)
            if isinstance(res_data, dict) and res_data.get('status_code'):
                status_code = res_data['status_code']
                return self._send_json_response(status_code, {
                    'success': status_code == 200,
                    **res_data
                })

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
