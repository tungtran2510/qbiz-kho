/**
 * QBIZ MERCHANDISING INTELLIGENCE — EXPLANATION ENGINE
 * Formats deterministic, explainable answers adhering strictly to:
 * 1. RECOMMENDATION
 * 2. WHY
 * 3. EVIDENCE
 * 4. RISK / MISSING DATA
 * 5. NEXT ACTION
 *
 * Every number cited must be verifiable and traceable directly to underlying ledger snapshots.
 */

function fmt(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
}

/**
 * Formats an explainable replenishment recommendation for a single product.
 *
 * @param {object} item - Bundle containing { snapshot, metrics, forecast, plan, abcxyz, viability }
 * @returns {object} Formatted output with markdown text, reasonCodes, and structured proposal data
 */
export function formatProductReplenishmentExplanation(item) {
  const { snapshot, metrics, forecast, plan, abcxyz, viability } = item;
  const prod = snapshot.product;
  const inv = snapshot.inventory;
  const sales = snapshot.sales;

  // 1. RECOMMENDATION
  let recText = '';
  if (plan.suggestedQuantity > 0) {
    recText = `Nên nhập thêm **${fmt(plan.suggestedQuantity)} ${prod.unit}** trong ${plan.leadTimeDays || 3} ngày tới.`;
  } else if (inv.available <= 0) {
    recText = `Cần nhập bổ sung **${fmt(plan.targetStock)} ${prod.unit}** (đang đứt hàng).`;
  } else {
    recText = `Chưa cần nhập thêm lúc này. Mức tồn hiện tại (${fmt(inv.available)} ${prod.unit}) vẫn an toàn.`;
  }

  // 2. WHY
  const whyPoints = [];
  if (inv.available <= 0) {
    whyPoints.push(`Đã hết hàng hoàn toàn trong kho (tồn khả dụng = 0).`);
  } else if (metrics.daysOfSupply !== null) {
    whyPoints.push(`Kho chỉ còn ${fmt(inv.available)} ${prod.unit}, ước tính đủ bán trong khoảng **${metrics.daysOfSupply} ngày**.`);
  }

  if (metrics.primaryVelocity > 0) {
    const trendNote = metrics.trend7d?.direction === 'RISING'
      ? ` (tăng ${metrics.trend7d.percentage}% so với tuần trước)`
      : metrics.trend7d?.direction === 'FALLING'
        ? ` (giảm ${Math.abs(metrics.trend7d.percentage)}% so với tuần trước)`
        : '';
    whyPoints.push(`Tốc độ bán bình quân đạt **${metrics.primaryVelocity} ${prod.unit}/ngày**${trendNote}.`);
  } else {
    whyPoints.push(`Không có giao dịch bán phát sinh trong thời gian gần đây.`);
  }

  if (abcxyz?.abcClass) {
    whyPoints.push(`Sản phẩm thuộc nhóm **${abcxyz.abcClass}** (đóng góp cao vào doanh thu/lợi nhuận cửa hàng).`);
  }

  if (metrics.grossMarginPct30d !== null && metrics.grossMarginPct30d > 0) {
    whyPoints.push(`Biên lợi nhuận gộp đạt **${metrics.grossMarginPct30d}%**.`);
  }

  if (inv.incomingTransit > 0) {
    whyPoints.push(`Đang có **${fmt(inv.incomingTransit)} ${prod.unit}** đang trên đường điều chuyển về kho.`);
  }

  // 3. EVIDENCE
  const evidencePoints = [
    `Tồn thực tế: **${fmt(inv.onHand)}** | Khả dụng: **${fmt(inv.available)}** ${prod.unit}`,
    `Đã bán 7 ngày qua: **${fmt(sales.unitsSold7d)}** | 30 ngày qua: **${fmt(sales.unitsSold30d)}** ${prod.unit}`,
    `Ngưỡng tồn tối thiểu (lowStock): **${fmt(prod.lowStock)}** | Điểm đặt hàng (ROP): **${fmt(plan.reorderPoint)}**`,
  ];
  if (prod.cost_price > 0) {
    evidencePoints.push(`Giá vốn: **${fmt(prod.cost_price)} ₫** | Giá bán: **${fmt(prod.price)} ₫**`);
  }
  if (sales.lastSoldDate) {
    evidencePoints.push(`Đơn bán gần nhất: **${new Date(sales.lastSoldDate).toLocaleDateString('vi-VN')}**`);
  }

  // 4. RISK / MISSING DATA
  const riskPoints = [];
  if (plan.isLeadTimeAssumed) {
    riskPoints.push(`Chưa có thời gian giao hàng chính xác của Nhà cung cấp (đang dùng giả định mặc định: **${plan.leadTimeDays} ngày**).`);
  }
  if (!prod.cost_price) {
    riskPoints.push(`Chưa thiết lập giá vốn sản phẩm, chỉ số lợi nhuận gộp chưa đầy đủ.`);
  }
  if (metrics.trend7d?.direction === 'FALLING') {
    riskPoints.push(`Lượng tiêu thụ tuần qua có xu hướng giảm, nên cân nhắc nhập thăm dò.`);
  }
  if (riskPoints.length === 0) {
    riskPoints.push(`Nhu cầu bán hàng tương đối ổn định, rủi ro chôn vốn thấp.`);
  }

  // 5. NEXT ACTION
  let nextAction = '';
  if (plan.suggestedQuantity > 0) {
    nextAction = `Bấm nút **"Tạo phiếu nhập nháp"** để xem và duyệt phiếu nhập ${fmt(plan.suggestedQuantity)} ${prod.unit}.`;
  } else {
    nextAction = `Tiếp tục duy trì bán hàng và kiểm tra lại định mức tồn vào tuần sau.`;
  }

  const markdown = [
    `### 📋 ĐÁNH GIÁ NHẬP HÀNG: **${prod.name}**`,
    `> **ĐỀ XUẤT (RECOMMENDATION):**  \n> ${recText}`,
    '',
    `**1. VÌ SAO NÊN THỰC HIỆN (WHY):**`,
    whyPoints.map(p => `- ${p}`).join('\n'),
    '',
    `**2. CĂN CỨ DỮ LIỆU (EVIDENCE):**`,
    evidencePoints.map(p => `- ${p}`).join('\n'),
    '',
    `**3. RỦI RO & DỮ LIỆU THIẾU (RISK / MISSING DATA):**`,
    riskPoints.map(p => `- ⚠️ ${p}`).join('\n'),
    '',
    `**4. HÀNH ĐỘNG TIẾP THEO (NEXT ACTION):**`,
    `- ${nextAction}`,
  ].join('\n');

  return {
    markdown,
    reasonCodes: viability.reasonCodes || [],
    suggestedQuantity: plan.suggestedQuantity,
    reorderPoint: plan.reorderPoint,
    daysOfSupply: metrics.daysOfSupply,
    viabilityState: viability.state,
  };
}

/**
 * Formats a ranking list of replenishment candidates.
 *
 * @param {Array<object>} rankedItems - Output of rankReplenishmentCandidates
 * @returns {string} Formatted markdown response
 */
export function formatReplenishmentList(rankedItems = []) {
  if (!rankedItems.length) {
    return `✅ **Hiện tại toàn bộ hàng hóa trong kho đều ở mức an toàn!**\nKhông có sản phẩm nào chạm ngưỡng đứt hàng hoặc cần nhập thêm khẩn cấp.`;
  }

  const lines = [
    `📦 **DANH SÁCH MẶT HÀNG ƯU TIÊN NHẬP THÊM:**`,
    `*Phân tích tự động dựa trên tốc độ bán, số ngày còn hàng và ngưỡng an toàn:*\n`,
  ];

  rankedItems.slice(0, 5).forEach((item, idx) => {
    const prod = item.snapshot.product;
    const inv = item.snapshot.inventory;
    const metrics = item.metrics;
    const plan = item.plan;
    const urgencyBadge = plan.urgency === 'CRITICAL' ? '🔴 **HẾT HÀNG**' : plan.urgency === 'HIGH' ? '🟠 **SẮP HẾT**' : '🟡 **CẦN NHẬP**';

    lines.push(`**${idx + 1}. ${prod.name}** (${urgencyBadge})`);
    lines.push(`- **Đề xuất nhập:** **${fmt(plan.suggestedQuantity)} ${prod.unit}**`);
    lines.push(`- **Tồn khả dụng:** ${fmt(inv.available)} ${prod.unit} (đủ bán ~**${metrics.daysOfSupply ?? '< 1'} ngày**)`);
    lines.push(`- **Tốc độ bán:** ${metrics.primaryVelocity} ${prod.unit}/ngày | Bán 7 ngày qua: ${fmt(item.snapshot.sales.unitsSold7d)}`);
    if (plan.isLeadTimeAssumed) {
      lines.push(`- *Căn cứ: Giả định lead time ${plan.leadTimeDays} ngày (chưa có lead time NCC).*`);
    }
    lines.push('');
  });

  lines.push(`👉 *Bạn có thể nói: "Tạo đề xuất nhập cho 3 mặt hàng cần nhất" để tạo phiếu nháp.*`);
  return lines.join('\n');
}

/**
 * Formats slow-moving and capital-tied-up goods analysis.
 *
 * @param {Array<object>} slowItems - Filtered items with isSlowMoving or isAgedStock
 * @returns {string} Formatted markdown response
 */
export function formatSlowMovingReport(slowItems = []) {
  if (!slowItems.length) {
    return `🎉 **Tuyệt vời! Cửa hàng không có mặt hàng nào bị tồn đọng lâu ngày hoặc bán chậm.**`;
  }

  const totalCapitalTiedUp = slowItems.reduce((sum, it) => sum + (it.metrics.capitalTiedUp || 0), 0);

  const lines = [
    `⚠️ **CẢNH BÁO MẶT HÀNG BÁN CHẬM & CHÔN VỐN:**`,
    `Tổng vốn hàng hóa đang bị tồn đọng: **${fmt(totalCapitalTiedUp)} ₫**\n`,
  ];

  slowItems.slice(0, 5).forEach((item, idx) => {
    const prod = item.snapshot.product;
    const inv = item.snapshot.inventory;
    const metrics = item.metrics;
    const daysSince = metrics.daysSinceLastSale !== null ? `${metrics.daysSinceLastSale} ngày` : 'Chưa có đơn';

    lines.push(`**${idx + 1}. ${prod.name}**`);
    lines.push(`- **Tồn kho:** ${fmt(inv.available)} ${prod.unit} | **Vốn đang chôn:** **${fmt(metrics.capitalTiedUp)} ₫**`);
    lines.push(`- **Lần bán gần nhất:** cách đây ${daysSince}`);
    lines.push(`- **Khuyến nghị:** ${item.viability?.action || 'Nên áp dụng khuyến mại hoặc xả hàng để thu hồi vốn lưu động.'}`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Formats High Revenue but Low Margin product analysis.
 *
 * @param {Array<object>} items - Items where revenue is high but grossMarginPct is low
 * @returns {string} Formatted markdown
 */
export function formatHighRevenueLowMarginReport(items = []) {
  if (!items.length) {
    return `✅ Không ghi nhận mặt hàng nào có doanh thu cao nhưng lợi nhuận quá mỏng. Tỷ suất lợi nhuận các mặt hàng chủ lực hiện tại khá cân bằng.`;
  }

  const lines = [
    `📊 **MẶT HÀNG DOANH THU CAO NHƯNG BIÊN LỢI NHUẬN THẤP:**`,
    `*(Bán được số lượng lớn nhưng đóng góp lợi nhuận ròng không tương xứng)*\n`,
  ];

  items.slice(0, 5).forEach((it, idx) => {
    const prod = it.snapshot.product;
    const metrics = it.metrics;
    lines.push(`**${idx + 1}. ${prod.name}**`);
    lines.push(`- **Doanh thu 30 ngày:** ${fmt(metrics.netSales30d)} ₫ | **Lợi nhuận gộp:** ${fmt(metrics.grossProfit30d)} ₫`);
    lines.push(`- **Tỷ suất biên lợi nhuận:** **${metrics.grossMarginPct30d}%** (Dưới mức kỳ vọng 15%)`);
    lines.push(`- **Khuyến nghị:** Đàm phán giảm giá nhập từ nhà cung cấp hoặc xem xét điều chỉnh giá niêm yết.`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Formats Budget Constrained Replenishment Plan.
 *
 * @param {object} allocation - Output from allocatePurchaseBudget
 * @returns {string} Formatted markdown
 */
export function formatBudgetAllocationExplanation(allocation) {
  if (!allocation.lines.length) {
    return `Không có sản phẩm nào cần nhập hoặc ngân sách không đủ để phân bổ cho đơn vị sản phẩm tối thiểu.`;
  }

  const lines = [
    `💰 **KẾ HOẠCH PHÂN BỔ NHẬP HÀNG THEO NGÂN SÁCH ${fmt(allocation.budgetTotal)} ₫:**`,
    `- **Tổng chi phí dự tính:** **${fmt(allocation.allocatedCost)} ₫**`,
    `- **Ngân sách còn lại:** ${fmt(allocation.remainingBudget)} ₫`,
    `- **Số mặt hàng được phân bổ:** ${allocation.itemCount} sản phẩm (${allocation.totalAllocatedUnits} đơn vị)\n`,
    `**Chi tiết phân bổ ưu tiên:**`,
  ];

  allocation.lines.forEach((l, idx) => {
    lines.push(`${idx + 1}. **${l.productName}**: Nhập **${fmt(l.allocatedQty)} ${l.unit}** × ${fmt(l.unitCost)} ₫ = **${fmt(l.lineTotal)} ₫** *(Cần: ${l.requestedQty} ${l.unit})*`);
  });

  lines.push(`\n📌 *Lưu ý: Kế hoạch trên chỉ là bản dự thảo phân bổ. Bạn có thể yêu cầu tạo phiếu nhập nháp để xác nhận vào kho.*`);
  return lines.join('\n');
}

/**
 * Formats "5 việc cần làm hôm nay" (Daily Actionable Checklist).
 *
 * @param {object} digest - Attention digest object
 * @returns {string} Formatted markdown checklist
 */
export function formatFiveActionsChecklist(digest) {
  const lines = [
    `🎯 **5 VIỆC CẦN LÀM HÔM NAY CHO CHỦ CỬA HÀNG:**\n`,
  ];

  const actions = digest.actions || [];
  if (!actions.length) {
    lines.push(`1. ✅ **Kiểm tra kho định kỳ:** Tất cả mặt hàng tồn kho đang ở mức an toàn.`);
    lines.push(`2. ✅ **Theo dõi đơn bán:** Không có đơn hàng nào tồn đọng hoặc chưa thu tiền.`);
    lines.push(`3. ✅ **Rà soát giá:** Kiểm tra lại chính sách giá cho các sản phẩm nhóm B và C.`);
    lines.push(`4. ✅ **Nhập hàng định kỳ:** Kiểm tra danh mục đặt hàng nhà cung cấp cho tuần tới.`);
    lines.push(`5. ✅ **Chăm sóc khách hàng:** Xem lại danh sách khách mua nhiều trong tháng.`);
    return lines.join('\n');
  }

  actions.slice(0, 5).forEach((act, idx) => {
    lines.push(`**${idx + 1}. ${act.title}**`);
    lines.push(`   - ${act.detail}`);
    lines.push(`   - *Hành động:* ${act.recommendation}`);
    lines.push('');
  });

  return lines.join('\n');
}
