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
  invoice_customer_id uuid;
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

  select so.customer_id into invoice_customer_id
  from public.sales_orders so
  where so.id = invoice_row.sales_order_id and so.business_id = current_business;
  if invoice_customer_id is null then raise exception 'Customer not found'; end if;
  perform 1 from public.customers c where c.id = invoice_customer_id and c.business_id = current_business for update;
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
    and cc.customer_id = invoice_customer_id
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
    where cc.business_id = current_business and cc.customer_id = invoice_customer_id
      and cc.source_invoice_id = invoice_row.id and cc.remaining_amount > 0
  ) then
    raise exception 'Credit from this invoice is already reflected in its balance';
  end if;

  insert into public.customer_credit_applications (
    business_id, customer_id, invoice_id, amount, payment_date,
    reference, notes, client_request_id, created_by
  ) values (
    current_business, invoice_customer_id, invoice_row.id, normalized_amount, p_payment_date,
    normalized_reference, normalized_notes, p_client_request_id, auth.uid()
  ) returning id into application_id;

  remaining_to_apply := normalized_amount;
  for credit_row in
    select cc.*
    from public.customer_credits cc
    where cc.business_id = current_business
      and cc.customer_id = invoice_customer_id
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

revoke execute on function public.apply_customer_credit(uuid, numeric, date, text, text, uuid) from public;
grant execute on function public.apply_customer_credit(uuid, numeric, date, text, text, uuid) to authenticated;
