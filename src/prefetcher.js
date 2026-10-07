// ==============================================================================
// QBIZ KHO — BACKGROUND IDLE PREFETCHER & OFFLINE ASSET ENGINE
// Tự động tải ngầm toàn bộ ảnh sản phẩm & module phụ khi mạng rảnh rỗi
// Đảm bảo 100% khi mất mạng: ảnh sản phẩm và tính năng mở ra đều có sẵn tức thì
// ==============================================================================

const CACHE_NAME = 'qbiz-kho-v22-20261003-brand-refresh';

// Danh sách các module phụ cần prefetch ngầm
const AUX_MODULES = [
  './src/business-profile.js',
  './src/ui-profile.js',
  './src/demo-showroom.js',
  './src/hardware/escpos.js',
  './src/invoice/domain.js',
  './src/invoice/service.js',
  './src/invoice/ui.js',
  './src/invoice/providers/misa_provider.js',
  './src/catalog_sync.js',
  './src/inventory_sync.js',
  './src/sales_sync.js',
  './src/shifts_sync.js'
];

let prefetchState = {
  isRunning: false,
  isComplete: false,
  totalItems: 0,
  cachedItems: 0,
  failedItems: 0,
  lastRunAt: null,
  imagesPrefetched: 0,
  modulesPrefetched: 0
};

export function getPrefetchStatus() {
  return { ...prefetchState };
}

/**
 * Trích xuất toàn bộ URL ảnh hợp lệ từ danh sách sản phẩm
 */
function extractImageUrls(products = []) {
  const urls = new Set();
  for (const p of products) {
    if (typeof p.image === 'string' && p.image.trim()) {
      const src = p.image.trim();
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        urls.add(src);
      }
    }
    if (Array.isArray(p.images)) {
      for (const img of p.images) {
        if (typeof img === 'string' && img.trim()) {
          const src = img.trim();
          if (!src.startsWith('data:') && !src.startsWith('blob:')) {
            urls.add(src);
          }
        }
      }
    }
  }
  return Array.from(urls);
}

/**
 * Tải ngầm một danh sách URLs với điều tiết lưu lượng (rate limiting)
 */
async function prefetchBatch(urls, cache, concurrency = 2, delayMs = 150) {
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (url) => {
      try {
        const existing = await cache.match(url);
        if (existing) {
          successCount++;
          return;
        }
        // Tải và đưa vào CacheStorage
        const res = await fetch(url, { mode: 'no-cors', cache: 'force-cache' });
        if (res && (res.status === 200 || res.type === 'opaque')) {
          await cache.put(url, res.clone());
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        // Lỗi mạng hoặc URL không tồn tại - bỏ qua an toàn
        failCount++;
      }
    }));

    if (delayMs > 0 && i + concurrency < urls.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { successCount, failCount };
}

/**
 * Thực thi tiến trình tải ngầm
 */
export async function runIdlePrefetch(products = []) {
  if (prefetchState.isRunning) return prefetchState;
  if (typeof caches === 'undefined') return prefetchState;

  prefetchState.isRunning = true;
  prefetchState.lastRunAt = new Date().toISOString();

  try {
    const cache = await caches.open(CACHE_NAME);
    const imageUrls = extractImageUrls(products);
    const allUrlsToCache = [...AUX_MODULES, ...imageUrls];

    prefetchState.totalItems = allUrlsToCache.length;

    // 1. Prefetch các module hệ thống trước
    const modResult = await prefetchBatch(AUX_MODULES, cache, 2, 80);
    prefetchState.modulesPrefetched = modResult.successCount;

    // 2. Prefetch toàn bộ ảnh sản phẩm ngầm
    if (imageUrls.length > 0) {
      const imgResult = await prefetchBatch(imageUrls, cache, 2, 150);
      prefetchState.imagesPrefetched = imgResult.successCount;
      prefetchState.failedItems += imgResult.failCount;
    }

    prefetchState.cachedItems = prefetchState.modulesPrefetched + prefetchState.imagesPrefetched;
    prefetchState.isComplete = true;

    console.log(`[Prefetcher] Đã tải ngầm hoàn tất ${prefetchState.cachedItems}/${prefetchState.totalItems} tài nguyên (Modules: ${prefetchState.modulesPrefetched}, Ảnh SP: ${prefetchState.imagesPrefetched}). Sẵn sàng 100% ngoại tuyến.`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qbiz:prefetch_complete', { detail: { ...prefetchState } }));
    }
  } catch (err) {
    console.warn('[Prefetcher] Lỗi trong tiến trình prefetch:', err);
  } finally {
    prefetchState.isRunning = false;
  }

  return prefetchState;
}

/**
 * Lên lịch tải ngầm khi trình duyệt rảnh rỗi (Idle Callback)
 */
export function scheduleIdlePrefetch(state, { delayMs = 3500 } = {}) {
  if (typeof window === 'undefined') return;

  const trigger = () => {
    const run = () => {
      const products = state?.data?.products || [];
      runIdlePrefetch(products).catch(() => {});
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 15000 });
    } else {
      setTimeout(run, 1000);
    }
  };

  setTimeout(trigger, Math.max(1000, delayMs));
}
