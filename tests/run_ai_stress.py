#!/usr/bin/env python3
"""
QBIZ KHO AI — STRESS TEST ORCHESTRATOR
Executes tests/ai-stress-cases.json using tests/ai-stress-runner.js
outside in the real browser runtime.
"""

import os
import sys
import json
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:4180/"

def run_stress_suite():
    print("\n=======================================================")
    print("  QBIZ KHO AI — LARGE FROZEN AI STRESS TEST SUITE")
    print("=======================================================\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        print("[1/3] Loading application at http://localhost:4180/...")
        page.goto(APP_URL, wait_until="networkidle")
        page.wait_for_timeout(1000)

        print("[2/3] Executing tests/ai-stress-runner.js against tests/ai-stress-cases.json...")
        report = page.evaluate("""async () => {
            const { runStressSuite } = await import('/tests/ai-stress-runner.js');
            return await runStressSuite();
        }""")

        print(f"[3/3] Completed in {report.get('DURATION_MS', 0)} ms!\n")

        # Save report
        report_path = os.path.join("tests", "ai-stress-report.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        # Output required metrics
        print("=======================================================")
        print(f"TOTAL:              {report['TOTAL']}")
        print(f"PASS:               {report['PASS']} ({report['PASS_RATE']})")
        print(f"FAIL:               {report['FAIL']}")
        print("-------------------------------------------------------")
        print(f"P0_FAIL:            {report['P0_FAIL']}")
        print(f"P1_FAIL:            {report['P1_FAIL']}")
        print(f"P2_FAIL:            {report['P2_FAIL']}")
        print(f"P3_FAIL:            {report['P3_FAIL']}")
        print("-------------------------------------------------------")
        print("BY_CATEGORY:")
        for cat, stats in report.get("BY_CATEGORY", {}).items():
            pass_pct = (stats['pass'] / stats['total'] * 100) if stats['total'] > 0 else 0
            print(f"  • {cat:22s}: {stats['pass']:3d}/{stats['total']:3d} ({pass_pct:5.1f}% pass, {stats['fail']:2d} fail)")
        print("-------------------------------------------------------")
        print(f"FAILED_CASE_IDS ({len(report['FAILED_CASE_IDS'])} total):")
        sample_fails = report['FAILED_CASE_IDS'][:25]
        print(f"  {sample_fails} ...")
        print("-------------------------------------------------------")
        print("ROOT_CAUSE_HINT:")
        for cause, count in report.get("ROOT_CAUSE_HINT", {}).items():
            print(f"  • {cause:28s}: {count}")
        print("=======================================================\n")

        if report.get("P0_DETAILS"):
            print(f"⚠️ P0 CRITICAL FAILURES ({len(report['P0_DETAILS'])}):")
            for item in report["P0_DETAILS"]:
                print(f"  - [{item['id']}] {item['sub_category']}: {item['reason']}")
            print()

        browser.close()
        return report

if __name__ == "__main__":
    run_stress_suite()
