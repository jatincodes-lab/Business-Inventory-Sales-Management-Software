"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, Filter, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PurchaseOrderListRecord = {
  id: string;
  order_number: string;
  order_date: string;
  delivery_date: string | null;
  reference: string | null;
  status: "draft" | "submitted" | "partially_received" | "received" | "cancelled";
  vendor: { name: string } | { name: string }[] | null;
  lines: Array<{
    ordered_quantity: string | number;
    received_quantity: string | number;
    unit_cost: string | number;
    tax_rate: string | number;
  }>;
};

const statusLabels: Record<PurchaseOrderListRecord["status"], string> = {
  draft: "Draft",
  submitted: "Submitted",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

function vendorName(vendor: PurchaseOrderListRecord["vendor"]) {
  return Array.isArray(vendor) ? vendor[0]?.name || "-" : vendor?.name || "-";
}

function number(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function total(order: PurchaseOrderListRecord) {
  return order.lines.reduce((sum, line) => sum + number(line.ordered_quantity) * number(line.unit_cost) * (1 + number(line.tax_rate) / 100), 0);
}

function received(order: PurchaseOrderListRecord) {
  return order.lines.reduce((sum, line) => sum + number(line.received_quantity), 0);
}

function statusClass(status: PurchaseOrderListRecord["status"]) {
  if (status === "received") return "bg-[#e6f8ee] text-[#08752e]";
  if (status === "partially_received") return "bg-[#fff7df] text-[#9a6700]";
  if (status === "cancelled") return "bg-[#feecec] text-[#b42318]";
  if (status === "submitted") return "bg-[#eaf4ff] text-[#1769aa]";
  return "bg-[#f1f5f9] text-[#64748b]";
}

export function PurchaseOrderList({ rows, page, hasNext, loadError, stats }: {
  rows: PurchaseOrderListRecord[];
  page: number;
  hasNext: boolean;
  loadError?: string;
  stats: { total: number; open: number; received: number; today: number };
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const statCards: Array<{ label: string; value: number; icon: typeof ClipboardList }> = [
    { label: "Total purchase orders", value: stats.total, icon: ClipboardList },
    { label: "Open purchase orders", value: stats.open, icon: CalendarDays },
    { label: "Received orders", value: stats.received, icon: ClipboardList },
    { label: "Orders today", value: stats.today, icon: CalendarDays },
  ];
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = status === "all" || row.status === status;
      if (!matchesStatus) return false;
      if (!term) return true;
      return [row.order_number, row.reference || "", vendorName(row.vendor)].some((value) => value.toLowerCase().includes(term));
    });
  }, [rows, search, status]);

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <Link href="/protected" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]">Back to dashboard</Link>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Purchasing</p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">Purchase orders</h1>
        <p className="mt-1 text-sm text-[#64748b]">Create and track incoming stock before it is received.</p>
      </div>
      <Button asChild><Link href="/purchase-orders/new"><Plus className="size-4" />Add new</Link></Button>
    </div>

    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-[#e2e8f0] bg-white p-5">
        <div className="mb-5 flex items-center justify-between"><p className="text-sm font-medium text-[#64748b]">{label}</p><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Icon className="size-[18px]" /></span></div>
        <p className="font-mono text-3xl font-semibold tracking-tight text-[#0f172a]">{value}</p>
        <p className="mt-2 text-xs text-[#94a3b8]">Live workspace count</p>
      </div>)}
    </section>

    <section className="rounded-xl border border-[#e2e8f0] bg-white">
      <div className="flex flex-col justify-between gap-3 border-b border-[#f1f5f9] px-5 py-4 sm:flex-row sm:items-center">
        <div><h2 className="text-sm font-semibold text-[#0f172a]">All purchase orders</h2><p className="mt-1 text-xs text-[#94a3b8]">{rows.length}{hasNext ? "+" : ""} records on this page</p></div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} placeholder="Search orders" className="h-11 pl-9" /></div>
          <label className="relative flex h-11 items-center gap-2 rounded-md border border-input bg-white px-3 text-sm text-[#334155]"><Filter className="size-4 text-[#64748b]" /><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-full bg-transparent outline-none"><option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="partially_received">Partially received</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select></label>
        </div>
      </div>
      {loadError ? <div className="p-8 text-center"><p className="text-sm font-medium text-red-700">Unable to load purchase orders.</p><p className="mt-1 text-xs text-[#64748b]">Refresh the page and try again.</p></div> : filteredRows.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#f1f5f9] text-[#94a3b8]"><ClipboardList className="size-5" /></div><p className="text-sm font-medium text-[#334155]">{search || status !== "all" ? "No matching purchase orders" : "No purchase orders created yet"}</p><p className="mt-1 text-xs text-[#94a3b8]">{search || status !== "all" ? "Try a different search or status." : "Create a draft to start planning incoming stock."}</p></div></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="border-b border-[#f1f5f9] bg-[#fbfcfd] text-xs text-[#64748b]"><tr><th className="px-5 py-3 text-left font-medium">Purchase order</th><th className="px-5 py-3 text-center font-medium">Date</th><th className="px-5 py-3 text-left font-medium">Vendor</th><th className="px-5 py-3 text-left font-medium">Reference</th><th className="px-5 py-3 text-right font-medium">Amount</th><th className="px-5 py-3 text-right font-medium">Received</th><th className="px-5 py-3 text-center font-medium">Status</th><th className="px-5 py-3 text-center font-medium">Delivery date</th></tr></thead><tbody className="divide-y divide-[#f1f5f9]">{filteredRows.map((row) => <tr key={row.id} className="hover:bg-[#fbfcfd]"><td className="px-5 py-4 font-mono text-xs font-semibold"><Link href={`/purchase-orders/${row.id}`} className="text-[#00a63e] hover:underline">{row.order_number}</Link></td><td className="px-5 py-4 text-center text-[#64748b]">{date(row.order_date)}</td><td className="px-5 py-4 font-medium text-[#334155]">{vendorName(row.vendor)}</td><td className="px-5 py-4 text-[#64748b]">{row.reference || "-"}</td><td className="px-5 py-4 text-right font-mono text-xs text-[#334155]">{money(total(row))}</td><td className="px-5 py-4 text-right font-mono text-xs text-[#334155]">{money(received(row))}</td><td className="px-5 py-4 text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(row.status)}`}>{statusLabels[row.status]}</span></td><td className="px-5 py-4 text-center text-[#64748b]">{date(row.delivery_date)}</td></tr>)}</tbody></table></div>}
      {(page > 1 || hasNext) && <div className="flex items-center justify-between border-t border-[#f1f5f9] px-5 py-4"><span className="text-xs text-[#64748b]">Page {page}</span><div className="flex gap-2">{page > 1 && <Link href={`/purchase-orders?page=${page - 1}`} className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc]">Previous</Link>}{hasNext && <Link href={`/purchase-orders?page=${page + 1}`} className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]">Next</Link>}</div></div>}
    </section>
  </div>;
}
