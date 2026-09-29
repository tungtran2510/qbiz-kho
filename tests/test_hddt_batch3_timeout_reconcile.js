/**
 * QBiz Kho — HĐĐT Module Batch 3 Verification Test
 * Invariant: BLIND_REISSUE_ON_TIMEOUT = 0
 * 
 * Verifies:
 * 1. Primary Scenario: Provider issued invoice successfully (record in provider state),
 *    but response to client experienced a network timeout/disconnection.
 * 2. Invariant Assertion: Client MUST NOT call issue() a second time blindly.
 *    Client MUST call getStatus() using the exact idempotencyKey to reconcile state.
 * 3. Pre-Retry Assertion: If retry is attempted after a timeout, getStatus() is checked first;
 *    zero issue() calls are made if provider already recorded it.
 * 4. Error Boundary Assertion: Non-timeout / non-network errors (e.g. 400 Bad Request, validation)
 *    do NOT trigger getStatus().
 * 5. Provider Not Found Assertion: If timeout happened before provider processed, getStatus()
 *    returns NOT_FOUND and system flags safe retry without blind reissuance.
 * 6. Error Classifier Assertion: isNetworkOrTimeoutError correctly identifies timeout/network
 *    failures and rejects business/validation errors.
 * 
 * Strict Requirement: Hard assertions only (assert/strict). Process exits with code != 0 on failure.
 */

import assert from 'node:assert/strict';
import {
  InvoiceStatus,
  InvoiceOperation,
  buildInvoiceIdempotencyKey,
  createInvoiceDraftFromSale
} from '../src/invoice/domain.js';

import { mockInvoiceProvider } from '../src/invoice/mock_provider.js';
import {
  issueInvoice,
  reconcileInvoiceStatus,
  isNetworkOrTimeoutError
} from '../src/invoice/service.js';

async function runBatch3TimeoutReconcileTests() {
  console.log('================================================================');
  console.log(' QBiz Kho — HĐĐT Module Batch 3: BLIND_REISSUE_ON_TIMEOUT = 0');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Primary Timeout & Immediate Reconcile
  // ---------------------------------------------------------------------------
  console.log('>>> TEST 1: Provider issued successfully, client timeout on response');
  const saleId1 = 'sale_timeout_case_001';
  const sale1 = {
    id: saleId1,
    code: 'PB-20260929-T001',
    customer_label: 'Công ty Alpha Logistics',
    customer_phone: '0911223344',
    customer_email: 'acc@alpha.vn',
    customer_address: '123 Đường Giải Phóng, Hà Nội',
    subtotal: 2000000,
    discount: 0,
    tax_total: 200000,
    grand_total: 2200000,
    items: [
      { itemId: 'item_01', name: 'Dịch vụ Kho bãi', quantity: 1, unitPrice: 2000000, tax_amount: 200000, lineTotal: 2200000 }
    ]
  };

  const draft1 = createInvoiceDraftFromSale(sale1, {
    buyer: {
      name: sale1.customer_label,
      tax_code: '0108889999',
      email: sale1.customer_email,
      phone: sale1.customer_phone,
      address: sale1.customer_address
    }
  });

  const idempotencyKey1 = buildInvoiceIdempotencyKey({
    operation: InvoiceOperation.ISSUE,
    saleId: sale1.id,
    lineageId: draft1.lineage_id || 'orig',
    version: draft1.version || 1
  });

  const callHistory1 = [];
  let expectedInvoiceNumber1 = null;

  const mockGatewayCaller1 = async ({ action, idempotencyKey, payload }) => {
    callHistory1.push({ action, idempotencyKey, payload, timestamp: Date.now() });

    if (action === 'issue') {
      // 1. Provider receives and executes issue() successfully
      const providerRes = await mockInvoiceProvider.issue({
        invoiceData: payload?.invoiceData,
        idempotencyKey
      });
      expectedInvoiceNumber1 = providerRes.invoice_number;

      // Assert that provider state now contains this invoice number
      assert.ok(mockInvoiceProvider.records.has(idempotencyKey), 'Provider records must contain idempotency key');
      assert.strictEqual(mockInvoiceProvider.records.get(idempotencyKey).invoice_number, expectedInvoiceNumber1);

      // 2. BUT response to client fails with network timeout / connection drop!
      const timeoutError = new Error('ETIMEDOUT: Connection to invoice gateway timed out after 30000ms (TCP disconnect)');
      timeoutError.code = 'ETIMEDOUT';
      throw timeoutError;
    }

    if (action === 'getStatus') {
      return await mockInvoiceProvider.getStatus({ idempotencyKey });
    }

    throw new Error(`Unexpected action: ${action}`);
  };

  const result1 = await issueInvoice(draft1, {
    actor: 'Thu ngân số 1',
    gatewayCaller: mockGatewayCaller1
  });

  const issueCalls1 = callHistory1.filter(c => c.action === 'issue');
  const getStatusCalls1 = callHistory1.filter(c => c.action === 'getStatus');

  // Hard Assertions
  assert.strictEqual(issueCalls1.length, 1, 'INVARIANT VIOLATION: issue() must be called exactly 1 time! Blind re-issue detected.');
  assert.strictEqual(getStatusCalls1.length, 1, 'INVARIANT VIOLATION: getStatus() was not called after timeout!');
  assert.strictEqual(callHistory1[0].action, 'issue', 'First action must be issue');
  assert.strictEqual(callHistory1[1].action, 'getStatus', 'Second action must be getStatus (reconcile)');
  assert.strictEqual(callHistory1[1].idempotencyKey, idempotencyKey1, 'getStatus must use exact idempotencyKey');
  assert.strictEqual(result1.success, true, 'Result must be success');
  assert.strictEqual(result1.reconciled, true, 'Result must be marked reconciled');
  assert.strictEqual(result1.source, 'TIMEOUT_RECONCILE', 'Source must be TIMEOUT_RECONCILE');
  assert.strictEqual(draft1.status, InvoiceStatus.ISSUED, 'Invoice status must be updated to ISSUED');
  assert.strictEqual(draft1.provider_ref.invoice_number, expectedInvoiceNumber1, 'Invoice number must match provider issued number');
  assert.strictEqual(draft1.snapshot.provider_ref.invoice_number, expectedInvoiceNumber1, 'Snapshot must be created with provider ref');

  const auditEntries1 = draft1.audit_log.filter(l => l.action === 'RECONCILED_AFTER_TIMEOUT');
  assert.strictEqual(auditEntries1.length, 1, 'Audit log must record RECONCILED_AFTER_TIMEOUT action');
  console.log('TEST 1 PASSED: issue() called once, timeout caught, getStatus() reconciled invoice #' + expectedInvoiceNumber1 + '\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Pre-Retry Reconcile Guard (No Blind Re-issue on retry)
  // ---------------------------------------------------------------------------
  console.log('>>> TEST 2: Pre-Retry Reconcile Guard (Zero issue calls on retry)');
  const saleId2 = 'sale_timeout_case_002';
  const sale2 = {
    id: saleId2,
    code: 'PB-20260929-T002',
    customer_label: 'Công ty Beta Hóa Đơn',
    subtotal: 1000000,
    items: [{ itemId: 'item_02', name: 'Sản phẩm B', quantity: 1, unitPrice: 1000000, lineTotal: 1000000 }]
  };
  const draft2 = createInvoiceDraftFromSale(sale2);
  const idempotencyKey2 = buildInvoiceIdempotencyKey({
    operation: InvoiceOperation.ISSUE,
    saleId: sale2.id,
    lineageId: draft2.lineage_id || 'orig',
    version: draft2.version || 1
  });

  const providerRecord2 = await mockInvoiceProvider.issue({
    invoiceData: draft2,
    idempotencyKey: idempotencyKey2
  });

  draft2._pending_reconcile = true;
  draft2._last_error_type = 'TIMEOUT';
  draft2._last_error_message = 'Network timeout occurred';

  const callHistory2 = [];
  const mockGatewayCaller2 = async ({ action, idempotencyKey }) => {
    callHistory2.push({ action, idempotencyKey });
    if (action === 'getStatus') {
      return await mockInvoiceProvider.getStatus({ idempotencyKey });
    }
    if (action === 'issue') {
      throw new Error('FATAL: issue() was called on retry when provider already had record!');
    }
    throw new Error(`Unexpected action: ${action}`);
  };

  const result2 = await issueInvoice(draft2, {
    actor: 'Thu ngân số 2',
    gatewayCaller: mockGatewayCaller2
  });

  assert.strictEqual(callHistory2.length, 1, 'Only 1 call should be made');
  assert.strictEqual(callHistory2[0].action, 'getStatus', 'Action must be getStatus, NOT issue');
  assert.strictEqual(callHistory2.filter(c => c.action === 'issue').length, 0, 'Zero calls to issue()');
  assert.strictEqual(draft2.status, InvoiceStatus.ISSUED);
  assert.strictEqual(draft2.provider_ref.invoice_number, providerRecord2.invoice_number);
  console.log('TEST 2 PASSED: Pre-retry reconcile successfully recovered invoice #' + providerRecord2.invoice_number + ' without calling issue()\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Non-Timeout Error Boundary (Validation / Business Errors)
  // ---------------------------------------------------------------------------
  console.log('>>> TEST 3: Non-timeout business/validation error does NOT call getStatus');
  const saleId3 = 'sale_validation_case_003';
  const sale3 = {
    id: saleId3,
    code: 'PB-20260929-T003',
    customer_label: 'Khách sai thuế',
    subtotal: 500000,
    items: [{ itemId: 'item_03', name: 'Sản phẩm C', quantity: 1, unitPrice: 500000, lineTotal: 500000 }]
  };
  const draft3 = createInvoiceDraftFromSale(sale3);

  const callHistory3 = [];
  const mockGatewayCaller3 = async ({ action, idempotencyKey }) => {
    callHistory3.push({ action, idempotencyKey });
    if (action === 'issue') {
      const valError = new Error('HTTP 400 Bad Request: Mã số thuế người mua không hợp lệ theo quy chuẩn Nghị định 123');
      valError.status = 400;
      throw valError;
    }
    if (action === 'getStatus') {
      throw new Error('FATAL: getStatus() was called for a validation error!');
    }
  };

  let caughtError3 = null;
  try {
    await issueInvoice(draft3, {
      actor: 'Thu ngân số 3',
      gatewayCaller: mockGatewayCaller3
    });
  } catch (err) {
    caughtError3 = err;
  }

  assert.ok(caughtError3, 'Must re-throw the validation error');
  assert.match(caughtError3.message, /400 Bad Request/);
  assert.strictEqual(callHistory3.length, 1, 'Only 1 call should be made');
  assert.strictEqual(callHistory3[0].action, 'issue');
  assert.strictEqual(callHistory3.filter(c => c.action === 'getStatus').length, 0, 'getStatus() must NEVER be called for validation errors');
  assert.strictEqual(draft3.status, InvoiceStatus.DRAFT, 'Draft must remain DRAFT');
  console.log('TEST 3 PASSED: Validation error re-thrown immediately without calling getStatus()\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Timeout where Request Never Reached Provider (NOT_FOUND on getStatus)
  // ---------------------------------------------------------------------------
  console.log('>>> TEST 4: Timeout where request never reached provider (NOT_FOUND on getStatus)');
  const saleId4 = 'sale_notfound_case_004';
  const sale4 = {
    id: saleId4,
    code: 'PB-20260929-T004',
    customer_label: 'Khách rớt mạng trước khi tới provider',
    subtotal: 300000,
    items: [{ itemId: 'item_04', name: 'Sản phẩm D', quantity: 1, unitPrice: 300000, lineTotal: 300000 }]
  };
  const draft4 = createInvoiceDraftFromSale(sale4);

  const callHistory4 = [];
  const mockGatewayCaller4 = async ({ action, idempotencyKey }) => {
    callHistory4.push({ action, idempotencyKey });
    if (action === 'issue') {
      const netError = new Error('TypeError: fetch failed - network socket closed prematurely');
      throw netError;
    }
    if (action === 'getStatus') {
      return await mockInvoiceProvider.getStatus({ idempotencyKey });
    }
  };

  let caughtError4 = null;
  try {
    await issueInvoice(draft4, {
      actor: 'Thu ngân số 4',
      gatewayCaller: mockGatewayCaller4
    });
  } catch (err) {
    caughtError4 = err;
  }

  assert.ok(caughtError4, 'Must throw error when provider has no record');
  assert.strictEqual(caughtError4.code, 'TIMEOUT_RECONCILED_NOT_FOUND');
  assert.strictEqual(caughtError4.can_retry, true, 'Error must indicate that safe retry is possible');
  assert.strictEqual(callHistory4.length, 2, 'Must have exactly 2 calls: issue then getStatus');
  assert.strictEqual(callHistory4[0].action, 'issue');
  assert.strictEqual(callHistory4[1].action, 'getStatus');
  assert.strictEqual(callHistory4.filter(c => c.action === 'issue').length, 1, 'Must NOT blindly re-issue!');
  assert.strictEqual(draft4.status, InvoiceStatus.DRAFT, 'Draft remains DRAFT until safe reissue');
  console.log('TEST 4 PASSED: Timeout checked via getStatus, NOT_FOUND confirmed, no blind reissue\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Error Classifier Unit Tests
  // ---------------------------------------------------------------------------
  console.log('>>> TEST 5: isNetworkOrTimeoutError Classifier Unit Tests');
  assert.strictEqual(isNetworkOrTimeoutError(new Error('ETIMEDOUT: Connection timed out')), true);
  assert.strictEqual(isNetworkOrTimeoutError(new Error('TypeError: Failed to fetch')), true);
  assert.strictEqual(isNetworkOrTimeoutError(new Error('TypeError: fetch failed')), true);
  assert.strictEqual(isNetworkOrTimeoutError(new Error('Mất kết nối máy chủ dịch vụ hóa đơn')), true);
  assert.strictEqual(isNetworkOrTimeoutError(new Error('Client network connection lost')), true);
  assert.strictEqual(isNetworkOrTimeoutError({ name: 'TimeoutError', message: 'Timeout' }), true);
  assert.strictEqual(isNetworkOrTimeoutError({ status: 504, message: 'Gateway Timeout' }), true);
  assert.strictEqual(isNetworkOrTimeoutError({ status: 408, message: 'Request Timeout' }), true);

  assert.strictEqual(isNetworkOrTimeoutError(new Error('Mã số thuế không đúng cấu trúc 10 hoặc 14 số')), false);
  assert.strictEqual(isNetworkOrTimeoutError(new Error('HTTP 400 Bad Request: Dữ liệu hóa đơn thiếu buyer')), false);
  assert.strictEqual(isNetworkOrTimeoutError(new Error('HTTP 403 Forbidden: Invalid scope')), false);
  assert.strictEqual(isNetworkOrTimeoutError(new Error('Chứng thư số nhà cung cấp đã hết hạn')), false);
  assert.strictEqual(isNetworkOrTimeoutError(null), false);
  console.log('TEST 5 PASSED: Error classification correctly distinguishes network/timeout vs business errors\n');

  console.log('================================================================');
  console.log(' ALL 5 TESTS PASSED: INVARIANT BLIND_REISSUE_ON_TIMEOUT = 0 HELD');
  console.log('================================================================');
}

runBatch3TimeoutReconcileTests().catch(err => {
  console.error('\n!!! TEST FAILED WITH EXCEPTION !!!');
  console.error(err);
  process.exit(1);
});
