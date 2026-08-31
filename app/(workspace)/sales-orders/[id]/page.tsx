import { notFound, redirect } from "next/navigation";
import { SalesOrderDetail, type SalesOrderDetailRecord } from "@/components/sales-order-detail";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const instant = false;

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: canEdit, error: editPermissionError }, { data: canCreate, error: createPermissionError }, { data: order, error }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "sales.view" }),
    context.supabase.rpc("has_permission", { required_permission: "sales.edit" }),
    context.supabase.rpc("has_permission", { required_permission: "sales.create" }),
    context.supabase.from("sales_orders").select("id,order_number,order_date,status,notes,customer:customers(name,email,mobile,address),lines:sales_order_lines(id,item_id,ordered_quantity,fulfilled_quantity,unit_price,tax_rate,item:items(name,sku,unit:units(code)),reservations:sales_order_reservations(warehouse_id,quantity,consumed_quantity,released_quantity,warehouse:warehouses(name))),fulfillments:sales_fulfillments(id,fulfillment_number,fulfillment_date,status,warehouse:warehouses(name))").eq("business_id", context.businessId).eq("id", id).maybeSingle(),
  ]);
  if (permissionError || editPermissionError || createPermissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Sales order</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view sales orders.</p></div>;
  if (error) redirect("/auth/error?error=Unable%20to%20load%20sales%20order");
  if (!order) notFound();
  return <SalesOrderDetail order={order as unknown as SalesOrderDetailRecord} canEdit={canEdit === true} canCreateFulfillment={canCreate === true} />;
}
