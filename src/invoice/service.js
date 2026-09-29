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
export async function callInvoiceGateway({ action, idempotencyKey, payload = {} }) {
  const url = '/api/invoice-gateway';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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
}
