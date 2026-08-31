import { redirect } from "next/navigation";

import { InvoiceList, type InvoiceListRecord } from "@/components/invoice-list";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;
function pageNumber(value: string | undefined) { const page = Number(value); return Number.isInteger(page) && page > 0 ? page : 1; }
export const instant = false;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: canViewPayments, error: paymentPermissionError }, { data: canViewReturns, error: returnPermissionError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "invoices.view" }),
    context.supabase.rpc("has_permission", { required_permission: "payments.view" }),
    context.supabase.rpc("has_permission", { required_permission: "returns.view" }),
  ]);
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20invoice%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Invoices</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view invoices.</p></div>;
  if (paymentPermissionError || returnPermissionError) redirect("/auth/error?error=Unable%20to%20verify%20invoice%20permissions");
  const page = pageNumber((await searchParams).page);
  const from = (page - 1) * PAGE_SIZE;
  const invoiceSelect = `id,invoice_number,invoice_date,status,customer_name,total,source_fulfillment_id,sales_order_id${canViewPayments === true ? ",payments:invoice_payments(amount)" : ""}${canViewReturns === true ? ",returns:sales_returns(total,refund_amount,status)" : ""}`;
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    context.supabase.from("invoices").select(invoiceSelect).eq("business_id", context.businessId).order("invoice_date", { ascending: false }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE),
    context.supabase.from("invoices").select("id", { count: "exact", head: true }).eq("business_id", context.businessId),
  ]);
  const rows = ((data ?? []) as unknown as InvoiceListRecord[]).map((row) => ({ ...row, payments: Array.isArray(row.payments) ? row.payments : [] }));
  return <InvoiceList rows={rows.slice(0, PAGE_SIZE)} page={page} hasNext={rows.length > PAGE_SIZE} totalRows={count || 0} loadError={Boolean(error || countError)} canViewPayments={canViewPayments === true} />;
}
