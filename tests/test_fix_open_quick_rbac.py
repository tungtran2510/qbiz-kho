# -*- coding: utf-8 -*-
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:4180"

def test_open_quick_rbac():
    print("===========================================================================")
    print("TEST: RBAC ENFORCEMENT ON WAREHOUSE QUICK ACTIONS (openQuick)")
    print("===========================================================================")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # TEST 1: Role = CASHIER
        print("\n[TEST 1] Testing with CASHIER role...")
        res_cashier = page.evaluate("""
        () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            sessionStorage.setItem('qbiz_demo_role', 'CASHIER');

            // Attempt warehouse actions as Cashier
            window.__qbiz_app__.openQuick('receive');
            const receiveToast = document.querySelector('#toastRoot')?.textContent || '';
            const receiveModalOpen = Boolean(document.querySelector('#modalRoot .stock-flow'));

            window.__qbiz_app__.openQuick('issue');
            const issueModalOpen = Boolean(document.querySelector('#modalRoot .stock-flow'));

            window.__qbiz_app__.openQuick('transfer');
            const transferModalOpen = Boolean(document.querySelector('#modalRoot .stock-flow'));

            window.__qbiz_app__.openQuick('count');
            const countModalOpen = Boolean(document.querySelector('#modalRoot .stock-flow'));

            return {
                receiveModalOpen,
                issueModalOpen,
                transferModalOpen,
                countModalOpen,
                receiveToast
            };
        }
        """)

        print(f"  Cashier Modals Opened: Receive={res_cashier['receiveModalOpen']}, Issue={res_cashier['issueModalOpen']}, Transfer={res_cashier['transferModalOpen']}, Count={res_cashier['countModalOpen']}")
        print(f"  Toast: {res_cashier['receiveToast']}")

        assert res_cashier['receiveModalOpen'] == False, "Cashier must NOT open Receive modal"
        assert res_cashier['issueModalOpen'] == False, "Cashier must NOT open Issue modal"
        assert res_cashier['transferModalOpen'] == False, "Cashier must NOT open Transfer modal"
        assert res_cashier['countModalOpen'] == False, "Cashier must NOT open Count modal"
        assert "không có quyền" in res_cashier['receiveToast'], f"Expected permission denied toast, got: {res_cashier['receiveToast']}"

        # TEST 2: Role = OWNER or WAREHOUSE
        print("\n[TEST 2] Testing with OWNER / WAREHOUSE role...")
        res_owner = page.evaluate("""
        () => {
            sessionStorage.setItem('qbiz_preview_demo', '1');
            sessionStorage.setItem('qbiz_demo_role', 'OWNER');

            window.__qbiz_app__.openQuick('receive');
            const receiveModalOpen = Boolean(document.querySelector('#modalRoot .stock-flow'));
            const modalTitle = document.querySelector('#modalRoot h3')?.textContent || '';

            return {
                receiveModalOpen,
                modalTitle
            };
        }
        """)

        print(f"  Owner Modal Opened: {res_owner['receiveModalOpen']} | Title: {res_owner['modalTitle']}")
        assert res_owner['receiveModalOpen'] == True, "Owner must be allowed to open Receive modal"
        assert "Nhập hàng" in res_owner['modalTitle']

        # Clean up demo role
        page.evaluate("""
        () => {
            sessionStorage.removeItem('qbiz_preview_demo');
            sessionStorage.removeItem('qbiz_demo_role');
        }
        """)

        print("\nAll openQuick RBAC enforcement tests passed successfully!")
        browser.close()

if __name__ == '__main__':
    test_open_quick_rbac()
