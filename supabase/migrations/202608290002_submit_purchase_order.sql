create or replace function public.submit_purchase_order(order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  purchase_order public.purchase_orders%rowtype;
begin
  if auth.uid() is null or not public.has_permission('purchases.edit') then
    raise exception 'Not authorized';
  end if;
  if current_business is null then
    raise exception 'Workspace not found';
  end if;

  select * into purchase_order
  from public.purchase_orders
  where id = order_id and business_id = current_business
  for update;

  if purchase_order.id is null then
    raise exception 'Purchase order not found';
  end if;
  if purchase_order.status <> 'draft' then
    raise exception 'Only draft purchase orders can be submitted';
  end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = purchase_order.id) then
    raise exception 'Purchase order must contain at least one line';
  end if;
  if not exists (select 1 from public.vendors where id = purchase_order.vendor_id and business_id = current_business and is_active) then
    raise exception 'Vendor is no longer active';
  end if;
  if exists (
    select 1
    from public.purchase_order_lines line
    where line.purchase_order_id = purchase_order.id
      and (line.ordered_quantity <= 0 or line.received_quantity < 0 or line.received_quantity > line.ordered_quantity)
  ) then
    raise exception 'Purchase order contains invalid quantities';
  end if;
  if exists (
    select 1
    from public.purchase_order_lines line
    left join public.items item on item.id = line.item_id and item.business_id = current_business and item.is_active
    where line.purchase_order_id = purchase_order.id and item.id is null
  ) then
    raise exception 'One or more items are no longer active';
  end if;
  if (select count(*) from public.purchase_order_lines where purchase_order_id = purchase_order.id)
     <> (select count(distinct item_id) from public.purchase_order_lines where purchase_order_id = purchase_order.id) then
    raise exception 'An item can appear only once per purchase order';
  end if;

  update public.purchase_orders
  set status = 'submitted'
  where id = purchase_order.id and status = 'draft';

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    current_business, auth.uid(), 'submit', 'purchase_order', purchase_order.id,
    jsonb_build_object('order_number', purchase_order.order_number, 'previous_status', 'draft')
  );

  return purchase_order.id;
end;
$$;

grant execute on function public.submit_purchase_order(uuid) to authenticated;
