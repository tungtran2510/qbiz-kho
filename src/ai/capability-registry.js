/**
 * QBIZ CONTEXTUAL AI OPERATING LAYER — CANONICAL CAPABILITY REGISTRY (PHASE 2)
 * 
 * Source of Truth for all Kho AI Capabilities.
 * Binds directly to TOOLS (src/ai/tools.js, 41 tools) and SKILL_REGISTRY (src/ai/skills.js, 40 skills).
 * Generates the Tool Manifest for Model Prompts dynamically.
 * Eliminates duplicate hardcoded tool lists.
 */

import { TOOLS } from './tools.js';
import { SKILL_REGISTRY } from './skills.js';
import { PERMISSIONS } from './policy.js';

export const CAPABILITY_MODES = {
  READ: 'READ',
  WRITE: 'WRITE',
  HIGH_RISK_WRITE: 'HIGH_RISK_WRITE',
};

export const KHO_CAPABILITY_REGISTRY = {
  // =========================================================================
  // 1. INVENTORY READ CAPABILITIES
  // =========================================================================
  'check_stock': {
    compact_description: 'Tra cứu số lượng tồn kho thực tế và khả dụng',
    capability_id: 'check_stock',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tra cứu số lượng tồn kho thực tế và tồn khả dụng của một sản phẩm cụ thể hoặc tổng quan kho.',
    input_schema: {
      productId: { type: 'string', required: false },
      productName: { type: 'string', required: false },
      warehouseId: { type: 'string', default: 'all' },
    },
    output_contract: 'StockStatusResult',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: ['product', 'warehouse'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'check-stock', fallbackTool: 'get_available_stock' },
    active: true,
  },

  'find_low_stock': {
    compact_description: 'Tìm hàng sắp hết hoặc hết hàng trong kho',
    capability_id: 'find_low_stock',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Liệt kê danh sách các mặt hàng sắp hết hoặc đã hết sạch hàng trong kho cần chú ý.',
    input_schema: {
      warehouseId: { type: 'string', default: 'all' },
    },
    output_contract: 'LowStockListResult',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: ['warehouse'],
    time_support: false,
    implementation_binding: { type: 'tool', target: 'find_low_stock', fallbackSkill: 'find-low-stock' },
    active: true,
  },

  'search_products': {
    compact_description: 'Tìm kiếm sản phẩm theo tên, SKU, barcode',
    capability_id: 'search_products',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tìm kiếm sản phẩm theo tên, mã SKU hoặc Barcode.',
    input_schema: {
      query: { type: 'string', required: true },
    },
    output_contract: 'ProductCandidateList',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: ['product'],
    time_support: false,
    implementation_binding: { type: 'tool', target: 'search_products', fallbackSkill: 'search-product' },
    active: true,
  },

  'price_lookup': {
    compact_description: 'Tra cứu giá bán niêm yết của sản phẩm',
    capability_id: 'price_lookup',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tra cứu giá bán niêm yết và thông tin cơ bản của sản phẩm.',
    input_schema: {
      productId: { type: 'string', required: true },
    },
    output_contract: 'PriceLookupResult',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: ['product'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'price-lookup', fallbackTool: 'get_product' },
    active: true,
  },

  'replenishment_suggestion': {
    compact_description: 'Gợi ý danh sách mặt hàng cần nhập thêm',
    capability_id: 'replenishment_suggestion',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Gợi ý danh sách các mặt hàng cần nhập thêm dựa theo tốc độ bán hàng và tồn an toàn.',
    input_schema: {
      warehouseId: { type: 'string', default: 'all' },
      limit: { type: 'number', default: 5 },
    },
    output_contract: 'ReplenishmentSuggestionList',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: ['warehouse'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'replenishment-suggestion', fallbackTool: 'get_replenishment_suggestions' },
    active: true,
  },

  'explain_replenishment': {
    compact_description: 'Tư vấn sản phẩm cụ thể có nên nhập thêm không',
    capability_id: 'explain_replenishment',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tư vấn một sản phẩm cụ thể có nên nhập thêm không (NÊN NHẬP / CHƯA CẦN) kèm số lượng khuyến nghị.',
    input_schema: {
      productId: { type: 'string', required: true },
      warehouseId: { type: 'string', default: 'all' },
    },
    output_contract: 'ReplenishmentAdviceResult',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: ['product', 'warehouse'],
    time_support: false,
    implementation_binding: { type: 'tool', target: 'explain_replenishment', fallbackSkill: 'product-replenishment-inquiry' },
    active: true,
  },

  'query_receipts_aggregate': {
    compact_description: 'Tổng kết lịch sử các phiếu nhập kho đã phát sinh',
    capability_id: 'query_receipts_aggregate',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Báo cáo tổng kết lịch sử và số lượng các phiếu nhập kho đã phát sinh trong quá khứ.',
    input_schema: {
      period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'month', 'last_month'], default: 'month' },
    },
    output_contract: 'ReceiptsAggregateResult',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'tool', target: 'query_receipts_aggregate' },
    active: true,
  },

  'slow_moving_products': {
    compact_description: 'Danh sách hàng bán chậm, tồn kho đọng lâu',
    capability_id: 'slow_moving_products',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Báo cáo danh sách hàng bán chậm, tồn kho đọng lâu ngày.',
    input_schema: {
      daysThreshold: { type: 'number', default: 30 },
    },
    output_contract: 'SlowMovingListResult',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'skill', target: 'slow-moving-products', fallbackTool: 'get_slow_movers' },
    active: true,
  },

  'stock_diagnosis': {
    compact_description: 'Chẩn đoán bất thường kho, lệch tồn, tồn âm',
    capability_id: 'stock_diagnosis',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Chẩn đoán bất thường kho hàng: lệch tồn, tồn âm, cảnh báo hết date.',
    input_schema: {
      warehouseId: { type: 'string', default: 'all' },
    },
    output_contract: 'StockDiagnosisResult',
    required_permissions: [PERMISSIONS.READ_STOCK],
    entity_types: ['warehouse'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'stock-diagnosis', fallbackTool: 'diagnose_stock' },
    active: true,
  },

  // =========================================================================
  // 2. SALES & FINANCE READ CAPABILITIES
  // =========================================================================
  'get_profit_summary': {
    compact_description: 'Báo cáo lợi nhuận, giá vốn, doanh thu, tỷ suất lãi',
    capability_id: 'get_profit_summary',
    domain: 'FINANCE',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Báo cáo lợi nhuận, giá vốn, doanh thu và tỷ suất lãi kinh doanh theo khoảng thời gian. Yêu cầu quyền VIEW_COST.',
    input_schema: {
      period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'month', 'last_month', 'year'], default: 'month' },
    },
    output_contract: 'ProfitSummaryResult',
    required_permissions: [PERMISSIONS.VIEW_COST],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'skill', target: 'profit-inquiry', fallbackTool: 'get_profit_summary' },
    active: true,
  },

  'sales_summary': {
    compact_description: 'Tổng kết doanh thu bán hàng, số hóa đơn',
    capability_id: 'sales_summary',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tổng kết doanh thu bán hàng, số hóa đơn đã xuất và giá trị trung bình đơn.',
    input_schema: {
      period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'month'], default: 'today' },
    },
    output_contract: 'SalesSummaryResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'skill', target: 'sales-summary', fallbackTool: 'get_sales_summary' },
    active: true,
  },

  'export_report': {
    compact_description: 'Xuất báo cáo bán hàng, tồn kho hoặc bảng kê thuế S2b theo TT88',
    capability_id: 'export_report',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Xuất báo cáo doanh thu, nhập xuất tồn hoặc bảng kê chi tiết thuế theo Thông tư 88/2021/TT-BTC (S2b-HKD).',
    input_schema: {
      period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'month', 'lastmonth'], default: 'month' },
      reportType: { type: 'string', enum: ['sales', 'inventory', 'revenue_tt88', 'issue_tt200'], default: 'revenue_tt88' },
    },
    output_contract: 'ExportReportResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'skill', target: 'export-report', fallbackTool: 'get_sales_summary' },
    active: true,
  },

  'top_selling_products': {
    compact_description: 'Danh sách các mặt hàng bán chạy nhất',
    capability_id: 'top_selling_products',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Danh sách các mặt hàng bán chạy nhất cửa hàng.',
    input_schema: {
      period: { type: 'string', default: 'month' },
      limit: { type: 'number', default: 5 },
    },
    output_contract: 'TopSellingListResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'skill', target: 'top-selling-products' },
    active: true,
  },

  'product_performance_ranking': {
    compact_description: 'Xếp hạng mặt hàng bán chạy/tốt và bán chậm/ế theo thời gian',
    capability_id: 'product_performance_ranking',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Phân tích và xếp hạng hiệu suất mặt hàng trong kỳ: các sản phẩm bán chạy/tốt nhất và các sản phẩm bán chậm/ế/không bán được.',
    input_schema: {
      period: { type: 'string', enum: ['today', 'yesterday', '2_days', 'this_week', 'last_week', '7d', 'month', 'last_month', '30d'], default: 'this_week' },
      limit: { type: 'number', default: 5 },
      sortBy: { type: 'string', enum: ['auto', 'quantity', 'revenue'], default: 'auto' },
    },
    output_contract: 'ProductPerformanceRankingResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['product'],
    time_support: true,
    implementation_binding: { type: 'tool', target: 'getProductPerformanceRanking', fallbackSkill: 'product-performance-ranking' },
    active: true,
  },

  'order_diagnosis': {
    compact_description: 'Tra cứu và chẩn đoán chi tiết đơn hàng',
    capability_id: 'order_diagnosis',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tra cứu và chẩn đoán chi tiết một đơn hàng cụ thể.',
    input_schema: {
      orderId: { type: 'string', required: true },
    },
    output_contract: 'OrderDiagnosisResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['order'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'order-diagnosis', fallbackTool: 'diagnose_order' },
    active: true,
  },

  'high_revenue_low_margin': {
    compact_description: 'Phân tích sản phẩm doanh thu cao biên lãi mỏng',
    capability_id: 'high_revenue_low_margin',
    domain: 'FINANCE',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Phân tích các sản phẩm doanh thu cao nhưng biên lợi nhuận mỏng.',
    input_schema: {
      period: { type: 'string', default: 'month' },
    },
    output_contract: 'MarginAnalysisResult',
    required_permissions: [PERMISSIONS.VIEW_COST],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'skill', target: 'high-revenue-low-margin', fallbackTool: 'get_high_revenue_low_margin' },
    active: true,
  },

  'get_customer_debt_summary': {
    compact_description: 'Tra cứu tổng nợ và hạn mức nợ khách hàng',
    capability_id: 'get_customer_debt_summary',
    domain: 'FINANCE',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tra cứu tổng công nợ, hạn mức công nợ và các hóa đơn chưa thanh toán của khách hàng.',
    input_schema: {
      query: { type: 'string', required: false },
      customerId: { type: 'string', required: false },
    },
    output_contract: 'CustomerDebtSummaryResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['customer'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'customer-debt-inquiry', fallbackTool: 'get_customer_debt_summary' },
    active: true,
  },

  'get_customer_aging_report': {
    compact_description: 'Báo cáo phân tích 4 nhóm tuổi nợ khách hàng',
    capability_id: 'get_customer_aging_report',
    domain: 'FINANCE',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Báo cáo tuổi nợ khách hàng phân chia theo 4 nhóm: 0-30 ngày, 31-60 ngày, 61-90 ngày và trên 90 ngày.',
    input_schema: {},
    output_contract: 'CustomerAgingReportResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'customer-aging-report', fallbackTool: 'get_customer_aging_report' },
    active: true,
  },

  'get_customer_profile_history': {
    compact_description: 'Hồ sơ khách hàng, vòng đời chi tiêu và lịch sử mua',
    capability_id: 'get_customer_profile_history',
    domain: 'FINANCE',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tra cứu hồ sơ khách hàng, vòng đời chi tiêu (LTV), số đơn đã mua và các mặt hàng mua nhiều nhất.',
    input_schema: {
      query: { type: 'string', required: false },
      customerId: { type: 'string', required: false },
    },
    output_contract: 'CustomerProfileHistoryResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['customer'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'customer-debt-inquiry', fallbackTool: 'get_customer_profile_history' },
    active: true,
  },

  'get_operating_expenses': {
    compact_description: 'Báo cáo chi phí vận hành cửa hàng',
    capability_id: 'get_operating_expenses',
    domain: 'FINANCE',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Báo cáo chi phí vận hành cửa hàng theo thời gian, danh mục và phương thức thanh toán.',
    input_schema: {
      period: { type: 'string', default: 'month' },
    },
    output_contract: 'OperatingExpensesResult',
    required_permissions: [PERMISSIONS.VIEW_COST],
    entity_types: [],
    time_support: true,
    implementation_binding: { type: 'skill', target: 'operating-expenses-inquiry', fallbackTool: 'get_operating_expenses' },
    active: true,
  },

  // =========================================================================
  // 3. OPERATIONS & HEALTH READ CAPABILITIES
  // =========================================================================
  'shop_health_check': {
    compact_description: 'Quét toàn diện sức khỏe vận hành cửa hàng',
    capability_id: 'shop_health_check',
    domain: 'SYSTEM',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Quét toàn diện sức khỏe vận hành cửa hàng: tồn âm, lệch sổ cái, đơn hàng tồn đọng.',
    input_schema: {},
    output_contract: 'ShopHealthReport',
    required_permissions: [PERMISSIONS.MANAGE_INVENTORY],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'shop-health-check', fallbackTool: 'get_shop_health_report' },
    active: true,
  },

  'five_actions_today': {
    compact_description: 'Top 5 hành động vận hành ưu tiên hôm nay',
    capability_id: 'five_actions_today',
    domain: 'SYSTEM',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Top 5 hành động vận hành ưu tiên cao nhất cho chủ cửa hàng hôm nay.',
    input_schema: {},
    output_contract: 'FiveActionsResult',
    required_permissions: [],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'five-actions-today', fallbackTool: 'get_five_actions_today' },
    active: true,
  },

  'daily_attention': {
    compact_description: 'Điểm tin nhanh việc cần xử lý gấp trong ngày',
    capability_id: 'daily_attention',
    domain: 'SYSTEM',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Điểm tin nhanh những việc cần xử lý gấp trong ngày.',
    input_schema: {},
    output_contract: 'DailyAttentionDigest',
    required_permissions: [],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'daily-attention', fallbackTool: 'get_daily_attention_digest' },
    active: true,
  },

  'search_customers': {
    compact_description: 'Tìm kiếm khách hàng theo tên, SĐT, mã',
    capability_id: 'search_customers',
    domain: 'CUSTOMERS',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tìm kiếm khách hàng theo tên, số điện thoại hoặc mã.',
    input_schema: {
      query: { type: 'string', required: true },
    },
    output_contract: 'CustomerCandidateList',
    required_permissions: [PERMISSIONS.VIEW_CUSTOMERS],
    entity_types: ['customer'],
    time_support: false,
    implementation_binding: { type: 'tool', target: 'search_customers' },
    active: true,
  },

  'search_orders': {
    compact_description: 'Tìm kiếm danh sách đơn hàng theo trạng thái hoặc mã',
    capability_id: 'search_orders',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tìm kiếm danh sách đơn hàng theo trạng thái hoặc mã.',
    input_schema: {
      query: { type: 'string', required: false },
    },
    output_contract: 'OrderCandidateList',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['order'],
    time_support: false,
    implementation_binding: { type: 'tool', target: 'search_orders' },
    active: true,
  },

  // =========================================================================
  // 4. WRITE CAPABILITIES — PROPOSAL ONLY (NEVER DIRECT DB WRITE)
  // =========================================================================
  'receipt_proposal': {
    compact_description: 'Đề xuất nhập hàng, nhập kho (tạo Proposal)',
    capability_id: 'receipt_proposal',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.WRITE,
    human_description: 'Nhập hàng, nhập kho thêm sản phẩm (ví dụ: "nhập 8 chiếc này", "nhập thêm hàng"). Bắt buộc tạo đề xuất Proposal chờ người dùng xác nhận, không ghi thẳng DB.',
    input_schema: {
      productId: { type: 'string', required: true },
      quantity: { type: 'number', required: true },
      warehouseId: { type: 'string', default: 'wh_center' },
    },
    output_contract: 'ProposalDraftResult',
    required_permissions: [PERMISSIONS.RECEIVE_STOCK],
    entity_types: ['product', 'warehouse'],
    time_support: false,
    idempotency_policy: 'PROPOSAL_CONFIRMATION_REQUIRED',
    implementation_binding: { type: 'skill', target: 'receipt-proposal', fallbackTool: 'create_receipt_proposal' },
    active: true,
  },

  'issue_proposal': {
    compact_description: 'Đề xuất xuất kho hủy / dùng nội bộ (tạo Proposal)',
    capability_id: 'issue_proposal',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.WRITE,
    human_description: 'Lập phiếu đề xuất xuất kho hủy / dùng nội bộ (tạo Proposal chờ xác nhận).',
    input_schema: {
      productId: { type: 'string', required: true },
      quantity: { type: 'number', required: true },
      reason: { type: 'string', default: 'Xuất hủy' },
    },
    output_contract: 'ProposalDraftResult',
    required_permissions: [PERMISSIONS.RECEIVE_STOCK],
    entity_types: ['product', 'warehouse'],
    time_support: false,
    idempotency_policy: 'PROPOSAL_CONFIRMATION_REQUIRED',
    implementation_binding: { type: 'skill', target: 'issue-proposal', fallbackTool: 'create_issue_proposal' },
    active: true,
  },

  'transfer_proposal': {
    compact_description: 'Đề xuất chuyển hàng giữa các kho (tạo Proposal)',
    capability_id: 'transfer_proposal',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.WRITE,
    human_description: 'Lập phiếu đề xuất chuyển hàng giữa các kho (tạo Proposal chờ xác nhận).',
    input_schema: {
      productId: { type: 'string', required: true },
      quantity: { type: 'number', required: true },
      fromWarehouseId: { type: 'string', required: true },
      toWarehouseId: { type: 'string', required: true },
    },
    output_contract: 'ProposalDraftResult',
    required_permissions: [PERMISSIONS.TRANSFER_STOCK],
    entity_types: ['product', 'warehouse'],
    time_support: false,
    idempotency_policy: 'PROPOSAL_CONFIRMATION_REQUIRED',
    implementation_binding: { type: 'skill', target: 'transfer-proposal', fallbackTool: 'create_transfer_proposal' },
    active: true,
  },

  'stocktake_proposal': {
    compact_description: 'Đề xuất kiểm kê cân bằng kho (tạo Proposal)',
    capability_id: 'stocktake_proposal',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.HIGH_RISK_WRITE,
    human_description: 'Lập phiếu đề xuất kiểm kê cân bằng kho (tạo Proposal kiểm kê, tuyệt đối không tự cân bằng).',
    input_schema: {
      productId: { type: 'string', required: true },
      actualQuantity: { type: 'number', required: true },
      warehouseId: { type: 'string', default: 'wh_center' },
    },
    output_contract: 'ProposalDraftResult',
    required_permissions: [PERMISSIONS.STOCKTAKE_STOCK],
    entity_types: ['product', 'warehouse'],
    time_support: false,
    idempotency_policy: 'PROPOSAL_CONFIRMATION_REQUIRED',
    implementation_binding: { type: 'skill', target: 'stocktake-proposal', fallbackTool: 'create_stocktake_proposal' },
    active: true,
  },

  'add_cart_draft': {
    compact_description: 'Thêm sản phẩm vào giỏ hàng nháp POS',
    capability_id: 'add_cart_draft',
    domain: 'SALES',
    mode: CAPABILITY_MODES.WRITE,
    human_description: 'Thêm sản phẩm vào giỏ hàng nháp POS (tạo giỏ draft, không thanh toán tự động).',
    input_schema: {
      productId: { type: 'string', required: true },
      quantity: { type: 'number', default: 1 },
    },
    output_contract: 'CartDraftResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['product'],
    time_support: false,
    idempotency_policy: 'DRAFT_MUTATION_ONLY',
    implementation_binding: { type: 'skill', target: 'add-cart-draft', fallbackTool: 'create_cart_draft' },
    active: true,
  },

  'order_proposal': {
    compact_description: 'Đề xuất tạo đơn bán hàng / bán nợ (tạo Proposal)',
    capability_id: 'order_proposal',
    domain: 'SALES',
    mode: CAPABILITY_MODES.WRITE,
    human_description: 'Lập đơn bán hàng hoặc bán nợ có khách hàng, chiết khấu, kỳ hạn công nợ (tuân thủ Thông tư 88 ghi nhận doanh thu tính thuế cho HKD). Bắt buộc tạo Proposal chờ xác nhận.',
    input_schema: {
      customerName: { type: 'string', required: false },
      customerPhone: { type: 'string', required: false },
      items: { type: 'array', required: true },
      discount: { type: 'number', default: 0 },
      paymentMethod: { type: 'string', default: 'TM' },
      paymentTermDays: { type: 'number', default: 0 },
      warehouseId: { type: 'string', default: 'wh_center' },
    },
    output_contract: 'ProposalDraftResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['customer', 'product', 'warehouse'],
    time_support: false,
    idempotency_policy: 'PROPOSAL_CONFIRMATION_REQUIRED',
    implementation_binding: { type: 'skill', target: 'order-proposal', fallbackTool: 'create_order_proposal' },
    active: true,
  },

  'electronic_invoice_proposal': {
    compact_description: 'Đề xuất lập hóa đơn điện tử / VAT (tạo Proposal)',
    capability_id: 'electronic_invoice_proposal',
    domain: 'INVOICE',
    mode: CAPABILITY_MODES.WRITE,
    human_description: 'Lập hóa đơn điện tử / hóa đơn GTGT theo Nghị định 123 / Thông tư 78 gồm MST, tên đơn vị, địa chỉ, thuế suất VAT (tạo Proposal bản nháp Draft).',
    input_schema: {
      taxCode: { type: 'string', required: false },
      companyName: { type: 'string', required: false },
      address: { type: 'string', required: false },
      items: { type: 'array', required: true },
      vatRate: { type: 'number', default: 10 },
      paymentMethod: { type: 'string', default: 'CK' },
    },
    output_contract: 'ProposalDraftResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: ['customer', 'product'],
    time_support: false,
    idempotency_policy: 'PROPOSAL_CONFIRMATION_REQUIRED',
    implementation_binding: { type: 'skill', target: 'invoice-proposal', fallbackTool: 'create_invoice_proposal' },
    active: true,
  },

  'manage_hardware_printer': {
    compact_description: 'Điều khiển máy in POS, đổi khổ giấy K58/K80, in lại bill gần nhất, in test',
    capability_id: 'manage_hardware_printer',
    domain: 'SYSTEM',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Quản lý máy in hóa đơn POS: Chuyển khổ giấy in (K58 hoặc K80), in lại hóa đơn gần nhất, in test thử nghiệm.',
    input_schema: {
      action: { type: 'string', enum: ['SET_PAPER_K58', 'SET_PAPER_K80', 'PRINT_LATEST_INVOICE', 'PRINT_TEST', 'PRINTER_SETTINGS'], default: 'PRINT_LATEST_INVOICE' },
    },
    output_contract: 'PrinterActionResult',
    required_permissions: [],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'action', target: 'manage_printer' },
    active: true,
  },

  'compare_warehouse_stock': {
    compact_description: 'So sánh tồn kho giữa các kho hàng (dạng bảng đối chiếu 2 cột)',
    capability_id: 'compare_warehouse_stock',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Đối chiếu và so sánh số lượng tồn kho giữa các kho hàng dạng bảng đa cột trực quan.',
    input_schema: {
      warehouseA: { type: 'string', required: false },
      warehouseB: { type: 'string', required: false },
      query: { type: 'string', required: false },
    },
    output_contract: 'CompareWarehouseStockResult',
    required_permissions: [PERMISSIONS.VIEW_STOCK],
    entity_types: ['warehouse', 'product'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'compare-warehouse-stock', fallbackTool: 'check_stock' },
    active: true,
  },

  'stocktake_discrepancies': {
    compact_description: 'Kiểm kê và phát hiện chênh lệch thừa/thiếu giữa thực tế và sổ sách',
    capability_id: 'stocktake_discrepancies',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Báo cáo chênh lệch thừa/thiếu giữa số lượng kiểm đếm thực tế và tồn sổ sách kế toán.',
    input_schema: {
      warehouseId: { type: 'string', required: false },
    },
    output_contract: 'StocktakeDiscrepanciesResult',
    required_permissions: [PERMISSIONS.VIEW_STOCK],
    entity_types: ['warehouse'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'stocktake-discrepancies', fallbackTool: 'reconcile_ledger' },
    active: true,
  },

  'generate_vietqr': {
    compact_description: 'Tạo mã QR thanh toán động chuẩn NAPAS 247 theo đơn hoặc số tiền',
    capability_id: 'generate_vietqr',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Sinh mã QR động chuẩn NAPAS 247 cho chuyển khoản ngân hàng theo đơn hoặc số tiền.',
    input_schema: {
      amount: { type: 'number', required: false },
      orderCode: { type: 'string', required: false },
      note: { type: 'string', required: false },
      bankName: { type: 'string', required: false },
      accountNumber: { type: 'string', required: false },
      accountOwner: { type: 'string', required: false },
    },
    output_contract: 'GenerateVietQRResult',
    required_permissions: [],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'generate-vietqr' },
    active: true,
  },

  'manage_pos_shift': {
    compact_description: 'Mở ca, chốt ca thu ngân và đối soát két tiền mặt (Z-Report)',
    capability_id: 'manage_pos_shift',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Mở ca, chốt ca thu ngân và đối soát két tiền mặt (Z-Report) phân tích chênh lệch thừa/thiếu.',
    input_schema: {
      action: { type: 'string', enum: ['OPEN_SHIFT', 'CLOSE_SHIFT', 'RECONCILE_SHIFT'], default: 'RECONCILE_SHIFT' },
      countedCash: { type: 'number', required: false },
      openingCash: { type: 'number', default: 1000000 },
    },
    output_contract: 'ShiftReportResult',
    required_permissions: [PERMISSIONS.VIEW_SALES],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'manage-pos-shift' },
    active: true,
  },

  'carrier_logistics': {
    compact_description: 'Tra cứu vận đơn (GHN, GHTK, Viettel Post) và báo giá cước vận chuyển',
    capability_id: 'carrier_logistics',
    domain: 'INVENTORY',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Tra cứu hành trình vận đơn (Giao Hàng Nhanh, GHTK, Viettel Post) và ước tính cước phí giao hàng.',
    input_schema: {
      action: { type: 'string', enum: ['TRACK_SHIPMENT', 'ESTIMATE_FEE'], default: 'TRACK_SHIPMENT' },
      trackingCode: { type: 'string', required: false },
      carrierCode: { type: 'string', required: false },
      weight: { type: 'number', default: 500 },
    },
    output_contract: 'CarrierLogisticsResult',
    required_permissions: [],
    entity_types: ['order'],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'carrier-logistics' },
    active: true,
  },

  'clarify_ambiguity': {
    compact_description: 'Yêu cầu làm rõ khi thông tin mơ hồ hoặc thiếu',
    capability_id: 'clarify_ambiguity',
    domain: 'SYSTEM',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Đặt câu hỏi hoặc yêu cầu làm rõ khi yêu cầu người dùng quá mơ hồ hoặc thiếu thông tin.',
    input_schema: {
      question: { type: 'string', required: false },
    },
    output_contract: 'ClarificationResult',
    required_permissions: [],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'clarify-ambiguity', fallbackTool: 'clarify_ambiguity' },
    active: true,
  },

  'setup_payment_qr': {
    compact_description: 'Hướng dẫn thiết lập VietQR và tự động ting ting (payOS / Webhook)',
    capability_id: 'setup_payment_qr',
    domain: 'SETTINGS',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Hướng dẫn cài đặt tài khoản ngân hàng nhận tiền QR và bật cơ chế tự động ting ting qua payOS hoặc Webhook.',
    input_schema: {},
    output_contract: 'SetupPaymentQrResult',
    required_permissions: [],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'setup-payment-qr', fallbackTool: 'setup_payment_qr' },
    active: true,
  },

  'audit_qr_payment': {
    compact_description: 'Kiểm tra trạng thái thanh toán chuyển khoản / VietQR',
    capability_id: 'audit_qr_payment',
    domain: 'SALES',
    mode: CAPABILITY_MODES.READ,
    human_description: 'Kiểm tra trạng thái thanh toán chuyển khoản hoặc mã QR của đơn hàng hiện tại hoặc các đơn gần nhất.',
    input_schema: {
      query: { type: 'string', required: false }
    },
    output_contract: 'AuditQrPaymentResult',
    required_permissions: [],
    entity_types: [],
    time_support: false,
    implementation_binding: { type: 'skill', target: 'audit-qr-payment', fallbackTool: 'audit_qr_payment' },
    active: true,
  },
};

/**
 * Generate Tool Manifest for Model Prompts dynamically from the Canonical Registry.
 * Eliminates duplicate hardcoded tool lists in semantic-planner.js.
 */

/**
 * Generate Compact Tool Manifest for Model Prompts dynamically from the Canonical Registry.
 * Projects and compresses capabilities based on route, role, and query context.
 * Eliminates duplicate hardcoded tool lists in semantic-planner.js.
 */
export function generateCompactToolManifest(options = {}) {
  const {
    route = 'dashboard',
    role = 'owner',
    query = '',
    all = false,
  } = (typeof options === 'string' ? { query: options } : options) || {};

  const q = String(query || '').toLowerCase();
  const r = String(route || 'dashboard').toLowerCase();
  const isCashier = role === 'cashier';

  // 1. Permission filter: Cashier lacks cost/receipt write/stocktake permissions
  const accessibleCaps = Object.values(KHO_CAPABILITY_REGISTRY).filter(cap => {
    if (!cap.active) return false;
    if (isCashier) {
      if (cap.required_permissions?.includes(PERMISSIONS.VIEW_COST)) return false;
      if (cap.required_permissions?.includes(PERMISSIONS.RECEIVE_STOCK)) return false;
      if (cap.required_permissions?.includes(PERMISSIONS.STOCKTAKE_STOCK)) return false;
      if (cap.required_permissions?.includes(PERMISSIONS.MANAGE_INVENTORY)) return false;
    }
    return true;
  });

  if (all) {
    return accessibleCaps
      .map(cap => `- ${cap.capability_id} (${cap.mode}): ${cap.compact_description || cap.human_description}`)
      .join('\n');
  }

  // 2. Core baseline capabilities always included
  const selectedIds = new Set([
    'check_stock',
    'find_low_stock',
    'price_lookup',
    'clarify_ambiguity',
  ]);
  if (!isCashier) {
    selectedIds.add('receipt_proposal');
  }

  // 3. Route-based inclusion
  if (r.includes('sale') || r.includes('pos')) {
    selectedIds.add('sales_summary');
    selectedIds.add('top_selling_products');
    selectedIds.add('product_performance_ranking');
    selectedIds.add('add_cart_draft');
    selectedIds.add('search_orders');
    selectedIds.add('search_customers');
    selectedIds.add('order_diagnosis');
  } else if (r.includes('product') || r.includes('inventory') || r.includes('kho')) {
    selectedIds.add('replenishment_suggestion');
    selectedIds.add('explain_replenishment');
    selectedIds.add('transfer_proposal');
    selectedIds.add('stocktake_proposal');
    selectedIds.add('slow_moving_products');
    selectedIds.add('stock_diagnosis');
    selectedIds.add('query_receipts_aggregate');
    selectedIds.add('search_products');
    selectedIds.add('issue_proposal');
  } else {
    // Default dashboard / general route (compact lean baseline)
    selectedIds.add('sales_summary');
    if (!isCashier) {
      selectedIds.add('get_profit_summary');
    }
  }

  // 4. Query-based dynamic inclusion for any unselected capability
  const isRankingQuery = (
    q.includes('ban tot') || q.includes('bán tốt') ||
    q.includes('ban khong tot') || q.includes('bán không tốt') ||
    q.includes('ban kem') || q.includes('bán kém') ||
    q.includes('ban e') || q.includes('bán ế') ||
    q.includes('ban cham') || q.includes('bán chậm') ||
    q.includes('e am') || q.includes('ế ẩm') ||
    q.includes('e khong') || q.includes('ế không') ||
    q.includes('co e') || q.includes('có ế') ||
    q.includes('noi bat') || q.includes('nổi bật') ||
    q.includes('ban chay') || q.includes('bán chạy') ||
    q.includes('chay nhat') || q.includes('chạy nhất') ||
    q.includes('ban duoc nhung gi') || q.includes('bán được những gì') ||
    q.includes('ban duoc gi') || q.includes('bán được gì') ||
    q.includes('cai gi ban duoc') || q.includes('cái gì bán được') ||
    q.includes('khong ban duoc') || q.includes('không bán được') ||
    q.includes('chua ban duoc') || q.includes('chưa bán được') ||
    q.includes('ban nhieu') || q.includes('bán nhiều') ||
    q.includes('ban it') || q.includes('bán ít') ||
    q.includes('it nguoi mua') || q.includes('ít người mua') ||
    q.includes('nhieu nguoi mua') || q.includes('nhiều người mua') ||
    q.includes('xep hang') || q.includes('xếp hạng') ||
    q.includes('hieu suat') || q.includes('hiệu suất') ||
    ((q.includes('mat hang') || q.includes('mặt hàng') || q.includes('san pham') || q.includes('sản phẩm') || q.includes('cai nao') || q.includes('cái nào') || q.includes('mon nao') || q.includes('món nào')) &&
      (q.includes('tot') || q.includes('tốt') || q.includes('kem') || q.includes('kém') || q.includes('chay') || q.includes('chạy') || /\b[eế]\b/i.test(q)))
  );

  for (const cap of accessibleCaps) {
    if (selectedIds.has(cap.capability_id)) continue;
    const cid = cap.capability_id;
    const normalizedCid = cid.replace(/_/g, ' ');
    if (q.includes(cid) || q.includes(normalizedCid)) {
      selectedIds.add(cid);
      continue;
    }
    if (cid === 'product_performance_ranking' && (q.includes('hieu suat') || q.includes('hiệu suất') || q.includes('xep hang') || q.includes('xếp hạng') || isRankingQuery)) selectedIds.add(cid);
    if (cid === 'transfer_proposal' && (q.includes('chuyen') || q.includes('chuyển') || q.includes('transfer'))) selectedIds.add(cid);
    if (cid === 'stocktake_proposal' && (q.includes('kiem ke') || q.includes('kiểm kê') || q.includes('lech') || q.includes('lệch') || q.includes('can bang') || q.includes('cân bằng'))) selectedIds.add(cid);
    if (cid === 'issue_proposal' && (q.includes('xuat') || q.includes('xuất') || q.includes('huy') || q.includes('hủy') || q.includes('mau') || q.includes('mẫu'))) selectedIds.add(cid);
    if (cid === 'order_proposal' && (q.includes('don') || q.includes('đơn') || q.includes('ban no') || q.includes('bán nợ') || q.includes('xuat ban') || q.includes('xuất bán') || q.includes('khach') || q.includes('khách') || (q.includes('xuat') && q.includes('cho')))) selectedIds.add(cid);
    if (cid === 'electronic_invoice_proposal' && (q.includes('hoa don') || q.includes('hóa đơn') || q.includes('vat') || q.includes('mst') || q.includes('ma so thue') || q.includes('mã số thuế') || q.includes('cong ty') || q.includes('công ty'))) selectedIds.add(cid);
    if (cid === 'get_profit_summary' && (q.includes('loi nhuan') || q.includes('lợi nhuận') || q.includes('gia von') || q.includes('giá vốn') || q.includes('lai') || q.includes('lãi'))) selectedIds.add(cid);
    if (cid === 'sales_summary' && (q.includes('doanh thu') || q.includes('hoa don') || q.includes('hóa đơn'))) selectedIds.add(cid);
    if (cid === 'top_selling_products' && (q.includes('ban chay') || q.includes('bán chạy') || isRankingQuery)) selectedIds.add(cid);
    if (cid === 'slow_moving_products' && (q.includes('ban cham') || q.includes('bán chậm') || q.includes('ton lau') || q.includes('tồn lâu') || q.includes('dong') || q.includes('đọng'))) selectedIds.add(cid);
    if (cid === 'stock_diagnosis' && (q.includes('chan doan') || q.includes('chẩn đoán') || q.includes('bat thuong') || q.includes('bất thường'))) selectedIds.add(cid);
    if (cid === 'order_diagnosis' && (q.includes('don hang') || q.includes('đơn hàng') || q.includes('kiem tra don') || q.includes('kiểm tra đơn'))) selectedIds.add(cid);
    if (cid === 'search_customers' && (q.includes('khach') || q.includes('khách'))) selectedIds.add(cid);
    if (cid === 'search_orders' && (q.includes('tim don') || q.includes('tìm đơn'))) selectedIds.add(cid);
    if (cid === 'add_cart_draft' && (q.includes('gio') || q.includes('giỏ') || q.includes('cart'))) selectedIds.add(cid);
    if (cid === 'high_revenue_low_margin' && (q.includes('bien lai') || q.includes('biên lãi') || q.includes('mong') || q.includes('mỏng'))) selectedIds.add(cid);
    if (cid === 'shop_health_check' && (q.includes('suc khoe') || q.includes('sức khỏe') || q.includes('tong quat') || q.includes('tổng quát'))) selectedIds.add(cid);
    if (cid === 'five_actions_today' && (q.includes('hanh dong') || q.includes('hành động') || q.includes('5 viec') || q.includes('5 việc'))) selectedIds.add(cid);
    if (cid === 'daily_attention' && (q.includes('chu y') || q.includes('chú ý') || q.includes('can lam') || q.includes('cần làm'))) selectedIds.add(cid);
    if (cid === 'explain_replenishment' && (q.includes('co nen nhap') || q.includes('có nên nhập') || q.includes('tu van nhap') || q.includes('tư vấn nhập'))) selectedIds.add(cid);
    if (cid === 'replenishment_suggestion' && (q.includes('goi y nhap') || q.includes('gợi ý nhập') || q.includes('can nhap') || q.includes('cần nhập'))) selectedIds.add(cid);
    if (cid === 'query_receipts_aggregate' && (q.includes('lich su nhap') || q.includes('lịch sử nhập') || q.includes('da nhap') || q.includes('đã nhập'))) selectedIds.add(cid);
    if (cid === 'search_products' && (q.includes('tim sp') || q.includes('tìm sp') || q.includes('tim hang') || q.includes('tìm hàng') || q.includes('sku') || q.includes('barcode'))) selectedIds.add(cid);
  }

  // 5. Project and serialize selected capabilities directly from canonical registry
  return accessibleCaps
    .filter(cap => selectedIds.has(cap.capability_id))
    .map(cap => `- ${cap.capability_id} (${cap.mode}): ${cap.compact_description || cap.human_description}`)
    .join('\n');
}

export function generateModelToolManifest(registry = KHO_CAPABILITY_REGISTRY) {
  return Object.values(registry)
    .filter(cap => cap.active)
    .map(cap => ({
      name: cap.capability_id,
      domain: cap.domain,
      mode: cap.mode,
      description: cap.human_description,
      parameters: cap.input_schema,
      entity_types: cap.entity_types || [],
      time_support: Boolean(cap.time_support),
    }));
}

/**
 * Retrieve a capability by ID.
 */
export function getCapability(capabilityId) {
  if (!capabilityId) return null;
  const normalized = String(capabilityId).trim().replace(/-/g, '_');
  return KHO_CAPABILITY_REGISTRY[normalized] || KHO_CAPABILITY_REGISTRY[capabilityId] || null;
}

/**
 * Check if a capability ID is registered and active.
 */
export function isValidCapability(capabilityId) {
  if (!capabilityId) return false;
  const normalized = String(capabilityId).trim().replace(/-/g, '_');
  const cap = KHO_CAPABILITY_REGISTRY[normalized] || KHO_CAPABILITY_REGISTRY[capabilityId];
  return Boolean(cap && cap.active);
}

/**
 * Get total counts of underlying registered tools and skills.
 */
export function getRegistryStats() {
  return {
    registered_tools_count: Object.keys(TOOLS).length,
    registered_skills_count: Object.keys(SKILL_REGISTRY).length,
    canonical_capabilities_count: Object.keys(KHO_CAPABILITY_REGISTRY).length,
  };
}
