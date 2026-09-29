/**
 * QBiz Kho — Electronic Invoice (Hóa đơn điện tử) Domain Model
 * Batch 1 Implementation — Conforms strictly to CODEX_HANDOFF_HDDT_MODULE_20260929.md
 * 
 * Invariants:
 * 1. Store: 'electronic_invoices' (IndexedDB v13)
 * 2. Idempotency Key: `${operation}:${sale_id}:${lineage_id || 'orig'}:v${version}`
 * 3. Never mutates Sale, Order, Level, or Movement.
 */

export const InvoiceStatus = Object.freeze({
  DRAFT: 'DRAFT',
  READY_TO_ISSUE: 'READY_TO_ISSUE',
  ISSUING: 'ISSUING',
  ISSUED: 'ISSUED',
  FAILED: 'FAILED',
  ADJUSTMENT_REQUIRED: 'ADJUSTMENT_REQUIRED',
  REPLACEMENT_REQUIRED: 'REPLACEMENT_REQUIRED',
  CANCELLED: 'CANCELLED'
});

export const InvoiceOperation = Object.freeze({
  CREATE_DRAFT: 'CREATE_DRAFT',
  ISSUE: 'ISSUE',
  ADJUST: 'ADJUST',
  REPLACE: 'REPLACE',
  CANCEL: 'CANCEL'
});

export const BuyerType = Object.freeze({
  INDIVIDUAL: 'INDIVIDUAL',
  BUSINESS: 'BUSINESS'
});

/**
 * Builds standard idempotency key according to NON-NEGOTIABLE #3:
 * operation + sale_id + invoice_lineage/version
 * e.g., 'CREATE_DRAFT:sale_123:orig:v1', 'ISSUE:sale_123:orig:v1', 'ADJUST:sale_123:lin_456:v2'
 */
export function buildInvoiceIdempotencyKey({ operation, saleId, lineageId = '', version = 1 }) {
  if (!operation || !saleId) {
    throw new Error('operation and saleId are required to build invoice idempotency key');
  }
  const cleanVersion = Math.max(1, Number(version) || 1);
  if (lineageId && lineageId !== 'orig' && lineageId !== saleId) {
    return `${operation}:${saleId}:${lineageId}:v${cleanVersion}`;
  }
  if (lineageId === 'orig') {
    return `${operation}:${saleId}:orig:v${cleanVersion}`;
  }
  return `${operation}:${saleId}:v${cleanVersion}`;
}

/**
 * Validates and normalizes buyer details
 */
export function createInvoiceBuyer(raw = {}) {
  const isBusiness = !!(raw.taxCode || raw.tax_code || raw.companyName || raw.company_name);
  return {
    type: isBusiness ? BuyerType.BUSINESS : BuyerType.INDIVIDUAL,
    name: String(raw.name || raw.customer_label || 'Khách lẻ').trim(),
    tax_code: String(raw.tax_code || raw.taxCode || '').trim(),
    company_name: String(raw.company_name || raw.companyName || '').trim(),
    email: String(raw.email || '').trim(),
    phone: String(raw.phone || '').trim(),
    address: String(raw.address || '').trim()
  };
}

/**
 * Normalizes an item line into standard InvoiceLine structure
 */
export function createInvoiceLine(raw = {}, index = 0) {
  const quantity = Math.max(0, Number(raw.quantity ?? raw.qty ?? 1));
  const unitPrice = Math.max(0, Number(raw.unitPrice ?? raw.unit_price ?? raw.price ?? 0));
  const discount = Math.max(0, Number(raw.discount ?? raw.lineDiscount ?? 0));
  const vatRate = Number(raw.vatRate ?? raw.vat_rate ?? 0);
  const vatAmount = Math.max(0, Number(raw.tax_amount ?? raw.vatAmount ?? raw.vat ?? 0));
  const lineTotal = Math.max(0, Number(raw.lineTotal ?? raw.line_total ?? (quantity * unitPrice - discount + vatAmount)));

  return {
    line_index: index + 1,
    item_id: String(raw.itemId || raw.item_id || raw.productId || raw.id || ''),
    sku: String(raw.sku || '').trim(),
    name: String(raw.name || raw.item_name || 'Hàng hóa / Dịch vụ').trim(),
    unit: String(raw.unit || 'Cái').trim(),
    quantity,
    unit_price: unitPrice,
    discount,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    line_total: lineTotal
  };
}

/**
 * Creates a clean Draft ElectronicInvoice from completed Sale
 */
export function createInvoiceDraftFromSale(sale, { buyer = null, actor = 'cashier' } = {}) {
  if (!sale || !sale.id) {
    throw new Error('Sale object with valid ID is required to create invoice draft');
  }

  const saleId = sale.id;
  const saleCode = sale.code || sale.sale_uuid || saleId;
  const version = 1;
  const lineageId = 'orig';
  const idempotencyKey = buildInvoiceIdempotencyKey({
    operation: InvoiceOperation.CREATE_DRAFT,
    saleId,
    lineageId,
    version
  });

  const rawBuyer = buyer || {
    name: sale.customer_label || 'Khách lẻ',
    phone: sale.customer_phone || '',
    email: sale.customer_email || '',
    address: sale.customer_address || ''
  };
  const normalizedBuyer = createInvoiceBuyer(rawBuyer);

  const rawItems = Array.isArray(sale.items) ? sale.items : [];
  const normalizedLines = rawItems.map((item, idx) => createInvoiceLine(item, idx));

  const subtotal = Number(sale.subtotal ?? normalizedLines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0));
  const discount = Number(sale.discount_total ?? sale.discount ?? 0);
  const vat = Number(sale.tax_total ?? normalizedLines.reduce((sum, line) => sum + line.vat_amount, 0));
  const grandTotal = Number(sale.grand_total ?? sale.total ?? (subtotal - discount + vat));

  const now = new Date().toISOString();
  const invoiceId = `inv-${saleId}`;

  return {
    id: invoiceId,
    sale_id: saleId,
    sale_code: saleCode,
    lineage_id: invoiceId, // Root invoice's lineage_id points to its own id
    version,
    operation: InvoiceOperation.CREATE_DRAFT,
    idempotency_key: idempotencyKey,
    status: InvoiceStatus.DRAFT,
    buyer: normalizedBuyer,
    items: normalizedLines,
    amounts: {
      subtotal,
      discount,
      vat,
      grand_total: grandTotal
    },
    snapshot: null, // Immutable snapshot only written when ISSUED
    provider_ref: null,
    audit_log: [
      {
        action: 'DRAFT_CREATED',
        actor: String(actor || 'cashier'),
        timestamp: now,
        details: `Tạo bản nháp HĐĐT tự động từ phiếu bán ${saleCode}`
      }
    ],
    created_at: now,
    updated_at: now
  };
}

/**
 * Utility to mask sensitive personal / business identifiable information in logs and audit trails.
 * CRITICAL RULE: NEVER modifies original business invoice records (store 'electronic_invoices').
 * ONLY applied to logs (store 'invoice_audit_logs', console logs, server logs).
 */
export function maskTaxCode(taxCode) {
  if (!taxCode || typeof taxCode !== 'string') return '';
  const clean = taxCode.trim();
  if (clean.length <= 3) return '***';
  return clean.slice(0, clean.length - 3).replace(/./g, '*') + clean.slice(-3);
}

export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const clean = phone.trim();
  if (clean.length <= 3) return '***';
  return clean.slice(0, clean.length - 3).replace(/./g, '*') + clean.slice(-3);
}

export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const atIdx = email.indexOf('@');
  if (atIdx <= 0) return '***';
  const name = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  if (name.length <= 2) return `*${domain}`;
  return `${name[0]}***${name[name.length - 1]}${domain}`;
}

export function maskSensitiveData(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    if (data.toLowerCase().startsWith('bearer ')) {
      return 'Bearer [REDACTED]';
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item));
  }
  if (typeof data === 'object') {
    const masked = {};
    for (const [k, v] of Object.entries(data)) {
      const lowerKey = k.toLowerCase();
      if (lowerKey.includes('token') || lowerKey.includes('authorization') || lowerKey.includes('secret') || lowerKey.includes('jwt')) {
        masked[k] = '[REDACTED]';
      } else if (lowerKey.includes('tax') || lowerKey === 'tax_code' || lowerKey === 'buyertaxcode') {
        masked[k] = typeof v === 'string' ? maskTaxCode(v) : v;
      } else if (lowerKey.includes('phone') || lowerKey === 'buyer_phone') {
        masked[k] = typeof v === 'string' ? maskPhone(v) : v;
      } else if (lowerKey.includes('email') || lowerKey === 'buyer_email') {
        masked[k] = typeof v === 'string' ? maskEmail(v) : v;
      } else if (typeof v === 'object' && v !== null) {
        masked[k] = maskSensitiveData(v);
      } else {
        masked[k] = v;
      }
    }
    return masked;
  }
  return data;
}

/**
 * Creates structured record for store 'invoice_audit_logs'
 */
export function createInvoiceAuditLogEntry({ invoiceId, saleId, action, actor = 'system', details = '', metadata = {} }) {
  const now = new Date().toISOString();
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    invoice_id: invoiceId,
    sale_id: saleId,
    action,
    actor: String(actor || 'system'),
    details: String(details || ''),
    metadata: maskSensitiveData(metadata),
    created_at: now
  };
}

