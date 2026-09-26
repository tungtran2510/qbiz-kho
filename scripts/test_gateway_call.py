import urllib.request, urllib.error, json, time, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SECRET = 'qb_gw_sec_2026_kho_ai'
BASE = 'http://127.0.0.1:4188'

print('--- Test 1: GET /health without token ---')
try:
    urllib.request.urlopen(BASE + '/health')
    print('FAIL: Expected 401')
except urllib.error.HTTPError as e:
    print(f'PASS: Received HTTP {e.code}')

print('--- Test 2: GET /health with token ---')
req = urllib.request.Request(BASE + '/health', headers={'X-QBiz-Gateway-Token': SECRET})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print('PASS: Health status:', data.get('status'), '| Ollama available:', data.get('ollama', {}).get('target_model_available'))

print('--- Test 3: POST /api/local-ai with forged scope ---')
req = urllib.request.Request(
    BASE + '/api/local-ai',
    data=json.dumps({'prompt': 'xem kho', 'appScope': 'qbiz-connect'}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'X-QBiz-Gateway-Token': SECRET}
)
try:
    urllib.request.urlopen(req)
    print('FAIL: Expected 403')
except urllib.error.HTTPError as e:
    print(f'PASS: Received HTTP {e.code}')

print('--- Test 4: POST /api/local-ai with valid prompt ---')
t0 = time.time()
req = urllib.request.Request(
    BASE + '/api/local-ai',
    data=json.dumps({'prompt': 'xem mặt hàng nào gần hết', 'appScope': 'qbiz-kho'}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'X-QBiz-Gateway-Token': SECRET}
)
try:
    with urllib.request.urlopen(req, timeout=35) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        dur = round(time.time() - t0, 2)
        print(f'PASS: Local AI result in {dur}s | Success: {data.get("success")} | Provider: {data.get("provider")} | Tool: {data.get("structuredResult", {}).get("tool")} | Trace: {data.get("compactTrace")}')
except urllib.error.HTTPError as e:
    err_body = e.read().decode('utf-8', errors='replace')
    print(f'FAIL: HTTP {e.code}: {err_body}')
