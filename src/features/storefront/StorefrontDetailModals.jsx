import React from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, ShoppingBag, Minus, Plus, Sparkles } from 'lucide-react';
import { formatMoney } from '../../domain/calculations.js';

export function ProductDetailModal({
  StorefrontProductImage,
  closeProductDetail,
  detailActiveShadeId,
  detailProduct,
  detailQty,
  detailShadeViewMode,
  getCategoryEmoji,
  handleAddDetailProductToCart,
  setDetailActiveShadeId,
  setDetailQty,
  setDetailShadeViewMode,
  setSelectedVariantByProduct
}) {
  return (<>
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
  </>);
}

export function ComboDetailModal({
  StorefrontProductImage,
  closeComboDetail,
  detailCombo,
  detailComboMaxQty,
  detailComboShadeChoices,
  detailQty,
  handleAddDetailComboToCart,
  setDetailComboShadeChoices,
  setDetailQty
}) {
  return (<>
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
                            disabled={!detailCombo.comboMeta.isAvailable || detailQty >= detailComboMaxQty}
                            onClick={() => setDetailQty((q) => Math.min(detailComboMaxQty, q + 1))}
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
                          disabled={!detailCombo.comboMeta.isAvailable || detailComboMaxQty <= 0}
                          className="btn btn-primary pipo-detail-add-cart-btn"
                          onClick={() => handleAddDetailComboToCart(false)}
                        >
                          <ShoppingBag size={18} />
                          <span>Agregar Combo {detailQty > 1 ? `(${detailQty})` : ''}</span>
                        </button>

                        <button
                          type="button"
                          disabled={!detailCombo.comboMeta.isAvailable || detailComboMaxQty <= 0}
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
  </>);
}
