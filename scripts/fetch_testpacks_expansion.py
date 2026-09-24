import urllib.request
import os
import sys

target_dir = r"D:\google driver\Codex PC\Quản lý kho - bán hàng trên Qbiz\AI_BRIDGE_CHATGPT_ANTIGRAVITY\01_CHATGPT_TO_ANTIGRAVITY"

docs = {
    "CMD_20260925_AI_OPERATIONAL_STRESS_EXPANSION_02.txt": "1qBN_bk_STSR4ckdei5KxvKaar7i2V0Hk7-b2uqLQOqo",
    "TESTPACK_06_REAL_WORLD_QUERIES_REPORTS_PROFIT.txt": "1Awu7_b1ouWs32p6-n_BuAuVyQsY2JiW3THD81zfARNo",
    "TESTPACK_07_ORDERS_SHIPPING_DELIVERY.txt": "11gX-1bKmorglwAFGEPYW4Oq_FRgTzcWUShVd_NSJYV8",
    "TESTPACK_08_MULTI_INDUSTRY_PRODUCTS_SERVICES.txt": "1SkMRlLZbEeOGJ5X9pof0gEA945AGSYeZyVB1RVGuVCk",
    "TESTPACK_09_CONFIRMATION_CLARIFICATION_UX.txt": "1mjjEU0j1x4ezkdW6UmuvWjHgMwu5qOeWT_jSIghnSlY",
    "TESTPACK_10_CUSTOMERS_SUPPLIERS_REAL_LIFE.txt": "1dYA3dtohGdKxqPBxtkeDT-_jcXVmVsi5Uwriytn8k4Q",
    "TESTPACK_11_MULTI_TURN_REAL_LIFE_DIALOGUES.txt": "1HQvt-vaisaGLhhQi4PUF-F0p9qcoqGNSPEcWU2c6XQQ",
}

for filename, doc_id in docs.items():
    filepath = os.path.join(target_dir, filename)
    url = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
    print(f"Fetching {filename}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode('utf-8')
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(text)
        print(f"  -> Saved {filename} ({len(text)} chars)")
    except Exception as e:
        print(f"  -> Failed {filename}: {e}")
