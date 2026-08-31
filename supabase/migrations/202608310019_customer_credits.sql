create table public.customer_credits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  source_invoice_id uuid not null references public.invoices(id) on delete restrict,
  source_return_id uuid not null references public.sales_returns(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  remaining_amount numeric(18,2) not null check (remaining_amount >= 0 and remaining_amount <= amount),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id, source_return_id)
);

create table public.customer_credit_applications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  payment_date date not null default current_date,
  reference text check (reference is null or char_length(trim(reference)) between 1 and 100),
  notes text check (notes is null or char_length(trim(notes)) between 1 and 1000),
  client_request_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (business_id, client_request_id)
);

create table public.customer_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  application_id uuid not null references public.customer_credit_applications(id) on delete cascade,
  credit_id uuid not null references public.customer_credits(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  unique (application_id, credit_id)
);

create index customer_credits_business_customer_idx on public.customer_credits (business_id, customer_id, created_at, id);
create index customer_credits_source_invoice_idx on public.customer_credits (source_invoice_id);
create index customer_credit_applications_business_date_idx on public.customer_credit_applications (business_id, payment_date desc, created_at desc);
create index customer_credit_applications_invoice_idx on public.customer_credit_applications (invoice_id, payment_date desc, created_at desc);
create index customer_credit_allocations_credit_idx on public.customer_credit_allocations (credit_id);

alter table public.customer_credits enable row level security;
alter table public.customer_credit_applications enable row level security;
alter table public.customer_credit_allocations enable row level security;

create policy "payment viewers can read customer credits"
  on public.customer_credits for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('payments.view'));

create policy "payment viewers can read credit applications"
  on public.customer_credit_applications for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('payments.view'));

create policy "payment viewers can read credit allocations"
  on public.customer_credit_allocations for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('payments.view'));

alter table public.invoice_payments drop constraint if exists invoice_payments_payment_method_check;
alter table public.invoice_payments add constraint invoice_payments_payment_method_check
  check (payment_method in ('cash', 'card', 'upi', 'bank_transfer', 'other', 'customer_credit'));

-- Backfill credits for already-posted returns. The amount is the increase in
-- customer overpayment after each return, so old data cannot create duplicates.
with paid as (
  select ip.invoice_id, coalesce(sum(ip.amount), 0) as paid_amount
  from public.invoice_payments ip
  where ip.business_id is not null
  group by ip.invoice_id
), ordered_returns as (
  select
    sr.id as return_id,
    sr.business_id,
    sr.invoice_id,
    so.customer_id,
    i.total as invoice_total,
    coalesce(p.paid_amount, 0) as paid_amount,
    sum(sr.total) over (
      partition by sr.invoice_id
      order by coalesce(sr.posted_at, sr.created_at), sr.id
      rows between unbounded preceding and current row
    ) as returned_amount,
    sum(sr.refund_amount) over (
      partition by sr.invoice_id
      order by coalesce(sr.posted_at, sr.created_at), sr.id
      rows between unbounded preceding and current row
    ) as refunded_amount,
    sr.created_by,
    sr.created_at,
    coalesce(sr.posted_at, sr.created_at) as event_at
  from public.sales_returns sr
  join public.invoices i on i.id = sr.invoice_id and i.business_id = sr.business_id
  join public.sales_orders so on so.id = i.sales_order_id and so.business_id = sr.business_id
  left join paid p on p.invoice_id = sr.invoice_id
  where sr.status = 'posted'
), credit_totals as (
  select
    *,
    round(greatest(paid_amount - refunded_amount - (invoice_total - returned_amount), 0), 2) as credit_total
  from ordered_returns
), credit_deltas as (
  select
    *,
    round(credit_total - coalesce(lag(credit_total) over (
      partition by invoice_id
      order by event_at, return_id
    ), 0), 2) as credit_amount
  from credit_totals
)
insert into public.customer_credits (
  business_id, customer_id, source_invoice_id, source_return_id,
  amount, remaining_amount, created_by, created_at
)
select business_id, customer_id, invoice_id, return_id, credit_amount, credit_amount, created_by, created_at
from credit_deltas
where credit_amount > 0
on conflict (business_id, source_return_id) do nothing;

create or replace function public.post_sales_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  return_row public.sales_returns%rowtype;
  invoice_row public.invoices%rowtype;
  return_line record;
  customer_id uuid;
  stock_quantity numeric;
  paid_amount numeric(18,2);
  refunded_amount numeric(18,2);
  posted_return_amount numeric(18,2);
  credit_total numeric(18,2);
  issued_credit_total numeric(18,2);
  new_credit_amount numeric(18,2);
begin
  if auth.uid() is null or not public.has_permission('returns.post') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;

  select * into return_row
  from public.sales_returns sr
  where sr.id = p_return_id and sr.business_id = current_business
  for update;
  if return_row.id is null then raise exception 'Sales return not found'; end if;
  if return_row.status <> 'draft' then raise exception 'Only draft returns can be posted'; end if;

  select * into invoice_row
  from public.invoices i
  where i.id = return_row.invoice_id and i.business_id = current_business
  for update;
  if invoice_row.id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status <> 'issued' then raise exception 'Only issued invoices can be returned'; end if;
  if not exists (
    select 1 from public.warehouses w
    where w.id = return_row.warehouse_id and w.business_id = current_business and w.is_active
  ) then raise exception 'The original warehouse is no longer active'; end if;
  if not exists (select 1 from public.sales_return_lines srl where srl.return_id = return_row.id) then raise exception 'Sales return must contain at least one line'; end if;
  if exists (
    select 1
    from public.sales_return_lines srl
    join public.invoice_lines il on il.id = srl.invoice_line_id and il.invoice_id = invoice_row.id
    where srl.return_id = return_row.id
      and srl.quantity > il.quantity - coalesce((
        select sum(prl.quantity)
        from public.sales_return_lines prl
        join public.sales_returns pr on pr.id = prl.return_id and pr.status = 'posted'
        where prl.invoice_line_id = il.id
      ), 0)
  ) then raise exception 'One or more return quantities are no longer available; refresh and try again'; end if;

  select so.customer_id into customer_id
  from public.sales_orders so
  where so.id = invoice_row.sales_order_id and so.business_id = current_business;
  if customer_id is null then raise exception 'Customer not found'; end if;
  perform 1 from public.customers c where c.id = customer_id and c.business_id = current_business for update;
  if not found then raise exception 'Customer not found'; end if;

  select coalesce(sum(ip.amount), 0)
  into paid_amount
  from public.invoice_payments ip
  where ip.invoice_id = invoice_row.id and ip.business_id = current_business;
  select coalesce(sum(sr.refund_amount), 0)
  into refunded_amount
  from public.sales_returns sr
  where sr.invoice_id = invoice_row.id and sr.business_id = current_business and sr.status = 'posted';
  if return_row.refund_amount > paid_amount - refunded_amount then raise exception 'Refund amount exceeds the refundable paid balance'; end if;

  for return_line in
    select srl.* from public.sales_return_lines srl
    where srl.return_id = return_row.id
    order by srl.item_id, srl.id
  loop
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, return_row.warehouse_id, return_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select sb.quantity into stock_quantity
    from public.stock_balances sb
    where sb.business_id = current_business
      and sb.warehouse_id = return_row.warehouse_id
      and sb.item_id = return_line.item_id
    for update;
    update public.stock_balances sb
    set quantity = stock_quantity + return_line.quantity, updated_at = now()
    where sb.business_id = current_business
      and sb.warehouse_id = return_row.warehouse_id
      and sb.item_id = return_line.item_id;
    insert into public.stock_movements (
      business_id, warehouse_id, item_id, quantity_delta, movement_type,
      source_type, source_id, source_line_id, performed_by
    ) values (
      current_business, return_row.warehouse_id, return_line.item_id, return_line.quantity,
      'return', 'sales_return', return_row.id, return_line.id, auth.uid()
    );
  end loop;

  select coalesce(sum(sr.total), 0)
  into posted_return_amount
  from public.sales_returns sr
  where sr.invoice_id = invoice_row.id and sr.business_id = current_business and sr.status = 'posted';
  posted_return_amount := posted_return_amount + return_row.total;
  credit_total := round(greatest(paid_amount - refunded_amount - (invoice_row.total - posted_return_amount), 0), 2);
  select coalesce(sum(cc.amount), 0)
  into issued_credit_total
  from public.customer_credits cc
  where cc.source_invoice_id = invoice_row.id and cc.business_id = current_business;
  new_credit_amount := round(greatest(credit_total - issued_credit_total, 0), 2);
  if new_credit_amount > 0 then
    insert into public.customer_credits (
      business_id, customer_id, source_invoice_id, source_return_id,
      amount, remaining_amount, created_by
    ) values (
      current_business, customer_id, invoice_row.id, return_row.id,
      new_credit_amount, new_credit_amount, auth.uid()
    );
  end if;

  update public.sales_returns sr
  set status = 'posted', posted_by = auth.uid(), posted_at = now()
  where sr.id = return_row.id and sr.status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    current_business, auth.uid(), 'post', 'sales_return', return_row.id,
    jsonb_build_object(
      'return_number', return_row.return_number,
      'invoice_id', invoice_row.id,
      'total', return_row.total,
      'refund_amount', return_row.refund_amount,
      'credit_amount', new_credit_amount
    )
  );
end;
$$;

create or replace function public.get_invoice_credit_balance(p_invoice_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  invoice_customer_id uuid;
begin
  if auth.uid() is null or not public.has_permission('payments.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select so.customer_id into invoice_customer_id
  from public.invoices i
  join public.sales_orders so on so.id = i.sales_order_id and so.business_id = current_business
  where i.id = p_invoice_id and i.business_id = current_business;
  if invoice_customer_id is null then raise exception 'Invoice not found'; end if;
  return coalesce((
    select sum(cc.remaining_amount)
    from public.customer_credits cc
    where cc.business_id = current_business
      and cc.customer_id = invoice_customer_id
      and cc.source_invoice_id <> p_invoice_id
      and cc.remaining_amount > 0
  ), 0);
end;
$$;

create or replace function public.apply_customer_credit(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_reference text default null,
  p_notes text default null,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  invoice_row public.invoices%rowtype;
  customer_id uuid;
  existing_application public.customer_credit_applications%rowtype;
  credit_row public.customer_credits%rowtype;
  application_id uuid;
  normalized_amount numeric(18,2);
  normalized_reference text := nullif(trim(p_reference), '');
  normalized_notes text := nullif(trim(p_notes), '');
  available_credit numeric(18,2);
  returned_amount numeric(18,2);
  refunded_amount numeric(18,2);
  paid_amount numeric(18,2);
  balance_due numeric(18,2);
  remaining_to_apply numeric(18,2);
  allocation_amount numeric(18,2);
begin
  if auth.uid() is null or not public.has_permission('payments.create') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_invoice_id is null then raise exception 'Invoice is required'; end if;
  if p_client_request_id is null then raise exception 'Credit application request ID is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Credit amount must be greater than zero and have at most two decimal places'; end if;
  normalized_amount := round(p_amount, 2);
  if p_payment_date is null then raise exception 'Payment date is required'; end if;
  if p_payment_date > current_date then raise exception 'Payment date cannot be in the future'; end if;
  if length(normalized_reference) > 100 then raise exception 'Credit reference is too long'; end if;
  if length(normalized_notes) > 1000 then raise exception 'Credit notes are too long'; end if;

  select * into invoice_row
  from public.invoices i
  where i.id = p_invoice_id and i.business_id = current_business
  for update;
  if invoice_row.id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status <> 'issued' then raise exception 'Cancelled invoices cannot receive credit'; end if;
  if p_payment_date < invoice_row.invoice_date then raise exception 'Payment date cannot be before the invoice date'; end if;

  select so.customer_id into customer_id
  from public.sales_orders so
  where so.id = invoice_row.sales_order_id and so.business_id = current_business;
  if customer_id is null then raise exception 'Customer not found'; end if;
  perform 1 from public.customers c where c.id = customer_id and c.business_id = current_business for update;
  if not found then raise exception 'Customer not found'; end if;

  select * into existing_application
  from public.customer_credit_applications cca
  where cca.business_id = current_business and cca.client_request_id = p_client_request_id;
  if existing_application.id is not null then
    if existing_application.invoice_id = invoice_row.id
      and existing_application.amount = normalized_amount
      and existing_application.payment_date = p_payment_date
      and existing_application.reference is not distinct from normalized_reference
      and existing_application.notes is not distinct from normalized_notes then
      return existing_application.id;
    end if;
    raise exception 'Credit application request ID was already used with different details';
  end if;

  select coalesce(sum(cc.remaining_amount), 0)
  into available_credit
  from public.customer_credits cc
  where cc.business_id = current_business
    and cc.customer_id = customer_id
    and cc.source_invoice_id <> invoice_row.id
    and cc.remaining_amount > 0;
  if normalized_amount > available_credit then raise exception 'Credit amount exceeds the available customer credit'; end if;

  select coalesce(sum(sr.total), 0)
  into returned_amount
  from public.sales_returns sr
  where sr.invoice_id = invoice_row.id and sr.business_id = current_business and sr.status = 'posted';
  select coalesce(sum(sr.refund_amount), 0)
  into refunded_amount
  from public.sales_returns sr
  where sr.invoice_id = invoice_row.id and sr.business_id = current_business and sr.status = 'posted';
  select coalesce(sum(ip.amount), 0)
  into paid_amount
  from public.invoice_payments ip
  where ip.invoice_id = invoice_row.id and ip.business_id = current_business;
  balance_due := round(greatest(invoice_row.total - returned_amount - (paid_amount - refunded_amount), 0), 2);
  if normalized_amount > balance_due then raise exception 'Credit amount exceeds the invoice balance'; end if;
  if exists (
    select 1 from public.customer_credits cc
    where cc.business_id = current_business and cc.customer_id = customer_id
      and cc.source_invoice_id = invoice_row.id and cc.remaining_amount > 0
  ) then
    raise exception 'Credit from this invoice is already reflected in its balance';
  end if;

  insert into public.customer_credit_applications (
    business_id, customer_id, invoice_id, amount, payment_date,
    reference, notes, client_request_id, created_by
  ) values (
    current_business, customer_id, invoice_row.id, normalized_amount, p_payment_date,
    normalized_reference, normalized_notes, p_client_request_id, auth.uid()
  ) returning id into application_id;

  remaining_to_apply := normalized_amount;
  for credit_row in
    select cc.*
    from public.customer_credits cc
    where cc.business_id = current_business
      and cc.customer_id = customer_id
      and cc.source_invoice_id <> invoice_row.id
      and cc.remaining_amount > 0
    order by cc.created_at, cc.id
    for update
  loop
    allocation_amount := least(credit_row.remaining_amount, remaining_to_apply);
    update public.customer_credits cc
    set remaining_amount = cc.remaining_amount - allocation_amount
    where cc.id = credit_row.id and cc.business_id = current_business;
    insert into public.customer_credit_allocations (business_id, application_id, credit_id, amount)
    values (current_business, application_id, credit_row.id, allocation_amount);
    remaining_to_apply := remaining_to_apply - allocation_amount;
    exit when remaining_to_apply <= 0;
  end loop;
  if remaining_to_apply > 0 then raise exception 'Credit is no longer available; refresh and try again'; end if;

  insert into public.invoice_payments (
    business_id, invoice_id, amount, payment_date, payment_method,
    reference, notes, client_request_id, created_by
  ) values (
    current_business, invoice_row.id, normalized_amount, p_payment_date, 'customer_credit',
    normalized_reference, normalized_notes, p_client_request_id, auth.uid()
  );
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    current_business, auth.uid(), 'apply', 'customer_credit_application', application_id,
    jsonb_build_object('invoice_id', invoice_row.id, 'amount', normalized_amount)
  );
  return application_id;
end;
$$;

revoke execute on function public.get_invoice_credit_balance(uuid) from public;
grant execute on function public.get_invoice_credit_balance(uuid) to authenticated;
revoke execute on function public.apply_customer_credit(uuid, numeric, date, text, text, uuid) from public;
grant execute on function public.apply_customer_credit(uuid, numeric, date, text, text, uuid) to authenticated;

create or replace function public.get_payment_register(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_payment_method text default null,
  p_date_from date default null,
  p_date_to date default null
)
returns table (
  id uuid, invoice_id uuid, invoice_number text, customer_name text,
  invoice_total numeric, invoice_status text, amount numeric, payment_date date,
  payment_method text, reference text, notes text, created_by uuid,
  created_at timestamptz, total_rows bigint
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
  if p_payment_method is not null and p_payment_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other', 'customer_credit') then raise exception 'Payment method is invalid'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then raise exception 'Payment date range is invalid'; end if;
  return query
  select ip.id, ip.invoice_id, i.invoice_number, i.customer_name, i.total, i.status,
    ip.amount, ip.payment_date, ip.payment_method, ip.reference, ip.notes,
    ip.created_by, ip.created_at, count(*) over ()
  from public.invoice_payments ip
  join public.invoices i on i.id = ip.invoice_id and i.business_id = current_business
  where ip.business_id = current_business
    and (p_payment_method is null or ip.payment_method = p_payment_method)
    and (p_date_from is null or ip.payment_date >= p_date_from)
    and (p_date_to is null or ip.payment_date <= p_date_to)
    and (normalized_search is null
      or i.invoice_number ilike '%' || normalized_search || '%'
      or i.customer_name ilike '%' || normalized_search || '%'
      or coalesce(ip.reference, '') ilike '%' || normalized_search || '%')
  order by ip.payment_date desc, ip.created_at desc, ip.id desc
  offset (page_number - 1) * page_size limit page_size;
end;
$$;

revoke execute on function public.get_payment_register(integer, integer, text, text, date, date) from public;
grant execute on function public.get_payment_register(integer, integer, text, text, date, date) to authenticated;

create or replace function public.get_payment_summary()
returns table (collected_today numeric, collected_this_month numeric, outstanding_amount numeric, paid_invoice_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare current_business uuid := public.current_business_id();
begin
  if auth.uid() is null or not public.has_permission('payments.view') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  return query
  with issued_invoices as (
    select i.id, i.total from public.invoices i where i.business_id = current_business and i.status = 'issued'
  ), payment_totals as (
    select ip.invoice_id, coalesce(sum(ip.amount), 0) as paid
    from public.invoice_payments ip where ip.business_id = current_business group by ip.invoice_id
  ), return_totals as (
    select sr.invoice_id, coalesce(sum(sr.total), 0) as returned, coalesce(sum(sr.refund_amount), 0) as refunded
    from public.sales_returns sr where sr.business_id = current_business and sr.status = 'posted' group by sr.invoice_id
  ), balances as (
    select ii.id, greatest(ii.total - coalesce(rt.returned, 0), 0) as net_total,
      greatest(coalesce(pt.paid, 0) - coalesce(rt.refunded, 0), 0) as net_paid
    from issued_invoices ii left join payment_totals pt on pt.invoice_id = ii.id left join return_totals rt on rt.invoice_id = ii.id
  )
  select
    (select coalesce(sum(ip.amount), 0) from public.invoice_payments ip where ip.business_id = current_business and ip.payment_method <> 'customer_credit' and ip.payment_date = current_date),
    (select coalesce(sum(ip.amount), 0) from public.invoice_payments ip where ip.business_id = current_business and ip.payment_method <> 'customer_credit' and ip.payment_date >= date_trunc('month', current_date)::date and ip.payment_date <= current_date),
    (select coalesce(sum(greatest(b.net_total - b.net_paid, 0)), 0) from balances b),
    (select count(*) from balances b where b.net_paid >= b.net_total);
end;
$$;

revoke execute on function public.get_payment_summary() from public;
grant execute on function public.get_payment_summary() to authenticated;

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
      where so.business_id = current_business
        and so.status in ('submitted', 'partially_fulfilled', 'fulfilled')
        and so.order_date between p_start_date and p_end_date
      group by so.customer_id
    ), sales as (
      select so.customer_id, sum(i.total) as total_sales
      from public.invoices i
      join public.sales_orders so on so.id = i.sales_order_id and so.business_id = current_business
      where i.business_id = current_business and i.status = 'issued' and i.invoice_date between p_start_date and p_end_date
      group by so.customer_id
    ), payments as (
      select so.customer_id, sum(ip.amount) as total_paid
      from public.invoice_payments ip
      join public.invoices i on i.id = ip.invoice_id and i.business_id = current_business
      join public.sales_orders so on so.id = i.sales_order_id and so.business_id = current_business
      where ip.business_id = current_business and ip.payment_date between p_start_date and p_end_date
      group by so.customer_id
    ), returns as (
      select so.customer_id, sum(sr.total) as total_returns, sum(sr.refund_amount) as total_refunds
      from public.sales_returns sr
      join public.invoices i on i.id = sr.invoice_id and i.business_id = current_business
      join public.sales_orders so on so.id = i.sales_order_id and so.business_id = current_business
      where sr.business_id = current_business and sr.status = 'posted' and sr.return_date between p_start_date and p_end_date
      group by so.customer_id
    ), credits as (
      select cc.customer_id, sum(cc.remaining_amount) as available_credit
      from public.customer_credits cc
      where cc.business_id = current_business and cc.remaining_amount > 0
      group by cc.customer_id
    ), rows as (
      select
        c.id as customer_id,
        c.name as customer_name,
        coalesce(o.total_orders, 0) as total_orders,
        round(coalesce(s.total_sales, 0), 2) as total_sales,
        round(coalesce(p.total_paid, 0), 2) as total_paid,
        round(coalesce(r.total_returns, 0), 2) as total_returns,
        round(coalesce(cr.available_credit, 0), 2) as credit_notes,
        round(greatest(greatest(coalesce(s.total_sales, 0) - coalesce(r.total_returns, 0), 0) - greatest(coalesce(p.total_paid, 0) - coalesce(r.total_refunds, 0), 0), 0), 2) as outstanding_balance
      from public.customers c
      left join order_totals o on o.customer_id = c.id
      left join sales s on s.customer_id = c.id
      left join payments p on p.customer_id = c.id
      left join returns r on r.customer_id = c.id
      left join credits cr on cr.customer_id = c.id
      where c.business_id = current_business
        and (coalesce(trim(p_search), '') = '' or lower(c.name) like '%' || lower(trim(p_search)) || '%' or lower(coalesce(c.email, '')) like '%' || lower(trim(p_search)) || '%' or lower(coalesce(c.mobile, '')) like '%' || lower(trim(p_search)) || '%')
        and (coalesce(o.total_orders, 0) > 0 or coalesce(s.total_sales, 0) > 0 or coalesce(p.total_paid, 0) > 0 or coalesce(r.total_returns, 0) > 0 or coalesce(cr.available_credit, 0) > 0)
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
