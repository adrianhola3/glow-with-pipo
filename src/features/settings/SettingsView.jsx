import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Download,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload
} from 'lucide-react';
import {
  exportLocalDbJson,
  getSupabaseConfig,
  saveSupabaseConfig,
  updateCloudUserProfile
} from '../../adapters/storageRepository.js';

export default function SettingsView({
  db,
  session,
  realtimeStatus,
  lastSyncedAt,
  appVersion,
  onSessionUpdated,
  onUpdateAccount,
  onPushToSupabase,
  onPullFromSupabase,
  onCheckAppUpdate,
  onImportBackup,
  onNotify
}) {
  const existingCfg = getSupabaseConfig();
  const [showAdvancedCloud, setShowAdvancedCloud] = useState(false);
  const [sbUrl, setSbUrl] = useState(existingCfg?.url || '');
  const [sbKey, setSbKey] = useState(existingCfg?.anonKey || '');
  const [syncing, setSyncing] = useState(false);

  // Cloud profile & password form
  const [profileName, setProfileName] = useState(session?.name || '');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  async function handleUpdateCloudProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await updateCloudUserProfile({
        name: profileName,
        newPassword
      });
      setNewPassword('');
      if (onSessionUpdated) onSessionUpdated(updated);
      onNotify(
        newPassword.trim()
          ? 'Nombre y contraseña actualizados en Supabase.'
          : 'Nombre de perfil actualizado en Supabase.'
      );
    } catch (err) {
      onNotify(err.message || 'No se pudo actualizar el perfil.', true);
    } finally {
      setSavingProfile(false);
    }
  }

  function handleSaveCloud(e) {
    e.preventDefault();
    saveSupabaseConfig(sbUrl, sbKey);
    onNotify('Configuración de proyecto Supabase actualizada.');
  }

  function handleDownloadBackup() {
    const json = exportLocalDbJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glow-with-pipo-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onImportBackup(String(reader.result || ''));
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nube en Vivo, Seguridad y App Móvil</h1>
          <p className="page-subtitle">
            Estado de la base de datos PostgreSQL, cambio de contraseña, auto-actualización e instalación en celular.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* Live Supabase Status & Sync Controls */}
        <div className="card card-cream">
          <h3 className="card-title">
            <Cloud size={18} /> Estado de Conexión Supabase PostgreSQL
          </h3>

          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: '#fff',
              border: '1px solid rgba(199,143,133,0.45)',
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: '0.85rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, color: 'var(--status-ok-fg)' }}>
                <CheckCircle2 size={16} /> Base de datos conectada
              </span>
              <span className={`badge ${realtimeStatus === 'SUBSCRIBED' ? 'badge-success' : 'badge-brand'}`}>
                Realtime: {realtimeStatus === 'SUBSCRIBED' ? 'Activo en vivo' : 'Conectado'}
              </span>
            </div>
            <div style={{ color: 'var(--pipo-muted)', fontSize: '0.8rem' }}>
              Cada producto, tono, reabastecimiento o venta se guarda directamente al instante en PostgreSQL y actualiza todos los teléfonos abiertos.
            </div>
            {lastSyncedAt && (
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--pipo-cocoa)' }}>
                Última sincronización verificada:{' '}
                {lastSyncedAt instanceof Date
                  ? lastSyncedAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  : String(lastSyncedAt)}{' '}
                · Versión App v{appVersion}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  await onPullFromSupabase();
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <RefreshCw size={14} /> Sincronizar ahora desde Supabase
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onCheckAppUpdate}
            >
              <ShieldCheck size={14} /> Verificar actualización de la App
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowAdvancedCloud((prev) => !prev)}
            >
              {showAdvancedCloud ? 'Ocultar ajustes técnicos' : 'Ajustes técnicos de nube'}
            </button>
          </div>

          {showAdvancedCloud && (
            <form
              onSubmit={handleSaveCloud}
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px dashed rgba(199,143,133,0.45)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div className="field">
                <label>Supabase Project URL</label>
                <input type="url" value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} />
              </div>
              <div className="field">
                <label>Supabase Publishable Key</label>
                <input type="password" value={sbKey} onChange={(e) => setSbKey(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-secondary btn-sm">
                  Guardar credenciales personalizadas
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await onPushToSupabase();
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  <Upload size={14} /> Subir respaldo local a la nube
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Cloud Password & Profile Editor */}
        <div className="card">
          <h3 className="card-title">
            <KeyRound size={18} /> Mi Perfil y Contraseña ({session?.email})
          </h3>

          {session?.mode === 'supabase' ? (
            <form onSubmit={handleUpdateCloudProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: '0.83rem', color: 'var(--pipo-muted)', margin: 0 }}>
                Personaliza cómo aparece tu nombre al registrar ventas o compras y cambia tu contraseña personal de acceso en cualquier momento.
              </p>

              <div className="field">
                <label>Mi nombre visible</label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Nueva contraseña (dejar vacío para mantener la actual)</label>
                <input
                  type="password"
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                  {savingProfile ? 'Guardando...' : 'Actualizar mi cuenta en la nube'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: '0.83rem', color: 'var(--pipo-muted)', margin: 0 }}>
                Cuentas para acceso local cuando no hay conexión a internet:
              </p>
              {(db.accounts || []).map((acc) => (
                <AccountRow key={acc.id} account={acc} onSave={onUpdateAccount} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PWA Mobile Installation & Backups */}
      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">
            <Smartphone size={18} /> Instalar en el Teléfono (Android y iPhone)
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.87rem', lineHeight: 1.65 }}>
            <li>
              <strong>En Android (Chrome / Brave):</strong> abre el enlace en el teléfono, toca el menú <strong>⋮</strong> arriba a la derecha y pulsa <em>&quot;Instalar aplicación&quot;</em> o <em>&quot;Agregar a pantalla principal&quot;</em>.
            </li>
            <li>
              <strong>En iPhone (Safari):</strong> abre el enlace en Safari, toca el botón <strong>Compartir</strong> en la barra inferior y elige <em>&quot;Agregar a inicio&quot;</em>.
            </li>
            <li>
              <strong>Actualización automática:</strong> cada vez que se publique una mejora, el aplicativo en tu teléfono la detectará y se actualizará solo sin reinstalar nada.
            </li>
          </ul>
        </div>

        <div className="card">
          <h3 className="card-title">Copia de Seguridad en Archivo (.json)</h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--pipo-muted)', marginTop: 0 }}>
            Además del guardado automático en Supabase PostgreSQL, puedes descargar en cualquier momento una copia completa a tu celular o laptop.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={handleDownloadBackup}>
              <Download size={15} /> Descargar Copia (.json)
            </button>
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              <Upload size={15} /> Restaurar Archivo (.json)
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileImport} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ account, onSave }) {
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [pin, setPin] = useState(account.pin);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(account.id, { name, email, pin });
      }}
      style={{
        padding: 12,
        borderRadius: 10,
        background: 'var(--pipo-ivory)',
        border: '1px solid rgba(199,143,133,0.4)'
      }}
    >
      <div className="form-grid" style={{ alignItems: 'end' }}>
        <div className="field">
          <label>Nombre</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Correo</label>
          <input type="text" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>PIN</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="password" required value={pin} onChange={(e) => setPin(e.target.value)} />
            <button type="submit" className="btn btn-secondary btn-sm">
              Guardar
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
