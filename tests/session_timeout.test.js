import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  getSessionTimeoutMinutes,
  setSessionTimeoutMinutes,
  recordUserActivity,
  getLastUserActivity,
  isSessionExpired,
  getSavedSession,
  signOutApp,
  SESSION_TIMEOUT_KEY,
  LAST_ACTIVITY_KEY
} from '../src/adapters/storageRepository.js';

// Setup minimal localStorage mock in Node if not already present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

test('Session Inactivity Timeout: configuración, rastreo de actividad y expiración segura', async (t) => {
  localStorage.clear();

  await t.test('Retorna 30 minutos por defecto cuando no hay configuración previa', () => {
    assert.equal(getSessionTimeoutMinutes(), DEFAULT_SESSION_TIMEOUT_MINUTES);
    assert.equal(getSessionTimeoutMinutes(), 30);
  });

  await t.test('Permite configurar límites personalizados (15, 60, 120 min) y los persiste', () => {
    setSessionTimeoutMinutes(15);
    assert.equal(getSessionTimeoutMinutes(), 15);

    setSessionTimeoutMinutes(60);
    assert.equal(getSessionTimeoutMinutes(), 60);

    // Valores inválidos no alteran el límite previo
    setSessionTimeoutMinutes(-10);
    assert.equal(getSessionTimeoutMinutes(), 60);

    setSessionTimeoutMinutes('abc');
    assert.equal(getSessionTimeoutMinutes(), 60);
  });

  await t.test('Registra timestamp de última actividad y evalúa expiración correctamente', () => {
    setSessionTimeoutMinutes(30); // 30 min = 1,800,000 ms
    const now = 1700000000000;

    // Actividad reciente (hace 5 minutos)
    recordUserActivity(now - 5 * 60 * 1000);
    assert.equal(getLastUserActivity(), now - 5 * 60 * 1000);
    assert.equal(isSessionExpired(now), false, 'Sesión no debe expirar con 5 min de inactividad si el límite es 30 min');

    // Actividad en el límite exacto (hace 29 minutos)
    recordUserActivity(now - 29 * 60 * 1000);
    assert.equal(isSessionExpired(now), false, 'Sesión no debe expirar a los 29 min');

    // Actividad superada (hace 31 minutos)
    recordUserActivity(now - 31 * 60 * 1000);
    assert.equal(isSessionExpired(now), true, 'Sesión DEBE expirar tras 31 min de inactividad');
  });

  await t.test('getSavedSession() purga y retorna null si la sesión ha expirado por inactividad', () => {
    setSessionTimeoutMinutes(30);
    const mockSession = { id: 'test-user', email: 'adrian@glowwithpipo.pe', name: 'Adrián', mode: 'local' };
    localStorage.setItem('glow_with_pipo_session_v1', JSON.stringify(mockSession));

    // Si la actividad fue hace 40 minutos (expirada)
    const oldTime = Date.now() - 40 * 60 * 1000;
    recordUserActivity(oldTime);

    assert.equal(isSessionExpired(), true);
    const saved = getSavedSession();
    assert.equal(saved, null, 'getSavedSession() debe retornar null cuando la inactividad excede el límite');
    assert.equal(localStorage.getItem('glow_with_pipo_session_v1'), null, 'La clave de sesión debe ser purgada');
  });

  await t.test('signOutApp() limpia tanto la sesión como el registro de última actividad', async () => {
    localStorage.setItem('glow_with_pipo_session_v1', JSON.stringify({ id: 'u1' }));
    recordUserActivity(Date.now());

    await signOutApp();

    assert.equal(localStorage.getItem('glow_with_pipo_session_v1'), null);
    assert.equal(localStorage.getItem(LAST_ACTIVITY_KEY), null);
    assert.equal(getLastUserActivity(), 0);
  });
});
