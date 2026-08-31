import { redirect } from "next/navigation";

import { StockMovementList, type StockMovementRecord } from "@/components/stock-movement-list";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validPage(value: string | undefined) { const page = Number(value); return Number.isInteger(page) && page > 0 ? page : 1; }
export const instant = false;

export default async function StockMovementsPage({ searchParams }: { searchParams: Promise<{ page?: string; item_id?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "inventory.view" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Stock movements</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view inventory.</p></div>;
  const params = await searchParams;
  const itemId = params.item_id && UUID_PATTERN.test(params.item_id) ? params.item_id : undefined;
  const page = validPage(params.page);
  const from = (page - 1) * PAGE_SIZE;
  let dataQuery = context.supabase.from("stock_movements").select("id,item_id,warehouse_id,quantity_delta,movement_type,source_type,source_id,created_at,item:items(sku,name),warehouse:warehouses(name)").eq("business_id", context.businessId).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE);
  let countQuery = context.supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("business_id", context.businessId);
  if (itemId) { dataQuery = dataQuery.eq("item_id", itemId); countQuery = countQuery.eq("item_id", itemId); }
  const [{ data, error }, { count, error: countError }] = await Promise.all([dataQuery, countQuery]);
  const rows = (data ?? []) as unknown as StockMovementRecord[];
  return <StockMovementList rows={rows.slice(0, PAGE_SIZE)} page={page} hasNext={rows.length > PAGE_SIZE} totalRows={count || 0} initialItemId={itemId} loadError={Boolean(error || countError)} />;
}
