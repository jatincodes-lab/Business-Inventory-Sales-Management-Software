insert into public.permissions (permission_key, description) values ('sales.edit', 'Edit sales') on conflict (permission_key) do nothing;

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_number text not null,
  order_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'partially_fulfilled', 'fulfilled', 'cancelled')),
  notes text,
  created_by uuid not null references auth.users(id),
  submitted_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, order_number)
);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  ordered_quantity numeric(18,3) not null check (ordered_quantity > 0),
  fulfilled_quantity numeric(18,3) not null default 0 check (fulfilled_quantity >= 0 and fulfilled_quantity <= ordered_quantity),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  unique (sales_order_id, item_id)
);

create table public.sales_fulfillments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  fulfillment_number text not null,
  fulfillment_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  notes text,
  created_by uuid not null references auth.users(id),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, fulfillment_number)
);

create table public.sales_fulfillment_lines (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.sales_fulfillments(id) on delete cascade,
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  unique (fulfillment_id, sales_order_line_id)
);

create index sales_orders_business_status_idx on public.sales_orders (business_id, status, created_at desc);
create index sales_order_lines_order_idx on public.sales_order_lines (sales_order_id);
create index sales_fulfillments_business_status_idx on public.sales_fulfillments (business_id, status, created_at desc);
create index sales_fulfillments_order_idx on public.sales_fulfillments (sales_order_id, created_at desc);
create index sales_fulfillment_lines_fulfillment_idx on public.sales_fulfillment_lines (fulfillment_id);

alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.sales_fulfillments enable row level security;
alter table public.sales_fulfillment_lines enable row level security;

create policy "sales viewers can read sales orders"
  on public.sales_orders for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('sales.view'));
create policy "sales viewers can read sales order lines"
  on public.sales_order_lines for select to authenticated
  using (exists (
    select 1 from public.sales_orders so
    where so.id = sales_order_id and so.business_id = public.current_business_id()
      and public.has_permission('sales.view')
  ));
create policy "sales viewers can read fulfillments"
  on public.sales_fulfillments for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('sales.view'));
create policy "sales viewers can read fulfillment lines"
  on public.sales_fulfillment_lines for select to authenticated
  using (exists (
    select 1 from public.sales_fulfillments sf
    where sf.id = fulfillment_id and sf.business_id = public.current_business_id()
      and public.has_permission('sales.view')
  ));

create or replace function public.create_sales_order(
  customer_id uuid,
  order_number text,
  order_date date,
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
  new_order_id uuid;
begin
  if auth.uid() is null or not public.has_permission('sales.create') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if order_number is null or char_length(trim(order_number)) < 1 or char_length(trim(order_number)) > 40 or trim(order_number) !~ '^[A-Za-z0-9/_-]+$' then raise exception 'Sales order number is invalid'; end if;
  if order_date is null then raise exception 'Sales order date is required'; end if;
  if notes is not null and char_length(notes) > 1000 then raise exception 'Sales order notes are too long'; end if;
  if not exists (select 1 from public.customers c where c.id = customer_id and c.business_id = current_business and c.is_active) then raise exception 'Customer is not available in this workspace'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 200 then raise exception 'Add between 1 and 200 sales order lines'; end if;
  if exists (
    select 1 from jsonb_to_recordset(lines) as line(item_id uuid, ordered_quantity numeric, unit_price numeric, tax_rate numeric)
    where line.item_id is null or line.ordered_quantity is null or line.ordered_quantity <= 0
      or line.unit_price is null or line.unit_price < 0
      or line.tax_rate is null or line.tax_rate < 0 or line.tax_rate > 100
  ) then raise exception 'One or more sales order lines are invalid'; end if;
  if (select count(*) from jsonb_to_recordset(lines) as line(item_id uuid)) <> (select count(distinct line.item_id) from jsonb_to_recordset(lines) as line(item_id uuid)) then raise exception 'An item can appear only once per sales order'; end if;
  if exists (
    select 1 from jsonb_to_recordset(lines) as line(item_id uuid)
    left join public.items i on i.id = line.item_id and i.business_id = current_business and i.is_active
    where i.id is null
  ) then raise exception 'One or more items are not available in this workspace'; end if;

  insert into public.sales_orders (business_id, customer_id, order_number, order_date, notes, created_by)
  values (current_business, customer_id, trim(order_number), order_date, nullif(trim(notes), ''), auth.uid())
  returning id into new_order_id;
  insert into public.sales_order_lines (sales_order_id, item_id, ordered_quantity, unit_price, tax_rate)
  select new_order_id, line.item_id, line.ordered_quantity, line.unit_price, line.tax_rate
  from jsonb_to_recordset(lines) as line(item_id uuid, ordered_quantity numeric, unit_price numeric, tax_rate numeric);
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'sales_order', new_order_id, jsonb_build_object('order_number', trim(order_number)));
  return new_order_id;
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
  update public.sales_orders set status = 'submitted', submitted_at = now() where id = sales_order.id and status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'submit', 'sales_order', sales_order.id, jsonb_build_object('order_number', sales_order.order_number));
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
begin
  if auth.uid() is null or not public.has_permission('sales.edit') then raise exception 'Not authorized'; end if;
  select * into sales_order from public.sales_orders so where so.id = order_id and so.business_id = current_business for update;
  if sales_order.id is null then raise exception 'Sales order not found'; end if;
  if sales_order.status not in ('draft', 'submitted') then raise exception 'Only draft or submitted sales orders can be cancelled'; end if;
  if exists (select 1 from public.sales_order_lines sol where sol.sales_order_id = sales_order.id and sol.fulfilled_quantity > 0) then raise exception 'A fulfilled sales order cannot be cancelled'; end if;
  update public.sales_orders set status = 'cancelled', cancelled_at = now() where id = sales_order.id and status in ('draft', 'submitted');
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
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 200 then raise exception 'Add between 1 and 200 fulfillment lines'; end if;
  if exists (
    select 1 from jsonb_to_recordset(lines) as line(sales_order_line_id uuid, item_id uuid, quantity numeric)
    left join public.sales_order_lines sol on sol.id = line.sales_order_line_id and sol.sales_order_id = sales_order.id
    where sol.id is null or line.item_id is null or line.item_id <> sol.item_id or line.quantity is null or line.quantity <= 0 or line.quantity > sol.ordered_quantity - sol.fulfilled_quantity
  ) then raise exception 'One or more fulfillment lines are invalid or exceed the remaining quantity'; end if;
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
  stock_quantity numeric;
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

  for fulfillment_line in select sfl.* from public.sales_fulfillment_lines sfl where sfl.fulfillment_id = fulfillment.id order by sfl.sales_order_line_id loop
    select * into sales_order_line from public.sales_order_lines sol where sol.id = fulfillment_line.sales_order_line_id and sol.sales_order_id = sales_order.id for update;
    if sales_order_line.id is null then raise exception 'Fulfillment line is not part of the sales order'; end if;
    if sales_order_line.item_id <> fulfillment_line.item_id then raise exception 'Fulfillment item does not match the sales order line'; end if;
    if not exists (select 1 from public.items i where i.id = fulfillment_line.item_id and i.business_id = current_business and i.is_active) then raise exception 'Fulfillment item is no longer active'; end if;
    if fulfillment_line.quantity is null or fulfillment_line.quantity <= 0 or sales_order_line.fulfilled_quantity + fulfillment_line.quantity > sales_order_line.ordered_quantity then raise exception 'Fulfillment quantity exceeds the remaining quantity'; end if;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, fulfillment.warehouse_id, fulfillment_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select sb.quantity into stock_quantity from public.stock_balances sb where sb.business_id = current_business and sb.warehouse_id = fulfillment.warehouse_id and sb.item_id = fulfillment_line.item_id for update;
    if stock_quantity < fulfillment_line.quantity then raise exception 'Insufficient stock in warehouse'; end if;
    update public.stock_balances sb set quantity = stock_quantity - fulfillment_line.quantity, updated_at = now() where sb.business_id = current_business and sb.warehouse_id = fulfillment.warehouse_id and sb.item_id = fulfillment_line.item_id;
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

create or replace function public.cancel_sales_fulfillment(fulfillment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('sales.edit') then raise exception 'Not authorized'; end if;
  update public.sales_fulfillments sf set status = 'cancelled' where sf.id = fulfillment_id and sf.business_id = current_business and sf.status = 'draft';
  if not found then raise exception 'Only draft fulfillments can be cancelled'; end if;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id)
  values (current_business, auth.uid(), 'cancel', 'sales_fulfillment', fulfillment_id);
end;
$$;

revoke execute on function public.create_sales_order(uuid, text, date, text, jsonb) from public;
grant execute on function public.create_sales_order(uuid, text, date, text, jsonb) to authenticated;
revoke execute on function public.submit_sales_order(uuid) from public;
grant execute on function public.submit_sales_order(uuid) to authenticated;
revoke execute on function public.cancel_sales_order(uuid) from public;
grant execute on function public.cancel_sales_order(uuid) to authenticated;
revoke execute on function public.create_sales_fulfillment(uuid, uuid, text, date, text, jsonb) from public;
grant execute on function public.create_sales_fulfillment(uuid, uuid, text, date, text, jsonb) to authenticated;
revoke execute on function public.post_sales_fulfillment(uuid) from public;
grant execute on function public.post_sales_fulfillment(uuid) to authenticated;
revoke execute on function public.cancel_sales_fulfillment(uuid) from public;
grant execute on function public.cancel_sales_fulfillment(uuid) to authenticated;
