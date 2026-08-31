create or replace function public.create_goods_receipt(
  purchase_order_id uuid,
  warehouse_id uuid,
  receipt_number text,
  receipt_date date,
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
  purchase_order public.purchase_orders%rowtype;
  new_receipt_id uuid;
begin
  if auth.uid() is null or not public.has_permission('receipts.create') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if receipt_number is null or char_length(trim(receipt_number)) < 1 or char_length(trim(receipt_number)) > 40 or trim(receipt_number) !~ '^[A-Za-z0-9/_-]+$' then raise exception 'Receipt number is invalid'; end if;
  if receipt_date is null then raise exception 'Receipt date is required'; end if;
  if notes is not null and char_length(notes) > 1000 then raise exception 'Receipt notes are too long'; end if;

  select * into purchase_order from public.purchase_orders where id = purchase_order_id and business_id = current_business for update;
  if purchase_order.id is null then raise exception 'Purchase order not found'; end if;
  if purchase_order.status not in ('submitted', 'partially_received') then raise exception 'Only submitted purchase orders can be received'; end if;
  if receipt_date < purchase_order.order_date then raise exception 'Receipt date cannot be before the purchase order date'; end if;
  if not exists (select 1 from public.warehouses where id = warehouse_id and business_id = current_business and is_active) then raise exception 'Warehouse is not available in this workspace'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 200 then raise exception 'Add between 1 and 200 receipt lines'; end if;
  if exists (
    select 1 from jsonb_to_recordset(lines) as line(purchase_order_line_id uuid, item_id uuid, quantity numeric, unit_cost numeric)
    left join public.purchase_order_lines purchase_line on purchase_line.id = line.purchase_order_line_id and purchase_line.purchase_order_id = purchase_order.id
    where purchase_line.id is null or line.item_id is null or line.item_id <> purchase_line.item_id or line.quantity is null or line.quantity <= 0 or line.quantity > purchase_line.ordered_quantity - purchase_line.received_quantity or line.unit_cost is null or line.unit_cost < 0
  ) then raise exception 'One or more receipt lines are invalid or exceed the remaining quantity'; end if;
  if (select count(*) from jsonb_to_recordset(lines) as line(purchase_order_line_id uuid)) <> (select count(distinct line.purchase_order_line_id) from jsonb_to_recordset(lines) as line(purchase_order_line_id uuid)) then raise exception 'A purchase order line can appear only once per receipt'; end if;

  insert into public.goods_receipts (business_id, purchase_order_id, warehouse_id, receipt_number, receipt_date, notes, created_by)
  values (current_business, purchase_order.id, warehouse_id, trim(receipt_number), receipt_date, nullif(trim(notes), ''), auth.uid()) returning id into new_receipt_id;
  insert into public.goods_receipt_lines (goods_receipt_id, purchase_order_line_id, item_id, quantity, unit_cost)
  select new_receipt_id, line.purchase_order_line_id, line.item_id, line.quantity, line.unit_cost from jsonb_to_recordset(lines) as line(purchase_order_line_id uuid, item_id uuid, quantity numeric, unit_cost numeric);
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'goods_receipt', new_receipt_id, jsonb_build_object('receipt_number', trim(receipt_number), 'purchase_order_id', purchase_order.id));
  return new_receipt_id;
end;
$$;

create or replace function public.post_goods_receipt(receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  receipt public.goods_receipts%rowtype;
  purchase_order public.purchase_orders%rowtype;
  receipt_line record;
  purchase_line public.purchase_order_lines%rowtype;
begin
  if auth.uid() is null or not public.has_permission('receipts.post') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into receipt from public.goods_receipts where id = receipt_id and business_id = current_business for update;
  if receipt.id is null then raise exception 'Goods receipt not found'; end if;
  if receipt.status <> 'draft' then raise exception 'Only draft receipts can be posted'; end if;
  if not exists (select 1 from public.warehouses where id = receipt.warehouse_id and business_id = current_business and is_active) then raise exception 'Warehouse is no longer active'; end if;
  select * into purchase_order from public.purchase_orders where id = receipt.purchase_order_id and business_id = current_business for update;
  if purchase_order.id is null then raise exception 'Purchase order not found'; end if;
  if purchase_order.status not in ('submitted', 'partially_received') then raise exception 'This purchase order is no longer available for receiving'; end if;
  if not exists (select 1 from public.goods_receipt_lines where goods_receipt_id = receipt.id) then raise exception 'Goods receipt must contain at least one line'; end if;
  if (select count(*) from public.goods_receipt_lines where goods_receipt_id = receipt.id) <> (select count(distinct purchase_order_line_id) from public.goods_receipt_lines where goods_receipt_id = receipt.id) then raise exception 'A purchase order line can appear only once per receipt'; end if;

  for receipt_line in select * from public.goods_receipt_lines where goods_receipt_id = receipt.id order by purchase_order_line_id loop
    select * into purchase_line from public.purchase_order_lines where id = receipt_line.purchase_order_line_id and purchase_order_id = purchase_order.id for update;
    if purchase_line.id is null then raise exception 'Receipt line is not part of the purchase order'; end if;
    if purchase_line.item_id <> receipt_line.item_id then raise exception 'Receipt item does not match the purchase order line'; end if;
    if receipt_line.quantity is null or receipt_line.unit_cost is null or receipt_line.quantity <= 0 or receipt_line.unit_cost < 0 then raise exception 'Receipt line quantity or cost is invalid'; end if;
    if purchase_line.received_quantity + receipt_line.quantity > purchase_line.ordered_quantity then raise exception 'Received quantity exceeds ordered quantity'; end if;
    update public.purchase_order_lines set received_quantity = received_quantity + receipt_line.quantity where id = purchase_line.id;
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity) values (receipt.business_id, receipt.warehouse_id, receipt_line.item_id, receipt_line.quantity)
      on conflict (business_id, warehouse_id, item_id) do update set quantity = public.stock_balances.quantity + excluded.quantity, updated_at = now();
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
      values (receipt.business_id, receipt.warehouse_id, receipt_line.item_id, receipt_line.quantity, 'receipt', 'goods_receipt', receipt.id, receipt_line.id, auth.uid());
  end loop;
  update public.goods_receipts set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = receipt.id and status = 'draft';
  update public.purchase_orders po set status = case when not exists (select 1 from public.purchase_order_lines pol where pol.purchase_order_id = po.id and pol.received_quantity < pol.ordered_quantity) then 'received' else 'partially_received' end where po.id = purchase_order.id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (receipt.business_id, auth.uid(), 'post', 'goods_receipt', receipt.id, jsonb_build_object('receipt_number', receipt.receipt_number, 'purchase_order_id', purchase_order.id));
end;
$$;

revoke execute on function public.create_goods_receipt(uuid, uuid, text, date, text, jsonb) from public;
grant execute on function public.create_goods_receipt(uuid, uuid, text, date, text, jsonb) to authenticated;
revoke execute on function public.post_goods_receipt(uuid) from public;
grant execute on function public.post_goods_receipt(uuid) to authenticated;
