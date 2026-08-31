import { redirect } from "next/navigation";

import { PurchaseOrderForm, type PurchaseOrderItemOption, type PurchaseOrderVendorOption } from "@/components/purchase-order-form";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

function nextOrderNumber(value: string | null | undefined) {
  const match = value?.match(/(\d+)$/);
  const next = match ? Number(match[1]) + 1 : 1;
  return `PO-${String(next).padStart(5, "0")}`;
}

export const instant = false;

export default async function NewPurchaseOrderPage() {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "purchases.create" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">New purchase order</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to create purchase orders.</p></div>;

  const [{ data: vendors, error: vendorsError }, { data: items, error: itemsError }, { data: latest, error: latestError }] = await Promise.all([
    context.supabase.from("vendors").select("id,name,address,payment_terms_days").eq("business_id", context.businessId).eq("is_active", true).order("name").limit(500),
    context.supabase.from("items").select("id,sku,name,purchase_price,tax_rate").eq("business_id", context.businessId).eq("is_active", true).order("name").limit(1000),
    context.supabase.from("purchase_orders").select("order_number").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (vendorsError || itemsError || latestError) redirect("/auth/error?error=Unable%20to%20load%20purchase%20order%20data");

  return <PurchaseOrderForm vendors={(vendors ?? []) as PurchaseOrderVendorOption[]} items={(items ?? []) as PurchaseOrderItemOption[]} suggestedOrderNumber={nextOrderNumber(latest?.order_number)} />;
}
