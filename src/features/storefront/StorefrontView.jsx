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
import { ProductDetailModal, ComboDetailModal } from './StorefrontDetailModals.jsx';
import StorefrontSelect from './StorefrontSelect.jsx';
import { matchesCatalogSearch, sortCatalogItems } from './catalogDiscovery.js';
import { computeSeparationPolicy, formatMoney, roundMoney } from '../../domain/calculations.js';
import { DEFAULT_SHIPPING_METHODS, PRODUCT_CATEGORIES, RESERVATION_HOLD_MINUTES, UNAC_MIN_RETENTION, UNAC_RETENTION_RATE } from '../../domain/constants.js';
import {
  checkWebOrderYapeStatus,
  fetchPublicStorefrontCatalog,
  submitWebStorefrontOrder,
  subscribePublicVariantAvailability,
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
    case 'unac':
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

const STOREFRONT_CART_KEY = 'glow_with_pipo_cart_v1';

function readStoredCart() {
  try {
    const raw = localStorage.getItem(STOREFRONT_CART_KEY);
    if (!raw || raw.length > 1000000) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = new Map();
    for (const item of parsed.slice(0, 200)) {
      if (!item || typeof item !== 'object'
        || typeof item.variantId !== 'string' || !item.variantId
        || typeof item.productId !== 'string' || !item.productId
        || !Number.isSafeInteger(item.quantity) || item.quantity <= 0
        || !Number.isSafeInteger(item.maxStock) || item.maxStock < item.quantity
        || !Number.isFinite(item.appliedUnitPrice) || item.appliedUnitPrice < 0) continue;
      const pricingMode = item.pricingMode === 'individual' ? 'unit' : item.pricingMode;
      if (!['unit', 'combo'].includes(pricingMode)) continue;
      const sourceComboId = pricingMode === 'combo' && typeof item.sourceComboId === 'string' ? item.sourceComboId : null;
      if (pricingMode === 'combo' && !sourceComboId) continue;
      const cartKey = `${item.variantId}__${pricingMode}__${sourceComboId || 'unit'}`;
      const previous = items.get(cartKey);
      const text = (name) => typeof item[name] === 'string' ? item[name] : '';
      items.set(cartKey, {
        cartKey, variantId: item.variantId, productId: item.productId,
        productName: text('productName'), category: text('category'), imageUrl: text('imageUrl'),
        shadeName: text('shadeName'), colorHex: text('colorHex') || null,
        maxStock: item.maxStock, quantity: Math.min(item.maxStock, (previous?.quantity || 0) + item.quantity),
        appliedUnitPrice: item.appliedUnitPrice, pricingMode, sourceComboId,
        sourceComboName: text('sourceComboName')
      });
    }
    return [...items.values()];
  } catch {
    return [];
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
    shippingMethods: source.shippingMethods,
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
  const [catalogSnapshot, setCatalog] = useState(() => {
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

  const [liveAvailability, setLiveAvailability] = useState(() => new Map());
  useEffect(() => subscribePublicVariantAvailability(({ variantId, ...availability }) => {
    setLiveAvailability((previous) => {
      const existing = previous.get(variantId);
      if (existing && Date.parse(existing.updatedAt) > Date.parse(availability.updatedAt)) return previous;
      return new Map(previous).set(variantId, availability);
    });
  }), []);

  const catalog = useMemo(() => ({
    ...catalogSnapshot,
    products: catalogSnapshot.products.map((product) => ({
      ...product,
      variants: (product.variants || []).map((variant) => {
        const update = liveAvailability.get(variant.id);
        return update ? { ...variant, ...update } : variant;
      })
    }))
  }), [catalogSnapshot, liveAvailability]);

  // Solo mostrar skeleton loader si el catálogo está completamente vacío (primer ingreso limpio)
  const [loadingCatalog, setLoadingCatalog] = useState(() => {
    return catalog.products.length === 0;
  });
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [openDiscoveryPicker, setOpenDiscoveryPicker] = useState(null);
  const [catalogOrder, setCatalogOrder] = useState('recommended');
  const storefrontRef = useRef(null);
  const headerRef = useRef(null);
  const discoveryRef = useRef(null);
  const resultsRef = useRef(null);
  const searchRef = useRef(null);
  const revealResultsRef = useRef(false);

  useEffect(() => {
    const update = () => {
      storefrontRef.current?.style.setProperty('--pipo-header-height', `${headerRef.current?.getBoundingClientRect().height || 0}px`);
      storefrontRef.current?.style.setProperty('--pipo-discovery-height', `${discoveryRef.current?.getBoundingClientRect().height || 0}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    if (headerRef.current) observer.observe(headerRef.current);
    if (discoveryRef.current) observer.observe(discoveryRef.current);
    return () => observer.disconnect();
  }, [isStaffLoggedIn]);

  function scrollToCatalogResults() {
    if (!resultsRef.current) return;
    const top = window.scrollY + resultsRef.current.getBoundingClientRect().top
      - (headerRef.current?.getBoundingClientRect().height || 0)
      - (discoveryRef.current?.getBoundingClientRect().height || 0) - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }

  const revealResults = () => { revealResultsRef.current = true; };
  useEffect(() => {
    if (!revealResultsRef.current) return;
    revealResultsRef.current = false;
    const frame = requestAnimationFrame(() => {
      scrollToCatalogResults();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeCategory, catalogOrder, searchQuery]);

  function updateSearchQuery(value) {
    const resultsTop = resultsRef.current?.getBoundingClientRect().top;
    const controlsBottom = discoveryRef.current?.getBoundingClientRect().bottom;
    if (resultsTop < controlsBottom - 1) revealResultsRef.current = true;
    setSearchQuery(value);
  }

  function navigateToCategory(category) {
    setActiveCategory(category);
    requestAnimationFrame(() => scrollToCatalogResults());
  }

  function resetDiscovery() {
    setSearchQuery('');
    setActiveCategory('ALL');
    setCatalogOrder('recommended');
    searchRef.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => scrollToCatalogResults());
  }

  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState({});
  const [cart, setCart] = useState(readStoredCart);
  useEffect(() => {
    try {
      if (cart.length) localStorage.setItem(STOREFRONT_CART_KEY, JSON.stringify(cart));
      else localStorage.removeItem(STOREFRONT_CART_KEY);
    } catch {
      // Storage may be unavailable or full; the active cart remains usable.
    }
  }, [cart]);
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
  const [deliveryMethod, setDeliveryMethod] = useState('unac_pickup');
  const [paymentPlan, setPaymentPlan] = useState('full');
  const [recipientDni, setRecipientDni] = useState('');
  const [destinationRegion, setDestinationRegion] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [clock, setClock] = useState(Date.now);
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

  const discoveryDisabled = Boolean(checkoutOpen || customizingCombo || isCartOpen || detailProduct || detailCombo);
  useEffect(() => { if (discoveryDisabled) setOpenDiscoveryPicker(null); }, [discoveryDisabled]);

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

  const pendingOrderId = checkoutStep === 'payment' ? activeOrder?.saleId : null;
  const expiry = Date.parse(activeOrder?.reservationExpiresAt || '');
  const showCountdown = Number.isFinite(expiry) && Number(activeOrder?.amountPaid || 0) === 0;
  const secondsRemaining = showCountdown ? Math.max(0, Math.ceil((expiry - clock) / 1000)) : null;

  const applyOrderStatus = useCallback((result) => {
    if (!result) return false;
    if (result.status === 'cancelled') {
      setCheckoutStep('expired');
      loadStorefront();
      return true;
    }
    if (result.verified) {
      setActiveOrder((previous) => ({ ...previous, ...result }));
      setCheckoutStep('verified');
      setCart([]);
      loadStorefront();
      return true;
    }
    if (Number(result.amountPaid) > 0) setActiveOrder((previous) => ({ ...previous, ...result }));
    return false;
  }, [loadStorefront]);

  useEffect(() => {
    if (!checkoutOpen || !pendingOrderId) return;
    let active = true;
    let checking = false;
    const poll = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await checkWebOrderYapeStatus(pendingOrderId);
        if (active) applyOrderStatus(result);
      } catch {
        // Keep the existing order and try again on the next poll.
      } finally {
        checking = false;
      }
    };
    setClock(Date.now());
    const ticker = setInterval(() => setClock(Date.now()), 1000);
    const polling = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(ticker);
      clearInterval(polling);
    };
  }, [checkoutOpen, pendingOrderId, applyOrderStatus]);

  useEffect(() => {
    if (checkoutOpen && pendingOrderId && secondsRemaining === 0) {
      setCheckoutStep('expired');
      loadStorefront();
    }
  }, [checkoutOpen, pendingOrderId, secondsRemaining, loadStorefront]);

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
    return sortCatalogItems((catalog.products || []).filter((p) => {
      const totalStock = (p.variants || []).reduce((total, v) => total + (v.stock || 0), 0);
      if (totalStock <= 0 && !p.variants?.some((v) => v.reservedUnpaid > 0 || v.reservedAdvance > 0)) return false;
      if (activeCategory !== 'ALL' && p.category !== activeCategory) return false;
      return matchesCatalogSearch(p, searchQuery);
    }), catalogOrder);
  }, [catalog.products, activeCategory, searchQuery, catalogOrder]);

  const filteredCombos = useMemo(() => {
    if (activeCategory !== 'ALL' && activeCategory !== 'COMBOS') return [];
    return sortCatalogItems((catalog.combos || []).filter((c) =>
      matchesCatalogSearch(c, searchQuery)), catalogOrder, (combo) =>
      (combo.items || []).reduce((total, item) => {
        const product = productsById.get(item.productId);
        return total + Number(item.customComboUnitPrice ?? (product?.comboPrice || product?.unitPrice || 0))
          * Math.max(1, Number(item.quantity || 1));
      }, 0));
  }, [catalog.combos, activeCategory, searchQuery, catalogOrder, productsById]);

  const availableSlotsForPoint = useMemo(() => {
    return (catalog.deliverySlots || []).filter(
      (ds) => ds.deliveryPointId === selectedPointId && ds.active !== false && (ds.bookedOrders || 0) < (ds.maxOrders ?? 10)
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

  const deepLinkOpened = useRef(false);
  useEffect(() => {
    if (deepLinkOpened.current || loadingCatalog || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const productKey = params.get('product');
    const comboKey = params.get('combo');
    const matches = (value, key) => value != null && String(value).toLocaleLowerCase('es') === key.toLocaleLowerCase('es');
    if (productKey) {
      const product = (catalog.products || []).find((p) => matches(p.id, productKey)
        || matches(p.code, productKey) || matches(p.sku, productKey)
        || (p.variants || []).some((v) => matches(v.sku, productKey) || matches(v.id, productKey)));
      if (!product) return;
      deepLinkOpened.current = true;
      openProductDetail(product);
      const variant = (product.variants || []).find((v) => matches(v.sku, productKey) || matches(v.id, productKey));
      if (variant) {
        setDetailActiveShadeId(variant.id);
        setSelectedVariantByProduct((prev) => ({ ...prev, [product.id]: variant.id }));
        setDetailShadeViewMode(variant.imageUrl ? 'active' : product.shadesImageUrl ? 'all' : 'active');
      }
    } else if (comboKey) {
      const combo = (catalog.combos || []).find((c) => matches(c.id, comboKey) || matches(c.code, comboKey));
      if (!combo) return;
      deepLinkOpened.current = true;
      openComboDetail(combo, computeComboPriceAndStock(combo));
    }
  }, [catalog.products, catalog.combos, loadingCatalog]);

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
      pricingMode: 'unit'
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

  const detailComboMaxQty = useMemo(() => {
    if (!detailCombo?.comboMeta.isAvailable) return 0;
    const required = new Map();
    for (const [index, item] of detailCombo.comboMeta.detailedItems.entries()) {
      const id = detailComboShadeChoices[index] || item.fixedVariant?.id || item.availableVariants[0]?.id;
      if (!id || !allVariantsById.has(id)) return 0;
      required.set(id, (required.get(id) || 0) + Math.max(1, Number(item.quantity || 1)));
    }
    if (!required.size) return 0;
    return Math.max(0, Math.min(...[...required].map(([id, quantity]) => {
      const inCart = cart.filter((item) => item.variantId === id).reduce((sum, item) => sum + item.quantity, 0);
      return Math.floor((Number(allVariantsById.get(id).stock || 0) - inCart) / quantity);
    })));
  }, [detailCombo, detailComboShadeChoices, allVariantsById, cart]);

  useEffect(() => {
    if (detailCombo) setDetailQty((quantity) => Math.max(1, Math.min(quantity, detailComboMaxQty)));
  }, [detailCombo, detailComboMaxQty]);

  function handleAddDetailComboToCart(buyNow = false) {
    if (!detailCombo) return;
    const { combo, comboMeta } = detailCombo;
    const packsToAdd = Math.min(detailQty, detailComboMaxQty);
    if (!comboMeta.isAvailable || packsToAdd <= 0) return;

    comboMeta.detailedItems.forEach((di, idx) => {
      const chosenVarId =
        detailComboShadeChoices[idx] || di.fixedVariant?.id || di.availableVariants[0]?.id;
      if (chosenVarId) {
        addVariantToCart({
          variantId: chosenVarId,
          quantity: Math.max(1, Number(di.quantity || 1)) * packsToAdd,
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

  const shippingMethods = Array.isArray(catalog.shippingMethods) ? catalog.shippingMethods : DEFAULT_SHIPPING_METHODS;
  const activeMethods = shippingMethods.filter((method) => method.active !== false);
  const chosenMethod = activeMethods.find((method) => method.id === deliveryMethod) || activeMethods[0];
  const isPickup = chosenMethod?.id === 'unac_pickup';
  const shippingFee = Number(chosenMethod?.baseFee || 0);
  const collectShipping = chosenMethod?.shippingPaymentMode === 'collect_on_delivery';
  const policy = computeSeparationPolicy({ totalCharged: roundMoney(cartSummary.subtotal + shippingFee),
    deliveryMethod: chosenMethod?.id, shippingMethods, paymentPlan });
  const paymentToday = activeOrder?.expectedInitialPayment ?? activeOrder?.totalCharged ?? policy.expectedInitialPayment;
  const isSeparated = activeOrder?.paymentPlan === 'advance_50' && Number(activeOrder.balanceDue) > 0.009;

  function openCheckoutFlow() {
    if (cart.length === 0) return;
    setIsCartOpen(false);
    setCheckoutError('');
    setManualCheckHint('');
    setCheckoutStep(activeOrder?.saleId && checkoutStep === 'payment' ? 'payment' : 'form');
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
    if (!chosenMethod || !cart.length || submittingOrder) return;
    if (isPickup && (!(catalog.deliveryPoints || []).some((point) => point.id === selectedPointId)
      || !availableSlotsForPoint.some((slot) => slot.id === selectedSlotId))) {
      setCheckoutError('Selecciona un punto y un horario con cupos disponibles.');
      return;
    }
    if (chosenMethod.requiresDni && !/^\d{8}$/.test(recipientDni)) {
      setCheckoutError('El DNI debe tener 8 dígitos.');
      return;
    }
    if (!isPickup && (!destinationRegion.trim() || (chosenMethod.requiresAddress && !destinationAddress.trim()))) {
      setCheckoutError('Completa los datos de destino solicitados.');
      return;
    }
    if (paymentPlan === 'advance_50' && !termsAccepted) {
      setCheckoutError('Acepta las condiciones de separación para continuar.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const orderRes = await submitWebStorefrontOrder({
        customerName: customerName.trim(),
        customerWhatsapp: customerWhatsapp.trim(),
        yapeHolderName: yapeHolderName.trim(),
        deliveryMethod: chosenMethod.id,
        deliveryPointId: isPickup ? selectedPointId : null,
        deliverySlotId: isPickup ? selectedSlotId : null,
        recipientDni: chosenMethod.requiresDni ? recipientDni : '',
        destinationRegion: isPickup ? '' : destinationRegion.trim(),
        destinationAddress: chosenMethod.requiresAddress ? destinationAddress.trim() : '',
        paymentPlan,
        termsAccepted: paymentPlan === 'advance_50' && termsAccepted,
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

      setClock(Date.now());
      setActiveOrder({ paymentPlan, ...orderRes,
        deliveryLocation: orderRes?.deliveryLocation || destinationRegion.trim() });
      setRecipientDni('');
      setDestinationRegion('');
      setDestinationAddress('');
      setTermsAccepted(false);
      if (orderRes?.status === 'cancelled') {
        setCheckoutStep('expired');
        loadStorefront();
      } else if (orderRes?.verified) {
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
      if (!applyOrderStatus(res)) {
        setManualCheckHint(
          'Aún no recibimos la confirmación del Yape. Si ya transferiste, avísanos por WhatsApp para que podamos revisar el pedido.'
        );
      }
    } catch {
      setManualCheckHint('No pudimos consultar el pago. Intenta de nuevo.');
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
    <div className="pipo-storefront" ref={storefrontRef}>
      <div className="pipo-store-sticky-shell" ref={headerRef}>
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
          <div className="pipo-store-brand" onClick={() => navigateToCategory('ALL')}>
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
              onClick={() => navigateToCategory('ALL')}
            >
              Catálogo
            </button>
            <button
              type="button"
              className={`pipo-store-navlink ${activeCategory === 'COMBOS' ? 'active' : ''}`}
              onClick={() => navigateToCategory('COMBOS')}
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
      </div>

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

        </div>
      </section>

      <main className="pipo-store-main">
        <div className="pipo-discovery" ref={discoveryRef}
          hidden={Boolean(checkoutOpen || customizingCombo || isCartOpen || detailProduct || detailCombo)}
          aria-label="Explorar catálogo" role="region">
          <div className="pipo-discovery-controls">
            <div className="pipo-discovery-search">
              <Search size={18} aria-hidden="true" />
              <input ref={searchRef} type="search" aria-label="Buscar productos, tonos o combos"
                placeholder="Buscar productos, tonos o combos…" value={searchQuery}
                onChange={(e) => updateSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    scrollToCatalogResults();
                  }
                }} />
              {searchQuery && <button type="button" aria-label="Limpiar búsqueda"
                onClick={() => { updateSearchQuery(''); searchRef.current?.focus({ preventScroll: true }); }}>
                <X size={17} />
              </button>}
            </div>
            <StorefrontSelect label="Categoría" value={activeCategory}
              options={[{ value: 'ALL', label: 'Todas' }, { value: 'COMBOS', label: 'Combos' },
                ...availableCategories.map((cat) => ({ value: cat, label: cat }))]}
              open={openDiscoveryPicker === 'category'} disabled={discoveryDisabled}
              onOpenChange={(open) => setOpenDiscoveryPicker(open ? 'category' : null)}
              onChange={(value) => { revealResults(); setActiveCategory(value); }} />
            <StorefrontSelect label="Ordenar por" value={catalogOrder}
              options={[{ value: 'recommended', label: 'Recomendados' },
                { value: 'price-asc', label: 'Menor precio' }, { value: 'price-desc', label: 'Mayor precio' },
                { value: 'name', label: 'Nombre: A–Z' }]}
              open={openDiscoveryPicker === 'order'} disabled={discoveryDisabled}
              onOpenChange={(open) => setOpenDiscoveryPicker(open ? 'order' : null)}
              onChange={(value) => { revealResults(); setCatalogOrder(value); }} />
          </div>
          <div className="pipo-discovery-status">
            <span role="status" aria-live="polite" aria-atomic="true">
              {loadingCatalog ? 'Cargando catálogo…' : `${filteredProducts.length} productos · ${filteredCombos.length} combos`}
              {activeCategory !== 'ALL' && ` · ${activeCategory === 'COMBOS' ? 'Combos especiales' : activeCategory}`}
              {searchQuery.trim() && ` · “${searchQuery.trim()}”`}
            </span>
            {(searchQuery || activeCategory !== 'ALL' || catalogOrder !== 'recommended') &&
              <button type="button" onClick={resetDiscovery}>Restablecer</button>}
            <small>Orden dentro de cada sección</small>
          </div>
        </div>
        <div ref={resultsRef} className="pipo-catalog-results" />
        {!loadingCatalog && filteredProducts.length === 0 && filteredCombos.length === 0 && (
          <div className="pipo-empty-catalog">
            <Sparkles size={28} aria-hidden="true" />
            <h3>No encontramos resultados</h3>
            <p>Prueba otro nombre, tono o categoría.</p>
            <button type="button" className="btn btn-secondary" onClick={resetDiscovery}>Ver todo el catálogo</button>
          </div>
        )}
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
            {activeCategory !== 'COMBOS' && filteredProducts.length > 0 && (
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
                                        {(v.reservedUnpaid > 0 || v.reservedAdvance > 0) && (
                                          <small className="pipo-shade-reservations">
                                            {v.stock} disponibles
                                            {v.reservedUnpaid > 0 && ` · ${v.reservedUnpaid} en reserva temporal`}
                                            {v.reservedAdvance > 0 && ` · ${v.reservedAdvance} separadas`}
                                          </small>
                                        )}
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

                            {activeVar && <div className="pipo-reservation-badges">
                              {activeVar.reservedUnpaid > 0 && <span className="badge badge-warning">{activeVar.reservedUnpaid} en reserva temporal</span>}
                              {activeVar.reservedAdvance > 0 && <span className="badge badge-brand">{activeVar.reservedAdvance} separadas</span>}
                            </div>}

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
                Para entregas presenciales coordinamos puntos como la universidad, estaciones de
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
                    <span>Subtotal de productos</span>
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
                    {checkoutStep === 'verified' && (isSeparated ? 'Separación confirmada' : '✨ ¡Pedido Confirmado!')}
                    {checkoutStep === 'expired' && 'Reserva temporal expirada'}
                  </span>
                  <h3 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: '1.35rem', color: 'var(--pipo-burgundy)' }}>
                    {checkoutStep === 'form' && 'Programa tu entrega Glow with Pipo'}
                    {checkoutStep === 'payment' && `Realiza tu Yape por ${formatMoney(paymentToday)}`}
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
                      ? 'Preparando pasarela de pago Yape...'
                      : 'Pago Yape directo a Fabiana · Validación por monto + titular'}
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

                  <fieldset className="pipo-shipping-fieldset">
                    <legend>Método de entrega</legend>
                    <div className="pipo-shipping-grid">
                      {['unac', 'shalom', 'olva'].map((carrier) => {
                        const methods = activeMethods.filter((method) => method.carrier === carrier);
                        if (!methods.length) return null;
                        const method = methods.find((item) => item.id === chosenMethod?.id) || methods[0];
                        return (
                          <label key={carrier} className="pipo-shipping-choice">
                            <input type="radio" name="shipping-carrier" checked={chosenMethod?.carrier === carrier}
                              onChange={() => { setDeliveryMethod(method.id); setTermsAccepted(false); }} />
                            <span><strong>{carrier === 'unac' ? 'UNAC presencial' : carrier === 'shalom' ? 'Shalom Agencia' : 'Olva Courier'}</strong>
                              <small>{carrier === 'shalom' ? 'Pagas el envío al recoger en agencia' : carrier === 'olva' ? 'Envío a domicilio prepagado' : formatMoney(method.baseFee)}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  {!chosenMethod && <p role="status">Por ahora no hay métodos de entrega disponibles.</p>}
                  {chosenMethod?.carrier === 'olva' && (
                    <label className="field">Zona de envío Olva
                      <select value={chosenMethod.id} onChange={(e) => { setDeliveryMethod(e.target.value); setTermsAccepted(false); }}>
                        {activeMethods.filter((method) => method.carrier === 'olva').map((method) => (
                          <option key={method.id} value={method.id}>{method.id === 'olva_lima' ? 'Lima y Callao' : 'Provincia'} · {formatMoney(method.baseFee)}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {chosenMethod?.description && <small>{chosenMethod.description}</small>}
                  {chosenMethod && !isPickup && (
                    <div className="pipo-shipping-fields">
                      {chosenMethod.requiresDni && <label className="field">DNI del destinatario
                        <input inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required value={recipientDni}
                          onChange={(e) => setRecipientDni(e.target.value.replace(/[^0-9]/g, ''))} />
                      </label>}
                      <label className="field">{chosenMethod.carrier === 'shalom' ? 'Ciudad / agencia de destino' : 'Región / provincia / distrito'}
                        <input required value={destinationRegion} onChange={(e) => setDestinationRegion(e.target.value)} />
                      </label>
                      {chosenMethod.requiresAddress && <label className="field">Dirección y referencia
                        <input required value={destinationAddress} onChange={(e) => setDestinationAddress(e.target.value)} />
                      </label>}
                    </div>
                  )}
                  {isPickup && <>
                  {/* Delivery Point Selection */}
                  <div className="field">
                    <label>
                      <MapPin size={14} style={{ marginRight: 4 }} /> Elige tu punto de entrega *
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
                        Este punto no tiene horarios disponibles. Elige otro punto o método de entrega.
                      </div>
                    )}
                  </div>

                  </>}
                  <fieldset className="pipo-shipping-fieldset">
                    <legend>Plan de pago</legend>
                    <div className="pipo-shipping-fields">
                      {[['full', 'Pago completo'], ['advance_50', 'Separación 50%']].map(([value, label]) => (
                        <label className="pipo-shipping-choice" key={value}>
                          <input type="radio" name="payment-plan" checked={paymentPlan === value}
                            onChange={() => { setPaymentPlan(value); setTermsAccepted(false); }} />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {paymentPlan === 'advance_50' && (
                    <div className="pipo-separation-note">
                      <p>Guardamos el stock {RESERVATION_HOLD_MINUTES} minutos mientras validamos el Yape. Liquida el saldo hasta 24 horas después del turno acordado.</p>
                      <p>Si no recoges tu pedido, el reembolso descuenta {isPickup
                        ? `${UNAC_RETENTION_RATE * 100}% del adelanto (mínimo ${formatMoney(UNAC_MIN_RETENTION)})`
                        : 'el costo real de envío y embalaje de ida y vuelta'}, hasta el monto pagado.</p>
                      <label className="pipo-shipping-choice"><input type="checkbox" required checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)} /><span>Acepto las condiciones de separación</span></label>
                    </div>
                  )}
                  <dl className="pipo-order-totals">
                    <div><dt>Subtotal productos</dt><dd>{formatMoney(cartSummary.subtotal)}</dd></div>
                    <div><dt>Envío</dt><dd>{collectShipping ? (shippingFee ? `Pago en destino + ${formatMoney(shippingFee)} de tarifa base` : 'Pago en destino') : formatMoney(shippingFee)}</dd></div>
                    <div><dt>Monto a Yapear ahora</dt><dd><strong>{formatMoney(policy.expectedInitialPayment)}</strong></dd></div>
                    <div><dt>Saldo restante</dt><dd>{formatMoney(policy.balanceAfterAdvance)}</dd></div>
                  </dl>
                  {paymentPlan === 'advance_50' && Number(chosenMethod?.minAdvanceAmount) > 0 &&
                    <small>Adelanto de 50% o mínimo de {formatMoney(chosenMethod.minAdvanceAmount)}, sin superar el total.</small>}

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
                      disabled={submittingOrder || !chosenMethod || (isPickup && !availableSlotsForPoint.length) || (paymentPlan === 'advance_50' && !termsAccepted)}
                    >
                      <ShieldCheck size={17} />
                      {submittingOrder
                        ? 'Reservando tu pedido...'
                        : `Pasar al Pago Yape (${formatMoney(policy.expectedInitialPayment)}) →`}
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
                      {formatMoney(paymentToday)}
                    </div>
                    {secondsRemaining !== null && (
                      <p role="timer" className="pipo-reservation-timer">
                        Tiempo para pagar <strong>{Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')}</strong>
                      </p>
                    )}
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
                          activeOrder.amountPaid ?? paymentToday
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

              {checkoutStep === 'expired' && (
                <div className="modal-body">
                  <p role="status">La reserva temporal expiró. Si ya transferiste, avísanos antes de volver a pagar.</p>
                  <button type="button" className="btn btn-primary" onClick={() => setCheckoutOpen(false)}>Volver al catálogo</button>
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
                    {isSeparated ? 'Separación confirmada' : '¡Pago Yape Verificado con Éxito! 🎀'}
                  </h3>
                  <p style={{ margin: '0 auto 16px', maxWidth: 440, color: 'var(--pipo-cocoa)', fontSize: '0.9rem' }}>
                    Tu pedido <strong>{activeOrder.code}</strong> {isSeparated
                      ? `tiene un saldo de ${formatMoney(activeOrder.balanceDue)} pendiente. Liquídalo antes del recojo${activeOrder.deliveryMethod === 'shalom_agency' ? ' o de recibir la clave Shalom' : ''}.`
                      : 'ya está registrado y pagado.'}
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
                      <strong>Monto Pagado:</strong> {formatMoney(activeOrder.amountPaid ?? paymentToday)}
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
                    {activeOrder.deliveryTime && <div>
                      <strong>Horario programado:</strong> {activeOrder.deliveryTime}
                    </div>}
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <a
                      href={`https://wa.me/51${cleanYapeDigits}?text=${encodeURIComponent(
                        `¡Hola Glow with Pipo! 🎀 Mi pago Yape del pedido *${activeOrder.code}* (${formatMoney(
                          activeOrder.amountPaid ?? paymentToday
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

      <ProductDetailModal {...{ StorefrontProductImage, closeProductDetail, detailActiveShadeId, detailProduct: productsById.get(detailProduct?.id) || detailProduct, detailQty, detailShadeViewMode, getCategoryEmoji, handleAddDetailProductToCart, setDetailActiveShadeId, setDetailQty, setDetailShadeViewMode, setSelectedVariantByProduct }} />
      <ComboDetailModal {...{ StorefrontProductImage, closeComboDetail, detailCombo, detailComboMaxQty, detailComboShadeChoices, detailQty, handleAddDetailComboToCart, setDetailComboShadeChoices, setDetailQty }} />
    </div>
  );
}
