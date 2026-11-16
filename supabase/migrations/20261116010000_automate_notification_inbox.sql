-- Isolated evidence inbox. This migration deliberately leaves legacy RPCs alone.
begin;

create table if not exists public.yape_notification_inbox (
  event_key text primary key check (event_key ~ '^[0-9a-f]{64}$'),
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  package_name text not null check (package_name = 'com.bcp.innovacxion.yapeapp'),
  notification_id text not null check (length(notification_id) between 1 and 256),
  posted_at_ms bigint not null check (posted_at_ms >= 1577836800000 and posted_at_ms <= 8640000000000000),
  received_at timestamptz not null default now(),
  raw_title text not null check (length(raw_title) <= 512),
  raw_text text not null check (length(raw_text) between 1 and 8192),
  sender_name text not null check (length(sender_name) between 3 and 120),
  amount_minor bigint not null check (amount_minor > 0),
  is_delayed boolean not null default false,
  parser_version text not null,
  status text not null default 'pending_review' check (status = 'pending_review'),
  constraint yape_notification_inbox_android_identity unique (device_id, notification_id, posted_at_ms)
);

create index if not exists yape_notification_inbox_received_idx
  on public.yape_notification_inbox (received_at desc);

alter table public.yape_notification_inbox enable row level security;
alter table public.yape_notification_inbox force row level security;
revoke all on table public.yape_notification_inbox from public, anon, authenticated;
-- Supabase service_role bypasses RLS. No client policies, realtime publication,
-- triggers, sale links, or payment creation are installed by this migration.
grant select, insert on table public.yape_notification_inbox to service_role;

comment on table public.yape_notification_inbox is
  'Untrusted Android notification evidence only; pending human review, never bank proof.';

commit;
