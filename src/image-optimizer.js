// ==============================================================================
// QBIZ KHO — CLIENT-SIDE WEBP IMAGE & FILE OPTIMIZER
// Nén ảnh thông minh trước khi lưu vào IndexedDB
// Giúp giảm 90-95% dung lượng ảnh camera (5-10MB -> 35-60KB)
// Bảo toàn 100% kênh trong suốt (Alpha) cho Logo PNG & Ảnh không nền
// Cung cấp công cụ quét và nén lại toàn bộ ảnh cũ trong kho (Batch Retrofit)
// ==============================================================================

import { getAll, put } from './db.js';

const DEFAULT_OPTIONS = {
  maxDimension: 800,      // Chuẩn tối ưu hiển thị POS di động & Desktop
  quality: 0.82,          // Mức nén chuẩn cân bằng độ nét và dung lượng
  mimeType: 'image/webp', // Định dạng WebP siêu nhẹ
  fallbackMime: 'image/jpeg'
};

/**
 * Kiểm tra xem Canvas có hỗ trợ xuất webp không
 */
export function isWebpSupported() {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch {
    return false;
  }
}

/**
 * Nén tệp hình ảnh thành WebP Data URL siêu nhẹ
 * Bảo toàn độ trong suốt nếu là PNG hoặc WebP có alpha
 */
export async function optimizeImageFile(file, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('Tệp không phải là hình ảnh hợp lệ.');
  }

  // Nếu tệp đã là WebP và dung lượng siêu nhỏ (< 45KB), giữ nguyên
  if (file.type === 'image/webp' && file.size < 45 * 1024) {
    return await fileToDataUrl(file);
  }

  // 1. Tải bitmap hoặc Image
  let bitmap;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } else {
      bitmap = await loadHtmlImage(file);
    }
  } catch {
    bitmap = await loadHtmlImage(file);
  }

  // 2. Tính tỷ lệ co tỉ lệ chuẩn
  const origW = bitmap.width || 800;
  const origH = bitmap.height || 800;
  const maxDim = opt.maxDimension;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const targetW = Math.max(1, Math.round(origW * scale));
  const targetH = Math.max(1, Math.round(origH * scale));

  // 3. Nhận diện kênh trong suốt (Alpha Transparency)
  // Nếu là PNG hoặc WebP: giữ nguyên alpha (không fill trắng) để logo trong suốt không bị nền trắng
  const isPngOrWebp = file.type === 'image/png' || file.type === 'image/webp';
  const preserveAlpha = opt.preserveAlpha !== undefined ? opt.preserveAlpha : isPngOrWebp;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { alpha: preserveAlpha });
  
  if (!preserveAlpha) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);

  if (typeof bitmap.close === 'function') {
    bitmap.close();
  }

  // 4. Xuất Blob WebP hoặc fallback PNG (nếu cần alpha) / JPEG
  let targetMime = isWebpSupported() ? opt.mimeType : (preserveAlpha ? 'image/png' : opt.fallbackMime);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, targetMime, opt.quality));

  if (!blob) {
    return await fileToDataUrl(file);
  }

  return await blobToDataUrl(blob);
}

/**
 * Nén chuỗi Data URL cũ thành WebP siêu nhẹ
 * Dùng cho các ảnh đã có sẵn trong cơ sở dữ liệu IndexedDB
 */
export async function optimizeDataUrl(dataUrl, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  // Nếu đã là WebP và dung lượng nhỏ (< 65KB ~ 85,000 ký tự base64), giữ nguyên
  if (dataUrl.startsWith('data:image/webp') && dataUrl.length < 85000) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width || 800;
        const origH = img.naturalHeight || img.height || 800;
        const maxDim = opt.maxDimension;
        const scale = Math.min(1, maxDim / Math.max(origW, origH));
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const isPngOrWebp = dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/webp');
        const preserveAlpha = opt.preserveAlpha !== undefined ? opt.preserveAlpha : isPngOrWebp;

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { alpha: preserveAlpha });
        if (!preserveAlpha) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const targetMime = isWebpSupported() ? opt.mimeType : (preserveAlpha ? 'image/png' : opt.fallbackMime);
        canvas.toBlob((blob) => {
          if (!blob) return resolve(dataUrl);
          blobToDataUrl(blob).then((newDataUrl) => {
            // Chỉ nhận ảnh mới nếu dung lượng nhỏ hơn ảnh cũ
            if (newDataUrl && newDataUrl.length < dataUrl.length) {
              resolve(newDataUrl);
            } else {
              resolve(dataUrl);
            }
          }).catch(() => resolve(dataUrl));
        }, targetMime, opt.quality);
      } catch (err) {
        console.warn('[ImageOptimizer] optimizeDataUrl error:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Quét toàn bộ sản phẩm và danh mục trong IndexedDB
 * Tối ưu nén lại toàn bộ ảnh cũ/chưa nén sang chuẩn WebP 800px siêu nhẹ
 */
export async function batchOptimizeStoreImages({ onProgress = null } = {}) {
  let scanned = 0;
  let optimized = 0;
  let savedBytes = 0;
  let updatedProducts = 0;

  try {
    const products = await getAll('products');
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      scanned++;
      let modified = false;

      // 1. Kiểm tra p.image chính
      if (p.image && typeof p.image === 'string' && p.image.startsWith('data:image/')) {
        const oldLen = p.image.length;
        const newImg = await optimizeDataUrl(p.image);
        if (newImg && newImg.length < oldLen) {
          savedBytes += Math.round((oldLen - newImg.length) * 0.75);
          p.image = newImg;
          modified = true;
          optimized++;
        }
      }

      // 2. Kiểm tra p.images (danh sách ảnh phụ)
      if (Array.isArray(p.images) && p.images.length) {
        const newImages = [];
        for (const imgItem of p.images) {
          const imgStr = typeof imgItem === 'string' ? imgItem : imgItem?.data;
          if (imgStr && typeof imgStr === 'string' && imgStr.startsWith('data:image/')) {
            const oldLen = imgStr.length;
            const newImg = await optimizeDataUrl(imgStr);
            if (newImg && newImg.length < oldLen) {
              savedBytes += Math.round((oldLen - newImg.length) * 0.75);
              optimized++;
              modified = true;
              newImages.push(typeof imgItem === 'string' ? newImg : { ...imgItem, data: newImg, optimized: newImg.length });
            } else {
              newImages.push(imgItem);
            }
          } else {
            newImages.push(imgItem);
          }
        }
        if (modified) {
          p.images = newImages;
        }
      }

      if (modified) {
        await put('products', p);
        updatedProducts++;
      }

      if (typeof onProgress === 'function') {
        onProgress({ current: i + 1, total: products.length, scanned, optimized, savedBytes });
      }
    }

    // 3. Tối ưu ảnh danh mục categories
    const categories = await getAll('categories');
    for (const cat of categories) {
      if (cat.image && typeof cat.image === 'string' && cat.image.startsWith('data:image/')) {
        const oldLen = cat.image.length;
        const newImg = await optimizeDataUrl(cat.image);
        if (newImg && newImg.length < oldLen) {
          savedBytes += Math.round((oldLen - newImg.length) * 0.75);
          cat.image = newImg;
          optimized++;
          await put('categories', cat);
        }
      }
    }
  } catch (err) {
    console.warn('[ImageOptimizer] batchOptimizeStoreImages error:', err);
  }

  const savedMb = (savedBytes / (1024 * 1024)).toFixed(2);
  const savedKb = (savedBytes / 1024).toFixed(1);
  const savedFormatted = savedBytes >= 1024 * 1024 ? `${savedMb} MB` : `${savedKb} KB`;

  return {
    scannedProducts: scanned,
    updatedProducts,
    optimizedImages: optimized,
    savedBytes,
    savedFormatted
  };
}

function loadHtmlImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
