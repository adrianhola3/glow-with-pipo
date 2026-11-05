import React from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  MapPin,
  MessageCircle,
  Package,
  PlusCircle,
  ShoppingBag,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { formatCurrency, getStockLevelBadge } from '../../domain/calculations.js';

function cleanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('51') ? digits : `51${digits}`;
}

export default function DashboardView({
  metrics,
  onNavigate,
  onRequestNotificationPermission,
  notifPermission
}) {
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Panel General — Glow with Pipo</h1>
          <p className="page-subtitle">
            Resumen en vivo de ganancias, stock, inversión por proveedor y recordatorios de entrega.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onNavigate('inventory')}>
            <Package size={16} /> Cargar Producto
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onNavigate('sales')}>
            <PlusCircle size={16} /> Registrar Pedido / Venta
          </button>
        </div>
      </div>

      {/* Delivery Reminders Banner */}
      <div className="reminder-banner">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: metrics.pendingDeliveries.length > 0 ? 12 : 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <CalendarClock size={20} color="var(--pipo-burgundy)" />
            <strong style={{ color: 'var(--pipo-burgundy)', fontSize: '0.96rem' }}>
              Recordatorios de Entregas Acordadas ({metrics.pendingDeliveries.length})
            </strong>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {typeof Notification !== 'undefined' && notifPermission !== 'granted' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onRequestNotificationPermission}
              >
                <Bell size={14} /> Activar alertas
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('sales')}>
              Ver pedidos
            </button>
          </div>
        </div>

        {metrics.pendingDeliveries.length === 0 ? (
          <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: 'var(--pipo-muted)' }}>
            No hay entregas pendientes programadas por ahora. Cuando registres un pedido con fecha, hora y lugar aparecerá aquí.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
            {metrics.pendingDeliveries.slice(0, 6).map((order) => {
              const isToday = order.deliveryDate === todayStr;
              const isOverdue = order.deliveryDate && order.deliveryDate < todayStr;
              const waPhone = cleanPhone(order.customer?.whatsapp);

              return (
                <div
                  key={order.id}
                  style={{
                    background: '#fffdf9',
                    borderRadius: 12,
                    padding: '11px 13px',
                    border: isOverdue
                      ? '1.5px solid #c53030'
                      : isToday
                      ? '1.5px solid var(--pipo-burgundy)'
                      : '1px solid rgba(199,143,133,0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: 'var(--pipo-burgundy)', fontSize: '0.88rem' }}>
                      {order.code} · {order.customer?.name || 'Cliente'}
                    </span>
                    <span className={`badge ${isOverdue ? 'badge-danger' : isToday ? 'badge-warning' : 'badge-brand'}`}>
                      {isOverdue ? 'Atrasado' : isToday ? 'Hoy' : order.deliveryDate || 'Sin fecha'}
                      {order.deliveryTime ? ` · ${order.deliveryTime}` : ''}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--pipo-espresso)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={13} color="var(--pipo-cocoa)" style={{ flexShrink: 0 }} />
                    <span>{order.deliveryLocation || 'Lugar por coordinar'}</span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginTop: 4,
                      paddingTop: 6,
                      borderTop: '1px dashed rgba(199,143,133,0.35)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <span>
                      Pagó: <strong>{formatCurrency(order.amountPaid)}</strong> · Falta:{' '}
                      <strong style={{ color: order.balanceDue > 0 ? '#9b1c1c' : '#1f6b3b' }}>
                        {formatCurrency(order.balanceDue)}
                      </strong>
                    </span>
                    {waPhone && (
                      <a
                        href={`https://wa.me/${waPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      >
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card highlight">
          <span className="kpi-label">Ganancia Neta de Ventas</span>
          <span className="kpi-value">{formatCurrency(metrics.realizedNetProfit)}</span>
          <span className="kpi-foot">
            {metrics.totalSalesCount} pedidos activos · Bolsitas: {formatCurrency(metrics.totalSuppliesAbsorbed)}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Ingresos por Productos</span>
          <span className="kpi-value">{formatCurrency(metrics.realizedRevenue)}</span>
          <span className="kpi-foot">
            Por cobrar en entregas: <strong>{formatCurrency(metrics.totalReceivables)}</strong>
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Capital en Stock Actual</span>
          <span className="kpi-value">{formatCurrency(metrics.inventoryInvestedValue)}</span>
          <span className="kpi-foot">
            {metrics.totalProducts} prod. · {metrics.totalStockUnits} uds (+ {formatCurrency(metrics.suppliesValue)} bolsas)
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Ventas / Ganancia Potencial</span>
          <span className="kpi-value">{formatCurrency(metrics.potentialRevenue)}</span>
          <span className="kpi-foot">
            Ganancia potencial: <strong>{formatCurrency(metrics.potentialProfit)}</strong>
          </span>
        </div>
      </div>

      {/* Traffic Light Summary + Stock Alerts */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card card-cream">
          <h3 className="card-title">
            <TrendingUp size={18} /> Análisis de Stock (Semáforo del Catálogo)
          </h3>
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <div style={{ padding: 12, borderRadius: 12, background: 'var(--status-err-bg)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--status-err-fg)' }}>
                STOCK BAJO (1–5) / AGOTADO
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--status-err-fg)', marginTop: 2 }}>
                {metrics.stockDistribution.low + metrics.stockDistribution.out}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--status-err-fg)' }}>
                Agotados: {metrics.stockDistribution.out}
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 12, background: 'var(--status-warn-bg)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--status-warn-fg)' }}>
                STOCK MEDIO (6–12)
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--status-warn-fg)', marginTop: 2 }}>
                {metrics.stockDistribution.medium}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--status-warn-fg)' }}>Productos estables</div>
            </div>

            <div style={{ padding: 12, borderRadius: 12, background: 'var(--status-ok-bg)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--status-ok-fg)' }}>
                STOCK ALTO (13+)
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--status-ok-fg)', marginTop: 2 }}>
                {metrics.stockDistribution.high}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--status-ok-fg)' }}>Buen respaldo</div>
            </div>
          </div>

          <h4
            style={{
              margin: '12px 0 8px',
              fontSize: '0.86rem',
              color: 'var(--pipo-burgundy)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <AlertTriangle size={15} /> Tonos / Productos con Stock Crítico (≤ 4 unidades)
          </h4>
          {metrics.criticalStockVariants.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--pipo-muted)' }}>
              Ningún producto o tono está en alerta crítica de stock.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto' }}>
              {metrics.criticalStockVariants.slice(0, 8).map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    background: '#fff',
                    borderRadius: 9,
                    border: '1px solid rgba(199,143,133,0.35)',
                    fontSize: '0.84rem'
                  }}
                >
                  <span>
                    <strong>{v.productName}</strong>{' '}
                    {v.shadeName && v.shadeName !== 'Único' ? `· ${v.shadeName}` : ''}{' '}
                    {v.brand ? <span style={{ color: 'var(--pipo-muted)' }}>({v.brand})</span> : null}
                  </span>
                  <span className="badge badge-danger">{v.stock} uds</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 5 Profit + Supplier Investment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <h3 className="card-title">
              <ShoppingBag size={18} /> Top 5 Mayor Ganancia Potencial en Stock
            </h3>
            {metrics.topPotentialProfit.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--pipo-muted)' }}>
                Aún no hay productos cargados en el inventario.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="pipo-table mobile-cards">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Stock</th>
                      <th>Invertido</th>
                      <th>Ganancia Potencial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.topPotentialProfit.map((row) => (
                      <tr key={row.product.id}>
                        <td data-label="Producto">
                          <div>
                            <strong>{row.product.name}</strong>
                            {row.product.brand && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--pipo-muted)' }}>
                                {row.product.brand}
                              </div>
                            )}
                          </div>
                        </td>
                        <td data-label="Stock">{row.stock} uds</td>
                        <td data-label="Invertido">{formatCurrency(row.invested)}</td>
                        <td
                          data-label="Ganancia Potencial"
                          style={{ fontWeight: 800, color: 'var(--status-ok-fg)' }}
                        >
                          {formatCurrency(row.potentialProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">
              <Wallet size={18} /> Inversión en Reabastecimientos ({formatCurrency(metrics.totalRestockPurchases)})
            </h3>
            {metrics.supplierBreakdown.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--pipo-muted)' }}>
                El inventario inicial no se mezcla como gasto nuevo. Cuando registres compras de reabastecimiento verás aquí cuánto invertiste en cada proveedor.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="pipo-table mobile-cards">
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Unidades compradas</th>
                      <th>Total invertido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.supplierBreakdown.map((sup) => (
                      <tr key={sup.supplierId}>
                        <td data-label="Proveedor">
                          <strong>{sup.name}</strong>
                        </td>
                        <td data-label="Unidades">{sup.unitsBought} uds</td>
                        <td
                          data-label="Invertido"
                          style={{ fontWeight: 800, color: 'var(--pipo-burgundy)' }}
                        >
                          {formatCurrency(sup.totalSpent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Heatmap Table */}
      <div className="card">
        <h3 className="card-title">Mapa de Calor — Inventario Completo por Producto</h3>
        {metrics.productHeatmap.length === 0 ? (
          <div className="empty-box">
            <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
              Tu inventario en Supabase está limpio y listo para empezar.
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('inventory')}>
              Subir primer producto manualmente
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="pipo-table mobile-cards">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto / Marca</th>
                  <th>Categoría</th>
                  <th>Stock Total</th>
                  <th>P. Unitario / Combo</th>
                  <th>Invertido</th>
                  <th>Ganancia Potencial</th>
                </tr>
              </thead>
              <tbody>
                {metrics.productHeatmap.map((row) => {
                  const badge = getStockLevelBadge(row.stock);
                  return (
                    <tr key={row.product.id}>
                      <td data-label="Código" style={{ fontWeight: 700, fontSize: '0.8rem' }}>
                        {row.product.code}
                      </td>
                      <td data-label="Producto">
                        <div>
                          <strong>{row.product.name}</strong>
                          <span style={{ color: 'var(--pipo-muted)', fontSize: '0.8rem' }}>
                            {row.product.brand ? ` · ${row.product.brand}` : ' · Sin marca'}
                          </span>
                        </div>
                      </td>
                      <td data-label="Categoría">
                        <span className="badge badge-brand">{row.product.category}</span>
                      </td>
                      <td data-label="Stock Total">
                        <span className={`badge badge-${badge.tone}`}>{badge.label}</span>
                      </td>
                      <td data-label="Precios">
                        <span>
                          {formatCurrency(row.product.unitPrice)}{' '}
                          <span style={{ color: 'var(--pipo-muted)', fontSize: '0.8rem' }}>
                            (Combo: {formatCurrency(row.product.comboPrice)})
                          </span>
                        </span>
                      </td>
                      <td data-label="Invertido">{formatCurrency(row.invested)}</td>
                      <td
                        data-label="Ganancia Potencial"
                        style={{ fontWeight: 800, color: 'var(--status-ok-fg)' }}
                      >
                        {formatCurrency(row.potentialProfit)}
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
  );
}
