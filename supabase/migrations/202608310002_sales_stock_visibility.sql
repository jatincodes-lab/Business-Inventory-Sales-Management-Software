create policy "sales users can read stock balances"
  on public.stock_balances for select to authenticated
  using (
    business_id = public.current_business_id()
    and (
      public.has_permission('sales.view')
      or public.has_permission('sales.create')
      or public.has_permission('sales.post')
    )
  );
