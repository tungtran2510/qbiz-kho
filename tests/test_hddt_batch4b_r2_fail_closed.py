"""
QBiz Kho — HĐĐT Batch 4B-R2: Production Fail-Closed & Provider Truth Test Suite
Conforms to Specification "QBiz Kho - HĐĐT BATCH 4B-R2 — FAIL-CLOSED PROVIDER & MISA CAPABILITY TRUTH"

Scenarios Tested:
  F01: Production + QBIZ_INVOICE_PROVIDER missing
       => No Mock; Fail Closed (INVOICE_PROVIDER_NOT_CONFIGURED, 500)
  F02: Production + QBIZ_INVOICE_PROVIDER=MOCK_QBIZ_EINVOICE
       => Reject / Fail Closed (MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION, 500)
  F03: Production + QBIZ_INVOICE_PROVIDER=MISA_MEINVOICE + missing credentials
       => AUTH/CONFIG error (MISSING_MISA_CREDENTIALS, 401); Zero Mock Fallback
  F04: Development/Test + explicit MOCK
       => Mock allowed per test policy

Metrics Verified:
  PRODUCTION_IMPLICIT_MOCK_COUNT = 0
  PRODUCTION_EXPLICIT_MOCK_ACCEPTED_COUNT = 0
  PRODUCTION_MISSING_PROVIDER_FAIL_CLOSED = YES
  MISA_CREDENTIAL_FAILURE_MOCK_FALLBACK_COUNT = 0
"""

import sys
import os
import subprocess
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 1. TEST PYTHON SERVER LOGIC (server.py)
import server

def test_python_f01_production_missing_provider():
    print("Testing F01 (Python): Production + missing QBIZ_INVOICE_PROVIDER...")
    old_env = os.environ.get('QBIZ_INVOICE_PROVIDER')
    try:
        if 'QBIZ_INVOICE_PROVIDER' in os.environ:
            del os.environ['QBIZ_INVOICE_PROVIDER']
        provider, err = server.resolve_active_invoice_provider(is_prod=True)
        assert provider is None, f"Expected None provider, got {provider}"
        assert err == 'INVOICE_PROVIDER_NOT_CONFIGURED', f"Expected INVOICE_PROVIDER_NOT_CONFIGURED, got {err}"
        print("  [PASS] F01 (Python): Missing provider in production strictly fails closed.")
    finally:
        if old_env is not None:
            os.environ['QBIZ_INVOICE_PROVIDER'] = old_env

def test_python_f02_production_mock_forbidden():
    print("\nTesting F02 (Python): Production + explicit MOCK_QBIZ_EINVOICE...")
    old_env = os.environ.get('QBIZ_INVOICE_PROVIDER')
    try:
        os.environ['QBIZ_INVOICE_PROVIDER'] = 'MOCK_QBIZ_EINVOICE'
        provider, err = server.resolve_active_invoice_provider(is_prod=True)
        assert provider is None, f"Expected None provider, got {provider}"
        assert err == 'MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION', f"Expected MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION, got {err}"
        print("  [PASS] F02 (Python): Explicit mock provider in production strictly rejected.")
    finally:
        if old_env is not None:
            os.environ['QBIZ_INVOICE_PROVIDER'] = old_env
        elif 'QBIZ_INVOICE_PROVIDER' in os.environ:
            del os.environ['QBIZ_INVOICE_PROVIDER']

def test_python_f03_production_misa_missing_creds_no_mock():
    print("\nTesting F03 (Python): Production + MISA + missing creds...")
    old_env = os.environ.get('QBIZ_INVOICE_PROVIDER')
    try:
        os.environ['QBIZ_INVOICE_PROVIDER'] = 'MISA_MEINVOICE'
        provider, err = server.resolve_active_invoice_provider(is_prod=True)
        assert provider == 'MISA_MEINVOICE', f"Expected MISA_MEINVOICE, got {provider}"
        assert err is None
        
        # When action executed without credentials, must fail with MISSING_MISA_CREDENTIALS, never fallback to Mock
        res = server.process_mock_invoice_action('issue', 'TEST-KEY-001', payload={'invoiceData': {}}, user_auth={'authenticated': True, 'role': 'OWNER', 'shop_id': 'shop_a'}, active_provider=provider)
        assert res.get('error') == 'AUTH_ERROR', f"Expected AUTH_ERROR, got {res.get('error')}"
        assert res.get('rawCode') == 'MISSING_MISA_CREDENTIALS', f"Expected MISSING_MISA_CREDENTIALS, got {res.get('rawCode')}"
        assert res.get('status_code') == 401
        print("  [PASS] F03 (Python): MISA credential error returns 401 AUTH_ERROR cleanly without Mock fallback.")
    finally:
        if old_env is not None:
            os.environ['QBIZ_INVOICE_PROVIDER'] = old_env
        elif 'QBIZ_INVOICE_PROVIDER' in os.environ:
            del os.environ['QBIZ_INVOICE_PROVIDER']

def test_python_f04_dev_test_mock_allowed():
    print("\nTesting F04 (Python): Development/Test + explicit or default MOCK...")
    old_env = os.environ.get('QBIZ_INVOICE_PROVIDER')
    try:
        if 'QBIZ_INVOICE_PROVIDER' in os.environ:
            del os.environ['QBIZ_INVOICE_PROVIDER']
        provider, err = server.resolve_active_invoice_provider(is_prod=False)
        assert provider == 'MOCK_QBIZ_EINVOICE', f"Expected MOCK_QBIZ_EINVOICE, got {provider}"
        assert err is None
        print("  [PASS] F04 (Python): Mock provider permitted in development/test.")
    finally:
        if old_env is not None:
            os.environ['QBIZ_INVOICE_PROVIDER'] = old_env

# 2. TEST NODE.JS GATEWAY LOGIC (api/invoice-gateway.js)
def test_node_f01_to_f04():
    print("\n--- Testing Node.js Gateway Fail-Closed Invariants (api/invoice-gateway.js) ---")
    script = """
    import { getActiveInvoiceProvider, isProductionMode } from './api/invoice-gateway.js';
    import assert from 'assert';

    // F01: Production + missing QBIZ_INVOICE_PROVIDER
    process.env.NODE_ENV = 'production';
    delete process.env.QBIZ_INVOICE_PROVIDER;
    delete process.env.VERCEL_ENV;
    delete process.env.QBIZ_ENV;

    assert.strictEqual(isProductionMode(), true);

    let f01Passed = false;
    try {
      getActiveInvoiceProvider();
    } catch (err) {
      assert.strictEqual(err.code, 'INVOICE_PROVIDER_NOT_CONFIGURED');
      assert.strictEqual(err.httpStatus, 500);
      f01Passed = true;
    }
    assert.strictEqual(f01Passed, true, 'F01 Node: Missing provider in production must throw INVOICE_PROVIDER_NOT_CONFIGURED');
    console.log('  [PASS] F01 (Node.js): Production missing provider strictly fails closed.');

    // F02: Production + explicit MOCK_QBIZ_EINVOICE
    process.env.QBIZ_INVOICE_PROVIDER = 'MOCK_QBIZ_EINVOICE';
    let f02Passed = false;
    try {
      getActiveInvoiceProvider();
    } catch (err) {
      assert.strictEqual(err.code, 'MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION');
      assert.strictEqual(err.httpStatus, 500);
      f02Passed = true;
    }
    assert.strictEqual(f02Passed, true, 'F02 Node: Mock provider in production must throw MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION');
    console.log('  [PASS] F02 (Node.js): Explicit mock provider in production strictly rejected.');

    // F03: Production + MISA + missing credentials
    process.env.QBIZ_INVOICE_PROVIDER = 'MISA_MEINVOICE';
    delete process.env.MISA_APP_ID;
    delete process.env.MISA_TAX_CODE;
    delete process.env.MISA_USERNAME;
    delete process.env.MISA_PASSWORD;

    const misaProvider = getActiveInvoiceProvider();
    assert.strictEqual(misaProvider.capabilities.provider_code, 'MISA_MEINVOICE');
    let f03Passed = false;
    try {
      await misaProvider.issue({ invoiceData: { id: 'INV-1' }, idempotencyKey: 'IDEMP-1' });
    } catch (err) {
      assert.strictEqual(err.errorCode, 'AUTH_ERROR');
      assert.strictEqual(err.rawCode, 'MISSING_MISA_CREDENTIALS');
      assert.strictEqual(err.httpStatus, 401);
      f03Passed = true;
    }
    assert.strictEqual(f03Passed, true, 'F03 Node: Missing MISA creds must throw AUTH_ERROR without Mock fallback');
    console.log('  [PASS] F03 (Node.js): Missing credentials strictly throw AUTH_ERROR without Mock fallback.');

    // F04: Development/test mode allows Mock
    process.env.NODE_ENV = 'development';
    delete process.env.QBIZ_INVOICE_PROVIDER;
    const devProvider = getActiveInvoiceProvider();
    assert.strictEqual(devProvider.capabilities.provider_code, 'MOCK_QBIZ_EINVOICE');
    console.log('  [PASS] F04 (Node.js): Development allows default mock provider.');
    """
    cmd = ['node', '--input-type=module', '-e', script]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if res.returncode != 0:
        print("Node test stderr:", res.stderr)
        assert False, f"Node tests failed with code {res.returncode}"
    print(res.stdout)

if __name__ == '__main__':
    print("=== QBiz Kho: HĐĐT Batch 4B-R2 Fail-Closed Test Suite ===\n")
    test_python_f01_production_missing_provider()
    test_python_f02_production_mock_forbidden()
    test_python_f03_production_misa_missing_creds_no_mock()
    test_python_f04_dev_test_mock_allowed()
    test_node_f01_to_f04()
    
    print("="*60)
    print("PRODUCTION_MISSING_PROVIDER_FAIL_CLOSED = YES")
    print("PRODUCTION_IMPLICIT_MOCK_COUNT = 0")
    print("PRODUCTION_EXPLICIT_MOCK_ACCEPTED_COUNT = 0")
    print("MISA_CREDENTIAL_FAILURE_MOCK_FALLBACK_COUNT = 0")
    print("="*60)
    print("\n=== ALL BATCH 4B-R2 FAIL-CLOSED TESTS PASSED ===")
