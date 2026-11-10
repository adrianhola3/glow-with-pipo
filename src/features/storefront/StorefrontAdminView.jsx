import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Image,
  MapPin,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wifi,
  Zap
} from 'lucide-react';
import { formatMoney } from '../../domain/calculations.js';

export default function StorefrontAdminView({
  db,
  onSaveDeliveryPoint,
  onDeleteDeliveryPoint,
  onSaveDeliverySlot,
  onDeleteDeliverySlot,
  onUpdateStorefrontMerchandising,
  onUpdateYapeGateway,
  onSimulateYapeNotification,
  onOpenPublicStorefront,
  onNavigateToSales
}) {
  const [subTab, setSubTab] = useState('delivery'); // 'delivery' | 'curation' | 'yape'

  // Delivery Point Form State
  const [editingPointId, setEditingPointId] = useState(null);
  const [pointName, setPointName] = useState('');
  const [pointZone, setPointZone] = useState('universidad');
  const [pointRef, setPointRef] = useState('');

  // Delivery Slot Form State
  const [slotPointId, setSlotPointId] = useState(() => db.deliveryPoints?.[0]?.id || '');
  const [slotDayLabel, setSlotDayLabel] = useState('');
  const [slotTimeRange, setSlotTimeRange] = useState('');
  const [slotDate, setSlotDate] = useState('');
  const [slotMaxOrders, setSlotMaxOrders] = useState('15');

  // Visual Curation State & Pagination
  const [curationSearch, setCurationSearch] = useState('');
  const [curationFilter, setCurationFilter] = useState('ALL'); // 'ALL' | 'PRODUCTS' | 'COMBOS'
  const [curationPage, setCurationPage] = useState(1);
  const CURATION_PAGE_SIZE = 12;

  const [editingItem, setEditingItem] = useState(null);
  const [curationActiveTab, setCurationActiveTab] = useState('main'); // 'main' | 'shades'
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editShadesImageUrl, setEditShadesImageUrl] = useState('');
  const [editVariantImages, setEditVariantImages] = useState({});
  const [editPublicDesc, setEditPublicDesc] = useState('');
  const [editIsVisible, setEditIsVisible] = useState(true);
  const [editIsFeatured, setEditIsFeatured] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (editingItem) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [editingItem]);

  // Reset pagination on filter or search change
  useEffect(() => {
    setCurationPage(1);
  }, [curationSearch, curationFilter]);

  // Yape Simulator & Gateway State
  const [simSenderName, setSimSenderName] = useState('');
  const [simAmount, setSimAmount] = useState('');
  const [simOpCode, setSimOpCode] = useState('');
  const [simulating, setSimulating] = useState(false);

  const deliveryPoints = db.deliveryPoints || [];
  const deliverySlots = db.deliverySlots || [];
  const yapeGateway = db.yapeGateway || {
    isAwake: true,
    batteryLevel: 95,
    notificationsEnabled: true,
    receiverPhone: '+51 948 254 832',
    receiverName: 'Fabiana'
  };

  const webOrders = useMemo(
    () => (db.sales || []).filter((s) => s.orderSource === 'web'),
    [db.sales]
  );

  const pendingWebOrders = useMemo(
    () =>
      webOrders.filter(
        (s) =>
          (s.paymentVerificationStatus === 'pending_yape_verification' ||
            s.paymentVerificationStatus === 'pending_verification') &&
          s.status !== 'cancelled'
      ),
    [webOrders]
  );

  function handleSubmitPoint(e) {
    e.preventDefault();
    if (!pointName.trim()) return;
    onSaveDeliveryPoint({
      id: editingPointId || undefined,
      name: pointName.trim(),
      zoneType: pointZone,
      referenceInfo: pointRef.trim(),
      active: true
    });
    setEditingPointId(null);
    setPointName('');
    setPointRef('');
  }

  function handleEditPoint(pt) {
    setEditingPointId(pt.id);
    setPointName(pt.name);
    setPointZone(pt.zoneType || 'punto_especifico');
    setPointRef(pt.referenceInfo || '');
  }

  function handleSubmitSlot(e) {
    e.preventDefault();
    const targetPoint = slotPointId || deliveryPoints[0]?.id;
    if (!targetPoint || !slotDayLabel.trim() || !slotTimeRange.trim()) return;
    onSaveDeliverySlot({
      deliveryPointId: targetPoint,
      dayLabel: slotDayLabel.trim(),
      timeRange: slotTimeRange.trim(),
      slotDate: slotDate || null,
      maxOrders: Number(slotMaxOrders) || 15,
      active: true
    });
    setSlotDayLabel('');
    setSlotTimeRange('');
    setSlotDate('');
  }

  function openCurationModal(entityType, item) {
    const itemVariants =
      entityType === 'product'
        ? (db.variants || []).filter((v) => v.productId === item.id)
        : [];
    const varImgMap = {};
    itemVariants.forEach((v) => {
      varImgMap[v.id] = v.imageUrl || '';
    });

    setEditingItem({ entityType, ...item, _variants: itemVariants });
    setCurationActiveTab('main');
    setEditImageUrl(item.imageUrl || '');
    setEditShadesImageUrl(item.shadesImageUrl || '');
    setEditVariantImages(varImgMap);
    setEditPublicDesc(item.publicDescription || item.description || '');
    setEditIsVisible(item.isVisiblePublic !== false);
    setEditIsFeatured(Boolean(item.isFeatured));
  }

  function handleImageFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleShadesImageFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditShadesImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleVariantImageFileUpload(varId, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditVariantImages((prev) => ({
          ...prev,
          [varId]: reader.result
        }));
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSaveCuration(e) {
    e.preventDefault();
    if (!editingItem) return;
    onUpdateStorefrontMerchandising({
      entityType: editingItem.entityType,
      id: editingItem.id,
      imageUrl: editImageUrl.trim(),
      shadesImageUrl: editShadesImageUrl.trim(),
      variantImages: editVariantImages,
      publicDescription: editPublicDesc.trim(),
      isVisiblePublic: editIsVisible,
      isFeatured: editIsFeatured
    });
    setEditingItem(null);
  }

  async function handleRunYapeSimulation(e) {
    e.preventDefault();
    if (!simSenderName.trim() || !simAmount) return;
    setSimulating(true);
    try {
      await onSimulateYapeNotification({
        senderName: simSenderName.trim(),
        amount: Number(simAmount),
        operationCode: simOpCode.trim() || String(Math.floor(100000 + Math.random() * 900000))
      });
      setSimSenderName('');
      setSimAmount('');
      setSimOpCode('');
    } finally {
      setSimulating(false);
    }
  }

  const filteredCurationProducts = useMemo(() => {
    if (curationFilter === 'COMBOS') return [];
    const q = curationSearch.trim().toLowerCase();
    return (db.products || []).filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q)
      );
    });
  }, [db.products, curationFilter, curationSearch]);

  const filteredCurationCombos = useMemo(() => {
    if (curationFilter === 'PRODUCTS') return [];
    const q = curationSearch.trim().toLowerCase();
    return (db.combos || []).filter((c) => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q);
    });
  }, [db.combos, curationFilter, curationSearch]);

  const allCurationItems = useMemo(() => {
    const combos = filteredCurationCombos.map((c) => ({ ...c, _curationType: 'combo' }));
    const prods = filteredCurationProducts.map((p) => ({ ...p, _curationType: 'product' }));
    return [...combos, ...prods];
  }, [filteredCurationCombos, filteredCurationProducts]);

  const totalCurationPages = Math.max(1, Math.ceil(allCurationItems.length / CURATION_PAGE_SIZE));
  const paginatedCurationItems = useMemo(() => {
    const start = (curationPage - 1) * CURATION_PAGE_SIZE;
    return allCurationItems.slice(start, start + CURATION_PAGE_SIZE);
  }, [allCurationItems, curationPage]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Top Banner */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #fffdf9 0%, #f9f3e6 100%)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div>
            <span className="badge badge-brand">🌸 Gestión de Tienda Web &amp; Entregas</span>
            <h1 className="page-title" style={{ marginTop: 6 }}>
              Tienda Pública, Puntos de Entrega y Validador Yape
            </h1>
            <p className="page-subtitle">
              Programa los lugares y horarios de entrega, personaliza las fotos de los productos y
              supervisa los pedidos web en vivo.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenPublicStorefront}
          >
            <ExternalLink size={16} /> Ver Tienda Web de Clientes
          </button>
        </div>

        {/* Sub-navigation tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${subTab === 'delivery' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSubTab('delivery')}
          >
            <MapPin size={15} /> 1. Puntos y Horarios de Entrega ({deliveryPoints.length})
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'curation' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSubTab('curation')}
          >
            <Image size={15} /> 2. Personalizar Vitrina y Fotos ({(db.products || []).length + (db.combos || []).length})
          </button>
          <button
            type="button"
            className={`btn ${subTab === 'yape' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSubTab('yape')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <img
              src={`${import.meta.env.BASE_URL}yape-logo.png`}
              alt="Yape"
              style={{ height: 17, width: 'auto' }}
            />
            <span>3. Validador Yape &amp; Pedidos Web ({webOrders.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DELIVERY POINTS & AVAILABILITY SCHEDULER */}
      {subTab === 'delivery' && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Left Column: Meeting Points (UNAC, Train Stations, etc.) */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">📍 Puntos Oficiales de Entrega</h2>
                <p className="card-subtitle">
                  Lugares donde tú y Fabiana entregan pedidos (UNAC, estaciones del tren, malls).
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitPoint} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div className="grid-2">
                <div className="field">
                  <label>Nombre del Punto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. UNAC — Puerta Principal / FCA"
                    value={pointName}
                    onChange={(e) => setPointName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Tipo de Zona</label>
                  <select value={pointZone} onChange={(e) => setPointZone(e.target.value)}>
                    <option value="universidad">🎓 Campus Universitario (UNAC)</option>
                    <option value="estacion_tren">🚆 Estación de Tren Eléctrico</option>
                    <option value="centro_comercial">🛍️ Centro Comercial / Mall</option>
                    <option value="punto_especifico">📍 Otro Punto Específico</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Referencia / Instrucciones para el cliente</label>
                <input
                  type="text"
                  placeholder="Ej. Entrega en torniquetes / Pabellón de Sistemas"
                  value={pointRef}
                  onChange={(e) => setPointRef(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {editingPointId && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditingPointId(null);
                      setPointName('');
                      setPointRef('');
                    }}
                  >
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-primary btn-sm">
                  <Plus size={15} /> {editingPointId ? 'Actualizar Punto' : 'Agregar Punto de Entrega'}
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deliveryPoints.map((pt) => (
                <div
                  key={pt.id}
                  style={{
                    background: 'var(--pipo-ivory)',
                    border: '1px solid var(--pipo-border)',
                    borderRadius: 14,
                    padding: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong style={{ color: 'var(--pipo-burgundy)' }}>{pt.name}</strong>
                      <span className={`badge ${pt.active !== false ? 'badge-ok' : 'badge-warn'}`}>
                        {pt.active !== false ? 'Activo' : 'Pausado'}
                      </span>
                    </div>
                    {pt.referenceInfo && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--pipo-muted)', marginTop: 2 }}>
                        {pt.referenceInfo}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEditPoint(pt)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        onSaveDeliveryPoint({ ...pt, active: pt.active === false })
                      }
                    >
                      {pt.active !== false ? 'Pausar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--status-danger-fg)' }}
                      onClick={() => onDeleteDeliveryPoint(pt.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Scheduled Time Slots */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">🕒 Programar Disponibilidad de Horarios</h2>
                <p className="card-subtitle">
                  Define qué días y a qué horas estarán disponibles tú o Fabiana en cada punto.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitSlot} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div className="field">
                <label>Punto de Entrega *</label>
                <select
                  value={slotPointId || deliveryPoints[0]?.id || ''}
                  onChange={(e) => setSlotPointId(e.target.value)}
                  required
                >
                  {deliveryPoints.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>Día o Etiqueta *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Jueves 12 Nov / Lunes a Viernes"
                    value={slotDayLabel}
                    onChange={(e) => setSlotDayLabel(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Rango de Hora *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 1:00 PM - 2:30 PM"
                    value={slotTimeRange}
                    onChange={(e) => setSlotTimeRange(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>Fecha específica (Opcional)</label>
                  <input
                    type="date"
                    value={slotDate}
                    onChange={(e) => setSlotDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Cupos máximos en ese horario</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={slotMaxOrders}
                    onChange={(e) => setSlotMaxOrders(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Clock size={15} /> Publicar Horario de Entrega
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deliverySlots.map((slot) => {
                const pt = deliveryPoints.find((p) => p.id === slot.deliveryPointId);
                return (
                  <div
                    key={slot.id}
                    style={{
                      background: 'var(--pipo-surface)',
                      border: '1px solid var(--pipo-border)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--pipo-cocoa)' }}>
                        📍 {pt?.name || 'Punto de entrega'}
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--pipo-burgundy)', fontSize: '0.9rem' }}>
                        {slot.dayLabel} · <span style={{ color: 'var(--pipo-espresso)' }}>{slot.timeRange}</span>
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--pipo-muted)' }}>
                        Reservas: {slot.bookedOrders || 0} / {slot.maxOrders || 10} cupos
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--status-danger-fg)' }}
                      onClick={() => onDeleteDeliverySlot(slot.id)}
                      title="Eliminar horario"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STOREFRONT VISUAL CURATION (PHOTOS, DESCRIPTIONS, VISIBILITY) */}
      {subTab === 'curation' && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="card-title">🎀 Curaduría Estética de Productos y Combos</h2>
              <p className="card-subtitle">
                Por defecto, cada producto nuevo registrado en Stock aparece automáticamente en la
                web. Aquí puedes subir su foto, añadir una descripción atractiva o destacarlo.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Buscar producto o combo..."
                value={curationSearch}
                onChange={(e) => setCurationSearch(e.target.value)}
                style={{ width: 220 }}
              />
              <select
                value={curationFilter}
                onChange={(e) => setCurationFilter(e.target.value)}
                style={{ width: 160 }}
              >
                <option value="ALL">Todos</option>
                <option value="PRODUCTS">Solo Productos</option>
                <option value="COMBOS">Solo Combos</option>
              </select>
            </div>
          </div>

          <div className="pipo-curation-grid">
            {paginatedCurationItems.map((item) => {
              if (item._curationType === 'combo') {
                const combo = item;
                return (
                  <div key={`combo-${combo.id}`} className="pipo-curation-card">
                    <div className="pipo-curation-thumb">
                      {combo.imageUrl ? (
                        <img src={combo.imageUrl} alt={combo.name} />
                      ) : (
                        <span>🎁 Combo</span>
                      )}
                    </div>
                    <div className="pipo-curation-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="badge badge-brand">COMBO</span>
                        <strong>{combo.name}</strong>
                      </div>
                      <p style={{ margin: '4px 0', fontSize: '0.78rem', color: 'var(--pipo-muted)' }}>
                        {combo.publicDescription || combo.description || 'Sin descripción pública'}
                      </p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openCurationModal('combo', combo)}
                        >
                          <Image size={13} /> Personalizar Foto / Texto
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            onUpdateStorefrontMerchandising({
                              entityType: 'combo',
                              id: combo.id,
                              isVisiblePublic: combo.isVisiblePublic === false
                            })
                          }
                        >
                          {combo.isVisiblePublic !== false ? (
                            <>
                              <Eye size={13} /> Visible en Web
                            </>
                          ) : (
                            <>
                              <EyeOff size={13} /> Oculto
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              const prod = item;
              return (
                <div key={`prod-${prod.id}`} className="pipo-curation-card">
                  <div className="pipo-curation-thumb">
                    {prod.imageUrl ? (
                      <img src={prod.imageUrl} alt={prod.name} />
                    ) : (
                      <span>💄 Sin foto</span>
                    )}
                  </div>
                  <div className="pipo-curation-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="badge badge-ok">{prod.category}</span>
                      <strong style={{ color: 'var(--pipo-burgundy)' }}>{prod.name}</strong>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>
                        {formatMoney(prod.unitPrice)}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0', fontSize: '0.76rem', color: 'var(--pipo-muted)' }}>
                      {prod.publicDescription || 'Usando vista coquette automática · Añade foto o reseña cuando gustes'}
                    </p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openCurationModal('product', prod)}
                      >
                        <Image size={13} /> Subir Foto / Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          onUpdateStorefrontMerchandising({
                            entityType: 'product',
                            id: prod.id,
                            isVisiblePublic: prod.isVisiblePublic === false
                          })
                        }
                      >
                        {prod.isVisiblePublic !== false ? (
                          <>
                            <Eye size={13} color="var(--status-ok-fg)" /> Visible
                          </>
                        ) : (
                          <>
                            <EyeOff size={13} /> Oculto
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          onUpdateStorefrontMerchandising({
                            entityType: 'product',
                            id: prod.id,
                            isFeatured: !prod.isFeatured
                          })
                        }
                      >
                        <Star
                          size={13}
                          fill={prod.isFeatured ? '#e08398' : 'none'}
                          color={prod.isFeatured ? '#722424' : 'currentColor'}
                        />
                        {prod.isFeatured ? 'Destacado' : 'Destacar'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {allCurationItems.length > 0 && (
            <div className="pipo-pagination-bar">
              <div className="pipo-pagination-info">
                Mostrando {(curationPage - 1) * CURATION_PAGE_SIZE + 1}–
                {Math.min(curationPage * CURATION_PAGE_SIZE, allCurationItems.length)} de{' '}
                {allCurationItems.length} {allCurationItems.length === 1 ? 'ítem' : 'productos y combos'}
              </div>
              <div className="pipo-pagination-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={curationPage <= 1}
                  onClick={() => setCurationPage((p) => Math.max(1, p - 1))}
                  title="Página anterior"
                >
                  <ChevronLeft size={15} /> Anterior
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: totalCurationPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      type="button"
                      className={`pipo-page-pill ${curationPage === pg ? 'active' : ''}`}
                      onClick={() => setCurationPage(pg)}
                    >
                      {pg}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={curationPage >= totalCurationPages}
                  onClick={() => setCurationPage((p) => Math.min(totalCurationPages, p + 1))}
                  title="Página siguiente"
                >
                  Siguiente <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: YAPE GATEWAY HEALTH, LIVE SIMULATOR & WEB ORDERS */}
      {subTab === 'yape' && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Left: Detector Status & Triple-Matching Test Simulator */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src={`${import.meta.env.BASE_URL}yape-logo.png`}
                  alt="Yape"
                  style={{ height: 28, width: 'auto' }}
                />
                <div>
                  <h2 className="card-title" style={{ margin: 0 }}>Estado del Detector Automático Yape</h2>
                  <p className="card-subtitle" style={{ margin: '2px 0 0' }}>
                    Modo ahorro de batería activo: solo se despierta cuando un cliente entra al
                    apartado de compra en la web.
                  </p>
                </div>
              </div>
              <span className="badge badge-ok">
                <Wifi size={12} style={{ marginRight: 4 }} /> Activo
              </span>
            </div>

            <div
              style={{
                background: 'var(--pipo-ivory)',
                border: '1px solid var(--pipo-border)',
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: '0.84rem'
              }}
            >
              <div>
                <strong>Número Receptor Oficial:</strong> {yapeGateway.receiverPhone} (
                {yapeGateway.receiverName})
              </div>
              <div>
                <strong>Triple Candado Anti-Colisión:</strong> Monto Exacto + Nombre Completo del
                Titular Yape + Ventana de 15 min
              </div>
              <div>
                <strong>Último Despertar (Wake-on-Checkout):</strong>{' '}
                {yapeGateway.wakeRequestedAt
                  ? new Date(yapeGateway.wakeRequestedAt).toLocaleString()
                  : 'Listo para recibir clientes'}
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--pipo-border)',
                paddingTop: 14
              }}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', color: 'var(--pipo-burgundy)' }}>
                🧪 Simulador / Registro Manual de Notificación Yape
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: '0.79rem', color: 'var(--pipo-muted)' }}>
                Prueba aquí cómo el sistema valida automáticamente un pedido web cuando llega una
                notificación de Yape con el nombre completo del titular y el monto exacto:
              </p>

              <form onSubmit={handleRunYapeSimulation} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="field">
                  <label>Nombre completo de quien envió el Yape *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Valeria Morales"
                    value={simSenderName}
                    onChange={(e) => setSimSenderName(e.target.value)}
                  />
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Monto recibido (S/) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="Ej. 25.00"
                      value={simAmount}
                      onChange={(e) => setSimAmount(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Cód. Operación (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. 482910"
                      value={simOpCode}
                      onChange={(e) => setSimOpCode(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={simulating}
                >
                  <Zap size={16} />
                  {simulating
                    ? 'Procesando Triple Candado...'
                    : 'Disparar Notificación Yape y Validar Pedido'}
                </button>
              </form>
            </div>
          </div>

          {/* Right: Live Web Orders Queue */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">🛍️ Pedidos Recibidos desde la Tienda Web</h2>
                <p className="card-subtitle">
                  Todos los pedidos web se integran automáticamente en tu pestaña de Pedidos y
                  Ventas.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onNavigateToSales}
              >
                Ir a Pedidos y Ventas →
              </button>
            </div>

            {webOrders.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--pipo-muted)' }}>
                Aún no se han registrado pedidos desde la tienda pública.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {webOrders.slice(0, 12).map((sale) => {
                  const cust = (db.customers || []).find((c) => c.id === sale.customerId);
                  const isVerified =
                    sale.paymentVerificationStatus === 'verified_auto' ||
                    sale.paymentVerificationStatus === 'verified_manual' ||
                    sale.balanceDue <= 0;
                  return (
                    <div
                      key={sale.id}
                      style={{
                        background: isVerified ? 'var(--status-ok-bg)' : 'var(--pipo-ivory)',
                        border: '1px solid var(--pipo-border)',
                        borderRadius: 14,
                        padding: 12
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>
                          {sale.code} · {cust?.name || 'Cliente Web'}
                        </strong>
                        <span className={`badge ${isVerified ? 'badge-ok' : 'badge-warn'}`}>
                          {isVerified ? '💜 Yape Verificado' : '⏳ Esperando Yape'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--pipo-espresso)' }}>
                        <div>
                          <strong>Total:</strong> {formatMoney(sale.totalCharged)} ·{' '}
                          <strong>Titular Yape declarado:</strong> {sale.yapeHolderName || cust?.name}
                        </div>
                        <div>
                          <strong>Entrega:</strong> {sale.deliveryLocation} ({sale.deliveryTime})
                        </div>
                      </div>
                      {!isVerified && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setSimSenderName(sale.yapeHolderName || cust?.name || '');
                              setSimAmount(String(sale.totalCharged));
                            }}
                          >
                            Autocompletar en Simulador Yape ↑
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal to Customize Product or Combo Photo & Description */}
      {editingItem &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setEditingItem(null)}>
            <div
              className="modal-panel"
              style={{ maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <span className="badge badge-brand">✨ Personalizar Vitrina Web</span>
                  <h3 style={{ margin: '4px 0 0', color: 'var(--pipo-burgundy)' }}>
                    {editingItem.name}
                  </h3>
                </div>
              </div>

              {/* Subtabs for products with variants/swatches */}
              {editingItem.entityType === 'product' && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '8px 24px 0',
                    borderBottom: '1px solid var(--pipo-border)'
                  }}
                >
                  <button
                    type="button"
                    className={`btn btn-sm ${curationActiveTab === 'main' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setCurationActiveTab('main')}
                  >
                    📸 Foto Principal y Datos
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${curationActiveTab === 'shades' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setCurationActiveTab('shades')}
                  >
                    💄 Muestrario y Fotos de Tonos {editingItem._variants?.length ? `(${editingItem._variants.length})` : ''}
                  </button>
                </div>
              )}

              <form
                onSubmit={handleSaveCuration}
                className="modal-body"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  overflowY: 'auto',
                  flex: 1,
                  padding: 24
                }}
              >
                {curationActiveTab === 'main' ? (
                  <>
                    <div className="field">
                      <label>Foto comercial principal (Portada)</label>
                      <input type="file" accept="image/*" onChange={handleImageFileUpload} />
                    </div>

                    <div className="field">
                      <label>O pegar enlace directo de imagen principal (URL)</label>
                      <input
                        type="text"
                        placeholder="https://..."
                        value={editImageUrl}
                        onChange={(e) => setEditImageUrl(e.target.value)}
                      />
                    </div>

                    {editImageUrl && (
                      <div style={{ textAlign: 'center' }}>
                        <img
                          src={editImageUrl}
                          alt="Vista previa comercial"
                          style={{
                            maxHeight: 140,
                            borderRadius: 14,
                            border: '1px solid var(--pipo-border)',
                            objectFit: 'cover'
                          }}
                        />
                      </div>
                    )}

                    <div className="field">
                      <label>Descripción atractiva para el cliente</label>
                      <textarea
                        rows={3}
                        placeholder="Ej. Acabado aterciopelado de larga duración, aroma dulce y textura ligera..."
                        value={editPublicDesc}
                        onChange={(e) => setEditPublicDesc(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editIsVisible}
                          onChange={(e) => setEditIsVisible(e.target.checked)}
                        />
                        <span>Mostrar en la Tienda Web</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editIsFeatured}
                          onChange={(e) => setEditIsFeatured(e.target.checked)}
                        />
                        <span>⭐ Marcar como Favorito</span>
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    {/* General Shades / Swatch Chart Section */}
                    <div
                      style={{
                        background: 'var(--pipo-ivory)',
                        border: '1px solid var(--pipo-border)',
                        borderRadius: 14,
                        padding: 14
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Sparkles size={16} color="var(--pipo-burgundy)" />
                        <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '0.95rem' }}>
                          Foto General de Muestrario de Tonos (Swatches)
                        </strong>
                      </div>
                      <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--pipo-muted)' }}>
                        Sube una foto donde aparezcan <strong>todos los tonos juntos</strong> aplicados en piel o labios. Se mostrará a todas las clientas en la vista de detalle.
                      </p>

                      <div className="field" style={{ marginBottom: 8 }}>
                        <input type="file" accept="image/*" onChange={handleShadesImageFileUpload} />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <input
                          type="text"
                          placeholder="O pegar URL del muestrario general (https://...)"
                          value={editShadesImageUrl}
                          onChange={(e) => setEditShadesImageUrl(e.target.value)}
                        />
                      </div>

                      {editShadesImageUrl && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                          <img
                            src={editShadesImageUrl}
                            alt="Muestrario general"
                            style={{
                              height: 80,
                              borderRadius: 10,
                              border: '1px solid var(--pipo-border)',
                              objectFit: 'cover'
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditShadesImageUrl('')}
                            style={{ color: 'var(--pipo-rose)' }}
                          >
                            <Trash2 size={14} /> Quitar foto de muestrario
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Specific Per-Shade Photos Section */}
                    {editingItem._variants && editingItem._variants.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ marginBottom: 8 }}>
                          <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '0.92rem' }}>
                            Fotos Específicas por Tono Individual
                          </strong>
                          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--pipo-muted)' }}>
                            Al seleccionar el tono en la tienda web, la clienta verá exactamente esta foto real.
                          </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {editingItem._variants.map((v) => {
                            const curImg = editVariantImages[v.id] || '';
                            return (
                              <div
                                key={v.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                  padding: '8px 12px',
                                  background: '#ffffff',
                                  border: '1px solid var(--pipo-border)',
                                  borderRadius: 12,
                                  fontSize: '0.85rem'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                  {v.colorHex ? (
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        width: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        backgroundColor: v.colorHex,
                                        border: '1px solid rgba(0,0,0,0.15)',
                                        flexShrink: 0
                                      }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: '1.1rem' }}>💄</span>
                                  )}
                                  <div>
                                    <strong style={{ color: 'var(--pipo-burgundy)' }}>{v.shadeName}</strong>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--pipo-muted)' }}>
                                      Stock: {v.stock} disp.
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {curImg ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <img
                                        src={curImg}
                                        alt={v.shadeName}
                                        style={{
                                          width: 44,
                                          height: 44,
                                          borderRadius: 8,
                                          objectFit: 'cover',
                                          border: '1px solid var(--pipo-border)'
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() =>
                                          setEditVariantImages((prev) => ({ ...prev, [v.id]: '' }))
                                        }
                                        title="Quitar foto de este tono"
                                        style={{ padding: 4 }}
                                      >
                                        <X size={15} />
                                      </button>
                                    </div>
                                  ) : (
                                    <label
                                      className="btn btn-ghost btn-sm"
                                      style={{
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4
                                      }}
                                    >
                                      <Upload size={14} /> Subir foto
                                      <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleVariantImageFileUpload(v.id, e)}
                                      />
                                    </label>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="modal-footer" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditingItem(null)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary">
                    <CheckCircle2 size={16} /> Guardar en la Tienda Web
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
