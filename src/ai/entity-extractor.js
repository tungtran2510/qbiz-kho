/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — LOCAL NLP ENTITY EXTRACTION ENGINE (STAGE 2)
 * Extracts structured entities (action, product, quantity, unit, price/cost, warehouse, supplier, customer)
 * from natural Vietnamese conversational warehouse and retail commands.
 * Runs 100% locally with zero cloud dependencies and < 10ms execution time.
 */

import { norm } from './dictionary.js';
import { resolveProduct, resolveWarehouse, resolveCustomer, resolveSupplier } from './resolver.js';
import { parseVietnameseCurrency } from './vietnamese-nlp.js';

/**
 * Common Vietnamese number words to integer
 */
const WORD_NUMBERS = {
  'mot': 1, 'mốt': 1, 'một': 1,
  'hai': 2,
  'ba': 3,
  'bon': 4, 'bốn': 4, 'tư': 4,
  'nam': 5, 'năm': 5, 'lăm': 5,
  'sau': 6, 'sáu': 6,
  'bay': 7, 'bảy': 7,
  'tam': 8, 'tám': 8,
  'chin': 9, 'chín': 9,
  'muoi': 10, 'mười': 10, 'chuc': 10, 'chục': 10,
  'hai muoi': 20, 'hai chuc': 20,
  'ba muoi': 30, 'ba chuc': 30,
  'bon muoi': 40, 'bon chuc': 40,
  'nam muoi': 50, 'nam chuc': 50,
  'tram': 100, 'trăm': 100
};

/**
 * Detect action type from Vietnamese prompt
 */
function detectWarehouseActionType(normText) {
  if (!normText) return null;

  // 1. RECEIPT (Nhập kho / mua hàng / thêm hàng vào kho)
  if (
    /^(?:nhap|nhap hang|nhap kho|nhap them|nhap vao|nhap ve|mua vao|mua them|bo sung kho|them hang)\b/.test(normText) ||
    /\b(?:nhap kho|nhap hang|nhap them|mua vao)\b/.test(normText)
  ) {
    // Avoid mistaking "kiểm kho nhập", "báo cáo nhập", "xuất nhập tồn"
    if (normText.includes('xuat nhap ton') || normText.includes('bao cao') || normText.includes('lich su')) {
      return null;
    }
    return 'RECEIPT';
  }

  // 2. ISSUE (Xuất kho / giảm tồn / xuất trả / xuất bớt)
  if (
    /^(?:xuat|xuat hang|xuat kho|giam ton|xuat bot|giam kho|xuat tra|bot kho)\b/.test(normText) ||
    /\b(?:xuat kho|xuat hang|giam ton|xuat bot|xuat tra)\b/.test(normText)
  ) {
    if (normText.includes('xuat file') || normText.includes('xuat excel') || normText.includes('xuat csv') || normText.includes('xuat hoa don') || normText.includes('xuat hd') || normText.includes('xuat nhap ton')) {
      return null;
    }
    return 'ISSUE';
  }

  // 3. TRANSFER (Chuyển kho / điều chuyển)
  if (
    /^(?:chuyen|dieu chuyen|chuyen kho|chuyen hang)\b/.test(normText) ||
    /\b(?:chuyen kho|dieu chuyen|chuyen tu|chuyen sang|chuyen ve|chuyen den)\b/.test(normText)
  ) {
    if (normText.includes('chuyen khoan') || normText.includes('ck') || normText.includes('chuyen tien')) {
      return null;
    }
    return 'TRANSFER';
  }

  // 4. STOCKTAKE (Kiểm kho / kiểm kê / đối soát tồn)
  if (
    /^(?:kiem kho|kiem ke|kiem dem|doi chieu kho|kiem ton|chot kho)\b/.test(normText) ||
    /\b(?:kiem kho|kiem ke|kiem dem|chot kho)\b/.test(normText)
  ) {
    return 'STOCKTAKE';
  }

  // 5. ORDER / SALES (Bán hàng / lên đơn / xuất bán)
  if (
    /^(?:ban|tao don|len don|xuat ban|ban cho|ban giup)\b/.test(normText) ||
    /\b(?:tao don hang|len don hang|ban cho khach)\b/.test(normText)
  ) {
    return 'ORDER';
  }

  return null;
}

/**
 * Master entity extraction function for warehouse and retail operations
 * @param {string} rawPrompt Raw user query
 * @param {Object} state App state with data: { products, warehouses, customers, suppliers }
 * @param {Object} context Context envelope
 * @returns {Object|null} Extracted entities or null if not a warehouse action command
 */
export function extractWarehouseActionEntities(rawPrompt, state = {}, context = {}) {
  if (!rawPrompt || typeof rawPrompt !== 'string') return null;

  const normPrompt = norm(rawPrompt);
  const action = detectWarehouseActionType(normPrompt);
  if (!action) return null;

  let working = normPrompt;
  const products = state?.data?.products || state?.products || [];
  const warehouses = state?.data?.warehouses || state?.warehouses || [];
  const suppliers = state?.data?.suppliers || state?.suppliers || [];
  const customers = state?.data?.customers || state?.customers || [];

  // --- STEP 1: EXTRACT PRICE / COST ---
  let extractedPrice = null;
  let rawPriceStr = null;

  // Patterns: "giá 25k", "giá vốn 25.000", "đơn giá 30k", "giá nhập 1500k", "với giá 500k"
  const priceMatch = working.match(/\b(?:gia von|gia nhap|gia ban|don gia|voi gia|gia)\s*[:=]?\s*(\d+(?:[.,]\d+)*(?:\s*(?:k|nghin|ngan|tr|trieu|d|vnd))?)\b/i);
  if (priceMatch) {
    rawPriceStr = priceMatch[1].trim();
    extractedPrice = parseVietnameseCurrency(rawPriceStr);
    working = working.replace(priceMatch[0], ' ');
  } else {
    // Standalone trailing/isolated price: e.g. "25k" or "25.000 đ"
    const standalonePrice = working.match(/\b(\d+(?:[.,]\d+)*)\s*(?:k|nghin|ngan|tr|trieu|vnd)\b/i);
    if (standalonePrice && !working.includes('kho ' + standalonePrice[1])) {
      rawPriceStr = standalonePrice[0].trim();
      extractedPrice = parseVietnameseCurrency(rawPriceStr);
      working = working.replace(standalonePrice[0], ' ');
    }
  }

  // --- STEP 2: EXTRACT WAREHOUSES ---
  let targetWarehouse = null;
  let fromWarehouse = null;
  let toWarehouse = null;

  if (action === 'TRANSFER') {
    // "từ kho A sang kho B"
    const fromMatch = working.match(/\b(?:tu|o|tai)\s+(?:kho\s+)?([a-z0-9\s_]+?)(?=\s+(?:sang|den|ve|gia|cho|ly do)|$)/i);
    if (fromMatch) {
      const q = fromMatch[1].trim();
      const res = resolveWarehouse(q, warehouses, context);
      if (res.bestMatch) fromWarehouse = res.bestMatch;
      working = working.replace(fromMatch[0], ' ');
    }

    const toMatch = working.match(/\b(?:sang|den|ve|vao)\s+(?:kho\s+)?([a-z0-9\s_]+?)(?=\s+(?:tu|gia|ly do)|$)/i);
    if (toMatch) {
      const q = toMatch[1].trim();
      const res = resolveWarehouse(q, warehouses, context);
      if (res.bestMatch) toWarehouse = res.bestMatch;
      working = working.replace(toMatch[0], ' ');
    }
  } else {
    // Single warehouse for Receipt / Issue / Stocktake
    const whMatch = working.match(/\b(?:vao|ve|den|o|tai|trong|khoi|tu)\s+(?:kho\s+)?([a-z0-9\s_]+?)(?=\s+(?:gia|tu ncc|cho khach|ly do)|$)/i) ||
                    working.match(/\bkho\s+([a-z0-9\s_]+?)(?=\s+(?:gia|tu|cho)|$)/i);
    if (whMatch) {
      const q = whMatch[1].trim();
      const res = resolveWarehouse(q, warehouses, context);
      if (res.bestMatch) {
        targetWarehouse = res.bestMatch;
        working = working.replace(whMatch[0], ' ');
      }
    }
  }

  // Default warehouse fallback if not specified
  if (!targetWarehouse && warehouses.length > 0) {
    const currentWhId = context?.warehouse_id;
    targetWarehouse = warehouses.find(w => w.id === currentWhId) || warehouses[0];
  }

  // --- STEP 3: EXTRACT SUPPLIER OR CUSTOMER ---
  let extractedSupplier = null;
  let extractedCustomer = null;

  const suppMatch = working.match(/\b(?:tu\s+(?:ncc|nha cung cap)|ncc|nha cung cap)\s+([a-z0-9\s_]+?)(?=\s+(?:vao|o|tai|kho|gia|ly do)|$)/i);
  if (suppMatch) {
    const q = suppMatch[1].trim();
    const res = resolveSupplier(q, suppliers, context);
    if (res.bestMatch) extractedSupplier = res.bestMatch;
    working = working.replace(suppMatch[0], ' ');
  }

  const custMatch = working.match(/\b(?:cho\s+(?:khach|khach hang|anh|chi|co|chu)|khach|khach hang)\s+([a-z0-9\s_]+?)(?=\s+(?:tu|khoi|tai|kho|gia|ly do)|$)/i);
  if (custMatch) {
    const q = custMatch[1].trim();
    const res = resolveCustomer(q, customers, context);
    if (res.bestMatch) extractedCustomer = res.bestMatch;
    working = working.replace(custMatch[0], ' ');
  }

  // --- STEP 4: EXTRACT QUANTITY & UNIT ---
  let extractedQty = null;
  let extractedUnit = null;

  // Match digit quantity with optional unit: e.g. "50 cái", "20 chiếc", "10 thùng", "8 đôi", "5"
  const qtyMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*(cai|chiec|thung|hop|goi|bo|ly|lon|chai|bao|cuon|gam|kg|m|met|sp|san pham|doi|cap|thanh|tam|cay|vien|lo)?\b/i);
  if (qtyMatch) {
    extractedQty = parseFloat(qtyMatch[1].replace(',', '.'));
    extractedUnit = qtyMatch[2] ? qtyMatch[2].toLowerCase() : null;
    working = working.replace(qtyMatch[0], ' ');
  } else {
    // Word quantity: e.g. "hai mươi cái", "năm thùng", "mười"
    for (const [w, val] of Object.entries(WORD_NUMBERS)) {
      const re = new RegExp(`\\b${w}\\s*(cai|chiec|thung|hop|goi|bo|ly|lon|chai|bao|cuon|gam|kg|m|met|sp|san pham|doi|cap|thanh|tam|cay|vien|lo)?\\b`, 'i');
      const wMatch = working.match(re);
      if (wMatch) {
        extractedQty = val;
        extractedUnit = wMatch[1] ? wMatch[1].toLowerCase() : null;
        working = working.replace(wMatch[0], ' ');
        break;
      }
    }
  }

  // --- STEP 5: EXTRACT PRODUCT NAME QUERY & MATCH ---
  // Strip action verbs from the beginning of working string
  working = working
    .replace(/^(?:nhap hang|nhap kho|nhap them|nhap ve|nhap vao|nhap|mua vao|mua)\s*/i, '')
    .replace(/^(?:xuat kho|xuat hang|giam ton|xuat bot|giam kho|xuat tra|bot kho|xuat)\s*/i, '')
    .replace(/^(?:chuyen kho|dieu chuyen|chuyen hang|chuyen)\s*/i, '')
    .replace(/^(?:kiem kho|kiem ke|kiem dem|doi chieu kho|kiem ton|kiem)\s*/i, '')
    .replace(/^(?:ban hang|ban cho|ban|tao don|len don|xuat ban)\s*/i, '')
    .replace(/\b(?:khoi|vao|trong|o|tai|tu|sang|den|ve)\s+kho\b/gi, ' ')
    .replace(/\b(?:cai nay|mon nay|hang nay|sp nay|giup toi|cho toi|ho toi|ho|nhe|nha|di|voi|nhe|ạ)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let resolvedProduct = null;
  let productQuery = working;

  if (productQuery.length >= 2) {
    resolvedProduct = resolveProduct(productQuery, products, context);
  }

  // If no direct query match, check context product
  if ((!resolvedProduct || !resolvedProduct.bestMatch) && context?.current_product_id) {
    const curP = products.find(p => p.id === context.current_product_id);
    if (curP) {
      resolvedProduct = {
        bestMatch: curP,
        candidates: [curP],
        isExact: true,
        isAmbiguous: false,
      };
    }
  }

  const bestProduct = resolvedProduct?.bestMatch || null;

  return {
    action,
    product: bestProduct,
    productCandidates: resolvedProduct?.candidates || [],
    productQuery,
    isProductAmbiguous: resolvedProduct?.isAmbiguous || false,
    quantity: extractedQty !== null && !isNaN(extractedQty) ? extractedQty : (action === 'RECEIPT' ? 20 : 1),
    unit: extractedUnit || bestProduct?.unit || 'cái',
    costPrice: extractedPrice || (bestProduct ? (bestProduct.costPrice || bestProduct.cost_price || 0) : undefined),
    price: extractedPrice || (bestProduct ? (bestProduct.price || bestProduct.retail_price || 0) : undefined),
    warehouse: targetWarehouse,
    fromWarehouse,
    toWarehouse,
    supplier: extractedSupplier,
    customer: extractedCustomer,
    rawPrompt,
  };
}
