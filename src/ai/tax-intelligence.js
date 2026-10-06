/**
 * QBiz Tax & Regulatory Intelligence Module
 * Master domain engine for Vietnamese retail tax regulations,
 * Circular 40/2021/TT-BTC, Decree 91/2022/ND-CP (e-commerce platform deductions),
 * Decree 123/2020/ND-CP & Circular 78/2021/TT-BTC (Electronic Invoices),
 * Circular 88/2021/TT-BTC, 100M annual exemption threshold, and live financial calculations.
 */

export const DEFAULT_TAX_SETTINGS = {
  business_type: 'hkd', // 'hkd' | 'company_direct' | 'company_deduct' | 'exempt'
  industry_type: 'retail', // 'retail' (1.5%) | 'service' (7%) | 'fnb' (4.5%) | 'custom'
  vat_rate: 1.0,
  pit_rate: 0.5,
  cit_rate: 20.0,
  ecommerce_auto_deduct: true,
  annual_exemption_threshold: 100000000,
  price_includes_tax: true,
  tax_code: '',
  business_reg_name: '',
  tax_authority: ''
};

/**
 * Extract active tax settings from application state
 */
export function getTaxSettingsFromState(state) {
  const row = (state?.data?.settings || []).find(s => s.id === 'tax_preferences');
  const val = row?.value || {};
  return { ...DEFAULT_TAX_SETTINGS, ...val };
}

/**
 * Format currency in VND with ₫ symbol
 */
function fmtVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0)) + ' ₫';
}

/**
 * Check if a sale belongs to an e-commerce platform (Shopee, TikTok, Lazada, Tiki)
 */
export function isEcommerceSale(s) {
  if (!s) return false;
  const ch = String(s.channel || s.source || s.channel_name || '').toLowerCase();
  return (
    ch === 'shopee' ||
    ch === 'tiktok' ||
    ch === 'tiktokshop' ||
    ch === 'tiktok_shop' ||
    ch === 'lazada' ||
    ch === 'tiki' ||
    ch.includes('shopee') ||
    ch.includes('tiktok') ||
    ch.includes('lazada') ||
    ch.includes('tiki')
  );
}

/**
 * Calculate live tax obligations and profit after tax for a specified time period
 */
export function calculateLiveTaxSummary(state, period = 'month') {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  let periodLabel = 'tháng này';

  if (period === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    periodLabel = 'hôm nay';
  } else if (period === 'yesterday') {
    const y = new Date(now.getTime() - 86400000);
    start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
    end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    periodLabel = 'hôm qua';
  } else if (period === 'this_week' || period === '7d') {
    start = new Date(now.getTime() - 7 * 86400000);
    end = now;
    periodLabel = '7 ngày qua';
  } else if (period === 'last_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    periodLabel = 'tháng trước';
  }

  const allRawSales = (state?.data?.sales || []).filter(s => {
    if (s.status === 'cancelled') return false;
    const dt = new Date(s.created_at || s.createdAt || s.date || 0);
    return ['COMPLETED', 'PAID'].includes(String(s.status || '').toUpperCase()) && dt >= start && dt <= end;
  });

  const saleCodes = new Set(allRawSales.flatMap(s => [s.code, s.id, s.sale_uuid, s.order_id, s.order_code, s.reference, s.reference_id].filter(Boolean)));
  const completedOrders = (state?.data?.orders || []).filter(o => {
    if (String(o.status || '').toUpperCase() !== 'COMPLETED') return false;
    const dt = new Date(o.created_at || o.createdAt || o.updated_at || 0);
    if (dt < start || dt > end) return false;
    if (saleCodes.has(o.code) || saleCodes.has(o.id) || saleCodes.has(o.order_uuid)) return false;
    if (o.sale_id && allRawSales.some(s => s.id === o.sale_id || s.sale_uuid === o.sale_id)) return false;
    return true;
  }).map(o => ({
    ...o,
    subtotal: Number(o.subtotal || 0),
    discount_total: Number(o.discount_total || 0),
    tax_total: Number(o.tax_total || 0),
    grand_total: Number(o.grand_total || 0),
    total: Number(o.grand_total || 0),
    is_order: true
  }));

  const allSales = [...allRawSales, ...completedOrders];
  const sum = key => allSales.reduce((n, s) => n + Number(s[key] || 0), 0);
  const gross = sum('subtotal');
  const discount = sum('discount_total');

  const products = state?.data?.products || [];
  const prodMap = new Map(products.map(p => [p.id, p]));
  let costTotal = 0;
  for (const s of allSales) {
    for (const item of (s.items || [])) {
      const pId = item.item_id || item.itemId || item.productId || item.product_id;
      const p = prodMap.get(pId);
      const itemCost = Number(item.cost_price ?? item.cost ?? p?.cost_price ?? p?.cost ?? p?.purchase_price ?? 0);
      const qty = Number(item.quantity || 1);
      costTotal += (Number(item.cost_total) > 0 ? Number(item.cost_total) : (itemCost * qty));
    }
  }

  const refundTotal = (state?.data?.refunds || []).filter(r => {
    const rDate = new Date(r.created_at || r.createdAt || 0);
    return rDate >= start && rDate <= end;
  }).reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const net = Math.max(0, gross - discount - refundTotal);
  const hasCost = costTotal > 0;
  const profit = hasCost ? Math.max(0, net - costTotal - refundTotal) : 0;

  const taxSettings = getTaxSettingsFromState(state);
  const ecomSales = allSales.filter(isEcommerceSale);
  const ecomGross = ecomSales.reduce((n, s) => n + Number(s.subtotal || s.total || 0), 0);
  const ecomDiscount = ecomSales.reduce((n, s) => n + Number(s.discount_total || 0), 0);
  const ecommerceNet = Math.max(0, ecomGross - ecomDiscount);
  const directNet = Math.max(0, net - ecommerceNet);

  const taxableRevenue = taxSettings.ecommerce_auto_deduct ? directNet : net;

  let estimatedVat = 0;
  let estimatedPit = 0;
  let estimatedTax = 0;
  let taxRateLabel = '0%';
  let taxModeLabel = 'Miễn thuế';

  if (taxSettings.business_type === 'exempt') {
    estimatedTax = 0;
    taxModeLabel = 'Miễn thuế / Nội bộ';
    taxRateLabel = '0%';
  } else if (taxSettings.business_type === 'company_deduct') {
    const citRate = Number(taxSettings.cit_rate || 20) / 100;
    estimatedTax = Math.round(Math.max(0, profit) * citRate);
    taxModeLabel = 'DN Khấu trừ';
    taxRateLabel = `TNDN ${taxSettings.cit_rate || 20}%`;
  } else {
    const vatRate = Number(taxSettings.vat_rate || 0) / 100;
    const pitRate = Number(taxSettings.pit_rate || 0) / 100;
    estimatedVat = Math.round(taxableRevenue * vatRate);
    estimatedPit = Math.round(taxableRevenue * pitRate);
    estimatedTax = estimatedVat + estimatedPit;
    taxModeLabel = taxSettings.business_type === 'hkd' ? 'Hộ KD (TT 40)' : 'DN trực tiếp';
    taxRateLabel = `${((vatRate + pitRate) * 100).toFixed(1)}% (${taxSettings.vat_rate}% GTGT + ${taxSettings.pit_rate}% ${taxSettings.business_type === 'hkd' ? 'TNCN' : 'TNDN'})`;
  }

  const netProfitAfterTax = Math.max(0, profit - estimatedTax);
  const profitAfterTaxMargin = net > 0 ? ((netProfitAfterTax / net) * 100).toFixed(1) : '0';

  return {
    period,
    periodLabel,
    salesCount: allSales.length,
    gross,
    discount,
    refundTotal,
    net,
    cost: costTotal,
    hasCost,
    profit,
    ecommerceNet,
    directNet,
    taxableRevenue,
    taxSettings,
    estimatedVat,
    estimatedPit,
    estimatedTax,
    taxRateLabel,
    taxModeLabel,
    netProfitAfterTax,
    profitAfterTaxMargin
  };
}

/**
 * Classify user prompt into specific tax intention
 */
export function classifyTaxIntent(pNorm, rawPrompt = '') {
  const p = pNorm.toLowerCase();

  // 1. Export Report File (bảng kê / tờ khai CSV TT88)
  // Strictly require an export/download verb and not conversational questions like "tại sao"
  const hasExportVerb = (
    p.includes('xuat ') || p.startsWith('xuat') || p.includes('ket xuat') ||
    p.includes('trich xuat') ||
    (/\btai\b/.test(p) && !p.includes('tai sao') && !p.includes('tai vi') && !p.includes('tai quay') && !p.includes('tai cua hang')) ||
    p.includes('download') || p.includes('in file') || p.includes('lay file') || p.includes('chuyen ra file')
  );
  const hasTaxFileKeywords = (
    p.includes('bang ke thue') || p.includes('to khai thue') || p.includes('thong tu 88') ||
    p.includes('tt88') || p.includes('s2b') || p.includes('bao cao thue') || p.includes('file thue')
  );
  if (hasExportVerb && hasTaxFileKeywords && !p.includes('xuat hoa don') && !p.includes('lap hoa don')) {
    return 'EXPORT_REPORT';
  }

  // 2. Electronic Invoice Issuance & Guide (Xuất hóa đơn điện tử / Hóa đơn VAT / Hóa đơn đỏ / Nghị định 123)
  const hasInvoiceAction = (
    p.includes('xuat hoa don') || p.includes('lap hoa don') || p.includes('phat hanh hoa don') ||
    p.includes('hoa don vat') || p.includes('hoa don do') || p.includes('hoa don dien tu') ||
    p.includes('xuat vat') || p.includes('hoa don cty') || p.includes('hoa don cong ty') ||
    (p.includes('hoa don') && (p.includes('dien tu') || p.includes('do') || p.includes('vat') || p.includes('mst') || p.includes('ma so thue')))
  );
  if (hasInvoiceAction && !p.includes('bang ke') && !p.includes('to khai') && !p.includes('tt88') && !p.includes('s2b')) {
    return 'INVOICE_GUIDE_AND_POLICY';
  }

  // 3. Tax vs Profit / Revenue vs COGS vs Tax Relationship & Reasoning (Tại sao thuế và lợi nhuận...)
  const hasWhyOrRelationship = (
    p.includes('tai sao') || p.includes('vi sao') || p.includes('sao ') || p.startsWith('sao') ||
    p.includes('giai thich') || p.includes('cong thuc') || p.includes('moi quan he') ||
    p.includes('lien quan') || p.includes('anh huong') || p.includes('khac gi') ||
    p.includes('thap hon') || p.includes('it hon') || p.includes('tru vao') || p.includes('tai sao lai')
  );
  const hasTaxAndProfitCooccurrence = (
    (p.includes('thue') || p.includes('nghia vu thue')) &&
    (p.includes('loi nhuan') || p.includes('lai gop') || p.includes('lai sau thue') || p.includes('lai thuc') || (p.includes('doanh thu') && p.includes('loi nhuan')))
  );
  if (hasWhyOrRelationship && hasTaxAndProfitCooccurrence) {
    return 'TAX_PROFIT_EXPLANATION';
  }
  if (p.includes('loi nhuan') && p.includes('doanh thu') && p.includes('thue') && (p.includes('va') || p.includes('nhu the nao') || p.includes('the nao') || p.includes('la gi'))) {
    return 'TAX_PROFIT_EXPLANATION';
  }

  // 4. Tax Settings & Configuration Guide
  // Checked early so "bật tự động miễn thuế đơn sàn shopee ở đâu" is recognized as guide
  const hasSettingsTerms = (
    p.includes('cai dat thue') || p.includes('cau hinh thue') || p.includes('thiet lap thue') ||
    p.includes('chinh thue') || p.includes('sua thue') || p.includes('doi thue') ||
    p.includes('chinh ty le thue') || p.includes('cai dat ho kinh doanh') ||
    p.includes('bat tru thue') || p.includes('bat mien thue') ||
    p.includes('nhap mst') || p.includes('nhap ma so thue') ||
    ((p.includes('o dau') || p.includes('cho nao') || p.includes('cai o dau') || p.includes('chinh o dau') || p.includes('lam sao de') || p.includes('bat o dau') || p.includes('bat tu dong')) && (p.includes('thue') || p.includes('mst')))
  );
  if (hasSettingsTerms) {
    return 'SETTINGS_GUIDE';
  }

  // 5. Ecommerce Platform Tax (Shopee, TikTok Shop, Lazada, Nghị định 91)
  const hasEcomPlatform = (
    p.includes('shopee') || p.includes('tiktok') || p.includes('lazada') || p.includes('tiki') ||
    p.includes('san tmdt') || p.includes('san thuong mai') || p.includes('ban tren san') || p.includes('don san') ||
    p.includes('online') || p.includes('ban online') || p.includes('ban hang online') ||
    p.includes('thue san') || p.includes('nghi dinh 91') || p.includes('nd 91') || p.includes('nd91')
  );
  const hasTaxTerms = (
    p.includes('thue') || p.includes('khau tru') || p.includes('trung thue') ||
    p.includes('nghi dinh 91') || p.includes('nd 91') || p.includes('nd91') ||
    p.includes('dong thue') || p.includes('nop thue') || p.includes('tru thue')
  );
  if (hasEcomPlatform && hasTaxTerms) {
    return 'ECOMMERCE_POLICY';
  }

  // 6. 100 Million Exemption Threshold (Điều 4 Thông tư 40/2021)
  const has100M = (
    p.includes('100 trieu') || p.includes('100 tr') || p.includes('100 cu') ||
    p.includes('duoi 100') || p.includes('chua den 100') || p.includes('chua toi 100') ||
    p.includes('nguong mien thue') || p.includes('duoi 100tr') || p.includes('chua toi 100tr')
  );
  const hasLowSalesOrStart = (
    (p.includes('ban e') || p.includes('moi mo') || p.includes('chua co lai') || p.includes('khi nao phai') || p.includes('bao nhieu thi') || p.includes('bao nhieu mot nam')) &&
    (p.includes('nop thue') || p.includes('dong thue') || p.includes('tinh thue'))
  );
  if ((has100M || hasLowSalesOrStart) && (hasTaxTerms || p.includes('mien thue'))) {
    return 'EXEMPTION_THRESHOLD';
  }

  // 7. Corporate / Company Deduction & CIT (TNDN)
  const hasCompanyTerms = (
    p.includes('tndn') || p.includes('thue thu nhap doanh nghiep') ||
    ((p.includes('doanh nghiep') || p.includes('cong ty') || p.includes('phuong phap khau tru')) && p.includes('thue'))
  );
  if (hasCompanyTerms) {
    return 'COMPANY_POLICY';
  }

  // 8. Tax Rates Inquiry (Rate % for Retail, F&B, Services, Circular 40)
  // Checked before LIVE_CALCULATION if user specifically asks about percentage/rates
  const hasRateInquiry = (
    p.includes('bao nhieu phan tram') || p.includes('may phan tram') || p.includes('may %') ||
    p.includes('bao nhieu %') || p.includes('bn %') || p.includes('ty le thue') || p.includes('ti le thue') ||
    p.includes('thue suat') || p.includes('bieu thue') || p.includes('thong tu 40') || p.includes('tt40') || p.includes('tt 40') ||
    ((p.includes('thue vat') || p.includes('thue tncn') || (p.includes('thue') && (p.includes('vat') || p.includes('tncn')))) && (p.includes('bao nhieu') || p.includes('may') || p.includes('the nao') || p.includes('nhu the nao'))) ||
    (p.includes('thue') && (p.includes('bao nhieu') || p.includes('dong the nao') || p.includes('nop the nao') || p.includes('tinh sao') || p.includes('the nao')) && (
      p.includes('ban le') || p.includes('tap hoa') || p.includes('thoi trang') || p.includes('quan ao') ||
      p.includes('my pham') || p.includes('quan an') || p.includes('cafe') || p.includes('ca phe') ||
      p.includes('an uong') || p.includes('bun pho') || p.includes('quan bun') || p.includes('quan pho') ||
      p.includes('nha hang') || p.includes('dich vu') || p.includes('spa') || p.includes('cat toc') ||
      p.includes('goi dau') || p.includes('tiem toc') || p.includes('sua chua')
    ))
  );
  const hasHkdRateTerms = (
    hasRateInquiry ||
    p.includes('thue hkd') || p.includes('thue ho kinh doanh') || p.includes('thue ca nhan kinh doanh') ||
    ((p.includes('ho kinh doanh') || p.includes('hkd')) && (p.includes('thue') || p.includes('vat') || p.includes('tncn'))) ||
    (p.includes('thue') && (p.includes('gom nhung thue gi') || p.includes('gom nhung khoan gi') || p.includes('co nhung thue gi')))
  );
  if (hasHkdRateTerms) {
    return 'HKD_RATES';
  }

  // 9. Live Store Tax Calculation & Net Profit After Tax & Tax Report Commands
  const hasCalculationTerms = (
    p.includes('nop bao nhieu thue') || p.includes('thue het bao nhieu') ||
    p.includes('tinh thue') || p.includes('tien thue') || p.includes('thue phai nop') ||
    p.includes('thue thang nay') || p.includes('thue hom nay') || p.includes('thue ky nay') ||
    p.includes('loi nhuan sau thue') || p.includes('lai sau thue') || p.includes('lai thuc') ||
    p.includes('sau thue') || p.includes('loi nhuan thuc') ||
    p.includes('doanh thu chiu thue') || p.includes('doanh thu tinh thue') ||
    p.includes('doanh thu ngoai san chiu thue') || p.includes('ngoai san chiu thue') ||
    p.includes('bao cao thue') || p.includes('tong hop thue') || p.includes('ke khai thue') ||
    p.includes('xem thue') || p.includes('nghia vu thue') ||
    ((p.includes('thue') || p.includes('nghia vu thue')) && (
      p.includes('thang nay') || p.includes('hom nay') || p.includes('tuan nay') ||
      p.includes('thang truoc') || p.includes('shop') || p.includes('cua toi') ||
      p.includes('cua hang') || p.includes('hien tai')
    ))
  );
  if (hasCalculationTerms) {
    return 'LIVE_CALCULATION';
  }

  // 10. General Tax Overview
  const hasGeneralTerms = (
    p.includes('thue ma') || p.includes('cac loai thue') ||
    p.includes('thue mon bai') || p.includes('mon bai') || p.includes('le phi mon bai') ||
    p.includes('phai dong nhung thue gi') || p.includes('nghia vu thue') ||
    (p.includes('thue') && (p.includes('la gi') || p.includes('nhu the nao') || p.includes('the nao') || p.includes('sao vay')))
  );
  if (hasGeneralTerms) {
    return 'GENERAL_OVERVIEW';
  }

  return null;
}

/**
 * Build deterministic AI responses for each tax intent
 */
export function buildTaxAssistantResponse(intentType, state, pNorm, rawPrompt = '') {
  switch (intentType) {
    case 'INVOICE_GUIDE_AND_POLICY': {
      return {
        text: `🧾 **Hướng dẫn Xuất & Quản lý Hóa đơn điện tử (Nghị định 123/2020/NĐ-CP):**\n\n` +
              `• **Quy trình phát hành Hóa đơn điện tử trên QBiz:**\n` +
              `  1. Mở bất kỳ **Phiếu bán hàng** hoặc **Đơn hàng** đã hoàn tất thanh toán.\n` +
              `  2. Bấm nút **\`[🧾 Hóa đơn điện tử]\`** (nút màu xanh nổi bật ngay trên đỉnh chi tiết giao dịch).\n` +
              `  3. Điền thông tin doanh nghiệp / khách hàng:\n` +
              `     - **Mã số thuế (MST)** của người mua.\n` +
              `     - **Tên đơn vị / Tên công ty** và **Địa chỉ** đăng ký kinh doanh.\n` +
              `     - **Email** nhận hóa đơn điện tử (định dạng XML + PDF có chữ ký số).\n` +
              `     - **Thuế suất VAT:** 0%, 5%, 8% hoặc 10% theo quy định mặt hàng.\n` +
              `  4. Bấm **"Phát hành hóa đơn"** (tuân thủ **Nghị định 123/2020/NĐ-CP** và **Thông tư 78/2021/TT-BTC**).\n\n` +
              `• **Phân biệt Phiếu bán hàng và Hóa đơn điện tử:**\n` +
              `  - **Phiếu bán hàng:** Chứng từ bán lẻ nội bộ cho khách lẻ (in nhiệt K80/K57).\n` +
              `  - **Hóa đơn điện tử:** Chứng từ có giá trị pháp lý với cơ quan thuế khi khách hàng là công ty cần lấy hóa đơn đỏ VAT khấu trừ chi phí.\n\n` +
              `• **Hộ kinh doanh có được xuất Hóa đơn điện tử không?**\n` +
              `  - Hộ kinh doanh nộp thuế theo phương pháp trực tiếp (% doanh thu) được sử dụng **Hóa đơn bán hàng điện tử** (không có thuế suất VAT khấu trừ).\n` +
              `  - Doanh nghiệp phương pháp khấu trừ phát hành **Hóa đơn GTGT điện tử**.`,
        status: 'SUCCESS',
        intent: 'INVOICE_GUIDE_AND_POLICY',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    case 'TAX_PROFIT_EXPLANATION': {
      return {
        text: `🌿 **Mối quan hệ giữa Doanh thu, Giá vốn, Thuế và Lợi nhuận sau thuế:**\n\n` +
              `Tại QBiz, mô hình dòng tiền và lợi nhuận được thiết kế chuẩn mực theo chuỗi 4 cấp độ tài chính:\n\n` +
              `1. **Doanh thu thuần (Net Revenue):**\n` +
              `   - Là tổng số tiền thu về từ khách hàng sau khi đã trừ Chiết khấu giảm giá và Hoàn tiền trả hàng.\n` +
              `   - Gồm 2 nguồn: **Doanh thu Sàn TMĐT** (Shopee, TikTok, Lazada) và **Doanh thu ngoài sàn** (Tại quầy, Web, Zalo).\n\n` +
              `2. **Lợi nhuận gộp (Gross Profit):**\n` +
              `   - 👉 **Lợi nhuận gộp = Doanh thu thuần − Tổng giá vốn hàng bán (COGS).**\n` +
              `   - Đây là số tiền chênh lệch thuần túy giữa giá bán và giá nhập hàng hóa.\n\n` +
              `3. **Nghĩa vụ Thuế ước tính (Estimated Tax):**\n` +
              `   - Khoản tiền thuế phải trích nộp cho nhà nước:\n` +
              `     • **Hộ kinh doanh (TT 40/2021):** Nộp 1.5% (bán lẻ) trên Doanh thu ngoài sàn. Đơn hàng sàn TMĐT đã được sàn khấu trừ tại nguồn nên được trừ ra, không tính trùng!\n` +
              `     • **Doanh nghiệp:** Nộp thuế TNDN tạm tính 20% trên Lợi nhuận gộp.\n\n` +
              `4. 🌿 **Lợi nhuận thực sau thuế (Net Profit After Tax):**\n` +
              `   - 👉 **Lợi nhuận thực sau thuế = Lợi nhuận gộp − Thuế ước tính.**\n` +
              `   - Đây chính là **số tiền thực tế người bán bỏ túi an toàn** sau khi hoàn thành toàn bộ trách nhiệm tài chính!\n\n` +
              `💡 **Tại sao Lợi nhuận sau thuế lại thấp hơn Lợi nhuận gộp?**\n` +
              `• Lợi nhuận gộp mới chỉ bù đắp tiền nhập hàng, **chưa tính đến nghĩa vụ thuế**.\n` +
              `• Nếu chỉ nhìn vào Lợi nhuận gộp, chủ shop rất dễ rơi vào bẫy "tưởng mình lãi nhiều rồi tiêu hết vốn", đến cuối kỳ nộp thuế sẽ bị hụt tiền.\n` +
              `• Báo cáo Lợi nhuận sau thuế của QBiz giúp bạn luôn nắm chắc **tiền thực lãi chuẩn xác 100%**!`,
        status: 'SUCCESS',
        intent: 'TAX_PROFIT_EXPLANATION',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    case 'ECOMMERCE_POLICY': {
      return {
        text: `⚖️ **Quy định Thuế đối với Sàn TMĐT (Shopee, TikTok Shop, Lazada):**\n\n` +
              `• **Căn cứ pháp lý:** Căn cứ **Nghị định 91/2022/NĐ-CP** (bổ sung Nghị định 126/2020/NĐ-CP) và chính sách quản lý thuế sàn TMĐT của Tổng cục Thuế:\n` +
              `  - Các sàn TMĐT có trách nhiệm cung cấp thông tin và thực hiện kê khai, **khấu trừ thuế tại nguồn** thay cho người bán.\n` +
              `• **Cơ chế tự động trên QBiz:**\n` +
              `  1. Khi bạn tạo hoặc đồng bộ đơn hàng từ kênh **Shopee, TikTok Shop, Lazada**, hệ thống tự động nhận diện đúng kênh sàn TMĐT.\n` +
              `  2. QBiz mặc định kích hoạt tính năng **"Tự động miễn tính thuế cho đơn từ Sàn TMĐT"**.\n` +
              `  3. Toàn bộ doanh thu từ các sàn này được **tự động loại trừ** khỏi doanh thu tính thuế tại cửa hàng để **tuyệt đối không bị tính trùng thuế 2 lần**.\n` +
              `• **Doanh thu chịu thuế tại cửa hàng:** Chỉ tính trên các kênh bán trực tiếp: Tại quầy (POS), Website riêng, Bán qua Facebook / Zalo / Điện thoại.\n` +
              `• **Kiểm tra cài đặt:** Vào mục **Báo cáo** → khối **Nghĩa vụ thuế & Lợi nhuận sau thuế** → bấm **[🛡️ Cài đặt thuế]** để xem hoặc tùy chỉnh cơ chế miễn trừ sàn bất kỳ lúc nào.`,
        status: 'SUCCESS',
        intent: 'TAX_ECOMMERCE_POLICY',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    case 'EXEMPTION_THRESHOLD': {
      return {
        text: `⚖️ **Quy định Ngưỡng Miễn Thuế 100 Triệu Đồng/Năm:**\n\n` +
              `• **Căn cứ pháp lý:** Căn cứ **Điều 4 Thông tư 40/2021/TT-BTC** và Luật Quản lý Thuế:\n` +
              `  - Hộ kinh doanh, cá nhân kinh doanh có doanh thu từ hoạt động sản xuất, kinh doanh trong năm dương lịch từ **100 triệu đồng trở xuống** thì **thuộc diện KHÔNG PHẢI nộp thuế GTGT và KHÔNG PHẢI nộp thuế TNCN**.\n` +
              `  - Ngưỡng 100 triệu đồng tính cho **tổng doanh thu của cả năm dương lịch** (từ ngày 01/01 đến 31/12).\n` +
              `• **Khi nào bắt đầu phải nộp thuế?**\n` +
              `  - Khi tổng doanh thu lũy kế trong năm vượt mức 100 triệu đồng, hộ kinh doanh mới phát sinh nghĩa vụ kê khai và nộp thuế theo tỷ lệ quy định trên toàn bộ doanh thu phát sinh.\n` +
              `• **Cài đặt trên QBiz:** Nếu shop mới mở hoặc doanh thu cả năm ước tính dưới 100 triệu đồng:\n` +
              `  - Vào **Báo cáo** → **[🛡️ Cài đặt thuế]** → Chọn mô hình **"Miễn thuế / Quản lý nội bộ"**.\n` +
              `  - Hệ thống sẽ tự động đặt số thuế ước tính bằng 0 ₫ trong toàn bộ báo cáo doanh thu & lợi nhuận.`,
        status: 'SUCCESS',
        intent: 'TAX_EXEMPTION_THRESHOLD',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    case 'HKD_RATES': {
      return {
        text: `📊 **Biểu Thuế Suất Hộ Kinh Doanh theo Thông tư 40/2021/TT-BTC:**\n\n` +
              `Hộ kinh doanh nộp thuế theo **tỷ lệ % tính trực tiếp trên doanh thu**, gồm 2 sắc thuế: **Thuế GTGT** và **Thuế TNCN**:\n\n` +
              `1. 🛍️ **Bán buôn, bán lẻ các loại hàng hóa** *(tạp hóa, thời trang, mỹ phẩm, đồ gia dụng, linh kiện...)*:\n` +
              `   - Thuế GTGT: **1.0%**\n` +
              `   - Thuế TNCN: **0.5%**\n` +
              `   - 👉 **Tổng cộng: 1.5%** trên doanh thu.\n\n` +
              `2. ☕ **Dịch vụ ăn uống, nhà hàng, F&B, sản xuất, vận tải gắn với hàng hóa**:\n` +
              `   - Thuế GTGT: **3.0%**\n` +
              `   - Thuế TNCN: **1.5%**\n` +
              `   - 👉 **Tổng cộng: 4.5%** trên doanh thu.\n\n` +
              `3. 💇 **Dịch vụ, sửa chữa, chăm sóc sắc đẹp, Spa, lưu trú, giặt là**:\n` +
              `   - Thuế GTGT: **5.0%**\n` +
              `   - Thuế TNCN: **2.0%**\n` +
              `   - 👉 **Tổng cộng: 7.0%** trên doanh thu.\n\n` +
              `4. 📦 **Hoạt động kinh doanh khác**:\n` +
              `   - Thuế GTGT: **2.0%**\n` +
              `   - Thuế TNCN: **1.0%**\n` +
              `   - 👉 **Tổng cộng: 3.0%** trên doanh thu.\n\n` +
              `💡 **Lưu ý đặc biệt:** Đơn hàng từ Sàn TMĐT (Shopee, TikTok Shop, Lazada) đã được sàn khấu trừ thuế tại nguồn theo NĐ 91/2022/NĐ-CP nên QBiz tự động trừ ra, không tính thuế trùng!`,
        status: 'SUCCESS',
        intent: 'TAX_HKD_RATES',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    case 'SETTINGS_GUIDE': {
      return {
        text: `🛡️ **Hướng dẫn Cài đặt Cấu hình Thuế trên QBiz:**\n\n` +
              `Để cấu hình thuế phù hợp với mô hình kinh doanh và tránh bị tính trùng thuế:\n` +
              `1. Vào menu **Báo cáo** trên thanh điều hướng.\n` +
              `2. Cuộn xuống khối **"Nghĩa vụ thuế & Lợi nhuận sau thuế"** (ngay dưới Báo cáo Lợi nhuận gộp).\n` +
              `3. Bấm nút **[🛡️ Cài đặt thuế]**.\n` +
              `4. Tại cửa sổ Cấu hình Thuế & Hộ kinh doanh:\n` +
              `   • **Mô hình kinh doanh:** Chọn *Hộ kinh doanh / Cá nhân kinh doanh* (TT 40), *Doanh nghiệp khấu trừ*, hoặc *Miễn thuế*.\n` +
              `   • **Ngành nghề & Tỷ lệ:** Chọn nhanh *Bán lẻ (1.5%)*, *Ăn uống F&B (4.5%)*, *Dịch vụ (7%)* hoặc tùy chỉnh % VAT & TNCN.\n` +
              `   • **Quy tắc Sàn TMĐT:** Bật công tắc *"Tự động miễn tính thuế cho đơn từ Sàn TMĐT"* để tự động loại trừ Shopee, TikTok Shop, Lazada.\n` +
              `   • **Thông tin pháp lý:** Nhập Mã số thuế (MST) và Tên đăng ký kinh doanh của shop.\n` +
              `5. Bấm **"Lưu cấu hình thuế"** để áp dụng tự động cho toàn bộ hệ thống.`,
        status: 'SUCCESS',
        intent: 'TAX_SETTINGS_GUIDE',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    case 'LIVE_CALCULATION': {
      let period = 'month';
      if (pNorm.includes('hom nay')) period = 'today';
      else if (pNorm.includes('hom qua')) period = 'yesterday';
      else if (pNorm.includes('tuan nay') || pNorm.includes('7 ngay')) period = 'this_week';
      else if (pNorm.includes('thang truoc')) period = 'last_month';

      const s = calculateLiveTaxSummary(state, period);
      const isExempt = s.taxSettings?.business_type === 'exempt';
      const isCompany = s.taxSettings?.business_type === 'company_deduct';

      return {
        text: `📊 **Đối soát Thuế & Lợi nhuận ${s.periodLabel} của cửa hàng:**\n\n` +
              `• 🌿 **Lợi nhuận thực sau thuế:** **${s.hasCost ? fmtVND(s.netProfitAfterTax) : 'Chưa có giá vốn'}** ` +
              `(Tỷ suất **${s.profitAfterTaxMargin}%**${s.hasCost ? `, LN gộp: ${fmtVND(s.profit)}` : ''})\n\n` +
              `📋 **Chi tiết số liệu tính thuế:**\n` +
              `  1. **Doanh thu thuần tổng cộng:** **${fmtVND(s.net)}** (${s.salesCount} giao dịch)\n` +
              `  2. **Doanh thu Sàn TMĐT (Shopee, TikTok, Lazada):** **${fmtVND(s.ecommerceNet)}** ` +
              `(${s.taxSettings?.ecommerce_auto_deduct ? '✅ Đã khấu trừ tự động tại sàn, miễn tính thuế trùng' : 'Chưa trừ'})\n` +
              `  3. **Doanh thu ngoài sàn chịu thuế (Tại quầy, Web, Zalo):** **${fmtVND(s.directNet)}**\n` +
              `  4. **Thuế ước tính phải nộp:** **${s.estimatedTax > 0 ? `− ${fmtVND(s.estimatedTax)}` : '0 ₫'}**\n` +
              `     • Chế độ: **${s.taxModeLabel}** (${s.taxRateLabel})\n` +
              (!isExempt && !isCompany ? `     • Chi tiết: Thuế GTGT **${fmtVND(s.estimatedVat)}** (${s.taxSettings.vat_rate}%) + Thuế TNCN **${fmtVND(s.estimatedPit)}** (${s.taxSettings.pit_rate}%)\n` : '') +
              (isCompany ? `     • Chi tiết: Thuế TNDN tạm tính **${fmtVND(s.estimatedTax)}** (${s.taxSettings.cit_rate || 20}% trên LN gộp)\n` : '') +
              (isExempt ? `     • Ghi chú: Chế độ Miễn thuế / Quản lý nội bộ (doanh thu ≤ 100tr/năm)\n` : '') +
              `\n⚖️ *Căn cứ: Thông tư 40/2021/TT-BTC & Nghị định 91/2022/NĐ-CP về Sàn TMĐT.*\n` +
              `💡 *Bạn có thể xem biểu đồ trực quan tại mục **Báo cáo** → khối **Nghĩa vụ thuế & Lợi nhuận sau thuế**.*`,
        status: 'SUCCESS',
        intent: 'TAX_CALCULATION_AND_PROFIT',
        skillId: 'tax-intelligence',
        tier: 0,
        summary: s
      };
    }

    case 'COMPANY_POLICY': {
      return {
        text: `🏢 **Quy định Thuế đối với Doanh nghiệp / Công ty:**\n\n` +
              `• **Phương pháp Khấu trừ:**\n` +
              `  1. **Thuế GTGT (VAT):** Kê khai theo công thức [Thuế GTGT đầu ra bán lẻ/xuất hóa đơn] − [Thuế GTGT đầu vào được khấu trừ từ hóa đơn mua sắm/vật tư].\n` +
              `  2. **Thuế TNDN (Thu nhập doanh nghiệp):** Thuế suất phổ thông là **20%** tính trên Thu nhập chịu thuế (= Doanh thu − Giá vốn & Chi phí hợp lý có hóa đơn hợp lệ).\n` +
              `• **Phương pháp Trực tiếp trên Doanh thu (DN siêu nhỏ):**\n` +
              `  - Nộp thuế theo tỷ lệ % trực tiếp trên doanh thu tương tự như Hộ kinh doanh (Theo Thông tư 133/2016/TT-BTC).\n` +
              `• **Cài đặt trên QBiz:** Vào **Báo cáo** → **[🛡️ Cài đặt thuế]** → Chọn mô hình **"Doanh nghiệp / Công ty — Phương pháp Khấu trừ"**, hệ thống sẽ tính thuế TNDN tạm tính 20% trên lợi nhuận gộp và hỗ trợ xuất hóa đơn điện tử chuẩn Nghị định 123.`,
        status: 'SUCCESS',
        intent: 'TAX_COMPANY_POLICY',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    case 'GENERAL_OVERVIEW': {
      return {
        text: `⚖️ **Tổng quan Nghĩa vụ Thuế cho Cửa hàng & Hộ kinh doanh:**\n\n` +
              `Khi kinh doanh buôn bán, chủ cửa hàng cần lưu ý các nghĩa vụ thuế chính:\n` +
              `1. 🏷️ **Lệ phí môn bài:** Miễn nộp năm đầu thành lập. Các năm sau nộp từ 300.000đ - 1.000.000đ/năm tùy bậc doanh thu (miễn nộp nếu doanh thu ≤ 100 triệu/năm).\n` +
              `2. 🧾 **Thuế GTGT và Thuế TNCN (Thông tư 40/2021/TT-BTC):**\n` +
              `   • Bán lẻ hàng hóa: **1.5%** trên doanh thu.\n` +
              `   • Ăn uống F&B, sản xuất: **4.5%** trên doanh thu.\n` +
              `   • Dịch vụ, cắt tóc, Spa: **7.0%** trên doanh thu.\n` +
              `3. 🛍️ **Đơn hàng trên Sàn TMĐT (Shopee, TikTok, Lazada):** Được sàn khấu trừ tại nguồn theo Nghị định 91/2022/NĐ-CP, QBiz tự động trừ ra để không tính trùng.\n` +
              `4. 🌿 **Lợi nhuận thực sau thuế:** QBiz tự động tính toán Doanh thu − Giá vốn − Thuế ước tính giúp bạn luôn nắm chắc tiền thực lãi trong túi!`,
        status: 'SUCCESS',
        intent: 'TAX_GENERAL_OVERVIEW',
        skillId: 'tax-intelligence',
        tier: 0
      };
    }

    default:
      return null;
  }
}
