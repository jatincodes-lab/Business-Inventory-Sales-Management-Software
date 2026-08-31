"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, FileText, PackageCheck, X } from "lucide-react";

import { createInvoiceFromFulfillment } from "@/app/actions/invoices";
import { cancelSalesFulfillment, postSalesFulfillment } from "@/app/actions/sales-documents";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { DocumentStatus } from "@/components/inventory-document-list";

type Relation<T> = T | T[] | null;
export type SalesFulfillmentDetailRecord = { id: string; fulfillment_number: string; fulfillment_date: string; status: DocumentStatus; notes: string | null; warehouse_id: string; warehouse: Relation<{ name: string; address: string | null }>; sales_order: Relation<{ id: string; order_number: string; customer: Relation<{ name: string }> }>; invoice: Relation<{ id: string; invoice_number: string; status: string }>; lines: Array<{ id: string; sales_order_line_id: string; item_id: string; quantity: string | number; item: Relation<{ name: string; sku: string; unit: Relation<{ code: string }> }> }> };

const labels: Record<DocumentStatus, string> = { draft: "Draft", posted: "Posted", cancelled: "Cancelled" };
const classes: Record<DocumentStatus, string> = { draft: "bg-[#f1f5f9] text-[#64748b]", posted: "bg-[#e6f8ee] text-[#08752e]", cancelled: "bg-[#feecec] text-[#b42318]" };
function one<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] : value; }
function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function date(value: string) { const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }
function display(value: string | number) { return number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 }); }

export function SalesFulfillmentDetail({ fulfillment, canPost, canEdit, canCreateInvoice, stock, stockCheckAvailable }: { fulfillment: SalesFulfillmentDetailRecord; canPost: boolean; canEdit: boolean; canCreateInvoice: boolean; stock: Record<string, number>; stockCheckAvailable: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"post" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const order = one(fulfillment.sales_order);
  const warehouse = one(fulfillment.warehouse);
  const invoice = one(fulfillment.invoice);
  const totalQuantity = fulfillment.lines.reduce((sum, line) => sum + number(line.quantity), 0);
  const shortageLines = fulfillment.status === "draft" && stockCheckAvailable ? fulfillment.lines.filter((line) => number(stock[line.id]) < number(line.quantity)) : [];
  const canPostNow = canPost && fulfillment.status === "draft" && fulfillment.lines.length > 0 && stockCheckAvailable && shortageLines.length === 0;

  async function run() {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      const result = dialog === "post" ? await postSalesFulfillment(fulfillment.id) : await cancelSalesFulfillment(fulfillment.id);
      setDialog(null);
      setMessage(result.message);
      setIsError(!result.ok);
      if (result.ok) router.refresh();
    } catch {
      setDialog(null);
      setMessage("Unable to process fulfillment. Check your connection and try again.");
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice() {
    if (invoiceBusy || fulfillment.status !== "posted") return;
    setInvoiceBusy(true);
    setMessage(null);
    try {
      const result = await createInvoiceFromFulfillment(fulfillment.id);
      if (!result.ok) { setMessage(result.message); setIsError(true); return; }
      router.push(`/invoices/${result.invoiceId}`);
    } catch {
      setMessage("Unable to create the invoice. Check your connection and try again.");
      setIsError(true);
    } finally {
      setInvoiceBusy(false);
    }
  }

  return <div><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link href="/sales-fulfillments" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to fulfillments</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Sales</p><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">{fulfillment.fulfillment_number}</h1><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${classes[fulfillment.status]}`}>{labels[fulfillment.status]}</span></div><p className="mt-1 text-sm text-[#64748b]">Fulfillment for <Link href={order ? `/sales-orders/${order.id}` : "/sales-orders"} className="font-medium text-[#00a63e] hover:underline">{order?.order_number || "sales order"}</Link>.</p></div><div className="flex flex-wrap gap-2">{fulfillment.status === "posted" && invoice ? <Link href={`/invoices/${invoice.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#e2e8f0] bg-white px-4 text-sm font-semibold text-[#334155] hover:bg-[#f8fafc]"><FileText className="size-4" />View invoice</Link> : fulfillment.status === "posted" && canCreateInvoice ? <Button type="button" loading={invoiceBusy} onClick={createInvoice}><FileText className="size-4" />{invoiceBusy ? "Creating..." : "Create invoice"}</Button> : null}{fulfillment.status === "draft" && (canPost || canEdit) && <>{canEdit && <Button type="button" variant="outline" onClick={() => setDialog("cancel")}><X className="size-4" />Cancel</Button>}{canPost && <Button type="button" disabled={!canPostNow} onClick={() => setDialog("post")}><ClipboardCheck className="size-4" />Post fulfillment</Button>}</>}</div></div>
    {message && <p role={isError ? "alert" : "status"} className={`mb-6 rounded-lg border p-3 text-sm ${isError ? "border-[#f4b4b0] bg-[#fff5f5] text-[#b42318]" : "border-[#b9e7c9] bg-[#f0fff5] text-[#08752e]"}`}>{message}</p>}
    {fulfillment.status === "draft" && !stockCheckAvailable && <p role="alert" className="mb-6 rounded-lg border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Stock availability could not be checked. Refresh the page before posting.</p>}
    {shortageLines.length > 0 && <div role="alert" className="mb-6 rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-4 text-sm text-[#8a1c18]"><p className="font-medium">This fulfillment cannot be posted yet.</p><p className="mt-1 text-xs">Receive or transfer the missing stock, then refresh this page. The server will check again when you post.</p><ul className="mt-2 space-y-1 text-xs">{shortageLines.map((line) => { const item = one(line.item); return <li key={line.id}>{item?.name || "Item"}: dispatch {display(line.quantity)}, available {display(stock[line.id] || 0)}.</li>; })}</ul></div>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]"><div className="space-y-6"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Fulfillment details</h2><p className="mt-1 text-xs text-[#94a3b8]">Recorded on {date(fulfillment.fulfillment_date)}{order?.customer ? ` - ${one(order.customer)?.name || ""}` : ""}.</p></div><dl className="grid gap-5 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[#94a3b8]">Warehouse</dt><dd className="mt-1 font-medium text-[#334155]">{warehouse?.name || "-"}</dd></div><div><dt className="text-xs text-[#94a3b8]">Address</dt><dd className="mt-1 text-[#334155]">{warehouse?.address || "-"}</dd></div></dl></section><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center gap-2"><PackageCheck className="size-5 text-[#00a63e]" /><h2 className="text-base font-semibold text-[#0f172a]">Dispatched items</h2></div>{fulfillment.lines.length === 0 ? <p className="rounded-lg bg-[#fffaf0] p-4 text-sm text-[#7a5200]">This fulfillment has no lines and cannot be posted.</p> : <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#f8fafc] text-xs text-[#64748b]"><tr><th className="px-4 py-3 text-left font-medium">Item</th><th className="px-4 py-3 text-right font-medium">Quantity</th>{fulfillment.status === "draft" && <th className="px-4 py-3 text-right font-medium">Available for this fulfillment</th>}</tr></thead><tbody className="divide-y divide-[#f1f5f9]">{fulfillment.lines.map((line) => { const item = one(line.item); const availableQuantity = stock[line.id] || 0; const shortage = fulfillment.status === "draft" && stockCheckAvailable && availableQuantity < number(line.quantity); return <tr key={line.id} className={shortage ? "bg-[#fff5f5]" : undefined}><td className="px-4 py-4"><p className="font-medium text-[#334155]">{item?.name || "Item unavailable"}</p><p className="mt-1 font-mono text-xs text-[#94a3b8]">{item?.sku || "-"}</p></td><td className="px-4 py-4 text-right font-mono text-xs font-semibold text-[#334155]">{display(line.quantity)}</td>{fulfillment.status === "draft" && <td className={`px-4 py-4 text-right font-mono text-xs ${shortage ? "font-semibold text-[#b42318]" : "text-[#64748b]"}`}>{stockCheckAvailable ? display(availableQuantity) : "Check on refresh"}</td>}</tr>; })}</tbody></table></div>}</section></div><aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="flex items-center gap-2"><FileText className="size-4 text-[#00a63e]" /><h2 className="text-base font-semibold text-[#0f172a]">Summary</h2></div><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-4 text-[#64748b]"><dt>Line items</dt><dd className="font-mono text-[#334155]">{fulfillment.lines.length}</dd></div><div className="flex justify-between gap-4 text-[#64748b]"><dt>Total quantity</dt><dd className="font-mono text-[#334155]">{display(totalQuantity)}</dd></div></dl></section>{fulfillment.notes && <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#64748b]">{fulfillment.notes}</p></section>}</aside></div>
    <ConfirmationDialog open={dialog === "post"} title="Post fulfillment?" description="This will deduct stock from the selected warehouse and update the sales order. This action cannot be undone." confirmLabel="Post fulfillment" loading={busy} onConfirm={run} onCancel={() => setDialog(null)} /><ConfirmationDialog open={dialog === "cancel"} title="Cancel fulfillment?" description="This draft will be closed without changing stock. It cannot be posted later." confirmLabel="Cancel fulfillment" loading={busy} onConfirm={run} onCancel={() => setDialog(null)} />
  </div>;
}
