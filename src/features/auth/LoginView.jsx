import React, { useState } from 'react';
import { Lock, Sparkles, UserCheck } from 'lucide-react';
import { signInApp } from '../../adapters/storageRepository.js';

export default function LoginView({ onLoggedIn }) {
  const [selectedUser, setSelectedUser] = useState('adrian'); // 'adrian' | 'fabiana'
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const owners = [
    { id: 'adrian', name: 'Adrián', email: 'adrian@glowwithpipo.pe', role: 'Socio Administrador' },
    { id: 'fabiana', name: 'Fabiana', email: 'pipo@glowwithpipo.pe', role: 'Socia Administradora' }
  ];

  const activeOwner = owners.find((o) => o.id === selectedUser) || owners[0];

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const session = await signInApp({
        email: activeOwner.email,
        password,
        mode: 'supabase'
      });
      onLoggedIn(session);
    } catch (err) {
      setErrorMsg(err.message || 'Contraseña incorrecta.');
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
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: 'var(--pipo-cocoa)',
                  marginBottom: 8,
                  textAlign: 'center'
                }}
              >
                ¿Quién está ingresando hoy?
              </div>
              <div className="owner-quick-grid">
                {owners.map((owner) => {
                  const isSelected = selectedUser === owner.id;
                  return (
                    <button
                      key={owner.id}
                      type="button"
                      className={`owner-quick-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedUser(owner.id);
                        setErrorMsg('');
                        setPassword('');
                      }}
                    >
                      <strong style={{ fontSize: '1rem', color: 'var(--pipo-burgundy)' }}>
                        {owner.name}
                      </strong>
                      <span style={{ fontSize: '0.73rem', color: 'var(--pipo-muted)' }}>
                        {owner.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hidden field for browser password manager compatibility */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={activeOwner.email}
              readOnly
              style={{ display: 'none' }}
              tabIndex={-1}
              aria-hidden="true"
            />

            <div className="field">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Contraseña</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--pipo-cocoa)', fontWeight: 700 }}>
                  Ingresando como: <strong style={{ color: 'var(--pipo-burgundy)' }}>{activeOwner.name}</strong>
                </span>
              </label>
              <input
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña personal"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {errorMsg && (
              <div className="badge badge-danger" style={{ padding: '8px 12px', whiteSpace: 'normal', textAlign: 'center' }}>
                {errorMsg}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 2 }}>
              <Lock size={16} />
              {loading ? 'Verificando con Supabase...' : `Ingresar como ${activeOwner.name}`}
            </button>
          </form>

          <div
            style={{
              marginTop: 18,
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
