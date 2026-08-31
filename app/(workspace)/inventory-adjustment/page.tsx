import { redirect } from "next/navigation";

import { InventoryAdjustmentList, type AdjustmentListRecord } from "@/components/inventory-document-list";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;
function pageNumber(value: string | undefined) { const page = Number(value); return Number.isInteger(page) && page > 0 ? page : 1; }
export const instant = false;

export default async function InventoryAdjustmentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getWorkspaceContext(); assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "inventory.adjust" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Stock adjustments</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to manage stock adjustments.</p></div>;
  const page = pageNumber((await searchParams).page); const from = (page - 1) * PAGE_SIZE;
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    context.supabase.from("inventory_adjustments").select("id,adjustment_number,adjustment_date,reason,status,warehouse:warehouses(name)").eq("business_id", context.businessId).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE),
    context.supabase.from("inventory_adjustments").select("id", { count: "exact", head: true }).eq("business_id", context.businessId),
  ]);
  const rows = (data ?? []) as unknown as AdjustmentListRecord[];
  return <InventoryAdjustmentList rows={rows.slice(0, PAGE_SIZE)} page={page} hasNext={rows.length > PAGE_SIZE} totalRows={count || 0} loadError={Boolean(error || countError)} />;
}
