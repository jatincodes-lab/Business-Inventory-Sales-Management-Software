import { redirect } from "next/navigation";

import { PurchaseOrderList, type PurchaseOrderListRecord } from "@/components/purchase-order-list";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;

function validPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const instant = false;

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "purchases.view" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) {
    return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Purchase orders</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view purchase orders.</p></div>;
  }

  const page = validPage((await searchParams).page);
  const from = (page - 1) * PAGE_SIZE;
  const [{ data, error }, totalResult, openResult, receivedResult, todayResult] = await Promise.all([
    context.supabase.from("purchase_orders").select("id,order_number,order_date,delivery_date,reference,status,vendor:vendors(name),lines:purchase_order_lines(ordered_quantity,received_quantity,unit_cost,tax_rate)").eq("business_id", context.businessId).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE),
    context.supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("business_id", context.businessId),
    context.supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).in("status", ["draft", "submitted", "partially_received"]),
    context.supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("status", "received"),
    context.supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("order_date", new Date().toISOString().slice(0, 10)),
  ]);

  const records = (data ?? []) as unknown as PurchaseOrderListRecord[];
  const hasNext = records.length > PAGE_SIZE;
  const stats = {
    total: totalResult.count || 0,
    open: openResult.count || 0,
    received: receivedResult.count || 0,
    today: todayResult.count || 0,
  };

  const countError = totalResult.error || openResult.error || receivedResult.error || todayResult.error;
  return <PurchaseOrderList rows={records.slice(0, PAGE_SIZE)} page={page} hasNext={hasNext} loadError={error || countError ? "Unable to load purchase orders." : undefined} stats={stats} />;
}
