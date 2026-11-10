import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  User,
  Wifi,
  X
} from 'lucide-react';
import { formatMoney } from '../../domain/calculations.js';
import { PRODUCT_CATEGORIES } from '../../domain/constants.js';
import {
  checkWebOrderYapeStatus,
  fetchPublicStorefrontCatalog,
  submitWebStorefrontOrder,
  wakeAndCheckYapeGateway
} from '../../adapters/storageRepository.js';

function getCategoryEmoji(category = '') {
  const c = category.toLowerCase();
  if (c.includes('labio')) return '💄';
  if (c.includes('rubor') || c.includes('iluminador')) return '🌸';
  if (c.includes('rostro') || c.includes('corrector') || c.includes('polvo')) return '✨';
  if (c.includes('ojo') || c.includes('sombra')) return '👁️';
  if (c.includes('delineador')) return '🖋️';
  if (c.includes('ceja') || c.includes('pestañ')) return '🦋';
  if (c.includes('skincare') || c.includes('mascarilla') || c.includes('cuidado')) return '🫧';
  if (c.includes('accesorio') || c.includes('brocha')) return '🎀';
  return '🌷';
}

function getZoneLabel(zoneType = '') {
  switch (zoneType) {
    case 'universidad':
      return '🎓 Campus Universitario';
    case 'estacion_tren':
      return '🚆 Estación de Tren';
    case 'centro_comercial':
      return '🛍️ Centro Comercial';
    default:
      return '📍 Punto de Encuentro';
  }
}

const STOREFRONT_CACHE_KEY = 'glow_with_pipo_public_catalog_cache_v2';

function buildCatalogFromDb(source) {
  if (!source) return null;
  const rawProducts = Array.isArray(source.products) ? source.products : [];
  if (rawProducts.length === 0) return null;

  const variants = Array.isArray(source.variants) ? source.variants : [];
  const variantsByProd = new Map();
  for (const v of variants) {
    const arr = variantsByProd.get(v.productId) || [];
    arr.push(v);
    variantsByProd.set(v.productId, arr);
  }

  const productsWithVariants = rawProducts
    .filter((p) => p.active !== false && p.isVisiblePublic !== false)
    .map((p) => {
      const vList = (p.variants && p.variants.length > 0 ? p.variants : (variantsByProd.get(p.id) || [])).map((v) => ({
        ...v,
        imageUrl: v.imageUrl || v.image_url || ''
      }));
      return {
        ...p,
        shadesImageUrl: p.shadesImageUrl || p.shades_image_url || '',
        unitPrice: Number(p.unitPrice || 0),
        comboPrice: Number(p.comboPrice || p.unitPrice || 0),
        variants: vList
      };
    });

  const combos = (source.combos || [])
    .filter((c) => c.active !== false && c.isVisiblePublic !== false)
    .map((c) => ({
      ...c,
      comboType: c.comboType || 'predefined',
      items: c.items || []
    }));

  const deliveryPoints = (source.deliveryPoints || []).filter((dp) => dp.active !== false);
  const deliverySlots =
    source.deliverySlots && source.deliverySlots.length > 0
      ? source.deliverySlots
      : deliveryPoints.flatMap((pt) =>
          (pt.slots || []).map((sl) => ({ ...sl, deliveryPointId: pt.id }))
        );

  return {
    categories:
      source.categories && source.categories.length > 0
        ? source.categories
        : [...PRODUCT_CATEGORIES],
    products: productsWithVariants,
    combos,
    deliveryPoints,
    deliverySlots,
    yapeGateway: source.yapeGateway || null
  };
}

function StorefrontProductImage({
  src,
  alt,
  className = 'pipo-product-img',
  fallbackEmoji = '💄',
  fallbackBrand = 'GLOW WITH PIPO'
}) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div className="pipo-product-placeholder">
        <span className="pipo-placeholder-emoji">{fallbackEmoji}</span>
        <span className="pipo-placeholder-brand">{fallbackBrand}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {!loaded && (
        <div
          className="pipo-skeleton-shimmer"
          style={{ position: 'absolute', inset: 0, zIndex: 1 }}
        />
      )}
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setHasError(true)}
        style={{
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.28s ease-in-out',
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
    </div>
  );
}

function StorefrontSkeletonGrid() {
  return (
    <div className="pipo-products-grid" aria-label="Cargando productos...">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
        <article key={n} className="pipo-product-card pipo-skeleton-card">
          <div className="pipo-product-visual pipo-skeleton-shimmer" />
          <div
            className="pipo-product-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}
          >
            <div
              className="pipo-skeleton-shimmer"
              style={{ width: '40%', height: 12, borderRadius: 6 }}
            />
            <div
              className="pipo-skeleton-shimmer"
              style={{ width: '85%', height: 16, borderRadius: 6 }}
            />
            <div style={{ display: 'flex', gap: 6, margin: '4px 0' }}>
              <div
                className="pipo-skeleton-shimmer"
                style={{ width: 16, height: 16, borderRadius: '50%' }}
              />
              <div
                className="pipo-skeleton-shimmer"
                style={{ width: 16, height: 16, borderRadius: '50%' }}
              />
              <div
                className="pipo-skeleton-shimmer"
                style={{ width: 16, height: 16, borderRadius: '50%' }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8
              }}
            >
              <div
                className="pipo-skeleton-shimmer"
                style={{ width: '35%', height: 20, borderRadius: 8 }}
              />
              <div
                className="pipo-skeleton-shimmer"
                style={{ width: '45%', height: 32, borderRadius: 16 }}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function StorefrontView({
  fallbackDb,
  isStaffLoggedIn = false,
  onOpenStaffLogin,
  onReturnToErp
}) {
  const [catalog, setCatalog] = useState(() => {
    // 1. Intentar desde fallbackDb (inmediato si el usuario navega desde el ERP o ya cargó la app)
    const fromFallback = buildCatalogFromDb(fallbackDb);
    if (fromFallback && fromFallback.products.length > 0) return fromFallback;

    // 2. Intentar desde localStorage (instantáneo para clientes que reingresan a la web)
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STOREFRONT_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }

    return {
      categories: [...PRODUCT_CATEGORIES],
      products: [],
      combos: [],
      deliveryPoints: [],
      deliverySlots: [],
      yapeGateway: null
    };
  });

  // Solo mostrar skeleton loader si el catálogo está completamente vacío (primer ingreso limpio)
  const [loadingCatalog, setLoadingCatalog] = useState(() => {
    return catalog.products.length === 0;
  });
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState({});
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [justAddedKey, setJustAddedKey] = useState(null);

  // Customizable Combo Shade Picker Modal
  const [customizingCombo, setCustomizingCombo] = useState(null);
  const [comboShadeChoices, setComboShadeChoices] = useState({});

  // Product & Combo Expanded Detail Modal State
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailCombo, setDetailCombo] = useState(null);
  const [detailActiveShadeId, setDetailActiveShadeId] = useState('');
  const [detailShadeViewMode, setDetailShadeViewMode] = useState('active'); // 'active' | 'all'
  const [detailQty, setDetailQty] = useState(1);
  const [detailComboShadeChoices, setDetailComboShadeChoices] = useState({});

  // Checkout Modal State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState('form'); // 'form' | 'payment' | 'verified'
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [yapeHolderName, setYapeHolderName] = useState('');
  const [selectedPointId, setSelectedPointId] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Wake-on-Checkout & Pre-Flight Health Check State
  const [gatewayHealth, setGatewayHealth] = useState(null);
  const [checkingGateway, setCheckingGateway] = useState(false);

  // Active Created Order & Yape Polling State
  const [activeOrder, setActiveOrder] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [manualCheckHint, setManualCheckHint] = useState('');
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Lock body scroll when modal, detail view or cart drawer is open
  useEffect(() => {
    if (checkoutOpen || customizingCombo || isCartOpen || detailProduct || detailCombo) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [checkoutOpen, customizingCombo, isCartOpen, detailProduct, detailCombo]);

  const loadStorefront = useCallback(async () => {
    // Si ya hay productos visibles en pantalla, revalida silenciosamente en background sin bloquear
    if (catalog.products.length === 0) {
      setLoadingCatalog(true);
    }
    try {
      const data = await fetchPublicStorefrontCatalog(fallbackDb);
      if (!data) return;

      const variantsByProd = new Map();
      for (const v of data.variants || []) {
        const arr = variantsByProd.get(v.productId) || [];
        arr.push({
          ...v,
          imageUrl: v.imageUrl || v.image_url || ''
        });
        variantsByProd.set(v.productId, arr);
      }
      const productsWithVariants = (data.products || []).map((p) => {
        const vList = (p.variants && p.variants.length > 0 ? p.variants : (variantsByProd.get(p.id) || [])).map((v) => ({
          ...v,
          imageUrl: v.imageUrl || v.image_url || ''
        }));
        return {
          ...p,
          shadesImageUrl: p.shadesImageUrl || p.shades_image_url || '',
          variants: vList
        };
      });

      // Extract delivery slots either from flat list or from each delivery point's nested slots
      const points = data.deliveryPoints || [];
      const extractedSlots =
        data.deliverySlots && data.deliverySlots.length > 0
          ? data.deliverySlots
          : points.flatMap((pt) =>
              (pt.slots || []).map((sl) => ({ ...sl, deliveryPointId: pt.id }))
            );

      const normalizedCatalog = {
        ...data,
        products: productsWithVariants,
        deliveryPoints: points,
        deliverySlots: extractedSlots
      };

      setCatalog(normalizedCatalog);

      // Guardar en caché local para próximas visitas instantáneas a 0ms
      if (typeof localStorage !== 'undefined' && productsWithVariants.length > 0) {
        try {
          localStorage.setItem(STOREFRONT_CACHE_KEY, JSON.stringify(normalizedCatalog));
        } catch {}
      }

      const initialVariants = {};
      for (const prod of productsWithVariants) {
        const availableVar =
          (prod.variants || []).find((v) => v.stock > 0) || (prod.variants || [])[0];
        if (availableVar) {
          initialVariants[prod.id] = availableVar.id;
        }
      }
      setSelectedVariantByProduct((prev) => ({ ...initialVariants, ...prev }));
      if (points.length > 0) {
        setSelectedPointId((prev) => prev || points[0].id);
      }
    } finally {
      setLoadingCatalog(false);
    }
  }, [catalog.products.length]);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  // Sincronizar suavemente si fallbackDb cambia desde el ERP sin parpadear la interfaz
  const prevFallbackCount = useRef((fallbackDb?.products || []).length);
  useEffect(() => {
    if (fallbackDb && Array.isArray(fallbackDb.products) && fallbackDb.products.length > 0) {
      const currentCount = fallbackDb.products.length;
      if (currentCount !== prevFallbackCount.current) {
        prevFallbackCount.current = currentCount;
        const fromDb = buildCatalogFromDb(fallbackDb);
        if (fromDb && fromDb.products.length > 0) {
          setCatalog(fromDb);
          setLoadingCatalog(false);
        }
      }
    }
  }, [fallbackDb]);

  // Wake-on-Checkout: only wake up the phone detector when the customer opens Checkout
  useEffect(() => {
    if (!checkoutOpen) return;
    let mounted = true;
    setCheckingGateway(true);
    wakeAndCheckYapeGateway()
      .then((health) => {
        if (mounted) setGatewayHealth(health);
      })
      .finally(() => {
        if (mounted) setCheckingGateway(false);
      });
    return () => {
      mounted = false;
    };
  }, [checkoutOpen]);

  // Poll Yape Verification every 4 seconds while waiting in Step 'payment'
  useEffect(() => {
    if (!checkoutOpen || checkoutStep !== 'payment' || !activeOrder?.saleId) return;
    let mounted = true;
    const interval = setInterval(async () => {
      const res = await checkWebOrderYapeStatus(activeOrder.saleId);
      if (mounted && res?.verified) {
        setActiveOrder((prev) => ({ ...prev, ...res, verified: true }));
        setCheckoutStep('verified');
        setCart([]);
        loadStorefront();
      }
    }, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [checkoutOpen, checkoutStep, activeOrder?.saleId, loadStorefront]);

  const productsById = useMemo(
    () => new Map((catalog.products || []).map((p) => [p.id, p])),
    [catalog.products]
  );

  const allVariantsById = useMemo(() => {
    const map = new Map();
    for (const p of catalog.products || []) {
      for (const v of p.variants || []) {
        map.set(v.id, { ...v, product: p });
      }
    }
    return map;
  }, [catalog.products]);

  const availableCategories = useMemo(() => {
    const prodCats = new Set((catalog.products || []).map((p) => p.category).filter(Boolean));
    const ordered = (catalog.categories || []).filter((c) => prodCats.has(c));
    for (const c of prodCats) {
      if (!ordered.includes(c)) ordered.push(c);
    }
    return ordered;
  }, [catalog.categories, catalog.products]);

  const filteredProducts = useMemo(() => {
    if (activeCategory === 'COMBOS') return [];
    const q = searchQuery.trim().toLowerCase();
    return (catalog.products || []).filter((p) => {
      const totalStock = (p.variants || []).reduce((acc, v) => acc + (v.stock || 0), 0);
      if (totalStock <= 0) return false;
      if (activeCategory !== 'ALL' && p.category !== activeCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.publicDescription || '').toLowerCase().includes(q)
      );
    });
  }, [catalog.products, activeCategory, searchQuery]);

  const filteredCombos = useMemo(() => {
    if (activeCategory !== 'ALL' && activeCategory !== 'COMBOS') return [];
    const q = searchQuery.trim().toLowerCase();
    return (catalog.combos || []).filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.publicDescription || '').toLowerCase().includes(q)
      );
    });
  }, [catalog.combos, activeCategory, searchQuery]);

  const availableSlotsForPoint = useMemo(() => {
    return (catalog.deliverySlots || []).filter(
      (ds) => ds.deliveryPointId === selectedPointId && ds.active !== false
    );
  }, [catalog.deliverySlots, selectedPointId]);

  useEffect(() => {
    if (availableSlotsForPoint.length > 0) {
      const exists = availableSlotsForPoint.some((s) => s.id === selectedSlotId);
      if (!exists) setSelectedSlotId(availableSlotsForPoint[0].id);
    } else {
      setSelectedSlotId('');
    }
  }, [availableSlotsForPoint, selectedSlotId]);

  function addVariantToCart({
    variantId,
    quantity = 1,
    appliedUnitPrice,
    pricingMode = 'unit',
    sourceComboId = null,
    sourceComboName = ''
  }) {
    const varData = allVariantsById.get(variantId);
    if (!varData || varData.stock <= 0) return;

    setCart((prev) => {
      const key = `${variantId}__${pricingMode}__${sourceComboId || 'unit'}`;
      const existingIdx = prev.findIndex((item) => item.cartKey === key);
      const currentTotalForVariant = prev
        .filter((i) => i.variantId === variantId)
        .reduce((acc, i) => acc + i.quantity, 0);

      const allowedAdd = Math.max(0, varData.stock - currentTotalForVariant);
      if (allowedAdd <= 0) return prev;
      const addQty = Math.min(quantity, allowedAdd);

      if (existingIdx >= 0) {
        const clone = [...prev];
        clone[existingIdx] = {
          ...clone[existingIdx],
          quantity: clone[existingIdx].quantity + addQty
        };
        return clone;
      }

      return [
        ...prev,
        {
          cartKey: key,
          variantId,
          productId: varData.product.id,
          productName: varData.product.name,
          category: varData.product.category,
          imageUrl: varData.product.imageUrl || '',
          shadeName: varData.shadeName || 'Único',
          colorHex: varData.colorHex || null,
          maxStock: varData.stock,
          quantity: addQty,
          appliedUnitPrice: Number(appliedUnitPrice ?? varData.product.unitPrice),
          pricingMode,
          sourceComboId,
          sourceComboName
        }
      ];
    });
  }

  function handleAddProductCard(product) {
    const chosenVarId =
      selectedVariantByProduct[product.id] ||
      (product.variants || []).find((v) => v.stock > 0)?.id;
    if (!chosenVarId) return;

    addVariantToCart({
      variantId: chosenVarId,
      quantity: 1,
      appliedUnitPrice: product.unitPrice,
      pricingMode: 'unit'
    });

    setJustAddedKey(`prod-${product.id}`);
    setTimeout(() => setJustAddedKey(null), 1100);
  }

  function computeComboPriceAndStock(combo) {
    let totalComboPrice = 0;
    let totalCatalogPrice = 0;
    let isAvailable = true;
    const detailedItems = [];

    for (const item of combo.items || []) {
      const prod = productsById.get(item.productId);
      if (!prod) {
        isAvailable = false;
        continue;
      }
      const qty = Math.max(1, Number(item.quantity || 1));
      const unitComboPrice =
        item.customComboUnitPrice !== null && item.customComboUnitPrice !== undefined
          ? Number(item.customComboUnitPrice)
          : Number(prod.comboPrice || prod.unitPrice);

      totalComboPrice += unitComboPrice * qty;
      totalCatalogPrice += Number(prod.unitPrice) * qty;

      const availableVariants = (prod.variants || []).filter((v) => v.stock >= qty);
      if (combo.comboType === 'predefined' && item.variantId) {
        const specificVar = (prod.variants || []).find((v) => v.id === item.variantId);
        if (!specificVar || specificVar.stock < qty) isAvailable = false;
        detailedItems.push({
          ...item,
          product: prod,
          unitComboPrice,
          fixedVariant: specificVar || null,
          availableVariants
        });
      } else {
        if (availableVariants.length === 0) isAvailable = false;
        detailedItems.push({
          ...item,
          product: prod,
          unitComboPrice,
          fixedVariant: null,
          availableVariants
        });
      }
    }

    return {
      totalComboPrice: Math.round(totalComboPrice * 100) / 100,
      totalCatalogPrice: Math.round(totalCatalogPrice * 100) / 100,
      savings: Math.max(0, Math.round((totalCatalogPrice - totalComboPrice) * 100) / 100),
      isAvailable: isAvailable && detailedItems.length > 0,
      detailedItems
    };
  }

  function handleAddComboClicked(combo, comboMeta) {
    if (!comboMeta.isAvailable) return;

    const needsPicker = comboMeta.detailedItems.some(
      (di) => !di.fixedVariant && di.availableVariants.length > 1
    );

    if (combo.comboType === 'customizable' || needsPicker) {
      const initialChoices = {};
      comboMeta.detailedItems.forEach((di, idx) => {
        initialChoices[idx] =
          di.fixedVariant?.id || di.availableVariants[0]?.id || '';
      });
      setComboShadeChoices(initialChoices);
      setCustomizingCombo({ combo, comboMeta });
      return;
    }

    // Direct add for predefined combos
    comboMeta.detailedItems.forEach((di) => {
      const targetVarId = di.fixedVariant?.id || di.availableVariants[0]?.id;
      if (targetVarId) {
        addVariantToCart({
          variantId: targetVarId,
          quantity: di.quantity,
          appliedUnitPrice: di.unitComboPrice,
          pricingMode: 'combo',
          sourceComboId: combo.id,
          sourceComboName: combo.name
        });
      }
    });

    setJustAddedKey(`combo-${combo.id}`);
    setTimeout(() => setJustAddedKey(null), 1100);
  }

  function confirmCustomizableComboAdd() {
    if (!customizingCombo) return;
    const { combo, comboMeta } = customizingCombo;
    comboMeta.detailedItems.forEach((di, idx) => {
      const chosenVarId = comboShadeChoices[idx] || di.availableVariants[0]?.id;
      if (chosenVarId) {
        addVariantToCart({
          variantId: chosenVarId,
          quantity: di.quantity,
          appliedUnitPrice: di.unitComboPrice,
          pricingMode: 'combo',
          sourceComboId: combo.id,
          sourceComboName: combo.name
        });
      }
    });
    setJustAddedKey(`combo-${combo.id}`);
    setTimeout(() => setJustAddedKey(null), 1100);
    setCustomizingCombo(null);
    setIsCartOpen(true);
  }

  function openProductDetail(product) {
    const variants = product.variants || [];
    const currentSelectedId =
      selectedVariantByProduct[product.id] ||
      variants.find((v) => v.stock > 0)?.id ||
      variants[0]?.id ||
      '';
    const activeVar = variants.find((v) => v.id === currentSelectedId) || variants[0];
    setDetailProduct(product);
    setDetailActiveShadeId(currentSelectedId);
    if (activeVar?.imageUrl) {
      setDetailShadeViewMode('active');
    } else if (product.shadesImageUrl) {
      setDetailShadeViewMode('all');
    } else {
      setDetailShadeViewMode('active');
    }
    setDetailQty(1);
  }

  function closeProductDetail() {
    setDetailProduct(null);
  }

  function openComboDetail(combo, comboMeta) {
    setDetailCombo({ combo, comboMeta });
    const initialChoices = {};
    (comboMeta?.detailedItems || []).forEach((di, idx) => {
      initialChoices[idx] = di.fixedVariant?.id || di.availableVariants[0]?.id || '';
    });
    setDetailComboShadeChoices(initialChoices);
    setDetailQty(1);
  }

  function closeComboDetail() {
    setDetailCombo(null);
  }

  function handleAddDetailProductToCart(buyNow = false) {
    if (!detailProduct) return;
    const variants = detailProduct.variants || [];
    const activeVar = variants.find((v) => v.id === detailActiveShadeId) || variants[0];
    if (!activeVar || activeVar.stock <= 0) return;

    addVariantToCart({
      variantId: activeVar.id,
      quantity: Math.min(detailQty, activeVar.stock),
      appliedUnitPrice: detailProduct.unitPrice,
      pricingMode: 'individual'
    });

    setJustAddedKey(`prod-${detailProduct.id}`);
    setTimeout(() => setJustAddedKey(null), 1100);

    if (buyNow) {
      setDetailProduct(null);
      setIsCartOpen(false);
      openCheckoutFlow();
    } else {
      setDetailProduct(null);
      setIsCartOpen(true);
    }
  }

  function handleAddDetailComboToCart(buyNow = false) {
    if (!detailCombo) return;
    const { combo, comboMeta } = detailCombo;
    if (!comboMeta.isAvailable) return;

    comboMeta.detailedItems.forEach((di, idx) => {
      const chosenVarId =
        detailComboShadeChoices[idx] || di.fixedVariant?.id || di.availableVariants[0]?.id;
      if (chosenVarId) {
        addVariantToCart({
          variantId: chosenVarId,
          quantity: di.quantity * Math.max(1, detailQty),
          appliedUnitPrice: di.unitComboPrice,
          pricingMode: 'combo',
          sourceComboId: combo.id,
          sourceComboName: combo.name
        });
      }
    });

    setJustAddedKey(`combo-${combo.id}`);
    setTimeout(() => setJustAddedKey(null), 1100);

    if (buyNow) {
      setDetailCombo(null);
      setIsCartOpen(false);
      openCheckoutFlow();
    } else {
      setDetailCombo(null);
      setIsCartOpen(true);
    }
  }

  function updateCartItemQty(cartKey, delta) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartKey !== cartKey) return item;
          const nextQty = Math.min(item.maxStock, item.quantity + delta);
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        })
        .filter(Boolean)
    );
  }

  const cartSummary = useMemo(() => {
    const totalUnits = cart.reduce((acc, i) => acc + i.quantity, 0);
    const subtotal =
      Math.round(cart.reduce((acc, i) => acc + i.quantity * i.appliedUnitPrice, 0) * 100) / 100;
    return { totalUnits, subtotal };
  }, [cart]);

  function openCheckoutFlow() {
    if (cart.length === 0) return;
    setIsCartOpen(false);
    setCheckoutError('');
    setManualCheckHint('');
    setCheckoutStep('form');
    setCheckoutOpen(true);
  }

  async function handleCreateWebOrder(e) {
    e.preventDefault();
    setCheckoutError('');

    if (!customerName.trim()) {
      setCheckoutError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!customerWhatsapp.trim() || customerWhatsapp.replace(/\D/g, '').length < 9) {
      setCheckoutError('Ingresa un número de WhatsApp válido (mínimo 9 dígitos).');
      return;
    }
    if (!yapeHolderName.trim() || yapeHolderName.trim().split(/\s+/).length < 2) {
      setCheckoutError(
        'Ingresa el nombre y apellido completos del titular de la cuenta Yape desde donde realizarás el pago.'
      );
      return;
    }
    if (!selectedPointId) {
      setCheckoutError('Selecciona un punto de entrega disponible.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const orderRes = await submitWebStorefrontOrder({
        customerName: customerName.trim(),
        customerWhatsapp: customerWhatsapp.trim(),
        yapeHolderName: yapeHolderName.trim(),
        deliveryPointId: selectedPointId,
        deliverySlotId: selectedSlotId || null,
        notes: orderNotes.trim(),
        items: cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          appliedUnitPrice: item.appliedUnitPrice,
          pricingMode: item.pricingMode,
          sourceComboId: item.sourceComboId,
          sourceComboName: item.sourceComboName
        }))
      });

      setActiveOrder(orderRes);
      if (orderRes?.verified) {
        setCheckoutStep('verified');
        setCart([]);
        loadStorefront();
      } else {
        setCheckoutStep('payment');
      }
    } catch (err) {
      setCheckoutError(err.message || 'No se pudo procesar el pedido.');
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handleManualCheckYapeNow() {
    if (!activeOrder?.saleId) return;
    setCheckingPayment(true);
    setManualCheckHint('');
    try {
      const res = await checkWebOrderYapeStatus(activeOrder.saleId);
      if (res?.verified) {
        setActiveOrder((prev) => ({ ...prev, ...res, verified: true }));
        setCheckoutStep('verified');
        setCart([]);
        loadStorefront();
      } else {
        setManualCheckHint(
          'Aún no llega la confirmación automática al sistema. Si ya realizaste el Yape, presiona "Avisar por WhatsApp" para enviar tu constancia y confirmar tu pedido al instante.'
        );
      }
    } finally {
      setCheckingPayment(false);
    }
  }

  const receiverPhone =
    gatewayHealth?.receiverPhone ||
    catalog.yapeGateway?.receiverPhone ||
    '+51 948 254 832';
  const cleanYapeDigits = receiverPhone.replace(/\D/g, '').replace(/^51/, '');

  function handleCopyPhone() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cleanYapeDigits);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  }

  return (
    <div className="pipo-storefront">
      {/* Top Staff Return Bar if Adrián or Fabiana are viewing the storefront */}
      {isStaffLoggedIn && (
        <div className="pipo-staff-floating-bar">
          <div className="pipo-staff-bar-inner">
            <span>
              ✨ Estás viendo la <strong>Tienda Pública de Clientes</strong> en tiempo real
            </span>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                background: '#fffdf9',
                color: 'var(--pipo-burgundy)',
                fontWeight: 800,
                padding: '5px 14px'
              }}
              onClick={onReturnToErp}
            >
              <ArrowLeft size={14} /> Volver al Panel ERP
            </button>
          </div>
        </div>
      )}

      {/* Sticky Coquette Navbar */}
      <header className="pipo-store-navbar">
        <div className="pipo-store-navbar-inner">
          <div className="pipo-store-brand" onClick={() => setActiveCategory('ALL')}>
            <img
              src={`${import.meta.env.BASE_URL || './'}icon-192.png`}
              alt="Glow with Pipo"
              className="pipo-store-logo"
            />
            <div>
              <span className="pipo-store-title">
                GLOW <em>with pipo</em>
              </span>
              <span className="pipo-store-subtitle">Maquillaje &amp; Skincare Coquette</span>
            </div>
          </div>

          <nav className="pipo-store-navlinks">
            <button
              type="button"
              className={`pipo-store-navlink ${activeCategory === 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveCategory('ALL')}
            >
              Catálogo
            </button>
            <button
              type="button"
              className={`pipo-store-navlink ${activeCategory === 'COMBOS' ? 'active' : ''}`}
              onClick={() => setActiveCategory('COMBOS')}
            >
              ✨ Combos Pipo
            </button>
            <a href="#puntos-entrega" className="pipo-store-navlink">
              📍 Puntos de Entrega
            </a>
          </nav>

          <div className="pipo-store-actions">
            {!isStaffLoggedIn && (
              <button
                type="button"
                className="pipo-staff-access-btn"
                onClick={onOpenStaffLogin}
                title="Acceso administrativo para Adrián y Fabiana"
              >
                <Lock size={13} />
                <span>Staff</span>
              </button>
            )}

            <button
              type="button"
              className="pipo-cart-trigger-btn"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag size={18} />
              <span>Mi Bolsita</span>
              {cartSummary.totalUnits > 0 && (
                <span className="pipo-cart-count-pill">{cartSummary.totalUnits}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Coquette Hero Section */}
      <section className="pipo-store-hero pipo-stripes">
        <div className="pipo-store-hero-inner">
          <div className="pipo-hero-badge">
            <Sparkles size={14} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Tienda Oficial · Stock en Vivo · Pago con
              <img
                src={`${import.meta.env.BASE_URL}yape-logo.png`}
                alt="Yape"
                className="pipo-yape-badge-img"
              />
              Instantáneo
            </span>
          </div>
          <h1 className="pipo-hero-heading">
            Tu rincón favorito de belleza <em>Glow with Pipo</em> 🎀
          </h1>
          <p className="pipo-hero-lead">
            Elige tus tonos favoritos y combos especiales sin crear cuentas ni contraseñas.
            Coordinamos tu entrega en <strong>UNAC, estaciones del tren o puntos acordados</strong>.
          </p>

          {/* Search & Category Filter Bar */}
          <div className="pipo-store-search-wrap">
            <Search size={18} className="pipo-store-search-icon" />
            <input
              type="text"
              placeholder="Buscar labiales, rubores, tonos o combos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pipo-store-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="pipo-store-search-clear"
                onClick={() => setSearchQuery('')}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Storefront Content */}
      <main className="pipo-store-main">
        {/* Category Pills Carousel */}
        <div className="pipo-store-categories" data-no-swipe="true">
          <button
            type="button"
            className={`pipo-cat-pill ${activeCategory === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveCategory('ALL')}
          >
            🌸 Todos {catalog.products?.length ? `(${catalog.products.length})` : ''}
          </button>
          {(catalog.combos || []).length > 0 && (
            <button
              type="button"
              className={`pipo-cat-pill combo-pill ${activeCategory === 'COMBOS' ? 'active' : ''}`}
              onClick={() => setActiveCategory('COMBOS')}
            >
              ✨ Combos Especiales ({(catalog.combos || []).length})
            </button>
          )}
          {availableCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`pipo-cat-pill ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              <span>{getCategoryEmoji(cat)}</span>
              <span>{cat}</span>
            </button>
          ))}
        </div>

        {loadingCatalog ? (
          <StorefrontSkeletonGrid />
        ) : (
          <>
            {/* Combos Section */}
            {filteredCombos.length > 0 && (
              <section className="pipo-store-section">
                <div className="pipo-store-section-header">
                  <div>
                    <span className="pipo-section-eyebrow">✨ Ahorra armando tu pack</span>
                    <h2 className="pipo-section-title">Combos Glow with Pipo</h2>
                  </div>
                </div>

                <div className="pipo-combos-grid">
                  {filteredCombos.map((combo) => {
                    const comboMeta = computeComboPriceAndStock(combo);
                    const isAdded = justAddedKey === `combo-${combo.id}`;
                    return (
                      <article
                        key={combo.id}
                        className={`pipo-combo-card ${!comboMeta.isAvailable ? 'out-of-stock' : ''}`}
                      >
                        <div
                          className="pipo-combo-visual"
                          onClick={() => openComboDetail(combo, comboMeta)}
                          title="Clic para ver detalles del combo"
                        >
                          <StorefrontProductImage
                            src={combo.imageUrl}
                            alt={combo.name}
                            fallbackEmoji="🎁✨"
                            fallbackBrand="COMBO PIPO"
                          />
                          <span className="pipo-combo-type-tag">
                            {combo.comboType === 'customizable'
                              ? '🎨 Elige tus tonos'
                              : '🎀 Pack Listo'}
                          </span>
                          {comboMeta.savings > 0 && (
                            <span className="pipo-combo-save-tag">
                              Ahorras {formatMoney(comboMeta.savings)}
                            </span>
                          )}
                        </div>

                        <div className="pipo-combo-body">
                          <h3
                            className="pipo-product-title pipo-product-title-clickable"
                            onClick={() => openComboDetail(combo, comboMeta)}
                            title="Clic para ver detalles del combo"
                          >
                            {combo.name}
                          </h3>
                          {(combo.publicDescription || combo.description) && (
                            <p className="pipo-product-desc">
                              {combo.publicDescription || combo.description}
                            </p>
                          )}

                          <ul className="pipo-combo-items-list">
                            {comboMeta.detailedItems.map((di, idx) => (
                              <li key={idx}>
                                <strong>{di.quantity}x</strong> {di.product?.name || 'Producto'}
                                {di.fixedVariant && di.fixedVariant.shadeName !== 'Único' && (
                                  <span className="pipo-combo-fixed-shade">
                                    ({di.fixedVariant.shadeName})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>

                          <div className="pipo-card-detail-action">
                            <button
                              type="button"
                              className="pipo-card-detail-btn"
                              onClick={() => openComboDetail(combo, comboMeta)}
                            >
                              ✨ Ver detalles del pack
                            </button>
                          </div>

                          <div className="pipo-product-footer">
                            <div>
                              {comboMeta.savings > 0 && (
                                <span className="pipo-price-old">
                                  {formatMoney(comboMeta.totalCatalogPrice)}
                                </span>
                              )}
                              <div className="pipo-price-current">
                                {formatMoney(comboMeta.totalComboPrice)}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={!comboMeta.isAvailable}
                              className={`btn ${isAdded ? 'btn-success' : 'btn-primary'} pipo-add-btn`}
                              onClick={() => handleAddComboClicked(combo, comboMeta)}
                            >
                              {isAdded ? (
                                <>
                                  <CheckCircle2 size={16} /> ¡Agregado!
                                </>
                              ) : combo.comboType === 'customizable' ? (
                                <>
                                  <Sparkles size={16} /> Elegir Tonos
                                </>
                              ) : (
                                <>
                                  <Plus size={16} /> Lo quiero
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Individual Products Section */}
            {activeCategory !== 'COMBOS' && (
              <section className="pipo-store-section">
                <div className="pipo-store-section-header">
                  <div>
                    <span className="pipo-section-eyebrow">🌸 Stock actualizado al instante</span>
                    <h2 className="pipo-section-title">
                      {activeCategory === 'ALL' ? 'Catálogo de Productos' : activeCategory}
                    </h2>
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="pipo-empty-catalog">
                    <Sparkles size={28} color="var(--pipo-petal)" />
                    <h3>No encontramos productos con ese filtro</h3>
                    <p>Prueba seleccionando otra categoría o limpiando el buscador.</p>
                  </div>
                ) : (
                  <div className="pipo-products-grid">
                    {filteredProducts.map((product) => {
                      const variants = product.variants || [];
                      const selectedVarId =
                        selectedVariantByProduct[product.id] ||
                        variants.find((v) => v.stock > 0)?.id ||
                        variants[0]?.id;
                      const activeVar =
                        variants.find((v) => v.id === selectedVarId) || variants[0];
                      const isAdded = justAddedKey === `prod-${product.id}`;
                      const showShadeSelector =
                        variants.length > 1 ||
                        (variants.length === 1 &&
                          (variants[0].shadeName !== 'Único' || Boolean(variants[0].colorHex)));

                      return (
                        <article key={product.id} className="pipo-product-card">
                          <div
                            className="pipo-product-visual"
                            onClick={() => openProductDetail(product)}
                            title="Clic para ver detalles y fotos de tonos"
                          >
                            <StorefrontProductImage
                              src={product.imageUrl}
                              alt={product.name}
                              fallbackEmoji={getCategoryEmoji(product.category)}
                              fallbackBrand={product.brand || 'GLOW WITH PIPO'}
                            />

                            <span className="pipo-product-cat-badge">{product.category}</span>
                            {product.isFeatured && (
                              <span className="pipo-product-featured-badge">⭐ Favorito</span>
                            )}
                          </div>

                          <div className="pipo-product-body">
                            {product.brand && (
                              <div className="pipo-product-brand">{product.brand}</div>
                            )}
                            <h3
                              className="pipo-product-title pipo-product-title-clickable"
                              onClick={() => openProductDetail(product)}
                              title="Clic para ver detalles y fotos de tonos"
                            >
                              {product.name}
                            </h3>
                            {product.publicDescription && (
                              <p className="pipo-product-desc">{product.publicDescription}</p>
                            )}

                            {showShadeSelector && (
                              <div className="pipo-shades-block">
                                <div className="pipo-shades-label">
                                  <span>
                                    Tono:{' '}
                                    <strong>{activeVar?.shadeName || 'Selecciona'}</strong>
                                  </span>
                                  <span className="pipo-stock-indicator">
                                    {activeVar?.stock > 0
                                      ? `${activeVar.stock} disp.`
                                      : 'Agotado'}
                                  </span>
                                </div>
                                <div className="pipo-shades-pills">
                                  {variants.map((v) => {
                                    const isSelected = v.id === activeVar?.id;
                                    const out = v.stock <= 0;
                                    return (
                                      <button
                                        key={v.id}
                                        type="button"
                                        disabled={out}
                                        onClick={() =>
                                          setSelectedVariantByProduct((prev) => ({
                                            ...prev,
                                            [product.id]: v.id
                                          }))
                                        }
                                        className={`pipo-shade-pill ${isSelected ? 'selected' : ''} ${out ? 'disabled' : ''}`}
                                        title={
                                          out
                                            ? `${v.shadeName} (Agotado)`
                                            : `${v.shadeName} (${v.stock} disponibles)`
                                        }
                                      >
                                        {v.colorHex && (
                                          <span
                                            className="pipo-shade-swatch"
                                            style={{ backgroundColor: v.colorHex }}
                                          />
                                        )}
                                        <span>{v.shadeName}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {!showShadeSelector && activeVar && (
                              <div className="pipo-single-stock-line">
                                <span className="pipo-stock-dot" />
                                <span>{activeVar.stock} unidades disponibles para entrega</span>
                              </div>
                            )}

                            <div className="pipo-card-detail-action">
                              <button
                                type="button"
                                className="pipo-card-detail-btn"
                                onClick={() => openProductDetail(product)}
                              >
                                ✨ Ver detalles y fotos de tonos
                              </button>
                            </div>

                            <div className="pipo-product-footer">
                              <div>
                                <div className="pipo-price-current">
                                  {formatMoney(product.unitPrice)}
                                </div>
                                {product.comboPrice > 0 &&
                                  product.comboPrice < product.unitPrice && (
                                    <div className="pipo-price-combo-hint">
                                      En combo: {formatMoney(product.comboPrice)}
                                    </div>
                                  )}
                              </div>

                              <button
                                type="button"
                                disabled={!activeVar || activeVar.stock <= 0}
                                className={`btn ${isAdded ? 'btn-success' : 'btn-primary'} pipo-add-btn`}
                                onClick={() => handleAddProductCard(product)}
                              >
                                {isAdded ? (
                                  <>
                                    <CheckCircle2 size={16} /> ¡Listo!
                                  </>
                                ) : (
                                  <>
                                    <ShoppingBag size={15} /> Agregar
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* Delivery Points Informational Showcase */}
        <section id="puntos-entrega" className="pipo-delivery-showcase">
          <div className="pipo-store-section-header">
            <div>
              <span className="pipo-section-eyebrow">📍 Entregas seguras y puntuales</span>
              <h2 className="pipo-section-title">Puntos Oficiales de Entrega</h2>
              <p className="pipo-section-sub">
                Todas nuestras entregas se realizan en puntos acordados (universidad, estaciones de
                tren o centros comerciales). Al finalizar tu pedido podrás elegir el lugar y horario
                disponible.
              </p>
            </div>
          </div>

          <div className="pipo-points-grid">
            {(catalog.deliveryPoints || []).map((pt) => {
              const ptSlots = (catalog.deliverySlots || []).filter(
                (s) => s.deliveryPointId === pt.id && s.active !== false
              );
              return (
                <div key={pt.id} className="pipo-point-card">
                  <div className="pipo-point-zone">{getZoneLabel(pt.zoneType)}</div>
                  <h3 className="pipo-point-name">{pt.name}</h3>
                  {pt.referenceInfo && <p className="pipo-point-ref">{pt.referenceInfo}</p>}
                  <div className="pipo-point-slots">
                    {ptSlots.length > 0 ? (
                      ptSlots.map((sl) => (
                        <span key={sl.id} className="pipo-slot-chip">
                          <Clock size={12} /> {sl.dayLabel}: {sl.timeRange}
                        </span>
                      ))
                    ) : (
                      <span className="pipo-slot-chip">Horario a coordinar por WhatsApp</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="pipo-store-footer">
        <div className="pipo-store-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={`${import.meta.env.BASE_URL || './'}icon-192.png`}
              alt="Glow with Pipo"
              style={{ width: 36, height: 36, borderRadius: 10 }}
            />
            <div>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                Glow with Pipo
              </strong>
              <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>
                Belleza, maquillaje &amp; detalles coquette · Lima &amp; Callao
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isStaffLoggedIn ? (
              <button
                type="button"
                className="pipo-footer-staff-link"
                onClick={onOpenStaffLogin}
              >
                <Lock size={13} /> Acceso Socios (Adrián &amp; Fabiana)
              </button>
            ) : (
              <button type="button" className="pipo-footer-staff-link" onClick={onReturnToErp}>
                <ArrowLeft size={13} /> Volver al ERP
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Floating Bottom Cart Pill on Mobile */}
      {cartSummary.totalUnits > 0 && !isCartOpen && !checkoutOpen && (
        <div className="pipo-floating-cart-bar">
          <button
            type="button"
            className="pipo-floating-cart-btn"
            onClick={() => setIsCartOpen(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="pipo-floating-badge">{cartSummary.totalUnits}</span>
              <span>Ver mi bolsita de compra</span>
            </div>
            <strong>{formatMoney(cartSummary.subtotal)} →</strong>
          </button>
        </div>
      )}

      {/* Customizable Combo Shade Picker Modal */}
      {customizingCombo &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setCustomizingCombo(null)}>
            <div
              className="modal-panel"
              style={{ maxWidth: 520 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <span className="badge badge-brand">✨ Personaliza tu Combo</span>
                  <h3 style={{ margin: '4px 0 0', color: 'var(--pipo-burgundy)' }}>
                    {customizingCombo.combo.name}
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCustomizingCombo(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--pipo-cocoa)' }}>
                  Elige el tono exacto que deseas para cada producto de tu combo:
                </p>

                {customizingCombo.comboMeta.detailedItems.map((di, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--pipo-ivory)',
                      border: '1px solid var(--pipo-border)',
                      borderRadius: 14,
                      padding: 12
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: 'var(--pipo-burgundy)',
                        fontSize: '0.92rem',
                        marginBottom: 8
                      }}
                    >
                      {di.quantity}x {di.product?.name}
                    </div>
                    <div className="pipo-shades-pills">
                      {di.availableVariants.map((v) => {
                        const selected = comboShadeChoices[idx] === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`pipo-shade-pill ${selected ? 'selected' : ''}`}
                            onClick={() =>
                              setComboShadeChoices((prev) => ({ ...prev, [idx]: v.id }))
                            }
                          >
                            {v.colorHex && (
                              <span
                                className="pipo-shade-swatch"
                                style={{ backgroundColor: v.colorHex }}
                              />
                            )}
                            <span>{v.shadeName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCustomizingCombo(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmCustomizableComboAdd}
                >
                  <ShoppingBag size={16} /> Agregar Combo ({formatMoney(customizingCombo.comboMeta.totalComboPrice)})
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Slide-Over Cart Drawer */}
      {isCartOpen &&
        createPortal(
          <div className="pipo-drawer-backdrop" onClick={() => setIsCartOpen(false)}>
            <aside className="pipo-cart-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="pipo-cart-drawer-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShoppingBag size={20} color="var(--pipo-burgundy)" />
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>
                    Tu Bolsita Pipo
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIsCartOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="pipo-cart-drawer-body">
                {cart.length === 0 ? (
                  <div className="pipo-cart-empty">
                    <Heart size={36} color="var(--pipo-petal)" />
                    <h4>Tu bolsita está vacía</h4>
                    <p>Explora nuestros labiales, rubores y combos para armar tu pedido.</p>
                  </div>
                ) : (
                  <div className="pipo-cart-items">
                    {cart.map((item) => (
                      <div key={item.cartKey} className="pipo-cart-item">
                        <div className="pipo-cart-item-info">
                          <div className="pipo-cart-item-title">{item.productName}</div>
                          <div className="pipo-cart-item-meta">
                            {item.colorHex && (
                              <span
                                className="pipo-shade-swatch"
                                style={{ backgroundColor: item.colorHex }}
                              />
                            )}
                            <span>Tono: {item.shadeName}</span>
                            {item.sourceComboName && (
                              <span className="badge badge-brand" style={{ fontSize: '0.68rem' }}>
                                🎁 {item.sourceComboName}
                              </span>
                            )}
                          </div>
                          <div className="pipo-cart-item-price">
                            {formatMoney(item.appliedUnitPrice)} c/u
                          </div>
                        </div>

                        <div className="pipo-cart-item-controls">
                          <div className="pipo-qty-stepper">
                            <button
                              type="button"
                              onClick={() => updateCartItemQty(item.cartKey, -1)}
                              aria-label="Disminuir cantidad"
                            >
                              <Minus size={13} />
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateCartItemQty(item.cartKey, 1)}
                              disabled={item.quantity >= item.maxStock}
                              aria-label="Aumentar cantidad"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <div className="pipo-cart-line-total">
                            {formatMoney(item.quantity * item.appliedUnitPrice)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="pipo-cart-drawer-footer">
                  <div className="pipo-cart-total-row">
                    <span>Total a pagar (Sin comisiones)</span>
                    <strong>{formatMoney(cartSummary.subtotal)}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '13px 18px', fontSize: '0.98rem' }}
                    onClick={openCheckoutFlow}
                  >
                    <Sparkles size={18} /> Continuar con mi Pedido →
                  </button>
                </div>
              )}
            </aside>
          </div>,
          document.body
        )}

      {/* Checkout & Resilient Yape Verification Modal */}
      {checkoutOpen &&
        createPortal(
          <div className="modal-backdrop" onClick={() => checkoutStep !== 'payment' && setCheckoutOpen(false)}>
            <div
              className="modal-panel pipo-checkout-modal"
              style={{ maxWidth: 620 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <span className="badge badge-brand">
                    {checkoutStep === 'form' && 'Paso 1 de 2 · Datos y Punto de Entrega'}
                    {checkoutStep === 'payment' && 'Paso 2 de 2 · Pago Seguro con Yape'}
                    {checkoutStep === 'verified' && '✨ ¡Pedido Confirmado!'}
                  </span>
                  <h3 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: '1.35rem', color: 'var(--pipo-burgundy)' }}>
                    {checkoutStep === 'form' && 'Programa tu entrega Glow with Pipo'}
                    {checkoutStep === 'payment' && `Realiza tu Yape por ${formatMoney(activeOrder?.totalCharged || cartSummary.subtotal)}`}
                    {checkoutStep === 'verified' && `¡Gracias por tu compra, ${customerName}!`}
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCheckoutOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Automatic Pre-Flight Yape Detector Health Bar (Wake-on-Checkout) */}
              <div className="pipo-yape-preflight-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img
                    src={`${import.meta.env.BASE_URL}yape-logo.png`}
                    alt="Yape"
                    className="pipo-yape-badge-img"
                  />
                  <span>
                    {checkingGateway
                      ? 'Despertando detector automático de Yape...'
                      : 'Validador Yape de Fabiana activo · Verificación automática de monto + titular'}
                  </span>
                </div>
                <span className="badge badge-ok" style={{ fontSize: '0.68rem' }}>
                  0% Comisión
                </span>
              </div>

              {checkoutStep === 'form' && (
                <form onSubmit={handleCreateWebOrder} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="grid-2">
                    <div className="field">
                      <label>
                        <User size={13} style={{ marginRight: 4 }} /> Tu Nombre y Apellido *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Valeria Morales"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          if (!yapeHolderName) setYapeHolderName(e.target.value);
                        }}
                      />
                    </div>

                    <div className="field">
                      <label>📱 Tu WhatsApp de contacto *</label>
                      <input
                        type="tel"
                        required
                        placeholder="Ej. 987 654 321"
                        value={customerWhatsapp}
                        onChange={(e) => setCustomerWhatsapp(e.target.value)}
                      />
                    </div>
                  </div>

                  <div
                    className="field"
                    style={{
                      background: 'rgba(224, 131, 152, 0.12)',
                      border: '1px solid rgba(114, 36, 36, 0.18)',
                      padding: 12,
                      borderRadius: 14
                    }}
                  >
                    <label style={{ color: 'var(--pipo-burgundy)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <img
                        src={`${import.meta.env.BASE_URL}yape-logo.png`}
                        alt="Yape"
                        className="pipo-yape-badge-img"
                      />
                      <span>Nombre completo del titular de la cuenta con la que pagarás *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Exactamente como figura en el Yape que enviará el pago"
                      value={yapeHolderName}
                      onChange={(e) => setYapeHolderName(e.target.value)}
                    />
                    <small style={{ fontSize: '0.74rem', color: 'var(--pipo-cocoa)', marginTop: 4, display: 'block' }}>
                      💡 Si otra persona (familiar o amigo) realizará el Yape por ti, escribe aquí su nombre y apellido completos para que el detector valide tu pago al instante sin cruces.
                    </small>
                  </div>

                  {/* Delivery Point Selection */}
                  <div className="field">
                    <label>
                      <MapPin size={14} style={{ marginRight: 4 }} /> Elige tu Punto de Entrega (No realizamos envíos a domicilio) *
                    </label>
                    <div className="pipo-checkout-points-grid">
                      {(catalog.deliveryPoints || []).map((pt) => {
                        const active = selectedPointId === pt.id;
                        return (
                          <button
                            key={pt.id}
                            type="button"
                            className={`pipo-checkout-point-btn ${active ? 'active' : ''}`}
                            onClick={() => setSelectedPointId(pt.id)}
                          >
                            <div style={{ fontSize: '0.7rem', color: 'var(--pipo-cocoa)', fontWeight: 700 }}>
                              {getZoneLabel(pt.zoneType)}
                            </div>
                            <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '0.88rem' }}>
                              {pt.name}
                            </strong>
                            {pt.referenceInfo && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--pipo-muted)' }}>
                                {pt.referenceInfo}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Available Time Slots for Selected Point */}
                  <div className="field">
                    <label>
                      <Clock size={14} style={{ marginRight: 4 }} /> Horario disponible programado por Adrián y Fabiana *
                    </label>
                    {availableSlotsForPoint.length > 0 ? (
                      <div className="pipo-checkout-slots-grid">
                        {availableSlotsForPoint.map((slot) => {
                          const isSelected = selectedSlotId === slot.id;
                          const remaining = Math.max(0, (slot.maxOrders || 10) - (slot.bookedOrders || 0));
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              className={`pipo-checkout-slot-btn ${isSelected ? 'active' : ''}`}
                              onClick={() => setSelectedSlotId(slot.id)}
                            >
                              <strong>{slot.dayLabel}</strong>
                              <span>{slot.timeRange}</span>
                              <small>{remaining} cupos libres</small>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="badge badge-brand" style={{ padding: '10px 12px' }}>
                        Horario flexible a coordinar directamente por WhatsApp tras confirmar tu pedido.
                      </div>
                    )}
                  </div>

                  <div className="field">
                    <label>Nota adicional (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Llevo casaca beige / Nos vemos en la puerta principal"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                    />
                  </div>

                  {checkoutError && (
                    <div className="badge badge-danger" style={{ padding: '10px 12px', whiteSpace: 'normal' }}>
                      {checkoutError}
                    </div>
                  )}

                  <div className="modal-footer" style={{ padding: '12px 0 0', borderTop: '1px solid var(--pipo-border)' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setCheckoutOpen(false)}
                    >
                      Volver
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submittingOrder}
                    >
                      <ShieldCheck size={17} />
                      {submittingOrder
                        ? 'Reservando tu pedido...'
                        : `Pasar al Pago Yape (${formatMoney(cartSummary.subtotal)}) →`}
                    </button>
                  </div>
                </form>
              )}

              {checkoutStep === 'payment' && activeOrder && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="pipo-yape-payment-box">
                    <div className="pipo-yape-brand-hero">
                      <img
                        src={`${import.meta.env.BASE_URL}yape-logo.png`}
                        alt="Yape"
                        className="pipo-yape-hero-logo"
                      />
                    </div>

                    <div className="pipo-yape-header-pill">
                      <img
                        src={`${import.meta.env.BASE_URL}yape-logo.png`}
                        alt="Yape"
                        className="pipo-yape-badge-img"
                      />
                      <span>Pago Directo a Fabiana · Glow with Pipo</span>
                    </div>

                    <div className="pipo-yape-amount-display">
                      {formatMoney(activeOrder.totalCharged)}
                    </div>
                    <p className="pipo-yape-holder-hint">
                      Yapea el monto exacto desde la cuenta de{' '}
                      <span className="pipo-yape-holder-pill">
                        {activeOrder.yapeHolderName}
                      </span>
                    </p>

                    <div className="pipo-yape-number-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                          src={`${import.meta.env.BASE_URL}yape-logo.png`}
                          alt="Yape"
                          style={{ height: 38, width: 'auto' }}
                        />
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                            NÚMERO OFICIAL DE YAPE (FABIANA)
                          </div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#4b1557', letterSpacing: '0.04em' }}>
                            {receiverPhone}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600 }}>
                            Titular receptora: Fabiana
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopyPhone}
                      >
                        <Copy size={14} /> {copiedPhone ? '¡Copiado!' : 'Copiar número'}
                      </button>
                    </div>

                    <div className="pipo-yape-live-radar">
                      <RefreshCw size={18} className="pipo-spin" color="#742284" style={{ flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: '#3b0f47', display: 'block', marginBottom: 2 }}>
                          Esperando tu Yape en tiempo real...
                        </strong>
                        <div style={{ fontSize: '0.78rem', color: '#4c1d95', lineHeight: 1.35 }}>
                          Pedido <strong>{activeOrder.code || activeOrder.saleCode}</strong> reservado · Validación directa a nombre de Fabiana.
                        </div>
                      </div>
                    </div>
                  </div>

                  {manualCheckHint && (
                    <div className="pipo-yape-manual-hint">
                      {manualCheckHint}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      disabled={checkingPayment}
                      onClick={handleManualCheckYapeNow}
                    >
                      <RefreshCw size={16} className={checkingPayment ? 'pipo-spin' : ''} />
                      {checkingPayment ? 'Verificando recepción...' : '¡Ya yapeé! Verificar ahora'}
                    </button>

                    <a
                      href={`https://wa.me/51${cleanYapeDigits}?text=${encodeURIComponent(
                        `¡Hola Glow with Pipo! 🌸 Acabo de registrar mi pedido web *${activeOrder.code}* por *${formatMoney(
                          activeOrder.totalCharged
                        )}*.\n\n👤 Cliente: ${customerName}\n💜 Titular Yape: ${
                          activeOrder.yapeHolderName
                        }\n📍 Punto de entrega: ${activeOrder.deliveryLocation}\n🕒 Horario: ${
                          activeOrder.deliveryTime
                        }`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ justifyContent: 'center' }}
                    >
                      <MessageCircle size={16} /> Avisar por WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {checkoutStep === 'verified' && activeOrder && (
                <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'var(--status-ok-bg)',
                      color: 'var(--status-ok-fg)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 12
                    }}
                  >
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--pipo-burgundy)' }}>
                    ¡Pago Yape Verificado con Éxito! 🎀
                  </h3>
                  <p style={{ margin: '0 auto 16px', maxWidth: 440, color: 'var(--pipo-cocoa)', fontSize: '0.9rem' }}>
                    Tu pedido <strong>{activeOrder.code}</strong> ya está registrado y pagado en el sistema de Adrián y Fabiana.
                  </p>

                  <div
                    style={{
                      background: 'var(--pipo-ivory)',
                      border: '1px solid var(--pipo-border)',
                      borderRadius: 16,
                      padding: 14,
                      textAlign: 'left',
                      marginBottom: 18,
                      fontSize: '0.85rem'
                    }}
                  >
                    <div>
                      <strong>Código de Pedido:</strong> {activeOrder.code}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong>Monto Pagado:</strong> {formatMoney(activeOrder.totalCharged)}
                      <span className="badge badge-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <img
                          src={`${import.meta.env.BASE_URL}yape-logo.png`}
                          alt="Yape"
                          style={{ height: 13, width: 'auto' }}
                        />
                        Verificado
                      </span>
                    </div>
                    <div>
                      <strong>Punto de Entrega:</strong> {activeOrder.deliveryLocation}
                    </div>
                    <div>
                      <strong>Horario Programado:</strong> {activeOrder.deliveryTime}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <a
                      href={`https://wa.me/51${cleanYapeDigits}?text=${encodeURIComponent(
                        `¡Hola Glow with Pipo! 🎀 Mi pago Yape del pedido *${activeOrder.code}* (${formatMoney(
                          activeOrder.totalCharged
                        )}) ya fue verificado en la web. ¡Nos vemos en ${activeOrder.deliveryLocation}!`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                    >
                      <MessageCircle size={16} /> Abrir WhatsApp de Confirmación
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setCheckoutOpen(false);
                        setActiveOrder(null);
                      }}
                    >
                      Seguir viendo la tienda
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Expanded Product Detail Modal with Dedicated Real Tone Swatches Apartado */}
      {detailProduct &&
        createPortal(
          <div className="pipo-detail-overlay" onClick={closeProductDetail}>
            <div
              className="pipo-detail-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                className="pipo-detail-close-btn"
                onClick={closeProductDetail}
                aria-label="Cerrar detalle"
              >
                <X size={20} />
              </button>

              <div className="pipo-detail-scroll-wrap">
                <div className="pipo-detail-breadcrumbs">
                  <span className="pipo-detail-cat-badge">
                    {getCategoryEmoji(detailProduct.category)} {detailProduct.category}
                  </span>
                  {detailProduct.brand && (
                    <span className="pipo-detail-brand-badge">{detailProduct.brand}</span>
                  )}
                  {detailProduct.isFeatured && (
                    <span className="pipo-detail-featured-badge">⭐ Favorito Glow</span>
                  )}
                </div>

                <h2 className="pipo-detail-title">{detailProduct.name}</h2>

                <div className="pipo-detail-pricing-row">
                  <div className="pipo-detail-price-main">
                    {formatMoney(detailProduct.unitPrice)}
                  </div>
                  {detailProduct.comboPrice > 0 &&
                    detailProduct.comboPrice < detailProduct.unitPrice && (
                      <div className="pipo-detail-price-combo">
                        ✨ En combo: {formatMoney(detailProduct.comboPrice)}
                      </div>
                    )}
                  <div className="pipo-detail-stock-status">
                    {(() => {
                      const curVar =
                        (detailProduct.variants || []).find(
                          (v) => v.id === detailActiveShadeId
                        ) || detailProduct.variants?.[0];
                      return curVar && curVar.stock > 0 ? (
                        <span className="badge badge-ok">
                          🟢 {curVar.stock} disponibles para entrega
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>
                          🔴 Agotado en este tono
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="pipo-detail-two-col">
                  {/* Left Column: Commercial Photo & Exclusive Tone Swatches */}
                  <div className="pipo-detail-media-col">
                    {/* Apartado 1: Foto Comercial Principal */}
                    <div className="pipo-detail-main-img-box">
                      <StorefrontProductImage
                        src={detailProduct.imageUrl}
                        alt={detailProduct.name}
                        fallbackEmoji={getCategoryEmoji(detailProduct.category)}
                        fallbackBrand={detailProduct.brand || 'GLOW WITH PIPO'}
                        className="pipo-detail-main-img"
                      />
                      <div className="pipo-detail-main-img-caption">
                        📸 Presentación comercial del producto
                      </div>
                    </div>

                    {/* Apartado 2: APARTADO DE MUESTRAS REALES Y TONOS (SWATCHES) */}
                    {(() => {
                      const variants = detailProduct.variants || [];
                      const activeVar =
                        variants.find((v) => v.id === detailActiveShadeId) || variants[0];
                      const hasVariantPhoto = Boolean(activeVar?.imageUrl);
                      const hasGeneralShadesPhoto = Boolean(detailProduct.shadesImageUrl);
                      const showBothToggle = hasVariantPhoto && hasGeneralShadesPhoto;

                      const displayedPhoto =
                        detailShadeViewMode === 'active' && hasVariantPhoto
                          ? activeVar.imageUrl
                          : (detailProduct.shadesImageUrl || activeVar?.imageUrl || '');

                      const displayedCaption =
                        detailShadeViewMode === 'active' && hasVariantPhoto
                          ? `💄 Muestra real aplicada: ${activeVar?.shadeName}`
                          : (hasGeneralShadesPhoto
                              ? '📋 Guía comparativa de todos los tonos en piel'
                              : `💄 Tono: ${activeVar?.shadeName}`);

                      return (
                        <div className="pipo-swatches-box">
                          <div className="pipo-swatches-header">
                            <div className="pipo-swatches-title-wrap">
                              <Sparkles size={16} color="var(--pipo-burgundy)" />
                              <h4 className="pipo-swatches-heading">
                                Muestras Reales y Tonos en Piel
                              </h4>
                            </div>
                            <p className="pipo-swatches-subheading">
                              Observa cómo luce realmente el tono en piel o labios antes de pedirlo
                            </p>
                          </div>

                          {showBothToggle && (
                            <div className="pipo-swatches-toggle-bar">
                              <button
                                type="button"
                                className={`pipo-swatch-toggle-btn ${detailShadeViewMode === 'active' ? 'active' : ''}`}
                                onClick={() => setDetailShadeViewMode('active')}
                              >
                                💄 Foto del Tono ({activeVar?.shadeName})
                              </button>
                              <button
                                type="button"
                                className={`pipo-swatch-toggle-btn ${detailShadeViewMode === 'all' ? 'active' : ''}`}
                                onClick={() => setDetailShadeViewMode('all')}
                              >
                                📋 Ver Todos los Tonos
                              </button>
                            </div>
                          )}

                          <div className="pipo-swatches-viewport">
                            {displayedPhoto ? (
                              <>
                                <img
                                  src={displayedPhoto}
                                  alt={displayedCaption}
                                  className="pipo-swatch-real-img"
                                  loading="lazy"
                                />
                                <div className="pipo-swatch-floating-badge">
                                  {displayedCaption}
                                </div>
                              </>
                            ) : (
                              <div className="pipo-swatch-no-photo-box">
                                {activeVar?.colorHex && (
                                  <span
                                    className="pipo-swatch-color-bubble"
                                    style={{ backgroundColor: activeVar.colorHex }}
                                  />
                                )}
                                <strong style={{ color: 'var(--pipo-burgundy)' }}>
                                  {activeVar?.shadeName || 'Tono Estándar'}
                                </strong>
                                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--pipo-muted)' }}>
                                  Tono seleccionado. Elige entre las opciones disponibles abajo.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right Column: Shade Selector, Description & Purchase Bar */}
                  <div className="pipo-detail-info-col">
                    {/* Shade Selector if product has variants */}
                    {(() => {
                      const variants = detailProduct.variants || [];
                      const activeVar =
                        variants.find((v) => v.id === detailActiveShadeId) || variants[0];
                      const hasVariants =
                        variants.length > 1 ||
                        (variants.length === 1 &&
                          (variants[0].shadeName !== 'Único' || Boolean(variants[0].colorHex)));

                      if (!hasVariants) return null;

                      return (
                        <div className="pipo-detail-shade-selector-section">
                          <div className="pipo-detail-shade-selector-header">
                            <span className="pipo-detail-shade-label">
                              Elige tu Tono:{' '}
                              <strong style={{ color: 'var(--pipo-burgundy)' }}>
                                {activeVar?.shadeName || 'Selecciona'}
                              </strong>
                            </span>
                            <span className="pipo-detail-shade-stock">
                              {activeVar?.stock > 0
                                ? `Disponibles: ${activeVar.stock}`
                                : 'Agotado'}
                            </span>
                          </div>

                          <div className="pipo-detail-shade-pills-grid">
                            {variants.map((v) => {
                              const isSelected = v.id === activeVar?.id;
                              const out = v.stock <= 0;
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  disabled={out}
                                  className={`pipo-detail-shade-btn ${isSelected ? 'selected' : ''} ${out ? 'disabled' : ''}`}
                                  onClick={() => {
                                    setDetailActiveShadeId(v.id);
                                    setSelectedVariantByProduct((prev) => ({
                                      ...prev,
                                      [detailProduct.id]: v.id
                                    }));
                                    if (v.imageUrl) {
                                      setDetailShadeViewMode('active');
                                    }
                                  }}
                                >
                                  {v.colorHex && (
                                    <span
                                      className="pipo-detail-shade-dot"
                                      style={{ backgroundColor: v.colorHex }}
                                    />
                                  )}
                                  <span className="pipo-detail-shade-name">{v.shadeName}</span>
                                  {v.imageUrl && (
                                    <span className="pipo-shade-photo-indicator" title="Tiene foto real">
                                      📷
                                    </span>
                                  )}
                                  <span className="pipo-detail-shade-badge">
                                    {out ? 'Agotado' : `${v.stock} disp.`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Product Description */}
                    {detailProduct.publicDescription && (
                      <div className="pipo-detail-desc-box">
                        <h4 className="pipo-detail-desc-title">Detalles del Producto</h4>
                        <p className="pipo-detail-desc-text">{detailProduct.publicDescription}</p>
                      </div>
                    )}

                    {/* Delivery Assurance Note */}
                    <div className="pipo-detail-delivery-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <MapPin size={16} color="var(--pipo-burgundy)" />
                        <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '0.88rem' }}>
                          Entrega personal segura
                        </strong>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--pipo-muted)', lineHeight: 1.4 }}>
                        Coordinamos tu entrega en <strong>UNAC</strong>, estaciones de tren o centros comerciales en horario programado. Pagas directo con Yape al completar tu pedido.
                      </p>
                    </div>

                    {/* Quantity & Action Buttons */}
                    {(() => {
                      const variants = detailProduct.variants || [];
                      const activeVar =
                        variants.find((v) => v.id === detailActiveShadeId) || variants[0];
                      const isOutOfStock = !activeVar || activeVar.stock <= 0;
                      const maxStock = activeVar?.stock || 0;

                      return (
                        <div className="pipo-detail-actions-panel">
                          <div className="pipo-detail-qty-row">
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--pipo-burgundy)' }}>
                              Cantidad:
                            </span>
                            <div className="pipo-qty-stepper">
                              <button
                                type="button"
                                className="pipo-qty-btn"
                                disabled={detailQty <= 1 || isOutOfStock}
                                onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                              >
                                <Minus size={14} />
                              </button>
                              <span className="pipo-qty-number">{detailQty}</span>
                              <button
                                type="button"
                                className="pipo-qty-btn"
                                disabled={detailQty >= maxStock || isOutOfStock}
                                onClick={() => setDetailQty((q) => Math.min(maxStock, q + 1))}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--pipo-muted)' }}>
                              Subtotal: <strong>{formatMoney(detailProduct.unitPrice * detailQty)}</strong>
                            </span>
                          </div>

                          <div className="pipo-detail-btn-group">
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              className="btn btn-primary pipo-detail-add-cart-btn"
                              onClick={() => handleAddDetailProductToCart(false)}
                            >
                              <ShoppingBag size={18} />
                              <span>Agregar {detailQty > 1 ? `(${detailQty})` : ''} a mi Bolsita</span>
                            </button>

                            <button
                              type="button"
                              disabled={isOutOfStock}
                              className="btn pipo-detail-buy-now-btn"
                              onClick={() => handleAddDetailProductToCart(true)}
                            >
                              <img
                                src={`${import.meta.env.BASE_URL}yape-logo.png`}
                                alt="Yape"
                                style={{ height: 16, width: 'auto' }}
                              />
                              <span>Pagar con Yape Ahora</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Expanded Combo Detail Modal */}
      {detailCombo &&
        createPortal(
          <div className="pipo-detail-overlay" onClick={closeComboDetail}>
            <div
              className="pipo-detail-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                className="pipo-detail-close-btn"
                onClick={closeComboDetail}
                aria-label="Cerrar detalle"
              >
                <X size={20} />
              </button>

              <div className="pipo-detail-scroll-wrap">
                <div className="pipo-detail-breadcrumbs">
                  <span className="pipo-detail-cat-badge">✨ Combo Especial Glow</span>
                  <span className="pipo-combo-type-tag">
                    {detailCombo.combo.comboType === 'customizable'
                      ? '🎨 Elige tus tonos'
                      : '🎀 Pack Listo'}
                  </span>
                  {detailCombo.comboMeta.savings > 0 && (
                    <span className="pipo-combo-save-tag">
                      Ahorras {formatMoney(detailCombo.comboMeta.savings)}
                    </span>
                  )}
                </div>

                <h2 className="pipo-detail-title">{detailCombo.combo.name}</h2>

                <div className="pipo-detail-pricing-row">
                  <div>
                    {detailCombo.comboMeta.savings > 0 && (
                      <span className="pipo-price-old" style={{ display: 'block', fontSize: '0.9rem' }}>
                        Precio catálogo: {formatMoney(detailCombo.comboMeta.totalCatalogPrice)}
                      </span>
                    )}
                    <div className="pipo-detail-price-main">
                      {formatMoney(detailCombo.comboMeta.totalComboPrice)}
                    </div>
                  </div>
                  <div className="pipo-detail-stock-status">
                    {detailCombo.comboMeta.isAvailable ? (
                      <span className="badge badge-ok">🟢 Pack disponible para entrega</span>
                    ) : (
                      <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>
                        🔴 Stock insuficiente en alguno de los productos
                      </span>
                    )}
                  </div>
                </div>

                <div className="pipo-detail-two-col">
                  {/* Left Column: Visual */}
                  <div className="pipo-detail-media-col">
                    <div className="pipo-detail-main-img-box">
                      <StorefrontProductImage
                        src={detailCombo.combo.imageUrl}
                        alt={detailCombo.combo.name}
                        fallbackEmoji="🎁✨"
                        fallbackBrand="COMBO PIPO"
                        className="pipo-detail-main-img"
                      />
                    </div>
                    {(detailCombo.combo.publicDescription || detailCombo.combo.description) && (
                      <div className="pipo-detail-desc-box">
                        <h4 className="pipo-detail-desc-title">Sobre este Combo</h4>
                        <p className="pipo-detail-desc-text">
                          {detailCombo.combo.publicDescription || detailCombo.combo.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Breakdown & Choices */}
                  <div className="pipo-detail-info-col">
                    <div>
                      <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: 'var(--pipo-burgundy)' }}>
                        Productos incluidos en este pack:
                      </h4>
                      <ul className="pipo-detail-combo-items-list">
                        {detailCombo.comboMeta.detailedItems.map((di, idx) => (
                          <li key={idx} className="pipo-detail-combo-item-row">
                            <div style={{ flex: 1 }}>
                              <strong>{di.quantity}x</strong> {di.product?.name || 'Producto'}
                              {di.fixedVariant && di.fixedVariant.shadeName !== 'Único' && (
                                <span style={{ marginLeft: 6, color: 'var(--pipo-rose)', fontWeight: 600 }}>
                                  ({di.fixedVariant.shadeName})
                                </span>
                              )}
                            </div>

                            {!di.fixedVariant && di.availableVariants.length > 1 && (
                              <div style={{ minWidth: 150 }}>
                                <select
                                  value={detailComboShadeChoices[idx] || di.availableVariants[0]?.id}
                                  onChange={(e) =>
                                    setDetailComboShadeChoices((prev) => ({
                                      ...prev,
                                      [idx]: e.target.value
                                    }))
                                  }
                                  className="pipo-shade-choice-select"
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: 10,
                                    border: '1.5px solid var(--pipo-border)',
                                    fontSize: '0.82rem',
                                    color: 'var(--pipo-burgundy)'
                                  }}
                                >
                                  {di.availableVariants.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.shadeName} ({v.stock} disp.)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pipo-detail-delivery-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <MapPin size={16} color="var(--pipo-burgundy)" />
                        <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '0.88rem' }}>
                          Punto y horario de entrega acordado
                        </strong>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--pipo-muted)' }}>
                        Entrega en UNAC, estaciones de tren o centros comerciales. Pagas seguro por Yape.
                      </p>
                    </div>

                    <div className="pipo-detail-actions-panel">
                      <div className="pipo-detail-qty-row">
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--pipo-burgundy)' }}>
                          Cantidad de packs:
                        </span>
                        <div className="pipo-qty-stepper">
                          <button
                            type="button"
                            className="pipo-qty-btn"
                            disabled={detailQty <= 1 || !detailCombo.comboMeta.isAvailable}
                            onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="pipo-qty-number">{detailQty}</span>
                          <button
                            type="button"
                            className="pipo-qty-btn"
                            disabled={!detailCombo.comboMeta.isAvailable}
                            onClick={() => setDetailQty((q) => q + 1)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--pipo-muted)' }}>
                          Total pack:{' '}
                          <strong>
                            {formatMoney(detailCombo.comboMeta.totalComboPrice * detailQty)}
                          </strong>
                        </span>
                      </div>

                      <div className="pipo-detail-btn-group">
                        <button
                          type="button"
                          disabled={!detailCombo.comboMeta.isAvailable}
                          className="btn btn-primary pipo-detail-add-cart-btn"
                          onClick={() => handleAddDetailComboToCart(false)}
                        >
                          <ShoppingBag size={18} />
                          <span>Agregar Combo {detailQty > 1 ? `(${detailQty})` : ''}</span>
                        </button>

                        <button
                          type="button"
                          disabled={!detailCombo.comboMeta.isAvailable}
                          className="btn pipo-detail-buy-now-btn"
                          onClick={() => handleAddDetailComboToCart(true)}
                        >
                          <img
                            src={`${import.meta.env.BASE_URL}yape-logo.png`}
                            alt="Yape"
                            style={{ height: 16, width: 'auto' }}
                          />
                          <span>Pagar Pack con Yape</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
