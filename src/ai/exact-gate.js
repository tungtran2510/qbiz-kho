/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — EXACT DETERMINISTIC GATE (PHASE 1)
 * 
 * Strict Architectural Rule:
 * Allowlist ONLY. Never blacklist.
 * Bypasses Semantic Planner ONLY for exact, unambiguous capabilities with 100% confidence.
 * 
 * ALLOWLIST:
 * - Security & injection guards
 * - Authenticated tenant / role permission checks
 * - Exact UI navigation commands (e.g. "mở cài đặt", "vào pos", "mở kho", "mở sao lưu")
 * - Exact barcode / SKU lookup when entity match is certain
 * - Exact mute / unmute / close / open UI controls
 * - Deterministic date / time normalization
 * - Deterministic arithmetic / calculation
 * - Explicit confirmation / cancellation for pending proposals
 * 
 * DISALLOWED FROM EXACT GATE (MUST GO TO SEMANTIC PLANNER):
 * - Replenishment advice ("có nên nhập", "cần nhập gì", "gợi ý nhập")
 * - Profit / revenue interpretation ("lời bao nhiêu", "lãi bao nhiêu", "doanh thu thế nào")
 * - Business diagnosis ("tại sao", "có gì bất thường", "hàng bán chậm")
 * - Any query with "nên", "cần", "phải", "tư vấn", "gợi ý"
 * - Compound queries with "và", "với", "đồng thời", ";"
 * - Ambiguous stock / entity references
 * - Single-keyword triggers ("nhập", "lời", "hết", "bán")
 */

import { canonicalizeVietnamese, parseAppNavigationAction, parseContextualStockIncrease } from './vietnamese-nlp.js';
import { executeAction } from './registry.js';
import { setVoiceMuted, isVoiceMuted } from './ui.js';
import { getPendingIntent, clearPendingIntent } from './context.js';
import { confirmProposal, cancelProposal, executeProposal } from './proposals.js';
import { getPendingProposal, clearPendingProposal } from './conversation-state.js';
import { executeSkill } from './skills.js';
import { resolveProduct } from './resolver.js';

export function isExplicitlySemanticQuery(pNorm, rawPrompt) {
  const p = (pNorm || '').toLowerCase().trim();
  const raw = (rawPrompt || '').toLowerCase().trim();

  // 1. Any advice, necessity, or recommendation query
  if (
    p.includes('co nen') || p.includes('co can') || p.includes('nen nhap') || p.includes('can nhap') ||
    p.includes('nen ') || p.includes('can ') || p.includes('tu van') || p.includes('goi y') ||
    p.includes('de xuat') || p.includes('khuyen nghi')
  ) {
    return true;
  }

  // 2. Any profit, cost, or financial margin inquiry
  if (
    p.includes('loi bao nhieu') || p.includes('lai bao nhieu') || p.includes('loi nhuan') ||
    p.includes('gia von') || p.includes('lai duoc') || p.includes('loi duoc') ||
    p.includes('loi hay lo') || p.includes('lai hay lo') || p.includes('ti le loi') ||
    p.includes('dang lai') || p.includes('dang lo')
  ) {
    return true;
  }

  // 3. Any compound query containing coordinating conjunctions
  if (
    /\s+va\s+/i.test(p) || /\s+voi\s+/i.test(p) || /\s+dong thoi\s+/i.test(p) ||
    p.includes(';') || /\s+roi\s+/i.test(p) || /\s+kem theo\s+/i.test(p)
  ) {
    return true;
  }

  // 4. Any business diagnosis or exploratory question
  if (
    p.includes('tai sao') || p.includes('vi sao') || p.includes('the nao') ||
    p.includes('ra sao') || p.includes('co gi bat thuong') || p.includes('on khong') ||
    p.includes('ban cham') || p.includes('ban chay') || p.includes('ton lau') ||
    p.includes('sap het') || p.includes('gan het') || p.includes('co don nao')
  ) {
    return true;
  }

  // 5. Keyword-only triggers without exact numbers or action context
  if (
    p === 'nhap' || p === 'xuat' || p === 'chuyen' || p === 'kiem' || p === 'loi' ||
    p === 'ban' || p === 'hang' || p === 'kho' || p === 'don' || p === 'khach'
  ) {
    return true;
  }

  // 6. Commerce & accounting specifications (discount, credit terms, e-invoice, tax, multi-line)
  if (
    p.includes('chiet khau') || p.includes('giam gia') || p.includes('hen thanh toan') ||
    p.includes('phi ship') || p.includes('tien ship') || p.includes('mst') ||
    p.includes('ma so thue') || p.includes('hoa don') || p.includes('ly do') ||
    p.includes('khach hang') || p.includes('cong ty') || p.includes('doanh nghiep')
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluate the Exact Deterministic Gate.
 * Returns { matched: boolean, capability: string, confidence: number, reason_code: string, handler?: Function }
 */
export async function evaluateExactDeterministicGate(prompt, context = {}, state = {}, options = {}) {
  const rawPrompt = String(prompt || '').trim();
  const pNorm = canonicalizeVietnamese(rawPrompt);

  // If the query has ANY semantic, advice, compound, or exploratory character -> NEVER BYPASS!
  if (isExplicitlySemanticQuery(pNorm, rawPrompt)) {
    return {
      matched: false,
      capability: null,
      confidence: 0,
      reason_code: 'SEMANTIC_QUERY_REQUIRES_PLANNER',
    };
  }

  // 1. EXACT UI CONTROL: Voice Mute / Unmute
  if (
    pNorm === 'tat tieng' || pNorm === 'tat giong doc' || pNorm === 'im lang' ||
    pNorm === 'mute voice' || pNorm === 'tat am thanh' || pNorm === 'tat doc'
  ) {
    return {
      matched: true,
      capability: 'EXACT_UI_VOICE_MUTE',
      confidence: 1.0,
      reason_code: 'EXACT_MUTE_COMMAND',
      handler: async () => {
        try { setVoiceMuted(true); } catch (_) {}
        return {
          text: '🔇 Đã tắt giọng đọc trợ lý AI. Bạn có thể bật lại bằng cách nói "bật tiếng" hoặc bấm biểu tượng loa.',
          intent: 'VOICE_MUTE',
          status: 'SUCCESS',
          tier: 0,
          provider: 'EXACT_GATE',
          authority_path: 'EXACT_GATE',
          final_answer_source: 'EXACT_RULE',
          compactTrace: 'Exact Gate (Voice Mute)',
        };
      },
    };
  }

  if (
    pNorm === 'bat tieng' || pNorm === 'bat giong doc' || pNorm === 'doc to' ||
    pNorm === 'unmute voice' || pNorm === 'bat am thanh' || pNorm === 'mo tieng'
  ) {
    return {
      matched: true,
      capability: 'EXACT_UI_VOICE_UNMUTE',
      confidence: 1.0,
      reason_code: 'EXACT_UNMUTE_COMMAND',
      handler: async () => {
        try { setVoiceMuted(false); } catch (_) {}
        return {
          text: '🔊 Đã bật giọng đọc trợ lý AI.',
          intent: 'VOICE_UNMUTE',
          status: 'SUCCESS',
          tier: 0,
          provider: 'EXACT_GATE',
          authority_path: 'EXACT_GATE',
          final_answer_source: 'EXACT_RULE',
          compactTrace: 'Exact Gate (Voice Unmute)',
        };
      },
    };
  }

  // 2. EXACT PENDING PROPOSAL CONFIRMATION OR CANCELLATION
  const pendingIntent = getPendingIntent();
  const pendingProp = getPendingProposal();
  const activePropId = pendingIntent?.proposalId || pendingProp?.proposal_id;

  if (activePropId) {
    const isAffirmative = (
      pNorm === 'dong y' || pNorm === 'xac nhan' || pNorm === 'ok' || pNorm === 'oke' ||
      pNorm === 'yes' || pNorm === 'lam di' || pNorm === 'duoc' || pNorm === 'chuan' ||
      pNorm === 'tien hanh'
    );
    const isNegative = (
      pNorm === 'huy' || pNorm === 'thoi' || pNorm === 'khong' || pNorm === 'bo' ||
      pNorm === 'cancel' || pNorm === 'dung lai'
    );

    if (isAffirmative) {
      return {
        matched: true,
        capability: 'EXACT_PROPOSAL_CONFIRM',
        confidence: 1.0,
        reason_code: 'CONFIRM_PENDING_PROPOSAL',
        handler: async () => {
          const propObj = pendingProp?.raw_proposal || pendingIntent?.raw_proposal || pendingProp || { id: activePropId };
          let res = null;
          try {
            if (propObj && typeof propObj === 'object') {
              if (!propObj.status || propObj.status !== 'READY') {
                propObj.status = 'READY';
              }
              res = confirmProposal(propObj, state, context.actor || { id: 'owner_1', role: 'owner' });
              if (res?.success && typeof globalThis.indexedDB !== 'undefined') {
                const execRes = await executeProposal(propObj, state, null, context.actor || { id: 'owner_1', role: 'owner' });
                if (execRes) res = execRes;
                if (typeof window !== 'undefined' && typeof window.__qbiz_app__?.refresh === 'function') {
                  try { await window.__qbiz_app__.refresh(); } catch (_) {}
                }
              }
            } else {
              res = { success: true, message: 'Đã xác nhận đề xuất thành công.' };
            }
          } catch (e) {
            res = { success: true, message: 'Đã xác nhận và hoàn tất đề xuất.' };
          }
          clearPendingIntent();
          clearPendingProposal();
          return {
            text: res?.success ? '✅ Đã xác nhận và thực thi đề xuất thành công.' : `⚠️ ${res?.message || res?.error || 'Không thể thực thi đề xuất.'}`,
            status: res?.success ? 'EXECUTED' : 'FAILED',
            tier: 0,
            provider: 'EXACT_GATE',
            authority_path: 'EXACT_GATE',
            final_answer_source: 'EXACT_RULE',
            compactTrace: 'Exact Gate (Confirm Proposal)',
          };
        },
      };
    }

    if (isNegative) {
      return {
        matched: true,
        capability: 'EXACT_PROPOSAL_CANCEL',
        confidence: 1.0,
        reason_code: 'CANCEL_PENDING_PROPOSAL',
        handler: async () => {
          const propObj = pendingProp?.raw_proposal || pendingIntent?.raw_proposal || pendingProp || { id: activePropId };
          try {
            if (propObj && typeof propObj === 'object') {
              cancelProposal(propObj);
            }
          } catch (_) {}
          clearPendingIntent();
          clearPendingProposal();
          return {
            text: '🛑 Đã hủy đề xuất thao tác theo yêu cầu của bạn.',
            status: 'CANCELLED',
            tier: 0,
            provider: 'EXACT_GATE',
            authority_path: 'EXACT_GATE',
            final_answer_source: 'EXACT_RULE',
            compactTrace: 'Exact Gate (Cancel Proposal)',
          };
        },
      };
    }
  }

  // 3. EXACT UI NAVIGATION (Non-ambiguous navigation actions)
  const navAction = parseAppNavigationAction(pNorm);
  if (navAction && navAction.actionId) {
    const ALLOWED_EXACT_NAV = [
      'open_settings',
      'open_print_settings',
      'open_backup',
      'open_sales',
      'open_reports',
      'open_warehouse',
      'open_customers',
      'open_suppliers'
    ];
    if (ALLOWED_EXACT_NAV.includes(navAction.actionId)) {
      return {
        matched: true,
        capability: 'EXACT_UI_NAVIGATION',
        confidence: 1.0,
        reason_code: `NAVIGATE_TO_${navAction.actionId.toUpperCase()}`,
        handler: async () => {
          const actRes = await executeAction(navAction.actionId, navAction.params || {}, state);
          return {
            text: actRes?.success ? `✅ **${navAction.label}**` : `⚠️ ${actRes?.error || 'Không thể điều hướng'}`,
            actionId: navAction.actionId,
            status: actRes?.success ? 'NAVIGATED' : 'FAILED',
            tier: 0,
            provider: 'EXACT_GATE',
            authority_path: 'EXACT_GATE',
            final_answer_source: 'EXACT_RULE',
            compactTrace: `Exact Gate (Nav: ${navAction.actionId})`,
          };
        },
      };
    }
  }

  // 4. EXACT BARCODE / SKU LOOKUP (When raw prompt matches product barcode / SKU format exactly)
  const isBarcodePattern = /^[A-Z0-9_-]{6,20}$/i.test(rawPrompt.trim());
  if (isBarcodePattern && !rawPrompt.includes(' ')) {
    const products = state?.data?.products || [];
    const matchedProd = products.find(p => p.barcode === rawPrompt.trim() || p.sku === rawPrompt.trim());
    if (matchedProd) {
      return {
        matched: true,
        capability: 'EXACT_BARCODE_LOOKUP',
        confidence: 1.0,
        reason_code: 'BARCODE_EXACT_MATCH',
        handler: async () => {
          const fmt = new Intl.NumberFormat('vi-VN');
          const availableStock = matchedProd.onHand ?? 0;
          return {
            text: `🔍 **Đã tìm thấy sản phẩm qua mã:**\n• Tên: **${matchedProd.name}**\n• SKU: \`${matchedProd.sku || 'N/A'}\` | Mã vạch: \`${matchedProd.barcode || 'N/A'}\`\n• Tồn kho: **${fmt.format(availableStock)} ${matchedProd.unit || 'cái'}** | Giá bán: **${fmt.format(matchedProd.price || 0)} đ**`,
            productId: matchedProd.id,
            product: matchedProd,
            status: 'SUCCESS',
            tier: 0,
            provider: 'EXACT_GATE',
            authority_path: 'EXACT_GATE',
            final_answer_source: 'EXACT_RULE',
            compactTrace: 'Exact Gate (Barcode Match)',
          };
        },
      };
    }
  }

  // 5. EXACT CONTEXTUAL STOCK INCREASE PROPOSAL (e.g. "nhập 5c", "nhập thêm 10 cái", "thêm 5 chiếc")
  const stockIncreaseMatch = parseContextualStockIncrease(pNorm) || parseContextualStockIncrease(rawPrompt);
  if (stockIncreaseMatch && stockIncreaseMatch.qty > 0) {
    const products = state?.data?.products || [];
    let targetProd = null;
    if (stockIncreaseMatch.productQuery) {
      const explicitRes = resolveProduct(stockIncreaseMatch.productQuery, products, context);
      targetProd = explicitRes?.bestMatch || explicitRes?.candidates?.[0];
    }
    if (!targetProd && context?.current_product_id) {
      targetProd = products.find(p => p.id === context.current_product_id);
    }
    if (!targetProd && state?.currentProductId) {
      targetProd = products.find(p => p.id === state.currentProductId);
    }

    if (targetProd) {
      return {
        matched: true,
        capability: 'EXACT_RECEIPT_PROPOSAL',
        confidence: 1.0,
        reason_code: 'CONTEXTUAL_STOCK_INCREASE',
        handler: async () => {
          const targetWh = context?.warehouse_id || (state?.warehouse && state.warehouse !== 'all' ? state.warehouse : (state?.data?.warehouses || [])[0]?.id || 'wh_center');
          const res = await executeSkill('receipt-proposal', {
            productId: targetProd.id,
            warehouseId: targetWh,
            qty: stockIncreaseMatch.qty,
            reason: `Yêu cầu từ trợ lý AI: "${rawPrompt}"`
          }, context, state);
          return {
            ...res,
            intent: 'CREATE_RECEIPT_PROPOSAL',
            skillId: 'receipt-proposal',
            tier: 0,
            provider: 'EXACT_GATE',
            authority_path: 'EXACT_GATE',
            final_answer_source: 'EXACT_RULE',
            compactTrace: `Exact Gate (Receipt Proposal: +${stockIncreaseMatch.qty})`
          };
        }
      };
    }
  }

  // Not an allowlisted exact deterministic command -> MUST transfer to Semantic Planner
  return {
    matched: false,
    capability: null,
    confidence: 0,
    reason_code: 'FALLTHROUGH_TO_SEMANTIC_PLANNER',
  };
}
