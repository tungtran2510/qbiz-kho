/**
 * QBiz Kho — HĐĐT Step 3.4: Serverless Gateway (api/invoice-gateway.js) RBAC Test
 * Hard Assertions: Every check MUST throw on failure and exit code != 0.
 */

import assert from 'node:assert/strict';
import gatewayHandler from '../api/invoice-gateway.js';

async function invokeGateway({ body, headers = {} }) {
  let statusCode = 200;
  let responseData = null;

  const mockReq = {
    method: 'POST',
    headers: {
      'x-forwarded-for': '127.0.0.1',
      ...headers
    },
    body
  };

  const mockRes = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return {
        json(data) { responseData = data; return data; },
        end() { return null; }
      };
    }
  };

  await gatewayHandler(mockReq, mockRes);
  return { status: statusCode, data: responseData };
}

async function runGatewayRBACTests() {
  console.log('=== Testing api/invoice-gateway.js RBAC directly ===\n');

  // Test 1: Cashier session calls adjust -> 403
  const res1 = await invokeGateway({
    body: {
      appScope: 'qbiz-kho',
      action: 'adjust',
      idempotencyKey: 'ADJUST:node_rbac_01:v2',
      payload: { originalInvoiceRef: { invoice_number: '0001001' } }
    },
    headers: {
      'authorization': 'Bearer mock_token_cashier'
    }
  });
  console.log('Test 1 (Cashier adjust):', res1.status, res1.data?.error);
  assert.strictEqual(res1.status, 403, 'Cashier calling adjust must return 403');
  assert.strictEqual(res1.data?.error, 'FORBIDDEN_ACTION');

  // Test 2: Cashier attempts spoofing in body -> 403
  const res2 = await invokeGateway({
    body: {
      appScope: 'qbiz-kho',
      action: 'adjust',
      role: 'admin',
      idempotencyKey: 'ADJUST:node_rbac_spoof:v2',
      payload: { role: 'OWNER', originalInvoiceRef: { invoice_number: '0001001' } }
    },
    headers: {
      'authorization': 'Bearer mock_token_cashier'
    }
  });
  console.log('Test 2 (Cashier body spoof):', res2.status, res2.data?.error);
  assert.strictEqual(res2.status, 403, 'Server must ignore body role and return 403');
  assert.strictEqual(res2.data?.error, 'FORBIDDEN_ACTION');

  // Test 3: Cashier calls issue -> 200
  const res3 = await invokeGateway({
    body: {
      appScope: 'qbiz-kho',
      action: 'issue',
      idempotencyKey: `ISSUE:node_rbac_c:v1_${Date.now()}`,
      payload: { invoiceData: { sale_id: 'sale_01' } }
    },
    headers: {
      'authorization': 'Bearer mock_token_cashier'
    }
  });
  console.log('Test 3 (Cashier issue):', res3.status, 'Invoice Number:', res3.data?.data?.invoice_number);
  assert.strictEqual(res3.status, 200, 'Cashier calling issue must return 200');
  assert.strictEqual(res3.data?.success, true);

  // Test 4: Owner calls adjust -> 200
  const res4 = await invokeGateway({
    body: {
      appScope: 'qbiz-kho',
      action: 'adjust',
      idempotencyKey: `ADJUST:node_rbac_o:v2_${Date.now()}`,
      payload: { originalInvoiceRef: { invoice_number: '0001001' } }
    },
    headers: {
      'authorization': 'Bearer mock_token_owner'
    }
  });
  console.log('Test 4 (Owner adjust):', res4.status, 'Adjustment Number:', res4.data?.data?.invoice_number);
  assert.strictEqual(res4.status, 200, 'Owner calling adjust must return 200');
  assert.strictEqual(res4.data?.success, true);

  console.log('\n=== api/invoice-gateway.js RBAC Tests 100% PASS ===');
}

runGatewayRBACTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
