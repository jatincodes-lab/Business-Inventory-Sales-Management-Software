"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Boxes, ChevronRight, CircleAlert, ClipboardList, PackageCheck, ReceiptText, ShoppingCart, Store, Users } from "lucide-react";

const metrics = [
  { label: "Items in stock", note: "Connect Supabase to load live data", icon: Boxes },
  { label: "Low-stock items", note: "Reorder levels will appear here", icon: CircleAlert },
  { label: "Open purchases", note: "Pending purchase orders", icon: ClipboardList },
  { label: "Unpaid invoices", note: "Outstanding customer balance", icon: ReceiptText },
];

export function DashboardOverview() {
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    };
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Workspace overview</p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">{greeting}</h1>
        <p className="mt-1 text-sm text-[#64748b]">Your inventory workspace will appear here as data is connected.</p>
      </div>
      <Link href="/purchase-orders/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white transition hover:bg-[#008a34] active:translate-y-px"><ShoppingCart className="size-4" />New purchase order</Link>
    </div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => { const MetricIcon = metric.icon; return <div key={metric.label} className="rounded-xl border border-[#e2e8f0] bg-white p-5"><div className="mb-5 flex items-center justify-between"><p className="text-sm font-medium text-[#64748b]">{metric.label}</p><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><MetricIcon className="size-[18px]" /></span></div><p className="font-mono text-3xl font-semibold tracking-tight text-[#0f172a]">-</p><p className="mt-2 text-xs text-[#94a3b8]">{metric.note}</p></div>; })}
    </section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="rounded-xl border border-[#e2e8f0] bg-white"><div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4"><div><h2 className="text-sm font-semibold text-[#0f172a]">Recent activity</h2><p className="mt-1 text-xs text-[#94a3b8]">Stock and document events will be listed here.</p></div><Link href="/stock-movements" className="text-xs font-semibold text-[#00a63e] hover:text-[#008a34]">View history</Link></div><div className="grid min-h-64 place-items-center p-8 text-center"><div><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#f1f5f9] text-[#94a3b8]"><PackageCheck className="size-5" /></div><p className="text-sm font-medium text-[#334155]">No activity yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#94a3b8]">Post your first goods receipt to start building the stock history.</p></div></div></div>
      <div className="rounded-xl border border-[#e2e8f0] bg-white"><div className="border-b border-[#f1f5f9] px-5 py-4"><h2 className="text-sm font-semibold text-[#0f172a]">Quick setup</h2><p className="mt-1 text-xs text-[#94a3b8]">Complete these basics before daily operations.</p></div><div className="divide-y divide-[#f1f5f9]"><Link href="/items" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f7f8fa]"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Boxes className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-[#334155]">Add your first item</span><span className="block text-xs text-[#94a3b8]">Create an SKU and set reorder levels</span></span><ChevronRight className="size-4 text-[#94a3b8]" /></Link><Link href="/vendors" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f7f8fa]"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Store className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-[#334155]">Add a vendor</span><span className="block text-xs text-[#94a3b8]">Prepare your purchasing directory</span></span><ChevronRight className="size-4 text-[#94a3b8]" /></Link><Link href="/customers/new" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f7f8fa]"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Users className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-[#334155]">Add a customer</span><span className="block text-xs text-[#94a3b8]">Set up future sales and invoices</span></span><ChevronRight className="size-4 text-[#94a63e]" /></Link></div></div>
    </section>
  </>;
}
