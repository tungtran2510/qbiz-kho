"""
QBIZ KHO PRODUCTION V1 — GATE 2 STEP 0: REAL-CLOUD RLS PROOF
Spec: CMD_20260925_GATE2_INITIAL_MIGRATION_CATALOG_SYNC.txt

Verifies live on real Supabase Cloud (xewvtdprfsxsvdayrcvi):
1. User registration & authentication for OWNER_A, CASHIER_A, OWNER_B
2. SHOP_A and SHOP_B creation
3. Membership assignment with role invariants
4. Cross-shop isolation:
   - OWNER_A cannot read/write SHOP_B
   - OWNER_B cannot access SHOP_A
   - CASHIER_A cannot perform owner/admin actions
   - Disabled membership denied
   - Anonymous private data denied
"""

import sys
import time
import json
import urllib.request
import urllib.error
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

APP_DIR = Path(__file__).resolve().parent.parent

def load_env():
    env = {}
    env_file = APP_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

ENV = load_env()
URL = ENV.get("VITE_SUPABASE_URL", "https://ofcooslacddbizlykobh.supabase.co").rstrip("/")
ANON_KEY = ENV.get("VITE_SUPABASE_ANON_KEY", "")

def auth_signup(email, password):
    # Try RPC create_confirmed_user first (avoids SMTP rate limits)
    url_rpc = f"{URL}/rest/v1/rpc/create_confirmed_user"
    data = json.dumps({"p_email": email, "p_password": password}).encode("utf-8")
    req = urllib.request.Request(
        url_rpc,
        data=data,
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            user_id = json.loads(resp.read().decode("utf-8"))
            user, token = auth_login(email, password)
            return user, token
    except Exception as e:
        # Fallback to standard /auth/v1/signup
        pass

    url = f"{URL}/auth/v1/signup"
    data = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            user = body.get("user") or body
            token = body.get("access_token") or (body.get("session") or {}).get("access_token")
            return user, token
    except urllib.error.HTTPError as e:
        if e.code in (400, 422):
            return auth_login(email, password)
        raise

def auth_login(email, password):
    url = f"{URL}/auth/v1/token?grant_type=password"
    data = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode("utf-8"))
        user = body.get("user")
        token = body.get("access_token")
        return user, token

def rest_call(endpoint, method="GET", token=None, body=None, prefer="return=representation"):
    url = f"{URL}/rest/v1/{endpoint}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token or ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="ignore")
        return e.code, json.loads(raw) if raw.startswith("{") or raw.startswith("[") else raw

def run_proof():
    print("=================================================================")
    print("  QBIZ KHO GATE 2 STEP 0: REAL SUPABASE AUTH & RLS PROOF")
    print(f"  Target: {URL}")
    print("=================================================================\n")

    timestamp = int(time.time())
    pwd = f"QBizKhoPass!{timestamp}"

    # 1. Anonymous Access Denied to Private Data
    print("1. Testing Anonymous Access Denied...")
    status, res = rest_call("shops?select=*")
    assert status == 200 and len(res) == 0, f"Anonymous should see 0 shops, got: {res}"
    status, res = rest_call("products?select=*")
    assert status == 200 and len(res) == 0, f"Anonymous should see 0 products, got: {res}"
    print("   [PASS] Anonymous sees 0 private rows (Protected by RLS).")

    # 2. Register OWNER_A, CASHIER_A, OWNER_B
    print("\n2. Provisioning Test Cloud Users...")
    owner_a_email = f"owner_a_{timestamp}@qbiztest.vn"
    cashier_a_email = f"cashier_a_{timestamp}@qbiztest.vn"
    owner_b_email = f"owner_b_{timestamp}@qbiztest.vn"

    user_a, token_a = auth_signup(owner_a_email, pwd)
    print(f"   [PASS] OWNER_A registered ({user_a['id']})")

    user_ca, token_ca = auth_signup(cashier_a_email, pwd)
    print(f"   [PASS] CASHIER_A registered ({user_ca['id']})")

    user_b, token_b = auth_signup(owner_b_email, pwd)
    print(f"   [PASS] OWNER_B registered ({user_b['id']})")

    # 3. Create SHOP_A by OWNER_A
    print("\n3. Creating SHOP_A and Membership...")
    status, shop_a = rest_call("shops", method="POST", token=token_a, body={
        "name": f"Shop A Test {timestamp}",
        "code": f"SHOPA_{timestamp}",
        "owner_user_id": user_a["id"]
    })
    assert status in (200, 201), f"Failed to create SHOP_A: {shop_a}"
    shop_a_id = shop_a[0]["id"]
    print(f"   [PASS] SHOP_A created: {shop_a_id}")

    # Add OWNER_A membership
    status, mem_a = rest_call("memberships", method="POST", token=token_a, body={
        "shop_id": shop_a_id,
        "user_id": user_a["id"],
        "role": "OWNER",
        "status": "ACTIVE"
    })
    assert status in (200, 201), f"Failed to add membership: {mem_a}"
    print(f"   [PASS] OWNER_A active membership assigned.")

    # 4. Create SHOP_B by OWNER_B
    print("\n4. Creating SHOP_B and Membership...")
    status, shop_b = rest_call("shops", method="POST", token=token_b, body={
        "name": f"Shop B Test {timestamp}",
        "code": f"SHOPB_{timestamp}",
        "owner_user_id": user_b["id"]
    })
    assert status in (200, 201), f"Failed to create SHOP_B: {shop_b}"
    shop_b_id = shop_b[0]["id"]
    print(f"   [PASS] SHOP_B created: {shop_b_id}")

    status, mem_b = rest_call("memberships", method="POST", token=token_b, body={
        "shop_id": shop_b_id,
        "user_id": user_b["id"],
        "role": "OWNER",
        "status": "ACTIVE"
    })
    assert status in (200, 201), f"Failed to add membership: {mem_b}"
    print(f"   [PASS] OWNER_B active membership assigned.")

    # 5. Add CASHIER_A to SHOP_A
    print("\n5. Adding CASHIER_A to SHOP_A...")
    status, mem_ca = rest_call("memberships", method="POST", token=token_a, body={
        "shop_id": shop_a_id,
        "user_id": user_ca["id"],
        "role": "CASHIER",
        "status": "ACTIVE"
    })
    assert status in (200, 201), f"Failed to add cashier: {mem_ca}"
    print(f"   [PASS] CASHIER_A membership in SHOP_A created.")

    # 6. Verify Cross-Shop Isolation
    print("\n6. Verifying Cross-Shop RLS Invariants...")
    # OWNER_A attempts to read SHOP_B
    status, rows = rest_call(f"shops?id=eq.{shop_b_id}", method="GET", token=token_a)
    assert status == 200 and len(rows) == 0, f"Cross-shop read breach! OWNER_A saw SHOP_B: {rows}"
    print("   [PASS] OWNER_A cannot read SHOP_B (Cross-shop read denied).")

    # OWNER_A attempts to create product in SHOP_B
    status, res = rest_call("products", method="POST", token=token_a, body={
        "shop_id": shop_b_id,
        "name": "Hacked Product",
        "price": 1000
    })
    # Must fail or return 0 inserted due to RLS with check
    assert status in (400, 401, 403, 404, 409) or (isinstance(res, list) and len(res) == 0), f"Cross-shop write breach! {res}"
    print("   [PASS] OWNER_A cannot write to SHOP_B (Cross-shop write denied).")

    # OWNER_B attempts to read SHOP_A
    status, rows = rest_call(f"shops?id=eq.{shop_a_id}", method="GET", token=token_b)
    assert status == 200 and len(rows) == 0, f"Cross-shop read breach! OWNER_B saw SHOP_A: {rows}"
    print("   [PASS] OWNER_B cannot access SHOP_A.")

    # 7. CASHIER_A cannot perform owner-only action (e.g. update shop ownership or add members)
    print("\n7. Verifying Role Enforcement (CASHIER_A cannot manage memberships)...")
    status, res = rest_call("memberships", method="POST", token=token_ca, body={
        "shop_id": shop_a_id,
        "user_id": user_b["id"],
        "role": "MANAGER",
        "status": "ACTIVE"
    })
    assert status in (400, 401, 403, 404, 409) or (isinstance(res, list) and len(res) == 0), f"Role forgery breach! CASHIER_A managed membership: {res}"
    print("   [PASS] CASHIER_A denied owner-only action (Role enforcement verified).")

    # 8. Disabled Membership Denied
    print("\n8. Verifying Disabled Membership Invariant...")
    # OWNER_A disables CASHIER_A
    status, res = rest_call(f"memberships?shop_id=eq.{shop_a_id}&user_id=eq.{user_ca['id']}", method="PATCH", token=token_a, body={
        "status": "DISABLED"
    })
    assert status in (200, 204), f"Failed to disable CASHIER_A: {res}"

    # Create warehouse in SHOP_A by OWNER_A
    status, wh = rest_call("warehouses", method="POST", token=token_a, body={
        "shop_id": shop_a_id,
        "name": "Kho A"
    })
    assert status in (200, 201), f"Failed to create warehouse: {wh}"
    
    # Disabled CASHIER_A tries to read warehouses in SHOP_A
    status, rows = rest_call(f"warehouses?shop_id=eq.{shop_a_id}", method="GET", token=token_ca)
    assert status == 200 and len(rows) == 0, f"Disabled member breach! Saw: {rows}"
    print("   [PASS] Disabled member access denied.")

    print("\n=================================================================")
    print("  ALL GATE 1 REAL-CLOUD RLS PROOF INVARIANTS PASSED (100% OK)")
    print("=================================================================")
    return True

if __name__ == "__main__":
    success = run_proof()
    sys.exit(0 if success else 1)
