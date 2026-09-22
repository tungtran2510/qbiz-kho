#!/usr/bin/env python3
"""
Analyze failures from tests/ai-stress-report.json
"""
import json
import os
import sys
from collections import defaultdict

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

report_path = os.path.join("tests", "ai-stress-report.json")
cases_path = os.path.join("tests", "ai-stress-cases.json")

with open(report_path, "r", encoding="utf-8") as f:
    report = json.load(f)

with open(cases_path, "r", encoding="utf-8") as f:
    cases = {c["id"]: c for c in json.load(f)}

failed_ids = report.get("FAILED_CASE_IDS", [])
print(f"Total Failed Cases: {len(failed_ids)}")

p0_list = []
p1_list = []
p2_list = []
p3_list = []

by_subcat = defaultdict(list)
by_cause = defaultdict(list)

for cid in failed_ids:
    c = cases[cid]
    sev = c["severity"]
    sub = c["sub_category"]
    
    # Classify ROOT_CAUSE_CLASS
    # Options: CONTEXT, ENTITY_RESOLUTION, NUMBER_PARSING, INTENT_ROUTING, DICTIONARY,
    # MODEL_GENERALIZATION, PROVIDER, PROPOSAL, REVALIDATION, IDEMPOTENCY, MEMORY,
    # PERMISSION, AUDIT, PROMPT_INJECTION, TIER_ROUTING, UI_CONTEXT, BUSINESS_TOOL, TEST_BUG, UNSUPPORTED
    r_class = "INTENT_ROUTING"
    affected_mod = "src/ai/router.js"
    
    if sub == "security_prompt_injection":
        r_class = "PROMPT_INJECTION"
        affected_mod = "src/ai/policy.js"
    elif sub == "permission_capability":
        r_class = "PERMISSION"
        affected_mod = "src/ai/policy.js"
    elif sub in ["entity_ambiguity", "context_conflict"]:
        r_class = "ENTITY_RESOLUTION"
        affected_mod = "src/ai/resolver.js"
    elif sub == "unsupported_actions":
        r_class = "UNSUPPORTED"
        affected_mod = "src/ai/router.js"
    elif sub == "negation":
        r_class = "INTENT_ROUTING"
        affected_mod = "src/ai/router.js"
    elif sub in ["receipt_proposal", "transfer_proposal", "stocktake_proposal", "pos_cart"]:
        r_class = "PROPOSAL"
        affected_mod = "src/ai/router.js"
    elif sub == "numbers_parsing":
        r_class = "NUMBER_PARSING"
        affected_mod = "src/ai/dictionary.js"
    elif sub in ["no_diacritics", "typo_mobile", "colloquial_spoken", "very_short", "long_natural"]:
        r_class = "DICTIONARY"
        affected_mod = "src/ai/dictionary.js"
    elif sub in ["context_dependent", "route_bleed", "rapid_navigation"]:
        r_class = "CONTEXT"
        affected_mod = "src/ai/context.js"
    elif sub in ["memory_crud", "memory_injection", "note_injection"]:
        r_class = "MEMORY"
        affected_mod = "src/ai/memory.js"
    elif sub in ["idempotency", "stale_proposal"]:
        r_class = "IDEMPOTENCY"
        affected_mod = "src/ai/proposals.js"
    
    item = {
        "id": cid,
        "severity": sev,
        "category": c["category"],
        "sub_category": sub,
        "input": c["input"],
        "expected_type": c["expected_type"],
        "expected_intent": c.get("expected_intent"),
        "root_cause_class": r_class,
        "affected_module": affected_mod
    }
    
    if sev == "P0":
        p0_list.append(item)
    elif sev == "P1":
        p1_list.append(item)
    elif sev == "P2":
        p2_list.append(item)
    else:
        p3_list.append(item)
        
    by_subcat[sub].append(item)
    by_cause[r_class].append(item)

print(f"\nP0 Fails: {len(p0_list)}")
print(f"P1 Fails: {len(p1_list)}")
print(f"P2 Fails: {len(p2_list)}")
print(f"P3 Fails: {len(p3_list)}")

print("\n--- FAILURES BY ROOT CAUSE CLASS ---")
for r_class, items in sorted(by_cause.items(), key=lambda x: len(x[1]), reverse=True):
    p0s = sum(1 for x in items if x["severity"] == "P0")
    p1s = sum(1 for x in items if x["severity"] == "P1")
    p2s = sum(1 for x in items if x["severity"] == "P2")
    print(f"  • {r_class:20s}: {len(items):3d} total (P0: {p0s:2d}, P1: {p1s:2d}, P2: {p2s:2d}) [Module: {items[0]['affected_module']}]")

print("\n--- FAILURES BY SUB-CATEGORY ---")
for sub, items in sorted(by_subcat.items(), key=lambda x: len(x[1]), reverse=True):
    p0s = sum(1 for x in items if x["severity"] == "P0")
    p1s = sum(1 for x in items if x["severity"] == "P1")
    p2s = sum(1 for x in items if x["severity"] == "P2")
    print(f"  • {sub:25s}: {len(items):3d} total (P0: {p0s:2d}, P1: {p1s:2d}, P2: {p2s:2d})")

print("\n--- ALL P0 DETAILS ---")
for item in p0_list:
    inp = item["input"]
    if isinstance(inp, dict):
        inp = inp.get("utterance") or inp.get("initial_prompt")
    print(f"[{item['id']}] {item['sub_category']} ({item['root_cause_class']}): '{inp}'")

print("\n--- SAMPLE P1 DETAILS (FIRST 20) ---")
for item in p1_list[:20]:
    inp = item["input"]
    if isinstance(inp, dict):
        inp = inp.get("utterance") or inp.get("initial_prompt")
    print(f"[{item['id']}] {item['sub_category']} ({item['root_cause_class']}): '{inp}' -> expected {item['expected_type']} / {item['expected_intent']}")
