create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null check (payment_method in ('cash', 'card', 'upi', 'bank_transfer', 'other')),
  reference text check (reference is null or char_length(trim(reference)) between 1 and 100),
  notes text check (notes is null or char_length(trim(notes)) between 1 and 1000),
  client_request_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (invoice_id, client_request_id)
);

create index invoice_payments_business_date_idx on public.invoice_payments (business_id, payment_date desc, created_at desc);
create index invoice_payments_invoice_date_idx on public.invoice_payments (invoice_id, payment_date desc, created_at desc);

alter table public.invoice_payments enable row level security;

create policy "payment viewers can read invoice payments"
  on public.invoice_payments for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('payments.view'));

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
begin
  if auth.uid() is null or not public.has_permission('payments.create') then
    raise exception 'Not authorized';
  end if;
  if current_business is null then raise exception 'Workspace not found'; end if;
  if p_invoice_id is null then raise exception 'Invoice is required'; end if;
  if p_client_request_id is null then raise exception 'Payment request ID is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Payment amount can have at most two decimal places'; end if;
  normalized_amount := round(p_amount, 2);
  if p_payment_date is null then raise exception 'Payment date is required'; end if;
  if p_payment_date > current_date then raise exception 'Payment date cannot be in the future'; end if;
  if length(normalized_reference) > 100 then raise exception 'Payment reference is too long'; end if;
  if length(normalized_notes) > 1000 then raise exception 'Payment notes are too long'; end if;
  if p_payment_method not in ('cash', 'card', 'upi', 'bank_transfer', 'other') then raise exception 'Payment method is invalid'; end if;

  select * into invoice_row
  from public.invoices i
  where i.id = p_invoice_id and i.business_id = current_business
  for update;
  if invoice_row.id is null then raise exception 'Invoice not found'; end if;
  if invoice_row.status <> 'issued' then raise exception 'Cancelled invoices cannot receive payments'; end if;
  if p_payment_date < invoice_row.invoice_date then raise exception 'Payment date cannot be before the invoice date'; end if;

  select * into existing_payment
  from public.invoice_payments ip
  where ip.invoice_id = invoice_row.id and ip.client_request_id = p_client_request_id;
  if existing_payment.id is not null then
    if existing_payment.amount = normalized_amount
      and existing_payment.payment_date = p_payment_date
      and existing_payment.payment_method = p_payment_method
      and existing_payment.reference is not distinct from normalized_reference
      and existing_payment.notes is not distinct from normalized_notes then
      return existing_payment.id;
    end if;
    raise exception 'Payment request ID was already used with different details';
  end if;

  select coalesce(sum(ip.amount), 0)
  into paid_amount
  from public.invoice_payments ip
  where ip.invoice_id = invoice_row.id and ip.business_id = current_business;
  if paid_amount + normalized_amount > invoice_row.total then
    raise exception 'Payment exceeds the remaining invoice balance';
  end if;

  insert into public.invoice_payments (
    business_id, invoice_id, amount, payment_date, payment_method,
    reference, notes, client_request_id, created_by
  )
  values (
    current_business, invoice_row.id, normalized_amount, p_payment_date, p_payment_method,
    normalized_reference, normalized_notes, p_client_request_id, auth.uid()
  )
  returning id into payment_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    current_business,
    auth.uid(),
    'create',
    'invoice_payment',
    payment_id,
    jsonb_build_object('invoice_id', invoice_row.id, 'amount', normalized_amount, 'payment_method', p_payment_method)
  );
  return payment_id;
end;
$$;

revoke execute on function public.record_invoice_payment(uuid, numeric, date, text, text, text, uuid) from public;
grant execute on function public.record_invoice_payment(uuid, numeric, date, text, text, text, uuid) to authenticated;
