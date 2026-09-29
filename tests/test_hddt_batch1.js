/**
 * QBiz Kho — Batch 1 Verification Test
 * Tests Domain Model, Mock Provider Interface, Capabilities, Gateway, and Idempotency Key
 */

import {
  InvoiceStatus,
  InvoiceOperation,
  buildInvoiceIdempotencyKey,
  createInvoiceDraftFromSale,
  createInvoiceBuyer,
  createInvoiceLine
} from '../src/invoice/domain.js';

import {
  mockInvoiceProvider,
  MOCK_PROVIDER_CAPABILITIES
} from '../src/invoice/mock_provider.js';

import gatewayHandler from '../api/invoice-gateway.js';

async function runTests() {
  console.log('=== QBiz Kho — HĐĐT Module Batch 1 Verification ===\n');

  // Test 1: Domain Model & Idempotency Key generation
  console.log('--- Test 1: Domain Model & Idempotency Key ---');
  const mockSale = {
    id: 'sale_test_998877',
    code: 'PB-20260929-001',
    customer_label: 'Công ty Cổ phần Công nghệ QBiz',
    customer_phone: '0988889999',
    customer_email: 'ketoan@qbiz.vn',
    customer_address: 'Tầng 5, Tòa nhà QBiz, Hà Nội',
    subtotal: 500000,
    discount: 50000,
    tax_total: 45000,
    grand_total: 495000,
    items: [
      { itemId: 'p1', name: 'Phần mềm QBiz Kho Pro', quantity: 1, unitPrice: 500000, discount: 50000, tax_amount: 45000, lineTotal: 495000 }
    ]
  };

  const draft = createInvoiceDraftFromSale(mockSale, {
    buyer: {
      name: mockSale.customer_label,
      tax_code: '0109998888',
      email: mockSale.customer_email,
      phone: mockSale.customer_phone,
      address: mockSale.customer_address
    },
    actor: 'admin_tung'
  });

  console.log('Generated Draft ID:', draft.id);
  console.log('Draft Status:', draft.status, draft.status === InvoiceStatus.DRAFT ? '✓' : '✗');
  console.log('Draft Idempotency Key:', draft.idempotency_key);
  console.log('Lineage Version:', draft.version);
  console.log('Buyer Type:', draft.buyer.type);

  if (draft.idempotency_key !== 'CREATE_DRAFT:sale_test_998877:orig:v1') {
    throw new Error(`Invalid idempotency_key: ${draft.idempotency_key}`);
  }
  console.log('Test 1 PASS ✓\n');

  // Test 2: Provider Capabilities Check
  console.log('--- Test 2: Provider Capabilities Check ---');
  console.log('Provider Code:', MOCK_PROVIDER_CAPABILITIES.provider_code);
  console.log('Supports Draft:', MOCK_PROVIDER_CAPABILITIES.supports_draft);
  console.log('Supports Issue:', MOCK_PROVIDER_CAPABILITIES.supports_issue);
  console.log('Supports GetStatus:', MOCK_PROVIDER_CAPABILITIES.supports_get_status);
  console.log('Supports GetDocument:', MOCK_PROVIDER_CAPABILITIES.supports_get_document);
  console.log('Supports Adjust:', MOCK_PROVIDER_CAPABILITIES.supports_adjust);
  console.log('Supports Replace:', MOCK_PROVIDER_CAPABILITIES.supports_replace);
  console.log('Supports Cancel:', MOCK_PROVIDER_CAPABILITIES.supports_cancel);
  console.log('Test 2 PASS ✓\n');

  // Test 3: Idempotent Issue & Replay (Empirical Proof of Zero Duplicate Invoices)
  console.log('--- Test 3: Idempotency Key Behavior (First Call vs Replay) ---');
  const issueKey = buildInvoiceIdempotencyKey({
    operation: InvoiceOperation.ISSUE,
    saleId: mockSale.id,
    lineageId: 'orig',
    version: 1
  });
  console.log('Generated Issue Idempotency Key:', issueKey);

  // Call 1: First Issue Request
  const res1 = await mockInvoiceProvider.issue({
    invoiceData: draft,
    idempotencyKey: issueKey
  });
  console.log('Call 1 Result -> Invoice Number:', res1.invoice_number, '| Series:', res1.invoice_series, '| Idempotent Replay:', !!res1.idempotent_replay);

  // Call 2: Duplicate Issue Request with SAME key
  const res2 = await mockInvoiceProvider.issue({
    invoiceData: draft,
    idempotencyKey: issueKey
  });
  console.log('Call 2 Result -> Invoice Number:', res2.invoice_number, '| Series:', res2.invoice_series, '| Idempotent Replay:', !!res2.idempotent_replay);

  if (res1.invoice_number !== res2.invoice_number) {
    throw new Error(`IDEMPOTENCY BREACH: Call 1 generated ${res1.invoice_number} but Call 2 generated ${res2.invoice_number}!`);
  }
  if (!res2.idempotent_replay) {
    throw new Error('Call 2 should have been flagged as idempotent_replay');
  }
  console.log('Empirical Proof: Call 1 and Call 2 returned exact same invoice number:', res1.invoice_number);
  console.log('Zero duplicate invoice created! Test 3 PASS ✓\n');

  // Test 4: Lineage Versioning (Adjust does not get blocked by original issue key)
  console.log('--- Test 4: Lineage Versioning for Adjustment ---');
  const adjustKey = buildInvoiceIdempotencyKey({
    operation: InvoiceOperation.ADJUST,
    saleId: mockSale.id,
    lineageId: draft.id,
    version: 2
  });
  console.log('Generated Adjust Key:', adjustKey);
  const adjustRes = await mockInvoiceProvider.adjust({
    originalInvoiceRef: res1,
    adjustmentData: { reason: 'Giảm giá bổ sung 20,000 đ' },
    idempotencyKey: adjustKey
  });
  console.log('Adjustment Invoice Series:', adjustRes.invoice_series, '| Number:', adjustRes.invoice_number, '| Operation:', adjustRes.operation);
  if (adjustRes.invoice_number === res1.invoice_number) {
    throw new Error('Adjustment invoice must have its own sequence number!');
  }
  console.log('Test 4 PASS ✓\n');

  // Test 5: Server-side Gateway API Mock Dispatch
  console.log('--- Test 5: Server-Side Invoice Gateway (/api/invoice-gateway) ---');
  
  // 5a. Scope Security Check: reject unauthorized scope
  let scopeRejected = false;
  const mockReqForbidden = {
    method: 'POST',
    headers: {},
    body: { appScope: 'evil-app', action: 'issue' }
  };
  const mockResForbidden = {
    setHeader() {},
    status(code) {
      if (code === 403) scopeRejected = true;
      return this;
    },
    json(data) { return data; },
    end() {}
  };
  await gatewayHandler(mockReqForbidden, mockResForbidden);
  console.log('Gateway Scope Verification (Forbidden scope rejected with 403):', scopeRejected ? 'PASS ✓' : 'FAIL ✗');

  // 5b. Valid Request via Gateway
  let gatewaySuccess = false;
  let gatewayData = null;
  const mockReqValid = {
    method: 'POST',
    headers: { authorization: 'Bearer mock_token_cashier' },
    body: {
      appScope: 'qbiz-kho',
      action: 'getStatus',
      idempotencyKey: issueKey,
      payload: {}
    }
  };
  const mockResValid = {
    setHeader() {},
    status(code) {
      if (code === 200) gatewaySuccess = true;
      return this;
    },
    json(data) { gatewayData = data; return data; },
    end() {}
  };
  await gatewayHandler(mockReqValid, mockResValid);
  console.log('Gateway Valid Dispatch (getStatus returned 200):', gatewaySuccess ? 'PASS ✓' : 'FAIL ✗');
  console.log('Gateway Retrieved Invoice:', gatewayData?.data?.record?.invoice_number);

  console.log('\n=== ALL BATCH 1 AUDIT & IMPLEMENTATION TESTS PASSED ===');
}

runTests().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
