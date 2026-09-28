import urllib.request
import hashlib
import json
import os

ASSETS = [
    "src/app.js",
    "src/ai/skills.js",
    "src/ai/router.js",
    "src/ai/ui.js",
    "src/ai/vietnamese-nlp.js",
    "src/ai/tools.js",
    "src/ai/context.js",
    "src/ai/proposals.js",
    "src/ai/policy.js",
    "src/ai/merchandising/facts.js",
    "src/ai/merchandising/explanations.js",
    "src/ai/merchandising/tools.js"
]

HOST_PRIMARY = "https://qbiz-kho.vercel.app"
HOST_BACKUP = "https://qbiz-kho.netlify.app"

def get_hash(data):
    return hashlib.sha256(data).hexdigest()

def fetch_url(url):
    req = urllib.request.Request(url, headers={"User-Agent": "DualHostVerifier/1.0", "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                return resp.read()
            return None
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def main():
    print("============================================================")
    print("SECTION 9: DUAL-HOST CHANGED ASSET PARITY MATRIX")
    print("============================================================")

    matrix = []
    mismatch_count = 0
    stale_primary = 0
    stale_backup = 0

    for path in ASSETS:
        # 1. Local
        local_path = os.path.join(".", path)
        local_bytes = None
        local_hash = None
        if os.path.exists(local_path):
            with open(local_path, "rb") as f:
                local_bytes = f.read()
            local_hash = get_hash(local_bytes)

        # 2. Primary Vercel
        url_p = f"{HOST_PRIMARY}/{path}"
        bytes_p = fetch_url(url_p)
        hash_p = get_hash(bytes_p) if bytes_p else "NOT_FOUND"

        # 3. Backup Netlify
        url_b = f"{HOST_BACKUP}/{path}"
        bytes_b = fetch_url(url_b)
        hash_b = get_hash(bytes_b) if bytes_b else "NOT_FOUND"

        match_pb = (hash_p == hash_b and hash_p != "NOT_FOUND")
        match_local = (hash_p == local_hash and hash_b == local_hash)

        if not match_pb:
            mismatch_count += 1
        if hash_p != local_hash:
            stale_primary += 1
        if hash_b != local_hash:
            stale_backup += 1

        matrix.append({
            "asset": path,
            "local_len": len(local_bytes) if local_bytes else 0,
            "local_hash": local_hash[:16] if local_hash else "NONE",
            "primary_len": len(bytes_p) if bytes_p else 0,
            "primary_hash": hash_p[:16] if hash_p else "NONE",
            "backup_len": len(bytes_b) if bytes_b else 0,
            "backup_hash": hash_b[:16] if hash_b else "NONE",
            "match_primary_backup": match_pb,
            "match_local_git": match_local
        })

        print(f"{path:<26} | Local: {len(local_bytes) if local_bytes else 0:>7}b ({local_hash[:10]}) | Vercel: {len(bytes_p) if bytes_p else 0:>7}b ({hash_p[:10]}) | Netlify: {len(bytes_b) if bytes_b else 0:>7}b ({hash_b[:10]}) | MATCH: {match_pb}")

    print("------------------------------------------------------------")
    print(f"STALE_PRIMARY_ASSET_COUNT:    {stale_primary}")
    print(f"STALE_BACKUP_ASSET_COUNT:     {stale_backup}")
    print(f"CHANGED_ASSET_PARITY_MISMATCH: {mismatch_count}")
    print(f"OVERALL ASSET PARITY:          {'PASS (100% MATCH)' if mismatch_count == 0 and stale_primary == 0 and stale_backup == 0 else 'FAIL'}")

    with open("tests/dual_host_asset_matrix.json", "w", encoding="utf-8") as f:
        json.dump(matrix, f, indent=2)

if __name__ == "__main__":
    main()
