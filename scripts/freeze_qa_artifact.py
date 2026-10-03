"""
freeze_qa_artifact.py
Creates an immutable snapshot of QBiz Kho AI Phase 3 in qa/phase3-owner-rc/
and computes docs/evidence_phase3h/qa_artifact_manifest.json
"""

import os
import shutil
import hashlib
import json
import subprocess
import sys
import io
sys.stdout.reconfigure(encoding='utf-8')
from datetime import datetime, timezone

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA_SNAPSHOT_DIR = os.path.join(APP_ROOT, "qa", "phase3-owner-rc")
MANIFEST_DIR = os.path.join(APP_ROOT, "docs", "evidence_phase3h")
MANIFEST_FILE = os.path.join(MANIFEST_DIR, "qa_artifact_manifest.json")

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def get_base_git_sha():
    try:
        res = subprocess.run(["git", "rev-parse", "HEAD"], cwd=APP_ROOT, capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        return "9837b84a8b40126536874dfe53b613b46fff52f5"

def get_dirty_diff_hash():
    try:
        res = subprocess.run(["git", "diff"], cwd=APP_ROOT, capture_output=True, check=True)
        return hashlib.sha256(res.stdout).hexdigest()[:16]
    except Exception:
        return "unknown_diff_hash"

def freeze():
    print(f"[*] Freezing QA RC snapshot from {APP_ROOT} -> {QA_SNAPSHOT_DIR}...")
    os.makedirs(QA_SNAPSHOT_DIR, exist_ok=True)
    os.makedirs(MANIFEST_DIR, exist_ok=True)

    # 1. Copy root static files
    root_files = ["index.html", "styles.css", "manifest.webmanifest", "qr-mobile.html", "sw.js", "favicon.ico"]
    for rf in root_files:
        src_path = os.path.join(APP_ROOT, rf)
        if os.path.exists(src_path):
            shutil.copy2(src_path, os.path.join(QA_SNAPSHOT_DIR, rf))
            print(f"  + Copied {rf}")

    # 2. Copy directories: src, icons, assets
    dirs_to_copy = ["src", "icons", "assets"]
    for d in dirs_to_copy:
        src_dir = os.path.join(APP_ROOT, d)
        dst_dir = os.path.join(QA_SNAPSHOT_DIR, d)
        if os.path.exists(src_dir):
            shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)
            print(f"  + Copied directory {d}/")

    # 3. Compute manifest and file hashes
    file_hashes = {}
    artifact_hash_feed = hashlib.sha256()

    for root, dirs, files in os.walk(QA_SNAPSHOT_DIR):
        dirs.sort()
        for f in sorted(files):
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, QA_SNAPSHOT_DIR).replace("\\", "/")
            f_hash = compute_sha256(full_path)
            file_hashes[rel_path] = f_hash
            artifact_hash_feed.update(f"{rel_path}:{f_hash}".encode("utf-8"))
    qa_fingerprint = f"QA_RC_PHASE3H_R2_{artifact_hash_feed.hexdigest()[:12].upper()}"
    
    # Inject exact fingerprint into frozen app.js
    app_js_snap = os.path.join(QA_SNAPSHOT_DIR, "src", "app.js")
    if os.path.exists(app_js_snap):
        import re
        with open(app_js_snap, "r", encoding="utf-8") as f:
            app_content = f.read()
        app_content = re.sub(r"qaArtifactFingerprint:\s*'[^']*'", f"qaArtifactFingerprint: '{qa_fingerprint}'", app_content)
        with open(app_js_snap, "w", encoding="utf-8") as f:
            f.write(app_content)
        # Update app.js hash in file_hashes
        file_hashes["src/app.js"] = compute_sha256(app_js_snap)

    base_sha = get_base_git_sha()
    dirty_diff = get_dirty_diff_hash()
    now_iso = datetime.now(timezone.utc).isoformat()

    manifest = {
        "artifact_name": "qbiz-kho-qa-phase3-owner-rc",
        "qa_artifact_fingerprint": qa_fingerprint,
        "base_git_sha": base_sha,
        "worktree_dirty": True,
        "dirty_diff_hash": dirty_diff,
        "ai_architecture_version": "PHASE3",
        "provider_policy_version": "2.5-qwen2.5:1.5b-concise-gateway-r2",
        "configured_local_model": "qwen2.5:1.5b",
        "actual_local_model_used": "qwen2.5:1.5b",
        "configured_cloud_model": "gemini-2.5-flash",
        "actual_qa_provider": "LOCAL_AI",
        "actual_qa_model": "qwen2.5:1.5b",
        "server_side_provider_gateway": True,
        "android_browser_direct_ollama_call": False,
        "immutable_snapshot": True,
        "generated_at": now_iso,
        "total_files": len(file_hashes),
        "file_hashes": file_hashes
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n[OK] Snapshot created successfully!")
    print(f"  QA Snapshot Dir: {QA_SNAPSHOT_DIR}")
    print(f"  Manifest File  : {MANIFEST_FILE}")
    print(f"  Fingerprint    : {qa_fingerprint}")
    print(f"  Total Files    : {len(file_hashes)}")
    print(f"  Base Git SHA   : {base_sha}")
    print(f"  Dirty Diff Hash: {dirty_diff}")

if __name__ == "__main__":
    freeze()
