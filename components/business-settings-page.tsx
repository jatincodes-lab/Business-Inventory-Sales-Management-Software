"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, BadgeIndianRupee, Building2, CheckCircle2, FileText, Image as ImageIcon, ShieldCheck } from "lucide-react";

import { updateBusinessSettings } from "@/app/actions/business-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BusinessSettings = {
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  currency_code: string;
  tax_enabled: boolean;
  default_tax_rate: string | number;
  prices_include_tax: boolean;
  invoice_prefix: string;
  invoice_footer: string | null;
  payment_terms_days: number;
};

type FormState = {
  name: string;
  address: string;
  phone: string;
  email: string;
  tax_id: string;
  currency_code: string;
  tax_enabled: boolean;
  default_tax_rate: string;
  prices_include_tax: boolean;
  invoice_prefix: string;
  invoice_footer: string;
  payment_terms_days: string;
};

function formFrom(settings: BusinessSettings): FormState {
  return {
    name: settings.name,
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    tax_id: settings.tax_id ?? "",
    currency_code: settings.currency_code || "INR",
    tax_enabled: settings.tax_enabled,
    default_tax_rate: String(settings.default_tax_rate ?? 0),
    prices_include_tax: settings.prices_include_tax,
    invoice_prefix: settings.invoice_prefix || "INV-",
    invoice_footer: settings.invoice_footer ?? "",
    payment_terms_days: String(settings.payment_terms_days ?? 0),
  };
}

const currencyLabels: Record<string, string> = { INR: "Indian rupee (₹)", USD: "US dollar ($)", EUR: "Euro (€)", GBP: "British pound (£)", AED: "UAE dirham (د.إ)" };

export function BusinessSettingsPage({ settings }: { settings: BusinessSettings }) {
  const [form, setForm] = useState(() => formFrom(settings));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(settings.logo_url ?? "");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!logoFile) return;
    const preview = URL.createObjectURL(logoFile);
    setLogoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [logoFile]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => formData.set(key, String(value)));
    if (logoFile) formData.set("logo", logoFile);
    startTransition(async () => {
      const result = await updateBusinessSettings(formData);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok && result.logoUrl) {
        setLogoPreview(result.logoUrl);
        setLogoFile(null);
      }
    });
  };

  const chooseLogo = (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setMessage({ text: "Logo must be a PNG, JPG, or WEBP image smaller than 2 MB.", ok: false });
      return;
    }
    setMessage(null);
    setLogoFile(file);
  };

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link href="/protected" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#64748b] hover:text-[#00a63e]"><ArrowLeft className="size-4" />Back to dashboard</Link><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Setup</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">Set up your business</h1><p className="mt-1 max-w-2xl text-sm text-[#64748b]">Add the details your team and customers will see. You can change them later.</p></div><div className="flex items-center gap-2 rounded-full bg-[#e6f8ee] px-3 py-2 text-xs font-semibold text-[#08752e]"><CheckCircle2 className="size-4" />Saved settings</div></div>

    {message && <p role={message.ok ? "status" : "alert"} className={`mb-6 rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-[#b9e7c9] bg-[#f0fff5] text-[#08752e]" : "border-[#f4b4b0] bg-[#fff5f5] text-[#b42318]"}`}>{message.text}</p>}

    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-6 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f8ee] text-[#00a63e]"><Building2 className="size-5" /></span><div><h2 className="text-base font-semibold text-[#0f172a]">Business details</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">What should appear when customers see your business?</p></div></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2 sm:col-span-2"><Label htmlFor="business-name">Business name</Label><Input id="business-name" value={form.name} onChange={(event) => set("name", event.target.value)} maxLength={120} placeholder="My business" required /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="business-logo">Business logo <span className="font-normal text-[#94a3b8]">(optional)</span></Label><div className="flex flex-col gap-4 rounded-lg border border-dashed border-[#b9e7c9] bg-[#f8fffa] p-4 sm:flex-row sm:items-center"><div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dbe2e8] bg-white">{logoPreview ? <img src={logoPreview} alt="Business logo preview" className="size-full object-contain" /> : <ImageIcon className="size-7 text-[#94a3b8]" />}</div><div className="grid gap-2"><input id="business-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.target.files?.[0])} className="block w-full text-sm text-[#475569] file:mr-3 file:rounded-lg file:border-0 file:bg-[#e6f8ee] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#08752e]" /><p className="text-xs text-[#64748b]">PNG, JPG, or WEBP. Maximum 2 MB. It will appear on printed invoices.</p></div></div></div><div className="grid gap-2"><Label htmlFor="business-email">Business email <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="business-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} maxLength={254} placeholder="hello@yourbusiness.com" autoComplete="email" /></div><div className="grid gap-2"><Label htmlFor="business-phone">Phone number <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="business-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} maxLength={30} placeholder="9876543210" autoComplete="tel" /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="business-tax-id">Tax number <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="business-tax-id" value={form.tax_id} onChange={(event) => set("tax_id", event.target.value.toUpperCase())} maxLength={50} placeholder="GSTIN or tax reference" /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="business-address">Business address <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="business-address" value={form.address} onChange={(event) => set("address", event.target.value)} maxLength={500} rows={3} placeholder="Address to show on invoices" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div></div></section>

      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-6 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf1ff] text-[#356fe8]"><BadgeIndianRupee className="size-5" /></span><div><h2 className="text-base font-semibold text-[#0f172a]">Money and tax</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">Choose the way your business normally prices and taxes items.</p></div></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="currency-code">Currency</Label><select id="currency-code" value={form.currency_code} onChange={(event) => set("currency_code", event.target.value)} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">{Object.entries(currencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="default-tax-rate">Usual tax rate (%)</Label><Input id="default-tax-rate" value={form.default_tax_rate} onChange={(event) => /^\d{0,3}(?:\.\d{0,2})?$/.test(event.target.value) && set("default_tax_rate", event.target.value)} inputMode="decimal" maxLength={6} placeholder="0" /></div><label className="flex items-start gap-3 rounded-lg border border-[#e2e8f0] p-3 sm:col-span-2"><input type="checkbox" checked={form.tax_enabled} onChange={(event) => set("tax_enabled", event.target.checked)} className="mt-1 size-4 accent-[#00a63e]" /><span><span className="block text-sm font-medium text-[#334155]">I charge tax on sales</span><span className="mt-1 block text-xs leading-5 text-[#64748b]">Turn this off if your business does not add tax to customer sales.</span></span></label><label className="flex items-start gap-3 rounded-lg border border-[#e2e8f0] p-3 sm:col-span-2"><input type="checkbox" checked={form.prices_include_tax} onChange={(event) => set("prices_include_tax", event.target.checked)} className="mt-1 size-4 accent-[#00a63e]" /><span><span className="block text-sm font-medium text-[#334155]">My item prices already include tax</span><span className="mt-1 block text-xs leading-5 text-[#64748b]">Use this when the price you enter already includes the tax amount.</span></span></label></div></section>

      <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="mb-6 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2edff] text-[#7b57ed]"><FileText className="size-5" /></span><div><h2 className="text-base font-semibold text-[#0f172a]">Invoices</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">Make invoices easy for customers to recognize and understand.</p></div></div><div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="invoice-prefix">Invoice number starts with</Label><Input id="invoice-prefix" value={form.invoice_prefix} onChange={(event) => set("invoice_prefix", event.target.value.toUpperCase())} maxLength={12} placeholder="INV-" required /><p className="text-xs text-[#94a3b8]">Preview: {form.invoice_prefix || "INV-"}00001</p></div><div className="grid gap-2"><Label htmlFor="payment-terms-days">Usual payment time (days)</Label><Input id="payment-terms-days" value={form.payment_terms_days} onChange={(event) => /^\d{0,4}$/.test(event.target.value) && set("payment_terms_days", event.target.value)} inputMode="numeric" maxLength={4} placeholder="0" /><p className="text-xs text-[#94a3b8]">Use 0 for payment due immediately.</p></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="invoice-footer">Message at the bottom of invoices <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="invoice-footer" value={form.invoice_footer} onChange={(event) => set("invoice_footer", event.target.value)} maxLength={500} rows={3} placeholder="Thank you for your business." className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div></div></section>

      <section className="rounded-xl border border-[#b9e7c9] bg-[#f8fffa] p-5 md:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f8ee] text-[#08752e]"><ShieldCheck className="size-5" /></span><div><h2 className="text-base font-semibold text-[#0f172a]">Stock safety is on</h2><p className="mt-1 text-sm leading-6 text-[#475569]">StockFlow prevents sales from reducing stock below zero. This protects your stock records automatically.</p></div></div></section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="submit" loading={isPending} disabled={isPending}>{isPending ? "Saving..." : "Save business settings"}</Button></div>
    </form>
  </div>;
}
