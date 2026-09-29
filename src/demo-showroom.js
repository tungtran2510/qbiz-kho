/**
 * QBIZ KHO — MULTI-INDUSTRY DEMO SHOWROOM & ROLE SWITCH ENGINE
 * Spec: CMD_20260926_BUILD_MULTI_INDUSTRY_DEMO_SHOWROOM_AND_ROLE_SWITCH.txt
 * 
 * 4 Complete Dedicated Industry Showrooms:
 *  1. Retail (Bán lẻ / Cửa hàng tổng hợp) — key: retail
 *  2. Fashion (Thời trang & Phụ kiện) — key: fashion
 *  3. Food & Beverage (Ăn uống / F&B) — key: food_beverage
 *  4. Service (Dịch vụ / Spa trị liệu) — key: service
 * 
 * 4 Switchable Roles:
 *  - OWNER: Toàn quyền
 *  - MANAGER: Quản lý vận hành
 *  - CASHIER: Thu ngân / ca
 *  - WAREHOUSE: Thủ kho
 * 
 * Strict Sandbox Isolation:
 *  - 0 external emails
 *  - 0 real customer data
 *  - 0 cloud mutations
 */

import { clearAll, put, putMany, getAll } from './db.js';
import { switchBusinessProfile } from './business-profile.js';
import { ROLES, ROLE_LABELS } from './capabilities.js';

// SVG Vector Shop Logo Generator with distinct industry branding
export function makeSvgShopLogo(industryKey) {
  const logos = {
    retail: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g_ret" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0284c7"/>
          <stop offset="100%" stop-color="#0369a1"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="24" fill="url(#g_ret)"/>
      <path d="M30 38h14l10 38h38l8-28H40" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="56" cy="90" r="6" fill="#ffffff"/>
      <circle cx="88" cy="90" r="6" fill="#ffffff"/>
      <path d="M60 52l6 7 16-16" fill="none" stroke="#7dd3fc" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    fashion: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g_fas" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ec4899"/>
          <stop offset="100%" stop-color="#9d174d"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="24" fill="url(#g_fas)"/>
      <path d="M60 30c-5 0-9 4-9 9 0 6 7 8 7 13h4c0-6-7-8-7-13 0-2 2-4 5-4s5 2 5 4h4c0-5-4-9-9-9z" fill="#ffffff"/>
      <path d="M60 52L28 76h64L60 52z" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="60" cy="76" r="3.5" fill="#ffffff"/>
      <path d="M88 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fbcfe8"/>
    </svg>`,
    food_beverage: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g_fnb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#d97706"/>
          <stop offset="100%" stop-color="#78350f"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="24" fill="url(#g_fnb)"/>
      <path d="M38 52h40v26c0 9-7 16-16 16h-8c-9 0-16-7-16-16V52z" fill="#ffffff"/>
      <path d="M78 58h8c5 0 9 4 9 9s-4 9-9 9h-8" fill="none" stroke="#ffffff" stroke-width="4.5"/>
      <path d="M32 98h56" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M48 42c-2-6 2-10 0-16m12 16c-2-6 2-10 0-16m12 16c-2-6 2-10 0-16" stroke="#fde68a" stroke-width="3" stroke-linecap="round" fill="none"/>
    </svg>`,
    service: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="g_svc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#8b5cf6"/>
          <stop offset="100%" stop-color="#5b21b6"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="24" fill="url(#g_svc)"/>
      <path d="M60 34c-8 16-14 30-10 40 4 10 18 10 20 0 4-10-2-24-10-40z" fill="#ffffff"/>
      <path d="M47 50c-12 10-15 22-9 30 6 8 18 5 21-4 3-10-3-19-12-26z" fill="#ffffff" opacity="0.85"/>
      <path d="M73 50c12 10 15 22 9 30-6 8-18 5-21-4-3-10 3-19 12-26z" fill="#ffffff" opacity="0.85"/>
      <circle cx="60" cy="88" r="4" fill="#fbcfe8"/>
    </svg>`
  };
  const svg = logos[industryKey] || logos.retail;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// SVG Vector thumbnail generator with distinct industry graphics
function makeSvgThumb(label, iconType, bg1, bg2) {
  const icons = {
    bottle: `<path d="M72 32h16v14h10v72c0 6-5 10-10 10H72c-5 0-10-4-10-10V46h10V32z" fill="#fff" opacity=".92"/><path d="M74 24h12v8H74z" fill="#fff" opacity=".8"/><rect x="66" y="65" width="28" height="34" rx="4" fill="${bg2}" opacity=".4"/>`,
    ramen: `<path d="M42 60h76l-10 52c-2 8-10 14-18 14H70c-8 0-16-6-18-14L42 60z" fill="#fff" opacity=".92"/><path d="M38 52h84v8H38z" fill="#fff" opacity=".8"/><path d="M52 38l56 12m-60 8l64 12" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
    soap: `<rect x="52" y="48" width="56" height="74" rx="14" fill="#fff" opacity=".92"/><rect x="68" y="28" width="24" height="20" rx="4" fill="#fff" opacity=".85"/><path d="M60 28h40v6H60z" fill="#fff"/><circle cx="114" cy="46" r="8" fill="#fff" opacity=".5"/><circle cx="122" cy="62" r="5" fill="#fff" opacity=".4"/>`,
    tissue: `<rect x="42" y="44" width="76" height="76" rx="38" fill="#fff" opacity=".92"/><ellipse cx="80" cy="82" rx="16" ry="16" fill="${bg2}" opacity=".5"/><circle cx="80" cy="82" r="7" fill="${bg1}"/>`,
    brush: `<path d="M54 128l52-76c4-6 12-6 16-2l2 2c4 4 4 12-2 16L70 144c-4 4-10 4-14 0l-2-2c-4-4-4-10 0-14z" fill="#fff" opacity=".92"/><rect x="110" y="42" width="22" height="12" rx="3" transform="rotate(-35 110 42)" fill="${bg2}" opacity=".8"/>`,
    oil: `<path d="M62 44h36l8 22v56c0 6-5 10-10 10H64c-6 0-10-4-10-10V66l8-22z" fill="#fff" opacity=".92"/><rect x="70" y="26" width="20" height="18" rx="4" fill="#fff" opacity=".8"/><rect x="64" y="74" width="32" height="28" rx="4" fill="${bg2}" opacity=".4"/>`,
    dress: `<path d="M64 34l-8 18h14l-18 64c-2 6 2 12 8 12h40c6 0 10-6 8-12L90 52h14l-8-18c-4 2-10 4-16 4s-12-2-16-4z" fill="#fff" opacity=".92"/><path d="M64 52h32v8H64z" fill="${bg2}" opacity=".5"/>`,
    polo: `<path d="M46 44l16-12 12 10 12-10 16 12-8 20-10-6v68H56V58l-10 6-8-20z" fill="#fff" opacity=".92"/><path d="M74 42h12v36H74z" fill="${bg2}" opacity=".4"/><circle cx="80" cy="52" r="2" fill="${bg2}"/><circle cx="80" cy="62" r="2" fill="${bg2}"/>`,
    jeans: `<path d="M54 36h52l4 28-8 68c-1 5-6 8-11 8h-6c-4 0-8-3-8-8L74 72l-3 60c0 5-4 8-8 8h-6c-5 0-10-3-11-8L38 64l16-28z" fill="#fff" opacity=".92"/><path d="M54 48h52v4H54z" fill="${bg2}" opacity=".5"/>`,
    blouse: `<path d="M50 40l18-10 12 12 12-12 18 10-6 24-12-6v66H48V58l-12 6-6-24z" fill="#fff" opacity=".92"/><path d="M76 42l4 8 4-8v58H76z" fill="${bg2}" opacity=".4"/>`,
    handbag: `<rect x="44" y="60" width="72" height="58" rx="10" fill="#fff" opacity=".92"/><path d="M62 60V42c0-10 8-18 18-18s18 8 18 18v18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="80" cy="74" r="5" fill="${bg2}" opacity=".7"/>`,
    coffee: `<path d="M52 48h56l-8 72c-1 6-6 10-12 10H72c-6 0-11-4-12-10L52 48z" fill="#fff" opacity=".92"/><path d="M48 40h64v8H48z" fill="#fff"/><rect x="88" y="20" width="6" height="28" rx="3" transform="rotate(15 88 20)" fill="#fff" opacity=".8"/><ellipse cx="80" cy="76" rx="14" ry="12" fill="${bg2}" opacity=".4"/>`,
    latte: `<path d="M56 46h48l-6 74c-1 6-5 10-11 10H73c-6 0-10-4-11-10L56 46z" fill="#fff" opacity=".92"/><ellipse cx="80" cy="46" rx="24" ry="7" fill="#fff"/><path d="M62 68c8 4 14-2 22 2s8 6 14 2" stroke="${bg2}" stroke-width="3" fill="none" opacity=".6"/>`,
    tea: `<path d="M54 50h52l-8 70c-1 6-6 10-11 10H73c-5 0-10-4-11-10L54 50z" fill="#fff" opacity=".92"/><circle cx="70" cy="40" r="14" fill="#fbbf24" opacity=".9"/><circle cx="70" cy="40" r="8" fill="#fff" opacity=".6"/>`,
    boba: `<path d="M52 48h56l-8 72c-1 6-6 10-12 10H72c-6 0-11-4-12-10L52 48z" fill="#fff" opacity=".92"/><circle cx="68" cy="106" r="4" fill="${bg2}"/><circle cx="80" cy="112" r="4" fill="${bg2}"/><circle cx="92" cy="106" r="4" fill="${bg2}"/><circle cx="74" cy="96" r="4" fill="${bg2}"/><circle cx="86" cy="98" r="4" fill="${bg2}"/>`,
    croissant: `<path d="M38 92c10-24 30-36 50-36s40 12 50 36c-16-6-34-10-50-10s-34 4-50 10z" fill="#fff" opacity=".95"/><path d="M54 84c8-14 20-20 34-20s26 6 34 20" stroke="${bg2}" stroke-width="4" fill="none" opacity=".5"/>`,
    breakfast: `<circle cx="80" cy="80" r="46" fill="#fff" opacity=".92"/><circle cx="80" cy="80" r="34" fill="${bg1}" opacity=".2"/><path d="M60 84c8-14 20-18 32-18s24 4 32 18" stroke="${bg2}" stroke-width="4" fill="none" opacity=".8"/><circle cx="66" cy="74" r="6" fill="#fbbf24"/>`,
    orange: `<circle cx="80" cy="80" r="40" fill="#fff" opacity=".92"/><circle cx="80" cy="80" r="32" fill="#fb923c" opacity=".85"/><path d="M80 52v56m-28-28h56m-40-20l40 40m0-40l-40 40" stroke="#fff" stroke-width="2.5" opacity=".7"/>`,
    lotus: `<path d="M80 38c-10 18-18 36-12 48 6 12 24 12 30 0 6-12-2-30-18-48z" fill="#fff" opacity=".95"/><path d="M64 56c-14 12-18 28-10 38 8 10 24 6 28-6 4-12-4-24-18-32z" fill="#fff" opacity=".8"/><path d="M96 56c14 12 18 28 10 38-8 10-24 6-28-6-4-12 4-24 18-32z" fill="#fff" opacity=".8"/>`,
    facial: `<circle cx="80" cy="78" r="38" fill="#fff" opacity=".92"/><path d="M68 76c2 4 6 6 12 6s10-2 12-6" stroke="${bg2}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="66" cy="68" r="3" fill="${bg2}"/><circle cx="94" cy="68" r="3" fill="${bg2}"/><path d="M80 34c4 6 8 10 8 14 0 4-4 8-8 8s-8-4-8-8c0-4 4-8 8-14z" fill="#38bdf8"/>`,
    shampoo: `<ellipse cx="80" cy="94" rx="42" ry="24" fill="#fff" opacity=".92"/><circle cx="68" cy="62" r="10" fill="#fff" opacity=".7"/><circle cx="88" cy="56" r="14" fill="#fff" opacity=".85"/><circle cx="104" cy="68" r="8" fill="#fff" opacity=".6"/><circle cx="56" cy="74" r="6" fill="#fff" opacity=".5"/>`,
    stone: `<ellipse cx="80" cy="106" rx="40" ry="16" fill="#fff" opacity=".92"/><ellipse cx="80" cy="84" rx="32" ry="14" fill="#fff" opacity=".85"/><ellipse cx="80" cy="64" rx="24" ry="11" fill="#fff" opacity=".75"/>`,
    royal: `<path d="M46 62l12 42h44l12-42-18 16-16-24-16 24-18-16z" fill="#fff" opacity=".95"/><circle cx="46" cy="58" r="4" fill="#fbbf24"/><circle cx="80" cy="50" r="5" fill="#fbbf24"/><circle cx="114" cy="58" r="4" fill="#fbbf24"/>`,
    lavender: `<rect x="62" y="56" width="36" height="66" rx="8" fill="#fff" opacity=".92"/><rect x="72" y="38" width="16" height="18" rx="3" fill="#fff" opacity=".8"/><circle cx="80" cy="88" r="10" fill="${bg2}" opacity=".5"/><path d="M104 38c-4 12-2 26 2 38m-2-30c4 0 6 4 6 8s-2 8-6 8" stroke="#fff" stroke-width="2.5" fill="none" opacity=".8"/>`
  };

  const svgInner = icons[iconType] || icons.bottle;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop stop-color="${bg1}"/>
        <stop offset="1" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#g)"/>
    <circle cx="132" cy="28" r="20" fill="rgba(255,255,255,.12)"/>
    <circle cx="28" cy="132" r="26" fill="rgba(255,255,255,.08)"/>
    ${svgInner}
    <text x="16" y="146" fill="white" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="12" font-weight="700" letter-spacing="0.3">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Canonical Roles Configuration
export const DEMO_ROLES = Object.freeze({
  OWNER: {
    key: ROLES.OWNER,
    label: 'Chủ shop (Owner)',
    sub: 'Toàn quyền',
    badge: '👑',
    desc: 'Toàn quyền cấu hình, tài chính, báo cáo và nhân sự.',
  },
  MANAGER: {
    key: ROLES.MANAGER,
    label: 'Quản lý (Manager)',
    sub: 'Quản lý vận hành',
    badge: '👔',
    desc: 'Kiểm soát hàng hóa, đơn hàng, ca và doanh thu.',
  },
  CASHIER: {
    key: ROLES.CASHIER,
    label: 'Thu ngân (Cashier)',
    sub: 'Bán hàng / ca',
    badge: '💳',
    desc: 'Tập trung bán hàng POS, mở/đóng ca. Ẩn giá vốn.',
  },
  WAREHOUSE: {
    key: ROLES.WAREHOUSE,
    label: 'Thủ kho (Warehouse)',
    sub: 'Kho & nhập xuất',
    badge: '📦',
    desc: 'Nhập hàng, kiểm kho, điều chuyển. Không bán POS.',
  },
});

// Helper for dynamic ISO timestamps relative to now
const dayAgo = (days, hours = 0, mins = 0) => {
  const d = new Date(Date.now() - days * 86400000 - hours * 3600000 - mins * 60000);
  return d.toISOString();
};

/**
 * 4 Complete Multi-Industry Datasets
 */
export const DEMO_INDUSTRIES = Object.freeze({
  // =========================================================================
  // 1. RETAIL / CỬA HÀNG TỔNG HỢP
  // =========================================================================
  retail: {
    key: 'retail',
    name: 'Bán lẻ / Cửa hàng tổng hợp',
    shortName: 'Bán lẻ',
    icon: 'shopping-bag',
    color: '#0284c7',
    shop: {
      id: 'demo_shop_retail',
      name: 'QBiz Mart — Cửa hàng tiện lợi & Tiêu dùng',
      displayName: 'QBiz Mart',
      phone: '0912.345.678',
      hotline: '1900.6868',
      address: '128 Nguyễn Trãi, Thanh Xuân, Hà Nội',
      email: 'retail-demo@qbiz.vn',
      website: 'https://mart.qbiz.vn',
      tax_id: '0108999888',
      ownerName: 'Trần Tuấn Anh',
      receiptHeader: 'CHUYÊN HÀNG TIÊU DÙNG & THỰC PHẨM CHÍNH HÃNG',
      receiptFooter: 'Cảm ơn quý khách! Hẹn gặp lại quý khách.',
      receiptPolicy: 'Đổi trả trong 3 ngày với hàng nguyên seal & kèm hóa đơn.',
      bank_name: 'Techcombank',
      bank_account_name: 'QBIZ MART CO LTD',
      bank_account_number: '1903668899001',
      payment_qr: 'https://img.vietqr.io/image/TCB-1903668899001-compact2.png',
      created_at: dayAgo(90),
    },
    vocabulary: {
      product: 'Sản phẩm',
      category: 'Ngành hàng',
      warehouse: 'Kho / Quầy',
      receive: 'Nhập hàng',
      sale: 'Bán lẻ (POS)',
      stock: 'Tồn kho',
      shift: 'Ca thu ngân',
    },
    warehouses: [
      { id: 'wh_retail_main', name: 'Kho Tổng Trung Tâm' },
      { id: 'wh_retail_pos', name: 'Quầy Thu Ngân 01' },
    ],
    categories: [
      { id: 'cat_rt_beverage', name: 'Nước giải khát', type: 'PRODUCT' },
      { id: 'cat_rt_dryfood', name: 'Thực phẩm khô', type: 'PRODUCT' },
      { id: 'cat_rt_chemical', name: 'Hóa mỹ phẩm & Tẩy rửa', type: 'PRODUCT' },
      { id: 'cat_rt_household', name: 'Đồ tiêu dùng gia đình', type: 'PRODUCT' },
      { id: 'cat_rt_doctorloan', name: 'Gối & Ghế DoctorLoan', type: 'PRODUCT' },
      { id: 'cat_rt_dl_service', name: 'Dịch vụ tư vấn & Trị liệu', type: 'SERVICE' },
    ],
    products: [
      {
        id: 'p_rt_redbull',
        type: 'PRODUCT',
        name: 'Nước tăng lực Red Bull 250ml',
        sku: 'RB-250',
        barcode: '893500110001',
        category: 'Nước giải khát',
        unit: 'lon',
        price: 15000,
        cost_price: 11000,
        lowStock: 12,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=85',
        onHandMain: 72,
        onHandPos: 24,
      },
      {
        id: 'p_rt_haohao',
        type: 'PRODUCT',
        name: 'Mì Hảo Hảo tôm chua cay 75g',
        sku: 'HH-TCC',
        barcode: '893500110002',
        category: 'Thực phẩm khô',
        unit: 'gói',
        price: 4500,
        cost_price: 3600,
        lowStock: 30,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=85',
        onHandMain: 150,
        onHandPos: 40,
      },
      {
        id: 'p_rt_sunlight',
        type: 'PRODUCT',
        name: 'Nước rửa chén Sunlight Trà Xanh 750g',
        sku: 'SL-TX-750',
        barcode: '893500110003',
        category: 'Hóa mỹ phẩm & Tẩy rửa',
        unit: 'chai',
        price: 32000,
        cost_price: 24000,
        lowStock: 10, // Available 5 -> triggers Sắp hết!
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=600&q=85',
        onHandMain: 60,
        onHandPos: 25,
      },
      {
        id: 'p_rt_paseo',
        type: 'PRODUCT',
        name: 'Giấy vệ sinh Paseo 10 cuộn 3 lớp',
        sku: 'PS-10C',
        barcode: '893500110004',
        category: 'Đồ tiêu dùng gia đình',
        unit: 'lốc',
        price: 115000,
        cost_price: 88000,
        lowStock: 5, // Available 0 -> triggers Hết hàng! (Mẫu hết hàng #1)
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=600&q=85',
        onHandMain: 0,
        onHandPos: 0,
      },
      {
        id: 'p_rt_colgate',
        type: 'PRODUCT',
        name: 'Bàn chải đánh răng Colgate SlimSoft',
        sku: 'CG-SLIM',
        barcode: '893500110005',
        category: 'Hóa mỹ phẩm & Tẩy rửa',
        unit: 'cây',
        price: 38000,
        cost_price: 26000,
        lowStock: 10,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=600&q=85',
        onHandMain: 85,
        onHandPos: 30,
      },
      {
        id: 'p_rt_simply',
        type: 'PRODUCT',
        name: 'Dầu ăn Simply Đậu Nành 1L',
        sku: 'SP-DN-1L',
        barcode: '893500110006',
        category: 'Thực phẩm khô',
        unit: 'chai',
        price: 65000,
        cost_price: 52000,
        lowStock: 8,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=85',
        onHandMain: 55,
        onHandPos: 20,
      },
      {
        id: 'p_rt_dl_lumbar',
        type: 'PRODUCT',
        name: 'Gối lưng DoctorLoan',
        sku: 'DL-LUMBAR',
        barcode: '8938500010120',
        category: 'Gối & Ghế DoctorLoan',
        unit: 'cái',
        price: 2900000,
        cost_price: 1800000,
        lowStock: 5,
        trackInventory: true,
        image: './assets/products/optimized/back-f1.webp',
        onHandMain: 40,
        onHandPos: 15,
      },
      {
        id: 'p_rt_dl_meditation',
        type: 'PRODUCT',
        name: 'Đệm thiền DoctorLoan',
        sku: 'DL-MEDITATION',
        barcode: '8938500010130',
        category: 'Gối & Ghế DoctorLoan',
        unit: 'cái',
        price: 6000000,
        cost_price: 3800000,
        lowStock: 3,
        trackInventory: true,
        image: './assets/products/optimized/meditation-cushion.webp',
        onHandMain: 30,
        onHandPos: 12,
      },
      {
        id: 'p_rt_dl_f1',
        type: 'PRODUCT',
        name: 'Gối lưng sáng chế F1',
        sku: 'DL-F1',
        barcode: '8938500010110',
        category: 'Gối & Ghế DoctorLoan',
        unit: 'cái',
        price: 3500000,
        cost_price: 2200000,
        lowStock: 6,
        trackInventory: true,
        image: './assets/products/optimized/back-f1.webp',
        onHandMain: 55,
        onHandPos: 20,
      },
      {
        id: 'p_rt_dl_f3',
        type: 'PRODUCT',
        name: 'Gối lưng sáng chế F3/C',
        sku: 'DL-F3',
        barcode: '8938500010111',
        category: 'Gối & Ghế DoctorLoan',
        unit: 'cái',
        price: 3737000,
        cost_price: 2400000,
        lowStock: 6,
        trackInventory: true,
        image: './assets/products/optimized/back-f3.webp',
        onHandMain: 45,
        onHandPos: 18,
      },
      {
        id: 'p_rt_dl_f4',
        type: 'PRODUCT',
        name: 'Gối cổ sáng chế F4/09',
        sku: 'DL-F4',
        barcode: '8938500010113',
        category: 'Gối & Ghế DoctorLoan',
        unit: 'cái',
        price: 7624000,
        cost_price: 4900000,
        lowStock: 4,
        trackInventory: true,
        image: './assets/products/optimized/neck-f4.webp',
        onHandMain: 35,
        onHandPos: 15,
      },
      {
        id: 'p_rt_dl_f5',
        type: 'PRODUCT',
        name: 'Gối cổ sáng chế F5/S',
        sku: 'DL-F5',
        barcode: '8938500010114',
        category: 'Gối & Ghế DoctorLoan',
        unit: 'cái',
        price: 4312000,
        cost_price: 2800000,
        lowStock: 5,
        trackInventory: true,
        image: './assets/products/optimized/neck-f5.webp',
        onHandMain: 60,
        onHandPos: 25,
      },
      {
        id: 'p_rt_dl_f6',
        type: 'PRODUCT',
        name: 'Gối cổ sáng chế F6',
        sku: 'DL-F6',
        barcode: '8938500010112',
        category: 'Gối & Ghế DoctorLoan',
        unit: 'cái',
        price: 7049000,
        cost_price: 4500000,
        lowStock: 4,
        trackInventory: true,
        image: './assets/products/optimized/neck-f6.webp',
        onHandMain: 0, // Available 0 -> triggers Hết hàng! (Mẫu hết hàng #2)
        onHandPos: 0,
      },
      {
        id: 'p_rt_dl_n85_high',
        type: 'PRODUCT',
        name: 'Ghế N85 - chân cao',
        sku: 'N85-NAVY-H',
        barcode: '8938500010011',
        category: 'Ghế sáng chế nắn chỉnh',
        unit: 'chiếc',
        price: 2300000,
        cost_price: 1500000,
        lowStock: 5,
        trackInventory: true,
        image: './assets/products/optimized/chair-n85.webp',
        onHandMain: 40,
        onHandPos: 15,
      },
      {
        id: 'p_rt_dl_n85_low',
        type: 'PRODUCT',
        name: 'Ghế N85 - chân thấp',
        sku: 'N85-NAVY-L',
        barcode: '8938500010012',
        category: 'Ghế sáng chế nắn chỉnh',
        unit: 'chiếc',
        price: 2127000,
        cost_price: 1400000,
        lowStock: 5,
        trackInventory: true,
        image: './assets/products/optimized/chair-n85.webp',
        onHandMain: 35,
        onHandPos: 12,
      },
      {
        id: 'p_rt_dl_90d',
        type: 'PRODUCT',
        name: 'Ghế sáng chế 90D',
        sku: 'DL-90D',
        barcode: '8938500010201',
        category: 'Ghế sáng chế nắn chỉnh',
        unit: 'chiếc',
        price: 34937000,
        cost_price: 22000000,
        lowStock: 2,
        trackInventory: true,
        image: './assets/products/optimized/chair-90d.webp',
        onHandMain: 30,
        onHandPos: 12,
      },
      {
        id: 'p_rt_dl_90t',
        type: 'PRODUCT',
        name: 'Ghế sáng chế 90T',
        sku: 'DL-90T',
        barcode: '8938500010202',
        category: 'Ghế sáng chế nắn chỉnh',
        unit: 'chiếc',
        price: 34937000,
        cost_price: 22000000,
        lowStock: 2,
        trackInventory: true,
        image: './assets/products/optimized/chair-90t.webp',
        onHandMain: 28,
        onHandPos: 10,
      },
      {
        id: 'p_rt_dl_95',
        type: 'PRODUCT',
        name: 'Ghế sáng chế 95',
        sku: 'DL-95',
        barcode: '8938500010203',
        category: 'Ghế sáng chế nắn chỉnh',
        unit: 'chiếc',
        price: 39249000,
        cost_price: 25000000,
        lowStock: 2,
        trackInventory: true,
        image: './assets/products/optimized/chair-95.webp',
        onHandMain: 32,
        onHandPos: 12,
      },
      {
        id: 'p_rt_dl_135',
        type: 'PRODUCT',
        name: 'Ghế sáng chế 135',
        sku: 'DL-135',
        barcode: '8938500010204',
        category: 'Ghế sáng chế nắn chỉnh',
        unit: 'chiếc',
        price: 53762000,
        cost_price: 35000000,
        lowStock: 2,
        trackInventory: true,
        image: './assets/products/optimized/chair-135.webp',
        onHandMain: 35,
        onHandPos: 15,
      },
      {
        id: 'p_rt_dl_150',
        type: 'PRODUCT',
        name: 'Ghế sáng chế 150',
        sku: 'DL-150',
        barcode: '8938500010205',
        category: 'Ghế sáng chế nắn chỉnh',
        unit: 'chiếc',
        price: 53762000,
        cost_price: 35000000,
        lowStock: 1,
        trackInventory: true,
        image: './assets/products/optimized/chair-150.webp',
        onHandMain: 25,
        onHandPos: 10,
      },
      {
        id: 's_rt_dl_tu_van',
        type: 'SERVICE',
        name: 'Tư vấn tư thế & Cột sống',
        sku: 'DV-TUVAN',
        barcode: '',
        category: 'Dịch vụ tư vấn & Trị liệu',
        unit: 'buổi',
        price: 500000,
        cost_price: 0,
        lowStock: 0,
        trackInventory: false,
        image: './assets/products/optimized/chair-90d.webp',
      },
      {
        id: 's_rt_dl_massage_co',
        type: 'SERVICE',
        name: 'Massage trị liệu Cổ Vai Gáy',
        sku: 'DV-MASSAGE',
        barcode: '',
        category: 'Dịch vụ tư vấn & Trị liệu',
        unit: 'lần',
        price: 300000,
        cost_price: 0,
        lowStock: 0,
        trackInventory: false,
        image: './assets/products/optimized/neck-f4.webp',
      },
    ],
    customers: [
      { id: 'c_rt_walkin', name: 'Khách lẻ', phone: '', customer_type: 'retail', total_spent: 850000 },
      { id: 'c_rt_phuong', name: 'Chị Thu Phương', phone: '0903.111.222', customer_type: 'individual', total_spent: 2450000, note: 'Khách quen chung cư Royal City' },
      { id: 'c_rt_minh', name: 'Anh Hoàng Minh (VIP)', phone: '0912.888.999', customer_type: 'vip', default_discount: 5, total_spent: 12800000, note: 'Khách VIP mua hàng tuần' },
      { id: 'c_rt_anhduong', name: 'Cty TNHH Công Nghệ Ánh Dương', phone: '024.3999.8888', tax_id: '0107776666', customer_type: 'company', total_spent: 34500000, note: 'Đặt đồ uống & tạp phẩm pantry' },
    ],
    suppliers: [
      { id: 'sup_rt_masan', name: 'NPP Masan Consumer Hà Nội', phone: '0901.234.567', email: 'masan-hn@dist.vn', address: 'KCN Sài Đồng, Long Biên, Hà Nội' },
      { id: 'sup_rt_unilever', name: 'NPP Unilever Miền Bắc', phone: '0902.345.678', email: 'unilever-north@dist.vn', address: 'Kho logistic Yên Nghĩa, Hà Đông' },
      { id: 'sup_rt_thp', name: 'NPP Nước Giải Khát Tân Hiệp Phát', phone: '0903.456.789', email: 'thp-dist@dist.vn', address: 'Kho trung chuyển Mỹ Đình' },
      { id: 'sup_rt_dl_sx', name: 'Xưởng Sản Xuất DoctorLoan Việt Nam', phone: '028.3888.9999', email: 'factory@doctorloan.vn', address: 'Khu công nghệ cao TP.HCM' },
    ],
    aiSuggestions: [
      'Hàng nào sắp hết tồn cần nhập gấp?',
      'Tháng này doanh thu đạt bao nhiêu?',
      'Sản phẩm nào bán chạy nhất tuần qua?',
      'Còn bao nhiêu Gối lưng DoctorLoan?',
    ],
  },

  // =========================================================================
  // 2. FASHION / THỜI TRANG & PHỤ KIỆN
  // =========================================================================
  fashion: {
    key: 'fashion',
    name: 'Thời trang & Phụ kiện',
    shortName: 'Thời trang',
    icon: 'tag',
    color: '#ec4899',
    shop: {
      id: 'demo_shop_fashion',
      name: 'Mây Boutique — Thời trang Nữ & Phụ kiện',
      displayName: 'Mây Boutique',
      phone: '0918.234.567',
      hotline: '1800.8899',
      address: '45 Phố Huế, Hoàn Kiếm, Hà Nội',
      email: 'fashion-demo@qbiz.vn',
      website: 'https://mayboutique.qbiz.vn',
      tax_id: '0107666555',
      ownerName: 'Lê Hoàng Mai',
      receiptHeader: 'THỜI TRANG THIẾT KẾ & PHỤ KIỆN CAO CẤP',
      receiptFooter: 'Cảm ơn quý khách đã đồng hành cùng Mây Boutique!',
      receiptPolicy: 'Đổi hàng trong vòng 7 ngày kèm hóa đơn & tag nguyên vẹn.',
      bank_name: 'Vietcombank',
      bank_account_name: 'MAY BOUTIQUE VN',
      bank_account_number: '0011004455667',
      payment_qr: 'https://img.vietqr.io/image/VCB-0011004455667-compact2.png',
      created_at: dayAgo(90),
    },
    vocabulary: {
      product: 'Sản phẩm',
      category: 'Bộ sưu tập',
      warehouse: 'Kho / Showroom',
      receive: 'Nhập mẫu mới',
      sale: 'Bán hàng',
      stock: 'Tồn theo size',
      shift: 'Ca bán hàng',
    },
    warehouses: [
      { id: 'wh_fs_showroom', name: 'Showroom Trưng Bày Phố Huế' },
      { id: 'wh_fs_stock', name: 'Kho Hàng Tổng' },
    ],
    categories: [
      { id: 'cat_fs_dress', name: 'Váy đầm thiết kế', type: 'PRODUCT' },
      { id: 'cat_fs_top', name: 'Áo kiểu & Polo', type: 'PRODUCT' },
      { id: 'cat_fs_bottom', name: 'Quần jeans & âu', type: 'PRODUCT' },
      { id: 'cat_fs_acc', name: 'Túi xách & Phụ kiện', type: 'PRODUCT' },
    ],
    products: [
      {
        id: 'p_fs_dress_linen',
        type: 'PRODUCT',
        name: 'Váy Linen Dáng Xòe Cổ V',
        sku: 'VAY-LN-M',
        barcode: '893600220001',
        category: 'Váy đầm thiết kế',
        unit: 'chiếc',
        price: 450000,
        cost_price: 260000,
        lowStock: 5,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=600&q=85',
        variants: [
          { id: 'v_be_s', name: 'Be / S', onHand: 24 },
          { id: 'v_be_m', name: 'Be / M', onHand: 18 },
          { id: 'v_den_m', name: 'Đen / M (Hết hàng)', onHand: 0 },
        ],
        onHandMain: 30,
        onHandPos: 12,
      },
      {
        id: 'p_fs_polo_cvc',
        type: 'PRODUCT',
        name: 'Áo Polo Nam Cotton CVC Cao Cấp',
        sku: 'POLO-CVC',
        barcode: '893600220002',
        category: 'Áo kiểu & Polo',
        unit: 'chiếc',
        price: 289000,
        cost_price: 160000,
        lowStock: 8,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=600&q=85',
        variants: [
          { id: 'v_pol_w_m', name: 'Trắng / M', onHand: 25 },
          { id: 'v_pol_w_l', name: 'Trắng / L', onHand: 30 },
          { id: 'v_pol_n_m', name: 'Xanh Navy / M', onHand: 20 },
        ],
        onHandMain: 50,
        onHandPos: 25,
      },
      {
        id: 'p_fs_jean_flare',
        type: 'PRODUCT',
        name: 'Quần Jean Ống Loe Co Giãn 4 Chiều',
        sku: 'JEAN-LOE',
        barcode: '893600220003',
        category: 'Quần jeans & âu',
        unit: 'chiếc',
        price: 390000,
        cost_price: 220000,
        lowStock: 6,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=85',
        onHandMain: 40,
        onHandPos: 18,
      },
      {
        id: 'p_fs_blouse_silk',
        type: 'PRODUCT',
        name: 'Áo Sơ Mi Lụa Cổ Vest Nữ',
        sku: 'SOMI-LUA',
        barcode: '893600220004',
        category: 'Áo kiểu & Polo',
        unit: 'chiếc',
        price: 340000,
        cost_price: 190000,
        lowStock: 6,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1604176354204-9268737828e4?auto=format&fit=crop&w=600&q=85',
        onHandMain: 0, // Available 0 -> triggers Hết hàng! (Mẫu hết hàng #1 thời trang)
        onHandPos: 0,
      },
      {
        id: 'p_fs_bag_lock',
        type: 'PRODUCT',
        name: 'Túi Xách Da Khóa Kim Loại Nữ',
        sku: 'TUI-DA-BLK',
        barcode: '893600220005',
        category: 'Túi xách & Phụ kiện',
        unit: 'chiếc',
        price: 320000,
        cost_price: 180000,
        lowStock: 4,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=85',
        onHandMain: 28,
        onHandPos: 12,
      },
    ],
    customers: [
      { id: 'c_fs_walkin', name: 'Khách lẻ ghé shop', phone: '', customer_type: 'retail', total_spent: 740000 },
      { id: 'c_fs_maianh', name: 'Chị Mai Anh (VIP Kim Cương)', phone: '0988.123.456', customer_type: 'vip', default_discount: 10, total_spent: 18200000, note: 'Thích đầm linen và sơ mi lụa' },
      { id: 'c_fs_linhchi', name: 'Bạn Linh Chi', phone: '0977.654.321', customer_type: 'individual', total_spent: 3450000, note: 'Khách hàng thân thiết' },
      { id: 'c_fs_daily', name: 'Shop Mây Sài Gòn (Đại lý sỉ)', phone: '0909.555.666', customer_type: 'agent', total_spent: 45000000, note: 'Nhập sỉ định kỳ 2 tuần/lần' },
    ],
    suppliers: [
      { id: 'sup_fs_may', name: 'Xưởng May Thiết Kế May Boutique', phone: '0911.223.344', address: 'Làng Dệt Vạn Phúc, Hà Đông' },
      { id: 'sup_fs_anbinh', name: 'Xưởng Gia Công Túi Da An Bình', phone: '0933.445.566', address: 'Cụm Công Nghiệp Kiêu Kỵ, Gia Lâm' },
    ],
    aiSuggestions: [
      'Váy nào sắp hết size M?',
      'Mẫu thời trang nào bán chạy nhất tháng này?',
      'Biến thể nào đang hết hàng trong kho?',
    ],
  },

  // =========================================================================
  // 3. FOOD & BEVERAGE / ĂN UỐNG & CAFE
  // =========================================================================
  food_beverage: {
    key: 'food_beverage',
    name: 'Ăn uống / F&B',
    shortName: 'Ăn uống',
    icon: 'coffee',
    color: '#d97706',
    shop: {
      id: 'demo_shop_fnb',
      name: 'The Coffee Garden & Bakery',
      displayName: 'The Coffee Garden',
      phone: '0987.654.321',
      hotline: '024.3888.9999',
      address: '88 Tô Hiệu, Cầu Giấy, Hà Nội',
      email: 'fnb-demo@qbiz.vn',
      website: 'https://coffeegarden.qbiz.vn',
      tax_id: '0106555444',
      ownerName: 'Nguyễn Đức Hưng',
      receiptHeader: 'CÀ PHÊ NÔNG SẢN & BÁNH NƯỚNG TƯƠI MỖI NGÀY',
      receiptFooter: 'Cảm ơn quý khách! Chúc quý khách một ngày tràn đầy năng lượng.',
      receiptPolicy: 'Quý khách vui lòng kiểm tra món trước khi thanh toán.',
      bank_name: 'MBBank',
      bank_account_name: 'THE COFFEE GARDEN',
      bank_account_number: '08889998888',
      payment_qr: 'https://img.vietqr.io/image/MB-08889998888-compact2.png',
      created_at: dayAgo(90),
    },
    vocabulary: {
      product: 'Món ăn / Đồ uống',
      category: 'Menu món',
      warehouse: 'Quầy / Kho nguyên liệu',
      receive: 'Nhập nguyên liệu',
      sale: 'Bán hàng (Ca)',
      stock: 'Nguyên liệu',
      shift: 'Ca bán hàng',
    },
    warehouses: [
      { id: 'wh_fb_bar', name: 'Quầy Pha Chế & Thu Ngân' },
      { id: 'wh_fb_store', name: 'Kho Nguyên Liệu Pha Chế' },
    ],
    categories: [
      { id: 'cat_fb_coffee', name: 'Cà phê pha máy & truyền thống', type: 'PRODUCT' },
      { id: 'cat_fb_tea', name: 'Trà & Nước ép tươi', type: 'PRODUCT' },
      { id: 'cat_fb_milktea', name: 'Trà sữa Oolong', type: 'PRODUCT' },
      { id: 'cat_fb_bakery', name: 'Bánh ngọt & Croissant', type: 'PRODUCT' },
      { id: 'cat_fb_combo', name: 'Combo tiết kiệm', type: 'PRODUCT' },
    ],
    products: [
      {
        id: 'p_fb_cf_muoi',
        type: 'PRODUCT',
        name: 'Cà Phê Muối Kem Béo Đặc Biệt',
        sku: 'CF-MUOI',
        barcode: '893700330001',
        category: 'Cà phê pha máy & truyền thống',
        unit: 'ly',
        price: 35000,
        cost_price: 12000,
        lowStock: 20,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=85',
        onHandMain: 120,
        onHandPos: 50,
      },
      {
        id: 'p_fb_cf_suada',
        type: 'PRODUCT',
        name: 'Cà Phê Sữa Đá Sài Gòn',
        sku: 'CF-SUA-DA',
        barcode: '893700330002',
        category: 'Cà phê pha máy & truyền thống',
        unit: 'ly',
        price: 29000,
        cost_price: 9000,
        lowStock: 25,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=85',
        onHandMain: 140,
        onHandPos: 60,
      },
      {
        id: 'p_fb_tra_dao',
        type: 'PRODUCT',
        name: 'Trà Đào Cam Sả Tươi Mát Lạnh',
        sku: 'TRA-DAO-CS',
        barcode: '893700330003',
        category: 'Trà & Nước ép tươi',
        unit: 'ly',
        price: 42000,
        cost_price: 15000,
        lowStock: 15,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=85',
        onHandMain: 90,
        onHandPos: 35,
      },
      {
        id: 'p_fb_ts_oolong',
        type: 'PRODUCT',
        name: 'Trà Sữa Oolong Nướng Trân Châu',
        sku: 'TSON-TC',
        barcode: '893700330004',
        category: 'Trà sữa Oolong',
        unit: 'ly',
        price: 45000,
        cost_price: 16000,
        lowStock: 15,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&w=600&q=85',
        onHandMain: 80,
        onHandPos: 30,
      },
      {
        id: 'p_fb_croissant',
        type: 'PRODUCT',
        name: 'Bánh Croissant Bơ Tỏi Nướng',
        sku: 'BNH-CROISS',
        barcode: '893700330005',
        category: 'Bánh ngọt & Croissant',
        unit: 'cái',
        price: 38000,
        cost_price: 18000,
        lowStock: 8,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=85',
        onHandMain: 0, // Available 0 -> triggers Hết hàng! (Mẫu hết hàng #1 F&B)
        onHandPos: 0,
      },
      {
        id: 'p_fb_combo_sang',
        type: 'PRODUCT',
        name: 'Combo Sáng: Cà Phê + Croissant',
        sku: 'CB-SANG',
        barcode: '893700330006',
        category: 'Combo tiết kiệm',
        unit: 'combo',
        price: 59000,
        cost_price: 27000,
        lowStock: 5,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=85',
        onHandMain: 35,
        onHandPos: 15,
      },
      {
        id: 'p_fb_ep_cam',
        type: 'PRODUCT',
        name: 'Nước Ép Cam Tươi Nguyên Chất',
        sku: 'EP-CAM',
        barcode: '893700330007',
        category: 'Trà & Nước ép tươi',
        unit: 'ly',
        price: 45000,
        cost_price: 18000,
        lowStock: 10,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=85',
        onHandMain: 45,
        onHandPos: 20,
      },
    ],
    customers: [
      { id: 'c_fb_walkin', name: 'Khách uống tại quán', phone: '', customer_type: 'retail', total_spent: 420000 },
      { id: 'c_fb_tuananh', name: 'Anh Tuấn Anh (Khách quen)', phone: '0914.567.890', customer_type: 'individual', total_spent: 3200000, note: 'Uống CF muối mỗi sáng' },
      { id: 'c_fb_huong', name: 'Chị Thanh Hương (VP Công nghệ)', phone: '0936.789.012', customer_type: 'company', total_spent: 8900000, note: 'Thường đặt combo teabreak chiều' },
    ],
    suppliers: [
      { id: 'sup_fb_caudat', name: 'Cà Phê Nông Sản Cầu Đất Farm', phone: '0978.112.233', address: 'Đà Lạt, Lâm Đồng' },
      { id: 'sup_fb_nhathuong', name: 'Nguyên Liệu Pha Chế Tân Nhất Hương', phone: '0982.334.455', address: 'Kho Cầu Giấy, Hà Nội' },
    ],
    aiSuggestions: [
      'Món nào bán chạy nhất hôm nay?',
      'Doanh thu ca sáng đạt bao nhiêu?',
      'Món nào ít bán cần đẩy mạnh khuyến mãi?',
    ],
  },

  // =========================================================================
  // 4. SERVICE / DỊCH VỤ & SPA TRỊ LIỆU
  // =========================================================================
  service: {
    key: 'service',
    name: 'Dịch vụ / Spa trị liệu',
    shortName: 'Dịch vụ',
    icon: 'sparkles',
    color: '#8b5cf6',
    shop: {
      id: 'demo_shop_service',
      name: 'Sen Spa & Chăm sóc Trị liệu',
      displayName: 'Sen Spa & Trị liệu',
      phone: '0933.888.999',
      hotline: '1900.9999',
      address: '16 Thảo Điền, TP. Thủ Đức, TP.HCM',
      email: 'spa-demo@qbiz.vn',
      website: 'https://senspa.qbiz.vn',
      tax_id: '0316888777',
      ownerName: 'Đặng Thanh Nga',
      receiptHeader: 'DƯỠNG SINH ĐÔNG Y & THẨM MỸ TRỊ LIỆU CHUYÊN SÂU',
      receiptFooter: 'Sen Spa chúc quý khách luôn an nhiên và rạng rỡ!',
      receiptPolicy: 'Vui lòng đến trước 10 phút. Hỗ trợ dời lịch hẹn trước 4 giờ.',
      bank_name: 'ACB',
      bank_account_name: 'SEN SPA VIETNAM',
      bank_account_number: '24681012',
      payment_qr: 'https://img.vietqr.io/image/ACB-24681012-compact2.png',
      created_at: dayAgo(90),
    },
    vocabulary: {
      product: 'Dịch vụ',
      category: 'Nhóm dịch vụ',
      warehouse: 'Phòng / Tủ vật tư',
      receive: 'Nhập vật tư',
      sale: 'Thanh toán dịch vụ',
      stock: 'Vật tư tiêu hao',
      shift: 'Ca làm việc kỹ thuật viên',
    },
    warehouses: [
      { id: 'wh_sv_center', name: 'Phòng Trị Liệu & Lễ Tân' },
      { id: 'wh_sv_supplies', name: 'Tủ Vật Tư Chăm Sóc' },
    ],
    categories: [
      { id: 'cat_sv_covaigay', name: 'Trị liệu cổ vai gáy', type: 'SERVICE' },
      { id: 'cat_sv_facial', name: 'Chăm sóc da mặt chuyên sâu', type: 'SERVICE' },
      { id: 'cat_sv_hair', name: 'Gội đầu dưỡng sinh', type: 'SERVICE' },
      { id: 'cat_sv_body', name: 'Massage body đá nóng', type: 'SERVICE' },
      { id: 'cat_sv_combo', name: 'Combo thư giãn hoàng gia', type: 'SERVICE' },
      { id: 'cat_sv_retail', name: 'Tinh dầu & Vật tư kèm liệu trình', type: 'PRODUCT' },
    ],
    products: [
      {
        id: 's_sv_covaigay',
        type: 'SERVICE',
        name: 'Massage Trị Liệu Cổ Vai Gáy (45 phút)',
        sku: 'SVC-COVAIGAY',
        category: 'Trị liệu cổ vai gáy',
        unit: 'lần',
        price: 250000,
        cost_price: 60000,
        trackInventory: false,
        durationMinutes: 45,
        description: 'Bấm huyệt đả thông kinh lạc vùng cổ vai gáy, giảm đau nhức tức thì cho người ngồi văn phòng.',
        image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=600&q=85',
      },
      {
        id: 's_sv_facial',
        type: 'SERVICE',
        name: 'Chăm Sóc Da Mặt Chuyên Sâu Cấp Ẩm (60 phút)',
        sku: 'SVC-FACIAL',
        category: 'Chăm sóc da mặt chuyên sâu',
        unit: 'buổi',
        price: 450000,
        cost_price: 90000,
        trackInventory: false,
        durationMinutes: 60,
        description: 'Điện di tinh chất HA cấp ẩm sâu, đắp mặt nạ ngọc trai phục hồi da căng bóng.',
        image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=600&q=85',
      },
      {
        id: 's_sv_goidau',
        type: 'SERVICE',
        name: 'Gội Đầu Dưỡng Sinh Thảo Dược Đông Y (50 phút)',
        sku: 'SVC-GOIDAU',
        category: 'Gội đầu dưỡng sinh',
        unit: 'buổi',
        price: 180000,
        cost_price: 40000,
        trackInventory: false,
        durationMinutes: 50,
        description: 'Gội nước thảo mộc bồ kết ấm, massage ấn huyệt da đầu giải tỏa stress mất ngủ.',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=85',
      },
      {
        id: 's_sv_danong',
        type: 'SERVICE',
        name: 'Massage Body Đá Nóng Himalaya (75 phút)',
        sku: 'SVC-BODY-HOT',
        category: 'Massage body đá nóng',
        unit: 'lần',
        price: 520000,
        cost_price: 110000,
        trackInventory: false,
        durationMinutes: 75,
        description: 'Trị liệu đá muối khoáng Himalaya ấm, giãn cơ toàn thân, tăng cường tuần hoàn máu.',
        image: 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=600&q=85',
      },
      {
        id: 's_sv_combo_royal',
        type: 'SERVICE',
        name: 'Combo Hoàng Gia: Body Đá Nóng + Chăm Sóc Mặt (90 phút)',
        sku: 'SVC-ROYAL',
        category: 'Combo thư giãn hoàng gia',
        unit: 'combo',
        price: 690000,
        cost_price: 150000,
        trackInventory: false,
        durationMinutes: 90,
        description: 'Gói liệu trình cao cấp nhất: Chăm sóc toàn diện cơ thể và phục hồi làn da tươi trẻ.',
        image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=85',
      },
      {
        id: 'p_sv_lavender_oil',
        type: 'PRODUCT',
        name: 'Tinh Dầu Massage Oải Hương Lavender 100ml',
        sku: 'VT-LAVENDER',
        barcode: '893800440001',
        category: 'Tinh dầu & Vật tư kèm liệu trình',
        unit: 'chai',
        price: 180000,
        cost_price: 95000,
        lowStock: 5,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=600&q=85',
        onHandMain: 45,
        onHandPos: 20,
      },
      {
        id: 'p_sv_da_muoi',
        type: 'PRODUCT',
        name: 'Đá Muối Khoáng Himalaya Trị Liệu (Hộp 4 viên)',
        sku: 'VT-DAMUOI',
        barcode: '893800440002',
        category: 'Tinh dầu & Vật tư kèm liệu trình',
        unit: 'hộp',
        price: 260000,
        cost_price: 130000,
        lowStock: 5,
        trackInventory: true,
        image: 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=600&q=85',
        onHandMain: 0, // Available 0 -> triggers Hết hàng! (Mẫu hết hàng #1 Service)
        onHandPos: 0,
      },
    ],
    customers: [
      { id: 'c_sv_walkin', name: 'Khách vãng lai', phone: '', customer_type: 'retail', total_spent: 250000 },
      { id: 'c_sv_ngochan', name: 'Chị Ngọc Hân (VIP Hội Viên)', phone: '0908.777.666', customer_type: 'vip', default_discount: 10, total_spent: 15600000, note: 'Gói 10 buổi dưỡng sinh & body đá nóng' },
      { id: 'c_sv_thuthao', name: 'Chị Thu Thảo', phone: '0938.999.111', customer_type: 'individual', total_spent: 4800000, note: 'Hẹn chăm sóc da mặt thứ 6 hàng tuần' },
    ],
    suppliers: [
      { id: 'sup_sv_moctra', name: 'Tinh Dầu & Dược Liệu Thiên Nhiên Mộc Trà', phone: '0938.112.334', address: 'Quận 1, TP.HCM' },
    ],
    aiSuggestions: [
      'Dịch vụ nào có doanh thu cao nhất tháng này?',
      'Khách hàng nào chi tiêu nhiều nhất?',
      'Liệu trình nào được khách đặt lịch nhiều nhất?',
    ],
  },
});

/**
 * Generate 30-day realistic transactions for an industry
 */
function buildIndustryOperationalHistory(indKey) {
  const ind = DEMO_INDUSTRIES[indKey] || DEMO_INDUSTRIES.retail;
  const prods = ind.products;
  const whs = ind.warehouses;
  const custs = ind.customers;

  const sales = [];
  const orders = [];
  const movements = [];
  const shifts = [];
  const purchaseReceipts = [];
  const returns = [];
  const refunds = [];

  // 1. Initial Opening Movements
  prods.forEach(p => {
    if (p.type === 'SERVICE') return;
    const qMain = Number(p.onHandMain || 0);
    const qPos = Number(p.onHandPos || 0);
    if (qMain > 0) {
      movements.push({
        id: `mv_open_${p.id}_main`,
        productId: p.id,
        warehouseId: whs[0].id,
        type: 'OPENING',
        qty: qMain,
        reason: 'Tồn đầu kỳ hệ thống demo',
        createdAt: dayAgo(30),
        after: { onHand: qMain, reserved: 0, damaged: 0 },
      });
    }
    if (qPos > 0 && whs[1]) {
      movements.push({
        id: `mv_open_${p.id}_pos`,
        productId: p.id,
        warehouseId: whs[1].id,
        type: 'OPENING',
        qty: qPos,
        reason: 'Tồn quầy bán hàng demo',
        createdAt: dayAgo(30),
        after: { onHand: qPos, reserved: 0, damaged: 0 },
      });
    }
  });

  // 2. 30-Day Sales Distribution
  // Target: Today ~3-4 sales, Last 7d ~10-15 sales, Last 30d ~25-35 sales
  const saleSpecs = [
    // Today
    { daysAgo: 0, hoursAgo: 2, pIdx: 0, qty: 2, pay: 'cash', cust: custs[0] },
    { daysAgo: 0, hoursAgo: 4, pIdx: 1 % prods.length, qty: 1, pay: 'qr', cust: custs[1] || custs[0] },
    { daysAgo: 0, hoursAgo: 6, pIdx: 2 % prods.length, qty: 1, pay: 'transfer', cust: custs[2] || custs[0] },
    // Yesterday & Last 7 Days
    { daysAgo: 1, hoursAgo: 3, pIdx: 0, qty: 3, pay: 'cash', cust: custs[0] },
    { daysAgo: 1, hoursAgo: 7, pIdx: 3 % prods.length, qty: 1, pay: 'transfer', cust: custs[1] || custs[0] },
    { daysAgo: 2, hoursAgo: 2, pIdx: 1 % prods.length, qty: 2, pay: 'qr', cust: custs[2] || custs[0] },
    { daysAgo: 3, hoursAgo: 5, pIdx: 0, qty: 4, pay: 'cash', cust: custs[0] },
    { daysAgo: 4, hoursAgo: 1, pIdx: 4 % prods.length, qty: 1, pay: 'qr', cust: custs[1] || custs[0] },
    { daysAgo: 5, hoursAgo: 4, pIdx: 2 % prods.length, qty: 2, pay: 'cash', cust: custs[0] },
    { daysAgo: 6, hoursAgo: 6, pIdx: 1 % prods.length, qty: 3, pay: 'transfer', cust: custs[3] || custs[0] },
    // Past 8-29 Days
    { daysAgo: 8, hoursAgo: 2, pIdx: 0, qty: 2, pay: 'cash', cust: custs[0] },
    { daysAgo: 10, hoursAgo: 4, pIdx: 3 % prods.length, qty: 2, pay: 'transfer', cust: custs[1] || custs[0] },
    { daysAgo: 12, hoursAgo: 3, pIdx: 1 % prods.length, qty: 5, pay: 'qr', cust: custs[0] },
    { daysAgo: 15, hoursAgo: 5, pIdx: 4 % prods.length, qty: 1, pay: 'cash', cust: custs[2] || custs[0] },
    { daysAgo: 18, hoursAgo: 2, pIdx: 0, qty: 3, pay: 'transfer', cust: custs[0] },
    { daysAgo: 21, hoursAgo: 4, pIdx: 2 % prods.length, qty: 2, pay: 'cash', cust: custs[1] || custs[0] },
    { daysAgo: 24, hoursAgo: 6, pIdx: 1 % prods.length, qty: 4, pay: 'qr', cust: custs[0] },
    { daysAgo: 27, hoursAgo: 1, pIdx: 0, qty: 2, pay: 'cash', cust: custs[3] || custs[0] },
  ];

  saleSpecs.forEach((spec, idx) => {
    const p = prods[spec.pIdx];
    const qty = spec.qty;
    const unitPrice = Number(p.price || 0);
    const lineTotal = unitPrice * qty;
    const stamp = dayAgo(spec.daysAgo, spec.hoursAgo);
    const saleId = `sale_demo_${indKey}_${idx + 1}`;
    const code = `HD-${String(idx + 1).padStart(4, '0')}`;

    // Industry-specific item metadata
    let variantName = '';
    let durationText = '';
    if (indKey === 'fashion') {
      const vNames = ['Be / M', 'Trắng / L', 'Xanh Navy / M', 'Đen / S'];
      variantName = vNames[idx % vNames.length];
    } else if (indKey === 'service') {
      durationText = p.durationMinutes ? `${p.durationMinutes} phút` : '';
    }

    // Customer discount calculation (e.g. VIP discount)
    const discountRate = (spec.cust?.customer_type === 'vip' && spec.cust?.default_discount)
      ? (Number(spec.cust.default_discount) / 100)
      : 0;
    const discountTotal = Math.round(lineTotal * discountRate);
    const grandTotal = Math.max(0, lineTotal - discountTotal);

    // Realistic cash tendered and change calculation
    const cashReceived = spec.pay === 'cash' ? (grandTotal > 50000 ? Math.ceil(grandTotal / 50000) * 50000 : 100000) : grandTotal;
    const changeAmount = spec.pay === 'cash' ? Math.max(0, cashReceived - grandTotal) : 0;

    const saleRecord = {
      id: saleId,
      sale_uuid: saleId,
      code,
      customer_label: spec.cust?.name || 'Khách lẻ',
      customer_id: spec.cust?.id || '',
      customer_phone: spec.cust?.phone || '',
      customer_address: spec.cust?.address || '',
      cashier_name: 'Thu ngân 01',
      register_name: 'POS-01',
      shift_code: 'CA-01',
      warehouse_id: whs[1]?.id || whs[0].id,
      subtotal: lineTotal,
      discount_total: discountTotal,
      tax_total: 0,
      grand_total: grandTotal,
      total: grandTotal,
      status: 'COMPLETED',
      payment_method: spec.pay,
      payment_status: 'PAID',
      payments: [{ method: spec.pay, amount: grandTotal, status: 'PAID' }],
      cash_received: cashReceived,
      change: changeAmount,
      items: [
        {
          item_id: p.id,
          name: p.name,
          sku: p.sku || '',
          barcode: p.barcode || '',
          variant: variantName,
          variant_name: variantName,
          duration: durationText,
          quantity: qty,
          unit_price: unitPrice,
          cost_price: Number(p.cost_price || 0),
          cost_total: Number(p.cost_price || 0) * qty,
          discount: discountTotal,
          line_total: grandTotal,
        }
      ],
      note: ind.shop.receiptPolicy || '',
      created_at: stamp,
      createdAt: stamp,
      updated_at: stamp,
    };
    sales.push(saleRecord);

    if (p.type !== 'SERVICE') {
      movements.push({
        id: `mv_sale_${saleId}`,
        productId: p.id,
        warehouseId: whs[1]?.id || whs[0].id,
        type: 'sale',
        qty: -qty,
        reason: `Bán lẻ ${code}`,
        reference: code,
        reference_type: 'sale',
        reference_id: saleId,
        createdAt: stamp,
      });
    }
  });

  // 3. Orders: 1 Completed, 1 Confirmed/Processing
  const ordP1 = prods[0];
  const ordP2 = prods[1 % prods.length];
  orders.push({
    id: `ord_${indKey}_101`,
    code: `DH-101`,
    order_uuid: `ord_${indKey}_101`,
    customer_label: custs[1]?.name || 'Khách đặt online',
    customer_id: custs[1]?.id || '',
    warehouse_id: whs[0].id,
    subtotal: ordP1.price * 2,
    discount_total: 0,
    tax_total: 0,
    grand_total: ordP1.price * 2,
    status: 'COMPLETED',
    payment_status: 'PAID',
    payment_method: 'transfer',
    items: [
      {
        item_id: ordP1.id,
        name: ordP1.name,
        quantity: 2,
        unit_price: ordP1.price,
        cost_price: Number(ordP1.cost_price || 0),
        cost_total: Number(ordP1.cost_price || 0) * 2,
        line_total: ordP1.price * 2
      }
    ],
    created_at: dayAgo(2, 4),
    updated_at: dayAgo(2, 2),
  });

  orders.push({
    id: `ord_${indKey}_102`,
    code: `DH-102`,
    order_uuid: `ord_${indKey}_102`,
    customer_label: custs[2]?.name || 'Khách đặt giao hàng',
    customer_id: custs[2]?.id || '',
    warehouse_id: whs[0].id,
    subtotal: ordP2.price * 3,
    discount_total: 0,
    tax_total: 0,
    grand_total: ordP2.price * 3,
    status: 'CONFIRMED',
    payment_status: 'PENDING',
    payment_method: 'qr',
    items: [
      {
        item_id: ordP2.id,
        name: ordP2.name,
        quantity: 3,
        unit_price: ordP2.price,
        cost_price: Number(ordP2.cost_price || 0),
        cost_total: Number(ordP2.cost_price || 0) * 3,
        line_total: ordP2.price * 3
      }
    ],
    created_at: dayAgo(0, 1),
    updated_at: dayAgo(0, 1),
  });

  // 4. Shifts: 1 OPEN (Today), 2 CLOSED (Past)
  shifts.push({
    id: `shift_${indKey}_open`,
    shift_id: `shift_${indKey}_open`,
    status: 'OPEN',
    device_id: 'dev_demo_pc',
    register_id: 'reg_pos_01',
    opened_at: dayAgo(0, 7),
    opening_cash: 1000000,
    expected_cash: 1000000 + 30000,
    counted_cash: null,
    difference: 0,
    summary: {
      sales_count: 3,
      sales_total: 285000,
      cash_sales: 30000,
      transfer_sales: 255000,
      qr_sales: 0,
      refund_total: 0,
      cash_refunds: 0,
    },
    version: 1,
    created_at: dayAgo(0, 7),
  });

  shifts.push({
    id: `shift_${indKey}_closed_1`,
    shift_id: `shift_${indKey}_closed_1`,
    status: 'CLOSED',
    device_id: 'dev_demo_pc',
    register_id: 'reg_pos_01',
    opened_at: dayAgo(1, 14),
    closed_at: dayAgo(1, 6),
    opening_cash: 1000000,
    expected_cash: 1540000,
    counted_cash: 1540000,
    difference: 0,
    summary: {
      sales_count: 8,
      sales_total: 920000,
      cash_sales: 540000,
      transfer_sales: 380000,
      qr_sales: 0,
      refund_total: 0,
      cash_refunds: 0,
    },
    version: 2,
    created_at: dayAgo(1, 14),
    updated_at: dayAgo(1, 6),
  });

  // 5. Purchase receipts (for merchandise industries)
  if (indKey !== 'service' && ind.suppliers.length > 0) {
    purchaseReceipts.push({
      id: `pr_${indKey}_01`,
      code: `PN-001`,
      supplier_id: ind.suppliers[0].id,
      supplier_name: ind.suppliers[0].name,
      warehouse_id: whs[0].id,
      total: 3500000,
      status: 'COMPLETED',
      created_at: dayAgo(14),
      updated_at: dayAgo(14),
    });
  }

  // 6. Returns / Refunds: 1 realistic sample
  const retSale = sales[sales.length - 2];
  if (retSale) {
    returns.push({
      id: `ret_${indKey}_01`,
      sale_id: retSale.id,
      reason: 'Khách đổi ý theo chính sách',
      total: 50000,
      created_at: dayAgo(3),
    });
    refunds.push({
      id: `ref_${indKey}_01`,
      sale_id: retSale.id,
      shift_id: shifts[1].id,
      amount: 50000,
      method: 'cash',
      created_at: dayAgo(3),
    });
  }

  return { sales, orders, movements, shifts, purchaseReceipts, returns, refunds };
}

/**
 * Load and Activate an Industry Showroom into IndexedDB
 * @param {string} industryKey - retail | fashion | food_beverage | service
 * @param {string} role - OWNER | MANAGER | CASHIER | WAREHOUSE
 */
export async function loadDemoIndustry(industryKey = 'retail', role = ROLES.OWNER) {
  const normKey = industryKey === 'fnb' ? 'food_beverage' : industryKey;
  const ind = DEMO_INDUSTRIES[normKey] || DEMO_INDUSTRIES.retail;

  // 1. Wipe previous local sandbox completely
  await clearAll();

  // 2. Build Inventory Levels
  const levels = [];
  const nowStamp = new Date().toISOString();
  ind.products.forEach(p => {
    if (p.type === 'SERVICE') return;
    const qMain = Number(p.onHandMain || 0);
    const qPos = Number(p.onHandPos || 0);
    levels.push({
      id: `${p.id}:${ind.warehouses[0].id}`,
      productId: p.id,
      warehouseId: ind.warehouses[0].id,
      onHand: qMain,
      reserved: 0,
      damaged: 0,
      version: 1,
      updatedAt: nowStamp,
    });
    if (ind.warehouses[1]) {
      levels.push({
        id: `${p.id}:${ind.warehouses[1].id}`,
        productId: p.id,
        warehouseId: ind.warehouses[1].id,
        onHand: qPos,
        reserved: 0,
        damaged: 0,
        version: 1,
        updatedAt: nowStamp,
      });
    }
  });

  // 3. Build 30-Day Operational History
  const history = buildIndustryOperationalHistory(ind.key);

  // 4. Populate IndexedDB Stores
  await putMany('warehouses', ind.warehouses);
  await putMany('categories', ind.categories);
  await putMany('products', ind.products.map(p => ({
    ...p,
    priceNote: p.priceNote || '',
    description: p.description || '',
    active: true,
  })));
  await putMany('levels', levels);
  await putMany('customers', ind.customers.map(c => ({
    ...c,
    active: true,
    created_at: dayAgo(60),
    updated_at: dayAgo(2),
  })));
  if (ind.suppliers.length) {
    await putMany('suppliers', ind.suppliers.map(s => ({
      ...s,
      status: 'active',
      created_at: dayAgo(60),
      updated_at: dayAgo(10),
    })));
  }

  await putMany('sales', history.sales);
  await putMany('orders', history.orders);
  await putMany('movements', history.movements);
  await putMany('shifts', history.shifts);
  if (history.purchaseReceipts.length) await putMany('purchase_receipts', history.purchaseReceipts);
  if (history.returns.length) await putMany('returns', history.returns);
  if (history.refunds.length) await putMany('refunds', history.refunds);

  // Default demo printer templates (K80, K58, Label 50x30, A4)
  const printTemplates = [
    {
      id: `tpl_demo_${ind.key}_80`,
      name: `Mẫu in nhiệt hóa đơn K80 (${ind.shortName} Demo)`,
      type: 'receipt',
      default: true,
      paper: 'RECEIPT_80',
      paper_size: 'K80',
      font_size: 12,
      line_spacing: 1.3,
      orientation: 'portrait',
      copies: 1,
      header: ind.shop.receiptHeader || '',
      footer: ind.shop.receiptFooter || 'Cảm ơn quý khách! Hẹn gặp lại.',
      logo: true,
      logo_size: 36,
      fields: [
        'shop_logo', 'shop_name', 'shop_phone', 'shop_address', 'shop_website', 'shop_tax',
        'document_code', 'document_date', 'employee', 'register', 'customer', 'customer_phone',
        'item_sku', 'quantity', 'unit_price', 'discount', 'line_total',
        'subtotal', 'tax', 'shipping', 'total', 'cash_received', 'change', 'payment', 'note', 'footer'
      ],
      created_at: dayAgo(30),
    },
    {
      id: `tpl_demo_${ind.key}_58`,
      name: `Mẫu in nhiệt hóa đơn K58 (${ind.shortName} Demo)`,
      type: 'receipt',
      default: false,
      paper: 'RECEIPT_58',
      paper_size: 'K58',
      font_size: 11,
      line_spacing: 1.2,
      orientation: 'portrait',
      copies: 1,
      header: ind.shop.receiptHeader || '',
      footer: ind.shop.receiptFooter || 'Cảm ơn quý khách! Hẹn gặp lại.',
      logo: true,
      logo_size: 28,
      fields: [
        'shop_logo', 'shop_name', 'shop_phone', 'shop_address',
        'document_code', 'document_date', 'customer',
        'item_sku', 'quantity', 'unit_price', 'line_total',
        'subtotal', 'total', 'payment', 'note', 'footer'
      ],
      created_at: dayAgo(30),
    },
    {
      id: `tpl_demo_${ind.key}_label`,
      name: `Mẫu in tem mã vạch 50x30 (${ind.shortName} Demo)`,
      type: 'label',
      default: true,
      paper: 'LABEL_50x30',
      paper_size: '50x30',
      font_size: 10,
      line_spacing: 1.1,
      orientation: 'portrait',
      copies: 1,
      logo: false,
      fields: ['shop_name', 'item_sku', 'item_barcode', 'unit_price'],
      created_at: dayAgo(30),
    },
    {
      id: `tpl_demo_${ind.key}_a4`,
      name: `Phiếu xuất kho A4 (${ind.shortName} Demo)`,
      type: 'issue',
      default: true,
      paper: 'A4',
      paper_size: 'A4',
      font_size: 12,
      line_spacing: 1.3,
      orientation: 'portrait',
      copies: 1,
      header: ind.shop.receiptHeader || '',
      footer: ind.shop.receiptFooter || 'Cảm ơn quý khách! Hẹn gặp lại.',
      logo: true,
      logo_size: 40,
      fields: [
        'shop_logo', 'shop_name', 'shop_phone', 'shop_address', 'shop_tax',
        'document_code', 'document_date', 'customer', 'customer_phone', 'customer_address',
        'item_sku', 'quantity', 'unit_price', 'line_total',
        'subtotal', 'total', 'payment', 'note', 'footer'
      ],
      created_at: dayAgo(30),
    }
  ];
  await putMany('print_templates', printTemplates);

  // Full Demo Business Profile populated in settings
  const businessProfileValue = {
    profile_id: ind.key === 'food_beverage' ? 'fnb' : ind.key,
    store_name: ind.shop.name,
    display_name: ind.shop.displayName || ind.shop.name,
    logo: makeSvgShopLogo(ind.key),
    phone: ind.shop.phone,
    hotline: ind.shop.hotline || ind.shop.phone,
    email: ind.shop.email,
    address: ind.shop.address,
    website: ind.shop.website,
    tax_code: ind.shop.tax_id,
    note: ind.shop.receiptPolicy || ind.shop.receiptFooter || 'Cảm ơn quý khách! Hẹn gặp lại quý khách.',
    pickup_address: ind.shop.address,
    return_address: ind.shop.address,
    default_warehouse_id: ind.warehouses[0]?.id || '',
    contact_name: ind.shop.ownerName || 'Quản lý cửa hàng',
    contact_phone: ind.shop.phone,
    bank_name: ind.shop.bank_name || 'Techcombank',
    bank_account_name: ind.shop.bank_account_name || ind.shop.name.toUpperCase(),
    bank_account_number: ind.shop.bank_account_number || '1903668899001',
    payment_qr: ind.shop.payment_qr || '',
    return_policy: ind.shop.receiptPolicy || '',
  };

  const initialSettings = [
    { id: 'business_profile', value: businessProfileValue, updated_at: dayAgo(30) },
    { id: 'sales_preferences', value: { allow_negative: false, auto_barcode: true, default_print: true }, updated_at: dayAgo(30) },
    { id: 'device_id', value: 'dev_demo_pc', updated_at: dayAgo(30) },
    { id: 'register_id', value: 'reg_pos_01', updated_at: dayAgo(30) },
    { id: 'active_user_name', value: 'Thu ngân 01', updated_at: dayAgo(30) },
  ];
  await putMany('settings', initialSettings);

  // Seed sample completed print job for the first completed sale
  if (history.sales.length > 0) {
    const demoPrintJob = {
      id: `job_demo_${ind.key}_01`,
      print_job_id: `job_demo_${ind.key}_01`,
      document_type: 'receipt',
      document_id: history.sales[0].id,
      template_id: `tpl_demo_${ind.key}_80`,
      printer: 'Máy in nhiệt K80 (Demo)',
      user: 'Thu ngân 01',
      created_at: history.sales[0].created_at,
      copies: 1,
      status: 'COMPLETED',
      error: '',
      reprint: false,
      reprint_reason: '',
    };
    await putMany('print_jobs', [demoPrintJob]);
  }

  // Demo device & register
  const device = {
    id: 'dev_demo_pc',
    device_name: 'Thiết bị Demo QBiz Kho',
    device_type: 'BROWSER',
    status: 'ACTIVE',
    created_at: dayAgo(30),
  };
  const register = {
    id: 'reg_pos_01',
    name: 'Quầy Bán Hàng 01 (Demo)',
    code: 'POS-01',
    status: 'ACTIVE',
    device_id: 'dev_demo_pc',
    created_at: dayAgo(30),
  };
  await putMany('devices', [device]);
  await putMany('registers', [register]);

  // Store Demo State in Session Storage
  sessionStorage.setItem('qbiz_preview_demo', '1');
  sessionStorage.setItem('qbiz_demo_industry', ind.key);
  sessionStorage.setItem('qbiz_demo_role', role);
  sessionStorage.setItem('qbiz_demo_shop', JSON.stringify(ind.shop));

  // Sync Business Profile Engine
  const profileId = ind.key === 'food_beverage' ? 'fnb' : ind.key;
  try {
    await switchBusinessProfile(profileId);
  } catch (err) {
    console.warn('Switch business profile notice:', err);
  }

  if (typeof window !== 'undefined' && window.__qbiz_app__?.ai?.switchActor) {
    try { window.__qbiz_app__.ai.switchActor(role.toLowerCase()); } catch (_) {}
  }

  return { industry: ind, role };
}

/**
 * Switch Active Demo Role
 * @param {string} newRole - OWNER | MANAGER | CASHIER | WAREHOUSE
 */
export function switchDemoRole(newRole) {
  const normalized = String(newRole).toUpperCase();
  if (!DEMO_ROLES[normalized]) {
    throw new Error(`Vai trò không hợp lệ: ${newRole}`);
  }
  sessionStorage.setItem('qbiz_demo_role', normalized);
  if (typeof window !== 'undefined' && window.__qbiz_app__?.ai?.switchActor) {
    try { window.__qbiz_app__.ai.switchActor(normalized.toLowerCase()); } catch (_) {}
  }
  return DEMO_ROLES[normalized];
}

/**
 * Reset Demo to Pristine State
 */
export async function resetDemo() {
  const currentInd = getActiveDemoIndustryKey();
  const currentRole = getActiveDemoRole();
  return loadDemoIndustry(currentInd, currentRole);
}

/**
 * Get Active Demo Industry Key
 */
export function getActiveDemoIndustryKey() {
  return sessionStorage.getItem('qbiz_demo_industry') || 'retail';
}

/**
 * Get Active Demo Industry Metadata
 */
export function getActiveDemoIndustry() {
  const k = getActiveDemoIndustryKey();
  return DEMO_INDUSTRIES[k] || DEMO_INDUSTRIES.retail;
}

/**
 * Get Active Demo Role
 */
export function getActiveDemoRole() {
  return sessionStorage.getItem('qbiz_demo_role') || ROLES.OWNER;
}

/**
 * Check if demo mode is currently active
 */
export function isDemoMode() {
  return sessionStorage.getItem('qbiz_preview_demo') === '1';
}

/**
 * Get AI prompt suggestions tailored for the active industry
 */
export function getDemoAiSuggestions(industryKey = null) {
  const k = industryKey || getActiveDemoIndustryKey();
  const ind = DEMO_INDUSTRIES[k] || DEMO_INDUSTRIES.retail;
  return ind.aiSuggestions || [];
}

/**
 * Get simulated demo receipt preview content
 */
export function getDemoReceiptPreview(industryKey = null, paper = 'RECEIPT_80') {
  const k = industryKey || getActiveDemoIndustryKey();
  const ind = DEMO_INDUSTRIES[k] || DEMO_INDUSTRIES.retail;
  const sampleItems = ind.products.slice(0, 3).map((p, idx) => {
    let variant = '';
    let duration = '';
    if (k === 'fashion') {
      variant = idx === 0 ? 'Be / M' : idx === 1 ? 'Trắng / L' : 'Đen / S';
    } else if (k === 'service') {
      duration = p.durationMinutes ? `${p.durationMinutes} phút` : '';
    }
    const qty = idx === 0 ? 2 : 1;
    return {
      name: p.name,
      sku: p.sku || '',
      barcode: p.barcode || '',
      variant,
      duration,
      qty,
      price: p.price,
      total: p.price * qty,
    };
  });
  const subtotal = sampleItems.reduce((s, it) => s + it.total, 0);
  const discount = k === 'fashion' ? 45000 : 0;
  const total = Math.max(0, subtotal - discount);
  const tendered = Math.ceil(total / 50000) * 50000;
  const change = Math.max(0, tendered - total);

  return {
    industryKey: k,
    industryName: ind.name,
    paper: paper,
    shopName: ind.shop.name,
    displayName: ind.shop.displayName || ind.shop.name,
    logo: makeSvgShopLogo(k),
    address: ind.shop.address,
    phone: ind.shop.phone,
    hotline: ind.shop.hotline || ind.shop.phone,
    website: ind.shop.website,
    taxCode: ind.shop.tax_id,
    title: 'HÓA ĐƠN BÁN HÀNG',
    code: `HD-DEMO-${k.toUpperCase().slice(0, 3)}-9988`,
    date: new Date().toLocaleString('vi-VN'),
    cashier: 'Thu ngân 01',
    register: 'POS-01',
    customer: ind.customers[1]?.name || 'Khách lẻ',
    customerPhone: ind.customers[1]?.phone || '',
    items: sampleItems,
    subtotal,
    discount,
    total,
    paymentMethod: 'Tiền mặt',
    tendered,
    change,
    header: ind.shop.receiptHeader || '',
    footer: ind.shop.receiptFooter || 'Cảm ơn quý khách! Hẹn gặp lại.',
    policy: ind.shop.receiptPolicy || '',
    notice: 'Máy in demo · Chưa kết nối thiết bị thật',
    printerName: paper === 'RECEIPT_58' ? 'Máy in nhiệt K58 (Demo)' : 'Máy in nhiệt K80 (Demo)',
    paperWidth: paper === 'RECEIPT_58' ? '58 mm' : '80 mm',
  };
}
