import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function StorefrontView({
  fallbackDb,
  isStaffLoggedIn = false,
  onOpenStaffLogin,
  onReturnToErp
}) {
  const [catalog, setCatalog] = useState(() => ({
    categories: [],
    products: [],
    combos: [],
    deliveryPoints: [],
    deliverySlots: [],
    yapeGateway: null
  }));
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState({});
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [justAddedKey, setJustAddedKey] = useState(null);

  // Customizable Combo Shade Picker Modal
  const [customizingCombo, setCustomizingCombo] = useState(null);
  const [comboShadeChoices, setComboShadeChoices] = useState({});

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
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Lock body scroll when modal or cart drawer is open
  useEffect(() => {
    if (checkoutOpen || customizingCombo || isCartOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [checkoutOpen, customizingCombo, isCartOpen]);

  const loadStorefront = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const data = await fetchPublicStorefrontCatalog(fallbackDb);
      const variantsByProd = new Map();
      for (const v of data.variants || []) {
        const arr = variantsByProd.get(v.productId) || [];
        arr.push(v);
        variantsByProd.set(v.productId, arr);
      }
      const productsWithVariants = (data.products || []).map((p) => ({
        ...p,
        variants: p.variants && p.variants.length > 0 ? p.variants : (variantsByProd.get(p.id) || [])
      }));

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
  }, [fallbackDb]);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

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
    try {
      const res = await checkWebOrderYapeStatus(activeOrder.saleId);
      if (res?.verified) {
        setActiveOrder((prev) => ({ ...prev, ...res, verified: true }));
        setCheckoutStep('verified');
        setCart([]);
        loadStorefront();
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
            🌸 Todos ({(catalog.products || []).length})
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
          <div className="pipo-store-loading">
            <RefreshCw size={28} className="pipo-spin" />
            <p>Cargando el catálogo de Glow with Pipo...</p>
          </div>
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
                        <div className="pipo-combo-visual">
                          {combo.imageUrl ? (
                            <img src={combo.imageUrl} alt={combo.name} className="pipo-product-img" />
                          ) : (
                            <div className="pipo-combo-placeholder">
                              <span className="pipo-placeholder-emoji">🎁✨</span>
                              <span className="pipo-placeholder-brand">COMBO PIPO</span>
                            </div>
                          )}
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
                          <h3 className="pipo-product-title">{combo.name}</h3>
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
                          <div className="pipo-product-visual">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="pipo-product-img"
                              />
                            ) : (
                              <div className="pipo-product-placeholder">
                                <span className="pipo-placeholder-emoji">
                                  {getCategoryEmoji(product.category)}
                                </span>
                                <span className="pipo-placeholder-brand">
                                  {product.brand || 'GLOW WITH PIPO'}
                                </span>
                              </div>
                            )}

                            <span className="pipo-product-cat-badge">{product.category}</span>
                            {product.isFeatured && (
                              <span className="pipo-product-featured-badge">⭐ Favorito</span>
                            )}
                          </div>

                          <div className="pipo-product-body">
                            {product.brand && (
                              <div className="pipo-product-brand">{product.brand}</div>
                            )}
                            <h3 className="pipo-product-title">{product.name}</h3>
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
                    <p style={{ margin: '4px 0 12px', fontSize: '0.85rem', color: 'var(--pipo-cocoa)' }}>
                      Yapea el monto exacto desde la cuenta de{' '}
                      <strong style={{ color: 'var(--pipo-burgundy)' }}>
                        {activeOrder.yapeHolderName}
                      </strong>
                    </p>

                    <div className="pipo-yape-number-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                          src={`${import.meta.env.BASE_URL}yape-logo.png`}
                          alt="Yape"
                          style={{ height: 38, width: 'auto' }}
                        />
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--pipo-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                            NÚMERO OFICIAL DE YAPE (FABIANA)
                          </div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--pipo-burgundy)', letterSpacing: '0.04em' }}>
                            {receiverPhone}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--pipo-cocoa)', fontWeight: 600 }}>
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
                      <RefreshCw size={18} className="pipo-spin" color="var(--pipo-burgundy)" />
                      <div>
                        <strong>Esperando tu Yape en tiempo real...</strong>
                        <div style={{ fontSize: '0.76rem', color: 'var(--pipo-muted)' }}>
                          Pedido <strong>{activeOrder.code}</strong> reservado · El detector validará tu abono a nombre de Fabiana.
                        </div>
                      </div>
                    </div>
                  </div>

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
    </div>
  );
}
