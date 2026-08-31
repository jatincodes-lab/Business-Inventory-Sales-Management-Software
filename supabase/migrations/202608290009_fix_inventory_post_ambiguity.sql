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
    select sb.quantity into balance from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = adjustment.warehouse_id and sb.item_id = adjustment_line.item_id for update;
    if balance + adjustment_line.quantity_delta < 0 then raise exception 'Adjustment would make stock negative'; end if;
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
    select sb.id, sb.quantity into source_balance_id, source_quantity from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = transfer.source_warehouse_id and sb.item_id = transfer_line.item_id for update;
    select sb.id into destination_balance_id from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = transfer.destination_warehouse_id and sb.item_id = transfer_line.item_id for update;
    if source_quantity < transfer_line.quantity then raise exception 'Insufficient stock in source warehouse'; end if;
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

revoke execute on function public.post_inventory_adjustment(uuid) from public;
grant execute on function public.post_inventory_adjustment(uuid) to authenticated;
revoke execute on function public.post_stock_transfer(uuid) from public;
grant execute on function public.post_stock_transfer(uuid) to authenticated;
