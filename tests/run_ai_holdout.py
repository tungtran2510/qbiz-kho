#!/usr/bin/env python3
"""
QBIZ KHO AI — FROZEN HIDDEN HOLDOUT EVALUATION
Evaluates tests/ai-final-holdout.json (713 cases)
in the real browser runtime.
"""

import os
import sys
import json

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:4180/"

def run_holdout_evaluation():
    print("\n=======================================================")
    print("  QBIZ KHO AI — FROZEN HIDDEN HOLDOUT EVALUATION (15%)")
    print("=======================================================\n")

    with open(os.path.join("tests", "ai-final-holdout.json"), "r", encoding="utf-8") as f:
        holdout_cases = json.load(f)

    print(f"Total frozen holdout cases: {len(holdout_cases)}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        print("[1/2] Loading application at http://localhost:4180/...")
        page.goto(APP_URL, wait_until="networkidle")
        page.wait_for_timeout(1000)

        print("[2/2] Evaluating holdout cases against AI runtime...")
        report = page.evaluate("""async (cases) => {
            const { runStressSuite } = await import('/tests/ai-stress-runner.js');
            return await runStressSuite({ cases });
        }""", holdout_cases)

        print(f"Completed in {report.get('DURATION_MS', 0)} ms!\n")

        # Save holdout report
        report_path = os.path.join("tests", "ai-holdout-report.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print("=======================================================")
        print(f"HOLDOUT TOTAL:      {report['TOTAL']}")
        print(f"HOLDOUT PASS:       {report['PASS']} ({report['PASS_RATE']})")
        print(f"HOLDOUT FAIL:       {report['FAIL']}")
        print("-------------------------------------------------------")
        print(f"HOLDOUT P0_FAIL:    {report['P0_FAIL']}")
        print(f"HOLDOUT P1_FAIL:    {report['P1_FAIL']}")
        print(f"HOLDOUT P2_FAIL:    {report['P2_FAIL']}")
        print(f"HOLDOUT P3_FAIL:    {report['P3_FAIL']}")
        if "CONFIRMATION_UX" in report:
            cux = report["CONFIRMATION_UX"]
            print("-------------------------------------------------------")
            print(f"ROUTINE CONFIRMATIONS: {cux['total_routine_confirmations']}")
            print(f"VERBOSE COUNT:         {cux['verbose_count']} (>90 chars or >2 lines)")
            print(f"VERBOSE RATE:          {cux['verbose_rate']} (Target: < 5.0%)")
            print(f"TARGET MET:            {'PASS' if cux.get('target_met') else 'FAIL'}")
        print("=======================================================\n")

        browser.close()
        return report

if __name__ == "__main__":
    run_holdout_evaluation()
