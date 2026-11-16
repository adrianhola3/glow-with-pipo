import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComboSummary,
  computeDashboardMetrics,
  computeMargins,
  computePackageUnitCost,
  computeSaleTotals,
  computeWeightedAverageCost,
  formatSaleWhatsAppTicket,
  normalizePaymentMethod
} from '../src/domain/calculations.js';
import {
  applyAddCategory,
  applyAddSalePayment,
  applyConfirmWebOrderManual,
  applyCreateOrUpdateCombo,
  applyCreateOrUpdateCustomer,
  applyCreateOrUpdateSupplier,
  applyCreateOrUpdateSupply,
  applyCreateProductWithInitialStock,
  applyCreateSale,
  applyDeleteCategory,
  applyDeleteCombo,
  applyDeleteCustomer,
  applyDeleteProduct,
  applyDeleteSale,
  applyDeleteSupplier,
  applyDeleteSupply,
  applyRecordRestock,
  applySaveDeliveryPoint,
  applyDeleteDeliveryPoint,
  applySaveDeliverySlot,
  applyDeleteDeliverySlot,
  applyUpdateStorefrontMerchandising,
  applyUpdateProduct,
  applyUpdateSalePrice,
  applyUpdateSaleStatus,
  cloudDeleteCustomer,
  cloudDeleteSale,
  cloudUpdateSaleStatus,
  compressImageToWebP,
  computeCompressedDimensions,
  confirmWebOrderManual,
  listAutoSnapshots,
  markCloudFetchCompleted,
  normalizeWebOrderPayload,
  normalizeWebOrderResult,
  restoreAutoSnapshot,
  saveLocalDb,
  setSupabaseClientForTests,
  shouldSuppressRealtimeEcho,
  STOREFRONT_MEDIA_BUCKET,
  uploadStorefrontMedia
} from '../src/adapters/storageRepository.js';

function emptyState() {
  return {
    accounts: [],
    suppliers: [],
    products: [],
    variants: [],
    supplies: [],
    combos: [],
    restocks: [],
    customers: [],
    sales: []
  };
}

test('Weighted Average Cost (CPP) and package division avoid floating-point errors', () => {
  assert.equal(computePackageUnitCost(24, 90), 3.75);
  assert.equal(computePackageUnitCost(14, 3.8), 0.2714);
  assert.equal(computeWeightedAverageCost(3, 10, 5, 12), 11.25);

  const margins = computeMargins(3.75, 7.5);
  assert.equal(margins.unitProfit, 3.75);
  assert.equal(margins.marginPercent, 50);
  assert.equal(margins.isLoss, false);
});

test('Multi-shade initial inventory (24 highlighters across 6 shades) does not inflate monthly restock spend', () => {
  let db = emptyState();
  db = applyCreateProductWithInitialStock(db, {
    name: 'Iluminador Funky',
    brand: 'Jarusa',
    category: 'Iluminador',
    unitPrice: 7,
    comboRatio: 0.75,
    hasVariants: true,
    entryType: 'initial_inventory',
    variants: [
      { shadeName: 'Tono 01 Champagne', stock: 4, unitCost: 3.5 },
      { shadeName: 'Tono 02 Rose Gold', stock: 4, unitCost: 3.5 },
      { shadeName: 'Tono 03 Perla', stock: 4, unitCost: 3.5 },
      { shadeName: 'Tono 04 Bronce', stock: 4, unitCost: 3.5 },
      { shadeName: 'Tono 05 Peach', stock: 4, unitCost: 3.5 },
      { shadeName: 'Tono 06 Dorado', stock: 4, unitCost: 3.5 }
    ]
  });

  assert.equal(db.products.length, 1);
  assert.equal(db.products[0].comboPrice, 5.25);
  assert.equal(db.variants.length, 6);

  const metrics = computeDashboardMetrics(db);
  assert.equal(metrics.totalStockUnits, 24);
  assert.equal(metrics.inventoryInvestedValue, 84);
  assert.equal(metrics.potentialRevenue, 168);
  assert.equal(metrics.potentialProfit, 84);
  assert.equal(metrics.totalRestockPurchases, 0);
});

test('Restock from multiple suppliers updates WAC and tracks per-supplier spend', () => {
  let db = emptyState();
  db = applyCreateOrUpdateSupplier(db, { name: 'Mayorista Centro A', whatsapp: '999111222' });
  db = applyCreateOrUpdateSupplier(db, { name: 'Importadora B', whatsapp: '999333444' });

  db = applyCreateProductWithInitialStock(db, {
    name: 'Labial Velvet',
    brand: 'Nossa',
    category: 'Labios',
    unitPrice: 20,
    unitCost: 10,
    initialStock: 3,
    hasVariants: false
  });

  db = applyCreateOrUpdateSupply(db, {
    name: 'Bolsa Craft Decorada',
    stock: 10,
    unitCost: 0.5
  });

  const supA = db.suppliers[0].id;
  const supB = db.suppliers[1].id;
  const variantId = db.variants[0].id;
  const bagId = db.supplies[0].id;

  db = applyRecordRestock(db, {
    entryType: 'purchase',
    restockDate: '2026-11-05',
    items: [
      { supplierId: supA, itemKind: 'variant', variantId, quantity: 5, unitCost: 12, packageCost: 60 },
      { supplierId: supB, itemKind: 'supply', supplyId: bagId, quantity: 10, unitCost: 0.6, packageCost: 6 }
    ]
  });

  assert.equal(db.variants[0].stock, 8);
  assert.equal(db.variants[0].unitCost, 11.25);
  assert.equal(db.supplies[0].stock, 20);
  assert.equal(db.supplies[0].unitCost, 0.55);

  const metrics = computeDashboardMetrics(db);
  assert.equal(metrics.totalRestockPurchases, 66);
  assert.equal(metrics.supplierBreakdown.length, 2);
  assert.equal(metrics.supplierBreakdown[0].totalSpent, 60);
  assert.equal(metrics.supplierBreakdown[1].totalSpent, 6);
});

test('Sale supports combo item substitution, custom sale price, absorbed bag cost, shipping advance, and cancellation restore', () => {
  let db = emptyState();
  db = applyCreateProductWithInitialStock(db, {
    name: 'Gloss Cristal',
    brand: 'Jarusa',
    category: 'Labios',
    unitPrice: 8,
    unitCost: 4,
    initialStock: 10
  });
  db = applyCreateProductWithInitialStock(db, {
    name: 'Rimel Rosado',
    brand: 'Nossa',
    category: 'Pestañas',
    unitPrice: 6,
    unitCost: 3,
    initialStock: 10
  });
  db = applyCreateProductWithInitialStock(db, {
    name: 'Delineador Negro',
    brand: 'P&W',
    category: 'Pestañas',
    unitPrice: 4,
    unitCost: 1,
    initialStock: 5
  });
  db = applyCreateOrUpdateSupply(db, {
    name: 'Bolsa Craft',
    stock: 25,
    unitCost: 0.56
  });

  const glossVar = db.variants[0];
  const rimelVar = db.variants[1];
  const eyelinerVar = db.variants[2];
  const bag = db.supplies[0];

  db = applyCreateOrUpdateCombo(db, {
    name: 'Combo Mirada & Gloss',
    items: [
      { productId: db.products[0].id, variantId: glossVar.id, quantity: 1 },
      { productId: db.products[1].id, variantId: rimelVar.id, quantity: 1 }
    ]
  });

  const combo = db.combos[0];

  // Customer swaps Rimel for Eyeliner in this specific sale and negotiates custom price on Gloss (6.50 instead of 6.00)
  db = applyCreateSale(db, {
    newCustomer: {
      name: 'Lucía Torres',
      whatsapp: '987654321',
      socialPlatform: 'tiktok',
      socialHandle: '@luciat'
    },
    status: 'pending_delivery',
    deliveryDate: '2026-11-06',
    deliveryTime: '16:30',
    deliveryLocation: 'Mall Bellavista',
    shippingCharged: 8,
    shippingCost: 8,
    initialPaymentAmount: 8,
    initialPaymentMethod: 'yape',
    initialPaymentConcept: 'shipping_advance',
    items: [
      {
        variantId: glossVar.id,
        sourceComboId: combo.id,
        sourceComboName: combo.name,
        quantity: 1,
        appliedUnitPrice: 6.5,
        pricingMode: 'custom'
      },
      {
        variantId: eyelinerVar.id,
        sourceComboId: combo.id,
        sourceComboName: combo.name,
        quantity: 1,
        appliedUnitPrice: 3, // 75% combo price of Eyeliner (4 * 0.75)
        pricingMode: 'combo'
      }
    ],
    suppliesUsed: [{ supplyId: bag.id, quantity: 1 }]
  });

  const sale = db.sales[0];
  // Stock checks: Gloss (10->9), Rimel untouched (10), Eyeliner (5->4), Bag (25->24)
  assert.equal(db.variants[0].stock, 9);
  assert.equal(db.variants[1].stock, 10);
  assert.equal(db.variants[2].stock, 4);
  assert.equal(db.supplies[0].stock, 24);

  // Financials:
  // Products revenue = 6.50 + 3.00 = 9.50
  // Products cost = 4.00 + 1.00 = 5.00
  // Absorbed bag cost = 0.56 (NOT charged to customer!)
  // Total charged to customer = 9.50 + 8.00 shipping = 17.50
  // Paid = 8.00 (shipping advance via Yape) -> Balance due = 9.50
  // Net profit = 9.50 - 5.00 - 0.56 + (8 - 8) = 3.94
  assert.equal(sale.productsRevenue, 9.5);
  assert.equal(sale.productsCost, 5);
  assert.equal(sale.suppliesCost, 0.56);
  assert.equal(sale.totalCharged, 17.5);
  assert.equal(sale.amountPaid, 8);
  assert.equal(sale.balanceDue, 9.5);
  assert.equal(sale.netProfit, 3.94);

  // Pay remaining balance on delivery via Plin and mark delivered
  db = applyAddSalePayment(db, sale.id, {
    amount: 9.5,
    method: 'plin',
    paymentConcept: 'delivery_balance',
    markDelivered: true
  });

  assert.equal(db.sales[0].amountPaid, 17.5);
  assert.equal(db.sales[0].balanceDue, 0);
  assert.equal(db.sales[0].status, 'delivered');

  // If cancelled later, stock of variants and bags is restored
  db = applyUpdateSaleStatus(db, sale.id, 'cancelled');
  assert.equal(db.variants[0].stock, 10);
  assert.equal(db.variants[2].stock, 5);
  assert.equal(db.supplies[0].stock, 25);
});

test('Modificación de precio de venta a última hora y liquidación total al entregar', () => {
  let db = emptyState();
  db = applyCreateProductWithInitialStock(db, {
    name: 'Labial Velvet',
    category: 'Labios',
    unitCost: 5,
    unitPrice: 12,
    initialStock: 10
  });
  const variantId = db.variants[0].id;
  const custRes = applyCreateOrUpdateCustomer(db, { name: 'Cliente A' });
  db = custRes.db;
  const custId = custRes.customer.id;

  // Creamos pedido de 2 unidades = S/ 24.00, pendiente de entrega
  db = applyCreateSale(db, {
    customerId: custId,
    items: [{ variantId, quantity: 2, appliedUnitPrice: 12 }],
    shippingCharged: 0,
    status: 'pending_delivery'
  });

  const sale = db.sales[0];
  assert.equal(sale.totalCharged, 24);
  assert.equal(sale.balanceDue, 24);
  assert.equal(sale.netProfit, 14); // 24 - 10 = 14

  // Caso 1: El cliente paga un monto menor acordado a última hora (S/ 20) y se liquida al 100%
  db = applyAddSalePayment(db, sale.id, {
    amount: 20,
    method: 'efectivo',
    markDelivered: true,
    adjustTotalCharged: true
  });

  assert.equal(db.sales[0].totalCharged, 20, 'El precio total debió ajustarse al pago');
  assert.equal(db.sales[0].amountPaid, 20);
  assert.equal(db.sales[0].balanceDue, 0, 'No debe quedar saldo pendiente');
  assert.equal(db.sales[0].status, 'delivered', 'Debe quedar como entregado');
  assert.equal(db.sales[0].netProfit, 10, 'Ganancia neta debe recalcularse a 20 - 10 = 10');
  assert.equal(db.sales[0].payments[0].method, 'cash', 'Debe normalizar efectivo a cash para respetar el check constraint de PostgreSQL');
  assert.equal(normalizePaymentMethod('efectivo'), 'cash');
  assert.equal(normalizePaymentMethod('Efectivo'), 'cash');
  assert.equal(normalizePaymentMethod('transferencia'), 'transfer');
  assert.equal(normalizePaymentMethod('plin'), 'plin');
  assert.equal(normalizePaymentMethod('yape'), 'yape');

  // Caso 2: Modificación directa de precio con applyUpdateSalePrice
  db = applyUpdateSalePrice(db, sale.id, 22, 'Ajuste posterior');
  assert.equal(db.sales[0].totalCharged, 22);
  assert.equal(db.sales[0].netProfit, 12);
  assert.equal(db.sales[0].balanceDue, 2, 'Debe reflejar saldo restante si el nuevo total supera lo pagado');
  assert.equal(db.sales[0].notes, 'Ajuste posterior');
});

test('Safe deletion helpers remove entities and enforce relational constraints', () => {
  let db = emptyState();
  db = applyCreateOrUpdateSupplier(db, { name: 'Prov Test', whatsapp: '999888777' });
  const supplierId = db.suppliers[0].id;
  assert.equal(db.suppliers.length, 1);

  db = applyDeleteSupplier(db, supplierId);
  assert.equal(db.suppliers.length, 0);

  db = applyCreateProductWithInitialStock(db, {
    name: 'Sombras Pro',
    brand: 'Nossa',
    category: 'Ojos',
    unitPrice: 15,
    unitCost: 8,
    initialStock: 5,
    hasVariants: false
  });
  const prodId = db.products[0].id;
  assert.equal(db.products.length, 1);
  assert.equal(db.variants.length, 1);

  db = applyCreateOrUpdateCombo(db, {
    name: 'Combo Sombras',
    items: [{ productId: prodId, variantId: db.variants[0].id, quantity: 1, customComboUnitPrice: null }]
  });
  const comboId = db.combos[0].id;
  assert.equal(db.combos[0].items.length, 1);

  // Deleting combo removes it cleanly
  db = applyDeleteCombo(db, comboId);
  assert.equal(db.combos.length, 0);

  // Deleting product removes product and variants
  db = applyDeleteProduct(db, prodId);
  assert.equal(db.products.length, 0);
  assert.equal(db.variants.length, 0);

  // Test supply delete
  db = applyCreateOrUpdateSupply(db, { name: 'Caja Regalo', stock: 10, unitCost: 1.5 });
  const supplyId = db.supplies[0].id;
  db = applyDeleteSupply(db, supplyId);
  assert.equal(db.supplies.length, 0);

  // Test customer delete
  const createdCust = applyCreateOrUpdateCustomer(db, { name: 'Cliente Test', whatsapp: '999111222' });
  db = createdCust.db;
  const custId = createdCust.customer.id;
  db = applyDeleteCustomer(db, custId);
  assert.equal(db.customers.length, 0);
});

test('Auto-snapshots rotativos retienen como máximo 5 copias históricas y permiten restauración', () => {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] || null
  };

  const initialDb = emptyState();
  initialDb.products.push({ id: 'p1', name: 'Labial Matte' });

  for (let i = 0; i < 7; i++) {
    saveLocalDb({ ...initialDb, tick: i });
  }

  const snapshots = listAutoSnapshots();
  assert.equal(snapshots.length, 5, 'Debe retener exactamente 5 snapshots rotativos');

  const oldestKey = snapshots[snapshots.length - 1].key;
  const restored = restoreAutoSnapshot(oldestKey);
  assert.ok(restored.tick !== undefined, 'El snapshot debe restaurar el estado completo');

  delete global.localStorage;
});

test('Single item product with custom shade name (e.g. Mascarilla Avena) creates variant with shade name and hasVariants=true', () => {
  let db = emptyState();
  db = applyCreateProductWithInitialStock(db, {
    name: 'Mascarilla Facial',
    brand: 'Bioaqua',
    category: 'Rostro',
    unitCost: 0.75,
    unitPrice: 1.5,
    comboRatio: 0.75,
    hasVariants: false,
    singleShadeName: 'Avena',
    initialStock: 1,
    entryType: 'initial_inventory'
  });

  assert.equal(db.products.length, 1);
  assert.equal(db.products[0].hasVariants, true);
  assert.equal(db.variants.length, 1);
  assert.equal(db.variants[0].shadeName, 'Avena');
  assert.equal(db.variants[0].stock, 1);
  assert.equal(db.variants[0].colorHex, null);
});

test('Optional colorHex is preserved in single-shade and multi-shade creation, product update, and sale snapshot', () => {
  let db = emptyState();
  db = applyCreateProductWithInitialStock(db, {
    name: 'Rasuradores Faciales',
    brand: 'P&W',
    category: 'Accesorios',
    unitCost: 1.5,
    unitPrice: 3.0,
    comboRatio: 0.75,
    hasVariants: true,
    entryType: 'initial_inventory',
    variants: [
      { shadeName: 'Rosado', colorHex: '#F48FB1', stock: 4, unitCost: 1.5 },
      { shadeName: 'Morado', colorHex: '#C084FC', stock: 4, unitCost: 1.5 },
      { shadeName: 'Sin Color Especial', colorHex: null, stock: 2, unitCost: 1.5 }
    ]
  });

  assert.equal(db.variants.length, 3);
  assert.equal(db.variants[0].colorHex, '#F48FB1');
  assert.equal(db.variants[1].colorHex, '#C084FC');
  assert.equal(db.variants[2].colorHex, null);

  // Update color of second variant and clear first variant
  db = applyUpdateProduct(db, {
    id: db.products[0].id,
    name: 'Rasuradores Faciales',
    brand: 'P&W',
    category: 'Accesorios',
    unitPrice: 3.0,
    comboRatio: 0.75,
    comboPrice: 2.25,
    variants: [
      { ...db.variants[0], colorHex: null },
      { ...db.variants[1], colorHex: '#881337' },
      { ...db.variants[2], colorHex: '#FACC15' }
    ]
  });

  assert.equal(db.variants[0].colorHex, null);
  assert.equal(db.variants[1].colorHex, '#881337');
  assert.equal(db.variants[2].colorHex, '#FACC15');

  // Create sale and verify shadeColorSnapshot
  db = applyCreateSale(db, {
    newCustomer: {
      name: 'Camila',
      whatsapp: '999888777',
      socialPlatform: 'instagram'
    },
    items: [
      {
        variantId: db.variants[1].id,
        quantity: 1,
        appliedUnitPrice: 3.0,
        pricingMode: 'unit'
      }
    ]
  });

  assert.equal(db.sales[0].items[0].shadeNameSnapshot, 'Morado');
  assert.equal(db.sales[0].items[0].shadeColorSnapshot, '#881337');
});

test('Predefined vs Customizable combos store comboType and calculate available stock appropriately', () => {
  let db = emptyState();

  db = applyCreateProductWithInitialStock(db, {
    name: 'Lipgloss Funky',
    brand: 'Funky',
    category: 'Labios',
    unitPrice: 8,
    comboRatio: 0.75,
    comboPrice: 6,
    unitCost: 4,
    hasVariants: true,
    variants: [
      { shadeName: 'Tono 01', stock: 1, unitCost: 4 },
      { shadeName: 'Tono 02', stock: 3, unitCost: 4 }
    ]
  });

  const prod = db.products[0];
  const var1 = db.variants[0];

  // 1. Predefined combo locks to Tono 01 (stock = 1)
  db = applyCreateOrUpdateCombo(db, {
    name: 'Combo Cerrado',
    comboType: 'predefined',
    items: [{ productId: prod.id, variantId: var1.id, quantity: 1 }]
  });

  // 2. Customizable combo clears variantId and counts total product stock across all shades (1 + 3 = 4)
  db = applyCreateOrUpdateCombo(db, {
    name: 'Combo Libre Elección',
    comboType: 'customizable',
    items: [{ productId: prod.id, variantId: var1.id, quantity: 1 }]
  });

  const predefinedCombo = db.combos.find((c) => c.name === 'Combo Cerrado');
  const customizableCombo = db.combos.find((c) => c.name === 'Combo Libre Elección');

  assert.equal(predefinedCombo.comboType, 'predefined');
  assert.equal(predefinedCombo.items[0].variantId, var1.id);

  assert.equal(customizableCombo.comboType, 'customizable');
  assert.equal(customizableCombo.items[0].variantId, null);

  const productsMap = new Map(db.products.map((p) => [p.id, p]));
  const variantsMap = new Map(db.variants.map((v) => [v.id, v]));
  const variantsByProduct = new Map([[prod.id, db.variants]]);

  const sumPredefined = computeComboSummary(predefinedCombo, productsMap, variantsByProduct, variantsMap);
  const sumCustomizable = computeComboSummary(customizableCombo, productsMap, variantsByProduct, variantsMap);

  assert.equal(sumPredefined.availableCount, 1);
  assert.equal(sumCustomizable.availableCount, 4);
});

test('Sale supports custom final total rounding (customTotalCharged) and updates net profit accurately', () => {
  let db = emptyState();

  db = applyCreateProductWithInitialStock(db, {
    name: 'Combo Item Test',
    brand: 'Pipo',
    category: 'Labios',
    unitPrice: 31.5,
    comboRatio: 0.75,
    comboPrice: 23.63,
    unitCost: 15.75,
    initialStock: 5,
    hasVariants: false
  });

  // Raw combo price = 23.63, cost = 15.75 (raw profit = 7.88).
  // User rounds final sale total down to 23.00 -> netProfit must be 23.00 - 15.75 = 7.25
  db = applyCreateSale(db, {
    newCustomer: {
      name: '~valeria_user',
      whatsapp: '',
      socialPlatform: 'whatsapp'
    },
    customTotalCharged: 23.0,
    items: [
      {
        variantId: db.variants[0].id,
        quantity: 1,
        appliedUnitPrice: 23.63,
        pricingMode: 'combo'
      }
    ]
  });

  const sale = db.sales[0];
  assert.equal(sale.totalCharged, 23.0);
  assert.equal(sale.productsRevenue, 23.0);
  assert.equal(sale.netProfit, 7.25);
  assert.equal(sale.balanceDue, 23.0);
});

test('Custom product categories can be freely added and removed', () => {
  let db = emptyState();

  db = applyAddCategory(db, 'Skincare');
  assert.ok(db.categories.includes('Skincare'));

  db = applyDeleteCategory(db, 'Rubor');
  assert.ok(!db.categories.includes('Rubor'));
});

test('Delivery points and availability slots can be scheduled, updated, and deleted', () => {
  let db = emptyState();
  db.deliveryPoints = [];
  db.deliverySlots = [];

  // Add a meeting point (UNAC)
  db = applySaveDeliveryPoint(db, {
    name: 'UNAC — Puerta Principal',
    zoneType: 'universidad',
    referenceInfo: 'Frente a FCA'
  });
  assert.equal(db.deliveryPoints.length, 1);
  const point = db.deliveryPoints[0];
  assert.equal(point.name, 'UNAC — Puerta Principal');
  assert.equal(point.active, true);

  // Add a scheduled time slot
  db = applySaveDeliverySlot(db, {
    deliveryPointId: point.id,
    dayLabel: 'Jueves 12 Nov',
    timeRange: '1:00 PM - 2:30 PM',
    maxOrders: 15
  });
  assert.equal(db.deliverySlots.length, 1);
  const slot = db.deliverySlots[0];
  assert.equal(slot.dayLabel, 'Jueves 12 Nov');
  assert.equal(slot.maxOrders, 15);

  // Deleting point also cascades and removes related slots
  db = applyDeleteDeliveryPoint(db, point.id);
  assert.equal(db.deliveryPoints.length, 0);
  assert.equal(db.deliverySlots.length, 0);
});

test('Storefront visual merchandising updates photos, descriptions, visibility and featured flags', () => {
  let db = emptyState();

  db = applyCreateProductWithInitialStock(db, {
    name: 'Brillo Labial Fresa',
    brand: 'Glow Pipo',
    category: 'Labios',
    unitPrice: 15.0,
    unitCost: 7.0,
    initialStock: 10,
    hasVariants: false
  });

  const product = db.products[0];
  assert.equal(product.isVisiblePublic, true, 'Products created in stock are visible on storefront by default');

  db = applyUpdateStorefrontMerchandising(db, {
    entityType: 'product',
    id: product.id,
    imageUrl: 'https://example.com/fresa.jpg',
    shadesImageUrl: 'https://example.com/swatches-all.jpg',
    variantImages: {
      [db.variants[0].id]: 'https://example.com/shade-01.jpg'
    },
    publicDescription: 'Aroma dulce a fresas silvestres y acabado espejo.',
    isVisiblePublic: true,
    isFeatured: true
  });

  const updated = db.products[0];
  assert.equal(updated.imageUrl, 'https://example.com/fresa.jpg');
  assert.equal(updated.shadesImageUrl, 'https://example.com/swatches-all.jpg');
  assert.equal(updated.publicDescription, 'Aroma dulce a fresas silvestres y acabado espejo.');
  assert.equal(updated.isFeatured, true);
  assert.equal(db.variants[0].imageUrl, 'https://example.com/shade-01.jpg');
});

test('Web storefront order payload & result normalization handles buyerName/customerName and verification statuses', () => {
  const normalized = normalizeWebOrderPayload({
    customerName: '  Adrian Huaman Castillo ',
    customerWhatsapp: ' 975551206 ',
    yapeHolderName: ' Adrian Huaman Castillo ',
    notes: ' Nos vemos en la puerta '
  });

  assert.equal(normalized.buyerName, 'Adrian Huaman Castillo');
  assert.equal(normalized.customerName, 'Adrian Huaman Castillo');
  assert.equal(normalized.buyerWhatsapp, '975551206');
  assert.equal(normalized.customerWhatsapp, '975551206');
  assert.equal(normalized.yapeHolderName, 'Adrian Huaman Castillo');

  const pendingRes = normalizeWebOrderResult({
    saleId: '123',
    saleCode: 'VTA-005',
    verificationStatus: 'pending_verification',
    totalCharged: 25
  });
  assert.equal(pendingRes.code, 'VTA-005');
  assert.equal(pendingRes.verified, false);

  const paidRes = normalizeWebOrderResult({
    saleId: '123',
    saleCode: 'VTA-005',
    verificationStatus: 'verified_auto',
    isPaid: true
  });
  assert.equal(paidRes.code, 'VTA-005');
  assert.equal(paidRes.verified, true);
});

test('applyConfirmWebOrderManual confirms pending_delivery web orders of any age (>20 min) and records missing payment', () => {
  let db = emptyState();
  db = applyCreateProductWithInitialStock(db, {
    name: 'Lip Oil Coquette',
    brand: 'Glow Pipo',
    category: 'Labios',
    unitPrice: 18,
    unitCost: 8,
    initialStock: 10
  });
  const variantId = db.variants[0].id;

  db = applyCreateSale(db, {
    newCustomer: {
      name: 'Valeria Paredes',
      whatsapp: '987111222',
      socialPlatform: 'web'
    },
    status: 'pending_delivery',
    shippingCharged: 5,
    shippingCost: 5,
    items: [{ variantId, quantity: 2, appliedUnitPrice: 18, pricingMode: 'unit' }]
  });

  // Simulate an order created 3 hours ago (>20 min auto-match window) with partial advance of S/ 5
  const sale = db.sales[0];
  sale.createdAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  sale.orderSource = 'web';
  sale.paymentVerificationStatus = 'pending_verification';
  sale.payments = [
    {
      id: 'pay-adv-1',
      paymentDate: sale.createdAt,
      amount: 5,
      method: 'yape',
      paymentConcept: 'shipping_advance',
      note: 'Adelanto previo'
    }
  ];
  sale.amountPaid = 5;
  sale.balanceDue = 36; // totalCharged = 41 (36 products + 5 shipping)

  db = applyConfirmWebOrderManual(db, { saleId: sale.id });
  const confirmed = db.sales[0];

  assert.equal(confirmed.paymentVerificationStatus, 'verified_manual');
  assert.equal(confirmed.amountPaid, 41);
  assert.equal(confirmed.paidAmount, 41);
  assert.equal(confirmed.totalAmount, 41);
  assert.equal(confirmed.balanceDue, 0);
  assert.equal(confirmed.payments.length, 2, 'Debe anexar el pago faltante de S/ 36');
  assert.equal(confirmed.payments[1].amount, 36);
  assert.equal(confirmed.payments[1].method, 'yape');

  // Calling applyConfirmWebOrderManual again is idempotent (no duplicate payment added)
  db = applyConfirmWebOrderManual(db, { saleId: sale.id });
  assert.equal(db.sales[0].payments.length, 2);
  assert.equal(db.sales[0].balanceDue, 0);
});

test('applyUpdateSaleStatus and applyDeleteSale restore supplies stock and release booked delivery slots', () => {
  let db = emptyState();
  db.deliveryPoints = [
    {
      id: 'dp-unac',
      code: 'PTO-001',
      name: 'UNAC Puerta 1',
      zoneType: 'unac',
      active: true,
      slots: [
        {
          id: 'slot-1',
          deliveryPointId: 'dp-unac',
          dayLabel: 'Viernes',
          timeRange: '12:00 - 14:00',
          maxOrders: 10,
          bookedOrders: 3,
          active: true
        }
      ]
    }
  ];
  db.deliverySlots = [
    {
      id: 'slot-1',
      deliveryPointId: 'dp-unac',
      dayLabel: 'Viernes',
      timeRange: '12:00 - 14:00',
      maxOrders: 10,
      bookedOrders: 3,
      active: true
    }
  ];

  db = applyCreateProductWithInitialStock(db, {
    name: 'Rubor Líquido',
    brand: 'Nossa',
    category: 'Rostro',
    unitPrice: 14,
    unitCost: 6,
    initialStock: 8
  });
  db = applyCreateOrUpdateSupply(db, {
    name: 'Bolsa Satinada Coquette',
    stock: 15,
    unitCost: 0.8
  });

  const variantId = db.variants[0].id;
  const supplyId = db.supplies[0].id;

  db = applyCreateSale(db, {
    newCustomer: { name: 'Andrea', whatsapp: '999000111' },
    status: 'pending_delivery',
    items: [{ variantId, quantity: 2, appliedUnitPrice: 14 }],
    suppliesUsed: [{ supplyId, quantity: 1 }]
  });
  db.sales[0].deliveryPointId = 'dp-unac';
  db.sales[0].deliverySlotId = 'slot-1';

  const saleId = db.sales[0].id;
  assert.equal(db.variants[0].stock, 6);
  assert.equal(db.supplies[0].stock, 14);

  // 1. Cancel web order -> restores variant stock (6->8), supply stock (14->15), and decrements bookedOrders (3->2)
  db = applyUpdateSaleStatus(db, saleId, 'cancelled');
  assert.equal(db.variants[0].stock, 8);
  assert.equal(db.supplies[0].stock, 15);
  assert.equal(db.deliverySlots[0].bookedOrders, 2);
  assert.equal(db.deliveryPoints[0].slots[0].bookedOrders, 2);

  // 2. Reactivate cancelled order -> re-deducts stock and re-books slot (2->3)
  db = applyUpdateSaleStatus(db, saleId, 'pending_delivery');
  assert.equal(db.variants[0].stock, 6);
  assert.equal(db.supplies[0].stock, 14);
  assert.equal(db.deliverySlots[0].bookedOrders, 3);
  assert.equal(db.deliveryPoints[0].slots[0].bookedOrders, 3);

  // 3. Delete active order -> restores variant stock (6->8), supply stock (14->15), and decrements bookedOrders (3->2)
  db = applyDeleteSale(db, saleId);
  assert.equal(db.sales.length, 0);
  assert.equal(db.variants[0].stock, 8);
  assert.equal(db.supplies[0].stock, 15);
  assert.equal(db.deliverySlots[0].bookedOrders, 2);
  assert.equal(db.deliveryPoints[0].slots[0].bookedOrders, 2);
});

test('cloudUpdateSaleStatus, cloudDeleteSale, cloudDeleteCustomer and confirmWebOrderManual restore supplies, release slots, and call RPC', async () => {
  const state = {
    sales: [
      { id: 'sale-1', customer_id: 'cust-1', status: 'pending_delivery', delivery_slot_id: 'slot-1' },
      { id: 'sale-2', customer_id: 'cust-1', status: 'pending_delivery', delivery_slot_id: 'slot-1' }
    ],
    sale_items: [
      { sale_id: 'sale-1', variant_id: 'var-1', quantity: 2, product_name_snapshot: 'Gloss' },
      { sale_id: 'sale-2', variant_id: 'var-1', quantity: 1, product_name_snapshot: 'Gloss' }
    ],
    sale_supplies: [
      { sale_id: 'sale-1', supply_id: 'sup-1', quantity: 1, supply_name_snapshot: 'Bolsa' },
      { sale_id: 'sale-2', supply_id: 'sup-1', quantity: 2, supply_name_snapshot: 'Bolsa' }
    ],
    product_variants: [{ id: 'var-1', product_id: 'prod-1', shade_name: 'Único', stock: 5, unit_cost: 4 }],
    supplies: [{ id: 'sup-1', code: 'INS-001', name: 'Bolsa', stock: 10, unit_cost: 0.5 }],
    delivery_slots: [{ id: 'slot-1', delivery_point_id: 'dp-1', booked_orders: 2, max_orders: 10, active: true }],
    customers: [{ id: 'cust-1', code: 'CLI-001', name: 'María', whatsapp: '999888777' }]
  };
  const rpcCalls = [];

  function createQueryBuilder(table) {
    let op = 'select';
    let updatePayload = null;
    const filters = [];
    let isSingle = false;

    const builder = {
      select() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      eq(col, val) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in(col, vals) {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      update(payload) {
        op = 'update';
        updatePayload = payload;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      single() {
        isSingle = true;
        return builder;
      },
      maybeSingle() {
        isSingle = true;
        return builder;
      },
      then(resolve, reject) {
        try {
          const rows = state[table] || [];
          const matched = rows.filter((r) => filters.every((f) => f(r)));
          if (op === 'update') {
            matched.forEach((r) => Object.assign(r, updatePayload));
            return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
          }
          if (op === 'delete') {
            state[table] = rows.filter((r) => !filters.every((f) => f(r)));
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          const data = isSingle ? matched[0] || null : matched;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        } catch (err) {
          return Promise.reject(err).then(resolve, reject);
        }
      }
    };
    return builder;
  }

  const mockClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'pipo@glowwithpipo.pe' }, expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null })
    },
    realtime: { setAuth() {} },
    from(table) {
      return createQueryBuilder(table);
    },
    async rpc(fnName, args) {
      rpcCalls.push({ fnName, args });
      return { data: { verified: true, saleId: args?.target_sale_id, verificationStatus: 'verified_manual' }, error: null };
    }
  };

  setSupabaseClientForTests(mockClient);
  try {
    // 1. cloudUpdateSaleStatus -> cancelling sale-1 restores variant (+2 -> 7), supply (+1 -> 11), and releases slot (2 -> 1)
    await cloudUpdateSaleStatus('sale-1', 'cancelled');
    assert.equal(state.product_variants[0].stock, 7);
    assert.equal(state.supplies[0].stock, 11);
    assert.equal(state.delivery_slots[0].booked_orders, 1);

    // Reactivate sale-1 back to pending_delivery -> deducts variant (7 -> 5), supply (11 -> 10), and re-books slot (1 -> 2)
    await cloudUpdateSaleStatus('sale-1', 'pending_delivery');
    assert.equal(state.product_variants[0].stock, 5);
    assert.equal(state.supplies[0].stock, 10);
    assert.equal(state.delivery_slots[0].booked_orders, 2);

    // 2. cloudDeleteSale('sale-1') -> restores variant (5 -> 7), supply (10 -> 11), and releases slot (2 -> 1)
    await cloudDeleteSale('sale-1');
    assert.equal(state.product_variants[0].stock, 7);
    assert.equal(state.supplies[0].stock, 11);
    assert.equal(state.delivery_slots[0].booked_orders, 1);

    // 3. cloudDeleteCustomer('cust-1', { cascadeSales: true }) -> deletes remaining active sale-2 and restores variant (7 -> 8), supply (11 -> 13), and releases slot (1 -> 0)
    await cloudDeleteCustomer('cust-1', { cascadeSales: true });
    assert.equal(state.product_variants[0].stock, 8);
    assert.equal(state.supplies[0].stock, 13);
    assert.equal(state.delivery_slots[0].booked_orders, 0);

    // 4. confirmWebOrderManual calls RPC confirm_web_order_payment_manual
    const manualRes = await confirmWebOrderManual('sale-manual-99');
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].fnName, 'confirm_web_order_payment_manual');
    assert.deepEqual(rpcCalls[0].args, { target_sale_id: 'sale-manual-99' });
    assert.ok(manualRes.db);
  } finally {
    setSupabaseClientForTests(null);
  }
});

test('mediaStorage: computeCompressedDimensions, compressImageToWebP, and uploadStorefrontMedia upload to Supabase bucket with WebP fallback', async () => {
  assert.equal(STOREFRONT_MEDIA_BUCKET, 'storefront-media');

  // 1. Proportional downscaling for oversized mobile photos
  assert.deepEqual(computeCompressedDimensions(4000, 3000, 1200), { width: 1200, height: 900 });
  assert.deepEqual(computeCompressedDimensions(2000, 4000, 1200), { width: 600, height: 1200 });
  assert.deepEqual(computeCompressedDimensions(800, 600, 1200), { width: 800, height: 600 });

  // 2. Headless/Node compression fallback preserves or encodes DataURL cleanly
  const sampleDataUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const compressed = await compressImageToWebP(sampleDataUrl, { maxDimension: 1200, quality: 0.82 });
  assert.equal(compressed.mimeType, 'image/webp');
  assert.ok(compressed.dataUrl.startsWith('data:image/'));
  assert.ok(compressed.blob instanceof Blob || Buffer.isBuffer(compressed.bytes));

  // 3. Successful upload to Supabase Storage bucket 'storefront-media'
  const uploadedPaths = [];
  const mockStorageClient = {
    storage: {
      from(bucketName) {
        assert.equal(bucketName, 'storefront-media');
        return {
          async upload(objectPath, _body, opts) {
            uploadedPaths.push({ objectPath, opts });
            return { data: { path: objectPath }, error: null };
          },
          getPublicUrl(objectPath) {
            return {
              data: {
                publicUrl: `https://fpahqojoqjrrthlwland.supabase.co/storage/v1/object/public/storefront-media/${objectPath}`
              }
            };
          }
        };
      }
    }
  };

  const cloudResult = await uploadStorefrontMedia(sampleDataUrl, {
    folder: 'products',
    client: mockStorageClient
  });
  assert.equal(cloudResult.storage, 'supabase');
  assert.equal(uploadedPaths.length, 1);
  assert.match(uploadedPaths[0].objectPath, /^products\/.+\.webp$/);
  assert.equal(uploadedPaths[0].opts.contentType, 'image/webp');
  assert.match(cloudResult.url, /^https:\/\/.+\/storefront-media\/products\/.+\.webp$/);

  // 4. Graceful fallback to compressed WebP DataURL if bucket does not exist yet or upload fails
  const failingClient = {
    storage: {
      from() {
        return {
          async upload() {
            return { data: null, error: { message: 'Bucket not found' } };
          }
        };
      }
    }
  };

  const fallbackResult = await uploadStorefrontMedia(sampleDataUrl, {
    folder: 'variants',
    client: failingClient
  });
  assert.equal(fallbackResult.storage, 'inline-fallback');
  assert.equal(fallbackResult.url, sampleDataUrl);
});

test('computeDashboardMetrics supports period filtering (all/month/7d/today), paymentsByMethod reconciliation, and formatSaleWhatsAppTicket', () => {
  let db = emptyState();
  db = applyCreateProductWithInitialStock(db, {
    name: 'Iluminador Coquette',
    brand: 'Glow Pipo',
    category: 'Rostro',
    unitPrice: 20,
    unitCost: 8,
    initialStock: 20
  });
  const variantId = db.variants[0].id;

  // Sale 1: October 2026 (outside November 2026 month/7d/today)
  db = applyCreateSale(db, {
    newCustomer: { name: 'Lucía', whatsapp: '999111000' },
    saleDate: '2026-10-15',
    status: 'delivered',
    initialPaymentAmount: 20,
    initialPaymentMethod: 'efectivo',
    items: [{ variantId, quantity: 1, appliedUnitPrice: 20 }]
  });
  db.sales[0].payments[0].paymentDate = '2026-10-15T15:00:00.000Z';

  // Sale 2: Nov 03, 2026 (in month, outside 7d of Nov 16)
  db = applyCreateSale(db, {
    newCustomer: { name: 'Mariana', whatsapp: '999222000' },
    saleDate: '2026-11-03',
    status: 'delivered',
    initialPaymentAmount: 40,
    initialPaymentMethod: 'plin',
    items: [{ variantId, quantity: 2, appliedUnitPrice: 20 }]
  });
  db.sales[0].payments[0].paymentDate = '2026-11-03T15:00:00.000Z';

  // Sale 3: Nov 16, 2026 (today)
  db = applyCreateSale(db, {
    newCustomer: { name: 'Valeria', whatsapp: '999333000' },
    saleDate: '2026-11-16',
    status: 'pending_delivery',
    deliveryLocation: 'UNAC Puerta Principal',
    deliveryDate: '2026-11-17',
    deliveryTime: '13:00 - 14:30',
    initialPaymentAmount: 15,
    initialPaymentMethod: 'yape',
    items: [{ variantId, quantity: 3, appliedUnitPrice: 20 }]
  });
  db.sales[0].payments[0].paymentDate = '2026-11-16T16:00:00.000Z';

  const allMetrics = computeDashboardMetrics(db, { period: 'all', referenceDate: '2026-11-16' });
  assert.equal(allMetrics.totalSalesCount, 3);
  assert.equal(allMetrics.totalUnitsSold, 6);
  assert.deepEqual(allMetrics.paymentsByMethod, {
    yape: 15,
    plin: 40,
    cash: 20,
    transfer: 0,
    total: 75
  });

  const monthMetrics = allMetrics.forPeriod('month');
  assert.equal(monthMetrics.totalSalesCount, 2);
  assert.equal(monthMetrics.totalUnitsSold, 5);
  assert.deepEqual(monthMetrics.paymentsByMethod, {
    yape: 15,
    plin: 40,
    cash: 0,
    transfer: 0,
    total: 55
  });

  const todayMetrics = allMetrics.forPeriod('today');
  assert.equal(todayMetrics.totalSalesCount, 1);
  assert.equal(todayMetrics.totalUnitsSold, 3);
  assert.deepEqual(todayMetrics.paymentsByMethod, {
    yape: 15,
    plin: 0,
    cash: 0,
    transfer: 0,
    total: 15
  });

  const ticket = formatSaleWhatsAppTicket(db.sales[0], { name: 'Valeria' });
  assert.match(ticket, /Glow with Pipo/);
  assert.match(ticket, /Clienta: Valeria/);
  assert.match(ticket, /3 × Iluminador Coquette/);
  assert.match(ticket, /Total: S\/ 60\.00/);
  assert.match(ticket, /Adelanto pagado: S\/ 15\.00/);
  assert.match(ticket, /Saldo pendiente: S\/ 45\.00/);
  assert.match(ticket, /UNAC Puerta Principal/);
});

test('shouldSuppressRealtimeEcho prevents duplicate full-DB pulls within cooldown after a local cloud fetch', () => {
  markCloudFetchCompleted(10000);
  assert.equal(shouldSuppressRealtimeEcho(10180, 2500), true);
  assert.equal(shouldSuppressRealtimeEcho(12499, 2500), true);
  assert.equal(shouldSuppressRealtimeEcho(12500, 2500), false);
});







