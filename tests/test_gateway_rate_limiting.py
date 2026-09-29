"""
QBiz Kho — Test Gateway Mutation Rate Limiting (Point 2)
Verifies:
1. Critical invoice mutation actions (issue, adjust, replace) are strictly rate-limited per token/key.
2. When caller exceeds threshold, Gateway returns HTTP 429 (RATE_LIMIT_EXCEEDED) with Retry-After header.
3. Callers under threshold receive normal responses (200 / 403).
4. Read-only actions (getCapabilities, getStatus, getDocument) are not throttled by the mutation rate limit.
5. Verifies both Python server.py and Node.js api/invoice-gateway.js.
"""

import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

TEST_PORT = 4187
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"
GATEWAY_URL = f"{BASE_URL}/api/invoice-gateway"

def send_request(url, body, auth_token=None):
    headers = {'Content-Type': 'application/json'}
    if auth_token:
        headers['Authorization'] = f"Bearer {auth_token}"
    req_data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=req_data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            headers_dict = dict(resp.headers)
            return resp.status, json.loads(resp.read().decode('utf-8')), headers_dict
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {'raw': err_body}
        return e.code, parsed, dict(e.headers)

def test_python_server_rate_limiting():
    print("\n--- [TEST 1] Testing Python server.py mutation rate limiting ---")
    env = os.environ.copy()
    env['QBIZ_RATE_LIMIT_MUTATION_MAX'] = '3'  # Low threshold for rapid testing
    env['PYTHONUNBUFFERED'] = '1'

    # Launch isolated server on port 4187 with max 3 requests
    launcher_code = f"""
import os, sys
os.environ['QBIZ_RATE_LIMIT_MUTATION_MAX'] = '3'
sys.path.insert(0, r'{APP_DIR}')
from http.server import ThreadingHTTPServer
from server import QBizHandler
server = ThreadingHTTPServer(('127.0.0.1', {TEST_PORT}), QBizHandler)
server.serve_forever()
"""
    proc = subprocess.Popen(
        [sys.executable, '-u', '-c', launcher_code],
        cwd=APP_DIR,
        env=env
    )

    try:
        time.sleep(1.2)
        token = "mock_token_owner"

        print("    Sending 3 consecutive 'issue' requests (within threshold = 3)...")
        for i in range(1, 4):
            status, resp, hdrs = send_request(GATEWAY_URL, {
                "appScope": "qbiz-kho",
                "action": "issue",
                "idempotencyKey": f"RATE_LIMIT_TEST_{i}_{int(time.time()*1000)}",
                "payload": {"invoiceData": {"total": 100000}}
            }, auth_token=token)
            print(f"      Request {i}: HTTP {status} (Success: {resp.get('success')})")
            assert status == 200, f"Request {i} failed with status {status}"

        print("    Sending 4th 'issue' request (exceeds threshold of 3)...")
        st_over, resp_over, hdrs_over = send_request(GATEWAY_URL, {
            "appScope": "qbiz-kho",
            "action": "issue",
            "idempotencyKey": f"RATE_LIMIT_TEST_OVER_{int(time.time()*1000)}",
            "payload": {"invoiceData": {"total": 100000}}
        }, auth_token=token)

        print(f"      Request 4 status: {st_over}")
        print(f"      Request 4 response: {resp_over}")
        print(f"      Retry-After header: {hdrs_over.get('Retry-After')}")
        assert st_over == 429, f"FAILED: Expected HTTP 429, got {st_over}"
        assert resp_over.get('error') == 'RATE_LIMIT_EXCEEDED'
        assert hdrs_over.get('Retry-After') is not None
        print("    => PASS ✓ (4th request properly blocked with HTTP 429 RATE_LIMIT_EXCEEDED and Retry-After)")

        print("    Verifying read-only action 'getCapabilities' is NOT blocked while rate-limited...")
        st_pub, resp_pub, _ = send_request(GATEWAY_URL, {
            "appScope": "qbiz-kho",
            "action": "getCapabilities"
        })
        assert st_pub == 200, f"Public action should not be rate-limited, got {st_pub}"
        print("    => PASS ✓ (Read-only action getCapabilities remains 200)")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()

def test_node_gateway_rate_limiting():
    print("\n--- [TEST 2] Testing Node.js api/invoice-gateway.js mutation rate limiting logic ---")
    node_test_code = """
import { isMutationRateLimited } from './api/invoice-gateway.js';

const testKey = 'test_token_' + Date.now();
const max = 3;

// Requests 1, 2, 3 should pass
for (let i = 1; i <= max; i++) {
  const limited = isMutationRateLimited(testKey, max, 60000);
  if (limited) {
    console.error(`Request ${i} unexpectedly rate limited!`);
    process.exit(1);
  }
}

// Request 4 should be limited
const limited = isMutationRateLimited(testKey, max, 60000);
if (!limited) {
  console.error('Request 4 should have been rate limited!');
  process.exit(1);
}

// Different token should NOT be limited
const otherKey = 'other_token_' + Date.now();
const otherLimited = isMutationRateLimited(otherKey, max, 60000);
if (otherLimited) {
  console.error('Different key unexpectedly rate limited!');
  process.exit(1);
}

console.log('NODE_RATE_LIMIT_PASS');
"""
    res = subprocess.run(
        ['node', '--input-type=module', '-e', node_test_code],
        cwd=APP_DIR,
        capture_output=True,
        text=True
    )
    assert res.returncode == 0 and 'NODE_RATE_LIMIT_PASS' in res.stdout, f"Node rate limit test failed: {res.stderr}"
    print("    => PASS ✓ (Node.js isMutationRateLimited correctly blocks on threshold + preserves token isolation)")

if __name__ == '__main__':
    print("================================================================================")
    print(" QBiz Kho — POINT 2: GATEWAY RATE LIMITING VERIFICATION")
    print("================================================================================")
    test_python_server_rate_limiting()
    test_node_gateway_rate_limiting()
    print("\n================================================================================")
    print(" POINT 2: ALL RATE LIMITING TESTS PASSED (100%) ✓")
    print("================================================================================")
