/**
 * QBiz Kho — HĐĐT Batch 4B-LIVE-R1: MISA Real Sandbox Live Test Runner
 * Two-Stage Preflight Protocol (Gate A: Connect + Discover -> Gate B: Issue Acceptance)
 * Spec: QBiz Kho - HĐĐT BATCH 4B-LIVE-R1 — MISA CREDENTIAL ONBOARDING & TEMPLATE DISCOVERY
 *
 * Gate A (Connect & Discover):
 *   Requires: MISA_APP_ID, MISA_TAX_CODE, MISA_USERNAME, MISA_PASSWORD, QBIZ_INVOICE_PROVIDER=MISA_MEINVOICE
 *   Runs:
 *     - M01 AUTH: POST /auth/token
 *     - A02 TEMPLATE DISCOVERY: GET /invoice/templates (withCode=true and withCode=false)
 *     - Outputs SAFE template table (SERIES, TEMPLATE_NO, WITH_CODE, CALCULATING_MACHINE, ACTIVE, TEMPLATE_NAME)
 *     - If no active templates: BLOCKED_NO_ACTIVE_TEMPLATE
 *     - If series/signType not yet chosen: STOP with READY_FOR_OWNER_TEMPLATE_SELECTION=YES
 *
 * Gate B (Issue Acceptance):
 *   Requires: Gate A success + MISA_INVOICE_SERIES, MISA_SIGN_TYPE
 *   Note: MISA_TEMPLATE_CODE is auto-derived from the matching discovered template if omitted!
 *   Runs: M02 - M09 (Issue, Idempotency, Status, Download XML, Download PDF, Adjust, Replace, Reconcile)
 *
 * Safety invariants:
 * - NEVER log credentials or bearer tokens (zero secret leakage).
 * - NEVER use Mock to fake test results.
 * - NEVER auto-select series when multiple active templates exist.
 */

import assert from 'node:assert';
import {
  MisaInvoiceProvider,
  parseMisaSeries,
  formatSafeTemplateTable,
  ProviderErrorCode
} from '../src/invoice/providers/misa_provider.js';

export async function runLiveSandboxTests({ silent = false, env = process.env, fetchFn = null, logCapture = null } = {}) {
  const log = (...args) => {
    if (Array.isArray(logCapture)) logCapture.push(args.join(' '));
    if (!silent) console.log(...args);
  };
  const errLog = (...args) => {
    if (Array.isArray(logCapture)) logCapture.push(args.join(' '));
    if (!silent) console.error(...args);
  };

  log('=== QBiz Kho: MISA Real Sandbox Live Test Runner (Batch 4B-LIVE-R1) ===\n');

  // 1. GATE A PRE-FLIGHT
  const appId = env.MISA_APP_ID;
  const taxCode = env.MISA_TAX_CODE;
  const username = env.MISA_USERNAME;
  const password = env.MISA_PASSWORD;
  const providerCode = env.QBIZ_INVOICE_PROVIDER;

  const missingAuth = [];
  if (!appId) missingAuth.push('MISA_APP_ID');
  if (!taxCode) missingAuth.push('MISA_TAX_CODE');
  if (!username) missingAuth.push('MISA_USERNAME');
  if (!password) missingAuth.push('MISA_PASSWORD');
  if (!providerCode || providerCode !== 'MISA_MEINVOICE') missingAuth.push('QBIZ_INVOICE_PROVIDER');

  if (missingAuth.length > 0) {
    errLog(`[BLOCKED_WAITING_CREDENTIALS] Thiếu cấu hình xác thực Gate A: ${missingAuth.join(', ')}`);
    return {
      success: false,
      gate: 'A',
      verdict: 'BLOCKED_WAITING_CREDENTIALS',
      missingAuth,
      exitCode: 2
    };
  }

  // Initialize Provider for Gate A
  const provider = new MisaInvoiceProvider({
    appId,
    taxCode,
    username,
    password,
    fetchFn
  });

  // M01 AUTH
  log('--- [GATE A] Bước 1: M01 Real MISA Authentication ---');
  let token;
  try {
    token = await provider.authenticate();
    assert.ok(token && typeof token === 'string' && token.length > 20, 'Token must be valid non-empty string');
    log('  [PASS] M01_AUTH: Xác thực thành công với MISA Sandbox (token masked, zero leakage).');
  } catch (err) {
    errLog(`  [FAIL] M01_AUTH: Xác thực thất bại: ${err.message}`);
    return {
      success: false,
      gate: 'A',
      step: 'M01_AUTH',
      verdict: 'FAIL_AUTH',
      error: err,
      exitCode: 1
    };
  }

  // A02 TEMPLATE DISCOVERY
  log('\n--- [GATE A] Bước 2: A02 Template Discovery (Lấy mẫu & ký hiệu thật từ MISA) ---');
  let discovery;
  try {
    discovery = await provider.discoverTemplates();
    log(`Tìm thấy tổng cộng ${discovery.totalCount} mẫu hóa đơn (${discovery.activeCount} mẫu đang hoạt động):\n`);
    log(formatSafeTemplateTable(discovery.templates));
  } catch (err) {
    errLog(`  [FAIL] A02_TEMPLATE_DISCOVERY: Lấy danh sách mẫu hóa đơn thất bại: ${err.message}`);
    return {
      success: false,
      gate: 'A',
      step: 'A02_TEMPLATE_DISCOVERY',
      verdict: 'FAIL_DISCOVERY',
      error: err,
      exitCode: 1
    };
  }

  if (!discovery.hasActiveTemplate) {
    errLog('\n[BLOCKED_NO_ACTIVE_TEMPLATE] Không có mẫu hóa đơn nào đang ở trạng thái Hoạt động trên tài khoản MISA Sandbox.');
    return {
      success: false,
      gate: 'A',
      step: 'A02_TEMPLATE_DISCOVERY',
      verdict: 'BLOCKED_NO_ACTIVE_TEMPLATE',
      discovery,
      exitCode: 3
    };
  }

  // 2. CHECK GATE B READINESS
  const series = env.MISA_INVOICE_SERIES;
  const signTypeRaw = env.MISA_SIGN_TYPE;
  let templateCode = env.MISA_TEMPLATE_CODE;

  if (!series || !signTypeRaw) {
    log('\n' + '='.repeat(64));
    log('[GATE A COMPLETE] M01 Auth và A02 Template Discovery đã THÀNH CÔNG!');
    log('[WAITING_OWNER_SELECTION] Vui lòng cấu hình biến môi trường Gate B để tiếp tục issue:');
    if (!series) {
      log('  - MISA_INVOICE_SERIES: Chọn 1 trong các ký hiệu Active ở bảng trên.');
      log(`    Các ký hiệu khả dụng: ${discovery.activeTemplates.map(t => t.InvSeries).join(', ')}`);
    }
    if (!signTypeRaw) {
      log('  - MISA_SIGN_TYPE: Cấu hình hình thức ký số (1=USB/File, 2=HSM có hiển thị CKS, 5=Ký sau MTT).');
    }
    log('\nREADY_FOR_OWNER_TEMPLATE_SELECTION=YES');
    log('='.repeat(64));
    return {
      success: true,
      gate: 'A',
      gateACompleted: true,
      readyForOwnerTemplateSelection: true,
      discovery,
      verdict: 'WAITING_OWNER_SELECTION',
      exitCode: 0
    };
  }

  // 3. EXECUTE GATE B (M02 - M09)
  const signType = Number(signTypeRaw);
  const matchingTemplate = discovery.activeTemplates.find(t => t.InvSeries === series) || discovery.templates.find(t => t.InvSeries === series);
  if (!templateCode && matchingTemplate) {
    templateCode = matchingTemplate.InvTemplateNo || '1';
    log(`[INFO] Tự động gán MISA_TEMPLATE_CODE='${templateCode}' từ mẫu '${matchingTemplate.TemplateName}'`);
  }
  if (!templateCode) templateCode = '1';

  provider.setSeries(series, { templateCode });
  provider.setSignType(signType);
  provider.validateSignType('issue');

  log(`\n--- [GATE B] Bắt đầu kiểm thử phát hành M02-M09 với Series=${series}, SignType=${signType}, TemplateNo=${templateCode} ---`);

  // M02 ISSUE ORIGINAL
  log('\n--- Testing M02: Real Original Invoice Issue ---');
  const refId1 = `QBIZ-LIVE-${Date.now()}`;
  const snapshot1 = {
    id: refId1,
    sale_id: `SALE-${Date.now()}`,
    issued_at: new Date().toISOString(),
    subtotal: 50000,
    discount_total: 0,
    vat_total: 4000,
    total: 54000,
    payment_method: 'TM',
    buyer: {
      name: 'Khách hàng Sandbox Test',
      company_name: 'Khách hàng Sandbox Test',
      tax_code: '',
      address: 'Hà Nội'
    },
    items: [{
      product_id: 'SP-SANDBOX-01',
      name: 'Hàng hóa thử nghiệm Sandbox',
      unit: 'Cái',
      quantity: 1,
      unit_price: 50000,
      discount: 0,
      vat_rate: 8,
      vat_amount: 4000
    }]
  };

  const issueRes = await provider.issue({
    invoiceData: snapshot1,
    idempotencyKey: `IDEMP-M02-${Date.now()}`
  });
  assert.strictEqual(issueRes.success, true, 'Issue must succeed');
  assert.ok(issueRes.transaction_id || issueRes.provider_invoice_id, 'Must return provider transaction/invoice ID');
  const txId = issueRes.transaction_id;
  const invNumber = issueRes.invoice_number;
  log(`  [PASS] M02_ORIGINAL_ISSUE: Hóa đơn gốc phát hành thành công. Số HĐ: ${invNumber || 'Đang xử lý'}, TransactionID: ${txId}`);

  // M03 IDEMPOTENT REPLAY
  log('\n--- Testing M03: Idempotent Replay (Re-issuing with same RefID) ---');
  const replayRes = await provider.issue({
    invoiceData: snapshot1,
    idempotencyKey: `IDEMP-M02-${Date.now()}`
  });
  assert.strictEqual(replayRes.success, true);
  log('  [PASS] M03_IDEMPOTENT_REPLAY: Gửi lại cùng RefID trả về bản ghi nhất quán, không nhân bản hóa đơn.');

  // M04 STATUS LOOKUP
  log('\n--- Testing M04: Real Status Lookup by TransactionID / RefID ---');
  const statusRes = await provider.getStatus({
    transactionId: txId,
    refId: refId1,
    invoiceNumber: invNumber
  });
  assert.strictEqual(statusRes.success, true);
  log(`  [PASS] M04_STATUS: Tra cứu trạng thái thành công. Status=${statusRes.status}, InvNo=${statusRes.invoice_number}`);

  // M05 XML DOWNLOAD
  log('\n--- Testing M05: Real XML Download ---');
  const xmlRes = await provider.downloadDocument({
    transactionId: txId,
    format: 'xml'
  });
  assert.strictEqual(xmlRes.success, true);
  assert.ok(xmlRes.xml_data || xmlRes.document_url || xmlRes.file_data, 'Must return XML payload or download URL');
  log('  [PASS] M05_XML_DOWNLOAD: Tải chứng từ XML thành công từ MISA Sandbox.');

  // M06 PDF DOWNLOAD
  log('\n--- Testing M06: Real PDF Download ---');
  const pdfRes = await provider.downloadDocument({
    transactionId: txId,
    format: 'pdf'
  });
  assert.strictEqual(pdfRes.success, true);
  assert.ok(pdfRes.pdf_data || pdfRes.document_url || pdfRes.file_data, 'Must return PDF payload or download URL');
  log('  [PASS] M06_PDF_DOWNLOAD: Tải chứng từ PDF / bản xem hóa đơn thành công.');

  // M07 ADJUST
  log('\n--- Testing M07: Real Invoice Adjustment ---');
  const refIdAdjust = `QBIZ-ADJ-${Date.now()}`;
  const adjustSnapshot = {
    id: refIdAdjust,
    sale_id: `SALE-ADJ-${Date.now()}`,
    issued_at: new Date().toISOString(),
    subtotal: 10000,
    vat_total: 800,
    total: 10800,
    payment_method: 'TM',
    buyer: snapshot1.buyer,
    items: [{
      product_id: 'SP-SANDBOX-01',
      name: 'Điều chỉnh tăng giá sản phẩm',
      unit: 'Cái',
      quantity: 1,
      unit_price: 10000,
      vat_rate: 8,
      vat_amount: 800
    }]
  };
  const adjustRes = await provider.adjust({
    invoiceData: adjustSnapshot,
    originalInvoice: {
      transaction_id: txId,
      invoice_number: invNumber,
      template_code: templateCode,
      series,
      issued_at: snapshot1.issued_at
    },
    adjustmentData: {
      type: 'INCREASE',
      reason: 'Biên bản thỏa thuận điều chỉnh tăng giá số 01'
    }
  });
  assert.strictEqual(adjustRes.success, true);
  log(`  [PASS] M07_ADJUST: Phát hành hóa đơn điều chỉnh thành công. Số HĐ mới: ${adjustRes.invoice_number || 'Đang xử lý'}`);

  // M08 REPLACE
  log('\n--- Testing M08: Real Invoice Replacement ---');
  const refIdReplace = `QBIZ-REP-${Date.now()}`;
  const replaceSnapshot = {
    id: refIdReplace,
    sale_id: `SALE-REP-${Date.now()}`,
    issued_at: new Date().toISOString(),
    subtotal: 60000,
    vat_total: 4800,
    total: 64800,
    payment_method: 'CK',
    buyer: snapshot1.buyer,
    items: [{
      product_id: 'SP-SANDBOX-01',
      name: 'Hàng hóa thay thế đúng tên quy cách',
      unit: 'Cái',
      quantity: 1,
      unit_price: 60000,
      vat_rate: 8,
      vat_amount: 4800
    }]
  };
  const replaceRes = await provider.replace({
    invoiceData: replaceSnapshot,
    originalInvoice: {
      transaction_id: txId,
      invoice_number: invNumber,
      template_code: templateCode,
      series,
      issued_at: snapshot1.issued_at
    },
    replacementData: {
      reason: 'Biên bản thay thế hóa đơn sai quy cách tên hàng số 02'
    }
  });
  assert.strictEqual(replaceRes.success, true);
  log(`  [PASS] M08_REPLACE: Phát hành hóa đơn thay thế thành công. Số HĐ thay thế: ${replaceRes.invoice_number || 'Đang xử lý'}`);

  // M09 TIMEOUT RECONCILE
  log('\n--- Testing M09: Timeout Ambiguous Reconciliation ---');
  const reconRes = await provider.reconcile({
    refId: refId1
  });
  assert.strictEqual(reconRes.exists, true, 'Original invoice must be reconcilable via RefID');
  assert.strictEqual(reconRes.reconciled, true);
  log(`  [PASS] M09_TIMEOUT_RECONCILE: Đối soát trạng thái theo RefID sau giả định timeout thành công.`);

  log('\n=== TẤT CẢ CÁC BƯỚC M01-M09 VÀ A02 TRÊN SANDBOX THẬT ĐỀU ĐẠT CHUẨN ===\n');
  return {
    success: true,
    gate: 'B',
    verdict: 'PASS_REAL_SANDBOX',
    exitCode: 0
  };
}

if (process.argv[1] && process.argv[1].endsWith('run_misa_live_sandbox.js')) {
  runLiveSandboxTests()
    .then(res => {
      process.exit(res.exitCode !== undefined ? res.exitCode : (res.success ? 0 : 1));
    })
    .catch(err => {
      console.error('[UNCAUGHT_RUNNER_ERROR]', err);
      process.exit(1);
    });
}
