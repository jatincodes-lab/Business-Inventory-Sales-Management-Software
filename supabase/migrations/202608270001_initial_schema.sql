create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete restrict,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 60),
  role_key text not null check (role_key ~ '^[a-z0-9_]+$'),
  created_at timestamptz not null default now(),
  unique (business_id, role_key)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.profile_roles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 30),
  code text not null check (code ~ '^[a-zA-Z0-9_-]+$'),
  unique (business_id, code)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  unit_id uuid not null references public.units(id) on delete restrict,
  sku text not null check (char_length(trim(sku)) between 1 and 60),
  name text not null check (char_length(trim(name)) between 1 and 160),
  purchase_price numeric(18,2) not null default 0 check (purchase_price >= 0),
  sale_price numeric(18,2) not null default 0 check (sale_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  reorder_level numeric(18,3) not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  email text,
  mobile text check (mobile is null or mobile ~ '^[6-9][0-9]{9}$'),
  address text,
  tax_id text,
  payment_terms_days integer not null default 0 check (payment_terms_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  email text,
  mobile text check (mobile is null or mobile ~ '^[6-9][0-9]{9}$'),
  address text,
  tax_id text,
  payment_terms_days integer not null default 0 check (payment_terms_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  order_number text not null,
  order_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'partially_received', 'received', 'cancelled')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id, order_number)
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  ordered_quantity numeric(18,3) not null check (ordered_quantity > 0),
  received_quantity numeric(18,3) not null default 0 check (received_quantity >= 0),
  unit_cost numeric(18,2) not null check (unit_cost >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100)
);

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  receipt_number text not null,
  receipt_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  notes text,
  created_by uuid not null references auth.users(id),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, receipt_number)
);

create table public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  unit_cost numeric(18,2) not null check (unit_cost >= 0)
);

create table public.stock_balances (
  business_id uuid not null references public.businesses(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (business_id, warehouse_id, item_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity_delta numeric(18,3) not null check (quantity_delta <> 0),
  movement_type text not null check (movement_type in ('receipt', 'sale', 'return', 'adjustment', 'transfer_in', 'transfer_out')),
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid,
  performed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (source_type, source_line_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index profiles_business_id_idx on public.profiles (business_id);
create index items_business_id_idx on public.items (business_id);
create index warehouses_business_id_idx on public.warehouses (business_id);
create index vendors_business_id_idx on public.vendors (business_id);
create index customers_business_id_idx on public.customers (business_id);
create index purchase_orders_business_status_idx on public.purchase_orders (business_id, status);
create index goods_receipts_business_status_idx on public.goods_receipts (business_id, status);
create index stock_movements_business_created_idx on public.stock_movements (business_id, created_at desc);

insert into public.permissions (permission_key, description) values
  ('dashboard.view', 'View dashboard'),
  ('items.view', 'View items'), ('items.create', 'Create items'), ('items.edit', 'Edit items'), ('items.delete', 'Delete items'),
  ('warehouses.view', 'View warehouses'), ('warehouses.create', 'Create warehouses'), ('warehouses.edit', 'Edit warehouses'),
  ('vendors.view', 'View vendors'), ('vendors.create', 'Create vendors'), ('vendors.edit', 'Edit vendors'),
  ('customers.view', 'View customers'), ('customers.create', 'Create customers'), ('customers.edit', 'Edit customers'),
  ('purchases.view', 'View purchase orders'), ('purchases.create', 'Create purchase orders'), ('purchases.edit', 'Edit purchase orders'),
  ('receipts.view', 'View goods receipts'), ('receipts.create', 'Create goods receipts'), ('receipts.post', 'Post goods receipts'),
  ('inventory.view', 'View stock and movements'), ('inventory.adjust', 'Adjust stock'),
  ('sales.view', 'View sales'), ('sales.create', 'Create sales'), ('sales.post', 'Post sales'),
  ('invoices.view', 'View invoices'), ('invoices.create', 'Create invoices'), ('invoices.post', 'Post invoices'),
  ('payments.view', 'View payments'), ('payments.create', 'Record payments'),
  ('reports.view', 'View reports'), ('users.manage', 'Manage users and roles'), ('settings.manage', 'Manage settings')
on conflict (permission_key) do nothing;

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.profiles where user_id = auth.uid() limit 1;
$$;

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_roles pr on pr.user_id = p.user_id
    join public.role_permissions rp on rp.role_id = pr.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where p.user_id = auth.uid()
      and pm.permission_key = required_permission
  );
$$;

create or replace function public.create_business_for_current_user(business_name text, user_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_business_id uuid;
  owner_role_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select business_id into new_business_id from public.profiles where user_id = current_user_id;
  if new_business_id is not null then
    return new_business_id;
  end if;

  insert into public.businesses (name) values (trim(business_name)) returning id into new_business_id;
  insert into public.roles (business_id, name, role_key) values (new_business_id, 'Owner', 'owner') returning id into owner_role_id;
  insert into public.profiles (user_id, business_id, full_name) values (current_user_id, new_business_id, nullif(trim(user_name), ''));
  insert into public.profile_roles (user_id, role_id) values (current_user_id, owner_role_id);
  insert into public.role_permissions (role_id, permission_id)
  select owner_role_id, id from public.permissions;

  return new_business_id;
end;
$$;

create or replace function public.post_goods_receipt(receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt public.goods_receipts%rowtype;
  receipt_line record;
  purchase_line public.purchase_order_lines%rowtype;
begin
  if auth.uid() is null or not public.has_permission('receipts.post') then
    raise exception 'Not authorized';
  end if;

  select * into receipt
  from public.goods_receipts
  where id = receipt_id and business_id = public.current_business_id()
  for update;

  if receipt.id is null then raise exception 'Goods receipt not found'; end if;
  if receipt.status <> 'draft' then raise exception 'Only draft receipts can be posted'; end if;

  for receipt_line in select * from public.goods_receipt_lines where goods_receipt_id = receipt.id loop
    select * into purchase_line
    from public.purchase_order_lines
    where id = receipt_line.purchase_order_line_id
    for update;

    if purchase_line.id is null or purchase_line.purchase_order_id <> receipt.purchase_order_id then
      raise exception 'Receipt line is not part of the purchase order';
    end if;
    if purchase_line.item_id <> receipt_line.item_id then
      raise exception 'Receipt item does not match the purchase order line';
    end if;
    if purchase_line.received_quantity + receipt_line.quantity > purchase_line.ordered_quantity then
      raise exception 'Received quantity exceeds ordered quantity';
    end if;

    update public.purchase_order_lines
    set received_quantity = received_quantity + receipt_line.quantity
    where id = purchase_line.id;

    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (receipt.business_id, receipt.warehouse_id, receipt_line.item_id, receipt_line.quantity)
    on conflict (business_id, warehouse_id, item_id) do update
    set quantity = public.stock_balances.quantity + excluded.quantity, updated_at = now();

    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (receipt.business_id, receipt.warehouse_id, receipt_line.item_id, receipt_line.quantity, 'receipt', 'goods_receipt', receipt.id, receipt_line.id, auth.uid());
  end loop;

  update public.goods_receipts
  set status = 'posted', posted_by = auth.uid(), posted_at = now()
  where id = receipt.id;

  update public.purchase_orders po
  set status = case
    when not exists (select 1 from public.purchase_order_lines pol where pol.purchase_order_id = po.id and pol.received_quantity < pol.ordered_quantity) then 'received'
    else 'partially_received'
  end
  where po.id = receipt.purchase_order_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id)
  values (receipt.business_id, auth.uid(), 'post', 'goods_receipt', receipt.id);
end;
$$;

grant execute on function public.create_business_for_current_user(text, text) to authenticated;
grant execute on function public.post_goods_receipt(uuid) to authenticated;

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profile_roles enable row level security;
alter table public.categories enable row level security;
alter table public.units enable row level security;
alter table public.items enable row level security;
alter table public.warehouses enable row level security;
alter table public.vendors enable row level security;
alter table public.customers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_lines enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_logs enable row level security;

create policy "business members can access businesses" on public.businesses for all to authenticated using (id = public.current_business_id()) with check (id = public.current_business_id());
create policy "users can access their profile" on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "business members can access roles" on public.roles for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "authenticated users can read permissions" on public.permissions for select to authenticated using (true);
create policy "business members can access role permissions" on public.role_permissions for all to authenticated using (exists (select 1 from public.roles r where r.id = role_id and r.business_id = public.current_business_id())) with check (exists (select 1 from public.roles r where r.id = role_id and r.business_id = public.current_business_id()));
create policy "business members can access profile roles" on public.profile_roles for all to authenticated using (exists (select 1 from public.profiles p join public.roles r on r.business_id = p.business_id where p.user_id = user_id and r.id = role_id and p.business_id = public.current_business_id())) with check (exists (select 1 from public.profiles p join public.roles r on r.business_id = p.business_id where p.user_id = user_id and r.id = role_id and p.business_id = public.current_business_id()));

create policy "business members can access categories" on public.categories for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access units" on public.units for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access items" on public.items for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access warehouses" on public.warehouses for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access vendors" on public.vendors for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access customers" on public.customers for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access purchase orders" on public.purchase_orders for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access purchase order lines" on public.purchase_order_lines for all to authenticated using (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and p.business_id = public.current_business_id())) with check (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and p.business_id = public.current_business_id()));
create policy "business members can access goods receipts" on public.goods_receipts for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can access goods receipt lines" on public.goods_receipt_lines for all to authenticated using (exists (select 1 from public.goods_receipts r where r.id = goods_receipt_id and r.business_id = public.current_business_id())) with check (exists (select 1 from public.goods_receipts r where r.id = goods_receipt_id and r.business_id = public.current_business_id()));
create policy "business members can access stock balances" on public.stock_balances for all to authenticated using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());
create policy "business members can read stock movements" on public.stock_movements for select to authenticated using (business_id = public.current_business_id());
create policy "business members can read audit logs" on public.audit_logs for select to authenticated using (business_id = public.current_business_id());
