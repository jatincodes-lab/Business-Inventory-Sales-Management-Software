insert into public.permissions (permission_key, description)
values ('inventory.transfer', 'Transfer stock between warehouses')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_key = 'owner' and p.permission_key = 'inventory.transfer'
on conflict do nothing;

create table public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  adjustment_number text not null,
  adjustment_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  reason text not null check (char_length(trim(reason)) between 1 and 120),
  notes text,
  created_by uuid not null references auth.users(id),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, adjustment_number)
);

create table public.inventory_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.inventory_adjustments(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity_delta numeric(18,3) not null check (quantity_delta <> 0),
  unique (adjustment_id, item_id)
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  destination_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  transfer_number text not null,
  transfer_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  notes text,
  created_by uuid not null references auth.users(id),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  check (source_warehouse_id <> destination_warehouse_id),
  unique (business_id, transfer_number)
);

create table public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  unique (transfer_id, item_id)
);

create index inventory_adjustments_business_status_idx on public.inventory_adjustments (business_id, status, created_at desc);
create index inventory_adjustment_lines_adjustment_idx on public.inventory_adjustment_lines (adjustment_id);
create index stock_transfers_business_status_idx on public.stock_transfers (business_id, status, created_at desc);
create index stock_transfer_lines_transfer_idx on public.stock_transfer_lines (transfer_id);

alter table public.inventory_adjustments enable row level security;
alter table public.inventory_adjustment_lines enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_lines enable row level security;

create policy "inventory adjusters can read adjustments"
  on public.inventory_adjustments for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('inventory.adjust'));
create policy "inventory adjusters can read adjustment lines"
  on public.inventory_adjustment_lines for select to authenticated
  using (exists (
    select 1 from public.inventory_adjustments a
    where a.id = adjustment_id and a.business_id = public.current_business_id()
      and public.has_permission('inventory.adjust')
  ));
create policy "inventory transfer users can read transfers"
  on public.stock_transfers for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('inventory.transfer'));
create policy "inventory transfer users can read transfer lines"
  on public.stock_transfer_lines for select to authenticated
  using (exists (
    select 1 from public.stock_transfers t
    where t.id = transfer_id and t.business_id = public.current_business_id()
      and public.has_permission('inventory.transfer')
  ));

create or replace function public.create_inventory_adjustment(
  warehouse_id uuid,
  adjustment_number text,
  adjustment_date date,
  reason text,
  notes text default null,
  lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  new_adjustment_id uuid;
begin
  if auth.uid() is null or not public.has_permission('inventory.adjust') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if adjustment_number is null or char_length(trim(adjustment_number)) < 1 or char_length(trim(adjustment_number)) > 40 or trim(adjustment_number) !~ '^[A-Za-z0-9/_-]+$' then raise exception 'Adjustment number is invalid'; end if;
  if adjustment_date is null then raise exception 'Adjustment date is required'; end if;
  if reason is null or char_length(trim(reason)) < 1 or char_length(trim(reason)) > 120 then raise exception 'Adjustment reason is invalid'; end if;
  if notes is not null and char_length(notes) > 1000 then raise exception 'Adjustment notes are too long'; end if;
  if not exists (select 1 from public.warehouses where id = warehouse_id and business_id = current_business and is_active) then raise exception 'Warehouse is not available in this workspace'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 200 then raise exception 'Add between 1 and 200 adjustment lines'; end if;
  if exists (
    select 1 from jsonb_to_recordset(lines) as line(item_id uuid, quantity_delta numeric)
    left join public.items i on i.id = line.item_id and i.business_id = current_business and i.is_active
    where i.id is null or line.quantity_delta is null or line.quantity_delta = 0
  ) then raise exception 'One or more adjustment lines are invalid'; end if;
  if (select count(*) from jsonb_to_recordset(lines) as line(item_id uuid)) <> (select count(distinct line.item_id) from jsonb_to_recordset(lines) as line(item_id uuid)) then raise exception 'An item can appear only once per adjustment'; end if;

  insert into public.inventory_adjustments (business_id, warehouse_id, adjustment_number, adjustment_date, reason, notes, created_by)
  values (current_business, warehouse_id, trim(adjustment_number), adjustment_date, trim(reason), nullif(trim(notes), ''), auth.uid())
  returning id into new_adjustment_id;
  insert into public.inventory_adjustment_lines (adjustment_id, item_id, quantity_delta)
  select new_adjustment_id, line.item_id, line.quantity_delta
  from jsonb_to_recordset(lines) as line(item_id uuid, quantity_delta numeric);
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'inventory_adjustment', new_adjustment_id, jsonb_build_object('adjustment_number', trim(adjustment_number)));
  return new_adjustment_id;
end;
$$;

create or replace function public.post_inventory_adjustment(adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  adjustment public.inventory_adjustments%rowtype;
  adjustment_line record;
  balance numeric;
begin
  if auth.uid() is null or not public.has_permission('inventory.adjust') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into adjustment from public.inventory_adjustments where id = adjustment_id and business_id = current_business for update;
  if adjustment.id is null then raise exception 'Inventory adjustment not found'; end if;
  if adjustment.status <> 'draft' then raise exception 'Only draft adjustments can be posted'; end if;
  if not exists (select 1 from public.warehouses where id = adjustment.warehouse_id and business_id = current_business and is_active) then raise exception 'Warehouse is no longer active'; end if;
  if not exists (select 1 from public.inventory_adjustment_lines where adjustment_id = adjustment.id) then raise exception 'Inventory adjustment must contain at least one line'; end if;

  for adjustment_line in select l.* from public.inventory_adjustment_lines l where l.adjustment_id = adjustment.id order by l.item_id loop
    if not exists (select 1 from public.items where id = adjustment_line.item_id and business_id = current_business and is_active) then raise exception 'Adjustment item is no longer active'; end if;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, adjustment.warehouse_id, adjustment_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select quantity into balance from public.stock_balances
    where business_id = current_business and warehouse_id = adjustment.warehouse_id and item_id = adjustment_line.item_id for update;
    if balance + adjustment_line.quantity_delta < 0 then raise exception 'Adjustment would make stock negative'; end if;
    update public.stock_balances set quantity = balance + adjustment_line.quantity_delta, updated_at = now()
    where business_id = current_business and warehouse_id = adjustment.warehouse_id and item_id = adjustment_line.item_id;
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, adjustment.warehouse_id, adjustment_line.item_id, adjustment_line.quantity_delta, 'adjustment', 'inventory_adjustment', adjustment.id, adjustment_line.id, auth.uid());
  end loop;
  update public.inventory_adjustments set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = adjustment.id and status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'post', 'inventory_adjustment', adjustment.id, jsonb_build_object('adjustment_number', adjustment.adjustment_number));
end;
$$;

create or replace function public.cancel_inventory_adjustment(adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('inventory.adjust') then raise exception 'Not authorized'; end if;
  update public.inventory_adjustments set status = 'cancelled'
  where id = adjustment_id and business_id = current_business and status = 'draft';
  if not found then raise exception 'Only draft adjustments can be cancelled'; end if;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id)
  values (current_business, auth.uid(), 'cancel', 'inventory_adjustment', adjustment_id);
end;
$$;

create or replace function public.create_stock_transfer(
  source_warehouse_id uuid,
  destination_warehouse_id uuid,
  transfer_number text,
  transfer_date date,
  notes text default null,
  lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  new_transfer_id uuid;
begin
  if auth.uid() is null or not public.has_permission('inventory.transfer') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if transfer_number is null or char_length(trim(transfer_number)) < 1 or char_length(trim(transfer_number)) > 40 or trim(transfer_number) !~ '^[A-Za-z0-9/_-]+$' then raise exception 'Transfer number is invalid'; end if;
  if transfer_date is null then raise exception 'Transfer date is required'; end if;
  if notes is not null and char_length(notes) > 1000 then raise exception 'Transfer notes are too long'; end if;
  if source_warehouse_id = destination_warehouse_id then raise exception 'Source and destination warehouses must be different'; end if;
  if not exists (select 1 from public.warehouses where id = source_warehouse_id and business_id = current_business and is_active) then raise exception 'Source warehouse is not available in this workspace'; end if;
  if not exists (select 1 from public.warehouses where id = destination_warehouse_id and business_id = current_business and is_active) then raise exception 'Destination warehouse is not available in this workspace'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 200 then raise exception 'Add between 1 and 200 transfer lines'; end if;
  if exists (
    select 1 from jsonb_to_recordset(lines) as line(item_id uuid, quantity numeric)
    left join public.items i on i.id = line.item_id and i.business_id = current_business and i.is_active
    where i.id is null or line.quantity is null or line.quantity <= 0
  ) then raise exception 'One or more transfer lines are invalid'; end if;
  if (select count(*) from jsonb_to_recordset(lines) as line(item_id uuid)) <> (select count(distinct line.item_id) from jsonb_to_recordset(lines) as line(item_id uuid)) then raise exception 'An item can appear only once per transfer'; end if;

  insert into public.stock_transfers (business_id, source_warehouse_id, destination_warehouse_id, transfer_number, transfer_date, notes, created_by)
  values (current_business, source_warehouse_id, destination_warehouse_id, trim(transfer_number), transfer_date, nullif(trim(notes), ''), auth.uid())
  returning id into new_transfer_id;
  insert into public.stock_transfer_lines (transfer_id, item_id, quantity)
  select new_transfer_id, line.item_id, line.quantity
  from jsonb_to_recordset(lines) as line(item_id uuid, quantity numeric);
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'stock_transfer', new_transfer_id, jsonb_build_object('transfer_number', trim(transfer_number)));
  return new_transfer_id;
end;
$$;

create or replace function public.post_stock_transfer(transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  transfer public.stock_transfers%rowtype;
  transfer_line record;
  source_quantity numeric;
  source_balance_id uuid;
  destination_balance_id uuid;
begin
  if auth.uid() is null or not public.has_permission('inventory.transfer') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into transfer from public.stock_transfers where id = transfer_id and business_id = current_business for update;
  if transfer.id is null then raise exception 'Stock transfer not found'; end if;
  if transfer.status <> 'draft' then raise exception 'Only draft transfers can be posted'; end if;
  if not exists (select 1 from public.warehouses where id = transfer.source_warehouse_id and business_id = current_business and is_active) then raise exception 'Source warehouse is no longer active'; end if;
  if not exists (select 1 from public.warehouses where id = transfer.destination_warehouse_id and business_id = current_business and is_active) then raise exception 'Destination warehouse is no longer active'; end if;
  if not exists (select 1 from public.stock_transfer_lines where transfer_id = transfer.id) then raise exception 'Stock transfer must contain at least one line'; end if;

  -- Lock warehouse rows in a stable order so opposite-direction transfers do not deadlock.
  perform 1 from public.warehouses where id in (transfer.source_warehouse_id, transfer.destination_warehouse_id) order by id for update;
  for transfer_line in select l.* from public.stock_transfer_lines l where l.transfer_id = transfer.id order by l.item_id loop
    if not exists (select 1 from public.items where id = transfer_line.item_id and business_id = current_business and is_active) then raise exception 'Transfer item is no longer active'; end if;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, transfer.source_warehouse_id, transfer_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, transfer.destination_warehouse_id, transfer_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select id, quantity into source_balance_id, source_quantity from public.stock_balances
    where business_id = current_business and warehouse_id = transfer.source_warehouse_id and item_id = transfer_line.item_id for update;
    select id into destination_balance_id from public.stock_balances
    where business_id = current_business and warehouse_id = transfer.destination_warehouse_id and item_id = transfer_line.item_id for update;
    if source_quantity < transfer_line.quantity then raise exception 'Insufficient stock in source warehouse'; end if;
    update public.stock_balances set quantity = source_quantity - transfer_line.quantity, updated_at = now() where id = source_balance_id;
    update public.stock_balances set quantity = quantity + transfer_line.quantity, updated_at = now() where id = destination_balance_id;
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, transfer.source_warehouse_id, transfer_line.item_id, -transfer_line.quantity, 'transfer_out', 'stock_transfer_out', transfer.id, transfer_line.id, auth.uid());
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, transfer.destination_warehouse_id, transfer_line.item_id, transfer_line.quantity, 'transfer_in', 'stock_transfer_in', transfer.id, transfer_line.id, auth.uid());
  end loop;
  update public.stock_transfers set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = transfer.id and status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'post', 'stock_transfer', transfer.id, jsonb_build_object('transfer_number', transfer.transfer_number));
end;
$$;

create or replace function public.cancel_stock_transfer(transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('inventory.transfer') then raise exception 'Not authorized'; end if;
  update public.stock_transfers set status = 'cancelled'
  where id = transfer_id and business_id = current_business and status = 'draft';
  if not found then raise exception 'Only draft transfers can be cancelled'; end if;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id)
  values (current_business, auth.uid(), 'cancel', 'stock_transfer', transfer_id);
end;
$$;

revoke execute on function public.create_inventory_adjustment(uuid, text, date, text, text, jsonb) from public;
grant execute on function public.create_inventory_adjustment(uuid, text, date, text, text, jsonb) to authenticated;
revoke execute on function public.post_inventory_adjustment(uuid) from public;
grant execute on function public.post_inventory_adjustment(uuid) to authenticated;
revoke execute on function public.cancel_inventory_adjustment(uuid) from public;
grant execute on function public.cancel_inventory_adjustment(uuid) to authenticated;
revoke execute on function public.create_stock_transfer(uuid, uuid, text, date, text, jsonb) from public;
grant execute on function public.create_stock_transfer(uuid, uuid, text, date, text, jsonb) to authenticated;
revoke execute on function public.post_stock_transfer(uuid) from public;
grant execute on function public.post_stock_transfer(uuid) to authenticated;
revoke execute on function public.cancel_stock_transfer(uuid) from public;
grant execute on function public.cancel_stock_transfer(uuid) to authenticated;
