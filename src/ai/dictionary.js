/**
 * QBiz AI Dictionary Module
 * A machine-readable Vietnamese NLP dictionary for intent classification,
 * entity alias resolution, number parsing, time expressions, and text normalization.
 */

export function norm(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export const INTENT_TAXONOMY = {
  OPEN: { id: 'OPEN', triggers: ['mo', 'vao', 'di toi', 'chuyen sang', 'mo giup', 'cho vao', 'dan toi', 'xem', 'chon', 'tim lay', 'lay'] },
  CREATE: { id: 'CREATE', triggers: ['them', 'tao', 'tao moi', 'them moi', 'lap', 'khoi tao'] },
  EDIT: { id: 'EDIT', triggers: ['sua', 'doi', 'thay', 'cap nhat', 'dieu chinh', 'chinh sua'] },
  DELETE: { id: 'DELETE', triggers: ['xoa', 'bo', 'loai', 'go', 'huy'] },
  SEARCH: { id: 'SEARCH', triggers: ['tim', 'tim kiem', 'tra', 'tra cuu', 'kiem', 'xem co', 'tim lay', 'lay', 'tim giup', 'tra giup'] },
  VIEW: { id: 'VIEW', triggers: ['xem', 'hien thi', 'cho xem', 'kiem tra', 'tim lay', 'lay'] },
  ADD_QTY: { id: 'ADD_QTY', triggers: ['them', 'cong', 'tang', 'nhap them', 'nhap', 'bo sung'] },
  REMOVE_QTY: { id: 'REMOVE_QTY', triggers: ['bot', 'giam', 'tru', 'lay ra', 'xuat'] },
  MOVE: { id: 'MOVE', triggers: ['chuyen', 'chuyen kho', 'dieu chuyen', 'chuyen sang'] },
  COUNT: { id: 'COUNT', triggers: ['kiem', 'kiem kho', 'kiem ke', 'dem', 'doi chieu'] },
  PAY: { id: 'PAY', triggers: ['thanh toan', 'thu tien', 'tinh tien', 'tra tien'] },
  PRINT: { id: 'PRINT', triggers: ['in', 'in phieu', 'in hoa don', 'in tem', 'in thu', 'in lai'] },
  FILTER: { id: 'FILTER', triggers: ['loc', 'chi xem', 'hien nhung', 'tim nhung'] },
  SORT: { id: 'SORT', triggers: ['sap xep', 'xep theo', 'uu tien'] },
  REPORT: { id: 'REPORT', triggers: ['bao cao', 'thong ke', 'tong hop', 'cho biet'] },
  SUMMARIZE: { id: 'SUMMARIZE', triggers: ['tom tat', 'tong ket', 'hom nay the nao'] },
  COMPARE: { id: 'COMPARE', triggers: ['so sanh', 'doi chieu', 'chenh lech'] },
  DIAGNOSE: { id: 'DIAGNOSE', triggers: ['kiem tra loi', 'vi sao', 'tai sao', 'co van de gi'] },
  CONFIGURE: { id: 'CONFIGURE', triggers: ['cai dat', 'cau hinh', 'thiet lap', 'ket noi'] },
  BACKUP: { id: 'BACKUP', triggers: ['sao luu', 'backup'] },
  RESTORE: { id: 'RESTORE', triggers: ['khoi phuc', 'phuc hoi', 'restore'] },
  CONFIRM: { id: 'CONFIRM', triggers: ['dong y', 'ok', 'oke', 'okey', 'oki', 'uk', 'uh', 'uhm', 'u', 'duoc', 'dc', 'dung', 'chuan', 'lam di', 'tiep tuc', 'xac nhan', 'yes'] },
  CANCEL: { id: 'CANCEL', triggers: ['khong', 'ko', 'k', 'khg', 'hong', 'thoi', 'huy', 'bo', 'dung', 'khong lam', 'ko lam', 'k lam', 'cancel'] },
  UNDO: { id: 'UNDO', triggers: ['quay lai', 'hoan tac', 'lam lai nhu cu'] }
};

export const ENTITY_ALIASES = {
  PRODUCT: ['hang', 'hang hoa', 'san pham', 'mat hang', 'do', 'mon hang', 'item', 'product', 'sku', 'ma hang', 'mon'],
  SERVICE: ['dich vu', 'goi dich vu', 'lieu trinh', 'goi', 'service'],
  CUSTOMER: ['khach', 'khach hang', 'nguoi mua', 'khach le', 'dai ly', 'doi tac', 'hoi vien', 'customer'],
  SUPPLIER: ['nha cung cap', 'ncc', 'nguon hang', 'supplier', 'dau nguon'],
  ORDER: ['don', 'don hang', 'phieu', 'don ban', 'don cho', 'don chua xong'],
  TRANSACTION: [
    'hoa don gan nhat', 'phieu ban gan nhat', 'giao dich gan nhat',
    'hoa don moi nhat', 'phieu ban moi nhat', 'giao dich moi nhat',
    'hoa don vua ban', 'phieu vua ban', 'don vua ban', 'don gan nhat', 'phieu gan nhat',
    'hoa don', 'phieu ban', 'giao dich', 'bien lai', 'phieu thu',
    'phieu thanh toan', 'chung tu', 'so hoa don'
  ],
  WAREHOUSE: ['kho', 'kho hang', 'chi nhanh', 'kho chinh', 'kho phu'],
  SALE: ['ban', 'ban hang', 'thu ngan', 'pos', 'gio', 'gio hang', 'tinh tien'],
  SETTINGS: ['cai dat', 'thiet lap', 'setting', 'settings', 'config', 'cau hinh'],
  PRINT: [
    'cai dat may in', 'mo cai dat may in', 'cau hinh may in', 'thiet lap may in',
    'ket noi may in', 'may in hoa don', 'thiet bi in', 'in va thiet bi',
    'thiet bi va in', 'may in bill', 'may in nhiet', 'may in tem', 'may in',
    'mau in', 'cai dat mau in', 'nhat ky in', 'lich su in', 'in thu', 'in test',
    'printer', 'thiet bi'
  ],
  REPORT: ['bao cao', 'thong ke', 'tong hop']
};

export const PRONOUN_MAP = [
  'cai nay', 'hang nay', 'san pham nay', 'mon nay', 'no', 'muc nay', 'dang xem',
  'cai vua mo', 'cai vua roi', 'don nay', 'khach nay', 'nguoi nay', 'phieu nay',
  'cai truoc', 'cai toi vua noi', 'muc dang mo', 'thang nay'
];

export const CORRECTION_PHRASES = [
  'khong phai cai do', 'y toi la', 'nham', 'sua lai', 'quay lai', 'cai kia co', 'khong phai la'
];

export const TIME_EXPRESSIONS = {
  'hom nay': 'TODAY', 'nay': 'TODAY', 'ngay hom nay': 'TODAY', 'hnay': 'TODAY',
  'hom qua': 'YESTERDAY', 'hqua': 'YESTERDAY',
  'tuan nay': 'THIS_WEEK', 'tuan truoc': 'LAST_WEEK', 'tuan trc': 'LAST_WEEK',
  'thang nay': 'THIS_MONTH', 'thg nay': 'THIS_MONTH', 'thang nay': 'THIS_MONTH',
  'thang truoc': 'LAST_MONTH', 'thg trc': 'LAST_MONTH', 'thang trc': 'LAST_MONTH',
  'nam nay': 'THIS_YEAR',
  'sang nay': 'TODAY_MORNING', 'chieu nay': 'TODAY_AFTERNOON', 'toi nay': 'TODAY_EVENING',
  '7 ngay qua': 'LAST_7_DAYS', '30 ngay qua': 'LAST_30_DAYS'
};

export const VIET_NUMBERS = {
  mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10
};

export const MULTIPLIERS = {
  chuc: 10, tram: 100, nghin: 1000, ngan: 1000, k: 1000, trieu: 1000000, tr: 1000000
};

export const SPELLED_COMPOUNDS = [
  { pattern: /\b(?:nua\s+ta)\b/i, value: 6, raw: 'nua ta' },
  { pattern: /\b(?:mot\s+ta)\b/i, value: 12, raw: 'mot ta' },
  { pattern: /\b(?:hai\s+ta)\b/i, value: 24, raw: 'hai ta' },
  { pattern: /\bta\b/i, value: 12, raw: 'ta' },
  { pattern: /\b(?:mot\s+chuc)\b/i, value: 10, raw: 'mot chuc' },
  { pattern: /\b(?:hai\s+chuc)\b/i, value: 20, raw: 'hai chuc' },
  { pattern: /\b(?:ba\s+chuc)\b/i, value: 30, raw: 'ba chuc' },
  { pattern: /\b(?:bon\s+chuc)\b/i, value: 40, raw: 'bon chuc' },
  { pattern: /\b(?:nam\s+chuc)\b/i, value: 50, raw: 'nam chuc' },
  { pattern: /\b(?:sau\s+chuc)\b/i, value: 60, raw: 'sau chuc' },
  { pattern: /\b(?:bay\s+chuc)\b/i, value: 70, raw: 'bay chuc' },
  { pattern: /\b(?:tam\s+chuc)\b/i, value: 80, raw: 'tam chuc' },
  { pattern: /\b(?:chin\s+chuc)\b/i, value: 90, raw: 'chin chuc' },
  { pattern: /\bchuc\b/i, value: 10, raw: 'chuc' },
  { pattern: /\b(?:hai\s+lam)\b/i, value: 25, raw: 'hai lam' },
  { pattern: /\b(?:ba\s+lam)\b/i, value: 35, raw: 'ba lam' },
  { pattern: /\b(?:bon\s+lam)\b/i, value: 45, raw: 'bon lam' },
  { pattern: /\b(?:nam\s+lam)\b/i, value: 55, raw: 'nam lam' },
  { pattern: /\b(?:muoi\s+mot)\b/i, value: 11, raw: 'muoi mot' },
  { pattern: /\b(?:muoi\s+hai)\b/i, value: 12, raw: 'muoi hai' },
  { pattern: /\b(?:muoi\s+ba)\b/i, value: 13, raw: 'muoi ba' },
  { pattern: /\b(?:muoi\s+(?:bon|tu))\b/i, value: 14, raw: 'muoi bon' },
  { pattern: /\b(?:muoi\s+(?:lam|nam))\b/i, value: 15, raw: 'muoi lam' },
  { pattern: /\b(?:muoi\s+sau)\b/i, value: 16, raw: 'muoi sau' },
  { pattern: /\b(?:muoi\s+bay)\b/i, value: 17, raw: 'muoi bay' },
  { pattern: /\b(?:muoi\s+tam)\b/i, value: 18, raw: 'muoi tam' },
  { pattern: /\b(?:muoi\s+chin)\b/i, value: 19, raw: 'muoi chin' },
  { pattern: /\b(?:hai\s+muoi)\b/i, value: 20, raw: 'hai muoi' },
  { pattern: /\b(?:ba\s+muoi)\b/i, value: 30, raw: 'ba muoi' },
  { pattern: /\b(?:bon\s+muoi)\b/i, value: 40, raw: 'bon muoi' },
  { pattern: /\b(?:nam\s+muoi)\b/i, value: 50, raw: 'nam muoi' },
];

export function parseVietnameseNumber(text) {
  text = norm(text);
  if (!text) return null;
  
  // Check spelled compound numbers first
  for (const comp of SPELLED_COMPOUNDS) {
    if (comp.pattern.test(text)) {
      return comp.value;
    }
  }

  // Try direct parsing first
  let directNum = parseFloat(text);
  if (!isNaN(directNum) && text === directNum.toString()) {
    return directNum;
  }
  
  // Handle numbers with k/tr, like 5k, 50k, 1tr2, 1.5tr
  let ktrmatch = text.match(/^(\d+(?:\.\d+)?)\s*(k|tr)$/);
  if (ktrmatch) {
    let val = parseFloat(ktrmatch[1]);
    let mult = MULTIPLIERS[ktrmatch[2]] || 1;
    return val * mult;
  }
  
  let trmatch = text.match(/^(\d+)\s*(trieu|tr)\s*(\d+)$/);
  if (trmatch) {
    let main = parseInt(trmatch[1], 10);
    let sub = parseInt(trmatch[3], 10);
    let subMult = Math.pow(10, 6 - trmatch[3].length);
    if (subMult < 1) subMult = 1;
    return main * 1000000 + sub * subMult; 
  }

  // Handle written text
  let tokens = text.split(/\s+/);
  let total = 0;
  let hasNumber = false;
  
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    
    // Check if numeric
    if (!isNaN(parseFloat(t))) {
      let num = parseFloat(t);
      
      // If next is multiplier like 'nghin', 'ngan', 'trieu', 'k'
      if (i < tokens.length - 1 && MULTIPLIERS[tokens[i+1]]) {
        total += num * MULTIPLIERS[tokens[i+1]];
        i++; // skip multiplier
      } else {
        total += num;
      }
      hasNumber = true;
    } else if (VIET_NUMBERS[t]) {
      let num = VIET_NUMBERS[t];
      
      if (i < tokens.length - 1 && MULTIPLIERS[tokens[i+1]]) {
        total += num * MULTIPLIERS[tokens[i+1]];
        i++;
      } else {
        total += num;
      }
      hasNumber = true;
    } else if (MULTIPLIERS[t]) {
       // if starting with multiplier or standalone multiplier, e.g. "chuc" => 10
       if (total === 0) {
           total = MULTIPLIERS[t];
           hasNumber = true;
       } else {
           total *= MULTIPLIERS[t];
       }
    }
  }
  
  if (hasNumber) return total;
  return null;
}

export const UNIT_DICTIONARY = [
  'tui', 'chai', 'lo', 'hop', 'thung', 'goi', 'cai', 'chiec', 'bo', 'kg', 'g', 'lit', 'ml', 'met', 'cuon', 'vi', 'lon'
];

export const COUNTABLE_UNITS = [
  'cai', 'chiec', 'hop', 'bo', 'thung', 'lan', 'buoi'
];

export const PAYMENT_METHODS = {
  'tien mat': 'cash', 'cash': 'cash', 'mat': 'cash',
  'chuyen khoan': 'transfer', 'ck': 'transfer',
  'qr': 'qr', 'vietqr': 'qr'
};

export function classifyIntent(normalizedText) {
  if (!normalizedText) return null;
  
  let bestMatch = null;
  let maxConfidence = 0;
  let maxLen = 0;
  
  for (let [key, intentDef] of Object.entries(INTENT_TAXONOMY)) {
    for (let trigger of intentDef.triggers) {
      // Use word boundaries so 'u' doesn't match 'quy', 'bo' doesn't match 'bao cao'
      const rx = new RegExp(`(?:^|\\s)${trigger.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:\\s|$)`, 'i');
      if (rx.test(normalizedText)) {
        let confidence = 80;
        // higher confidence if it starts with the trigger
        if (normalizedText.startsWith(trigger)) {
          confidence += 15;
        }
        
        if (trigger.length > maxLen || (trigger.length === maxLen && confidence > maxConfidence)) {
          maxLen = trigger.length;
          maxConfidence = confidence;
          bestMatch = { intent: intentDef.id, confidence: maxConfidence, trigger: trigger };
        }
      }
    }
  }
  
  return bestMatch;
}

export function detectEntityType(normalizedText) {
  if (!normalizedText) return null;
  
  let bestMatch = null;
  let maxConfidence = 0;
  let maxLen = 0;
  
  for (let [entityType, aliases] of Object.entries(ENTITY_ALIASES)) {
    for (let alias of aliases) {
      if (alias === 'hang' && (normalizedText.includes('cua hang') || normalizedText.includes('don hang'))) {
        continue;
      }
      // Look for exact word match with regex boundaries
      let rx = new RegExp(`\\b${alias}\\b`, 'i');
      if (rx.test(normalizedText)) {
        let confidence = 90;
        if (alias.length > maxLen) {
          maxLen = alias.length;
          maxConfidence = confidence;
          bestMatch = { entityType: entityType, alias: alias, confidence: maxConfidence };
        }
      }
    }
  }

  // Domain Entity Priority: Specific target domains like TRANSACTION must override generic ORDER/SETTINGS
  if (
    normalizedText.includes('hoa don') || normalizedText.includes('phieu ban') ||
    normalizedText.includes('giao dich') || normalizedText.includes('bien lai') ||
    normalizedText.includes('phieu thu')
  ) {
    if (!normalizedText.includes('may in hoa don') && !normalizedText.includes('cai dat in hoa don') && !normalizedText.includes('mau in hoa don')) {
      bestMatch = { entityType: 'TRANSACTION', alias: 'hoa don', confidence: 95 };
    }
  }

  // Domain Entity Priority: Specific target domains like PRINT must override generic SETTINGS
  if (bestMatch?.entityType === 'SETTINGS') {
    if (
      normalizedText.includes('may in') || normalizedText.includes('thiet bi in') ||
      normalizedText.includes('in hoa don') || normalizedText.includes('in bill') ||
      normalizedText.includes('mau in') || normalizedText.includes('nhat ky in') ||
      normalizedText.includes('in tem') || normalizedText.includes('in thu') ||
      normalizedText.includes('printer')
    ) {
      bestMatch = { entityType: 'PRINT', alias: 'may in', confidence: 95 };
    }
  }
  
  return bestMatch;
}

export function isPronounReference(normalizedText) {
  if (!normalizedText) return false;
  return PRONOUN_MAP.some(p => new RegExp(`\\b${p}\\b`, 'i').test(normalizedText));
}

export function isConfirmation(normalizedText) {
  if (!normalizedText) return false;
  // If it starts with "đúng", it must be followed by affirmative particles.
  // Any "dung" followed by an action verb or other word (e.g. "dung nhap", "dung kiem", "dung chuyen") is "đừng" (prohibition), NOT confirmation!
  if (/^dung\s+/i.test(normalizedText)) {
    const isAffirmation = /^dung\s+(?:roi|vay|day|do|the|chuan|chinh\s+xac|nhe|nha)\b/i.test(normalizedText);
    if (!isAffirmation) return false;
  }
  return INTENT_TAXONOMY.CONFIRM.triggers.some(t => {
      let rx = new RegExp(`^${t}\\b`, 'i');
      return rx.test(normalizedText) || normalizedText === t;
  });
}

export function isCancellation(normalizedText) {
  if (!normalizedText) return false;
  // If it starts with "bỏ vào", "bỏ vô", "bỏ thêm", "bỏ qua", "bỏ ra", "bỏ khỏi", it is NOT a session cancellation!
  if (/^bo\s+(?:vao|vo|them|qua|ra|khoi|bot)\b/i.test(normalizedText)) {
    return false;
  }
  return INTENT_TAXONOMY.CANCEL.triggers.some(t => {
      let rx = new RegExp(`^${t}\\b`, 'i');
      return rx.test(normalizedText) || normalizedText === t;
  });
}

export function isCorrection(normalizedText) {
  if (!normalizedText) return false;
  return CORRECTION_PHRASES.some(p => normalizedText.includes(p));
}

export function parseTimeExpression(normalizedText) {
  if (!normalizedText) return null;
  
  let bestMatch = null;
  let maxLen = 0;
  
  for (let [expr, timeConst] of Object.entries(TIME_EXPRESSIONS)) {
    let rx = new RegExp(`\\b${expr}\\b`, 'i');
    if (rx.test(normalizedText) && expr.length > maxLen) {
      maxLen = expr.length;
      bestMatch = timeConst;
    }
  }
  
  return bestMatch;
}

export function extractQuantityAndUnit(normalizedText) {
  if (!normalizedText) return null;
  const cleanText = normalizedText
    .replace(/[.,!?:;]+$/g, '')
    .replace(/\s*(?:ho|giup)\s+(?:toi|minh|em|anh|chi)\s*/g, ' ')
    .trim();
  
  let qty = null;
  let numStr = null;

  // 1. Try compound spelled numbers first (e.g. hai chuc, mot ta, muoi tam, hai lam)
  for (const comp of SPELLED_COMPOUNDS) {
    const match = cleanText.match(comp.pattern);
    if (match) {
      qty = comp.value;
      numStr = match[0];
      break;
    }
  }

  // 2. Fall back to standard numeric / single word match
  if (qty === null) {
    // Strip phone numbers so they don't get misparsed as huge quantities
    const textWithoutPhone = cleanText.replace(/\b0\d{8,10}\b/g, ' ');
    const numMatch = textWithoutPhone.match(/(?:\d+(?:\.\d+)?(?:k|tr)?|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)/i);
    if (!numMatch) return null;
    numStr = numMatch[0];
    qty = parseVietnameseNumber(numStr);
    if (qty === null) return null;
  }
  
  // Find unit
  let unitFound = null;
  let textAfterNum = cleanText.substring(cleanText.indexOf(numStr) + numStr.length);
  
  // Try to find a unit right after the number
  for (let unit of UNIT_DICTIONARY) {
    let rx = new RegExp(`^\\s*${unit}\\b`, 'i');
    if (rx.test(textAfterNum)) {
      unitFound = unit;
      break;
    }
  }
  
  // Try to find any unit in the whole text if not found yet
  if (!unitFound) {
      for (let unit of UNIT_DICTIONARY) {
          let rx = new RegExp(`\\b${unit}\\b`, 'i');
          if (rx.test(normalizedText)) {
              unitFound = unit;
              break;
          }
      }
  }
  
  let rawStr = numStr;
  if (unitFound) {
    let unitRegex = new RegExp(`\\s*${unitFound}\\b`, 'i');
    let uMatch = textAfterNum.match(unitRegex);
    if (uMatch) {
       rawStr += uMatch[0];
    } else {
       rawStr += " " + unitFound;
    }
  }
  
  return {
    quantity: qty,
    unit: unitFound,
    raw: rawStr.trim()
  };
}
