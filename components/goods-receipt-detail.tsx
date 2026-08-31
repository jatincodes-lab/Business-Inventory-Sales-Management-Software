"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ClipboardCheck, FileText, PackageCheck } from "lucide-react";

import { postGoodsReceipt } from "@/app/actions/goods-receipts";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

type Relation<T> = T | T[] | null;
type ReceiptStatus = "draft" | "posted" | "cancelled";
export type GoodsReceiptDetailRecord = {
  id: string;
  receipt_number: string;
  receipt_date: string;
  notes: string | null;
  status: ReceiptStatus;
  warehouse: Relation<{ name: string; address: string | null }>;
  purchase_order: Relation<{ id: string; order_number: string; vendor: Relation<{ name: string }> }>;
  lines: Array<{ id: string; quantity: string | number; unit_cost: string | number; item: Relation<{ name: string; sku: string }> }>;
};

const statusLabels: Record<ReceiptStatus, string> = { draft: "Draft", posted: "Posted", cancelled: "Cancelled" };
const statusClasses: Record<ReceiptStatus, string> = { draft: "bg-[#f1f5f9] text-[#64748b]", posted: "bg-[#e6f8ee] text-[#08752e]", cancelled: "bg-[#feecec] text-[#b42318]" };
function one<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] : value; }
function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: number) { return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function date(value: string | null) { if (!value) return "-"; const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }

export function GoodsReceiptDetail({ receipt, canPost }: { receipt: GoodsReceiptDetailRecord; canPost: boolean }) {
  const router = useRouter();
  const [isPosting, setIsPosting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const purchaseOrder = one(receipt.purchase_order);
  const warehouse = one(receipt.warehouse);
  const canPostReceipt = canPost && receipt.status === "draft";
  const total = receipt.lines.reduce((sum, line) => sum + number(line.quantity) * number(line.unit_cost), 0);

  const post = async () => {
    if (!canPostReceipt || isPosting) return;
    setIsPosting(true);
    setMessage(null);
    setError(false);
    try {
      const result = await postGoodsReceipt(receipt.id);
      setConfirmOpen(false);
      setMessage(result.message);
      setError(!result.ok);
      if (result.ok) router.refresh();
    } catch {
      setConfirmOpen(false);
      setMessage("Unable to post goods receipt. Check your connection and try again.");
      setError(true);
    } finally {
      setIsPosting(false);
    }
  };

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link href="/goods-receipts" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to goods receipts</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Receiving</p><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">{receipt.receipt_number}</h1><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses[receipt.status]}`}>{statusLabels[receipt.status]}</span></div><p className="mt-1 text-sm text-[#64748b]">Goods receipt for {purchaseOrder?.order_number || "purchase order"}.</p></div>{canPostReceipt && <Button type="button" loading={isPosting} onClick={() => setConfirmOpen(true)}><ClipboardCheck className="size-4" />{isPosting ? "Posting..." : "Post receipt"}</Button>}</div>
    {message && <p role={error ? "alert" : "status"} className={`mb-6 rounded-lg border p-3 text-sm ${error ? "border-[#f4b4b0] bg-[#fff5f5] text-[#b42318]" : "border-[#b9e7c9] bg-[#f0fff5] text-[#08752e]"}`}>{message}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]"><div className="space-y-6"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Receipt details</h2><p className="mt-1 text-xs text-[#64748b]">Recorded {date(receipt.receipt_date)}{purchaseOrder?.vendor ? ` · ${one(purchaseOrder.vendor)?.name || ""}` : ""}</p></div><dl className="grid gap-5 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[#94a3b8]">Purchase order</dt><dd className="mt-1"><Link href={purchaseOrder ? `/purchase-orders/${purchaseOrder.id}` : "/purchase-orders"} className="font-medium text-[#00a63e] hover:underline">{purchaseOrder?.order_number || "Unavailable"}</Link></dd></div><div><dt className="text-xs text-[#94a3b8]">Warehouse</dt><dd className="mt-1 text-[#334155]">{warehouse?.name || "-"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-[#94a3b8]">Warehouse address</dt><dd className="mt-1 whitespace-pre-wrap text-[#334155]">{warehouse?.address || "-"}</dd></div></dl></section><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center gap-2"><PackageCheck className="size-5 text-[#00a63e]" /><h2 className="text-base font-semibold text-[#0f172a]">Received items</h2></div>{receipt.lines.length === 0 ? <div className="rounded-lg bg-[#fffaf0] p-4 text-sm text-[#7a5200]">This receipt has no lines and cannot be posted.</div> : <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]"><table className="w-full min-w-[620px] text-sm"><thead className="bg-[#f8fafc] text-xs text-[#64748b]"><tr><th className="px-4 py-3 text-left font-medium">Item</th><th className="px-4 py-3 text-right font-medium">Quantity</th><th className="px-4 py-3 text-right font-medium">Rate</th><th className="px-4 py-3 text-right font-medium">Amount</th></tr></thead><tbody className="divide-y divide-[#f1f5f9]">{receipt.lines.map((line) => { const item = one(line.item); return <tr key={line.id}><td className="px-4 py-4"><p className="font-medium text-[#334155]">{item?.name || "Item unavailable"}</p><p className="mt-1 font-mono text-xs text-[#94a3b8]">{item?.sku || "-"}</p></td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{number(line.quantity).toLocaleString("en-IN")}</td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{money(number(line.unit_cost))}</td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{money(number(line.quantity) * number(line.unit_cost))}</td></tr>; })}</tbody></table></div>}</section></div><aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="flex items-center gap-2"><FileText className="size-4 text-[#00a63e]" /><h2 className="text-base font-semibold text-[#0f172a]">Summary</h2></div><dl className="mt-5 space-y-3 border-b border-[#f1f5f9] pb-5 text-sm"><div className="flex justify-between gap-4 text-[#64748b]"><dt>Line items</dt><dd className="font-mono text-[#334155]">{receipt.lines.length}</dd></div><div className="flex justify-between gap-4 text-[#64748b]"><dt>Quantity received</dt><dd className="font-mono text-[#334155]">{receipt.lines.reduce((sum, line) => sum + number(line.quantity), 0).toLocaleString("en-IN")}</dd></div></dl><div className="flex items-end justify-between gap-4 pt-5"><span className="text-sm font-semibold text-[#334155]">Receipt total</span><span className="font-mono text-xl font-semibold text-[#0f172a]">{money(total)}</span></div></section>{receipt.notes && <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="flex items-center gap-2"><Check className="size-4 text-[#00a63e]" /><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#64748b]">{receipt.notes}</p></section>}</aside></div>
    <ConfirmationDialog open={confirmOpen} title="Post goods receipt?" description="This will increase stock and mark the received quantities against the purchase order. This action cannot be undone." confirmLabel="Post receipt" loading={isPosting} onConfirm={post} onCancel={() => setConfirmOpen(false)} />
  </div>;
}
