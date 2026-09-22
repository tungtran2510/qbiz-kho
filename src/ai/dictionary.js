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
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export const INTENT_TAXONOMY = {
  OPEN: { id: 'OPEN', triggers: ['mo', 'vao', 'di toi', 'chuyen sang', 'mo giup', 'cho vao', 'dan toi', 'xem'] },
  CREATE: { id: 'CREATE', triggers: ['them', 'tao', 'tao moi', 'them moi', 'lap', 'khoi tao'] },
  EDIT: { id: 'EDIT', triggers: ['sua', 'chinh', 'doi', 'thay', 'cap nhat', 'dieu chinh'] },
  DELETE: { id: 'DELETE', triggers: ['xoa', 'bo', 'loai', 'go', 'huy'] },
  SEARCH: { id: 'SEARCH', triggers: ['tim', 'tim kiem', 'tra', 'tra cuu', 'kiem', 'xem co'] },
  VIEW: { id: 'VIEW', triggers: ['xem', 'hien thi', 'cho xem', 'kiem tra'] },
  ADD_QTY: { id: 'ADD_QTY', triggers: ['them', 'cong', 'tang', 'nhap them', 'bo sung'] },
  REMOVE_QTY: { id: 'REMOVE_QTY', triggers: ['bot', 'giam', 'tru', 'lay ra', 'xuat'] },
  MOVE: { id: 'MOVE', triggers: ['chuyen', 'chuyen kho', 'dieu chuyen', 'chuyen sang'] },
  COUNT: { id: 'COUNT', triggers: ['kiem', 'kiem kho', 'kiem ke', 'dem', 'doi chieu'] },
  PAY: { id: 'PAY', triggers: ['thanh toan', 'thu tien', 'tinh tien', 'tra tien'] },
  PRINT: { id: 'PRINT', triggers: ['in', 'in phieu', 'in hoa don', 'in tem', 'in thu'] },
  FILTER: { id: 'FILTER', triggers: ['loc', 'chi xem', 'hien nhung', 'tim nhung'] },
  SORT: { id: 'SORT', triggers: ['sap xep', 'xep theo', 'uu tien'] },
  REPORT: { id: 'REPORT', triggers: ['bao cao', 'thong ke', 'tong hop', 'cho biet'] },
  SUMMARIZE: { id: 'SUMMARIZE', triggers: ['tom tat', 'tong ket', 'hom nay the nao'] },
  COMPARE: { id: 'COMPARE', triggers: ['so sanh', 'doi chieu', 'chenh lech'] },
  DIAGNOSE: { id: 'DIAGNOSE', triggers: ['kiem tra loi', 'vi sao', 'tai sao', 'co van de gi'] },
  CONFIGURE: { id: 'CONFIGURE', triggers: ['cai', 'cai dat', 'cau hinh', 'thiet lap'] },
  BACKUP: { id: 'BACKUP', triggers: ['sao luu', 'backup'] },
  RESTORE: { id: 'RESTORE', triggers: ['khoi phuc', 'phuc hoi', 'restore'] },
  CONFIRM: { id: 'CONFIRM', triggers: ['dong y', 'ok', 'oke', 'okey', 'u', 'uh', 'duoc', 'dung', 'chuan', 'lam di', 'tiep tuc', 'xac nhan', 'yes'] },
  CANCEL: { id: 'CANCEL', triggers: ['khong', 'thoi', 'huy', 'bo', 'dung', 'khong lam', 'cancel'] },
  UNDO: { id: 'UNDO', triggers: ['quay lai', 'hoan tac', 'lam lai nhu cu'] }
};

export const ENTITY_ALIASES = {
  PRODUCT: ['hang', 'hang hoa', 'san pham', 'mat hang', 'do', 'mon hang', 'item', 'product', 'sku', 'ma hang', 'mon'],
  SERVICE: ['dich vu', 'goi dich vu', 'lieu trinh', 'goi', 'service'],
  CUSTOMER: ['khach', 'khach hang', 'nguoi mua', 'khach le', 'dai ly', 'doi tac', 'hoi vien', 'customer'],
  SUPPLIER: ['nha cung cap', 'ncc', 'nguon hang', 'supplier', 'dau nguon'],
  ORDER: ['don', 'don hang', 'phieu', 'don ban', 'don cho', 'don chua xong'],
  WAREHOUSE: ['kho', 'kho hang', 'chi nhanh', 'kho chinh', 'kho phu'],
  SALE: ['ban', 'ban hang', 'thu ngan', 'pos', 'gio', 'gio hang', 'tinh tien'],
  SETTINGS: ['cai dat', 'thiet lap', 'setting', 'settings', 'config', 'cau hinh'],
  PRINT: ['may in', 'in', 'printer', 'thiet bi in', 'may in hoa don'],
  REPORT: ['bao cao', 'thong ke', 'tong hop']
};

export const PRONOUN_MAP = [
  'cai nay', 'hang nay', 'san pham nay', 'mon nay', 'no', 'muc nay', 'dang xem',
  'cai vua mo', 'cai vua roi', 'don nay', 'khach nay', 'nguoi nay', 'phieu nay',
  'cai truoc', 'cai toi vua noi', 'muc dang mo', 'thang nay'
];

export const CORRECTION_PHRASES = [
  'khong phai cai do', 'y toi la', 'nham', 'sua lai', 'quay lai', 'cai kia co', 'khong la'
];

export const TIME_EXPRESSIONS = {
  'hom nay': 'TODAY', 'nay': 'TODAY', 'ngay hom nay': 'TODAY',
  'hom qua': 'YESTERDAY', 'tuan nay': 'THIS_WEEK', 'tuan truoc': 'LAST_WEEK',
  'thang nay': 'THIS_MONTH', 'thang truoc': 'LAST_MONTH', 'nam nay': 'THIS_YEAR',
  'sang nay': 'TODAY_MORNING', 'chieu nay': 'TODAY_AFTERNOON', 'toi nay': 'TODAY_EVENING',
  '7 ngay qua': 'LAST_7_DAYS', '30 ngay qua': 'LAST_30_DAYS'
};

export const VIET_NUMBERS = {
  mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10
};

export const MULTIPLIERS = {
  chuc: 10, tram: 100, nghin: 1000, ngan: 1000, k: 1000, trieu: 1000000, tr: 1000000
};

export function parseVietnameseNumber(text) {
  text = norm(text);
  if (!text) return null;
  
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
  
  return bestMatch;
}

export function isPronounReference(normalizedText) {
  if (!normalizedText) return false;
  return PRONOUN_MAP.some(p => new RegExp(`\\b${p}\\b`, 'i').test(normalizedText));
}

export function isConfirmation(normalizedText) {
  if (!normalizedText) return false;
  return INTENT_TAXONOMY.CONFIRM.triggers.some(t => {
      let rx = new RegExp(`^${t}\\b`, 'i');
      return rx.test(normalizedText) || normalizedText === t;
  });
}

export function isCancellation(normalizedText) {
  if (!normalizedText) return false;
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
  
  // Extract number
  let numMatch = normalizedText.match(/(?:\d+(?:\.\d+)?(?:k|tr)?|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)/i);
  if (!numMatch) return null;
  
  let numStr = numMatch[0];
  let qty = parseVietnameseNumber(numStr);
  
  if (qty === null) return null;
  
  // Find unit
  let unitFound = null;
  let textAfterNum = normalizedText.substring(normalizedText.indexOf(numStr) + numStr.length);
  
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
