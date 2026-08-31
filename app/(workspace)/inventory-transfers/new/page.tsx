import { redirect } from "next/navigation";

import type { InventoryOption, StockOption, WarehouseOption } from "@/components/inventory-adjustment-form";
import { StockTransferForm } from "@/components/stock-transfer-form";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

function nextNumber(value: string | null | undefined) { const match = value?.match(/(\d+)$/); return `TR-${String(match ? Number(match[1]) + 1 : 1).padStart(5, "0")}`; }
type Relation<T> = T | T[] | null;
function one<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] : value; }
export const instant = false;

export default async function NewStockTransferPage() {
  const context = await getWorkspaceContext(); assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "inventory.transfer" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">New stock transfer</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to create transfers.</p></div>;
  const [{ data: warehouses, error: warehouseError }, { data: items, error: itemError }, { data: balances, error: balanceError }, { data: latest, error: latestError }] = await Promise.all([
    context.supabase.from("warehouses").select("id,name").eq("business_id", context.businessId).eq("is_active", true).order("name").limit(500),
    context.supabase.from("items").select("id,name,sku,unit:units(code)").eq("business_id", context.businessId).eq("is_active", true).order("name").limit(2000),
    context.supabase.from("stock_balances").select("warehouse_id,item_id,quantity").eq("business_id", context.businessId).limit(10000),
    context.supabase.from("stock_transfers").select("transfer_number").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (warehouseError || itemError || balanceError || latestError) redirect("/auth/error?error=Unable%20to%20load%20transfer%20data");
  const itemOptions = ((items ?? []) as unknown as Array<{ id: string; name: string; sku: string; unit: Relation<{ code: string }> }>).map((item) => ({ id: item.id, name: item.name, sku: item.sku, unit_code: one(item.unit)?.code || "" })) as InventoryOption[];
  return <StockTransferForm warehouses={(warehouses ?? []) as WarehouseOption[]} items={itemOptions} balances={(balances ?? []) as StockOption[]} suggestedNumber={nextNumber(latest?.transfer_number)} initialDate={new Date().toISOString().slice(0, 10)} />;
}
