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

import { mockInvoiceProvider, MOCK_PROVIDER_CAPABILITIES } from '../src/invoice/mock_provider.js';

// In-memory rate limiting map: ip -> [timestamps]
const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

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
    return res.status(200).json({
      status: 'ONLINE',
      gateway: 'QBiz Electronic Invoice Gateway v1',
      active_provider: MOCK_PROVIDER_CAPABILITIES.provider_code,
      capabilities: MOCK_PROVIDER_CAPABILITIES
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

    // 2. Action Dispatcher
    let result;
    switch (action) {
      case 'getCapabilities':
        result = { success: true, capabilities: MOCK_PROVIDER_CAPABILITIES };
        break;

      case 'createDraft':
        result = await mockInvoiceProvider.createDraft({
          invoiceData: payload?.invoiceData,
          idempotencyKey
        });
        break;

      case 'issue':
        if (!idempotencyKey) {
          return res.status(400).json({
            error: 'MISSING_IDEMPOTENCY_KEY',
            message: 'Phát hành HĐĐT bắt buộc phải có idempotencyKey.'
          });
        }
        result = await mockInvoiceProvider.issue({
          invoiceData: payload?.invoiceData,
          idempotencyKey
        });
        break;

      case 'getStatus':
        result = await mockInvoiceProvider.getStatus({
          idempotencyKey,
          transactionId: payload?.transactionId,
          invoiceNumber: payload?.invoiceNumber
        });
        break;

      case 'getDocument':
        result = await mockInvoiceProvider.getDocument({
          invoiceNumber: payload?.invoiceNumber,
          lookupCode: payload?.lookupCode,
          format: payload?.format || 'html'
        });
        break;

      case 'adjust':
        if (!idempotencyKey) {
          return res.status(400).json({
            error: 'MISSING_IDEMPOTENCY_KEY',
            message: 'Điều chỉnh HĐĐT bắt buộc phải có idempotencyKey.'
          });
        }
        result = await mockInvoiceProvider.adjust({
          originalInvoiceRef: payload?.originalInvoiceRef,
          adjustmentData: payload?.adjustmentData,
          idempotencyKey
        });
        break;

      case 'replace':
        if (!idempotencyKey) {
          return res.status(400).json({
            error: 'MISSING_IDEMPOTENCY_KEY',
            message: 'Thay thế HĐĐT bắt buộc phải có idempotencyKey.'
          });
        }
        result = await mockInvoiceProvider.replace({
          originalInvoiceRef: payload?.originalInvoiceRef,
          replacementData: payload?.replacementData,
          idempotencyKey
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
    console.error('[Invoice Gateway Error]', err);
    return res.status(500).json({
      error: 'GATEWAY_INTERNAL_ERROR',
      message: err.message || 'Lỗi xử lý nội bộ tại Invoice Gateway'
    });
  }
}
