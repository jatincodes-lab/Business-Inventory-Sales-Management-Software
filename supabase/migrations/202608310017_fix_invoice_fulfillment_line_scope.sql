create or replace function public.create_invoice_from_fulfillment(fulfillment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
  target_fulfillment_id alias for $1;
  fulfillment public.sales_fulfillments%rowtype;
  sales_order public.sales_orders%rowtype;
  customer public.customers%rowtype;
  business public.businesses%rowtype;
  existing_invoice_id uuid;
  new_invoice_id uuid;
  next_number bigint;
  invoice_number text;
  subtotal_amount numeric(18,2);
  tax_amount numeric(18,2);
  total_amount numeric(18,2);
begin
  if auth.uid() is null or not public.has_permission('invoices.create') then raise exception 'Not authorized'; end if;
  if current_business is null then raise exception 'Workspace not found'; end if;

  select * into fulfillment
  from public.sales_fulfillments sf
  where sf.id = target_fulfillment_id and sf.business_id = current_business
  for update;
  if fulfillment.id is null then raise exception 'Sales fulfillment not found'; end if;
  if fulfillment.status <> 'posted' then raise exception 'Only posted fulfillments can be invoiced'; end if;

  select i.id into existing_invoice_id
  from public.invoices i
  where i.source_fulfillment_id = fulfillment.id;
  if existing_invoice_id is not null then return existing_invoice_id; end if;

  select * into sales_order
  from public.sales_orders so
  where so.id = fulfillment.sales_order_id and so.business_id = current_business;
  if sales_order.id is null then raise exception 'Sales order not found'; end if;
  select * into customer
  from public.customers c
  where c.id = sales_order.customer_id and c.business_id = current_business;
  if customer.id is null then raise exception 'Customer not found'; end if;
  select * into business
  from public.businesses b
  where b.id = current_business
  for update;
  if business.id is null then raise exception 'Workspace not found'; end if;
  if not exists (select 1 from public.sales_fulfillment_lines sfl where sfl.fulfillment_id = fulfillment.id) then raise exception 'Sales fulfillment must contain at least one line'; end if;
  if exists (
    select 1
    from public.sales_fulfillment_lines sfl
    left join public.sales_order_lines sol on sol.id = sfl.sales_order_line_id and sol.sales_order_id = sales_order.id
    left join public.items i on i.id = sfl.item_id and i.business_id = current_business
    where sfl.fulfillment_id = fulfillment.id
      and (sol.id is null or i.id is null or sfl.quantity <= 0 or sfl.quantity > sol.ordered_quantity)
  ) then raise exception 'Sales fulfillment contains invalid invoice lines'; end if;

  select coalesce(max((substring(i.invoice_number from '[0-9]+$'))::bigint), 0) + 1
  into next_number
  from public.invoices i
  where i.business_id = current_business;
  invoice_number := 'INV-' || lpad(next_number::text, 5, '0');

  insert into public.invoices (
    business_id, source_fulfillment_id, sales_order_id, invoice_number, invoice_date,
    business_name, business_email, customer_name, customer_email, customer_mobile,
    customer_address, customer_tax_id, notes, created_by, issued_at
  )
  values (
    current_business,
    fulfillment.id,
    sales_order.id,
    invoice_number,
    fulfillment.fulfillment_date,
    business.name,
    nullif(auth.jwt() ->> 'email', ''),
    customer.name,
    customer.email,
    customer.mobile,
    customer.address,
    customer.tax_id,
    fulfillment.notes,
    auth.uid(),
    now()
  )
  returning id into new_invoice_id;

  insert into public.invoice_lines (
    invoice_id, source_fulfillment_line_id, item_id, item_name, item_sku, description,
    quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total
  )
  select
    new_invoice_id,
    sfl.id,
    sfl.item_id,
    i.name,
    i.sku,
    i.name || ' · ' || i.sku,
    sfl.quantity,
    sol.unit_price,
    sol.tax_rate,
    round(sfl.quantity * sol.unit_price, 2),
    round(round(sfl.quantity * sol.unit_price, 2) * sol.tax_rate / 100, 2),
    round(round(sfl.quantity * sol.unit_price, 2) + round(round(sfl.quantity * sol.unit_price, 2) * sol.tax_rate / 100, 2), 2)
  from public.sales_fulfillment_lines sfl
  join public.sales_order_lines sol on sol.id = sfl.sales_order_line_id and sol.sales_order_id = sales_order.id
  join public.items i on i.id = sfl.item_id and i.business_id = current_business
  where sfl.fulfillment_id = fulfillment.id;

  select coalesce(sum(il.line_subtotal), 0), coalesce(sum(il.line_tax), 0), coalesce(sum(il.line_total), 0)
  into subtotal_amount, tax_amount, total_amount
  from public.invoice_lines il
  where il.invoice_id = new_invoice_id;
  update public.invoices
  set subtotal = subtotal_amount, tax_total = tax_amount, total = total_amount
  where id = new_invoice_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (current_business, auth.uid(), 'create', 'invoice', new_invoice_id, jsonb_build_object('invoice_number', invoice_number, 'fulfillment_id', fulfillment.id));
  return new_invoice_id;
exception
  when unique_violation then
    select i.id into existing_invoice_id
    from public.invoices i
    where i.source_fulfillment_id = target_fulfillment_id;
    if existing_invoice_id is not null then return existing_invoice_id; end if;
    raise;
end;
$$;
