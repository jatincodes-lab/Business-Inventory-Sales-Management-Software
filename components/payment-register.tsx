import Link from "next/link";
import { CreditCard, Filter, ReceiptText, Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export type PaymentRegisterRow = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  invoice_total: string | number;
  invoice_status: "issued" | "cancelled";
  amount: string | number;
  payment_date: string;
  payment_method: "cash" | "card" | "upi" | "bank_transfer" | "other" | "customer_credit";
  reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  total_rows: number;
};

export type PaymentSummary = { collected_today: string | number; collected_this_month: string | number; outstanding_amount: string | number; paid_invoice_count: number };

const methodLabels: Record<PaymentRegisterRow["payment_method"], string> = { cash: "Cash", card: "Card", upi: "UPI", bank_transfer: "Bank transfer", other: "Other", customer_credit: "Customer credit" };
const statusClasses: Record<PaymentRegisterRow["invoice_status"], string> = { issued: "bg-[#e6f8ee] text-[#08752e]", cancelled: "bg-[#feecec] text-[#b42318]" };

function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: string | number) { return number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function date(value: string) { const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }

function query(filters: { search: string; method: string; from: string; to: string }, page: number) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.search) params.set("q", filters.search);
  if (filters.method) params.set("method", filters.method);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const value = params.toString();
  return value ? `/payments?${value}` : "/payments";
}

export function PaymentRegister({ rows, summary, page, totalRows, filters, loadError, filterError }: { rows: PaymentRegisterRow[]; summary: PaymentSummary | null; page: number; totalRows: number; filters: { search: string; method: string; from: string; to: string }; loadError: boolean; filterError?: string }) {
  const hasNext = page * 50 < totalRows;
  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Sales</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">Payments</h1><p className="mt-1 text-sm text-[#64748b]">Every customer payment recorded against an invoice.</p></div><Link href="/invoices" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white hover:bg-[#008a34]"><ReceiptText className="size-4" />Open invoices</Link></div>
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-[#e2e8f0] bg-white p-5"><p className="text-sm font-medium text-[#64748b]">Collected today</p><p className="mt-4 font-mono text-2xl font-semibold text-[#0f172a]">₹{money(summary?.collected_today || 0)}</p><p className="mt-2 text-xs text-[#94a3b8]">Payments received today</p></div><div className="rounded-xl border border-[#e2e8f0] bg-white p-5"><p className="text-sm font-medium text-[#64748b]">This month</p><p className="mt-4 font-mono text-2xl font-semibold text-[#0f172a]">₹{money(summary?.collected_this_month || 0)}</p><p className="mt-2 text-xs text-[#94a3b8]">Payments received this month</p></div><div className="rounded-xl border border-[#e2e8f0] bg-white p-5"><p className="text-sm font-medium text-[#64748b]">Outstanding</p><p className="mt-4 font-mono text-2xl font-semibold text-[#0f172a]">₹{money(summary?.outstanding_amount || 0)}</p><p className="mt-2 text-xs text-[#94a3b8]">Across issued invoices</p></div><div className="rounded-xl border border-[#e2e8f0] bg-white p-5"><p className="text-sm font-medium text-[#64748b]">Paid invoices</p><p className="mt-4 font-mono text-2xl font-semibold text-[#0f172a]">{number(summary?.paid_invoice_count || 0).toLocaleString("en-IN")}</p><p className="mt-2 text-xs text-[#94a3b8]">Invoices paid in full</p></div></section>
    <section className="rounded-xl border border-[#e2e8f0] bg-white"><form method="get" action="/payments" className="flex flex-col gap-3 border-b border-[#f1f5f9] px-5 py-4 xl:flex-row xl:items-end"><div className="min-w-0 flex-1"><label htmlFor="payment-search" className="mb-2 block text-xs font-medium text-[#64748b]">Search</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" /><Input id="payment-search" name="q" defaultValue={filters.search} maxLength={80} placeholder="Invoice, customer, or reference" className="h-11 pl-9" /></div></div><div className="grid gap-3 sm:grid-cols-2 xl:flex xl:items-end"><div><label htmlFor="payment-method" className="mb-2 block text-xs font-medium text-[#64748b]">Method</label><select id="payment-method" name="method" defaultValue={filters.method} className="h-11 w-full min-w-36 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">All methods</option><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></div><div><label htmlFor="payment-from" className="mb-2 block text-xs font-medium text-[#64748b]">From</label><Input id="payment-from" name="from" type="date" defaultValue={filters.from} max={filters.to || undefined} className="h-11" /></div><div><label htmlFor="payment-to" className="mb-2 block text-xs font-medium text-[#64748b]">To</label><Input id="payment-to" name="to" type="date" defaultValue={filters.to} min={filters.from || undefined} className="h-11" /></div><button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white hover:bg-[#008a34]"><Filter className="size-4" />Apply</button><Link href="/payments" className="inline-flex h-11 items-center justify-center rounded-lg border border-[#e2e8f0] px-4 text-sm font-semibold text-[#64748b] hover:bg-[#f8fafc]">Clear</Link></div></form>
      {filterError && <p role="alert" className="m-5 rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{filterError}</p>}
      {loadError ? <div className="grid min-h-64 place-items-center p-8 text-center"><CreditCard className="mb-3 size-7 text-[#94a3b8]" /><div><p className="text-sm font-medium text-[#b42318]">Unable to load payments.</p><p className="mt-1 text-xs text-[#64748b]">Refresh the page and try again.</p></div></div> : rows.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><CreditCard className="mx-auto mb-3 size-7 text-[#94a3b8]" /><p className="text-sm font-medium text-[#334155]">No payments found</p><p className="mt-1 text-xs text-[#94a3b8]">Payments will appear here after they are recorded on an invoice.</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="border-b border-[#f1f5f9] bg-[#fbfcfd] text-xs text-[#64748b]"><tr><th className="px-5 py-3 text-left font-medium">Payment date</th><th className="px-5 py-3 text-left font-medium">Invoice</th><th className="px-5 py-3 text-left font-medium">Customer</th><th className="px-5 py-3 text-left font-medium">Method</th><th className="px-5 py-3 text-left font-medium">Reference</th><th className="px-5 py-3 text-right font-medium">Amount</th><th className="px-5 py-3 text-center font-medium">Invoice status</th><th className="px-5 py-3 text-center font-medium">Receipt</th></tr></thead><tbody className="divide-y divide-[#f1f5f9]">{rows.map((row) => <tr key={row.id} className="hover:bg-[#fbfcfd]"><td className="px-5 py-4 text-xs text-[#64748b]">{date(row.payment_date)}</td><td className="px-5 py-4"><Link href={`/invoices/${row.invoice_id}`} className="font-medium text-[#00a63e] hover:underline">{row.invoice_number}</Link></td><td className="px-5 py-4 text-[#334155]">{row.customer_name}</td><td className="px-5 py-4 text-[#334155]">{methodLabels[row.payment_method]}</td><td className="max-w-48 truncate px-5 py-4 text-xs text-[#64748b]" title={row.reference || undefined}>{row.reference || "-"}</td><td className="px-5 py-4 text-right font-mono text-xs font-semibold text-[#0f172a]">₹{money(row.amount)}</td><td className="px-5 py-4 text-center"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses[row.invoice_status]}`}>{row.invoice_status === "issued" ? "Issued" : "Cancelled"}</span></td><td className="px-5 py-4 text-center"><Link href={`/payments/${row.id}`} aria-label={`Open receipt for payment on ${date(row.payment_date)}`} className="inline-grid size-9 place-items-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#00a63e]"><ReceiptText className="size-4" /></Link></td></tr>)}</tbody></table></div>}
      {(page > 1 || hasNext) && <div className="flex items-center justify-between border-t border-[#f1f5f9] px-5 py-4"><span className="text-xs text-[#64748b]">Showing {rows.length} of {totalRows} payments · Page {page}</span><div className="flex gap-2">{page > 1 && <Link href={query(filters, page - 1)} className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc]">Previous</Link>}{hasNext && <Link href={query(filters, page + 1)} className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]">Next</Link>}</div></div>}
    </section>
  </div>;
}
