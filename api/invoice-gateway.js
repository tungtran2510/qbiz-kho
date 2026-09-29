/**
 * QBiz Kho — Server-Side Electronic Invoice Gateway
 * Deployed to Vercel Serverless Function & Netlify Functions (/api/invoice-gateway)
 * 
 * Architecture:
 * Web / POS Client -> /api/invoice-gateway -> Provider Adapter (MOCK / Sandbox / Real)
 * 
 * Strict Security & Design Invariants:
 * 1. APP_SCOPE === 'qbiz-kho' strictly required.
 * 2. Provider secrets / API keys NEVER sent to or stored on client (NON-NEGOTIABLE #5).
 * 3. Enforces idempotency via idempotencyKey.
 * 4. Transparently dispatches to Provider Adapter.
 */

import crypto from 'node:crypto';
import { mockInvoiceProvider, MOCK_PROVIDER_CAPABILITIES } from '../src/invoice/mock_provider.js';
import { MisaInvoiceProvider, MISA_PROVIDER_CAPABILITIES } from '../src/invoice/providers/misa_provider.js';

let _misaProviderInstance = null;
export function getActiveInvoiceProvider(req = null) {
  // STRICT SECURITY INVARIANT (BATCH 4B-R2):
  // 1. Provider authority is resolved SOLELY from trusted server-side configuration.
  // 2. Client headers (e.g. X-Invoice-Provider) and body fields are NEVER trusted and MUST NOT override active provider.
  // 3. PRODUCTION FAIL-CLOSED:
  //    - If QBIZ_INVOICE_PROVIDER is missing: FAIL CLOSED (INVOICE_PROVIDER_NOT_CONFIGURED).
  //    - If QBIZ_INVOICE_PROVIDER === 'MOCK_QBIZ_EINVOICE': FAIL CLOSED (MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION).
  // 4. In non-production: default to 'MOCK_QBIZ_EINVOICE' if not set.
  // 5. Test override is ONLY permitted if server environment explicitly sets QBIZ_ALLOW_TEST_OVERRIDE === '1' AND is NOT production.
  const isProd = isProductionMode(req);
  let providerCode = process.env.QBIZ_INVOICE_PROVIDER;

  if (isProd) {
    if (!providerCode) {
      const err = new Error('Hệ thống hóa đơn điện tử chưa được cấu hình nhà cung cấp (QBIZ_INVOICE_PROVIDER) trong môi trường production.');
      err.code = 'INVOICE_PROVIDER_NOT_CONFIGURED';
      err.error = 'INVOICE_PROVIDER_NOT_CONFIGURED';
      err.httpStatus = 500;
      throw err;
    }
    if (providerCode === 'MOCK_QBIZ_EINVOICE') {
      const err = new Error('Nhà cung cấp MOCK_QBIZ_EINVOICE bị nghiêm cấm trong môi trường production.');
      err.code = 'MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION';
      err.error = 'MOCK_PROVIDER_FORBIDDEN_IN_PRODUCTION';
      err.httpStatus = 500;
      throw err;
    }
  } else {
    const allowTestOverride = process.env.QBIZ_ALLOW_TEST_OVERRIDE === '1';
    if (allowTestOverride && req?.headers) {
      const testHeader = req.headers['x-test-invoice-provider'] || req.headers['X-Test-Invoice-Provider'];
      if (testHeader) {
        providerCode = testHeader;
      }
    }
    if (!providerCode) {
      providerCode = 'MOCK_QBIZ_EINVOICE';
    }
  }

  if (providerCode === 'MISA_MEINVOICE') {
    if (!_misaProviderInstance) {
      _misaProviderInstance = new MisaInvoiceProvider();
    }
    return _misaProviderInstance;
  }
  return mockInvoiceProvider;
}

let _ephemeralJwtSecret = null;
let _hasWarnedMissingSecret = false;
export function resetSecretWarningState() {
  _hasWarnedMissingSecret = false;
  _ephemeralJwtSecret = null;
}
export function getGatewayJwtSecret() {
  const secret = process.env.QBIZ_JWT_SECRET || process.env.QBIZ_INVOICE_JWT_SECRET;
  if (secret) return secret;
  if (isProductionMode()) {
    if (!_hasWarnedMissingSecret) {
      console.error('[CRITICAL_SECURITY_CONFIG] QBIZ_JWT_SECRET is NOT configured in production environment! Using ephemeral in-memory fallback will cause auth failures on serverless cold starts. Set QBIZ_JWT_SECRET in Vercel/environment immediately.');
      _hasWarnedMissingSecret = true;
    }
  } else if (!_hasWarnedMissingSecret) {
    console.warn('[DEV_SECURITY_NOTICE] QBIZ_JWT_SECRET is not set; using ephemeral random in-memory secret for local dev session.');
    _hasWarnedMissingSecret = true;
  }
  if (!_ephemeralJwtSecret) {
    _ephemeralJwtSecret = crypto.randomBytes(32).toString('hex');
  }
  return _ephemeralJwtSecret;
}

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

export function logGatewayError(context, err) {
  const errObj = (err instanceof Error)
    ? { message: err.message, stack: err.stack, ...(err.details ? { details: err.details } : {}) }
    : err;
  const safeErr = maskSensitiveData(errObj);
  console.error(`[Invoice Gateway Error] ${context}:`, safeErr);
  return safeErr;
}

// Server-side Session Store: mapping opaque server-issued token -> session data
const SERVER_SESSION_STORE = new Map([
  ['mock_token_owner', { role: 'OWNER', sub: 'system_owner', shop_id: 'shop_a' }],
  ['mock_token_cashier', { role: 'CASHIER', sub: 'system_cashier', shop_id: 'shop_a' }],
  ['mock_token_manager', { role: 'MANAGER', sub: 'system_manager', shop_id: 'shop_a' }],
  ['mock_token_warehouse', { role: 'WAREHOUSE', sub: 'system_warehouse', shop_id: 'shop_a' }]
]);

export function createServerSignedJwt(role, userId = 'local_user', email = 'owner@qbiz.vn', expSeconds = 86400, shopId = 'shop_a') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    email,
    role,
    shop_role: role,
    shop_id: shopId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expSeconds
  };
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const msg = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.createHmac('sha256', getGatewayJwtSecret()).update(msg).digest('base64url');
  return `${msg}.${sig}`;
}

export function isProductionMode(req = null) {
  // Strictly determined by server-side environment variables ONLY.
  // Client headers (like x-qbiz-env) are NEVER trusted or checked!
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.QBIZ_ENV === 'production'
  );
}

// In-memory rate limiting map for critical invoice mutation actions (issue, adjust, replace): key -> [timestamps]
const mutationRateLimits = new Map();
const MUTATION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MUTATION_RATE_LIMIT_MAX = parseInt(process.env.QBIZ_RATE_LIMIT_MUTATION_MAX || '30', 10);

export function isMutationRateLimited(rateKey, maxRequests = MUTATION_RATE_LIMIT_MAX, windowMs = MUTATION_RATE_LIMIT_WINDOW_MS) {
  const now = Date.now();
  const timestamps = mutationRateLimits.get(rateKey) || [];
  const validTimestamps = timestamps.filter(t => now - t < windowMs);
  if (validTimestamps.length >= maxRequests) {
    mutationRateLimits.set(rateKey, validTimestamps);
    return true;
  }
  validTimestamps.push(now);
  mutationRateLimits.set(rateKey, validTimestamps);
  return false;
}

// In-memory rate limiting map: ip -> [timestamps]
const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

// Action capability mapping
const ACTION_PERMISSIONS = {
  getCapabilities: null, // Public
  getStatus: null,       // Read-only status check
  getDocument: null,     // Read-only document preview
  createDraft: 'INVOICE_ISSUE',
  issue: 'INVOICE_ISSUE',
  adjust: 'INVOICE_ADJUST',
  replace: 'INVOICE_REPLACE',
  configureProvider: 'INVOICE_CONFIGURE'
};

const ROLE_PERMISSIONS = {
  OWNER: ['INVOICE_CONFIGURE', 'INVOICE_ISSUE', 'INVOICE_ADJUST', 'INVOICE_REPLACE'],
  MANAGER: ['INVOICE_CONFIGURE', 'INVOICE_ISSUE', 'INVOICE_ADJUST', 'INVOICE_REPLACE'],
  CASHIER: ['INVOICE_ISSUE'],
  WAREHOUSE: []
};

/**
 * Resolves user identity & role strictly from Authorization header.
 * CRITICAL INVARIANT: NEVER trusts or reads role from req.body!
 * Cryptographically verifies HMAC-SHA256 signature using GATEWAY_JWT_SECRET
 * or looks up opaque token in SERVER_SESSION_STORE.
 */
function resolveAuthFromHeader(authHeader, isProd = false) {
  if (!authHeader || typeof authHeader !== 'string') {
    return { authenticated: false, role: null, shop_id: null, error: 'MISSING_AUTHORIZATION_HEADER' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { authenticated: false, role: null, shop_id: null, error: 'EMPTY_TOKEN' };
  }

  // 1. Lookup in Server-Side Session Store
  if (SERVER_SESSION_STORE.has(token)) {
    if (isProd) {
      return { authenticated: false, role: null, shop_id: null, error: 'MOCK_SESSION_NOT_ALLOWED_IN_PRODUCTION' };
    }
    const sess = SERVER_SESSION_STORE.get(token);
    return {
      authenticated: true,
      role: sess.role || 'CASHIER',
      shop_id: sess.shop_id || 'shop_a',
      sub: sess.sub || null,
      source: 'SERVER_SESSION'
    };
  }

  // 2. Cryptographic JWT Verification with Server Secret
  const parts = token.split('.');
  if (parts.length === 3) {
    const [headerB64, payloadB64, signature] = parts;
    try {
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      if (header.alg !== 'HS256') {
        return { authenticated: false, role: null, shop_id: null, error: 'UNSUPPORTED_OR_FORBIDDEN_ALGORITHM' };
      }

      const msg = `${headerB64}.${payloadB64}`;
      const expectedSig = crypto
        .createHmac('sha256', getGatewayJwtSecret())
        .update(msg)
        .digest('base64url');

      if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return { authenticated: false, role: null, shop_id: null, error: 'INVALID_TOKEN_SIGNATURE' };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Date.now() / 1000) {
        return { authenticated: false, role: null, shop_id: null, error: 'TOKEN_EXPIRED' };
      }

      const rawRole = payload.role || payload.shop_role || payload.user_metadata?.role || payload.app_metadata?.role;
      if (!rawRole) {
        return { authenticated: false, role: null, shop_id: null, error: 'MISSING_ROLE_IN_PAYLOAD' };
      }

      const normRole = String(rawRole).toUpperCase();
      const shopId = payload.shop_id || payload.app_metadata?.shop_id || 'shop_a';
      return {
        authenticated: true,
        role: normRole === 'ADMIN' ? 'OWNER' : normRole,
        shop_id: shopId,
        sub: payload.sub || payload.id || null,
        email: payload.email || null,
        source: 'VERIFIED_JWT'
      };
    } catch (err) {
      return { authenticated: false, role: null, shop_id: null, error: `MALFORMED_JWT: ${err.message}` };
    }
  }

  // Reject any arbitrary unknown string
  return { authenticated: false, role: null, shop_id: null, error: 'UNAUTHORIZED_OR_UNKNOWN_SESSION' };
}

function isRateLimited(clientIp) {
  const now = Date.now();
  const timestamps = rateLimits.get(clientIp) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimits.set(clientIp, validTimestamps);
    return true;
  }
  validTimestamps.push(now);
  rateLimits.set(clientIp, validTimestamps);
  return false;
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Quá nhiều yêu cầu HĐĐT. Vui lòng thử lại sau giây lát.'
    });
  }

  // GET: Health & Capabilities
  if (req.method === 'GET') {
    let provider;
    try {
      provider = getActiveInvoiceProvider(req);
    } catch (err) {
      return res.status(err.httpStatus || 500).json({
        status: 'CONFIG_ERROR',
        error: err.code || err.error || 'INVOICE_PROVIDER_CONFIG_ERROR',
        message: err.message
      });
    }
    return res.status(200).json({
      status: 'ONLINE',
      gateway: 'QBiz Electronic Invoice Gateway v1',
      active_provider: provider.capabilities.provider_code,
      capabilities: provider.capabilities
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { appScope, action, idempotencyKey, payload } = body || {};

    // 1. Strict Scope Check
    if (appScope !== 'qbiz-kho') {
      return res.status(403).json({
        error: 'FORBIDDEN_SCOPE',
        message: "Yêu cầu phải có appScope 'qbiz-kho'."
      });
    }

    if (!action) {
      return res.status(400).json({
        error: 'MISSING_ACTION',
        message: 'Thiếu trường action (createDraft, issue, getStatus, getDocument, adjust, replace, getCapabilities).'
      });
    }

    // 2. Strict Server-Side Authentication & RBAC
    const isProd = isProductionMode(req);
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const userAuth = resolveAuthFromHeader(authHeader, isProd);
    const userRole = userAuth.role;
    const principalShop = userAuth.shop_id || 'shop_a';

    // All actions other than getCapabilities strictly require authenticated principal
    if (action !== 'getCapabilities') {
      if (!userAuth.authenticated) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: `Xác thực thất bại: ${userAuth.error || 'Token không hợp lệ hoặc chữ ký không khớp'}.`
        });
      }
    }

    const requiredCapability = ACTION_PERMISSIONS[action];
    if (requiredCapability) {
      const allowed = ROLE_PERMISSIONS[userRole] || [];
      if (!allowed.includes(requiredCapability)) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN_ACTION',
          message: `Vai trò '${userRole}' không có quyền thực hiện hành động '${action}' (yêu cầu quyền ${requiredCapability}).`,
          requiredCapability,
          userRole
        });
      }
    }

    // In-memory Rate Limiting for critical invoice mutation actions (issue, adjust, replace)
    if (['issue', 'adjust', 'replace'].includes(action)) {
      const tokenVal = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
      const rateKey = userAuth.sub || tokenVal || clientIp;
      if (isMutationRateLimited(rateKey)) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Quá số lần yêu cầu thao tác hóa đơn cho phép (vui lòng thử lại sau).'
        });
      }
    }

    // Tenant Isolation Guard: Caller cannot target a different shop
    const reqShop = payload?.shopId || payload?.shop_id || body?.shopId || body?.shop_id || payload?.invoiceData?.shop_id || payload?.invoiceData?.shopId;
    if (reqShop && reqShop !== principalShop) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_TENANT_ACCESS',
        message: 'Không có quyền thao tác trên cửa hàng khác.'
      });
    }

    // 3. Action Dispatcher
    const provider = getActiveInvoiceProvider(req);
    let result;
    switch (action) {
      case 'getCapabilities':
        result = { success: true, capabilities: provider.capabilities, active_provider: provider.capabilities.provider_code };
        break;

      case 'createDraft':
        result = await provider.createDraft({
          invoiceData: payload?.invoiceData,
          idempotencyKey,
          principalShop
        });
        break;

      case 'issue':
        if (!idempotencyKey) {
          return res.status(400).json({
            error: 'MISSING_IDEMPOTENCY_KEY',
            message: 'Phát hành HĐĐT bắt buộc phải có idempotencyKey.'
          });
        }
        result = await provider.issue({
          invoiceData: payload?.invoiceData,
          idempotencyKey,
          principalShop
        });
        break;

      case 'getStatus':
        result = await provider.getStatus({
          idempotencyKey,
          invoiceId: payload?.invoiceId,
          providerInvoiceId: payload?.providerInvoiceId,
          transactionId: payload?.transactionId,
          invoiceNumber: payload?.invoiceNumber,
          lookupCode: payload?.lookupCode,
          principalShop
        });
        break;

      case 'getDocument':
        result = await provider.getDocument({
          invoiceId: payload?.invoiceId,
          providerInvoiceId: payload?.providerInvoiceId,
          invoiceNumber: payload?.invoiceNumber,
          lookupCode: payload?.lookupCode,
          format: payload?.format || 'html',
          principalShop
        });
        break;

      case 'adjust':
        if (!idempotencyKey) {
          return res.status(400).json({
            error: 'MISSING_IDEMPOTENCY_KEY',
            message: 'Điều chỉnh HĐĐT bắt buộc phải có idempotencyKey.'
          });
        }
        result = await provider.adjust({
          originalInvoice: payload?.originalInvoice,
          originalInvoiceRef: payload?.originalInvoiceRef,
          adjustmentData: payload?.adjustmentData,
          idempotencyKey,
          principalShop
        });
        break;

      case 'replace':
        if (!idempotencyKey) {
          return res.status(400).json({
            error: 'MISSING_IDEMPOTENCY_KEY',
            message: 'Thay thế HĐĐT bắt buộc phải có idempotencyKey.'
          });
        }
        result = await provider.replace({
          originalInvoice: payload?.originalInvoice,
          originalInvoiceRef: payload?.originalInvoiceRef,
          replacementData: payload?.replacementData,
          idempotencyKey,
          principalShop
        });
        break;

      default:
        return res.status(400).json({
          error: 'UNKNOWN_ACTION',
          message: `Hành động ${action} không được hỗ trợ.`
        });
    }

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (err) {
    if (err.status === 403 || err.error === 'FORBIDDEN_TENANT_ACCESS') {
      return res.status(403).json({
        success: false,
        error: err.error || 'FORBIDDEN_TENANT_ACCESS',
        message: err.message
      });
    }
    if (err.status || err.httpStatus) {
      const statusCode = err.status || err.httpStatus;
      return res.status(statusCode).json({
        success: false,
        error: err.errorCode || err.error || err.code || 'GATEWAY_ERROR',
        rawCode: err.rawCode,
        message: err.message,
        details: err.details,
        isRetryable: Boolean(err.isRetryable)
      });
    }
    logGatewayError('Request processing failed', err);
    return res.status(500).json({
      error: 'GATEWAY_INTERNAL_ERROR',
      message: err.message || 'Lỗi xử lý nội bộ tại Invoice Gateway'
    });
  }
}
