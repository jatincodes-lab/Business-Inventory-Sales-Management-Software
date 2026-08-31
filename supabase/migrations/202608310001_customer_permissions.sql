drop policy if exists "business members can access customers" on public.customers;

create policy "customer viewers can read customers"
  on public.customers for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('customers.view'));

create policy "customer creators can add customers"
  on public.customers for insert to authenticated
  with check (business_id = public.current_business_id() and public.has_permission('customers.create'));

create policy "customer editors can update customers"
  on public.customers for update to authenticated
  using (business_id = public.current_business_id() and public.has_permission('customers.edit'))
  with check (business_id = public.current_business_id() and public.has_permission('customers.edit'));
