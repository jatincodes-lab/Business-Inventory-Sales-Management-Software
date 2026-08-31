"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Building2, Pencil, Plus, Ruler, Search, Users, Warehouse, X } from "lucide-react";

import {
  createItem,
  createCustomer,
  createUnit,
  createVendor,
  createWarehouse,
  updateItem,
  updateCustomer,
  updateUnit,
  updateVendor,
  updateWarehouse,
} from "@/app/actions/master-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type UnitRecord = { id: string; name: string; code: string };
export type WarehouseRecord = { id: string; name: string; address: string | null; is_active: boolean };
export type VendorRecord = { id: string; name: string; email: string | null; mobile: string | null; address: string | null; tax_id: string | null; payment_terms_days: number; is_active: boolean };
export type ItemRecord = { id: string; sku: string; name: string; unit_id: string; purchase_price: string | number; sale_price: string | number; tax_rate: string | number; reorder_level: string | number; is_active: boolean };
export type CustomerRecord = { id: string; name: string; email: string | null; mobile: string | null; address: string | null; tax_id: string | null; payment_terms_days: number; is_active: boolean; credit_balance?: string | number | null };

type PageKind = "units" | "warehouses" | "items" | "vendors" | "customers";
type Row = UnitRecord | WarehouseRecord | VendorRecord | CustomerRecord | ItemRecord;
type FormState = { name: string; code: string; address: string; email: string; mobile: string; tax_id: string; payment_terms_days: string; is_active: string; sku: string; unit_id: string; purchase_price: string; sale_price: string; tax_rate: string; reorder_level: string };

const emptyForm: FormState = { name: "", code: "", address: "", email: "", mobile: "", tax_id: "", payment_terms_days: "0", is_active: "true", sku: "", unit_id: "", purchase_price: "0", sale_price: "0", tax_rate: "0", reorder_level: "0" };
const pageConfig: Record<PageKind, { title: string; eyebrow: string; description: string; add: string; empty: string; href: string; icon: typeof Boxes }> = {
  units: { title: "Units", eyebrow: "Master data", description: "Define the units used when purchasing and selling items.", add: "Add unit", empty: "No units created yet.", href: "/units", icon: Ruler },
  warehouses: { title: "Warehouses", eyebrow: "Inventory locations", description: "Keep stock locations clear before receiving your first purchase.", add: "Add warehouse", empty: "No warehouses created yet.", href: "/warehouses", icon: Warehouse },
  items: { title: "Items", eyebrow: "Product catalog", description: "Manage SKUs, prices, taxes, and reorder levels in one place.", add: "Add item", empty: "No items created yet.", href: "/items", icon: Boxes },
  vendors: { title: "Vendors", eyebrow: "Purchasing directory", description: "Keep supplier contacts and payment terms ready for purchase orders.", add: "Add vendor", empty: "No vendors created yet.", href: "/vendors", icon: Building2 },
  customers: { title: "Customers", eyebrow: "Customer directory", description: "Save customer details so sales are faster.", add: "Add customer", empty: "No customers added yet.", href: "/customers", icon: Users },
};

function isDecimal(value: string, scale: number) {
  return /^\d*(?:\.\d*)?$/.test(value) && (!value.includes(".") || value.split(".")[1].length <= scale);
}

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${active ? "bg-[#e6f8ee] text-[#08752e]" : "bg-[#f1f5f9] text-[#64748b]"}`}>{active ? "Active" : "Inactive"}</span>;
}

function EditButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="invisible inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#64748b] hover:bg-[#e6f8ee] hover:text-[#08752e] group-hover:visible focus-visible:visible"><Pencil className="size-3.5" />Edit</button>;
}

function RecordTable({ kind, rows, units, onEdit, showCustomerCredit }: { kind: PageKind; rows: Row[]; units: UnitRecord[]; onEdit: (row: Row) => void; showCustomerCredit: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-[#f1f5f9] bg-[#fbfcfd] text-xs text-[#64748b]"><tr>
    {kind === "units" && <><th className="px-5 py-3 text-left font-medium">Name</th><th className="px-5 py-3 text-left font-medium">Code</th></>}
    {kind === "warehouses" && <><th className="px-5 py-3 text-left font-medium">Name</th><th className="px-5 py-3 text-left font-medium">Address</th><th className="px-5 py-3 text-center font-medium">Status</th></>}
    {kind === "vendors" && <><th className="px-5 py-3 text-left font-medium">Vendor</th><th className="px-5 py-3 text-left font-medium">Contact</th><th className="px-5 py-3 text-left font-medium">Tax ID</th><th className="px-5 py-3 text-right font-medium">Terms</th><th className="px-5 py-3 text-center font-medium">Status</th></>}
    {kind === "customers" && <><th className="px-5 py-3 text-left font-medium">Customer</th><th className="px-5 py-3 text-left font-medium">Contact</th><th className="px-5 py-3 text-left font-medium">Tax ID</th><th className="px-5 py-3 text-right font-medium">Terms</th>{showCustomerCredit && <th className="px-5 py-3 text-right font-medium">Available credit</th>}<th className="px-5 py-3 text-center font-medium">Status</th></>}
    {kind === "items" && <><th className="px-5 py-3 text-left font-medium">SKU</th><th className="px-5 py-3 text-left font-medium">Item name</th><th className="px-5 py-3 text-left font-medium">Unit</th><th className="px-5 py-3 text-right font-medium">Purchase</th><th className="px-5 py-3 text-right font-medium">Sale</th><th className="px-5 py-3 text-right font-medium">Tax</th><th className="px-5 py-3 text-center font-medium">Status</th></>}
    <th className="px-5 py-3 text-center font-medium">Action</th>
  </tr></thead><tbody className="divide-y divide-[#f1f5f9]">{rows.map((row) => {
    if (kind === "units") { const unit = row as UnitRecord; return <tr key={row.id} className="group hover:bg-[#fbfcfd]"><td className="px-5 py-4 font-medium text-[#334155]">{unit.name}</td><td className="px-5 py-4 font-mono text-xs text-[#64748b]">{unit.code}</td><td className="px-5 py-4 text-center"><EditButton onClick={() => onEdit(row)} /></td></tr>; }
    if (kind === "warehouses") { const warehouse = row as WarehouseRecord; return <tr key={row.id} className="group hover:bg-[#fbfcfd]"><td className="px-5 py-4 font-medium text-[#334155]">{warehouse.name}</td><td className="max-w-xs truncate px-5 py-4 text-[#64748b]">{warehouse.address || "-"}</td><td className="px-5 py-4 text-center"><StatusBadge active={warehouse.is_active} /></td><td className="px-5 py-4 text-center"><EditButton onClick={() => onEdit(row)} /></td></tr>; }
    if (kind === "vendors") { const vendor = row as VendorRecord; return <tr key={row.id} className="group hover:bg-[#fbfcfd]"><td className="px-5 py-4 font-medium text-[#334155]">{vendor.name}</td><td className="px-5 py-4 text-[#64748b]"><span className="block max-w-xs truncate">{vendor.email || "-"}</span><span className="block text-xs">{vendor.mobile || "-"}</span></td><td className="px-5 py-4 font-mono text-xs text-[#64748b]">{vendor.tax_id || "-"}</td><td className="px-5 py-4 text-right tabular-nums text-[#334155]">{vendor.payment_terms_days} days</td><td className="px-5 py-4 text-center"><StatusBadge active={vendor.is_active} /></td><td className="px-5 py-4 text-center"><EditButton onClick={() => onEdit(row)} /></td></tr>; }
    if (kind === "customers") { const customer = row as CustomerRecord; return <tr key={row.id} className="group hover:bg-[#fbfcfd]"><td className="px-5 py-4 font-medium text-[#334155]">{customer.name}</td><td className="px-5 py-4 text-[#64748b]"><span className="block max-w-xs truncate">{customer.email || "-"}</span><span className="block text-xs">{customer.mobile || "-"}</span></td><td className="px-5 py-4 font-mono text-xs text-[#64748b]">{customer.tax_id || "-"}</td><td className="px-5 py-4 text-right tabular-nums text-[#334155]">{customer.payment_terms_days} days</td>{showCustomerCredit && <td className="px-5 py-4 text-right font-mono text-xs font-semibold text-[#08752e]">{customer.credit_balance === null || customer.credit_balance === undefined ? "-" : `₹${money(customer.credit_balance)}`}</td>}<td className="px-5 py-4 text-center"><StatusBadge active={customer.is_active} /></td><td className="px-5 py-4 text-center"><EditButton onClick={() => onEdit(row)} /></td></tr>; }
    const item = row as ItemRecord; const unit = units.find((entry) => entry.id === item.unit_id); return <tr key={row.id} className="group hover:bg-[#fbfcfd]"><td className="px-5 py-4 font-mono text-xs text-[#64748b]">{item.sku}</td><td className="px-5 py-4 font-medium text-[#334155]">{item.name}</td><td className="px-5 py-4 text-[#64748b]">{unit ? `${unit.name} (${unit.code})` : "-"}</td><td className="px-5 py-4 text-right tabular-nums text-[#334155]">{money(item.purchase_price)}</td><td className="px-5 py-4 text-right tabular-nums text-[#334155]">{money(item.sale_price)}</td><td className="px-5 py-4 text-right tabular-nums text-[#64748b]">{item.tax_rate}%</td><td className="px-5 py-4 text-center"><StatusBadge active={item.is_active} /></td><td className="px-5 py-4 text-center"><EditButton onClick={() => onEdit(row)} /></td></tr>;
  })}</tbody></table></div>;
}

export function MasterDataPage({ kind, rows, units, page, hasNext, initiallyOpen = false, loadError, showCustomerCredit = false }: { kind: PageKind; rows: Row[]; units: UnitRecord[]; page: number; hasNext: boolean; initiallyOpen?: boolean; loadError?: string; showCustomerCredit?: boolean }) {
  const router = useRouter();
  const config = pageConfig[kind];
  const PageIcon = config.icon;
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(initiallyOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!formOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !isLoading) setFormOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [formOpen, isLoading]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const values = "code" in row ? [row.name, row.code] : "sku" in row ? [row.name, row.sku] : "email" in row ? [row.name, row.email, row.mobile, row.tax_id, row.address] : [row.name, row.address];
      return values.some((value) => typeof value === "string" && value.toLowerCase().includes(term));
    });
  }, [rows, search]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setFormError(null); setFormOpen(true); };
  const openEdit = (row: Row) => {
    setEditingId(row.id); setFormError(null);
    if (kind === "units") { const unit = row as UnitRecord; setForm({ ...emptyForm, name: unit.name, code: unit.code }); }
    else if (kind === "warehouses") { const warehouse = row as WarehouseRecord; setForm({ ...emptyForm, name: warehouse.name, address: warehouse.address ?? "" }); }
    else if (kind === "items") { const item = row as ItemRecord; setForm({ ...emptyForm, name: item.name, sku: item.sku, unit_id: item.unit_id, purchase_price: String(item.purchase_price), sale_price: String(item.sale_price), tax_rate: String(item.tax_rate), reorder_level: String(item.reorder_level) }); }
    else if (kind === "customers") { const customer = row as CustomerRecord; setForm({ ...emptyForm, name: customer.name, email: customer.email ?? "", mobile: customer.mobile ?? "", address: customer.address ?? "", tax_id: customer.tax_id ?? "", payment_terms_days: String(customer.payment_terms_days), is_active: String(customer.is_active) }); }
    else { const vendor = row as VendorRecord; setForm({ ...emptyForm, name: vendor.name, email: vendor.email ?? "", mobile: vendor.mobile ?? "", address: vendor.address ?? "", tax_id: vendor.tax_id ?? "", payment_terms_days: String(vendor.payment_terms_days) }); }
    setFormOpen(true);
  };
  const closeForm = () => { if (!isLoading) { setFormOpen(false); setFormError(null); } };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setFormError(null); setIsLoading(true);
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.set(key, value));
    if (editingId) formData.set("id", editingId);
    try {
      let result;
      if (kind === "units") result = editingId ? await updateUnit(formData) : await createUnit(formData);
      else if (kind === "warehouses") result = editingId ? await updateWarehouse(formData) : await createWarehouse(formData);
      else if (kind === "items") result = editingId ? await updateItem(formData) : await createItem(formData);
      else if (kind === "customers") result = editingId ? await updateCustomer(formData) : await createCustomer(formData);
      else result = editingId ? await updateVendor(formData) : await createVendor(formData);
      if (!result.ok) { setFormError(result.message); return; }
      setFormOpen(false); router.refresh();
    } catch {
      setFormError("Unable to save this record right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const setDecimal = (key: keyof FormState, scale: number, value: string) => { if (isDecimal(value, scale)) setForm((current) => ({ ...current, [key]: value })); };

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link href="/protected" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to dashboard</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">{config.eyebrow}</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">{config.title}</h1><p className="mt-1 text-sm text-[#64748b]">{config.description}</p></div><Button type="button" onClick={openCreate}><Plus className="size-4" />{config.add}</Button></div>

    {formOpen && <div className="fixed inset-0 z-[80] overflow-y-auto p-4 md:p-8" role="dialog" aria-modal="true" aria-labelledby="master-data-form-title" aria-describedby="master-data-form-description"><button type="button" aria-label="Close dialog" onClick={closeForm} className="absolute inset-0 h-full w-full cursor-default bg-[#0e1f16]/55 backdrop-blur-[2px]" /><section className="relative mx-auto my-4 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-2xl md:my-8 md:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><p id="master-data-form-title" className="text-lg font-semibold text-[#0f172a]">{editingId ? `Edit ${kind === "items" ? "item" : kind === "warehouses" ? "warehouse" : kind === "vendors" ? "vendor" : kind === "customers" ? "customer" : "unit"}` : config.add}</p><p id="master-data-form-description" className="mt-1 text-xs text-[#64748b]">{kind === "customers" ? "Add the details your team needs during a sale." : "Add only the details your team needs."}</p></div><button type="button" aria-label="Close dialog" onClick={closeForm} className="grid size-9 shrink-0 place-items-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"><X className="size-4" /></button></div><form onSubmit={submitForm} className="space-y-5">
      {kind === "units" && <div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="unit-name">Unit name</Label><Input id="unit-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={30} placeholder="Piece" required /></div><div className="grid gap-2"><Label htmlFor="unit-code">Code</Label><Input id="unit-code" value={form.code} onChange={(event) => { const value = event.target.value.toUpperCase(); if (/^[A-Z0-9_-]*$/.test(value)) setForm({ ...form, code: value }); }} maxLength={20} placeholder="PCS" required /></div></div>}
      {kind === "warehouses" && <div className="grid gap-5"><div className="grid gap-2"><Label htmlFor="warehouse-name">Warehouse name</Label><Input id="warehouse-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} placeholder="Main warehouse" required /></div><div className="grid gap-2"><Label htmlFor="warehouse-address">Address <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="warehouse-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={500} rows={3} placeholder="Warehouse address" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div></div>}
      {kind === "vendors" && <div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2 sm:col-span-2"><Label htmlFor="vendor-name">Vendor name</Label><Input id="vendor-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={160} placeholder="Acme Supplies" required /></div><div className="grid gap-2"><Label htmlFor="vendor-email">Email <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="vendor-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} placeholder="vendor@example.com" autoComplete="email" /></div><div className="grid gap-2"><Label htmlFor="vendor-mobile">Mobile <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="vendor-mobile" value={form.mobile} onChange={(event) => { const value = event.target.value; if (/^\d{0,10}$/.test(value)) setForm({ ...form, mobile: value }); }} inputMode="numeric" maxLength={10} placeholder="9876543210" className="text-right" /></div><div className="grid gap-2"><Label htmlFor="vendor-tax-id">Tax ID <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="vendor-tax-id" value={form.tax_id} onChange={(event) => { const value = event.target.value.toUpperCase(); if (/^[A-Z0-9./_-]*$/.test(value)) setForm({ ...form, tax_id: value }); }} maxLength={50} placeholder="GSTIN or tax reference" /></div><div className="grid gap-2"><Label htmlFor="vendor-payment-terms">Payment terms (days)</Label><Input id="vendor-payment-terms" value={form.payment_terms_days} onChange={(event) => { const value = event.target.value; if (/^\d{0,4}$/.test(value)) setForm({ ...form, payment_terms_days: value }); }} inputMode="numeric" maxLength={4} className="text-right" required /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="vendor-address">Address <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="vendor-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={500} rows={3} placeholder="Vendor address" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div></div>}
      {kind === "customers" && <div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2 sm:col-span-2"><Label htmlFor="customer-name">Customer name</Label><Input id="customer-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={160} placeholder="Ravi Kumar" autoComplete="name" required /></div><div className="grid gap-2"><Label htmlFor="customer-email">Email <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="customer-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} placeholder="customer@example.com" autoComplete="email" /></div><div className="grid gap-2"><Label htmlFor="customer-mobile">Mobile <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="customer-mobile" value={form.mobile} onChange={(event) => { const value = event.target.value; if (/^\d{0,10}$/.test(value)) setForm({ ...form, mobile: value }); }} inputMode="numeric" maxLength={10} placeholder="9876543210" autoComplete="tel" className="text-right" /></div><div className="grid gap-2"><Label htmlFor="customer-tax-id">Tax ID <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="customer-tax-id" value={form.tax_id} onChange={(event) => { const value = event.target.value.toUpperCase(); if (/^[A-Z0-9./_-]*$/.test(value)) setForm({ ...form, tax_id: value }) }} maxLength={50} placeholder="GSTIN or tax reference" /></div><div className="grid gap-2"><Label htmlFor="customer-payment-terms">Payment terms (days)</Label><Input id="customer-payment-terms" value={form.payment_terms_days} onChange={(event) => { const value = event.target.value; if (/^\d{0,4}$/.test(value)) setForm({ ...form, payment_terms_days: value }) }} inputMode="numeric" maxLength={4} className="text-right" required /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="customer-address">Address <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="customer-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={500} rows={3} placeholder="Customer address" autoComplete="street-address" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>{editingId && <label className="flex items-start gap-3 rounded-lg border border-[#e2e8f0] p-3 sm:col-span-2"><input type="checkbox" checked={form.is_active === "true"} onChange={(event) => setForm({ ...form, is_active: event.target.checked ? "true" : "false" })} className="mt-1 size-4 accent-[#00a63e]" /><span><span className="block text-sm font-medium text-[#334155]">Available for new sales</span><span className="block text-xs text-[#64748b]">Turn this off when the customer should no longer appear in new sales.</span></span></label>}</div>}
      {kind === "items" && <div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="item-sku">SKU</Label><Input id="item-sku" value={form.sku} onChange={(event) => { const value = event.target.value.toUpperCase(); if (/^[A-Z0-9_-]*$/.test(value)) setForm({ ...form, sku: value }); }} maxLength={60} placeholder="ITEM-001" required /></div><div className="grid gap-2"><Label htmlFor="item-name">Item name</Label><Input id="item-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={160} placeholder="Office chair" required /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="item-unit">Unit</Label><select id="item-unit" value={form.unit_id} onChange={(event) => setForm({ ...form, unit_id: event.target.value })} required className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">Select a unit</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</select>{units.length === 0 && <p className="text-xs text-amber-700">Create a unit before creating an item. <Link href="/units" className="font-semibold underline">Go to units</Link></p>}</div><div className="grid gap-2"><Label htmlFor="purchase-price">Purchase price</Label><Input id="purchase-price" value={form.purchase_price} onChange={(event) => setDecimal("purchase_price", 2, event.target.value)} inputMode="decimal" maxLength={19} className="text-right" required /></div><div className="grid gap-2"><Label htmlFor="sale-price">Sale price</Label><Input id="sale-price" value={form.sale_price} onChange={(event) => setDecimal("sale_price", 2, event.target.value)} inputMode="decimal" maxLength={19} className="text-right" required /></div><div className="grid gap-2"><Label htmlFor="tax-rate">Tax rate (%)</Label><Input id="tax-rate" value={form.tax_rate} onChange={(event) => setDecimal("tax_rate", 2, event.target.value)} inputMode="decimal" maxLength={6} className="text-right" required /></div><div className="grid gap-2"><Label htmlFor="reorder-level">Reorder level</Label><Input id="reorder-level" value={form.reorder_level} onChange={(event) => setDecimal("reorder_level", 3, event.target.value)} inputMode="decimal" maxLength={19} className="text-right" required /></div></div>}
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={closeForm} disabled={isLoading}>Cancel</Button><Button type="submit" loading={isLoading}>{isLoading ? "Saving..." : editingId ? "Save changes" : config.add}</Button></div>
    </form></section></div>}

    <section className="rounded-xl border border-[#e2e8f0] bg-white"><div className="flex flex-col justify-between gap-3 border-b border-[#f1f5f9] px-5 py-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><PageIcon className="size-[18px]" /></span><div><h2 className="text-sm font-semibold text-[#0f172a]">All {config.title.toLowerCase()}</h2><p className="text-xs text-[#94a3b8]">{rows.length}{hasNext ? "+" : ""} records on this page</p></div></div><div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} placeholder={`Search ${config.title.toLowerCase()}`} className="pl-9" /></div></div>
      {loadError ? <div className="p-8 text-center"><p className="text-sm font-medium text-red-700">Unable to load {config.title.toLowerCase()}.</p><p className="mt-1 text-xs text-[#64748b]">Refresh the page and try again.</p></div> : filteredRows.length === 0 ? <div className="grid min-h-52 place-items-center p-8 text-center"><div><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#f1f5f9] text-[#94a3b8]"><PageIcon className="size-5" /></div><p className="text-sm font-medium text-[#334155]">{search ? "No matching records" : config.empty}</p><p className="mt-1 text-xs text-[#94a3b8]">{search ? "Try a shorter search term." : "Use the button above to add the first record."}</p></div></div> : <RecordTable kind={kind} rows={filteredRows} units={units} onEdit={openEdit} showCustomerCredit={showCustomerCredit} />}
      {(page > 1 || hasNext) && <div className="flex items-center justify-between border-t border-[#f1f5f9] px-5 py-4"><span className="text-xs text-[#64748b]">Page {page}</span><div className="flex gap-2">{page > 1 && <Link href={`${config.href}?page=${page - 1}`} className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc]">Previous</Link>}{hasNext && <Link href={`${config.href}?page=${page + 1}`} className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-[#f8fafc]">Next</Link>}</div></div>}
    </section>
  </div>;
}
