import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const location = process.env.YAPE_NOTIFICATION_CORE || resolve('supabase/functions/yape-notification/core.mjs');
const { parseNotificationPayload: parse, createNotificationHandler, MAX_BODY_BYTES } = await import(pathToFileURL(resolve(location)).href);
const now = 1700000000000;
const token = 'A'.repeat(43);
const fixture = (overrides = {}) => ({ package_name: 'com.bcp.innovacxion.yapeapp', notification_id: 'android-1', posted_at: now, raw_title: '¡Yape!', raw_text: 'Ana Pérez te envió S/ 12.50', ...overrides });
const parseAt = payload => parse(payload, { nowMs: now });
function setup(persist = async () => ({ duplicate: false })) {
  return createNotificationHandler({ deviceToken: token, deviceId: 'fixture-device', now: () => now, persist });
}
function req({ method = 'POST', auth = token, body = JSON.stringify(fixture()), type = 'application/json' } = {}) {
  const headers = {};
  if (auth !== null) headers['X-Device-Token'] = auth;
  if (type !== null) headers['Content-Type'] = type;
  return new Request('https://example.test/notifications', { method, headers, ...(method === 'POST' ? { body } : {}) });
}

test('authentication, method, media type and malformed payload do not write', async () => {
  let writes = 0;
  const handle = setup(async () => { writes++; return { duplicate: false }; });
  for (const [options, status] of [[{auth:null},401], [{auth:'wrong'},401], [{method:'GET'},405], [{type:'text/plain'},415], [{body:'{'},400], [{body:''},400], [{body:JSON.stringify({})},400], [{body:' '.repeat(MAX_BODY_BYTES + 1)},413]]) {
    const response = await handle(req(options));
    assert.equal(response.status, status);
    assert.equal((await response.text()).includes(token), false);
  }
  assert.equal(writes, 0);
});

test('reject invalid origin, fields and timestamps, including seconds', () => {
  for (const changes of [{package_name:'other'}, {notification_id:''}, {posted_at:0}, {posted_at:now + 600000}, {posted_at:1700000000}, {posted_at:'1700000000000'}, {raw_text:''}]) {
    assert.throws(() => parseAt(fixture(changes)));
  }
});

test('parse incoming decimal values without treating ambiguous text as a payment', () => {
  assert.equal(parseAt(fixture()).amount_minor, 1250);
  assert.equal(parseAt(fixture({raw_text:'Ana Pérez te envió S/ 12,5'})).amount_minor, 1250);
  for (const raw_text of ['Yapeaste S/ 12.50 a Ana Pérez', 'Oferta descuento S/ 10', 'Ana Pérez te envió S/ 1,234.50', 'Ana Pérez te envió S/ 1.234,50', 'te envió S/ 12.50', 'Ana Pérez te envió S/ 12.345', 'Ana Pérez te envió S/ 0']) {
    assert.equal(parseAt(fixture({raw_text})).ignored, true, raw_text);
  }
});

test('historical incoming Yape wording with abbreviated security code is parsed', () => {
  const result = parseAt(fixture({raw_text:'Adrian Huaman Castillo te envió un pago por S/ 6.00. El cód. de seguridad es: 917'}));
  assert.equal(result.ignored, false);
  assert.equal(result.sender_name, 'Adrian Huaman Castillo');
  assert.equal(result.amount_minor, 600);
});

test('duplicate event, Android update and different events sharing security code', async () => {
  const records = new Map();
  const handle = setup(async record => {
    const duplicate = records.has(record.event_key);
    if (!duplicate) records.set(record.event_key, record);
    return { duplicate };
  });
  const data = fixture({raw_text:'Ana Pérez te envió S/ 12.50 Código de seguridad: 123456'});
  const post = async value => (await handle(req({body:JSON.stringify(value)}))).json();
  assert.equal((await post(data)).duplicate, false);
  assert.equal((await post(data)).duplicate, true);
  assert.equal((await post({...data, raw_text:'Ana Pérez te envió S/ 14.50 Código de seguridad: 123456'})).duplicate, true);
  assert.equal((await post({...data, notification_id:'android-2'})).duplicate, false);
  assert.equal(records.size, 2);
  for (const record of records.values()) assert.equal(record.status, 'pending_review');
});

test('concurrent retries rely on atomic store and persist a single pending item', async () => {
  const records = new Map();
  const handle = setup(async record => {
    if (records.has(record.event_key)) return { duplicate: true };
    records.set(record.event_key, record);
    return { duplicate: false };
  });
  const results = await Promise.all(Array.from({length: 10}, () => handle(req()).then(r => r.json())));
  assert.equal(results.filter(x => !x.duplicate).length, 1);
  assert.equal(records.size, 1);
  assert.ok(results.every(x => x.status === 'pending_review'));
});

test('store exceptions do not expose token or internal error', async () => {
  const handle = setup(async () => { throw new Error(`fixture secret ${token}`); });
  const response = await handle(req());
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.equal(text.includes(token), false);
  assert.equal(text.includes('fixture secret'), false);
});
