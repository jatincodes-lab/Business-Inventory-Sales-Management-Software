import { notFound, redirect } from "next/navigation";

import { InventoryAdjustmentDetail, type InventoryAdjustmentDetailRecord } from "@/components/inventory-adjustment-detail";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const instant = false;
export default async function InventoryAdjustmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id; if (!UUID_PATTERN.test(id)) notFound();
  const context = await getWorkspaceContext(); assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: adjustment, error }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "inventory.adjust" }),
    context.supabase.from("inventory_adjustments").select("id,adjustment_number,adjustment_date,reason,notes,status,warehouse:warehouses(name,address),lines:inventory_adjustment_lines(id,item_id,quantity_delta,item:items(name,sku,unit:units(code)))").eq("business_id", context.businessId).eq("id", id).maybeSingle(),
  ]);
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Stock adjustment</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view adjustments.</p></div>;
  if (error) redirect("/auth/error?error=Unable%20to%20load%20adjustment");
  if (!adjustment) notFound();
  return <InventoryAdjustmentDetail adjustment={adjustment as unknown as InventoryAdjustmentDetailRecord} canPost={allowed === true} />;
}
