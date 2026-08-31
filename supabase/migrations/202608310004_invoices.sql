create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_fulfillment_id uuid not null references public.sales_fulfillments(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  invoice_number text not null check (char_length(trim(invoice_number)) between 1 and 40),
  invoice_date date not null default current_date,
  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  business_name text not null,
  business_email text,
  customer_name text not null,
  customer_email text,
  customer_mobile text,
  customer_address text,
  customer_tax_id text,
  notes text,
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,2) not null default 0 check (tax_total >= 0),
  total numeric(18,2) not null default 0 check (total >= 0),
  created_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, invoice_number),
  unique (source_fulfillment_id)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  source_fulfillment_line_id uuid not null references public.sales_fulfillment_lines(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  item_name text not null,
  item_sku text not null,
  description text,
  quantity numeric(18,3) not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null check (tax_rate between 0 and 100),
  line_subtotal numeric(18,2) not null check (line_subtotal >= 0),
  line_tax numeric(18,2) not null check (line_tax >= 0),
  line_total numeric(18,2) not null check (line_total >= 0),
  unique (invoice_id, source_fulfillment_line_id),
  unique (source_fulfillment_line_id)
);

create index invoices_business_date_idx on public.invoices (business_id, invoice_date desc, created_at desc);
create index invoices_business_status_idx on public.invoices (business_id, status, created_at desc);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy "invoice viewers can read invoices"
  on public.invoices for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('invoices.view'));

create policy "invoice viewers can read invoice lines"
  on public.invoice_lines for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and i.business_id = public.current_business_id()
      and public.has_permission('invoices.view')
  ));

create or replace function public.create_invoice_from_fulfillment(fulfillment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_business uuid := public.current_business_id();
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
  where sf.id = fulfillment_id and sf.business_id = current_business
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
    where sol.id is null or i.id is null or sfl.quantity <= 0 or sfl.quantity > sol.ordered_quantity
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
    where i.source_fulfillment_id = fulfillment_id;
    if existing_invoice_id is not null then return existing_invoice_id; end if;
    raise;
end;
$$;

revoke execute on function public.create_invoice_from_fulfillment(uuid) from public;
grant execute on function public.create_invoice_from_fulfillment(uuid) to authenticated;
