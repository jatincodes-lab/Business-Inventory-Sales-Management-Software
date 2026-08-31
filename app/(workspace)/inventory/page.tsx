import { redirect } from "next/navigation";

import { StockOverview, type StockBalanceRecord } from "@/components/stock-overview";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;
function validPage(value: string | undefined) { const page = Number(value); return Number.isInteger(page) && page > 0 ? page : 1; }
export const instant = false;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "inventory.view" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Stock overview</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view inventory.</p></div>;
  const page = validPage((await searchParams).page);
  const from = (page - 1) * PAGE_SIZE;
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    context.supabase.from("stock_balances").select("item_id,warehouse_id,quantity,reserved_quantity,updated_at,item:items(sku,name,reorder_level,unit:units(name,code)),warehouse:warehouses(name)").eq("business_id", context.businessId).order("updated_at", { ascending: false }).range(from, from + PAGE_SIZE),
    context.supabase.from("stock_balances").select("item_id", { count: "exact", head: true }).eq("business_id", context.businessId),
  ]);
  const rows = (data ?? []) as unknown as StockBalanceRecord[];
  return <StockOverview rows={rows.slice(0, PAGE_SIZE)} page={page} hasNext={rows.length > PAGE_SIZE} totalRows={count || 0} loadError={Boolean(error || countError)} />;
}
