"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackageCheck } from "lucide-react";

import { createGoodsReceipt } from "@/app/actions/goods-receipts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GoodsReceiptWarehouseOption = { id: string; name: string; address: string | null };
export type GoodsReceiptLineOption = { id: string; item_id: string; item_name: string; item_sku: string; remaining_quantity: string | number; unit_cost: string | number };
type ReceiptLine = GoodsReceiptLineOption & { selected: boolean; quantity: string; receipt_cost: string };

function localDate(minimum: string) {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const today = new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
  return today < minimum ? minimum : today;
}
function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function quantityPattern(value: string) { return /^\d*(?:\.\d{0,3})?$/.test(value); }
function costPattern(value: string) { return /^\d*(?:\.\d{0,2})?$/.test(value); }

export function GoodsReceiptForm({ purchaseOrderId, orderNumber, orderDate, vendorName, warehouses, lines, suggestedReceiptNumber }: { purchaseOrderId: string; orderNumber: string; orderDate: string; vendorName: string; warehouses: GoodsReceiptWarehouseOption[]; lines: GoodsReceiptLineOption[]; suggestedReceiptNumber: string }) {
  const router = useRouter();
  const [receiptNumber, setReceiptNumber] = useState(suggestedReceiptNumber);
  const [receiptDate, setReceiptDate] = useState(() => localDate(orderDate));
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>(lines.map((line) => ({ ...line, selected: false, quantity: String(line.remaining_quantity), receipt_cost: String(line.unit_cost) })));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateLine = (id: string, changes: Partial<ReceiptLine>) => setReceiptLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setError(null);
    setIsLoading(true);
    const formData = new FormData();
    formData.set("purchase_order_id", purchaseOrderId);
    formData.set("warehouse_id", warehouseId);
    formData.set("receipt_number", receiptNumber);
    formData.set("receipt_date", receiptDate);
    formData.set("notes", notes);
    formData.set("lines", JSON.stringify(receiptLines.filter((line) => line.selected).map((line) => ({ purchase_order_line_id: line.id, item_id: line.item_id, quantity: line.quantity, unit_cost: line.receipt_cost }))));
    try {
      const result = await createGoodsReceipt(formData);
      if (!result.ok) { setError(result.message); return; }
      router.push(`/goods-receipts/${result.receiptId}`);
      router.refresh();
    } catch {
      setError("Unable to save goods receipt. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return <div>
    <div className="mb-7"><Link href={`/purchase-orders/${purchaseOrderId}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to purchase order</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Receiving</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">New goods receipt</h1><p className="mt-1 text-sm text-[#64748b]">Receive items for {orderNumber} from {vendorName}.</p></div>
    {warehouses.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create an active warehouse before saving a goods receipt.</div>}
    {lines.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">This purchase order has no remaining quantity to receive.</div>}
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
      <div className="space-y-6">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Receipt details</h2><p className="mt-1 text-xs text-[#64748b]">Receipt date cannot be before the purchase order date.</p></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="receipt-number">Receipt number</Label><Input id="receipt-number" value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value.toUpperCase())} maxLength={40} required /></div><div className="grid gap-2"><Label htmlFor="receipt-date">Receipt date</Label><Input id="receipt-date" type="date" value={receiptDate} min={orderDate} onChange={(event) => setReceiptDate(event.target.value)} required /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="receipt-warehouse">Warehouse</Label><select id="receipt-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select a warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.address ? ` — ${warehouse.address}` : ""}</option>)}</select></div></div></section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0f172a]">Items to receive</h2><p className="mt-1 text-xs text-[#64748b]">Select lines and enter the quantity physically received.</p></div><PackageCheck className="size-5 text-[#00a63e]" /></div><div className="overflow-x-auto rounded-lg border border-[#e2e8f0]"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#f8fafc] text-xs text-[#64748b]"><tr><th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th><th className="px-4 py-3 text-left font-medium">Item</th><th className="px-4 py-3 text-right font-medium">Remaining</th><th className="px-4 py-3 text-right font-medium">Receive</th><th className="px-4 py-3 text-right font-medium">Rate</th></tr></thead><tbody className="divide-y divide-[#f1f5f9]">{receiptLines.map((line) => <tr key={line.id} className={line.selected ? "bg-[#fbfffc]" : undefined}><td className="px-4 py-4 text-center"><input type="checkbox" aria-label={`Receive ${line.item_name}`} checked={line.selected} onChange={(event) => updateLine(line.id, { selected: event.target.checked })} className="size-4 accent-[#00a63e]" /></td><td className="px-4 py-4"><p className="font-medium text-[#334155]">{line.item_name}</p><p className="mt-1 font-mono text-xs text-[#94a3b8]">{line.item_sku}</p></td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{number(line.remaining_quantity).toLocaleString("en-IN")}</td><td className="px-4 py-4"><Input aria-label={`Quantity for ${line.item_name}`} value={line.quantity} onChange={(event) => quantityPattern(event.target.value) && updateLine(line.id, { quantity: event.target.value })} inputMode="decimal" maxLength={19} disabled={!line.selected} className="h-11 text-right" /></td><td className="px-4 py-4"><Input aria-label={`Rate for ${line.item_name}`} value={line.receipt_cost} onChange={(event) => costPattern(event.target.value) && updateLine(line.id, { receipt_cost: event.target.value })} inputMode="decimal" maxLength={19} disabled={!line.selected} className="h-11 text-right" /></td></tr>)}</tbody></table></div></section>
      </div>
      <aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={6} placeholder="Add receiving notes" className="mt-5 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></section>{error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row xl:flex-col-reverse"><Button type="button" variant="outline" asChild><Link href={`/purchase-orders/${purchaseOrderId}`}>Cancel</Link></Button><Button type="submit" loading={isLoading} disabled={warehouses.length === 0 || lines.length === 0}>{isLoading ? "Saving..." : "Save as draft"}</Button></div></aside>
    </form>
  </div>;
}
