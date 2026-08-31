import { redirect } from "next/navigation";

import { SalesReturnList, type SalesReturnListRecord } from "@/components/sales-return-list";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;
function pageNumber(value: string | undefined) { const page = Number(value); return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000000) : 1; }
export const instant = false;

export default async function SalesReturnsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getWorkspaceContext(); assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "returns.view" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20return%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Sales returns</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view sales returns.</p></div>;
  const page = pageNumber((await searchParams).page); const from = (page - 1) * PAGE_SIZE;
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    context.supabase.from("sales_returns").select("id,return_number,return_date,status,total,refund_amount,invoice:invoices(id,invoice_number,customer_name)").eq("business_id", context.businessId).order("return_date", { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE),
    context.supabase.from("sales_returns").select("id", { count: "exact", head: true }).eq("business_id", context.businessId),
  ]);
  const rows = (data ?? []) as unknown as SalesReturnListRecord[];
  return <SalesReturnList rows={rows.slice(0, PAGE_SIZE)} page={page} hasNext={rows.length > PAGE_SIZE} totalRows={count || 0} loadError={Boolean(error || countError)} />;
}
