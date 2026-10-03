# -*- coding: utf-8 -*-
import sys
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4180"

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True)
        page = context.new_page()

        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # Create a sale with debt and open return flow
        page.evaluate("""
        async () => {
            const { createSale, getAll, openShift, ensureLocalIdentity } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            let cur = shifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            if (!cur) {
                await openShift({ openingCash: 1000000, note: 'Ca chụp ảnh' });
            }

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const whId = warehouses[0]?.id || 'wh_default';
            const p = products[0];

            const sale = await createSale({
                items: [{ itemId: p.id, quantity: 2, unitPrice: 800000 }],
                warehouseId: whId,
                customerLabel: 'Chị Mai Lan',
                payments: [
                    { method: 'debt', amount: 1600000, status: 'PENDING', reference: 'Ghi nợ' }
                ]
            });

            await window.__qbiz_app__.openReturnFlow(sale);
        }
        """)
        time.sleep(1)

        page.screenshot(path="tests/evidence/return_flow_modal_mobile.png", full_page=False)
        print("Captured: tests/evidence/return_flow_modal_mobile.png")
        browser.close()

if __name__ == '__main__':
    capture()
