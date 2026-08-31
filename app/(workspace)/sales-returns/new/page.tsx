import { notFound, redirect } from "next/navigation";

import { SalesReturnForm, type SalesReturnLineOption } from "@/components/sales-return-form";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_DATE = /^\d{4}-\d{2}-\d{2}$/;
function nextNumber(value: string | null | undefined) { const match = value?.match(/(\d+)$/); return `RET-${String((match ? Number(match[1]) : 0) + 1).padStart(5, "0")}`; }
function validToday() { const today = new Date().toISOString().slice(0, 10); return PAGE_DATE.test(today) ? today : ""; }
export const instant = false;

export default async function NewSalesReturnPage({ searchParams }: { searchParams: Promise<{ invoice_id?: string }> }) {
  const invoiceId = (await searchParams).invoice_id || ""; if (!UUID.test(invoiceId)) notFound();
  const context = await getWorkspaceContext(); assertWorkspace(context);
  const [{ data: invoiceView, error: invoicePermissionError }, { data: canCreate, error: createPermissionError }, { data: canViewReturns, error: returnPermissionError }, { data: canViewPayments, error: paymentPermissionError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "invoices.view" }),
    context.supabase.rpc("has_permission", { required_permission: "returns.create" }),
    context.supabase.rpc("has_permission", { required_permission: "returns.view" }),
    context.supabase.rpc("has_permission", { required_permission: "payments.view" }),
  ]);
  if (invoicePermissionError || createPermissionError || returnPermissionError || paymentPermissionError) redirect("/auth/error?error=Unable%20to%20verify%20return%20permissions");
  if (invoiceView !== true || canCreate !== true || canViewReturns !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">New sales return</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to create sales returns.</p></div>;
  const [{ data: invoice, error: invoiceError }, { data: latest, error: latestError }] = await Promise.all([
    context.supabase.from("invoices").select(`id,invoice_number,invoice_date,status,customer_name,source_fulfillment_id,lines:invoice_lines(id,item_name,item_sku,quantity,unit_price,tax_rate)${canViewPayments === true ? ",payments:invoice_payments(amount)" : ""},returns:sales_returns(status,refund_amount,lines:sales_return_lines(invoice_line_id,quantity))`).eq("business_id", context.businessId).eq("id", invoiceId).eq("status", "issued").maybeSingle(),
    context.supabase.from("sales_returns").select("return_number").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (invoiceError || latestError) redirect("/auth/error?error=Unable%20to%20load%20return%20data"); if (!invoice) notFound();
  const raw = invoice as unknown as { id: string; invoice_number: string; invoice_date: string; customer_name: string; lines: Array<{ id: string; item_name: string; item_sku: string; quantity: string | number; unit_price: string | number; tax_rate: string | number }>; payments?: Array<{ amount: string | number }>; returns: Array<{ status: string; refund_amount: string | number; lines: Array<{ invoice_line_id: string; quantity: string | number }> }> };
  const postedReturns = (raw.returns || []).filter((item) => item.status === "posted");
  const lines = raw.lines.map((line) => { const returned = postedReturns.reduce((sum, item) => sum + item.lines.filter((returnLine) => returnLine.invoice_line_id === line.id).reduce((lineSum, returnLine) => lineSum + Number(returnLine.quantity), 0), 0); return { ...line, remaining_quantity: Math.max(0, Number(line.quantity) - returned) }; }).filter((line) => Number.isFinite(line.remaining_quantity) && line.remaining_quantity > 0) as SalesReturnLineOption[];
  const paid = (raw.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0); const refunded = postedReturns.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0); const refundableAmount = Math.max(0, Math.round((paid - refunded) * 100) / 100);
  return <SalesReturnForm invoiceId={raw.id} invoiceNumber={raw.invoice_number} customerName={raw.customer_name} invoiceDate={raw.invoice_date} lines={lines} suggestedNumber={nextNumber(latest?.return_number)} initialDate={validToday()} refundableAmount={refundableAmount} />;
}
