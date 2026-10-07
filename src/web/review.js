// ==============================================================================
// QBIZ KHO — BACKEND WEB: hàng "CẦN XEM" — thao tác server từ chối vì DỮ LIỆU (không phải lỗi mạng / phiên), nằm lại
// trên máy, KHÔNG tự gửi lại (flush.js). Chủ shop / quản lý quyết: gửi lại (đã sửa nguyên nhân) hoặc bỏ (giữ dấu vết).
// File này chỉ có nhãn + lý do dễ hiểu (tiếng Việt) và quyền thao tác — giao diện ở app.js.
// ==============================================================================

const TYPE_LABELS = {
  'sale.create': 'Phiếu bán',
  'sale.mark_paid': 'Thu nợ',
  'sale.partial_paid': 'Thu nợ một phần',
  'return.create': 'Trả hàng',
  'shift.open': 'Mở ca',
  'shift.close': 'Đóng ca',
  'customer.create': 'Khách hàng mới',
  'supplier.create': 'Nhà cung cấp mới',
  'inventory_document.receive': 'Phiếu nhập kho',
  'inventory_document.issue': 'Phiếu xuất kho',
  'inventory_document.count': 'Phiếu kiểm kho',
  'purchase_return.create': 'Trả hàng nhà cung cấp',
  'transfer.create': 'Chuyển kho',
  'transfer.receive': 'Nhận chuyển kho',
  'transfer.cancel': 'Huỷ chuyển kho',
};

// Mã lỗi server (RPC kho_*) → lý do + gợi ý xử lý. Mã không có ở đây → hiện thông báo gốc của server.
const REASONS = {
  TOTAL_MISMATCH: 'Tổng tiền trên máy khác giá máy chủ tính lại (giá / khuyến mại đã đổi).',
  PAYMENT_MISMATCH: 'Số tiền thanh toán không khớp tổng phiếu.',
  PRICE_CHANGED: 'Giá sản phẩm đã đổi trên website.',
  INVALID_PRICE: 'Giá bán không hợp lệ.',
  INSUFFICIENT_STOCK: 'Không đủ tồn kho trên máy chủ.',
  OUT_OF_STOCK: 'Sản phẩm đã hết hàng trên máy chủ.',
  ITEM_NOT_FOUND: 'Sản phẩm / dịch vụ không còn trên website (đã xoá).',
  ITEM_UNAVAILABLE: 'Sản phẩm / dịch vụ đang ẩn hoặc ngừng bán.',
  INVALID_COST_VERSION: 'Giá vốn trên máy không khớp sản phẩm.',
  WAREHOUSE_INVALID: 'Kho không còn hoạt động.',
  FORBIDDEN: 'Tài khoản không có quyền với thao tác này.',
  DEVICE_INACTIVE: 'Thiết bị này đã bị khoá trên trang quản trị.',
  REGISTER_INACTIVE: 'Quầy đã bị khoá trên trang quản trị.',
  SHIFT_ALREADY_CLOSED: 'Ca đã được đóng trước đó.',
  RETURN_EXCEEDS_SOLD: 'Số lượng trả vượt số đã bán.',
  REFUND_EXCEEDS: 'Số tiền hoàn vượt số đã thu.',
  CASH_REFUND_EXCEEDS: 'Tiền mặt hoàn vượt tiền mặt đã thu.',
  COLLECT_EXCEEDS_DEBT: 'Số tiền thu vượt công nợ còn lại.',
  NO_DEBT: 'Phiếu không còn công nợ.',
  SALE_NOT_RETURNABLE: 'Phiếu bán không trả hàng được.',
  SALE_NOT_COLLECTABLE: 'Phiếu bán không thu nợ được.',
  TRANSFER_ALREADY_RECEIVED: 'Phiếu chuyển đã được nhận trước đó.',
  TRANSFER_CANCELLED: 'Phiếu chuyển đã bị huỷ.',
  TRANSFER_NOT_IN_TRANSIT: 'Phiếu chuyển không còn đang vận chuyển.',
  OPERATION_ID_CONFLICT: 'Trùng mã thao tác với một thao tác khác.',
  DEPENDENCY_IN_REVIEW: 'Phụ thuộc vào một thao tác khác đang cần xem — xử lý thao tác đó trước.',
  DEPENDENCY_DISCARDED: 'Phụ thuộc vào một thao tác đã bị bỏ.',
};

export const reviewTypeLabel = (type) => TYPE_LABELS[type] || String(type || 'Thao tác');

/** Lý do dễ hiểu cho 1 dòng "cần xem" (ưu tiên mã lỗi, rồi đến thông báo gốc). */
export function reviewReason(row) {
  const code = String(row?.last_error_code || '').toUpperCase();
  return REASONS[code] || String(row?.last_error || 'Máy chủ từ chối thao tác.').slice(0, 200);
}

/** Bỏ 1 thao tác = dữ liệu chỉ còn trên máy này → chỉ chủ shop / quản lý. Gửi lại thì ai cũng được (sai thì về lại). */
export const canDiscardReview = (role) => role === 'OWNER' || role === 'MANAGER';
