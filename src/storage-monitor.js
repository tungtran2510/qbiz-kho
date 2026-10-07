// ==============================================================================
// QBIZ KHO — STORAGE QUOTA MONITOR & AUTO-MAINTENANCE ENGINE
// Quản lý hạn mức bộ nhớ thiết bị & Tự động dọn dẹp nhật ký cũ
// Giữ ứng dụng luôn nhanh và nhẹ sau nhiều năm kinh doanh
// ==============================================================================

import { getAll, remove } from './db.js';
import { pruneSyncedOutbox } from './sync.js';

const STORAGE_LAST_MAINTENANCE_KEY = 'qbiz_last_auto_maintenance_at';

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/**
 * Kiểm tra hạn mức dung lượng bộ nhớ thiết bị
 */
export async function checkStorageQuota() {
  let usage = 0;
  let quota = 0;
  let percentUsed = 0;
  let isPersisted = false;

  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        usage = est.usage || 0;
        quota = est.quota || 0;
        if (quota > 0) {
          percentUsed = Math.min(100, Math.round((usage / quota) * 1000) / 10);
        }
      }
      if (navigator.storage.persisted) {
        isPersisted = await navigator.storage.persisted();
      }
    }
  } catch (err) {
    console.warn('[StorageMonitor] Không thể kiểm tra hạn mức:', err);
  }

  return {
    usageBytes: usage,
    quotaBytes: quota,
    usageFormatted: formatBytes(usage),
    quotaFormatted: formatBytes(quota),
    percentUsed,
    isPersisted,
    isLowStorage: percentUsed >= 80,
    statusLabel: percentUsed >= 90 ? 'Nguy cấp (>90%)' : (percentUsed >= 80 ? 'Sắp đầy (>80%)' : 'Rất tốt (Dưới 80%)')
  };
}

/**
 * Thực hiện dọn dẹp định kỳ log in ấn và log hóa đơn cũ (> 90 ngày)
 */
export async function performAutoMaintenance({ maxAgeDays = 90 } = {}) {
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  let cleanedPrintJobs = 0;
  let cleanedInvoiceLogs = 0;
  let prunedOutboxCount = 0;

  try {
    // 1. Dọn dẹp print_jobs cũ hơn 90 ngày
    const printJobs = await getAll('print_jobs');
    for (const job of printJobs) {
      const ts = Date.parse(job.created_at || job.createdAt || 0);
      if (ts && ts < cutoff && (job.id || job.job_id)) {
        await remove('print_jobs', job.id || job.job_id);
        cleanedPrintJobs++;
      }
    }

    // 2. Dọn dẹp invoice_audit_logs cũ hơn 90 ngày
    const invoiceLogs = await getAll('invoice_audit_logs');
    for (const log of invoiceLogs) {
      const ts = Date.parse(log.created_at || log.timestamp || 0);
      if (ts && ts < cutoff && (log.id || log.log_id)) {
        await remove('invoice_audit_logs', log.id || log.log_id);
        cleanedInvoiceLogs++;
      }
    }

    // 3. Dọn dẹp outbox đã đồng bộ > 30 ngày
    const outboxRes = await pruneSyncedOutbox({ maxAgeDays: 30 });
    prunedOutboxCount = outboxRes.pruned || 0;

    localStorage.setItem(STORAGE_LAST_MAINTENANCE_KEY, new Date().toISOString());

    console.log(`[StorageMonitor] Tự động bảo trì hoàn tất: Đã dọn ${cleanedPrintJobs} bản in cũ, ${cleanedInvoiceLogs} log hóa đơn cũ, ${prunedOutboxCount} chứng từ outbox.`);
  } catch (err) {
    console.warn('[StorageMonitor] Lỗi khi dọn dẹp:', err);
  }

  return {
    cleanedPrintJobs,
    cleanedInvoiceLogs,
    prunedOutboxCount,
    cleanedAt: new Date().toISOString()
  };
}

/**
 * Lên lịch tự động bảo trì ngầm 24h một lần
 */
export function scheduleAutoMaintenance() {
  if (typeof window === 'undefined') return;

  const lastRun = localStorage.getItem(STORAGE_LAST_MAINTENANCE_KEY);
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (!lastRun || (now - Date.parse(lastRun) > ONE_DAY_MS)) {
    setTimeout(() => {
      performAutoMaintenance().catch(() => {});
    }, 12000); // Chạy sau 12 giây sau khi app đã ổn định
  }
}
