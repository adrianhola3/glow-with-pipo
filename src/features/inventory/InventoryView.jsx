import React, { useMemo, useState } from 'react';
import { Edit3, Gift, Layers, PackagePlus, Plus, Sparkles, Trash2 } from 'lucide-react';
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
  onDeleteCombo
}) {
  const [subTab, setSubTab] = useState('products'); // products | combos | supplies
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showProductForm, setShowProductForm] = useState(db.products.length === 0);
  const [editingProduct, setEditingProduct] = useState(null);

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
  const [hasVariants, setHasVariants] = useState(false);
  const [shadeCountHelper, setShadeCountHelper] = useState('6');
  const [variantsDraft, setVariantsDraft] = useState([
    { shadeName: 'Tono 01', stock: 4 },
    { shadeName: 'Tono 02', stock: 4 }
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
  const [cmbItems, setCmbItems] = useState([]);

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
      shadeName: `Tono ${String(idx + 1).padStart(2, '0')}`,
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
      initialStock: toNumber(initialStock, 0),
      entryType: 'initial_inventory',
      variants: hasVariants
        ? variantsDraft
            .filter((v) => v.shadeName.trim() !== '')
            .map((v) => ({
              shadeName: v.shadeName.trim(),
              stock: Math.max(0, Math.trunc(toNumber(v.stock, 0))),
              unitCost: cleanUnitCost
            }))
        : []
    });

    setPCode('');
    setPName('');
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
      items: cmbItems
    });
    setCmbId(null);
    setCmbCode('');
    setCmbName('');
    setCmbDesc('');
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
          <Sparkles size={15} /> Combos Predefinidos ({db.combos.length})
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
                    <label>Categoría del catálogo</label>
                    <select value={pCategory} onChange={(e) => setPCategory(e.target.value)}>
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 800 }}>Stock físico actual:</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={initialStock}
                          onChange={(e) => setInitialStock(e.target.value)}
                          style={{
                            width: 96,
                            padding: '7px 10px',
                            borderRadius: 8,
                            border: '1.5px solid var(--pipo-rosewood)',
                            fontSize: 16
                          }}
                        />
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
                              { shadeName: `Tono ${variantsDraft.length + 1}`, stock: 0 }
                            ])
                          }
                        >
                          <Plus size={14} /> Añadir tono
                        </button>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  flex: '1 1 170px',
                  padding: '9px 13px',
                  borderRadius: 10,
                  border: '1.5px solid rgba(199,143,133,0.55)',
                  fontSize: 16,
                  background: '#fff'
                }}
              >
                <option value="ALL">Todas las categorías</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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
                              <div style={{ marginBottom: p.hasVariants ? 5 : 0 }}>
                                <span className={`badge badge-${stockBadge.tone}`}>Total: {totalStock} uds</span>
                              </div>
                              {p.hasVariants && (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                  {pVars.map((v) => (
                                    <span
                                      key={v.id}
                                      className={`badge ${v.stock === 0 ? 'badge-danger' : 'badge-brand'}`}
                                      style={{ fontSize: '0.7rem' }}
                                    >
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

      {/* ==================== TAB 2: PREDEFINED COMBOS ==================== */}
      {subTab === 'combos' && (
        <div className="grid-2">
          <div className="card card-cream">
            <h3 className="card-title">
              <Sparkles size={18} /> {cmbId ? 'Editar Combo Predefinido' : 'Crear Combo Predefinido'}
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--pipo-muted)', marginTop: 0 }}>
              Los combos actúan como plantillas: calculan cuántos puedes armar según tu stock actual y al venderlos te permiten cambiar cualquier producto X por Y solo en esa venta.
            </p>

            <form onSubmit={handleComboSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                          variantId: firstVar?.id || '',
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
                              variantId: nextVars[0]?.id || ''
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

                        <select
                          value={item.variantId || ''}
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
                    { items: cmbItems },
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
              <div className="empty-box">Todavía no has definido combos prearmados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {db.combos.map((combo) => {
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
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 6
                        }}
                      >
                        <div>
                          <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '1rem' }}>
                            {combo.code} · {combo.name}
                          </strong>
                          {combo.description && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--pipo-muted)' }}>
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
                          const v = ci.variantId ? variantsMap.get(ci.variantId) : null;
                          return (
                            <div key={i}>
                              • {ci.quantity}x {p?.name || 'Producto'}{' '}
                              {v && v.shadeName !== 'Único' ? `(${v.shadeName})` : ''}
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
                              setCmbItems(
                                (combo.items || []).map((x) => ({
                                  ...x,
                                  customComboUnitPrice: x.customComboUnitPrice ?? ''
                                }))
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
                  <label>Categoría</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                  >
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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
