"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackageCheck } from "lucide-react";

import { createSalesFulfillment } from "@/app/actions/sales-documents";
import type { StockOption, WarehouseOption } from "@/components/inventory-adjustment-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SalesFulfillmentLineOption = { id: string; item_id: string; item_name: string; item_sku: string; remaining_quantity: string | number };
type ReservationOption = { sales_order_line_id: string; warehouse_id: string; quantity: string | number; consumed_quantity?: string | number; released_quantity?: string | number };
type Line = SalesFulfillmentLineOption & { selected: boolean; quantity: string };

function matches(value: string) { return /^\d*(?:\.\d{0,3})?$/.test(value); }
function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function display(value: string | number) { return number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 }); }
function validQuantity(value: string, remaining: number) { return /^\d+(?:\.\d{1,3})?$/.test(value) && number(value) > 0 && number(value) <= remaining; }

export function SalesFulfillmentForm({ salesOrderId, orderNumber, customerName, orderDate, warehouses, lines, suggestedNumber, initialDate, balances, reservations }: { salesOrderId: string; orderNumber: string; customerName: string; orderDate: string; warehouses: WarehouseOption[]; lines: SalesFulfillmentLineOption[]; suggestedNumber: string; initialDate: string; balances: StockOption[]; reservations: ReservationOption[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [fulfillmentNumber, setFulfillmentNumber] = useState(suggestedNumber);
  const [fulfillmentDate, setFulfillmentDate] = useState(initialDate);
  const [notes, setNotes] = useState("");
  const [fulfillmentLines, setFulfillmentLines] = useState<Line[]>(lines.map((line) => ({ ...line, selected: false, quantity: String(line.remaining_quantity) })));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const available = (line: Line) => { const row = balances.find((balance) => balance.item_id === line.item_id && balance.warehouse_id === warehouseId); const reservedForOrder = reservations.filter((reservation) => reservation.sales_order_line_id === line.id && reservation.warehouse_id === warehouseId).reduce((sum, reservation) => sum + number(reservation.quantity) - number(reservation.consumed_quantity || 0) - number(reservation.released_quantity || 0), 0); return Math.max(0, number(row?.quantity || 0) - number(row?.reserved_quantity || 0) + reservedForOrder); };
  const selectedLines = fulfillmentLines.filter((line) => line.selected);
  const invalidLines = selectedLines.filter((line) => !validQuantity(line.quantity, number(line.remaining_quantity)));
  const shortageLines = selectedLines.filter((line) => number(line.quantity) > available(line));
  const canSaveDraft = warehouses.length > 0 && fulfillmentLines.length > 0 && selectedLines.length > 0 && invalidLines.length === 0;

  const updateLine = (id: string, changes: Partial<Line>) => setFulfillmentLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    if (!canSaveDraft) { setError("Select at least one item and enter a valid quantity before saving."); return; }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("sales_order_id", salesOrderId);
    formData.set("warehouse_id", warehouseId);
    formData.set("fulfillment_number", fulfillmentNumber);
    formData.set("fulfillment_date", fulfillmentDate);
    formData.set("notes", notes);
    formData.set("lines", JSON.stringify(selectedLines.map((line) => ({ sales_order_line_id: line.id, item_id: line.item_id, quantity: line.quantity }))));
    try {
      const result = await createSalesFulfillment(formData);
      if (!result.ok) { setError(result.message); return; }
      router.push(`/sales-fulfillments/${result.documentId}`);
      router.refresh();
    } catch {
      setError("Unable to save fulfillment. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return <div><div className="mb-7"><Link href={`/sales-orders/${salesOrderId}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to sales order</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Sales</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">New fulfillment</h1><p className="mt-1 text-sm text-[#64748b]">Dispatch items for {orderNumber} to {customerName}.</p></div>{warehouses.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create an active warehouse before creating a fulfillment.</div>}{fulfillmentLines.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">This sales order has no remaining quantity to fulfill.</div>}<form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]"><div className="space-y-6"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Fulfillment details</h2><p className="mt-1 text-xs text-[#94a3b8]">Date cannot be before the sales order date.</p></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="fulfillment-number">Fulfillment number</Label><Input id="fulfillment-number" value={fulfillmentNumber} onChange={(event) => setFulfillmentNumber(event.target.value.toUpperCase())} maxLength={40} required /></div><div className="grid gap-2"><Label htmlFor="fulfillment-date">Fulfillment date</Label><Input id="fulfillment-date" type="date" min={orderDate} value={fulfillmentDate} onChange={(event) => setFulfillmentDate(event.target.value)} required /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="fulfillment-warehouse">Warehouse</Label><select id="fulfillment-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select a warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div></div></section><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0f172a]">Items to dispatch</h2><p className="mt-1 text-xs text-[#94a3b8]">Available includes stock already reserved for this sales order.</p></div><PackageCheck className="size-5 text-[#00a63e]" /></div>{fulfillmentLines.length === 0 ? <p className="rounded-lg bg-[#fffaf0] p-4 text-sm text-[#7a5200]">No remaining items.</p> : <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#f8fafc] text-xs text-[#64748b]"><tr><th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th><th className="px-4 py-3 text-left font-medium">Item</th><th className="px-4 py-3 text-right font-medium">Remaining</th><th className="px-4 py-3 text-right font-medium">Dispatch</th><th className="px-4 py-3 text-right font-medium">Available for this order</th></tr></thead><tbody className="divide-y divide-[#f1f5f9]">{fulfillmentLines.map((line) => { const availableQuantity = available(line); const shortage = line.selected && number(line.quantity) > availableQuantity; return <tr key={line.id} className={shortage ? "bg-[#fff5f5]" : line.selected ? "bg-[#fbfffc]" : undefined}><td className="px-4 py-4 text-center"><input type="checkbox" aria-label={`Dispatch ${line.item_name}`} checked={line.selected} onChange={(event) => updateLine(line.id, { selected: event.target.checked })} className="size-4 accent-[#00a63e]" /></td><td className="px-4 py-4"><p className="font-medium text-[#334155]">{line.item_name}</p><p className="mt-1 font-mono text-xs text-[#94a3b8]">{line.item_sku}</p></td><td className="px-4 py-4 text-right font-mono text-xs text-[#334155]">{display(line.remaining_quantity)}</td><td className="px-4 py-4"><Input aria-label={`Dispatch quantity for ${line.item_name}`} value={line.quantity} onChange={(event) => matches(event.target.value) && updateLine(line.id, { quantity: event.target.value })} inputMode="decimal" maxLength={19} disabled={!line.selected} className={`h-11 text-right ${shortage ? "border-[#e35d58] focus-visible:ring-[#e35d58]" : ""}`} /></td><td className={`px-4 py-4 text-right font-mono text-xs ${shortage ? "font-semibold text-[#b42318]" : "text-[#64748b]"}`}>{display(availableQuantity)}{shortage && <span className="mt-1 block font-sans text-[11px]">Not enough</span>}</td></tr>; })}</tbody></table></div>}{selectedLines.length > 0 && <div className={`mt-5 rounded-lg border p-4 text-sm ${shortageLines.length > 0 ? "border-[#f4b4b0] bg-[#fff5f5] text-[#8a1c18]" : invalidLines.length > 0 ? "border-[#f5d48a] bg-[#fffaf0] text-[#7a5200]" : "border-[#b9e7c9] bg-[#f0fff5] text-[#08752e]"}`} role={shortageLines.length > 0 ? "alert" : "status"}><p className="font-medium">{shortageLines.length > 0 ? "Some items cannot be dispatched yet." : invalidLines.length > 0 ? "Check the selected quantities." : "The selected quantities are ready to save."}</p>{shortageLines.length > 0 && <p className="mt-1 text-xs">Reduce the quantity, choose another warehouse, or receive stock first. You can save this as a draft while waiting.</p>}</div>}</section></div><aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={6} placeholder="Add dispatch notes" className="mt-5 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></section>{error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row xl:flex-col-reverse"><Button type="button" variant="outline" asChild><Link href={`/sales-orders/${salesOrderId}`}>Cancel</Link></Button><Button type="submit" loading={loading} disabled={!canSaveDraft}>{loading ? "Saving..." : "Save as draft"}</Button></div></aside></form></div>;
}
