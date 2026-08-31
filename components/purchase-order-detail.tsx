"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, FileText, PackageCheck, PackagePlus, Send } from "lucide-react";

import { submitPurchaseOrder } from "@/app/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

type Relation<T> = T | T[] | null;
type PurchaseOrderItem = { sku: string; name: string; unit: Relation<{ name: string; code: string }> };
export type PurchaseOrderDetailRecord = {
  id: string;
  order_number: string;
  order_date: string;
  delivery_date: string | null;
  reference: string | null;
  delivery_address: string | null;
  payment_terms_days: number;
  shipment_preference: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "partially_received" | "received" | "cancelled";
  vendor: Relation<{ name: string; email: string | null; mobile: string | null; address: string | null; tax_id: string | null }>;
  lines: Array<{ id: string; ordered_quantity: string | number; received_quantity: string | number; unit_cost: string | number; tax_rate: string | number; item: Relation<PurchaseOrderItem> }>;
};

const statusLabels: Record<PurchaseOrderDetailRecord["status"], string> = { draft: "Draft", submitted: "Submitted", partially_received: "Partially received", received: "Received", cancelled: "Cancelled" };
const statusClasses: Record<PurchaseOrderDetailRecord["status"], string> = { draft: "bg-[#f1f5f9] text-[#64748b]", submitted: "bg-[#eaf4ff] text-[#1769aa]", partially_received: "bg-[#fff7df] text-[#9a6700]", received: "bg-[#e6f8ee] text-[#08752e]", cancelled: "bg-[#feecec] text-[#b42318]" };

function one<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] : value; }
function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: number) { return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function date(value: string | null) { if (!value) return "-"; const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }
function lineAmount(line: PurchaseOrderDetailRecord["lines"][number]) { return number(line.ordered_quantity) * number(line.unit_cost) * (1 + number(line.tax_rate) / 100); }
function vendorName(vendor: PurchaseOrderDetailRecord["vendor"]) { return one(vendor)?.name || "-"; }

export function PurchaseOrderDetail({ order, canSubmit, canCreateReceipt }: { order: PurchaseOrderDetailRecord; canSubmit: boolean; canCreateReceipt: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const total = order.lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const canSubmitOrder = canSubmit && order.status === "draft";
  const canCreateReceiptOrder = canCreateReceipt && (order.status === "submitted" || order.status === "partially_received");
  const receiptPermissionMessage = !canCreateReceipt && (order.status === "submitted" || order.status === "partially_received");

  const submit = async () => {
    if (!canSubmitOrder || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    setError(false);
    try {
      const result = await submitPurchaseOrder(order.id);
      setConfirmOpen(false);
      setMessage(result.message);
      setError(!result.ok);
      if (result.ok) router.refresh();
    } catch {
      setConfirmOpen(false);
      setMessage("Unable to submit purchase order. Check your connection and try again.");
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const vendor = one(order.vendor);
  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><Link href="/purchase-orders" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to purchase orders</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Purchasing</p><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">{order.order_number}</h1><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses[order.status]}`}>{statusLabels[order.status]}</span></div><p className="mt-1 text-sm text-[#64748b]">Purchase order details and receiving readiness.</p></div>
      <div className="flex flex-wrap gap-3">{canCreateReceiptOrder && <Link href={`/goods-receipts/new?purchase_order_id=${order.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#e2e8f0] bg-white px-4 text-sm font-semibold text-[#334155] hover:bg-[#f8fafc]"><PackagePlus className="size-4" />Create receipt</Link>}{canSubmitOrder && <Button type="button" loading={isSubmitting} onClick={() => setConfirmOpen(true)}><Send className="size-4" />{isSubmitting ? "Submitting..." : "Submit PO"}</Button>}</div>
    </div>
    {receiptPermissionMessage && <p className="mb-6 rounded-lg border border-[#f5d48a] bg-[#fffaf0] p-3 text-sm text-[#7a5200]">You need the <span className="font-semibold">receipts.create</span> permission to create a receipt for this purchase order.</p>}
    {message && <p role={error ? "alert" : "status"} className={`mb-6 rounded-lg border p-3 text-sm ${error ? "border-[#f4b4b0] bg-[#fff5f5] text-[#b42318]" : "border-[#b9e7c9] bg-[#f0fff5] text-[#08752e]"}`}>{message}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
      <div className="space-y-6">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Order details</h2><p className="mt-1 text-xs text-[#64748b]">Created {date(order.order_date)}{order.reference ? ` · Ref ${order.reference}` : ""}</p></div><dl className="grid gap-5 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[#94a3b8]">Vendor</dt><dd className="mt-1 font-medium text-[#334155]">{vendorName(order.vendor)}</dd>{vendor?.email && <dd className="mt-1 text-xs text-[#64748b]">{vendor.email}</dd>}{vendor?.mobile && <dd className="mt-1 text-xs text-[#64748b]">{vendor.mobile}</dd>}</div><div><dt className="text-xs text-[#94a3b8]">Delivery date</dt><dd className="mt-1 text-[#334155]">{date(order.delivery_date)}</dd></div><div><dt className="text-xs text-[#94a3b8]">Payment terms</dt><dd className="mt-1 text-[#334155]">{order.payment_terms_days} days</dd></div><div><dt className="text-xs text-[#94a3b8]">Shipment preference</dt><dd className="mt-1 capitalize text-[#334155]">{order.shipment_preference?.replaceAll("_", " ") || "-"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-[#94a3b8]">Delivery address</dt><dd className="mt-1 whitespace-pre-wrap text-[#334155]">{order.delivery_address || "-"}</dd></div></dl></section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0f172a]">Items</h2><p className="mt-1 text-xs text-[#64748b]">Stock changes only after a goods receipt is posted.</p></div><PackageCheck className="size-5 text-[#00a63e]" /></div>{order.lines.length === 0 ? <div className="rounded-lg bg-[#fffaf0] p-4 text-sm text-[#7a5200]">This purchase order has no items and cannot be submitted.</div> : <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]"><table className="w-full min-w-[700px] text-sm"><thead className="bg-[#f8fafc] text-xs text-[#64748b]"><tr><th className="px-4 py-3 text-left font-medium">Item</th><th className="px-4 py-3 text-right font-medium">Ordered</th><th className="px-4 py-3 text-right font-medium">Received</th><th className="px-4 py-3 text-right font-medium">Rate</th><th className="px-4 py-3 text-right font-medium">Tax</th><th className="px-4 py-3 text-right font-medium">Amount</th></tr></thead><tbody className="divide-y divide-[#f1f5f9]">{order.lines.map((line) => { const item = one(line.item); return <tr key={line.id}><td className="px-4 py-4"><p className="font-medium text-[#334155]">{item?.name || "Item unavailable"}</p><p className="mt-1 font-mono text-xs text-[#94a3b8]">{item?.sku || "-"}{item?.unit && ` · ${one(item.unit)?.code || one(item.unit)?.name || ""}`}</p></td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{number(line.ordered_quantity).toLocaleString("en-IN")}</td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{number(line.received_quantity).toLocaleString("en-IN")}</td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{money(number(line.unit_cost))}</td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{number(line.tax_rate).toFixed(2)}%</td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{money(lineAmount(line))}</td></tr>; })}</tbody></table></div>}</section>
      </div>
      <aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="flex items-center gap-2"><FileText className="size-4 text-[#00a63e]" /><h2 className="text-base font-semibold text-[#0f172a]">Summary</h2></div><dl className="mt-5 space-y-3 border-b border-[#f1f5f9] pb-5 text-sm"><div className="flex justify-between gap-4 text-[#64748b]"><dt>Line items</dt><dd className="font-mono text-[#334155]">{order.lines.length}</dd></div><div className="flex justify-between gap-4 text-[#64748b]"><dt>Received quantity</dt><dd className="font-mono text-[#334155]">{order.lines.reduce((sum, line) => sum + number(line.received_quantity), 0).toLocaleString("en-IN")}</dd></div></dl><div className="flex items-end justify-between gap-4 pt-5"><span className="text-sm font-semibold text-[#334155]">Order total</span><span className="font-mono text-xl font-semibold text-[#0f172a]">{money(total)}</span></div></section>{order.notes && <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="flex items-center gap-2"><Check className="size-4 text-[#00a63e]" /><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#64748b]">{order.notes}</p></section>}</aside>
    </div>
    <ConfirmationDialog open={confirmOpen} title="Submit purchase order?" description="This will mark the order as submitted and make it available for goods receiving. You cannot submit it again." confirmLabel="Submit PO" loading={isSubmitting} onConfirm={submit} onCancel={() => setConfirmOpen(false)} />
  </div>;
}
