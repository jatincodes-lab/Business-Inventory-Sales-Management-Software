import { notFound, redirect } from "next/navigation";

import { GoodsReceiptDetail, type GoodsReceiptDetailRecord } from "@/components/goods-receipt-detail";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const instant = false;

export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: canPost, error: postPermissionError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "receipts.view" }),
    context.supabase.rpc("has_permission", { required_permission: "receipts.post" }),
  ]);
  if (permissionError || postPermissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Goods receipt</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view goods receipts.</p></div>;
  const { data, error } = await context.supabase.from("goods_receipts").select("id,receipt_number,receipt_date,notes,status,warehouse:warehouses(name,address),purchase_order:purchase_orders(id,order_number,vendor:vendors(name)),lines:goods_receipt_lines(id,quantity,unit_cost,item:items(name,sku))").eq("business_id", context.businessId).eq("id", id).maybeSingle();
  if (error) redirect("/auth/error?error=Unable%20to%20load%20goods%20receipt");
  if (!data) notFound();
  return <GoodsReceiptDetail receipt={data as unknown as GoodsReceiptDetailRecord} canPost={canPost === true} />;
}
