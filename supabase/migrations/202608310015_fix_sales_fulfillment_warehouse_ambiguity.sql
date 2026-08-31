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
  target_warehouse_id alias for $2;
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
          and sor.warehouse_id = target_warehouse_id
      ), 0)
  ) then raise exception 'One or more fulfillment lines exceed the stock reserved in the selected warehouse'; end if;
  if (select count(*) from jsonb_to_recordset(lines) as line(sales_order_line_id uuid)) <> (select count(distinct line.sales_order_line_id) from jsonb_to_recordset(lines) as line(sales_order_line_id)) then raise exception 'A sales order line can appear only once per fulfillment'; end if;

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
