// Portable Web API core. No Supabase client, environment access, or logging.
export const MAX_BODY_BYTES = 16384;
export const YAPE_PACKAGE = 'com.bcp.innovacxion.yapeapp';
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DELAYED_AFTER_MS = 24 * 60 * 60 * 1000;
const MIN_POSTED_AT_MS = Date.UTC(2020, 0, 1);

export class NotificationError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function parseNotificationPayload(payload, { nowMs = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new NotificationError('invalid_payload');
  }
  if (payload.package_name !== YAPE_PACKAGE) throw new NotificationError('invalid_package');
  const id = payload.notification_id;
  if (!(typeof id === 'string' || (Number.isSafeInteger(id) && id >= 0))) {
    throw new NotificationError('invalid_notification_id');
  }
  const notificationId = String(id).trim();
  if (!notificationId || notificationId.length > 256 || /[\u0000-\u001f\u007f]/u.test(notificationId)) {
    throw new NotificationError('invalid_notification_id');
  }
  if (!Number.isSafeInteger(payload.posted_at) || payload.posted_at < MIN_POSTED_AT_MS ||
      payload.posted_at > 8640000000000000 || payload.posted_at > nowMs + FUTURE_TOLERANCE_MS) {
    throw new NotificationError('invalid_posted_at');
  }
  if (typeof payload.raw_title !== 'string' || typeof payload.raw_text !== 'string' ||
      payload.raw_title.length > 512 || payload.raw_text.length > 8192 ||
      !payload.raw_text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(payload.raw_title + payload.raw_text)) {
    throw new NotificationError('invalid_text');
  }
  const title = payload.raw_title.trim();
  const body = payload.raw_text.trim();
  const combined = `${title} ${body}`;
  const ignore = (reason) => ({ ignored: true, reason });
  if (/(?:yapeaste|enviaste|pago enviado|transferencia enviada)/iu.test(combined)) {
    return ignore('outgoing');
  }
  if (/(?:promoci[oó]n|oferta|sorteo|premio|ganar|descuento|solicitud|solicita|rechazad|pendiente|fallid)/iu.test(combined)) {
    return ignore('promotion_or_non_payment');
  }
  if (!/^(?:[¡!\s]*Yape[!\s]*|Confirmaci[oó]n de pago|Pago recibido|Has recibido un yape)?$/iu.test(title)) {
    return ignore('ambiguous_title');
  }
  // Whole-body grammar, one ungrouped amount. Unknown suffixes, thousands,
  // summaries and shortened names are deliberately sent to manual handling.
  const match = body.match(/^(?:¡?Yape!\s*)?([\p{L}][\p{L} .'’\-]{2,119}?)\s+te\s+(?:envi[oó]|yape[oó])\s+(?:(?:un pago|un yape)\s+)?(?:por\s+)?S\/\.?\s*(\d{1,8}(?:[.,]\d{1,2})?)(?:\s*(?:[.!]|soles))?(?:\s+(?:(?:El\s+)?c[oó]d\.(?:\s+de\s+seguridad)?(?:\s+es)?\s*[:#]?\s*\d{3}|(?:El\s+)?c[oó]digo(?:\s+de\s+seguridad)?(?:\s+es)?\s*[:#]?\s*\d{3,8}|operaci[oó]n\s*[:#]?\s*\d{3,20})[.!]?)?$/iu);
  if (!match) return ignore('ambiguous_payment_text');
  const senderName = match[1].trim().replace(/\s+/gu, ' ');
  if (senderName.split(' ').length < 2) return ignore('ambiguous_sender');
  const [whole, fraction = ''] = match[2].replace(',', '.').split('.');
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return ignore('invalid_amount');
  return {
    ignored: false,
    package_name: YAPE_PACKAGE,
    notification_id: notificationId,
    posted_at_ms: payload.posted_at,
    raw_title: title,
    raw_text: body,
    sender_name: senderName,
    amount_minor: amountMinor,
    is_delayed: nowMs - payload.posted_at > DELAYED_AFTER_MS,
    parser_version: 'automate-pilot-v1'
  };
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function deriveEventKey(deviceId, notificationId, postedAtMs) {
  const bytes = await sha256(JSON.stringify([deviceId, String(notificationId).trim(), postedAtMs]));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function validToken(actual, expected) {
  if (!actual || actual.length > 512) return false;
  const [a, b] = await Promise.all([sha256(actual), sha256(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function readPayload(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new NotificationError('body_too_large', 413);
  }
  if (!request.body) throw new NotificationError('invalid_json');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new NotificationError('body_too_large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new NotificationError('invalid_json');
  }
}

const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
});

// persist(record) must atomically insert-on-conflict-do-nothing and return
// {duplicate:boolean}. It must never create payments or modify sales/stock.
export function createNotificationHandler({ deviceToken, deviceId, persist, now = () => Date.now() }) {
  const configured = typeof deviceToken === 'string' && /^[A-Za-z0-9_-]{43,128}$/u.test(deviceToken) &&
    typeof deviceId === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(deviceId) && typeof persist === 'function';
  return async function handleNotification(request) {
    if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    if (!configured) return jsonResponse({ error: 'service_unavailable' }, 503);
    try {
      if (!await validToken(request.headers.get('X-Device-Token'), deviceToken)) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('Content-Type') || '')) {
        return jsonResponse({ error: 'unsupported_media_type' }, 415);
      }
      const nowMs = now();
      const parsed = parseNotificationPayload(await readPayload(request), { nowMs });
      if (parsed.ignored) return jsonResponse({ received: false, ignored: true, reason: parsed.reason, status: 'ignored' });
      const { ignored, ...evidence } = parsed;
      const result = await persist({
        ...evidence,
        device_id: deviceId,
        event_key: await deriveEventKey(deviceId, evidence.notification_id, evidence.posted_at_ms),
        received_at: new Date(nowMs).toISOString(),
        status: 'pending_review'
      });
      if (typeof result?.duplicate !== 'boolean') throw new Error('invalid_persistence_result');
      return jsonResponse({ received: true, duplicate: result.duplicate, status: 'pending_review' });
    } catch (error) {
      if (error instanceof NotificationError) return jsonResponse({ error: error.code }, error.status);
      // Do not return/log upstream bodies, request headers, secrets or raw text.
      return jsonResponse({ error: 'service_unavailable' }, 503);
    }
  };
}
