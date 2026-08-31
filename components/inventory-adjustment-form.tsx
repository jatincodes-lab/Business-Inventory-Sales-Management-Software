"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, SlidersHorizontal, Trash2 } from "lucide-react";

import { createInventoryAdjustment } from "@/app/actions/inventory-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type InventoryOption = { id: string; name: string; sku: string; unit_code: string };
export type WarehouseOption = { id: string; name: string };
export type StockOption = { warehouse_id: string; item_id: string; quantity: string | number; reserved_quantity?: string | number };
type Line = { id: string; item_id: string; direction: "increase" | "decrease"; quantity: string };

function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function quantityPattern(value: string) { return /^\d*(?:\.\d{0,3})?$/.test(value); }

export function InventoryAdjustmentForm({ warehouses, items, balances, suggestedNumber, initialDate }: { warehouses: WarehouseOption[]; items: InventoryOption[]; balances: StockOption[]; suggestedNumber: string; initialDate: string }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [adjustmentNumber, setAdjustmentNumber] = useState(suggestedNumber);
  const [adjustmentDate, setAdjustmentDate] = useState(initialDate);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ id: "line-1", item_id: "", direction: "increase", quantity: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const balance = useMemo(() => new Map(balances.filter((row) => row.warehouse_id === warehouseId).map((row) => [row.item_id, number(row.quantity)])), [balances, warehouseId]);
  const updateLine = (id: string, changes: Partial<Line>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
  const removeLine = (id: string) => setLines((current) => current.length > 1 ? current.filter((line) => line.id !== id) : current);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError(null);
    const formData = new FormData();
    formData.set("warehouse_id", warehouseId); formData.set("adjustment_number", adjustmentNumber); formData.set("adjustment_date", adjustmentDate); formData.set("reason", reason); formData.set("notes", notes);
    formData.set("lines", JSON.stringify(lines.filter((line) => line.item_id && line.quantity).map((line) => ({ item_id: line.item_id, quantity_delta: line.direction === "increase" ? line.quantity : `-${line.quantity}` }))));
    try {
      const result = await createInventoryAdjustment(formData);
      if (!result.ok) { setError(result.message); return; }
      router.push(`/inventory-adjustment/${result.documentId}`); router.refresh();
    } catch { setError("Unable to save adjustment. Check your connection and try again."); }
    finally { setLoading(false); }
  };
  return <div>
    <div className="mb-7"><Link href="/inventory-adjustment" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to adjustments</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Inventory</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">New stock adjustment</h1><p className="mt-1 text-sm text-[#64748b]">Record a counted difference, damage, or correction.</p></div>
    {warehouses.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create an active warehouse before recording an adjustment.</div>}
    {items.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create an active item before recording an adjustment.</div>}
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]"><div className="space-y-6">
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Adjustment details</h2><p className="mt-1 text-xs text-[#94a3b8]">Stock changes only after the adjustment is posted.</p></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="adjustment-number">Adjustment number</Label><Input id="adjustment-number" value={adjustmentNumber} onChange={(event) => setAdjustmentNumber(event.target.value.toUpperCase())} maxLength={40} required /></div><div className="grid gap-2"><Label htmlFor="adjustment-date">Adjustment date</Label><Input id="adjustment-date" type="date" value={adjustmentDate} onChange={(event) => setAdjustmentDate(event.target.value)} required /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="adjustment-warehouse">Warehouse</Label><select id="adjustment-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select a warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="adjustment-reason">Reason</Label><Input id="adjustment-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={120} placeholder="e.g. Cycle count correction" required /></div></div></section>
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0f172a]">Items</h2><p className="mt-1 text-xs text-[#94a3b8]">Use a positive or negative quantity for each item.</p></div><SlidersHorizontal className="size-5 text-[#00a63e]" /></div><div className="space-y-3">{lines.map((line, index) => <div key={line.id} className="grid gap-3 rounded-lg border border-[#e2e8f0] p-3 md:grid-cols-[minmax(0,1fr)_150px_130px_42px] md:items-end"><div className="grid gap-2"><Label htmlFor={`adjustment-item-${line.id}`}>Item {index + 1}</Label><select id={`adjustment-item-${line.id}`} value={line.item_id} onChange={(event) => updateLine(line.id, { item_id: event.target.value })} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select>{line.item_id && <p className="text-[11px] text-[#94a3b8]">Current stock: {balance.get(line.item_id)?.toLocaleString("en-IN", { maximumFractionDigits: 3 }) || "0"} {items.find((item) => item.id === line.item_id)?.unit_code || ""}</p>}</div><div className="grid gap-2"><Label htmlFor={`adjustment-direction-${line.id}`}>Change</Label><select id={`adjustment-direction-${line.id}`} value={line.direction} onChange={(event) => updateLine(line.id, { direction: event.target.value as Line["direction"] })} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="increase">Increase</option><option value="decrease">Decrease</option></select></div><div className="grid gap-2"><Label htmlFor={`adjustment-quantity-${line.id}`}>Quantity</Label><Input id={`adjustment-quantity-${line.id}`} value={line.quantity} onChange={(event) => quantityPattern(event.target.value) && updateLine(line.id, { quantity: event.target.value })} inputMode="decimal" maxLength={19} placeholder="0.000" required /></div><Button type="button" variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={() => removeLine(line.id)} disabled={lines.length === 1} className="size-11 p-0 text-[#64748b] hover:text-[#b42318]"><Trash2 className="size-4" /></Button></div>)}</div><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { id: crypto.randomUUID(), item_id: "", direction: "increase", quantity: "" }])} className="mt-4"><Plus className="size-4" />Add item</Button></section>
    </div><aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={6} placeholder="Add context for this adjustment" className="mt-5 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></section>{error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row xl:flex-col-reverse"><Button type="button" variant="outline" asChild><Link href="/inventory-adjustment">Cancel</Link></Button><Button type="submit" loading={loading} disabled={warehouses.length === 0 || items.length === 0}>{loading ? "Saving..." : "Save as draft"}</Button></div></aside></form>
  </div>;
}
