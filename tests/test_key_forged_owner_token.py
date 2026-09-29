"""
QBiz Kho — HĐĐT Key Security Test:
Dùng một token/payload role=OWNER TỰ CHẾ (không phải token server thật sự cấp) gửi lên Gateway gọi action='adjust'.
Nếu cơ chế bảo mật hoạt động đúng: Kết quả BẮT BUỘC phải là 401/403 (từ chối), KHÔNG ĐƯỢC là 200.
"""

import sys
import io
import json
import base64
import time
import urllib.request
import urllib.error

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

GATEWAY_URL = 'http://localhost:4180/api/invoice-gateway'

def test_forged_owner_token():
    print("======================================================================")
    print(" QBiz Kho — PHÉP KIỂM BẢO MẬT: TOKEN role=OWNER TỰ CHẾ GỌI ACTION='adjust'")
    print("======================================================================\n")

    # 1. Kẻ tấn công tự chế 1 JWT payload có role=OWNER với chữ ký bịa đặt (không có server secret)
    def b64url(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode('utf-8')).decode('utf-8').rstrip('=')

    fake_header = {"alg": "HS256", "typ": "JWT"}
    fake_payload = {
        "sub": "attacker_id_999",
        "email": "attacker@evil.com",
        "role": "OWNER",           # Tự chế quyền OWNER
        "shop_role": "OWNER",      # Tự chế quyền OWNER
        "iat": int(time.time()),
        "exp": int(time.time()) + 7200
    }
    forged_token = f"{b64url(fake_header)}.{b64url(fake_payload)}.fake_attacker_signature_999"

    print(f"Token tự chế gửi lên Gateway:\n{forged_token}\n")
    print(f"Payload tự xưng quyền:\n{json.dumps(fake_payload, indent=2)}\n")

    # 2. Gửi request gọi action='adjust' (hành động nguy hiểm yêu cầu quyền INVOICE_ADJUST)
    body = {
        "appScope": "qbiz-kho",
        "action": "adjust",
        "idempotencyKey": f"ADJUST:exploit_attempt_{int(time.time())}",
        "payload": {
            "originalInvoiceRef": {"invoice_number": "0001001"},
            "adjustmentData": {"reduction_amount": 500000, "reason": "Tấn công leo quyền"}
        }
    }

    req_data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(
        GATEWAY_URL,
        data=req_data,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {forged_token}'
        },
        method='POST'
    )

    status_code = None
    resp_body = None

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            status_code = resp.status
            resp_body = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        status_code = e.code
        err_content = e.read().decode('utf-8')
        try:
            resp_body = json.loads(err_content)
        except Exception:
            resp_body = err_content
    except Exception as e:
        print(f"Lỗi kết nối: {e}")
        sys.exit(1)

    print("----------------------------------------------------------------------")
    print(f"HTTP STATUS TRẢ VỀ: {status_code}")
    print(f"RESPONSE BODY: {json.dumps(resp_body, ensure_ascii=False, indent=2)}")
    print("----------------------------------------------------------------------\n")

    # 3. Assert cứng: BẮT BUỘC phải là 401 hoặc 403, TUYỆT ĐỐI KHÔNG ĐƯỢC LÀ 200
    assert status_code != 200, f"NGHIÊM TRỌNG: Server trả về 200 OK chấp nhận token tự chế! Lỗ hổng bảo mật chưa được vá!"
    assert status_code in (401, 403), f"Thất bại: Kỳ vọng HTTP 401 hoặc 403, nhận được {status_code}"
    
    print(f"✓ KẾT QUẢ: Token tự chế đã bị Gateway TỪ CHỐI với mã lỗi HTTP {status_code} ({resp_body.get('error')})!")
    print(f"✓ Thông điệp bảo vệ: {resp_body.get('message')}")
    print("======================================================================")
    print(" TEST PASS: INVARIANT REJECT_FORGED_TOKEN = TRUE")
    print("======================================================================")

if __name__ == '__main__':
    test_forged_owner_token()
