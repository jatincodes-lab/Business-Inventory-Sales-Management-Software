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
  new_return_id uuid;
  normalized_return_number text := trim(p_return_number);
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
  if p_return_number is null or char_length(normalized_return_number) < 1 or char_length(normalized_return_number) > 40 or normalized_return_number !~ '^[A-Za-z0-9/_-]+$' then raise exception 'Return number is invalid'; end if;
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

  insert into public.sales_returns (business_id, invoice_id, source_fulfillment_id, warehouse_id, return_number, return_date, reason, notes, refund_amount, refund_method, refund_reference, created_by)
  values (current_business, invoice_row.id, fulfillment_row.id, fulfillment_row.warehouse_id, normalized_return_number, p_return_date, normalized_reason, normalized_notes, round(p_refund_amount, 2), p_refund_method, normalized_refund_reference, auth.uid())
  returning id into new_return_id;

  insert into public.sales_return_lines (return_id, invoice_line_id, source_fulfillment_line_id, item_id, item_name, item_sku, quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total)
  select new_return_id, il.id, il.source_fulfillment_line_id, il.item_id, il.item_name, il.item_sku, line.quantity, il.unit_price, il.tax_rate,
    round(line.quantity * il.unit_price, 2),
    round(round(line.quantity * il.unit_price, 2) * il.tax_rate / 100, 2),
    round(round(line.quantity * il.unit_price, 2) + round(round(line.quantity * il.unit_price, 2) * il.tax_rate / 100, 2), 2)
  from jsonb_to_recordset(p_lines) as line(invoice_line_id uuid, quantity numeric)
  join public.invoice_lines il on il.id = line.invoice_line_id and il.invoice_id = invoice_row.id;

  select coalesce(sum(srl.line_subtotal), 0), coalesce(sum(srl.line_tax), 0), coalesce(sum(srl.line_total), 0)
  into return_subtotal, return_tax, return_total
  from public.sales_return_lines srl
  where srl.return_id = new_return_id;
  if p_refund_amount > return_total then raise exception 'Refund amount cannot exceed the return total'; end if;
  select coalesce(sum(ip.amount), 0) into paid_amount from public.invoice_payments ip where ip.invoice_id = invoice_row.id;
  select coalesce(sum(sr.refund_amount), 0) into refunded_amount from public.sales_returns sr where sr.invoice_id = invoice_row.id and sr.status = 'posted';
  if p_refund_amount > paid_amount - refunded_amount then raise exception 'Refund amount exceeds the refundable paid balance'; end if;
  update public.sales_returns sr set subtotal = return_subtotal, tax_total = return_tax, total = return_total where sr.id = new_return_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'sales_return', new_return_id, jsonb_build_object('return_number', normalized_return_number, 'invoice_id', invoice_row.id, 'total', return_total, 'refund_amount', p_refund_amount));
  return new_return_id;
exception
  when unique_violation then raise exception 'That return number already exists';
end;
$$;

revoke execute on function public.create_sales_return(uuid, text, date, text, text, numeric, text, text, jsonb) from public;
grant execute on function public.create_sales_return(uuid, text, date, text, text, numeric, text, text, jsonb) to authenticated;
