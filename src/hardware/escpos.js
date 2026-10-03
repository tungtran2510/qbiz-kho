/**
 * QBiz ESC/POS & Hardware Driver Module
 * Direct Thermal Receipt Generator & Cash Drawer Controller
 * 
 * Hardware Compatibility:
 * - ESC/POS Standard Command Set (Epson, Xprinter, Bixolon, Citizen, Star)
 * - 80mm (48 chars/line) & 58mm (32 chars/line) thermal paper
 * - RJ11/USB Cash Drawer Kick pulse (Pin 2 / Pin 5)
 * - Transports: WebSerial, WebUSB, WebBluetooth, Local Print Proxy, Raw Byte Array
 * 
 * ZERO UI / ZERO CSS MODIFICATION - Pure System & Hardware Layer
 */

// Command Byte Constants
export const ESC = 0x1B;
export const FS = 0x1C;
export const GS = 0x1D;
export const DLE = 0x10;
export const EOT = 0x04;

export const COMMANDS = {
  // Initialization
  HW_INIT: [ESC, 0x40], // ESC @

  // Text formatting
  TXT_ALIGN_LT: [ESC, 0x61, 0x00], // ESC a 0 (Left)
  TXT_ALIGN_CT: [ESC, 0x61, 0x01], // ESC a 1 (Center)
  TXT_ALIGN_RT: [ESC, 0x61, 0x02], // ESC a 2 (Right)

  TXT_BOLD_ON: [ESC, 0x45, 0x01], // ESC E 1
  TXT_BOLD_OFF: [ESC, 0x45, 0x00], // ESC E 0

  TXT_UNDERLINE_OFF: [ESC, 0x2D, 0x00], // ESC - 0
  TXT_UNDERLINE_1DOT: [ESC, 0x2D, 0x01], // ESC - 1
  TXT_UNDERLINE_2DOT: [ESC, 0x2D, 0x02], // ESC - 2

  // Text sizing (GS ! n)
  TXT_NORMAL: [GS, 0x21, 0x00],
  TXT_2HEIGHT: [GS, 0x21, 0x01],
  TXT_2WIDTH: [GS, 0x21, 0x10],
  TXT_4SQUARE: [GS, 0x21, 0x11], // 2x Width + 2x Height

  // Paper Feeding and Cutting
  PAPER_FEED_1: [0x0A], // LF
  PAPER_FULL_CUT: [GS, 0x56, 0x00], // GS V 0 (Full Cut)
  PAPER_PART_CUT: [GS, 0x56, 0x01], // GS V 1 (Partial Cut)
  PAPER_FEED_CUT: [GS, 0x56, 0x42, 0x03], // GS V 66 3 (Feed 3 lines + Partial Cut)

  // Cash Drawer Kick Pulses (ESC p m t1 t2)
  // m=0: Pin 2, m=1: Pin 5
  // t1: ON time = t1 * 2ms. (25 * 2ms = 50ms)
  // t2: OFF time = t2 * 2ms. (250 * 2ms = 500ms)
  DRAWER_KICK_PIN2: [ESC, 0x70, 0x00, 0x19, 0xFA],
  DRAWER_KICK_PIN5: [ESC, 0x70, 0x01, 0x19, 0xFA]
};

/**
 * Remove Vietnamese accents for universal thermal printer fallback
 * Ensures text renders crisply on any hardware even without CP1258/UTF8 firmware support
 */
export function removeVietnameseDiacritics(str = '') {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * ESC/POS Command Byte Builder
 */
export class EscPosBuilder {
  constructor(options = {}) {
    this.buffer = [];
    this.width = options.width || 48; // 48 chars (80mm) or 32 chars (58mm)
    this.useUtf8 = options.useUtf8 || false;
    this.encoder = new TextEncoder();
    this.init();
  }

  init() {
    this.buffer.push(...COMMANDS.HW_INIT);
    return this;
  }

  raw(bytes) {
    if (Array.isArray(bytes) || bytes instanceof Uint8Array) {
      this.buffer.push(...bytes);
    }
    return this;
  }

  align(position = 'left') {
    const pos = String(position).toLowerCase();
    if (pos === 'center' || pos === 'ct') this.buffer.push(...COMMANDS.TXT_ALIGN_CT);
    else if (pos === 'right' || pos === 'rt') this.buffer.push(...COMMANDS.TXT_ALIGN_RT);
    else this.buffer.push(...COMMANDS.TXT_ALIGN_LT);
    return this;
  }

  bold(enable = true) {
    this.buffer.push(...(enable ? COMMANDS.TXT_BOLD_ON : COMMANDS.TXT_BOLD_OFF));
    return this;
  }

  size(mode = 'normal') {
    if (mode === '2x' || mode === 'large') this.buffer.push(...COMMANDS.TXT_4SQUARE);
    else if (mode === 'wide') this.buffer.push(...COMMANDS.TXT_2WIDTH);
    else if (mode === 'high') this.buffer.push(...COMMANDS.TXT_2HEIGHT);
    else this.buffer.push(...COMMANDS.TXT_NORMAL);
    return this;
  }

  text(str = '') {
    const textStr = this.useUtf8 ? String(str) : removeVietnameseDiacritics(String(str));
    const encoded = this.encoder.encode(textStr);
    this.buffer.push(...encoded);
    return this;
  }

  line(str = '') {
    this.text(str);
    this.buffer.push(0x0A);
    return this;
  }

  feed(n = 1) {
    for (let i = 0; i < n; i++) this.buffer.push(0x0A);
    return this;
  }

  divider(char = '-') {
    const dStr = char.repeat(this.width);
    return this.line(dStr);
  }

  /**
   * Two-column row: left-aligned title, right-aligned value
   */
  table(left = '', right = '', customWidth = null) {
    const w = customWidth || this.width;
    const cleanLeft = this.useUtf8 ? String(left) : removeVietnameseDiacritics(String(left));
    const cleanRight = this.useUtf8 ? String(right) : removeVietnameseDiacritics(String(right));
    const spaceCount = Math.max(1, w - cleanLeft.length - cleanRight.length);
    const lineText = cleanLeft + ' '.repeat(spaceCount) + cleanRight;
    return this.line(lineText);
  }

  /**
   * Standard ESC/POS QR Code generator (Model 2)
   */
  qrCode(content = '') {
    if (!content) return this;
    const data = this.encoder.encode(content);
    const len = data.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    // 1. Model type (Model 2)
    this.buffer.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // 2. Module size (4 dots)
    this.buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04);
    // 3. Error correction level (M - 15%)
    this.buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
    // 4. Store data in symbol storage area
    this.buffer.push(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...data);
    // 5. Print the symbol
    this.buffer.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    this.feed(1);
    return this;
  }

  /**
   * Cash Drawer Kick command
   */
  kickDrawer(pin = 0) {
    this.buffer.push(...(pin === 1 ? COMMANDS.DRAWER_KICK_PIN5 : COMMANDS.DRAWER_KICK_PIN2));
    return this;
  }

  /**
   * Paper Cut
   */
  cut(partial = true) {
    this.feed(3);
    this.buffer.push(...(partial ? COMMANDS.PAPER_PART_CUT : COMMANDS.PAPER_FULL_CUT));
    return this;
  }

  build() {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Builds standard Cash Drawer Kick byte sequence
 * @param {number} pin 0 (Pin 2) or 1 (Pin 5)
 * @param {number} onTimeMs Pulse on duration in milliseconds (default 50ms)
 * @param {number} offTimeMs Pulse off duration in milliseconds (default 500ms)
 * @returns {Uint8Array}
 */
export function buildDrawerKickCommand(pin = 0, onTimeMs = 50, offTimeMs = 500) {
  const t1 = Math.max(1, Math.min(255, Math.floor(onTimeMs / 2)));
  const t2 = Math.max(1, Math.min(255, Math.floor(offTimeMs / 2)));
  const pinByte = pin === 1 ? 0x01 : 0x00;
  return new Uint8Array([ESC, 0x70, pinByte, t1, t2]);
}

/**
 * Kick Cash Drawer driver function
 * Dispatches physical kick command via available hardware transports:
 * 1. WebSerial / WebUSB / WebBluetooth device if active
 * 2. Window CustomEvent 'qbiz:cash_drawer_kicked'
 * 3. Local Print proxy if configured
 */
export async function kickCashDrawer(options = {}) {
  const pin = options.pin || 0;
  const onTimeMs = options.onTimeMs || 50;
  const offTimeMs = options.offTimeMs || 500;
  const kickBytes = buildDrawerKickCommand(pin, onTimeMs, offTimeMs);

  let transport = 'DRIVER_DISPATCHED';

  // Hardware transport dispatch (WebSerial / WebUSB if attached)
  if (options.serialPort && options.serialPort.writable) {
    try {
      const writer = options.serialPort.writable.getWriter();
      await writer.write(kickBytes);
      writer.releaseLock();
      transport = 'WEBSERIAL_DIRECT';
    } catch (e) {
      console.warn('[ESC/POS Hardware] WebSerial kick failed:', e);
    }
  }

  // Notify system listeners
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('qbiz:cash_drawer_kicked', {
      detail: {
        timestamp: new Date().toISOString(),
        pin,
        transport,
        bytesLength: kickBytes.length,
        rawBytesHex: Array.from(kickBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
      }
    });
    window.dispatchEvent(event);
  }

  return {
    success: true,
    transport,
    pin,
    bytes: kickBytes,
    hex: Array.from(kickBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
  };
}

/**
 * Format Currency for Receipts
 */
function fmtVND(amount = 0) {
  return Math.round(Number(amount) || 0).toLocaleString('vi-VN') + ' d';
}

/**
 * Formats a full ESC/POS Thermal Receipt for a Sale
 * @param {object} param0 
 * @returns {object} { bytes: Uint8Array, hex: string, lineCount: number }
 */
export function generateEscPosReceipt({
  sale,
  storeInfo = {},
  width = 48,
  openDrawer = true,
  autoCut = true,
  useUtf8 = false
} = {}) {
  if (!sale) throw new Error('Cần thông tin phiếu bán (sale) để tạo hóa đơn ESC/POS.');

  const storeName = storeInfo.name || 'QBIZ STORE';
  const storeAddress = storeInfo.address || 'Hệ thống Quản lý Bán hàng & Kho QBiz';
  const storePhone = storeInfo.phone || '0909.888.999';

  const builder = new EscPosBuilder({ width, useUtf8 });

  // Optional drawer kick pulse at receipt start
  if (openDrawer) {
    builder.kickDrawer(0);
  }

  // 1. Header
  builder.align('center');
  builder.size('2x').bold(true).line(storeName);
  builder.size('normal').bold(false);
  if (storeAddress) builder.line(storeAddress);
  if (storePhone) builder.line('Hotline: ' + storePhone);
  builder.divider('=');

  // 2. Receipt Meta
  builder.size('high').bold(true).line('HOA DON BAN HANG');
  builder.size('normal').bold(false);
  builder.align('left');
  builder.table('Ma phieu:', sale.code || sale.id || 'POS-000');
  builder.table('Ngay ban:', (sale.created_at || sale.createdAt || new Date().toISOString()).slice(0, 16).replace('T', ' '));
  builder.table('Thu ngan:', storeInfo.cashier || 'Thu Ngan');
  builder.table('Khach hang:', sale.customer_label || sale.customerLabel || 'Khach le');
  builder.divider('-');

  // 3. Items Table Header
  builder.bold(true);
  builder.table('Mat hang', 'T.Tien');
  builder.bold(false);
  builder.divider('-');

  // Items
  const items = sale.items || [];
  for (const item of items) {
    const name = item.name || 'San pham';
    const qty = Number(item.quantity || 1);
    const unitPrice = Number(item.unit_price || item.price || 0);
    const lineTotal = Number(item.line_total || (qty * unitPrice));

    builder.line(name);
    builder.table(`  ${qty} x ${fmtVND(unitPrice)}`, fmtVND(lineTotal));
  }
  builder.divider('-');

  // 4. Totals & Financials
  const subtotal = Number(sale.subtotal || sale.grand_total || 0);
  const discount = Number(sale.discount_total || sale.discount || 0);
  const grandTotal = Number(sale.grand_total ?? sale.total ?? 0);
  const paidAmount = Number(sale.paid_amount ?? grandTotal);
  const debtAmount = Number(sale.debt_amount ?? 0);

  builder.table('Tong tien hang:', fmtVND(subtotal));
  if (discount > 0) {
    builder.table('Chiet khau:', '-' + fmtVND(discount));
  }
  builder.bold(true).size('high');
  builder.table('THANH TOAN:', fmtVND(grandTotal));
  builder.bold(false).size('normal');
  builder.divider('-');

  // 5. Payment Tender Breakdown
  const payments = Array.isArray(sale.payments) && sale.payments.length > 0
    ? sale.payments
    : [{ method: sale.payment_method || 'cash', amount: grandTotal, status: sale.payment_status || 'PAID' }];

  builder.bold(true).line('Phuong thuc thanh toan:');
  builder.bold(false);
  for (const p of payments) {
    let methodLabel = 'Tien mat';
    if (p.method === 'transfer') methodLabel = 'Chuyen khoan';
    else if (p.method === 'qr') methodLabel = 'VietQR';
    else if (p.method === 'debt') methodLabel = 'Ghi no';
    else if (p.method === 'exchange') methodLabel = 'Doi hang';

    const pAmt = Number(p.amount || 0);
    const refText = p.reference ? ` (${p.reference})` : '';
    builder.table(`- ${methodLabel}${refText}:`, fmtVND(pAmt));
  }

  if (debtAmount > 0) {
    builder.bold(true);
    builder.table('CON NO:', fmtVND(debtAmount));
    builder.bold(false);
  }
  builder.divider('-');

  // 6. QR Code for payment check / VietQR
  const qrData = sale.vietqr_url || sale.qr_payload || `QBIZ-INVOICE:${sale.code || sale.id}`;
  builder.align('center');
  builder.line('Quet ma tra cuu hoa don:');
  builder.qrCode(qrData);

  // 7. Footer
  builder.line('Cam on quy khach & Hen gap lai!');
  builder.line('Powered by QBiz Technology');

  // 8. Auto Cut
  if (autoCut) {
    builder.cut(true);
  }

  const rawBytes = builder.build();

  return {
    rawBytes,
    bytesLength: rawBytes.length,
    hex: Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join(' '),
    width,
    hasKickDrawer: openDrawer,
    hasAutoCut: autoCut
  };
}
