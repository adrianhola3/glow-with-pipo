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

-- 5. Predefined Combos (Templates that expand into sale items without duplicating physical stock)
create table if not exists public.combos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
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
  whatsapp text not null,
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
