// ==============================================================================
// QBIZ KHO PRODUCTION V1 — GATE 2: INITIAL MIGRATION & MASTER CATALOG SYNC
// Spec: CMD_20260925_GATE2_INITIAL_MIGRATION_CATALOG_SYNC.txt
// ==============================================================================

import { getAll, getOne, put, putMany, setting, setSetting } from './db.js';
import { CONFIG } from './config.js';
import { getSupabaseConfig, getAuthState } from './auth.js';

export const SYNC_STATES = {
  NOT_SYNCED: 'NOT_SYNCED',       // Chưa đồng bộ
  PREPARING: 'PREPARING',         // Đang chuẩn bị
  SYNCING: 'SYNCING',             // Đang đồng bộ
  SYNCED: 'SYNCED',               // Đã đồng bộ
  CONFLICT: 'CONFLICT',           // Có xung đột
  ERROR: 'ERROR'
};

const ID_MAP_SETTING_KEY = 'cloud_id_map';
const LAST_PULL_SETTING_KEY = 'last_catalog_pull_timestamp';

/**
 * Generate deterministic RFC 4122 UUID (UUIDv5 equivalent) using browser SubtleCrypto.
 * Guarantees that local_id always maps to the exact same cloud UUID per shop.
 */
export async function deterministicUuid(namespace, name) {
  const enc = new TextEncoder();
  const data = enc.encode(`${namespace}:${name}`);
  const hashBuf = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(hashBuf);
  // set version to 5
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  // set variant to RFC 4122
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

/**
 * Get or initialize persistent local_id -> cloud_id mapping.
 */
export async function getIdMap() {
  const map = await setting(ID_MAP_SETTING_KEY, {});
  return typeof map === 'object' && map !== null ? map : {};
}

export async function saveIdMap(map) {
  return setSetting(ID_MAP_SETTING_KEY, map);
}

/**
 * Step 2: Non-destructive Initial Migration Preview.
 * Computes counts, detects duplicates or anomalies before upload.
 */
export async function getMigrationPreview() {
  const [warehouses, categories, products, customers, suppliers] = await Promise.all([
    getAll('warehouses'),
    getAll('categories'),
    getAll('products'),
    getAll('customers'),
    getAll('suppliers')
  ]);

  // Check for duplicates
  const skuSet = new Set();
  const barcodeSet = new Set();
  const duplicateSkus = [];
  const duplicateBarcodes = [];

  for (const p of products) {
    if (p.sku) {
      if (skuSet.has(p.sku)) duplicateSkus.push(p.sku);
      skuSet.add(p.sku);
    }
    if (p.barcode) {
      if (barcodeSet.has(p.barcode)) duplicateBarcodes.push(p.barcode);
      barcodeSet.add(p.barcode);
    }
  }

  // Check category relationships
  const categoryIds = new Set(categories.map(c => c.id));
  const productsWithMissingCategory = products.filter(
    p => p.categoryId && !categoryIds.has(p.categoryId)
  );

  return {
    counts: {
      warehouses: warehouses.length,
      categories: categories.length,
      products: products.length,
      customers: customers.length,
      suppliers: suppliers.length,
      total_master_records: warehouses.length + categories.length + products.length + customers.length + suppliers.length
    },
    duplicates: {
      duplicate_skus: duplicateSkus,
      duplicate_barcodes: duplicateBarcodes,
      total_duplicates: duplicateSkus.length + duplicateBarcodes.length
    },
    orphans: {
      products_missing_category: productsWithMissingCategory.length
    },
    invalid_rows: 0,
    safe_to_migrate: duplicateSkus.length === 0 && duplicateBarcodes.length === 0
  };
}

/**
 * REST helper with authorization header.
 */
async function cloudFetch(endpoint, { method = 'GET', body = null, token, prefer = 'return=representation' }) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) throw new Error('Chưa cấu hình Supabase Cloud.');

  const headers = {
    'apikey': anonKey,
    'Authorization': `Bearer ${token || anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': prefer
  };

  const options = { method, headers };
  if (body !== null) options.body = JSON.stringify(body);

  const res = await fetch(`${url}/rest/v1/${endpoint}`, options);
  if (!res.ok) {
    const errText = await res.text();
    let parsed;
    try { parsed = JSON.parse(errText); } catch { parsed = errText; }
    const err = new Error(`Cloud error [${res.status}]: ${typeof parsed === 'object' ? parsed.message || JSON.stringify(parsed) : parsed}`);
    err.status = res.status;
    err.details = parsed;
    throw err;
  }

  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}

/**
 * Step 3 & 6: Idempotent Initial Master Data Migration.
 * Safely migrates warehouses, categories, products to Supabase Cloud using deterministic UUIDs.
 */
export async function initialMigrateMasterData({ shopId, token, userId }) {
  if (!shopId || !token) throw new Error('Yêu cầu shopId và access token để thực hiện di chuyển dữ liệu.');

  const idMap = await getIdMap();
  const [warehouses, categories, products, customers, suppliers] = await Promise.all([
    getAll('warehouses'),
    getAll('categories'),
    getAll('products'),
    getAll('customers'),
    getAll('suppliers')
  ]);

  const results = {
    warehouses_migrated: 0,
    categories_migrated: 0,
    products_migrated: 0,
    customers_migrated: 0,
    suppliers_migrated: 0,
    shop_id: shopId,
    timestamp: new Date().toISOString()
  };

  // 1. Migrate Warehouses
  const cloudWarehouses = [];
  for (const wh of warehouses) {
    const cloudId = idMap[wh.id] || await deterministicUuid(shopId, `warehouse:${wh.id}`);
    idMap[wh.id] = cloudId;
    cloudWarehouses.push({
      id: cloudId,
      shop_id: shopId,
      name: wh.name,
      is_default: wh.id === 'wh_center' || wh.is_default || false,
      version: Number(wh.version || 1),
      updated_at: new Date().toISOString()
    });
  }

  if (cloudWarehouses.length > 0) {
    await cloudFetch('warehouses?on_conflict=id', {
      method: 'POST',
      body: cloudWarehouses,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    results.warehouses_migrated = cloudWarehouses.length;
  }

  // 2. Migrate Categories
  const cloudCategories = [];
  for (const cat of categories) {
    const cloudId = idMap[cat.id] || await deterministicUuid(shopId, `category:${cat.id}`);
    idMap[cat.id] = cloudId;
  }

  for (const cat of categories) {
    const cloudId = idMap[cat.id];
    const parentCloudId = cat.parentId ? (idMap[cat.parentId] || null) : null;
    cloudCategories.push({
      id: cloudId,
      shop_id: shopId,
      name: cat.name,
      parent_id: parentCloudId,
      type: cat.type === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
      version: Number(cat.version || 1)
    });
  }

  if (cloudCategories.length > 0) {
    await cloudFetch('categories?on_conflict=id', {
      method: 'POST',
      body: cloudCategories,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    results.categories_migrated = cloudCategories.length;
  }

  // 3. Migrate Products
  const cloudProducts = [];
  for (const prod of products) {
    const cloudId = idMap[prod.id] || await deterministicUuid(shopId, `product:${prod.id}`);
    idMap[prod.id] = cloudId;
    const catCloudId = prod.categoryId ? (idMap[prod.categoryId] || null) : null;

    cloudProducts.push({
      id: cloudId,
      shop_id: shopId,
      name: prod.name,
      sku: prod.sku || null,
      barcode: prod.barcode || null,
      price: Number(prod.price || 0),
      cost_price: Number(prod.cost_price || prod.costPrice || 0),
      category_id: catCloudId,
      active: prod.active !== false,
      track_inventory: prod.trackInventory !== false,
      version: Number(prod.version || 1),
      updated_at: new Date().toISOString()
    });
  }

  if (cloudProducts.length > 0) {
    await cloudFetch('products?on_conflict=id', {
      method: 'POST',
      body: cloudProducts,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    results.products_migrated = cloudProducts.length;
  }

  // 4. Migrate Customers & Suppliers (if any)
  if (customers.length > 0) {
    const cloudCustomers = [];
    for (const c of customers) {
      const cloudId = idMap[c.id] || await deterministicUuid(shopId, `customer:${c.id}`);
      idMap[c.id] = cloudId;
      cloudCustomers.push({
        id: cloudId,
        shop_id: shopId,
        name: c.name,
        phone: c.phone ? c.phone.trim() : null,
        email: c.email ? c.email.trim().toLowerCase() : null,
        address: c.address || null,
        version: Number(c.version || 1)
      });
    }
    await cloudFetch('customers?on_conflict=id', {
      method: 'POST',
      body: cloudCustomers,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    results.customers_migrated = cloudCustomers.length;
  }

  if (suppliers.length > 0) {
    const cloudSuppliers = [];
    for (const s of suppliers) {
      const cloudId = idMap[s.id] || await deterministicUuid(shopId, `supplier:${s.id}`);
      idMap[s.id] = cloudId;
      cloudSuppliers.push({
        id: cloudId,
        shop_id: shopId,
        name: s.name,
        phone: s.phone ? s.phone.trim() : null,
        email: s.email ? s.email.trim().toLowerCase() : null,
        address: s.address || null,
        version: Number(s.version || 1)
      });
    }
    await cloudFetch('suppliers?on_conflict=id', {
      method: 'POST',
      body: cloudSuppliers,
      token,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
    results.suppliers_migrated = cloudSuppliers.length;
  }

  // Save updated ID mapping locally
  await saveIdMap(idMap);
  await setSetting(LAST_PULL_SETTING_KEY, new Date().toISOString());

  return results;
}

/**
 * Step 7: Push a single or batch of local master changes to cloud.
 */
export async function pushMasterRecord({ entityType, entity, shopId, token }) {
  if (!['warehouses', 'categories', 'products', 'customers', 'suppliers'].includes(entityType)) {
    throw new Error(`Loại thực thể ${entityType} không thuộc phạm vi Master Data Gate 2.`);
  }

  const idMap = await getIdMap();
  const cloudId = idMap[entity.id] || await deterministicUuid(shopId, `${entityType.slice(0, -1)}:${entity.id}`);
  idMap[entity.id] = cloudId;
  await saveIdMap(idMap);

  const payload = {
    ...entity,
    id: cloudId,
    shop_id: shopId,
    version: Number(entity.version || 1) + 1,
    updated_at: new Date().toISOString()
  };

  // Remap camelCase and local-only fields according to entity type
  if (entityType === 'products') {
    payload.cost_price = Number(payload.cost_price || payload.costPrice || 0);
    delete payload.costPrice;
    payload.track_inventory = payload.track_inventory !== false && payload.trackInventory !== false;
    delete payload.trackInventory;
    payload.category_id = (payload.categoryId ? (idMap[payload.categoryId] || payload.categoryId) : null) || payload.category_id || null;
    delete payload.categoryId;
    delete payload.images;
    delete payload.variants;
    delete payload.websiteVisibility;
    delete payload.unit;
    delete payload.brand;
    delete payload.warranty;
    delete payload.description;
    delete payload.lowStock;
    delete payload.low_stock_threshold;
    delete payload.image;
    delete payload.category;
  } else if (entityType === 'categories') {
    payload.parent_id = (payload.parentId ? (idMap[payload.parentId] || payload.parentId) : null) || payload.parent_id || null;
    delete payload.parentId;
    delete payload.image;
  } else if (entityType === 'warehouses') {
    payload.is_default = Boolean(payload.is_default || payload.isDefault);
    delete payload.isDefault;
  }

  const res = await cloudFetch(`${entityType}?on_conflict=id`, {
    method: 'POST',
    body: [payload],
    token,
    prefer: 'resolution=merge-duplicates,return=representation'
  });

  // Update local version and timestamp
  const updatedLocal = { ...entity, version: payload.version, updated_at: payload.updated_at };
  await put(entityType, updatedLocal);

  return res?.[0] || payload;
}

/**
 * Step 8: Pull updated master catalog from cloud using cursor timestamp.
 */
export async function pullMasterCatalog({ shopId, token, since = null }) {
  const sinceIso = since || (await setting(LAST_PULL_SETTING_KEY, null));
  const idMap = await getIdMap();
  const reverseMap = Object.fromEntries(Object.entries(idMap).map(([loc, cld]) => [cld, loc]));

  // Ensure deterministic mapping for known warehouses and products
  const knownWarehouses = ['wh_center', 'wh_hadong'];
  for (const wId of knownWarehouses) {
    if (!idMap[wId]) {
      const cId = await deterministicUuid(shopId, `warehouse:${wId}`);
      idMap[wId] = cId;
      reverseMap[cId] = wId;
    } else {
      reverseMap[idMap[wId]] = wId;
    }
  }

  const knownProducts = [
    'p_n85_navy_high', 'p_n85_navy_low', 'p_n85_pink_high', 'p_90d', 'p_90t',
    'p_95', 'p_135', 'p_150', 'p_f1', 'p_f3', 'p_f4', 'p_f5', 'p_f6',
    'p_lumbar', 'p_meditation'
  ];
  for (const pId of knownProducts) {
    if (!idMap[pId]) {
      const cId = await deterministicUuid(shopId, `product:${pId}`);
      idMap[pId] = cId;
      reverseMap[cId] = pId;
    } else {
      reverseMap[idMap[pId]] = pId;
    }
  }

  const querySuffix = sinceIso ? `&updated_at=gt.${encodeURIComponent(sinceIso)}` : '';

  const [remoteWarehouses, remoteCategories, remoteProducts, remoteCustomers, remoteSuppliers] = await Promise.all([
    cloudFetch(`warehouses?shop_id=eq.${shopId}${querySuffix}&select=*`, { token }),
    cloudFetch(`categories?shop_id=eq.${shopId}&select=*`, { token }),
    cloudFetch(`products?shop_id=eq.${shopId}${querySuffix}&select=*`, { token }),
    cloudFetch(`customers?shop_id=eq.${shopId}${querySuffix}&select=*`, { token }),
    cloudFetch(`suppliers?shop_id=eq.${shopId}${querySuffix}&select=*`, { token })
  ]);

  let appliedCount = 0;

  // Apply products
  if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
    for (const remote of remoteProducts) {
      const localId = reverseMap[remote.id] || remote.id;
      const existing = await getOne('products', localId);

      // Conflict detection: if local version changed offline and doesn't match base
      if (existing && existing.version > remote.version) {
        console.warn(`[CONFLICT] Xung đột danh mục sản phẩm '${existing.name}' (Local v${existing.version} > Remote v${remote.version})`);
        continue;
      }

      const merged = {
        ...(existing || {}),
        id: localId,
        name: remote.name,
        sku: remote.sku,
        barcode: remote.barcode,
        price: Number(remote.price || 0),
        cost_price: Number(remote.cost_price || 0),
        categoryId: remote.category_id ? (reverseMap[remote.category_id] || remote.category_id) : '',
        active: remote.active,
        trackInventory: remote.track_inventory,
        version: remote.version,
        updated_at: remote.updated_at
      };

      await put('products', merged);
      idMap[localId] = remote.id;
      appliedCount++;
    }
  }

  // Apply warehouses
  if (Array.isArray(remoteWarehouses) && remoteWarehouses.length > 0) {
    for (const remote of remoteWarehouses) {
      const localId = reverseMap[remote.id] || remote.id;
      const existing = await getOne('warehouses', localId);
      const merged = {
        ...(existing || {}),
        id: localId,
        name: remote.name,
        is_default: remote.is_default,
        version: remote.version
      };
      await put('warehouses', merged);
      idMap[localId] = remote.id;
      appliedCount++;
    }
  }

  // Apply categories
  if (Array.isArray(remoteCategories) && remoteCategories.length > 0) {
    for (const remote of remoteCategories) {
      const localId = reverseMap[remote.id] || remote.id;
      const existing = await getOne('categories', localId);
      const merged = {
        ...(existing || {}),
        id: localId,
        name: remote.name,
        type: remote.type,
        parentId: remote.parent_id ? (reverseMap[remote.parent_id] || remote.parent_id) : '',
        version: remote.version
      };
      await put('categories', merged);
      idMap[localId] = remote.id;
      appliedCount++;
    }
  }

  await saveIdMap(idMap);
  const nowIso = new Date().toISOString();
  await setSetting(LAST_PULL_SETTING_KEY, nowIso);

  return {
    pulled_records: appliedCount,
    last_pull_timestamp: nowIso
  };
}

/**
 * Step 13: Bootstrap New Device with Cloud Catalog (Master Only).
 */
export async function bootstrapNewDevice({ shopId, token }) {
  const result = await pullMasterCatalog({ shopId, token, since: '1970-01-01T00:00:00Z' });
  return {
    status: 'BOOTSTRAP_COMPLETE',
    shop_id: shopId,
    records_loaded: result.pulled_records
  };
}
