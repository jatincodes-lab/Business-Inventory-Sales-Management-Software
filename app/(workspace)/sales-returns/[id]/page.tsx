import { notFound, redirect } from "next/navigation";

import { SalesReturnDetail, type SalesReturnDetailRecord } from "@/components/sales-return-detail";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const instant = false;

export default async function SalesReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id; if (!UUID.test(id)) notFound();
  const context = await getWorkspaceContext(); assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: canPost, error: postPermissionError }, { data: canCancel, error: createPermissionError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "returns.view" }),
    context.supabase.rpc("has_permission", { required_permission: "returns.post" }),
    context.supabase.rpc("has_permission", { required_permission: "returns.create" }),
  ]);
  if (permissionError || postPermissionError || createPermissionError) redirect("/auth/error?error=Unable%20to%20verify%20return%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Sales return</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view sales returns.</p></div>;
  const { data, error } = await context.supabase.from("sales_returns").select("id,return_number,return_date,status,reason,notes,subtotal,tax_total,total,refund_amount,refund_method,refund_reference,invoice:invoices(id,invoice_number,customer_name),warehouse:warehouses(name,address),lines:sales_return_lines(id,item_name,item_sku,quantity,unit_price,line_total)").eq("business_id", context.businessId).eq("id", id).maybeSingle();
  if (error) redirect("/auth/error?error=Unable%20to%20load%20sales%20return"); if (!data) notFound();
  return <SalesReturnDetail returnDocument={data as unknown as SalesReturnDetailRecord} canPost={canPost === true} canCancel={canCancel === true} />;
}
