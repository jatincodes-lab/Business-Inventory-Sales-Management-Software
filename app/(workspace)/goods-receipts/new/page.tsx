import { notFound, redirect } from "next/navigation";

import { GoodsReceiptForm, type GoodsReceiptLineOption, type GoodsReceiptWarehouseOption } from "@/components/goods-receipt-form";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Relation<T> = T | T[] | null;
function one<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] : value; }
function nextReceiptNumber(value: string | null | undefined) { const match = value?.match(/(\d+)$/); return `GR-${String(match ? Number(match[1]) + 1 : 1).padStart(5, "0")}`; }

export const instant = false;

export default async function NewGoodsReceiptPage({ searchParams }: { searchParams: Promise<{ purchase_order_id?: string }> }) {
  const purchaseOrderId = (await searchParams).purchase_order_id || "";
  if (!UUID_PATTERN.test(purchaseOrderId)) notFound();
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "receipts.create" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">New goods receipt</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to create goods receipts.</p></div>;

  const [{ data: order, error: orderError }, { data: warehouses, error: warehousesError }, { data: latest, error: latestError }] = await Promise.all([
    context.supabase.from("purchase_orders").select("id,order_number,order_date,status,vendor:vendors(name),lines:purchase_order_lines(id,item_id,ordered_quantity,received_quantity,unit_cost,item:items(name,sku))").eq("business_id", context.businessId).eq("id", purchaseOrderId).in("status", ["submitted", "partially_received"]).maybeSingle(),
    context.supabase.from("warehouses").select("id,name,address").eq("business_id", context.businessId).eq("is_active", true).order("name").limit(500),
    context.supabase.from("goods_receipts").select("receipt_number").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (orderError || warehousesError || latestError) redirect("/auth/error?error=Unable%20to%20load%20goods%20receipt%20data");
  if (!order) notFound();
  const vendor = one(order.vendor as Relation<{ name: string }>);
  const lineOptions = ((order.lines ?? []) as unknown as Array<{ id: string; item_id: string; ordered_quantity: string | number; received_quantity: string | number; unit_cost: string | number; item: Relation<{ name: string; sku: string }> }>).map((line) => { const item = one(line.item); const remaining = Number(line.ordered_quantity) - Number(line.received_quantity); return { id: line.id, item_id: line.item_id, item_name: item?.name || "Item unavailable", item_sku: item?.sku || "-", remaining_quantity: remaining, unit_cost: line.unit_cost }; }).filter((line) => Number.isFinite(Number(line.remaining_quantity)) && Number(line.remaining_quantity) > 0) as GoodsReceiptLineOption[];
  return <GoodsReceiptForm purchaseOrderId={order.id} orderNumber={order.order_number} orderDate={order.order_date} vendorName={vendor?.name || "vendor"} warehouses={(warehouses ?? []) as GoodsReceiptWarehouseOption[]} lines={lineOptions} suggestedReceiptNumber={nextReceiptNumber(latest?.receipt_number)} />;
}
