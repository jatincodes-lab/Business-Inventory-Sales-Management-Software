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
      select sb.warehouse_id, sb.item_id, sb.quantity, sb.reserved_quantity
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
      where sb.business_id = current_business
        and sb.warehouse_id = stock_position.warehouse_id
        and sb.item_id = stock_position.item_id;

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
