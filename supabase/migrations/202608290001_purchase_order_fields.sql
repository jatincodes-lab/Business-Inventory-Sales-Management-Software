alter table public.purchase_orders
  add column reference text,
  add column delivery_date date,
  add column delivery_address text,
  add column payment_terms_days integer not null default 0,
  add column shipment_preference text;

alter table public.purchase_orders
  add constraint purchase_orders_reference_length
    check (reference is null or char_length(trim(reference)) between 1 and 80),
  add constraint purchase_orders_delivery_address_length
    check (delivery_address is null or char_length(trim(delivery_address)) <= 500),
  add constraint purchase_orders_payment_terms_days_range
    check (payment_terms_days between 0 and 3650),
  add constraint purchase_orders_shipment_preference_length
    check (shipment_preference is null or char_length(trim(shipment_preference)) between 1 and 80);

create or replace function public.create_purchase_order(
  order_number text,
  vendor_id uuid,
  order_date date,
  delivery_date date default null,
  reference text default null,
  delivery_address text default null,
  payment_terms_days integer default 0,
  shipment_preference text default null,
  notes text default null,
  lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business_id uuid := public.current_business_id();
  new_order_id uuid;
begin
  if auth.uid() is null or not public.has_permission('purchases.create') then
    raise exception 'Not authorized';
  end if;
  if current_business_id is null then
    raise exception 'Workspace not found';
  end if;
  if char_length(trim(order_number)) < 1 or char_length(trim(order_number)) > 40 then
    raise exception 'Purchase order number must be between 1 and 40 characters';
  end if;
  if not exists (select 1 from public.vendors where id = vendor_id and business_id = current_business_id and is_active) then
    raise exception 'Vendor is not available in this workspace';
  end if;
  if delivery_date is not null and delivery_date < order_date then
    raise exception 'Delivery date cannot be before the order date';
  end if;
  if payment_terms_days < 0 or payment_terms_days > 3650 then
    raise exception 'Payment terms are outside the allowed range';
  end if;
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 200 then
    raise exception 'Add between 1 and 200 purchase order lines';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(lines) as line(item_id uuid, ordered_quantity numeric, unit_cost numeric, tax_rate numeric)
    where line.item_id is null or line.ordered_quantity is null or line.ordered_quantity <= 0
      or line.unit_cost is null or line.unit_cost < 0
      or line.tax_rate is null or line.tax_rate < 0 or line.tax_rate > 100
  ) then
    raise exception 'One or more purchase order lines are invalid';
  end if;
  if (select count(*) from jsonb_to_recordset(lines) as line(item_id uuid))
     <> (select count(distinct line.item_id) from jsonb_to_recordset(lines) as line(item_id uuid)) then
    raise exception 'An item can appear only once per purchase order';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(lines) as line(item_id uuid)
    left join public.items i on i.id = line.item_id and i.business_id = current_business_id and i.is_active
    where i.id is null
  ) then
    raise exception 'One or more items are not available in this workspace';
  end if;

  insert into public.purchase_orders (
    business_id, vendor_id, order_number, order_date, delivery_date, reference,
    delivery_address, payment_terms_days, shipment_preference, notes, created_by
  )
  values (
    current_business_id, vendor_id, trim(order_number), order_date, delivery_date,
    nullif(trim(reference), ''), nullif(trim(delivery_address), ''), payment_terms_days,
    nullif(trim(shipment_preference), ''), nullif(trim(notes), ''), auth.uid()
  )
  returning id into new_order_id;

  insert into public.purchase_order_lines (purchase_order_id, item_id, ordered_quantity, unit_cost, tax_rate)
  select new_order_id, line.item_id, line.ordered_quantity, line.unit_cost, line.tax_rate
  from jsonb_to_recordset(lines) as line(item_id uuid, ordered_quantity numeric, unit_cost numeric, tax_rate numeric);

  return new_order_id;
end;
$$;

grant execute on function public.create_purchase_order(text, uuid, date, date, text, text, integer, text, text, jsonb) to authenticated;

drop policy if exists "business members can access purchase orders" on public.purchase_orders;
create policy "purchase viewers can read purchase orders"
  on public.purchase_orders for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('purchases.view'));
create policy "purchase creators can insert purchase orders"
  on public.purchase_orders for insert to authenticated
  with check (business_id = public.current_business_id() and public.has_permission('purchases.create'));
create policy "purchase editors can update purchase orders"
  on public.purchase_orders for update to authenticated
  using (business_id = public.current_business_id() and public.has_permission('purchases.edit'))
  with check (business_id = public.current_business_id() and public.has_permission('purchases.edit'));

drop policy if exists "business members can access purchase order lines" on public.purchase_order_lines;
create policy "purchase viewers can read purchase order lines"
  on public.purchase_order_lines for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and p.business_id = public.current_business_id() and public.has_permission('purchases.view')));
create policy "purchase creators can insert purchase order lines"
  on public.purchase_order_lines for insert to authenticated
  with check (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and p.business_id = public.current_business_id() and public.has_permission('purchases.create')));
