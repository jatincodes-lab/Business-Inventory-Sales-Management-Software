insert into public.permissions (permission_key, description) values
  ('returns.view', 'View sales returns'),
  ('returns.create', 'Create sales returns'),
  ('returns.post', 'Post sales returns')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_key = 'owner'
  and p.permission_key in ('returns.view', 'returns.create', 'returns.post')
on conflict do nothing;

create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  source_fulfillment_id uuid not null references public.sales_fulfillments(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  return_number text not null check (char_length(trim(return_number)) between 1 and 40),
  return_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  reason text not null check (char_length(trim(reason)) between 2 and 200),
  notes text check (notes is null or char_length(trim(notes)) between 1 and 1000),
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,2) not null default 0 check (tax_total >= 0),
  total numeric(18,2) not null default 0 check (total >= 0),
  refund_amount numeric(18,2) not null default 0 check (refund_amount >= 0),
  refund_method text check (refund_method is null or refund_method in ('cash', 'card', 'upi', 'bank_transfer', 'other')),
  refund_reference text check (refund_reference is null or char_length(trim(refund_reference)) between 1 and 100),
  created_by uuid not null references auth.users(id),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, return_number)
);

create table public.sales_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete restrict,
  source_fulfillment_line_id uuid not null references public.sales_fulfillment_lines(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  item_name text not null,
  item_sku text not null,
  quantity numeric(18,3) not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null check (tax_rate between 0 and 100),
  line_subtotal numeric(18,2) not null check (line_subtotal >= 0),
  line_tax numeric(18,2) not null check (line_tax >= 0),
  line_total numeric(18,2) not null check (line_total >= 0),
  unique (return_id, invoice_line_id)
);

create index sales_returns_business_status_idx on public.sales_returns (business_id, status, return_date desc, created_at desc);
create index sales_returns_invoice_idx on public.sales_returns (invoice_id, status, created_at desc);
create index sales_return_lines_return_idx on public.sales_return_lines (return_id);
create index sales_return_lines_invoice_idx on public.sales_return_lines (invoice_line_id, return_id);

alter table public.sales_returns enable row level security;
alter table public.sales_return_lines enable row level security;

create policy "return viewers can read sales returns"
  on public.sales_returns for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('returns.view'));

create policy "return viewers can read sales return lines"
  on public.sales_return_lines for select to authenticated
  using (exists (
    select 1 from public.sales_returns r
    where r.id = return_id
      and r.business_id = public.current_business_id()
      and public.has_permission('returns.view')
  ));

create or replace function public.create_sales_return(
  p_invoice_id uuid,
  p_return_number text,
  p_return_date date,
  p_reason text,
  p_notes text default null,
  p_refund_amount numeric default 0,
  p_refund_method text default null,
  p_refund_reference text default null,
  p_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  invoice_row public.invoices%rowtype;
  fulfillment_row public.sales_fulfillments%rowtype;
  return_id uuid;
  next_number bigint;
  return_number text;
  normalized_reason text := nullif(trim(p_reason), '');
  normalized_notes text := nullif(trim(p_notes), '');
  normalized_refund_reference text := nullif(trim(p_refund_reference), '');
  return_subtotal numeric(18,2);
  return_tax numeric(18,2);
  return_total numeric(18,2);
  paid_amount numeric(18,2);
  refunded_amount numeric(18,2);
begin
  if auth.uid() is null or not public.has_permission('returns.create') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_invoice_id is null then raise exception 'Invoice is required'; end if;
  if p_return_number is null or char_length(trim(p_return_number)) < 1 or char_length(trim(p_return_number)) > 40 or trim(p_return_number) !~ '^[A-Za-z0-9/_-]+$' then raise exception 'Return number is invalid'; end if;
  if p_return_date is null then raise exception 'Return date is required'; end if;
  if p_reason is null or char_length(normalized_reason) < 2 or char_length(normalized_reason) > 200 then raise exception 'Return reason is required'; end if;
  if normalized_notes is not null and char_length(normalized_notes) > 1000 then raise exception 'Return notes are too long'; end if;
  if p_refund_amount is null or p_refund_amount < 0 or p_refund_amount <> round(p_refund_amount, 2) then raise exception 'Refund amount is invalid'; end if;
  if p_refund_method is not null and p_refund_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other') then raise exception 'Refund method is invalid'; end if;
  if p_refund_amount > 0 and p_refund_method is null then raise exception 'Refund method is required'; end if;
  if p_refund_amount = 0 and p_refund_method is not null then raise exception 'Refund method is not needed when refund amount is zero'; end if;
  if normalized_refund_reference is not null and char_length(normalized_refund_reference) > 100 then raise exception 'Refund reference is too long'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then raise exception 'Add between 1 and 200 return lines'; end if;

  select * into invoice_row
  from public.invoices i
  where i.id = p_invoice_id and i.business_id = current_business
  for update;
  if invoice_row.id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status <> 'issued' then raise exception 'Only issued invoices can be returned'; end if;
  if p_return_date < invoice_row.invoice_date or p_return_date > current_date then raise exception 'Return date must be between the invoice date and today'; end if;

  select * into fulfillment_row
  from public.sales_fulfillments sf
  where sf.id = invoice_row.source_fulfillment_id
    and sf.business_id = current_business
    and sf.status = 'posted';
  if fulfillment_row.id is null then raise exception 'Source fulfillment is not available'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(invoice_line_id uuid, quantity numeric)
    left join public.invoice_lines il on il.id = line.invoice_line_id and il.invoice_id = invoice_row.id
    where il.id is null or line.quantity is null or line.quantity <= 0 or line.quantity > il.quantity - coalesce((
      select sum(srl.quantity)
      from public.sales_return_lines srl
      join public.sales_returns sr on sr.id = srl.return_id and sr.status = 'posted'
      where srl.invoice_line_id = il.id
    ), 0)
  ) then raise exception 'One or more return quantities exceed the remaining sold quantity'; end if;
  if (select count(*) from jsonb_to_recordset(p_lines) as line(invoice_line_id uuid)) <> (select count(distinct line.invoice_line_id) from jsonb_to_recordset(p_lines) as line(invoice_line_id uuid)) then raise exception 'An invoice line can appear only once per return'; end if;

  select coalesce(max((substring(sr.return_number from '[0-9]+$'))::bigint), 0) + 1
  into next_number
  from public.sales_returns sr
  where sr.business_id = current_business;
  return_number := trim(p_return_number);

  insert into public.sales_returns (business_id, invoice_id, source_fulfillment_id, warehouse_id, return_number, return_date, reason, notes, refund_amount, refund_method, refund_reference, created_by)
  values (current_business, invoice_row.id, fulfillment_row.id, fulfillment_row.warehouse_id, return_number, p_return_date, normalized_reason, normalized_notes, round(p_refund_amount, 2), p_refund_method, normalized_refund_reference, auth.uid())
  returning id into return_id;

  insert into public.sales_return_lines (return_id, invoice_line_id, source_fulfillment_line_id, item_id, item_name, item_sku, quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total)
  select return_id, il.id, il.source_fulfillment_line_id, il.item_id, il.item_name, il.item_sku, line.quantity, il.unit_price, il.tax_rate,
    round(line.quantity * il.unit_price, 2),
    round(round(line.quantity * il.unit_price, 2) * il.tax_rate / 100, 2),
    round(round(line.quantity * il.unit_price, 2) + round(round(line.quantity * il.unit_price, 2) * il.tax_rate / 100, 2), 2)
  from jsonb_to_recordset(p_lines) as line(invoice_line_id uuid, quantity numeric)
  join public.invoice_lines il on il.id = line.invoice_line_id and il.invoice_id = invoice_row.id;

  select coalesce(sum(srl.line_subtotal), 0), coalesce(sum(srl.line_tax), 0), coalesce(sum(srl.line_total), 0)
  into return_subtotal, return_tax, return_total
  from public.sales_return_lines srl
  where srl.return_id = return_id;
  if p_refund_amount > return_total then raise exception 'Refund amount cannot exceed the return total'; end if;
  select coalesce(sum(ip.amount), 0) into paid_amount from public.invoice_payments ip where ip.invoice_id = invoice_row.id;
  select coalesce(sum(sr.refund_amount), 0) into refunded_amount from public.sales_returns sr where sr.invoice_id = invoice_row.id and sr.status = 'posted';
  if p_refund_amount > paid_amount - refunded_amount then raise exception 'Refund amount exceeds the refundable paid balance'; end if;
  update public.sales_returns sr set subtotal = return_subtotal, tax_total = return_tax, total = return_total where sr.id = return_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'sales_return', return_id, jsonb_build_object('return_number', return_number, 'invoice_id', invoice_row.id, 'total', return_total, 'refund_amount', p_refund_amount));
  return return_id;
exception
  when unique_violation then raise exception 'That return number already exists';
end;
$$;

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
  stock_quantity numeric;
  stock_reserved_quantity numeric;
  paid_amount numeric(18,2);
  refunded_amount numeric(18,2);
begin
  if auth.uid() is null or not public.has_permission('returns.post') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  select * into return_row from public.sales_returns sr where sr.id = p_return_id and sr.business_id = current_business for update;
  if return_row.id is null then raise exception 'Sales return not found'; end if;
  if return_row.status <> 'draft' then raise exception 'Only draft returns can be posted'; end if;
  select * into invoice_row from public.invoices i where i.id = return_row.invoice_id and i.business_id = current_business for update;
  if invoice_row.id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status <> 'issued' then raise exception 'Only issued invoices can be returned'; end if;
  if not exists (select 1 from public.warehouses w where w.id = return_row.warehouse_id and w.business_id = current_business and w.is_active) then raise exception 'The original warehouse is no longer active'; end if;
  if not exists (select 1 from public.sales_return_lines srl where srl.return_id = return_row.id) then raise exception 'Sales return must contain at least one line'; end if;
  if exists (
    select 1 from public.sales_return_lines srl
    join public.invoice_lines il on il.id = srl.invoice_line_id and il.invoice_id = invoice_row.id
    where srl.return_id = return_row.id and srl.quantity > il.quantity - coalesce((select sum(prl.quantity) from public.sales_return_lines prl join public.sales_returns pr on pr.id = prl.return_id and pr.status = 'posted' where prl.invoice_line_id = il.id), 0)
  ) then raise exception 'One or more return quantities are no longer available; refresh and try again'; end if;
  select coalesce(sum(ip.amount), 0) into paid_amount from public.invoice_payments ip where ip.invoice_id = invoice_row.id;
  select coalesce(sum(sr.refund_amount), 0) into refunded_amount from public.sales_returns sr where sr.invoice_id = invoice_row.id and sr.status = 'posted';
  if return_row.refund_amount > paid_amount - refunded_amount then raise exception 'Refund amount exceeds the refundable paid balance'; end if;

  for return_line in select srl.* from public.sales_return_lines srl where srl.return_id = return_row.id order by srl.item_id, srl.id loop
    insert into public.stock_balances (business_id, warehouse_id, item_id, quantity)
    values (current_business, return_row.warehouse_id, return_line.item_id, 0)
    on conflict (business_id, warehouse_id, item_id) do nothing;
    select sb.quantity, sb.reserved_quantity into stock_quantity, stock_reserved_quantity
    from public.stock_balances sb
    where sb.business_id = current_business and sb.warehouse_id = return_row.warehouse_id and sb.item_id = return_line.item_id
    for update;
    update public.stock_balances sb set quantity = stock_quantity + return_line.quantity, updated_at = now()
    where sb.business_id = current_business and sb.warehouse_id = return_row.warehouse_id and sb.item_id = return_line.item_id;
    insert into public.stock_movements (business_id, warehouse_id, item_id, quantity_delta, movement_type, source_type, source_id, source_line_id, performed_by)
    values (current_business, return_row.warehouse_id, return_line.item_id, return_line.quantity, 'return', 'sales_return', return_row.id, return_line.id, auth.uid());
  end loop;
  update public.sales_returns sr set status = 'posted', posted_by = auth.uid(), posted_at = now() where sr.id = return_row.id and sr.status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'post', 'sales_return', return_row.id, jsonb_build_object('return_number', return_row.return_number, 'invoice_id', invoice_row.id, 'total', return_row.total, 'refund_amount', return_row.refund_amount));
end;
$$;

create or replace function public.cancel_sales_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  return_row public.sales_returns%rowtype;
begin
  if auth.uid() is null or not public.has_permission('returns.create') then raise exception 'Not authorized'; end if;
  select * into return_row from public.sales_returns sr where sr.id = p_return_id and sr.business_id = current_business for update;
  if return_row.id is null then raise exception 'Sales return not found'; end if;
  if return_row.status <> 'draft' then raise exception 'Only draft returns can be cancelled'; end if;
  update public.sales_returns sr set status = 'cancelled', cancelled_at = now() where sr.id = return_row.id and sr.status = 'draft';
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'cancel', 'sales_return', return_row.id, jsonb_build_object('return_number', return_row.return_number));
end;
$$;

-- Keep future payments from charging for quantities already returned.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
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
  existing_payment public.invoice_payments%rowtype;
  payment_id uuid;
  normalized_amount numeric(18,2);
  normalized_reference text := nullif(trim(p_reference), '');
  normalized_notes text := nullif(trim(p_notes), '');
  paid_amount numeric(18,2);
  returned_amount numeric(18,2);
  refunded_amount numeric(18,2);
begin
  if auth.uid() is null or not public.has_permission('payments.create') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_invoice_id is null then raise exception 'Invoice is required'; end if;
  if p_client_request_id is null then raise exception 'Payment request ID is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Payment amount must be greater than zero and have at most two decimal places'; end if;
  normalized_amount := round(p_amount, 2);
  if p_payment_date is null then raise exception 'Payment date is required'; end if;
  if p_payment_date > current_date then raise exception 'Payment date cannot be in the future'; end if;
  if p_payment_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other') then raise exception 'Payment method is invalid'; end if;
  if length(normalized_reference) > 100 then raise exception 'Payment reference is too long'; end if;
  if length(normalized_notes) > 1000 then raise exception 'Payment notes are too long'; end if;

  select * into invoice_row from public.invoices i where i.id = p_invoice_id and i.business_id = current_business for update;
  if invoice_row.id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status <> 'issued' then raise exception 'Cancelled invoices cannot receive payments'; end if;
  if p_payment_date < invoice_row.invoice_date then raise exception 'Payment date cannot be before the invoice date'; end if;
  select * into existing_payment from public.invoice_payments ip where ip.invoice_id = invoice_row.id and ip.client_request_id = p_client_request_id;
  if existing_payment.id is not null then
    if existing_payment.amount = normalized_amount and existing_payment.payment_date = p_payment_date and existing_payment.payment_method = p_payment_method and existing_payment.reference is not distinct from normalized_reference and existing_payment.notes is not distinct from normalized_notes then return existing_payment.id; end if;
    raise exception 'Payment request ID was already used with different details';
  end if;
  select coalesce(sum(ip.amount), 0) into paid_amount from public.invoice_payments ip where ip.invoice_id = invoice_row.id;
  select coalesce(sum(sr.total), 0), coalesce(sum(sr.refund_amount), 0) into returned_amount, refunded_amount from public.sales_returns sr where sr.invoice_id = invoice_row.id and sr.status = 'posted';
  if paid_amount + normalized_amount > invoice_row.total - returned_amount + refunded_amount then raise exception 'Payment exceeds the remaining invoice balance'; end if;

  insert into public.invoice_payments (business_id, invoice_id, amount, payment_date, payment_method, reference, notes, client_request_id, created_by)
  values (current_business, invoice_row.id, normalized_amount, p_payment_date, p_payment_method, normalized_reference, normalized_notes, p_client_request_id, auth.uid())
  returning id into payment_id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'invoice_payment', payment_id, jsonb_build_object('invoice_id', invoice_row.id, 'amount', normalized_amount, 'payment_method', p_payment_method));
  return payment_id;
end;
$$;

revoke execute on function public.create_sales_return(uuid, text, date, text, text, numeric, text, text, jsonb) from public;
revoke execute on function public.post_sales_return(uuid) from public;
revoke execute on function public.cancel_sales_return(uuid) from public;
grant execute on function public.create_sales_return(uuid, text, date, text, text, numeric, text, text, jsonb) to authenticated;
grant execute on function public.post_sales_return(uuid) to authenticated;
grant execute on function public.cancel_sales_return(uuid) to authenticated;
revoke execute on function public.record_invoice_payment(uuid, numeric, date, text, text, text, uuid) from public;
grant execute on function public.record_invoice_payment(uuid, numeric, date, text, text, text, uuid) to authenticated;
