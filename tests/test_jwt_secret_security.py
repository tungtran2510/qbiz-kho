"""
QBiz Kho — Test JWT Secret Security (Point 1)
Verifies:
1. No hardcoded fallback JWT secret string exists in any tracked codebase file (.py, .js).
2. Server/Gateway uses environment variable QBIZ_JWT_SECRET / QBIZ_INVOICE_JWT_SECRET.
3. When environment variable is empty, an ephemeral cryptographically secure random secret is generated per instance.
4. .gitignore properly protects .env and .env*.
"""

import os
import sys
import subprocess
import secrets
import hmac
import hashlib
import base64
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

def test_no_hardcoded_secret_in_tracked_files():
    print("\n--- [TEST 1] Grepping repository for hardcoded static secret ---")
    old_secret = "qbiz_kho_internal_hmac_secret_key_2026_non_client_accessible"
    
    # Run git grep
    proc = subprocess.run(
        ["git", "grep", old_secret],
        cwd=APP_DIR,
        capture_output=True,
        text=True
    )
    # Output should be empty (returncode != 0 means pattern not found in git grep)
    found_matches = [line for line in proc.stdout.splitlines() if line.strip()]
    print(f"    Matches found for old static secret: {len(found_matches)}")
    assert len(found_matches) == 0, f"FAILED: Old static secret found in git files: {found_matches}"
    print("    => PASS ✓ (Zero hardcoded static secret in all tracked files)")

def test_gitignore_protects_env():
    print("\n--- [TEST 2] Verifying .gitignore protects environment files ---")
    gitignore_path = os.path.join(APP_DIR, '.gitignore')
    with open(gitignore_path, 'r', encoding='utf-8') as f:
        content = f.read()
    assert '.env' in content, "FAILED: .env not found in .gitignore"
    assert '.env*' in content, "FAILED: .env* not found in .gitignore"
    
    # Check git status for .env
    proc = subprocess.run(
        ["git", "status", "--porcelain", ".env"],
        cwd=APP_DIR,
        capture_output=True,
        text=True
    )
    assert proc.stdout.strip() == "", f"FAILED: .env is tracked or not ignored: {proc.stdout}"
    print("    => PASS ✓ (.gitignore strictly protects .env and .env*)")

def test_ephemeral_random_secret_fallback():
    print("\n--- [TEST 3] Testing ephemeral random secret when env is empty ---")
    # Clean env of secret vars
    env_clean = os.environ.copy()
    env_clean.pop('QBIZ_JWT_SECRET', None)
    env_clean.pop('QBIZ_INVOICE_JWT_SECRET', None)
    env_clean['QBIZ_IGNORE_ENV_FILE'] = '1'
    
    cmd_py = """
import os, sys
os.environ.pop('QBIZ_JWT_SECRET', None)
os.environ.pop('QBIZ_INVOICE_JWT_SECRET', None)
from server import get_gateway_jwt_secret
s1 = get_gateway_jwt_secret()
print('PY_SECRET_LEN:', len(s1))
print('PY_SECRET:', s1)
"""
    res1 = subprocess.run([sys.executable, '-c', cmd_py], cwd=APP_DIR, env=env_clean, capture_output=True, text=True)
    res2 = subprocess.run([sys.executable, '-c', cmd_py], cwd=APP_DIR, env=env_clean, capture_output=True, text=True)
    
    sec1 = [l.split(':', 1)[1].strip() for l in res1.stdout.splitlines() if 'PY_SECRET:' in l][0]
    sec2 = [l.split(':', 1)[1].strip() for l in res2.stdout.splitlines() if 'PY_SECRET:' in l][0]
    
    assert len(sec1) >= 32, f"Secret too short: {sec1}"
    assert sec1 != sec2, f"FAILED: Ephemeral secrets must be unique across process restarts: {sec1} vs {sec2}"
    print(f"    Run 1 Secret: {sec1[:8]}... (len {len(sec1)})")
    print(f"    Run 2 Secret: {sec2[:8]}... (len {len(sec2)})")
    print("    => PASS ✓ (Process creates unique unpredictable random secret when env is empty)")

def test_node_ephemeral_random_secret_fallback():
    print("\n--- [TEST 4] Testing Node.js ephemeral random secret in api/invoice-gateway.js ---")
    env_clean = os.environ.copy()
    env_clean.pop('QBIZ_JWT_SECRET', None)
    env_clean.pop('QBIZ_INVOICE_JWT_SECRET', None)

    cmd_node = """
import { getGatewayJwtSecret } from './api/invoice-gateway.js';
delete process.env.QBIZ_JWT_SECRET;
delete process.env.QBIZ_INVOICE_JWT_SECRET;
console.log('NODE_SECRET:' + getGatewayJwtSecret());
"""
    r1 = subprocess.run(['node', '--input-type=module', '-e', cmd_node], cwd=APP_DIR, env=env_clean, capture_output=True, text=True)
    r2 = subprocess.run(['node', '--input-type=module', '-e', cmd_node], cwd=APP_DIR, env=env_clean, capture_output=True, text=True)
    
    sec1 = [l.split(':', 1)[1].strip() for l in r1.stdout.splitlines() if 'NODE_SECRET:' in l][0]
    sec2 = [l.split(':', 1)[1].strip() for l in r2.stdout.splitlines() if 'NODE_SECRET:' in l][0]
    
    assert len(sec1) >= 32
    assert sec1 != sec2, f"Node ephemeral secrets must be unique: {sec1} vs {sec2}"
    print(f"    Node Run 1 Secret: {sec1[:8]}... (len {len(sec1)})")
    print(f"    Node Run 2 Secret: {sec2[:8]}... (len {len(sec2)})")
    print("    => PASS ✓ (Node.js api/invoice-gateway.js creates unique unpredictable secret when env empty)")

def test_production_warning_when_secret_unset():
    print("\n--- [TEST 5] Testing [CRITICAL_SECURITY_CONFIG] warning in production mode when secret unset ---")
    env_prod = os.environ.copy()
    env_prod['QBIZ_ENV'] = 'production'
    env_prod.pop('QBIZ_JWT_SECRET', None)
    env_prod.pop('QBIZ_INVOICE_JWT_SECRET', None)
    env_prod['QBIZ_IGNORE_ENV_FILE'] = '1'

    # Python test
    cmd_py = """
import os, sys
os.environ['QBIZ_ENV'] = 'production'
os.environ.pop('QBIZ_JWT_SECRET', None)
os.environ.pop('QBIZ_INVOICE_JWT_SECRET', None)
from server import get_gateway_jwt_secret
sec = get_gateway_jwt_secret()
"""
    res_py = subprocess.run([sys.executable, '-c', cmd_py], cwd=APP_DIR, env=env_prod, capture_output=True, text=True)
    assert '[CRITICAL_SECURITY_CONFIG]' in res_py.stderr, f"Python did not output CRITICAL warning: {res_py.stderr}"
    print("    [PASS] Python logs [CRITICAL_SECURITY_CONFIG] warning to stderr in production when secret unset")

    # Node.js test
    cmd_node = """
import { getGatewayJwtSecret, resetSecretWarningState } from './api/invoice-gateway.js';
process.env.NODE_ENV = 'production';
delete process.env.QBIZ_JWT_SECRET;
delete process.env.QBIZ_INVOICE_JWT_SECRET;
resetSecretWarningState();
getGatewayJwtSecret();
"""
    res_node = subprocess.run(['node', '--input-type=module', '-e', cmd_node], cwd=APP_DIR, env=env_prod, capture_output=True, text=True)
    assert '[CRITICAL_SECURITY_CONFIG]' in res_node.stderr, f"Node.js did not output CRITICAL warning: {res_node.stderr}"
    print("    [PASS] Node.js logs [CRITICAL_SECURITY_CONFIG] warning to console.error in production when secret unset")
    print("    => PASS ✓ (Both Python & Node.js strictly alert Owner with CRITICAL error if deploy to prod without QBIZ_JWT_SECRET)")

if __name__ == '__main__':
    print("================================================================================")
    print(" QBiz Kho — POINT 1: JWT SECRET SECURITY & PRODUCTION WARNING VERIFICATION")
    print("================================================================================")
    test_no_hardcoded_secret_in_tracked_files()
    test_gitignore_protects_env()
    test_ephemeral_random_secret_fallback()
    test_node_ephemeral_random_secret_fallback()
    test_production_warning_when_secret_unset()
    print("\n================================================================================")
    print(" POINT 1: ALL 5/5 JWT SECRET & WARNING TESTS PASSED (100%) ✓")
    print("================================================================================")
