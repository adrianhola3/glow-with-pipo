import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardMetrics,
  computeMargins,
  computePackageUnitCost,
  computeSaleTotals,
  computeWeightedAverageCost
} from '../src/domain/calculations.js';
import {
  applyAddSalePayment,
  applyCreateOrUpdateCombo,
  applyCreateOrUpdateCustomer,
  applyCreateOrUpdateSupplier,
  applyCreateOrUpdateSupply,
  applyCreateProductWithInitialStock,
  applyCreateSale,
  applyDeleteCombo,
  applyDeleteCustomer,
  applyDeleteProduct,
  applyDeleteSupplier,
  applyDeleteSupply,
  applyRecordRestock,
  applyUpdateProduct,
  applyUpdateSaleStatus,
  listAutoSnapshots,
  restoreAutoSnapshot,
  saveLocalDb
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


