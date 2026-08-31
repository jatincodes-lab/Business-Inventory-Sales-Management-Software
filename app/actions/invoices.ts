"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type InvoiceActionResult = { ok: boolean; message: string; invoiceId?: string };
export type PaymentMethod = "cash" | "card" | "upi" | "bank_transfer" | "other";
export type PaymentActionResult = { ok: boolean; message: string; paymentId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "upi", "bank_transfer", "other"];

function contextError(status: "unauthenticated" | "needs_onboarding" | "error"): InvoiceActionResult {
  return { ok: false, message: status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before managing invoices." };
}

function paymentContextError(status: "unauthenticated" | "needs_onboarding" | "error"): PaymentActionResult {
  return { ok: false, message: status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before managing payments." };
}

export async function createInvoiceFromFulfillment(fulfillmentId: string): Promise<InvoiceActionResult> {
  if (!UUID.test(fulfillmentId)) return { ok: false, message: "This fulfillment ID is invalid." };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return contextError(context.status);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "invoices.create" });
  if (permissionError) return { ok: false, message: "Unable to verify invoice permissions." };
  if (allowed !== true) return { ok: false, message: "You do not have permission to create invoices." };
  const { data, error } = await context.supabase.rpc("create_invoice_from_fulfillment", { fulfillment_id: fulfillmentId });
  if (error || !data) {
    const message = error?.message || "";
    if (message.includes("Only posted")) return { ok: false, message: "Only a posted fulfillment can be invoiced." };
    if (message.includes("not found")) return { ok: false, message: "This fulfillment no longer exists." };
    if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to create invoices." };
    return { ok: false, message: "Unable to create the invoice. Refresh and try again." };
  }
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${data}`);
  revalidatePath(`/sales-fulfillments/${fulfillmentId}`);
  return { ok: true, message: "Invoice ready.", invoiceId: data };
}

export async function recordInvoicePayment(input: {
  invoiceId: string;
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference: string;
  notes: string;
  clientRequestId: string;
}): Promise<PaymentActionResult> {
  if (!UUID.test(input.invoiceId) || !UUID.test(input.clientRequestId)) return { ok: false, message: "This payment request is invalid." };
  if (!MONEY.test(input.amount) || input.amount.replace(/[.]/g, "").replace(/^0+/, "") === "") return { ok: false, message: "Enter a payment amount with up to two decimal places." };
  if (!DATE.test(input.paymentDate)) return { ok: false, message: "Enter a valid payment date." };
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { ok: false, message: "Select a valid payment method." };
  if (input.reference.length > 100 || input.notes.length > 1000) return { ok: false, message: "Payment details are too long." };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return paymentContextError(context.status);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "payments.create" });
  if (permissionError) return { ok: false, message: "Unable to verify payment permissions." };
  if (allowed !== true) return { ok: false, message: "You do not have permission to record payments." };

  const { data, error } = await context.supabase.rpc("record_invoice_payment", {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod,
    p_reference: input.reference.trim() || null,
    p_notes: input.notes.trim() || null,
    p_client_request_id: input.clientRequestId,
  });
  if (error || !data) {
    const message = error?.message || "";
    if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to record payments." };
    if (message.includes("not found")) return { ok: false, message: "This invoice no longer exists." };
    if (message.includes("Cancelled")) return { ok: false, message: "Cancelled invoices cannot receive payments." };
    if (message.includes("future")) return { ok: false, message: "Payment date cannot be in the future." };
    if (message.includes("before the invoice")) return { ok: false, message: "Payment date cannot be before the invoice date." };
    if (message.includes("remaining invoice balance")) return { ok: false, message: "Payment exceeds the remaining invoice balance." };
    if (message.includes("already used")) return { ok: false, message: "This payment was already submitted with different details." };
    if (message.includes("method")) return { ok: false, message: "Select a valid payment method." };
    return { ok: false, message: "Unable to record payment. Refresh and try again." };
  }
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${input.invoiceId}`);
  return { ok: true, message: "Payment recorded.", paymentId: data };
}
