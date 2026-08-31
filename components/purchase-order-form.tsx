"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { createPurchaseOrder } from "@/app/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PurchaseOrderVendorOption = { id: string; name: string; address: string | null; payment_terms_days: number };
export type PurchaseOrderItemOption = { id: string; sku: string; name: string; purchase_price: string | number; tax_rate: string | number };

type PurchaseOrderLine = { item_id: string; ordered_quantity: string; unit_cost: string; tax_rate: string };

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function number(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function matchesDecimal(value: string, scale: number) {
  return new RegExp(`^\\d*(?:\\.\\d{0,${scale}})?$`).test(value);
}

function rowTotal(line: PurchaseOrderLine) {
  return number(line.ordered_quantity) * number(line.unit_cost) * (1 + number(line.tax_rate) / 100);
}

export function PurchaseOrderForm({ vendors, items, suggestedOrderNumber }: { vendors: PurchaseOrderVendorOption[]; items: PurchaseOrderItemOption[]; suggestedOrderNumber: string }) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState(suggestedOrderNumber);
  const [vendorId, setVendorId] = useState("");
  const [orderDate, setOrderDate] = useState(localDate);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [reference, setReference] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("0");
  const [shipmentPreference, setShipmentPreference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseOrderLine[]>([{ item_id: "", ordered_quantity: "1", unit_cost: "0", tax_rate: "0" }]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId);
  const total = lines.reduce((sum, line) => sum + rowTotal(line), 0);

  const chooseVendor = (id: string) => {
    const vendor = vendors.find((option) => option.id === id);
    setVendorId(id);
    if (vendor) {
      setDeliveryAddress(vendor.address || "");
      setPaymentTerms(String(vendor.payment_terms_days));
    }
  };

  const chooseItem = (index: number, itemId: string) => {
    const item = items.find((option) => option.id === itemId);
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, item_id: itemId, unit_cost: item ? String(item.purchase_price) : "0", tax_rate: item ? String(item.tax_rate) : "0" } : line));
  };

  const updateLine = (index: number, key: keyof PurchaseOrderLine, value: string) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setError(null);
    setIsLoading(true);
    const formData = new FormData();
    formData.set("order_number", orderNumber);
    formData.set("vendor_id", vendorId);
    formData.set("order_date", orderDate);
    formData.set("delivery_date", deliveryDate);
    formData.set("reference", reference);
    formData.set("delivery_address", deliveryAddress);
    formData.set("payment_terms_days", paymentTerms);
    formData.set("shipment_preference", shipmentPreference);
    formData.set("notes", notes);
    formData.set("lines", JSON.stringify(lines));
    const result = await createPurchaseOrder(formData);
    if (!result.ok) {
      setError(result.message);
      setIsLoading(false);
      return;
    }
    router.push("/purchase-orders");
    router.refresh();
  };

  return <div>
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/purchase-orders" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to purchase orders</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Purchasing</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">New purchase order</h1><p className="mt-1 text-sm text-[#64748b]">Plan an incoming purchase. Stock changes only after a receipt is posted.</p></div>
    </div>

    {vendors.length === 0 || items.length === 0 ? <div className="mb-6 rounded-xl border border-[#f5d48a] bg-[#fffaf0] p-4 text-sm text-[#7a5200]"><p className="font-semibold">Add master data before creating an order.</p><p className="mt-1">{vendors.length === 0 && <><Link href="/vendors" className="font-semibold underline">Create a vendor</Link>{items.length === 0 ? " and " : " first."}</>}{items.length === 0 && <Link href="/items" className="font-semibold underline">create an item</Link>}.</p></div> : null}

    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
      <div className="space-y-6">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6">
          <div className="mb-5"><h2 className="text-base font-semibold text-[#0f172a]">Order details</h2><p className="mt-1 text-xs text-[#64748b]">Choose the vendor and delivery details for this order.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="po-vendor">Vendor</Label><select id="po-vendor" value={vendorId} onChange={(event) => chooseVendor(event.target.value)} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select a vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></div>
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="po-address">Delivery address <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="po-address" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={500} rows={3} placeholder={selectedVendor?.address ? "Vendor address" : "Delivery address"} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
            <div className="grid gap-2"><Label htmlFor="po-number">Purchase order number</Label><Input id="po-number" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.toUpperCase())} maxLength={40} required /></div>
            <div className="grid gap-2"><Label htmlFor="po-reference">Reference <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="po-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="Supplier reference" /></div>
            <div className="grid gap-2"><Label htmlFor="po-date">Order date</Label><Input id="po-date" type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required /></div>
            <div className="grid gap-2"><Label htmlFor="po-delivery-date">Delivery date <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="po-delivery-date" type="date" value={deliveryDate} min={orderDate} onChange={(event) => setDeliveryDate(event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="po-payment-terms">Payment terms (days)</Label><Input id="po-payment-terms" value={paymentTerms} onChange={(event) => /^\d{0,4}$/.test(event.target.value) && setPaymentTerms(event.target.value)} inputMode="numeric" maxLength={4} className="h-11 text-right" required /></div>
            <div className="grid gap-2"><Label htmlFor="po-shipment">Shipment preference <span className="font-normal text-[#94a3b8]">(optional)</span></Label><select id="po-shipment" value={shipmentPreference} onChange={(event) => setShipmentPreference(event.target.value)} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select preference</option><option value="standard">Standard delivery</option><option value="express">Express delivery</option><option value="vendor_arranged">Vendor arranged</option><option value="pickup">Pickup</option></select></div>
          </div>
        </section>

        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-base font-semibold text-[#0f172a]">Item table</h2><p className="mt-1 text-xs text-[#64748b]">Add each item once. Quantities remain unchanged until stock is received.</p></div><span className="hidden text-xs font-semibold text-[#00a63e] sm:block">{lines.length} {lines.length === 1 ? "line" : "lines"}</span></div>
          <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#f8fafc] text-xs text-[#64748b]"><tr><th className="px-4 py-3 text-left font-medium">Item details</th><th className="px-4 py-3 text-right font-medium">Quantity</th><th className="px-4 py-3 text-right font-medium">Rate</th><th className="px-4 py-3 text-right font-medium">Tax %</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="w-12 px-2 py-3"><span className="sr-only">Remove</span></th></tr></thead><tbody className="divide-y divide-[#f1f5f9]">{lines.map((line, index) => <tr key={index}><td className="px-4 py-3"><select aria-label={`Item ${index + 1}`} value={line.item_id} onChange={(event) => chooseItem(index, event.target.value)} required className="h-11 w-full min-w-64 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select an item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}</select></td><td className="px-4 py-3"><Input aria-label={`Quantity ${index + 1}`} value={line.ordered_quantity} onChange={(event) => matchesDecimal(event.target.value, 3) && updateLine(index, "ordered_quantity", event.target.value)} inputMode="decimal" maxLength={19} className="h-11 text-right" required /></td><td className="px-4 py-3"><Input aria-label={`Rate ${index + 1}`} value={line.unit_cost} onChange={(event) => matchesDecimal(event.target.value, 2) && updateLine(index, "unit_cost", event.target.value)} inputMode="decimal" maxLength={19} className="h-11 text-right" required /></td><td className="px-4 py-3"><Input aria-label={`Tax rate ${index + 1}`} value={line.tax_rate} onChange={(event) => matchesDecimal(event.target.value, 2) && updateLine(index, "tax_rate", event.target.value)} inputMode="decimal" maxLength={6} className="h-11 text-right" required /></td><td className="px-4 py-3 text-right font-mono text-xs text-[#334155]">{money(rowTotal(line))}</td><td className="px-2 py-3 text-center"><button type="button" aria-label={`Remove item ${index + 1}`} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="grid size-10 place-items-center rounded-lg text-[#64748b] hover:bg-[#feecec] hover:text-[#b42318]" disabled={lines.length === 1}><Trash2 className="size-4" /></button></td></tr>)}</tbody></table></div>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setLines((current) => [...current, { item_id: "", ordered_quantity: "1", unit_cost: "0", tax_rate: "0" }])}><Plus className="size-4" />Add new row</Button>
        </section>
      </div>

      <aside className="h-fit space-y-6 xl:sticky xl:top-24">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><h2 className="text-base font-semibold text-[#0f172a]">Order summary</h2><div className="mt-5 space-y-3 border-b border-[#f1f5f9] pb-5"><div className="flex justify-between gap-4 text-sm text-[#64748b]"><span>Line items</span><span className="font-mono text-[#334155]">{lines.length}</span></div><div className="flex justify-between gap-4 text-sm text-[#64748b]"><span>Subtotal and tax</span><span className="font-mono text-[#334155]">{money(total)}</span></div></div><div className="flex items-end justify-between gap-4 pt-5"><span className="text-sm font-semibold text-[#334155]">Order total</span><span className="font-mono text-xl font-semibold text-[#0f172a]">{money(total)}</span></div></section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="grid gap-2"><Label htmlFor="po-notes">Notes <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="po-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={5} placeholder="Add instructions for this purchase order" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div></section>
        {error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row xl:flex-col-reverse"><Button type="button" variant="outline" asChild><Link href="/purchase-orders">Cancel</Link></Button><Button type="submit" loading={isLoading} disabled={vendors.length === 0 || items.length === 0}>{isLoading ? "Saving..." : "Save as draft"}</Button></div>
      </aside>
    </form>
  </div>;
}
