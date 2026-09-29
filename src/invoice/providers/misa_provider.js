/**
 * QBiz Kho — MISA meInvoice Provider Adapter (Open API Integration)
 * Conforms strictly to MISA Current Open API Integration Specification
 * Base URL: https://testapi.meinvoice.vn/api/integration (Test) | https://api.meinvoice.vn/api/integration (Prod)
 * 
 * Strict Invariants:
 * 1. ZERO CLIENT SECRETS: All credentials (AppID, TaxCode, Username, Password) are server-side only.
 * 2. NO UNVERIFIED /api/v3: All endpoints use official Open API /api/integration contract.
 * 3. TOKEN LIFECYCLE: Token cached for up to 14 days, tenant-scoped, no fetch-per-operation.
 * 4. REFID RECONCILIATION: Reconcile via POST /invoice/status (inputType: 2) to eliminate blind reissue.
 * 5. POST-BASED GETSTATUS & GETDOCUMENT: Conforms to Open API specification (no deprecated GETs).
 * 6. DIRECT MASTER ADJUST/REPLACE FIELDS: ReferenceType (1 Replace, 2 Adjust), OrgInv* on invoice master.
 * 7. CANCEL CAPABILITY: Truthfully declared NOT_EXPOSED_IN_PUBLIC_OPEN_API (supports_cancel: false).
 */

import { maskSensitiveData } from '../domain.js';

export const MISA_PROVIDER_CAPABILITIES = Object.freeze({
  provider_code: 'MISA_MEINVOICE',
  provider_name: 'MISA meInvoice Open API Integration Provider',
  version: '4.0.0-openapi',
  api_family: 'OPEN_API_INTEGRATION',
  supports_draft: true,
  supports_issue: true,
  supports_get_status: true,
  supports_get_document: true,
  supports_adjust: true,
  supports_replace: true,
  supports_cancel: false
});

export const SERIES_CODE_FLAG_POSITION = 2;
export const SERIES_CALCU_FLAG_POSITION = 5;

export const MISA_DOCUMENTED_SIGN_TYPES = Object.freeze([1, 2, 3, 4, 5, 6]);

export const MISA_SIGN_TYPE_LABELS = Object.freeze({
  1: 'USB / File mềm',
  2: 'HSM có hiển thị CKS',
  3: 'HSM bất đồng bộ',
  4: 'Ký sau vé không mã',
  5: 'Ký sau hóa đơn MTT, không hiển thị CKS',
  6: 'Ký sau hóa đơn/vé MTT, bất đồng bộ'
});

/**
 * Parses MISA InvSeries per Decree 123 / Circular 78 & MISA Open API specification:
 * Example: 1C25MYY, 1C25TYY, 1K25TYY, 2C25MYY
 *
 * Positions (1-based index per specification):
 * - Character 1 (index 0): 1 = GTGT, 2 = Bán hàng, 5 = Vé điện tử, 6 = Phiếu xuất kho
 * - Character 2 (SERIES_CODE_FLAG_POSITION = 2 / index 1):
 *     'C' => invoiceWithCode = true (Hóa đơn có mã CQT)
 *     'K' => invoiceWithCode = false (Hóa đơn không mã CQT)
 * - Characters 3-4 (index 2-3): Năm lập (ví dụ 25, 26)
 * - Character 5 (SERIES_CALCU_FLAG_POSITION = 5 / index 4):
 *     'M' => invoiceCalcu = true (Hóa đơn từ máy tính tiền - MTT)
 *     'T' => invoiceCalcu = false (Hóa đơn thường)
 *
 * Strict invariants:
 * - KHÔNG dùng startsWith('1C') để suy toàn bộ loại hình
 * - KHÔNG dùng startsWith('1M')
 * - KHÔNG dùng includes('M') tùy ý
 * - Rejects format if length < 5, or character 2 is not C/K, or character 5 is not M/T.
 *
 * Returns: { invoiceWithCode: boolean, invoiceCalcu: boolean, series: string } or null
 */
export function parseMisaSeries(series) {
  if (!series || typeof series !== 'string') return null;
  const s = series.trim().toUpperCase();
  if (s.length < 5) return null;

  const char2 = s.charAt(SERIES_CODE_FLAG_POSITION - 1);
  const char5 = s.charAt(SERIES_CALCU_FLAG_POSITION - 1);

  let invoiceWithCode = null;
  if (char2 === 'C') {
    invoiceWithCode = true;
  } else if (char2 === 'K') {
    invoiceWithCode = false;
  } else {
    return null;
  }

  let invoiceCalcu = null;
  if (char5 === 'M') {
    invoiceCalcu = true;
  } else if (char5 === 'T') {
    invoiceCalcu = false;
  } else {
    return null;
  }

  return {
    invoiceWithCode,
    invoiceCalcu,
    series: s
  };
}

/**
 * Standardized QBiz Provider Error Codes
 */
export const ProviderErrorCode = Object.freeze({
  AUTH_ERROR: 'AUTH_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BUSINESS_RULE_ERROR: 'BUSINESS_RULE_ERROR',
  CAPABILITY_NOT_AVAILABLE: 'CAPABILITY_NOT_AVAILABLE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT_AMBIGUOUS: 'TIMEOUT_AMBIGUOUS',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_REFERENCE: 'DUPLICATE_REFERENCE',
  SIGNING_ERROR: 'SIGNING_ERROR',
  UNKNOWN_PROVIDER_ERROR: 'UNKNOWN_PROVIDER_ERROR'
});

export class MisaProviderError extends Error {
  constructor(errorCode, message, { httpStatus = null, rawCode = null, details = null, isRetryable = false } = {}) {
    super(message);
    this.name = 'MisaProviderError';
    this.errorCode = errorCode;
    this.error = errorCode;
    this.httpStatus = httpStatus;
    this.status = httpStatus;
    this.rawCode = rawCode;
    this.details = details;
    this.isRetryable = isRetryable;
  }
}

/**
 * Normalizes MISA meInvoice error responses into standard QBiz Provider Error
 */
export function normalizeMisaError(err, context = '') {
  if (err instanceof MisaProviderError) {
    return err;
  }

  const status = err.status || err.httpStatus || null;
  const message = err.message || 'Lỗi không xác định từ nhà cung cấp MISA';
  const rawCode = err.code || err.errorCode || null;
  const details = maskSensitiveData(err.details || err.data || null);

  // 1. Missing credentials or authentication failures
  if (rawCode === 'MISSING_MISA_CREDENTIALS' || status === 401 || (status === 403 && !rawCode?.includes('TENANT'))) {
    return new MisaProviderError(ProviderErrorCode.AUTH_ERROR, `Lỗi xác thực MISA: ${message}`, {
      httpStatus: status || 401,
      rawCode: rawCode || 'UNAUTHORIZED',
      details,
      isRetryable: false
    });
  }

  const netErrCode = err.code || err.cause?.code;

  // 2. Ambiguous Timeouts (Network disconnect / gateway timeout)
  if (err.name === 'AbortError' || netErrCode === 'ETIMEDOUT' || netErrCode === 'ECONNRESET' || status === 504) {
    return new MisaProviderError(ProviderErrorCode.TIMEOUT_AMBIGUOUS, `Mất kết nối hoặc quá thời gian chờ MISA: ${message}. Cần đối soát trước khi thử lại.`, {
      httpStatus: status || 504,
      rawCode: 'TIMEOUT_AMBIGUOUS',
      details,
      isRetryable: true
    });
  }

  // 3. Provider service outage
  if (status === 502 || status === 503 || netErrCode === 'ECONNREFUSED' || netErrCode === 'ENOTFOUND') {
    return new MisaProviderError(ProviderErrorCode.PROVIDER_UNAVAILABLE, `Hệ thống MISA meInvoice đang bảo trì hoặc không thể kết nối.`, {
      httpStatus: status || 503,
      rawCode: 'PROVIDER_DOWN',
      details,
      isRetryable: true
    });
  }

  // 4. Rate limiting
  if (status === 429) {
    return new MisaProviderError(ProviderErrorCode.RATE_LIMITED, `Vượt quá giới hạn tần suất gọi API MISA. Vui lòng thử lại sau.`, {
      httpStatus: 429,
      rawCode: 'RATE_LIMIT_EXCEEDED',
      details,
      isRetryable: true
    });
  }

  // 5. Duplicate Reference / Invoice already exists
  if (status === 409 || String(message).toLowerCase().includes('đã tồn tại') || String(rawCode).includes('DUPLICATE') || String(rawCode).includes('DuplicateInvoiceRefID')) {
    return new MisaProviderError(ProviderErrorCode.DUPLICATE_REFERENCE, `Hóa đơn hoặc mã tham chiếu đã tồn tại trên hệ thống MISA.`, {
      httpStatus: status || 409,
      rawCode: rawCode || 'DUPLICATE_REFERENCE',
      details,
      isRetryable: false
    });
  }

  // 6. Not Found
  if (status === 404) {
    return new MisaProviderError(ProviderErrorCode.NOT_FOUND, `Không tìm thấy hóa đơn hoặc chứng từ trên MISA: ${message}`, {
      httpStatus: 404,
      rawCode: 'NOT_FOUND',
      details,
      isRetryable: false
    });
  }

  // 7. Capability Not Implemented
  if (rawCode === 'CAPABILITY_NOT_IMPLEMENTED') {
    return new MisaProviderError(ProviderErrorCode.CAPABILITY_NOT_AVAILABLE, message, {
      httpStatus: status || 400,
      rawCode: 'CAPABILITY_NOT_IMPLEMENTED',
      details,
      isRetryable: false
    });
  }

  // 8. Validation / Business rule / Configuration
  if (status === 400 || rawCode === 'MISSING_SIGNTYPE' || rawCode === 'INVALID_SIGNTYPE' || rawCode === 'INCOMPATIBLE_SIGNTYPE' || rawCode === 'CONFIG_UNRESOLVED' || rawCode === 'MISSING_IDENTIFIER' || rawCode === 'MISSING_TRANSACTION_ID') {
    return new MisaProviderError(ProviderErrorCode.VALIDATION_ERROR, `Dữ liệu hóa đơn không hợp lệ theo chuẩn MISA: ${message}`, {
      httpStatus: status || 400,
      rawCode: rawCode || 'VALIDATION_ERROR',
      details,
      isRetryable: false
    });
  }

  return new MisaProviderError(ProviderErrorCode.UNKNOWN_PROVIDER_ERROR, `Lỗi xử lý từ MISA [${context}]: ${message}`, {
    httpStatus: status,
    rawCode,
    details,
    isRetryable: false
  });
}

/**
 * Maps immutable QBiz Invoice Snapshot into MISA meInvoice Open API Integration Format
 * Direct master fields: ReferenceType (1 Replace, 2 Adjust), OrgInv* on root invoice data.
 */
export function mapQBizSnapshotToMisaInvoice(snapshot, { templateCode = '1', series = '1C26TDC', operation = 'ISSUE', originalInvoice = null, adjustmentData = null, replacementData = null, idempotencyKey = '' } = {}) {
  if (!snapshot) {
    throw new Error('snapshot is required for mapQBizSnapshotToMisaInvoice');
  }

  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const refId = idempotencyKey || snapshot.id || `QBIZ-${Date.now()}`;
  const invDate = (snapshot.issued_at || snapshot.created_at || new Date().toISOString()).slice(0, 10);

  // Map Item Details
  const itemDetails = items.map((it, idx) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unit_price) || 0;
    const discount = Number(it.discount) || 0;
    const amount = (qty * price) - discount;
    const vatRate = it.vat_rate !== undefined && it.vat_rate !== null ? Number(it.vat_rate) : 0;
    const vatAmount = it.vat_amount !== undefined ? Number(it.vat_amount) : Math.round(amount * (vatRate / 100));

    return {
      LineNumber: idx + 1,
      ItemType: 1, // 1: Hàng hóa dịch vụ thông thường
      ItemCode: it.code || it.sku || it.product_id || `ITEM-${idx + 1}`,
      ItemName: it.name || it.product_name || 'Hàng hóa / Dịch vụ',
      UnitName: it.unit || 'Chiếc',
      Quantity: qty,
      UnitPrice: price,
      DiscountAmount: discount,
      Amount: amount,
      VATRateName: `${vatRate}%`,
      VATAmount: vatAmount
    };
  });

  const totalPretax = snapshot.subtotal !== undefined ? Number(snapshot.subtotal) : itemDetails.reduce((sum, i) => sum + i.Amount, 0);
  const totalVat = snapshot.vat_total !== undefined ? Number(snapshot.vat_total) : itemDetails.reduce((sum, i) => sum + i.VATAmount, 0);
  const totalAmount = snapshot.total !== undefined ? Number(snapshot.total) : (totalPretax + totalVat);

  const misaPayload = {
    RefID: refId,
    InvoiceType: 1, // Hóa đơn GTGT theo Nghị định 123
    InvTemplateNo: templateCode,
    InvSeries: series,
    InvDate: invDate,
    CurrencyCode: 'VND',
    ExchangeRate: 1,
    PaymentMethod: snapshot.payment_method || 'TM/CK',
    
    // Buyer Information
    BuyerLegalName: snapshot.buyer?.company_name || snapshot.buyer?.name || '',
    BuyerTaxCode: snapshot.buyer?.tax_code || '',
    BuyerAddress: snapshot.buyer?.address || '',
    BuyerPhoneNumber: snapshot.buyer?.phone || '',
    BuyerEmail: snapshot.buyer?.email || '',
    BuyerFullName: snapshot.buyer?.name || '',

    // Detail Items
    OriginalDetails: itemDetails,

    // Totals
    TotalSaleAmount: totalPretax,
    TotalDiscountAmount: Number(snapshot.discount_total || 0),
    TotalVATAmount: totalVat,
    TotalAmount: totalAmount,

    // Lineage & Metadata tracking
    CustomData: {
      qbiz_sale_id: snapshot.sale_id || null,
      qbiz_invoice_id: snapshot.id || null,
      qbiz_idempotency_key: idempotencyKey || null,
      qbiz_operation: operation
    }
  };

  // Adjust / Replace Master Fields (Direct on invoice master per Open API integration)
  if (operation === 'REPLACE' || operation === 'ADJUST') {
    misaPayload.ReferenceType = operation === 'REPLACE' ? 1 : 2; // 1: Thay thế, 2: Điều chỉnh
    if (originalInvoice) {
      misaPayload.OrgInvoiceType = originalInvoice.invoice_type || 1;
      misaPayload.OrgInvTemplateNo = originalInvoice.template_code || originalInvoice.template_no || templateCode;
      misaPayload.OrgInvSeries = originalInvoice.series || series;
      misaPayload.OrgInvNo = originalInvoice.invoice_number || originalInvoice.number || '';
      misaPayload.OrgInvDate = (originalInvoice.issued_at || originalInvoice.created_at || invDate).slice(0, 10);
      misaPayload.InvoiceNote = adjustmentData?.reason || replacementData?.reason || 'Biên bản xử lý sai sót hóa đơn';
      
      // Backward-compatible mirror object
      misaPayload.OriginalInvoiceData = {
        ReferenceType: misaPayload.ReferenceType,
        OrgInvoiceType: misaPayload.OrgInvoiceType,
        OrgInvTemplateNo: misaPayload.OrgInvTemplateNo,
        OrgInvSeries: misaPayload.OrgInvSeries,
        OrgInvNo: misaPayload.OrgInvNo,
        OrgInvDate: misaPayload.OrgInvDate,
        AdditionalReferenceDesc: misaPayload.InvoiceNote
      };
    }
  }

  return misaPayload;
}

// Module-level Server-Side Token Cache (Tenant Scoped: tenant:taxCode:username -> { token, softExpiresAt, expiresAt })
const _misaTokenStore = new Map();

export function clearMisaTokenCache(tenantId = null) {
  if (tenantId) {
    for (const key of _misaTokenStore.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        _misaTokenStore.delete(key);
      }
    }
  } else {
    _misaTokenStore.clear();
  }
}

export function getMisaTokenStoreSize() {
  return _misaTokenStore.size;
}

// Module-level Per-Series Mutex/Queue to serialize calls with the same InvSeries
const _seriesQueues = new Map();

/**
 * Serializes async calls per InvSeries.
 * Calls with the SAME InvSeries run sequentially in FIFO order.
 * Calls with DIFFERENT InvSeries run concurrently without blocking.
 * Releases lock reliably in finally; prevents deadlocks on errors or idempotent replays.
 */
export async function withSeriesLock(series, taskFn) {
  const seriesKey = String(series || 'DEFAULT_SERIES').trim().toUpperCase();
  const prevPromise = _seriesQueues.get(seriesKey) || Promise.resolve();

  let release;
  const currentPromise = new Promise(resolve => {
    release = resolve;
  });

  _seriesQueues.set(seriesKey, currentPromise);

  try {
    await prevPromise;
    return await taskFn();
  } finally {
    release();
    if (_seriesQueues.get(seriesKey) === currentPromise) {
      _seriesQueues.delete(seriesKey);
    }
  }
}

/**
 * MISA meInvoice Provider Adapter Class (Open API Integration)
 */
export class MisaInvoiceProvider {
  constructor(config = {}) {
    this.capabilities = MISA_PROVIDER_CAPABILITIES;
    this.tenantId = config.tenantId || (typeof process !== 'undefined' ? (process.env?.QBIZ_SHOP_ID || process.env?.TENANT_ID) : '') || 'default';
    this.appId = config.appId || (typeof process !== 'undefined' ? process.env?.MISA_APP_ID : '') || '';
    this.taxCode = config.taxCode || (typeof process !== 'undefined' ? process.env?.MISA_TAX_CODE : '') || '';
    this.username = config.username || (typeof process !== 'undefined' ? process.env?.MISA_USERNAME : '') || '';
    this.password = config.password || (typeof process !== 'undefined' ? process.env?.MISA_PASSWORD : '') || '';

    const isProd = typeof process !== 'undefined' && (
      process.env?.NODE_ENV === 'production' ||
      process.env?.VERCEL_ENV === 'production' ||
      process.env?.QBIZ_ENV === 'production'
    );
    const defaultBaseUrl = isProd
      ? 'https://api.meinvoice.vn/api/integration'
      : 'https://testapi.meinvoice.vn/api/integration';

    this.baseUrl = (config.baseUrl || (typeof process !== 'undefined' ? (process.env?.MISA_BASE_URL || process.env?.MISA_SANDBOX_BASE_URL) : '') || defaultBaseUrl).replace(/\/+$/, '');
    this.authUrl = config.authUrl || (typeof process !== 'undefined' ? process.env?.MISA_AUTH_URL : '') || `${this.baseUrl}/auth/token`;
    this.templateCode = config.templateCode || (typeof process !== 'undefined' ? process.env?.MISA_TEMPLATE_CODE : '') || '1';
    this.series = config.series !== undefined ? (config.series ? String(config.series).trim().toUpperCase() : '') : ((typeof process !== 'undefined' ? process.env?.MISA_INVOICE_SERIES : '') || '1C26TDC');
    this.fetchFn = config.fetchFn || null;

    // 1. SignType: 1..6 per MISA Open API specification:
    // 1 = USB/file mềm
    // 2 = HSM có hiển thị CKS
    // 3 = HSM bất đồng bộ
    // 4 = ký sau vé không mã
    // 5 = ký sau hóa đơn MTT, không hiển thị CKS
    // 6 = ký sau hóa đơn/vé MTT, bất đồng bộ
    // Must come from trusted server/provider config. Client cannot override.
    const rawSignType = config.signType ?? (typeof process !== 'undefined' ? process.env?.MISA_SIGN_TYPE : undefined);
    this.signType = (rawSignType !== undefined && rawSignType !== null && rawSignType !== '')
      ? Number(rawSignType)
      : null;

    if (this.signType !== null && !MISA_DOCUMENTED_SIGN_TYPES.includes(this.signType)) {
      throw new MisaProviderError(
        ProviderErrorCode.VALIDATION_ERROR,
        `Hình thức ký MISA (signType=${rawSignType}) không hợp lệ theo tài liệu MISA Open API (chỉ chấp nhận 1..6).`,
        {
          rawCode: 'INVALID_SIGNTYPE',
          httpStatus: 400,
          details: { signType: this.signType, allowed: MISA_DOCUMENTED_SIGN_TYPES }
        }
      );
    }

    // 2. Invoice Flags: strictly derived or configured from trusted server/provider sources. Client cannot override.
    let resolvedWithCode = null;
    let resolvedCalcu = null;

    if (typeof config.invoiceWithCode === 'boolean') {
      resolvedWithCode = config.invoiceWithCode;
    } else if (typeof process !== 'undefined' && process.env?.MISA_INVOICE_WITH_CODE !== undefined) {
      resolvedWithCode = process.env.MISA_INVOICE_WITH_CODE === 'true' || process.env.MISA_INVOICE_WITH_CODE === '1';
    }

    if (typeof config.invoiceCalcu === 'boolean') {
      resolvedCalcu = config.invoiceCalcu;
    } else if (typeof process !== 'undefined' && process.env?.MISA_INVOICE_CALCU !== undefined) {
      resolvedCalcu = process.env.MISA_INVOICE_CALCU === 'true' || process.env.MISA_INVOICE_CALCU === '1';
    }

    // If flags are not fully explicitly configured, derive from InvSeries (if series provided)
    if (resolvedWithCode === null || resolvedCalcu === null) {
      if (this.series) {
        const parsedSeries = parseMisaSeries(this.series);
        if (parsedSeries) {
          if (resolvedWithCode === null) resolvedWithCode = parsedSeries.invoiceWithCode;
          if (resolvedCalcu === null) resolvedCalcu = parsedSeries.invoiceCalcu;
        }
      }
    }

    // Fail closed if series was provided but either flag remains unresolved and no trusted override (SERIES_PARSE_INVALID_FAIL_CLOSED=YES)
    if (this.series && (resolvedWithCode === null || resolvedCalcu === null)) {
      throw new MisaProviderError(
        ProviderErrorCode.VALIDATION_ERROR,
        `Không thể xác định invoiceWithCode hoặc invoiceCalcu từ InvSeries '${this.series}': ký hiệu không đúng quy chuẩn hoặc không đủ độ dài. Cần InvSeries chuẩn (ký tự 2 là C/K, ký tự 5 là M/T) hoặc cấu hình tường minh invoiceWithCode/invoiceCalcu.`,
        {
          rawCode: 'CONFIG_UNRESOLVED',
          httpStatus: 400,
          details: { series: this.series, resolvedWithCode, resolvedCalcu }
        }
      );
    }

    this.invoiceWithCode = resolvedWithCode;
    this.invoiceCalcu = resolvedCalcu;
  }

  /**
   * Generates tenant/credential scoped cache key
   */
  _getCacheKey() {
    return `${this.tenantId}:${this.taxCode}:${this.username}`;
  }

  /**
   * Checks if required sandbox/production credentials are fully configured
   */
  hasCredentials() {
    return Boolean(this.appId && this.taxCode && this.username && this.password);
  }

  /**
   * Obtains active bearer token from MISA auth endpoint with 14-day reuse and 7-day soft refresh cache
   */
  async authenticate({ forceRefresh = false } = {}) {
    const cacheKey = this._getCacheKey();
    const cached = _misaTokenStore.get(cacheKey);

    // MISA Token Policy: 14-day validity, recommended soft refresh around 7 days.
    // Within 7 days: reuse token without network fetch (TOKEN_FETCH_PER_OPERATION = NO).
    // After 7 days: soft refresh by requesting new token (TOKEN_SOFT_REFRESH_POLICY = YES).
    const now = Date.now();
    if (!forceRefresh && cached && now < cached.softExpiresAt) {
      return cached.token;
    }

    if (!this.hasCredentials()) {
      throw normalizeMisaError({
        code: 'MISSING_MISA_CREDENTIALS',
        message: 'Chưa cấu hình thông tin xác thực MISA meInvoice (MISA_APP_ID, MISA_TAX_CODE, MISA_USERNAME, MISA_PASSWORD) trong biến môi trường server.'
      }, 'authenticate');
    }

    try {
      const payload = {
        appid: this.appId,
        taxcode: this.taxCode,
        username: this.username,
        password: this.password
      };

      const fetcher = this.fetchFn || fetch;
      const response = await fetcher(this.authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        let errJson = null;
        try { errJson = JSON.parse(errText); } catch {}
        throw normalizeMisaError({
          status: response.status,
          message: errJson?.message || errText || `Lỗi xác thực HTTP ${response.status}`,
          details: errJson
        }, 'authenticate');
      }

      const resData = await response.json();
      const token = resData?.Data || resData?.token || resData?.data?.token || resData?.access_token;
      if (!token) {
        throw normalizeMisaError({
          status: 500,
          message: 'Phản hồi từ MISA không chứa token xác thực',
          details: resData
        }, 'authenticate');
      }

      // Soft refresh window: 7 days. Hard expiry: 14 days.
      const SOFT_REFRESH_MS = 7 * 24 * 3600 * 1000;
      const HARD_TTL_MS = resData?.expires_in ? Number(resData.expires_in) * 1000 : (14 * 24 * 3600 * 1000) - 3600000;
      const softTtlMs = Math.min(SOFT_REFRESH_MS, HARD_TTL_MS);

      _misaTokenStore.set(cacheKey, {
        token,
        obtainedAt: now,
        softExpiresAt: now + softTtlMs,
        expiresAt: now + HARD_TTL_MS
      });

      return token;

    } catch (err) {
      _misaTokenStore.delete(cacheKey);
      throw normalizeMisaError(err, 'authenticate');
    }
  }

  /**
   * Helper to perform authenticated HTTP requests to MISA Open API Integration endpoints
   */
  async _request(endpoint, { method = 'POST', body = null, headers = {}, retryOn401 = true } = {}) {
    const token = await this.authenticate();
    const url = `${this.baseUrl}/${endpoint.replace(/^\/+/, '')}`;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'CompanyTaxCode': this.taxCode,
      ...headers
    };

    try {
      const fetcher = this.fetchFn || fetch;
      const resp = await fetcher(url, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined
      });

      if (resp.status === 401 && retryOn401) {
        // Token expired on server: clear cache, refresh once, and retry
        _misaTokenStore.delete(this._getCacheKey());
        return await this._request(endpoint, { method, body, headers, retryOn401: false });
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        throw normalizeMisaError({
          status: resp.status,
          message: parsed?.message || text || `MISA API trả về mã lỗi HTTP ${resp.status}`,
          details: parsed
        }, endpoint);
      }

      return await resp.json();
    } catch (err) {
      throw normalizeMisaError(err, endpoint);
    }
  }

  /**
   * Sets or updates InvSeries dynamically (e.g. following discovery)
   */
  setSeries(series, { templateCode = null } = {}) {
    this.series = String(series || '').trim().toUpperCase();
    if (templateCode) {
      this.templateCode = String(templateCode).trim();
    }
    const parsed = parseMisaSeries(this.series);
    if (!parsed) {
      throw new MisaProviderError(
        ProviderErrorCode.VALIDATION_ERROR,
        `Ký hiệu hóa đơn '${this.series}' không hợp lệ theo quy chuẩn Nghị định 123 (ký tự 2 phải là C/K, ký tự 5 phải là M/T, độ dài >= 5).`,
        { rawCode: 'CONFIG_UNRESOLVED', httpStatus: 400, details: { series: this.series } }
      );
    }
    this.invoiceWithCode = parsed.invoiceWithCode;
    this.invoiceCalcu = parsed.invoiceCalcu;
    return this;
  }

  /**
   * Sets or updates SignType dynamically
   */
  setSignType(signType) {
    this.signType = Number(signType);
    return this;
  }

  /**
   * Retrieves invoice templates from MISA meInvoice Open API
   * GET /invoice/templates?invoiceWithCode={boolean}&ticket={boolean}
   */
  async getTemplates({ invoiceWithCode = true, ticket = false } = {}) {
    const endpoint = `invoice/templates?invoiceWithCode=${Boolean(invoiceWithCode)}&ticket=${Boolean(ticket)}`;
    const res = await this._request(endpoint, { method: 'GET' });
    let rawList = res?.Data || res?.data || res;
    if (typeof rawList === 'string') {
      try { rawList = JSON.parse(rawList); } catch {}
    }
    if (!Array.isArray(rawList)) {
      rawList = [];
    }
    return rawList;
  }

  /**
   * Discovery A02: Discovers and normalizes all available invoice templates and series.
   * Queries both invoiceWithCode=true and invoiceWithCode=false with ticket=false.
   * Merges, derives flags, deduplicates, and separates active vs inactive.
   * Strictly outputs SAFE metadata (no secrets, no tokens).
   */
  async discoverTemplates() {
    const [withCodeList, noCodeList] = await Promise.all([
      this.getTemplates({ invoiceWithCode: true, ticket: false }),
      this.getTemplates({ invoiceWithCode: false, ticket: false })
    ]);

    const combined = [...withCodeList, ...noCodeList];
    const seen = new Set();
    const allTemplates = [];

    for (const item of combined) {
      if (!item || typeof item !== 'object') continue;
      const invTemplateNo = String(item.InvTemplateNo || item.invTemplateNo || item.TemplateCode || item.templateCode || '').trim();
      const invSeries = String(item.InvSeries || item.invSeries || item.Series || item.series || '').trim().toUpperCase();
      const templateName = String(item.TemplateName || item.templateName || item.Name || item.name || '').trim();
      const inactive = Boolean(item.Inactive !== undefined ? item.Inactive : item.inactive);
      const isSendSummary = item.IsSendSummary !== undefined ? Boolean(item.IsSendSummary) : (item.isSendSummary !== undefined ? Boolean(item.isSendSummary) : null);

      if (!invSeries) continue;

      const dedupeKey = `${invTemplateNo}::${invSeries}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Derive flags according to Decree 123 & MISA series format
      const parsed = parseMisaSeries(invSeries);
      const withCode = parsed ? parsed.invoiceWithCode : (invSeries.length >= 2 ? invSeries.charAt(1) === 'C' : false);
      const invoiceCalcu = parsed ? parsed.invoiceCalcu : (invSeries.length >= 5 ? invSeries.charAt(4) === 'M' : false);

      allTemplates.push({
        InvTemplateNo: invTemplateNo,
        InvSeries: invSeries,
        TemplateName: templateName,
        Inactive: inactive,
        IsSendSummary: isSendSummary,
        withCode,
        invoiceCalcu,
        seriesTypeLabel: invoiceCalcu ? 'MTT' : 'Thường',
        codeLabel: withCode ? 'Có mã CQT' : 'Không mã',
        activeLabel: inactive ? 'Ngừng hoạt động' : 'Đang hoạt động'
      });
    }

    const activeTemplates = allTemplates.filter(t => !t.Inactive);

    return {
      success: true,
      totalCount: allTemplates.length,
      activeCount: activeTemplates.length,
      hasActiveTemplate: activeTemplates.length > 0,
      templates: allTemplates,
      activeTemplates
    };
  }

  /**
   * Validates SignType for issuing operations (issue, adjust, replace):
   * 1. Fail closed if missing: MISSING_SIGNTYPE
   * 2. Fail closed if not in [1, 2, 3, 4, 5, 6]: INVALID_SIGNTYPE
   * 3. Mode 3 & 6: Reject CAPABILITY_NOT_IMPLEMENTED (adapter does not implement async polling/webhook)
   * 4. Mode 5 (MTT): Must match invoiceCalcu (MTT mode), rejects regular invoices
   * 5. Mode 4 (Vé): Must match series starting with '5'
   * 6. Mode 2 (HSM Sync): Accepted for regular and MTT
   */
  validateSignType(operation = 'issue') {
    if (!this.series || this.invoiceWithCode === null || this.invoiceCalcu === null) {
      throw new MisaProviderError(
        ProviderErrorCode.VALIDATION_ERROR,
        `Chưa cấu hình InvSeries hợp lệ cho thao tác phát hành hóa đơn. Cần InvSeries chuẩn (ký tự 2 là C/K, ký tự 5 là M/T).`,
        { rawCode: 'CONFIG_UNRESOLVED', httpStatus: 400 }
      );
    }

    if (this.signType === null || this.signType === undefined) {
      throw new MisaProviderError(
        ProviderErrorCode.VALIDATION_ERROR,
        'Chưa cấu hình hình thức ký hóa đơn MISA meInvoice (MISA_SIGN_TYPE: 1=USB/File, 2=HSM có hiển thị CKS, 3=HSM bất đồng bộ, 4=Ký sau vé không mã, 5=Ký sau MTT không hiển thị CKS, 6=Ký sau MTT bất đồng bộ).',
        {
          rawCode: 'MISSING_SIGNTYPE',
          httpStatus: 400
        }
      );
    }

    if (!MISA_DOCUMENTED_SIGN_TYPES.includes(this.signType)) {
      throw new MisaProviderError(
        ProviderErrorCode.VALIDATION_ERROR,
        `Hình thức ký MISA (MISA_SIGN_TYPE=${this.signType}) không hợp lệ theo tài liệu MISA Open API (chỉ chấp nhận 1..6).`,
        {
          rawCode: 'INVALID_SIGNTYPE',
          httpStatus: 400,
          details: { signType: this.signType, allowed: MISA_DOCUMENTED_SIGN_TYPES }
        }
      );
    }

    // Async modes (3, 6): Not implemented in synchronous adapter lifecycle
    if (this.signType === 3 || this.signType === 6) {
      throw new MisaProviderError(
        ProviderErrorCode.CAPABILITY_NOT_AVAILABLE,
        `Hình thức ký bất đồng bộ (SignType ${this.signType}: ${MISA_SIGN_TYPE_LABELS[this.signType]}) chưa được hỗ trợ trong phiên bản adapter hiện tại do chưa có cơ chế xử lý webhook / polling kết quả ký async. Vui lòng sử dụng SignType đồng bộ (2 cho hóa đơn thường hoặc 5 cho hóa đơn MTT).`,
        {
          rawCode: 'CAPABILITY_NOT_IMPLEMENTED',
          httpStatus: 400,
          details: { signType: this.signType, asyncMode: true }
        }
      );
    }

    // SignType 5: specifically for MTT (máy tính tiền, invoiceCalcu = true)
    if (this.signType === 5) {
      if (this.invoiceCalcu !== true) {
        throw new MisaProviderError(
          ProviderErrorCode.VALIDATION_ERROR,
          'SignType=5 (ký sau hóa đơn MTT, không hiển thị CKS) chỉ áp dụng cho hóa đơn máy tính tiền (invoiceCalcu = true / ký hiệu ký tự thứ 5 là M). Hóa đơn thường yêu cầu SignType=2 (HSM) hoặc cấu hình tương thích.',
          {
            rawCode: 'INCOMPATIBLE_SIGNTYPE',
            httpStatus: 400,
            details: { signType: this.signType, invoiceCalcu: this.invoiceCalcu, series: this.series }
          }
        );
      }
    }

    // SignType 4: specifically for tickets (vé không mã)
    if (this.signType === 4) {
      const char1 = this.series ? this.series.trim().charAt(0) : '';
      if (char1 !== '5') {
        throw new MisaProviderError(
          ProviderErrorCode.VALIDATION_ERROR,
          'SignType=4 (ký sau vé không mã) chỉ áp dụng cho tem/vé/thẻ điện tử (ký tự đầu của series là 5).',
          {
            rawCode: 'INCOMPATIBLE_SIGNTYPE',
            httpStatus: 400,
            details: { signType: this.signType, series: this.series }
          }
        );
      }
    }

    return true;
  }

  /**
   * 1. createDraft: Previews / validates draft invoice on MISA Open API (/invoice/unpublishview)
   */
  async createDraft({ invoiceData, idempotencyKey } = {}) {
    const misaInvoice = mapQBizSnapshotToMisaInvoice(invoiceData, {
      templateCode: this.templateCode,
      series: this.series,
      operation: 'DRAFT',
      idempotencyKey
    });

    const res = await this._request('invoice/unpublishview', {
      method: 'POST',
      body: {
        SignType: this.signType || 1,
        InvoiceData: misaInvoice
      }
    });

    return {
      success: true,
      provider_code: this.capabilities.provider_code,
      provider_draft_id: res?.InvoiceID || res?.data?.InvoiceID || `MISA-DFT-${misaInvoice.RefID}`,
      ref_id: misaInvoice.RefID,
      status: 'DRAFT',
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString()
    };
  }

  /**
   * 2. issue: Issues electronic invoice (POST /invoice)
   * Enforces server-side SignType and per-series FIFO serialization queue.
   */
  async issue({ invoiceData, idempotencyKey } = {}) {
    if (!this.hasCredentials()) {
      throw normalizeMisaError({
        code: 'MISSING_MISA_CREDENTIALS',
        message: 'Chưa cấu hình thông tin xác thực MISA meInvoice (MISA_APP_ID, MISA_TAX_CODE, MISA_USERNAME, MISA_PASSWORD) trong biến môi trường server.'
      }, 'issue');
    }

    this.validateSignType('issue');

    const misaInvoice = mapQBizSnapshotToMisaInvoice(invoiceData, {
      templateCode: this.templateCode,
      series: this.series,
      operation: 'ISSUE',
      idempotencyKey
    });

    const seriesKey = misaInvoice.InvSeries || this.series;
    return await withSeriesLock(seriesKey, async () => {
      try {
        const res = await this._request('invoice', {
          method: 'POST',
          body: {
            SignType: this.signType,
            InvoiceData: misaInvoice,
            PublishInvoiceData: {
              InvTemplateNo: misaInvoice.InvTemplateNo,
              InvSeries: misaInvoice.InvSeries,
              InvDate: misaInvoice.InvDate
            }
          }
        });

        const invData = res?.data || res;
        return {
          success: true,
          provider_code: this.capabilities.provider_code,
          ref_id: misaInvoice.RefID,
          provider_invoice_id: invData.InvoiceID || invData.TransactionID || `MISA-${misaInvoice.RefID}`,
          transaction_id: invData.TransactionID || invData.InvoiceID || null,
          invoice_number: invData.InvoiceNo || invData.InvNo || null,
          series: invData.InvoiceSeries || this.series,
          template_code: invData.InvoiceTemplate || this.templateCode,
          issued_at: invData.IssueDate || new Date().toISOString(),
          lookup_code: invData.LookupCode || invData.ReservationCode || null,
          tax_authority_code: invData.TaxAuthorityCode || null,
          status: 'ISSUED',
          idempotency_key: idempotencyKey
        };
      } catch (err) {
        // If duplicate RefID error, automatically reconcile to prevent blind reissue
        if (err.errorCode === ProviderErrorCode.DUPLICATE_REFERENCE) {
          const existing = await this.reconcile({ idempotencyKey, refId: misaInvoice.RefID });
          if (existing.reconciled) {
            return {
              success: true,
              provider_code: this.capabilities.provider_code,
              ref_id: misaInvoice.RefID,
              provider_invoice_id: existing.provider_invoice_id,
              transaction_id: existing.transaction_id,
              invoice_number: existing.invoice_number,
              series: this.series,
              template_code: this.templateCode,
              status: existing.status || 'ISSUED',
              idempotency_key: idempotencyKey,
              idempotent_replay: true
            };
          }
        }
        throw err;
      }
    });
  }

  /**
   * 3. getStatus: Queries invoice status via POST /invoice/status
   * Conforms strictly to MISA Wire Shape:
   *   Query params: invoiceWithCode, invoiceCalcu, inputType=1|2
   *   Body: ["TransactionID_or_RefID", ...] (array of IDs)
   */
  async getStatus({ invoiceId, providerInvoiceId, transactionId, lookupCode, idempotencyKey, refId } = {}) {
    const lookupRef = refId || idempotencyKey || invoiceId;
    const targetTransactionId = transactionId || providerInvoiceId;

    const inputType = lookupRef ? 2 : 1;
    const targetId = lookupRef ? lookupRef : targetTransactionId;

    if (!targetId) {
      throw normalizeMisaError({
        code: 'MISSING_IDENTIFIER',
        message: 'Thiếu mã tra cứu trạng thái hóa đơn (refId, idempotencyKey, hoặc transactionId)'
      }, 'getStatus');
    }

    const queryParams = new URLSearchParams({
      invoiceWithCode: String(this.invoiceWithCode),
      invoiceCalcu: String(this.invoiceCalcu),
      inputType: String(inputType)
    });

    const endpoint = `invoice/status?${queryParams.toString()}`;
    const body = Array.isArray(targetId) ? targetId : [String(targetId)];

    const res = await this._request(endpoint, {
      method: 'POST',
      body
    });

    let rawItem = res;
    if (res?.data) rawItem = res.data;
    if (Array.isArray(rawItem)) rawItem = rawItem[0] || {};

    let normalizedStatus = 'ISSUED';
    if (rawItem.Status === 1 || rawItem.InvoiceStatus === 'SIGNED' || rawItem.InvoiceStatus === 'ISSUED') normalizedStatus = 'ISSUED';
    if (rawItem.Status === 2 || rawItem.InvoiceStatus === 'ADJUSTED') normalizedStatus = 'ADJUSTED';
    if (rawItem.Status === 3 || rawItem.InvoiceStatus === 'REPLACED') normalizedStatus = 'REPLACED';
    if (rawItem.Status === 4 || rawItem.InvoiceStatus === 'CANCELLED') normalizedStatus = 'CANCELLED';

    return {
      success: true,
      provider_code: this.capabilities.provider_code,
      status: normalizedStatus,
      tax_authority_status: rawItem.TaxStatus || 'APPROVED',
      tax_authority_code: rawItem.TaxAuthorityCode || null,
      ref_id: lookupRef,
      transaction_id: rawItem.TransactionID || targetTransactionId,
      invoice_number: rawItem.InvoiceNo || rawItem.InvNo || null,
      checked_at: new Date().toISOString(),
      raw_data: rawItem
    };
  }

  /**
   * 4. getDocument: Retrieves official representation file via POST /invoice/download
   * Conforms strictly to MISA Wire Shape:
   *   Query params: invoiceWithCode, invoiceCalcu, downloadDataType=xml|pdf|All
   *   Body: ["TransactionID1", ...] (array of TransactionIDs)
   */
  async getDocument({ invoiceId, providerInvoiceId, format = 'PDF' } = {}) {
    const targetId = providerInvoiceId || invoiceId;
    if (!targetId) {
      throw normalizeMisaError({
        code: 'MISSING_TRANSACTION_ID',
        message: 'Thiếu transactionId để tải hóa đơn điện tử'
      }, 'getDocument');
    }

    const fmt = format.toLowerCase();
    const downloadDataType = fmt === 'xml' ? 'xml' : (fmt === 'all' ? 'All' : 'pdf');

    const queryParams = new URLSearchParams({
      invoiceWithCode: String(this.invoiceWithCode),
      invoiceCalcu: String(this.invoiceCalcu),
      downloadDataType
    });

    const endpoint = `invoice/download?${queryParams.toString()}`;
    const body = Array.isArray(targetId) ? targetId : [String(targetId)];

    const res = await this._request(endpoint, {
      method: 'POST',
      body
    });

    let data = res?.data || res;
    if (Array.isArray(data)) data = data[0] || {};

    return {
      success: true,
      provider_code: this.capabilities.provider_code,
      format: format.toUpperCase(),
      content_type: format.toUpperCase() === 'XML' ? 'application/xml' : 'application/pdf',
      data: data.FileBase64 || data.Content || data.data || null,
      file_url: data.FileUrl || null
    };
  }

  /**
   * 5. adjust: Issues an adjustment invoice (POST /invoice with ReferenceType = 2)
   * Enforces server-side SignType and per-series FIFO serialization queue.
   */
  async adjust({ originalInvoice, adjustmentData, idempotencyKey } = {}) {
    if (!this.hasCredentials()) {
      throw normalizeMisaError({
        code: 'MISSING_MISA_CREDENTIALS',
        message: 'Chưa cấu hình thông tin xác thực MISA meInvoice (MISA_APP_ID, MISA_TAX_CODE, MISA_USERNAME, MISA_PASSWORD) trong biến môi trường server.'
      }, 'adjust');
    }

    this.validateSignType('adjust');

    const misaInvoice = mapQBizSnapshotToMisaInvoice(adjustmentData, {
      templateCode: this.templateCode,
      series: this.series,
      operation: 'ADJUST',
      originalInvoice,
      adjustmentData,
      idempotencyKey
    });

    const seriesKey = misaInvoice.InvSeries || this.series;
    return await withSeriesLock(seriesKey, async () => {
      const res = await this._request('invoice', {
        method: 'POST',
        body: {
          SignType: this.signType,
          InvoiceData: misaInvoice,
          PublishInvoiceData: {
            InvTemplateNo: misaInvoice.InvTemplateNo,
            InvSeries: misaInvoice.InvSeries,
            InvDate: misaInvoice.InvDate
          }
        }
      });

      const invData = res?.data || res;
      return {
        success: true,
        provider_code: this.capabilities.provider_code,
        ref_id: misaInvoice.RefID,
        provider_invoice_id: invData.InvoiceID || invData.TransactionID || `MISA-ADJ-${misaInvoice.RefID}`,
        transaction_id: invData.TransactionID || invData.InvoiceID || null,
        invoice_number: invData.InvoiceNo || null,
        series: invData.InvoiceSeries || this.series,
        template_code: invData.InvoiceTemplate || this.templateCode,
        issued_at: new Date().toISOString(),
        original_invoice_id: originalInvoice.id || originalInvoice.provider_invoice_id,
        lineage_type: 'ADJUSTMENT',
        status: 'ISSUED',
        idempotency_key: idempotencyKey
      };
    });
  }

  /**
   * 6. replace: Issues a replacement invoice (POST /invoice with ReferenceType = 1)
   * Enforces server-side SignType and per-series FIFO serialization queue.
   */
  async replace({ originalInvoice, replacementData, idempotencyKey } = {}) {
    if (!this.hasCredentials()) {
      throw normalizeMisaError({
        code: 'MISSING_MISA_CREDENTIALS',
        message: 'Chưa cấu hình thông tin xác thực MISA meInvoice (MISA_APP_ID, MISA_TAX_CODE, MISA_USERNAME, MISA_PASSWORD) trong biến môi trường server.'
      }, 'replace');
    }

    this.validateSignType('replace');

    const misaInvoice = mapQBizSnapshotToMisaInvoice(replacementData, {
      templateCode: this.templateCode,
      series: this.series,
      operation: 'REPLACE',
      originalInvoice,
      replacementData,
      idempotencyKey
    });

    const seriesKey = misaInvoice.InvSeries || this.series;
    return await withSeriesLock(seriesKey, async () => {
      const res = await this._request('invoice', {
        method: 'POST',
        body: {
          SignType: this.signType,
          InvoiceData: misaInvoice,
          PublishInvoiceData: {
            InvTemplateNo: misaInvoice.InvTemplateNo,
            InvSeries: misaInvoice.InvSeries,
            InvDate: misaInvoice.InvDate
          }
        }
      });

      const invData = res?.data || res;
      return {
        success: true,
        provider_code: this.capabilities.provider_code,
        ref_id: misaInvoice.RefID,
        provider_invoice_id: invData.InvoiceID || invData.TransactionID || `MISA-REP-${misaInvoice.RefID}`,
        transaction_id: invData.TransactionID || invData.InvoiceID || null,
        invoice_number: invData.InvoiceNo || null,
        series: invData.InvoiceSeries || this.series,
        template_code: invData.InvoiceTemplate || this.templateCode,
        issued_at: new Date().toISOString(),
        original_invoice_id: originalInvoice.id || originalInvoice.provider_invoice_id,
        lineage_type: 'REPLACEMENT',
        status: 'ISSUED',
        idempotency_key: idempotencyKey
      };
    });
  }

  /**
   * 7. cancel: Cancels an invoice (Truthful: not exposed in public Open API documentation)
   */
  async cancel() {
    throw new MisaProviderError(
      ProviderErrorCode.CAPABILITY_NOT_AVAILABLE,
      'Chức năng hủy hóa đơn trực tiếp không được công bố trong tài liệu Open API công khai của MISA meInvoice (supports_cancel: false). Khi có sai sót, doanh nghiệp sử dụng luồng Điều chỉnh (ADJUST) hoặc Thay thế (REPLACE).',
      { httpStatus: 400, rawCode: 'CAPABILITY_NOT_AVAILABLE' }
    );
  }

  /**
   * 8. reconcile: Idempotent lookup by QBiz RefID via POST /invoice/status (inputType: 2)
   * Uses inputType: 2 with stable RefID in body array to prevent blind reissue after timeout.
   */
  async reconcile({ idempotencyKey, qbizInvoiceId, refId } = {}) {
    const lookupRef = refId || idempotencyKey || qbizInvoiceId;
    if (!lookupRef) {
      throw new Error('Reference is required for reconciliation');
    }

    try {
      const statusRes = await this.getStatus({ refId: lookupRef });
      if (statusRes && statusRes.success && statusRes.status) {
        return {
          exists: true,
          reconciled: true,
          ref_id: lookupRef,
          transaction_id: statusRes.transaction_id,
          provider_invoice_id: statusRes.transaction_id || `MISA-${lookupRef}`,
          invoice_number: statusRes.invoice_number,
          status: statusRes.status
        };
      }
      return { exists: false, reconciled: false };
    } catch (err) {
      if (err.errorCode === ProviderErrorCode.NOT_FOUND) {
        return { exists: false, reconciled: false };
      }
      throw err;
    }
  }
}

/**
 * Formats safe metadata table for discovered templates (no secrets, zero leakage).
 * Output schema: SERIES | TEMPLATE_NO | WITH_CODE | CALCULATING_MACHINE | ACTIVE | TEMPLATE_NAME
 */
export function formatSafeTemplateTable(templates) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return 'Không có mẫu hóa đơn nào được tìm thấy.';
  }
  const rows = [
    ['SERIES', 'TEMPLATE_NO', 'WITH_CODE', 'CALCULATING_MACHINE', 'ACTIVE', 'TEMPLATE_NAME'],
    ['------', '-----------', '---------', '-------------------', '------', '-------------']
  ];
  for (const t of templates) {
    rows.push([
      (t.InvSeries || '').padEnd(10),
      (t.InvTemplateNo || '').padEnd(11),
      (t.withCode ? 'CÓ (C)' : 'KHÔNG (K)').padEnd(10),
      (t.invoiceCalcu ? 'CÓ (M - MTT)' : 'KHÔNG (T - Thường)').padEnd(19),
      (t.Inactive ? 'NO (Ngừng)' : 'YES (Hoạt động)').padEnd(15),
      t.TemplateName || ''
    ]);
  }
  return rows.map(r => r.join(' | ')).join('\n');
}

