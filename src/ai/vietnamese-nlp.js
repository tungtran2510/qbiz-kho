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
  [/\bncc\b(?!\s*[-_]?\d)/gi, 'nha cung cap']
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
    c.includes('co bill nao chua') ||
    c.includes('co hoa don nao chua') ||
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

  return (
    c.includes('sap het') ||
    c.includes('mon nao sap het') ||
    c.includes('cai gi sap het') ||
    c.includes('hang sap het') ||
    c.includes('san pham sap het') ||
    c.includes('het hang') ||
    c.includes('canh bao het hang') ||
    c.includes('canh bao ton kho') ||
    c.includes('can date') ||
    c.includes('ton thap') ||
    c.includes('duoi dinh muc') ||
    (c.includes('duoi') && (c.includes('cai') || c.includes('mon')) && (c.includes('con') || c.includes('ton'))) ||
    c === 'sap het' ||
    c === 'het hang'
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
 * e.g., "mở bán hàng", "vào pos", "tạo đơn mới", "mở kho", "xem đơn hàng", "cài đặt máy in"
 */
export function parseAppNavigationAction(text) {
  const c = canonicalizeVietnamese(text);
  if (!c) return null;

  // POS / Bán hàng
  if (
    c === 'mo ban hang' || c === 'vao ban hang' || c === 'mo pos' ||
    c === 'vao pos' || c === 'tao don moi' || c === 'man hinh ban hang'
  ) {
    return { actionId: 'open_sales', label: 'Đã chuyển sang màn hình Bán hàng (POS).' };
  }

  // Kho
  if (c === 'mo kho' || c === 'vao kho' || c === 'xem kho' || c === 'danh sach kho' || c === 'mo ton kho') {
    return { actionId: 'open_warehouse', label: 'Đã mở màn hình Quản lý Kho.' };
  }

  // Đơn hàng
  if (c === 'mo don hang' || c === 'xem don hang' || c === 'vao don hang' || c === 'danh sach don' || c === 'so don' || c === 'danh sach hoa don') {
    return { actionId: 'open_orders', label: 'Đã mở màn hình Danh sách Đơn hàng.' };
  }

  // Báo cáo
  if (c === 'mo bao cao' || c === 'xem bao cao' || c === 'bao cao tai chinh') {
    return { actionId: 'open_reports', label: 'Đã mở màn hình Báo cáo kinh doanh.' };
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
      const matchProd = c.match(/(?:giam|xuat|bot|tru|hong)\s+(?:\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)?\s*(?:cai|chiec|hop|goi|sp)?\s+(.+)$/i);
      if (matchProd) {
        let p = matchProd[1].trim();
        p = p.replace(/\b(?:cai nay|mon nay|sp nay|nay)\b/gi, '').trim();
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

  // Edit warehouse: "sửa kho", "đổi tên kho"
  if (c.includes('sua kho') || c.includes('doi ten kho') || c.includes('chinh ten kho')) {
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



