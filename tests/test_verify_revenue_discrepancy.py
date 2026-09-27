import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:4180')
    page.wait_for_timeout(1000)
    
    # Enter demo mode and load demo data
    page.evaluate('''async () => {
        sessionStorage.setItem('qbiz_preview_demo', '1');
        const { loadDemoIndustry } = await import('./src/demo-showroom.js');
        await loadDemoIndustry('retail');
        await window.__qbiz_app__.refresh();
        window.__qbiz_app__.navigate('dashboard');
    }''')
    page.wait_for_timeout(1000)
    
    # Check numbers
    info = page.evaluate('''async () => {
        const app = window.__qbiz_app__;
        const repMonth = app.reportSales('month');
        
        const { executeSkill } = await import('./src/ai/skills.js');
        const summaryRes = await executeSkill('sales-summary', { period: 'month' }, {}, app.state);
        const exportRes = await executeSkill('export-report', { reportType: 'sales', period: 'month' }, {}, app.state);
        
        const refunds = app.state.data.refunds || [];
        const returns = app.state.data.returns || [];
        
        return {
            dashboardNet: repMonth.net,
            dashboardGross: repMonth.gross,
            dashboardDiscount: repMonth.discount,
            dashboardRefundTotal: repMonth.refundTotal,
            dashboardSalesCount: repMonth.sales.length,
            aiSummaryTotal: summaryRes.summary.totalRevenue,
            aiSummaryCount: summaryRes.summary.completedCount,
            exportTotal: exportRes.totalValue,
            exportRowCount: exportRes.rowCount,
            refunds,
            returns
        };
    }''')
    
    print("Dashboard Net:", info['dashboardNet'])
    print("Dashboard Gross:", info['dashboardGross'])
    print("Dashboard Discount:", info['dashboardDiscount'])
    print("Dashboard Refund Total:", info['dashboardRefundTotal'])
    print("Dashboard Count:", info['dashboardSalesCount'])
    print("---")
    print("AI Sales Summary Total:", info['aiSummaryTotal'])
    print("AI Sales Summary Count:", info['aiSummaryCount'])
    print("---")
    print("Export CSV Total:", info['exportTotal'])
    print("Export CSV Row Count:", info['exportRowCount'])
    print("---")
    print("Refunds:", info['refunds'])
    print("Returns:", info['returns'])
    
    browser.close()
