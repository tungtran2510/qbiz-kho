# -*- coding: utf-8 -*-
import sys
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4180"

def capture():
    with sync_playwright() as p:
        # Emulate mobile screen
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 412, "height": 915}, is_mobile=True)
        page = context.new_page()

        page.goto(BASE_URL)
        page.wait_for_selector("#pageTitle", timeout=10000)
        page.wait_for_function("() => window.__qbiz_app__ && window.__qbiz_app__.state", timeout=10000)
        time.sleep(1)

        # 1. Create a customer with debt
        page.evaluate("""
        async () => {
            const { put } = await import('/src/db.js');
            const { createSale, getAll, openShift, ensureLocalIdentity } = await import('/src/engine.js');
            const identity = await ensureLocalIdentity();
            const shifts = await getAll('shifts');
            let cur = shifts.find(s => s.device_id === identity.device_id && s.register_id === identity.register_id && s.status === 'OPEN');
            if (!cur) {
                await openShift({ openingCash: 1000000, note: 'Ca chụp ảnh' });
            }
            const custId = 'cust_proof_mobile';
            const customer = {
                id: custId,
                customer_id: custId,
                customer_code: 'KH-VIP01',
                name: 'Nguyễn Văn Nam (Đại lý)',
                phone: '0909123456',
                customer_type: 'agent',
                customer_group: 'Đại lý Cấp 1',
                creditLimit: 10000000,
                credit_limit: 10000000,
                default_discount: 5,
                debt: 3500000,
                totalSpent: 12500000,
                active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            await put('customers', customer);

            const products = await getAll('products');
            const warehouses = await getAll('warehouses');
            const whId = warehouses[0]?.id || 'wh_default';
            const p = products[0];

            // create a sale with remaining debt
            const sale = await createSale({
                items: [{ itemId: p.id, quantity: 2, unitPrice: 1750000 }],
                warehouseId: whId,
                customerId: custId,
                customerLabel: customer.name,
                payments: [
                    { method: 'debt', amount: 3500000, status: 'PENDING', reference: 'Ghi nợ đơn hàng' }
                ]
            });

            await window.__qbiz_app__.openCustomerDetail(customer);
        }
        """)
        time.sleep(1)

        # Capture Customer Detail with Debt & Limit cards
        page.screenshot(path="tests/evidence/customer_debt_detail_mobile.png", full_page=False)
        print("Captured: tests/evidence/customer_debt_detail_mobile.png")

        # 2. Click Thu nợ
        page.evaluate("""
        () => {
            const btn = document.querySelector('[data-action="collect-debt"]');
            if (btn) btn.click();
        }
        """)
        time.sleep(1)

        # Capture Debt Collection Modal
        page.screenshot(path="tests/evidence/debt_collection_modal_mobile.png", full_page=False)
        print("Captured: tests/evidence/debt_collection_modal_mobile.png")

        browser.close()

if __name__ == '__main__':
    capture()
