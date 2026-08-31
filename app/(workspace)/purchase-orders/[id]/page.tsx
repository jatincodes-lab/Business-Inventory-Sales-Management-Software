import { notFound, redirect } from "next/navigation";

import { PurchaseOrderDetail, type PurchaseOrderDetailRecord } from "@/components/purchase-order-detail";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const instant = false;

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: canSubmit, error: submitPermissionError }, { data: canCreateReceipt, error: receiptPermissionError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "purchases.view" }),
    context.supabase.rpc("has_permission", { required_permission: "purchases.edit" }),
    context.supabase.rpc("has_permission", { required_permission: "receipts.create" }),
  ]);
  if (permissionError || submitPermissionError || receiptPermissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Purchase order</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view purchase orders.</p></div>;

  const { data, error } = await context.supabase.from("purchase_orders").select("id,order_number,order_date,delivery_date,reference,delivery_address,payment_terms_days,shipment_preference,notes,status,vendor:vendors(name,email,mobile,address,tax_id),lines:purchase_order_lines(id,ordered_quantity,received_quantity,unit_cost,tax_rate,item:items(sku,name,unit:units(name,code)))").eq("business_id", context.businessId).eq("id", id).maybeSingle();
  if (error) redirect("/auth/error?error=Unable%20to%20load%20purchase%20order");
  if (!data) notFound();
  return <PurchaseOrderDetail order={data as unknown as PurchaseOrderDetailRecord} canSubmit={canSubmit === true} canCreateReceipt={canCreateReceipt === true} />;
}
