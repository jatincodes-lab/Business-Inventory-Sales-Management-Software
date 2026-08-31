"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Plus, Trash2 } from "lucide-react";

import { createStockTransfer } from "@/app/actions/inventory-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InventoryOption, StockOption, WarehouseOption } from "@/components/inventory-adjustment-form";

type Line = { id: string; item_id: string; quantity: string };
function number(value: string | number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function quantityPattern(value: string) { return /^\d*(?:\.\d{0,3})?$/.test(value); }

export function StockTransferForm({ warehouses, items, balances, suggestedNumber, initialDate }: { warehouses: WarehouseOption[]; items: InventoryOption[]; balances: StockOption[]; suggestedNumber: string; initialDate: string }) {
  const router = useRouter();
  const [sourceWarehouseId, setSourceWarehouseId] = useState(warehouses[0]?.id || "");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(warehouses[1]?.id || "");
  const [transferNumber, setTransferNumber] = useState(suggestedNumber);
  const [transferDate, setTransferDate] = useState(initialDate);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ id: "line-1", item_id: "", quantity: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const updateLine = (id: string, changes: Partial<Line>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
  const removeLine = (id: string) => setLines((current) => current.length > 1 ? current.filter((line) => line.id !== id) : current);
  const available = (itemId: string) => balances.find((row) => row.item_id === itemId && row.warehouse_id === sourceWarehouseId)?.quantity || 0;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (loading) return; setLoading(true); setError(null);
    const formData = new FormData();
    formData.set("source_warehouse_id", sourceWarehouseId); formData.set("destination_warehouse_id", destinationWarehouseId); formData.set("transfer_number", transferNumber); formData.set("transfer_date", transferDate); formData.set("notes", notes);
    formData.set("lines", JSON.stringify(lines.filter((line) => line.item_id && line.quantity).map(({ item_id, quantity }) => ({ item_id, quantity }))));
    try { const result = await createStockTransfer(formData); if (!result.ok) { setError(result.message); return; } router.push(`/inventory-transfers/${result.documentId}`); router.refresh(); }
    catch { setError("Unable to save transfer. Check your connection and try again."); } finally { setLoading(false); }
  };
  return <div>
    <div className="mb-7"><Link href="/inventory-transfers" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to transfers</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Inventory</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">New stock transfer</h1><p className="mt-1 text-sm text-[#64748b]">Move stock between active warehouses in this workspace.</p></div>
    {warehouses.length < 2 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create at least two active warehouses before creating a transfer.</div>}
    {items.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create an active item before creating a transfer.</div>}
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]"><div className="space-y-6"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Transfer details</h2><p className="mt-1 text-xs text-[#94a3b8]">Stock changes only after the transfer is posted.</p></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="transfer-number">Transfer number</Label><Input id="transfer-number" value={transferNumber} onChange={(event) => setTransferNumber(event.target.value.toUpperCase())} maxLength={40} required /></div><div className="grid gap-2"><Label htmlFor="transfer-date">Transfer date</Label><Input id="transfer-date" type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="source-warehouse">From warehouse</Label><select id="source-warehouse" value={sourceWarehouseId} onChange={(event) => setSourceWarehouseId(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select source</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="destination-warehouse">To warehouse</Label><select id="destination-warehouse" value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select destination</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div></div></section><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0f172a]">Items</h2><p className="mt-1 text-xs text-[#94a3b8]">Available stock is checked again when posting.</p></div><ArrowRightLeft className="size-5 text-[#00a63e]" /></div><div className="space-y-3">{lines.map((line, index) => <div key={line.id} className="grid gap-3 rounded-lg border border-[#e2e8f0] p-3 md:grid-cols-[minmax(0,1fr)_170px_42px] md:items-end"><div className="grid gap-2"><Label htmlFor={`transfer-item-${line.id}`}>Item {index + 1}</Label><select id={`transfer-item-${line.id}`} value={line.item_id} onChange={(event) => updateLine(line.id, { item_id: event.target.value })} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select>{line.item_id && <p className="text-[11px] text-[#94a3b8]">Available: {number(available(line.item_id)).toLocaleString("en-IN", { maximumFractionDigits: 3 })} {items.find((item) => item.id === line.item_id)?.unit_code || ""}</p>}</div><div className="grid gap-2"><Label htmlFor={`transfer-quantity-${line.id}`}>Quantity</Label><Input id={`transfer-quantity-${line.id}`} value={line.quantity} onChange={(event) => quantityPattern(event.target.value) && updateLine(line.id, { quantity: event.target.value })} inputMode="decimal" maxLength={19} placeholder="0.000" required /></div><Button type="button" variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={() => removeLine(line.id)} disabled={lines.length === 1} className="size-11 p-0 text-[#64748b] hover:text-[#b42318]"><Trash2 className="size-4" /></Button></div>)}</div><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { id: crypto.randomUUID(), item_id: "", quantity: "" }])} className="mt-4"><Plus className="size-4" />Add item</Button></section></div><aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={6} placeholder="Add transfer notes" className="mt-5 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></section>{error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row xl:flex-col-reverse"><Button type="button" variant="outline" asChild><Link href="/inventory-transfers">Cancel</Link></Button><Button type="submit" loading={loading} disabled={warehouses.length < 2 || items.length === 0}>{loading ? "Saving..." : "Save as draft"}</Button></div></aside></form>
  </div>;
}
