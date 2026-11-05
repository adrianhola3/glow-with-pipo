import React, { useMemo, useState } from 'react';
import {
  Building2,
  Edit3,
  ExternalLink,
  MessageCircle,
  Plus,
  RefreshCw,
  Trash2,
  Truck
} from 'lucide-react';
import {
  computePackageUnitCost,
  computeWeightedAverageCost,
  formatCurrency,
  formatUnitCost,
  generateNextCode,
  roundMoney,
  toNumber
} from '../../domain/calculations.js';

function cleanWa(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('51') ? digits : `51${digits}`;
}

export default function RestocksView({
  db,
  currentUser,
  onRecordRestock,
  onSaveSupplier,
  onDeleteSupplier
}) {
  const [subTab, setSubTab] = useState('new_restock'); // new_restock | history | suppliers

  // Supplier form
  const [supId, setSupId] = useState(null);
  const [supCode, setSupCode] = useState('');
  const [supName, setSupName] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supWa, setSupWa] = useState('');
  const [supIg, setSupIg] = useState('');
  const [supTt, setSupTt] = useState('');
  const [supFb, setSupFb] = useState('');

  // Restock form
  const [rDate, setRDate] = useState(new Date().toISOString().slice(0, 10));
  const [rType, setRType] = useState('purchase');
  const [rNotes, setRNotes] = useState('');
  const [lines, setLines] = useState([]);

  // Quick box helper for multi-shade product
  const [boxProductId, setBoxProductId] = useState('');
  const [boxSupplierId, setBoxSupplierId] = useState('');
  const [boxTotalUnits, setBoxTotalUnits] = useState('24');
  const [boxTotalCost, setBoxTotalCost] = useState('');

  const productsMap = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const variantsMap = useMemo(() => new Map(db.variants.map((v) => [v.id, v])), [db.variants]);
  const suppliesMap = useMemo(() => new Map(db.supplies.map((s) => [s.id, s])), [db.supplies]);
  const suppliersMap = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s])), [db.suppliers]);

  const allVariantOptions = useMemo(() => {
    return db.variants.map((v) => {
      const p = productsMap.get(v.productId);
      const label = p
        ? `${p.code} · ${p.name}${p.hasVariants ? ` — ${v.shadeName}` : ''} (Stock: ${v.stock})`
        : v.shadeName;
      return { id: v.id, label, variant: v, product: p };
    });
  }, [db.variants, productsMap]);

  const multiShadeProducts = useMemo(
    () => db.products.filter((p) => p.hasVariants),
    [db.products]
  );

  function addVariantLine() {
    if (allVariantOptions.length === 0) return;
    const first = allVariantOptions[0];
    setLines([
      ...lines,
      {
        itemKind: 'variant',
        variantId: first.id,
        supplyId: '',
        supplierId: db.suppliers[0]?.id || '',
        quantity: '12',
        packageCost: '',
        unitCost: String(first.variant.unitCost || 0)
      }
    ]);
  }

  function addSupplyLine() {
    if (db.supplies.length === 0) return;
    const first = db.supplies[0];
    setLines([
      ...lines,
      {
        itemKind: 'supply',
        variantId: '',
        supplyId: first.id,
        supplierId: db.suppliers[0]?.id || '',
        quantity: '25',
        packageCost: '',
        unitCost: String(first.unitCost || 0)
      }
    ]);
  }

  function addAssortedBoxLines() {
    if (!boxProductId) return;
    const pVars = db.variants.filter((v) => v.productId === boxProductId);
    if (pVars.length === 0) return;

    const totalU = Math.max(1, Math.trunc(toNumber(boxTotalUnits, pVars.length)));
    const totalC = Math.max(0, toNumber(boxTotalCost, 0));
    const unitC = computePackageUnitCost(totalU, totalC);
    const baseQty = Math.floor(totalU / pVars.length);
    const rem = totalU % pVars.length;

    const newLines = pVars.map((v, idx) => {
      const q = baseQty + (idx < rem ? 1 : 0);
      return {
        itemKind: 'variant',
        variantId: v.id,
        supplyId: '',
        supplierId: boxSupplierId || db.suppliers[0]?.id || '',
        quantity: String(q),
        packageCost: String(roundMoney(q * unitC)),
        unitCost: String(unitC)
      };
    });

    setLines([...lines, ...newLines]);
    setBoxTotalCost('');
  }

  function updateLine(idx, patch) {
    const copy = [...lines];
    const merged = { ...copy[idx], ...patch };

    if ('packageCost' in patch || 'quantity' in patch) {
      const q = toNumber(merged.quantity, 0);
      const pkg = toNumber(merged.packageCost, -1);
      if (q > 0 && merged.packageCost !== '' && pkg >= 0) {
        merged.unitCost = String(computePackageUnitCost(q, pkg));
      }
    }
    if ('unitCost' in patch && merged.quantity) {
      merged.packageCost = String(
        roundMoney(toNumber(merged.quantity, 0) * toNumber(merged.unitCost, 0))
      );
    }

    copy[idx] = merged;
    setLines(copy);
  }

  const draftSummary = useMemo(() => {
    const perSupplier = new Map();
    let totalInvestment = 0;
    let totalUnits = 0;

    for (const l of lines) {
      const qty = Math.max(0, Math.trunc(toNumber(l.quantity, 0)));
      const uCost = Math.max(0, toNumber(l.unitCost, 0));
      const sub =
        l.packageCost !== '' && l.packageCost !== undefined
          ? roundMoney(toNumber(l.packageCost, qty * uCost))
          : roundMoney(qty * uCost);

      totalInvestment += sub;
      totalUnits += qty;

      const supName = suppliersMap.get(l.supplierId)?.name || 'Sin proveedor';
      const prev = perSupplier.get(supName) || 0;
      perSupplier.set(supName, roundMoney(prev + sub));
    }

    return {
      totalInvestment: roundMoney(totalInvestment),
      totalUnits,
      supplierList: Array.from(perSupplier.entries()).map(([name, spent]) => ({ name, spent }))
    };
  }, [lines, suppliersMap]);

  async function handleConfirmRestock(e) {
    e.preventDefault();
    if (lines.length === 0) return;

    await onRecordRestock({
      restockDate: rDate,
      entryType: rType,
      notes: rNotes,
      createdBy: currentUser?.name || '',
      items: lines.map((l) => ({
        supplierId: l.supplierId || null,
        itemKind: l.itemKind,
        variantId: l.itemKind === 'variant' ? l.variantId : null,
        supplyId: l.itemKind === 'supply' ? l.supplyId : null,
        quantity: toNumber(l.quantity, 1),
        packageCost: l.packageCost !== '' ? toNumber(l.packageCost, 0) : undefined,
        unitCost: toNumber(l.unitCost, 0)
      }))
    });

    setLines([]);
    setRNotes('');
    setSubTab('history');
  }

  async function handleSaveSupplierForm(e) {
    e.preventDefault();
    if (!supName.trim()) return;
    await onSaveSupplier({
      id: supId,
      code: supCode,
      name: supName,
      address: supAddress,
      whatsapp: supWa,
      instagramUrl: supIg,
      tiktokUrl: supTt,
      facebookUrl: supFb
    });
    setSupId(null);
    setSupCode('');
    setSupName('');
    setSupAddress('');
    setSupWa('');
    setSupIg('');
    setSupTt('');
    setSupFb('');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reabastecimientos y Proveedores</h1>
          <p className="page-subtitle">
            Registra compras con desglose por proveedor y Costo Promedio Ponderado automático en vivo.
          </p>
        </div>
      </div>

      <div className="tabs-row">
        <button
          type="button"
          className={`tab-chip ${subTab === 'new_restock' ? 'active' : ''}`}
          onClick={() => setSubTab('new_restock')}
        >
          <RefreshCw size={15} /> Nuevo Reabastecimiento
        </button>
        <button
          type="button"
          className={`tab-chip ${subTab === 'history' ? 'active' : ''}`}
          onClick={() => setSubTab('history')}
        >
          <Truck size={15} /> Historial de Compras ({db.restocks.length})
        </button>
        <button
          type="button"
          className={`tab-chip ${subTab === 'suppliers' ? 'active' : ''}`}
          onClick={() => setSubTab('suppliers')}
        >
          <Building2 size={15} /> Proveedores ({db.suppliers.length})
        </button>
      </div>

      {/* ==================== TAB 1: NEW RESTOCK ==================== */}
      {subTab === 'new_restock' && (
        <form onSubmit={handleConfirmRestock} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card card-cream">
            <h3 className="card-title">Datos de la Recarga de Stock</h3>
            <div className="form-grid">
              <div className="field">
                <label>Fecha de compra</label>
                <input type="date" required value={rDate} onChange={(e) => setRDate(e.target.value)} />
              </div>

              <div className="field">
                <label>Tipo de registro</label>
                <div className="category-button-grid" style={{ marginTop: 2 }}>
                  <button
                    type="button"
                    className={`category-pill-btn ${rType === 'purchase' ? 'active' : ''}`}
                    onClick={() => setRType('purchase')}
                  >
                    Compra (Suma a Inversión)
                  </button>
                  <button
                    type="button"
                    className={`category-pill-btn ${rType === 'initial_inventory' ? 'active' : ''}`}
                    onClick={() => setRType('initial_inventory')}
                  >
                    Ajuste / Inventario Inicial
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Nota o referencia (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. Compra quincenal Centro de Lima"
                  value={rNotes}
                  onChange={(e) => setRNotes(e.target.value)}
                />
              </div>
            </div>

            {multiShadeProducts.length > 0 && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 10,
                  background: '#fff',
                  border: '1px dashed var(--pipo-rosewood)'
                }}
              >
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: 'var(--pipo-burgundy)',
                    marginBottom: 8
                  }}
                >
                  Atajo para caja surtida por tonos (reparte unidades y costo en todos los tonos)
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="field" style={{ flex: '1 1 200px' }}>
                    <label>Producto con tonos</label>
                    <select value={boxProductId} onChange={(e) => setBoxProductId(e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {multiShadeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.brand || 'Sin marca'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: '1 1 160px' }}>
                    <label>Proveedor</label>
                    <select value={boxSupplierId} onChange={(e) => setBoxSupplierId(e.target.value)}>
                      <option value="">Sin proveedor</option>
                      {db.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: '1 1 110px' }}>
                    <label>Total uds caja</label>
                    <input
                      type="number"
                      min="1"
                      value={boxTotalUnits}
                      onChange={(e) => setBoxTotalUnits(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ flex: '1 1 130px' }}>
                    <label>Costo caja S/</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ej. 84.00"
                      value={boxTotalCost}
                      onChange={(e) => setBoxTotalCost(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!boxProductId || !boxTotalCost}
                    onClick={addAssortedBoxLines}
                  >
                    Cargar tonos de la caja
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Restock Items List */}
          <div className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 14
              }}
            >
              <h3 className="card-title" style={{ margin: 0 }}>
                Artículos y Bolsitas Comprados
              </h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={allVariantOptions.length === 0}
                  onClick={addVariantLine}
                >
                  <Plus size={14} /> Agregar Producto / Tono
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={db.supplies.length === 0}
                  onClick={addSupplyLine}
                >
                  <Plus size={14} /> Agregar Bolsitas / Insumo
                </button>
              </div>
            </div>

            {allVariantOptions.length === 0 && db.supplies.length === 0 && (
              <div className="empty-box">
                Primero registra tus productos o bolsitas en la sección Stock para poder reabastecerlos aquí.
              </div>
            )}

            {lines.length === 0 && (allVariantOptions.length > 0 || db.supplies.length > 0) && (
              <div className="empty-box">
                Usa los botones superiores para añadir los productos o bolsitas que compraste en esta fecha.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lines.map((line, idx) => {
                const curVariant = line.itemKind === 'variant' ? variantsMap.get(line.variantId) : null;
                const curSupply = line.itemKind === 'supply' ? suppliesMap.get(line.supplyId) : null;
                const curStock = curVariant ? curVariant.stock : curSupply ? curSupply.stock : 0;
                const curCost = curVariant ? curVariant.unitCost : curSupply ? curSupply.unitCost : 0;
                const newWac = computeWeightedAverageCost(
                  curStock,
                  curCost,
                  toNumber(line.quantity, 0),
                  toNumber(line.unitCost, 0)
                );

                return (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: 'var(--pipo-ivory)',
                      border: '1px solid rgba(199,143,133,0.4)'
                    }}
                  >
                    <div className="form-grid" style={{ alignItems: 'end' }}>
                      <div className="field">
                        <label>{line.itemKind === 'supply' ? 'Empaque / Bolsita' : 'Producto / Tono'}</label>
                        {line.itemKind === 'variant' ? (
                          <select
                            value={line.variantId}
                            onChange={(e) => {
                              const v = variantsMap.get(e.target.value);
                              updateLine(idx, {
                                variantId: e.target.value,
                                unitCost: String(v?.unitCost || 0)
                              });
                            }}
                          >
                            {allVariantOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={line.supplyId}
                            onChange={(e) => {
                              const s = suppliesMap.get(e.target.value);
                              updateLine(idx, {
                                supplyId: e.target.value,
                                unitCost: String(s?.unitCost || 0)
                              });
                            }}
                          >
                            {db.supplies.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.code} · {s.name} (Stock: {s.stock})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="field">
                        <label>Proveedor</label>
                        <select
                          value={line.supplierId}
                          onChange={(e) => updateLine(idx, { supplierId: e.target.value })}
                        >
                          <option value="">Sin proveedor</option>
                          {db.suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code} · {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label>Cantidad comprada</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        />
                      </div>

                      <div className="field">
                        <label>Costo Total Lote (S/)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Ej. 48.00"
                          value={line.packageCost}
                          onChange={(e) => updateLine(idx, { packageCost: e.target.value })}
                        />
                      </div>

                      <div className="field">
                        <label>Costo Unitario (S/)</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            required
                            value={line.unitCost}
                            onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                          />
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 8, fontSize: '0.79rem', color: 'var(--pipo-cocoa)' }}>
                      Stock pasará de <strong>{curStock}</strong> a{' '}
                      <strong>{curStock + Math.max(0, Math.trunc(toNumber(line.quantity, 0)))} uds</strong> · Nuevo Costo Promedio Ponderado:{' '}
                      <strong>{formatUnitCost(newWac)}</strong> (antes {formatUnitCost(curCost)})
                    </div>
                  </div>
                );
              })}
            </div>

            {lines.length > 0 && (
              <div
                style={{
                  marginTop: 18,
                  padding: 15,
                  borderRadius: 12,
                  background: 'rgba(243, 225, 205, 0.5)',
                  border: '1px solid var(--pipo-rosewood)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 14
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 800,
                      color: 'var(--pipo-burgundy)',
                      marginBottom: 4
                    }}
                  >
                    Gasto por proveedor en esta compra:
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {draftSummary.supplierList.map((sp) => (
                      <span key={sp.name} className="badge badge-brand">
                        {sp.name}: {formatCurrency(sp.spent)}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--pipo-muted)' }}>
                    Total unidades: <strong>{draftSummary.totalUnits}</strong>
                  </div>
                  <div
                    style={{
                      fontSize: '1.3rem',
                      fontFamily: 'var(--font-display)',
                      color: 'var(--pipo-burgundy)'
                    }}
                  >
                    Inversión Total: {formatCurrency(draftSummary.totalInvestment)}
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>
                    Confirmar Reabastecimiento
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      {/* ==================== TAB 2: RESTOCK HISTORY ==================== */}
      {subTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {db.restocks.length === 0 ? (
            <div className="card empty-box">Aún no hay compras ni cargas registradas.</div>
          ) : (
            db.restocks.map((r) => {
              const bySup = new Map();
              let totalQty = 0;
              for (const item of r.items || []) {
                const sName = suppliersMap.get(item.supplierId)?.name || 'Sin proveedor';
                bySup.set(sName, roundMoney((bySup.get(sName) || 0) + toNumber(item.subtotalCost, 0)));
                totalQty += item.quantity;
              }

              return (
                <div key={r.id} className="card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '1.05rem' }}>
                        {r.code} · {r.restockDate}
                      </strong>
                      <span
                        className={`badge ${
                          r.entryType === 'initial_inventory' ? 'badge-brand' : 'badge-success'
                        }`}
                        style={{ marginLeft: 8 }}
                      >
                        {r.entryType === 'initial_inventory' ? 'Inventario Inicial' : 'Reabastecimiento'}
                      </span>
                      {r.notes && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--pipo-muted)', marginTop: 2 }}>
                          {r.notes}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--pipo-burgundy)', fontSize: '1.06rem' }}>
                        Total invertido: {formatCurrency(r.totalInvestment)}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--pipo-muted)' }}>
                        {totalQty} unidades totales
                      </div>
                    </div>
                  </div>

                  {r.entryType === 'purchase' && bySup.size > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
                      {Array.from(bySup.entries()).map(([sName, amt]) => (
                        <span key={sName} className="badge badge-warning">
                          {sName}: {formatCurrency(amt)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="table-wrap" style={{ marginTop: 10 }}>
                    <table className="pipo-table mobile-cards">
                      <thead>
                        <tr>
                          <th>Artículo</th>
                          <th>Proveedor</th>
                          <th>Cantidad</th>
                          <th>Costo Unitario</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(r.items || []).map((it) => (
                          <tr key={it.id}>
                            <td data-label="Artículo">
                              <strong>{it.itemLabelSnapshot}</strong>
                            </td>
                            <td data-label="Proveedor">
                              {suppliersMap.get(it.supplierId)?.name || '—'}
                            </td>
                            <td data-label="Cantidad">{it.quantity} uds</td>
                            <td data-label="Costo Unit.">{formatUnitCost(it.unitCost)}</td>
                            <td data-label="Subtotal">{formatCurrency(it.subtotalCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ==================== TAB 3: SUPPLIERS DIRECTORY ==================== */}
      {subTab === 'suppliers' && (
        <div className="grid-2">
          <div className="card card-cream">
            <h3 className="card-title">
              <Building2 size={18} /> {supId ? 'Editar Proveedor' : 'Registrar Proveedor'}
            </h3>
            <form onSubmit={handleSaveSupplierForm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid">
                <div className="field">
                  <label>Código de proveedor</label>
                  <input
                    type="text"
                    placeholder={generateNextCode('PROV', db.suppliers)}
                    value={supCode}
                    onChange={(e) => setSupCode(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Nombre del proveedor *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Importaciones Jarusa / Galería Capón"
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Número de WhatsApp</label>
                  <input
                    type="tel"
                    placeholder="Ej. 987654321"
                    value={supWa}
                    onChange={(e) => setSupWa(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Dirección física / Stand</label>
                  <input
                    type="text"
                    placeholder="Ej. Jr. Andahuaylas 850 Tda 204"
                    value={supAddress}
                    onChange={(e) => setSupAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Link o usuario de TikTok</label>
                  <input
                    type="text"
                    placeholder="https://tiktok.com/@..."
                    value={supTt}
                    onChange={(e) => setSupTt(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Link o usuario de Instagram</label>
                  <input
                    type="text"
                    placeholder="https://instagram.com/..."
                    value={supIg}
                    onChange={(e) => setSupIg(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Link de Facebook</label>
                  <input
                    type="text"
                    placeholder="https://facebook.com/..."
                    value={supFb}
                    onChange={(e) => setSupFb(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary">
                  {supId ? 'Actualizar Proveedor' : 'Guardar Proveedor'}
                </button>
                {supId && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setSupId(null);
                      setSupCode('');
                      setSupName('');
                      setSupAddress('');
                      setSupWa('');
                      setSupIg('');
                      setSupTt('');
                      setSupFb('');
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h3 className="card-title">Directorio de Proveedores</h3>
            {db.suppliers.length === 0 ? (
              <div className="empty-box">Todavía no hay proveedores registrados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {db.suppliers.map((s) => {
                  const wa = cleanWa(s.whatsapp);
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: 13,
                        borderRadius: 12,
                        background: 'var(--pipo-ivory)',
                        border: '1px solid rgba(199,143,133,0.4)'
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
                        <strong>
                          {s.code} · {s.name}
                        </strong>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setSupId(s.id);
                              setSupCode(s.code);
                              setSupName(s.name);
                              setSupAddress(s.address || '');
                              setSupWa(s.whatsapp || '');
                              setSupIg(s.instagramUrl || '');
                              setSupTt(s.tiktokUrl || '');
                              setSupFb(s.facebookUrl || '');
                            }}
                          >
                            <Edit3 size={13} /> Editar
                          </button>
                          {onDeleteSupplier && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                if (window.confirm(`¿Eliminar al proveedor "${s.name}"?`)) {
                                  onDeleteSupplier(s.id);
                                }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      {s.address && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--pipo-muted)', marginTop: 3 }}>
                          📍 {s.address}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        {wa && (
                          <a
                            href={`https://wa.me/${wa}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                          >
                            <MessageCircle size={13} /> WhatsApp ({s.whatsapp})
                          </a>
                        )}
                        {s.tiktokUrl && (
                          <a
                            href={s.tiktokUrl.startsWith('http') ? s.tiktokUrl : `https://tiktok.com/${s.tiktokUrl.replace(/^@/, '@')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            <ExternalLink size={13} /> TikTok
                          </a>
                        )}
                        {s.instagramUrl && (
                          <a
                            href={s.instagramUrl.startsWith('http') ? s.instagramUrl : `https://instagram.com/${s.instagramUrl.replace(/^@/, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            <ExternalLink size={13} /> Instagram
                          </a>
                        )}
                        {s.facebookUrl && (
                          <a
                            href={s.facebookUrl.startsWith('http') ? s.facebookUrl : `https://${s.facebookUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            <ExternalLink size={13} /> Facebook
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
