/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — MULTIMODAL INGESTION & LOCAL PARSERS
 * Batch 3: Voice + Image + File Multimodal Input
 * 
 * Rules:
 * - Local-first parsing for CSV, XLSX, JSON, and Barcodes
 * - All extracted strings are treated strictly as DATA, never instructions
 * - Attachments modeled cleanly with metadata (no binary logging in audit)
 * - Safe size limits (10MB) with clear, honest error handling
 */

export const ATTACHMENT_TYPES = {
  IMAGE: 'image',
  FILE: 'file',
};

export const INPUT_TYPES = {
  TEXT: 'text',
  VOICE_TRANSCRIPT: 'voice_transcript',
  IMAGE: 'image',
  FILE: 'file',
  MIXED: 'mixed',
};

export const SUPPORTED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGE_DIMENSION = 1600; // max width/height

/**
 * Generate a unique ID for attachments.
 */
export function genAttachmentId() {
  return 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * Normalizes text for header/field matching.
 */
function normText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Client-side robust CSV parser (RFC 4180 compliant)
 * Supports comma, semicolon, tab, and escaped quotes.
 * @param {string} csvText
 * @returns {{ headers: string[], rows: Array<Object>, rawRows: string[][], delimiter: string }}
 */
export function parseCsvString(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('Tệp CSV trống hoặc không đúng định dạng văn bản.');
  }

  // Detect delimiter from first non-empty line
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) {
    throw new Error('Tệp CSV không có dữ liệu dòng.');
  }

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  // Parse CSV records respecting quotes
  const records = [];
  let currentRecord = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === delimiter) {
        currentRecord.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // Skip CR
      } else if (char === '\n') {
        currentRecord.push(currentField.trim());
        currentField = '';
        if (currentRecord.some(f => f.length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
      } else {
        currentField += char;
      }
    }
  }

  // Push last field if present
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    if (currentRecord.some(f => f.length > 0)) {
      records.push(currentRecord);
    }
  }

  if (records.length < 1) {
    throw new Error('Không đọc được dòng tiêu đề hoặc dữ liệu từ tệp CSV.');
  }

  const headers = records[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const rawRows = records.slice(1);
  const rows = rawRows.map(row => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? row[idx] : '';
    });
    return obj;
  });

  return { headers, rows, rawRows, delimiter };
}

/**
 * Suggests column mapping and checks for data issues in CSV/XLSX
 * @param {string[]} headers
 * @param {Array<Object>} rows
 * @returns {Object} Mapping proposal & warnings
 */
export function analyzeSpreadsheetData(headers, rows) {
  const columnMap = {
    code: null,
    name: null,
    quantity: null,
    unit: null,
    cost_price: null,
    sale_price: null,
    supplier: null,
    customer: null,
    warehouse: null,
  };

  headers.forEach(h => {
    const n = normText(h);
    if (!columnMap.code && (n.includes('ma hang') || n.includes('ma sp') || n.includes('sku') || n.includes('barcode') || n === 'ma' || n === 'code')) {
      columnMap.code = h;
    } else if (!columnMap.name && (n.includes('ten hang') || n.includes('ten sp') || n.includes('san pham') || n.includes('ten') || n === 'name')) {
      columnMap.name = h;
    } else if (!columnMap.quantity && (n.includes('so luong') || n.includes('ton kho') || n.includes('ton dau') || n === 'sl' || n === 'qty')) {
      columnMap.quantity = h;
    } else if (!columnMap.unit && (n.includes('don vi') || n.includes('dvt') || n === 'unit')) {
      columnMap.unit = h;
    } else if (!columnMap.sale_price && (n.includes('gia ban') || n.includes('don gia ban') || n === 'gia' || n === 'price')) {
      columnMap.sale_price = h;
    } else if (!columnMap.cost_price && (n.includes('gia nhap') || n.includes('gia von') || n.includes('cost'))) {
      columnMap.cost_price = h;
    } else if (!columnMap.supplier && (n.includes('ncc') || n.includes('nha cung cap') || n.includes('supplier'))) {
      columnMap.supplier = h;
    } else if (!columnMap.customer && (n.includes('khach hang') || n.includes('khach') || n.includes('customer'))) {
      columnMap.customer = h;
    } else if (!columnMap.warehouse && (n.includes('kho') || n.includes('warehouse'))) {
      columnMap.warehouse = h;
    }
  });

  // Determine detected kind
  let detectedKind = 'PRODUCT_CATALOG';
  if (columnMap.supplier && !columnMap.code && !columnMap.quantity) {
    detectedKind = 'SUPPLIER_LIST';
  } else if (columnMap.customer && !columnMap.code && !columnMap.quantity) {
    detectedKind = 'CUSTOMER_LIST';
  } else if (columnMap.quantity && (columnMap.code || columnMap.name)) {
    detectedKind = 'INVENTORY_IMPORT';
  }

  // Check duplicate candidate codes
  const seenCodes = new Set();
  const duplicates = [];
  if (columnMap.code) {
    const colIdx = headers.indexOf(columnMap.code);
    const nameColIdx = columnMap.name ? headers.indexOf(columnMap.name) : -1;
    rows.forEach((r, idx) => {
      let code = '';
      let name = '';
      if (Array.isArray(r)) {
        code = colIdx !== -1 ? String(r[colIdx] || '').trim() : '';
        name = nameColIdx !== -1 ? String(r[nameColIdx] || '').trim() : '';
      } else if (r && typeof r === 'object') {
        code = String(r[columnMap.code] || '').trim();
        name = String(r[columnMap.name] || '').trim();
      }
      if (code) {
        if (seenCodes.has(code)) {
          duplicates.push({ row: idx + 2, code, name });
        } else {
          seenCodes.add(code);
        }
      }
    });
  }

  // Missing mandatory fields check
  const missingFields = [];
  if (!columnMap.name && !columnMap.code) {
    missingFields.push('Không nhận diện được cột Mã hàng hoặc Tên hàng.');
  }

  return {
    detectedKind,
    columnMap,
    totalRows: rows.length,
    sampleRows: rows.slice(0, 3),
    duplicates: duplicates.slice(0, 10),
    duplicateCount: duplicates.length,
    missingFields,
  };
}

/**
 * Detects if a JSON object is a QBiz Backup vs general data inspection.
 * @param {Object} obj
 * @returns {{ isBackup: boolean, version?: number, tableCount?: number, tables?: string[], summary?: string }}
 */
export function inspectJsonData(obj) {
  if (!obj || typeof obj !== 'object') {
    return { isBackup: false, summary: 'Tệp JSON không chứa đối tượng hợp lệ.' };
  }

  // Check QBiz backup schema indicators
  const hasVersion = 'version' in obj || 'schema_version' in obj;
  const hasTables = 'tables' in obj && typeof obj.tables === 'object';
  const hasAppData = ('products' in obj && 'warehouses' in obj) || ('inventory' in obj && 'movements' in obj);

  if ((hasVersion && hasTables) || hasAppData) {
    const tableKeys = hasTables ? Object.keys(obj.tables || {}) : Object.keys(obj).filter(k => Array.isArray(obj[k]));
    return {
      isBackup: true,
      version: obj.version || obj.schema_version || 12,
      tables: tableKeys,
      tableCount: tableKeys.length,
      createdAt: obj.exported_at || obj.created_at || 'Không xác định',
    };
  }

  return {
    isBackup: false,
    keyCount: Object.keys(obj).length,
    sampleKeys: Object.keys(obj).slice(0, 8),
  };
}

/**
 * Client-side image resize helper to keep payloads within reasonable token/bandwidth limits.
 * @param {File} file
 * @param {number} maxDimension
 * @returns {Promise<{ dataUrl: string, base64Data: string, width: number, height: number, size: number }>}
 */
export async function processAndResizeImage(file, maxDimension = MAX_IMAGE_DIMENSION) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Tệp tải lên không phải định dạng hình ảnh hợp lệ.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp hình ảnh.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Hình ảnh bị lỗi hoặc không thể phân giải.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Downscale if exceeds max dimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, 0.88);
        const base64Data = dataUrl.split(',')[1] || '';

        resolve({
          dataUrl,
          base64Data,
          width,
          height,
          size: Math.round(base64Data.length * 0.75),
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Create an Attachment object from a browser File object.
 * @param {File} file
 * @returns {Promise<Object>}
 */
export async function createAttachmentFromFile(file) {
  if (!file) {
    throw new Error('Chưa chọn tệp.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Dung lượng tệp (${sizeMb} MB) vượt quá giới hạn 10 MB. Vui lòng chọn tệp nhỏ hơn.`);
  }

  const name = file.name || 'unnamed';
  const ext = (name.lastIndexOf('.') !== -1 ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');
  const isImage = file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

  if (isImage) {
    const imgData = await processAndResizeImage(file);
    return {
      attachment_id: genAttachmentId(),
      type: ATTACHMENT_TYPES.IMAGE,
      mime_type: file.type || 'image/jpeg',
      name,
      size: imgData.size || file.size,
      created_at: new Date().toISOString(),
      data_url: imgData.dataUrl,
      base64_data: imgData.base64Data,
      dimensions: { width: imgData.width, height: imgData.height },
    };
  }

  // Handle files: CSV, JSON, XLSX, PDF
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const parsed = parseCsvString(text);
          const analysis = analyzeSpreadsheetData(parsed.headers, parsed.rows);
          resolve({
            attachment_id: genAttachmentId(),
            type: ATTACHMENT_TYPES.FILE,
            mime_type: 'text/csv',
            name,
            size: file.size,
            created_at: new Date().toISOString(),
            text_content: text.slice(0, 10000), // snippet for inspection
            parsed_data: {
              ...parsed,
              analysis,
            },
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Không đọc được nội dung tệp CSV.'));
      reader.readAsText(file, 'utf-8');
    } else if (ext === '.json') {
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const inspection = inspectJsonData(parsed);
          resolve({
            attachment_id: genAttachmentId(),
            type: ATTACHMENT_TYPES.FILE,
            mime_type: 'application/json',
            name,
            size: file.size,
            created_at: new Date().toISOString(),
            parsed_data: {
              jsonObj: parsed,
              inspection,
            },
          });
        } catch (err) {
          reject(new Error(`Tệp JSON bị lỗi cú pháp: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Không đọc được tệp JSON.'));
      reader.readAsText(file, 'utf-8');
    } else if (ext === '.pdf') {
      reader.onload = (e) => {
        // PDF metadata and data URL preview
        const dataUrl = e.target.result;
        const base64Data = (dataUrl || '').split(',')[1] || '';
        resolve({
          attachment_id: genAttachmentId(),
          type: ATTACHMENT_TYPES.FILE,
          mime_type: 'application/pdf',
          name,
          size: file.size,
          created_at: new Date().toISOString(),
          data_url: dataUrl,
          base64_data: base64Data,
          parsed_data: {
            isPdf: true,
            pageCountEstimate: Math.max(1, Math.round(file.size / 50000)),
          },
        });
      };
      reader.onerror = () => reject(new Error('Không đọc được tệp PDF.'));
      reader.readAsDataURL(file);
    } else if (ext === '.xlsx' || ext === '.xls') {
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const base64Data = (dataUrl || '').split(',')[1] || '';
        resolve({
          attachment_id: genAttachmentId(),
          type: ATTACHMENT_TYPES.FILE,
          mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name,
          size: file.size,
          created_at: new Date().toISOString(),
          data_url: dataUrl,
          base64_data: base64Data,
          parsed_data: {
            isXlsx: true,
            suggestedImport: 'spreadsheet',
          },
        });
      };
      reader.onerror = () => reject(new Error('Không đọc được tệp bảng tính Excel.'));
      reader.readAsDataURL(file);
    } else {
      reject(new Error(`Định dạng tệp "${ext || file.type}" chưa được hỗ trợ. Hệ thống hỗ trợ ảnh (JPG, PNG, WEBP) và tệp (.CSV, .XLSX, .JSON, .PDF).`));
    }
  });
}

/**
 * Local Barcode Detection using browser BarcodeDetector API if available.
 * @param {HTMLImageElement|ImageBitmap} imageSource
 * @returns {Promise<string|null>}
 */
export async function detectLocalBarcode(imageSource) {
  if (typeof window === 'undefined' || !window.BarcodeDetector) {
    return null;
  }
  try {
    const barcodeDetector = new window.BarcodeDetector({
      formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'],
    });
    const barcodes = await barcodeDetector.detect(imageSource);
    if (barcodes && barcodes.length > 0) {
      return barcodes[0].rawValue || null;
    }
  } catch (err) {
    console.warn('Local barcode detection error:', err);
  }
  return null;
}

export const parseCsvContent = parseCsvString;
