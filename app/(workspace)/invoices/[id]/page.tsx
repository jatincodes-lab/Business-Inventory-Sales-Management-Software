import { notFound, redirect } from "next/navigation";

import { InvoiceDetail, type InvoiceDetailRecord } from "@/components/invoice-detail";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const instant = false;

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data: canViewPayments, error: paymentViewError }, { data: canRecordPayment, error: paymentCreateError }, { data: canCreateReturn, error: returnCreateError }, { data: canViewReturns, error: returnViewError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "invoices.view" }),
    context.supabase.rpc("has_permission", { required_permission: "payments.view" }),
    context.supabase.rpc("has_permission", { required_permission: "payments.create" }),
    context.supabase.rpc("has_permission", { required_permission: "returns.create" }),
    context.supabase.rpc("has_permission", { required_permission: "returns.view" }),
  ]);
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20invoice%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Invoice</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view invoices.</p></div>;
  if (paymentViewError || paymentCreateError || returnCreateError || returnViewError) redirect("/auth/error?error=Unable%20to%20verify%20invoice%20permissions");
  const invoiceQuery = context.supabase.from("invoices").select(`id,invoice_number,invoice_date,status,business_name,business_email,customer_name,customer_email,customer_mobile,customer_address,customer_tax_id,notes,subtotal,tax_total,total,source_fulfillment_id,sales_order_id,lines:invoice_lines(id,item_name,item_sku,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total)${canViewPayments === true ? ",payments:invoice_payments(id,amount,payment_date,payment_method,reference,notes,created_at)" : ""}${canViewReturns === true ? ",returns:sales_returns(total,refund_amount,status)" : ""}`).eq("business_id", context.businessId).eq("id", id).maybeSingle();
  const { data: invoice, error } = await invoiceQuery;
  if (error) redirect("/auth/error?error=Unable%20to%20load%20invoice");
  if (!invoice) notFound();
  const { data: creditBalance, error: creditError } = canViewPayments === true ? await context.supabase.rpc("get_invoice_credit_balance", { p_invoice_id: id }) : { data: 0, error: null };
  const customerCreditAvailable = creditError ? 0 : Math.max(Number(creditBalance) || 0, 0);
  return <InvoiceDetail invoice={invoice as unknown as InvoiceDetailRecord} canViewPayments={canViewPayments === true} canRecordPayment={canRecordPayment === true} canCreateReturn={canCreateReturn === true} canViewReturns={canViewReturns === true} customerCreditAvailable={customerCreditAvailable} />;
}
