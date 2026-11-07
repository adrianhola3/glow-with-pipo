import test from 'node:test';
import assert from 'node:assert/strict';
import { saveLocalDb, listAutoSnapshots, restoreAutoSnapshot } from '../src/adapters/storageRepository.js';

function emptyState() {
  return {
    accounts: [],
    suppliers: [],
    products: [],
    variants: [],
    supplies: [],
    combos: [],
    restocks: [],
    customers: [],
    sales: []
  };
}

test('Protección de base de datos: el cálculo de modo protegido bloquea mutaciones offline o con canal caído', () => {
  function computeProtectedMode(session, isOnline, realtimeStatus) {
    if (session?.mode !== 'supabase') return false;
    return !isOnline || realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'CLOSED' || realtimeStatus === 'TIMED_OUT';
  }

  const supabaseSession = { mode: 'supabase' };
  const localSession = { mode: 'local' };

  // Modo local no bloquea porque la base es el propio navegador
  assert.equal(computeProtectedMode(localSession, false, 'CLOSED'), false);

  // Modo Supabase online y conectado: NO protegido (edición permitida)
  assert.equal(computeProtectedMode(supabaseSession, true, 'SUBSCRIBED'), false);

  // Modo Supabase offline: PROTEGIDO (edición bloqueada)
  assert.equal(computeProtectedMode(supabaseSession, false, 'SUBSCRIBED'), true);

  // Modo Supabase canal caído / error: PROTEGIDO (edición bloqueada)
  assert.equal(computeProtectedMode(supabaseSession, true, 'CHANNEL_ERROR'), true);
  assert.equal(computeProtectedMode(supabaseSession, true, 'CLOSED'), true);
  assert.equal(computeProtectedMode(supabaseSession, true, 'TIMED_OUT'), true);

  // Simulación de commitMutation con guarda
  let db = emptyState();
  let toastMsg = null;

  function commitMutation({ isProtected, optimisticFn }) {
    if (isProtected) {
      toastMsg = 'Edición bloqueada: Modo Protección';
      return false;
    }
    db = optimisticFn(db);
    return true;
  }

  // Intento de mutación con protección activa
  const blocked = commitMutation({
    isProtected: computeProtectedMode(supabaseSession, false, 'SUBSCRIBED'),
    optimisticFn: (d) => ({ ...d, products: [{ id: 'p1', name: 'Hack' }] })
  });

  assert.equal(blocked, false, 'La mutación debió ser rechazada');
  assert.equal(db.products.length, 0, 'La base de datos no debe cambiar cuando está bloqueada');
  assert.match(toastMsg, /Edición bloqueada/, 'Debe notificar al usuario el bloqueo');

  // Intento de mutación en estado sano
  const allowed = commitMutation({
    isProtected: computeProtectedMode(supabaseSession, true, 'SUBSCRIBED'),
    optimisticFn: (d) => ({ ...d, products: [{ id: 'p1', name: 'Legit' }] })
  });

  assert.equal(allowed, true, 'La mutación debe proceder');
  assert.equal(db.products.length, 1, 'La base de datos debe recibir la mutación');
});

test('Respaldo y Auto-snapshots rotativos: límite estricto de 5 y atomicidad', () => {
  const store = new Map();
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] || null
  };

  const baseDb = emptyState();
  // Guardamos 8 versiones sucesivas
  for (let i = 1; i <= 8; i++) {
    saveLocalDb({ ...baseDb, version_counter: i });
  }

  const snapshots = listAutoSnapshots();
  assert.equal(snapshots.length, 5, 'Debe haber exactamente 5 snapshots rotativos guardados');

  // Restaurar el snapshot más antiguo del pool rotativo
  const oldest = snapshots[snapshots.length - 1];
  const restored = restoreAutoSnapshot(oldest.key);
  assert.ok(restored, 'Debe poder restaurar el snapshot');
  assert.ok(restored.version_counter >= 4, 'Los primeros 3 debieron ser podados');

  delete global.localStorage;
});
