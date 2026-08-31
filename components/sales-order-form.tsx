"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { createSalesOrder } from "@/app/actions/sales-documents";
import type { StockOption } from "@/components/inventory-adjustment-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SalesCustomerOption = { id: string; name: string; email: string | null };
export type SalesItemOption = { id: string; name: string; sku: string; sale_price: string | number; tax_rate: string | number };
type Line = { id: string; item_id: string; ordered_quantity: string; unit_price: string; tax_rate: string };

function number(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function matches(value: string, scale: number) {
  return new RegExp(`^\\d*(?:\\.\\d{0,${scale}})?$`).test(value);
}

function quantity(value: string | number) {
  return number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

export function SalesOrderForm({ customers, items, suggestedNumber, initialDate, balances, stockCheckAvailable }: { customers: SalesCustomerOption[]; items: SalesItemOption[]; suggestedNumber: string; initialDate: string; balances: StockOption[]; stockCheckAvailable: boolean }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [orderNumber, setOrderNumber] = useState(suggestedNumber);
  const [orderDate, setOrderDate] = useState(initialDate);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ id: "line-1", item_id: "", ordered_quantity: "1", unit_price: "0", tax_rate: "0" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const total = lines.reduce((sum, line) => sum + number(line.ordered_quantity) * number(line.unit_price) * (1 + number(line.tax_rate) / 100), 0);
  const stockFor = (itemId: string) => balances.filter((balance) => balance.item_id === itemId).reduce((sum, balance) => sum + Math.max(0, number(balance.quantity) - number(balance.reserved_quantity || 0)), 0);
  const stockLines = lines.filter((line) => line.item_id);
  const shortageLines = stockLines.filter((line) => number(line.ordered_quantity) > stockFor(line.item_id));

  const updateLine = (id: string, changes: Partial<Line>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
  const chooseItem = (id: string, itemId: string) => {
    const item = items.find((option) => option.id === itemId);
    updateLine(id, { item_id: itemId, unit_price: item ? String(item.sale_price) : "0", tax_rate: item ? String(item.tax_rate) : "0" });
  };
  const removeLine = (id: string) => setLines((current) => current.length > 1 ? current.filter((line) => line.id !== id) : current);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("customer_id", customerId);
    formData.set("order_number", orderNumber);
    formData.set("order_date", orderDate);
    formData.set("notes", notes);
    formData.set("lines", JSON.stringify(lines));
    try {
      const result = await createSalesOrder(formData);
      if (!result.ok) { setError(result.message); return; }
      router.push(`/sales-orders/${result.documentId}`);
      router.refresh();
    } catch {
      setError("Unable to save sales order. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return <div>
    <div className="mb-7"><Link href="/sales-orders" className="mb-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to sales orders</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Sales</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">New sales order</h1><p className="mt-1 text-sm text-[#64748b]">Plan customer demand before dispatching stock.</p></div>
    {customers.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create an active customer before creating a sales order.</div>}
    {items.length === 0 && <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]">Create an active item before creating a sales order.</div>}
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
      <div className="space-y-6">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Order details</h2><p className="mt-1 text-xs text-[#94a3b8]">Stock changes only after a fulfillment is posted.</p></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2 sm:col-span-2"><Label htmlFor="sales-customer">Customer</Label><select id="sales-customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.email ? ` - ${customer.email}` : ""}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="sales-order-number">Sales order number</Label><Input id="sales-order-number" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.toUpperCase())} maxLength={40} required /></div><div className="grid gap-2"><Label htmlFor="sales-order-date">Order date</Label><Input id="sales-order-date" type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required /></div></div></section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0f172a]">Items</h2><p className="mt-1 text-xs text-[#94a3b8]">Prices are copied from the item catalog and can be adjusted.</p></div><ShoppingCart className="size-5 text-[#00a63e]" /></div><div className="space-y-3">{lines.map((line, index) => <div key={line.id} className="grid gap-3 rounded-lg border border-[#e2e8f0] p-3 md:grid-cols-[minmax(0,1fr)_130px_115px_100px_42px] md:items-start"><div className="grid gap-2"><Label htmlFor={`sales-item-${line.id}`}>Item {index + 1}</Label><select id={`sales-item-${line.id}`} value={line.item_id} onChange={(event) => chooseItem(line.id, event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.sku}</option>)}</select></div><div className="grid gap-2"><Label htmlFor={`sales-quantity-${line.id}`}>Quantity</Label><Input id={`sales-quantity-${line.id}`} value={line.ordered_quantity} onChange={(event) => matches(event.target.value, 3) && updateLine(line.id, { ordered_quantity: event.target.value })} inputMode="decimal" maxLength={19} required /></div><div className="grid gap-2"><Label htmlFor={`sales-price-${line.id}`}>Rate</Label><Input id={`sales-price-${line.id}`} value={line.unit_price} onChange={(event) => matches(event.target.value, 2) && updateLine(line.id, { unit_price: event.target.value })} inputMode="decimal" maxLength={19} required /></div><div className="grid gap-2"><Label htmlFor={`sales-tax-${line.id}`}>Tax %</Label><Input id={`sales-tax-${line.id}`} value={line.tax_rate} onChange={(event) => matches(event.target.value, 2) && updateLine(line.id, { tax_rate: event.target.value })} inputMode="decimal" maxLength={6} required /></div><Button type="button" variant="ghost" aria-label={`Remove item ${index + 1}`} onClick={() => removeLine(line.id)} disabled={lines.length === 1} className="size-11 p-0 text-[#64748b] hover:text-[#b42318]"><Trash2 className="size-4" /></Button></div>)}</div><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { id: crypto.randomUUID(), item_id: "", ordered_quantity: "1", unit_price: "0", tax_rate: "0" }])} className="mt-4"><Plus className="size-4" />Add item</Button>{stockLines.length > 0 && <div className={`mt-5 rounded-lg border p-4 text-sm ${stockCheckAvailable && shortageLines.length > 0 ? "border-[#f4b4b0] bg-[#fff5f5] text-[#8a1c18]" : "border-[#b9e7c9] bg-[#f0fff5] text-[#08752e]"}`} role="status"><p className="font-medium">{stockCheckAvailable ? shortageLines.length > 0 ? "Some items may need more stock before dispatch." : "Current stock covers these items across your warehouses." : "Stock availability will be checked when you choose a warehouse."}</p>{stockCheckAvailable && shortageLines.length > 0 && <ul className="mt-2 space-y-1 text-xs">{shortageLines.map((line) => { const item = items.find((option) => option.id === line.item_id); return <li key={line.id}>{item?.name || "Item"}: ordered {quantity(line.ordered_quantity)}, available {quantity(stockFor(line.item_id))}.</li>; })}</ul>}<p className="mt-2 text-xs opacity-80">This is an early guide. The selected warehouse is checked again before dispatch.</p></div>}</section>
      </div>
      <aside className="h-fit space-y-6 xl:sticky xl:top-24"><section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><h2 className="text-base font-semibold text-[#0f172a]">Notes</h2><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={6} placeholder="Add order notes" className="mt-5 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /><div className="mt-6 flex items-end justify-between gap-4 border-t border-[#f1f5f9] pt-5"><span className="text-sm font-semibold text-[#334155]">Order total</span><span className="font-mono text-xl font-semibold text-[#0f172a]">{money(total)}</span></div></section>{error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row xl:flex-col-reverse"><Button type="button" variant="outline" asChild><Link href="/sales-orders">Cancel</Link></Button><Button type="submit" loading={loading} disabled={customers.length === 0 || items.length === 0}>{loading ? "Saving..." : "Save as draft"}</Button></div></aside>
    </form>
  </div>;
}
