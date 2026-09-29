/**
 * QBiz Kho — HĐĐT Batch 4B-LIVE-R1: Credential Onboarding & Template Discovery Unit Test Suite
 * Conforms strictly to specification in QBiz Kho - HĐĐT BATCH 4B-LIVE-R1
 * Tests P01 through P07:
 *   P01: no auth creds => blocked before network call
 *   P02: auth creds present, no series/sign type => runner attempts only M01+A02, not issue
 *   P03: template discovery response mocked at transport test level => parses active InvSeries correctly
 *   P04: multiple templates => no automatic owner selection
 *   P05: inactive templates excluded from selectable list
 *   P06: series/sign type missing => M02 not executed
 *   P07: no secret or token in output
 */

import assert from 'node:assert';
import {
  MisaInvoiceProvider,
  ProviderErrorCode,
  parseMisaSeries,
  formatSafeTemplateTable,
  clearMisaTokenCache
} from '../src/invoice/providers/misa_provider.js';
import { runLiveSandboxTests } from './run_misa_live_sandbox.js';

console.log('=== QBiz Kho: HĐĐT BATCH 4B-LIVE-R1 Credential Onboarding & Discovery Test Suite ===\n');

// Clear token cache before testing
clearMisaTokenCache();

// -----------------------------------------------------------------------------
// P01: No auth creds => blocked before network
// -----------------------------------------------------------------------------
console.log('Testing P01: No auth credentials blocks execution before network call...');
{
  const emptyProvider = new MisaInvoiceProvider({
    appId: '',
    taxCode: '',
    username: '',
    password: ''
  });

  assert.strictEqual(emptyProvider.hasCredentials(), false, 'hasCredentials must return false');

  let networkCalled = false;
  emptyProvider.fetchFn = async () => {
    networkCalled = true;
    throw new Error('Network should never be reached!');
  };

  let threwAuthError = false;
  try {
    await emptyProvider.authenticate();
  } catch (err) {
    threwAuthError = true;
    assert.strictEqual(err.errorCode, ProviderErrorCode.AUTH_ERROR);
    assert.strictEqual(err.rawCode, 'MISSING_MISA_CREDENTIALS');
  }

  assert.strictEqual(threwAuthError, true, 'Must throw MISSING_MISA_CREDENTIALS error');
  assert.strictEqual(networkCalled, false, 'Network must not be reached when credentials missing');

  // Verify runner returns BLOCKED_WAITING_CREDENTIALS without calling network
  const runnerResult = await runLiveSandboxTests({
    silent: true,
    env: {},
    fetchFn: async () => { throw new Error('Network should not be called'); }
  });

  assert.strictEqual(runnerResult.success, false);
  assert.strictEqual(runnerResult.gate, 'A');
  assert.strictEqual(runnerResult.verdict, 'BLOCKED_WAITING_CREDENTIALS');
  assert.strictEqual(runnerResult.exitCode, 2);
  assert.ok(runnerResult.missingAuth.includes('MISA_APP_ID'));
  assert.ok(runnerResult.missingAuth.includes('MISA_TAX_CODE'));
  assert.ok(runnerResult.missingAuth.includes('MISA_USERNAME'));
  assert.ok(runnerResult.missingAuth.includes('MISA_PASSWORD'));
  assert.ok(runnerResult.missingAuth.includes('QBIZ_INVOICE_PROVIDER'));

  console.log('  [PASS] P01: No auth credentials blocked before network (hasCredentials=false, MISSING_MISA_CREDENTIALS, exitCode=2).');
}

// -----------------------------------------------------------------------------
// Mock Data Fixture for Discovery
// -----------------------------------------------------------------------------
const FAKE_MISA_TEMPLATES_WITH_CODE = [
  {
    InvTemplateNo: '1',
    InvSeries: '1C26TDC',
    TemplateName: 'Hóa đơn GTGT có mã CQT (Mẫu 01)',
    Inactive: false,
    IsSendSummary: false
  },
  {
    InvTemplateNo: '2',
    InvSeries: '1C26MKT',
    TemplateName: 'Hóa đơn GTGT máy tính tiền có mã (Mẫu 02)',
    Inactive: false,
    IsSendSummary: false
  },
  {
    InvTemplateNo: '3',
    InvSeries: '1C25TOLD',
    TemplateName: 'Hóa đơn GTGT mẫu cũ ngừng dùng',
    Inactive: true,
    IsSendSummary: false
  }
];

const FAKE_MISA_TEMPLATES_NO_CODE = [
  {
    InvTemplateNo: '4',
    InvSeries: '1K26TNO',
    TemplateName: 'Hóa đơn GTGT không có mã CQT',
    Inactive: false,
    IsSendSummary: false
  }
];

function createMockFetch({ token = 'fake-test-jwt-bearer-token-1234567890abcdef' } = {}) {
  const calls = [];
  const fetchFn = async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || 'GET';
    calls.push({ url: urlStr, method, options });

    if (urlStr.includes('/auth/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ Data: token, expires_in: 1209600 }),
        text: async () => JSON.stringify({ Data: token })
      };
    }

    if (urlStr.includes('/invoice/templates')) {
      if (urlStr.includes('invoiceWithCode=true')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ Data: FAKE_MISA_TEMPLATES_WITH_CODE }),
          text: async () => JSON.stringify({ Data: FAKE_MISA_TEMPLATES_WITH_CODE })
        };
      } else {
        return {
          ok: true,
          status: 200,
          json: async () => ({ Data: FAKE_MISA_TEMPLATES_NO_CODE }),
          text: async () => JSON.stringify({ Data: FAKE_MISA_TEMPLATES_NO_CODE })
        };
      }
    }

    if (urlStr.includes('/invoice') && method === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ Data: [{ TransactionID: 'TX-MOCK-999', RefID: 'REF-01', InvNo: '0000001' }] }),
        text: async () => JSON.stringify({ Data: [{ TransactionID: 'TX-MOCK-999' }] })
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
      text: async () => 'Not found'
    };
  };

  return { fetchFn, calls };
}

// -----------------------------------------------------------------------------
// P02: Auth creds present, no series/sign type => attempts only M01+A02, not issue
// -----------------------------------------------------------------------------
console.log('\nTesting P02: Auth creds present without series/signType attempts only M01+A02, never issue...');
{
  clearMisaTokenCache();
  const { fetchFn, calls } = createMockFetch();

  const runnerResult = await runLiveSandboxTests({
    silent: true,
    env: {
      MISA_APP_ID: 'test_app_id',
      MISA_TAX_CODE: '0101234567',
      MISA_USERNAME: 'test_user',
      MISA_PASSWORD: 'test_password',
      QBIZ_INVOICE_PROVIDER: 'MISA_MEINVOICE'
      // Note: MISA_INVOICE_SERIES and MISA_SIGN_TYPE omitted
    },
    fetchFn
  });

  assert.strictEqual(runnerResult.success, true);
  assert.strictEqual(runnerResult.gate, 'A');
  assert.strictEqual(runnerResult.gateACompleted, true);
  assert.strictEqual(runnerResult.readyForOwnerTemplateSelection, true);
  assert.strictEqual(runnerResult.verdict, 'WAITING_OWNER_SELECTION');
  assert.strictEqual(runnerResult.exitCode, 0);

  // Check calls made: must include /auth/token and /invoice/templates, NEVER /invoice issue endpoint
  const hasAuthCall = calls.some(c => c.url.includes('/auth/token'));
  const hasTemplatesCall = calls.some(c => c.url.includes('/invoice/templates'));
  const hasIssueCall = calls.some(c => c.method === 'POST' && c.url.endsWith('/invoice'));

  assert.strictEqual(hasAuthCall, true, 'Must call /auth/token for M01');
  assert.strictEqual(hasTemplatesCall, true, 'Must call /invoice/templates for A02');
  assert.strictEqual(hasIssueCall, false, 'Must NEVER call issue endpoint in Gate A');

  console.log('  [PASS] P02: Gate A runs M01+A02 successfully, stops with READY_FOR_OWNER_TEMPLATE_SELECTION=YES without issue call.');
}

// -----------------------------------------------------------------------------
// P03: Template discovery parses active InvSeries correctly
// -----------------------------------------------------------------------------
console.log('\nTesting P03: Template discovery parses active InvSeries correctly (char 2 & char 5)...');
{
  clearMisaTokenCache();
  const { fetchFn } = createMockFetch();
  const provider = new MisaInvoiceProvider({
    appId: 'test_app_id',
    taxCode: '0101234567',
    username: 'test_user',
    password: 'test_password',
    fetchFn
  });

  const discovery = await provider.discoverTemplates();
  assert.strictEqual(discovery.success, true);
  assert.strictEqual(discovery.totalCount, 4); // 3 from withCode + 1 from noCode

  // Check 1C26TDC: char 2='C' (withCode=true), char 5='T' (invoiceCalcu=false)
  const t1 = discovery.templates.find(t => t.InvSeries === '1C26TDC');
  assert.ok(t1, '1C26TDC must be discovered');
  assert.strictEqual(t1.withCode, true, '1C26TDC char 2=C -> withCode=true');
  assert.strictEqual(t1.invoiceCalcu, false, '1C26TDC char 5=T -> invoiceCalcu=false');
  assert.strictEqual(t1.seriesTypeLabel, 'Thường');
  assert.strictEqual(t1.codeLabel, 'Có mã CQT');
  assert.strictEqual(t1.Inactive, false);

  // Check 1C26MKT: char 2='C' (withCode=true), char 5='M' (invoiceCalcu=true)
  const t2 = discovery.templates.find(t => t.InvSeries === '1C26MKT');
  assert.ok(t2, '1C26MKT must be discovered');
  assert.strictEqual(t2.withCode, true, '1C26MKT char 2=C -> withCode=true');
  assert.strictEqual(t2.invoiceCalcu, true, '1C26MKT char 5=M -> invoiceCalcu=true');
  assert.strictEqual(t2.seriesTypeLabel, 'MTT');
  assert.strictEqual(t2.codeLabel, 'Có mã CQT');

  // Check 1K26TNO: char 2='K' (withCode=false), char 5='T' (invoiceCalcu=false)
  const t3 = discovery.templates.find(t => t.InvSeries === '1K26TNO');
  assert.ok(t3, '1K26TNO must be discovered');
  assert.strictEqual(t3.withCode, false, '1K26TNO char 2=K -> withCode=false');
  assert.strictEqual(t3.invoiceCalcu, false, '1K26TNO char 5=T -> invoiceCalcu=false');
  assert.strictEqual(t3.codeLabel, 'Không mã');

  console.log('  [PASS] P03: Discovered templates accurately derive Decree 123 flags (withCode, invoiceCalcu, seriesTypeLabel).');
}

// -----------------------------------------------------------------------------
// P04: Multiple templates => no automatic owner selection
// -----------------------------------------------------------------------------
console.log('\nTesting P04: Multiple templates does not perform automatic selection without Owner consent...');
{
  clearMisaTokenCache();
  const { fetchFn } = createMockFetch();

  const runnerResult = await runLiveSandboxTests({
    silent: true,
    env: {
      MISA_APP_ID: 'test_app_id',
      MISA_TAX_CODE: '0101234567',
      MISA_USERNAME: 'test_user',
      MISA_PASSWORD: 'test_password',
      QBIZ_INVOICE_PROVIDER: 'MISA_MEINVOICE'
    },
    fetchFn
  });

  assert.strictEqual(runnerResult.readyForOwnerTemplateSelection, true);
  assert.ok(runnerResult.discovery.activeTemplates.length > 1, 'Fixture has multiple active templates');
  // Must NOT select series automatically
  assert.strictEqual(runnerResult.verdict, 'WAITING_OWNER_SELECTION');

  console.log(`  [PASS] P04: Found ${runnerResult.discovery.activeTemplates.length} active templates; no automatic selection applied.`);
}

// -----------------------------------------------------------------------------
// P05: Inactive templates excluded from selectable list
// -----------------------------------------------------------------------------
console.log('\nTesting P05: Inactive templates excluded from selectable activeTemplates list...');
{
  clearMisaTokenCache();
  const { fetchFn } = createMockFetch();
  const provider = new MisaInvoiceProvider({
    appId: 'test_app_id',
    taxCode: '0101234567',
    username: 'test_user',
    password: 'test_password',
    fetchFn
  });

  const discovery = await provider.discoverTemplates();
  assert.strictEqual(discovery.totalCount, 4);
  assert.strictEqual(discovery.activeCount, 3);
  assert.strictEqual(discovery.activeTemplates.length, 3);

  const inactiveTemplate = discovery.templates.find(t => t.InvSeries === '1C25TOLD');
  assert.ok(inactiveTemplate, 'Inactive template must be present in total list');
  assert.strictEqual(inactiveTemplate.Inactive, true);

  const foundInActiveList = discovery.activeTemplates.some(t => t.InvSeries === '1C25TOLD');
  assert.strictEqual(foundInActiveList, false, 'Inactive template must be excluded from activeTemplates');

  console.log('  [PASS] P05: Inactive template (1C25TOLD) properly excluded from selectable activeTemplates.');
}

// -----------------------------------------------------------------------------
// P06: Series/sign type missing => M02 not executed
// -----------------------------------------------------------------------------
console.log('\nTesting P06: Missing series/signType prevents M02 execution (fail closed)...');
{
  const providerWithoutSeries = new MisaInvoiceProvider({
    appId: 'test_app_id',
    taxCode: '0101234567',
    username: 'test_user',
    password: 'test_password',
    series: ''
  });

  let threwOnMissingSeries = false;
  try {
    providerWithoutSeries.validateSignType('issue');
  } catch (err) {
    threwOnMissingSeries = true;
    assert.strictEqual(err.rawCode, 'CONFIG_UNRESOLVED');
  }
  assert.strictEqual(threwOnMissingSeries, true, 'Must fail closed when series is missing');

  const providerWithSeriesNoSignType = new MisaInvoiceProvider({
    appId: 'test_app_id',
    taxCode: '0101234567',
    username: 'test_user',
    password: 'test_password',
    series: '1C26TDC'
  });

  let threwOnMissingSignType = false;
  try {
    providerWithSeriesNoSignType.validateSignType('issue');
  } catch (err) {
    threwOnMissingSignType = true;
    assert.strictEqual(err.rawCode, 'MISSING_SIGNTYPE');
  }
  assert.strictEqual(threwOnMissingSignType, true, 'Must fail closed when signType is missing');

  console.log('  [PASS] P06: validateSignType fails closed on missing series (CONFIG_UNRESOLVED) or signType (MISSING_SIGNTYPE).');
}

// -----------------------------------------------------------------------------
// P07: No secret or token in output
// -----------------------------------------------------------------------------
console.log('\nTesting P07: Zero secret or token leakage in formatted logs and template tables...');
{
  clearMisaTokenCache();
  const rawSecretPassword = 'SUPER_SECRET_PASSWORD_999888';
  const rawBearerToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.misa_sensitive_sandbox_token_secret_12345';
  const { fetchFn } = createMockFetch({ token: rawBearerToken });

  const logCapture = [];
  const runnerResult = await runLiveSandboxTests({
    silent: true,
    env: {
      MISA_APP_ID: 'test_app_id',
      MISA_TAX_CODE: '0101234567',
      MISA_USERNAME: 'test_user',
      MISA_PASSWORD: rawSecretPassword,
      QBIZ_INVOICE_PROVIDER: 'MISA_MEINVOICE'
    },
    fetchFn,
    logCapture
  });

  const fullOutput = logCapture.join('\n');

  assert.strictEqual(fullOutput.includes(rawSecretPassword), false, 'Output must NOT contain raw password');
  assert.strictEqual(fullOutput.includes(rawBearerToken), false, 'Output must NOT contain raw bearer token');

  // Verify formatSafeTemplateTable produces clean tabular output without secrets
  const tableOutput = formatSafeTemplateTable(runnerResult.discovery.templates);
  assert.ok(tableOutput.includes('SERIES'), 'Table must contain headers');
  assert.ok(tableOutput.includes('1C26TDC'), 'Table must contain discovered series');
  assert.strictEqual(tableOutput.includes(rawSecretPassword), false);
  assert.strictEqual(tableOutput.includes(rawBearerToken), false);

  console.log('  [PASS] P07: Zero secret or token leakage verified (no password, no bearer token in log output or metadata tables).');
}

console.log('\n=== ALL P01-P07 UNIT TESTS PASSED (BATCH 4B-LIVE-R1) ===\n');
