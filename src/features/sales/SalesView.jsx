import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Gift,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  XCircle
} from 'lucide-react';
import {
  computeMargins,
  computeSaleTotals,
  formatCurrency,
  formatUnitCost,
  generateNextCode,
  roundMoney,
  toNumber
} from '../../domain/calculations.js';
import { PAYMENT_METHODS, SALE_STATUSES, SOCIAL_PLATFORMS } from '../../domain/constants.js';

function cleanWa(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('51') ? digits : `51${digits}`;
}

export default function SalesView({
  db,
  currentUser,
  onCreateSale,
  onAddPayment,
  onChangeSaleStatus,
  onSaveCustomer,
  onDeleteCustomer
}) {
  const [subTab, setSubTab] = useState('new_sale'); // new_sale | orders | customers
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Sale Creation State
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [saleStatus, setSaleStatus] = useState('pending_delivery');
  const [customerMode, setCustomerMode] = useState(db.customers.length > 0 ? 'existing' : 'new');
  const [selectedCustomerId, setSelectedCustomerId] = useState(db.customers[0]?.id || '');

  // Inline new customer
  const [cName, setCName] = useState('');
  const [cWa, setCWa] = useState('');
  const [cSocial, setCSocial] = useState('tiktok');
  const [cHandle, setCHandle] = useState('');

  // Cart items & supplies
  const [selectedVariantToAdd, setSelectedVariantToAdd] = useState('');
  const [selectedComboToAdd, setSelectedComboToAdd] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [selectedBags, setSelectedBags] = useState({}); // { [supplyId]: quantity }

  // Delivery reminder & payment
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [shippingCharged, setShippingCharged] = useState('0');
  const [initialPaid, setInitialPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('yape');
  const [saleNotes, setSaleNotes] = useState('');

  // Payment Modal for existing order
  const [payingSale, setPayingSale] = useState(null);
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('yape');
  const [payMarkDelivered, setPayMarkDelivered] = useState(true);

  // Voluntary Customer Directory Form
  const [dirId, setDirId] = useState(null);
  const [dirCode, setDirCode] = useState('');
  const [dirName, setDirName] = useState('');
  const [dirWa, setDirWa] = useState('');
  const [dirSocial, setDirSocial] = useState('instagram');
  const [dirHandle, setDirHandle] = useState('');
  const [dirNotes, setDirNotes] = useState('');

  const productsMap = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const variantsMap = useMemo(() => new Map(db.variants.map((v) => [v.id, v])), [db.variants]);
  const customersMap = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);

  const availableVariantOptions = useMemo(() => {
    return db.variants.map((v) => {
      const p = productsMap.get(v.productId);
      return {
        id: v.id,
        variant: v,
        product: p,
        label: p
          ? `${p.name}${p.hasVariants ? ` (${v.shadeName})` : ''} — ${formatCurrency(p.unitPrice)} [Stock: ${v.stock}]`
          : v.shadeName
      };
    });
  }, [db.variants, productsMap]);

  function addSingleVariantToCart() {
    const targetId = selectedVariantToAdd || availableVariantOptions.find((o) => o.variant.stock > 0)?.id;
    if (!targetId) return;
    const v = variantsMap.get(targetId);
    if (!v) return;
    const p = productsMap.get(v.productId);
    if (!p) return;

    setCartItems([
      ...cartItems,
      {
        lineId: Math.random().toString(36).slice(2),
        variantId: v.id,
        sourceComboId: null,
        sourceComboName: '',
        productNameSnapshot: p.name,
        shadeNameSnapshot: v.shadeName,
        quantity: 1,
        unitCostSnapshot: v.unitCost,
        catalogUnitPrice: p.unitPrice,
        catalogComboPrice: p.comboPrice,
        appliedUnitPrice: p.unitPrice,
        pricingMode: 'unit'
      }
    ]);
  }

  function addComboToCart() {
    const combo = db.combos.find((c) => c.id === (selectedComboToAdd || db.combos[0]?.id));
    if (!combo) return;

    const expanded = [];
    for (const ci of combo.items || []) {
      const prod = productsMap.get(ci.productId);
      if (!prod) continue;
      let variant = ci.variantId ? variantsMap.get(ci.variantId) : null;
      if (!variant) {
        variant = db.variants.find((v) => v.productId === prod.id && v.stock > 0) ||
                  db.variants.find((v) => v.productId === prod.id);
      }
      if (!variant) continue;

      const applied =
        ci.customComboUnitPrice !== null && ci.customComboUnitPrice !== undefined
          ? ci.customComboUnitPrice
          : prod.comboPrice;

      expanded.push({
        lineId: Math.random().toString(36).slice(2),
        variantId: variant.id,
        sourceComboId: combo.id,
        sourceComboName: combo.name,
        productNameSnapshot: prod.name,
        shadeNameSnapshot: variant.shadeName,
        quantity: ci.quantity,
        unitCostSnapshot: variant.unitCost,
        catalogUnitPrice: prod.unitPrice,
        catalogComboPrice: prod.comboPrice,
        appliedUnitPrice: applied,
        pricingMode: 'combo'
      });
    }

    setCartItems([...cartItems, ...expanded]);
  }

  // Replace Product X with Product Y inside the sale (preserving combo mode if it came from a combo!)
  function swapCartLineVariant(lineIdx, nextVariantId) {
    const v = variantsMap.get(nextVariantId);
    if (!v) return;
    const p = productsMap.get(v.productId);
    if (!p) return;

    const copy = [...cartItems];
    const prev = copy[lineIdx];
    const nextPrice = prev.pricingMode === 'combo' ? p.comboPrice : p.unitPrice;

    copy[lineIdx] = {
      ...prev,
      variantId: v.id,
      productNameSnapshot: p.name,
      shadeNameSnapshot: v.shadeName,
      unitCostSnapshot: v.unitCost,
      catalogUnitPrice: p.unitPrice,
      catalogComboPrice: p.comboPrice,
      appliedUnitPrice: nextPrice
    };
    setCartItems(copy);
  }

  const suppliesUsedArray = useMemo(() => {
    return Object.entries(selectedBags)
      .filter(([, qty]) => toNumber(qty, 0) > 0)
      .map(([supplyId, qty]) => {
        const sup = db.supplies.find((s) => s.id === supplyId);
        return sup
          ? {
              supplyId: sup.id,
              supplyNameSnapshot: sup.name,
              quantity: Math.max(1, Math.trunc(toNumber(qty, 1))),
              unitCostSnapshot: sup.unitCost
            }
          : null;
      })
      .filter(Boolean);
  }, [selectedBags, db.supplies]);

  const liveTotals = useMemo(() => {
    return computeSaleTotals({
      items: cartItems,
      suppliesUsed: suppliesUsedArray,
      shippingCharged: toNumber(shippingCharged, 0),
      shippingCost: toNumber(shippingCharged, 0),
      payments: toNumber(initialPaid, 0) > 0 ? [{ amount: toNumber(initialPaid, 0) }] : []
    });
  }, [cartItems, suppliesUsedArray, shippingCharged, initialPaid]);

  async function handleSubmitSale(e) {
    e.preventDefault();
    if (cartItems.length === 0) return;

    const payload = {
      saleDate,
      status: saleStatus,
      customerId: customerMode === 'existing' ? selectedCustomerId : null,
      newCustomer:
        customerMode === 'new'
          ? {
              name: cName.trim(),
              whatsapp: cWa.trim(),
              socialPlatform: cSocial,
              socialHandle: cHandle.trim()
            }
          : null,
      deliveryDate,
      deliveryTime,
      deliveryLocation,
      shippingCharged: toNumber(shippingCharged, 0),
      shippingCost: toNumber(shippingCharged, 0),
      initialPaymentAmount: toNumber(initialPaid, 0),
      initialPaymentMethod: paymentMethod,
      initialPaymentConcept:
        toNumber(initialPaid, 0) >= liveTotals.totalCharged && liveTotals.totalCharged > 0
          ? 'full_payment'
          : 'shipping_advance',
      notes: saleNotes,
      createdBy: currentUser?.name || '',
      items: cartItems,
      suppliesUsed: suppliesUsedArray
    };

    await onCreateSale(payload);

    // Reset cart
    setCartItems([]);
    setSelectedBags({});
    setDeliveryDate('');
    setDeliveryTime('');
    setDeliveryLocation('');
    setShippingCharged('0');
    setInitialPaid('0');
    setSaleNotes('');
    setCName('');
    setCWa('');
    setCHandle('');
    setSubTab('orders');
  }

  const filteredSales = useMemo(() => {
    if (statusFilter === 'ALL') return db.sales;
    if (statusFilter === 'UNPAID') {
      return db.sales.filter((s) => s.status !== 'cancelled' && s.balanceDue > 0);
    }
    return db.sales.filter((s) => s.status === statusFilter);
  }, [db.sales, statusFilter]);

  async function handleSaveDirectoryCustomer(e) {
    e.preventDefault();
    if (!dirName.trim() || !dirWa.trim()) return;
    await onSaveCustomer({
      id: dirId,
      code: dirCode,
      name: dirName,
      whatsapp: dirWa,
      socialPlatform: dirSocial,
      socialHandle: dirHandle,
      notes: dirNotes
    });
    setDirId(null);
    setDirCode('');
    setDirName('');
    setDirWa('');
    setDirHandle('');
    setDirNotes('');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos, Ventas y Clientes</h1>
          <p className="page-subtitle">
            Edición de precio exclusiva por venta viendo margen en vivo, bolsitas de presentación, adelantos de envío y agenda de entregas.
          </p>
        </div>
      </div>

      <div className="tabs-row">
        <button
          type="button"
          className={`tab-chip ${subTab === 'new_sale' ? 'active' : ''}`}
          onClick={() => setSubTab('new_sale')}
        >
          <ShoppingBag size={15} /> Registrar Pedido / Venta
        </button>
        <button
          type="button"
          className={`tab-chip ${subTab === 'orders' ? 'active' : ''}`}
          onClick={() => setSubTab('orders')}
        >
          <CalendarClock size={15} /> Listado de Ventas y Entregas ({db.sales.length})
        </button>
        <button
          type="button"
          className={`tab-chip ${subTab === 'customers' ? 'active' : ''}`}
          onClick={() => setSubTab('customers')}
        >
          <Users size={15} /> Directorio de Clientes ({db.customers.length})
        </button>
      </div>

      {/* ==================== TAB 1: NEW SALE ==================== */}
      {subTab === 'new_sale' && (
        <form onSubmit={handleSubmitSale} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Step 1: Customer */}
          <div className="card card-cream">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                1. Cliente del Pedido (WhatsApp y Red Social obligatorios)
              </h3>
              {db.customers.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${customerMode === 'existing' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setCustomerMode('existing')}
                  >
                    Cliente registrado
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${customerMode === 'new' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setCustomerMode('new')}
                  >
                    <UserPlus size={13} /> Nuevo cliente
                  </button>
                </div>
              )}
            </div>

            {customerMode === 'existing' && db.customers.length > 0 ? (
              <div className="form-grid">
                <div className="field">
                  <label>Seleccionar cliente *</label>
                  <select
                    required
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">Elegir cliente...</option>
                    {db.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name} — WA: {c.whatsapp} ({c.socialPlatform})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Fecha del pedido</label>
                  <input type="date" required value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="form-grid">
                <div className="field">
                  <label>Nombre / Alias del cliente *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Valeria Gómez"
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Número de WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. 987654321"
                    value={cWa}
                    onChange={(e) => setCWa(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Red Social de contacto *</label>
                  <div className="category-button-grid" style={{ marginTop: 2 }}>
                    {SOCIAL_PLATFORMS.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        className={`category-pill-btn ${cSocial === sp.id ? 'active' : ''}`}
                        onClick={() => setCSocial(sp.id)}
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Usuario / Link de red social</label>
                  <input
                    type="text"
                    placeholder="Ej. @valeriag"
                    value={cHandle}
                    onChange={(e) => setCHandle(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Products & Predefined Combos */}
          <div className="card">
            <h3 className="card-title">
              2. Productos o Combos Vendidos (Precios editables solo para esta venta)
            </h3>

            <div className="grid-2" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Agregar producto individual</label>
                  <select
                    value={selectedVariantToAdd}
                    onChange={(e) => setSelectedVariantToAdd(e.target.value)}
                  >
                    <option value="">Seleccionar producto / tono...</option>
                    {availableVariantOptions.map((opt) => (
                      <option key={opt.id} value={opt.id} disabled={opt.variant.stock <= 0}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={availableVariantOptions.length === 0}
                  onClick={addSingleVariantToCart}
                >
                  <Plus size={16} /> Añadir
                </button>
              </div>

              {db.combos.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Cargar combo predefinido (expandible)</label>
                    <select
                      value={selectedComboToAdd}
                      onChange={(e) => setSelectedComboToAdd(e.target.value)}
                    >
                      {db.combos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={addComboToCart}>
                    <Sparkles size={16} /> Cargar Combo
                  </button>
                </div>
              )}
            </div>

            {cartItems.length === 0 ? (
              <div className="empty-box">
                Aún no has agregado productos a esta venta. Elige un producto o un combo arriba.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {liveTotals.items.map((item, idx) => {
                  const v = variantsMap.get(item.variantId);
                  return (
                    <div
                      key={item.lineId || idx}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: item.isLoss ? 'var(--status-err-bg)' : 'var(--pipo-ivory)',
                        border: '1px solid rgba(199,143,133,0.45)'
                      }}
                    >
                      {item.sourceComboName && (
                        <div style={{ marginBottom: 6 }}>
                          <span className="badge badge-brand">
                            Combo: {item.sourceComboName} (puedes cambiar el producto abajo solo por esta venta)
                          </span>
                        </div>
                      )}

                      <div className="form-grid" style={{ alignItems: 'end' }}>
                        <div className="field">
                          <label>Producto / Tono (intercambiable X → Y)</label>
                          <select
                            value={item.variantId}
                            onChange={(e) => swapCartLineVariant(idx, e.target.value)}
                          >
                            {availableVariantOptions.map((opt) => (
                              <option
                                key={opt.id}
                                value={opt.id}
                                disabled={opt.variant.stock <= 0 && opt.id !== item.variantId}
                              >
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <label>Cantidad (disp: {v?.stock ?? 0})</label>
                          <input
                            type="number"
                            min="1"
                            max={v?.stock || 999}
                            value={item.quantity}
                            onChange={(e) => {
                              const copy = [...cartItems];
                              copy[idx] = { ...copy[idx], quantity: e.target.value };
                              setCartItems(copy);
                            }}
                          />
                        </div>

                        <div className="field">
                          <label>Modo de precio rápido</label>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button
                              type="button"
                              className={`btn btn-sm ${item.pricingMode === 'unit' ? 'btn-primary' : 'btn-ghost'}`}
                              onClick={() => {
                                const copy = [...cartItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  pricingMode: 'unit',
                                  appliedUnitPrice: copy[idx].catalogUnitPrice
                                };
                                setCartItems(copy);
                              }}
                            >
                              Unit. ({formatCurrency(item.catalogUnitPrice)})
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${item.pricingMode === 'combo' ? 'btn-primary' : 'btn-ghost'}`}
                              onClick={() => {
                                const copy = [...cartItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  pricingMode: 'combo',
                                  appliedUnitPrice: copy[idx].catalogComboPrice
                                };
                                setCartItems(copy);
                              }}
                            >
                              Combo ({formatCurrency(item.catalogComboPrice)})
                            </button>
                          </div>
                        </div>

                        <div className="field">
                          <label>Precio Unit. en ESTA venta (S/)</label>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.appliedUnitPrice}
                              onChange={(e) => {
                                const copy = [...cartItems];
                                copy[idx] = {
                                  ...copy[idx],
                                  appliedUnitPrice: e.target.value,
                                  pricingMode: 'custom'
                                };
                                setCartItems(copy);
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setCartItems(cartItems.filter((_, i) => i !== idx))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Always-visible Unit Cost, Margin %, and Line Profit */}
                      <div
                        style={{
                          marginTop: 8,
                          paddingTop: 7,
                          borderTop: '1px dashed rgba(199,143,133,0.4)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                          fontSize: '0.82rem'
                        }}
                      >
                        <span>
                          Costo unitario: <strong>{formatUnitCost(item.unitCostSnapshot)}</strong> · Margen:{' '}
                          <strong style={{ color: item.isLoss ? '#9b1c1c' : 'var(--status-ok-fg)' }}>
                            {item.marginPercent}%
                          </strong>
                        </span>
                        <span>
                          Subtotal línea: <strong>{formatCurrency(item.lineRevenue)}</strong> · Ganancia del ítem:{' '}
                          <strong style={{ color: item.isLoss ? '#9b1c1c' : 'var(--status-ok-fg)' }}>
                            {formatCurrency(item.lineProfit)}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: Decorated Bags + Delivery Reminder + Shipping & Advance Payment */}
          <div className="grid-2">
            <div className="card">
              <h3 className="card-title">
                <Gift size={18} /> 3. Bolsita Decorada y Agenda de Entrega
              </h3>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.83rem', fontWeight: 800, color: 'var(--pipo-cocoa)', marginBottom: 6 }}>
                  Presentación (costo asumido por nosotros, no se cobra al cliente):
                </div>
                {db.supplies.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--pipo-muted)', margin: 0 }}>
                    Si deseas descontar bolsitas decoradas, regístralas primero en Stock → Bolsitas e Insumos.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {db.supplies.map((sup) => {
                      const checked = toNumber(selectedBags[sup.id], 0) > 0;
                      return (
                        <div
                          key={sup.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '7px 10px',
                            borderRadius: 9,
                            background: checked ? 'rgba(236,208,196,0.45)' : 'var(--pipo-ivory)',
                            border: '1px solid rgba(199,143,133,0.4)'
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input
                              type="checkbox"
                              disabled={sup.stock <= 0 && !checked}
                              checked={checked}
                              onChange={(e) => {
                                setSelectedBags({
                                  ...selectedBags,
                                  [sup.id]: e.target.checked ? 1 : 0
                                });
                              }}
                              style={{ width: 17, height: 17 }}
                            />
                            <span>
                              <strong>{sup.name}</strong> (Costo: {formatUnitCost(sup.unitCost)} · Stock: {sup.stock})
                            </span>
                          </label>
                          {checked && (
                            <input
                              type="number"
                              min="1"
                              max={sup.stock}
                              value={selectedBags[sup.id]}
                              onChange={(e) =>
                                setSelectedBags({ ...selectedBags, [sup.id]: e.target.value })
                              }
                              style={{ width: 60, padding: 5, borderRadius: 6, border: '1px solid var(--pipo-rosewood)' }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Estado del pedido</label>
                  <div className="category-button-grid" style={{ marginTop: 2 }}>
                    <button
                      type="button"
                      className={`category-pill-btn ${saleStatus === 'pending_delivery' ? 'active' : ''}`}
                      onClick={() => setSaleStatus('pending_delivery')}
                    >
                      Reservado (Por Entregar)
                    </button>
                    <button
                      type="button"
                      className={`category-pill-btn ${saleStatus === 'delivered' ? 'active' : ''}`}
                      onClick={() => setSaleStatus('delivered')}
                    >
                      Entregado en el Acto
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Fecha acordada de entrega</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Hora acordada</label>
                  <input
                    type="time"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Lugar de entrega acordado</label>
                  <input
                    type="text"
                    placeholder="Ej. Estación Central / Mall Bellavista"
                    value={deliveryLocation}
                    onChange={(e) => setDeliveryLocation(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="card card-cream">
              <h3 className="card-title">
                <CreditCard size={18} /> 4. Envío Adelantado, Pago y Ganancia Neta
              </h3>

              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>Costo de envío (adelantado S/)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={shippingCharged}
                    onChange={(e) => setShippingCharged(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>¿Cuánto nos pagó ya? (S/)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={initialPaid}
                    onChange={(e) => setInitialPaid(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 7px', fontSize: '0.72rem' }}
                      onClick={() => setInitialPaid('0')}
                    >
                      Aún no pagó (S/ 0)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 7px', fontSize: '0.72rem' }}
                      onClick={() => setInitialPaid(String(toNumber(shippingCharged, 0)))}
                    >
                      Pagó envío
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 7px', fontSize: '0.72rem' }}
                      onClick={() => setInitialPaid(String(liveTotals.totalCharged))}
                    >
                      Pagó todo
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>Medio de pago recibido</label>
                  <div className="category-button-grid" style={{ marginTop: 2 }}>
                    {PAYMENT_METHODS.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        className={`category-pill-btn ${paymentMethod === pm.id ? 'active' : ''}`}
                        onClick={() => setPaymentMethod(pm.id)}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Nota opcional</label>
                  <input
                    type="text"
                    placeholder="Ej. Paga resto en Yape al entregar"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Financial Summary Box */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: '#fff',
                  border: '1.5px solid rgba(199,143,133,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: '0.88rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Productos ({liveTotals.totalUnits} uds):</span>
                  <strong>{formatCurrency(liveTotals.productsRevenue)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--pipo-muted)' }}>
                  <span>Costo mercadería + bolsitas ({formatCurrency(liveTotals.suppliesCost)}):</span>
                  <span>-{formatCurrency(roundMoney(liveTotals.productsCost + liveTotals.suppliesCost))}</span>
                </div>
                {liveTotals.shippingCharged > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Envío:</span>
                    <span>{formatCurrency(liveTotals.shippingCharged)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid rgba(199,143,133,0.35)',
                    paddingTop: 6,
                    fontSize: '1rem'
                  }}
                >
                  <strong>Total a cobrar al cliente:</strong>
                  <strong style={{ color: 'var(--pipo-burgundy)' }}>{formatCurrency(liveTotals.totalCharged)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Abonado hoy / Saldo pendiente:</span>
                  <span>
                    <strong>{formatCurrency(liveTotals.amountPaid)}</strong> /{' '}
                    <strong style={{ color: liveTotals.balanceDue > 0 ? '#9b1c1c' : 'var(--status-ok-fg)' }}>
                      {formatCurrency(liveTotals.balanceDue)}
                    </strong>
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    background: 'var(--status-ok-bg)',
                    color: 'var(--status-ok-fg)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    marginTop: 4
                  }}
                >
                  <strong>Ganancia Neta Real de esta Venta:</strong>
                  <strong>{formatCurrency(liveTotals.netProfit)}</strong>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={cartItems.length === 0}
                style={{ width: '100%', marginTop: 12, padding: '12px 18px', fontSize: '0.96rem' }}
              >
                Confirmar y Guardar Pedido / Venta
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ==================== TAB 2: ORDERS & DELIVERIES ==================== */}
      {subTab === 'orders' && (
        <div>
          <div className="tabs-row">
            <button
              type="button"
              className={`tab-chip ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              Todas ({db.sales.length})
            </button>
            <button
              type="button"
              className={`tab-chip ${statusFilter === 'pending_delivery' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pending_delivery')}
            >
              Pendientes de entrega
            </button>
            <button
              type="button"
              className={`tab-chip ${statusFilter === 'UNPAID' ? 'active' : ''}`}
              onClick={() => setStatusFilter('UNPAID')}
            >
              Con saldo por cobrar
            </button>
            <button
              type="button"
              className={`tab-chip ${statusFilter === 'delivered' ? 'active' : ''}`}
              onClick={() => setStatusFilter('delivered')}
            >
              Entregadas
            </button>
            <button
              type="button"
              className={`tab-chip ${statusFilter === 'cancelled' ? 'active' : ''}`}
              onClick={() => setStatusFilter('cancelled')}
            >
              Canceladas
            </button>
          </div>

          {filteredSales.length === 0 ? (
            <div className="card empty-box">No hay ventas en esta categoría.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredSales.map((sale) => {
                const cust = customersMap.get(sale.customerId);
                const statusInfo = SALE_STATUSES[sale.status] || SALE_STATUSES.pending_delivery;
                const wa = cleanWa(cust?.whatsapp);

                return (
                  <div key={sale.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '1.08rem', color: 'var(--pipo-burgundy)' }}>
                            {sale.code}
                          </strong>
                          <span className={`badge ${statusInfo.badgeClass}`}>{statusInfo.label}</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--pipo-muted)' }}>
                            Fecha pedido: {sale.saleDate}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: '0.9rem' }}>
                          Cliente: <strong>{cust?.name || 'Cliente'}</strong> ({cust?.code}) ·{' '}
                          <span style={{ textTransform: 'capitalize' }}>{cust?.socialPlatform}</span>
                          {cust?.socialHandle ? ` (${cust.socialHandle})` : ''}
                        </div>
                        {(sale.deliveryDate || sale.deliveryLocation) && (
                          <div style={{ marginTop: 4, fontSize: '0.83rem', color: 'var(--pipo-cocoa)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MapPin size={14} />
                            <span>
                              Entrega acordada: <strong>{sale.deliveryDate || 'Sin fecha'}</strong>
                              {sale.deliveryTime ? ` a las ${sale.deliveryTime}` : ''} —{' '}
                              {sale.deliveryLocation || 'Lugar por definir'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="order-header-totals">
                        <div style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--pipo-burgundy)' }}>
                          Total venta: {formatCurrency(sale.totalCharged)}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--status-ok-fg)', fontWeight: 700 }}>
                          Costo venta: {formatCurrency(roundMoney(sale.productsCost + sale.suppliesCost))} · Ganancia neta: {formatCurrency(sale.netProfit)}
                        </div>
                        <div style={{ fontSize: '0.82rem', marginTop: 2 }}>
                          Pagó: <strong>{formatCurrency(sale.amountPaid)}</strong> · Saldo:{' '}
                          <strong style={{ color: sale.balanceDue > 0 ? '#9b1c1c' : 'var(--status-ok-fg)' }}>
                            {formatCurrency(sale.balanceDue)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Items Sold */}
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'var(--pipo-ivory)', fontSize: '0.84rem' }}>
                      <div>
                        <strong>Productos ({sale.totalUnits} uds):</strong>{' '}
                        {(sale.items || []).map((it, idx) => (
                          <span key={idx}>
                            {idx > 0 ? ' · ' : ''}
                            {it.quantity}x {it.productNameSnapshot}
                            {it.shadeNameSnapshot && it.shadeNameSnapshot !== 'Único' ? ` (${it.shadeNameSnapshot})` : ''} a{' '}
                            {formatCurrency(it.appliedUnitPrice)}
                          </span>
                        ))}
                      </div>
                      {(sale.suppliesUsed || []).length > 0 && (
                        <div style={{ marginTop: 4, color: 'var(--pipo-cocoa)' }}>
                          🎁 Empaque usado:{' '}
                          {sale.suppliesUsed.map((s) => `${s.quantity}x ${s.supplyNameSnapshot} (${formatCurrency(s.totalCost)})`).join(', ')}
                        </div>
                      )}
                      {(sale.payments || []).length > 0 && (
                        <div style={{ marginTop: 4, color: 'var(--pipo-muted)' }}>
                          💳 Pagos registrados:{' '}
                          {sale.payments
                            .map((p) => `${formatCurrency(p.amount)} (${p.method.toUpperCase()})`)
                            .join(' + ')}
                        </div>
                      )}
                    </div>

                    {/* Order Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {wa && (
                        <a
                          href={`https://wa.me/${wa}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          <MessageCircle size={14} /> WhatsApp ({cust.whatsapp})
                        </a>
                      )}

                      {sale.status !== 'cancelled' && sale.balanceDue > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setPayingSale(sale);
                            setPayAmt(String(sale.balanceDue));
                            setPayMethod('yape');
                            setPayMarkDelivered(sale.status === 'pending_delivery');
                          }}
                        >
                          <CreditCard size={14} /> Registrar Pago / Saldo
                        </button>
                      )}

                      {sale.status === 'pending_delivery' && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onChangeSaleStatus(sale.id, 'delivered')}
                        >
                          <CheckCircle2 size={14} /> Marcar Entregado
                        </button>
                      )}

                      {sale.status !== 'cancelled' && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onChangeSaleStatus(sale.id, 'cancelled')}
                        >
                          <XCircle size={14} /> Cancelar (devolver stock)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: CUSTOMERS DIRECTORY ==================== */}
      {subTab === 'customers' && (
        <div className="grid-2">
          <div className="card card-cream">
            <h3 className="card-title">
              <UserPlus size={18} /> {dirId ? 'Editar Cliente' : 'Registrar Cliente Voluntariamente'}
            </h3>
            <form onSubmit={handleSaveDirectoryCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid">
                <div className="field">
                  <label>Código de cliente</label>
                  <input
                    type="text"
                    placeholder={generateNextCode('CLI', db.customers)}
                    value={dirCode}
                    onChange={(e) => setDirCode(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Nombre / Alias *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Camila Rojas"
                    value={dirName}
                    onChange={(e) => setDirName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Número de WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. 987654321"
                    value={dirWa}
                    onChange={(e) => setDirWa(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Red Social</label>
                  <select value={dirSocial} onChange={(e) => setDirSocial(e.target.value)}>
                    {SOCIAL_PLATFORMS.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Usuario o Link</label>
                  <input
                    type="text"
                    placeholder="Ej. @camilarojas"
                    value={dirHandle}
                    onChange={(e) => setDirHandle(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label>Preferencias o notas</label>
                <input
                  type="text"
                  placeholder="Ej. Prefiere tonos cálidos / entrega en San Miguel"
                  value={dirNotes}
                  onChange={(e) => setDirNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">
                  {dirId ? 'Guardar Cambios' : 'Agregar al Listado de Clientes'}
                </button>
                {dirId && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setDirId(null);
                      setDirCode('');
                      setDirName('');
                      setDirWa('');
                      setDirHandle('');
                      setDirNotes('');
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h3 className="card-title">Listado de Clientes ({db.customers.length})</h3>
            {db.customers.length === 0 ? (
              <div className="empty-box">Aún no hay clientes registrados.</div>
            ) : (
              <div className="table-wrap">
                <table className="pipo-table mobile-cards">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Cliente</th>
                      <th>WhatsApp / Red</th>
                      <th>Compras</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.customers.map((c) => {
                      const ordersCount = db.sales.filter(
                        (s) => s.customerId === c.id && s.status !== 'cancelled'
                      ).length;
                      const wa = cleanWa(c.whatsapp);
                      return (
                        <tr key={c.id}>
                          <td data-label="Código" style={{ fontWeight: 700 }}>{c.code}</td>
                          <td data-label="Cliente">
                            <strong>{c.name}</strong>
                            {c.notes && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--pipo-muted)' }}>{c.notes}</div>
                            )}
                          </td>
                          <td data-label="WhatsApp / Red">
                            {wa ? (
                              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ color: 'var(--pipo-burgundy)', fontWeight: 700 }}>
                                {c.whatsapp}
                              </a>
                            ) : (
                              c.whatsapp
                            )}
                            <div style={{ fontSize: '0.76rem', color: 'var(--pipo-muted)', textTransform: 'capitalize' }}>
                              {c.socialPlatform} {c.socialHandle ? `· ${c.socialHandle}` : ''}
                            </div>
                          </td>
                          <td data-label="Compras">
                            <span className="badge badge-brand">{ordersCount} pedidos</span>
                          </td>
                          <td data-label="Acciones" style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                title="Editar cliente"
                                onClick={() => {
                                  setDirId(c.id);
                                  setDirCode(c.code);
                                  setDirName(c.name);
                                  setDirWa(c.whatsapp);
                                  setDirSocial(c.socialPlatform || 'instagram');
                                  setDirHandle(c.socialHandle || '');
                                  setDirNotes(c.notes || '');
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                              >
                                <Pencil size={14} /> Editar
                              </button>
                              {onDeleteCustomer && ordersCount === 0 && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: '#c53030' }}
                                  title="Eliminar cliente sin pedidos"
                                  onClick={() => {
                                    if (window.confirm(`¿Eliminar al cliente "${c.name}"?`)) {
                                      onDeleteCustomer(c.id);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: REGISTER PAYMENT ==================== */}
      {payingSale && (
        <div className="modal-backdrop" onClick={() => setPayingSale(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="card-title">Registrar Pago — {payingSale.code}</h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--pipo-muted)', marginTop: 0 }}>
              Saldo pendiente actual: <strong>{formatCurrency(payingSale.balanceDue)}</strong>
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onAddPayment(payingSale.id, {
                  amount: toNumber(payAmt, 0),
                  method: payMethod,
                  markDelivered: payMarkDelivered
                });
                setPayingSale(null);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div className="field">
                <label>Monto recibido (S/) *</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.01"
                  required
                  value={payAmt}
                  onChange={(e) => setPayAmt(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Método de pago</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.label}
                    </option>
                  ))}
                </select>
              </div>

              {payingSale.status === 'pending_delivery' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={payMarkDelivered}
                    onChange={(e) => setPayMarkDelivered(e.target.checked)}
                    style={{ width: 17, height: 17 }}
                  />
                  Marcar también este pedido como Entregado
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setPayingSale(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
