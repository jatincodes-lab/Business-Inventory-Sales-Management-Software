import { redirect } from "next/navigation";

import { PaymentRegister, type PaymentRegisterRow, type PaymentSummary } from "@/components/payment-register";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;
const methods = ["cash", "card", "upi", "bank_transfer", "other", "customer_credit"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pageNumber(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000000) : 1;
}

function validDate(value: string | undefined) {
  if (!value || !ISO_DATE.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? "" : value;
}

export const instant = false;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; method?: string; from?: string; to?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "payments.view" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20payment%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Payments</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view payments.</p></div>;

  const params = await searchParams;
  const page = pageNumber(params.page);
  const search = (params.q || "").trim().slice(0, 80);
  const method = methods.includes(params.method as (typeof methods)[number]) ? params.method as (typeof methods)[number] : "";
  const from = validDate(params.from);
  const to = validDate(params.to);
  const filterError = (params.q && params.q.length > 80) ? "Search is limited to 80 characters." : (params.from && !from) || (params.to && !to) ? "Enter valid dates for the payment filter." : from && to && from > to ? "The start date cannot be after the end date." : undefined;
  const [{ data: summaryData, error: summaryError }, { data: registerData, error: registerError }] = await Promise.all([
    context.supabase.rpc("get_payment_summary"),
    filterError ? Promise.resolve({ data: [], error: null }) : context.supabase.rpc("get_payment_register", { p_page: page, p_page_size: PAGE_SIZE, p_search: search || null, p_payment_method: method || null, p_date_from: from || null, p_date_to: to || null }),
  ]);
  const rows = (registerData ?? []) as unknown as PaymentRegisterRow[];
  const summary = (Array.isArray(summaryData) ? summaryData[0] : null) as PaymentSummary | null;
  const totalRows = Number(rows[0]?.total_rows || 0);
  return <PaymentRegister rows={rows} summary={summary} page={page} totalRows={totalRows} filters={{ search, method, from, to }} loadError={Boolean(summaryError || registerError)} filterError={filterError} />;
}
