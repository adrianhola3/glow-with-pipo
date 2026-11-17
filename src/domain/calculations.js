import {
  DEFAULT_COMBO_RATIO,
  DEFAULT_SHIPPING_METHODS,
  UNAC_MIN_RETENTION,
  UNAC_RETENTION_RATE
} from './constants.js';

export function normalizePaymentMethod(method) {
  const m = String(method || '').trim().toLowerCase();
  if (m === 'efectivo' || m === 'cash') return 'cash';
  if (m === 'plin') return 'plin';
  if (m === 'transfer' || m === 'transferencia') return 'transfer';
  return 'yape';
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value) {
  const num = toNumber(value, 0);
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function roundUnitCost(value) {
  const num = toNumber(value, 0);
  return Math.round((num + Number.EPSILON) * 10000) / 10000;
}

export function formatCurrency(value) {
  const safe = roundMoney(value);
  return `S/ ${safe.toFixed(2)}`;
}

export const formatMoney = formatCurrency;

export function formatUnitCost(value) {
  const safe = roundUnitCost(value);
  const twoDec = Math.round(safe * 100) / 100;
  if (Math.abs(safe - twoDec) < 0.0001) {
    return `S/ ${twoDec.toFixed(2)}`;
  }
  return `S/ ${safe.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function generateNextCode(prefix, existingItems = []) {
  let maxNum = 0;
  const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  for (const item of existingItems) {
    const code = typeof item === 'string' ? item : item?.code || item?.sku || '';
    const match = String(code).trim().match(regex);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

export function computePackageUnitCost(quantity, packageCost) {
  const qty = toNumber(quantity, 0);
  const total = toNumber(packageCost, 0);
  if (qty <= 0 || total < 0) return 0;
  return roundUnitCost(total / qty);
}

export function computeSuggestedPrices(unitCost, comboRatio = DEFAULT_COMBO_RATIO) {
  const cost = toNumber(unitCost, 0);
  const ratio = toNumber(comboRatio, DEFAULT_COMBO_RATIO);
  const unitPrice = roundMoney(cost * 2);
  const comboPrice = roundMoney(unitPrice * ratio);
  return { unitPrice, comboPrice };
}

export function computeWeightedAverageCost(currentStock, currentUnitCost, addedQty, addedUnitCost) {
  const curStock = Math.max(0, Math.trunc(toNumber(currentStock, 0)));
  const curCost = Math.max(0, toNumber(currentUnitCost, 0));
  const newQty = Math.max(0, Math.trunc(toNumber(addedQty, 0)));
  const newCost = Math.max(0, toNumber(addedUnitCost, 0));

  if (newQty === 0) return roundUnitCost(curCost);
  if (curStock === 0) return roundUnitCost(newCost);

  const totalValue = curStock * curCost + newQty * newCost;
  const totalUnits = curStock + newQty;
  return roundUnitCost(totalValue / totalUnits);
}

export function computeMargins(unitCost, salePrice) {
  const cost = toNumber(unitCost, 0);
  const price = toNumber(salePrice, 0);
  const unitProfit = roundMoney(price - cost);
  const marginPercent = price > 0 ? roundMoney(((price - cost) / price) * 100) : 0;
  const roiPercent = cost > 0 ? roundMoney(((price - cost) / cost) * 100) : 0;
  return {
    unitProfit,
    marginPercent,
    roiPercent,
    isLoss: price < cost
  };
}

export function getStockLevelBadge(stock) {
  const qty = Math.max(0, Math.trunc(toNumber(stock, 0)));
  if (qty === 0) {
    return { key: 'out', label: 'Agotado (0)', tone: 'danger' };
  }
  if (qty <= 5) {
    return { key: 'low', label: qty <= 4 ? `Crítico (${qty})` : `Bajo (${qty})`, tone: 'danger' };
  }
  if (qty <= 12) {
    return { key: 'medium', label: `Medio (${qty})`, tone: 'warning' };
  }
  return { key: 'high', label: `Alto (${qty})`, tone: 'success' };
}

export function computeComboSummary(combo, productsMap, variantsByProductMap, variantsMap) {
  if (!combo || !Array.isArray(combo.items) || combo.items.length === 0) {
    return {
      regularTotal: 0,
      comboTotal: 0,
      estimatedCost: 0,
      estimatedProfit: 0,
      marginPercent: 0,
      availableCount: 0
    };
  }

  const isCustomizable = combo.comboType === 'customizable';
  let regularTotal = 0;
  let comboTotal = 0;
  let estimatedCost = 0;
  let minBuildable = Infinity;

  for (const item of combo.items) {
    const qty = Math.max(1, Math.trunc(toNumber(item.quantity, 1)));
    const product = productsMap.get(item.productId);
    if (!product) {
      minBuildable = 0;
      continue;
    }

    const productVariants = variantsByProductMap.get(product.id) || [];
    let targetVariant = !isCustomizable && item.variantId ? variantsMap.get(item.variantId) : null;

    let availableStockForItem = 0;
    if (targetVariant) {
      availableStockForItem = Math.max(0, targetVariant.stock);
    } else {
      availableStockForItem = productVariants.reduce((acc, v) => acc + Math.max(0, v.stock), 0);
      targetVariant = productVariants[0] || null;
    }

    const buildableForLine = Math.floor(availableStockForItem / qty);
    if (buildableForLine < minBuildable) minBuildable = buildableForLine;

    const unitCost = targetVariant ? toNumber(targetVariant.unitCost, 0) : 0;
    const lineComboUnitPrice =
      item.customComboUnitPrice !== null && item.customComboUnitPrice !== undefined && item.customComboUnitPrice !== ''
        ? toNumber(item.customComboUnitPrice, product.comboPrice)
        : toNumber(product.comboPrice, roundMoney(product.unitPrice * (product.comboRatio || DEFAULT_COMBO_RATIO)));

    regularTotal += toNumber(product.unitPrice, 0) * qty;
    comboTotal += lineComboUnitPrice * qty;
    estimatedCost += unitCost * qty;
  }

  regularTotal = roundMoney(regularTotal);
  comboTotal = roundMoney(comboTotal);
  estimatedCost = roundMoney(estimatedCost);
  const estimatedProfit = roundMoney(comboTotal - estimatedCost);
  const marginPercent = comboTotal > 0 ? roundMoney((estimatedProfit / comboTotal) * 100) : 0;

  return {
    regularTotal,
    comboTotal,
    estimatedCost,
    estimatedProfit,
    marginPercent,
    availableCount: Number.isFinite(minBuildable) ? minBuildable : 0
  };
}

export function computeSaleTotals({
  items = [],
  suppliesUsed = [],
  shippingCharged = 0,
  shippingCost = null,
  customTotalCharged = null,
  payments = []
}) {
  let totalUnits = 0;
  let rawProductsRevenue = 0;
  let productsCost = 0;

  const enrichedItems = items.map((item) => {
    const qty = Math.max(1, Math.trunc(toNumber(item.quantity, 1)));
    const unitCost = toNumber(item.unitCostSnapshot, 0);
    const appliedPrice = toNumber(item.appliedUnitPrice, 0);
    const lineRevenue = roundMoney(appliedPrice * qty);
    const lineCost = roundMoney(unitCost * qty);
    const lineProfit = roundMoney(lineRevenue - lineCost);
    const { marginPercent, isLoss } = computeMargins(unitCost, appliedPrice);

    totalUnits += qty;
    rawProductsRevenue += lineRevenue;
    productsCost += lineCost;

    return {
      ...item,
      quantity: qty,
      lineRevenue,
      lineCost,
      lineProfit,
      marginPercent,
      isLoss
    };
  });

  let suppliesCost = 0;
  const enrichedSupplies = suppliesUsed.map((sup) => {
    const qty = Math.max(1, Math.trunc(toNumber(sup.quantity, 1)));
    const cost = toNumber(sup.unitCostSnapshot, 0);
    const totalCost = roundMoney(cost * qty);
    suppliesCost += totalCost;
    return { ...sup, quantity: qty, totalCost };
  });

  rawProductsRevenue = roundMoney(rawProductsRevenue);
  productsCost = roundMoney(productsCost);
  suppliesCost = roundMoney(suppliesCost);

  const safeShippingCharged = roundMoney(Math.max(0, toNumber(shippingCharged, 0)));
  const safeShippingCost =
    shippingCost === null || shippingCost === undefined || shippingCost === ''
      ? safeShippingCharged
      : roundMoney(Math.max(0, toNumber(shippingCost, 0)));

  const rawTotalCharged = roundMoney(rawProductsRevenue + safeShippingCharged);
  const hasCustomTotal =
    customTotalCharged !== null &&
    customTotalCharged !== undefined &&
    String(customTotalCharged).trim() !== '';

  const totalCharged = hasCustomTotal
    ? roundMoney(Math.max(0, toNumber(customTotalCharged, rawTotalCharged)))
    : rawTotalCharged;

  const productsRevenue = hasCustomTotal
    ? roundMoney(Math.max(0, totalCharged - safeShippingCharged))
    : rawProductsRevenue;

  const roundingAdjustment = roundMoney(totalCharged - rawTotalCharged);
  const shippingNet = roundMoney(safeShippingCharged - safeShippingCost);
  const netProfit = roundMoney(productsRevenue - productsCost - suppliesCost + shippingNet);

  const amountPaid = roundMoney(
    payments.reduce((acc, p) => {
      if (p.paymentConcept === 'partial_refund') {
        return acc - Math.max(0, toNumber(p.amount, 0));
      }
      if (p.paymentConcept === 'forfeited_retention') {
        return acc;
      }
      return acc + Math.max(0, toNumber(p.amount, 0));
    }, 0)
  );
  const safeAmountPaid = Math.max(0, amountPaid);
  const refundedAmount = roundMoney(
    payments.reduce(
      (acc, p) => acc + (p.paymentConcept === 'partial_refund' ? Math.max(0, toNumber(p.amount, 0)) : 0),
      0
    )
  );
  const balanceDue = roundMoney(Math.max(0, totalCharged - safeAmountPaid));

  return {
    items: enrichedItems,
    suppliesUsed: enrichedSupplies,
    totalUnits,
    rawProductsRevenue,
    rawTotalCharged,
    roundingAdjustment,
    productsRevenue,
    productsCost,
    suppliesCost,
    shippingCharged: safeShippingCharged,
    shippingCost: safeShippingCost,
    totalCharged,
    netProfit,
    amountPaid: safeAmountPaid,
    refundedAmount,
    balanceDue,
    isFullyPaid: balanceDue <= 0.009
  };
}

export function computeSeparationPolicy({
  totalCharged = 0,
  deliveryMethod = 'unac_pickup',
  shippingMethods = [],
  paymentPlan = 'full',
  shippingCostEstimate = 0
} = {}) {
  const safeTotal = roundMoney(Math.max(0, toNumber(totalCharged, 0)));
  const catalogMethods =
    Array.isArray(shippingMethods) && shippingMethods.length > 0
      ? shippingMethods
      : DEFAULT_SHIPPING_METHODS;
  const method =
    catalogMethods.find((m) => m.id === deliveryMethod) ||
    DEFAULT_SHIPPING_METHODS.find((m) => m.id === deliveryMethod) ||
    DEFAULT_SHIPPING_METHODS[0];

  const minAdvanceAmount = Math.max(0, toNumber(method?.minAdvanceAmount, 0));
  const isAdvance = paymentPlan === 'advance_50';

  let expectedInitialPayment = safeTotal;
  if (isAdvance) {
    const half = roundMoney(safeTotal * 0.5);
    expectedInitialPayment =
      minAdvanceAmount > 0
        ? roundMoney(Math.max(half, Math.min(safeTotal, minAdvanceAmount)))
        : half;
  }
  const balanceAfterAdvance = roundMoney(Math.max(0, safeTotal - expectedInitialPayment));

  const isAgency = method?.carrier === 'shalom' || method?.carrier === 'olva';
  const minRetentionSuggested = isAgency
    ? roundMoney(Math.min(expectedInitialPayment, Math.max(10, toNumber(shippingCostEstimate, 25))))
    : roundMoney(
        Math.min(
          expectedInitialPayment,
          Math.max(UNAC_MIN_RETENTION, roundMoney(expectedInitialPayment * UNAC_RETENTION_RATE))
        )
      );
  const suggestedRefundIfCancelled = roundMoney(
    Math.max(0, expectedInitialPayment - minRetentionSuggested)
  );

  return {
    method,
    paymentPlan: isAdvance ? 'advance_50' : 'full',
    totalCharged: safeTotal,
    expectedInitialPayment,
    balanceAfterAdvance,
    minRetentionSuggested,
    suggestedRefundIfCancelled
  };
}

// Date-only business fields keep their calendar day. Instants use the shop's
// timezone so midnight UTC does not move a receipt into the wrong Lima period.
const businessDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
});

function businessDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return businessDayFormatter.format(date);
}

function periodMatcher(period, referenceDate) {
  if (period === 'all') return () => true;
  const end = businessDay(referenceDate ?? new Date());
  if (!end) throw new RangeError('Fecha de referencia inválida');
  let start = end;
  if (period === 'month') start = `${end.slice(0, 7)}-01`;
  if (period === '7d') {
    const date = new Date(`${end}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6);
    start = date.toISOString().slice(0, 10);
  }
  return (value) => {
    const day = businessDay(value);
    return day !== null && day >= start && day <= end;
  };
}

export function formatSaleWhatsAppTicket(sale = {}, customer = {}) {
  const text = (value, fallback) => String(value || fallback).replace(/[\r\n]+/g, ' ').trim();
  const lines = (sale.items || []).map((item) => {
    const product = text(item.productNameSnapshot, 'Producto');
    const shade = item.shadeNameSnapshot ? ` · ${text(item.shadeNameSnapshot, '')}` : '';
    return `• ${Math.max(1, Math.trunc(toNumber(item.quantity, 1)))} × ${product}${shade}`;
  });
  const deliveryMethod = sale.deliveryMethod || 'unac_pickup';
  const methodLabel =
    deliveryMethod === 'shalom_agency'
      ? 'Shalom (Agencia a Agencia · flete pago en destino)'
      : deliveryMethod === 'olva_lima'
        ? 'Olva Courier (Lima / Callao)'
        : deliveryMethod === 'olva_provincia'
          ? 'Olva Courier (Provincias)'
          : 'Entrega UNAC / Punto Glow';
  const tracking = text(sale.carrierTrackingCode, '');
  const securityKey = text(sale.carrierSecurityCode, '');
  const isFullyPaid = roundMoney(toNumber(sale.balanceDue, 0)) <= 0.009;
  const extraLines = [];
  if (deliveryMethod !== 'unac_pickup') {
    extraLines.push(`🚚 Modalidad: ${methodLabel}`);
    if (customer?.dni || sale.recipientDni) {
      extraLines.push(`🪪 DNI recojo: ${text(sale.recipientDni || customer?.dni, '')}`);
    }
    if (sale.destinationRegion) {
      extraLines.push(`🏙️ Destino / Agencia: ${text(sale.destinationRegion, '')}`);
    }
    if (sale.destinationAddress) {
      extraLines.push(`🏠 Dirección: ${text(sale.destinationAddress, '')}`);
    }
    if (tracking) {
      extraLines.push(`📦 N° Guía / Tracking: ${tracking}`);
    }
    if (deliveryMethod === 'shalom_agency') {
      if (isFullyPaid && securityKey) {
        extraLines.push(`🔐 Clave de recojo Shalom: ${securityKey}`);
      } else if (!isFullyPaid) {
        extraLines.push(
          `🔐 Clave de recojo Shalom: Se enviará al completar el saldo (${formatCurrency(sale.balanceDue)})`
        );
      }
    }
  }
  return [
    '🎀 *Glow with Pipo*',
    `*Pedido ${text(sale.code, 'Sin código')}*`,
    ...(sale.status === 'cancelled' ? ['*Pedido cancelado*'] : []),
    `Clienta: ${text(customer?.name, 'Cliente')}`,
    '',
    ...lines,
    '',
    `*Total: ${formatCurrency(sale.totalCharged)}*`,
    `Adelanto pagado: ${formatCurrency(sale.amountPaid)}`,
    `*Saldo pendiente: ${formatCurrency(sale.balanceDue)}*`,
    '',
    ...extraLines,
    `📍 Entrega: ${text(sale.deliveryLocation || sale.destinationRegion, 'Por coordinar')}`,
    `📅 Fecha: ${text(sale.deliveryDate, 'Por coordinar')}`,
    `🕒 Horario: ${text(sale.deliveryTime, 'Por coordinar')}`
  ].join('\n');
}

export function computeDashboardMetrics(db, options = {}) {
  const {
    products = [],
    variants = [],
    supplies = [],
    restocks = [],
    sales = [],
    suppliers = [],
    customers = []
  } = db;
  const period = ['today', '7d', 'month'].includes(options.period) ? options.period : 'all';
  const inPeriod = periodMatcher(period, options.referenceDate);
  const productsMap = new Map(products.map((p) => [p.id, p]));
  const suppliersMap = new Map(suppliers.map((s) => [s.id, s]));
  const customersMap = new Map(customers.map((c) => [c.id, c]));

  let totalStockUnits = 0;
  let inventoryInvestedValue = 0;
  let potentialRevenue = 0;
  let potentialComboRevenue = 0;

  const productAggregates = new Map();

  for (const p of products) {
    productAggregates.set(p.id, {
      product: p,
      stock: 0,
      invested: 0,
      potentialSales: 0,
      potentialProfit: 0
    });
  }

  for (const v of variants) {
    const prod = productsMap.get(v.productId);
    if (!prod || prod.active === false) continue;

    const stock = Math.max(0, Math.trunc(toNumber(v.stock, 0)));
    const cost = Math.max(0, toNumber(v.unitCost, 0));
    const unitPrice = Math.max(0, toNumber(prod.unitPrice, 0));
    const comboPrice = Math.max(0, toNumber(prod.comboPrice, 0));

    const lineInvested = stock * cost;
    const linePotential = stock * unitPrice;

    totalStockUnits += stock;
    inventoryInvestedValue += lineInvested;
    potentialRevenue += linePotential;
    potentialComboRevenue += stock * comboPrice;

    const agg = productAggregates.get(prod.id);
    if (agg) {
      agg.stock += stock;
      agg.invested = roundMoney(agg.invested + lineInvested);
      agg.potentialSales = roundMoney(agg.potentialSales + linePotential);
      agg.potentialProfit = roundMoney(agg.potentialSales - agg.invested);
    }
  }

  const suppliesValue = roundMoney(
    supplies.reduce((acc, s) => acc + Math.max(0, toNumber(s.stock, 0)) * Math.max(0, toNumber(s.unitCost, 0)), 0)
  );

  inventoryInvestedValue = roundMoney(inventoryInvestedValue);
  potentialRevenue = roundMoney(potentialRevenue);
  potentialComboRevenue = roundMoney(potentialComboRevenue);
  const potentialProfit = roundMoney(potentialRevenue - inventoryInvestedValue);

  const productRows = Array.from(productAggregates.values()).filter((r) => r.product.active !== false);

  const stockDistribution = {
    out: productRows.filter((r) => r.stock === 0).length,
    low: productRows.filter((r) => r.stock >= 1 && r.stock <= 5).length,
    medium: productRows.filter((r) => r.stock >= 6 && r.stock <= 12).length,
    high: productRows.filter((r) => r.stock >= 13).length
  };

  const criticalStockVariants = variants
    .filter((v) => {
      const prod = productsMap.get(v.productId);
      return prod && prod.active !== false && toNumber(v.stock, 0) <= 4;
    })
    .map((v) => ({
      ...v,
      productName: productsMap.get(v.productId)?.name || 'Producto',
      brand: productsMap.get(v.productId)?.brand || ''
    }))
    .sort((a, b) => a.stock - b.stock);

  const topPotentialProfit = [...productRows]
    .sort((a, b) => b.potentialProfit - a.potentialProfit)
    .slice(0, 5);

  // Active sales (pending_delivery + delivered)
  const activeSales = sales.filter((s) => s.status !== 'cancelled');
  const retainedCancelledSales = sales.filter(
    (s) =>
      s.status === 'cancelled' &&
      (toNumber(s.forfeitedFeeAmount, 0) > 0 ||
        toNumber(s.refundedAmount, 0) > 0 ||
        (s.payments || []).some(
          (p) => p.paymentConcept === 'partial_refund' || p.paymentConcept === 'forfeited_retention'
        ))
  );
  const validSales = activeSales.filter((s) => inPeriod(s.saleDate));
  const validRetainedCancelled = retainedCancelledSales.filter((s) => inPeriod(s.saleDate));
  const deliveredSales = validSales.filter((s) => s.status === 'delivered');
  const paymentsByMethod = { yape: 0, plin: 0, cash: 0, transfer: 0, total: 0 };
  // Cash collection follows the receipt date, including balances of older orders and partial refunds.
  // Legacy receipts without a date fall back to the order date.
  for (const sale of [...activeSales, ...retainedCancelledSales]) {
    for (const payment of sale.payments || []) {
      if (payment.paymentConcept === 'forfeited_retention') continue;
      if (!inPeriod(payment.paymentDate || sale.saleDate)) continue;
      const method = normalizePaymentMethod(payment.method);
      const amt = Math.max(0, toNumber(payment.amount, 0));
      const delta = payment.paymentConcept === 'partial_refund' ? -amt : amt;
      paymentsByMethod[method] = roundMoney(paymentsByMethod[method] + delta);
    }
  }
  paymentsByMethod.total = roundMoney(paymentsByMethod.yape + paymentsByMethod.plin + paymentsByMethod.cash + paymentsByMethod.transfer);
  const totalUnitsSold = validSales.reduce((acc, sale) => acc + toNumber(sale.totalUnits, 0), 0);
  const pendingDeliveries = sales
    .filter((s) => s.status === 'pending_delivery')
    .map((s) => ({
      ...s,
      customer: customersMap.get(s.customerId) || null
    }))
    .sort((a, b) => {
      const da = `${a.deliveryDate || '9999-99-99'} ${a.deliveryTime || '23:59'}`;
      const db = `${b.deliveryDate || '9999-99-99'} ${b.deliveryTime || '23:59'}`;
      return da.localeCompare(db);
    });

  const totalRetainedFees = roundMoney(
    validRetainedCancelled.reduce((acc, s) => acc + Math.max(0, toNumber(s.forfeitedFeeAmount, 0)), 0)
  );
  const realizedRevenue = roundMoney(
    validSales.reduce((acc, s) => acc + toNumber(s.productsRevenue, 0), 0)
  );
  const realizedNetProfit = roundMoney(
    validSales.reduce((acc, s) => acc + toNumber(s.netProfit, 0), 0) + totalRetainedFees
  );
  const deliveredNetProfit = roundMoney(
    deliveredSales.reduce((acc, s) => acc + toNumber(s.netProfit, 0), 0)
  );
  const totalReceivables = roundMoney(
    validSales.reduce((acc, s) => acc + toNumber(s.balanceDue, 0), 0)
  );
  const totalSuppliesAbsorbed = roundMoney(
    validSales.reduce((acc, s) => acc + toNumber(s.suppliesCost, 0), 0)
  );

  // Supplier investment breakdown (only real 'purchase' restocks, excluding 'initial_inventory')
  const supplierSpendMap = new Map();
  let totalRestockPurchases = 0;

  for (const r of restocks) {
    if (r.entryType === 'initial_inventory') continue;
    totalRestockPurchases += toNumber(r.totalInvestment, 0);
    for (const item of r.items || []) {
      const supId = item.supplierId || 'unassigned';
      const supName = suppliersMap.get(supId)?.name || 'Sin proveedor asignado';
      const prev = supplierSpendMap.get(supId) || { supplierId: supId, name: supName, totalSpent: 0, unitsBought: 0 };
      prev.totalSpent = roundMoney(prev.totalSpent + toNumber(item.subtotalCost, 0));
      prev.unitsBought += Math.trunc(toNumber(item.quantity, 0));
      supplierSpendMap.set(supId, prev);
    }
  }

  const supplierBreakdown = Array.from(supplierSpendMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);

  return {
    // Keeps period selection available to existing consumers that receive only
    // metrics (App's current DashboardView contract), without copying raw data.
    forPeriod: (nextPeriod) => computeDashboardMetrics(db, { ...options, period: nextPeriod }),
    period,
    paymentsByMethod,
    totalUnitsSold,
    totalProducts: productRows.length,
    totalVariants: variants.length,
    totalStockUnits,
    inventoryInvestedValue,
    suppliesValue,
    potentialRevenue,
    potentialComboRevenue,
    potentialProfit,
    stockDistribution,
    criticalStockVariants,
    topPotentialProfit,
    productHeatmap: productRows.sort((a, b) => a.stock - b.stock),
    totalSalesCount: validSales.length,
    deliveredSalesCount: deliveredSales.length,
    pendingDeliveries,
    realizedRevenue,
    realizedNetProfit,
    totalRetainedFees,
    deliveredNetProfit,
    totalReceivables,
    totalSuppliesAbsorbed,
    totalRestockPurchases: roundMoney(totalRestockPurchases),
    supplierBreakdown
  };
}
