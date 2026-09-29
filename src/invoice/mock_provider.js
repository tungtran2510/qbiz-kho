/**
 * QBiz Kho — Mock E-Invoice Provider Adapter
 * Batch 1 Implementation — Conforms to CODEX_HANDOFF_HDDT_MODULE_20260929.md
 * 
 * Strict Invariants:
 * 1. Implements provider interface: createDraft, issue, getStatus, getDocument, adjust, replace.
 * 2. Explicit provider_capabilities declaring what operations are supported.
 * 3. In-memory idempotent storage so calling issue() twice with same idempotency_key returns identical reference.
 */

export const MOCK_PROVIDER_CAPABILITIES = Object.freeze({
  provider_code: 'MOCK_QBIZ_EINVOICE',
  provider_name: 'QBiz Mock E-Invoice Provider v1',
  version: '1.0.0',
  supports_draft: true,
  supports_issue: true,
  supports_get_status: true,
  supports_get_document: true,
  supports_adjust: true,
  supports_replace: true,
  supports_cancel: false // Explicit capability boundary: does not allow arbitrary cancellation
});

class MockInvoiceProvider {
  constructor(capabilities = MOCK_PROVIDER_CAPABILITIES) {
    this.capabilities = capabilities;
    // Map<idempotency_key, ProviderResult>
    this.records = new Map();
    this.sequence = 1000;
  }

  /**
   * Generates next serial invoice number: e.g., 0001001
   */
  _nextInvoiceNumber() {
    this.sequence += 1;
    return String(this.sequence).padStart(7, '0');
  }

  /**
   * 1. createDraft: Create a draft on provider side
   */
  async createDraft({ invoiceData, idempotencyKey }) {
    if (!this.capabilities.supports_draft) {
      throw new Error(`Nhà cung cấp ${this.capabilities.provider_name} không hỗ trợ tạo nháp từ xa.`);
    }

    if (idempotencyKey && this.records.has(idempotencyKey)) {
      return this.records.get(idempotencyKey);
    }

    const draftId = `MOCK-DFT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const result = {
      success: true,
      provider_code: this.capabilities.provider_code,
      provider_draft_id: draftId,
      status: 'DRAFT',
      shop_id: invoiceData?.shop_id || invoiceData?.shopId || 'shop_a',
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString(),
      message: 'Bản nháp HĐĐT đã được ghi nhận trên hệ thống nhà cung cấp'
    };

    if (idempotencyKey) {
      this.records.set(idempotencyKey, result);
    }
    return result;
  }

  /**
   * 2. issue: Issue authentic electronic invoice
   * Fully idempotent: calling with same idempotencyKey returns existing issued invoice
   */
  async issue({ invoiceData, idempotencyKey, principalShop = 'shop_a' }) {
    if (!this.capabilities.supports_issue) {
      throw new Error(`Nhà cung cấp ${this.capabilities.provider_name} không hỗ trợ phát hành trực tiếp.`);
    }

    // Idempotency check: if this key was already issued, return existing result without duplicate issue!
    if (idempotencyKey && this.records.has(idempotencyKey)) {
      const existing = this.records.get(idempotencyKey);
      if (existing.shop_id && existing.shop_id !== principalShop) {
        const err = new Error('Không có quyền truy cập.');
        err.status = 403;
        err.error = 'FORBIDDEN_TENANT_ACCESS';
        throw err;
      }
      return {
        ...existing,
        idempotent_replay: true
      };
    }

    const invoiceSeries = '1C26TBB';
    const invoiceNumber = this._nextInvoiceNumber();
    const lookupCode = `TC-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    const issueDate = new Date().toISOString();
    const transactionId = `TX-MOCK-${Date.now()}`;

    const result = {
      success: true,
      provider_code: this.capabilities.provider_code,
      transaction_id: transactionId,
      invoice_series: invoiceSeries,
      invoice_number: invoiceNumber,
      lookup_code: lookupCode,
      lookup_url: `https://hddt.qbiz.vn/tra-cuu?code=${lookupCode}`,
      issue_date: issueDate,
      status: 'ISSUED',
      shop_id: principalShop,
      idempotency_key: idempotencyKey,
      message: 'Phát hành hóa đơn điện tử thành công'
    };

    if (idempotencyKey) {
      this.records.set(idempotencyKey, result);
    }
    return result;
  }

  /**
   * 3. getStatus: Reconcile or poll status
   */
  async getStatus({ idempotencyKey, transactionId, invoiceNumber, principalShop = 'shop_a' }) {
    if (!this.capabilities.supports_get_status) {
      throw new Error(`Nhà cung cấp ${this.capabilities.provider_name} không hỗ trợ tra cứu trạng thái.`);
    }

    if (idempotencyKey && this.records.has(idempotencyKey)) {
      const rec = this.records.get(idempotencyKey);
      if (rec.shop_id && rec.shop_id !== principalShop) {
        const err = new Error('Không có quyền truy cập hóa đơn của cửa hàng khác.');
        err.status = 403;
        err.error = 'FORBIDDEN_TENANT_ACCESS';
        throw err;
      }
      return {
        success: true,
        record: rec
      };
    }

    for (const rec of this.records.values()) {
      if ((transactionId && rec.transaction_id === transactionId) ||
          (invoiceNumber && rec.invoice_number === invoiceNumber)) {
        if (rec.shop_id && rec.shop_id !== principalShop) {
          const err = new Error('Không có quyền truy cập hóa đơn của cửa hàng khác.');
          err.status = 403;
          err.error = 'FORBIDDEN_TENANT_ACCESS';
          throw err;
        }
        return {
          success: true,
          record: rec
        };
      }
    }

    return {
      success: false,
      status: 'NOT_FOUND',
      message: 'Không tìm thấy hóa đơn trên hệ thống nhà cung cấp'
    };
  }

  /**
   * 4. getDocument: Retrieve invoice document representation
   */
  async getDocument({ invoiceNumber, lookupCode, format = 'html', principalShop = 'shop_a' }) {
    if (!this.capabilities.supports_get_document) {
      throw new Error(`Nhà cung cấp ${this.capabilities.provider_name} không hỗ trợ tải chứng từ.`);
    }

    for (const rec of this.records.values()) {
      if ((invoiceNumber && rec.invoice_number === invoiceNumber) ||
          (lookupCode && rec.lookup_code === lookupCode)) {
        if (rec.shop_id && rec.shop_id !== principalShop) {
          const err = new Error('Không có quyền xem chứng từ của cửa hàng khác.');
          err.status = 403;
          err.error = 'FORBIDDEN_TENANT_ACCESS';
          throw err;
        }
      }
    }

    return {
      success: true,
      format,
      invoice_number: invoiceNumber,
      lookup_code: lookupCode,
      html_preview: `<div class="mock-invoice-doc"><h2>HÓA ĐƠN ĐIỆN TỬ (MOCK)</h2><p>Số: ${invoiceNumber}</p><p>Mã tra cứu: ${lookupCode}</p></div>`
    };
  }

  /**
   * 5. adjust: Issue an adjustment invoice
   */
  async adjust({ originalInvoiceRef, adjustmentData, idempotencyKey, principalShop = 'shop_a' }) {
    if (!this.capabilities.supports_adjust) {
      throw new Error(`Nhà cung cấp ${this.capabilities.provider_name} không hỗ trợ nghiệp vụ điều chỉnh.`);
    }

    const origNum = originalInvoiceRef?.invoice_number;
    if (origNum) {
      for (const rec of this.records.values()) {
        if (rec.invoice_number === origNum && rec.shop_id && rec.shop_id !== principalShop) {
          const err = new Error('Không có quyền điều chỉnh hóa đơn của cửa hàng khác.');
          err.status = 403;
          err.error = 'FORBIDDEN_TENANT_ACCESS';
          throw err;
        }
      }
    }

    if (idempotencyKey && this.records.has(idempotencyKey)) {
      const existing = this.records.get(idempotencyKey);
      if (existing.shop_id && existing.shop_id !== principalShop) {
        const err = new Error('Không có quyền truy cập.');
        err.status = 403;
        err.error = 'FORBIDDEN_TENANT_ACCESS';
        throw err;
      }
      return {
        ...existing,
        idempotent_replay: true
      };
    }

    const invoiceSeries = '1C26TDC';
    const invoiceNumber = this._nextInvoiceNumber();
    const lookupCode = `ADJ-${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const result = {
      success: true,
      provider_code: this.capabilities.provider_code,
      operation: 'ADJUST',
      original_invoice_number: originalInvoiceRef?.invoice_number || '',
      invoice_series: invoiceSeries,
      invoice_number: invoiceNumber,
      lookup_code: lookupCode,
      issue_date: new Date().toISOString(),
      status: 'ISSUED',
      shop_id: principalShop,
      idempotency_key: idempotencyKey,
      message: 'Phát hành hóa đơn điều chỉnh thành công'
    };

    if (idempotencyKey) {
      this.records.set(idempotencyKey, result);
    }
    return result;
  }

  /**
   * 6. replace: Issue a replacement invoice
   */
  async replace({ originalInvoiceRef, replacementData, idempotencyKey, principalShop = 'shop_a' }) {
    if (!this.capabilities.supports_replace) {
      throw new Error(`Nhà cung cấp ${this.capabilities.provider_name} không hỗ trợ nghiệp vụ thay thế.`);
    }

    const origNum = originalInvoiceRef?.invoice_number;
    if (origNum) {
      for (const rec of this.records.values()) {
        if (rec.invoice_number === origNum && rec.shop_id && rec.shop_id !== principalShop) {
          const err = new Error('Không có quyền thay thế hóa đơn của cửa hàng khác.');
          err.status = 403;
          err.error = 'FORBIDDEN_TENANT_ACCESS';
          throw err;
        }
      }
    }

    if (idempotencyKey && this.records.has(idempotencyKey)) {
      const existing = this.records.get(idempotencyKey);
      if (existing.shop_id && existing.shop_id !== principalShop) {
        const err = new Error('Không có quyền truy cập.');
        err.status = 403;
        err.error = 'FORBIDDEN_TENANT_ACCESS';
        throw err;
      }
      return {
        ...existing,
        idempotent_replay: true
      };
    }

    const invoiceSeries = '1C26TTT';
    const invoiceNumber = this._nextInvoiceNumber();
    const lookupCode = `REP-${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const result = {
      success: true,
      provider_code: this.capabilities.provider_code,
      operation: 'REPLACE',
      original_invoice_number: originalInvoiceRef?.invoice_number || '',
      invoice_series: invoiceSeries,
      invoice_number: invoiceNumber,
      lookup_code: lookupCode,
      issue_date: new Date().toISOString(),
      status: 'ISSUED',
      shop_id: principalShop,
      idempotency_key: idempotencyKey,
      message: 'Phát hành hóa đơn thay thế thành công'
    };

    if (idempotencyKey) {
      this.records.set(idempotencyKey, result);
    }
    return result;
  }
}

export const mockInvoiceProvider = new MockInvoiceProvider();
