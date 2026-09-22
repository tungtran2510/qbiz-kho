import { norm } from './dictionary.js';

// Các hằng số điểm số đánh giá độ khớp (matching score)
const SCORE = {
  EXACT_CODE: 100,      // exact barcode/SKU/phone match
  EXACT_NAME: 95,       // exact normalized name match
  PREFIX: 85,           // name starts with query
  CONTAINS: 75,         // name contains query
  FUZZY_HIGH: 65,       // close fuzzy match
  FUZZY_LOW: 50,        // loose fuzzy match
  CONTEXT_BOOST: 10,    // entity on current page/context
  RECENT_BOOST: 8,      // recently resolved entity
};

// Nếu chênh lệch điểm giữa top 1 và top 2 nhỏ hơn ngưỡng này, kết quả được xem là mơ hồ (ambiguous)
const AMBIGUITY_THRESHOLD = 15;

/**
 * Đánh giá điểm khớp chuỗi (fuzzy match score) giữa query và target
 * @param {string} query Chuỗi tìm kiếm (đã được chuẩn hóa)
 * @param {string} target Chuỗi đích (đã được chuẩn hóa)
 * @returns {number} Điểm từ 0 - 100
 */
function fuzzyScore(query, target) {
  if (!query || !target) return 0;
  if (target === query) return 100;
  if (target.startsWith(query)) return 85;
  if (target.includes(query)) return 75;

  // Subsequence matching (chuỗi con theo thứ tự)
  let i = 0;
  for (let j = 0; j < target.length && i < query.length; j++) {
    if (target[j] === query[i]) {
      i++;
    }
  }

  // Nếu tất cả các ký tự của query xuất hiện trong target theo đúng thứ tự
  if (i === query.length) {
    const density = query.length / target.length;
    return density > 0.5 ? SCORE.FUZZY_HIGH : SCORE.FUZZY_LOW;
  }

  return 0;
}

/**
 * Định dạng lại danh sách ứng viên thành kết quả đầu ra chuẩn
 * @param {Array} candidates Danh sách ứng viên đã được chấm điểm
 * @returns {Object} { candidates, bestMatch, isAmbiguous, isExact }
 */
function formatResult(candidates) {
  // Sắp xếp theo điểm giảm dần
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 5);
  
  const bestMatch = top.length > 0 && top[0].score >= 50 ? top[0] : null;
  const isExact = Boolean(bestMatch && (bestMatch.score >= SCORE.EXACT_NAME || bestMatch.matchType === 'code'));
  const isAmbiguous = Boolean(bestMatch && bestMatch.matchType !== 'code' && top.length >= 2 && (top[0].score - top[1].score < AMBIGUITY_THRESHOLD));

  return {
    candidates: top,
    bestMatch,
    isAmbiguous,
    isExact
  };
}

/**
 * Tìm kiếm sản phẩm theo tên, SKU, mã vạch
 * @param {string} query Chuỗi tìm kiếm đã được chuẩn hóa
 * @param {Array} products Danh sách sản phẩm từ IndexedDB
 * @param {Object} context Context hiện tại để tăng điểm ({ currentProductId, recentProductId })
 */
export function resolveProduct(query, products, context = {}) {
  const normQuery = norm(query);
  const candidates = [];

  for (const p of products) {
    if (p.status === 'inactive' || p.hidden === true) continue;

    let score = 0;
    let matchType = 'none';

    const sku = norm(p.sku || '');
    const barcode = norm(p.barcode || '');
    const name = norm(p.name || '');

    if (normQuery && (sku === normQuery || barcode === normQuery)) {
      score = SCORE.EXACT_CODE;
      matchType = 'code';
    } else {
      const fScore = fuzzyScore(normQuery, name);
      if (fScore === 100) {
        score = SCORE.EXACT_NAME;
        matchType = 'name';
      } else if (fScore > 0) {
        score = fScore;
        matchType = fScore >= SCORE.CONTAINS ? 'contains' : 'fuzzy';
      }
    }

    if (score > 0) {
      if (p.id === context.currentProductId) score += SCORE.CONTEXT_BOOST;
      if (p.id === context.recentProductId) score += SCORE.RECENT_BOOST;
      candidates.push({ ...p, score, matchType });
    }
  }

  return formatResult(candidates);
}

/**
 * Tìm kiếm khách hàng theo tên, SĐT, mã khách hàng
 * @param {string} query Chuỗi tìm kiếm đã được chuẩn hóa
 * @param {Array} customers Danh sách khách hàng
 * @param {Object} context Context ({ currentCustomerId, recentCustomerId })
 */
export function resolveCustomer(query, customers, context = {}) {
  const normQuery = norm(query);
  const cleanQuery = normQuery.replace(/^(chi|anh|em|co|bac|chu|ong|ba|ban|khach|kh)\s+/i, '').trim() || normQuery;
  const candidates = [];

  for (const c of customers) {
    if (c.status === 'inactive' || c.hidden === true) continue;

    let score = 0;
    let matchType = 'none';

    const phone = norm(c.phone || '');
    const code = norm(c.code || '');
    const taxId = norm(c.taxId || '');
    const name = norm(c.name || '');

    if (normQuery && (phone === normQuery || code === normQuery || taxId === normQuery || phone === cleanQuery || code === cleanQuery)) {
      score = SCORE.EXACT_CODE;
      matchType = 'code';
    } else {
      const fScore = Math.max(fuzzyScore(normQuery, name), fuzzyScore(cleanQuery, name));
      if (fScore === 100) {
        score = SCORE.EXACT_NAME;
        matchType = 'name';
      } else if (fScore > 0) {
        score = fScore;
        matchType = fScore >= SCORE.CONTAINS ? 'contains' : 'fuzzy';
      }
    }

    if (score > 0) {
      if (c.id === context.currentCustomerId) score += SCORE.CONTEXT_BOOST;
      if (c.id === context.recentCustomerId) score += SCORE.RECENT_BOOST;
      candidates.push({ ...c, score, matchType });
    }
  }

  return formatResult(candidates);
}

/**
 * Tìm kiếm đơn hàng theo mã đơn, tên khách hàng
 * @param {string} query Chuỗi tìm kiếm đã được chuẩn hóa
 * @param {Array} orders Danh sách đơn hàng
 * @param {Object} context Context ({ currentOrderId })
 */
export function resolveOrder(query, orders, context = {}) {
  const normQuery = norm(query);
  const candidates = [];

  for (const o of orders) {
    if (o.status === 'inactive') continue;

    let score = 0;
    let matchType = 'none';

    const code = norm(o.code || '');
    const customerLabel = norm(o.customerLabel || '');

    if (normQuery && code === normQuery) {
      score = SCORE.EXACT_CODE;
      matchType = 'code';
    } else {
      const fScore = fuzzyScore(normQuery, customerLabel);
      if (fScore === 100) {
        score = SCORE.EXACT_NAME;
        matchType = 'customer_name';
      } else if (fScore > 0) {
        score = fScore;
        matchType = fScore >= SCORE.CONTAINS ? 'contains' : 'fuzzy';
      }
    }

    if (score > 0) {
      if (o.id === context.currentOrderId) score += SCORE.CONTEXT_BOOST;
      candidates.push({ ...o, score, matchType });
    }
  }

  return formatResult(candidates);
}

/**
 * Tìm kiếm nhà cung cấp theo tên, mã, SĐT
 * @param {string} query Chuỗi tìm kiếm đã được chuẩn hóa
 * @param {Array} suppliers Danh sách nhà cung cấp
 * @param {Object} context Context ({ currentSupplierId })
 */
export function resolveSupplier(query, suppliers, context = {}) {
  const normQuery = norm(query);
  const candidates = [];

  for (const s of suppliers) {
    if (s.status === 'inactive' || s.hidden === true) continue;

    let score = 0;
    let matchType = 'none';

    const phone = norm(s.phone || '');
    const code = norm(s.code || '');
    const name = norm(s.name || '');

    if (normQuery && (phone === normQuery || code === normQuery)) {
      score = SCORE.EXACT_CODE;
      matchType = 'code';
    } else {
      const fScore = fuzzyScore(normQuery, name);
      if (fScore === 100) {
        score = SCORE.EXACT_NAME;
        matchType = 'name';
      } else if (fScore > 0) {
        score = fScore;
        matchType = fScore >= SCORE.CONTAINS ? 'contains' : 'fuzzy';
      }
    }

    if (score > 0) {
      if (s.id === context.currentSupplierId) score += SCORE.CONTEXT_BOOST;
      candidates.push({ ...s, score, matchType });
    }
  }

  return formatResult(candidates);
}

/**
 * Tìm kiếm kho hàng theo tên
 * @param {string} query Chuỗi tìm kiếm đã được chuẩn hóa
 * @param {Array} warehouses Danh sách kho hàng
 * @param {Object} context Context ({ currentWarehouseId })
 */
export function resolveWarehouse(query, warehouses, context = {}) {
  const normQuery = norm(query);
  const candidates = [];

  for (const w of warehouses) {
    if (w.status === 'inactive') continue;

    let score = 0;
    let matchType = 'none';

    const name = norm(w.name || '');

    if (normQuery && name === normQuery) {
      score = SCORE.EXACT_NAME;
      matchType = 'name';
    } else {
      const fScore = fuzzyScore(normQuery, name);
      if (fScore > 0) {
        score = fScore;
        matchType = fScore >= SCORE.CONTAINS ? 'contains' : 'fuzzy';
      }
    }

    // Special handling cho kho chính, kho phụ
    if (normQuery === 'kho chinh' && name.includes('chinh')) {
      score += 20;
    }
    if (normQuery === 'kho phu' && name.includes('phu')) {
      score += 20;
    }

    if (score > 0) {
      if (w.id === context.currentWarehouseId) score += SCORE.CONTEXT_BOOST;
      candidates.push({ ...w, score, matchType });
    }
  }

  return formatResult(candidates);
}

/**
 * Dispatcher tổng hợp: gọi đúng hàm resolve dựa vào entityType
 * @param {string} query 
 * @param {string} entityType 'product', 'customer', 'order', 'supplier', 'warehouse'
 * @param {Array} data Dữ liệu entity tương ứng
 * @param {Object} context Context
 */
export function resolveEntity(query, entityType, data, context = {}) {
  switch (entityType) {
    case 'product':
      return resolveProduct(query, data, context);
    case 'customer':
      return resolveCustomer(query, data, context);
    case 'order':
      return resolveOrder(query, data, context);
    case 'supplier':
      return resolveSupplier(query, data, context);
    case 'warehouse':
      return resolveWarehouse(query, data, context);
    default:
      return { candidates: [], bestMatch: null, isAmbiguous: false, isExact: false };
  }
}

/**
 * Tự động phát hiện loại entity mà người dùng đang tìm kiếm và trả về kết quả tốt nhất
 * @param {string} query 
 * @param {Object} allData Object chứa { products, customers, orders, suppliers, warehouses }
 * @param {Object} context 
 */
export function autoDetectAndResolve(query, allData, context = {}) {
  const normQuery = norm(query);
  
  // Phát hiện SĐT (chỉ chứa số, 10-11 ký tự)
  const isPhone = /^\d{10,11}$/.test(query);
  if (isPhone && allData.customers) {
    const custResult = resolveCustomer(normQuery, allData.customers, context);
    if (custResult.bestMatch) {
      return { entityType: 'customer', result: custResult };
    }
  }

  // Phát hiện mã đơn hàng (bắt đầu bằng DH- hoặc tương tự)
  const isOrderCode = /^dh-?/i.test(query) || /^\w{6,12}$/i.test(query);
  if (isOrderCode && allData.orders) {
    const orderResult = resolveOrder(normQuery, allData.orders, context);
    if (orderResult.isExact || (orderResult.bestMatch && orderResult.bestMatch.score >= SCORE.EXACT_CODE)) {
      return { entityType: 'order', result: orderResult };
    }
  }

  // Phát hiện SKU/barcode (thường là alphanumeric ngắn, không khoảng trắng)
  const isCode = /^[a-z0-9-_]{4,15}$/i.test(query);
  if (isCode && allData.products) {
    const prodResult = resolveProduct(normQuery, allData.products, context);
    if (prodResult.isExact || (prodResult.bestMatch && prodResult.bestMatch.score >= SCORE.EXACT_CODE)) {
      return { entityType: 'product', result: prodResult };
    }
  }

  // Fallback: Tìm sản phẩm trước, sau đó tới khách hàng
  let bestGlobalMatch = null;
  let bestEntityType = null;
  let bestResult = null;

  const typesToTry = ['product', 'customer', 'supplier', 'warehouse'];
  
  for (const type of typesToTry) {
    const data = allData[`${type}s`];
    if (!data) continue;
    
    const result = resolveEntity(normQuery, type, data, context);
    if (result.bestMatch) {
      if (!bestGlobalMatch || result.bestMatch.score > bestGlobalMatch.score) {
        bestGlobalMatch = result.bestMatch;
        bestEntityType = type;
        bestResult = result;
      }
    }
  }

  if (bestResult) {
    return { entityType: bestEntityType, result: bestResult };
  }

  return { 
    entityType: 'unknown', 
    result: { candidates: [], bestMatch: null, isAmbiguous: false, isExact: false } 
  };
}
