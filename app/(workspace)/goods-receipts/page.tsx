import { redirect } from "next/navigation";

import { GoodsReceiptList, type GoodsReceiptListRecord } from "@/components/goods-receipt-list";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

export const instant = false;

export default async function GoodsReceiptsPage() {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "receipts.view" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Goods receipts</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view goods receipts.</p></div>;

  const [{ data, error }, totalResult, draftResult, postedResult, todayResult] = await Promise.all([
    context.supabase.from("goods_receipts").select("id,receipt_number,receipt_date,status,warehouse:warehouses(name),purchase_order:purchase_orders(order_number,vendor:vendors(name)),lines:goods_receipt_lines(quantity)").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(500),
    context.supabase.from("goods_receipts").select("id", { count: "exact", head: true }).eq("business_id", context.businessId),
    context.supabase.from("goods_receipts").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("status", "draft"),
    context.supabase.from("goods_receipts").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("status", "posted"),
    context.supabase.from("goods_receipts").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("receipt_date", new Date().toISOString().slice(0, 10)),
  ]);
  const countError = totalResult.error || draftResult.error || postedResult.error || todayResult.error;
  if (error || countError) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center"><h1 className="text-lg font-semibold text-[#0f172a]">Goods receipts could not load</h1><p className="mt-2 text-sm text-[#64748b]">Refresh the page and try again.</p></div>;
  const rows = (data ?? []) as unknown as GoodsReceiptListRecord[];
  return <GoodsReceiptList rows={rows} stats={{ total: totalResult.count || 0, drafts: draftResult.count || 0, posted: postedResult.count || 0, today: todayResult.count || 0 }} />;
}
