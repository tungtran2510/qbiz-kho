/**
 * QBiz Kho — Electronic Invoice UI & Interaction Manager
 * Batch 2 Implementation — Conforms to CODEX_HANDOFF_HDDT_MODULE_20260929.md
 * 
 * Features:
 * 1. Modal displays invoice lifecycle: DRAFT, READY_TO_ISSUE, ISSUING, ISSUED, FAILED, ADJUSTMENT_REQUIRED.
 * 2. Instant Issue via Server-Side Gateway with Idempotency Key (ISSUE:sale_id:orig:v1).
 * 3. Immutable snapshot preview upon ISSUED status with verification link and serials.
 * 4. Return / Adjustment handling: proposal generation linked via ADJUST:sale_id:orig_inv:vN.
 * 5. Strict Invariant: DUPLICATE_ORIGINAL_INVOICE = 0.
 */

import {
  InvoiceStatus,
  InvoiceOperation,
  buildInvoiceIdempotencyKey,
  createInvoiceDraftFromSale,
  createInvoiceAuditLogEntry,
  createInvoiceBuyer
} from './domain.js';

import {
  getInvoiceBySaleId,
  createInvoiceDraftForSale,
  callInvoiceGateway
} from './service.js';

import { put, getAll } from '../db.js';
import { CONFIG } from '../config.js';

function esc(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

function fmt(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

function dt(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return String(iso);
  }
}

function notify(msg, type = 'ok') {
  if (typeof window !== 'undefined' && typeof window.toast === 'function') {
    window.toast(msg, type);
  } else if (typeof toast === 'function') {
    toast(msg, type);
  } else {
    try { alert(msg); } catch (_) {}
  }
}

/**
 * Creates an Adjustment Proposal when a Return is performed on an already ISSUED Sale.
 * Preserves DUPLICATE_ORIGINAL_INVOICE = 0.
 */
export async function createReturnAdjustmentProposal({ sale, returnReason = 'Khách trả hàng', returnAmount = 0, actor = 'Thu ngân' }) {
  if (!sale || !sale.id) return null;
  const originalInvoice = await getInvoiceBySaleId(sale.id);
  if (!originalInvoice || originalInvoice.status !== InvoiceStatus.ISSUED) {
    // If no original invoice or original was not issued, no adjustment needed
    return null;
  }

  const nextVersion = (Number(originalInvoice.version) || 1) + 1;
  const adjustmentId = `adj-${sale.id}-v${nextVersion}`;
  const idempotencyKey = buildInvoiceIdempotencyKey({
    operation: InvoiceOperation.ADJUST,
    saleId: sale.id,
    version: nextVersion
  });

  const now = new Date().toISOString();
  const proposal = {
    id: adjustmentId,
    sale_id: sale.id,
    sale_code: sale.code || sale.sale_uuid || sale.id,
    lineage_id: originalInvoice.id,
    version: nextVersion,
    operation: InvoiceOperation.ADJUST,
    idempotency_key: idempotencyKey,
    status: InvoiceStatus.ADJUSTMENT_REQUIRED,
    original_invoice_ref: originalInvoice.provider_ref,
    original_invoice_number: originalInvoice.provider_ref?.invoice_number || '',
    buyer: originalInvoice.buyer,
    adjustment_reason: returnReason,
    amounts: {
      original_total: originalInvoice.amounts?.grand_total || 0,
      reduction_amount: returnAmount,
      adjusted_total: Math.max(0, (originalInvoice.amounts?.grand_total || 0) - returnAmount)
    },
    audit_log: [
      {
        action: 'ADJUSTMENT_PROPOSED',
        actor,
        timestamp: now,
        details: `Đề xuất điều chỉnh giảm ${fmt(returnAmount)} ₫ do đổi/trả hàng. Key: ${idempotencyKey}`
      }
    ],
    created_at: now,
    updated_at: now
  };

  await put('electronic_invoices', proposal);
  try {
    const log = createInvoiceAuditLogEntry({
      invoiceId: adjustmentId,
      saleId: sale.id,
      action: 'ADJUSTMENT_PROPOSED',
      actor,
      details: `Tạo đề xuất hóa đơn điều chỉnh v${nextVersion} từ đơn đổi/trả`
    });
    await put('invoice_audit_logs', log);
  } catch (_) {}

  return proposal;
}

/**
 * Opens comprehensive Electronic Invoice modal for a completed Sale
 */
export async function openInvoiceModalForSale(sale, { onIssued = null } = {}) {
  if (!sale || !sale.id) {
    notify('Không tìm thấy thông tin phiếu bán.', 'error');
    return;
  }

  // Ensure modal root container exists
  let modalRoot = document.getElementById('modalRoot');
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'modalRoot';
    document.body.appendChild(modalRoot);
  }

  // Fetch existing invoice or create draft
  let invoice = await getInvoiceBySaleId(sale.id);
  if (!invoice) {
    invoice = await createInvoiceDraftForSale(sale);
  }

  // Check if there is an adjustment proposal
  const allInvoices = await getAll('electronic_invoices');
  const adjustment = allInvoices.find(inv => inv.sale_id === sale.id && inv.operation === InvoiceOperation.ADJUST && inv.status === InvoiceStatus.ADJUSTMENT_REQUIRED);

  function renderModal(inv, isIssuing = false) {
    const isIssued = inv.status === InvoiceStatus.ISSUED;
    const isDraft = inv.status === InvoiceStatus.DRAFT;
    const isAdjustment = inv.status === InvoiceStatus.ADJUSTMENT_REQUIRED;

    const lookupUrl = inv.provider_ref?.lookup_url || (inv.provider_ref?.lookup_code ? `https://hddt.qbiz.vn/tra-cuu?code=${inv.provider_ref.lookup_code}` : '');

    const statusBadge = isIssued
      ? `<span class="badge ok">✓ Đã phát hành (${esc(inv.provider_ref?.invoice_series)}-${esc(inv.provider_ref?.invoice_number)})</span>`
      : isAdjustment
      ? `<span class="badge info">⚠ Cần lập HĐ Điều chỉnh (v${inv.version})</span>`
      : `<span class="badge warn">Bản nháp (Chưa ký)</span>`;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="invModalBackdrop">
        <div class="modal card invoice-modal" style="max-width:680px;width:95%;margin:20px auto;max-height:90vh;overflow-y:auto">
          <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px">
            <div>
              <h2 style="margin:0;font-size:18px">Hóa đơn điện tử · ${esc(inv.sale_code)}</h2>
              <small style="color:#64748b">Lineage Key: <code>${esc(inv.idempotency_key)}</code></small>
            </div>
            <div>${statusBadge}</div>
          </div>

          <div class="invoice-modal-body" style="display:grid;gap:14px">
            <!-- Buyer Section -->
            <div class="card section-card" style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong style="font-size:13px;color:#0f172a">Thông tin người mua hàng</strong>
                ${isDraft ? `<button type="button" class="link-btn" id="btnEditBuyer">✏️ Sửa thông tin</button>` : ''}
              </div>
              <div id="buyerDisplay" style="font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <div><span>Người mua:</span> <b>${esc(inv.buyer?.name || 'Khách lẻ')}</b></div>
                <div><span>Mã số thuế:</span> <b>${esc(inv.buyer?.tax_code || 'Không có')}</b></div>
                <div><span>Đơn vị:</span> <b>${esc(inv.buyer?.company_name || '—')}</b></div>
                <div><span>Email nhận HĐ:</span> <b>${esc(inv.buyer?.email || '—')}</b></div>
                <div style="grid-column:span 2"><span>Địa chỉ:</span> <b>${esc(inv.buyer?.address || '—')}</b></div>
              </div>
              <div id="buyerEditForm" style="display:none;margin-top:10px;display:none;grid-gap:8px">
                <input id="editTaxCode" value="${esc(inv.buyer?.tax_code || '')}" placeholder="Mã số thuế doanh nghiệp / hộ KD"/>
                <input id="editCompanyName" value="${esc(inv.buyer?.company_name || '')}" placeholder="Tên công ty / tổ chức"/>
                <input id="editBuyerName" value="${esc(inv.buyer?.name || '')}" placeholder="Người đại diện / người mua"/>
                <input id="editBuyerEmail" value="${esc(inv.buyer?.email || '')}" placeholder="Email nhận hóa đơn"/>
                <input id="editBuyerAddress" value="${esc(inv.buyer?.address || '')}" placeholder="Địa chỉ cơ sở"/>
                <div style="display:flex;gap:8px;margin-top:4px">
                  <button type="button" class="primary-btn compact" id="btnSaveBuyer">Lưu thông tin</button>
                  <button type="button" class="ghost-btn compact" id="btnCancelBuyer">Hủy</button>
                </div>
              </div>
            </div>

            <!-- Items & Financial Summary -->
            <div class="card section-card" style="padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">
              <strong style="font-size:13px;color:#0f172a;display:block;margin-bottom:8px">Chi tiết hàng hóa & Thuế</strong>
              <div style="font-size:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;margin-bottom:8px">
                ${(inv.items || []).map(it => `
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span>${esc(it.name)} <small style="color:#64748b">(${fmt(it.quantity)} × ${fmt(it.unit_price)} ₫)</small></span>
                    <strong>${fmt(it.line_total)} ₫</strong>
                  </div>
                `).join('')}
              </div>
              <div style="font-size:12px;display:grid;gap:4px">
                <div style="display:flex;justify-content:space-between"><span>Tạm tính:</span><b>${fmt(inv.amounts?.subtotal)} ₫</b></div>
                <div style="display:flex;justify-content:space-between"><span>Giảm giá:</span><b>− ${fmt(inv.amounts?.discount)} ₫</b></div>
                <div style="display:flex;justify-content:space-between"><span>Tiền thuế VAT:</span><b>${fmt(inv.amounts?.vat)} ₫</b></div>
                <div style="display:flex;justify-content:space-between;font-size:14px;color:#0284c7;border-top:1px dashed #cbd5e1;padding-top:6px;margin-top:2px">
                  <span>Tổng tiền thanh toán:</span><strong>${fmt(inv.amounts?.grand_total)} ₫</strong>
                </div>
              </div>
            </div>

            <!-- Issued Details (If ISSUED) -->
            ${isIssued ? `
              <div class="card section-card" style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
                <strong style="font-size:13px;color:#166534;display:block;margin-bottom:6px">Chứng thư & Thông tin phát hành hợp lệ</strong>
                <div style="font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
                  <div><span>Ký hiệu:</span> <b>${esc(inv.provider_ref?.invoice_series)}</b></div>
                  <div><span>Số hóa đơn:</span> <b>${esc(inv.provider_ref?.invoice_number)}</b></div>
                  <div><span>Mã tra cứu:</span> <b>${esc(inv.provider_ref?.lookup_code)}</b></div>
                  <div><span>Ngày ký:</span> <b>${dt(inv.provider_ref?.issue_date)}</b></div>
                  <div style="grid-column:span 2"><span>Tra cứu trực tuyến:</span> <a id="invLookupLink" href="${esc(lookupUrl)}" target="_blank" style="color:#0284c7;word-break:break-all">${esc(lookupUrl)}</a></div>
                </div>
              </div>
            ` : ''}

            <!-- Adjustment Notice (If return proposal exists) -->
            ${adjustment ? `
              <div class="card section-card" style="padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div>
                    <strong style="font-size:13px;color:#991b1b">Đề xuất hóa đơn điều chỉnh (v${adjustment.version})</strong>
                    <div style="font-size:12px;color:#7f1d1d;margin-top:2px">${esc(adjustment.adjustment_reason)} · Giảm trừ ${fmt(adjustment.amounts?.reduction_amount)} ₫</div>
                  </div>
                  <button type="button" class="primary-btn compact danger" id="btnIssueAdjustment">Ký & Phát hành HĐ điều chỉnh</button>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Footer Actions -->
          <div class="modal-foot" style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px">
            <button type="button" class="ghost-btn" id="btnCloseInvModal">Đóng</button>
            ${isDraft ? `
              <button type="button" class="primary-btn" id="btnIssueInvoice" ${isIssuing ? 'disabled' : ''}>
                ${isIssuing ? 'Đang gửi Invoice Gateway…' : 'Phát hành HĐĐT'}
              </button>
            ` : isIssued ? `
              <button type="button" class="secondary-btn" id="btnPrintInvDoc">Xem thể hiện HĐ</button>
              <a id="btnLookupOrigin" href="${esc(lookupUrl)}" target="_blank" class="primary-btn" style="text-decoration:none;display:inline-flex;align-items:center">Tra cứu gốc</a>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Event handlers inside modal
    document.getElementById('btnCloseInvModal')?.addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });

    document.getElementById('invModalBackdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'invModalBackdrop') modalRoot.innerHTML = '';
    });

    // Buyer edit handlers
    document.getElementById('btnEditBuyer')?.addEventListener('click', () => {
      const form = document.getElementById('buyerEditForm');
      const disp = document.getElementById('buyerDisplay');
      if (form && disp) { form.style.display = 'grid'; disp.style.display = 'none'; }
    });

    document.getElementById('btnCancelBuyer')?.addEventListener('click', () => {
      const form = document.getElementById('buyerEditForm');
      const disp = document.getElementById('buyerDisplay');
      if (form && disp) { form.style.display = 'none'; disp.style.display = 'grid'; }
    });

    document.getElementById('btnSaveBuyer')?.addEventListener('click', async () => {
      const updatedBuyer = createInvoiceBuyer({
        taxCode: document.getElementById('editTaxCode')?.value,
        companyName: document.getElementById('editCompanyName')?.value,
        name: document.getElementById('editBuyerName')?.value,
        email: document.getElementById('editBuyerEmail')?.value,
        address: document.getElementById('editBuyerAddress')?.value
      });
      inv.buyer = updatedBuyer;
      inv.updated_at = new Date().toISOString();
      await put('electronic_invoices', inv);
      renderModal(inv);
    });

    // Issue invoice handler
    document.getElementById('btnIssueInvoice')?.addEventListener('click', async () => {
      try {
        renderModal(inv, true);
        const idempotencyKey = buildInvoiceIdempotencyKey({
          operation: InvoiceOperation.ISSUE,
          saleId: inv.sale_id,
          lineageId: inv.lineage_id || 'orig',
          version: inv.version || 1
        });

        const res = await callInvoiceGateway({
          action: 'issue',
          idempotencyKey,
          payload: { invoiceData: inv }
        });

        inv.status = InvoiceStatus.ISSUED;
        inv.provider_ref = res;
        inv.snapshot = {
          buyer: inv.buyer,
          items: inv.items,
          amounts: inv.amounts,
          provider_ref: res,
          issued_at: res.issue_date
        };
        inv.audit_log.push({
          action: 'ISSUED',
          actor: 'Thu ngân',
          timestamp: new Date().toISOString(),
          details: `Phát hành thành công số ${res.invoice_number}`
        });

        await put('electronic_invoices', inv);
        try {
          const log = createInvoiceAuditLogEntry({
            invoiceId: inv.id,
            saleId: inv.sale_id,
            action: 'INVOICE_ISSUED',
            actor: 'Thu ngân',
            details: `Phát hành hóa đơn ${res.invoice_series}-${res.invoice_number}`
          });
          await put('invoice_audit_logs', log);
        } catch (_) {}

        if (typeof onIssued === 'function') onIssued(inv);
        renderModal(inv);
      } catch (err) {
        notify('Lỗi phát hành HĐĐT: ' + err.message, 'error');
        renderModal(inv);
      }
    });

    // Issue adjustment handler
    document.getElementById('btnIssueAdjustment')?.addEventListener('click', async () => {
      if (!adjustment) return;
      try {
        const res = await callInvoiceGateway({
          action: 'adjust',
          idempotencyKey: adjustment.idempotency_key,
          payload: {
            originalInvoiceRef: adjustment.original_invoice_ref,
            adjustmentData: adjustment
          }
        });

        adjustment.status = InvoiceStatus.ISSUED;
        adjustment.provider_ref = res;
        adjustment.snapshot = {
          amounts: adjustment.amounts,
          provider_ref: res,
          issued_at: res.issue_date
        };
        await put('electronic_invoices', adjustment);
        notify(`Đã phát hành hóa đơn điều chỉnh số ${res.invoice_number}!`, 'ok');
        renderModal(inv);
      } catch (err) {
        notify('Lỗi điều chỉnh: ' + err.message, 'error');
      }
    });

    // Preview invoice document
    document.getElementById('btnPrintInvDoc')?.addEventListener('click', async () => {
      try {
        const doc = await callInvoiceGateway({
          action: 'getDocument',
          idempotencyKey: inv.idempotency_key,
          payload: {
            invoiceNumber: inv.provider_ref?.invoice_number,
            lookupCode: inv.provider_ref?.lookup_code,
            format: 'html'
          }
        });
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(doc.html_preview || '<h2>Hóa đơn điện tử</h2>');
          w.document.close();
        }
      } catch (err) {
        notify('Không thể mở bản thể hiện: ' + err.message, 'error');
      }
    });
  }

  renderModal(invoice);
}
