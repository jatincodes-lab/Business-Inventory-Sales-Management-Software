create or replace function public.get_stock_report(
  p_start_date date,
  p_end_date date,
  p_warehouse_id uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('reports.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Report date range is invalid'; end if;
  if p_end_date - p_start_date > 3660 then raise exception 'Report date range is too large'; end if;
  if p_warehouse_id is not null and not exists (
    select 1 from public.warehouses w where w.id = p_warehouse_id and w.business_id = current_business
  ) then raise exception 'Warehouse is not available in this workspace'; end if;

  return (
    with keys as (
      select sb.warehouse_id, sb.item_id
      from public.stock_balances sb
      where sb.business_id = current_business
        and (p_warehouse_id is null or sb.warehouse_id = p_warehouse_id)
      union
      select sm.warehouse_id, sm.item_id
      from public.stock_movements sm
      where sm.business_id = current_business
        and sm.created_at::date <= p_end_date
        and (p_warehouse_id is null or sm.warehouse_id = p_warehouse_id)
    ),
    movement_totals as (
      select
        k.item_id,
        coalesce(sum(sm.quantity_delta) filter (where sm.created_at::date < p_start_date), 0) as opening_quantity,
        coalesce(sum(sm.quantity_delta) filter (where sm.created_at::date between p_start_date and p_end_date and sm.movement_type = 'receipt'), 0) as receipts_quantity,
        coalesce(sum(sm.quantity_delta) filter (where sm.created_at::date between p_start_date and p_end_date and sm.movement_type = 'sale'), 0) * -1 as sales_quantity,
        coalesce(sum(sm.quantity_delta) filter (where sm.created_at::date between p_start_date and p_end_date and sm.movement_type = 'return'), 0) as returns_quantity,
        coalesce(sum(sm.quantity_delta) filter (where sm.created_at::date between p_start_date and p_end_date and sm.movement_type = 'transfer_in'), 0) as transfer_in_quantity,
        coalesce(sum(sm.quantity_delta) filter (where sm.created_at::date between p_start_date and p_end_date and sm.movement_type = 'transfer_out'), 0) * -1 as transfer_out_quantity,
        coalesce(sum(sm.quantity_delta) filter (where sm.created_at::date between p_start_date and p_end_date and sm.movement_type = 'adjustment'), 0) as adjustment_quantity
      from keys k
      left join public.stock_movements sm
        on sm.business_id = current_business
       and sm.warehouse_id = k.warehouse_id
       and sm.item_id = k.item_id
       and sm.created_at::date <= p_end_date
      group by k.item_id
    ),
    last_costs as (
      select distinct on (grl.item_id)
        grl.item_id,
        grl.unit_cost
      from public.goods_receipt_lines grl
      join public.goods_receipts gr on gr.id = grl.goods_receipt_id
      where gr.business_id = current_business
        and gr.status = 'posted'
        and gr.receipt_date <= p_end_date
        and (p_warehouse_id is null or gr.warehouse_id = p_warehouse_id)
      order by grl.item_id, gr.receipt_date desc, gr.posted_at desc nulls last, grl.id desc
    ),
    rows as (
      select
        i.id as item_id,
        i.name as item_name,
        i.sku,
        round(mt.opening_quantity, 3) as opening_stock,
        round(mt.receipts_quantity, 3) as receipts,
        round(mt.sales_quantity, 3) as sales,
        round(mt.returns_quantity, 3) as sales_returns,
        round(mt.transfer_in_quantity, 3) as transfer_in,
        round(mt.transfer_out_quantity, 3) as transfer_out,
        round(mt.adjustment_quantity, 3) as adjustments,
        round(mt.opening_quantity + mt.receipts_quantity - mt.sales_quantity + mt.returns_quantity + mt.transfer_in_quantity - mt.transfer_out_quantity + mt.adjustment_quantity, 3) as closing_stock,
        round(greatest(mt.opening_quantity + mt.receipts_quantity - mt.sales_quantity + mt.returns_quantity + mt.transfer_in_quantity - mt.transfer_out_quantity + mt.adjustment_quantity, 0) * coalesce(lc.unit_cost, i.purchase_price), 2) as closing_stock_value,
        case when p_warehouse_id is null then 'All warehouses' else max(w.name) end as warehouse_name
      from movement_totals mt
      join public.items i on i.id = mt.item_id and i.business_id = current_business
      left join last_costs lc on lc.item_id = i.id
      left join public.stock_balances sb on sb.business_id = current_business and sb.item_id = i.id and (p_warehouse_id is null or sb.warehouse_id = p_warehouse_id)
      left join public.warehouses w on w.id = sb.warehouse_id and w.business_id = current_business
      where (coalesce(trim(p_search), '') = '' or lower(i.name) like '%' || lower(trim(p_search)) || '%' or lower(i.sku) like '%' || lower(trim(p_search)) || '%')
      group by i.id, i.name, i.sku, mt.opening_quantity, mt.receipts_quantity, mt.sales_quantity, mt.returns_quantity, mt.transfer_in_quantity, mt.transfer_out_quantity, mt.adjustment_quantity, lc.unit_cost, i.purchase_price
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.item_name) from rows r), '[]'::jsonb),
      'summary', jsonb_build_object(
        'opening_stock', coalesce((select sum(r.opening_stock) from rows r), 0),
        'receipts', coalesce((select sum(r.receipts) from rows r), 0),
        'sales', coalesce((select sum(r.sales) from rows r), 0),
        'sales_returns', coalesce((select sum(r.sales_returns) from rows r), 0),
        'transfer_in', coalesce((select sum(r.transfer_in) from rows r), 0),
        'transfer_out', coalesce((select sum(r.transfer_out) from rows r), 0),
        'adjustments', coalesce((select sum(r.adjustments) from rows r), 0),
        'closing_stock', coalesce((select sum(r.closing_stock) from rows r), 0),
        'closing_stock_value', coalesce((select sum(r.closing_stock_value) from rows r), 0)
      )
    )
  );
end;
$$;

create or replace function public.get_sales_report(
  p_start_date date,
  p_end_date date,
  p_warehouse_id uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('reports.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Report date range is invalid'; end if;
  if p_end_date - p_start_date > 3660 then raise exception 'Report date range is too large'; end if;
  if p_warehouse_id is not null and not exists (select 1 from public.warehouses w where w.id = p_warehouse_id and w.business_id = current_business) then raise exception 'Warehouse is not available in this workspace'; end if;

  return (
    with sales as (
      select i.id, i.invoice_number, i.invoice_date, i.customer_name, i.total, sf.warehouse_id, w.name as warehouse_name
      from public.invoices i
      join public.sales_fulfillments sf on sf.id = i.source_fulfillment_id and sf.business_id = current_business
      left join public.warehouses w on w.id = sf.warehouse_id and w.business_id = current_business
      where i.business_id = current_business
        and i.status = 'issued'
        and i.invoice_date between p_start_date and p_end_date
        and (p_warehouse_id is null or sf.warehouse_id = p_warehouse_id)
        and (coalesce(trim(p_search), '') = '' or lower(i.invoice_number) like '%' || lower(trim(p_search)) || '%' or lower(i.customer_name) like '%' || lower(trim(p_search)) || '%')
    ),
    returns as (
      select sr.invoice_id, sum(sr.total) as returned_amount, sum(sr.refund_amount) as refunded_amount
      from public.sales_returns sr
      where sr.business_id = current_business and sr.status = 'posted' and sr.return_date between p_start_date and p_end_date
      group by sr.invoice_id
    ),
    payments as (
      select ip.invoice_id, sum(ip.amount) as paid_amount
      from public.invoice_payments ip
      where ip.business_id = current_business and ip.payment_date between p_start_date and p_end_date
      group by ip.invoice_id
    ),
    rows as (
      select
        s.id as invoice_id,
        s.invoice_number,
        s.invoice_date,
        s.customer_name,
        coalesce(s.warehouse_name, '-') as warehouse_name,
        coalesce((select sum(il.quantity) from public.invoice_lines il where il.invoice_id = s.id), 0) as quantity,
        round(s.total, 2) as gross_sales,
        round(coalesce(r.returned_amount, 0), 2) as returns,
        round(greatest(s.total - coalesce(r.returned_amount, 0), 0), 2) as net_sales,
        round(coalesce(p.paid_amount, 0), 2) as paid_amount,
        round(greatest(greatest(s.total - coalesce(r.returned_amount, 0), 0) - greatest(coalesce(p.paid_amount, 0) - coalesce(r.refunded_amount, 0), 0), 0), 2) as outstanding_amount,
        case
          when greatest(coalesce(p.paid_amount, 0) - coalesce(r.refunded_amount, 0), 0) >= greatest(s.total - coalesce(r.returned_amount, 0), 0) then 'Paid'
          when greatest(coalesce(p.paid_amount, 0) - coalesce(r.refunded_amount, 0), 0) > 0 then 'Partially paid'
          else 'Unpaid'
        end as payment_status
      from sales s
      left join returns r on r.invoice_id = s.id
      left join payments p on p.invoice_id = s.id
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.invoice_date desc, r.invoice_number desc) from rows r), '[]'::jsonb),
      'summary', jsonb_build_object(
        'invoices', (select count(*) from rows),
        'gross_sales', coalesce((select sum(r.gross_sales) from rows r), 0),
        'returns', coalesce((select sum(r.returns) from rows r), 0),
        'net_sales', coalesce((select sum(r.net_sales) from rows r), 0),
        'paid_amount', coalesce((select sum(r.paid_amount) from rows r), 0),
        'outstanding_amount', coalesce((select sum(r.outstanding_amount) from rows r), 0)
      )
    )
  );
end;
$$;

create or replace function public.get_customer_report(
  p_start_date date,
  p_end_date date,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('reports.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Report date range is invalid'; end if;
  if p_end_date - p_start_date > 3660 then raise exception 'Report date range is too large'; end if;

  return (
    with order_totals as (
      select so.customer_id, count(*) as total_orders
      from public.sales_orders so
      where so.business_id = current_business and so.status in ('submitted', 'partially_fulfilled', 'fulfilled') and so.order_date between p_start_date and p_end_date
      group by so.customer_id
    ),
    sales as (
      select so.customer_id, sum(i.total) as total_sales
      from public.invoices i
      join public.sales_orders so on so.id = i.sales_order_id and so.business_id = current_business
      where i.business_id = current_business and i.status = 'issued' and i.invoice_date between p_start_date and p_end_date
      group by so.customer_id
    ),
    payments as (
      select so.customer_id, sum(ip.amount) as total_paid
      from public.invoice_payments ip
      join public.invoices i on i.id = ip.invoice_id and i.business_id = current_business
      join public.sales_orders so on so.id = i.sales_order_id and so.business_id = current_business
      where ip.business_id = current_business and ip.payment_date between p_start_date and p_end_date
      group by so.customer_id
    ),
    returns as (
      select so.customer_id, sum(sr.total) as total_returns, sum(sr.refund_amount) as total_refunds
      from public.sales_returns sr
      join public.invoices i on i.id = sr.invoice_id and i.business_id = current_business
      join public.sales_orders so on so.id = i.sales_order_id and so.business_id = current_business
      where sr.business_id = current_business and sr.status = 'posted' and sr.return_date between p_start_date and p_end_date
      group by so.customer_id
    ),
    rows as (
      select
        c.id as customer_id,
        c.name as customer_name,
        coalesce(o.total_orders, 0) as total_orders,
        round(coalesce(s.total_sales, 0), 2) as total_sales,
        round(coalesce(p.total_paid, 0), 2) as total_paid,
        round(coalesce(r.total_returns, 0), 2) as total_returns,
        round(greatest(coalesce(r.total_returns, 0) - coalesce(r.total_refunds, 0), 0), 2) as credit_notes,
        round(greatest(greatest(coalesce(s.total_sales, 0) - coalesce(r.total_returns, 0), 0) - greatest(coalesce(p.total_paid, 0) - coalesce(r.total_refunds, 0), 0), 0), 2) as outstanding_balance
      from public.customers c
      left join order_totals o on o.customer_id = c.id
      left join sales s on s.customer_id = c.id
      left join payments p on p.customer_id = c.id
      left join returns r on r.customer_id = c.id
      where c.business_id = current_business
        and (coalesce(trim(p_search), '') = '' or lower(c.name) like '%' || lower(trim(p_search)) || '%' or lower(coalesce(c.email, '')) like '%' || lower(trim(p_search)) || '%' or lower(coalesce(c.mobile, '')) like '%' || lower(trim(p_search)) || '%')
        and (coalesce(o.total_orders, 0) > 0 or coalesce(s.total_sales, 0) > 0 or coalesce(p.total_paid, 0) > 0 or coalesce(r.total_returns, 0) > 0)
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.customer_name) from rows r), '[]'::jsonb),
      'summary', jsonb_build_object(
        'customers', (select count(*) from rows),
        'total_orders', coalesce((select sum(r.total_orders) from rows r), 0),
        'total_sales', coalesce((select sum(r.total_sales) from rows r), 0),
        'total_paid', coalesce((select sum(r.total_paid) from rows r), 0),
        'total_returns', coalesce((select sum(r.total_returns) from rows r), 0),
        'credit_notes', coalesce((select sum(r.credit_notes) from rows r), 0),
        'outstanding_balance', coalesce((select sum(r.outstanding_balance) from rows r), 0)
      )
    )
  );
end;
$$;

create or replace function public.get_purchase_report(
  p_start_date date,
  p_end_date date,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('reports.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Report date range is invalid'; end if;
  if p_end_date - p_start_date > 3660 then raise exception 'Report date range is too large'; end if;

  return (
    with rows as (
      select
        po.id as purchase_order_id,
        po.order_number,
        po.order_date,
        v.name as vendor_name,
        po.status,
        round(sum(pol.ordered_quantity), 3) as ordered_quantity,
        round(sum(pol.received_quantity), 3) as received_quantity,
        round(sum(greatest(pol.ordered_quantity - pol.received_quantity, 0)), 3) as pending_quantity,
        round(sum(pol.ordered_quantity * pol.unit_cost), 2) as purchase_value,
        round(sum(pol.received_quantity * pol.unit_cost), 2) as received_value
      from public.purchase_orders po
      join public.purchase_order_lines pol on pol.purchase_order_id = po.id
      join public.vendors v on v.id = po.vendor_id and v.business_id = current_business
      where po.business_id = current_business
        and po.status <> 'cancelled'
        and po.order_date between p_start_date and p_end_date
        and (coalesce(trim(p_search), '') = '' or lower(po.order_number) like '%' || lower(trim(p_search)) || '%' or lower(v.name) like '%' || lower(trim(p_search)) || '%')
      group by po.id, po.order_number, po.order_date, v.name, po.status
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.order_date desc, r.order_number desc) from rows r), '[]'::jsonb),
      'summary', jsonb_build_object(
        'purchase_orders', (select count(*) from rows),
        'ordered_quantity', coalesce((select sum(r.ordered_quantity) from rows r), 0),
        'received_quantity', coalesce((select sum(r.received_quantity) from rows r), 0),
        'pending_quantity', coalesce((select sum(r.pending_quantity) from rows r), 0),
        'purchase_value', coalesce((select sum(r.purchase_value) from rows r), 0),
        'received_value', coalesce((select sum(r.received_value) from rows r), 0)
      )
    )
  );
end;
$$;

revoke execute on function public.get_stock_report(date, date, uuid, text) from public;
revoke execute on function public.get_sales_report(date, date, uuid, text) from public;
revoke execute on function public.get_customer_report(date, date, text) from public;
revoke execute on function public.get_purchase_report(date, date, text) from public;
grant execute on function public.get_stock_report(date, date, uuid, text) to authenticated;
grant execute on function public.get_sales_report(date, date, uuid, text) to authenticated;
grant execute on function public.get_customer_report(date, date, text) to authenticated;
grant execute on function public.get_purchase_report(date, date, text) to authenticated;

notify pgrst, 'reload schema';
