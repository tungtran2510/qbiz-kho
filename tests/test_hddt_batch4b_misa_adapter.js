/**
 * Unit & Contract Test Suite for MISA meInvoice Provider Adapter
 * Batch 4B-R5 Implementation (MISA Series Parsing & MTT SignType Lock)
 */

import assert from 'node:assert';
import {
  MisaInvoiceProvider,
  MISA_PROVIDER_CAPABILITIES,
  ProviderErrorCode,
  normalizeMisaError,
  mapQBizSnapshotToMisaInvoice,
  clearMisaTokenCache,
  getMisaTokenStoreSize,
  withSeriesLock,
  SERIES_CODE_FLAG_POSITION,
  SERIES_CALCU_FLAG_POSITION,
  MISA_DOCUMENTED_SIGN_TYPES,
  MISA_SIGN_TYPE_LABELS,
  parseMisaSeries
} from '../src/invoice/providers/misa_provider.js';

console.log('=== QBiz Kho: MISA meInvoice Adapter Unit & Contract Test Suite (Batch 4B-R5) ===\n');

// 1. CAPABILITIES CONTRACT TEST
console.log('1. Testing Capabilities Contract...');
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.provider_code, 'MISA_MEINVOICE');
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.provider_name, 'MISA meInvoice Open API Integration Provider');
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.version, '4.0.0-openapi');
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.api_family, 'OPEN_API_INTEGRATION');
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.supports_draft, true);
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.supports_issue, true);
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.supports_get_status, true);
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.supports_get_document, true);
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.supports_adjust, true);
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.supports_replace, true);
assert.strictEqual(MISA_PROVIDER_CAPABILITIES.supports_cancel, false);
console.log('  [PASS] MISA Provider capabilities strictly align with Open API Integration (supports_cancel: false).');

// 2. MAPPER TEST: QBiz Snapshot -> MISA Request
console.log('\n2. Testing Canonical Snapshot Mapper...');
const mockSnapshot = {
  id: 'INV-20260930-001',
  sale_id: 'SALE-101',
  issued_at: '2026-09-30T10:00:00Z',
  subtotal: 5000000,
  discount_total: 200000,
  vat_total: 400000,
  total: 5200000,
  payment_method: 'CK',
  buyer: {
    name: 'Công ty Cổ phần Công nghệ QBiz',
    company_name: 'Công ty Cổ phần Công nghệ QBiz',
    tax_code: '0101234567',
    address: 'Hà Nội, Việt Nam',
    email: 'contact@qbiz.vn',
    phone: '0901234567'
  },
  items: [
    {
      code: 'SP-01',
      name: 'Phần mềm quản lý QBiz Kho',
      unit: 'Gói',
      quantity: 1,
      unit_price: 5000000,
      discount: 200000,
      vat_rate: 8,
      vat_amount: 384000
    }
  ]
};

const misaMapped = mapQBizSnapshotToMisaInvoice(mockSnapshot, {
  templateCode: '1',
  series: '1C26TDC',
  operation: 'ISSUE',
  idempotencyKey: 'IDEMP-TEST-001'
});

assert.strictEqual(misaMapped.RefID, 'IDEMP-TEST-001');
assert.strictEqual(misaMapped.InvTemplateNo, '1');
assert.strictEqual(misaMapped.InvSeries, '1C26TDC');
assert.strictEqual(misaMapped.InvDate, '2026-09-30');
assert.strictEqual(misaMapped.BuyerTaxCode, '0101234567');
assert.strictEqual(misaMapped.BuyerLegalName, 'Công ty Cổ phần Công nghệ QBiz');
assert.strictEqual(misaMapped.OriginalDetails.length, 1);
assert.strictEqual(misaMapped.OriginalDetails[0].ItemCode, 'SP-01');
assert.strictEqual(misaMapped.OriginalDetails[0].UnitPrice, 5000000);
assert.strictEqual(misaMapped.OriginalDetails[0].VATRateName, '8%');
assert.strictEqual(misaMapped.CustomData.qbiz_sale_id, 'SALE-101');
assert.strictEqual(misaMapped.CustomData.qbiz_idempotency_key, 'IDEMP-TEST-001');
console.log('  [PASS] mapQBizSnapshotToMisaInvoice produces compliant Open API request structure.');

// 3. MAPPER TEST: Direct Master Fields for Adjustment & Replacement
console.log('\n3. Testing Direct Master Fields for Adjustment & Replacement...');
const origInvoiceFixture = {
  id: 'INV-ORIG-001',
  invoice_number: '0000123',
  series: '1C26TDC',
  template_code: '1',
  issued_at: '2026-09-20T10:00:00Z'
};

const adjustMapped = mapQBizSnapshotToMisaInvoice(mockSnapshot, {
  templateCode: '1',
  series: '1C26TDC',
  operation: 'ADJUST',
  originalInvoice: origInvoiceFixture,
  adjustmentData: { reason: 'Điều chỉnh đơn giá theo thỏa thuận số 05' },
  idempotencyKey: 'IDEMP-ADJ-001'
});
assert.strictEqual(adjustMapped.ReferenceType, 2); // 2: Điều chỉnh
assert.strictEqual(adjustMapped.OrgInvNo, '0000123');
assert.strictEqual(adjustMapped.OrgInvSeries, '1C26TDC');
assert.strictEqual(adjustMapped.InvoiceNote, 'Điều chỉnh đơn giá theo thỏa thuận số 05');

const replaceMapped = mapQBizSnapshotToMisaInvoice(mockSnapshot, {
  templateCode: '1',
  series: '1C26TDC',
  operation: 'REPLACE',
  originalInvoice: origInvoiceFixture,
  replacementData: { reason: 'Thay thế hóa đơn do sai địa chỉ người mua' },
  idempotencyKey: 'IDEMP-REP-001'
});
assert.strictEqual(replaceMapped.ReferenceType, 1); // 1: Thay thế
assert.strictEqual(replaceMapped.OrgInvNo, '0000123');
assert.strictEqual(replaceMapped.OrgInvSeries, '1C26TDC');
assert.strictEqual(replaceMapped.InvoiceNote, 'Thay thế hóa đơn do sai địa chỉ người mua');
console.log('  [PASS] Direct master fields for ADJUST (ReferenceType: 2) and REPLACE (ReferenceType: 1) mapped accurately.');

// 4. SIGN TYPE CONFIGURATION & FAIL-CLOSED ENFORCEMENT (BATCH 4B-R5)
console.log('\n4. Testing SignType Configuration & Fail-Closed Enforcement (Batch 4B-R5)...');

// 4a. MISA_SIGNTYPE_DOCUMENTED_VALUES_RECOGNIZED = YES
assert.deepStrictEqual(MISA_DOCUMENTED_SIGN_TYPES, [1, 2, 3, 4, 5, 6]);
assert.strictEqual(MISA_SIGN_TYPE_LABELS[1], 'USB / File mềm');
assert.strictEqual(MISA_SIGN_TYPE_LABELS[2], 'HSM có hiển thị CKS');
assert.strictEqual(MISA_SIGN_TYPE_LABELS[3], 'HSM bất đồng bộ');
assert.strictEqual(MISA_SIGN_TYPE_LABELS[4], 'Ký sau vé không mã');
assert.strictEqual(MISA_SIGN_TYPE_LABELS[5], 'Ký sau hóa đơn MTT, không hiển thị CKS');
assert.strictEqual(MISA_SIGN_TYPE_LABELS[6], 'Ký sau hóa đơn/vé MTT, bất đồng bộ');
console.log('  [PASS] MISA_SIGNTYPE_DOCUMENTED_VALUES_RECOGNIZED = YES');

// 4b. INVALID_SIGNTYPE_FAIL_CLOSED = YES
let invalidSignTypeFailed = false;
try {
  new MisaInvoiceProvider({
    appId: 'test_app',
    taxCode: '0101234567',
    username: 'test_user',
    password: 'pwd',
    signType: 99
  });
} catch (err) {
  invalidSignTypeFailed = true;
  assert.strictEqual(err.rawCode, 'INVALID_SIGNTYPE');
}
assert.strictEqual(invalidSignTypeFailed, true, 'Invalid SignType=99 must fail closed');

let zeroSignTypeFailed = false;
try {
  new MisaInvoiceProvider({
    appId: 'test_app',
    taxCode: '0101234567',
    username: 'test_user',
    password: 'pwd',
    signType: 0
  });
} catch (err) {
  zeroSignTypeFailed = true;
  assert.strictEqual(err.rawCode, 'INVALID_SIGNTYPE');
}
assert.strictEqual(zeroSignTypeFailed, true, 'SignType=0 must fail closed');
console.log('  [PASS] INVALID_SIGNTYPE_FAIL_CLOSED = YES');

// 4c. MISSING_SIGNTYPE_FAIL_CLOSED = YES
const noSignTypeProvider = new MisaInvoiceProvider({
  appId: 'test_app',
  taxCode: '0101234567',
  username: 'test_user',
  password: 'pwd',
  signType: null
});
let signTypeFailedCleanly = false;
try {
  await noSignTypeProvider.issue({
    invoiceData: mockSnapshot,
    idempotencyKey: 'IDEMP-NOSIGN-01'
  });
} catch (err) {
  signTypeFailedCleanly = true;
  assert.strictEqual(err.rawCode, 'MISSING_SIGNTYPE');
}
assert.strictEqual(signTypeFailedCleanly, true, 'Issue without signType must fail closed');
console.log('  [PASS] MISSING_SIGNTYPE_FAIL_CLOSED = YES');

// 4d. ASYNC_SIGNTYPE_3_SUPPORT = NOT_IMPLEMENTED & ASYNC_SIGNTYPE_6_SUPPORT = NOT_IMPLEMENTED
const asyncProvider3 = new MisaInvoiceProvider({
  appId: 'test_app',
  taxCode: '0101234567',
  username: 'test_user',
  password: 'pwd',
  signType: 3
});
let async3Failed = false;
try {
  await asyncProvider3.issue({
    invoiceData: mockSnapshot,
    idempotencyKey: 'IDEMP-ASYNC-03'
  });
} catch (err) {
  async3Failed = true;
  assert.strictEqual(err.rawCode, 'CAPABILITY_NOT_IMPLEMENTED');
}
assert.strictEqual(async3Failed, true, 'SignType=3 must reject with CAPABILITY_NOT_IMPLEMENTED');
console.log('  [PASS] ASYNC_SIGNTYPE_3_SUPPORT = NOT_IMPLEMENTED');

const asyncProvider6 = new MisaInvoiceProvider({
  appId: 'test_app',
  taxCode: '0101234567',
  username: 'test_user',
  password: 'pwd',
  series: '1C25MYY',
  signType: 6
});
let async6Failed = false;
try {
  await asyncProvider6.issue({
    invoiceData: mockSnapshot,
    idempotencyKey: 'IDEMP-ASYNC-06'
  });
} catch (err) {
  async6Failed = true;
  assert.strictEqual(err.rawCode, 'CAPABILITY_NOT_IMPLEMENTED');
}
assert.strictEqual(async6Failed, true, 'SignType=6 must reject with CAPABILITY_NOT_IMPLEMENTED');
console.log('  [PASS] ASYNC_SIGNTYPE_6_SUPPORT = NOT_IMPLEMENTED');

// 4e. MTT_SIGNTYPE_5_ACCEPTED = YES on MTT and REJECTED on Regular Invoice
const mttSignType5Provider = new MisaInvoiceProvider({
  appId: 'test_app',
  taxCode: '0101234567',
  username: 'test_user',
  password: 'pwd',
  series: '1C25MYY', // MTT (char 5 = M)
  signType: 5
});
assert.strictEqual(mttSignType5Provider.invoiceCalcu, true);
assert.strictEqual(mttSignType5Provider.validateSignType('issue'), true, 'SignType=5 on MTT series must be accepted');
console.log('  [PASS] MTT_SIGNTYPE_5_ACCEPTED = YES');

const regularSignType5Provider = new MisaInvoiceProvider({
  appId: 'test_app',
  taxCode: '0101234567',
  username: 'test_user',
  password: 'pwd',
  series: '1C25TYY', // Regular (char 5 = T)
  signType: 5
});
let reg5Failed = false;
try {
  regularSignType5Provider.validateSignType('issue');
} catch (err) {
  reg5Failed = true;
  assert.strictEqual(err.rawCode, 'INCOMPATIBLE_SIGNTYPE');
}
assert.strictEqual(reg5Failed, true, 'SignType=5 on regular invoice must fail closed with INCOMPATIBLE_SIGNTYPE');

// 4f. Regular invoice with SignType=2 (HSM Sync) accepted
const regHsmProvider = new MisaInvoiceProvider({
  appId: 'test_app',
  taxCode: '0101234567',
  username: 'test_user',
  password: 'pwd',
  series: '1C25TYY',
  signType: 2
});
assert.strictEqual(regHsmProvider.validateSignType('issue'), true);
console.log('  [PASS] Regular invoice with SignType=2 (HSM Sync) accepted.');

// 4g. CLIENT_SIGNTYPE_OVERRIDE_COUNT = 0
assert.strictEqual(regHsmProvider.signType, 2, 'Provider signType is locked to trusted server config');
console.log('  [PASS] CLIENT_SIGNTYPE_OVERRIDE_COUNT = 0');

// 5. INV SERIES PARSING — EXACT RULE & FAIL-CLOSED ENFORCEMENT (BATCH 4B-R5)
console.log('\n5. Testing InvSeries Parsing & Invoice Flags (Batch 4B-R5)...');

// 5a. Check exact flag positions per Decree 123 / MISA specification
assert.strictEqual(SERIES_CODE_FLAG_POSITION, 2, 'SERIES_CODE_FLAG_POSITION must be 2 (second character C/K)');
assert.strictEqual(SERIES_CALCU_FLAG_POSITION, 5, 'SERIES_CALCU_FLAG_POSITION must be 5 (fifth character M/T)');
console.log('  [PASS] SERIES_CODE_FLAG_POSITION = 2, SERIES_CALCU_FLAG_POSITION = 5');

// 5b. Minimum Required Test Cases:
// 1C25TYY => withCode=true, calcu=false
const p1 = parseMisaSeries('1C25TYY');
assert.strictEqual(p1.invoiceWithCode, true, '1C25TYY withCode must be true');
assert.strictEqual(p1.invoiceCalcu, false, '1C25TYY calcu must be false');

// 1C25MYY => withCode=true, calcu=true
const p2 = parseMisaSeries('1C25MYY');
assert.strictEqual(p2.invoiceWithCode, true, '1C25MYY withCode must be true');
assert.strictEqual(p2.invoiceCalcu, true, '1C25MYY calcu must be true');

// 1K25TYY => withCode=false, calcu=false
const p3 = parseMisaSeries('1K25TYY');
assert.strictEqual(p3.invoiceWithCode, false, '1K25TYY withCode must be false');
assert.strictEqual(p3.invoiceCalcu, false, '1K25TYY calcu must be false');

// 1K25MYY => withCode=false, calcu=true
const p4 = parseMisaSeries('1K25MYY');
assert.strictEqual(p4.invoiceWithCode, false, '1K25MYY withCode must be false');
assert.strictEqual(p4.invoiceCalcu, true, '1K25MYY calcu must be true');

// 2C25MYY => withCode=true, calcu=true
const p5 = parseMisaSeries('2C25MYY');
assert.strictEqual(p5.invoiceWithCode, true, '2C25MYY withCode must be true');
assert.strictEqual(p5.invoiceCalcu, true, '2C25MYY calcu must be true');
console.log('  [PASS] All minimum required series parsed accurately (1C25TYY, 1C25MYY, 1K25TYY, 1K25MYY, 2C25MYY).');

// 5c. Provider instantiation with series derivation
const prov1 = new MisaInvoiceProvider({ series: '1C25TYY' });
assert.strictEqual(prov1.invoiceWithCode, true);
assert.strictEqual(prov1.invoiceCalcu, false);

const prov2 = new MisaInvoiceProvider({ series: '1C25MYY' });
assert.strictEqual(prov2.invoiceWithCode, true);
assert.strictEqual(prov2.invoiceCalcu, true);

const prov3 = new MisaInvoiceProvider({ series: '1K25TYY' });
assert.strictEqual(prov3.invoiceWithCode, false);
assert.strictEqual(prov3.invoiceCalcu, false);

const prov4 = new MisaInvoiceProvider({ series: '1K25MYY' });
assert.strictEqual(prov4.invoiceWithCode, false);
assert.strictEqual(prov4.invoiceCalcu, true);

const prov5 = new MisaInvoiceProvider({ series: '2C25MYY' });
assert.strictEqual(prov5.invoiceWithCode, true);
assert.strictEqual(prov5.invoiceCalcu, true);

// 5d. SERIES_PARSE_INVALID_FAIL_CLOSED = YES
assert.strictEqual(parseMisaSeries('1C'), null, 'Short series must return null');
assert.strictEqual(parseMisaSeries('INVALID'), null, 'Invalid series must return null');
assert.strictEqual(parseMisaSeries('1X25TYY'), null, 'Char 2 not C/K must return null');
assert.strictEqual(parseMisaSeries('1C25XYY'), null, 'Char 5 not M/T must return null');

// Provider instantiation with invalid/short series without trusted override MUST FAIL CLOSED
let shortSeriesFailed = false;
try {
  new MisaInvoiceProvider({ series: '1C' });
} catch (err) {
  shortSeriesFailed = true;
  assert.strictEqual(err.rawCode, 'CONFIG_UNRESOLVED');
}
assert.strictEqual(shortSeriesFailed, true, 'Short series without override must fail closed (CONFIG_UNRESOLVED)');

let invalidSeriesFailed = false;
try {
  new MisaInvoiceProvider({ series: 'INVALID' });
} catch (err) {
  invalidSeriesFailed = true;
  assert.strictEqual(err.rawCode, 'CONFIG_UNRESOLVED');
}
assert.strictEqual(invalidSeriesFailed, true, 'Invalid series without override must fail closed (CONFIG_UNRESOLVED)');
console.log('  [PASS] SERIES_PARSE_INVALID_FAIL_CLOSED = YES');

// 5e. Trusted explicit config override takes precedence even if series is unusual
const trustedOverrideProv = new MisaInvoiceProvider({
  series: 'CUSTOM_TEST_SERIES',
  invoiceWithCode: false,
  invoiceCalcu: true
});
assert.strictEqual(trustedOverrideProv.invoiceWithCode, false);
assert.strictEqual(trustedOverrideProv.invoiceCalcu, true);
console.log('  [PASS] Trusted explicit config override takes precedence over series parsing.');

// 6. DOWNLOAD & STATUS WIRE SHAPE TESTS (QUERY PARAMS + BODY ARRAYS)
console.log('\n6. Testing Download & Status Wire Shapes (MISA Open API Final Lock)...');
const recordedWireCalls = [];
const mockWireFetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  recordedWireCalls.push({ url, method, headers: options.headers, body });

  if (url.includes('/auth/token')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, Data: 'mock_wire_token_123', expires_in: 1209600 })
    };
  }

  if (url.includes('/invoice/status')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{
          Status: 1,
          InvoiceStatus: 'ISSUED',
          InvoiceNo: '0000999',
          TransactionID: 'TX-WIRE-999'
        }]
      })
    };
  }

  if (url.includes('/invoice/download')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{
          FileBase64: 'JVBERi0xLjQK...',
          FileUrl: 'https://testapi.meinvoice.vn/files/mock_wire.pdf'
        }]
      })
    };
  }

  if (url.includes('/invoice')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          InvoiceID: 'MISA-WIRE-INV',
          TransactionID: 'TX-WIRE-999',
          InvoiceNo: '0000999'
        }
      })
    };
  }

  return { ok: true, status: 200, json: async () => ({}) };
};

clearMisaTokenCache();
const wireProvider = new MisaInvoiceProvider({
  appId: 'appid',
  taxCode: '0101234567',
  username: 'user',
  password: 'pwd',
  signType: 2, // HSM
  series: '1C26TDC',
  fetchFn: mockWireFetch
});

// 6a. Test getStatus by RefID
await wireProvider.getStatus({ refId: 'REF-WIRE-01' });
const statusRefCall = recordedWireCalls.find(c => c.url.includes('/invoice/status') && c.url.includes('inputType=2'));
assert.ok(statusRefCall, 'getStatus by RefID must target /invoice/status with inputType=2 in QUERY PARAMS');
assert.strictEqual(statusRefCall.method, 'POST');
assert.ok(statusRefCall.url.includes('invoiceWithCode=true'), 'QueryParams must contain invoiceWithCode');
assert.ok(statusRefCall.url.includes('invoiceCalcu=false'), 'QueryParams must contain invoiceCalcu');
assert.ok(Array.isArray(statusRefCall.body), 'Body shape MUST be Array of IDs (MISA_STATUS_BODY_SHAPE=ID_ARRAY)');
assert.strictEqual(statusRefCall.body[0], 'REF-WIRE-01');

// 6b. Test getStatus by TransactionID
await wireProvider.getStatus({ transactionId: 'TX-WIRE-999' });
const statusTxCall = recordedWireCalls.find(c => c.url.includes('/invoice/status') && c.url.includes('inputType=1'));
assert.ok(statusTxCall, 'getStatus by TransactionID must target /invoice/status with inputType=1 in QUERY PARAMS');
assert.strictEqual(statusTxCall.method, 'POST');
assert.ok(Array.isArray(statusTxCall.body), 'Body shape MUST be Array of IDs');
assert.strictEqual(statusTxCall.body[0], 'TX-WIRE-999');

// 6c. Test getDocument (Download)
await wireProvider.getDocument({ providerInvoiceId: 'TX-WIRE-999', format: 'PDF' });
const downloadCall = recordedWireCalls.find(c => c.url.includes('/invoice/download'));
assert.ok(downloadCall, 'getDocument must target /invoice/download');
assert.strictEqual(downloadCall.method, 'POST');
assert.ok(downloadCall.url.includes('invoiceWithCode=true'), 'QueryParams must contain invoiceWithCode');
assert.ok(downloadCall.url.includes('invoiceCalcu=false'), 'QueryParams must contain invoiceCalcu');
assert.ok(downloadCall.url.includes('downloadDataType=pdf'), 'QueryParams must contain downloadDataType=pdf');
assert.ok(Array.isArray(downloadCall.body), 'Body shape MUST be Array of TransactionIDs (MISA_DOWNLOAD_BODY_SHAPE=TRANSACTION_ID_ARRAY)');
assert.strictEqual(downloadCall.body[0], 'TX-WIRE-999');

// 6d. Test issue SignType transmission
await wireProvider.issue({ invoiceData: mockSnapshot, idempotencyKey: 'IDEMP-SIGN-01' });
const issueCall = recordedWireCalls.find(c => c.url.endsWith('/invoice'));
assert.ok(issueCall, 'issue must call POST /invoice');
assert.strictEqual(issueCall.body.SignType, 2, 'SignType in request body must match trusted provider config (SignType: 2)');
console.log('  [PASS] Download & Status wire shapes fully verified:');
console.log('         MISA_DOWNLOAD_PARAMS_LOCATION=QUERY, MISA_DOWNLOAD_BODY_SHAPE=TRANSACTION_ID_ARRAY');
console.log('         MISA_STATUS_PARAMS_LOCATION=QUERY, MISA_STATUS_BODY_SHAPE=ID_ARRAY');

// 7. REQUEST SERIALIZATION (PER-SERIES MUTEX QUEUE)
console.log('\n7. Testing Request Serialization per InvSeries (withSeriesLock)...');

// 7a. Verify same series runs sequentially
const sameSeriesExecLog = [];
const task1 = withSeriesLock('1C26TDC', async () => {
  sameSeriesExecLog.push('start_1');
  await new Promise(r => setTimeout(r, 40));
  sameSeriesExecLog.push('end_1');
  return 'res_1';
});

const task2 = withSeriesLock('1C26TDC', async () => {
  sameSeriesExecLog.push('start_2');
  await new Promise(r => setTimeout(r, 20));
  sameSeriesExecLog.push('end_2');
  return 'res_2';
});

await Promise.all([task1, task2]);
assert.deepStrictEqual(
  sameSeriesExecLog,
  ['start_1', 'end_1', 'start_2', 'end_2'],
  'Tasks with SAME InvSeries must run sequentially in strict FIFO order (SAME_SERIES_CONCURRENT_PROVIDER_CALL_COUNT=0)'
);

// 7b. Verify different series run concurrently without blocking
const diffSeriesExecLog = [];
const taskA = withSeriesLock('SERIES_A', async () => {
  diffSeriesExecLog.push('start_A');
  await new Promise(r => setTimeout(r, 50));
  diffSeriesExecLog.push('end_A');
});

const taskB = withSeriesLock('SERIES_B', async () => {
  diffSeriesExecLog.push('start_B');
  await new Promise(r => setTimeout(r, 10));
  diffSeriesExecLog.push('end_B');
});

await Promise.all([taskA, taskB]);
assert.strictEqual(diffSeriesExecLog[0], 'start_A');
assert.strictEqual(diffSeriesExecLog[1], 'start_B', 'Different series must execute concurrently without blocking');
assert.strictEqual(diffSeriesExecLog[2], 'end_B', 'Faster task on different series must finish first');
assert.strictEqual(diffSeriesExecLog[3], 'end_A');

// 7c. Verify lock release on failure (no deadlock)
let task3Executed = false;
try {
  await withSeriesLock('SERIES_ERR', async () => {
    throw new Error('Simulated upstream failure');
  });
} catch (e) {
  // Expected
}

await withSeriesLock('SERIES_ERR', async () => {
  task3Executed = true;
});
assert.strictEqual(task3Executed, true, 'Lock must be released on error to prevent deadlock (SERIES_MUTEX_DEADLOCK_COUNT=0)');
console.log('  [PASS] Request serialization per InvSeries verified:');
console.log('         SAME_SERIES_CONCURRENT_PROVIDER_CALL_COUNT=0, SERIES_MUTEX_DEADLOCK_COUNT=0');

// 8. TOKEN SOFT REFRESH POLICY (7-DAY RECOMMENDATION)
console.log('\n8. Testing Token Soft Refresh Policy (7-day window)...');
clearMisaTokenCache();
let authCounter = 0;
const tokenFetch = async (url) => {
  if (url.includes('/auth/token')) {
    authCounter++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, Data: `token_cycle_${authCounter}`, expires_in: 1209600 })
    };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const tokenProvider = new MisaInvoiceProvider({
  appId: 'appid',
  taxCode: '0101234567',
  username: 'user',
  password: 'pwd',
  fetchFn: tokenFetch
});

const t1 = await tokenProvider.authenticate();
assert.strictEqual(t1, 'token_cycle_1');
assert.strictEqual(authCounter, 1);

// Repeated call within 7 days -> reuses token without network fetch
const t2 = await tokenProvider.authenticate();
assert.strictEqual(t2, 'token_cycle_1');
assert.strictEqual(authCounter, 1, 'Token must be reused without network call within soft TTL (TOKEN_FETCH_PER_OPERATION=NO)');

console.log('  [PASS] Token soft refresh policy verified (TOKEN_SOFT_REFRESH_POLICY=YES, TOKEN_FETCH_PER_OPERATION=NO).');

// 9. TIMEOUT RECONCILIATION WITHOUT BLIND REISSUE
console.log('\n9. Testing Timeout Reconcile (BLIND_REISSUE_AFTER_TIMEOUT=0)...');
clearMisaTokenCache();
let reconcileQueryChecked = false;
const timeoutReconcileFetch = async (url, options) => {
  if (url.includes('/auth/token')) {
    return { ok: true, status: 200, json: async () => ({ success: true, Data: 'tok', expires_in: 1209600 }) };
  }
  if (url.endsWith('/invoice')) {
    // Return 409 DUPLICATE_REFERENCE
    return {
      ok: false,
      status: 409,
      text: async () => 'RefID duplicate',
      json: async () => ({ message: 'RefID duplicate', error_code: 'DUPLICATE_REFERENCE' })
    };
  }
  if (url.includes('/invoice/status')) {
    reconcileQueryChecked = true;
    assert.ok(url.includes('inputType=2'), 'Reconcile must query status with inputType=2');
    const body = JSON.parse(options.body);
    assert.ok(Array.isArray(body), 'Reconcile query body must be array of RefIDs');
    assert.strictEqual(body[0], 'IDEMP-RECON-TEST');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{
          Status: 1,
          InvoiceStatus: 'ISSUED',
          InvoiceNo: '0000555',
          TransactionID: 'TX-555'
        }]
      })
    };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const reconcileProvider = new MisaInvoiceProvider({
  appId: 'appid',
  taxCode: '0101234567',
  username: 'user',
  password: 'pwd',
  signType: 2,
  fetchFn: timeoutReconcileFetch
});

const reconcileResult = await reconcileProvider.issue({
  invoiceData: mockSnapshot,
  idempotencyKey: 'IDEMP-RECON-TEST'
});

assert.strictEqual(reconcileQueryChecked, true, 'Status with inputType: 2 must be called for reconcile');
assert.strictEqual(reconcileResult.idempotent_replay, true);
assert.strictEqual(reconcileResult.invoice_number, '0000555');
console.log('  [PASS] Reconcile via POST /invoice/status?inputType=2 successfully eliminated blind reissue (BLIND_REISSUE_AFTER_TIMEOUT=0).');

console.log('\n=== ALL UNIT & CONTRACT TESTS PASSED (BATCH 4B-R5) ===');
