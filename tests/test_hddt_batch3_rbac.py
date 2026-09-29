"""
QBiz Kho — HĐĐT Module Batch 3: Server-Side RBAC Verification
Spec Requirement Step 3.4:
- Invariant 1: Server extracts identity/role strictly from Authorization header (Bearer token / JWT).
- Invariant 2: Server NEVER trusts client-declared role in body (e.g. {"role": "admin"} is ignored).
- Invariant 3: Cashier calling ADJUST or REPLACE receives HTTP 403 Forbidden (NOT 200, NOT 500).
- Invariant 4: Cashier calling ISSUE receives HTTP 200 OK.
- Invariant 5: Owner / Manager calling ADJUST receives HTTP 200 OK.
"""

import sys
import io
import json
import base64
import time
import urllib.request
import urllib.error

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

GATEWAY_URL = 'http://localhost:4180/api/invoice-gateway'

import os
import hmac
import hashlib
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

GATEWAY_JWT_SECRET = os.environ.get('QBIZ_JWT_SECRET') or os.environ.get('QBIZ_INVOICE_JWT_SECRET') or 'qbiz_dynamic_test_secret_ephemeral'

def create_mock_jwt(user_id, role, email="user@qbiz.vn", secret=None):
    if secret is None:
        secret = GATEWAY_JWT_SECRET
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "shop_role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600
    }
    
    def b64url(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode('utf-8')).decode('utf-8').rstrip('=')
    
    msg = f"{b64url(header)}.{b64url(payload)}".encode('utf-8')
    sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).digest()
    ).decode('utf-8').rstrip('=')
    return f"{b64url(header)}.{b64url(payload)}.{sig}"

def http_post_gateway(body, auth_token=None):
    headers = {
        'Content-Type': 'application/json'
    }
    if auth_token:
        headers['Authorization'] = f"Bearer {auth_token}" if not auth_token.startswith('Bearer ') else auth_token

    req_data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(GATEWAY_URL, data=req_data, headers=headers, method='POST')

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp_body = resp.read().decode('utf-8')
            return resp.status, json.loads(resp_body)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = err_body
        return e.code, parsed
    except Exception as e:
        return 0, str(e)

def run_rbac_tests():
    print("======================================================================")
    print(" QBiz Kho — HĐĐT Step 3.4: Server-Side RBAC Hard Verification")
    print("======================================================================\n")

    test_results = []

    # -------------------------------------------------------------------------
    # TEST 1: Cashier Identity calls 'adjust' -> MUST be HTTP 403 Forbidden
    # -------------------------------------------------------------------------
    print(">>> [Test 1] Cashier session gọi action 'adjust' qua Gateway:")
    body1 = {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"ADJUST:test_rbac_001:v2_{int(time.time())}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": "0001001"},
            "adjustmentData": {"reduction_amount": 50000}
        }
    }
    status1, resp1 = http_post_gateway(body1, auth_token="mock_token_cashier")
    print(f"    HTTP Status: {status1}")
    print(f"    Response Body: {json.dumps(resp1, ensure_ascii=False)}")
    
    assert status1 == 403, f"ASSERTION FAILED: Expected HTTP 403, got {status1}"
    assert resp1.get("error") == "FORBIDDEN_ACTION", f"ASSERTION FAILED: Expected FORBIDDEN_ACTION error, got {resp1.get('error')}"
    assert "CASHIER" in resp1.get("message", ""), "ASSERTION FAILED: Error message must mention CASHIER role"
    print("    => PASS ✓ (HTTP 403 Forbidden correctly returned for Cashier)\n")
    test_results.append(("Test 1: Cashier adjust -> 403", True))

    # -------------------------------------------------------------------------
    # TEST 2: Cashier attempts Privilege Escalation via body {"role": "admin"}
    # Invariant: Server MUST NOT trust client-declared role in body!
    # -------------------------------------------------------------------------
    print(">>> [Test 2] Cashier cố tình gửi body chứa role='admin' để leo quyền gọi 'adjust':")
    body2 = {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "role": "admin",             # Spoofed role in body root
        "payload": {
            "role": "OWNER",          # Spoofed role in payload
            "originalInvoiceRef": {"invoice_number": "0001001"},
            "adjustmentData": {"reduction_amount": 50000}
        },
        "idempotencyKey": f"ADJUST:test_rbac_spoof:v2_{int(time.time())}"
    }
    status2, resp2 = http_post_gateway(body2, auth_token="mock_token_cashier")
    print(f"    HTTP Status: {status2}")
    print(f"    Response Body: {json.dumps(resp2, ensure_ascii=False)}")
    
    assert status2 == 403, f"SECURITY BREACH: Server trusted body role! Got status {status2}"
    assert resp2.get("error") == "FORBIDDEN_ACTION", f"Expected FORBIDDEN_ACTION, got {resp2.get('error')}"
    print("    => PASS ✓ (Privilege escalation blocked! Server ignored body role and returned 403)\n")
    test_results.append(("Test 2: Cashier spoof role in body -> 403", True))

    # -------------------------------------------------------------------------
    # TEST 3: Cashier Identity calls 'replace' -> MUST be HTTP 403 Forbidden
    # -------------------------------------------------------------------------
    print(">>> [Test 3] Cashier session gọi action 'replace' qua Gateway:")
    body3 = {
        "appScope": "qbiz-kho",
        "action": "replace",
        "idempotencyKey": f"REPLACE:test_rbac_001:v2_{int(time.time())}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": "0001001"},
            "replacementData": {"new_amount": 900000}
        }
    }
    status3, resp3 = http_post_gateway(body3, auth_token="mock_token_cashier")
    print(f"    HTTP Status: {status3}")
    print(f"    Response Body: {json.dumps(resp3, ensure_ascii=False)}")
    
    assert status3 == 403, f"ASSERTION FAILED: Expected HTTP 403, got {status3}"
    assert resp3.get("error") == "FORBIDDEN_ACTION", f"Expected FORBIDDEN_ACTION, got {resp3.get('error')}"
    print("    => PASS ✓ (HTTP 403 Forbidden correctly returned for Cashier on replace)\n")
    test_results.append(("Test 3: Cashier replace -> 403", True))

    # -------------------------------------------------------------------------
    # TEST 4: Cashier Identity calls 'issue' -> Cashier HAS permission -> HTTP 200
    # -------------------------------------------------------------------------
    print(">>> [Test 4] Cashier session gọi action 'issue' (nghiệp vụ thu ngân được phép):")
    body4 = {
        "appScope": "qbiz-kho",
        "action": "issue",
        "idempotencyKey": f"ISSUE:test_rbac_cashier:v1_{int(time.time())}",
        "payload": {
            "invoiceData": {
                "sale_id": "sale_rbac_c01",
                "sale_code": "PB-RBAC-C01",
                "customer": "Khách lẻ test RBAC",
                "total": 150000
            }
        }
    }
    status4, resp4 = http_post_gateway(body4, auth_token="mock_token_cashier")
    print(f"    HTTP Status: {status4}")
    print(f"    Response Success: {resp4.get('success')}")
    print(f"    Issued Invoice Number: {resp4.get('data', {}).get('invoice_number')}")
    
    assert status4 == 200, f"ASSERTION FAILED: Cashier must be permitted to issue, got {status4}"
    assert resp4.get("success") is True, "ASSERTION FAILED: Issue response success must be True"
    print("    => PASS ✓ (HTTP 200 OK returned for Cashier on issue)\n")
    test_results.append(("Test 4: Cashier issue -> 200", True))

    # -------------------------------------------------------------------------
    # TEST 5: Owner / Manager Identity calls 'adjust' -> Authorized -> HTTP 200
    # -------------------------------------------------------------------------
    print(">>> [Test 5] Owner / Manager session gọi action 'adjust' qua Gateway:")
    body5 = {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"ADJUST:test_rbac_owner:v2_{int(time.time())}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": "0001001"},
            "adjustmentData": {"reduction_amount": 100000, "reason": "Chiết khấu bổ sung"}
        }
    }
    status5, resp5 = http_post_gateway(body5, auth_token="mock_token_owner")
    print(f"    HTTP Status: {status5}")
    print(f"    Response Success: {resp5.get('success')}")
    print(f"    Adjustment Series: {resp5.get('data', {}).get('invoice_series')}")
    print(f"    Adjustment Number: {resp5.get('data', {}).get('invoice_number')}")
    
    assert status5 == 200, f"ASSERTION FAILED: Owner must be permitted to adjust, got {status5}"
    assert resp5.get("success") is True, "ASSERTION FAILED: Adjustment success must be True"
    print("    => PASS ✓ (HTTP 200 OK returned for Owner on adjust)\n")
    test_results.append(("Test 5: Owner adjust -> 200", True))

    # -------------------------------------------------------------------------
    # TEST 6: Real JWT Token with Cashier claims calling 'adjust' -> HTTP 403
    # -------------------------------------------------------------------------
    print(">>> [Test 6] JWT Token chuẩn (Payload Base64 role='CASHIER') gọi 'adjust':")
    jwt_cashier = create_mock_jwt(user_id="user_cashier_01", role="CASHIER", email="cashier01@qbiz.vn")
    body6 = {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"ADJUST:test_rbac_jwt_c:v2_{int(time.time())}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": "0001001"},
            "adjustmentData": {"reduction_amount": 30000}
        }
    }
    status6, resp6 = http_post_gateway(body6, auth_token=jwt_cashier)
    print(f"    HTTP Status: {status6}")
    print(f"    Response Body: {json.dumps(resp6, ensure_ascii=False)}")
    
    assert status6 == 403, f"ASSERTION FAILED: JWT Cashier expected HTTP 403, got {status6}"
    assert resp6.get("error") == "FORBIDDEN_ACTION", f"Expected FORBIDDEN_ACTION, got {resp6.get('error')}"
    print("    => PASS ✓ (JWT Token role 'CASHIER' properly decoded and rejected with 403)\n")
    test_results.append(("Test 6: JWT Cashier adjust -> 403", True))

    # -------------------------------------------------------------------------
    # TEST 7: Real JWT Token with Owner claims calling 'adjust' -> HTTP 200
    # -------------------------------------------------------------------------
    print(">>> [Test 7] JWT Token chuẩn (Payload Base64 role='OWNER') gọi 'adjust':")
    jwt_owner = create_mock_jwt(user_id="user_owner_01", role="OWNER", email="owner@qbiz.vn")
    body7 = {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"ADJUST:test_rbac_jwt_o:v2_{int(time.time())}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": "0001001"},
            "adjustmentData": {"reduction_amount": 50000}
        }
    }
    status7, resp7 = http_post_gateway(body7, auth_token=jwt_owner)
    print(f"    HTTP Status: {status7}")
    print(f"    Response Success: {resp7.get('success')}")
    print(f"    Adjustment Number: {resp7.get('data', {}).get('invoice_number')}")
    
    assert status7 == 200, f"ASSERTION FAILED: JWT Owner expected HTTP 200, got {status7}"
    assert resp7.get("success") is True, "ASSERTION FAILED: Expected success True"
    print("    => PASS ✓ (JWT Token role 'OWNER' properly decoded and authorized with 200)\n")
    test_results.append(("Test 7: JWT Owner adjust -> 200", True))

    print("======================================================================")
    print(" ALL 7 RBAC SECURITY & AUTHORIZATION TESTS PASSED (100%) ✓")
    print("======================================================================")

if __name__ == '__main__':
    run_rbac_tests()
