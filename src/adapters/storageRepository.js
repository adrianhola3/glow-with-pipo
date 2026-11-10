import { createClient } from '@supabase/supabase-js';
import {
  computeSaleTotals,
  computeWeightedAverageCost,
  generateNextCode,
  normalizePaymentMethod,
  roundMoney,
  roundUnitCost,
  toNumber
} from '../domain/calculations.js';

export { normalizePaymentMethod };
import { DEFAULT_COMBO_RATIO, PRODUCT_CATEGORIES } from '../domain/constants.js';

const LOCAL_DB_KEY = 'glow_with_pipo_db_v1';
const LOCAL_AUTH_KEY = 'glow_with_pipo_session_v1';
const CLOUD_CONFIG_KEY = 'glow_with_pipo_supabase_cfg_v1';
export const SESSION_TIMEOUT_KEY = 'glow_with_pipo_session_timeout_minutes_v1';
export const LAST_ACTIVITY_KEY = 'glow_with_pipo_last_activity_v1';
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30; // 30 minutos de inactividad estándar
export const AUTO_SNAPSHOT_PREFIX = 'glow_pipo_backup_auto_';
export const MAX_AUTO_SNAPSHOTS = 5;
let autoSnapshotSequence = 0;

export const DEFAULT_SUPABASE_URL = 'https://fpahqojoqjrrthlwland.supabase.co';
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_olRnMcbKMUDGHcnCfcB0tg_fQsQob4W';

export const DEFAULT_LOCAL_ACCOUNTS = [
  { id: 'owner-1', email: 'adrian@glowwithpipo.pe', name: 'Adrián', pin: '1234' },
  { id: 'owner-2', email: 'pipo@glowwithpipo.pe', name: 'Fabiana', pin: '1234' }
];

function hasBrowserStorage() {
  return typeof localStorage !== 'undefined';
}

function createEmptyDatabase() {
  return {
    accounts: DEFAULT_LOCAL_ACCOUNTS,
    categories: [...PRODUCT_CATEGORIES],
    suppliers: [],
    products: [],
    variants: [],
    supplies: [],
    combos: [],
    restocks: [],
    customers: [],
    sales: [],
    deliveryPoints: [],
    deliverySlots: [],
    yapeGateway: {
      id: 'primary',
      isAwake: true,
      lastHeartbeatAt: new Date().toISOString(),
      batteryLevel: 95,
      notificationsEnabled: true,
      receiverPhone: '+51 948 254 832',
      receiverName: 'Fabiana'
    },
    yapeIncomingPayments: []
  };
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

export function getSupabaseConfig() {
  const envUrl = import.meta?.env?.VITE_SUPABASE_URL || '';
  const envKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY || '';
  if (envUrl && envKey && !envUrl.includes('your-project-id')) {
    return { url: envUrl.trim(), anonKey: envKey.trim(), source: 'env' };
  }
  if (hasBrowserStorage()) {
    try {
      const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.url && parsed?.anonKey) {
          return { url: parsed.url.trim(), anonKey: parsed.anonKey.trim(), source: 'ui' };
        }
      }
    } catch {
      // Fall back to built-in cloud project
    }
  }
  return {
    url: DEFAULT_SUPABASE_URL,
    anonKey: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    source: 'builtin'
  };
}

export function saveSupabaseConfig(url, anonKey) {
  if (!hasBrowserStorage()) return null;
  if (!url || !anonKey) {
    localStorage.removeItem(CLOUD_CONFIG_KEY);
    cachedSupabase = null;
    cachedCfgSignature = '';
    return getSupabaseConfig();
  }
  const clean = { url: url.trim(), anonKey: anonKey.trim() };
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(clean));
  cachedSupabase = null;
  cachedCfgSignature = '';
  return clean;
}

let cachedSupabase = null;
let cachedCfgSignature = '';

export function getSupabaseClient() {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  const sig = `${cfg.url}|${cfg.anonKey}`;
  if (!cachedSupabase || cachedCfgSignature !== sig) {
    cachedCfgSignature = sig;
    cachedSupabase = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: hasBrowserStorage(),
        autoRefreshToken: hasBrowserStorage(),
        detectSessionInUrl: hasBrowserStorage()
      }
    });
    if (hasBrowserStorage()) {
      cachedSupabase.auth.onAuthStateChange((event, authSession) => {
        if (authSession?.access_token) {
          try {
            cachedSupabase.realtime.setAuth(authSession.access_token);
          } catch {}
        } else if (event === 'SIGNED_OUT') {
          notifySessionExpired();
        }
      });
    }
  }
  return cachedSupabase;
}

export function loadLocalDb() {
  if (!hasBrowserStorage()) return createEmptyDatabase();
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) {
      const fresh = createEmptyDatabase();
      localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyDatabase(),
      ...parsed,
      accounts:
        Array.isArray(parsed.accounts) && parsed.accounts.length > 0
          ? parsed.accounts
          : DEFAULT_LOCAL_ACCOUNTS
    };
  } catch {
    return createEmptyDatabase();
  }
}

export function saveLocalDb(db) {
  if (hasBrowserStorage()) {
    try {
      localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
      // Auto-snapshot rotativo (últimos 5 estados sanos) con secuencia monótona
      const now = Date.now();
      const seq = String(++autoSnapshotSequence).padStart(8, '0');
      const snapshotKey = `${AUTO_SNAPSHOT_PREFIX}${now}_${seq}`;
      localStorage.setItem(snapshotKey, JSON.stringify(db));

      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(AUTO_SNAPSHOT_PREFIX)) {
          keys.push(k);
        }
      }
      keys.sort();
      while (keys.length > MAX_AUTO_SNAPSHOTS) {
        const oldest = keys.shift();
        localStorage.removeItem(oldest);
      }
    } catch {
      // Ignorar errores de cuota de storage de forma segura
    }
  }
  return db;
}

export function listAutoSnapshots() {
  if (!hasBrowserStorage()) return [];
  const list = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(AUTO_SNAPSHOT_PREFIX)) {
        const rawTs = k.replace(AUTO_SNAPSHOT_PREFIX, '').split('_')[0];
        const ts = parseInt(rawTs, 10);
        list.push({ key: k, timestamp: ts, date: new Date(ts).toLocaleString() });
      }
    }
    list.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return b.key.localeCompare(a.key);
    });
  } catch {}
  return list;
}

export function restoreAutoSnapshot(key) {
  if (!hasBrowserStorage()) throw new Error('Almacenamiento no disponible');
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error('Snapshot no encontrado');
  const parsed = JSON.parse(raw);
  saveLocalDb(parsed);
  return parsed;
}

export function exportLocalDbJson() {
  const db = loadLocalDb();
  return JSON.stringify(db, null, 2);
}

export function importLocalDbJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Formato de respaldo inválido.');
  }
  const merged = {
    ...createEmptyDatabase(),
    ...parsed
  };
  saveLocalDb(merged);
  return merged;
}

export function resetLocalDb() {
  const fresh = createEmptyDatabase();
  saveLocalDb(fresh);
  return fresh;
}

// ============================================================================
// Pure State Mutations (Shared by Optimistic UI, Local Fallback & Unit Tests)
// ============================================================================

export function applyCreateOrUpdateSupplier(db, payload) {
  const next = structuredClone(db);
  const code = (payload.code || '').trim() || generateNextCode('PROV', next.suppliers);
  if (payload.id) {
    const idx = next.suppliers.findIndex((s) => s.id === payload.id);
    if (idx >= 0) {
      next.suppliers[idx] = {
        ...next.suppliers[idx],
        code,
        name: payload.name.trim(),
        address: (payload.address || '').trim(),
        whatsapp: (payload.whatsapp || '').trim(),
        instagramUrl: (payload.instagramUrl || '').trim(),
        tiktokUrl: (payload.tiktokUrl || '').trim(),
        facebookUrl: (payload.facebookUrl || '').trim(),
        notes: (payload.notes || '').trim()
      };
      return next;
    }
  }
  next.suppliers.push({
    id: payload.id || uid(),
    code,
    name: payload.name.trim(),
    address: (payload.address || '').trim(),
    whatsapp: (payload.whatsapp || '').trim(),
    instagramUrl: (payload.instagramUrl || '').trim(),
    tiktokUrl: (payload.tiktokUrl || '').trim(),
    facebookUrl: (payload.facebookUrl || '').trim(),
    notes: (payload.notes || '').trim(),
    createdAt: new Date().toISOString()
  });
  return next;
}

export function applyDeleteSupplier(db, supplierId) {
  const next = structuredClone(db);
  next.suppliers = next.suppliers.filter((s) => s.id !== supplierId);
  return next;
}

export function applyCreateProductWithInitialStock(db, payload) {
  const next = structuredClone(db);
  const productCode = (payload.code || '').trim() || generateNextCode('PROD', next.products);
  const unitPrice = roundMoney(payload.unitPrice);
  const comboRatio = toNumber(payload.comboRatio, DEFAULT_COMBO_RATIO);
  const comboPrice =
    payload.comboPrice !== undefined && payload.comboPrice !== ''
      ? roundMoney(payload.comboPrice)
      : roundMoney(unitPrice * comboRatio);

  const productId = payload.id || uid();
  const singleShade = (payload.singleShadeName || '').trim();
  const singleColor = (payload.singleShadeColor || '').trim();
  const hasVariants =
    Boolean(payload.hasVariants) ||
    (singleShade !== '' && singleShade.toLowerCase() !== 'único') ||
    singleColor !== '';

  const newProduct = {
    id: productId,
    code: productCode,
    name: payload.name.trim(),
    brand: (payload.brand || '').trim(),
    category: payload.category || 'Labios',
    unitPrice,
    comboRatio,
    comboPrice,
    hasVariants,
    imageUrl: (payload.imageUrl || '').trim(),
    galleryUrls: Array.isArray(payload.galleryUrls) ? payload.galleryUrls : [],
    publicDescription: (payload.publicDescription || '').trim(),
    isVisiblePublic: payload.isVisiblePublic !== false,
    isFeatured: Boolean(payload.isFeatured),
    active: true,
    createdAt: new Date().toISOString()
  };

  next.products.push(newProduct);

  const rawVariants =
    payload.hasVariants && Array.isArray(payload.variants) && payload.variants.length > 0
      ? payload.variants
      : [
          {
            shadeName: singleShade || 'Único',
            colorHex: payload.singleShadeColor ? payload.singleShadeColor.trim() : null,
            stock: Math.max(0, Math.trunc(toNumber(payload.initialStock, 0))),
            unitCost: roundUnitCost(payload.unitCost)
          }
        ];

  const initialRestockLines = [];

  rawVariants.forEach((v, idx) => {
    const sku =
      (v.sku || '').trim() ||
      (hasVariants ? `${productCode}-T${idx + 1}` : productCode);
    const stock = Math.max(0, Math.trunc(toNumber(v.stock, 0)));
    const unitCost = roundUnitCost(v.unitCost ?? payload.unitCost ?? 0);
    const variantId = v.id || uid();
    const colorHex = v.colorHex && String(v.colorHex).trim() ? String(v.colorHex).trim() : null;

    next.variants.push({
      id: variantId,
      productId,
      sku,
      shadeName: (v.shadeName || 'Único').trim(),
      colorHex,
      stock,
      unitCost,
      createdAt: new Date().toISOString()
    });

    if (stock > 0) {
      initialRestockLines.push({
        id: uid(),
        supplierId: payload.supplierId || null,
        itemKind: 'variant',
        variantId,
        supplyId: null,
        itemLabelSnapshot: `${newProduct.name}${hasVariants ? ` (${v.shadeName})` : ''}`,
        quantity: stock,
        packageCost: roundMoney(stock * unitCost),
        unitCost,
        subtotalCost: roundMoney(stock * unitCost)
      });
    }
  });

  if (initialRestockLines.length > 0) {
    const totalInvestment = roundMoney(
      initialRestockLines.reduce((acc, l) => acc + l.subtotalCost, 0)
    );
    next.restocks.unshift({
      id: uid(),
      code: generateNextCode('INI', next.restocks),
      restockDate: new Date().toISOString().slice(0, 10),
      entryType: payload.entryType || 'initial_inventory',
      totalInvestment,
      notes: `Carga inicial de ${newProduct.name}`,
      createdBy: payload.createdBy || '',
      items: initialRestockLines,
      createdAt: new Date().toISOString()
    });
  }

  return next;
}

export function applyUpdateProduct(db, payload) {
  const next = structuredClone(db);
  const idx = next.products.findIndex((p) => p.id === payload.id);
  if (idx < 0) return next;

  const unitPrice = roundMoney(payload.unitPrice);
  const comboRatio = toNumber(payload.comboRatio, next.products[idx].comboRatio || DEFAULT_COMBO_RATIO);
  const comboPrice =
    payload.comboPrice !== undefined && payload.comboPrice !== ''
      ? roundMoney(payload.comboPrice)
      : roundMoney(unitPrice * comboRatio);

  next.products[idx] = {
    ...next.products[idx],
    name: payload.name !== undefined ? payload.name.trim() : next.products[idx].name,
    brand: payload.brand !== undefined ? (payload.brand || '').trim() : next.products[idx].brand,
    category: payload.category || next.products[idx].category,
    unitPrice: payload.unitPrice !== undefined ? unitPrice : next.products[idx].unitPrice,
    comboRatio,
    comboPrice: payload.unitPrice !== undefined || payload.comboPrice !== undefined ? comboPrice : next.products[idx].comboPrice,
    imageUrl: payload.imageUrl !== undefined ? String(payload.imageUrl || '').trim() : (next.products[idx].imageUrl || ''),
    galleryUrls: Array.isArray(payload.galleryUrls) ? payload.galleryUrls : (next.products[idx].galleryUrls || []),
    publicDescription: payload.publicDescription !== undefined ? String(payload.publicDescription || '').trim() : (next.products[idx].publicDescription || ''),
    isVisiblePublic: payload.isVisiblePublic !== undefined ? Boolean(payload.isVisiblePublic) : (next.products[idx].isVisiblePublic !== false),
    isFeatured: payload.isFeatured !== undefined ? Boolean(payload.isFeatured) : Boolean(next.products[idx].isFeatured)
  };

  if (Array.isArray(payload.variants)) {
    const keptIds = new Set(payload.variants.filter((v) => v.id).map((v) => v.id));
    next.variants = next.variants.filter(
      (v) => v.productId !== payload.id || keptIds.has(v.id)
    );

    for (const vUpdate of payload.variants) {
      const nextColorHex =
        vUpdate.colorHex !== undefined
          ? vUpdate.colorHex && String(vUpdate.colorHex).trim()
            ? String(vUpdate.colorHex).trim()
            : null
          : undefined;
      if (vUpdate.id) {
        const vIdx = next.variants.findIndex((v) => v.id === vUpdate.id);
        if (vIdx >= 0) {
          next.variants[vIdx] = {
            ...next.variants[vIdx],
            shadeName: (vUpdate.shadeName || next.variants[vIdx].shadeName).trim(),
            colorHex: nextColorHex !== undefined ? nextColorHex : (next.variants[vIdx].colorHex || null),
            stock: Math.max(0, Math.trunc(toNumber(vUpdate.stock, next.variants[vIdx].stock))),
            unitCost: roundUnitCost(vUpdate.unitCost ?? next.variants[vIdx].unitCost)
          };
        }
      } else if (vUpdate.shadeName) {
        const existingCount = next.variants.filter((x) => x.productId === payload.id).length;
        next.variants.push({
          id: uid(),
          productId: payload.id,
          sku: (vUpdate.sku || '').trim() || `${next.products[idx].code}-T${existingCount + 1}-${Date.now().toString(36).slice(-3)}`,
          shadeName: vUpdate.shadeName.trim(),
          colorHex: nextColorHex || null,
          stock: Math.max(0, Math.trunc(toNumber(vUpdate.stock, 0))),
          unitCost: roundUnitCost(vUpdate.unitCost ?? 0),
          createdAt: new Date().toISOString()
        });
      }
    }

    const finalVariants = next.variants.filter((x) => x.productId === payload.id);
    const finalCount = finalVariants.length;
    next.products[idx].hasVariants =
      finalCount > 1 ||
      (finalCount === 1 &&
        (finalVariants[0]?.shadeName !== 'Único' || Boolean(finalVariants[0]?.colorHex)));
  }

  return next;
}

export function applyDeleteProduct(db, productId) {
  const next = structuredClone(db);
  next.products = next.products.filter((p) => p.id !== productId);
  next.variants = next.variants.filter((v) => v.productId !== productId);
  next.combos = next.combos.map((c) => ({
    ...c,
    items: (c.items || []).filter((ci) => ci.productId !== productId)
  }));
  return next;
}

export function applyCreateOrUpdateSupply(db, payload) {
  const next = structuredClone(db);
  const code = (payload.code || '').trim() || generateNextCode('INS', next.supplies);
  if (payload.id) {
    const idx = next.supplies.findIndex((s) => s.id === payload.id);
    if (idx >= 0) {
      next.supplies[idx] = {
        ...next.supplies[idx],
        code,
        name: payload.name.trim(),
        stock: Math.max(0, Math.trunc(toNumber(payload.stock, 0))),
        unitCost: roundUnitCost(payload.unitCost)
      };
      return next;
    }
  }
  next.supplies.push({
    id: payload.id || uid(),
    code,
    name: payload.name.trim(),
    stock: Math.max(0, Math.trunc(toNumber(payload.stock, 0))),
    unitCost: roundUnitCost(payload.unitCost),
    createdAt: new Date().toISOString()
  });
  return next;
}

export function applyDeleteSupply(db, supplyId) {
  const next = structuredClone(db);
  next.supplies = next.supplies.filter((s) => s.id !== supplyId);
  return next;
}

export function applyCreateOrUpdateCombo(db, payload) {
  const next = structuredClone(db);
  const code = (payload.code || '').trim() || generateNextCode('CMB', next.combos);
  const comboType = payload.comboType === 'customizable' ? 'customizable' : 'predefined';
  const cleanItems = (payload.items || []).map((item) => ({
    id: item.id || uid(),
    productId: item.productId,
    variantId: comboType === 'customizable' ? null : (item.variantId || null),
    quantity: Math.max(1, Math.trunc(toNumber(item.quantity, 1))),
    customComboUnitPrice:
      item.customComboUnitPrice !== undefined && item.customComboUnitPrice !== '' && item.customComboUnitPrice !== null
        ? roundMoney(item.customComboUnitPrice)
        : null
  }));

  if (payload.id) {
    const idx = next.combos.findIndex((c) => c.id === payload.id);
    if (idx >= 0) {
      next.combos[idx] = {
        ...next.combos[idx],
        code: (payload.code || '').trim() || next.combos[idx].code,
        name: payload.name !== undefined ? payload.name.trim() : next.combos[idx].name,
        comboType: payload.comboType !== undefined ? comboType : (next.combos[idx].comboType || 'predefined'),
        description: payload.description !== undefined ? (payload.description || '').trim() : next.combos[idx].description,
        publicDescription: payload.publicDescription !== undefined ? String(payload.publicDescription || '').trim() : (next.combos[idx].publicDescription || ''),
        imageUrl: payload.imageUrl !== undefined ? String(payload.imageUrl || '').trim() : (next.combos[idx].imageUrl || ''),
        isVisiblePublic: payload.isVisiblePublic !== undefined ? Boolean(payload.isVisiblePublic) : (next.combos[idx].isVisiblePublic !== false),
        isFeatured: payload.isFeatured !== undefined ? Boolean(payload.isFeatured) : Boolean(next.combos[idx].isFeatured),
        items: payload.items !== undefined ? cleanItems : (next.combos[idx].items || [])
      };
      return next;
    }
  }

  next.combos.push({
    id: payload.id || uid(),
    code,
    name: payload.name.trim(),
    comboType,
    description: (payload.description || '').trim(),
    publicDescription: (payload.publicDescription || '').trim(),
    imageUrl: (payload.imageUrl || '').trim(),
    isVisiblePublic: payload.isVisiblePublic !== false,
    isFeatured: Boolean(payload.isFeatured),
    active: true,
    items: cleanItems,
    createdAt: new Date().toISOString()
  });
  return next;
}

export function applyDeleteCombo(db, comboId) {
  const next = structuredClone(db);
  next.combos = next.combos.filter((c) => c.id !== comboId);
  return next;
}

export function applyAddCategory(db, categoryName) {
  const next = structuredClone(db);
  const clean = String(categoryName || '').replace(/\s+/g, ' ').trim();
  if (!clean) return next;
  const list = Array.isArray(next.categories) && next.categories.length > 0
    ? [...next.categories]
    : [...PRODUCT_CATEGORIES];
  if (!list.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    list.push(clean);
  }
  next.categories = list;
  return next;
}

export function applyDeleteCategory(db, categoryName) {
  const next = structuredClone(db);
  const clean = String(categoryName || '').replace(/\s+/g, ' ').trim();
  const list = Array.isArray(next.categories) && next.categories.length > 0
    ? [...next.categories]
    : [...PRODUCT_CATEGORIES];
  const filtered = list.filter((c) => c !== clean);
  if (filtered.length === 0) {
    throw new Error('Debes conservar al menos una categoría activa en el catálogo.');
  }
  next.categories = filtered;
  return next;
}

export function applyRecordRestock(db, payload) {
  const next = structuredClone(db);
  const productsMap = new Map(next.products.map((p) => [p.id, p]));
  const entryType = payload.entryType || 'purchase';
  const prefix = entryType === 'initial_inventory' ? 'INI' : 'REB';
  const code = (payload.code || '').trim() || generateNextCode(prefix, next.restocks);

  const processedLines = [];

  for (const line of payload.items || []) {
    const qty = Math.max(1, Math.trunc(toNumber(line.quantity, 1)));
    const unitCost = roundUnitCost(line.unitCost);
    const subtotalCost = roundMoney(
      line.packageCost !== undefined && line.packageCost !== ''
        ? toNumber(line.packageCost, qty * unitCost)
        : qty * unitCost
    );

    if (line.itemKind === 'supply') {
      const sIdx = next.supplies.findIndex((s) => s.id === line.supplyId);
      if (sIdx < 0) continue;
      const sup = next.supplies[sIdx];
      const newWac = computeWeightedAverageCost(sup.stock, sup.unitCost, qty, unitCost);
      sup.stock += qty;
      sup.unitCost = newWac;

      processedLines.push({
        id: uid(),
        supplierId: line.supplierId || null,
        itemKind: 'supply',
        variantId: null,
        supplyId: sup.id,
        itemLabelSnapshot: `Insumo: ${sup.name}`,
        quantity: qty,
        packageCost: subtotalCost,
        unitCost,
        subtotalCost
      });
    } else {
      const vIdx = next.variants.findIndex((v) => v.id === line.variantId);
      if (vIdx < 0) continue;
      const variant = next.variants[vIdx];
      const prod = productsMap.get(variant.productId);
      const newWac = computeWeightedAverageCost(variant.stock, variant.unitCost, qty, unitCost);
      variant.stock += qty;
      variant.unitCost = newWac;

      const label = prod
        ? `${prod.name}${prod.hasVariants ? ` (${variant.shadeName})` : ''}`
        : variant.shadeName;

      processedLines.push({
        id: uid(),
        supplierId: line.supplierId || null,
        itemKind: 'variant',
        variantId: variant.id,
        supplyId: null,
        itemLabelSnapshot: label,
        quantity: qty,
        packageCost: subtotalCost,
        unitCost,
        subtotalCost
      });
    }
  }

  const totalInvestment = roundMoney(
    processedLines.reduce((acc, item) => acc + item.subtotalCost, 0)
  );

  next.restocks.unshift({
    id: uid(),
    code,
    restockDate: payload.restockDate || new Date().toISOString().slice(0, 10),
    entryType,
    totalInvestment,
    notes: (payload.notes || '').trim(),
    createdBy: payload.createdBy || '',
    items: processedLines,
    createdAt: new Date().toISOString()
  });

  return next;
}

export function applyCreateOrUpdateCustomer(db, payload) {
  const next = structuredClone(db);
  const code = (payload.code || '').trim() || generateNextCode('CLI', next.customers);
  const cleanWhatsapp = (payload.whatsapp || '').trim();

  if (payload.id) {
    const idx = next.customers.findIndex((c) => c.id === payload.id);
    if (idx >= 0) {
      next.customers[idx] = {
        ...next.customers[idx],
        code,
        name: payload.name.trim(),
        whatsapp: cleanWhatsapp,
        socialPlatform: payload.socialPlatform || 'instagram',
        socialHandle: (payload.socialHandle || '').trim(),
        notes: (payload.notes || '').trim()
      };
      return { db: next, customer: next.customers[idx] };
    }
  }

  const customer = {
    id: payload.id || uid(),
    code,
    name: payload.name.trim(),
    whatsapp: cleanWhatsapp,
    socialPlatform: payload.socialPlatform || 'instagram',
    socialHandle: (payload.socialHandle || '').trim(),
    notes: (payload.notes || '').trim(),
    createdAt: new Date().toISOString()
  };

  next.customers.push(customer);
  return { db: next, customer };
}

export function applyDeleteCustomer(db, customerId, options = {}) {
  const next = structuredClone(db);
  const custSales = next.sales.filter((s) => s.customerId === customerId);
  if (custSales.length > 0) {
    if (options.cascadeSales) {
      for (const sale of custSales) {
        if (sale.status !== 'cancelled') {
          for (const item of sale.items || []) {
            const vIdx = next.variants.findIndex((v) => v.id === item.variantId);
            if (vIdx >= 0) next.variants[vIdx].stock += item.quantity;
          }
          for (const sup of sale.suppliesUsed || []) {
            const sIdx = next.supplies.findIndex((s) => s.id === sup.supplyId);
            if (sIdx >= 0) next.supplies[sIdx].stock += sup.quantity;
          }
        }
      }
      next.sales = next.sales.filter((s) => s.customerId !== customerId);
    } else {
      throw new Error('No se puede eliminar un cliente con pedidos registrados.');
    }
  }
  next.customers = next.customers.filter((c) => c.id !== customerId);
  return next;
}

export function applyDeleteSale(db, saleId) {
  const next = structuredClone(db);
  const idx = next.sales.findIndex((s) => s.id === saleId);
  if (idx < 0) return next;

  const sale = next.sales[idx];
  if (sale.status !== 'cancelled') {
    for (const item of sale.items || []) {
      const vIdx = next.variants.findIndex((v) => v.id === item.variantId);
      if (vIdx >= 0) next.variants[vIdx].stock += item.quantity;
    }
    for (const sup of sale.suppliesUsed || []) {
      const sIdx = next.supplies.findIndex((s) => s.id === sup.supplyId);
      if (sIdx >= 0) next.supplies[sIdx].stock += sup.quantity;
    }
  }
  next.sales.splice(idx, 1);
  return next;
}

export function applyCreateSale(db, payload) {
  let next = structuredClone(db);
  let customerId = payload.customerId;

  if (!customerId && payload.newCustomer) {
    const created = applyCreateOrUpdateCustomer(next, payload.newCustomer);
    next = created.db;
    customerId = created.customer.id;
  }

  if (!customerId) {
    throw new Error('Debe seleccionar o registrar un cliente para el pedido.');
  }

  const productsMap = new Map(next.products.map((p) => [p.id, p]));

  const saleItemsInput = [];
  for (const item of payload.items || []) {
    const vIdx = next.variants.findIndex((v) => v.id === item.variantId);
    if (vIdx < 0) {
      throw new Error('Uno de los productos seleccionados ya no existe.');
    }
    const variant = next.variants[vIdx];
    const prod = productsMap.get(variant.productId);
    const qty = Math.max(1, Math.trunc(toNumber(item.quantity, 1)));

    if (variant.stock < qty) {
      throw new Error(
        `Stock insuficiente para ${prod?.name || ''} (${variant.shadeName}). Disponible: ${variant.stock}.`
      );
    }
    variant.stock -= qty;

    saleItemsInput.push({
      id: uid(),
      variantId: variant.id,
      sourceComboId: item.sourceComboId || null,
      sourceComboName: item.sourceComboName || '',
      productNameSnapshot: prod ? prod.name : item.productNameSnapshot || 'Producto',
      shadeNameSnapshot: variant.shadeName || 'Único',
      shadeColorSnapshot: variant.colorHex || null,
      quantity: qty,
      unitCostSnapshot: roundUnitCost(variant.unitCost),
      catalogUnitPriceSnapshot: roundMoney(prod ? prod.unitPrice : item.appliedUnitPrice),
      appliedUnitPrice: roundMoney(item.appliedUnitPrice),
      pricingMode: item.pricingMode || 'unit'
    });
  }

  const suppliesInput = [];
  for (const supUsage of payload.suppliesUsed || []) {
    const qty = Math.max(1, Math.trunc(toNumber(supUsage.quantity, 1)));
    const sIdx = next.supplies.findIndex((s) => s.id === supUsage.supplyId);
    if (sIdx < 0) continue;
    const supply = next.supplies[sIdx];
    if (supply.stock < qty) {
      throw new Error(`Stock insuficiente de empaque "${supply.name}". Disponible: ${supply.stock}.`);
    }
    supply.stock -= qty;
    suppliesInput.push({
      id: uid(),
      supplyId: supply.id,
      supplyNameSnapshot: supply.name,
      quantity: qty,
      unitCostSnapshot: roundUnitCost(supply.unitCost)
    });
  }

  const payments = [];
  if (toNumber(payload.initialPaymentAmount, 0) > 0) {
    payments.push({
      id: uid(),
      paymentDate: new Date().toISOString(),
      amount: roundMoney(payload.initialPaymentAmount),
      method: normalizePaymentMethod(payload.initialPaymentMethod),
      paymentConcept: payload.initialPaymentConcept || 'shipping_advance',
      note: (payload.initialPaymentNote || 'Pago inicial registrado al crear el pedido').trim()
    });
  }

  const totals = computeSaleTotals({
    items: saleItemsInput,
    suppliesUsed: suppliesInput,
    shippingCharged: payload.shippingCharged,
    shippingCost: payload.shippingCost,
    customTotalCharged: payload.customTotalCharged,
    payments
  });

  const code = (payload.code || '').trim() || generateNextCode('VTA', next.sales);

  const saleRecord = {
    id: uid(),
    code,
    saleDate: payload.saleDate || new Date().toISOString().slice(0, 10),
    customerId,
    status: payload.status || 'pending_delivery',
    deliveryDate: payload.deliveryDate || '',
    deliveryTime: payload.deliveryTime || '',
    deliveryLocation: (payload.deliveryLocation || '').trim(),
    shippingCharged: totals.shippingCharged,
    shippingCost: totals.shippingCost,
    totalUnits: totals.totalUnits,
    productsRevenue: totals.productsRevenue,
    productsCost: totals.productsCost,
    suppliesCost: totals.suppliesCost,
    totalCharged: totals.totalCharged,
    netProfit: totals.netProfit,
    amountPaid: totals.amountPaid,
    balanceDue: totals.balanceDue,
    notes: (payload.notes || '').trim(),
    createdBy: payload.createdBy || '',
    items: totals.items,
    suppliesUsed: totals.suppliesUsed,
    payments,
    createdAt: new Date().toISOString()
  };

  next.sales.unshift(saleRecord);
  return next;
}

export function applyAddSalePayment(db, saleId, paymentPayload) {
  const next = structuredClone(db);
  const idx = next.sales.findIndex((s) => s.id === saleId);
  if (idx < 0) return next;

  const sale = next.sales[idx];
  const amount = roundMoney(paymentPayload.amount);
  if (amount <= 0) return next;

  sale.payments = sale.payments || [];
  sale.payments.push({
    id: uid(),
    paymentDate: new Date().toISOString(),
    amount,
    method: normalizePaymentMethod(paymentPayload.method),
    paymentConcept: paymentPayload.paymentConcept || 'delivery_balance',
    note: (paymentPayload.note || '').trim()
  });

  const totalPaid = roundMoney(
    sale.payments.reduce((acc, p) => acc + Number(p.amount), 0)
  );

  let targetTotalCharged = sale.totalCharged;
  if (paymentPayload.adjustTotalCharged) {
    targetTotalCharged = totalPaid;
  } else if (
    paymentPayload.newTotalCharged !== undefined &&
    paymentPayload.newTotalCharged !== null &&
    paymentPayload.newTotalCharged !== ''
  ) {
    targetTotalCharged = roundMoney(paymentPayload.newTotalCharged);
  }

  const recalc = computeSaleTotals({
    items: sale.items,
    suppliesUsed: sale.suppliesUsed,
    shippingCharged: sale.shippingCharged,
    shippingCost: sale.shippingCost,
    customTotalCharged: targetTotalCharged,
    payments: sale.payments
  });

  sale.totalCharged = recalc.totalCharged;
  sale.productsRevenue = recalc.productsRevenue;
  sale.netProfit = recalc.netProfit;
  sale.amountPaid = recalc.amountPaid;
  sale.balanceDue = recalc.balanceDue;

  if (paymentPayload.markDelivered && sale.status === 'pending_delivery') {
    sale.status = 'delivered';
  }

  return next;
}

export function applyUpdateSalePrice(db, saleId, newTotalCharged, notes = null) {
  const next = structuredClone(db);
  const idx = next.sales.findIndex((s) => s.id === saleId);
  if (idx < 0) return next;

  const sale = next.sales[idx];
  const safeTotal = roundMoney(Math.max(0, toNumber(newTotalCharged, sale.totalCharged)));

  const recalc = computeSaleTotals({
    items: sale.items,
    suppliesUsed: sale.suppliesUsed,
    shippingCharged: sale.shippingCharged,
    shippingCost: sale.shippingCost,
    customTotalCharged: safeTotal,
    payments: sale.payments || []
  });

  sale.totalCharged = recalc.totalCharged;
  sale.productsRevenue = recalc.productsRevenue;
  sale.netProfit = recalc.netProfit;
  sale.balanceDue = recalc.balanceDue;
  if (notes !== null && notes !== undefined) {
    sale.notes = notes;
  }

  return next;
}

export function applyUpdateSaleStatus(db, saleId, nextStatus) {
  const next = structuredClone(db);
  const idx = next.sales.findIndex((s) => s.id === saleId);
  if (idx < 0) return next;

  const sale = next.sales[idx];
  const prevStatus = sale.status;
  if (prevStatus === nextStatus) return next;

  if (prevStatus !== 'cancelled' && nextStatus === 'cancelled') {
    for (const item of sale.items || []) {
      const vIdx = next.variants.findIndex((v) => v.id === item.variantId);
      if (vIdx >= 0) {
        next.variants[vIdx].stock += item.quantity;
      }
    }
    for (const sup of sale.suppliesUsed || []) {
      const sIdx = next.supplies.findIndex((s) => s.id === sup.supplyId);
      if (sIdx >= 0) {
        next.supplies[sIdx].stock += sup.quantity;
      }
    }
  }

  if (prevStatus === 'cancelled' && nextStatus !== 'cancelled') {
    for (const item of sale.items || []) {
      const vIdx = next.variants.findIndex((v) => v.id === item.variantId);
      if (vIdx >= 0) {
        if (next.variants[vIdx].stock < item.quantity) {
          throw new Error(`No hay stock suficiente para reactivar ${item.productNameSnapshot}.`);
        }
        next.variants[vIdx].stock -= item.quantity;
      }
    }
    for (const sup of sale.suppliesUsed || []) {
      const sIdx = next.supplies.findIndex((s) => s.id === sup.supplyId);
      if (sIdx >= 0) {
        if (next.supplies[sIdx].stock < sup.quantity) {
          throw new Error(`No hay stock suficiente de ${sup.supplyNameSnapshot}.`);
        }
        next.supplies[sIdx].stock -= sup.quantity;
      }
    }
  }

  sale.status = nextStatus;
  return next;
}

export function applySaveDeliveryPoint(db, payload) {
  const next = structuredClone(db);
  next.deliveryPoints = next.deliveryPoints || [];
  const code = (payload.code || '').trim() || generateNextCode('PTO', next.deliveryPoints);
  if (payload.id) {
    const idx = next.deliveryPoints.findIndex((dp) => dp.id === payload.id);
    if (idx >= 0) {
      next.deliveryPoints[idx] = {
        ...next.deliveryPoints[idx],
        code,
        name: payload.name.trim(),
        zoneType: payload.zoneType || 'punto_especifico',
        referenceInfo: (payload.referenceInfo || '').trim(),
        active: payload.active !== false,
        sortOrder: Math.trunc(toNumber(payload.sortOrder, next.deliveryPoints[idx].sortOrder || 0))
      };
      return next;
    }
  }
  next.deliveryPoints.push({
    id: payload.id || uid(),
    code,
    name: payload.name.trim(),
    zoneType: payload.zoneType || 'punto_especifico',
    referenceInfo: (payload.referenceInfo || '').trim(),
    active: payload.active !== false,
    sortOrder: Math.trunc(toNumber(payload.sortOrder, next.deliveryPoints.length + 1)),
    createdAt: new Date().toISOString()
  });
  return next;
}

export function applyDeleteDeliveryPoint(db, pointId) {
  const next = structuredClone(db);
  next.deliveryPoints = (next.deliveryPoints || []).filter((dp) => dp.id !== pointId);
  next.deliverySlots = (next.deliverySlots || []).filter((ds) => ds.deliveryPointId !== pointId);
  return next;
}

export function applySaveDeliverySlot(db, payload) {
  const next = structuredClone(db);
  next.deliverySlots = next.deliverySlots || [];
  if (payload.id) {
    const idx = next.deliverySlots.findIndex((ds) => ds.id === payload.id);
    if (idx >= 0) {
      next.deliverySlots[idx] = {
        ...next.deliverySlots[idx],
        deliveryPointId: payload.deliveryPointId,
        slotDate: payload.slotDate || '',
        dayLabel: (payload.dayLabel || '').trim(),
        timeRange: (payload.timeRange || '').trim(),
        maxOrders: Math.max(1, Math.trunc(toNumber(payload.maxOrders, 10))),
        active: payload.active !== false
      };
      return next;
    }
  }
  next.deliverySlots.push({
    id: payload.id || uid(),
    deliveryPointId: payload.deliveryPointId,
    slotDate: payload.slotDate || '',
    dayLabel: (payload.dayLabel || '').trim(),
    timeRange: (payload.timeRange || '').trim(),
    maxOrders: Math.max(1, Math.trunc(toNumber(payload.maxOrders, 10))),
    bookedOrders: 0,
    active: payload.active !== false,
    createdAt: new Date().toISOString()
  });
  return next;
}

export function applyDeleteDeliverySlot(db, slotId) {
  const next = structuredClone(db);
  next.deliverySlots = (next.deliverySlots || []).filter((ds) => ds.id !== slotId);
  return next;
}

export function applyUpdateStorefrontMerchandising(db, payload) {
  const next = structuredClone(db);
  if (payload.entityType === 'combo') {
    const idx = (next.combos || []).findIndex((c) => c.id === payload.id);
    if (idx >= 0) {
      next.combos[idx] = {
        ...next.combos[idx],
        imageUrl: payload.imageUrl !== undefined ? (payload.imageUrl || '').trim() : next.combos[idx].imageUrl,
        publicDescription:
          payload.publicDescription !== undefined
            ? (payload.publicDescription || '').trim()
            : next.combos[idx].publicDescription,
        isVisiblePublic:
          payload.isVisiblePublic !== undefined ? Boolean(payload.isVisiblePublic) : next.combos[idx].isVisiblePublic,
        isFeatured: payload.isFeatured !== undefined ? Boolean(payload.isFeatured) : next.combos[idx].isFeatured
      };
    }
  } else {
    const idx = (next.products || []).findIndex((p) => p.id === payload.id);
    if (idx >= 0) {
      next.products[idx] = {
        ...next.products[idx],
        imageUrl: payload.imageUrl !== undefined ? (payload.imageUrl || '').trim() : next.products[idx].imageUrl,
        shadesImageUrl:
          payload.shadesImageUrl !== undefined
            ? (payload.shadesImageUrl || '').trim()
            : (next.products[idx].shadesImageUrl || ''),
        publicDescription:
          payload.publicDescription !== undefined
            ? (payload.publicDescription || '').trim()
            : next.products[idx].publicDescription,
        isVisiblePublic:
          payload.isVisiblePublic !== undefined ? Boolean(payload.isVisiblePublic) : next.products[idx].isVisiblePublic,
        isFeatured: payload.isFeatured !== undefined ? Boolean(payload.isFeatured) : next.products[idx].isFeatured
      };
    }

    if (payload.variantImages && typeof payload.variantImages === 'object') {
      next.variants = (next.variants || []).map((v) => {
        if (v.productId === payload.id && payload.variantImages[v.id] !== undefined) {
          return {
            ...v,
            imageUrl: (payload.variantImages[v.id] || '').trim()
          };
        }
        return v;
      });
    }
  }
  return next;
}

// ============================================================================
// Authentication & Live Realtime Subscription
// ============================================================================

export function getSessionTimeoutMinutes() {
  if (!hasBrowserStorage()) return DEFAULT_SESSION_TIMEOUT_MINUTES;
  try {
    const raw = localStorage.getItem(SESSION_TIMEOUT_KEY);
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TIMEOUT_MINUTES;
  } catch {
    return DEFAULT_SESSION_TIMEOUT_MINUTES;
  }
}

export function setSessionTimeoutMinutes(minutes) {
  if (!hasBrowserStorage()) return;
  const num = parseInt(minutes, 10);
  if (Number.isFinite(num) && num > 0) {
    localStorage.setItem(SESSION_TIMEOUT_KEY, String(num));
  }
}

export function recordUserActivity(timestamp = Date.now()) {
  if (!hasBrowserStorage()) return;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  } catch {}
}

export function getLastUserActivity() {
  if (!hasBrowserStorage()) return 0;
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function isSessionExpired(now = Date.now()) {
  const last = getLastUserActivity();
  if (!last) return false;
  const timeoutMs = getSessionTimeoutMinutes() * 60 * 1000;
  return now - last > timeoutMs;
}

export function getSavedSession() {
  if (!hasBrowserStorage()) return null;
  if (isSessionExpired()) {
    try {
      localStorage.removeItem(LOCAL_AUTH_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {}
    return null;
  }
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const sessionExpiredListeners = new Set();

export function onSessionExpired(callback) {
  if (typeof callback === 'function') {
    sessionExpiredListeners.add(callback);
    return () => sessionExpiredListeners.delete(callback);
  }
  return () => {};
}

export function notifySessionExpired() {
  for (const cb of sessionExpiredListeners) {
    try {
      cb();
    } catch {}
  }
}

export function isAuthPermissionError(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toLowerCase();
  const status = Number(err.status || 0);
  return (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    msg.includes('permission denied') ||
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('token is expired') ||
    msg.includes('invalid refresh token') ||
    msg.includes('row-level security') ||
    msg.includes('auth_session_expired')
  );
}

export async function ensureFreshSupabaseSession() {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: sessionData, error: sessionErr } = await client.auth.getSession();
    const currentSession = sessionData?.session;

    if (sessionErr || !currentSession) {
      // Intentar refresco reactivo con refresh token almacenado
      const { data: refreshData, error: refreshErr } = await client.auth
        .refreshSession()
        .catch(() => ({ data: null, error: true }));
      if (!refreshErr && refreshData?.session?.user) {
        if (refreshData.session.access_token) {
          try {
            client.realtime.setAuth(refreshData.session.access_token);
          } catch {}
        }
        return refreshData.session;
      }
      return null;
    }

    // Refrescar proactivamente si expira en menos de 90 segundos o ya expiró
    const expiresAt = currentSession.expires_at;
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - nowSec < 90) {
      const { data: refreshed, error: refErr } = await client.auth
        .refreshSession()
        .catch(() => ({ data: null, error: true }));
      if (!refErr && refreshed?.session) {
        if (refreshed.session.access_token) {
          try {
            client.realtime.setAuth(refreshed.session.access_token);
          } catch {}
        }
        return refreshed.session;
      }
    }

    if (currentSession.access_token) {
      try {
        client.realtime.setAuth(currentSession.access_token);
      } catch {}
    }
    return currentSession;
  } catch {
    return null;
  }
}

export async function restoreSupabaseSession() {
  if (isSessionExpired()) {
    await signOutApp();
    return null;
  }
  const client = getSupabaseClient();
  if (!client) return getSavedSession();

  try {
    const freshSession = await ensureFreshSupabaseSession();
    if (freshSession?.user) {
      if (isSessionExpired()) {
        await signOutApp();
        return null;
      }
      if (freshSession.access_token) {
        try {
          client.realtime.setAuth(freshSession.access_token);
        } catch {}
      }
      const user = freshSession.user;
      const sessionUser = {
        id: user.id,
        email: user.email,
        name:
          user.user_metadata?.name ||
          user.user_metadata?.display_name ||
          user.email.split('@')[0],
        mode: 'supabase'
      };
      if (hasBrowserStorage()) {
        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(sessionUser));
      }
      return sessionUser;
    }
  } catch {
    // Si hubo falla de red o Supabase no respondió, mantener fallback seguro
  }

  const saved = getSavedSession();
  if (saved?.mode === 'local') return saved;
  // Si la sesión guardada era de Supabase pero online ya no existe/expiró:
  if (saved?.mode === 'supabase') {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      await signOutApp();
      return null;
    }
    return saved;
  }
  return null;
}

export async function signInApp({ email, password, mode = 'supabase' }) {
  const client = getSupabaseClient();
  if (mode === 'supabase' && client) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password
    });
    if (error) {
      if (error.message?.toLowerCase().includes('invalid login')) {
        throw new Error('Correo o contraseña incorrectos.');
      }
      throw new Error(error.message);
    }
    if (data.session?.access_token) {
      client.realtime.setAuth(data.session.access_token);
    }
    const sessionUser = {
      id: data.user.id,
      email: data.user.email,
      name:
        data.user.user_metadata?.name ||
        data.user.user_metadata?.display_name ||
        data.user.email.split('@')[0],
      mode: 'supabase'
    };
    if (hasBrowserStorage()) {
      localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(sessionUser));
      recordUserActivity();
    }
    return sessionUser;
  }

  const db = loadLocalDb();
  const normalized = (email || '').trim().toLowerCase();
  const matched = db.accounts.find(
    (acc) =>
      (acc.email.toLowerCase() === normalized || acc.name.toLowerCase() === normalized) &&
      acc.pin === password
  );

  if (!matched) {
    throw new Error('Usuario o clave incorrectos.');
  }

  const sessionUser = {
    id: matched.id,
    email: matched.email,
    name: matched.name,
    mode: 'local'
  };
  if (hasBrowserStorage()) {
    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(sessionUser));
    recordUserActivity();
  }
  return sessionUser;
}

export async function updateCloudUserProfile({ name, newPassword }) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no está disponible.');

  const updatePayload = {};
  if (name && name.trim()) {
    updatePayload.data = { name: name.trim(), display_name: name.trim() };
  }
  if (newPassword && newPassword.trim()) {
    if (newPassword.trim().length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    updatePayload.password = newPassword.trim();
  }

  const { data, error } = await client.auth.updateUser(updatePayload);
  if (error) throw new Error(error.message);

  const updatedSession = {
    id: data.user.id,
    email: data.user.email,
    name:
      data.user.user_metadata?.name ||
      data.user.user_metadata?.display_name ||
      data.user.email.split('@')[0],
    mode: 'supabase'
  };
  if (hasBrowserStorage()) {
    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(updatedSession));
    recordUserActivity();
  }
  return updatedSession;
}

export async function signOutApp() {
  const client = getSupabaseClient();
  if (client) {
    await client.auth.signOut().catch(() => {});
  }
  if (hasBrowserStorage()) {
    localStorage.removeItem(LOCAL_AUTH_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  }
}

export function updateLocalOwnerAccount(db, accountId, { name, email, pin }) {
  const next = structuredClone(db);
  const idx = next.accounts.findIndex((a) => a.id === accountId);
  if (idx >= 0) {
    next.accounts[idx] = {
      ...next.accounts[idx],
      name: name.trim() || next.accounts[idx].name,
      email: email.trim() || next.accounts[idx].email,
      pin: pin.trim() || next.accounts[idx].pin
    };
  }
  saveLocalDb(next);
  return next;
}

export async function subscribeSupabaseRealtime(onDatabaseChanged, onStatusChange) {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const { data } = await client.auth.getSession();
  if (data?.session?.access_token) {
    client.realtime.setAuth(data.session.access_token);
  }

  let debounceTimer = null;
  const triggerSync = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onDatabaseChanged();
    }, 180);
  };

  const channel = client
    .channel(`pipo-live-sync-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      triggerSync();
    })
    .subscribe((status) => {
      if (onStatusChange) onStatusChange(status);
    });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    client.removeChannel(channel);
  };
}

// ============================================================================
// Direct Immediate Supabase PostgreSQL Queries & Targeted Row Mutations
// ============================================================================

async function executeFetchQueries(client) {
  const [
    categoriesRes,
    suppliersRes,
    productsRes,
    variantsRes,
    suppliesRes,
    combosRes,
    comboItemsRes,
    restocksRes,
    restockItemsRes,
    customersRes,
    salesRes,
    saleItemsRes,
    saleSuppliesRes,
    salePaymentsRes,
    deliveryPointsRes,
    deliverySlotsRes,
    yapeGatewayRes,
    yapeIncomingRes
  ] = await Promise.all([
    client
      .from('product_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    client.from('suppliers').select('*').order('created_at', { ascending: true }),
    client.from('products').select('*').order('created_at', { ascending: true }),
    client.from('product_variants').select('*').order('created_at', { ascending: true }),
    client.from('supplies').select('*').order('created_at', { ascending: true }),
    client.from('combos').select('*').order('created_at', { ascending: true }),
    client.from('combo_items').select('*'),
    client.from('restocks').select('*').order('created_at', { ascending: false }),
    client.from('restock_items').select('*'),
    client.from('customers').select('*').order('created_at', { ascending: true }),
    client.from('sales').select('*').order('created_at', { ascending: false }),
    client.from('sale_items').select('*'),
    client.from('sale_supplies').select('*'),
    client.from('sale_payments').select('*').order('payment_date', { ascending: true }),
    client.from('delivery_points').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    client.from('delivery_slots').select('*').order('slot_date', { ascending: true }).order('created_at', { ascending: true }),
    client.from('yape_gateway_status').select('*').eq('id', 'primary').maybeSingle(),
    client.from('yape_incoming_payments').select('*').order('received_at', { ascending: false }).limit(50)
  ]);

  const firstErr = [
    suppliersRes,
    productsRes,
    variantsRes,
    suppliesRes,
    combosRes,
    comboItemsRes,
    restocksRes,
    restockItemsRes,
    customersRes,
    salesRes,
    saleItemsRes,
    saleSuppliesRes,
    salePaymentsRes
  ].find((r) => r.error)?.error;

  if (firstErr) {
    throw firstErr;
  }

  return {
    categoriesRes,
    suppliersRes,
    productsRes,
    variantsRes,
    suppliesRes,
    combosRes,
    comboItemsRes,
    restocksRes,
    restockItemsRes,
    customersRes,
    salesRes,
    saleItemsRes,
    saleSuppliesRes,
    salePaymentsRes,
    deliveryPointsRes,
    deliverySlotsRes,
    yapeGatewayRes,
    yapeIncomingRes
  };
}

export async function fetchSupabaseDatabase() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no está configurado.');

  // Refresco proactivo preventivo si el token está próximo a caducar
  await ensureFreshSupabaseSession();

  let queryResults;
  try {
    queryResults = await executeFetchQueries(client);
  } catch (err) {
    if (isAuthPermissionError(err)) {
      // Reintento reactivo con refresco forzado si la sesión expiró en background
      const refreshed = await client.auth.refreshSession().catch(() => null);
      if (refreshed?.data?.session?.access_token) {
        try {
          client.realtime.setAuth(refreshed.data.session.access_token);
        } catch {}
        queryResults = await executeFetchQueries(client);
      } else {
        await signOutApp();
        notifySessionExpired();
        throw new Error('AUTH_SESSION_EXPIRED: Tu sesión ha expirado por seguridad. Por favor ingresa nuevamente.');
      }
    } else {
      throw new Error(`Error al sincronizar con Supabase: ${err.message}`);
    }
  }

  const {
    categoriesRes,
    suppliersRes,
    productsRes,
    variantsRes,
    suppliesRes,
    combosRes,
    comboItemsRes,
    restocksRes,
    restockItemsRes,
    customersRes,
    salesRes,
    saleItemsRes,
    saleSuppliesRes,
    salePaymentsRes,
    deliveryPointsRes,
    deliverySlotsRes,
    yapeGatewayRes,
    yapeIncomingRes
  } = queryResults;

  const comboItemsByCombo = new Map();
  for (const ci of comboItemsRes.data || []) {
    const arr = comboItemsByCombo.get(ci.combo_id) || [];
    arr.push({
      id: ci.id,
      productId: ci.product_id,
      variantId: ci.variant_id,
      quantity: ci.quantity,
      customComboUnitPrice:
        ci.custom_combo_unit_price !== null ? Number(ci.custom_combo_unit_price) : null
    });
    comboItemsByCombo.set(ci.combo_id, arr);
  }

  const restockItemsByRestock = new Map();
  for (const ri of restockItemsRes.data || []) {
    const arr = restockItemsByRestock.get(ri.restock_id) || [];
    arr.push({
      id: ri.id,
      supplierId: ri.supplier_id,
      itemKind: ri.item_kind,
      variantId: ri.variant_id,
      supplyId: ri.supply_id,
      itemLabelSnapshot: ri.item_label_snapshot,
      quantity: ri.quantity,
      packageCost: Number(ri.package_cost),
      unitCost: Number(ri.unit_cost),
      subtotalCost: Number(ri.subtotal_cost)
    });
    restockItemsByRestock.set(ri.restock_id, arr);
  }

  const saleItemsBySale = new Map();
  for (const si of saleItemsRes.data || []) {
    const arr = saleItemsBySale.get(si.sale_id) || [];
    arr.push({
      id: si.id,
      variantId: si.variant_id,
      sourceComboId: si.source_combo_id,
      sourceComboName: si.source_combo_name || '',
      productNameSnapshot: si.product_name_snapshot,
      shadeNameSnapshot: si.shade_name_snapshot,
      shadeColorSnapshot: si.shade_color_snapshot || null,
      quantity: si.quantity,
      unitCostSnapshot: Number(si.unit_cost_snapshot),
      catalogUnitPriceSnapshot: Number(si.catalog_unit_price_snapshot),
      appliedUnitPrice: Number(si.applied_unit_price),
      pricingMode: si.pricing_mode,
      lineRevenue: Number(si.line_revenue),
      lineCost: Number(si.line_cost),
      lineProfit: Number(si.line_profit)
    });
    saleItemsBySale.set(si.sale_id, arr);
  }

  const saleSuppliesBySale = new Map();
  for (const ss of saleSuppliesRes.data || []) {
    const arr = saleSuppliesBySale.get(ss.sale_id) || [];
    arr.push({
      id: ss.id,
      supplyId: ss.supply_id,
      supplyNameSnapshot: ss.supply_name_snapshot,
      quantity: ss.quantity,
      unitCostSnapshot: Number(ss.unit_cost_snapshot),
      totalCost: Number(ss.total_cost)
    });
    saleSuppliesBySale.set(ss.sale_id, arr);
  }

  const salePaymentsBySale = new Map();
  for (const sp of salePaymentsRes.data || []) {
    const arr = salePaymentsBySale.get(sp.sale_id) || [];
    arr.push({
      id: sp.id,
      paymentDate: sp.payment_date,
      amount: Number(sp.amount),
      method: sp.method,
      paymentConcept: sp.payment_concept,
      note: sp.note || ''
    });
    salePaymentsBySale.set(sp.sale_id, arr);
  }

  const localAccounts = loadLocalDb().accounts || DEFAULT_LOCAL_ACCOUNTS;
  const cloudCategories =
    !categoriesRes.error && Array.isArray(categoriesRes.data) && categoriesRes.data.length > 0
      ? categoriesRes.data.map((c) => c.name).filter(Boolean)
      : [...PRODUCT_CATEGORIES];

  return {
    accounts: localAccounts,
    categories: cloudCategories,
    suppliers: (suppliersRes.data || []).map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      address: s.address || '',
      whatsapp: s.whatsapp || '',
      instagramUrl: s.instagram_url || '',
      tiktokUrl: s.tiktok_url || '',
      facebookUrl: s.facebook_url || '',
      notes: s.notes || '',
      createdAt: s.created_at
    })),
    products: (productsRes.data || []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      brand: p.brand || '',
      category: p.category,
      unitPrice: Number(p.unit_price),
      comboRatio: Number(p.combo_ratio),
      comboPrice: Number(p.combo_price),
      hasVariants: p.has_variants,
      imageUrl: p.image_url || '',
      shadesImageUrl: p.shades_image_url || p.shadesImageUrl || '',
      galleryUrls: Array.isArray(p.gallery_urls) ? p.gallery_urls : [],
      publicDescription: p.public_description || '',
      isVisiblePublic: p.is_visible_public !== false,
      isFeatured: Boolean(p.is_featured),
      active: p.active,
      createdAt: p.created_at
    })),
    variants: (variantsRes.data || []).map((v) => ({
      id: v.id,
      productId: v.product_id,
      sku: v.sku,
      shadeName: v.shade_name,
      colorHex: v.color_hex || null,
      imageUrl: v.image_url || v.imageUrl || '',
      stock: v.stock,
      unitCost: Number(v.unit_cost),
      createdAt: v.created_at
    })),
    supplies: (suppliesRes.data || []).map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      stock: s.stock,
      unitCost: Number(s.unit_cost),
      createdAt: s.created_at
    })),
    combos: (combosRes.data || []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      comboType: c.combo_type || 'predefined',
      description: c.description || '',
      publicDescription: c.public_description || '',
      imageUrl: c.image_url || '',
      isVisiblePublic: c.is_visible_public !== false,
      isFeatured: Boolean(c.is_featured),
      active: c.active,
      items: comboItemsByCombo.get(c.id) || [],
      createdAt: c.created_at
    })),
    restocks: (restocksRes.data || []).map((r) => ({
      id: r.id,
      code: r.code,
      restockDate: r.restock_date,
      entryType: r.entry_type,
      totalInvestment: Number(r.total_investment),
      notes: r.notes || '',
      createdBy: r.created_by || '',
      items: restockItemsByRestock.get(r.id) || [],
      createdAt: r.created_at
    })),
    customers: (customersRes.data || []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      whatsapp: c.whatsapp,
      socialPlatform: c.social_platform,
      socialHandle: c.social_handle || '',
      notes: c.notes || '',
      createdAt: c.created_at
    })),
    sales: (salesRes.data || []).map((s) => ({
      id: s.id,
      code: s.code,
      saleDate: s.sale_date,
      customerId: s.customer_id,
      status: s.status,
      deliveryDate: s.delivery_date || '',
      deliveryTime: s.delivery_time || '',
      deliveryLocation: s.delivery_location || '',
      shippingCharged: Number(s.shipping_charged),
      shippingCost: Number(s.shipping_cost),
      totalUnits: s.total_units,
      productsRevenue: Number(s.products_revenue),
      productsCost: Number(s.products_cost),
      suppliesCost: Number(s.supplies_cost),
      totalCharged: Number(s.total_charged),
      netProfit: Number(s.net_profit),
      amountPaid: Number(s.amount_paid),
      balanceDue: Number(s.balance_due),
      notes: s.notes || '',
      createdBy: s.created_by || '',
      orderSource: s.order_source || 'erp',
      yapeHolderName: s.yape_holder_name || '',
      paymentVerificationStatus: s.payment_verification_status || 'manual',
      deliveryPointId: s.delivery_point_id || null,
      deliverySlotId: s.delivery_slot_id || null,
      items: saleItemsBySale.get(s.id) || [],
      suppliesUsed: saleSuppliesBySale.get(s.id) || [],
      payments: salePaymentsBySale.get(s.id) || [],
      createdAt: s.created_at
    })),
    deliveryPoints: (deliveryPointsRes?.data || []).map((dp) => ({
      id: dp.id,
      code: dp.code,
      name: dp.name,
      zoneType: dp.zone_type || 'punto_especifico',
      referenceInfo: dp.reference_info || '',
      active: dp.active !== false,
      sortOrder: dp.sort_order || 0,
      createdAt: dp.created_at
    })),
    deliverySlots: (deliverySlotsRes?.data || []).map((ds) => ({
      id: ds.id,
      deliveryPointId: ds.delivery_point_id,
      slotDate: ds.slot_date || '',
      dayLabel: ds.day_label || '',
      timeRange: ds.time_range || '',
      maxOrders: ds.max_orders || 10,
      bookedOrders: ds.booked_orders || 0,
      active: ds.active !== false,
      createdAt: ds.created_at
    })),
    yapeGateway: yapeGatewayRes?.data
      ? {
          id: yapeGatewayRes.data.id,
          isAwake: yapeGatewayRes.data.is_awake !== false,
          wakeRequestedAt: yapeGatewayRes.data.wake_requested_at || null,
          lastHeartbeatAt: yapeGatewayRes.data.last_heartbeat_at || null,
          batteryLevel: yapeGatewayRes.data.battery_level ?? 95,
          notificationsEnabled: yapeGatewayRes.data.notifications_enabled !== false,
          receiverPhone: yapeGatewayRes.data.receiver_phone || '+51 948 254 832',
          receiverName: yapeGatewayRes.data.receiver_name || 'Fabiana'
        }
      : {
          id: 'primary',
          isAwake: true,
          lastHeartbeatAt: new Date().toISOString(),
          batteryLevel: 95,
          notificationsEnabled: true,
          receiverPhone: '+51 948 254 832',
          receiverName: 'Fabiana'
        },
    yapeIncomingPayments: (yapeIncomingRes?.data || []).map((yip) => ({
      id: yip.id,
      senderFullName: yip.sender_full_name,
      normalizedSenderName: yip.normalized_sender_name,
      amount: Number(yip.amount),
      operationCode: yip.operation_code || '',
      rawNotificationText: yip.raw_notification_text || '',
      receivedAt: yip.received_at,
      consumed: Boolean(yip.consumed),
      matchedSaleId: yip.matched_sale_id || null
    }))
  };
}

// 1. Direct Supplier Mutations
export async function cloudSaveSupplier(currentDb, payload) {
  const client = getSupabaseClient();
  const code = (payload.code || '').trim() || generateNextCode('PROV', currentDb.suppliers);
  const row = {
    code,
    name: payload.name.trim(),
    address: (payload.address || '').trim(),
    whatsapp: (payload.whatsapp || '').trim(),
    instagram_url: (payload.instagramUrl || '').trim(),
    tiktok_url: (payload.tiktokUrl || '').trim(),
    facebook_url: (payload.facebookUrl || '').trim(),
    notes: (payload.notes || '').trim()
  };

  if (payload.id) {
    const { error } = await client.from('suppliers').update(row).eq('id', payload.id);
    if (error) throw new Error(`Error al actualizar proveedor: ${error.message}`);
  } else {
    const { error } = await client.from('suppliers').insert({ id: uid(), ...row });
    if (error) throw new Error(`Error al crear proveedor: ${error.message}`);
  }
  return fetchSupabaseDatabase();
}

export async function cloudDeleteSupplier(supplierId) {
  const client = getSupabaseClient();
  const { error } = await client.from('suppliers').delete().eq('id', supplierId);
  if (error) throw new Error(`Error al eliminar proveedor: ${error.message}`);
  return fetchSupabaseDatabase();
}

export async function cloudAddCategory(currentDb, categoryName) {
  const client = getSupabaseClient();
  const clean = String(categoryName || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fetchSupabaseDatabase();
  const nextOrder = (currentDb?.categories?.length || PRODUCT_CATEGORIES.length) + 1;
  const { error } = await client
    .from('product_categories')
    .upsert({ name: clean, sort_order: nextOrder }, { onConflict: 'name' });
  if (error && !String(error.message || '').includes('schema cache')) {
    throw new Error(`Error al agregar categoría: ${error.message}`);
  }
  const fresh = await fetchSupabaseDatabase();
  if (!fresh.categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    fresh.categories = [...fresh.categories, clean];
  }
  return fresh;
}

export async function cloudDeleteCategory(_currentDb, categoryName) {
  const client = getSupabaseClient();
  const clean = String(categoryName || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fetchSupabaseDatabase();
  const { error } = await client.from('product_categories').delete().eq('name', clean);
  if (error && !String(error.message || '').includes('schema cache')) {
    throw new Error(`Error al quitar categoría: ${error.message}`);
  }
  const fresh = await fetchSupabaseDatabase();
  fresh.categories = fresh.categories.filter((c) => c !== clean);
  return fresh;
}

// 2. Direct Product + Variants + Initial Inventory Mutations
export async function cloudCreateProductWithInitialStock(currentDb, payload) {
  const client = getSupabaseClient();
  const productCode = (payload.code || '').trim() || generateNextCode('PROD', currentDb.products);
  const unitPrice = roundMoney(payload.unitPrice);
  const comboRatio = toNumber(payload.comboRatio, DEFAULT_COMBO_RATIO);
  const comboPrice =
    payload.comboPrice !== undefined && payload.comboPrice !== ''
      ? roundMoney(payload.comboPrice)
      : roundMoney(unitPrice * comboRatio);

  const productId = uid();
  const singleShade = (payload.singleShadeName || '').trim();
  const singleColor = (payload.singleShadeColor || '').trim();
  const hasVariants =
    Boolean(payload.hasVariants) ||
    (singleShade !== '' && singleShade.toLowerCase() !== 'único') ||
    singleColor !== '';

  const { error: prodErr } = await client.from('products').insert({
    id: productId,
    code: productCode,
    name: payload.name.trim(),
    brand: (payload.brand || '').trim(),
    category: payload.category || 'Labios',
    unit_price: unitPrice,
    combo_ratio: comboRatio,
    combo_price: comboPrice,
    has_variants: hasVariants,
    image_url: (payload.imageUrl || '').trim(),
    gallery_urls: Array.isArray(payload.galleryUrls) ? payload.galleryUrls : [],
    public_description: (payload.publicDescription || '').trim(),
    is_visible_public: payload.isVisiblePublic !== false,
    is_featured: Boolean(payload.isFeatured),
    active: true
  });
  if (prodErr) throw new Error(`Error al crear producto: ${prodErr.message}`);

  const rawVariants =
    payload.hasVariants && Array.isArray(payload.variants) && payload.variants.length > 0
      ? payload.variants
      : [
          {
            shadeName: singleShade || 'Único',
            colorHex: singleColor || null,
            stock: Math.max(0, Math.trunc(toNumber(payload.initialStock, 0))),
            unitCost: roundUnitCost(payload.unitCost)
          }
        ];

  const variantRows = [];
  const restockItemsRows = [];

  rawVariants.forEach((v, idx) => {
    const variantId = uid();
    const sku = (v.sku || '').trim() || (hasVariants ? `${productCode}-T${idx + 1}` : productCode);
    const stock = Math.max(0, Math.trunc(toNumber(v.stock, 0)));
    const unitCost = roundUnitCost(v.unitCost ?? payload.unitCost ?? 0);
    const shadeName = (v.shadeName || 'Único').trim();
    const colorHex = v.colorHex && String(v.colorHex).trim() ? String(v.colorHex).trim() : null;

    variantRows.push({
      id: variantId,
      product_id: productId,
      sku,
      shade_name: shadeName,
      color_hex: colorHex,
      stock,
      unit_cost: unitCost
    });

    if (stock > 0) {
      restockItemsRows.push({
        id: uid(),
        supplier_id: payload.supplierId || null,
        item_kind: 'variant',
        variant_id: variantId,
        supply_id: null,
        item_label_snapshot: `${payload.name.trim()}${hasVariants ? ` (${shadeName})` : ''}`,
        quantity: stock,
        package_cost: roundMoney(stock * unitCost),
        unit_cost: unitCost,
        subtotal_cost: roundMoney(stock * unitCost)
      });
    }
  });

  const { error: varErr } = await client.from('product_variants').insert(variantRows);
  if (varErr) {
    await client.from('products').delete().eq('id', productId);
    throw new Error(`Error al guardar tonos del producto: ${varErr.message}`);
  }

  if (restockItemsRows.length > 0) {
    const restockId = uid();
    const totalInvestment = roundMoney(
      restockItemsRows.reduce((acc, r) => acc + r.subtotal_cost, 0)
    );
    const { data: existingRestocks } = await client.from('restocks').select('code');
    const restockCode = generateNextCode('INI', existingRestocks || currentDb.restocks);

    const { error: restErr } = await client.from('restocks').insert({
      id: restockId,
      code: restockCode,
      restock_date: new Date().toISOString().slice(0, 10),
      entry_type: payload.entryType || 'initial_inventory',
      total_investment: totalInvestment,
      notes: `Carga inicial de ${payload.name.trim()}`,
      created_by: payload.createdBy || ''
    });

    if (!restErr) {
      await client
        .from('restock_items')
        .insert(restockItemsRows.map((ri) => ({ ...ri, restock_id: restockId })));
    }
  }

  return fetchSupabaseDatabase();
}

export async function cloudUpdateProduct(currentDb, payload) {
  const client = getSupabaseClient();
  const existingProd = currentDb.products.find((p) => p.id === payload.id);
  const unitPrice = roundMoney(payload.unitPrice);
  const comboRatio = toNumber(payload.comboRatio, existingProd?.comboRatio || DEFAULT_COMBO_RATIO);
  const comboPrice =
    payload.comboPrice !== undefined && payload.comboPrice !== ''
      ? roundMoney(payload.comboPrice)
      : roundMoney(unitPrice * comboRatio);

  let hasVariants = Boolean(existingProd?.hasVariants);
  if (Array.isArray(payload.variants)) {
    const activeVariants = payload.variants.filter((v) => (v.shadeName || '').trim() !== '');
    hasVariants =
      activeVariants.length > 1 ||
      (activeVariants.length === 1 &&
        (activeVariants[0].shadeName.trim() !== 'Único' ||
          Boolean(activeVariants[0].colorHex && String(activeVariants[0].colorHex).trim())));
  }

  const { error: prodErr } = await client
    .from('products')
    .update({
      name: payload.name.trim(),
      brand: (payload.brand || '').trim(),
      category: payload.category || existingProd?.category || 'Labios',
      unit_price: unitPrice,
      combo_ratio: comboRatio,
      combo_price: comboPrice,
      has_variants: hasVariants,
      image_url: payload.imageUrl !== undefined ? (payload.imageUrl || '').trim() : (existingProd?.imageUrl || ''),
      gallery_urls: Array.isArray(payload.galleryUrls) ? payload.galleryUrls : (existingProd?.galleryUrls || []),
      public_description:
        payload.publicDescription !== undefined
          ? (payload.publicDescription || '').trim()
          : (existingProd?.publicDescription || ''),
      is_visible_public:
        payload.isVisiblePublic !== undefined ? Boolean(payload.isVisiblePublic) : (existingProd?.isVisiblePublic !== false),
      is_featured:
        payload.isFeatured !== undefined ? Boolean(payload.isFeatured) : Boolean(existingProd?.isFeatured)
    })
    .eq('id', payload.id);

  if (prodErr) throw new Error(`Error al actualizar producto: ${prodErr.message}`);

  if (Array.isArray(payload.variants)) {
    const { data: liveVars } = await client
      .from('product_variants')
      .select('id')
      .eq('product_id', payload.id);
    const keptIds = new Set(payload.variants.filter((v) => v.id).map((v) => v.id));
    const removedIds = (liveVars || []).map((v) => v.id).filter((id) => !keptIds.has(id));

    if (removedIds.length > 0) {
      const { error: delVarErr } = await client
        .from('product_variants')
        .delete()
        .in('id', removedIds);
      if (delVarErr) throw new Error(`Error al quitar tono: ${delVarErr.message}`);
    }

    const baseCode = existingProd?.code || 'PROD';
    for (let i = 0; i < payload.variants.length; i += 1) {
      const vUpdate = payload.variants[i];
      if (!vUpdate.shadeName || !vUpdate.shadeName.trim()) continue;
      const colorHex =
        vUpdate.colorHex && String(vUpdate.colorHex).trim() ? String(vUpdate.colorHex).trim() : null;
      if (vUpdate.id) {
        const { error: uErr } = await client
          .from('product_variants')
          .update({
            shade_name: vUpdate.shadeName.trim(),
            color_hex: colorHex,
            stock: Math.max(0, Math.trunc(toNumber(vUpdate.stock, 0))),
            unit_cost: roundUnitCost(vUpdate.unitCost ?? 0)
          })
          .eq('id', vUpdate.id);
        if (uErr) throw new Error(`Error al actualizar tono: ${uErr.message}`);
      } else {
        const sku =
          (vUpdate.sku || '').trim() ||
          `${baseCode}-T${i + 1}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        const { error: iErr } = await client.from('product_variants').insert({
          id: uid(),
          product_id: payload.id,
          sku,
          shade_name: vUpdate.shadeName.trim(),
          color_hex: colorHex,
          stock: Math.max(0, Math.trunc(toNumber(vUpdate.stock, 0))),
          unit_cost: roundUnitCost(vUpdate.unitCost ?? 0)
        });
        if (iErr) throw new Error(`Error al agregar nuevo tono: ${iErr.message}`);
      }
    }
  }

  return fetchSupabaseDatabase();
}

export async function cloudDeleteProduct(productId) {
  const client = getSupabaseClient();
  const { error } = await client.from('products').delete().eq('id', productId);
  if (error) throw new Error(`Error al eliminar producto: ${error.message}`);
  return fetchSupabaseDatabase();
}

// 3. Direct Supply (Decorated Bags) Mutations
export async function cloudSaveSupply(currentDb, payload) {
  const client = getSupabaseClient();
  const code = (payload.code || '').trim() || generateNextCode('INS', currentDb.supplies);
  const row = {
    code,
    name: payload.name.trim(),
    stock: Math.max(0, Math.trunc(toNumber(payload.stock, 0))),
    unit_cost: roundUnitCost(payload.unitCost)
  };

  if (payload.id) {
    const { error } = await client.from('supplies').update(row).eq('id', payload.id);
    if (error) throw new Error(`Error al actualizar empaque: ${error.message}`);
  } else {
    const { error } = await client.from('supplies').insert({ id: uid(), ...row });
    if (error) throw new Error(`Error al guardar empaque: ${error.message}`);
  }
  return fetchSupabaseDatabase();
}

export async function cloudDeleteSupply(supplyId) {
  const client = getSupabaseClient();
  const { error } = await client.from('supplies').delete().eq('id', supplyId);
  if (error) throw new Error(`Error al eliminar empaque: ${error.message}`);
  return fetchSupabaseDatabase();
}

// 4. Direct Combo Mutations
export async function cloudSaveCombo(currentDb, payload) {
  const client = getSupabaseClient();
  const code = (payload.code || '').trim() || generateNextCode('CMB', currentDb.combos);
  const comboId = payload.id || uid();
  const comboType = payload.comboType === 'customizable' ? 'customizable' : 'predefined';

  if (payload.id) {
    const existingCombo = currentDb.combos.find((c) => c.id === payload.id);
    const { error } = await client
      .from('combos')
      .update({
        code,
        name: payload.name.trim(),
        combo_type: comboType,
        description: (payload.description || '').trim(),
        public_description:
          payload.publicDescription !== undefined
            ? (payload.publicDescription || '').trim()
            : (existingCombo?.publicDescription || ''),
        image_url:
          payload.imageUrl !== undefined ? (payload.imageUrl || '').trim() : (existingCombo?.imageUrl || ''),
        is_visible_public:
          payload.isVisiblePublic !== undefined
            ? Boolean(payload.isVisiblePublic)
            : (existingCombo?.isVisiblePublic !== false),
        is_featured:
          payload.isFeatured !== undefined ? Boolean(payload.isFeatured) : Boolean(existingCombo?.isFeatured)
      })
      .eq('id', comboId);
    if (error) throw new Error(`Error al actualizar combo: ${error.message}`);
    await client.from('combo_items').delete().eq('combo_id', comboId);
  } else {
    const { error } = await client.from('combos').insert({
      id: comboId,
      code,
      name: payload.name.trim(),
      combo_type: comboType,
      description: (payload.description || '').trim(),
      public_description: (payload.publicDescription || payload.description || '').trim(),
      image_url: (payload.imageUrl || '').trim(),
      is_visible_public: payload.isVisiblePublic !== false,
      is_featured: Boolean(payload.isFeatured),
      active: true
    });
    if (error) throw new Error(`Error al crear combo: ${error.message}`);
  }

  const itemRows = (payload.items || []).map((item) => ({
    id: uid(),
    combo_id: comboId,
    product_id: item.productId,
    variant_id: comboType === 'customizable' ? null : (item.variantId || null),
    quantity: Math.max(1, Math.trunc(toNumber(item.quantity, 1))),
    custom_combo_unit_price:
      item.customComboUnitPrice !== undefined &&
      item.customComboUnitPrice !== '' &&
      item.customComboUnitPrice !== null
        ? roundMoney(item.customComboUnitPrice)
        : null
  }));

  if (itemRows.length > 0) {
    const { error: ciErr } = await client.from('combo_items').insert(itemRows);
    if (ciErr) throw new Error(`Error al guardar ítems del combo: ${ciErr.message}`);
  }

  return fetchSupabaseDatabase();
}

export async function cloudDeleteCombo(comboId) {
  const client = getSupabaseClient();
  const { error } = await client.from('combos').delete().eq('id', comboId);
  if (error) throw new Error(`Error al eliminar combo: ${error.message}`);
  return fetchSupabaseDatabase();
}

// 5. Direct Restock Mutation (Reads Fresh Server Stock & WAC First!)
export async function cloudRecordRestock(currentDb, payload) {
  const client = getSupabaseClient();
  const entryType = payload.entryType || 'purchase';
  const prefix = entryType === 'initial_inventory' ? 'INI' : 'REB';
  const { data: existingRestocks } = await client.from('restocks').select('code');
  const code = (payload.code || '').trim() || generateNextCode(prefix, existingRestocks || currentDb.restocks);

  const variantIds = (payload.items || [])
    .filter((l) => l.itemKind !== 'supply' && l.variantId)
    .map((l) => l.variantId);
  const supplyIds = (payload.items || [])
    .filter((l) => l.itemKind === 'supply' && l.supplyId)
    .map((l) => l.supplyId);

  const [liveVarsRes, liveSupsRes, liveProdsRes] = await Promise.all([
    variantIds.length > 0
      ? client.from('product_variants').select('*').in('id', variantIds)
      : Promise.resolve({ data: [] }),
    supplyIds.length > 0
      ? client.from('supplies').select('*').in('id', supplyIds)
      : Promise.resolve({ data: [] }),
    client.from('products').select('id, name, has_variants')
  ]);

  const varsMap = new Map((liveVarsRes.data || []).map((v) => [v.id, { ...v }]));
  const supsMap = new Map((liveSupsRes.data || []).map((s) => [s.id, { ...s }]));
  const prodsMap = new Map((liveProdsRes.data || []).map((p) => [p.id, p]));

  const restockId = uid();
  const restockItemRows = [];

  for (const line of payload.items || []) {
    const qty = Math.max(1, Math.trunc(toNumber(line.quantity, 1)));
    const unitCost = roundUnitCost(line.unitCost);
    const subtotalCost = roundMoney(
      line.packageCost !== undefined && line.packageCost !== ''
        ? toNumber(line.packageCost, qty * unitCost)
        : qty * unitCost
    );

    if (line.itemKind === 'supply') {
      const sup = supsMap.get(line.supplyId);
      if (!sup) continue;
      const newWac = computeWeightedAverageCost(sup.stock, Number(sup.unit_cost), qty, unitCost);
      sup.stock += qty;
      sup.unit_cost = newWac;

      const { error: uSupErr } = await client
        .from('supplies')
        .update({ stock: sup.stock, unit_cost: sup.unit_cost })
        .eq('id', sup.id);
      if (uSupErr) throw new Error(`Error al actualizar stock de bolsita: ${uSupErr.message}`);

      restockItemRows.push({
        id: uid(),
        restock_id: restockId,
        supplier_id: line.supplierId || null,
        item_kind: 'supply',
        variant_id: null,
        supply_id: sup.id,
        item_label_snapshot: `Insumo: ${sup.name}`,
        quantity: qty,
        package_cost: subtotalCost,
        unit_cost: unitCost,
        subtotal_cost: subtotalCost
      });
    } else {
      const variant = varsMap.get(line.variantId);
      if (!variant) continue;
      const prod = prodsMap.get(variant.product_id);
      const newWac = computeWeightedAverageCost(variant.stock, Number(variant.unit_cost), qty, unitCost);
      variant.stock += qty;
      variant.unit_cost = newWac;

      const { error: uVarErr } = await client
        .from('product_variants')
        .update({ stock: variant.stock, unit_cost: variant.unit_cost })
        .eq('id', variant.id);
      if (uVarErr) throw new Error(`Error al actualizar stock del tono: ${uVarErr.message}`);

      const label = prod
        ? `${prod.name}${prod.has_variants ? ` (${variant.shade_name})` : ''}`
        : variant.shade_name;

      restockItemRows.push({
        id: uid(),
        restock_id: restockId,
        supplier_id: line.supplierId || null,
        item_kind: 'variant',
        variant_id: variant.id,
        supply_id: null,
        item_label_snapshot: label,
        quantity: qty,
        package_cost: subtotalCost,
        unit_cost: unitCost,
        subtotal_cost: subtotalCost
      });
    }
  }

  const totalInvestment = roundMoney(
    restockItemRows.reduce((acc, r) => acc + r.subtotal_cost, 0)
  );

  const { error: rErr } = await client.from('restocks').insert({
    id: restockId,
    code,
    restock_date: payload.restockDate || new Date().toISOString().slice(0, 10),
    entry_type: entryType,
    total_investment: totalInvestment,
    notes: (payload.notes || '').trim(),
    created_by: payload.createdBy || ''
  });
  if (rErr) throw new Error(`Error al registrar compra: ${rErr.message}`);

  if (restockItemRows.length > 0) {
    const { error: riErr } = await client.from('restock_items').insert(restockItemRows);
    if (riErr) throw new Error(`Error al registrar detalle de compra: ${riErr.message}`);
  }

  return fetchSupabaseDatabase();
}

// 6. Direct Customer Mutations
export async function cloudSaveCustomer(currentDb, payload) {
  const client = getSupabaseClient();
  const code = (payload.code || '').trim() || generateNextCode('CLI', currentDb.customers);
  const row = {
    code,
    name: payload.name.trim(),
    whatsapp: (payload.whatsapp || '').trim(),
    social_platform: payload.socialPlatform || 'instagram',
    social_handle: (payload.socialHandle || '').trim(),
    notes: (payload.notes || '').trim()
  };

  if (payload.id) {
    const { error } = await client.from('customers').update(row).eq('id', payload.id);
    if (error) throw new Error(`Error al actualizar cliente: ${error.message}`);
  } else {
    const { error } = await client.from('customers').insert({ id: uid(), ...row });
    if (error) throw new Error(`Error al registrar cliente: ${error.message}`);
  }
  return fetchSupabaseDatabase();
}

export async function cloudDeleteCustomer(customerId, options = {}) {
  const client = getSupabaseClient();
  if (options.cascadeSales) {
    const { data: sales } = await client.from('sales').select('id, status').eq('customer_id', customerId);
    for (const s of sales || []) {
      if (s.status !== 'cancelled') {
        const { data: saleItems } = await client.from('sale_items').select('variant_id, quantity').eq('sale_id', s.id);
        for (const item of saleItems || []) {
          if (!item.variant_id) continue;
          const { data: v } = await client.from('product_variants').select('stock').eq('id', item.variant_id).single();
          if (v) {
            await client.from('product_variants').update({ stock: v.stock + item.quantity }).eq('id', item.variant_id);
          }
        }
      }
      await client.from('sales').delete().eq('id', s.id);
    }
  }

  const { error } = await client.from('customers').delete().eq('id', customerId);
  if (error) {
    if (error.code === '23503') {
      throw new Error('No se puede eliminar un cliente que ya tiene pedidos registrados sin eliminarlos primero.');
    }
    throw new Error(`Error al eliminar cliente: ${error.message}`);
  }
  return fetchSupabaseDatabase();
}

export async function cloudDeleteSale(saleId) {
  const client = getSupabaseClient();
  const { data: saleRow, error: sErr } = await client
    .from('sales')
    .select('id, status')
    .eq('id', saleId)
    .single();

  if (saleRow && saleRow.status !== 'cancelled') {
    const { data: saleItems } = await client
      .from('sale_items')
      .select('variant_id, quantity')
      .eq('sale_id', saleId);

    for (const item of saleItems || []) {
      if (!item.variant_id) continue;
      const { data: v } = await client
        .from('product_variants')
        .select('stock')
        .eq('id', item.variant_id)
        .single();
      if (v) {
        await client
          .from('product_variants')
          .update({ stock: v.stock + item.quantity })
          .eq('id', item.variant_id);
      }
    }
  }

  const { error: delErr } = await client.from('sales').delete().eq('id', saleId);
  if (delErr) {
    throw new Error(`Error al eliminar pedido: ${delErr.message}`);
  }
  return fetchSupabaseDatabase();
}

// 7. Direct Sale Creation & Live Stock Reservation
export async function cloudCreateSale(currentDb, payload) {
  const client = getSupabaseClient();
  let customerId = payload.customerId;

  if (!customerId && payload.newCustomer) {
    const { data: existingCusts } = await client.from('customers').select('code');
    const custCode = generateNextCode('CLI', existingCusts || currentDb.customers);
    customerId = uid();
    const { error: custErr } = await client.from('customers').insert({
      id: customerId,
      code: custCode,
      name: payload.newCustomer.name.trim(),
      whatsapp: (payload.newCustomer.whatsapp || '').trim(),
      social_platform: payload.newCustomer.socialPlatform || 'instagram',
      social_handle: (payload.newCustomer.socialHandle || '').trim(),
      notes: (payload.newCustomer.notes || '').trim()
    });
    if (custErr) throw new Error(`Error al registrar cliente del pedido: ${custErr.message}`);
  }

  if (!customerId) {
    throw new Error('Debe seleccionar o registrar un cliente para el pedido.');
  }

  const variantIds = [...new Set((payload.items || []).map((i) => i.variantId).filter(Boolean))];
  const supplyIds = [...new Set((payload.suppliesUsed || []).map((s) => s.supplyId).filter(Boolean))];

  const [liveVarsRes, liveSupsRes, liveProdsRes, liveSalesCodesRes] = await Promise.all([
    variantIds.length > 0
      ? client.from('product_variants').select('*').in('id', variantIds)
      : Promise.resolve({ data: [] }),
    supplyIds.length > 0
      ? client.from('supplies').select('*').in('id', supplyIds)
      : Promise.resolve({ data: [] }),
    client.from('products').select('id, name, unit_price'),
    client.from('sales').select('code')
  ]);

  const varsMap = new Map((liveVarsRes.data || []).map((v) => [v.id, { ...v }]));
  const supsMap = new Map((liveSupsRes.data || []).map((s) => [s.id, { ...s }]));
  const prodsMap = new Map((liveProdsRes.data || []).map((p) => [p.id, p]));

  const saleItemsInput = [];
  for (const item of payload.items || []) {
    const variant = varsMap.get(item.variantId);
    if (!variant) throw new Error('Uno de los productos seleccionados ya no existe en la nube.');
    const prod = prodsMap.get(variant.product_id);
    const qty = Math.max(1, Math.trunc(toNumber(item.quantity, 1)));

    if (variant.stock < qty) {
      throw new Error(
        `Stock insuficiente en vivo para ${prod?.name || ''} (${variant.shade_name}). Disponible: ${variant.stock}.`
      );
    }
    variant.stock -= qty;

    saleItemsInput.push({
      id: uid(),
      variantId: variant.id,
      sourceComboId: item.sourceComboId || null,
      sourceComboName: item.sourceComboName || '',
      productNameSnapshot: prod ? prod.name : item.productNameSnapshot || 'Producto',
      shadeNameSnapshot: variant.shade_name || 'Único',
      shadeColorSnapshot: variant.color_hex || null,
      quantity: qty,
      unitCostSnapshot: roundUnitCost(Number(variant.unit_cost)),
      catalogUnitPriceSnapshot: roundMoney(prod ? Number(prod.unit_price) : item.appliedUnitPrice),
      appliedUnitPrice: roundMoney(item.appliedUnitPrice),
      pricingMode: item.pricingMode || 'unit'
    });
  }

  const suppliesInput = [];
  for (const supUsage of payload.suppliesUsed || []) {
    const qty = Math.max(1, Math.trunc(toNumber(supUsage.quantity, 1)));
    const supply = supsMap.get(supUsage.supplyId);
    if (!supply) continue;
    if (supply.stock < qty) {
      throw new Error(`Stock insuficiente de "${supply.name}". Disponible: ${supply.stock}.`);
    }
    supply.stock -= qty;
    suppliesInput.push({
      id: uid(),
      supplyId: supply.id,
      supplyNameSnapshot: supply.name,
      quantity: qty,
      unitCostSnapshot: roundUnitCost(Number(supply.unit_cost))
    });
  }

  const payments = [];
  if (toNumber(payload.initialPaymentAmount, 0) > 0) {
    payments.push({
      id: uid(),
      paymentDate: new Date().toISOString(),
      amount: roundMoney(payload.initialPaymentAmount),
      method: normalizePaymentMethod(payload.initialPaymentMethod),
      paymentConcept: payload.initialPaymentConcept || 'shipping_advance',
      note: (payload.initialPaymentNote || 'Pago inicial registrado al crear el pedido').trim()
    });
  }

  const totals = computeSaleTotals({
    items: saleItemsInput,
    suppliesUsed: suppliesInput,
    shippingCharged: payload.shippingCharged,
    shippingCost: payload.shippingCost,
    customTotalCharged: payload.customTotalCharged,
    payments
  });

  const saleId = uid();
  const saleCode =
    (payload.code || '').trim() || generateNextCode('VTA', liveSalesCodesRes.data || currentDb.sales);

  const { error: saleErr } = await client.from('sales').insert({
    id: saleId,
    code: saleCode,
    sale_date: payload.saleDate || new Date().toISOString().slice(0, 10),
    customer_id: customerId,
    status: payload.status || 'pending_delivery',
    delivery_date: payload.deliveryDate || null,
    delivery_time: payload.deliveryTime || '',
    delivery_location: (payload.deliveryLocation || '').trim(),
    shipping_charged: totals.shippingCharged,
    shipping_cost: totals.shippingCost,
    total_units: totals.totalUnits,
    products_revenue: totals.productsRevenue,
    products_cost: totals.productsCost,
    supplies_cost: totals.suppliesCost,
    total_charged: totals.totalCharged,
    net_profit: totals.netProfit,
    amount_paid: totals.amountPaid,
    balance_due: totals.balanceDue,
    notes: (payload.notes || '').trim(),
    created_by: payload.createdBy || ''
  });
  if (saleErr) throw new Error(`Error al guardar pedido: ${saleErr.message}`);

  if (totals.items.length > 0) {
    const { error: siErr } = await client.from('sale_items').insert(
      totals.items.map((si) => ({
        id: si.id,
        sale_id: saleId,
        variant_id: si.variantId || null,
        source_combo_id: si.sourceComboId || null,
        source_combo_name: si.sourceComboName || '',
        product_name_snapshot: si.productNameSnapshot,
        shade_name_snapshot: si.shadeNameSnapshot,
        shade_color_snapshot: si.shadeColorSnapshot || null,
        quantity: si.quantity,
        unit_cost_snapshot: si.unitCostSnapshot,
        catalog_unit_price_snapshot: si.catalogUnitPriceSnapshot,
        applied_unit_price: si.appliedUnitPrice,
        pricing_mode: si.pricingMode,
        line_revenue: si.lineRevenue,
        line_cost: si.lineCost,
        line_profit: si.lineProfit
      }))
    );
    if (siErr) throw new Error(`Error al guardar productos de la venta: ${siErr.message}`);
  }

  if (totals.suppliesUsed.length > 0) {
    const { error: ssErr } = await client.from('sale_supplies').insert(
      totals.suppliesUsed.map((ss) => ({
        id: ss.id,
        sale_id: saleId,
        supply_id: ss.supplyId || null,
        supply_name_snapshot: ss.supplyNameSnapshot,
        quantity: ss.quantity,
        unit_cost_snapshot: ss.unitCostSnapshot,
        total_cost: ss.totalCost
      }))
    );
    if (ssErr) throw new Error(`Error al registrar empaque de la venta: ${ssErr.message}`);
  }

  if (payments.length > 0) {
    const { error: spErr } = await client.from('sale_payments').insert(
      payments.map((sp) => ({
        id: sp.id,
        sale_id: saleId,
        payment_date: sp.paymentDate,
        amount: sp.amount,
        method: normalizePaymentMethod(sp.method),
        payment_concept: sp.paymentConcept,
        note: sp.note || ''
      }))
    );
    if (spErr) throw new Error(`Error al registrar abono inicial: ${spErr.message}`);
  }

  // Commit deducted stock for affected variants & supplies
  for (const v of varsMap.values()) {
    await client.from('product_variants').update({ stock: v.stock }).eq('id', v.id);
  }
  for (const s of supsMap.values()) {
    await client.from('supplies').update({ stock: s.stock }).eq('id', s.id);
  }

  return fetchSupabaseDatabase();
}

// 8. Direct Partial Payment & Status Mutations
export async function cloudAddSalePayment(saleId, paymentPayload) {
  const client = getSupabaseClient();
  const amount = roundMoney(paymentPayload.amount);
  if (amount <= 0) return fetchSupabaseDatabase();

  const { data: saleRow, error: sFetchErr } = await client
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .single();
  if (sFetchErr || !saleRow) throw new Error('No se encontró el pedido en Supabase.');

  const { error: payErr } = await client.from('sale_payments').insert({
    id: uid(),
    sale_id: saleId,
    payment_date: new Date().toISOString(),
    amount,
    method: normalizePaymentMethod(paymentPayload.method),
    payment_concept: paymentPayload.paymentConcept || 'delivery_balance',
    note: (paymentPayload.note || '').trim()
  });
  if (payErr) throw new Error(`Error al registrar pago: ${payErr.message}`);

  const { data: allPays } = await client
    .from('sale_payments')
    .select('amount')
    .eq('sale_id', saleId);

  const totalPaid = roundMoney(
    (allPays || []).reduce((acc, p) => acc + Number(p.amount), 0)
  );

  let newTotalCharged = Number(saleRow.total_charged);
  if (paymentPayload.adjustTotalCharged) {
    newTotalCharged = totalPaid;
  } else if (
    paymentPayload.newTotalCharged !== undefined &&
    paymentPayload.newTotalCharged !== null &&
    paymentPayload.newTotalCharged !== ''
  ) {
    newTotalCharged = roundMoney(paymentPayload.newTotalCharged);
  }

  const safeShippingCharged = Number(saleRow.shipping_charged || 0);
  const safeShippingCost = Number(saleRow.shipping_cost || safeShippingCharged);
  const productsRevenue = roundMoney(Math.max(0, newTotalCharged - safeShippingCharged));
  const productsCost = Number(saleRow.products_cost || 0);
  const suppliesCost = Number(saleRow.supplies_cost || 0);
  const shippingNet = roundMoney(safeShippingCharged - safeShippingCost);
  const netProfit = roundMoney(productsRevenue - productsCost - suppliesCost + shippingNet);
  const balanceDue = roundMoney(Math.max(0, newTotalCharged - totalPaid));

  const nextStatus =
    paymentPayload.markDelivered && saleRow.status === 'pending_delivery'
      ? 'delivered'
      : saleRow.status;

  const { error: uErr } = await client
    .from('sales')
    .update({
      total_charged: newTotalCharged,
      products_revenue: productsRevenue,
      net_profit: netProfit,
      amount_paid: totalPaid,
      balance_due: balanceDue,
      status: nextStatus
    })
    .eq('id', saleId);
  if (uErr) throw new Error(`Error al actualizar saldo del pedido: ${uErr.message}`);

  return fetchSupabaseDatabase();
}

export async function cloudUpdateSalePrice(saleId, newTotalCharged, notes = null) {
  const client = getSupabaseClient();
  const safeTotal = roundMoney(Math.max(0, toNumber(newTotalCharged, 0)));

  const { data: saleRow, error: sErr } = await client
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .single();
  if (sErr || !saleRow) throw new Error('No se encontró el pedido en Supabase.');

  const { data: pays } = await client
    .from('sale_payments')
    .select('amount')
    .eq('sale_id', saleId);

  const amountPaid = roundMoney((pays || []).reduce((acc, p) => acc + Number(p.amount), 0));
  const safeShippingCharged = Number(saleRow.shipping_charged || 0);
  const safeShippingCost = Number(saleRow.shipping_cost || safeShippingCharged);
  const productsRevenue = roundMoney(Math.max(0, safeTotal - safeShippingCharged));
  const productsCost = Number(saleRow.products_cost || 0);
  const suppliesCost = Number(saleRow.supplies_cost || 0);
  const shippingNet = roundMoney(safeShippingCharged - safeShippingCost);
  const netProfit = roundMoney(productsRevenue - productsCost - suppliesCost + shippingNet);
  const balanceDue = roundMoney(Math.max(0, safeTotal - amountPaid));

  const updatePayload = {
    total_charged: safeTotal,
    products_revenue: productsRevenue,
    net_profit: netProfit,
    balance_due: balanceDue
  };
  if (notes !== null && notes !== undefined) {
    updatePayload.notes = notes;
  }

  const { error: uErr } = await client
    .from('sales')
    .update(updatePayload)
    .eq('id', saleId);
  if (uErr) throw new Error(`Error al actualizar precio de venta: ${uErr.message}`);

  return fetchSupabaseDatabase();
}

export async function cloudUpdateSaleStatus(saleId, nextStatus) {
  const client = getSupabaseClient();
  const { data: saleRow, error: sErr } = await client
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .single();
  if (sErr || !saleRow) throw new Error('No se encontró el pedido en Supabase.');

  const prevStatus = saleRow.status;
  if (prevStatus === nextStatus) return fetchSupabaseDatabase();

  const [saleItemsRes, saleSupsRes] = await Promise.all([
    client.from('sale_items').select('*').eq('sale_id', saleId),
    client.from('sale_supplies').select('*').eq('sale_id', saleId)
  ]);

  const saleItems = saleItemsRes.data || [];
  const saleSups = saleSupsRes.data || [];

  // Restore physical stock on cancellation
  if (prevStatus !== 'cancelled' && nextStatus === 'cancelled') {
    for (const item of saleItems) {
      if (!item.variant_id) continue;
      const { data: v } = await client
        .from('product_variants')
        .select('stock')
        .eq('id', item.variant_id)
        .single();
      if (v) {
        await client
          .from('product_variants')
          .update({ stock: v.stock + item.quantity })
          .eq('id', item.variant_id);
      }
    }
    for (const sup of saleSups) {
      if (!sup.supply_id) continue;
      const { data: s } = await client
        .from('supplies')
        .select('stock')
        .eq('id', sup.supply_id)
        .single();
      if (s) {
        await client
          .from('supplies')
          .update({ stock: s.stock + sup.quantity })
          .eq('id', sup.supply_id);
      }
    }
  }

  // Re-deduct stock if reactivating a cancelled order
  if (prevStatus === 'cancelled' && nextStatus !== 'cancelled') {
    for (const item of saleItems) {
      if (!item.variant_id) continue;
      const { data: v } = await client
        .from('product_variants')
        .select('stock')
        .eq('id', item.variant_id)
        .single();
      if (v) {
        if (v.stock < item.quantity) {
          throw new Error(`Stock insuficiente para reactivar ${item.product_name_snapshot}.`);
        }
        await client
          .from('product_variants')
          .update({ stock: v.stock - item.quantity })
          .eq('id', item.variant_id);
      }
    }
    for (const sup of saleSups) {
      if (!sup.supply_id) continue;
      const { data: s } = await client
        .from('supplies')
        .select('stock')
        .eq('id', sup.supply_id)
        .single();
      if (s) {
        if (s.stock < sup.quantity) {
          throw new Error(`Stock insuficiente de ${sup.supply_name_snapshot}.`);
        }
        await client
          .from('supplies')
          .update({ stock: s.stock - sup.quantity })
          .eq('id', sup.supply_id);
      }
    }
  }

  const { error: uErr } = await client
    .from('sales')
    .update({ status: nextStatus })
    .eq('id', saleId);
  if (uErr) throw new Error(`Error al actualizar estado del pedido: ${uErr.message}`);

  return fetchSupabaseDatabase();
}

// Optional Bulk Migration Helper (Used only when manually pushing offline local data to cloud)
export async function syncStateToSupabase(db) {
  const client = getSupabaseClient();
  if (!client) return;

  if (db.suppliers.length > 0) {
    const { error } = await client.from('suppliers').upsert(
      db.suppliers.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        address: s.address || '',
        whatsapp: s.whatsapp || '',
        instagram_url: s.instagramUrl || '',
        tiktok_url: s.tiktokUrl || '',
        facebook_url: s.facebookUrl || '',
        notes: s.notes || ''
      }))
    );
    if (error) throw new Error(`Proveedores: ${error.message}`);
  }

  if (db.products.length > 0) {
    const { error } = await client.from('products').upsert(
      db.products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        brand: p.brand || '',
        category: p.category,
        unit_price: p.unitPrice,
        combo_ratio: p.comboRatio,
        combo_price: p.comboPrice,
        has_variants: p.hasVariants,
        active: p.active !== false
      }))
    );
    if (error) throw new Error(`Productos: ${error.message}`);
  }

  if (db.variants.length > 0) {
    const { error } = await client.from('product_variants').upsert(
      db.variants.map((v) => ({
        id: v.id,
        product_id: v.productId,
        sku: v.sku,
        shade_name: v.shadeName,
        color_hex: v.colorHex || null,
        stock: v.stock,
        unit_cost: v.unitCost
      }))
    );
    if (error) throw new Error(`Variantes: ${error.message}`);
  }

  if (db.supplies.length > 0) {
    const { error } = await client.from('supplies').upsert(
      db.supplies.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        stock: s.stock,
        unit_cost: s.unitCost
      }))
    );
    if (error) throw new Error(`Insumos: ${error.message}`);
  }

  if (db.combos.length > 0) {
    const { error } = await client.from('combos').upsert(
      db.combos.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        combo_type: c.comboType === 'customizable' ? 'customizable' : 'predefined',
        description: c.description || '',
        active: c.active !== false
      }))
    );
    if (error) throw new Error(`Combos: ${error.message}`);

    const comboIds = db.combos.map((c) => c.id);
    await client.from('combo_items').delete().in('combo_id', comboIds);
    const allComboItems = db.combos.flatMap((c) =>
      (c.items || []).map((ci) => ({
        id: ci.id,
        combo_id: c.id,
        product_id: ci.productId,
        variant_id: ci.variantId || null,
        quantity: ci.quantity,
        custom_combo_unit_price: ci.customComboUnitPrice
      }))
    );
    if (allComboItems.length > 0) {
      const { error: ciErr } = await client.from('combo_items').insert(allComboItems);
      if (ciErr) throw new Error(`Items de combo: ${ciErr.message}`);
    }
  }

  if (db.restocks.length > 0) {
    const { error } = await client.from('restocks').upsert(
      db.restocks.map((r) => ({
        id: r.id,
        code: r.code,
        restock_date: r.restockDate,
        entry_type: r.entryType,
        total_investment: r.totalInvestment,
        notes: r.notes || '',
        created_by: r.createdBy || ''
      }))
    );
    if (error) throw new Error(`Reabastecimientos: ${error.message}`);

    const allRestockItems = db.restocks.flatMap((r) =>
      (r.items || []).map((ri) => ({
        id: ri.id,
        restock_id: r.id,
        supplier_id: ri.supplierId || null,
        item_kind: ri.itemKind,
        variant_id: ri.variantId || null,
        supply_id: ri.supplyId || null,
        item_label_snapshot: ri.itemLabelSnapshot,
        quantity: ri.quantity,
        package_cost: ri.packageCost,
        unit_cost: ri.unitCost,
        subtotal_cost: ri.subtotalCost
      }))
    );
    if (allRestockItems.length > 0) {
      const { error: riErr } = await client.from('restock_items').upsert(allRestockItems);
      if (riErr) throw new Error(`Detalle de reabastecimientos: ${riErr.message}`);
    }
  }

  if (db.customers.length > 0) {
    const { error } = await client.from('customers').upsert(
      db.customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        whatsapp: c.whatsapp,
        social_platform: c.socialPlatform,
        social_handle: c.socialHandle || '',
        notes: c.notes || ''
      }))
    );
    if (error) throw new Error(`Clientes: ${error.message}`);
  }

  if (db.sales.length > 0) {
    const { error } = await client.from('sales').upsert(
      db.sales.map((s) => ({
        id: s.id,
        code: s.code,
        sale_date: s.saleDate,
        customer_id: s.customerId,
        status: s.status,
        delivery_date: s.deliveryDate || null,
        delivery_time: s.deliveryTime || '',
        delivery_location: s.deliveryLocation || '',
        shipping_charged: s.shippingCharged,
        shipping_cost: s.shippingCost,
        total_units: s.totalUnits,
        products_revenue: s.productsRevenue,
        products_cost: s.productsCost,
        supplies_cost: s.suppliesCost,
        total_charged: s.totalCharged,
        net_profit: s.netProfit,
        amount_paid: s.amountPaid,
        balance_due: s.balanceDue,
        notes: s.notes || '',
        created_by: s.createdBy || ''
      }))
    );
    if (error) throw new Error(`Ventas: ${error.message}`);

    const allSaleItems = db.sales.flatMap((s) =>
      (s.items || []).map((si) => ({
        id: si.id,
        sale_id: s.id,
        variant_id: si.variantId || null,
        source_combo_id: si.sourceComboId || null,
        source_combo_name: si.sourceComboName || '',
        product_name_snapshot: si.productNameSnapshot,
        shade_name_snapshot: si.shadeNameSnapshot,
        shade_color_snapshot: si.shadeColorSnapshot || null,
        quantity: si.quantity,
        unit_cost_snapshot: si.unitCostSnapshot,
        catalog_unit_price_snapshot: si.catalogUnitPriceSnapshot,
        applied_unit_price: si.appliedUnitPrice,
        pricing_mode: si.pricingMode,
        line_revenue: si.lineRevenue,
        line_cost: si.lineCost,
        line_profit: si.lineProfit
      }))
    );
    if (allSaleItems.length > 0) {
      const { error: siErr } = await client.from('sale_items').upsert(allSaleItems);
      if (siErr) throw new Error(`Items de venta: ${siErr.message}`);
    }

    const allSaleSupplies = db.sales.flatMap((s) =>
      (s.suppliesUsed || []).map((ss) => ({
        id: ss.id,
        sale_id: s.id,
        supply_id: ss.supplyId || null,
        supply_name_snapshot: ss.supplyNameSnapshot,
        quantity: ss.quantity,
        unit_cost_snapshot: ss.unitCostSnapshot,
        total_cost: ss.totalCost
      }))
    );
    if (allSaleSupplies.length > 0) {
      const { error: ssErr } = await client.from('sale_supplies').upsert(allSaleSupplies);
      if (ssErr) throw new Error(`Bolsitas de venta: ${ssErr.message}`);
    }

    const allSalePayments = db.sales.flatMap((s) =>
      (s.payments || []).map((sp) => ({
        id: sp.id,
        sale_id: s.id,
        payment_date: sp.paymentDate,
        amount: sp.amount,
        method: normalizePaymentMethod(sp.method),
        payment_concept: sp.paymentConcept,
        note: sp.note || ''
      }))
    );
    if (allSalePayments.length > 0) {
      const { error: spErr } = await client.from('sale_payments').upsert(allSalePayments);
      if (spErr) throw new Error(`Pagos de venta: ${spErr.message}`);
    }
  }
}

// ============================================================================
// 9. Storefront Curation, Delivery Points/Slots & Yape Gateway Cloud Mutations
// ============================================================================

export async function cloudSaveDeliveryPoint(currentDb, payload) {
  const client = getSupabaseClient();
  const code = (payload.code || '').trim() || generateNextCode('PTO', currentDb.deliveryPoints || []);
  const row = {
    code,
    name: payload.name.trim(),
    zone_type: payload.zoneType || 'punto_especifico',
    reference_info: (payload.referenceInfo || '').trim(),
    active: payload.active !== false,
    sort_order: Math.trunc(toNumber(payload.sortOrder, (currentDb.deliveryPoints || []).length + 1))
  };

  if (payload.id) {
    const { error } = await client.from('delivery_points').update(row).eq('id', payload.id);
    if (error) throw new Error(`Error al actualizar punto de entrega: ${error.message}`);
  } else {
    const { error } = await client.from('delivery_points').insert({ id: uid(), ...row });
    if (error) throw new Error(`Error al crear punto de entrega: ${error.message}`);
  }
  return fetchSupabaseDatabase();
}

export async function cloudDeleteDeliveryPoint(pointId) {
  const client = getSupabaseClient();
  const { error } = await client.from('delivery_points').delete().eq('id', pointId);
  if (error) throw new Error(`Error al eliminar punto de entrega: ${error.message}`);
  return fetchSupabaseDatabase();
}

export async function cloudSaveDeliverySlot(_currentDb, payload) {
  const client = getSupabaseClient();
  const row = {
    delivery_point_id: payload.deliveryPointId,
    slot_date: payload.slotDate || null,
    day_label: (payload.dayLabel || '').trim(),
    time_range: (payload.timeRange || '').trim(),
    max_orders: Math.max(1, Math.trunc(toNumber(payload.maxOrders, 10))),
    active: payload.active !== false
  };

  if (payload.id) {
    const { error } = await client.from('delivery_slots').update(row).eq('id', payload.id);
    if (error) throw new Error(`Error al actualizar horario de entrega: ${error.message}`);
  } else {
    const { error } = await client.from('delivery_slots').insert({ id: uid(), ...row });
    if (error) throw new Error(`Error al crear horario de entrega: ${error.message}`);
  }
  return fetchSupabaseDatabase();
}

export async function cloudDeleteDeliverySlot(slotId) {
  const client = getSupabaseClient();
  const { error } = await client.from('delivery_slots').delete().eq('id', slotId);
  if (error) throw new Error(`Error al eliminar horario de entrega: ${error.message}`);
  return fetchSupabaseDatabase();
}

export async function cloudUpdateStorefrontMerchandising(payload) {
  const client = getSupabaseClient();
  const table = payload.entityType === 'combo' ? 'combos' : 'products';
  const updateObj = {};
  if (payload.imageUrl !== undefined) updateObj.image_url = (payload.imageUrl || '').trim();
  if (payload.publicDescription !== undefined) {
    updateObj.public_description = (payload.publicDescription || '').trim();
  }
  if (payload.isVisiblePublic !== undefined) {
    updateObj.is_visible_public = Boolean(payload.isVisiblePublic);
  }
  if (payload.isFeatured !== undefined) {
    updateObj.is_featured = Boolean(payload.isFeatured);
  }
  if (payload.entityType !== 'combo' && payload.shadesImageUrl !== undefined) {
    updateObj.shades_image_url = (payload.shadesImageUrl || '').trim();
  }

  let { error } = await client.from(table).update(updateObj).eq('id', payload.id);
  // Si la columna shades_image_url aún no existe en el esquema remoto, reintentar omitiéndola
  if (error && (error.message?.includes('shades_image_url') || error.code === '42703')) {
    delete updateObj.shades_image_url;
    const retry = await client.from(table).update(updateObj).eq('id', payload.id);
    error = retry.error;
  }
  if (error) throw new Error(`Error al personalizar vitrina web: ${error.message}`);

  // Actualizar fotos individuales de tonos/variantes si se enviaron
  if (payload.entityType !== 'combo' && payload.variantImages && typeof payload.variantImages === 'object') {
    for (const [varId, imgUrl] of Object.entries(payload.variantImages)) {
      const cleanImg = (imgUrl || '').trim();
      const { error: vErr } = await client
        .from('product_variants')
        .update({ image_url: cleanImg })
        .eq('id', varId);
      if (vErr && !vErr.message?.includes('image_url') && vErr.code !== '42703') {
        console.warn('Advertencia al guardar foto de variante en Supabase:', vErr.message);
      }
    }
  }

  return fetchSupabaseDatabase();
}

export async function cloudUpdateYapeGateway(payload) {
  const client = getSupabaseClient();
  const updateObj = {
    last_heartbeat_at: new Date().toISOString()
  };
  if (payload.isAwake !== undefined) updateObj.is_awake = Boolean(payload.isAwake);
  if (payload.batteryLevel !== undefined) updateObj.battery_level = Math.trunc(toNumber(payload.batteryLevel, 95));
  if (payload.notificationsEnabled !== undefined) {
    updateObj.notifications_enabled = Boolean(payload.notificationsEnabled);
  }
  if (payload.receiverPhone !== undefined) updateObj.receiver_phone = (payload.receiverPhone || '').trim();
  if (payload.receiverName !== undefined) updateObj.receiver_name = (payload.receiverName || '').trim();

  const { error } = await client.from('yape_gateway_status').update(updateObj).eq('id', 'primary');
  if (error) throw new Error(`Error al actualizar estado del validador Yape: ${error.message}`);
  return fetchSupabaseDatabase();
}

export async function cloudSimulateOrRegisterYapePayment({
  senderName,
  amount,
  operationCode = '',
  rawText = ''
}) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase no disponible.');
  const { data, error } = await client.rpc('register_incoming_yape_notification', {
    sender_name: (senderName || '').trim(),
    payment_amount: roundMoney(amount),
    op_code: (operationCode || '').trim(),
    raw_text: (rawText || `Yape! ${(senderName || '').trim()} te envió un pago por S/ ${roundMoney(amount)}`).trim()
  });
  if (error) throw new Error(`Error al registrar notificación Yape: ${error.message}`);
  const freshDb = await fetchSupabaseDatabase();
  return { db: freshDb, matchResult: data };
}

// ============================================================================
// 10. Public Storefront Customer RPCs (Zero-Login Anonymous Access)
// ============================================================================

export async function fetchPublicStorefrontCatalog(fallbackDb = null) {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client.rpc('get_public_storefront_catalog');
      if (!error && data) {
        return data;
      }
    } catch {
      // Fallback to local snapshot if offline
    }
  }

  const source = fallbackDb || loadLocalDb();
  return {
    categories: source.categories || [...PRODUCT_CATEGORIES],
    products: (source.products || [])
      .filter((p) => p.active !== false && p.isVisiblePublic !== false)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        brand: p.brand || '',
        category: p.category,
        unitPrice: p.unitPrice,
        comboRatio: p.comboRatio,
        comboPrice: p.comboPrice,
        hasVariants: p.hasVariants,
        imageUrl: p.imageUrl || '',
        shadesImageUrl: p.shadesImageUrl || p.shades_image_url || '',
        galleryUrls: p.galleryUrls || [],
        publicDescription: p.publicDescription || '',
        isFeatured: Boolean(p.isFeatured),
        variants: (source.variants || [])
          .filter((v) => v.productId === p.id)
          .map((v) => ({
            id: v.id,
            productId: v.productId,
            sku: v.sku,
            shadeName: v.shadeName,
            colorHex: v.colorHex,
            imageUrl: v.imageUrl || v.image_url || '',
            stock: v.stock
          }))
      })),
    combos: (source.combos || [])
      .filter((c) => c.active !== false && c.isVisiblePublic !== false)
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        comboType: c.comboType || 'predefined',
        description: c.description || '',
        publicDescription: c.publicDescription || '',
        imageUrl: c.imageUrl || '',
        isFeatured: Boolean(c.isFeatured),
        items: c.items || []
      })),
    deliveryPoints: (source.deliveryPoints || []).filter((dp) => dp.active !== false),
    deliverySlots: (source.deliverySlots || []).filter(
      (ds) => ds.active !== false && (ds.bookedOrders || 0) < (ds.maxOrders || 10)
    ),
    yapeGateway: source.yapeGateway || {
      isAwake: true,
      lastHeartbeatAt: new Date().toISOString(),
      batteryLevel: 95,
      notificationsEnabled: true,
      receiverPhone: '+51 948 254 832',
      receiverName: 'Fabiana'
    }
  };
}

export async function wakeAndCheckYapeGateway() {
  const client = getSupabaseClient();
  if (!client) {
    return {
      isAwake: true,
      isOnline: true,
      batteryLevel: 95,
      notificationsEnabled: true,
      receiverPhone: '+51 948 254 832',
      receiverName: 'Fabiana',
      checkedAt: new Date().toISOString()
    };
  }
  const { data, error } = await client.rpc('wake_and_check_yape_gateway');
  if (error) {
    return {
      isAwake: true,
      isOnline: true,
      batteryLevel: 95,
      notificationsEnabled: true,
      receiverPhone: '+51 948 254 832',
      receiverName: 'Fabiana',
      checkedAt: new Date().toISOString()
    };
  }
  return data;
}

export function normalizeWebOrderPayload(payload = {}) {
  const buyerName = String(payload.buyerName || payload.customerName || '').trim();
  const buyerWhatsapp = String(payload.buyerWhatsapp || payload.customerWhatsapp || '').trim();
  return {
    ...payload,
    buyerName,
    customerName: buyerName,
    buyerWhatsapp,
    customerWhatsapp: buyerWhatsapp,
    yapeHolderName: String(payload.yapeHolderName || '').trim(),
    notes: String(payload.notes || '').trim()
  };
}

export function normalizeWebOrderResult(data) {
  if (!data || typeof data !== 'object') return data;
  const isVerified = Boolean(
    data.verified ||
      data.isPaid ||
      data.verificationStatus === 'verified_auto' ||
      data.verificationStatus === 'verified_manual'
  );
  const code = data.code || data.saleCode || data.sale_code || '';
  return {
    ...data,
    code,
    saleCode: code,
    verified: isVerified,
    isPaid: isVerified
  };
}

export async function submitWebStorefrontOrder(payload) {
  const client = getSupabaseClient();
  if (!client) throw new Error('No hay conexión con el servidor de pedidos.');
  const normalizedPayload = normalizeWebOrderPayload(payload);
  const { data, error } = await client.rpc('create_web_storefront_order', {
    payload: normalizedPayload
  });
  if (error) {
    throw new Error(error.message || 'No se pudo registrar el pedido.');
  }
  return normalizeWebOrderResult(data);
}

export async function checkWebOrderYapeStatus(saleId) {
  const client = getSupabaseClient();
  if (!client || !saleId) return { verified: false, isPaid: false, status: 'pending_verification' };
  const { data, error } = await client.rpc('check_web_order_yape_status', {
    target_sale_id: saleId
  });
  if (error || !data) return { verified: false, isPaid: false, status: 'pending_verification' };
  return normalizeWebOrderResult(data);
}

