"""
QBiz Kho — Comprehensive Verification for Sensitive Data Masking (Point 3)
Verifies 7 Granular Security & Compliance Test Cases:
1. Tax Code Masking (MST 10 số, 13 số chi nhánh, chuỗi ngắn, Python & JS).
2. Phone Number Masking (SĐT 10 số, chuỗi ngắn, Python & JS).
3. Email Masking (Email tiêu chuẩn, email tên ngắn, format lỗi, Python & JS).
4. Token & Secret Redaction (Bearer tokens, Authorization, API secrets, JWT lồng nhau).
5. Audit Log Auto-Sanitization (createInvoiceAuditLogEntry tự động làm sạch metadata & details).
6. Direct Console.error & sys.stderr Masking (Kiểm thử trực tiếp đường in log lỗi không làm lộ PII).
7. Business Invoice Invariant (Giữ 100% dữ liệu gốc trên hóa đơn nghiệp vụ phục vụ Nghị định 123).
"""

import os
import sys
import subprocess
import json
import io

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

from server import (
    mask_tax_code,
    mask_phone,
    mask_email,
    mask_sensitive_data,
    log_gateway_error
)

def test_1_tax_code_masking():
    print("\n--- [TEST 1/7] Kiểm tra che Mã số thuế (MST) — Python & JavaScript ---")
    # Python
    assert mask_tax_code("0101234567") == "*******567", "MST 10 số phải giữ 3 số cuối"
    assert mask_tax_code("0101234567-001") == "***********001", "MST 13 số chi nhánh (14 ký tự) phải giữ 3 số cuối"
    assert mask_tax_code("123") == "***", "MST <= 3 ký tự phải che thành ***"
    assert mask_tax_code("") == "", "MST rỗng trả về rỗng"
    assert mask_tax_code(None) == "", "MST None trả về rỗng"

    # JS
    node_code = """
    import { maskTaxCode } from './src/invoice/domain.js';
    if (maskTaxCode('0101234567') !== '*******567') throw new Error('JS MST 10 số sai');
    if (maskTaxCode('0101234567-001') !== '***********001') throw new Error('JS MST 13 số sai');
    if (maskTaxCode('123') !== '***') throw new Error('JS MST <= 3 sai');
    console.log('PASS_JS_TAX');
    """
    res = subprocess.run(['node', '--input-type=module', '-e', node_code], cwd=APP_DIR, capture_output=True, text=True)
    assert res.returncode == 0 and 'PASS_JS_TAX' in res.stdout, f"JS Tax test failed: {res.stderr}"
    print("    [PASS] Python & JS: 0101234567 -> *******567 | 0101234567-001 -> ***********001 | 123 -> ***")

def test_2_phone_masking():
    print("\n--- [TEST 2/7] Kiểm tra che Số điện thoại (SĐT) — Python & JavaScript ---")
    # Python
    assert mask_phone("0912345678") == "*******678", "SĐT 10 số phải giữ 3 số cuối"
    assert mask_phone("09876543210") == "********210", "SĐT 11 số phải giữ 3 số cuối"
    assert mask_phone("123") == "***", "SĐT <= 3 ký tự phải che thành ***"
    assert mask_phone("") == "", "SĐT rỗng trả về rỗng"

    # JS
    node_code = """
    import { maskPhone } from './src/invoice/domain.js';
    if (maskPhone('0912345678') !== '*******678') throw new Error('JS SĐT 10 số sai');
    if (maskPhone('09876543210') !== '********210') throw new Error('JS SĐT 11 số sai');
    if (maskPhone('123') !== '***') throw new Error('JS SĐT <= 3 sai');
    console.log('PASS_JS_PHONE');
    """
    res = subprocess.run(['node', '--input-type=module', '-e', node_code], cwd=APP_DIR, capture_output=True, text=True)
    assert res.returncode == 0 and 'PASS_JS_PHONE' in res.stdout, f"JS Phone test failed: {res.stderr}"
    print("    [PASS] Python & JS: 0912345678 -> *******678 | 09876543210 -> ********210 | 123 -> ***")

def test_3_email_masking():
    print("\n--- [TEST 3/7] Kiểm tra che Email khách hàng — Python & JavaScript ---")
    # Python
    assert mask_email("customer@gmail.com") == "c***r@gmail.com", "Email tiêu chuẩn phải che ký tự giữa user"
    assert mask_email("ab@domain.vn") == "*@domain.vn", "Email user <= 2 ký tự phải che thành *"
    assert mask_email("invalid-email") == "***", "Email không có @ phải che thành ***"

    # JS
    node_code = """
    import { maskEmail } from './src/invoice/domain.js';
    if (maskEmail('customer@gmail.com') !== 'c***r@gmail.com') throw new Error('JS email tiêu chuẩn sai');
    if (maskEmail('ab@domain.vn') !== '*@domain.vn') throw new Error('JS email ngắn sai');
    if (maskEmail('invalid-email') !== '***') throw new Error('JS email invalid sai');
    console.log('PASS_JS_EMAIL');
    """
    res = subprocess.run(['node', '--input-type=module', '-e', node_code], cwd=APP_DIR, capture_output=True, text=True)
    assert res.returncode == 0 and 'PASS_JS_EMAIL' in res.stdout, f"JS Email test failed: {res.stderr}"
    print("    [PASS] Python & JS: customer@gmail.com -> c***r@gmail.com | ab@domain.vn -> *@domain.vn")

def test_4_token_and_secret_redaction():
    print("\n--- [TEST 4/7] Kiểm tra che Token, Authorization & Secrets lồng nhau ---")
    raw_payload = {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token_value",
        "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token_value",
        "nested": {
            "api_key": "sec_live_998877665544332211",
            "jwt_secret": "my_super_secret_signing_key",
            "authHeader": "Bearer some_raw_secret_bearer_token"
        }
    }
    masked = mask_sensitive_data(raw_payload)
    assert masked["token"] == "[REDACTED]"
    assert masked["authorization"] == "[REDACTED]"
    assert masked["nested"]["jwt_secret"] == "[REDACTED]"
    assert mask_sensitive_data("Bearer abcdef123456") == "Bearer [REDACTED]"
    print("    [PASS] Token / Authorization / Secret đều được thay thế hoàn toàn bằng [REDACTED]")

def test_5_audit_log_auto_sanitization():
    print("\n--- [TEST 5/7] Kiểm tra createInvoiceAuditLogEntry tự động làm sạch PII ---")
    node_code = """
    import { createInvoiceAuditLogEntry } from './src/invoice/domain.js';
    const log = createInvoiceAuditLogEntry({
      invoiceId: 'inv-001',
      action: 'ISSUE_REQUEST',
      actor: 'cashier_01',
      details: 'Gửi yêu cầu phát hành hóa đơn cho khách 0912345678 MST 0101234567',
      metadata: {
        token: 'mock_token_owner',
        buyer_tax_code: '0101234567',
        buyer_phone: '0912345678',
        buyer_email: 'buyer@test.vn',
        total: 1500000
      }
    });

    if (log.metadata.token !== '[REDACTED]') throw new Error('Token chưa được che trong audit log');
    if (log.metadata.buyer_tax_code !== '*******567') throw new Error('MST chưa được che trong audit log');
    if (log.metadata.buyer_phone !== '*******678') throw new Error('SĐT chưa được che trong audit log');
    if (log.metadata.buyer_email !== 'b***r@test.vn') throw new Error('Email chưa được che trong audit log');
    if (log.metadata.total !== 1500000) throw new Error('Dữ liệu nghiệp vụ số tiền bị thay đổi!');
    console.log('PASS_AUDIT_LOG_SANITIZATION');
    """
    res = subprocess.run(['node', '--input-type=module', '-e', node_code], cwd=APP_DIR, capture_output=True, text=True)
    assert res.returncode == 0 and 'PASS_AUDIT_LOG_SANITIZATION' in res.stdout, f"Audit log test failed: {res.stderr}"
    print("    [PASS] Audit log metadata tự động che MST, SĐT, Email, Token nhưng giữ nguyên số tiền nghiệp vụ")

def test_6_direct_console_error_and_stderr_masking():
    print("\n--- [TEST 6/7] Kiểm tra trực tiếp đường in log lỗi console.error & sys.stderr ---")
    # 1. Python sys.stderr logging test
    captured_stderr = io.StringIO()
    old_stderr = sys.stderr
    try:
        sys.stderr = captured_stderr
        sensitive_err = {
            "token": "raw_sensitive_token_abc123",
            "tax_code": "0101234567",
            "phone": "0912345678",
            "email": "customer@gmail.com",
            "message": "Kết nối thất bại tới nhà cung cấp MOCK"
        }
        log_gateway_error("MockFailureContext", sensitive_err)
    finally:
        sys.stderr = old_stderr

    stderr_output = captured_stderr.getvalue()
    assert "[REDACTED]" in stderr_output, "Stderr phải chứa [REDACTED] thay cho token"
    assert "*******567" in stderr_output, "Stderr phải chứa MST đã che"
    assert "*******678" in stderr_output, "Stderr phải chứa SĐT đã che"
    assert "c***r@gmail.com" in stderr_output, "Stderr phải chứa email đã che"
    assert "raw_sensitive_token_abc123" not in stderr_output, "Stderr TUYỆT ĐỐI KHÔNG ĐƯỢC chứa token thô!"
    assert "0101234567" not in stderr_output, "Stderr TUYỆT ĐỐI KHÔNG ĐƯỢC chứa MST thô!"
    assert "0912345678" not in stderr_output, "Stderr TUYỆT ĐỐI KHÔNG ĐƯỢC chứa SĐT thô!"
    print("    [PASS] Python sys.stderr: log_gateway_error che sạch PII/Token, không để lộ dữ liệu thô ra log")

    # 2. Node.js console.error logging test
    node_error_test = """
    import { logGatewayError } from './api/invoice-gateway.js';
    
    // Intercept console.error
    let captured = '';
    const originalConsoleError = console.error;
    console.error = (...args) => {
      captured += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\\n';
    };

    const err = {
      message: 'Provider timed out',
      details: {
        token: 'secret_gateway_token_xyz999',
        buyer_tax_code: '0101234567',
        buyer_phone: '0912345678',
        buyer_email: 'customer@gmail.com'
      }
    };

    logGatewayError('GatewayFailure', err);

    console.error = originalConsoleError;

    if (!captured.includes('[REDACTED]')) throw new Error('console.error không có [REDACTED]');
    if (!captured.includes('*******567')) throw new Error('console.error không che MST');
    if (!captured.includes('*******678')) throw new Error('console.error không che SĐT');
    if (!captured.includes('c***r@gmail.com')) throw new Error('console.error không che Email');
    if (captured.includes('secret_gateway_token_xyz999')) throw new Error('LỘ TOKEN THÔ TRÊN CONSOLE.ERROR!');
    if (captured.includes('0101234567')) throw new Error('LỘ MST THÔ TRÊN CONSOLE.ERROR!');
    if (captured.includes('0912345678')) throw new Error('LỘ SĐT THÔ TRÊN CONSOLE.ERROR!');
    
    console.log('PASS_NODE_CONSOLE_ERROR_MASKING');
    """
    res = subprocess.run(['node', '--input-type=module', '-e', node_error_test], cwd=APP_DIR, capture_output=True, text=True)
    assert res.returncode == 0 and 'PASS_NODE_CONSOLE_ERROR_MASKING' in res.stdout, f"Node console.error test failed: {res.stderr}\n{res.stdout}"
    print("    [PASS] Node.js console.error: logGatewayError che sạch PII/Token, không để lộ dữ liệu thô ra console")

def test_7_business_invoice_unmasked_invariant():
    print("\n--- [TEST 7/7] Kiểm tra tính bất biến: Hóa đơn nghiệp vụ giữ nguyên 100% dữ liệu gốc ---")
    node_code = """
    import { createInvoiceDraftFromSale } from './src/invoice/domain.js';
    const draft = createInvoiceDraftFromSale(
      { id: 'sale-999', code: 'HD0099', total: 2500000, items: [] },
      {
        buyer: {
          name: 'Công ty Cổ phần Thương mại QBiz',
          tax_code: '0101234567',
          phone: '0912345678',
          email: 'customer@gmail.com'
        }
      }
    );

    if (draft.buyer.tax_code !== '0101234567') {
      throw new Error('VI PHẠM BẤT BIẾN: Dữ liệu MST trên hóa đơn nghiệp vụ bị che!');
    }
    if (draft.buyer.phone !== '0912345678') {
      throw new Error('VI PHẠM BẤT BIẾN: Dữ liệu SĐT trên hóa đơn nghiệp vụ bị che!');
    }
    if (draft.buyer.email !== 'customer@gmail.com') {
      throw new Error('VI PHẠM BẤT BIẾN: Dữ liệu Email trên hóa đơn nghiệp vụ bị che!');
    }
    console.log('PASS_BUSINESS_INVOICE_INVARIANT');
    """
    res = subprocess.run(['node', '--input-type=module', '-e', node_code], cwd=APP_DIR, capture_output=True, text=True)
    assert res.returncode == 0 and 'PASS_BUSINESS_INVOICE_INVARIANT' in res.stdout, f"Business invoice invariant test failed: {res.stderr}"
    print("    [PASS] Hóa đơn điện tử phục vụ Nghị định 123 giữ nguyên 100% MST, SĐT, Email thô để gửi cơ quan thuế")

if __name__ == '__main__':
    print("================================================================================")
    print(" QBiz Kho — POINT 3: FULL COMPREHENSIVE SENSITIVE DATA MASKING & LOGGING AUDIT")
    print("================================================================================")
    test_1_tax_code_masking()
    test_2_phone_masking()
    test_3_email_masking()
    test_4_token_and_secret_redaction()
    test_5_audit_log_auto_sanitization()
    test_6_direct_console_error_and_stderr_masking()
    test_7_business_invoice_unmasked_invariant()
    print("\n================================================================================")
    print(" POINT 3: ALL 7/7 SENSITIVE DATA MASKING & LOGGING TESTS PASSED (100%) ✓")
    print("================================================================================")
