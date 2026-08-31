create or replace function public.get_payment_register(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_payment_method text default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  id uuid,
  invoice_id uuid,
  invoice_number text,
  customer_name text,
  invoice_total numeric,
  invoice_status text,
  amount numeric,
  payment_date date,
  payment_method text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz,
  total_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  normalized_search text := nullif(trim(p_search), '');
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
begin
  if auth.uid() is null or not public.has_permission('payments.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if normalized_search is not null and char_length(normalized_search) > 80 then raise exception 'Search is too long'; end if;
  if p_payment_method is not null and p_payment_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other') then raise exception 'Payment method is invalid'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then raise exception 'Payment date range is invalid'; end if;

  return query
  select
    ip.id,
    ip.invoice_id,
    i.invoice_number,
    i.customer_name,
    i.total,
    i.status,
    ip.amount,
    ip.payment_date,
    ip.payment_method,
    ip.reference,
    ip.notes,
    ip.created_by,
    ip.created_at,
    count(*) over ()
  from public.invoice_payments ip
  join public.invoices i on i.id = ip.invoice_id and i.business_id = current_business
  where ip.business_id = current_business
    and (p_payment_method is null or ip.payment_method = p_payment_method)
    and (p_date_from is null or ip.payment_date >= p_date_from)
    and (p_date_to is null or ip.payment_date <= p_date_to)
    and (
      normalized_search is null
      or i.invoice_number ilike '%' || normalized_search || '%'
      or i.customer_name ilike '%' || normalized_search || '%'
      or coalesce(ip.reference, '') ilike '%' || normalized_search || '%'
    )
  order by ip.payment_date desc, ip.created_at desc, ip.id desc
  offset (page_number - 1) * page_size
  limit page_size;
end;
$$;

create or replace function public.get_payment_summary()
returns table (
  collected_today numeric,
  collected_this_month numeric,
  outstanding_amount numeric,
  paid_invoice_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('payments.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;

  return query
  with issued_invoices as (
    select i.id, i.total
    from public.invoices i
    where i.business_id = current_business and i.status = 'issued'
  ), payment_totals as (
    select ip.invoice_id, coalesce(sum(ip.amount), 0) as paid
    from public.invoice_payments ip
    where ip.business_id = current_business
    group by ip.invoice_id
  )
  select
    (select coalesce(sum(ip.amount), 0) from public.invoice_payments ip where ip.business_id = current_business and ip.payment_date = current_date),
    (select coalesce(sum(ip.amount), 0) from public.invoice_payments ip where ip.business_id = current_business and ip.payment_date >= date_trunc('month', current_date)::date and ip.payment_date <= current_date),
    (select coalesce(sum(greatest(ii.total - coalesce(pt.paid, 0), 0)), 0) from issued_invoices ii left join payment_totals pt on pt.invoice_id = ii.id),
    (select count(*) from issued_invoices ii join payment_totals pt on pt.invoice_id = ii.id and pt.paid >= ii.total);
end;
$$;

revoke execute on function public.get_payment_register(integer, integer, text, text, date, date) from public;
revoke execute on function public.get_payment_summary() from public;
grant execute on function public.get_payment_register(integer, integer, text, text, date, date) to authenticated;
grant execute on function public.get_payment_summary() to authenticated;
