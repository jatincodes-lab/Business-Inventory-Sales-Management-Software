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
    (select count(*) from issued_invoices ii left join payment_totals pt on pt.invoice_id = ii.id where coalesce(pt.paid, 0) >= ii.total);
end;
$$;

revoke execute on function public.get_payment_summary() from public;
grant execute on function public.get_payment_summary() to authenticated;
