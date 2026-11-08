import React, { useMemo, useState } from 'react';
import { Edit3, Filter, Gift, Layers, PackagePlus, Plus, Sparkles, Tag, Trash2 } from 'lucide-react';
import CustomSelect from '../../components/CustomSelect.jsx';
import ShadeColorPicker from '../../components/ShadeColorPicker.jsx';
import {
  computeComboSummary,
  computeMargins,
  computePackageUnitCost,
  computeSuggestedPrices,
  formatCurrency,
  formatUnitCost,
  generateNextCode,
  getStockLevelBadge,
  roundMoney,
  toNumber
} from '../../domain/calculations.js';
import { DEFAULT_COMBO_RATIO, PRODUCT_CATEGORIES } from '../../domain/constants.js';

export default function InventoryView({
  db,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onSaveSupply,
  onDeleteSupply,
  onSaveCombo,
  onDeleteCombo,
  onAddCategory,
  onDeleteCategory
}) {
  const [subTab, setSubTab] = useState('products'); // products | combos | supplies
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showProductForm, setShowProductForm] = useState(db.products.length === 0);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // New Product Form State
  const [pCode, setPCode] = useState('');
  const [pName, setPName] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pCategory, setPCategory] = useState('Labios');
  const [pkgQty, setPkgQty] = useState('12');
  const [pkgTotalCost, setPkgTotalCost] = useState('');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [comboRatioPct, setComboRatioPct] = useState('75');
  const [comboPriceInput, setComboPriceInput] = useState('');
  const [initialStock, setInitialStock] = useState('12');
  const [singleShadeName, setSingleShadeName] = useState('');
  const [singleShadeColor, setSingleShadeColor] = useState(null);
  const [hasVariants, setHasVariants] = useState(false);
  const [shadeCountHelper, setShadeCountHelper] = useState('6');
  const [variantsDraft, setVariantsDraft] = useState([
    { shadeName: 'Tono 01', colorHex: null, stock: 4 },
    { shadeName: 'Tono 02', colorHex: null, stock: 4 }
  ]);

  // Supply Form State
  const [supId, setSupId] = useState(null);
  const [supCode, setSupCode] = useState('');
  const [supName, setSupName] = useState('');
  const [supPkgQty, setSupPkgQty] = useState('');
  const [supPkgCost, setSupPkgCost] = useState('');
  const [supUnitCost, setSupUnitCost] = useState('');
  const [supStock, setSupStock] = useState('');

  // Combo Form State
  const [cmbId, setCmbId] = useState(null);
  const [cmbCode, setCmbCode] = useState('');
  const [cmbName, setCmbName] = useState('');
  const [cmbDesc, setCmbDesc] = useState('');
  const [cmbType, setCmbType] = useState('predefined');
  const [cmbItems, setCmbItems] = useState([]);

  const availableCategories = useMemo(() => {
    const base =
      Array.isArray(db.categories) && db.categories.length > 0
        ? [...db.categories]
        : [...PRODUCT_CATEGORIES];
    for (const p of db.products || []) {
      const cat = (p.category || '').trim();
      if (cat && !base.some((c) => c.toLowerCase() === cat.toLowerCase())) {
        base.push(cat);
      }
    }
    return base;
  }, [db.categories, db.products]);

  const existingBrands = useMemo(() => {
    const set = new Set();
    db.products.forEach((p) => {
      if (p.brand && p.brand.trim()) set.add(p.brand.trim());
    });
    return Array.from(set).sort();
  }, [db.products]);

  const productsMap = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const variantsMap = useMemo(() => new Map(db.variants.map((v) => [v.id, v])), [db.variants]);
  const variantsByProduct = useMemo(() => {
    const map = new Map();
    for (const v of db.variants) {
      const list = map.get(v.productId) || [];
      list.push(v);
      map.set(v.productId, list);
    }
    return map;
  }, [db.variants]);

  function handlePackageCalc(nextQtyStr, nextTotalStr) {
    setPkgQty(nextQtyStr);
    setPkgTotalCost(nextTotalStr);
    const q = toNumber(nextQtyStr, 0);
    const tot = toNumber(nextTotalStr, -1);
    if (q > 0 && tot >= 0 && nextTotalStr !== '') {
      const calcUnit = computePackageUnitCost(q, tot);
      setUnitCostInput(String(calcUnit));
      const ratio = toNumber(comboRatioPct, 75) / 100;
      const suggested = computeSuggestedPrices(calcUnit, ratio);
      setUnitPriceInput(String(suggested.unitPrice));
      setComboPriceInput(String(suggested.comboPrice));
    }
  }

  function handleUnitCostDirectChange(val) {
    setUnitCostInput(val);
    const c = toNumber(val, -1);
    if (c >= 0 && val !== '') {
      const ratio = toNumber(comboRatioPct, 75) / 100;
      const suggested = computeSuggestedPrices(c, ratio);
      setUnitPriceInput(String(suggested.unitPrice));
      setComboPriceInput(String(suggested.comboPrice));
    }
  }

  function handleUnitPriceChange(val) {
    setUnitPriceInput(val);
    const p = toNumber(val, -1);
    if (p >= 0 && val !== '') {
      const ratio = toNumber(comboRatioPct, 75) / 100;
      setComboPriceInput(String(roundMoney(p * ratio)));
    }
  }

  function handleComboRatioChange(val) {
    setComboRatioPct(val);
    const p = toNumber(unitPriceInput, 0);
    const ratio = toNumber(val, 75) / 100;
    if (p > 0) {
      setComboPriceInput(String(roundMoney(p * ratio)));
    }
  }

  function distributeShadesEvenly() {
    const count = Math.max(1, Math.min(30, Math.trunc(toNumber(shadeCountHelper, 6))));
    const totalUnits = Math.max(0, Math.trunc(toNumber(initialStock || pkgQty, 24)));
    const basePerShade = Math.floor(totalUnits / count);
    const remainder = totalUnits % count;

    const generated = Array.from({ length: count }, (_, idx) => ({
      shadeName: variantsDraft[idx]?.shadeName || `Tono ${String(idx + 1).padStart(2, '0')}`,
      colorHex: variantsDraft[idx]?.colorHex || null,
      stock: basePerShade + (idx < remainder ? 1 : 0)
    }));
    setVariantsDraft(generated);
  }

  const liveUnitMargins = computeMargins(unitCostInput, unitPriceInput);
  const liveComboMargins = computeMargins(unitCostInput, comboPriceInput);

  async function handleSubmitNewProduct(e) {
    e.preventDefault();
    if (!pName.trim()) return;

    const cleanUnitCost = toNumber(unitCostInput, 0);
    const cleanUnitPrice = toNumber(unitPriceInput, 0);
    const ratio = Math.max(0.05, Math.min(1, toNumber(comboRatioPct, 75) / 100));
    const cleanComboPrice =
      comboPriceInput !== ''
        ? toNumber(comboPriceInput, cleanUnitPrice * ratio)
        : roundMoney(cleanUnitPrice * ratio);

    await onCreateProduct({
      code: pCode.trim() || generateNextCode('PROD', db.products),
      name: pName.trim(),
      brand: pBrand.trim(),
      category: pCategory,
      unitCost: cleanUnitCost,
      unitPrice: cleanUnitPrice,
      comboRatio: ratio,
      comboPrice: cleanComboPrice,
      hasVariants,
      singleShadeName: singleShadeName.trim(),
      singleShadeColor: singleShadeColor || null,
      initialStock: toNumber(initialStock, 0),
      entryType: 'initial_inventory',
      variants: hasVariants
        ? variantsDraft
            .filter((v) => v.shadeName.trim() !== '')
            .map((v) => ({
              shadeName: v.shadeName.trim(),
              colorHex: v.colorHex || null,
              stock: Math.max(0, Math.trunc(toNumber(v.stock, 0))),
              unitCost: cleanUnitCost
            }))
        : []
    });

    setPCode('');
    setPName('');
    setSingleShadeName('');
    setSingleShadeColor(null);
    setPkgTotalCost('');
    setUnitCostInput('');
    setUnitPriceInput('');
    setComboPriceInput('');
  }

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.products.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
      );
    });
  }, [db.products, search, categoryFilter]);

  async function handleSupplySubmit(e) {
    e.preventDefault();
    if (!supName.trim()) return;
    await onSaveSupply({
      id: supId,
      code: supCode,
      name: supName,
      stock: toNumber(supStock, 0),
      unitCost: toNumber(supUnitCost, 0)
    });
    setSupId(null);
    setSupCode('');
    setSupName('');
    setSupPkgQty('');
    setSupPkgCost('');
    setSupUnitCost('');
    setSupStock('');
  }

  async function handleComboSubmit(e) {
    e.preventDefault();
    if (!cmbName.trim() || cmbItems.length === 0) return;
    await onSaveCombo({
      id: cmbId,
      code: cmbCode,
      name: cmbName,
      description: cmbDesc,
      comboType: cmbType,
      items: cmbItems.map((item) => ({
        ...item,
        variantId: cmbType === 'customizable' ? null : item.variantId || null
      }))
    });
    setCmbId(null);
    setCmbCode('');
    setCmbName('');
    setCmbDesc('');
    setCmbType('predefined');
    setCmbItems([]);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock, Tonos, Combos y Bolsitas</h1>
          <p className="page-subtitle">
            Catálogo maestro sincronizado al instante con Supabase PostgreSQL.
          </p>
        </div>
        {subTab === 'products' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowProductForm((prev) => !prev)}
          >
            <PackagePlus size={16} />
            {showProductForm ? 'Ocultar formulario' : 'Nuevo Producto'}
          </button>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="tabs-row">
        <button
          type="button"
          className={`tab-chip ${subTab === 'products' ? 'active' : ''}`}
          onClick={() => setSubTab('products')}
        >
          <Layers size={15} /> Productos y Tonos ({db.products.length})
        </button>
        <button
          type="button"
          className={`tab-chip ${subTab === 'combos' ? 'active' : ''}`}
          onClick={() => setSubTab('combos')}
        >
          <Sparkles size={15} /> Catálogo de Combos ({db.combos.length})
        </button>
        <button
          type="button"
          className={`tab-chip ${subTab === 'supplies' ? 'active' : ''}`}
          onClick={() => setSubTab('supplies')}
        >
          <Gift size={15} /> Bolsitas e Insumos ({db.supplies.length})
        </button>
      </div>

      {/* ==================== TAB 1: PRODUCTS & SHADES ==================== */}
      {subTab === 'products' && (
        <>
          {showProductForm && (
            <div className="card card-cream" style={{ marginBottom: 20 }}>
              <h3 className="card-title">
                <PackagePlus size={18} /> Registrar Producto en Catálogo
              </h3>
              <form onSubmit={handleSubmitNewProduct} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div className="form-grid">
                  <div className="field">
                    <label>Código (automático o propio)</label>
                    <input
                      type="text"
                      placeholder={generateNextCode('PROD', db.products)}
                      value={pCode}
                      onChange={(e) => setPCode(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>Nombre del producto *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Iluminador Funky / Bálsamo Fresita"
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>Marca (con autocompletado)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        list="pipo-brands-list"
                        placeholder="Ej. Jarusa, Nossa, Reve'l"
                        value={pBrand}
                        onChange={(e) => setPBrand(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Dejar sin marca"
                        onClick={() => setPBrand('Sin marca')}
                      >
                        Sin marca
                      </button>
                    </div>
                    <datalist id="pipo-brands-list">
                      {existingBrands.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>

                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span>Categoría del catálogo</span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--pipo-burgundy)', fontWeight: 800 }}>
                        {pCategory}
                      </span>
                    </label>
                    <CustomSelect
                      value={pCategory}
                      onChange={(val) => setPCategory(val)}
                      options={availableCategories.map((c) => ({ value: c, label: c }))}
                      icon={Tag}
                      placeholder="Seleccionar categoría"
                    />
                    <div className="category-button-grid" style={{ marginTop: 8 }}>
                      {availableCategories.map((cat) => (
                        <div
                          key={cat}
                          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <button
                            type="button"
                            className={`category-pill-btn ${pCategory === cat ? 'active' : ''}`}
                            style={{
                              paddingRight: isManagingCategories && availableCategories.length > 1 ? 26 : undefined
                            }}
                            onClick={() => setPCategory(cat)}
                          >
                            {cat}
                          </button>
                          {isManagingCategories && availableCategories.length > 1 && onDeleteCategory && (
                            <button
                              type="button"
                              title={`Quitar categoría "${cat}"`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const remaining = availableCategories.filter((c) => c !== cat);
                                if (pCategory === cat && remaining[0]) {
                                  setPCategory(remaining[0]);
                                }
                                await onDeleteCategory(cat);
                              }}
                              style={{
                                position: 'absolute',
                                right: 5,
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                border: 'none',
                                background: pCategory === cat ? 'rgba(255,255,255,0.28)' : 'rgba(155,28,28,0.14)',
                                color: pCategory === cat ? '#fff' : '#9b1c1c',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                lineHeight: 1,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="category-pill-btn"
                        style={{
                          borderStyle: isManagingCategories ? 'solid' : 'dashed',
                          borderColor: 'var(--pipo-burgundy)',
                          background: isManagingCategories ? 'rgba(114, 36, 36, 0.08)' : '#fff',
                          color: 'var(--pipo-burgundy)'
                        }}
                        onClick={() => setIsManagingCategories((prev) => !prev)}
                        title="Añadir o quitar categorías del catálogo"
                      >
                        {isManagingCategories ? '✓ Listo' : (
                          <>
                            <Plus size={13} /> Personalizar
                          </>
                        )}
                      </button>
                    </div>

                    {isManagingCategories && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 9,
                          borderRadius: 10,
                          background: 'var(--pipo-ivory)',
                          border: '1px dashed rgba(199,143,133,0.6)',
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                          flexWrap: 'wrap'
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Ej. Delineador de ojos, Cuidado facial..."
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const clean = newCategoryName.replace(/\s+/g, ' ').trim();
                              if (!clean || !onAddCategory) return;
                              setPCategory(clean);
                              setNewCategoryName('');
                              await onAddCategory(clean);
                            }
                          }}
                          style={{ flex: '1 1 180px', minWidth: 0, padding: '6px 9px', fontSize: '0.84rem' }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={!newCategoryName.trim()}
                          onClick={async () => {
                            const clean = newCategoryName.replace(/\s+/g, ' ').trim();
                            if (!clean || !onAddCategory) return;
                            setPCategory(clean);
                            setNewCategoryName('');
                            await onAddCategory(clean);
                          }}
                        >
                          <Plus size={13} /> Añadir
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Package Cost Helper & Prices */}
                <div
                  style={{
                    padding: 13,
                    borderRadius: 12,
                    background: '#fff',
                    border: '1px solid rgba(199,143,133,0.4)'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: 'var(--pipo-burgundy)',
                      marginBottom: 10
                    }}
                  >
                    Calculadora de Costo y Precios (por paquete o directo)
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>Unidades del paquete (opc.)</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Ej. 24"
                        value={pkgQty}
                        onChange={(e) => handlePackageCalc(e.target.value, pkgTotalCost)}
                      />
                    </div>

                    <div className="field">
                      <label>Costo paquete S/ (opc.)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Ej. 90.00"
                        value={pkgTotalCost}
                        onChange={(e) => handlePackageCalc(pkgQty, e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Costo Unitario (S/) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        required
                        placeholder="Ej. 3.75"
                        value={unitCostInput}
                        onChange={(e) => handleUnitCostDirectChange(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Precio Venta Unitario (S/) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="Sugerido: 2x costo"
                        value={unitPriceInput}
                        onChange={(e) => handleUnitPriceChange(e.target.value)}
                      />
                      <span className="field-hint">
                        Ganancia: <strong>{formatCurrency(liveUnitMargins.unitProfit)}</strong> ({liveUnitMargins.marginPercent}%)
                      </span>
                    </div>

                    <div className="field">
                      <label>% Precio Combo</label>
                      <input
                        type="number"
                        min="10"
                        max="100"
                        step="1"
                        value={comboRatioPct}
                        onChange={(e) => handleComboRatioChange(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Precio en Combo (S/) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={comboPriceInput}
                        onChange={(e) => setComboPriceInput(e.target.value)}
                      />
                      <span className="field-hint">
                        Ganancia combo: <strong>{formatCurrency(liveComboMargins.unitProfit)}</strong> ({liveComboMargins.marginPercent}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stock / Shades Section */}
                <div
                  style={{
                    padding: 13,
                    borderRadius: 12,
                    background: '#fff',
                    border: '1px solid rgba(199,143,133,0.4)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 800,
                        cursor: 'pointer',
                        color: 'var(--pipo-burgundy)'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={hasVariants}
                        onChange={(e) => setHasVariants(e.target.checked)}
                        style={{ width: 18, height: 18, flexShrink: 0 }}
                      />
                      <span>¿Viene en varios tonos o colores? (Ej. 24 iluminadores en 6 tonos)</span>
                    </label>

                    {!hasVariants && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: 800 }}>Tono / Variedad:</span>
                          <ShadeColorPicker
                            value={singleShadeColor}
                            onChange={(hex) => setSingleShadeColor(hex)}
                            align="left"
                            title="Elegir color para este tono (opcional)"
                          />
                          <input
                            type="text"
                            placeholder="Ej. Avena (opcional)"
                            value={singleShadeName}
                            onChange={(e) => setSingleShadeName(e.target.value)}
                            style={{
                              width: 155,
                              padding: '7px 10px',
                              borderRadius: 8,
                              border: '1.5px solid var(--pipo-rosewood)',
                              fontSize: 14
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: 800 }}>Stock físico actual:</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={initialStock}
                            onChange={(e) => setInitialStock(e.target.value)}
                            style={{
                              width: 80,
                              padding: '7px 10px',
                              borderRadius: 8,
                              border: '1.5px solid var(--pipo-rosewood)',
                              fontSize: 16
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {hasVariants && (
                    <div style={{ marginTop: 14 }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'flex-end',
                          flexWrap: 'wrap',
                          marginBottom: 12
                        }}
                      >
                        <div className="field" style={{ flex: '1 1 120px' }}>
                          <label>Total unidades lote</label>
                          <input
                            type="number"
                            min="0"
                            value={initialStock}
                            onChange={(e) => setInitialStock(e.target.value)}
                          />
                        </div>
                        <div className="field" style={{ flex: '1 1 120px' }}>
                          <label>Cantidad de tonos</label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={shadeCountHelper}
                            onChange={(e) => setShadeCountHelper(e.target.value)}
                          />
                        </div>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={distributeShadesEvenly}>
                          Repartir {initialStock || 0} uds en {shadeCountHelper} tonos
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            setVariantsDraft([
                              ...variantsDraft,
                              { shadeName: `Tono ${variantsDraft.length + 1}`, colorHex: null, stock: 0 }
                            ])
                          }
                        >
                          <Plus size={14} /> Añadir tono
                        </button>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
                          gap: 8
                        }}
                      >
                        {variantsDraft.map((vd, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center',
                              padding: 8,
                              borderRadius: 9,
                              background: 'var(--pipo-ivory)'
                            }}
                          >
                            <ShadeColorPicker
                              value={vd.colorHex || null}
                              onChange={(hex) => {
                                const copy = [...variantsDraft];
                                copy[idx] = { ...copy[idx], colorHex: hex };
                                setVariantsDraft(copy);
                              }}
                              align="left"
                              title="Color de este tono (opcional)"
                            />
                            <input
                              type="text"
                              placeholder="Nombre del tono"
                              value={vd.shadeName}
                              onChange={(e) => {
                                const copy = [...variantsDraft];
                                copy[idx] = { ...copy[idx], shadeName: e.target.value };
                                setVariantsDraft(copy);
                              }}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                padding: '6px 8px',
                                borderRadius: 7,
                                border: '1px solid var(--pipo-rosewood)',
                                fontSize: 15
                              }}
                            />
                            <input
                              type="number"
                              min="0"
                              value={vd.stock}
                              onChange={(e) => {
                                const copy = [...variantsDraft];
                                copy[idx] = { ...copy[idx], stock: e.target.value };
                                setVariantsDraft(copy);
                              }}
                              style={{
                                width: 64,
                                padding: '6px 8px',
                                borderRadius: 7,
                                border: '1px solid var(--pipo-rosewood)',
                                fontSize: 15
                              }}
                            />
                            {variantsDraft.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{ padding: 5 }}
                                onClick={() => setVariantsDraft(variantsDraft.filter((_, i) => i !== idx))}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', maxWidth: 320 }}>
                    Guardar Producto en Supabase
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Filters */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <input
                type="search"
                placeholder="Buscar por nombre, marca o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: '1 1 200px',
                  minWidth: 0,
                  padding: '9px 13px',
                  borderRadius: 10,
                  border: '1.5px solid rgba(199,143,133,0.55)',
                  fontSize: 16
                }}
              />
              <div style={{ flex: '1 1 200px', minWidth: 170 }}>
                <CustomSelect
                  value={categoryFilter}
                  onChange={(val) => setCategoryFilter(val)}
                  options={[
                    { value: 'ALL', label: 'Todas las categorías' },
                    ...availableCategories.map((c) => ({ value: c, label: c }))
                  ]}
                  icon={Filter}
                  placeholder="Filtrar por categoría"
                />
              </div>
            </div>
            {/* Quick Filter Pill Chips */}
            <div className="category-chips-bar">
              <button
                type="button"
                className={`category-chip-item ${categoryFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('ALL')}
              >
                Todas ({db.products.length})
              </button>
              {availableCategories.map((cat) => {
                const count = db.products.filter((p) => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`category-chip-item ${categoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat} {count > 0 ? `(${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Cards / Table */}
          <div className="card">
            {filteredProducts.length === 0 ? (
              <div className="empty-box">
                No se encontraron productos con este filtro. Usa el formulario superior para cargar tus artículos.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="pipo-table mobile-cards">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto / Marca</th>
                      <th>Tonos y Stock</th>
                      <th>Costo Unit. (CPP)</th>
                      <th>Precio Unit. (Margen)</th>
                      <th>Precio Combo (Margen)</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const pVars = variantsByProduct.get(p.id) || [];
                      const totalStock = pVars.reduce((acc, v) => acc + v.stock, 0);
                      const avgCost = pVars[0]?.unitCost || 0;
                      const mUnit = computeMargins(avgCost, p.unitPrice);
                      const mCombo = computeMargins(avgCost, p.comboPrice);
                      const stockBadge = getStockLevelBadge(totalStock);

                      return (
                        <tr key={p.id}>
                          <td data-label="Código" style={{ fontWeight: 800, fontSize: '0.8rem' }}>
                            {p.code}
                          </td>
                          <td data-label="Producto">
                            <div>
                              <strong>{p.name}</strong>
                              <div style={{ fontSize: '0.78rem', color: 'var(--pipo-muted)' }}>
                                {p.brand || 'Sin marca'} · {p.category}
                              </div>
                            </div>
                          </td>
                          <td data-label="Stock">
                            <div>
                              <div style={{ marginBottom: p.hasVariants || pVars.some((v) => v.colorHex) ? 5 : 0 }}>
                                <span className={`badge badge-${stockBadge.tone}`}>Total: {totalStock} uds</span>
                              </div>
                              {(p.hasVariants || pVars.some((v) => v.colorHex || (v.shadeName && v.shadeName !== 'Único'))) && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                  {pVars.map((v) => (
                                    <span
                                      key={v.id}
                                      className={`badge ${v.stock === 0 ? 'badge-danger' : 'badge-brand'}`}
                                      style={{ fontSize: '0.7rem', gap: 5 }}
                                    >
                                      {v.colorHex && (
                                        <span
                                          className="shade-inline-dot"
                                          style={{ backgroundColor: v.colorHex }}
                                          title={v.colorHex}
                                        />
                                      )}
                                      {v.shadeName}: {v.stock}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td data-label="Costo CPP">{formatUnitCost(avgCost)}</td>
                          <td data-label="Precio Unitario">
                            <div>
                              <strong>{formatCurrency(p.unitPrice)}</strong>
                              <div style={{ fontSize: '0.76rem', color: mUnit.isLoss ? '#9b1c1c' : 'var(--status-ok-fg)' }}>
                                +{formatCurrency(mUnit.unitProfit)} ({mUnit.marginPercent}%)
                              </div>
                            </div>
                          </td>
                          <td data-label="Precio Combo">
                            <div>
                              <strong>{formatCurrency(p.comboPrice)}</strong>
                              <div style={{ fontSize: '0.76rem', color: mCombo.isLoss ? '#9b1c1c' : 'var(--pipo-cocoa)' }}>
                                +{formatCurrency(mCombo.unitProfit)} ({mCombo.marginPercent}%)
                              </div>
                            </div>
                          </td>
                          <td data-label="Acciones">
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  setEditingProduct({
                                    ...p,
                                    variants: pVars.map((v) => ({ ...v }))
                                  })
                                }
                              >
                                <Edit3 size={14} /> Editar
                              </button>
                              {onDeleteProduct && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => {
                                    if (window.confirm(`¿Eliminar "${p.name}" del catálogo?`)) {
                                      onDeleteProduct(p.id, p.name);
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
        </>
      )}

      {/* ==================== TAB 2: COMBOS CATALOG ==================== */}
      {subTab === 'combos' && (
        <div className="grid-2">
          <div className="card card-cream">
            <h3 className="card-title">
              <Sparkles size={18} /> {cmbId ? 'Editar Combo del Catálogo' : 'Crear Nuevo Combo'}
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--pipo-muted)', marginTop: 0 }}>
              Elige si el combo tiene tonos fijos (Predefinido) o si los tonos quedan a libre elección del cliente al momento de la venta (Personalizable).
            </p>

            <form onSubmit={handleComboSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Tipo de combo *</label>
                <div className="category-button-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                  <button
                    type="button"
                    className={`category-pill-btn ${cmbType === 'predefined' ? 'active' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 12px' }}
                    onClick={() => {
                      setCmbType('predefined');
                      setCmbItems((prev) =>
                        prev.map((it) => {
                          if (it.variantId) return it;
                          const firstVar = (variantsByProduct.get(it.productId) || [])[0];
                          return { ...it, variantId: firstVar?.id || '' };
                        })
                      );
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>1. Combo Predefinido</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 400 }}>
                      Cerrado · Especifica el tono fijo en catálogo
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`category-pill-btn ${cmbType === 'customizable' ? 'active' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 12px' }}
                    onClick={() => setCmbType('customizable')}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>2. Combo Personalizable</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 400 }}>
                      Abierto · Tonos a libre elección del cliente
                    </span>
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Código</label>
                  <input
                    type="text"
                    placeholder={generateNextCode('CMB', db.combos)}
                    value={cmbCode}
                    onChange={(e) => setCmbCode(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Nombre del Combo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Combo Labios Glow"
                    value={cmbName}
                    onChange={(e) => setCmbName(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label>Descripción opcional</label>
                <input
                  type="text"
                  placeholder="Ej. Incluye Gloss + Delineador + Bálsamo"
                  value={cmbDesc}
                  onChange={(e) => setCmbDesc(e.target.value)}
                />
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 8
                  }}
                >
                  <strong style={{ fontSize: '0.85rem', color: 'var(--pipo-burgundy)' }}>
                    Productos que integran el combo
                  </strong>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={db.products.length === 0}
                    onClick={() => {
                      const firstProd = db.products[0];
                      const firstVar = (variantsByProduct.get(firstProd.id) || [])[0];
                      setCmbItems([
                        ...cmbItems,
                        {
                          productId: firstProd.id,
                          variantId: cmbType === 'customizable' ? null : firstVar?.id || '',
                          quantity: 1,
                          customComboUnitPrice: ''
                        }
                      ]);
                    }}
                  >
                    <Plus size={14} /> Agregar producto
                  </button>
                </div>

                {db.products.length === 0 && (
                  <p style={{ fontSize: '0.82rem', color: '#9b1c1c' }}>
                    Primero registra productos en &quot;Productos y Tonos&quot; para poder armar combos.
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cmbItems.map((item, idx) => {
                    const pVars = variantsByProduct.get(item.productId) || [];
                    const prod = productsMap.get(item.productId);
                    const totalProdStock = pVars.reduce((acc, v) => acc + Math.max(0, v.stock), 0);
                    return (
                      <div key={idx} className="combo-item-row">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const nextPid = e.target.value;
                            const nextVars = variantsByProduct.get(nextPid) || [];
                            const copy = [...cmbItems];
                            copy[idx] = {
                              ...copy[idx],
                              productId: nextPid,
                              variantId: cmbType === 'customizable' ? null : nextVars[0]?.id || ''
                            };
                            setCmbItems(copy);
                          }}
                        >
                          {db.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatCurrency(p.comboPrice)})
                            </option>
                          ))}
                        </select>

                        {cmbType === 'customizable' ? (
                          <div
                            style={{
                              padding: '8px 10px',
                              borderRadius: 10,
                              border: '1px dashed rgba(199,143,133,0.6)',
                              background: 'rgba(255,255,255,0.65)',
                              fontSize: '0.78rem',
                              color: 'var(--pipo-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6
                            }}
                            title="En combos personalizables el tono no se fija en el catálogo; se elige libremente al registrar la venta."
                          >
                            <span>Tono a libre elección</span>
                            <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '0.74rem' }}>
                              Stock total: {totalProdStock}
                            </strong>
                          </div>
                        ) : (
                          <select
                            value={item.variantId || pVars[0]?.id || ''}
                            onChange={(e) => {
                              const copy = [...cmbItems];
                              copy[idx] = { ...copy[idx], variantId: e.target.value };
                              setCmbItems(copy);
                            }}
                          >
                            {pVars.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.shadeName} (Stock: {v.stock})
                              </option>
                            ))}
                          </select>
                        )}

                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const copy = [...cmbItems];
                            copy[idx] = { ...copy[idx], quantity: e.target.value };
                            setCmbItems(copy);
                          }}
                          title="Cantidad"
                          placeholder="Cant."
                        />

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={prod ? `S/ ${prod.comboPrice}` : 'Precio'}
                          value={item.customComboUnitPrice ?? ''}
                          onChange={(e) => {
                            const copy = [...cmbItems];
                            copy[idx] = { ...copy[idx], customComboUnitPrice: e.target.value };
                            setCmbItems(copy);
                          }}
                          title="Precio combo especial opcional"
                        />

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setCmbItems(cmbItems.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={13} /> Quitar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {cmbItems.length > 0 &&
                (() => {
                  const preview = computeComboSummary(
                    { comboType: cmbType, items: cmbItems },
                    productsMap,
                    variantsByProduct,
                    variantsMap
                  );
                  return (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: 'var(--pipo-ivory)',
                        fontSize: '0.85rem'
                      }}
                    >
                      Suma sueltos: <strong>{formatCurrency(preview.regularTotal)}</strong> · Precio Combo:{' '}
                      <strong style={{ color: 'var(--pipo-burgundy)' }}>
                        {formatCurrency(preview.comboTotal)}
                      </strong>{' '}
                      · Costo: {formatCurrency(preview.estimatedCost)} · Ganancia neta:{' '}
                      <strong style={{ color: 'var(--status-ok-fg)' }}>
                        {formatCurrency(preview.estimatedProfit)} ({preview.marginPercent}%)
                      </strong>
                    </div>
                  );
                })()}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={cmbItems.length === 0}>
                  {cmbId ? 'Actualizar Combo' : 'Guardar Combo'}
                </button>
                {cmbId && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setCmbId(null);
                      setCmbCode('');
                      setCmbName('');
                      setCmbDesc('');
                      setCmbType('predefined');
                      setCmbItems([]);
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h3 className="card-title">Catálogo de Combos</h3>
            {db.combos.length === 0 ? (
              <div className="empty-box">Todavía no has definido combos en el catálogo.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {db.combos.map((combo) => {
                  const isCustomizable = combo.comboType === 'customizable';
                  const sum = computeComboSummary(combo, productsMap, variantsByProduct, variantsMap);
                  return (
                    <div
                      key={combo.id}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        border: '1px solid rgba(199,143,133,0.45)',
                        background: 'var(--pipo-ivory)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          gap: 6
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '1rem' }}>
                              {combo.code} · {combo.name}
                            </strong>
                            <span
                              className="badge"
                              style={
                                isCustomizable
                                  ? {
                                      background: 'rgba(199, 143, 133, 0.22)',
                                      color: 'var(--pipo-burgundy)',
                                      border: '1px solid rgba(114, 36, 36, 0.2)'
                                    }
                                  : {
                                      background: 'rgba(114, 36, 36, 0.1)',
                                      color: 'var(--pipo-burgundy)'
                                    }
                              }
                            >
                              {isCustomizable ? 'Personalizable · Libre elección' : 'Predefinido · Tonos fijos'}
                            </span>
                          </div>
                          {combo.description && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--pipo-muted)', marginTop: 2 }}>
                              {combo.description}
                            </div>
                          )}
                        </div>
                        <span className={`badge ${sum.availableCount > 0 ? 'badge-success' : 'badge-danger'}`}>
                          Armables hoy: {sum.availableCount}
                        </span>
                      </div>

                      <div style={{ margin: '8px 0', fontSize: '0.83rem' }}>
                        {(combo.items || []).map((ci, i) => {
                          const p = productsMap.get(ci.productId);
                          const v = !isCustomizable && ci.variantId ? variantsMap.get(ci.variantId) : null;
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span>
                                • {ci.quantity}x {p?.name || 'Producto'}
                              </span>
                              {!isCustomizable && v && (v.shadeName !== 'Único' || v.colorHex) && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  (
                                  {v.colorHex && (
                                    <span
                                      className="shade-inline-dot"
                                      style={{ backgroundColor: v.colorHex }}
                                    />
                                  )}
                                  {v.shadeName})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 8,
                          paddingTop: 8,
                          borderTop: '1px dashed rgba(199,143,133,0.4)',
                          fontSize: '0.84rem'
                        }}
                      >
                        <span>
                          Precio Combo: <strong>{formatCurrency(sum.comboTotal)}</strong> · Ganancia:{' '}
                          <strong style={{ color: 'var(--status-ok-fg)' }}>
                            {formatCurrency(sum.estimatedProfit)}
                          </strong>
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setCmbId(combo.id);
                              setCmbCode(combo.code);
                              setCmbName(combo.name);
                              setCmbDesc(combo.description || '');
                              setCmbType(combo.comboType || 'predefined');
                              setCmbItems(
                                (combo.items || []).map((x) => {
                                  const firstVar = (variantsByProduct.get(x.productId) || [])[0];
                                  return {
                                    ...x,
                                    variantId: x.variantId || firstVar?.id || '',
                                    customComboUnitPrice: x.customComboUnitPrice ?? ''
                                  };
                                })
                              );
                            }}
                          >
                            <Edit3 size={13} /> Editar
                          </button>
                          {onDeleteCombo && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                if (window.confirm(`¿Eliminar el combo "${combo.name}"?`)) {
                                  onDeleteCombo(combo.id);
                                }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: SUPPLIES / DECORATED BAGS ==================== */}
      {subTab === 'supplies' && (
        <div className="grid-2">
          <div className="card card-cream">
            <h3 className="card-title">
              <Gift size={18} /> {supId ? 'Editar Empaque / Bolsita' : 'Registrar Bolsita Decorada / Insumo'}
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--pipo-muted)', marginTop: 0 }}>
              Ej. Bolsas unitarias (S/ 0.10) o Bolsas craft decoradas (S/ 0.56). Al marcarlas en una venta restarán stock y descontarán su costo de la ganancia neta sin cobrarle al cliente.
            </p>

            <form onSubmit={handleSupplySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid">
                <div className="field">
                  <label>Código</label>
                  <input
                    type="text"
                    placeholder={generateNextCode('INS', db.supplies)}
                    value={supCode}
                    onChange={(e) => setSupCode(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Nombre del empaque *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Bolsa Craft Decorada / Bolsa Unitaria"
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Cant. paquete (opcional)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Ej. 25"
                    value={supPkgQty}
                    onChange={(e) => {
                      setSupPkgQty(e.target.value);
                      if (e.target.value && supPkgCost) {
                        setSupUnitCost(String(computePackageUnitCost(e.target.value, supPkgCost)));
                      }
                    }}
                  />
                </div>
                <div className="field">
                  <label>Costo paquete S/ (opcional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ej. 14.00"
                    value={supPkgCost}
                    onChange={(e) => {
                      setSupPkgCost(e.target.value);
                      if (supPkgQty && e.target.value) {
                        setSupUnitCost(String(computePackageUnitCost(supPkgQty, e.target.value)));
                      }
                    }}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Costo Unitario (S/) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    required
                    placeholder="Ej. 0.56"
                    value={supUnitCost}
                    onChange={(e) => setSupUnitCost(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Stock Actual (unidades) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    placeholder="Ej. 25"
                    value={supStock}
                    onChange={(e) => setSupStock(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary">
                  {supId ? 'Guardar Cambios' : 'Registrar Bolsita / Insumo'}
                </button>
                {supId && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setSupId(null);
                      setSupCode('');
                      setSupName('');
                      setSupUnitCost('');
                      setSupStock('');
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h3 className="card-title">Stock de Bolsitas y Presentación</h3>
            {db.supplies.length === 0 ? (
              <div className="empty-box">No hay bolsitas ni empaques registrados aún.</div>
            ) : (
              <div className="table-wrap">
                <table className="pipo-table mobile-cards">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Empaque</th>
                      <th>Costo Unitario</th>
                      <th>Stock</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.supplies.map((s) => (
                      <tr key={s.id}>
                        <td data-label="Código" style={{ fontWeight: 700 }}>
                          {s.code}
                        </td>
                        <td data-label="Empaque">
                          <strong>{s.name}</strong>
                        </td>
                        <td data-label="Costo Unit.">{formatUnitCost(s.unitCost)}</td>
                        <td data-label="Stock">
                          <span className={`badge ${s.stock <= 5 ? 'badge-danger' : 'badge-success'}`}>
                            {s.stock} uds
                          </span>
                        </td>
                        <td data-label="Acción">
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setSupId(s.id);
                                setSupCode(s.code);
                                setSupName(s.name);
                                setSupUnitCost(String(s.unitCost));
                                setSupStock(String(s.stock));
                              }}
                            >
                              <Edit3 size={13} /> Editar
                            </button>
                            {onDeleteSupply && (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                  if (window.confirm(`¿Eliminar "${s.name}"?`)) {
                                    onDeleteSupply(s.id);
                                  }
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: EDIT PRODUCT ==================== */}
      {editingProduct && (
        <div className="modal-backdrop" onClick={() => setEditingProduct(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title">Editar Producto — {editingProduct.code}</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onUpdateProduct(editingProduct);
                setEditingProduct(null);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div className="form-grid">
                <div className="field">
                  <label>Nombre</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Marca</label>
                  <input
                    type="text"
                    value={editingProduct.brand}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Categoría</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--pipo-burgundy)', fontWeight: 800 }}>
                      {editingProduct.category}
                    </span>
                  </label>
                  <CustomSelect
                    value={editingProduct.category}
                    onChange={(val) => setEditingProduct({ ...editingProduct, category: val })}
                    options={availableCategories.map((c) => ({ value: c, label: c }))}
                    icon={Tag}
                  />
                  <div className="category-button-grid" style={{ marginTop: 8 }}>
                    {availableCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`category-pill-btn ${editingProduct.category === cat ? 'active' : ''}`}
                        onClick={() => setEditingProduct({ ...editingProduct, category: cat })}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Precio Unitario (S/)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={editingProduct.unitPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      const ratio = editingProduct.comboRatio || DEFAULT_COMBO_RATIO;
                      setEditingProduct({
                        ...editingProduct,
                        unitPrice: val,
                        comboPrice: roundMoney(toNumber(val, 0) * ratio)
                      });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Precio Combo (S/)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={editingProduct.comboPrice}
                    onChange={(e) => setEditingProduct({ ...editingProduct, comboPrice: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 8
                  }}
                >
                  <strong style={{ fontSize: '0.85rem', color: 'var(--pipo-burgundy)' }}>
                    Tonos / Variantes (Stock y Costo Unitario)
                  </strong>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setEditingProduct({
                        ...editingProduct,
                        variants: [
                          ...editingProduct.variants,
                          {
                            shadeName: `Tono ${editingProduct.variants.length + 1}`,
                            colorHex: null,
                            stock: 0,
                            unitCost: editingProduct.variants[0]?.unitCost || 0
                          }
                        ]
                      })
                    }
                  >
                    <Plus size={13} /> Agregar tono
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {editingProduct.variants.map((v, idx) => (
                    <div key={v.id || idx} className="variant-edit-row">
                      <ShadeColorPicker
                        value={v.colorHex || null}
                        onChange={(hex) => {
                          const copy = [...editingProduct.variants];
                          copy[idx] = { ...copy[idx], colorHex: hex };
                          setEditingProduct({ ...editingProduct, variants: copy });
                        }}
                        align="left"
                        title="Color de este tono (opcional)"
                      />
                      <input
                        type="text"
                        value={v.shadeName}
                        onChange={(e) => {
                          const copy = [...editingProduct.variants];
                          copy[idx] = { ...copy[idx], shadeName: e.target.value };
                          setEditingProduct({ ...editingProduct, variants: copy });
                        }}
                        placeholder="Nombre del tono"
                      />
                      <input
                        type="number"
                        min="0"
                        value={v.stock}
                        onChange={(e) => {
                          const copy = [...editingProduct.variants];
                          copy[idx] = { ...copy[idx], stock: e.target.value };
                          setEditingProduct({ ...editingProduct, variants: copy });
                        }}
                        title="Stock"
                        placeholder="Stock"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={v.unitCost}
                        onChange={(e) => {
                          const copy = [...editingProduct.variants];
                          copy[idx] = { ...copy[idx], unitCost: e.target.value };
                          setEditingProduct({ ...editingProduct, variants: copy });
                        }}
                        title="Costo unitario"
                        placeholder="Costo"
                      />
                      {editingProduct.variants.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() =>
                            setEditingProduct({
                              ...editingProduct,
                              variants: editingProduct.variants.filter((_, i) => i !== idx)
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingProduct(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Cambios en Supabase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
