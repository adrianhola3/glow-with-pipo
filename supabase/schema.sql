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
          'stock', v.stock
        ) order by v.created_at asc
      )
      from public.product_variants v
      join public.products p on p.id = v.product_id
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
  buyer_name text := trim(coalesce(payload ->> 'buyerName', ''));
  buyer_whatsapp text := trim(coalesce(payload ->> 'buyerWhatsapp', ''));
  yape_holder text := trim(coalesce(payload ->> 'yapeHolderName', ''));
  point_id uuid := nullif(trim(coalesce(payload ->> 'deliveryPointId', '')), '')::uuid;
  slot_id uuid := nullif(trim(coalesce(payload ->> 'deliverySlotId', '')), '')::uuid;
  custom_notes text := trim(coalesce(payload ->> 'notes', ''));
  items_json jsonb := coalesce(payload -> 'items', '[]'::jsonb);

  cust_id uuid;
  cust_code text;
  sale_id uuid := gen_random_uuid();
  sale_code text;
  point_row public.delivery_points%rowtype;
  slot_row public.delivery_slots%rowtype;
  delivery_loc text := '';
  delivery_dt date := null;
  delivery_tm text := '';

  item_rec jsonb;
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
    where id = cust_id;
  end if;

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
      applied_price := round(coalesce((item_rec ->> 'appliedUnitPrice')::numeric, prod_row.combo_price), 2);
    else
      applied_price := round(prod_row.unit_price, 2);
    end if;

    line_rev := round(applied_price * qty, 2);
    line_cst := round(var_row.unit_cost * qty, 2);

    total_u := total_u + qty;
    total_rev := total_rev + line_rev;
    total_cst := total_cst + line_cst;
  end loop;

  -- Check Triple Matching in yape_incoming_payments (Exact Amount + Normalized Holder Name + last 15 min window)
  norm_holder := public.normalize_person_name(yape_holder);
  select yip.id into matched_yape_id
  from public.yape_incoming_payments yip
  where yip.consumed = false
    and yip.amount = total_rev
    and yip.received_at >= now() - interval '15 minutes'
    and (
      yip.normalized_sender_name = norm_holder
      or yip.normalized_sender_name like '%' || norm_holder || '%'
      or norm_holder like '%' || yip.normalized_sender_name || '%'
    )
  order by yip.received_at desc
  limit 1
  for update;

  if matched_yape_id is not null then
    verif_status := 'verified_auto';
    paid_amt := total_rev;
    bal_due := 0;
  else
    verif_status := 'pending_verification';
    paid_amt := 0;
    bal_due := total_rev;
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
    payment_verification_status, delivery_point_id, delivery_slot_id
  ) values (
    sale_id, sale_code, current_date, cust_id, 'pending_delivery',
    delivery_dt, delivery_tm, delivery_loc,
    0, 0, total_u,
    total_rev, total_cst, 0,
    total_rev, round(total_rev - total_cst, 2), paid_amt, bal_due,
    trim('Pedido Tienda Web · Titular Yape: ' || yape_holder || case when custom_notes <> '' then ' · ' || custom_notes else '' end),
    'Tienda Web', 'web', yape_holder,
    verif_status, point_id, slot_id
  );

  -- Second pass: insert sale_items and deduct stock
  for item_rec in select * from jsonb_array_elements(items_json)
  loop
    qty := greatest(1, coalesce((item_rec ->> 'quantity')::integer, 1));
    select * into var_row from public.product_variants where id = (item_rec ->> 'variantId')::uuid;
    select * into prod_row from public.products where id = var_row.product_id;

    p_mode := coalesce(item_rec ->> 'pricingMode', 'unit');
    if p_mode = 'combo' then
      applied_price := round(coalesce((item_rec ->> 'appliedUnitPrice')::numeric, prod_row.combo_price), 2);
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
    values (sale_id, total_rev, 'yape', 'full_payment', 'Validado automáticamente por Detector Yape (' || yape_holder || ')');
  end if;

  return jsonb_build_object(
    'saleId', sale_id,
    'saleCode', sale_code,
    'totalCharged', total_rev,
    'verificationStatus', verif_status,
    'yapeHolderName', yape_holder,
    'deliveryLocation', delivery_loc,
    'deliveryDate', delivery_dt,
    'deliveryTime', delivery_tm
  );
end;
$$;

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
begin
  select * into s_row from public.sales where id = target_sale_id;
  if s_row.id is null then
    raise exception 'Pedido no encontrado.';
  end if;

  if s_row.payment_verification_status in ('verified_auto', 'verified_manual') or s_row.balance_due <= 0 then
    return jsonb_build_object(
      'saleId', s_row.id,
      'saleCode', s_row.code,
      'verificationStatus', s_row.payment_verification_status,
      'isPaid', true
    );
  end if;

  norm_holder := public.normalize_person_name(s_row.yape_holder_name);

  select yip.id into matched_yape_id
  from public.yape_incoming_payments yip
  where yip.consumed = false
    and yip.amount = s_row.total_charged
    and yip.received_at >= s_row.created_at - interval '10 minutes'
    and (
      yip.normalized_sender_name = norm_holder
      or yip.normalized_sender_name like '%' || norm_holder || '%'
      or norm_holder like '%' || yip.normalized_sender_name || '%'
    )
  order by yip.received_at desc
  limit 1
  for update;

  if matched_yape_id is not null then
    update public.yape_incoming_payments
    set consumed = true,
        matched_sale_id = s_row.id
    where id = matched_yape_id;

    insert into public.sale_payments (sale_id, amount, method, payment_concept, note)
    values (s_row.id, s_row.total_charged, 'yape', 'full_payment', 'Validado automáticamente por Detector Yape (' || s_row.yape_holder_name || ')');

    update public.sales
    set amount_paid = total_charged,
        balance_due = 0,
        payment_verification_status = 'verified_auto'
    where id = s_row.id
    returning * into s_row;

    return jsonb_build_object(
      'saleId', s_row.id,
      'saleCode', s_row.code,
      'verificationStatus', 'verified_auto',
      'isPaid', true
    );
  end if;

  return jsonb_build_object(
    'saleId', s_row.id,
    'saleCode', s_row.code,
    'verificationStatus', s_row.payment_verification_status,
    'isPaid', false
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
  pending_sale public.sales%rowtype;
begin
  update public.yape_gateway_status
  set last_heartbeat_at = now(),
      is_awake = true,
      updated_at = now()
  where id = 'primary';

  insert into public.yape_incoming_payments (
    id, sender_full_name, normalized_sender_name, amount, operation_code, raw_notification_text
  ) values (
    new_id, trim(coalesce(sender_name, '')), norm_name, round(payment_amount, 2), trim(coalesce(op_code, '')), trim(coalesce(raw_text, ''))
  );

  -- Auto-match if a web order is already waiting for this exact amount + holder name
  select * into pending_sale
  from public.sales s
  where s.order_source = 'web'
    and s.status = 'pending_delivery'
    and s.balance_due = round(payment_amount, 2)
    and s.created_at >= now() - interval '20 minutes'
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

    insert into public.sale_payments (sale_id, amount, method, payment_concept, note)
    values (pending_sale.id, pending_sale.total_charged, 'yape', 'full_payment', 'Validado en vivo por Detector Yape (' || trim(sender_name) || ')');

    update public.sales
    set amount_paid = total_charged,
        balance_due = 0,
        payment_verification_status = 'verified_auto'
    where id = pending_sale.id;

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

grant execute on function public.normalize_person_name(text) to anon, authenticated;
grant execute on function public.get_public_storefront_catalog() to anon, authenticated;
grant execute on function public.wake_and_check_yape_gateway() to anon, authenticated;
grant execute on function public.create_web_storefront_order(jsonb) to anon, authenticated;
grant execute on function public.check_web_order_yape_status(uuid) to anon, authenticated;
grant execute on function public.register_incoming_yape_notification(text, numeric, text, text) to anon, authenticated;
