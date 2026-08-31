drop policy if exists "business members can access stock balances" on public.stock_balances;
drop policy if exists "inventory viewers can read stock balances" on public.stock_balances;
create policy "inventory viewers can read stock balances"
  on public.stock_balances for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('inventory.view'));

drop policy if exists "business members can read stock movements" on public.stock_movements;
drop policy if exists "inventory viewers can read stock movements" on public.stock_movements;
create policy "inventory viewers can read stock movements"
  on public.stock_movements for select to authenticated
  using (business_id = public.current_business_id() and public.has_permission('inventory.view'));
