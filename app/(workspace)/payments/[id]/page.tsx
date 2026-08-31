import { notFound, redirect } from "next/navigation";

import { PaymentReceipt, type PaymentReceiptRecord } from "@/components/payment-receipt";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const instant = false;

export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!UUID.test(id)) notFound();
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [{ data: allowed, error: permissionError }, { data, error }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "payments.view" }),
    context.supabase.from("invoice_payments").select("id,amount,payment_date,payment_method,reference,notes,invoice:invoices(id,invoice_number,invoice_date,business_name,customer_name,customer_email,customer_mobile,customer_address)").eq("business_id", context.businessId).eq("id", id).maybeSingle(),
  ]);
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20payment%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Payment receipt</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view payment receipts.</p></div>;
  if (error) redirect("/auth/error?error=Unable%20to%20load%20payment%20receipt");
  if (!data || !data.invoice) notFound();
  const { invoice, ...payment } = data as unknown as PaymentReceiptRecord["payment"] & { invoice: PaymentReceiptRecord["invoice"] };
  return <PaymentReceipt record={{ payment, invoice }} />;
}
