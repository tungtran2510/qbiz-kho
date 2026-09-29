/**
 * QBiz Vietnamese NLP Normalization & Canonicalization Module
 * Handles Vietnamese conversational slang, teencode, abbreviations,
 * Telex typing anomalies, and intent preprocessing for the AI Assistant.
 */

/**
 * Remove Vietnamese accents and special characters into plain Latin
 * @param {string} str
 * @returns {string}
 */
export function removeVietnameseDiacritics(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Common Telex typos that occur when typing fast or with misconfigured IME
 */
const TELEX_TYPOS = [
  // Frequent mobile / no-diacritic misspellings observed in natural shop queries.
  // Keep these token-bounded so product names, SKUs and phone numbers are untouched.
  [/\bktra\b/gi, 'kiem tra'],
  [/\bdoang\s+thu\b/gi, 'doanh thu'],
  [/\bhum\s+nai\b/gi, 'hom nay'],

  // Trailing 'w' typos: hieuw -> hieu, muonw -> muon
  [/\bhieuw\b/gi, 'hieu'],
  [/\bmuonw\b/gi, 'muon'],
  [/\bxemw\b/gi, 'xem'],
  [/\bchuw\b/gi, 'chu'],
  [/\bnhuw\b/gi, 'nhu'],
  [/\binw\b/gi, 'in'],
  [/\bcuar\b/gi, 'cua'],
  [/\bcuar hang\b/gi, 'cua hang'],
  
  // Double-key typos: khoong -> khong, ddo -> do, baans -> ban
  [/\b(?:dduowjc|ddwowjc|duwojc|duowjc|đuowjc|duocj)\b/gi, 'duoc'],
  [/\b(?:ddc|đc)\b/gi, 'duoc'],
  [/\b(?:khoong|khongg+|khoo+ng)\b/gi, 'khong'],
  [/\b(?:ddo|đo)\b/gi, 'do'],
  [/\bbaans\b/gi, 'ban'],
  [/\bddown\b/gi, 'don'],
  [/\bhoas\b/gi, 'hoa'],
  [/\btieep\b/gi, 'tiep'],
  [/\btaoj\b/gi, 'tao'],
  [/\btheem\b/gi, 'them'],
  [/\bxemm\b/gi, 'xem'],
  [/\b(?:kieem|kieemr|kiemr)\b/gi, 'kiem'],
  [/\btraa\b/gi, 'tra'],
  [/\bmoow\b/gi, 'mo'],
  [/\bvaoo\b/gi, 'vao'],
  [/\braaa\b/gi, 'ra'],
  [/\bxoas\b/gi, 'xoa'],
  [/\bsuar\b/gi, 'sua'],
  [/\b(?:nhieeu|nhieeuf)\b/gi, 'nhieu'],
  [/\b(?:baonhieu|baonhiu|baonhj)\b/gi, 'bao nhieu'],
  [/\b(?:tienn+|tieenf|tiewn)\b/gi, 'tien'],
  [/\b(?:haang|hangf)\b/gi, 'hang'],
  [/\b(?:toongr|tongr)\b/gi, 'tong'],

  // Action typos & compound words without spaces:
  [/\b(?:kikhoat|kichhoat|khickhoat|kik\s*hoat|khich\s*hoat)\b/gi, 'kich hoat'],
  [/\b(?:chinhja|suaja|doija|thayja)\b/gi, 'chinh gia'],
  [/\b(?:chinh\s*ja|sua\s*ja|doi\s*ja|thay\s*ja)\b/gi, 'chinh gia'],
  [/\b(?:tang\s*ja|tangja)\b/gi, 'tang gia'],
  [/\b(?:ha\s*ja|haja|giamja)\b/gi, 'ha gia'],
  [/\b(?:inbill|inhoadon|inlai|inlaibill)\b/gi, 'in'],
  [/\b(?:chotkho|kiemkho|kiemke)\b/gi, 'kiem kho'],
  [/\b(?:nhapkho|themkho)\b/gi, 'nhap kho'],
  [/\b(?:xuatkho)\b/gi, 'xuat kho'],
  [/\b(?:chuyenkho|dieuchuyen)\b/gi, 'chuyen kho'],
  [/\b(?:ve0|vekhong|cho\s*ve\s*0|set0)\b/gi, 've 0'],
  [/\b(?:hetsach|hetveo)\b/gi, 'het sach']
];

/**
 * Abbreviations & Teencode mapping for Vietnamese e-commerce & retail
 */
const TEENCODE_PATTERNS = [
  // Time abbreviations
  [/\b(?:hnay|hien\s*nay)\b/gi, 'hom nay'],
  [/\bhqua\b/gi, 'hom qua'],
  [/\b(?:tuan\s*trc|tuan\s*truoc)\b/gi, 'tuan truoc'],
  [/\b(?:thg\s*trc|thang\s*trc)\b/gi, 'thang truoc'],
  [/\b(?:thg\s*nay|thang\s*nay)\b/gi, 'thang nay'],

  // Revenue & business terms
  [/\bdthu\b/gi, 'doanh thu'],
  // dt meaning doanh thu (when not followed by phone digits)
  [/\bdt\b(?!\s*\d{6,})/gi, 'doanh thu'],
  [/\bln\b/gi, 'loi nhuan'],
  [/\bgv\b/gi, 'gia von'],
  [/\bcn\b(?!\s*[-_]?\d)/gi, 'cong no'],
  [/\bpx\b(?!\s*[-_]?\d)/gi, 'phieu xuat'],
  [/\bpn\b(?!\s*[-_]?\d)/gi, 'phieu nhap'],
  [/\bkd\b/gi, 'kinh doanh'],
  [/\b(?:ck)\b(?!\s*[-_]?\d)/gi, 'chuyen khoan'],
  [/\b(?:tm)\b(?!\s*[-_]?\d)/gi, 'tien mat'],
  [/\b(?:kt)\b(?!\s*[-_]?\d)/gi, 'kiem tra'],
  [/\b(?:bh)\b(?!\s*[-_]?\d)/gi, 'ban hang'],
  [/\b(?:nh)\b(?!\s*[-_]?\d)/gi, 'nhap hang'],

  // Question words & pronouns
  [/\b(?:j\s*co|gi\s*co)\b/gi, 'gi co'],
  [/\b(?:j\s*z\s*tr|j\s*z|j\s*zay|gi\s*zay|gi\s*vay)\b/gi, 'gi vay'],
  [/\bj\b/gi, 'gi'],
  [/\b(?:dc|đc)\b/gi, 'duoc'],
  [/\b(?:ko|k|khg|hong|hổng|khum|hok|hẻm|hem|kô)\b/gi, 'khong'],
  [/\b(?:bnhieu|bnh|bao\s*nhiu|bnhiu|bnhju)\b/gi, 'bao nhieu'],
  [/\bntn\b/gi, 'nhu the nao'],
  [/\bvs\b/gi, 'voi'],
  [/\blm\b/gi, 'lam'],
  [/\bcx\b/gi, 'cung'],
  [/\b(?:chx|chua)\b/gi, 'chua'],
  [/\b(?:sl|slg)\b/gi, 'so luong'],
  [/\bmk\b(?!\s*[-_]?\d)/gi, 'minh'],
  [/\b(?:ncl|ns\s*chung)\b/gi, 'noi chung'],
  [/\b(?:tl|tloi)\b/gi, 'tra loi'],
  [/\b(?:thui|thoy)\b/gi, 'thoi'],
  [/\b(?:dzo|zô|zo)\b/gi, 'vao'],
  [/\b(?:sao\s*z|sao\s*zay)\b/gi, 'sao vay'],
  [/\b(?:r|rui|roai)\b/gi, 'roi'],
  [/\b(?:nhiu|nhìu)\b/gi, 'nhieu'],
  [/\b(?:tks|thx|ty)\b/gi, 'cam on'],
  [/\b(?:ua|ủa)\b/gi, 'sao'],
  [/\b(?:wth|clgt)\b/gi, 'gi the'],
  [/\b(?:uk|uh|uhm|um|oki|okey|oke)\b/gi, 'ok'],
  [/\bchuc\b/gi, '10'],

  // Currency & quantity spoken slang
  [/\b(?:cu|củ)\b/gi, 'trieu'],
  [/\b(?:lit|lít)\b/gi, 'tram nghin'],
  [/\b(?:trieu\s*ruoi|tr\s*ruoi|m\s*ruoi)\b/gi, '1500000'],
  [/\b(?:tram\s*ruoi|k\s*ruoi)\b/gi, '150000'],
  [/\b(?:hai\s*cu\s*ruoi|2\s*cu\s*ruoi)\b/gi, '2500000'],
  [/\b(?:ba\s*cu\s*ruoi|3\s*cu\s*ruoi)\b/gi, '3500000'],
  [/\b(?:nua\s*cu)\b/gi, '500000'],
  [/\b(?:nua\s*ta)\b/gi, '6'],
  [/\b(?:mot\s*ta|1\s*ta)\b/gi, '12'],
  [/\b(?:mot\s*doi|1\s*doi)\b/gi, '2'],
  [/\b(?:hai\s*chuc|2\s*chuc)\b/gi, '20'],
  [/\b(?:ba\s*chuc|3\s*chuc)\b/gi, '30'],
  [/\b(?:bon\s*chuc|4\s*chuc)\b/gi, '40'],
  [/\b(?:nam\s*chuc|5\s*chuc)\b/gi, '50'],

  // Retail entities with negative lookahead to protect SKU/IDs (e.g. SP-001, HD-0001, KH-01, NV-01)
  [/\bsp\b(?!\s*[-_]?\d)/gi, 'san pham'],
  [/\b(?:hd|hđ)\b(?!\s*[-_]?\d)/gi, 'hoa don'],
  [/\bkh\b(?!\s*[-_]?\d)/gi, 'khach hang'],
  [/\bnv\b(?!\s*[-_]?\d)/gi, 'nhan vien'],
  [/\bncc\b(?!\s*[-_]?\d)/gi, 'nha cung cap'],

  // Shipping, Invoices & Accounting
  [/\b(?:dvvc)\b/gi, 'don vi van chuyen'],
  [/\b(?:ghtk)\b/gi, 'giao hang tiet kiem'],
  [/\b(?:ghn)\b/gi, 'giao hang nhanh'],
  [/\b(?:vtp)\b/gi, 'viettel post'],
  [/\b(?:ship|shipping)\b/gi, 'van chuyen'],
  [/\b(?:bcao|b\s*cao)\b/gi, 'bao cao'],
  [/\b(?:so\s*quy|quy\s*tien)\b/gi, 'so quy'],
  [/\b(?:két|ket\s*tien|trong\s*ket)\b/gi, 'ket tien'],
  [/\b(?:vat)\b/gi, 'thue vat']
];

/**
 * Canonicalize raw Vietnamese text:
 * 1. Diacritics removal & lowercasing
 * 2. Telex typo repairs
 * 3. Contextual word disambiguation ('bn' as 'bán' vs 'bao nhiêu')
 * 4. Slang and abbreviations expansion
 *
 * @param {string} raw
 * @returns {string} canonical normalized string
 */
export function canonicalizeVietnamese(raw) {
  if (!raw) return '';
  let str = removeVietnameseDiacritics(raw);

  // 1. Fix Telex typos
  for (const [pattern, repl] of TELEX_TYPOS) {
    str = str.replace(pattern, repl);
  }

  // 2. Disambiguate 'bn':
  // If 'bn' is followed by a number -> 'ban' (e.g. "bn 2 cai" -> "ban 2 cai")
  str = str.replace(/\bbn\s+(\d+)\b/gi, 'ban $1');
  // If 'bn' is preceded by metric keywords -> 'bao nhieu' (e.g. "lai bn", "dc bn", "gia bn")
  str = str.replace(/\b(lai|loi|dc|duoc|tong|gia|con|dt|dthu|thu|tien)\s+bn\b/gi, '$1 bao nhieu');
  // Standalone 'bn' remaining -> 'bao nhieu'
  str = str.replace(/\bbn\b/gi, 'bao nhieu');

  // 3. Expand Teencode and retail abbreviations
  for (const [pattern, repl] of TEENCODE_PATTERNS) {
    str = str.replace(pattern, repl);
  }

  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Remove conversational framing (greetings, politeness particles, fillers)
 * Useful for extracting exact entity names or commands.
 * Example: "alo bạn ơi kiểm tra tồn kho giúp em với ạ" -> "kiem tra ton kho"
 *
 * @param {string} text
 * @returns {string} clean core text
 */
export function stripConversationalNoise(text) {
  if (!text) return '';
  let str = canonicalizeVietnamese(text);

  let prev = '';
  while (prev !== str) {
    prev = str;
    // Strip leading greetings / polite openings
    str = str.replace(/^(?:alo|e|ê|nay|này|oi|ơi|ban oi|bạn ơi|bot oi|bot ơi|ad oi|ad ơi|ai oi|ai ơi|em oi|em ơi|anh oi|anh ơi|chi oi|chị ơi|cho hoi|cho hỏi|cho minh hoi|cho mình hỏi|cho em hoi|cho em hỏi|hoi ti|hỏi tí|hoi xiu|hỏi xíu|hoi chut|hỏi chút|lam on|làm ơn|vui long|vui lòng|nho ban|nhờ bạn|giup minh|giúp mình|giup em|giúp em)\s+/gi, '').trim();

    // Strip trailing polite particles & requests
    str = str.replace(/\s+(?:giup|giúp|dum|dùm|ho|hộ|xem)?\s*(?:cho\s+)?(?:em|toi|minh|ban)?\s*(?:voi|với)?\s*(?:a|ạ|nhe|nhé|nha|coi|di|đi|sao|dum cai|ho cai|giup cai)?$/gi, '').trim();
    str = str.replace(/\s+(?:a|ạ|nhe|nhé|nha|ha|hả|hu|hử|voi|với|coi|di|đi)$/gi, '').trim();
  }

  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Detect if prompt is a clarification request, confusion, or asking what the AI can do
 * e.g., "j cơ", "gì cơ", "là sao", "k hiểu", "hieuw ko", "mày làm được gì", "hướng dẫn"
 */
export function isClarificationQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c === 'gi co' ||
    c === 'gi' ||
    c === 'ha' ||
    c === 'hu' ||
    c === 'sao' ||
    c === 'la sao' ||
    c === 'sao co' ||
    c === 'sao the' ||
    c === 'the nao' ||
    c === 'y la sao' ||
    c === 'nghia la sao' ||
    c === 'gi vay' ||
    c === 'gi the' ||
    c === 'cai gi the' ||
    c === 'cai gi day' ||
    c === 'khong hieu' ||
    c === 'chua hieu' ||
    c === 'cha hieu' ||
    c === 'hieu khong' ||
    c.includes('khong hieu gi') ||
    c.includes('cha hieu gi') ||
    c.includes('cha hieu j') ||
    c.includes('noi gi the') ||
    c.includes('noi gi vay') ||
    c.includes('noi gi khong hieu') ||
    c.includes('noi cai gi') ||
    c.includes('kieu gi day') ||
    c.includes('kieu gi the') ||
    c.includes('kho hieu the') ||
    c.includes('hieu chet lien') ||
    c.includes('khong hieu ban noi gi') ||
    c.includes('chua hieu ban noi gi') ||
    c.includes('ban lam duoc gi') ||
    c.includes('ai lam duoc gi') ||
    c.includes('may lam duoc gi') ||
    c.includes('co the lam gi') ||
    c.includes('giup duoc gi') ||
    c.includes('giup gi duoc') ||
    c.includes('huong dan su dung') ||
    c.includes('chi cach dung') ||
    c === 'huong dan' ||
    c === 'tro giup' ||
    c === 'help'
  );
}

/**
 * Detect daily orders/bills count queries:
 * e.g., "có đơn nào chưa", "nay đc mấy bill rồi", "hôm nay có mấy đơn", "mấy bill rồi"
 */
export function isDailyOrdersCountQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c.includes('co don nao chua') ||
    c.includes('co don nao moi') ||
    c.includes('co don moi') ||
    c.includes('don moi') ||
    c.includes('don hang moi') ||
    c.includes('kiem tra don moi') ||
    c.includes('don nao moi') ||
    c.includes('co ai dat hang chua') ||
    c.includes('co ai dat don moi ko') ||
    c.includes('co ai dat hang ko') ||
    c.includes('co ai dat hang khong') ||
    c.includes('don moi hom nay') ||
    c.includes('don dat hang moi') ||
    c.includes('co bill nao chua') ||
    c.includes('co hoa don nao chua') ||
    c.includes('co hoa don nao moi') ||
    c.includes('may bill roi') ||
    c.includes('may don roi') ||
    c.includes('may hoa don roi') ||
    c.includes('bao nhieu bill roi') ||
    c.includes('bao nhieu don roi') ||
    (c.includes('may bill') && (c.includes('hom nay') || c.includes('nay') || c.includes('roi'))) ||
    (c.includes('may don') && (c.includes('hom nay') || c.includes('nay') || c.includes('roi') || c.includes('ban duoc'))) ||
    (c.includes('bao nhieu don') && (c.includes('hom nay') || c.includes('nay') || c.includes('ban duoc'))) ||
    (c.includes('bao nhieu bill') && (c.includes('hom nay') || c.includes('nay') || c.includes('ban duoc')))
  );
}

/**
 * Detect shipping & logistics queries:
 * e.g., "kết nối đơn vị vận chuyển", "giao hàng", "GHN", "GHTK", "Viettel Post", "ship hàng"
 */
export function isShippingQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;
  return (
    c.includes('van chuyen') ||
    c.includes('giao hang') ||
    c.includes('don vi van chuyen') ||
    c.includes('ket noi van chuyen') ||
    c.includes('ket noi ship') ||
    c.includes('ket noi giao hang') ||
    c.includes('doi tac giao hang') ||
    c.includes('doi tac van chuyen') ||
    c.includes('don vi giao hang') ||
    c.includes('tien ship') ||
    c.includes('phi ship') ||
    c.includes('phi van chuyen') ||
    c.includes('ghtk') ||
    c.includes('ghn') ||
    c.includes('viettel post') ||
    c.includes('buu dien') ||
    c.includes('giao hang nhanh') ||
    c.includes('giao hang tiet kiem') ||
    /\bship\b/i.test(c) ||
    /\bdvvc\b/i.test(c)
  );
}

/**
 * Detect contextual product stock queries when viewing a product:
 * e.g., "Hàng này hết", "Hàng này còn không", "còn bao nhiêu cái", "hết hàng chưa", "giá bao nhiêu cái này"
 */
export function isContextualProductQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;
  return (
    c === 'hang nay het' ||
    c === 'hang nay het chua' ||
    c === 'hang nay con khong' ||
    c === 'hang nay con ko' ||
    c === 'hang nay con k' ||
    c === 'cai nay het chua' ||
    c === 'cai nay het' ||
    c === 'cai nay con khong' ||
    c === 'cai nay con ko' ||
    c === 'cai nay con k' ||
    c === 'sp nay con khong' ||
    c === 'sp nay con ko' ||
    c === 'sp nay het chua' ||
    c === 'mon nay con khong' ||
    c === 'mon nay con ko' ||
    c === 'mon nay het chua' ||
    c === 'con bao nhieu cai' ||
    c === 'con bao nhieu' ||
    c === 'con may cai' ||
    c === 'con hang khong' ||
    c === 'con hang ko' ||
    c === 'het hang chua' ||
    c === 'het hang' ||
    c.startsWith('hang nay con') ||
    c.startsWith('hang nay het') ||
    c.startsWith('cai nay con') ||
    c.startsWith('cai nay het') ||
    c.startsWith('san pham nay con') ||
    c.startsWith('san pham nay het') ||
    c.includes('hang nay con bao nhieu') ||
    c.includes('cai nay con bao nhieu') ||
    c.includes('san pham nay con bao nhieu') ||
    c.includes('gia bao nhieu cai nay') ||
    c.includes('gia cai nay bao nhieu') ||
    c.includes('hang nay gia bao nhieu')
  );
}

/**
 * Detect invoice & sales report queries:
 * e.g., "báo cáo hoa đơn", "báo cáo hóa đơn", "danh sách hóa đơn", "tra cứu hóa đơn", "hóa đơn hôm nay"
 */
export function isInvoiceReportQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;
  return (
    c.includes('bao cao hoa don') ||
    c.includes('bao cao bill') ||
    c.includes('danh sach hoa don') ||
    c.includes('danh sach bill') ||
    c.includes('xem hoa don') ||
    c.includes('tra cuu hoa don') ||
    c.includes('in lai hoa don') ||
    c.includes('hoa don ban hang') ||
    c.includes('hoa don hom nay') ||
    c.includes('hoa don gan nhat') ||
    c.includes('tat ca hoa don') ||
    c.includes('tim hoa don') ||
    c === 'hoa don' ||
    c === 'bill' ||
    c === 'bao cao hoa don'
  );
}

/**
 * Detect accounting & cash flow queries:
 * e.g., "sổ quỹ", "thu chi", "tiền mặt và chuyển khoản", "tiền trong két", "két tiền", "công nợ phải thu"
 */
export function isAccountingFinanceQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;
  return (
    c.includes('so quy') ||
    c.includes('thu chi') ||
    c.includes('quy tien') ||
    c.includes('tien trong ket') ||
    c.includes('ket tien') ||
    c.includes('trong ket') ||
    c.includes('tien mat va chuyen khoan') ||
    c.includes('tien mat chuyen khoan') ||
    c.includes('chuyen khoan hay tien mat') ||
    c.includes('bao nhieu tien mat') ||
    c.includes('bao nhieu chuyen khoan') ||
    c.includes('cong no phai thu') ||
    c.includes('cong no phai tra') ||
    c.includes('no phai thu') ||
    c.includes('no phai tra') ||
    c.includes('tong cong no') ||
    c.includes('gia tri ton kho') ||
    c.includes('tong tien ton kho') ||
    c.includes('tien hang ton') ||
    c.includes('thue vat') ||
    c.includes('tien thue')
  );
}

/**
 * Detect customer queries:
 * e.g., "khách hàng", "danh sách khách", "khách VIP", "khách nợ", "công nợ khách"
 */
export function isCustomerQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;
  return (
    c.includes('danh sach khach hang') ||
    c.includes('danh sach khach') ||
    c.includes('khach hang vip') ||
    c.includes('khach vip') ||
    c.includes('khach mua nhieu') ||
    c.includes('khach no') ||
    c.includes('khach hang no') ||
    c.includes('cong no khach') ||
    c.includes('cong no khach hang') ||
    c.includes('khach quen') ||
    c.includes('co bao nhieu khach') ||
    c.includes('may khach hang') ||
    c.includes('thong tin khach') ||
    c.includes('tim khach hang') ||
    c.includes('tim khach') ||
    c === 'khach hang' ||
    c === 'khach'
  );
}

/**
 * Detect slow-moving products query:
 * e.g., "hàng bán chậm", "hàng ế", "tồn kho lâu", "bán chậm nhất"
 */
export function isSlowMovingQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c.includes('ban cham') ||
    c.includes('hang ban cham') ||
    c.includes('mat hang ban cham') ||
    c.includes('san pham ban cham') ||
    c.includes('cham troi') ||
    c.includes('ton kho lau') ||
    c.includes('ton lau') ||
    /\b(?:hang|mon|sp|mat hang|san pham)\s+(?:nao\s+)?e(?:\s+(?:nhat|am|qua|nhieu))?\b/i.test(c) ||
    /\b(?:ban\s+e|e\s+am|e\s+nhat)\b/i.test(c) ||
    /\bhang\s+e\b/i.test(c)
  );
}

/**
 * Detect shift / staff query:
 * e.g., "ai đang trực ca", "ca trực hiện tại", "ai đang trực", "hôm nay ai bán"
 */
export function isShiftQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c.includes('ai dang truc ca') ||
    c.includes('ai truc ca') ||
    c.includes('ai dang truc') ||
    c.includes('ca truc hien tai') ||
    c.includes('nhan vien truc ca') ||
    c.includes('nhan vien dang truc') ||
    c.includes('tinh trang ca') ||
    c.includes('thong tin ca') ||
    c.includes('so ca hom nay') ||
    c.includes('tien trong ca') ||
    c.includes('tien ket ca') ||
    c.includes('hom nay ai ban')
  );
}

/**
 * Detect natural sales / quick cart command:
 * e.g., "bán 2 váy linen", "bán 1 ly cà phê", "bán 3 cái áo"
 */
export function parseNaturalSaleCommand(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  // Pattern: "ban <qty> [cai|chiec|ly|mon|hop|sp] <product_name>"
  const match = c.match(/^(?:ban|cho|lay|xuat ban)\s+(\d+)\s*(?:cai|chiec|ly|mon|hop|goi|bo|san pham)?\s+(.+)$/i);
  if (match) {
    const qty = parseInt(match[1], 10);
    let prodQuery = match[2].trim();
    prodQuery = stripConversationalNoise(prodQuery);
    if (qty > 0 && prodQuery.length >= 2) {
      return { qty, productQuery: prodQuery };
    }
  }
  return null;
}

/**
 * Detect natural warehouse receipt command:
 * e.g., "nhập 5 áo thun", "nhập thêm 10 váy linen"
 */
export function parseNaturalReceiptCommand(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  // Pattern: "nhap [them] <qty> [cai|chiec|ly|mon|hop|sp] <product_name>"
  const match = c.match(/^(?:nhap|nhap them|nhap vao|bo sung)\s+(\d+)\s*(?:cai|chiec|ly|mon|hop|goi|bo|san pham)?\s+(.+)$/i);
  if (match) {
    const qty = parseInt(match[1], 10);
    let prodQuery = match[2].trim();
    prodQuery = stripConversationalNoise(prodQuery);
    if (qty > 0 && prodQuery.length >= 2) {
      return { qty, productQuery: prodQuery };
    }
  }
  return null;
}

/**
 * Detect payment breakdown queries (Cash, Bank Transfer, QR, Cash Drawer):
 * e.g., "tiền mặt hôm nay", "trong két có bao nhiêu tiền", "chuyển khoản bao nhiêu", "khách ck bn", "tiền ck hôm nay"
 */
export function isPaymentBreakdownQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  if (c.includes('doanh thu') && (c.includes('khac nhau') || c.includes('vi sao') || c.includes('tai sao') || c.includes('lech'))) {
    return false;
  }

  return (
    c.includes('tien mat') ||
    c.includes('chuyen khoan') ||
    c.includes('trong ket') ||
    c.includes('ket tien') ||
    c.includes('tien ck') ||
    c.includes('khach ck') ||
    c.includes('quet qr') ||
    c.includes('ma qr') ||
    (c.includes('ck') && (c.includes('bao nhieu') || c.includes('hom nay') || c.includes('nay') || c.includes('duoc'))) ||
    (c.includes('thanh toan') && (c.includes('bang gi') || c.includes('hinh thuc') || c.includes('phuong thuc')))
  );
}

/**
 * Detect low stock & inventory warning queries:
 * e.g., "cái gì sắp hết", "món nào sắp hết", "hàng sắp hết", "sắp hết hàng", "cảnh báo hết hàng"
 */
export function isLowStockAlertQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  // Invariant Section 7: Exclude single-product commands, statements and advice queries
  if (
    c.includes('danh dau') ||
    c.includes('bao het') ||
    c.includes('hang nay') ||
    c.includes('mon nay') ||
    c.includes('cai nay') ||
    c.includes('san pham nay') ||
    c.includes('sua kho') ||
    c.includes('ve 0') ||
    c.includes('thanh 0') ||
    c.includes('co nen nhap') ||
    c.includes('co can nhap') ||
    c.includes('nen nhap')
  ) {
    return false;
  }

  return (
    c.includes('sap het') ||
    c.includes('mon nao sap het') ||
    c.includes('cai gi sap het') ||
    c.includes('hang sap het') ||
    c.includes('san pham sap het') ||
    c.includes('canh bao het hang') ||
    c.includes('canh bao ton kho') ||
    c.includes('can date') ||
    c.includes('ton thap') ||
    c.includes('duoi dinh muc') ||
    (c.includes('duoi') && (c.includes('cai') || c.includes('mon')) && (c.includes('con') || c.includes('ton'))) ||
    c === 'sap het' ||
    c === 'het hang' ||
    (c.includes('het hang') && (c.includes('danh sach') || c.includes('nhung') || c.includes('tat ca') || c.includes('cac') || c.includes('mon nao') || c.includes('hang nao') || c.includes('cai nao') || c.includes('canh bao')))
  );
}

/**
 * Detect replenishment advice queries (READ only, never write):
 * e.g., "có nên nhập k", "có nên nhập không", "có nên nhập thêm không", "mặt này có cần nhập không"
 */
export function isReplenishmentAdviceQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;
  return (
    c.includes('co nen nhap') ||
    c.includes('co can nhap') ||
    c.includes('nen nhap khong') ||
    c.includes('can nhap khong') ||
    c === 'co nen nhap k' ||
    c === 'co nen nhap ko' ||
    c === 'co nen nhap khong' ||
    c === 'co can nhap k' ||
    c === 'co can nhap ko' ||
    c === 'co can nhap khong' ||
    c === 'nen nhap k' ||
    c === 'nen nhap ko' ||
    (c.includes('nen nhap') && (c.includes('k') || c.includes('ko') || c.includes('khong') || c.includes('chua') || c.includes('them')))
  );
}


/**
 * Detect customer analytics queries:
 * e.g., "khách nào mua nhiều nhất", "ai mua nhiều nhất", "top khách hàng", "hôm nay có mấy khách", "bao nhiêu lượt khách"
 */
export function isCustomerAnalyticsQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c.includes('ai mua nhieu nhat') ||
    c.includes('khach nao mua nhieu') ||
    c.includes('top khach hang') ||
    c.includes('khach quen mua nhieu') ||
    c.includes('may khach roi') ||
    c.includes('may khach mua') ||
    c.includes('bao nhieu khach') ||
    c.includes('co may khach') ||
    c.includes('luot khach') ||
    (c.includes('khach hang') && (c.includes('nhieu nhat') || c.includes('top') || c.includes('vip') || c.includes('hom nay')))
  );
}

/**
 * Parse single product stock inquiry:
 * e.g., "còn trà đào không", "còn trà đào ko", "còn váy linen ko", "lavie còn mấy chai"
 */
export function parseSingleProductStockQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  // Exclude generic queries
  if (
    c === 'con khong' || c === 'con k' || c === 'con hang khong' ||
    c === 'kiem tra ton kho' || c === 'xem ton kho' || c === 'ton kho' ||
    c.includes('sap het') || c.includes('ban chay') || c.includes('ban cham') ||
    c.includes('tien mat') || c.includes('chuyen khoan') ||
    c.includes('co don nao') || c.includes('co bill nao') ||
    c.includes('co lai') || c.includes('co loi') ||
    c.includes('co the lam') || c.includes('co gi moi')
  ) {
    return null;
  }

  // Pattern 1: "còn/có <product_name> [không|ko|k|chưa|hết chưa]?"
  let match = c.match(/^(?:con|con lai|co)\s+(.+?)(?:\s+(?:khong|ko|k|chua|nua khong|nua ko|het chua))?$/i);
  if (match) {
    let q = stripConversationalNoise(match[1]).trim();
    q = q.replace(/^(?:may|bao nhieu|bn)\s*(?:cai|chiec|ly|mon|hop|chai)?\s+/i, '').trim();
    q = q.replace(/\s+(?:may|bao nhieu|bn)\s*(?:cai|chiec|ly|mon|hop|chai)?$/i, '').trim();
    if (q.length >= 2 && !['hang', 'mon', 'sp', 'do', 'gi', 'khach', 'don', 'tien', 'lai', 'loi'].includes(q)) {
      return q;
    }
  }

  // Pattern 2: "<product_name> còn/có [mấy|bao nhiêu|bn|không|ko|k]?"
  match = c.match(/^(.+?)\s+(?:con|con lai|co)\s+(?:may|bao nhieu|bn|khong|ko|k|chua)?(?:\s+(?:cai|chiec|ly|mon|hop|chai))?$/i);
  if (match) {
    let q = stripConversationalNoise(match[1]).trim();
    if (q.length >= 2 && !['hang', 'mon', 'sp', 'do', 'gi', 'khach', 'don', 'tien', 'lai', 'loi'].includes(q)) {
      return q;
    }
  }

  return null;
}

/**
 * Detect user frustration, error complaints, and dissatisfaction:
 * e.g., "lỗi tè le", "lỗi tùm lum", "lỗi rồi", "chả được tích sự gì", "bực mình"
 */
export function isFrustrationOrErrorReport(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c.includes('loi te le') ||
    c.includes('loi tum lum') ||
    c.includes('loi het roi') ||
    c.includes('cha duoc tich su') ||
    c.includes('cha duoc cai tac dung') ||
    c.includes('chuc nang cha duoc') ||
    c.includes('loi vo van') ||
    c.includes('sao loi the') ||
    c.includes('toan loi') ||
    c.includes('bi loi roi') ||
    c.includes('chan the') ||
    c.includes('kho dung the') ||
    c.includes('buc minh') ||
    c.includes('app lom') ||
    c.includes('bot lom') ||
    c.includes('ai lom') ||
    c.includes('bot ngu') ||
    c.includes('may ngu the')
  );
}

/**
 * Detect direct app navigation commands:
 * e.g., "mở bán hàng", "vào pos", "tạo đơn mới", "mở kho", "xem đơn hàng", "cài đặt máy in", "vào cài đặt", "thông tin cửa hàng"
 */
export function parseAppNavigationAction(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;
  const s = stripConversationalNoise(text);
  const clean = canonicalizeVietnamese(s) || c;

  // 1. Máy in / Thiết bị in
  if (
    clean === 'cai dat may in' || clean === 'vao cai dat may in' || clean === 'mo cai dat may in' ||
    clean === 'mo may in' || clean === 'vao may in' || clean === 'cai may in' ||
    clean === 'may in' || clean === 'thiet bi in' || clean === 'ket noi may in' ||
    clean === 'cau hinh may in' || clean === 'thiet lap may in' || clean === 'in va thiet bi' ||
    c.includes('cai dat may in') || c.includes('vao may in') || c.includes('ket noi may in') ||
    c.includes('thiet bi in') || c.includes('in va thiet bi') ||
    ((c.includes('cai dat') || c.includes('thiet lap') || c.includes('cau hinh') || c.startsWith('vao ') || c.startsWith('mo ')) && (c.includes('may in') || c.includes('printer')))
  ) {
    let tab = 'devices';
    if (c.includes('mau in') || c.includes('template')) tab = 'templates';
    if (c.includes('nhat ky') || c.includes('lich su in') || c.includes('job')) tab = 'jobs';
    return { actionId: 'open_print_settings', params: { tab }, label: 'Đã mở Cài đặt Máy in & Thiết bị.' };
  }

  // 2. Cài đặt hệ thống / Thiết lập chung
  if (
    clean === 'cai dat' || clean === 'mo cai dat' || clean === 'vao cai dat' ||
    clean === 'thiet lap' || clean === 'cai dat he thong' || clean === 'menu cai dat' ||
    clean === 'trang cai dat' || clean === 'settings' || clean === 'cau hinh' ||
    clean === 'mo thiet lap' || clean === 'vao thiet lap'
  ) {
    return { actionId: 'open_settings', label: 'Đã mở màn hình Cài đặt hệ thống.' };
  }

  // 3. Thông tin cửa hàng / Hồ sơ shop
  if (
    clean === 'thong tin cua hang' || clean === 'thong tin shop' || clean === 'ho so shop' ||
    clean === 'doi ten shop' || clean === 'doi ten cua hang' || clean === 'sua thong tin shop' ||
    clean === 'cai dat cua hang' || clean === 'dia chi shop' || clean === 'sdt shop' ||
    clean === 'ho so cua hang' || c.includes('thong tin cua hang') || c.includes('thong tin shop')
  ) {
    return { actionId: 'open_store_info', label: 'Đã mở Thông tin cửa hàng.' };
  }

  // 4. Chế độ kinh doanh / Mô hình kinh doanh
  if (
    clean === 'che do kinh doanh' || clean === 'mo hinh kinh doanh' ||
    clean === 'doi che do kinh doanh' || clean === 'doi mo hinh kinh doanh' ||
    clean === 'chon che do' || clean === 'nganh kinh doanh' ||
    clean === 'doi nganh kinh doanh' || c.includes('che do kinh doanh') || c.includes('mo hinh kinh doanh')
  ) {
    return { actionId: 'open_business_mode', label: 'Đã mở Chế độ kinh doanh.' };
  }

  // 5. Kiểu giao diện / Tùy chỉnh UI
  if (
    clean === 'kieu giao dien' || clean === 'doi giao dien' || clean === 'cai dat giao dien' ||
    clean === 'chon giao dien' || clean === 'giao dien' || clean === 'ui profile' ||
    c.includes('kieu giao dien') || c.includes('doi giao dien')
  ) {
    return { actionId: 'open_ui_profile', label: 'Đã mở Tùy chỉnh giao diện.' };
  }

  // 6. Bán hàng & Thanh toán
  if (
    clean === 'cai dat thanh toan' || clean === 'ban hang va thanh toan' ||
    clean === 'thanh toan va ban hang' || clean === 'phuong thuc thanh toan mac dinh' ||
    clean === 'kho mac dinh' || c.includes('cai dat thanh toan') || c.includes('ban hang va thanh toan')
  ) {
    return { actionId: 'open_sale_preferences', label: 'Đã mở Bán hàng & Thanh toán.' };
  }

  // 7. Kho hàng & Luân chuyển
  if (clean === 'cai dat kho' || clean === 'them kho' || clean === 'danh sach kho' || clean === 'quan ly kho hang') {
    return { actionId: 'open_warehouse_management', label: 'Đã mở Cài đặt Kho hàng.' };
  }
  if (
    clean === 'quan ly kho' || clean === 'kho hang' ||
    c === 'mo kho' || c === 'vao kho' || c === 'xem kho' || c === 'mo ton kho'
  ) {
    return { actionId: 'open_warehouse', label: 'Đã mở Quản lý Kho hàng.' };
  }

  // 8. Kiểm kho nhanh
  if (
    clean === 'kiem kho' || clean === 'kiem ke' || clean === 'mo kiem kho' ||
    clean === 'vao kiem kho' || clean === 'kiem ton' || clean === 'kiem ke kho' ||
    clean === 'phieu kiem kho' || c.includes('kiem kho') || c.includes('kiem ke')
  ) {
    return { actionId: 'open_stocktake', label: 'Đã mở biểu mẫu Kiểm kho nhanh.' };
  }

  // 9. Nhập kho nhanh (Strict Section 5 & 7 Invariant: Advice queries must never trigger write form)
  if (
    !isReplenishmentAdviceQuery(text) &&
    !c.includes('co nen') && !c.includes('co can') && !c.includes('nen nhap') && !c.includes('can nhap') &&
    !c.includes('thanh 0') && !c.includes('ve 0') &&
    (clean === 'nhap kho' || clean === 'nhap hang' || clean === 'mo nhap kho' ||
    clean === 'vao nhap kho' || clean === 'tao phieu nhap' || clean === 'phieu nhap' ||
    c.includes('nhap kho') || c.includes('nhap hang'))
  ) {
    return { actionId: 'open_receipt', label: 'Đã mở biểu mẫu Nhập kho nhanh.' };
  }

  // 10. Chuyển kho
  if (
    clean === 'chuyen kho' || clean === 'dieu chuyen kho' || clean === 'mo chuyen kho' ||
    (/\bchuyen kho\b/.test(c) && !c.includes('chuyen khoan')) || c.includes('dieu chuyen kho')
  ) {
    return { actionId: 'open_transfer', label: 'Đã mở biểu mẫu Chuyển kho.' };
  }

  // 11. Bán hàng (POS)
  if (
    clean === 'mo ban hang' || clean === 'vao ban hang' || clean === 'ban hang' ||
    clean === 'pos' || clean === 'vao pos' || clean === 'mo pos' ||
    clean === 'tao don moi' || clean === 'man hinh ban hang' || clean === 'quay thu ngan' ||
    clean === 'thu ngan'
  ) {
    return { actionId: 'open_sales', label: 'Đã chuyển sang màn hình Bán hàng (POS).' };
  }

  // 12. Đơn hàng
  if (
    clean === 'mo don hang' || clean === 'xem don hang' || clean === 'vao don hang' ||
    clean === 'danh sach don' || clean === 'so don' || clean === 'quan ly don hang' ||
    clean === 'don hang' || clean === 'don dat hang'
  ) {
    return { actionId: 'open_orders', label: 'Đã mở Danh sách Đơn hàng.' };
  }

  // 13. Giao dịch & Hóa đơn
  if (
    clean === 'giao dich' || clean === 'lich su giao dich' || clean === 'hoa don' ||
    clean === 'danh sach hoa don' || clean === 'phieu ban' || clean === 'xem hoa don' ||
    clean === 'danh sach giao dich' || clean === 'mo giao dich' || clean === 'so giao dich' ||
    clean === 'lich su ban' || clean === 'lich su ban hang'
  ) {
    return { actionId: 'open_transactions', label: 'Đã mở Lịch sử Giao dịch & Hóa đơn.' };
  }

  // 14. Hàng hóa / Sản phẩm
  if (
    clean === 'san pham' || clean === 'hang hoa' || clean === 'danh sach san pham' ||
    clean === 'danh sach hang hoa' || clean === 'mo san pham' || clean === 'xem san pham' ||
    clean === 'quan ly san pham' || clean === 'quan ly hang hoa' ||
    clean === 'danh muc san pham' || clean === 'danh muc hang hoa' || clean === 'danh muc' ||
    clean === 'danh muc hang' || clean === 'kho san pham'
  ) {
    return { actionId: 'open_products', label: 'Đã mở Danh sách Hàng hóa.' };
  }

  // 15. Khách hàng
  if (
    clean === 'khach hang' || clean === 'danh sach khach hang' || clean === 'danh ba khach' ||
    clean === 'mo khach hang' || clean === 'xem khach hang' || clean === 'quan ly khach hang' ||
    clean === 'danh sach khach' || clean === 'khach'
  ) {
    return { actionId: 'open_customers', label: 'Đã mở Danh sách Khách hàng.' };
  }

  // 16. Nhà cung cấp
  if (
    clean === 'nha cung cap' || clean === 'danh sach nha cung cap' || clean === 'ncc' ||
    clean === 'mo nha cung cap' || clean === 'xem nha cung cap' || clean === 'quan ly nha cung cap' ||
    clean === 'danh sach ncc'
  ) {
    return { actionId: 'open_suppliers', label: 'Đã mở Danh sách Nhà cung cấp.' };
  }

  // 17. Báo cáo
  if (
    clean === 'mo bao cao' || clean === 'xem bao cao' || clean === 'bao cao' ||
    clean === 'bao cao tai chinh' || clean === 'bao cao doanh thu' || clean === 'bao cao ban hang'
  ) {
    return { actionId: 'open_reports', label: 'Đã mở Trung tâm Báo cáo.' };
  }

  // 17b. Xuất dữ liệu & Chứng từ kế toán
  if (
    clean === 'mo xuat du lieu' || clean === 'vao xuat du lieu' || clean === 'xuat du lieu' ||
    clean === 'trung tam xuat du lieu' || clean === 'exports' || clean === 'bieu mau ke toan' ||
    clean === 'mau bieu ke toan' || clean === 'chung tu ke toan'
  ) {
    return { actionId: 'open_exports', label: 'Đã mở Trung tâm Xuất dữ liệu & Biểu mẫu kế toán.' };
  }

  // 18. Đổi trả
  if (
    clean === 'doi tra' || clean === 'tra hang' || clean === 'mo doi tra' ||
    clean === 'phieu doi tra' || clean === 'tra doi'
  ) {
    return { actionId: 'open_returns', label: 'Đã mở Trung tâm Đổi trả hàng.' };
  }

  // 19. Sổ quỹ tiền mặt (chỉ điều hướng khi có từ mở/vào)
  if (
    clean === 'mo so quy' || clean === 'vao so quy' || clean === 'xem so quy' ||
    clean === 'phieu thu' || clean === 'phieu chi' || clean === 'quy tien mat'
  ) {
    return { actionId: 'open_cash', label: 'Đã mở Sổ quỹ thu chi tiền mặt.' };
  }

  // 20. Ca bán hàng
  if (
    clean === 'ca ban hang' || clean === 'so ca' || clean === 'mo ca' ||
    clean === 'dong ca' || clean === 'giao ca' || clean === 'ca lam viec'
  ) {
    return { actionId: 'open_shift', label: 'Đã mở Quản lý Ca làm việc.' };
  }

  // 21. Cài đặt Dữ liệu (Modal)
  if (clean === 'cai dat du lieu' || clean === 'quan ly du lieu' || clean === 'menu du lieu' || clean === 'du lieu') {
    return { actionId: 'open_data_settings', label: 'Đã mở Cài đặt Dữ liệu.' };
  }

  // 21b. Sao lưu & Khôi phục (Trang Backup)
  if (
    clean === 'sao luu' || clean === 'backup' ||
    clean === 'khoi phuc du lieu' || clean === 'sao luu du lieu' ||
    clean === 'dong bo du lieu' || clean === 'dong bo'
  ) {
    return { actionId: 'open_backup', label: 'Đã mở Trung tâm Sao lưu & Dữ liệu.' };
  }

  // 22. Phân quyền & Nhân viên
  if (
    clean === 'phan quyen' || clean === 'nguoi dung' || clean === 'nhan vien' ||
    clean === 'them nhan vien' || clean === 'danh sach nhan vien' || clean === 'quan ly nhan vien'
  ) {
    return { actionId: 'open_permissions', label: 'Đã mở Quản lý Người dùng & Phân quyền.' };
  }

  // 23. Tiện ích nâng cao
  if (clean === 'tien ich nang cao' || clean === 'tien ich' || clean === 'nang cao') {
    return { actionId: 'open_advanced', label: 'Đã mở Tiện ích nâng cao.' };
  }

  // 24. Bảng giá & Giá sỉ
  if (clean === 'bang gia' || clean === 'gia si' || clean === 'cai dat gia' || clean === 'chinh sach gia') {
    return { actionId: 'open_prices', label: 'Đã mở Quản lý Bảng giá & Giá sỉ.' };
  }

  // 25. Khuyến mại
  if (clean === 'khuyen mai' || clean === 'giam gia' || clean === 'chuong trinh khuyen mai') {
    return { actionId: 'open_promos', label: 'Đã mở Quản lý Khuyến mại.' };
  }

  // 26. Công nợ
  if (clean === 'cong no' || clean === 'so no' || clean === 'quan ly cong no' || clean === 'danh sach no') {
    return { actionId: 'open_debts', label: 'Đã mở Quản lý Công nợ.' };
  }

  // 27. Tổng quan / Dashboard
  if (
    clean === 'tong quan' || clean === 'trang chu' || clean === 'dashboard' ||
    clean === 've trang chu' || clean === 've tong quan'
  ) {
    return { actionId: 'open_dashboard', label: 'Đã chuyển về màn hình Tổng quan.' };
  }

  // 28. Quét mã vạch / QR
  if (clean === 'quet ma' || clean === 'quet barcode' || clean === 'quet qr' || clean === 'may quet' || clean === 'mo may quet' || clean === 'camera quet') {
    return { actionId: 'open_scan', label: 'Đã mở Máy quét mã vạch / QR.' };
  }

  return null;
}

/**
 * Detect general polite greetings:
 * e.g., "xin chào", "chào bot", "chào em", "alo bot", "hello", "hi", "alo em ơi"
 */
export function isGreetingQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c === 'xin chao' ||
    c === 'chao' ||
    c === 'chao ban' ||
    c === 'chao em' ||
    c === 'chao bot' ||
    c === 'chao shop' ||
    c === 'chao ad' ||
    c === 'chao admin' ||
    c === 'chao tro ly' ||
    c === 'hello' ||
    c === 'hi' ||
    c === 'hey' ||
    c === 'alo' ||
    c === 'alo bot' ||
    c === 'alo em oi' ||
    c === 'alo ban oi' ||
    c === 'alo bot oi' ||
    c === 'hi bot' ||
    c === 'hi em' ||
    c === 'hello bot'
  );
}

/**
 * Detect polite gratitude & thanks:
 * e.g., "cảm ơn", "cảm ơn em", "cảm ơn bot", "thanks", "tuyệt vời", "ok cảm ơn"
 */
export function isGratitudeQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c === 'cam on' ||
    c === 'cam on em' ||
    c === 'cam on bot' ||
    c === 'cam on ban' ||
    c === 'cam on nha' ||
    c === 'cam on nhe' ||
    c === 'cam on nhieu' ||
    c === 'thanks' ||
    c === 'thank you' ||
    c === 'ok cam on' ||
    c === 'tot qua' ||
    c === 'tuyet voi' ||
    c === 'ok cam on em' ||
    c === 'ok cam on bot' ||
    c === 'tks'
  );
}

/**
 * Detect identity & who are you queries:
 * e.g., "bạn là ai", "mày là ai", "bot là ai", "em là ai", "ai đấy", "bạn tên gì"
 */
export function isIdentityQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c === 'ban la ai' ||
    c === 'may la ai' ||
    c === 'bot la ai' ||
    c === 'em la ai' ||
    c === 'ai day' ||
    c === 'day la dau' ||
    c === 'ten gi' ||
    c === 'ban ten gi' ||
    c === 'bot ten gi' ||
    c.includes('gioi thieu ban than') ||
    c.includes('gioi thieu ve ban') ||
    c.includes('ban la ai') ||
    c.includes('may la ai') ||
    c.includes('tro ly la ai')
  );
}

/**
 * Detect overall daily store operations inquiry:
 * e.g., "hôm nay thế nào", "tình hình hôm nay", "hôm nay thế nào rồi", "tình hình bán hàng thế nào", "buôn bán thế nào rồi"
 */
export function isDailyOverviewQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return false;

  return (
    c === 'hom nay the nao' ||
    c === 'tinh hinh hom nay' ||
    c === 'tinh hinh hom nay the nao' ||
    c === 'hom nay the nao roi' ||
    c === 'tinh hinh ban hang the nao' ||
    c === 'buon ban the nao roi' ||
    c === 'tinh hinh shop the nao' ||
    c === 'tinh hinh kinh doanh' ||
    c === 'tinh hinh cua hang' ||
    c === 'tinh hinh' ||
    c === 'tong quan hom nay' ||
    c === 'hom nay ra sao' ||
    (c.includes('tinh hinh') && (c.includes('hom nay') || c.includes('ban hang') || c.includes('shop') || c.includes('cua hang')))
  );
}

/**
 * Parse Vietnamese number words or formatted numeric representations:
 * e.g., "một" -> 1, "hai" -> 2, "tám chiếc" -> 8, "50 triệu" -> 50000000, "50.000.000" -> 50000000
 */
export function parseVietnameseNumberWord(str) {
  if (!str) return null;
  const s = canonicalizeVietnamese(String(str)).trim();
  
  // Format 1: Direct digit with thousand separators: 50.000.000, 50,000,000, 50000000, 500
  const cleanDigits = s.replace(/[.,](?=\d{3}\b)/g, '');
  const directMatch = cleanDigits.match(/\b\d+(?:\.\d+)?\b/);
  
  // Spoken compounds with specific values
  if (/\b(?:hai\s*cu\s*ruoi|2\s*cu\s*ruoi)\b/i.test(s)) return 2500000;
  if (/\b(?:ba\s*cu\s*ruoi|3\s*cu\s*ruoi)\b/i.test(s)) return 3500000;
  if (/\b(?:nua\s*cu)\b/i.test(s)) return 500000;
  if (/\b(?:trieu\s*ruoi|1\s*trieu\s*ruoi|1tr\s*ruoi)\b/i.test(s)) return 1500000;
  if (/\b(?:hai\s*trieu\s*ruoi|2\s*trieu\s*ruoi|2tr\s*ruoi)\b/i.test(s)) return 2500000;
  if (/\b(?:tram\s*ruoi|1\s*tram\s*ruoi|150k)\b/i.test(s)) return 150000;
  if (/\b(?:hai\s*tram\s*ruoi|2\s*tram\s*ruoi|250k)\b/i.test(s)) return 250000;
  if (/\b(?:nua\s*ta)\b/i.test(s)) return 6;
  if (/\b(?:mot\s*ta|1\s*ta)\b/i.test(s)) return 12;
  if (/\b(?:mot\s*doi|1\s*doi)\b/i.test(s)) return 2;
  if (/\b(?:hai\s*chuc|2\s*chuc)\b/i.test(s)) return 20;
  if (/\b(?:ba\s*chuc|3\s*chuc)\b/i.test(s)) return 30;
  if (/\b(?:bon\s*chuc|4\s*chuc)\b/i.test(s)) return 40;
  if (/\b(?:nam\s*chuc|5\s*chuc)\b/i.test(s)) return 50;

  // Multipliers with attached or separate units: 500k, 50tr, 50 trieu, 50 cu, 2 lit
  const cuMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:cu|m)\b/i);
  if (cuMatch) {
    return Math.round(parseFloat(cuMatch[1].replace(',', '.')) * 1000000);
  }
  const litMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*lit\b/i);
  if (litMatch) {
    return Math.round(parseFloat(litMatch[1].replace(',', '.')) * 100000);
  }
  const vanMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*van\b/i);
  if (vanMatch) {
    return Math.round(parseFloat(vanMatch[1].replace(',', '.')) * 10000);
  }
  const kMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
  }
  const trMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*tr\b/i);
  if (trMatch) {
    return Math.round(parseFloat(trMatch[1].replace(',', '.')) * 1000000);
  }
  const trieuMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*trieu\b/i);
  if (trieuMatch) {
    return Math.round(parseFloat(trieuMatch[1].replace(',', '.')) * 1000000);
  }
  const nghinMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:nghin|ngan)\b/i);
  if (nghinMatch) {
    return Math.round(parseFloat(nghinMatch[1].replace(',', '.')) * 1000);
  }
  const chucMatch = s.match(/\b(\d+(?:[.,]\d+)?)\s*chuc\b/i);
  if (chucMatch) {
    return Math.round(parseFloat(chucMatch[1].replace(',', '.')) * 10);
  }

  // Word-based multipliers (triệu, nghìn, ngàn, củ)
  if (/\b(?:trieu|cu)\b/i.test(s)) {
    const num = directMatch ? parseFloat(directMatch[0]) : (
      /\bmot\b/i.test(s) ? 1 : /\bhai\b/i.test(s) ? 2 : /\bba\b/i.test(s) ? 3 : (/\bbon\b/i.test(s) || /\btu\b/i.test(s)) ? 4 :
      /\bnam\b/i.test(s) ? 5 : /\bsau\b/i.test(s) ? 6 : /\bbay\b/i.test(s) ? 7 : /\btam\b/i.test(s) ? 8 : /\bchin\b/i.test(s) ? 9 :
      /\bmuoi\b/i.test(s) ? 10 : null
    );
    if (num !== null) return Math.round(num * 1000000);
  }
  if (/\b(?:nghin|ngan)\b/i.test(s)) {
    const num = directMatch ? parseFloat(directMatch[0]) : (
      /\bmot\b/i.test(s) ? 1 : /\bhai\b/i.test(s) ? 2 : /\bba\b/i.test(s) ? 3 : (/\bbon\b/i.test(s) || /\btu\b/i.test(s)) ? 4 :
      /\bnam\b/i.test(s) ? 5 : /\bsau\b/i.test(s) ? 6 : /\bbay\b/i.test(s) ? 7 : /\btam\b/i.test(s) ? 8 : /\bchin\b/i.test(s) ? 9 :
      /\bmuoi\b/i.test(s) ? 10 : null
    );
    if (num !== null) return Math.round(num * 1000);
  }
  if (/\b(?:lit)\b/i.test(s)) {
    const num = directMatch ? parseFloat(directMatch[0]) : (
      /\bmot\b/i.test(s) ? 1 : /\bhai\b/i.test(s) ? 2 : /\bba\b/i.test(s) ? 3 : (/\bbon\b/i.test(s) || /\btu\b/i.test(s)) ? 4 :
      /\bnam\b/i.test(s) ? 5 : null
    );
    if (num !== null) return Math.round(num * 100000);
  }
  
  if (directMatch) {
    return parseFloat(directMatch[0]);
  }
  
  // Spelled numbers map
  const WORD_MAP = {
    'khong': 0, 'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'tu': 4,
    'nam': 5, 'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9, 'muoi': 10,
    'chuc': 10, 'nua ta': 6, 'ta': 12, 'doi': 2
  };
  for (const [w, val] of Object.entries(WORD_MAP)) {
    const rx = new RegExp(`\\b${w}\\b`, 'i');
    if (rx.test(s)) return val;
  }
  return null;
}

/**
 * Parse contextual stock adjustment / activate in-stock:
 * e.g., "kích hoạt còn hàng số lượng một chiếc", "kích hoạt còn hàng 5 cái", "kích hoạt còn hàng",
 * "cho cái này còn 10 cái", "chỉnh tồn kho thành 1 chiếc", "sửa tồn kho thành 10", "còn 1 chiếc", "thực tế còn 5 cái"
 */
export function parseContextualStockAdjustment(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  // Zero stock adjustment explicit patterns: e.g. "sửa kho thành 0", "chỉnh kho về 0", "về 0", "thành 0"
  const matchZero = c.match(/(?:sua|chinh|dat|ve|thanh|cho ve|cho thanh)\s*(?:ton\s*kho|kho|ton)?\s*(?:ve|thanh|=|sang)?\s*(\d+)/) ||
                    c.match(/(?:sua\s*kho|chinh\s*kho|sua\s*ton|chinh\s*ton)\s*(?:ve|thanh)?\s*(\d+)/);
  if (matchZero) {
    const targetQty = parseInt(matchZero[1], 10);
    return { type: 'SET_STOCK', qty: targetQty, targetQty, isZero: targetQty === 0, raw: c };
  }
  if (c === 'sua kho thanh 0' || c === 'sua kho ve 0' || c === 'chinh kho thanh 0' || c === 'chinh kho ve 0' || c === 've 0' || c === 'thanh 0') {
    return { type: 'SET_STOCK', qty: 0, targetQty: 0, isZero: true, raw: c };
  }

  // Patterns for setting stock / activating stock
  const isActivateInStock = (
    c.includes('kich hoat con hang') ||
    c.includes('kich hoat lai con hang') ||
    c.includes('cho con hang') ||
    c.includes('dat con hang') ||
    c.includes('bao con hang') ||
    c.includes('kich hoat ton kho') ||
    c.includes('mo lai con hang') ||
    c.includes('bat con hang') ||
    (c.includes('con hang') && (c.includes('so luong') || c.includes('chiec') || c.includes('cai') || c.includes('kich hoat') || c.includes('cho')))
  );

  const isSetStockExplicit = (
    c.includes('chinh ton kho thanh') ||
    c.includes('sua ton kho thanh') ||
    c.includes('chinh so luong thanh') ||
    c.includes('sua so luong thanh') ||
    c.includes('chot ton kho') ||
    c.includes('chot ton') ||
    c.includes('kiem kho con') ||
    c.includes('kiem ke con') ||
    c.includes('dat ton kho') ||
    c.includes('dat so luong') ||
    c.includes('cap nhat ton kho') ||
    c.includes('ton thuc te la') ||
    c.includes('so luong thuc te la') ||
    (c.startsWith('con ') && (c.includes('cai') || c.includes('chiec') || c.includes('hop') || c.includes('goi') || c.includes('sp'))) ||
    c.startsWith('thuc te con ')
  );

  if (isActivateInStock || isSetStockExplicit) {
    const qty = parseVietnameseNumberWord(c);
    let prodQuery = null;
    const matchProd = c.match(/(?:kich hoat con hang|cho con hang|chinh ton kho|sua ton kho|chot ton|kiem kho)\s+(?:cho\s+)?(?:san pham\s+|mat hang\s+|sp\s+)?(.+?)(?=\s+(?:so luong|thanh|la|\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\b|$)/i);
    if (matchProd) {
      let p = matchProd[1].trim();
      p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay)\b/gi, '').trim();
      if (p.length >= 2 && !p.includes('con hang')) {
        prodQuery = p;
      }
    }
    return {
      type: 'SET_STOCK',
      qty: qty !== null && qty >= 0 ? qty : 1,
      isActivate: isActivateInStock,
      productQuery: prodQuery,
      raw: c
    };
  }

  return null;
}

/**
 * Parse contextual stock increase (Nhập thêm / bổ sung):
 * e.g., "thêm 8 chiếc", "thêm 5 cái", "nhập thêm 10 cái", "nhập 8 chiếc", "bổ sung 5 cái", "cộng thêm 3 cái"
 */
export function parseContextualStockIncrease(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  // Exclude cart / order additions or simple greetings
  if (c.includes('vao gio') || c.includes('them vao gio') || c.includes('them vao don')) return null;

  const isIncrease = (
    c.startsWith('them ') ||
    c.startsWith('nhap them ') ||
    c.startsWith('nhap vao ') ||
    c.startsWith('bo sung ') ||
    c.startsWith('cong them ') ||
    (c.startsWith('nhap ') && !c.includes('hang ve') && !c.includes('tu dau'))
  );

  if (isIncrease) {
    const qty = parseVietnameseNumberWord(c);
    if (qty !== null && qty > 0) {
      let prodQuery = null;
      const matchProd = c.match(/(?:them|nhap them|nhap vao|bo sung|cong them|nhap)\s+(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)?\s*(?:cai|chiec|hop|goi|sp|ly)?\s+(.+)$/i);
      if (matchProd) {
        let p = matchProd[1].trim();
        p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay|vao kho\s+[a-z0-9\s]+)\b/gi, '').trim();
        if (p.length >= 2 && !p.startsWith('kho')) {
          prodQuery = p;
        }
      }
      return {
        type: 'ADD_STOCK',
        qty,
        productQuery: prodQuery,
        raw: c
      };
    }
  }

  return null;
}

/**
 * Parse contextual stock decrease or mark zero:
 * e.g., "hết hàng rồi", "báo hết hàng", "cái này hết rồi", "cho về 0", "chỉnh tồn về 0", "giảm 2 cái", "xuất 3 chiếc"
 */
export function parseContextualStockDecreaseOrZero(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  const isZero = (
    c === 'het hang roi' ||
    c === 'het hang' ||
    c === 'bao het hang' ||
    c === 'cai nay het roi' ||
    c === 'san pham nay het hang' ||
    c === 'cho ve 0' ||
    c === 'chinh ton ve 0' ||
    c === 'dat ton bang 0' ||
    c.includes('ve 0') ||
    c.includes('het sach roi') ||
    c.includes('het veo') ||
    c.includes('khong con cai nao') ||
    c.includes('chay hang')
  );

  if (isZero) {
    let prodQuery = null;
    const matchProd = c.match(/(?:cho|chinh ton|dat ton)\s+(.+?)\s+ve\s+0/i);
    if (matchProd) {
      let p = matchProd[1].trim();
      p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay)\b/gi, '').trim();
      if (p.length >= 2) prodQuery = p;
    }
    return {
      type: 'SET_ZERO',
      isZero: true,
      qty: 0,
      productQuery: prodQuery,
      raw: c
    };
  }

  // HARD INVARIANT: Block export / report / document queries from contextual stock decrease
  const isDocOrExport = (
    c.includes('bao cao') ||
    c.includes('report') ||
    c.includes('excel') ||
    c.includes('xlsx') ||
    c.includes('csv') ||
    c.includes('pdf') ||
    c.includes('file') ||
    c.includes('tep') ||
    c.includes('tai ve') ||
    c.includes('tai xuong') ||
    c.includes('tai bao cao') ||
    c.includes('download') ||
    c.includes('so sach') ||
    c.includes('bang ke') ||
    c.includes('du lieu') ||
    c.includes('xuat ra') ||
    c.includes('xuat file') ||
    c.includes('xuat danh sach')
  );
  if (isDocOrExport) {
    return null;
  }

  const isDecrease = (
    c.startsWith('giam ') ||
    c.startsWith('xuat ') ||
    c.startsWith('bot ') ||
    c.startsWith('tru ') ||
    c.startsWith('xuat bot ') ||
    c.startsWith('hong ')
  );

  if (isDecrease) {
    const qty = parseVietnameseNumberWord(c);
    if (qty !== null && qty > 0) {
      let prodQuery = null;
      const matchProd = c.match(/(?:giam kho|xuat kho|tru kho|giam ton|tru ton|xuat bot|giam|xuat|bot|tru|hong)\s+(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)?\s*(?:cai|chiec|hop|goi|sp)?\s+(.+)$/i);
      if (matchProd) {
        let p = matchProd[1].trim();
        p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay|kho)\b/gi, '').trim();
        if (p.length >= 2) prodQuery = p;
      }
      return {
        type: 'REDUCE_STOCK',
        qty,
        productQuery: prodQuery,
        raw: c
      };
    }
  }

  return null;
}

/**
 * Parse product active/inactive business status changes:
 * e.g., "tôi không bán cái này nữa", "ngừng kinh doanh cái này", "tạm ngừng bán", "không bán nữa",
 * "tôi sẽ bán cái này trở lại", "bán cái này trở lại", "kích hoạt bán lại", "mở bán lại"
 */
export function parseProductStatusChange(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  const isDeactivate = (
    c.includes('khong ban cai nay nua') ||
    c.includes('ngung ban cai nay') ||
    c.includes('ngung kinh doanh') ||
    c.includes('tam ngung ban') ||
    c.includes('tam dung ban') ||
    c.includes('ngung ban sp nay') ||
    c.includes('an san pham nay') ||
    c.includes('khong kinh doanh nua') ||
    c.includes('dung ban cai nay') ||
    c.includes('dung ban san pham') ||
    c.includes('ngung ban') ||
    c.includes('bo mau') ||
    c.includes('nghi ban') ||
    c === 'khong ban nua' ||
    c === 'tam ngung'
  );

  if (isDeactivate) {
    let prodQuery = null;
    const matchProd = c.match(/(?:ngung ban|khong ban|tam dung ban|tam ngung ban|nghi ban|bo mau)\s+(?:san pham\s+|mat hang\s+|sp\s+)?(.+?)(?:\s+(?:nua|di))?$/i);
    if (matchProd) {
      let p = matchProd[1].trim();
      p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay|nua|di)\b/gi, '').trim();
      if (p.length >= 2) prodQuery = p;
    }
    return {
      action: 'DEACTIVATE',
      active: false,
      productQuery: prodQuery,
      raw: c
    };
  }

  const isReactivate = (
    c.includes('ban cai nay tro lai') ||
    c.includes('ban tro lai') ||
    c.includes('ban lai cai nay') ||
    c.includes('ban lai san pham') ||
    c.includes('kich hoat ban lai') ||
    c.includes('mo ban lai') ||
    c.includes('mo ban tro lai') ||
    c.includes('kinh doanh lai') ||
    c.includes('kinh doanh tro lai') ||
    c.includes('cho phep ban lai') ||
    c.includes('hien lai san pham') ||
    c.includes('ban tiep') ||
    c === 'ban lai' ||
    c === 'mo ban'
  );

  if (isReactivate) {
    let prodQuery = null;
    const matchProd = c.match(/(?:ban lai|mo ban lai|kich hoat ban lai|ban tiep|kinh doanh lai)\s+(?:san pham\s+|mat hang\s+|sp\s+)?(.+?)(?:\s+(?:tro lai|lai))?$/i);
    if (matchProd) {
      let p = matchProd[1].trim();
      p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay|tro lai|lai)\b/gi, '').trim();
      if (p.length >= 2) prodQuery = p;
    }
    return {
      action: 'REACTIVATE',
      active: true,
      productQuery: prodQuery,
      raw: c
    };
  }

  return null;
}

/**
 * Parse product price updates:
 * e.g., "sửa giá thành 50 triệu", "đổi giá thành 50.000.000", "chỉnh giá 500k", "bán giá 350.000",
 * "sửa giá nhập thành 40 triệu", "đổi giá vốn thành 300k", "giá nhập mới 250000"
 */
export function parseProductPriceChange(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  const isCost = (
    c.includes('gia nhap') ||
    c.includes('gia von') ||
    c.includes('gia mua') ||
    c.includes('von nhap')
  );

  const isPriceEdit = (
    c.includes('sua gia') ||
    c.includes('doi gia') ||
    c.includes('chinh gia') ||
    c.includes('thay doi gia') ||
    c.includes('gia moi') ||
    c.includes('ha gia') ||
    c.includes('tang gia') ||
    c.startsWith('ban gia ')
  );

  if (isPriceEdit || (c.includes('gia') && c.includes('thanh'))) {
    const priceVal = parseVietnameseNumberWord(c);
    if (priceVal !== null && priceVal > 0) {
      let prodQuery = null;
      const matchWithThanh = c.match(/(?:sua gia|doi gia|chinh gia|thay doi gia|ban gia|sua gia nhap|doi gia nhap|sua gia von|doi gia von)\s+(?:san pham\s+|mat hang\s+|sp\s+)?(.+?)\s+thanh\s+(.+)$/i);
      if (matchWithThanh) {
        let p = matchWithThanh[1].trim();
        p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay)\b/gi, '').trim();
        if (p.length >= 2) prodQuery = p;
      }
      return {
        type: isCost ? 'COST_PRICE' : 'SALE_PRICE',
        amount: priceVal,
        productQuery: prodQuery,
        raw: c
      };
    }
  }

  return null;
}

/**
 * Parse warehouse management queries:
 * e.g., "thêm kho mới", "tạo kho phụ", "sửa kho", "đổi tên kho", "hàng này hết hàng kia còn", "kho nào còn cái này"
 */
export function parseWarehouseManagementQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  // Multi-warehouse stock comparison: "hàng này hết hàng kia còn", "kho nào còn cái này", "kho nào hết"
  if (
    c.includes('hang nay het hang kia con') ||
    c.includes('kho nao con') ||
    c.includes('kho nao het') ||
    c.includes('con o kho nao') ||
    c.includes('ton theo kho') ||
    c.includes('phan bo kho')
  ) {
    return {
      action: 'CHECK_MULTI_WAREHOUSE',
      raw: c
    };
  }

  // Create warehouse: "thêm kho mới", "tạo kho mới", "thêm kho phụ", "tạo thêm kho"
  if (
    c.startsWith('them kho') ||
    c.startsWith('tao kho') ||
    c.startsWith('tao them kho') ||
    c.includes('them kho moi') ||
    c.includes('tao kho moi')
  ) {
    let name = (text || '').trim().replace(/^(?:thêm|tạo|tạo thêm|them|tao|tao them)\s+kho\s*(?:mới|phụ|moi|phu)?\s*/i, '').trim();
    if (!name || /^(?:mới|phụ|moi|phu)$/i.test(name)) {
      name = 'Kho phụ ' + (Math.floor(Math.random() * 90) + 10);
    }
    return {
      action: 'CREATE_WAREHOUSE',
      name: name.charAt(0).toUpperCase() + name.slice(1),
      raw: c
    };
  }

  // Edit warehouse: "sửa kho", "đổi tên kho" (excluding stock adjustments like "sửa kho thành 0", "chỉnh kho về 0")
  if (
    !c.includes('thanh 0') && !c.includes('ve 0') && !c.includes('so luong') && !/\b(ve|thanh)\s*\d+/.test(c) &&
    (c.includes('doi ten kho') || c.includes('chinh ten kho') || (c.includes('sua kho') && (c.includes('ten') || c.includes('thong tin') || c === 'sua kho')))
  ) {
    return {
      action: 'EDIT_WAREHOUSE',
      raw: c
    };
  }

  return null;
}

/**
 * Parse warehouse stock transfer commands:
 * e.g., "chuyển 5 cái từ kho trung tâm sang kho hà đông", "chuyển 10 ghế 135 sang kho phụ", "điều chuyển 2 cái sang kho hà đông"
 */
export function parseStockTransferCommand(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  if (c.startsWith('chuyen ') || c.startsWith('dieu chuyen ') || c.includes('sang kho ') || c.includes('chuyen kho ')) {
    const qty = parseVietnameseNumberWord(c) || 1;
    let fromWh = null;
    let toWh = null;
    let prodQuery = null;

    const fromMatch = c.match(/tu\s+(kho\s+[a-z0-9\s]+?)(?=\s+(?:sang|den|ve)\b|$)/i);
    if (fromMatch) fromWh = fromMatch[1].trim();

    const toMatch = c.match(/(?:sang|den|ve)\s+(kho\s+[a-z0-9\s]+?)(?=\s*$|\s+(?:tu|so luong|ghi chu)\b)/i);
    if (toMatch) toWh = toMatch[1].trim();

    const prodMatch = c.match(/(?:chuyen|dieu chuyen)\s+(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)?\s*(?:cai|chiec|hop|goi|sp)?\s*(.+?)(?=\s+(?:tu|sang|den|ve)\s+kho|$)/i);
    if (prodMatch) {
      let p = prodMatch[1].replace(/^(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:cai|chiec|hop|goi|sp)?\s*/i, '').trim();
      p = p.replace(/\b(?:cai nay|mon nay|sp nay|hang nay|nay)\b/gi, '').trim();
      if (p.length >= 2 && !p.startsWith('kho')) {
        prodQuery = p;
      }
    }

    if (toWh || c.includes('chuyen kho') || c.includes('dieu chuyen')) {
      return {
        action: 'TRANSFER_STOCK',
        qty,
        productQuery: prodQuery,
        fromWarehouse: fromWh,
        toWarehouse: toWh,
        raw: c
      };
    }
  }
  return null;
}

/**
 * Parse debt & receivables / payables queries:
 * e.g., "ai đang nợ tiền", "khách nào nợ", "tổng công nợ", "khách nợ bao nhiêu", "nợ nhà cung cấp bao nhiêu", "ncc nợ bn"
 */
export function parseDebtQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  const isDebt = (
    c.includes('cong no') ||
    c.includes('so no') ||
    c.includes('con no') ||
    c.includes('dang no') ||
    c.includes('ai no') ||
    c.includes('khach no') ||
    c.includes('no ncc') ||
    c.includes('no nha cung cap') ||
    c.includes('phai tra ncc') ||
    c.includes('phai thu khach') ||
    c.includes('no bao nhieu')
  );

  if (!isDebt) return null;

  if (c.includes('ncc') || c.includes('nha cung cap') || c.includes('phai tra') || c.includes('dau vao')) {
    return { type: 'SUPPLIER_DEBT', raw: c };
  }
  if (c.includes('khach') || c.includes('nguoi mua') || c.includes('ai no') || c.includes('phai thu')) {
    return { type: 'CUSTOMER_DEBT', raw: c };
  }
  return { type: 'TOTAL_DEBT', raw: c };
}

/**
 * Parse print & invoice actions:
 * e.g., "in lại hóa đơn", "in lại bill vừa bán", "in hóa đơn gần nhất", "cài đặt máy in", "kết nối máy in", "chọn khổ k80"
 */
export function parsePrintActionQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  if (
    c.includes('in lai hoa don') ||
    c.includes('in lai bill') ||
    c.includes('in lai don') ||
    c.includes('in hoa don gan nhat') ||
    c.includes('in bill gan nhat') ||
    c.includes('in don gan nhat') ||
    c.includes('in don moi nhat') ||
    c.includes('in bill vua ban') ||
    c.includes('in bill vua xong') ||
    c.includes('in phieu vua ban') ||
    c.includes('in lai phieu') ||
    c === 'in lai' ||
    c === 'in bill'
  ) {
    return { action: 'PRINT_LATEST_INVOICE', raw: c };
  }

  if (c.includes('in thu') || c.includes('in test') || c.includes('test may in')) {
    return { action: 'PRINT_TEST', raw: c };
  }

  if (c.includes('k80') || c.includes('kho k80') || c.includes('kho 80')) {
    return { action: 'SET_PAPER_K80', raw: c };
  }
  if (c.includes('k58') || c.includes('kho k58') || c.includes('kho 58')) {
    return { action: 'SET_PAPER_K58', raw: c };
  }

  if (
    c.includes('cai dat may in') ||
    c.includes('ket noi may in') ||
    c.includes('thiet lap may in') ||
    c.includes('cau hinh may in') ||
    c === 'may in'
  ) {
    return { action: 'PRINTER_SETTINGS', raw: c };
  }

  return null;
}

/**
 * Parse owner emotions, venting & business advice queries:
 * e.g., "hôm nay ế quá", "chán quá không có khách", "bán buôn chán thế", "làm sao để đông khách", "cách xả hàng tồn"
 */
export function parseOwnerEmotionOrAdviceQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  const isEmotionSlow = (
    c.includes('e qua') ||
    c.includes('e am') ||
    c.includes('chan qua') ||
    c.includes('buon ban chan the') ||
    c.includes('sao e the') ||
    c.includes('khong co khach') ||
    c.includes('chua co khach') ||
    c.includes('vang khach') ||
    c.includes('vang ve') ||
    c.includes('e am qua') ||
    c.includes('sao hom nay vang the') ||
    c.includes('lam sao de dong khach') ||
    c.includes('cach ban duoc nhieu hang') ||
    c.includes('cach xa hang ton') ||
    c.includes('tu van ban hang') ||
    c.includes('tu van kinh doanh')
  );

  if (isEmotionSlow) {
    return { type: 'SLOW_SALES_EMOTION', raw: c };
  }

  return null;
}

/**
 * Parse system questions or technical discrepancy queries:
 * e.g., "sao tồn kho bị âm", "tại sao giá vốn sai", "kiểm tra lỗi", "sao lệch kho", "sao lưu dữ liệu"
 */
export function parseSystemOrDataQuery(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  if (c.includes('ton kho bi am') || c.includes('ton am') || c.includes('am kho')) {
    return { action: 'NEGATIVE_STOCK_HELP', raw: c };
  }
  if (c.includes('gia von sai') || c.includes('gia von am') || c.includes('tai sao gia von')) {
    return { action: 'COST_PRICE_HELP', raw: c };
  }
  if (c.includes('sao lech kho') || c.includes('lech ton') || c.includes('lech kho')) {
    return { action: 'STOCK_MISMATCH_HELP', raw: c };
  }
  if (c.includes('sao luu') || c.includes('backup') || c.includes('dong bo google drive') || c.includes('tai ban sao luu')) {
    return { action: 'BACKUP_ACTION', raw: c };
  }
  return null;
}


