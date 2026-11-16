import { createNotificationHandler } from './core.mjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const deviceToken = Deno.env.get('YAPE_DEVICE_TOKEN') || '';
const deviceId = Deno.env.get('YAPE_DEVICE_ID') || '';

// Service credentials never leave the Edge environment. No browser SDK or RPC
// from the legacy payment flow participates in this pilot.
const persist = async (record: Record<string, unknown>) => {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('unconfigured');
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/yape_notification_inbox?on_conflict=event_key&select=event_key`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation'
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(10000)
    }
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('persistence_failed');
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length > 1 || (rows.length === 1 && rows[0]?.event_key !== record.event_key)) {
    throw new Error('invalid_persistence_response');
  }
  return { duplicate: rows.length === 0 };
};

Deno.serve(createNotificationHandler({ deviceToken, deviceId, persist }));
