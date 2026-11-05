import React, { useState } from 'react';
import { Cloud, HardDrive, Lock, Sparkles } from 'lucide-react';
import { DEFAULT_LOCAL_ACCOUNTS, signInApp } from '../../adapters/storageRepository.js';

export default function LoginView({ accounts = DEFAULT_LOCAL_ACCOUNTS, onLoggedIn }) {
  const [mode, setMode] = useState('supabase');
  const [email, setEmail] = useState('adrian@glowwithpipo.pe');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const quickOwners = [
    { name: 'Adrián', email: 'adrian@glowwithpipo.pe', role: 'Socio Administrador' },
    { name: 'Pipo Socia', email: 'pipo@glowwithpipo.pe', role: 'Socia Administradora' }
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const session = await signInApp({ email, password, mode });
      onLoggedIn(session);
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen pipo-stripes">
      <div className="login-card">
        <div className="login-hero">
          <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="Glow with Pipo" />
          <h1 className="brand-title" style={{ fontSize: '1.85rem', marginTop: 10 }}>
            GLOW <span style={{ fontStyle: 'italic', fontSize: '1.35rem' }}>with pipo</span>
          </h1>
          <p className="brand-sub" style={{ fontSize: '0.86rem' }}>
            Stock, Pedidos y Finanzas en Tiempo Real
          </p>
        </div>

        <div className="login-body">
          <div className="tabs-row" style={{ justifyContent: 'center', marginBottom: 14 }}>
            <button
              type="button"
              className={`tab-chip ${mode === 'supabase' ? 'active' : ''}`}
              onClick={() => {
                setMode('supabase');
                if (!email) setEmail('adrian@glowwithpipo.pe');
                setErrorMsg('');
              }}
            >
              <Cloud size={15} /> Nube en Vivo
            </button>
            <button
              type="button"
              className={`tab-chip ${mode === 'local' ? 'active' : ''}`}
              onClick={() => {
                setMode('local');
                setEmail(accounts[0]?.email || 'adrian@glowwithpipo.pe');
                setErrorMsg('');
              }}
            >
              <HardDrive size={15} /> Modo Offline
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {mode === 'supabase' ? (
              <>
                <div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: 'var(--pipo-cocoa)',
                      marginBottom: 6
                    }}
                  >
                    Selecciona quién ingresa:
                  </div>
                  <div className="owner-quick-grid">
                    {quickOwners.map((owner) => {
                      const selected = email.trim().toLowerCase() === owner.email;
                      return (
                        <button
                          key={owner.email}
                          type="button"
                          className={`owner-quick-btn ${selected ? 'active' : ''}`}
                          onClick={() => {
                            setEmail(owner.email);
                            setErrorMsg('');
                          }}
                        >
                          <strong style={{ fontSize: '0.88rem', color: 'var(--pipo-burgundy)' }}>
                            {owner.name}
                          </strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--pipo-muted)' }}>
                            {owner.role}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="field">
                  <label>Correo electrónico</label>
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="adrian@glowwithpipo.pe"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="field">
                <label>Perfil local (sin internet)</label>
                <select value={email} onChange={(e) => setEmail(e.target.value)}>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.email}>
                      {acc.name} ({acc.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label>{mode === 'supabase' ? 'Contraseña' : 'PIN local'}</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder={mode === 'supabase' ? 'Ingresa tu contraseña' : 'PIN local (1234)'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {errorMsg && (
              <div className="badge badge-danger" style={{ padding: '8px 12px', whiteSpace: 'normal' }}>
                {errorMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4 }}>
              <Lock size={16} />
              {loading ? 'Conectando con Supabase...' : 'Ingresar a Glow with Pipo'}
            </button>
          </form>

          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid rgba(199,143,133,0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: '0.77rem',
              color: 'var(--pipo-muted)',
              textAlign: 'center'
            }}
          >
            <Sparkles size={14} color="var(--pipo-petal)" style={{ flexShrink: 0 }} />
            <span>Conectado a Supabase PostgreSQL · Sincronización inmediata en celulares</span>
          </div>
        </div>
      </div>
    </div>
  );
}
