-- Glow with Pipo — Production Relational Schema for Supabase (PostgreSQL)
-- Includes 13 operational tables, strict Allowed-Owners RLS, indexes, and Realtime publication.

create extension if not exists "pgcrypto";

-- 0. Allowed Business Owners Whitelist (Defense-in-depth for RLS)
create table if not exists public.allowed_owners (
  email text primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.allowed_owners enable row level security;
alter table public.allowed_owners force row level security;

create or replace function public.is_pipo_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'authenticated'
    and exists (
      select 1
      from public.allowed_owners ao
      where lower(ao.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

drop policy if exists "Owners can read whitelist" on public.allowed_owners;
create policy "Owners can read whitelist"
  on public.allowed_owners
  for select
  to authenticated
  using (public.is_pipo_owner());

insert into public.allowed_owners (email, display_name)
values
  ('adrian@glowwithpipo.pe', 'Adrián'),
  ('pipo@glowwithpipo.pe', 'Pipo Socia')
on conflict (email) do update
set display_name = excluded.display_name;

-- 0. Customizable Product Categories
create table if not exists public.product_categories (
  name text primary key,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 1. Suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text default '',
  whatsapp text default '',
  instagram_url text default '',
  tiktok_url text default '',
  facebook_url text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

-- 2. Products (Parent item sharing brand, category, and pricing)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  brand text default '',
  category text not null default 'Labios',
  unit_price numeric(12,2) not null check (unit_price >= 0),
  combo_ratio numeric(5,4) not null default 0.7500 check (combo_ratio > 0 and combo_ratio <= 1),
  combo_price numeric(12,2) not null check (combo_price >= 0),
  has_variants boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Product Variants (Individual shades/tones with independent stock and Weighted Average Cost)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  shade_name text not null default 'Único',
  color_hex text default null,
  stock integer not null default 0 check (stock >= 0),
  unit_cost numeric(12,4) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

-- 4. Packaging & Presentation Supplies (Decorated bags, craft bags, etc.)
create table if not exists public.supplies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  stock integer not null default 0 check (stock >= 0),
  unit_cost numeric(12,4) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

-- 5. Predefined & Customizable Combos (Templates that expand into sale items without duplicating physical stock)
create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  combo_type text not null default 'predefined' check (combo_type in ('predefined', 'customizable')),
  description text default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references public.combos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  custom_combo_unit_price numeric(12,2)
);

-- 6. Restocks & Initial Inventory Loads
create table if not exists public.restocks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  restock_date date not null default current_date,
  entry_type text not null default 'purchase' check (entry_type in ('initial_inventory', 'purchase')),
  total_investment numeric(12,2) not null default 0,
  notes text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.restock_items (
  id uuid primary key default gen_random_uuid(),
  restock_id uuid not null references public.restocks(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  item_kind text not null check (item_kind in ('variant', 'supply')),
  variant_id uuid references public.product_variants(id) on delete set null,
  supply_id uuid references public.supplies(id) on delete set null,
  item_label_snapshot text not null default '',
  quantity integer not null check (quantity > 0),
  package_cost numeric(12,2) not null check (package_cost >= 0),
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  subtotal_cost numeric(12,2) not null check (subtotal_cost >= 0)
);

-- 7. Customers Directory
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  whatsapp text not null default '',
  social_platform text not null default 'instagram' check (social_platform in ('instagram', 'tiktok', 'facebook', 'whatsapp', 'other')),
  social_handle text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

-- 8. Sales / Customer Orders
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  sale_date date not null default current_date,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'pending_delivery' check (status in ('pending_delivery', 'delivered', 'cancelled')),
  delivery_date date,
  delivery_time text default '',
  delivery_location text default '',
  shipping_charged numeric(12,2) not null default 0 check (shipping_charged >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  total_units integer not null default 0,
  products_revenue numeric(12,2) not null default 0,
  products_cost numeric(12,2) not null default 0,
  supplies_cost numeric(12,2) not null default 0,
  total_charged numeric(12,2) not null default 0,
  net_profit numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  notes text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  source_combo_id uuid references public.combos(id) on delete set null,
  source_combo_name text default '',
  product_name_snapshot text not null,
  shade_name_snapshot text not null default 'Único',
  shade_color_snapshot text default null,
  quantity integer not null check (quantity > 0),
  unit_cost_snapshot numeric(12,4) not null,
  catalog_unit_price_snapshot numeric(12,2) not null,
  applied_unit_price numeric(12,2) not null,
  pricing_mode text not null default 'unit' check (pricing_mode in ('unit', 'combo', 'custom')),
  line_revenue numeric(12,2) not null,
  line_cost numeric(12,2) not null,
  line_profit numeric(12,2) not null
);

create table if not exists public.sale_supplies (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  supply_id uuid references public.supplies(id) on delete set null,
  supply_name_snapshot text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_cost_snapshot numeric(12,4) not null,
  total_cost numeric(12,2) not null
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_date timestamptz not null default now(),
  amount numeric(12,2) not null check (amount >= 0),
  method text not null default 'yape' check (method in ('yape', 'plin', 'cash', 'transfer')),
  payment_concept text not null default 'shipping_advance' check (payment_concept in ('shipping_advance', 'order_advance', 'full_payment', 'delivery_balance')),
  note text default ''
);

-- Indexes for fast mobile & desktop queries
create index if not exists idx_variants_product on public.product_variants(product_id);
create index if not exists idx_combo_items_combo on public.combo_items(combo_id);
create index if not exists idx_restock_items_restock on public.restock_items(restock_id);
create index if not exists idx_restock_items_supplier on public.restock_items(supplier_id);
create index if not exists idx_sales_status_delivery on public.sales(status, delivery_date);
create index if not exists idx_sales_customer on public.sales(customer_id);
create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sale_supplies_sale on public.sale_supplies(sale_id);
create index if not exists idx_sale_payments_sale on public.sale_payments(sale_id);

-- Strict Row Level Security + Anon Privilege Revocation + Realtime Publication
revoke all on public.allowed_owners from anon;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'suppliers', 'products', 'product_variants', 'supplies',
    'combos', 'combo_items', 'restocks', 'restock_items',
    'customers', 'sales', 'sale_items', 'sale_supplies', 'sale_payments'
  ]
  loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('alter table public.%I force row level security;', tbl);
    execute format('revoke all on public.%I from anon;', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', tbl);
    execute format('drop policy if exists "Authenticated owners full access" on public.%I;', tbl);
    execute format('drop policy if exists "Allowed Pipo owners full access" on public.%I;', tbl);
    execute format(
      'create policy "Allowed Pipo owners full access" on public.%I for all to authenticated using (public.is_pipo_owner()) with check (public.is_pipo_owner());',
      tbl
    );
    execute format('alter table public.%I replica identity full;', tbl);

    begin
      execute format('alter publication supabase_realtime add table public.%I;', tbl);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================================
-- 9. Public Storefront, Scheduled Delivery Points & Zero-Commission Yape Engine
-- ============================================================================

-- 9.1 Storefront Merchandising Fields on Products & Combos
alter table public.products
  add column if not exists image_url text default '',
  add column if not exists shades_image_url text default '',
  add column if not exists gallery_urls text[] default '{}',
  add column if not exists public_description text default '',
  add column if not exists is_visible_public boolean not null default true,
  add column if not exists is_featured boolean not null default false;

alter table public.product_variants
  add column if not exists image_url text default '';

alter table public.combos
  add column if not exists image_url text default '',
  add column if not exists public_description text default '',
  add column if not exists is_visible_public boolean not null default true,
  add column if not exists is_featured boolean not null default false;

-- 9.2 Web Order Metadata on Sales
alter table public.sales
  add column if not exists order_source text not null default 'erp' check (order_source in ('erp', 'web')),
  add column if not exists yape_holder_name text default '',
  add column if not exists payment_verification_status text not null default 'manual' check (payment_verification_status in ('manual', 'pending_verification', 'verified_auto', 'verified_manual')),
  add column if not exists delivery_point_id uuid default null,
  add column if not exists delivery_slot_id uuid default null;

-- 9.3 Scheduled Delivery Points (Managed by Adrián & Fabiana — Zero Home Delivery)
create table if not exists public.delivery_points (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  zone_type text not null default 'punto_especifico' check (zone_type in ('unac', 'estacion_tren', 'centro_comercial', 'punto_especifico')),
  reference_info text default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 9.4 Scheduled Delivery Time Slots per Point
create table if not exists public.delivery_slots (
  id uuid primary key default gen_random_uuid(),
  delivery_point_id uuid not null references public.delivery_points(id) on delete cascade,
  slot_date date,
  day_label text not null default '',
  time_range text not null,
  max_orders integer not null default 10 check (max_orders > 0),
  booked_orders integer not null default 0 check (booked_orders >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_slots_point on public.delivery_slots(delivery_point_id, active);

-- 9.5 Zero-Commission Yape Gateway Status & Anti-Collision Notification Log
create table if not exists public.yape_gateway_status (
  id text primary key default 'primary',
  is_awake boolean not null default false,
  wake_requested_at timestamptz,
  last_heartbeat_at timestamptz default now(),
  battery_level integer default 100,
  notifications_enabled boolean not null default true,
  receiver_phone text not null default '+51 948 254 832',
  receiver_name text not null default 'Glow with Pipo',
  updated_at timestamptz not null default now()
);

insert into public.yape_gateway_status (id, is_awake, last_heartbeat_at, battery_level, notifications_enabled, receiver_phone, receiver_name)
values ('primary', true, now(), 95, true, '+51 948 254 832', 'Glow with Pipo')
on conflict (id) do nothing;

create table if not exists public.yape_incoming_payments (
  id uuid primary key default gen_random_uuid(),
  sender_full_name text not null,
  normalized_sender_name text not null,
  amount numeric(12,2) not null check (amount > 0),
  operation_code text default '',
  raw_notification_text text default '',
  received_at timestamptz not null default now(),
  consumed boolean not null default false,
  matched_sale_id uuid references public.sales(id) on delete set null
);

create index if not exists idx_yape_incoming_unconsumed on public.yape_incoming_payments(consumed, amount, received_at);

-- Seed default delivery points & slots if empty
insert into public.delivery_points (code, name, zone_type, reference_info, active, sort_order)
values
  ('PTO-001', 'UNAC — Puerta Principal / Biblioteca Central', 'unac', 'Frente a la entrada principal Av. Juan Pablo II o pabellón acordado', true, 1),
  ('PTO-002', 'Estación La Cultura — Línea 1 del Tren', 'estacion_tren', 'Zona de torniquetes / salida Av. Aviación con Javier Prado', true, 2),
  ('PTO-003', 'Estación Gamarra / Angamos — Línea 1 del Tren', 'estacion_tren', 'Interior de estación junto a boletería principal', true, 3),
  ('PTO-004', 'Mall Plaza Bellavista / Plaza San Miguel', 'centro_comercial', 'Patio de comidas o entrada principal frente a Av. La Marina', true, 4)
on conflict (code) do nothing;

insert into public.delivery_slots (delivery_point_id, slot_date, day_label, time_range, max_orders, active)
select
  dp.id,
  current_date + 1,
  'Mañana / Próxima salida programada',
  '2:00 PM - 5:00 PM',
  10,
  true
from public.delivery_points dp
where not exists (
  select 1 from public.delivery_slots ds where ds.delivery_point_id = dp.id
);

-- Enable RLS & Realtime on new tables for Authenticated Owners
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'product_categories', 'delivery_points', 'delivery_slots', 'yape_gateway_status', 'yape_incoming_payments'
  ]
  loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('alter table public.%I force row level security;', tbl);
    execute format('revoke all on public.%I from anon;', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', tbl);
    execute format('drop policy if exists "Allowed Pipo owners full access" on public.%I;', tbl);
    execute format(
      'create policy "Allowed Pipo owners full access" on public.%I for all to authenticated using (public.is_pipo_owner()) with check (public.is_pipo_owner());',
      tbl
    );
    execute format('alter table public.%I replica identity full;', tbl);

    begin
      execute format('alter publication supabase_realtime add table public.%I;', tbl);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- Carrier configuration and reservation metadata. Existing orders keep their
-- legacy defaults; only new unpaid web orders receive a reservation deadline.
create table if not exists public.shipping_methods (
  id text primary key,
  code text not null unique,
  name text not null,
  carrier text not null check (carrier in ('unac', 'shalom', 'olva', 'express')),
  shipping_payment_mode text not null check (shipping_payment_mode in ('free', 'collect_on_delivery', 'prepaid_to_pipo')),
  base_fee numeric(12,2) not null default 0 check (base_fee >= 0),
  min_advance_amount numeric(12,2) not null default 0 check (min_advance_amount >= 0),
  requires_dni boolean not null default false,
  requires_address boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  description text default '',
  created_at timestamptz not null default now()
);

insert into public.shipping_methods (
  id, code, name, carrier, shipping_payment_mode, base_fee, min_advance_amount,
  requires_dni, requires_address, active, sort_order, description
) values
  ('unac_pickup', 'ENV-UNAC', 'Entrega en UNAC / Puntos Glow', 'unac', 'free', 0, 0, false, false, true, 1, 'Entrega coordinada sin costo de envío'),
  ('shalom_agency', 'ENV-SHALOM', 'Shalom · Agencia a Agencia (Flete pago en destino)', 'shalom', 'collect_on_delivery', 0, 30, true, false, true, 2, 'Recoges en agencia Shalom con tu DNI y pagas el flete allá'),
  ('olva_lima', 'ENV-OLVA-LIM', 'Olva Courier · Lima Metropolitana y Callao', 'olva', 'prepaid_to_pipo', 10, 30, true, true, true, 3, 'Envío a domicilio 24-48h hábiles'),
  ('olva_provincia', 'ENV-OLVA-PROV', 'Olva Courier · Provincias a Domicilio', 'olva', 'prepaid_to_pipo', 20, 30, true, true, true, 4, 'Envío a domicilio 48-72h hábiles')
on conflict (id) do nothing;

alter table public.shipping_methods enable row level security;
alter table public.shipping_methods force row level security;
revoke all on public.shipping_methods from public, anon, authenticated;
grant select, insert, update, delete on public.shipping_methods to authenticated;
drop policy if exists "Owners manage shipping methods" on public.shipping_methods;
create policy "Owners manage shipping methods" on public.shipping_methods
  for all to authenticated using (public.is_pipo_owner()) with check (public.is_pipo_owner());

alter table public.customers add column if not exists dni text default '';
alter table public.sales
  add column if not exists delivery_method text not null default 'unac_pickup',
  add column if not exists shipping_payment_mode text not null default 'free',
  add column if not exists recipient_dni text default '',
  add column if not exists destination_region text default '',
  add column if not exists destination_address text default '',
  add column if not exists carrier_tracking_code text default '',
  add column if not exists carrier_security_code text default '',
  add column if not exists fulfillment_stage text not null default 'pending_pack',
  add column if not exists payment_plan text not null default 'full' check (payment_plan in ('full', 'advance_50')),
  add column if not exists expected_initial_payment numeric(12,2) not null default 0,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists separation_due_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists forfeited_fee_amount numeric(12,2) not null default 0;

do $$
declare
  concept_check record;
begin
  for concept_check in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.sale_payments'::regclass
      and c.contype = 'c' and a.attname = 'payment_concept' and cardinality(c.conkey) = 1
  loop
    execute format('alter table public.sale_payments drop constraint %I', concept_check.conname);
  end loop;
  alter table public.sale_payments add constraint sale_payments_payment_concept_check
    check (payment_concept in ('shipping_advance', 'order_advance', 'full_payment', 'delivery_balance', 'partial_refund', 'forfeited_retention'));
end $$;

create index if not exists idx_sales_expiring_web_reservations on public.sales (reservation_expires_at)
  where order_source = 'web' and status = 'pending_delivery'
    and payment_verification_status = 'pending_verification' and amount_paid = 0;

create table if not exists public.public_variant_availability (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  stock integer not null default 0,
  reserved_unpaid integer not null default 0,
  reserved_advance integer not null default 0,
  available_stock integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.public_variant_availability enable row level security;
alter table public.public_variant_availability force row level security;
alter table public.public_variant_availability replica identity full;
revoke all on public.public_variant_availability from public, anon, authenticated;
grant select on public.public_variant_availability to anon, authenticated;
drop policy if exists "Public read variant availability" on public.public_variant_availability;
create policy "Public read variant availability" on public.public_variant_availability
  for select to anon, authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.public_variant_availability;
exception when duplicate_object then null;
end $$;

create or replace function public.sync_public_variant_availability(target_variant_id uuid default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  -- Serialize computation with stock writes and other payment transitions.
  perform 1 from public.product_variants v
  where target_variant_id is null or v.id = target_variant_id
  order by v.id for update;

  insert into public.public_variant_availability as availability (
    variant_id, stock, reserved_unpaid, reserved_advance, available_stock
  )
  select v.id, v.stock, coalesce(reservation.unpaid, 0), coalesce(reservation.advance, 0), v.stock
  from public.product_variants v
  left join lateral (
    select sum(si.quantity) filter (
             where s.payment_verification_status = 'pending_verification' and s.amount_paid = 0
           ) as unpaid,
           sum(si.quantity) filter (where s.balance_due > 0 and s.amount_paid > 0) as advance
    from public.sale_items si join public.sales s on s.id = si.sale_id
    where si.variant_id = v.id and s.order_source = 'web' and s.status = 'pending_delivery'
  ) reservation on true
  where target_variant_id is null or v.id = target_variant_id
  on conflict (variant_id) do update
  set stock = excluded.stock, reserved_unpaid = excluded.reserved_unpaid,
      reserved_advance = excluded.reserved_advance, available_stock = excluded.available_stock,
      updated_at = now()
  where (availability.stock, availability.reserved_unpaid, availability.reserved_advance, availability.available_stock)
    is distinct from (excluded.stock, excluded.reserved_unpaid, excluded.reserved_advance, excluded.available_stock);
end;
$$;

create or replace function public.sync_public_variant_availability_trigger()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.public_variant_availability where variant_id = old.id;
  else
    perform public.sync_public_variant_availability(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists sync_public_variant_availability on public.product_variants;
create trigger sync_public_variant_availability
  after insert or update of stock or delete on public.product_variants
  for each row execute function public.sync_public_variant_availability_trigger();

select public.sync_public_variant_availability();

create or replace function public.release_expired_web_reservations()
returns integer language plpgsql security definer set search_path = public
as $$
declare
  expired_ids uuid[];
  restore_row record;
begin
  with expired as (
    select s.id from public.sales s
    where s.order_source = 'web' and s.status = 'pending_delivery'
      and s.payment_verification_status = 'pending_verification' and s.amount_paid = 0
      and s.reservation_expires_at < now()
    order by s.id for update skip locked
  ), cancelled as (
    update public.sales s
    set status = 'cancelled', balance_due = 0,
        notes = coalesce(s.notes, '') || ' [Reserva expirada automáticamente tras 15 min sin pago]'
    from expired where s.id = expired.id returning s.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into expired_ids from cancelled;

  for restore_row in
    select s.delivery_slot_id, count(*) as quantity from public.sales s
    where s.id = any(expired_ids) and s.delivery_slot_id is not null
    group by s.delivery_slot_id order by s.delivery_slot_id
  loop
    update public.delivery_slots set booked_orders = greatest(0, booked_orders - restore_row.quantity)
    where id = restore_row.delivery_slot_id;
  end loop;

  for restore_row in
    select si.variant_id, sum(si.quantity) as quantity from public.sale_items si
    where si.sale_id = any(expired_ids) and si.variant_id is not null
    group by si.variant_id order by si.variant_id
  loop
    -- The variant trigger projects the restored stock and new reserve counts.
    update public.product_variants set stock = stock + restore_row.quantity where id = restore_row.variant_id;
  end loop;
  return cardinality(expired_ids);
end;
$$;

revoke execute on function public.sync_public_variant_availability(uuid) from public, anon, authenticated;
revoke execute on function public.sync_public_variant_availability_trigger() from public, anon, authenticated;
revoke execute on function public.release_expired_web_reservations() from public, anon, authenticated;
grant execute on function public.release_expired_web_reservations() to service_role;

-- ============================================================================
-- 10. Public Storefront RPCs (SECURITY DEFINER — Zero Cost/Financial Leakage)
-- ============================================================================

-- 10.1 Helper to normalize names for accent-insensitive Yape anti-collision matching
create or replace function public.normalize_person_name(input_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    translate(
      lower(coalesce(input_text, '')),
      'áéíóúäëïöüàèìòùñ',
      'aeiouaeiouaeioun'
    ),
    '[^a-z0-9\s]',
    '',
    'g'
  ));
$$;

-- 10.2 Fetch Public Storefront Catalog (Excludes unit_cost, margins, suppliers, sales)
create or replace function public.get_public_storefront_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  result jsonb;
begin
  perform public.release_expired_web_reservations();

  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(pc.name order by pc.sort_order asc, pc.created_at asc)
      from public.product_categories pc
    ), '["Rostro","Labios","Rubor","Cejas","Sombras","Pestañas","Iluminador","Accesorios"]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'code', p.code,
          'name', p.name,
          'brand', coalesce(p.brand, ''),
          'category', p.category,
          'unitPrice', p.unit_price,
          'comboPrice', p.combo_price,
          'hasVariants', p.has_variants,
          'imageUrl', coalesce(p.image_url, ''),
          'shadesImageUrl', coalesce(p.shades_image_url, ''),
          'galleryUrls', coalesce(p.gallery_urls, '{}'),
          'publicDescription', coalesce(p.public_description, ''),
          'isVisiblePublic', coalesce(p.is_visible_public, true),
          'isFeatured', coalesce(p.is_featured, false)
        ) order by p.is_featured desc, p.created_at asc
      )
      from public.products p
      where p.active = true and coalesce(p.is_visible_public, true) = true
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'productId', v.product_id,
          'sku', v.sku,
          'shadeName', v.shade_name,
          'colorHex', v.color_hex,
          'imageUrl', coalesce(v.image_url, ''),
           'stock', v.stock,
           'reservedUnpaid', coalesce(a.reserved_unpaid, 0),
           'reservedAdvance', coalesce(a.reserved_advance, 0)
        ) order by v.created_at asc
      )
      from public.product_variants v
      join public.products p on p.id = v.product_id
      left join public.public_variant_availability a on a.variant_id = v.id
      where p.active = true and coalesce(p.is_visible_public, true) = true
    ), '[]'::jsonb),
    'combos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'code', c.code,
          'name', c.name,
          'comboType', coalesce(c.combo_type, 'predefined'),
          'description', coalesce(c.description, ''),
          'publicDescription', coalesce(c.public_description, ''),
          'imageUrl', coalesce(c.image_url, ''),
          'isVisiblePublic', coalesce(c.is_visible_public, true),
          'isFeatured', coalesce(c.is_featured, false),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', ci.id,
                'productId', ci.product_id,
                'variantId', ci.variant_id,
                'quantity', ci.quantity,
                'customComboUnitPrice', ci.custom_combo_unit_price
              )
            )
            from public.combo_items ci
            where ci.combo_id = c.id
          ), '[]'::jsonb)
        ) order by c.is_featured desc, c.created_at asc
      )
      from public.combos c
      where c.active = true and coalesce(c.is_visible_public, true) = true
    ), '[]'::jsonb),
    'shippingMethods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'code', m.code, 'name', m.name, 'carrier', m.carrier,
        'shippingPaymentMode', m.shipping_payment_mode, 'baseFee', m.base_fee,
        'minAdvanceAmount', m.min_advance_amount, 'requiresDni', m.requires_dni,
        'requiresAddress', m.requires_address, 'active', m.active,
        'sortOrder', m.sort_order, 'description', coalesce(m.description, '')
      ) order by m.sort_order, m.id)
      from public.shipping_methods m where m.active
    ), '[]'::jsonb),
    'deliveryPoints', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', dp.id,
          'code', dp.code,
          'name', dp.name,
          'zoneType', dp.zone_type,
          'referenceInfo', coalesce(dp.reference_info, ''),
          'sortOrder', dp.sort_order,
          'slots', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', ds.id,
                'deliveryPointId', ds.delivery_point_id,
                'slotDate', ds.slot_date,
                'dayLabel', ds.day_label,
                'timeRange', ds.time_range,
                'maxOrders', ds.max_orders,
                'bookedOrders', ds.booked_orders
              ) order by ds.slot_date asc nulls last, ds.created_at asc
            )
            from public.delivery_slots ds
            where ds.delivery_point_id = dp.id
              and ds.active = true
              and ds.booked_orders < ds.max_orders
          ), '[]'::jsonb)
        ) order by dp.sort_order asc, dp.created_at asc
      )
      from public.delivery_points dp
      where dp.active = true
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- 10.3 Wake-on-Checkout & Pre-Flight Health Check RPC
create or replace function public.wake_and_check_yape_gateway()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gw public.yape_gateway_status%rowtype;
  is_ready boolean;
begin
  update public.yape_gateway_status
  set is_awake = true,
      wake_requested_at = now(),
      updated_at = now()
  where id = 'primary'
  returning * into gw;

  if gw.id is null then
    insert into public.yape_gateway_status (id, is_awake, wake_requested_at, last_heartbeat_at, battery_level, notifications_enabled)
    values ('primary', true, now(), now(), 95, true)
    returning * into gw;
  end if;

  is_ready := gw.notifications_enabled
    and coalesce(gw.battery_level, 100) > 5
    and (gw.last_heartbeat_at is null or gw.last_heartbeat_at >= now() - interval '24 hours');

  return jsonb_build_object(
    'isOnline', is_ready,
    'isAwake', gw.is_awake,
    'wakeRequestedAt', gw.wake_requested_at,
    'lastHeartbeatAt', gw.last_heartbeat_at,
    'batteryLevel', gw.battery_level,
    'notificationsEnabled', gw.notifications_enabled,
    'receiverPhone', gw.receiver_phone,
    'receiverName', gw.receiver_name
  );
end;
$$;

-- 10.4 Submit Guest Storefront Order RPC (Validates stock, creates customer + sale, links Yape)
create or replace function public.create_web_storefront_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer_name text := trim(coalesce(payload ->> 'buyerName', payload ->> 'customerName', ''));
  buyer_whatsapp text := trim(coalesce(payload ->> 'buyerWhatsapp', payload ->> 'customerWhatsapp', ''));
  yape_holder text := trim(coalesce(payload ->> 'yapeHolderName', ''));
  point_id uuid := nullif(trim(coalesce(payload ->> 'deliveryPointId', '')), '')::uuid;
  slot_id uuid := nullif(trim(coalesce(payload ->> 'deliverySlotId', '')), '')::uuid;
  custom_notes text := trim(coalesce(payload ->> 'notes', ''));
  items_json jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  method_id text := coalesce(nullif(trim(payload ->> 'deliveryMethod'), ''), 'unac_pickup');
  recipient_dni_value text := regexp_replace(coalesce(payload ->> 'recipientDni', ''), '\D', '', 'g');
  region_value text := trim(coalesce(payload ->> 'destinationRegion', ''));
  address_value text := trim(coalesce(payload ->> 'destinationAddress', ''));
  plan text := coalesce(nullif(trim(payload ->> 'paymentPlan'), ''), 'full');
  terms_accepted boolean := coalesce((payload -> 'termsAccepted') = 'true'::jsonb, false);

  cust_id uuid;
  cust_code text;
  sale_id uuid := gen_random_uuid();
  sale_code text;
  point_row public.delivery_points%rowtype;
  slot_row public.delivery_slots%rowtype;
  method_row public.shipping_methods%rowtype;
  delivery_loc text := '';
  delivery_dt date := null;
  delivery_tm text := '';

  item_rec jsonb;
  requested_variant record;
  var_row public.product_variants%rowtype;
  prod_row public.products%rowtype;
  qty integer;
  applied_price numeric(12,2);
  p_mode text;
  line_rev numeric(12,2);
  line_cst numeric(12,2);
  line_prf numeric(12,2);

  total_u integer := 0;
  total_rev numeric(12,2) := 0;
  total_cst numeric(12,2) := 0;
  matched_yape_id uuid := null;
  norm_holder text;
  verif_status text := 'pending_verification';
  paid_amt numeric(12,2) := 0;
  bal_due numeric(12,2) := 0;
  ship_fee numeric(12,2);
  order_total numeric(12,2);
  expected_init numeric(12,2);
  reserve_until timestamptz;
  separation_due timestamptz;
  max_sale_num integer := 0;
  max_cust_num integer := 0;
begin
  if buyer_name = '' then
    raise exception 'Por favor ingresa tu nombre completo.';
  end if;
  if buyer_whatsapp = '' then
    raise exception 'Por favor ingresa tu número de WhatsApp.';
  end if;
  if yape_holder = '' then
    raise exception 'Por favor ingresa el nombre completo del titular de la cuenta Yape.';
  end if;
  if jsonb_array_length(items_json) = 0 then
    raise exception 'Tu carrito está vacío.';
  end if;

  select * into method_row from public.shipping_methods where id = method_id and active;
  if not found then
    raise exception 'El método de entrega seleccionado ya no está disponible.';
  end if;
  if method_row.requires_dni and length(recipient_dni_value) <> 8 then
    raise exception 'Ingresa un DNI de 8 dígitos para este método de entrega.';
  end if;
  if method_row.requires_address and (region_value = '' or address_value = '') then
    raise exception 'Ingresa la región y dirección de destino.';
  end if;
  if method_id = 'shalom_agency' and region_value = '' then
    raise exception 'Ingresa la ciudad o agencia de destino de Shalom.';
  end if;
  if plan not in ('full', 'advance_50') then
    raise exception 'Selecciona un plan de pago válido.';
  end if;
  if plan = 'advance_50' and not terms_accepted then
    raise exception 'Acepta los términos de separación antes de continuar.';
  end if;

  if point_id is not null then
    select * into point_row from public.delivery_points where id = point_id and active = true;
    if point_row.id is null then
      raise exception 'El punto de entrega seleccionado ya no está disponible.';
    end if;
    delivery_loc := point_row.name;
  end if;

  if slot_id is not null then
    select * into slot_row from public.delivery_slots where id = slot_id and active = true for update;
    if slot_row.id is null or slot_row.booked_orders >= slot_row.max_orders then
      raise exception 'El horario de entrega seleccionado ya completó su cupo.';
    end if;
    delivery_dt := coalesce(slot_row.slot_date, current_date + 1);
    delivery_tm := trim(coalesce(slot_row.day_label, '') || ' · ' || coalesce(slot_row.time_range, ''));
    update public.delivery_slots set booked_orders = booked_orders + 1 where id = slot_id;
  end if;

  -- Reuse customer by WhatsApp or create new customer
  select id into cust_id
  from public.customers
  where regexp_replace(whatsapp, '\D', '', 'g') = regexp_replace(buyer_whatsapp, '\D', '', 'g')
    and length(regexp_replace(buyer_whatsapp, '\D', '', 'g')) >= 7
  limit 1;

  if cust_id is null then
    select coalesce(max((regexp_match(code, '^CLI-(\d+)$'))[1]::integer), 0)
    into max_cust_num
    from public.customers
    where code ~ '^CLI-\d+$';

    cust_code := 'CLI-' || lpad((max_cust_num + 1)::text, 3, '0');
    cust_id := gen_random_uuid();

    insert into public.customers (id, code, name, whatsapp, social_platform, social_handle, notes)
    values (cust_id, cust_code, buyer_name, buyer_whatsapp, 'whatsapp', 'Tienda Web', 'Titular Yape: ' || yape_holder);
  else
    update public.customers
    set name = buyer_name
    where id = cust_id and trim(coalesce(name, '')) = '';
  end if;

  -- Lock each variant once, in a stable order, and validate the whole cart.
  -- Per-line checks alone miss repeated variants across products/combos.
  for requested_variant in
    select (item ->> 'variantId')::uuid as variant_id,
           sum(greatest(1, coalesce((item ->> 'quantity')::integer, 1))) as requested_quantity
    from jsonb_array_elements(items_json) as cart(item)
    group by (item ->> 'variantId')::uuid
    order by (item ->> 'variantId')::uuid
  loop
    select * into var_row
    from public.product_variants
    where id = requested_variant.variant_id
    for update;

    if var_row.id is null then
      raise exception 'Uno de los tonos seleccionados ya no existe.';
    end if;
    if var_row.stock < requested_variant.requested_quantity then
      raise exception 'Stock insuficiente para el tono %. Solicitado: %. Disponible: %.',
        var_row.shade_name, requested_variant.requested_quantity, var_row.stock;
    end if;
  end loop;

  -- First pass: validate stock and compute totals
  for item_rec in select * from jsonb_array_elements(items_json)
  loop
    qty := greatest(1, coalesce((item_rec ->> 'quantity')::integer, 1));
    select * into var_row
    from public.product_variants
    where id = (item_rec ->> 'variantId')::uuid
    for update;

    if var_row.id is null then
      raise exception 'Uno de los tonos seleccionados ya no existe.';
    end if;

    select * into prod_row from public.products where id = var_row.product_id;
    if prod_row.id is null or prod_row.active = false then
      raise exception 'El producto % ya no está disponible.', coalesce(prod_row.name, '');
    end if;

    if var_row.stock < qty then
      raise exception 'Stock insuficiente para % (%). Disponible: %.', prod_row.name, var_row.shade_name, var_row.stock;
    end if;

    p_mode := coalesce(item_rec ->> 'pricingMode', 'unit');
    if p_mode = 'combo' then
      -- Public checkout uses only the authoritative product combo tariff.
      applied_price := round(prod_row.combo_price, 2);
    else
      applied_price := round(prod_row.unit_price, 2);
    end if;

    line_rev := round(applied_price * qty, 2);
    line_cst := round(var_row.unit_cost * qty, 2);

    total_u := total_u + qty;
    total_rev := total_rev + line_rev;
    total_cst := total_cst + line_cst;
  end loop;

  ship_fee := round(method_row.base_fee, 2);
  order_total := round(total_rev + ship_fee, 2);
  expected_init := case
    when plan = 'full' then order_total
    when method_row.min_advance_amount > 0 then
      greatest(round(order_total * 0.5, 2), least(order_total, method_row.min_advance_amount))
    else round(order_total * 0.5, 2)
  end;
  separation_due := case
    when slot_row.slot_date is not null then
      ((slot_row.slot_date::timestamp + time '23:59:59') at time zone 'America/Lima') + interval '24 hours'
    else
      now() + interval '48 hours'
  end;

  -- Check Triple Matching in yape_incoming_payments (Exact Amount + Normalized Holder Name + last 15 min window)
  norm_holder := public.normalize_person_name(yape_holder);
  select yip.id into matched_yape_id
  from public.yape_incoming_payments yip
  where yip.consumed = false
    and yip.amount = expected_init
    and norm_holder <> '' and yip.normalized_sender_name <> ''
    and yip.received_at >= now() - interval '15 minutes'
    and (
      yip.normalized_sender_name = norm_holder
      or yip.normalized_sender_name like '%' || norm_holder || '%'
      or norm_holder like '%' || yip.normalized_sender_name || '%'
    )
  order by yip.received_at desc
  limit 1
  for update skip locked;

  if matched_yape_id is not null then
    verif_status := 'verified_auto';
    paid_amt := expected_init;
    bal_due := greatest(0, order_total - paid_amt);
  else
    verif_status := 'pending_verification';
    paid_amt := 0;
    bal_due := order_total;
    reserve_until := now() + interval '15 minutes';
  end if;

  select coalesce(max((regexp_match(code, '^VTA-(\d+)$'))[1]::integer), 0)
  into max_sale_num
  from public.sales
  where code ~ '^VTA-\d+$';

  sale_code := 'VTA-' || lpad((max_sale_num + 1)::text, 3, '0');

  insert into public.sales (
    id, code, sale_date, customer_id, status,
    delivery_date, delivery_time, delivery_location,
    shipping_charged, shipping_cost, total_units,
    products_revenue, products_cost, supplies_cost,
    total_charged, net_profit, amount_paid, balance_due,
    notes, created_by, order_source, yape_holder_name,
    payment_verification_status, delivery_point_id, delivery_slot_id,
    delivery_method, shipping_payment_mode, recipient_dni, destination_region, destination_address,
    payment_plan, expected_initial_payment, reservation_expires_at, separation_due_at, terms_accepted_at
  ) values (
    sale_id, sale_code, current_date, cust_id, 'pending_delivery',
    delivery_dt, delivery_tm, delivery_loc,
    ship_fee, ship_fee, total_u,
    total_rev, total_cst, 0,
    order_total, round(total_rev - total_cst, 2), paid_amt, bal_due,
    trim('Pedido Tienda Web · Titular Yape: ' || yape_holder || case when custom_notes <> '' then ' · ' || custom_notes else '' end),
    'Tienda Web', 'web', yape_holder,
    verif_status, point_id, slot_id,
    method_id, method_row.shipping_payment_mode, recipient_dni_value, region_value, address_value,
    plan, expected_init, reserve_until, separation_due, case when terms_accepted then now() end
  );

  -- Second pass: insert sale_items and deduct stock
  for item_rec in select * from jsonb_array_elements(items_json)
  loop
    qty := greatest(1, coalesce((item_rec ->> 'quantity')::integer, 1));
    select * into var_row from public.product_variants where id = (item_rec ->> 'variantId')::uuid;
    select * into prod_row from public.products where id = var_row.product_id;

    p_mode := coalesce(item_rec ->> 'pricingMode', 'unit');
    if p_mode = 'combo' then
      applied_price := round(prod_row.combo_price, 2);
    else
      applied_price := round(prod_row.unit_price, 2);
    end if;

    line_rev := round(applied_price * qty, 2);
    line_cst := round(var_row.unit_cost * qty, 2);
    line_prf := round(line_rev - line_cst, 2);

    insert into public.sale_items (
      sale_id, variant_id, source_combo_id, source_combo_name,
      product_name_snapshot, shade_name_snapshot, shade_color_snapshot,
      quantity, unit_cost_snapshot, catalog_unit_price_snapshot,
      applied_unit_price, pricing_mode, line_revenue, line_cost, line_profit
    ) values (
      sale_id,
      var_row.id,
      nullif(trim(coalesce(item_rec ->> 'sourceComboId', '')), '')::uuid,
      coalesce(item_rec ->> 'sourceComboName', ''),
      prod_row.name,
      var_row.shade_name,
      var_row.color_hex,
      qty,
      var_row.unit_cost,
      prod_row.unit_price,
      applied_price,
      case when p_mode in ('unit', 'combo', 'custom') then p_mode else 'unit' end,
      line_rev,
      line_cst,
      line_prf
    );

    update public.product_variants
    set stock = stock - qty
    where id = var_row.id;
  end loop;

  if matched_yape_id is not null then
    update public.yape_incoming_payments
    set consumed = true,
        matched_sale_id = sale_id
    where id = matched_yape_id;

    insert into public.sale_payments (sale_id, amount, method, payment_concept, note)
    values (sale_id, expected_init, 'yape', case when plan = 'advance_50' then 'order_advance' else 'full_payment' end,
      'Validado automáticamente por Detector Yape (' || yape_holder || ')');
  end if;

  return jsonb_build_object(
    'saleId', sale_id,
    'saleCode', sale_code,
    'totalCharged', order_total,
    'expectedInitialPayment', expected_init,
    'paymentPlan', plan,
    'shippingCharged', ship_fee,
    'deliveryMethod', method_id,
    'shippingPaymentMode', method_row.shipping_payment_mode,
    'reservationExpiresAt', reserve_until,
    'separationDueAt', separation_due,
    'balanceDue', bal_due,
    'verificationStatus', verif_status,
    'yapeHolderName', yape_holder,
    'deliveryLocation', delivery_loc,
    'deliveryDate', delivery_dt,
    'deliveryTime', delivery_tm
  );
end;
$$;

-- These helpers are internal. Callers lock the sale before applying a payment.
create or replace function public.web_order_expected_payment(s public.sales)
returns numeric language sql immutable set search_path = public
as $$
  select case when s.payment_plan = 'advance_50' and s.amount_paid = 0 and s.expected_initial_payment > 0
    then s.expected_initial_payment else s.balance_due end;
$$;

create or replace function public.apply_web_order_yape_payment(s public.sales, verification text, payment_note text)
returns public.sales language plpgsql set search_path = public
as $$
declare
  expected_pay numeric := public.web_order_expected_payment(s);
  payment_kind text;
  affected_variant uuid;
begin
  if expected_pay <= 0 then
    return s;
  end if;
  payment_kind := case when s.amount_paid > 0 then 'delivery_balance'
    when s.payment_plan = 'advance_50' and s.expected_initial_payment > 0 then 'order_advance'
    else 'full_payment' end;

  insert into public.sale_payments (sale_id, amount, method, payment_concept, note)
  values (s.id, expected_pay, 'yape', payment_kind, payment_note);

  update public.sales
  set amount_paid = amount_paid + expected_pay,
      balance_due = greatest(0, total_charged - (amount_paid + expected_pay)),
      reservation_expires_at = null,
      payment_verification_status = verification
  where id = s.id returning * into s;

  for affected_variant in
    select distinct si.variant_id from public.sale_items si
    where si.sale_id = s.id and si.variant_id is not null order by si.variant_id
  loop
    perform public.sync_public_variant_availability(affected_variant);
  end loop;
  return s;
end;
$$;

revoke execute on function public.web_order_expected_payment(public.sales) from public, anon, authenticated;
revoke execute on function public.apply_web_order_yape_payment(public.sales, text, text) from public, anon, authenticated;

-- 10.5 Check or Match Yape Payment for an Active Web Order (Polling / Realtime Verification)
create or replace function public.check_web_order_yape_status(target_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s_row public.sales%rowtype;
  matched_yape_id uuid := null;
  norm_holder text;
  expected_pay numeric;
  earliest_payment timestamptz;
begin
  select * into s_row from public.sales where id = target_sale_id and order_source = 'web' for update;
  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if s_row.status = 'pending_delivery' and s_row.balance_due > 0
    and (s_row.reservation_expires_at is null or s_row.reservation_expires_at >= now()) then
    expected_pay := public.web_order_expected_payment(s_row);
    norm_holder := public.normalize_person_name(s_row.yape_holder_name);
    earliest_payment := s_row.created_at - interval '10 minutes';
    if s_row.amount_paid > 0 then
      select greatest(s_row.created_at, max(sp.payment_date)) into earliest_payment
      from public.sale_payments sp where sp.sale_id = s_row.id;
    end if;

    select yip.id into matched_yape_id
    from public.yape_incoming_payments yip
    where not yip.consumed and yip.amount = expected_pay and yip.received_at >= earliest_payment
      and norm_holder <> '' and yip.normalized_sender_name <> ''
      and (
        yip.normalized_sender_name = norm_holder
        or yip.normalized_sender_name like '%' || norm_holder || '%'
        or norm_holder like '%' || yip.normalized_sender_name || '%'
      )
    order by yip.received_at desc limit 1 for update skip locked;

    if matched_yape_id is not null then
      update public.yape_incoming_payments set consumed = true, matched_sale_id = s_row.id
      where id = matched_yape_id;
      s_row := public.apply_web_order_yape_payment(s_row, 'verified_auto',
        'Validado automáticamente por Detector Yape (' || s_row.yape_holder_name || ')');
    end if;
  end if;

  return jsonb_build_object(
    'saleId', s_row.id,
    'saleCode', s_row.code,
    'verificationStatus', s_row.payment_verification_status,
    'isPaid', s_row.status <> 'cancelled' and s_row.balance_due <= 0,
    'balanceDue', s_row.balance_due,
    'amountPaid', s_row.amount_paid,
    'status', s_row.status,
    'reservationExpiresAt', s_row.reservation_expires_at
  );
end;
$$;

-- 10.6 Register Incoming Yape Notification from Android / MacroDroid Webhook
create or replace function public.register_incoming_yape_notification(
  sender_name text,
  payment_amount numeric,
  op_code text default '',
  raw_text text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
  norm_name text := public.normalize_person_name(sender_name);
  clean_op text := trim(coalesce(op_code, ''));
  existing_payment public.yape_incoming_payments%rowtype;
  pending_sale public.sales%rowtype;
begin
  if not (
    coalesce(public.is_pipo_owner(), false)
    or coalesce(auth.role() = 'service_role', false)
    or coalesce(current_setting('pipo.internal_webhook_call', true), '') = 'true'
  ) then
    raise exception 'No autorizado';
  end if;

  update public.yape_gateway_status
  set last_heartbeat_at = now(),
      is_awake = true,
      updated_at = now()
  where id = 'primary';

  -- Deduplicate repeated Android notifications sharing the same non-empty operation_code
  if clean_op <> '' then
    select * into existing_payment
    from public.yape_incoming_payments y
    where y.operation_code = clean_op
      and y.amount = round(payment_amount, 2)
      and y.normalized_sender_name = norm_name
      and (y.consumed = false or y.received_at >= now() - interval '20 minutes')
    order by y.received_at desc
    limit 1;

    if existing_payment.id is not null then
      return jsonb_build_object(
        'paymentId', existing_payment.id,
        'matchedSaleId', existing_payment.matched_sale_id,
        'autoVerified', coalesce(existing_payment.consumed, false),
        'duplicate', true
      );
    end if;
  end if;

  insert into public.yape_incoming_payments (
    id, sender_full_name, normalized_sender_name, amount, operation_code, raw_notification_text
  ) values (
    new_id, trim(coalesce(sender_name, '')), norm_name, round(payment_amount, 2), clean_op, trim(coalesce(raw_text, ''))
  );

  -- Auto-match if a web order is already waiting for this exact amount + holder name
  select * into pending_sale
  from public.sales s
  where s.order_source = 'web'
    and s.status = 'pending_delivery'
    and s.balance_due > 0
    and public.web_order_expected_payment(s) = round(payment_amount, 2)
    and (s.reservation_expires_at is null or s.reservation_expires_at >= now())
    and (s.created_at >= now() - interval '20 minutes' or (s.payment_plan = 'advance_50' and s.amount_paid > 0))
    and norm_name <> '' and public.normalize_person_name(s.yape_holder_name) <> ''
    and (
      public.normalize_person_name(s.yape_holder_name) = norm_name
      or public.normalize_person_name(s.yape_holder_name) like '%' || norm_name || '%'
      or norm_name like '%' || public.normalize_person_name(s.yape_holder_name) || '%'
    )
  order by s.created_at desc
  limit 1
  for update;

  if pending_sale.id is not null then
    update public.yape_incoming_payments
    set consumed = true,
        matched_sale_id = pending_sale.id
    where id = new_id;

    pending_sale := public.apply_web_order_yape_payment(pending_sale, 'verified_auto',
      'Validado en vivo por Detector Yape (' || trim(sender_name) || ')');

    return jsonb_build_object(
      'paymentId', new_id,
      'matchedSaleId', pending_sale.id,
      'matchedSaleCode', pending_sale.code,
      'autoVerified', true
    );
  end if;

  return jsonb_build_object(
    'paymentId', new_id,
    'matchedSaleId', null,
    'autoVerified', false
  );
end;
$$;

-- 10.7 Raw Android / MacroDroid Notification Parser Webhook
create or replace function public.ingest_yape_android_webhook(
  raw_title text default '',
  raw_text text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  combined text := trim(coalesce(raw_title, '') || ' ' || coalesce(raw_text, ''));
  clean_for_name text;
  amt_match text[];
  name_match text[];
  op_match text[];
  parsed_amount numeric(12,2);
  parsed_name text;
  parsed_op text := '';
begin
  -- Ignorar transferencias salientes ("Yapeaste!", "Enviaste") o promociones sin monto
  if combined = '' or combined ~* '(yapeaste|enviaste)' then
    return jsonb_build_object('ignored', true, 'reason', 'outgoing_or_empty');
  end if;

  amt_match := regexp_match(combined, 'S/\.?\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'i');
  if amt_match is null then
    return jsonb_build_object('ignored', true, 'reason', 'no_amount_found');
  end if;
  parsed_amount := replace(amt_match[1], ',', '.')::numeric;

  clean_for_name := regexp_replace(
    coalesce(raw_text, ''),
    '^\s*(?:¡?\s*Yape!?\s*|Confirmaci[oó]n\s+de\s+Pago\s*:?\s*)+',
    '',
    'i'
  );
  name_match := regexp_match(clean_for_name, '^\s*(.+?)\s+te\s+(?:envi[oó]|yape[oó])', 'i');

  if name_match is null then
    clean_for_name := regexp_replace(
      combined,
      '^\s*(?:¡?\s*Yape!?\s*|Confirmaci[oó]n\s+de\s+Pago\s*:?\s*)+',
      '',
      'i'
    );
    name_match := regexp_match(clean_for_name, '^\s*(.+?)\s+te\s+(?:envi[oó]|yape[oó])', 'i');
  end if;

  if name_match is null or trim(name_match[1]) = '' then
    return jsonb_build_object('ignored', true, 'reason', 'no_sender_found');
  end if;
  parsed_name := trim(name_match[1]);

  op_match := regexp_match(combined, '(?:c[oó]d\.?\s*(?:de\s*seguridad)?\s*(?:es)?\s*[:#]?\s*|operaci[oó]n\s*[:#]?\s*)([0-9]{3,8})', 'i');
  if op_match is not null then
    parsed_op := trim(op_match[1]);
  end if;

  perform set_config('pipo.internal_webhook_call', 'true', true);
  return public.register_incoming_yape_notification(
    parsed_name,
    parsed_amount,
    parsed_op,
    combined
  );
end;
$$;

-- Owner action addresses a specific active web order and records one installment at a time.
create or replace function public.confirm_web_order_payment_manual(target_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s_row public.sales%rowtype;
begin
  if not coalesce(public.is_pipo_owner(), false) then
    raise exception 'No autorizado';
  end if;

  select * into s_row from public.sales where id = target_sale_id for update;
  if s_row.id is null then
    raise exception 'Pedido no encontrado.';
  end if;
  if s_row.order_source <> 'web' or s_row.status <> 'pending_delivery' then
    raise exception 'Solo se pueden confirmar pedidos web pendientes de entrega.';
  end if;

  if s_row.amount_paid = 0 and s_row.reservation_expires_at < now() then
    raise exception 'La reserva de este pedido expiró.';
  end if;

  s_row := public.apply_web_order_yape_payment(s_row, 'verified_manual',
    'Recepción de Yape confirmada manualmente por propietario');

  return jsonb_build_object(
    'saleId', s_row.id,
    'saleCode', s_row.code,
    'verificationStatus', s_row.payment_verification_status,
    'isPaid', s_row.balance_due <= 0,
    'balanceDue', s_row.balance_due,
    'amountPaid', s_row.amount_paid,
    'reservationExpiresAt', s_row.reservation_expires_at
  );
end;
$$;

create or replace function public.cancel_sale_with_partial_refund(
  target_sale_id uuid, refund_amount numeric default 0, refund_method text default 'yape',
  retained_fee numeric default 0, reason_note text default ''
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  s_row public.sales%rowtype;
  refund_value numeric(12,2) := round(coalesce(refund_amount, 0), 2);
  retained_value numeric(12,2) := round(coalesce(retained_fee, 0), 2);
  method_value text := lower(trim(coalesce(refund_method, 'yape')));
  reason_value text := trim(coalesce(reason_note, ''));
  restore_row record;
begin
  if not coalesce(public.is_pipo_owner(), false) then
    raise exception 'No autorizado';
  end if;

  select * into s_row from public.sales where id = target_sale_id for update;
  if not found then
    raise exception 'Pedido no encontrado.';
  end if;
  if s_row.status = 'cancelled' then
    return jsonb_build_object('saleId', s_row.id, 'status', s_row.status,
      'refundedAmount', s_row.refunded_amount, 'forfeitedFeeAmount', s_row.forfeited_fee_amount);
  end if;

  if refund_value < 0 or retained_value < 0 or refund_value + retained_value > s_row.amount_paid then
    raise exception 'El reembolso y la retención no pueden superar lo pagado.';
  end if;
  if method_value not in ('yape', 'plin', 'cash', 'transfer') then
    raise exception 'Método de reembolso inválido.';
  end if;

  update public.sales
  set status = 'cancelled', balance_due = 0, reservation_expires_at = null,
      refunded_amount = refund_value, forfeited_fee_amount = retained_value,
      notes = case when reason_value <> '' then concat_ws(' · ', nullif(notes, ''), reason_value) else notes end
  where id = s_row.id returning * into s_row;

  if s_row.delivery_slot_id is not null then
    update public.delivery_slots set booked_orders = greatest(0, booked_orders - 1)
    where id = s_row.delivery_slot_id;
  end if;
  for restore_row in
    select si.variant_id, sum(si.quantity) as quantity from public.sale_items si
    where si.sale_id = s_row.id and si.variant_id is not null
    group by si.variant_id order by si.variant_id
  loop
    update public.product_variants set stock = stock + restore_row.quantity where id = restore_row.variant_id;
  end loop;
  for restore_row in
    select ss.supply_id, sum(ss.quantity) as quantity from public.sale_supplies ss
    where ss.sale_id = s_row.id and ss.supply_id is not null
    group by ss.supply_id order by ss.supply_id
  loop
    update public.supplies set stock = stock + restore_row.quantity where id = restore_row.supply_id;
  end loop;

  -- These ledger amounts are positive; the concept distinguishes outflow and retention from receipts.
  if refund_value > 0 then
    insert into public.sale_payments (sale_id, amount, method, payment_concept, note)
    values (s_row.id, refund_value, method_value, 'partial_refund', reason_value);
  end if;
  if retained_value > 0 then
    insert into public.sale_payments (sale_id, amount, method, payment_concept, note)
    values (s_row.id, retained_value, method_value, 'forfeited_retention', reason_value);
  end if;

  return jsonb_build_object('saleId', s_row.id, 'status', s_row.status,
    'refundedAmount', s_row.refunded_amount, 'forfeitedFeeAmount', s_row.forfeited_fee_amount);
end;
$$;

create or replace function public.update_sale_carrier_dispatch(
  target_sale_id uuid, tracking_code text default '', security_code text default '', next_stage text default 'dispatched'
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  s_row public.sales%rowtype;
begin
  if not coalesce(public.is_pipo_owner(), false) then
    raise exception 'No autorizado';
  end if;
  if trim(coalesce(next_stage, '')) = '' then
    raise exception 'Indica la etapa de despacho.';
  end if;

  update public.sales
  set carrier_tracking_code = trim(coalesce(tracking_code, '')),
      carrier_security_code = trim(coalesce(security_code, '')),
      fulfillment_stage = trim(next_stage)
  where id = target_sale_id returning * into s_row;
  if not found then
    raise exception 'Pedido no encontrado.';
  end if;
  return jsonb_build_object('saleId', s_row.id, 'carrierTrackingCode', s_row.carrier_tracking_code,
    'carrierSecurityCode', s_row.carrier_security_code, 'fulfillmentStage', s_row.fulfillment_stage);
end;
$$;

grant execute on function public.normalize_person_name(text) to anon, authenticated;
grant execute on function public.get_public_storefront_catalog() to anon, authenticated;
grant execute on function public.wake_and_check_yape_gateway() to anon, authenticated;
grant execute on function public.create_web_storefront_order(jsonb) to anon, authenticated;
grant execute on function public.check_web_order_yape_status(uuid) to anon, authenticated;
-- Revoke PUBLIC/anon from direct register_incoming_yape_notification calls, while keeping ingest_yape_android_webhook open to MacroDroid.
revoke execute on function public.register_incoming_yape_notification(text, numeric, text, text) from public, anon;
grant execute on function public.register_incoming_yape_notification(text, numeric, text, text) to authenticated, service_role;
grant execute on function public.ingest_yape_android_webhook(text, text) to anon, authenticated, service_role;
revoke execute on function public.confirm_web_order_payment_manual(uuid) from public, anon;
grant execute on function public.confirm_web_order_payment_manual(uuid) to authenticated, service_role;
revoke execute on function public.cancel_sale_with_partial_refund(uuid, numeric, text, numeric, text) from public, anon;
revoke execute on function public.update_sale_carrier_dispatch(uuid, text, text, text) from public, anon;
grant execute on function public.cancel_sale_with_partial_refund(uuid, numeric, text, numeric, text) to authenticated, service_role;
grant execute on function public.update_sale_carrier_dispatch(uuid, text, text, text) to authenticated, service_role;

-- ============================================================================
-- 10. Storefront Public Media Bucket ('storefront-media') & Storage RLS
-- ============================================================================
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('storefront-media', 'storefront-media', true)
    on conflict (id) do update set public = true;

    drop policy if exists "Public read access for storefront-media" on storage.objects;
    create policy "Public read access for storefront-media"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'storefront-media');

    drop policy if exists "Owner manage storefront-media objects" on storage.objects;
    create policy "Owner manage storefront-media objects"
      on storage.objects for all
      to authenticated
      using (bucket_id = 'storefront-media' and public.is_pipo_owner())
      with check (bucket_id = 'storefront-media' and public.is_pipo_owner());
  end if;
end
$$;
