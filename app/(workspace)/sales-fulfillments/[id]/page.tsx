import { notFound, redirect } from "next/navigation";
import { SalesFulfillmentDetail, type SalesFulfillmentDetailRecord } from "@/components/sales-fulfillment-detail";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const instant = false;

export default async function SalesFulfillmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: canCreateInvoice, error: invoicePermissionError }, { data: fulfillment, error }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "sales.view" }),
    context.supabase.rpc("has_permission", { required_permission: "invoices.create" }),
    context.supabase.from("sales_fulfillments").select("id,fulfillment_number,fulfillment_date,status,notes,warehouse_id,warehouse:warehouses(name,address),sales_order:sales_orders(id,order_number,customer:customers(name)),invoice:invoices(id,invoice_number,status),lines:sales_fulfillment_lines(id,sales_order_line_id,item_id,quantity,item:items(name,sku,unit:units(code)))").eq("business_id", context.businessId).eq("id", id).maybeSingle(),
  ]);
  if (permissionError || invoicePermissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Fulfillment</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view fulfillments.</p></div>;
  if (error) redirect("/auth/error?error=Unable%20to%20load%20fulfillment");
  if (!fulfillment) notFound();
  const detailLines = (fulfillment.lines ?? []) as Array<{ id: string; sales_order_line_id: string; item_id: string }>;
  const itemIds = detailLines.map((line) => line.item_id);
  const orderLineIds = detailLines.map((line) => line.sales_order_line_id);
  const [{ data: balances, error: balanceError }, { data: reservations, error: reservationError }] = fulfillment.status === "draft" && itemIds.length > 0
    ? await Promise.all([
      context.supabase.from("stock_balances").select("item_id,quantity,reserved_quantity").eq("business_id", context.businessId).eq("warehouse_id", fulfillment.warehouse_id).in("item_id", itemIds),
      context.supabase.from("sales_order_reservations").select("sales_order_line_id,quantity,consumed_quantity,released_quantity").eq("business_id", context.businessId).eq("warehouse_id", fulfillment.warehouse_id).in("sales_order_line_id", orderLineIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const [{ data: canPost, error: postPermissionError }, { data: canEdit, error: editPermissionError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "sales.post" }),
    context.supabase.rpc("has_permission", { required_permission: "sales.edit" }),
  ]);
  if (postPermissionError || editPermissionError) redirect("/auth/error?error=Unable%20to%20verify%20fulfillment%20permissions");
  const balanceByItem = Object.fromEntries((balances ?? []).map((balance) => [balance.item_id, balance]));
  const reservationByLine = Object.fromEntries((reservations ?? []).map((reservation) => [reservation.sales_order_line_id, Math.max(0, Number(reservation.quantity) - Number(reservation.consumed_quantity || 0) - Number(reservation.released_quantity || 0))]));
  const stock = Object.fromEntries(detailLines.map((line) => { const balance = balanceByItem[line.item_id]; return [line.id, Math.max(0, Number(balance?.quantity || 0) - Number(balance?.reserved_quantity || 0) + Number(reservationByLine[line.sales_order_line_id] || 0))]; }));
  return <SalesFulfillmentDetail fulfillment={fulfillment as unknown as SalesFulfillmentDetailRecord} canPost={canPost === true} canEdit={canEdit === true} canCreateInvoice={canCreateInvoice === true} stock={stock} stockCheckAvailable={!balanceError && !reservationError} />;
}
