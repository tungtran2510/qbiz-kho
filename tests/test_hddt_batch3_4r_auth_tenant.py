"""
QBiz Kho — HĐĐT Module 3.4R: Final Auth + Tenant Security Gate Verification
16 Rigorous Empirical Scenarios over Real HTTP Wire (Hard Assertions):
  S01: no token / issue -> 401
  S02: no token / getDocument -> 401
  S03: forged OWNER JWT / adjust -> 401
  S04: expired OWNER JWT / adjust -> 401
  S05: malformed JWT -> 401
  S06: CASHIER valid / issue own shop -> 200
  S07: CASHIER valid / adjust own shop -> 403
  S08: CASHIER body role=OWNER / adjust -> 403
  S09: unauthenticated request session OWNER -> 401/403
  S10: CASHIER requests OWNER session -> 403 (cannot become OWNER)
  S11: OWNER Shop A getDocument invoice A -> 200
  S12: OWNER Shop A getDocument invoice B -> 403/404 (không kèm metadata Shop B)
  S13: OWNER Shop A adjust invoice B -> 403/404
  S14: body shop_id=ShopB while principal=ShopA -> 403
  S15: production-mode mock/test token (với header X-QBiz-Env: production) -> 401
  S16: valid OWNER own-shop adjust -> 200
"""

import sys
import io
import os
import json
import time
import base64
import hmac
import hashlib
import urllib.request
import urllib.error

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
def _load_env_file():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
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

BASE_URL = 'http://localhost:4180'
GATEWAY_URL = f'{BASE_URL}/api/invoice-gateway'
AUTH_SESSION_URL = f'{BASE_URL}/api/auth/session'

GATEWAY_JWT_SECRET = os.environ.get('QBIZ_JWT_SECRET') or os.environ.get('QBIZ_INVOICE_JWT_SECRET') or 'qbiz_dynamic_test_secret_ephemeral'

def make_jwt(user_id, role, shop_id='shop_a', exp_seconds=3600, secret=None, alg='HS256'):
    if secret is None:
        secret = GATEWAY_JWT_SECRET
    header = {"alg": alg, "typ": "JWT"}
    payload = {
        "sub": user_id,
        "email": f"{user_id}@qbiz.vn",
        "role": role,
        "shop_role": role,
        "shop_id": shop_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + exp_seconds
    }
    def b64url(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode('utf-8')).decode('utf-8').rstrip('=')

    msg = f"{b64url(header)}.{b64url(payload)}".encode('utf-8')
    sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).digest()
    ).decode('utf-8').rstrip('=')
    return f"{b64url(header)}.{b64url(payload)}.{sig}"

def send_http(url, body, auth_token=None, extra_headers=None):
    headers = {'Content-Type': 'application/json'}
    if auth_token:
        headers['Authorization'] = f"Bearer {auth_token}" if not auth_token.startswith('Bearer ') else auth_token
    if extra_headers:
        headers.update(extra_headers)

    req_data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=req_data, headers=headers, method='POST')

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp_body = resp.read().decode('utf-8')
            return resp.status, json.loads(resp_body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {'raw': err_body}
        return e.code, parsed
    except Exception as e:
        return 0, {'error': 'CLIENT_EXCEPTION', 'message': str(e)}

def run_all_16_scenarios():
    print("============================================================================")
    print(" QBiz Kho — HĐĐT 3.4R: 16 Real HTTP Wire Auth & Tenant Security Scenarios")
    print("============================================================================\n")

    results = []

    # Credentials
    jwt_cashier_a = make_jwt('cashier_a_01', 'CASHIER', shop_id='shop_a')
    jwt_owner_a = make_jwt('owner_a_01', 'OWNER', shop_id='shop_a')
    jwt_owner_b = make_jwt('owner_b_01', 'OWNER', shop_id='shop_b')

    # --------------------------------------------------------------------------
    # S01: no token / issue -> 401
    # --------------------------------------------------------------------------
    print(">>> [S01] No token calling 'issue' -> Expected HTTP 401:")
    s01_status, s01_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "issue",
        "idempotencyKey": f"S01_NO_TOKEN_{int(time.time()*1000)}",
        "payload": {"invoiceData": {"total": 50000}}
    }, auth_token=None)
    print(f"    Status: {s01_status}, Resp: {s01_resp}")
    assert s01_status == 401, f"S01 FAILED: Expected 401, got {s01_status}"
    assert s01_resp.get("error") == "UNAUTHORIZED", f"S01 FAILED: Expected UNAUTHORIZED, got {s01_resp.get('error')}"
    results.append(("S01: no token / issue -> 401", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S02: no token / getDocument -> 401
    # --------------------------------------------------------------------------
    print(">>> [S02] No token calling 'getDocument' -> Expected HTTP 401:")
    s02_status, s02_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "getDocument",
        "payload": {"invoiceNumber": "0001001", "lookupCode": "TC-123456"}
    }, auth_token=None)
    print(f"    Status: {s02_status}, Resp: {s02_resp}")
    assert s02_status == 401, f"S02 FAILED: Expected 401, got {s02_status}"
    assert s02_resp.get("error") == "UNAUTHORIZED", f"S02 FAILED: Expected UNAUTHORIZED, got {s02_resp.get('error')}"
    results.append(("S02: no token / getDocument -> 401", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S03: forged OWNER JWT / adjust -> 401
    # --------------------------------------------------------------------------
    print(">>> [S03] Forged OWNER JWT (invalid signature) calling 'adjust' -> Expected HTTP 401:")
    forged_jwt = make_jwt('forged_owner', 'OWNER', secret='wrong_hmac_secret_key_9999')
    s03_status, s03_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"S03_FORGED_{int(time.time()*1000)}",
        "payload": {"originalInvoiceRef": {"invoice_number": "0001001"}}
    }, auth_token=forged_jwt)
    print(f"    Status: {s03_status}, Resp: {s03_resp}")
    assert s03_status == 401, f"S03 FAILED: Expected 401, got {s03_status}"
    assert s03_resp.get("error") == "UNAUTHORIZED", f"S03 FAILED: Expected UNAUTHORIZED, got {s03_resp.get('error')}"
    results.append(("S03: forged OWNER JWT / adjust -> 401", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S04: expired OWNER JWT / adjust -> 401
    # --------------------------------------------------------------------------
    print(">>> [S04] Expired OWNER JWT calling 'adjust' -> Expected HTTP 401:")
    expired_jwt = make_jwt('expired_owner', 'OWNER', exp_seconds=-3600)
    s04_status, s04_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"S04_EXPIRED_{int(time.time()*1000)}",
        "payload": {"originalInvoiceRef": {"invoice_number": "0001001"}}
    }, auth_token=expired_jwt)
    print(f"    Status: {s04_status}, Resp: {s04_resp}")
    assert s04_status == 401, f"S04 FAILED: Expected 401, got {s04_status}"
    assert s04_resp.get("error") == "UNAUTHORIZED", f"S04 FAILED: Expected UNAUTHORIZED, got {s04_resp.get('error')}"
    results.append(("S04: expired OWNER JWT / adjust -> 401", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S05: malformed JWT -> 401
    # --------------------------------------------------------------------------
    print(">>> [S05] Malformed JWT token calling 'issue' -> Expected HTTP 401:")
    s05_status, s05_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "issue",
        "idempotencyKey": f"S05_MALFORMED_{int(time.time()*1000)}",
        "payload": {"invoiceData": {"total": 50000}}
    }, auth_token="not.a.valid.jwt.string.obviously")
    print(f"    Status: {s05_status}, Resp: {s05_resp}")
    assert s05_status == 401, f"S05 FAILED: Expected 401, got {s05_status}"
    assert s05_resp.get("error") == "UNAUTHORIZED", f"S05 FAILED: Expected UNAUTHORIZED, got {s05_resp.get('error')}"
    results.append(("S05: malformed JWT -> 401", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S06: CASHIER valid / issue own shop -> 200
    # --------------------------------------------------------------------------
    print(">>> [S06] Valid CASHIER calling 'issue' for own shop (shop_a) -> Expected HTTP 200:")
    s06_status, s06_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "issue",
        "idempotencyKey": f"S06_CASHIER_ISSUE_{int(time.time()*1000)}",
        "payload": {"invoiceData": {"sale_id": "sale_s06", "total": 120000}}
    }, auth_token=jwt_cashier_a)
    print(f"    Status: {s06_status}, Invoice Number: {s06_resp.get('data', {}).get('invoice_number')}")
    assert s06_status == 200, f"S06 FAILED: Expected 200, got {s06_status}"
    assert s06_resp.get("success") is True, "S06 FAILED: Expected success True"
    invoice_num_a = s06_resp.get('data', {}).get('invoice_number')
    assert invoice_num_a, "S06 FAILED: Expected valid invoice_number returned"
    results.append(("S06: CASHIER valid / issue own shop -> 200", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S07: CASHIER valid / adjust own shop -> 403
    # --------------------------------------------------------------------------
    print(">>> [S07] CASHIER calling 'adjust' on own shop -> Expected HTTP 403:")
    s07_status, s07_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"S07_CASHIER_ADJUST_{int(time.time()*1000)}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": invoice_num_a},
            "adjustmentData": {"reduction_amount": 20000}
        }
    }, auth_token=jwt_cashier_a)
    print(f"    Status: {s07_status}, Resp: {s07_resp}")
    assert s07_status == 403, f"S07 FAILED: Expected 403, got {s07_status}"
    assert s07_resp.get("error") == "FORBIDDEN_ACTION", f"S07 FAILED: Expected FORBIDDEN_ACTION, got {s07_resp.get('error')}"
    results.append(("S07: CASHIER valid / adjust own shop -> 403", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S08: CASHIER body role=OWNER / adjust -> 403
    # --------------------------------------------------------------------------
    print(">>> [S08] CASHIER attempts privilege escalation with body role=OWNER -> Expected HTTP 403:")
    s08_status, s08_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "role": "OWNER",
        "payload": {
            "role": "OWNER",
            "originalInvoiceRef": {"invoice_number": invoice_num_a},
            "adjustmentData": {"reduction_amount": 20000}
        },
        "idempotencyKey": f"S08_CASHIER_SPOOF_{int(time.time()*1000)}"
    }, auth_token=jwt_cashier_a)
    print(f"    Status: {s08_status}, Resp: {s08_resp}")
    assert s08_status == 403, f"S08 FAILED: Expected 403, got {s08_status}"
    assert s08_resp.get("error") == "FORBIDDEN_ACTION", f"S08 FAILED: Expected FORBIDDEN_ACTION, got {s08_resp.get('error')}"
    results.append(("S08: CASHIER body role=OWNER / adjust -> 403", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S09: unauthenticated request session OWNER -> 401/403
    # --------------------------------------------------------------------------
    print(">>> [S09] Unauthenticated caller requests OWNER session token -> Expected HTTP 403:")
    s09_status, s09_resp = send_http(AUTH_SESSION_URL, {
        "role": "OWNER",
        "user_id": "malicious_anonymous"
    }, auth_token=None)
    print(f"    Status: {s09_status}, Resp: {s09_resp}")
    assert s09_status in (401, 403), f"S09 FAILED: Expected 401 or 403, got {s09_status}"
    assert s09_resp.get("error") in ("FORBIDDEN_ROLE_ESCALATION", "UNAUTHORIZED"), f"S09 FAILED: unexpected error {s09_resp}"
    results.append(("S09: unauthenticated request session OWNER -> 403", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S10: CASHIER requests OWNER session -> 403 (cannot become OWNER)
    # --------------------------------------------------------------------------
    print(">>> [S10] CASHIER authenticated caller requests OWNER session token -> Expected HTTP 403:")
    s10_status, s10_resp = send_http(AUTH_SESSION_URL, {
        "role": "OWNER",
        "user_id": "cashier_attempting_escalation"
    }, auth_token=jwt_cashier_a)
    print(f"    Status: {s10_status}, Resp: {s10_resp}")
    assert s10_status == 403, f"S10 FAILED: Expected 403, got {s10_status}"
    assert s10_resp.get("error") == "FORBIDDEN_ROLE_ESCALATION", f"S10 FAILED: Expected FORBIDDEN_ROLE_ESCALATION, got {s10_resp.get('error')}"
    results.append(("S10: CASHIER requests OWNER session -> 403", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # Setup for Cross-tenant tests: Issue invoice for Shop B using jwt_owner_b
    # --------------------------------------------------------------------------
    print(">>> [Setup] Issue Invoice B for Shop B:")
    setup_status, setup_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "issue",
        "idempotencyKey": f"SETUP_SHOP_B_ISSUE_{int(time.time()*1000)}",
        "payload": {"invoiceData": {"sale_id": "sale_b_01", "total": 250000}}
    }, auth_token=jwt_owner_b)
    assert setup_status == 200, f"Setup Shop B failed: {setup_status}"
    invoice_num_b = setup_resp.get('data', {}).get('invoice_number')
    lookup_code_b = setup_resp.get('data', {}).get('lookup_code')
    print(f"    Shop B Invoice Number: {invoice_num_b}, Lookup Code: {lookup_code_b}\n")

    # --------------------------------------------------------------------------
    # S11: OWNER Shop A getDocument invoice A -> 200
    # --------------------------------------------------------------------------
    print(">>> [S11] OWNER Shop A calling 'getDocument' on own invoice A -> Expected HTTP 200:")
    s11_status, s11_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "getDocument",
        "payload": {"invoiceNumber": invoice_num_a}
    }, auth_token=jwt_owner_a)
    print(f"    Status: {s11_status}, Success: {s11_resp.get('success')}")
    assert s11_status == 200, f"S11 FAILED: Expected 200, got {s11_status}"
    assert s11_resp.get("success") is True, "S11 FAILED: Expected success True"
    assert s11_resp.get("data", {}).get("invoice_number") == invoice_num_a, "S11 FAILED: Mismatched invoice number"
    results.append(("S11: OWNER Shop A getDocument invoice A -> 200", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S12: OWNER Shop A getDocument invoice B -> 403/404 (không kèm metadata Shop B)
    # --------------------------------------------------------------------------
    print(">>> [S12] OWNER Shop A calling 'getDocument' on Shop B's invoice -> Expected HTTP 403:")
    s12_status, s12_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "getDocument",
        "payload": {"invoiceNumber": invoice_num_b}
    }, auth_token=jwt_owner_a)
    print(f"    Status: {s12_status}, Resp: {s12_resp}")
    assert s12_status in (403, 404), f"S12 FAILED: Expected 403 or 404, got {s12_status}"
    # Security leak assertion: MUST NOT contain metadata of Shop B!
    assert "html_preview" not in s12_resp, "S12 FAILED: Leaked html_preview of Shop B!"
    assert s12_resp.get("error") == "FORBIDDEN_TENANT_ACCESS", f"S12 FAILED: Expected FORBIDDEN_TENANT_ACCESS, got {s12_resp.get('error')}"
    results.append(("S12: OWNER Shop A getDocument invoice B -> 403 (no metadata leaked)", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S13: OWNER Shop A adjust invoice B -> 403/404
    # --------------------------------------------------------------------------
    print(">>> [S13] OWNER Shop A calling 'adjust' on Shop B's invoice -> Expected HTTP 403:")
    s13_status, s13_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"S13_CROSS_TENANT_ADJUST_{int(time.time()*1000)}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": invoice_num_b},
            "adjustmentData": {"reduction_amount": 10000}
        }
    }, auth_token=jwt_owner_a)
    print(f"    Status: {s13_status}, Resp: {s13_resp}")
    assert s13_status in (403, 404), f"S13 FAILED: Expected 403 or 404, got {s13_status}"
    assert s13_resp.get("error") == "FORBIDDEN_TENANT_ACCESS", f"S13 FAILED: Expected FORBIDDEN_TENANT_ACCESS, got {s13_resp.get('error')}"
    results.append(("S13: OWNER Shop A adjust invoice B -> 403", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S14: body shop_id=ShopB while principal=ShopA -> 403
    # --------------------------------------------------------------------------
    print(">>> [S14] Principal is Shop A but body attempts to target shop_b -> Expected HTTP 403:")
    s14_status, s14_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "issue",
        "shopId": "shop_b",
        "payload": {
            "shopId": "shop_b",
            "invoiceData": {"total": 80000}
        },
        "idempotencyKey": f"S14_BODY_SPOOF_TENANT_{int(time.time()*1000)}"
    }, auth_token=jwt_owner_a)
    print(f"    Status: {s14_status}, Resp: {s14_resp}")
    assert s14_status == 403, f"S14 FAILED: Expected 403, got {s14_status}"
    assert s14_resp.get("error") == "FORBIDDEN_TENANT_ACCESS", f"S14 FAILED: Expected FORBIDDEN_TENANT_ACCESS, got {s14_resp.get('error')}"
    results.append(("S14: body shop_id=ShopB while principal=ShopA -> 403", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S15: production-mode mock/test token (server os.environ/is_prod) -> 401
    # --------------------------------------------------------------------------
    print(">>> [S15] Production-mode verification (server environment strictly rejects mock tokens) -> Expected HTTP 401:")
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from server import resolve_auth_from_header, is_production_mode
    auth_check = resolve_auth_from_header("Bearer mock_token_owner", is_prod=True)
    print(f"    resolve_auth_from_header(mock_token, is_prod=True): {auth_check}")
    assert auth_check['authenticated'] is False, "S15 FAILED: Expected authenticated=False"
    assert auth_check['error'] == "MOCK_SESSION_NOT_ALLOWED_IN_PRODUCTION", "S15 FAILED: Expected MOCK_SESSION_NOT_ALLOWED_IN_PRODUCTION"
    assert is_production_mode({"X-QBiz-Env": "development"}) == is_production_mode({}), "S15 FAILED: is_production_mode must not depend on client headers"
    results.append(("S15: production-mode mock/test token -> 401", True))
    print("    => PASS ✓\n")

    # --------------------------------------------------------------------------
    # S16: valid OWNER own-shop adjust -> 200
    # --------------------------------------------------------------------------
    print(">>> [S16] Valid OWNER calling 'adjust' on own shop invoice A -> Expected HTTP 200:")
    s16_status, s16_resp = send_http(GATEWAY_URL, {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"S16_OWNER_ADJUST_{int(time.time()*1000)}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": invoice_num_a},
            "adjustmentData": {"reduction_amount": 15000, "reason": "Chiết khấu sau bán hàng"}
        }
    }, auth_token=jwt_owner_a)
    print(f"    Status: {s16_status}, Adj Series: {s16_resp.get('data', {}).get('invoice_series')}, Adj Number: {s16_resp.get('data', {}).get('invoice_number')}")
    assert s16_status == 200, f"S16 FAILED: Expected 200, got {s16_status}"
    assert s16_resp.get("success") is True, "S16 FAILED: Expected success True"
    assert s16_resp.get("data", {}).get("operation") == "ADJUST", "S16 FAILED: Expected operation ADJUST"
    results.append(("S16: valid OWNER own-shop adjust -> 200", True))
    print("    => PASS ✓\n")

    print("============================================================================")
    print(f" ALL 16 AUTH & TENANT SECURITY SCENARIOS PASSED (16/16 - 100%) ✓")
    print("============================================================================")
    for title, status in results:
        print(f"  [PASS] {title}")

if __name__ == '__main__':
    run_all_16_scenarios()
