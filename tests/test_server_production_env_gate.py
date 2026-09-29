"""
QBiz Kho — Empirical Verification of Server-Side Production Mode Gate
Ensures:
1. Production mode is SOLELY determined by server environment variables (os.environ / process.env).
2. Client headers (like X-QBiz-Env) are NEVER trusted or checked.
3. When server is in production mode:
   - Request WITHOUT X-QBiz-Env header -> mock token REJECTED with 401.
   - Request with spoofed X-QBiz-Env: development header -> mock token STILL REJECTED with 401.
   - Genuine cryptographic JWT with valid signature -> ACCEPTED with 200.
"""

import sys
import os
import json
import time
import subprocess
import urllib.request
import urllib.error
import base64
import hmac
import hashlib
import secrets

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

TEST_PORT = 4185
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"
GATEWAY_URL = f"{BASE_URL}/api/invoice-gateway"
SESSION_URL = f"{BASE_URL}/api/auth/session"
SECRET = f"test_prod_secret_{secrets.token_hex(16)}"

def make_jwt(user_id, role, shop_id='shop_a'):
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "email": f"{user_id}@qbiz.vn",
        "role": role,
        "shop_role": role,
        "shop_id": shop_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600
    }
    def b64url(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode('utf-8')).decode('utf-8').rstrip('=')
    msg = f"{b64url(header)}.{b64url(payload)}".encode('utf-8')
    sig = base64.urlsafe_b64encode(
        hmac.new(SECRET.encode('utf-8'), msg, hashlib.sha256).digest()
    ).decode('utf-8').rstrip('=')
    return f"{b64url(header)}.{b64url(payload)}.{sig}"

def send_request(url, body, auth_token=None, extra_headers=None):
    headers = {'Content-Type': 'application/json'}
    if auth_token:
        headers['Authorization'] = f"Bearer {auth_token}"
    if extra_headers:
        headers.update(extra_headers)
    req_data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=req_data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {'raw': err_body}
        return e.code, parsed

def run_test():
    print("================================================================================")
    print(" PHÉP THỬ XÁC THỰC SERVER-SIDE PRODUCTION MODE (ZERO TRUST CLIENT HEADERS)")
    print("================================================================================\n")

    # Start an isolated server instance with QBIZ_ENV='production' on port 4185
    cur_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    server_py = os.path.join(cur_dir, 'server.py')

    env = os.environ.copy()
    env['QBIZ_ENV'] = 'production'
    env['PYTHONUNBUFFERED'] = '1'
    env['PYTHONIOENCODING'] = 'utf-8'

    launcher_code = f"""
import os, sys
os.environ['QBIZ_ENV'] = 'production'
os.environ['QBIZ_JWT_SECRET'] = '{SECRET}'
sys.path.insert(0, r'{cur_dir}')
from http.server import ThreadingHTTPServer
from server import QBizHandler
server = ThreadingHTTPServer(('127.0.0.1', {TEST_PORT}), QBizHandler)
print('PROD_SERVER_STARTED')
sys.stdout.flush()
server.serve_forever()
"""
    proc = subprocess.Popen(
        [sys.executable, '-u', '-c', launcher_code],
        cwd=cur_dir,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    try:
        # Wait for server to boot
        time.sleep(1.2)
        print(f"[1] Server đang thực sự chạy ở chế độ PRODUCTION (os.environ['QBIZ_ENV'] = 'production') trên cổng {TEST_PORT}.")

        # ----------------------------------------------------------------------
        # TEST CASE 1: Client gửi request KHÔNG CÓ header X-QBiz-Env
        # ----------------------------------------------------------------------
        print("\n--- TEST CASE 1: Client gửi request KHÔNG CÓ header X-QBiz-Env, dùng mock token ---")
        st1, r1 = send_request(GATEWAY_URL, {
            "appScope": "qbiz-kho",
            "action": "issue",
            "idempotencyKey": f"PROD_TEST_NO_HEADER_{int(time.time()*1000)}",
            "payload": {"invoiceData": {"total": 100000}}
        }, auth_token="mock_token_owner", extra_headers=None)
        print(f"    HTTP Status trả về: {st1}")
        print(f"    Response Body: {json.dumps(r1, ensure_ascii=False)}")
        assert st1 == 401, f"TEST 1 THẤT BẠI: Phải trả về 401, thực tế: {st1}"
        assert r1.get("error") == "UNAUTHORIZED", f"TEST 1 THẤT BẠI: Phải là UNAUTHORIZED"
        assert "MOCK_SESSION_NOT_ALLOWED_IN_PRODUCTION" in r1.get("message", "")
        print("    => PASS ✓ (Server tự biết đang ở production từ os.environ, mock token bị từ chối 401)")

        # ----------------------------------------------------------------------
        # TEST CASE 2: Client cố tình giả mạo header X-QBiz-Env: development
        # ----------------------------------------------------------------------
        print("\n--- TEST CASE 2: Client cố tình set 'X-QBiz-Env: development' nhằm lừa server ---")
        st2, r2 = send_request(GATEWAY_URL, {
            "appScope": "qbiz-kho",
            "action": "issue",
            "idempotencyKey": f"PROD_TEST_SPOOF_DEV_{int(time.time()*1000)}",
            "payload": {"invoiceData": {"total": 100000}}
        }, auth_token="mock_token_owner", extra_headers={"X-QBiz-Env": "development"})
        print(f"    HTTP Status trả về: {st2}")
        print(f"    Response Body: {json.dumps(r2, ensure_ascii=False)}")
        assert st2 == 401, f"LỖ HỔNG BẢO MẬT: Server tin header client! Trả về {st2}"
        assert r2.get("error") == "UNAUTHORIZED"
        assert "MOCK_SESSION_NOT_ALLOWED_IN_PRODUCTION" in r2.get("message", "")
        print("    => PASS ✓ (Giả mạo bị vô hiệu hóa! Server KHÔNG TIN header client, mock token vẫn bị từ chối 401)")

        # ----------------------------------------------------------------------
        # TEST CASE 3: Client xin cấp session tại /api/auth/session trong production
        # ----------------------------------------------------------------------
        print("\n--- TEST CASE 3: Client gọi /api/auth/session khi server ở production ---")
        st3, r3 = send_request(SESSION_URL, {"role": "CASHIER"})
        print(f"    HTTP Status trả về: {st3}")
        print(f"    Response Body: {json.dumps(r3, ensure_ascii=False)}")
        assert st3 == 401, f"TEST 3 THẤT BẠI: Cấp session dev phải bị chặn ở production, thực tế: {st3}"
        print("    => PASS ✓ (/api/auth/session tự động bị khóa trong production)")

        # ----------------------------------------------------------------------
        # TEST CASE 4: Token JWT thật được ký bằng server secret trong production
        # ----------------------------------------------------------------------
        print("\n--- TEST CASE 4: Gửi JWT thật ký bằng HMAC-SHA256 trong production ---")
        real_jwt = make_jwt('real_prod_owner', 'OWNER')
        st4, r4 = send_request(GATEWAY_URL, {
            "appScope": "qbiz-kho",
            "action": "issue",
            "idempotencyKey": f"PROD_TEST_REAL_JWT_{int(time.time()*1000)}",
            "payload": {"invoiceData": {"total": 500000}}
        }, auth_token=real_jwt)
        print(f"    HTTP Status trả về: {st4}")
        print(f"    Số hóa đơn phát hành: {r4.get('data', {}).get('invoice_number')}")
        assert st4 == 200, f"TEST 4 THẤT BẠI: JWT hợp lệ phải được chấp nhận, thực tế: {st4}"
        assert r4.get("success") is True
        print("    => PASS ✓ (Hóa đơn phát hành thành công 200 với JWT thật trong production)")

        print("\n================================================================================")
        print(" TẤT CẢ 4/4 PHÉP KIỂM BẢO MẬT PRODUCTION ĐỀU ĐẠT CHUẨN 100% ✓")
        print(" KHÔNG CÒN BẤT KỲ SỰ PHỤ THUỘC NÀO VÀO CLIENT HEADER!")
        print("================================================================================")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    run_test()
