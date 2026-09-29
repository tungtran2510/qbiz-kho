/**
 * QBiz Kho — Electronic Invoice Service (Client-Side Orchestrator)
 * Batch 1 Implementation — Conforms to CODEX_HANDOFF_HDDT_MODULE_20260929.md
 * 
 * Invariants:
 * 1. Works with 'electronic_invoices' store in IndexedDB v13.
 * 2. Never throws to disrupt POS / Sale transactions.
 * 3. Enforces idempotency via buildInvoiceIdempotencyKey().
 */

import { put, getAll, getOne } from '../db.js';
import { CONFIG } from '../config.js';
import {
  InvoiceStatus,
  InvoiceOperation,
  buildInvoiceIdempotencyKey,
  createInvoiceDraftFromSale,
  createInvoiceAuditLogEntry
} from './domain.js';

const INVOICE_STORE = 'electronic_invoices';
const AUDIT_STORE = 'invoice_audit_logs';

/**
 * Finds existing electronic invoice for a given saleId
 */
export async function getInvoiceBySaleId(saleId) {
  if (!saleId) return null;
  try {
    const all = await getAll(INVOICE_STORE);
    return all.find(inv => inv.sale_id === saleId) || null;
  } catch (err) {
    console.warn('[InvoiceService] getInvoiceBySaleId error:', err);
    return null;
  }
}

/**
 * Hook 1 Handler: Automatically creates a Draft invoice when a Sale is successfully completed.
 * Fully isolated — never fails the parent Sale!
 */
export async function createInvoiceDraftForSale(sale, { customer = null, actor = 'cashier' } = {}) {
  if (!sale || !sale.id) return null;

  try {
    // 1. Check if invoice draft already exists for this sale (Idempotent guard)
    const existing = await getInvoiceBySaleId(sale.id);
    if (existing) {
      return existing;
    }

    // 2. Build normalized Draft model
    const buyerData = customer ? {
      name: customer.name || customer.label || sale.customer_label || 'Khách lẻ',
      phone: customer.phone || sale.customer_phone || '',
      email: customer.email || sale.customer_email || '',
      address: customer.address || sale.customer_address || '',
      tax_code: customer.tax_code || customer.taxCode || '',
      company_name: customer.company_name || customer.companyName || ''
    } : null;

    const draft = createInvoiceDraftFromSale(sale, { buyer: buyerData, actor });

    // 3. Save to IndexedDB 'electronic_invoices' store
    await put(INVOICE_STORE, draft);

    // 4. Save to IndexedDB 'invoice_audit_logs' store
    try {
      const auditLog = createInvoiceAuditLogEntry({
        invoiceId: draft.id,
        saleId: draft.sale_id,
        action: 'DRAFT_CREATED',
        actor,
        details: `Tạo bản nháp HĐĐT từ phiếu bán ${draft.sale_code}`
      });
      await put(AUDIT_STORE, auditLog);
    } catch (_) {}

    return draft;
  } catch (err) {
    console.warn('[InvoiceService] Failed to create draft for sale:', sale.id, err);
    return null;
  }
}

/**
 * Sends request to Server-Side Invoice Gateway (/api/invoice-gateway)
 * Never contains provider credentials on client.
 */
export async function callInvoiceGateway({ action, idempotencyKey, payload = {}, timeoutMs = 30000, signal = null }) {
  const url = '/api/invoice-gateway';

  let fetchSignal = signal;
  let timerId = null;
  if (!fetchSignal && typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    fetchSignal = controller.signal;
    timerId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: fetchSignal,
      body: JSON.stringify({
        appScope: 'qbiz-kho',
        action,
        idempotencyKey,
        payload
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.message || `Invoice Gateway error HTTP ${response.status}`);
    }

    const json = await response.json();
    if (!json.success) {
      throw new Error(json.message || 'Lỗi không xác định từ Invoice Gateway');
    }

    return json.data;
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

/**
 * Checks if an error is a Network error or Gateway/Connection timeout.
 * Strict boundary: Only matches network / connection / timeout errors.
 * Never matches validation or business logic errors (e.g. invalid tax code, 400 bad request).
 */
export function isNetworkOrTimeoutError(err) {
  if (!err) return false;
  const name = err.name || '';
  const code = err.code || '';
  const msg = String(err.message || err || '').toLowerCase();

  if (name === 'AbortError' || name === 'TimeoutError') return true;
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'UND_ERR_CONNECT_TIMEOUT') return true;
  if (err.status === 408 || err.status === 504) return true;

  return msg.includes('timeout') ||
         msg.includes('etimedout') ||
         msg.includes('econnreset') ||
         msg.includes('network') ||
         msg.includes('failed to fetch') ||
         msg.includes('fetch failed') ||
         msg.includes('mất kết nối') ||
         msg.includes('connection lost') ||
         msg.includes('aborted') ||
         msg.includes('gateway timeout');
}

/**
 * Reconciles invoice status with provider via getStatus() action.
 * Uses exact idempotencyKey to check whether the invoice was recorded by provider.
 */
export async function reconcileInvoiceStatus(invoiceOrKey, { gatewayCaller = callInvoiceGateway } = {}) {
  const idempotencyKey = typeof invoiceOrKey === 'string'
    ? invoiceOrKey
    : invoiceOrKey?.idempotency_key;

  if (!idempotencyKey) {
    throw new Error('reconcileInvoiceStatus: idempotencyKey là bắt buộc');
  }

  const res = await gatewayCaller({
    action: 'getStatus',
    idempotencyKey,
    payload: {
      idempotencyKey
    }
  });

  return res;
}

/**
 * Issues an electronic invoice with strict invariant: BLIND_REISSUE_ON_TIMEOUT = 0.
 * 
 * Strict Invariants:
 * 1. If invoice is already ISSUED, returns existing without calling provider.
 * 2. If previous attempt suffered a TIMEOUT or network loss, it MUST NOT call issue() blindly.
 *    It MUST call getStatus() / reconcile first using the exact idempotencyKey.
 * 3. If issue() attempt experiences a timeout/network error:
 *    - Flags error as TIMEOUT.
 *    - DOES NOT retry issue() immediately!
 *    - Immediately invokes getStatus() with idempotencyKey to check if provider already recorded it.
 *    - If provider has recorded the invoice: marks as ISSUED and reconciles local state.
 *    - If provider does not have the record: flags as safe for controlled retry.
 * 4. Non-timeout errors (validation, 400 Bad Request) are immediately re-thrown without calling getStatus().
 */
export async function issueInvoice(invoice, {
  actor = 'Thu ngân',
  gatewayCaller = callInvoiceGateway
} = {}) {
  if (!invoice) throw new Error('Dữ liệu hóa đơn không hợp lệ');

  const idempotencyKey = (invoice.idempotency_key && invoice.idempotency_key.startsWith('ISSUE:'))
    ? invoice.idempotency_key
    : buildInvoiceIdempotencyKey({
        operation: InvoiceOperation.ISSUE,
        saleId: invoice.sale_id,
        lineageId: invoice.lineage_id || 'orig',
        version: invoice.version || 1
      });
  invoice.idempotency_key = idempotencyKey;

  // Rule 1: Idempotent return if already issued
  if (invoice.status === InvoiceStatus.ISSUED && invoice.provider_ref?.invoice_number) {
    return {
      success: true,
      data: invoice.provider_ref,
      already_issued: true,
      reconciled: false
    };
  }

  // Rule 2: Pre-retry check after a previous timeout.
  // Invariant BLIND_REISSUE_ON_TIMEOUT = 0:
  // If the invoice previously timed out, DO NOT CALL issue() blindly!
  // MUST call getStatus() first to see if provider already processed it.
  if (invoice._pending_reconcile || invoice._last_error_type === 'TIMEOUT') {
    const preCheck = await reconcileInvoiceStatus(idempotencyKey, { gatewayCaller });
    if (preCheck && (preCheck.success || preCheck.record) && preCheck.record?.status === 'ISSUED') {
      return await _applyIssuedState(invoice, preCheck.record, actor, {
        reconciled: true,
        source: 'PRE_RETRY_RECONCILE'
      });
    }
    // If provider returned NOT_FOUND, provider never recorded it. Safe to proceed with issue.
    invoice._pending_reconcile = false;
    invoice._last_error_type = null;
  }

  // Attempt issue via gateway
  try {
    const res = await gatewayCaller({
      action: 'issue',
      idempotencyKey,
      payload: { invoiceData: invoice }
    });

    return await _applyIssuedState(invoice, res, actor, {
      reconciled: false,
      source: 'DIRECT_ISSUE'
    });
  } catch (err) {
    // Check if error is timeout/network
    if (!isNetworkOrTimeoutError(err)) {
      // Non-timeout errors: DO NOT call getStatus()! Re-throw immediately.
      invoice._last_error_type = 'VALIDATION_OR_BUSINESS_ERROR';
      invoice._last_error_message = err.message;
      throw err;
    }

    // Network or Timeout occurred!
    // Invariant: BLIND_REISSUE_ON_TIMEOUT = 0
    // Client MUST NOT call issue() second time blindly!
    // Client MUST call getStatus() with idempotency key to reconcile state.
    invoice._pending_reconcile = true;
    invoice._last_error_type = 'TIMEOUT';
    invoice._last_error_message = err.message;

    try {
      const statusRes = await reconcileInvoiceStatus(idempotencyKey, { gatewayCaller });
      if (statusRes && (statusRes.success || statusRes.record) && statusRes.record && (statusRes.record.status === 'ISSUED' || statusRes.record.invoice_number)) {
        // Provider DID receive and issue the invoice during the timed-out attempt!
        return await _applyIssuedState(invoice, statusRes.record, actor, {
          reconciled: true,
          source: 'TIMEOUT_RECONCILE'
        });
      }

      // Provider was queried, but has no record (e.g. request timed out before reaching provider)
      const timeoutErr = new Error(`Mất kết nối/timeout khi phát hành HĐĐT. Đã đối soát qua getStatus: Nhà cung cấp chưa ghi nhận bản ghi. Chi tiết: ${err.message}`);
      timeoutErr.code = 'TIMEOUT_RECONCILED_NOT_FOUND';
      timeoutErr.can_retry = true;
      timeoutErr.idempotencyKey = idempotencyKey;
      throw timeoutErr;
    } catch (reconcileErr) {
      if (reconcileErr.code === 'TIMEOUT_RECONCILED_NOT_FOUND') {
        throw reconcileErr;
      }
      const combinedErr = new Error(`Lỗi timeout khi phát hành HĐĐT và đối soát trạng thái thất bại: ${err.message}; Reconcile: ${reconcileErr.message}`);
      combinedErr.code = 'TIMEOUT_RECONCILE_FAILED';
      combinedErr.originalError = err;
      combinedErr.reconcileError = reconcileErr;
      throw combinedErr;
    }
  }
}

async function _applyIssuedState(invoice, providerData, actor, { reconciled = false, source = 'DIRECT_ISSUE' } = {}) {
  invoice.status = InvoiceStatus.ISSUED;
  invoice.provider_ref = providerData;
  invoice.snapshot = {
    buyer: invoice.buyer,
    items: invoice.items,
    amounts: invoice.amounts,
    provider_ref: providerData,
    issued_at: providerData.issue_date || new Date().toISOString()
  };
  invoice._pending_reconcile = false;
  invoice._last_error_type = null;
  invoice.updated_at = new Date().toISOString();

  const now = new Date().toISOString();
  if (!Array.isArray(invoice.audit_log)) {
    invoice.audit_log = [];
  }
  invoice.audit_log.push({
    action: reconciled ? 'RECONCILED_AFTER_TIMEOUT' : 'ISSUED',
    actor,
    timestamp: now,
    details: reconciled
      ? `Đối soát thành công sau timeout qua getStatus(). Số HĐ: ${providerData.invoice_number}`
      : `Phát hành thành công số ${providerData.invoice_number}`
  });

  try {
    await put(INVOICE_STORE, invoice);
  } catch (_) {}

  try {
    const log = createInvoiceAuditLogEntry({
      invoiceId: invoice.id,
      saleId: invoice.sale_id,
      action: reconciled ? 'RECONCILED_AFTER_TIMEOUT' : 'INVOICE_ISSUED',
      actor,
      details: reconciled
        ? `Đối soát thành công qua getStatus() sau sự cố mạng. Số: ${providerData.invoice_series}-${providerData.invoice_number}`
        : `Phát hành hóa đơn ${providerData.invoice_series}-${providerData.invoice_number}`
    });
    await put(AUDIT_STORE, log);
  } catch (_) {}

  return {
    success: true,
    data: providerData,
    reconciled,
    source
  };
}
