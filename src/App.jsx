import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Truck
} from 'lucide-react';
import { computeDashboardMetrics } from './domain/calculations.js';
import {
  applyAddCategory,
  applyAddSalePayment,
  applyCreateOrUpdateCombo,
  applyCreateOrUpdateCustomer,
  applyCreateOrUpdateSupplier,
  applyCreateOrUpdateSupply,
  applyCreateProductWithInitialStock,
  applyCreateSale,
  applyDeleteCategory,
  applyDeleteCombo,
  applyDeleteCustomer,
  applyDeleteDeliveryPoint,
  applyDeleteDeliverySlot,
  applyDeleteProduct,
  applyDeleteSale,
  applyDeleteSupplier,
  applyDeleteSupply,
  applyRecordRestock,
  applySaveDeliveryPoint,
  applySaveDeliverySlot,
  applyUpdateProduct,
  applyUpdateSaleStatus,
  applyUpdateStorefrontMerchandising,
  cloudAddCategory,
  cloudAddSalePayment,
  cloudCreateProductWithInitialStock,
  cloudCreateSale,
  cloudDeleteCategory,
  cloudDeleteCombo,
  cloudDeleteCustomer,
  cloudDeleteDeliveryPoint,
  cloudDeleteDeliverySlot,
  cloudDeleteProduct,
  cloudDeleteSale,
  cloudDeleteSupplier,
  cloudDeleteSupply,
  cloudRecordRestock,
  cloudSaveCombo,
  cloudSaveCustomer,
  cloudSaveDeliveryPoint,
  cloudSaveDeliverySlot,
  cloudSaveSupplier,
  cloudSaveSupply,
  cloudSimulateOrRegisterYapePayment,
  cloudUpdateProduct,
  cloudUpdateSaleStatus,
  cloudUpdateStorefrontMerchandising,
  cloudUpdateYapeGateway,
  fetchSupabaseDatabase,
  getSavedSession,
  getSupabaseConfig,
  importLocalDbJson,
  isSessionExpired,
  loadLocalDb,
  recordUserActivity,
  restoreSupabaseSession,
  saveLocalDb,
  signOutApp,
  subscribeSupabaseRealtime,
  syncStateToSupabase,
  updateLocalOwnerAccount
} from './adapters/storageRepository.js';
import LoginView from './features/auth/LoginView.jsx';
import DashboardView from './features/dashboard/DashboardView.jsx';
import InventoryView from './features/inventory/InventoryView.jsx';
import RestocksView from './features/restocks/RestocksView.jsx';
import SalesView from './features/sales/SalesView.jsx';
import SettingsView from './features/settings/SettingsView.jsx';
import StorefrontView from './features/storefront/StorefrontView.jsx';
import StorefrontAdminView from './features/storefront/StorefrontAdminView.jsx';

export default function App() {
  const [session, setSession] = useState(() => getSavedSession());
  const [db, setDb] = useState(() => loadLocalDb());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [unauthView, setUnauthView] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = (window.location.hash || '').toLowerCase();
      if (hash.includes('login') || hash.includes('staff') || hash.includes('erp')) return 'login';
    }
    return 'storefront';
  });
  const [isStaffPreviewActive, setIsStaffPreviewActive] = useState(false);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const [toast, setToast] = useState(null);
  const [showCloudModalFromLogin, setShowCloudModalFromLogin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('DISCONNECTED');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isProtectedMode = useMemo(() => {
    if (session?.mode !== 'supabase') return false;
    return !isOnline || realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'CLOSED' || realtimeStatus === 'TIMED_OUT';
  }, [session, isOnline, realtimeStatus]);

  const notify = useCallback((text, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3800);
  }, []);

  // Alert Adrián & Fabiana when a new web order is received in db.sales
  const prevWebSalesCountRef = useRef(
    (db.sales || []).filter((s) => s.orderSource === 'web').length
  );
  useEffect(() => {
    const currentWebCount = (db.sales || []).filter((s) => s.orderSource === 'web').length;
    if (session && currentWebCount > prevWebSalesCountRef.current) {
      notify('🌸 ¡Nuevo pedido web recibido de cliente!');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Glow with Pipo — ¡Nuevo Pedido Web!', {
            body: 'Un cliente acaba de registrar un pedido en la tienda web.',
            icon: `${import.meta.env.BASE_URL || './'}icon-192.png`
          });
        } catch {}
      }
    }
    prevWebSalesCountRef.current = currentWebCount;
  }, [db.sales, session, notify]);

  // Swipe navigation between menu options
  const touchStartRef = useRef({ x: 0, y: 0, time: 0, ignore: false });

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target;
    // Ignore touches starting inside interactive controls, modals or horizontally scrollable chips
    const isInteractive = target.closest(
      'input, textarea, select, button, .modal-panel, .modal-backdrop, .pipo-select-menu, .category-chips-bar, [data-no-swipe]'
    );
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      ignore: !!isInteractive
    };
  };

  const handleTouchEnd = (e) => {
    if (touchStartRef.current.ignore) return;
    if (e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;

    // Minimum 55px horizontal swipe, predominantly horizontal (dx > dy * 1.4), within 500ms
    if (dt < 500 && Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const tabOrder = ['dashboard', 'sales', 'storefront', 'inventory', 'restocks', 'settings'];
      const currentIndex = tabOrder.indexOf(activeTab);
      if (currentIndex === -1) return;

      if (dx < -55 && currentIndex < tabOrder.length - 1) {
        // Swiped Left -> go to NEXT tab
        setActiveTab(tabOrder[currentIndex + 1]);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(12); } catch {}
        }
      } else if (dx > 55 && currentIndex > 0) {
        // Swiped Right -> go to PREVIOUS tab
        setActiveTab(tabOrder[currentIndex - 1]);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(12); } catch {}
        }
      }
    }
  };

  // Restore active Supabase session on startup (with inactivity timeout check)
  useEffect(() => {
    restoreSupabaseSession()
      .then((sess) => {
        if (sess) {
          setSession(sess);
          recordUserActivity();
        } else if (isSessionExpired()) {
          setSessionExpiredNotice(true);
          setUnauthView('login');
        }
      })
      .catch(() => {});
  }, []);

  // Inactivity tracking and automatic session expiration
  useEffect(() => {
    if (!session) return;

    recordUserActivity();

    let lastRecorded = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle recording to disk to once every 10 seconds
      if (now - lastRecorded > 10000) {
        lastRecorded = now;
        recordUserActivity(now);
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    const checkInactivity = async () => {
      if (isSessionExpired()) {
        await signOutApp();
        setSession(null);
        setUnauthView('login');
        setSessionExpiredNotice(true);
        notify('Tu sesión ha expirado por inactividad. Ingresa de nuevo.', true);
      }
    };

    // Check every 15 seconds
    const intervalId = setInterval(checkInactivity, 15000);

    // Also check immediately when tab becomes visible / phone wakes up
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, notify]);

  // Cross-tab local storage sync
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'glow_with_pipo_db_v1') {
        setDb(loadLocalDb());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Live Supabase Realtime synchronization and network/visibility auto-pull
  useEffect(() => {
    if (!session || session.mode !== 'supabase') return;

    let isMounted = true;
    async function pullLatest(silent = false) {
      try {
        const cloudDb = await fetchSupabaseDatabase();
        if (isMounted) {
          setDb(cloudDb);
          saveLocalDb(cloudDb);
          setLastSyncedAt(new Date());
        }
      } catch (err) {
        if (!silent && isMounted) {
          notify(err.message || 'No se pudo conectar con Supabase.', true);
        }
      }
    }

    pullLatest();

    let unsubFn = null;
    subscribeSupabaseRealtime(
      () => {
        pullLatest(true);
      },
      (status) => {
        if (isMounted) setRealtimeStatus(status);
      }
    ).then((unsub) => {
      unsubFn = unsub;
    });

    function onVisibilityOrOnline() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        pullLatest(true);
        checkForAppUpdate(true);
      }
    }

    window.addEventListener('visibilitychange', onVisibilityOrOnline);
    window.addEventListener('online', onVisibilityOrOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('visibilitychange', onVisibilityOrOnline);
      window.removeEventListener('online', onVisibilityOrOnline);
      if (unsubFn) unsubFn();
    };
  }, [session, notify]);

  // App auto-update checker against version.json buildId with immediate cache purge and hot reload
  const checkForAppUpdate = useCallback(
    async (silent = false) => {
      try {
        const base = import.meta.env.BASE_URL || './';
        const url = `${base.replace(/\/+$/, '')}/version.json?t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (
          data.buildId &&
          typeof __APP_BUILD_ID__ !== 'undefined' &&
          data.buildId !== __APP_BUILD_ID__
        ) {
          notify('✨ Nueva versión detectada. Actualizando automáticamente...', false);
          if ('caches' in window) {
            try {
              const keys = await caches.keys();
              await Promise.all(keys.map((k) => caches.delete(k)));
            } catch {}
          }
          if ('serviceWorker' in navigator) {
            try {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                await reg.update();
                if (reg.waiting) {
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            } catch {}
          }
          setTimeout(() => {
            window.location.reload();
          }, 600);
        } else if (!silent) {
          notify('La aplicación ya está en su versión más reciente.');
        }
      } catch {
        if (!silent) notify('No se pudo comprobar actualizaciones en este momento.', true);
      }
    },
    [notify]
  );

  // Periodic update check every 20 seconds, plus on visibility/focus/online
  useEffect(() => {
    checkForAppUpdate(true);
    const timer = setInterval(() => checkForAppUpdate(true), 20000);

    function onFocusOrVisible() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        checkForAppUpdate(true);
      }
    }

    window.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('focus', onFocusOrVisible);
    window.addEventListener('online', onFocusOrVisible);

    return () => {
      clearInterval(timer);
      window.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('focus', onFocusOrVisible);
      window.removeEventListener('online', onFocusOrVisible);
    };
  }, [checkForAppUpdate]);

  const metrics = useMemo(() => computeDashboardMetrics(db), [db]);

  // Browser notification check for today's scheduled deliveries
  useEffect(() => {
    if (!session || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const today = new Date().toISOString().slice(0, 10);
    const dueToday = metrics.pendingDeliveries.filter((d) => d.deliveryDate === today);
    if (dueToday.length > 0 && !sessionStorage.getItem('pipo_notified_today')) {
      sessionStorage.setItem('pipo_notified_today', '1');
      try {
        new Notification('Glow with Pipo — Entregas de Hoy', {
          body: `Tienes ${dueToday.length} pedido(s) programados para entregar hoy.`,
          icon: `${import.meta.env.BASE_URL || './'}icon-192.png`
        });
      } catch {
        // Ignore on unsupported contexts
      }
    }
  }, [session, metrics.pendingDeliveries]);

  // Unified mutation pipeline: optimistic local update + immediate direct cloud write
  async function commitMutation({ optimisticFn, cloudFn, successMsg }) {
    if (isProtectedMode) {
      notify('⚠️ Edición bloqueada: La aplicación está en Modo Protección sin conexión a Supabase.', true);
      return;
    }
    let nextDb;
    try {
      nextDb = optimisticFn(db);
      setDb(nextDb);
      saveLocalDb(nextDb);
    } catch (localErr) {
      notify(localErr.message || 'Error de validación local.', true);
      return;
    }

    if (session?.mode === 'supabase' && getSupabaseConfig()) {
      setIsSyncing(true);
      try {
        const cloudDb = await cloudFn(db);
        setDb(cloudDb);
        saveLocalDb(cloudDb);
        setLastSyncedAt(new Date());
        if (successMsg) notify(successMsg);
      } catch (cloudErr) {
        // Rollback on server error by pulling fresh server state
        try {
          const fresh = await fetchSupabaseDatabase();
          setDb(fresh);
          saveLocalDb(fresh);
        } catch {
          // Keep offline state
        }
        notify(cloudErr.message || 'Error al guardar en Supabase.', true);
      } finally {
        setIsSyncing(false);
      }
    } else {
      if (successMsg) notify(successMsg);
    }
  }

  async function handleRequestNotifications() {
    if (typeof Notification === 'undefined') return;
    const res = await Notification.requestPermission();
    setNotifPermission(res);
    if (res === 'granted') {
      notify('Alertas de recordatorios de entrega activadas en este dispositivo.');
    }
  }

  const syncStatusText = useMemo(() => {
    if (isSyncing) return 'Guardando en la nube...';
    if (session?.mode === 'supabase') {
      if (realtimeStatus === 'SUBSCRIBED') {
        return lastSyncedAt
          ? `En vivo · ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'En vivo';
      }
      return 'Conectando...';
    }
    return 'Modo local';
  }, [isSyncing, session, realtimeStatus, lastSyncedAt]);

  const syncDotClass = useMemo(() => {
    if (isSyncing) return 'sync-dot syncing';
    if (session?.mode === 'supabase' && realtimeStatus === 'SUBSCRIBED') return 'sync-dot connected';
    return 'sync-dot';
  }, [isSyncing, session, realtimeStatus]);

  if (!session) {
    if (unauthView === 'login') {
      return (
        <>
          {toast && <div className={`toast-banner ${toast.isError ? 'error' : ''}`}>{toast.text}</div>}
          <LoginView
            sessionExpired={sessionExpiredNotice}
            onLoggedIn={(sess) => {
              setSessionExpiredNotice(false);
              setSession(sess);
              notify(`Hola, ${sess.name}`);
            }}
            onBackToStorefront={() => {
              setSessionExpiredNotice(false);
              setUnauthView('storefront');
            }}
          />
        </>
      );
    }
    return (
      <>
        {toast && <div className={`toast-banner ${toast.isError ? 'error' : ''}`}>{toast.text}</div>}
        <StorefrontView
          fallbackDb={db}
          isStaffLoggedIn={false}
          onOpenStaffLogin={() => setUnauthView('login')}
        />
      </>
    );
  }

  if (isStaffPreviewActive) {
    return (
      <>
        {toast && <div className={`toast-banner ${toast.isError ? 'error' : ''}`}>{toast.text}</div>}
        <StorefrontView
          fallbackDb={db}
          isStaffLoggedIn={true}
          onReturnToErp={() => setIsStaffPreviewActive(false)}
        />
      </>
    );
  }

  const pendingCount = metrics.pendingDeliveries.length;
  const pendingWebCount = (db.sales || []).filter(
    (s) =>
      s.orderSource === 'web' &&
      s.paymentVerificationStatus === 'pending_yape_verification' &&
      s.status !== 'cancelled'
  ).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Inicio', icon: LayoutDashboard, badge: 0 },
    { id: 'sales', label: 'Pedidos y Ventas', mobileLabel: 'Vender', icon: ShoppingBag, badge: pendingCount },
    { id: 'storefront', label: 'Tienda Web & Entregas', mobileLabel: 'Tienda', icon: Store, badge: pendingWebCount },
    { id: 'inventory', label: 'Stock y Combos', mobileLabel: 'Stock', icon: Package, badge: 0 },
    { id: 'restocks', label: 'Compras y Prov.', mobileLabel: 'Compras', icon: Truck, badge: 0 },
    { id: 'settings', label: 'Nube y Ajustes', mobileLabel: 'Ajustes', icon: Settings, badge: 0 }
  ];

  return (
    <div
      className="app-shell"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {toast && <div className={`toast-banner ${toast.isError ? 'error' : ''}`}>{toast.text}</div>}

      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="brand-box">
          <img src={`${import.meta.env.BASE_URL || './'}icon-192.png`} alt="Glow with Pipo" />
          <div>
            <h2 className="brand-title">GLOW</h2>
            <p className="brand-sub">with pipo · ERP</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              {session.mode === 'supabase' ? (
                <Cloud size={14} color="var(--status-ok-fg)" />
              ) : (
                <HardDrive size={14} color="var(--pipo-cocoa)" />
              )}
              {session.name}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={syncDotClass} />
              <span className="badge badge-brand" style={{ fontSize: '0.68rem' }}>
                {syncStatusText}
              </span>
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await signOutApp();
              setSession(null);
            }}
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-area">
        {/* Mobile Header */}
        <header className="mobile-topbar">
          <div className="mobile-topbar-brand">
            <img src={`${import.meta.env.BASE_URL || './'}icon-192.png`} alt="Pipo" />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--pipo-burgundy)',
                  fontSize: '1.05rem',
                  lineHeight: 1
                }}
              >
                Glow with Pipo
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--pipo-muted)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span className={syncDotClass} />
                <span>
                  {session.name} · {syncStatusText}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await signOutApp();
              setSession(null);
            }}
          >
            <LogOut size={14} /> Salir
          </button>
        </header>

        {isProtectedMode && (
          <div className="protection-mode-banner">
            <AlertTriangle size={16} />
            <span>
              <strong>Modo Protección Activo:</strong> Sin conexión con Supabase. Edición deshabilitada temporalmente para proteger el inventario.
            </span>
          </div>
        )}

        <main className="page-container">
          {activeTab === 'dashboard' && (
            <DashboardView
              metrics={metrics}
              onNavigate={setActiveTab}
              onRequestNotificationPermission={handleRequestNotifications}
              notifPermission={notifPermission}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              db={db}
              onCreateProduct={(payload) =>
                commitMutation({
                  optimisticFn: (cur) =>
                    applyCreateProductWithInitialStock(cur, { ...payload, createdBy: session.name }),
                  cloudFn: (cur) =>
                    cloudCreateProductWithInitialStock(cur, { ...payload, createdBy: session.name }),
                  successMsg: `Producto "${payload.name}" guardado en inventario.`
                })
              }
              onUpdateProduct={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyUpdateProduct(cur, payload),
                  cloudFn: (cur) => cloudUpdateProduct(cur, payload),
                  successMsg: 'Producto actualizado.'
                })
              }
              onDeleteProduct={(productId) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteProduct(cur, productId),
                  cloudFn: () => cloudDeleteProduct(productId),
                  successMsg: 'Producto eliminado del catálogo.'
                })
              }
              onSaveSupply={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyCreateOrUpdateSupply(cur, payload),
                  cloudFn: (cur) => cloudSaveSupply(cur, payload),
                  successMsg: 'Empaque / bolsita guardada.'
                })
              }
              onDeleteSupply={(supplyId) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteSupply(cur, supplyId),
                  cloudFn: () => cloudDeleteSupply(supplyId),
                  successMsg: 'Empaque eliminado.'
                })
              }
              onSaveCombo={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyCreateOrUpdateCombo(cur, payload),
                  cloudFn: (cur) => cloudSaveCombo(cur, payload),
                  successMsg: 'Combo guardado.'
                })
              }
              onDeleteCombo={(comboId) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteCombo(cur, comboId),
                  cloudFn: () => cloudDeleteCombo(comboId),
                  successMsg: 'Combo eliminado.'
                })
              }
              onAddCategory={(catName) =>
                commitMutation({
                  optimisticFn: (cur) => applyAddCategory(cur, catName),
                  cloudFn: (cur) => cloudAddCategory(cur, catName),
                  successMsg: `Categoría "${catName}" añadida al catálogo.`
                })
              }
              onDeleteCategory={(catName) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteCategory(cur, catName),
                  cloudFn: (cur) => cloudDeleteCategory(cur, catName),
                  successMsg: `Categoría "${catName}" quitada del selector.`
                })
              }
            />
          )}

          {activeTab === 'restocks' && (
            <RestocksView
              db={db}
              currentUser={session}
              onRecordRestock={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyRecordRestock(cur, payload),
                  cloudFn: (cur) => cloudRecordRestock(cur, payload),
                  successMsg: 'Reabastecimiento registrado y stock actualizado.'
                })
              }
              onSaveSupplier={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyCreateOrUpdateSupplier(cur, payload),
                  cloudFn: (cur) => cloudSaveSupplier(cur, payload),
                  successMsg: 'Proveedor guardado.'
                })
              }
              onDeleteSupplier={(supplierId) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteSupplier(cur, supplierId),
                  cloudFn: () => cloudDeleteSupplier(supplierId),
                  successMsg: 'Proveedor eliminado.'
                })
              }
            />
          )}

          {activeTab === 'sales' && (
            <SalesView
              db={db}
              currentUser={session}
              onCreateSale={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyCreateSale(cur, payload),
                  cloudFn: (cur) => cloudCreateSale(cur, payload),
                  successMsg: 'Pedido / venta registrada con éxito.'
                })
              }
              onAddPayment={(saleId, payData) =>
                commitMutation({
                  optimisticFn: (cur) => applyAddSalePayment(cur, saleId, payData),
                  cloudFn: (cur) => cloudAddSalePayment(cur, saleId, payData),
                  successMsg: 'Abono registrado.'
                })
              }
              onChangeSaleStatus={(saleId, nextStatus) =>
                commitMutation({
                  optimisticFn: (cur) => applyUpdateSaleStatus(cur, saleId, nextStatus),
                  cloudFn: (cur) => cloudUpdateSaleStatus(cur, saleId, nextStatus),
                  successMsg:
                    nextStatus === 'cancelled'
                      ? 'Pedido cancelado y stock devuelto al inventario.'
                      : 'Estado del pedido actualizado.'
                })
              }
              onSaveCustomer={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyCreateOrUpdateCustomer(cur, payload).db,
                  cloudFn: (cur) => cloudSaveCustomer(cur, payload),
                  successMsg: 'Cliente guardado en el directorio.'
                })
              }
              onDeleteCustomer={(customerId, options) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteCustomer(cur, customerId, options),
                  cloudFn: () => cloudDeleteCustomer(customerId, options),
                  successMsg: 'Cliente eliminado del directorio.'
                })
              }
              onDeleteSale={(saleId) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteSale(cur, saleId),
                  cloudFn: () => cloudDeleteSale(saleId),
                  successMsg: 'Pedido eliminado permanentemente.'
                })
              }
            />
          )}

          {activeTab === 'storefront' && (
            <StorefrontAdminView
              db={db}
              onSaveDeliveryPoint={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applySaveDeliveryPoint(cur, payload),
                  cloudFn: (cur) => cloudSaveDeliveryPoint(cur, payload),
                  successMsg: 'Punto de entrega guardado.'
                })
              }
              onDeleteDeliveryPoint={(pointId) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteDeliveryPoint(cur, pointId),
                  cloudFn: () => cloudDeleteDeliveryPoint(pointId),
                  successMsg: 'Punto de entrega eliminado.'
                })
              }
              onSaveDeliverySlot={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applySaveDeliverySlot(cur, payload),
                  cloudFn: (cur) => cloudSaveDeliverySlot(cur, payload),
                  successMsg: 'Horario de entrega programado.'
                })
              }
              onDeleteDeliverySlot={(slotId) =>
                commitMutation({
                  optimisticFn: (cur) => applyDeleteDeliverySlot(cur, slotId),
                  cloudFn: () => cloudDeleteDeliverySlot(slotId),
                  successMsg: 'Horario de entrega eliminado.'
                })
              }
              onUpdateStorefrontMerchandising={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => applyUpdateStorefrontMerchandising(cur, payload),
                  cloudFn: () => cloudUpdateStorefrontMerchandising(payload),
                  successMsg: 'Vitrina web actualizada.'
                })
              }
              onUpdateYapeGateway={(payload) =>
                commitMutation({
                  optimisticFn: (cur) => ({
                    ...cur,
                    yapeGateway: { ...(cur.yapeGateway || {}), ...payload }
                  }),
                  cloudFn: () => cloudUpdateYapeGateway(payload),
                  successMsg: 'Validador Yape actualizado.'
                })
              }
              onSimulateYapeNotification={async (payload) => {
                try {
                  const res = await cloudSimulateOrRegisterYapePayment(payload);
                  setDb(res.db);
                  saveLocalDb(res.db);
                  if (res.matchResult?.autoVerified || res.matchResult?.matched) {
                    notify(`¡Yape validado y vinculado al pedido ${res.matchResult.matchedSaleCode || res.matchResult.matched_sale_code}!`);
                  } else {
                    notify('Notificación Yape registrada en el sistema.');
                  }
                } catch (err) {
                  notify(err.message, true);
                }
              }}
              onOpenPublicStorefront={() => setIsStaffPreviewActive(true)}
              onNavigateToSales={() => setActiveTab('sales')}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              db={db}
              session={session}
              realtimeStatus={realtimeStatus}
              lastSyncedAt={lastSyncedAt}
              appVersion={typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.0'}
              onSessionUpdated={(sess) => setSession(sess)}
              onUpdateAccount={(id, data) => {
                const updated = updateLocalOwnerAccount(db, id, data);
                setDb(updated);
                notify('Cuenta actualizada.');
              }}
              onPushToSupabase={async () => {
                try {
                  await syncStateToSupabase(db);
                  notify('Todos los datos locales se subieron a Supabase PostgreSQL.');
                } catch (err) {
                  notify(err.message, true);
                }
              }}
              onPullFromSupabase={async () => {
                try {
                  const cloud = await fetchSupabaseDatabase();
                  setDb(cloud);
                  saveLocalDb(cloud);
                  notify('Datos sincronizados desde Supabase.');
                } catch (err) {
                  notify(err.message, true);
                }
              }}
              onCheckAppUpdate={() => checkForAppUpdate(false)}
              onImportBackup={(txt) => {
                try {
                  const imported = importLocalDbJson(txt);
                  setDb(imported);
                  notify('Respaldo cargado correctamente.');
                } catch (err) {
                  notify(err.message, true);
                }
              }}
              onNotify={notify}
            />
          )}
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav className="mobile-bottom-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={19} />
                <span>{item.mobileLabel}</span>
                {item.badge > 0 && <span className="mobile-dot" />}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
