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

test('Auto-snapshots omiten cadenas data:image Base64 pesadas y saveLocalDb se recupera ante QuotaExceededError', () => {
  const store = new Map();
  let maxAllowedBytes = Infinity;

  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      const str = String(v);
      let currentTotal = 0;
      for (const [ek, ev] of store.entries()) {
        if (ek !== k) currentTotal += ev.length;
      }
      if (currentTotal + str.length > maxAllowedBytes) {
        const err = new Error('QuotaExceededError: The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, str);
    },
    removeItem: (k) => store.delete(k),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] || null
  };

  const inlineBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
  const httpsUrl = 'https://fpahqojoqjrrthlwland.supabase.co/storage/v1/object/public/storefront-media/gloss.webp';

  const dbWithMedia = {
    ...emptyState(),
    products: [
      {
        id: 'p-base64',
        name: 'Gloss Fresa',
        imageUrl: inlineBase64,
        shadesImageUrl: inlineBase64,
        galleryUrls: [inlineBase64, httpsUrl]
      },
      {
        id: 'p-https',
        name: 'Rubor Coquette',
        imageUrl: httpsUrl,
        shadesImageUrl: httpsUrl,
        galleryUrls: [httpsUrl]
      }
    ],
    variants: [
      { id: 'v-1', productId: 'p-base64', shadeName: '01', imageUrl: inlineBase64 },
      { id: 'v-2', productId: 'p-https', shadeName: '02', imageUrl: httpsUrl }
    ],
    combos: [
      { id: 'c-1', name: 'Combo Dulce', imageUrl: inlineBase64 },
      { id: 'c-2', name: 'Combo Glow', imageUrl: httpsUrl }
    ]
  };

  saveLocalDb(dbWithMedia);

  // 1. El snapshot rotativo NO debe contener data:image/...;base64,... pero sí conservar https://
  const snapshots = listAutoSnapshots();
  assert.equal(snapshots.length, 1);
  const rawSnapshot = global.localStorage.getItem(snapshots[0].key);
  assert.ok(!rawSnapshot.includes('data:image/jpeg;base64,'), 'El auto-snapshot debe omitir imágenes Base64 inline');
  const parsedSnapshot = JSON.parse(rawSnapshot);
  assert.equal(parsedSnapshot.products[0].imageUrl, '');
  assert.equal(parsedSnapshot.products[0].shadesImageUrl, '');
  assert.deepEqual(parsedSnapshot.products[0].galleryUrls, [httpsUrl]);
  assert.equal(parsedSnapshot.products[1].imageUrl, httpsUrl);
  assert.equal(parsedSnapshot.variants[0].imageUrl, '');
  assert.equal(parsedSnapshot.variants[1].imageUrl, httpsUrl);
  assert.equal(parsedSnapshot.combos[0].imageUrl, '');
  assert.equal(parsedSnapshot.combos[1].imageUrl, httpsUrl);

  // 2. Si localStorage alcanza el límite de cuota, saveLocalDb poda snapshots antiguos y reintenta guardar la DB principal
  for (let i = 0; i < 4; i++) {
    saveLocalDb({ ...dbWithMedia, seq: i });
  }
  assert.equal(listAutoSnapshots().length, 5);

  // Fijamos un límite estrecho donde solo cabe 1 copia compacta sin Base64 (~1500 bytes)
  maxAllowedBytes = 1500;
  saveLocalDb({ ...dbWithMedia, emergencySave: true });

  const savedMainRaw = global.localStorage.getItem('glow_with_pipo_db_v1');
  assert.ok(savedMainRaw, 'La clave principal debe existir tras recuperarse de QuotaExceededError');
  const savedMain = JSON.parse(savedMainRaw);
  assert.equal(savedMain.emergencySave, true, 'saveLocalDb debe persistir el nuevo estado tras podar snapshots y/o limpiar Base64');
  assert.ok(!savedMainRaw.includes('data:image/jpeg;base64,'), 'En último recurso bajo cuota crítica, la clave principal también limpia Base64 para no perder ventas/stock');

  delete global.localStorage;
});
