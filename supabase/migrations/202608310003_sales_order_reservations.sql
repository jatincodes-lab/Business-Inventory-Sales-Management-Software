alter table public.stock_balances
  add column if not exists reserved_quantity numeric(18,3) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_balances_reserved_quantity_check'
      and conrelid = 'public.stock_balances'::regclass
  ) then
    alter table public.stock_balances
      add constraint stock_balances_reserved_quantity_check
      check (reserved_quantity >= 0 and reserved_quantity <= quantity);
  end if;
end;
$$;

create table public.sales_order_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  consumed_quantity numeric(18,3) not null default 0 check (consumed_quantity >= 0),
  released_quantity numeric(18,3) not null default 0 check (released_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (consumed_quantity + released_quantity <= quantity),
  unique (sales_order_line_id, warehouse_id)
);

create index sales_order_reservations_business_idx
  on public.sales_order_reservations (business_id, warehouse_id, updated_at desc);
create index sales_order_reservations_order_idx
  on public.sales_order_reservations (sales_order_id, sales_order_line_id);

alter table public.sales_order_reservations enable row level security;

create policy "sales viewers can read sales order reservations"
  on public.sales_order_reservations for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('sales.view'));

create or replace function public.ensure_sales_order_reservations(
  p_order_id uuid,
  p_preferred_warehouse_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  sales_order public.sales_orders%rowtype;
  order_line record;
  stock_position record;
  needed_quantity numeric;
  allocation numeric;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;

  select * into sales_order
  from public.sales_orders so
  where so.id = p_order_id and so.business_id = current_business
  for update;

  if sales_order.id is null then raise exception 'Sales order not found'; end if;
  if sales_order.status not in ('submitted', 'partially_fulfilled') then
    raise exception 'Only submitted sales orders can reserve stock';
  end if;
  if p_preferred_warehouse_id is not null and not exists (
    select 1 from public.warehouses w
    where w.id = p_preferred_warehouse_id
      and w.business_id = current_business
      and w.is_active
  ) then
    raise exception 'Warehouse is not available in this workspace';
  end if;

  for order_line in
    select
      sol.id,
      sol.item_id,
      greatest(
        sol.ordered_quantity - sol.fulfilled_quantity - coalesce((
          select sum(sor.quantity - sor.consumed_quantity - sor.released_quantity)
          from public.sales_order_reservations sor
          where sor.sales_order_line_id = sol.id
        ), 0),
        0
      ) as needed_quantity
    from public.sales_order_lines sol
    where sol.sales_order_id = sales_order.id
    order by sol.item_id, sol.id
  loop
    needed_quantity := order_line.needed_quantity;
    if needed_quantity <= 0 then continue; end if;

    for stock_position in
      select sb.id, sb.warehouse_id, sb.quantity, sb.reserved_quantity
      from public.stock_balances sb
      join public.warehouses w on w.id = sb.warehouse_id
      where sb.business_id = current_business
        and sb.item_id = order_line.item_id
        and w.business_id = current_business
        and w.is_active
        and sb.quantity > sb.reserved_quantity
      order by
        case when sb.warehouse_id = p_preferred_warehouse_id then 0 else 1 end,
        sb.warehouse_id
      for update of sb
    loop
      allocation := least(needed_quantity, stock_position.quantity - stock_position.reserved_quantity);
      if allocation <= 0 then continue; end if;

      update public.stock_balances sb
      set reserved_quantity = sb.reserved_quantity + allocation,
          updated_at = now()
      where sb.id = stock_position.id;

      insert into public.sales_order_reservations (
        business_id, sales_order_id, sales_order_line_id, warehouse_id, quantity
      )
      values (
        current_business, sales_order.id, order_line.id, stock_position.warehouse_id, allocation
      )
      on conflict (sales_order_line_id, warehouse_id)
      do update set quantity = public.sales_order_reservations.quantity + excluded.quantity,
                    updated_at = now();

      needed_quantity := needed_quantity - allocation;
      if needed_quantity <= 0 then exit; end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.submit_sales_order(order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  sales_order public.sales_orders%rowtype;
begin
  if auth.uid() is null or not public.has_permission('sales.edit') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into sales_order from public.sales_orders so where so.id = order_id and so.business_id = current_business for update;
  if sales_order.id is null then raise exception 'Sales order not found'; end if;
  if sales_order.status <> 'draft' then raise exception 'Only draft sales orders can be submitted'; end if;
  if not exists (select 1 from public.customers c where c.id = sales_order.customer_id and c.business_id = current_business and c.is_active) then raise exception 'Customer is no longer active'; end if;
  if not exists (select 1 from public.sales_order_lines sol where sol.sales_order_id = sales_order.id) then raise exception 'Sales order must contain at least one line'; end if;
  if exists (select 1 from public.sales_order_lines sol left join public.items i on i.id = sol.item_id and i.business_id = current_business and i.is_active where sol.sales_order_id = sales_order.id and i.id is null) then raise exception 'One or more items are no longer active'; end if;
  if exists (select 1 from public.sales_order_lines sol where sol.sales_order_id = sales_order.id and (sol.ordered_quantity <= 0 or sol.fulfilled_quantity < 0 or sol.fulfilled_quantity > sol.ordered_quantity or sol.unit_price < 0 or sol.tax_rate < 0 or sol.tax_rate > 100)) then raise exception 'Sales order contains invalid lines'; end if;

  update public.sales_orders
  set status = 'submitted', submitted_at = now()
  where id = sales_order.id and status = 'draft';

  perform public.ensure_sales_order_reservations(sales_order.id);

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    current_business,
    auth.uid(),
    'submit',
    'sales_order',
    sales_order.id,
    jsonb_build_object('order_number', sales_order.order_number)
  );
  return sales_order.id;
end;
$$;

create or replace function public.cancel_sales_order(order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  sales_order public.sales_orders%rowtype;
  reservation record;
  balance_reserved numeric;
  active_quantity numeric;
begin
  if auth.uid() is null or not public.has_permission('sales.edit') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into sales_order from public.sales_orders so where so.id = order_id and so.business_id = current_business for update;
  if sales_order.id is null then raise exception 'Sales order not found'; end if;
  if sales_order.status not in ('draft', 'submitted') then raise exception 'Only draft or submitted sales orders can be cancelled'; end if;
  if exists (select 1 from public.sales_order_lines sol where sol.sales_order_id = sales_order.id and sol.fulfilled_quantity > 0) then raise exception 'A fulfilled sales order cannot be cancelled'; end if;
  if exists (select 1 from public.sales_fulfillments sf where sf.sales_order_id = sales_order.id and sf.status = 'draft') then raise exception 'Cancel the draft fulfillment before cancelling this sales order'; end if;

  for reservation in
    select sor.*
    from public.sales_order_reservations sor
    where sor.sales_order_id = sales_order.id
      and sor.quantity - sor.consumed_quantity - sor.released_quantity > 0
    order by sor.warehouse_id, sor.id
    for update
  loop
    active_quantity := reservation.quantity - reservation.consumed_quantity - reservation.released_quantity;
    select sb.reserved_quantity into balance_reserved
    from public.stock_balances sb
    where sb.business_id = current_business
      and sb.warehouse_id = reservation.warehouse_id
      and sb.item_id = (select sol.item_id from public.sales_order_lines sol where sol.id = reservation.sales_order_line_id)
    for update;
    if balance_reserved is null or balance_reserved < active_quantity then
      raise exception 'Stock reservation is inconsistent; contact an administrator';
    end if;
    update public.stock_balances sb
    set reserved_quantity = sb.reserved_quantity - active_quantity,
        updated_at = now()
    where sb.business_id = current_business
      and sb.warehouse_id = reservation.warehouse_id
      and sb.item_id = (select sol.item_id from public.sales_order_lines sol where sol.id = reservation.sales_order_line_id);
    update public.sales_order_reservations sor
    set released_quantity = sor.released_quantity + active_quantity,
        updated_at = now()
    where sor.id = reservation.id;
  end loop;

  update public.sales_orders
  set status = 'cancelled', cancelled_at = now()
  where id = sales_order.id and status in ('draft', 'submitted');
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'cancel', 'sales_order', sales_order.id, jsonb_build_object('order_number', sales_order.order_number));
end;
$$;

create or replace function public.create_sales_fulfillment(
  sales_order_id uuid,
  warehouse_id uuid,
  fulfillment_number text,
  fulfillment_date date,
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
  sales_order public.sales_orders%rowtype;
  new_fulfillment_id uuid;
begin
  if auth.uid() is null or not public.has_permission('sales.create') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if fulfillment_number is null or char_length(trim(fulfillment_number)) < 1 or char_length(trim(fulfillment_number)) > 40 or trim(fulfillment_number) !~ '^[A-Za-z0-9/_-]+$' then raise exception 'Fulfillment number is invalid'; end if;
  if fulfillment_date is null then raise exception 'Fulfillment date is required'; end if;
  if notes is not null and char_length(notes) > 1000 then raise exception 'Fulfillment notes are too long'; end if;
  select * into sales_order from public.sales_orders so where so.id = sales_order_id and so.business_id = current_business for update;
  if sales_order.id is null then raise exception 'Sales order not found'; end if;
  if sales_order.status not in ('submitted', 'partially_fulfilled') then raise exception 'Only submitted sales orders can be fulfilled'; end if;
  if fulfillment_date < sales_order.order_date then raise exception 'Fulfillment date cannot be before the sales order date'; end if;
  if not exists (select 1 from public.warehouses w where w.id = warehouse_id and w.business_id = current_business and w.is_active) then raise exception 'Warehouse is not available in this workspace'; end if;
  if exists (select 1 from public.sales_fulfillments sf where sf.sales_order_id = sales_order.id and sf.status = 'draft') then raise exception 'A draft fulfillment already exists for this sales order'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 200 then raise exception 'Add between 1 and 200 fulfillment lines'; end if;

  perform public.ensure_sales_order_reservations(sales_order.id, warehouse_id);

  if exists (
    select 1
    from jsonb_to_recordset(lines) as line(sales_order_line_id uuid, item_id uuid, quantity numeric)
    left join public.sales_order_lines sol on sol.id = line.sales_order_line_id and sol.sales_order_id = sales_order.id
    where sol.id is null
      or line.item_id is null
      or line.item_id <> sol.item_id
      or line.quantity is null
      or line.quantity <= 0
      or line.quantity > sol.ordered_quantity - sol.fulfilled_quantity
      or line.quantity > coalesce((
        select sum(sor.quantity - sor.consumed_quantity - sor.released_quantity)
        from public.sales_order_reservations sor
        where sor.sales_order_line_id = sol.id
          and sor.warehouse_id = warehouse_id
      ), 0)
  ) then raise exception 'One or more fulfillment lines exceed the stock reserved in the selected warehouse'; end if;
  if (select count(*) from jsonb_to_recordset(lines) as line(sales_order_line_id uuid)) <> (select count(distinct line.sales_order_line_id) from jsonb_to_recordset(lines) as line(sales_order_line_id uuid)) then raise exception 'A sales order line can appear only once per fulfillment'; end if;

  insert into public.sales_fulfillments (business_id, sales_order_id, warehouse_id, fulfillment_number, fulfillment_date, notes, created_by)
  values (current_business, sales_order.id, warehouse_id, trim(fulfillment_number), fulfillment_date, nullif(trim(notes), ''), auth.uid())
  returning id into new_fulfillment_id;
  insert into public.sales_fulfillment_lines (fulfillment_id, sales_order_line_id, item_id, quantity)
  select new_fulfillment_id, line.sales_order_line_id, line.item_id, line.quantity
  from jsonb_to_recordset(lines) as line(sales_order_line_id uuid, item_id uuid, quantity numeric);
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'sales_fulfillment', new_fulfillment_id, jsonb_build_object('fulfillment_number', trim(fulfillment_number), 'sales_order_id', sales_order.id));
  return new_fulfillment_id;
end;
$$;

create or replace function public.post_sales_fulfillment(fulfillment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  fulfillment public.sales_fulfillments%rowtype;
  sales_order public.sales_orders%rowtype;
  fulfillment_line record;
  sales_order_line public.sales_order_lines%rowtype;
  reservation record;
  stock_quantity numeric;
  stock_reserved_quantity numeric;
  remaining_to_consume numeric;
  consume_quantity numeric;
begin
  if auth.uid() is null or not public.has_permission('sales.post') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into fulfillment from public.sales_fulfillments sf where sf.id = fulfillment_id and sf.business_id = current_business for update;
  if fulfillment.id is null then raise exception 'Sales fulfillment not found'; end if;
  if fulfillment.status <> 'draft' then raise exception 'Only draft fulfillments can be posted'; end if;
  if not exists (select 1 from public.warehouses w where w.id = fulfillment.warehouse_id and w.business_id = current_business and w.is_active) then raise exception 'Warehouse is no longer active'; end if;
  select * into sales_order from public.sales_orders so where so.id = fulfillment.sales_order_id and so.business_id = current_business for update;
  if sales_order.id is null then raise exception 'Sales order not found'; end if;
  if sales_order.status not in ('submitted', 'partially_fulfilled') then raise exception 'This sales order is no longer available for fulfillment'; end if;
  if not exists (select 1 from public.sales_fulfillment_lines sfl where sfl.fulfillment_id = fulfillment.id) then raise exception 'Sales fulfillment must contain at least one line'; end if;
  if (select count(*) from public.sales_fulfillment_lines sfl where sfl.fulfillment_id = fulfillment.id) <> (select count(distinct sfl.sales_order_line_id) from public.sales_fulfillment_lines sfl where sfl.fulfillment_id = fulfillment.id) then raise exception 'A sales order line can appear only once per fulfillment'; end if;

  perform public.ensure_sales_order_reservations(sales_order.id, fulfillment.warehouse_id);

  for fulfillment_line in select sfl.* from public.sales_fulfillment_lines sfl where sfl.fulfillment_id = fulfillment.id order by sfl.sales_order_line_id loop
    select * into sales_order_line from public.sales_order_lines sol where sol.id = fulfillment_line.sales_order_line_id and sol.sales_order_id = sales_order.id for update;
    if sales_order_line.id is null then raise exception 'Fulfillment line is not part of the sales order'; end if;
    if sales_order_line.item_id <> fulfillment_line.item_id then raise exception 'Fulfillment item does not match the sales order line'; end if;
    if not exists (select 1 from public.items i where i.id = fulfillment_line.item_id and i.business_id = current_business and i.is_active) then raise exception 'Fulfillment item is no longer active'; end if;
    if fulfillment_line.quantity is null or fulfillment_line.quantity <= 0 or sales_order_line.fulfilled_quantity + fulfillment_line.quantity > sales_order_line.ordered_quantity then raise exception 'Fulfillment quantity exceeds the remaining quantity'; end if;

    remaining_to_consume := fulfillment_line.quantity;
    for reservation in
      select sor.*
      from public.sales_order_reservations sor
      where sor.sales_order_line_id = sales_order_line.id
        and sor.warehouse_id = fulfillment.warehouse_id
        and sor.quantity - sor.consumed_quantity - sor.released_quantity > 0
      order by sor.id
      for update
    loop
      consume_quantity := least(remaining_to_consume, reservation.quantity - reservation.consumed_quantity - reservation.released_quantity);
      update public.sales_order_reservations sor
      set consumed_quantity = sor.consumed_quantity + consume_quantity,
          updated_at = now()
      where sor.id = reservation.id;
      remaining_to_consume := remaining_to_consume - consume_quantity;
      if remaining_to_consume <= 0 then exit; end if;
    end loop;
    if remaining_to_consume > 0 then raise exception 'Insufficient reserved stock in warehouse'; end if;

    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, fulfillment.warehouse_id, fulfillment_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select sb.quantity, sb.reserved_quantity into stock_quantity, stock_reserved_quantity
    from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = fulfillment.warehouse_id and sb.item_id = fulfillment_line.item_id
    for update;
    if stock_quantity < fulfillment_line.quantity or stock_reserved_quantity < fulfillment_line.quantity then raise exception 'Insufficient reserved stock in warehouse'; end if;
    update public.stock_balances sb
    set quantity = sb.quantity - fulfillment_line.quantity,
        reserved_quantity = sb.reserved_quantity - fulfillment_line.quantity,
        updated_at = now()
    where sb.business_id = current_business and sb.warehouse_id = fulfillment.warehouse_id and sb.item_id = fulfillment_line.item_id;
    update public.sales_order_lines sol set fulfilled_quantity = sol.fulfilled_quantity + fulfillment_line.quantity where sol.id = sales_order_line.id;
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, fulfillment.warehouse_id, fulfillment_line.item_id, -fulfillment_line.quantity, 'sale', 'sales_fulfillment', fulfillment.id, fulfillment_line.id, auth.uid());
  end loop;
  update public.sales_fulfillments sf set status = 'posted', posted_by = auth.uid(), posted_at = now() where sf.id = fulfillment.id and sf.status = 'draft';
  update public.sales_orders so set status = case when not exists (select 1 from public.sales_order_lines sol where sol.sales_order_id = so.id and sol.fulfilled_quantity < sol.ordered_quantity) then 'fulfilled' else 'partially_fulfilled' end, fulfilled_at = case when not exists (select 1 from public.sales_order_lines sol where sol.sales_order_id = so.id and sol.fulfilled_quantity < sol.ordered_quantity) then now() else null end where so.id = sales_order.id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'post', 'sales_fulfillment', fulfillment.id, jsonb_build_object('fulfillment_number', fulfillment.fulfillment_number, 'sales_order_id', sales_order.id));
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
  reserved_balance numeric;
begin
  if auth.uid() is null or not public.has_permission('inventory.adjust') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into adjustment from public.inventory_adjustments a where a.id = adjustment_id and a.business_id = current_business for update;
  if adjustment.id is null then raise exception 'Inventory adjustment not found'; end if;
  if adjustment.status <> 'draft' then raise exception 'Only draft adjustments can be posted'; end if;
  if not exists (select 1 from public.warehouses w where w.id = adjustment.warehouse_id and w.business_id = current_business and w.is_active) then raise exception 'Warehouse is no longer active'; end if;
  if not exists (select 1 from public.inventory_adjustment_lines l where l.adjustment_id = adjustment.id) then raise exception 'Inventory adjustment must contain at least one line'; end if;

  for adjustment_line in select l.* from public.inventory_adjustment_lines l where l.adjustment_id = adjustment.id order by l.item_id loop
    if not exists (select 1 from public.items i where i.id = adjustment_line.item_id and i.business_id = current_business and i.is_active) then raise exception 'Adjustment item is no longer active'; end if;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, adjustment.warehouse_id, adjustment_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select sb.quantity, sb.reserved_quantity into balance, reserved_balance from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = adjustment.warehouse_id and sb.item_id = adjustment_line.item_id for update;
    if balance + adjustment_line.quantity_delta < 0 then raise exception 'Adjustment would make stock negative'; end if;
    if balance + adjustment_line.quantity_delta < reserved_balance then raise exception 'Adjustment would reduce stock below its reserved quantity'; end if;
    update public.stock_balances sb set quantity = balance + adjustment_line.quantity_delta, updated_at = now()
    where sb.business_id = current_business and sb.warehouse_id = adjustment.warehouse_id and sb.item_id = adjustment_line.item_id;
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, adjustment.warehouse_id, adjustment_line.item_id, adjustment_line.quantity_delta, 'adjustment', 'inventory_adjustment', adjustment.id, adjustment_line.id, auth.uid());
  end loop;
  update public.inventory_adjustments a set status = 'posted', posted_by = auth.uid(), posted_at = now() where a.id = adjustment.id and a.status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'post', 'inventory_adjustment', adjustment.id, jsonb_build_object('adjustment_number', adjustment.adjustment_number));
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
  source_reserved_quantity numeric;
  source_balance_id uuid;
  destination_balance_id uuid;
begin
  if auth.uid() is null or not public.has_permission('inventory.transfer') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into transfer from public.stock_transfers t where t.id = transfer_id and t.business_id = current_business for update;
  if transfer.id is null then raise exception 'Stock transfer not found'; end if;
  if transfer.status <> 'draft' then raise exception 'Only draft transfers can be posted'; end if;
  if not exists (select 1 from public.warehouses w where w.id = transfer.source_warehouse_id and w.business_id = current_business and w.is_active) then raise exception 'Source warehouse is no longer active'; end if;
  if not exists (select 1 from public.warehouses w where w.id = transfer.destination_warehouse_id and w.business_id = current_business and w.is_active) then raise exception 'Destination warehouse is no longer active'; end if;
  if not exists (select 1 from public.stock_transfer_lines l where l.transfer_id = transfer.id) then raise exception 'Stock transfer must contain at least one line'; end if;

  perform 1 from public.warehouses w where w.id in (transfer.source_warehouse_id, transfer.destination_warehouse_id) order by w.id for update;
  for transfer_line in select l.* from public.stock_transfer_lines l where l.transfer_id = transfer.id order by l.item_id loop
    if not exists (select 1 from public.items i where i.id = transfer_line.item_id and i.business_id = current_business and i.is_active) then raise exception 'Transfer item is no longer active'; end if;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, transfer.source_warehouse_id, transfer_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, transfer.destination_warehouse_id, transfer_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select sb.id, sb.quantity, sb.reserved_quantity into source_balance_id, source_quantity, source_reserved_quantity from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = transfer.source_warehouse_id and sb.item_id = transfer_line.item_id for update;
    select sb.id into destination_balance_id from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = transfer.destination_warehouse_id and sb.item_id = transfer_line.item_id for update;
    if source_quantity < transfer_line.quantity then raise exception 'Insufficient stock in source warehouse'; end if;
    if source_quantity - transfer_line.quantity < source_reserved_quantity then raise exception 'Transfer would move stock reserved for sales orders'; end if;
    update public.stock_balances sb set quantity = source_quantity - transfer_line.quantity, updated_at = now() where sb.id = source_balance_id;
    update public.stock_balances sb set quantity = sb.quantity + transfer_line.quantity, updated_at = now() where sb.id = destination_balance_id;
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, transfer.source_warehouse_id, transfer_line.item_id, -transfer_line.quantity, 'transfer_out', 'stock_transfer_out', transfer.id, transfer_line.id, auth.uid());
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, transfer.destination_warehouse_id, transfer_line.item_id, transfer_line.quantity, 'transfer_in', 'stock_transfer_in', transfer.id, transfer_line.id, auth.uid());
  end loop;
  update public.stock_transfers t set status = 'posted', posted_by = auth.uid(), posted_at = now() where t.id = transfer.id and t.status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'post', 'stock_transfer', transfer.id, jsonb_build_object('transfer_number', transfer.transfer_number));
end;
$$;

revoke execute on function public.ensure_sales_order_reservations(uuid, uuid) from public, authenticated;
revoke execute on function public.submit_sales_order(uuid) from public;
grant execute on function public.submit_sales_order(uuid) to authenticated;
revoke execute on function public.cancel_sales_order(uuid) from public;
grant execute on function public.cancel_sales_order(uuid) to authenticated;
revoke execute on function public.create_sales_fulfillment(uuid, uuid, text, date, text, jsonb) from public;
grant execute on function public.create_sales_fulfillment(uuid, uuid, text, date, text, jsonb) to authenticated;
revoke execute on function public.post_sales_fulfillment(uuid) from public;
grant execute on function public.post_sales_fulfillment(uuid) to authenticated;
revoke execute on function public.post_inventory_adjustment(uuid) from public;
grant execute on function public.post_inventory_adjustment(uuid) to authenticated;
revoke execute on function public.post_stock_transfer(uuid) from public;
grant execute on function public.post_stock_transfer(uuid) to authenticated;
