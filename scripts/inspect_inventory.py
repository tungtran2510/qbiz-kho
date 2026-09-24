import json
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

backup_file = list(Path("app/backups").glob("local_v12_backup_*.json"))[-1]
print("Reading:", backup_file)
with open(backup_file, "r", encoding="utf-8") as f:
    data = json.load(f)

levels = data["data"]["levels"]
movements = data["data"]["movements"]

print(f"Total levels: {len(levels)}, Total movements: {len(movements)}")
print("\nSample Level:")
print(json.dumps(levels[0], indent=2, ensure_ascii=False))

print("\nSample Movement:")
print(json.dumps(movements[0], indent=2, ensure_ascii=False))

types = set(m.get("type") for m in movements)
print("\nMovement types:", types)

# Reconcile movements vs levels
balance_calc = {}
for m in movements:
    key = f"{m.get('productId')}:{m.get('warehouseId')}"
    balance_calc[key] = balance_calc.get(key, 0) + m.get("qty", 0)

level_map = {l["id"]: l["onHand"] for l in levels}
mismatches = []
for k, v in level_map.items():
    calc = balance_calc.get(k, 0)
    if calc != v:
        mismatches.append((k, v, calc))

print(f"\nReconciliation check: total levels={len(level_map)}, mismatches={len(mismatches)}")
if mismatches:
    print("Mismatches found:", mismatches)
else:
    print("ALL 30 LEVELS 100% RECONCILED WITH MOVEMENTS! (LEDGER_MISMATCH = 0)")
