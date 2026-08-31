"use client";

import { useRef, useState } from "react";
import { CreditCard, X } from "lucide-react";

import { applyCustomerCredit, recordInvoicePayment, type PaymentMethod } from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const methods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export function InvoicePaymentForm({ invoiceId, invoiceDate, balanceDue, onSuccess }: { invoiceId: string; invoiceDate: string; balanceDue: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(invoiceDate);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const result = await recordInvoicePayment({ invoiceId, amount, paymentDate, paymentMethod, reference, notes, clientRequestId: requestId.current });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      requestId.current = null;
      setOpen(false);
      setAmount("");
      setReference("");
      setNotes("");
      setError(null);
      onSuccess();
    } catch {
      setError("Unable to record payment. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button type="button" onClick={() => { setOpen(true); setError(null); }} disabled={balanceDue <= 0}><CreditCard className="size-4" />Record payment</Button>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0e1f16]/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Invoice payment</p><h2 id="payment-dialog-title" className="text-lg font-semibold text-[#0f172a]">Record payment</h2><p className="mt-1 text-sm text-[#64748b]">Balance due: <span className="font-mono font-semibold text-[#334155]">₹{balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p></div><button type="button" onClick={close} disabled={busy} aria-label="Close payment form" className="grid size-10 place-items-center rounded-lg text-[#64748b] hover:bg-[#f8fafc] hover:text-[#334155]"><X className="size-4" /></button></div>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" type="text" inputMode="decimal" autoFocus value={amount} onChange={(event) => setAmount(event.target.value)} maxLength={19} placeholder="0.00" required /></div><div className="grid gap-2"><Label htmlFor="payment-date">Payment date</Label><Input id="payment-date" type="date" value={paymentDate} min={invoiceDate} onChange={(event) => setPaymentDate(event.target.value)} required /></div></div>
          <div className="grid gap-2"><Label htmlFor="payment-method">Payment method</Label><select id="payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">{methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></div>
          <div className="grid gap-2"><Label htmlFor="payment-reference">Reference <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="payment-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} placeholder="Transaction or receipt number" /></div>
          <div className="grid gap-2"><Label htmlFor="payment-notes">Notes <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Add a note about this payment" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          {error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" loading={busy}>{busy ? "Recording..." : "Record payment"}</Button></div>
        </form>
      </div>
    </div>}
  </>;
}

export function InvoiceCreditForm({ invoiceId, invoiceDate, balanceDue, creditAvailable, onSuccess }: { invoiceId: string; invoiceDate: string; balanceDue: number; creditAvailable: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(invoiceDate);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const maximum = Math.min(balanceDue, creditAvailable);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    requestId.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const result = await applyCustomerCredit({ invoiceId, amount, paymentDate, reference, notes, clientRequestId: requestId.current });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      requestId.current = null;
      setOpen(false);
      setAmount("");
      setReference("");
      setNotes("");
      setError(null);
      onSuccess();
    } catch {
      setError("Unable to apply customer credit. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button type="button" variant="outline" onClick={() => { setAmount(maximum.toFixed(2)); setOpen(true); setError(null); }} disabled={maximum <= 0}><CreditCard className="size-4" />Apply customer credit</Button>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0e1f16]/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="credit-dialog-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Customer credit</p><h2 id="credit-dialog-title" className="text-lg font-semibold text-[#0f172a]">Apply credit to invoice</h2><p className="mt-1 text-sm text-[#64748b]">Available: <span className="font-mono font-semibold text-[#334155]">₹{creditAvailable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> · Invoice balance: <span className="font-mono font-semibold text-[#334155]">₹{balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p></div><button type="button" onClick={close} disabled={busy} aria-label="Close credit form" className="grid size-10 place-items-center rounded-lg text-[#64748b] hover:bg-[#f8fafc] hover:text-[#334155]"><X className="size-4" /></button></div>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="credit-amount">Amount</Label><Input id="credit-amount" type="text" inputMode="decimal" autoFocus value={amount} onChange={(event) => setAmount(event.target.value)} maxLength={19} placeholder="0.00" required /><p className="text-xs text-[#94a3b8]">Maximum: ₹{maximum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><div className="grid gap-2"><Label htmlFor="credit-date">Application date</Label><Input id="credit-date" type="date" value={paymentDate} min={invoiceDate} onChange={(event) => setPaymentDate(event.target.value)} required /></div></div>
          <div className="grid gap-2"><Label htmlFor="credit-reference">Reference <span className="font-normal text-[#94a3b8]">(optional)</span></Label><Input id="credit-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} placeholder="Credit note or customer reference" /></div>
          <div className="grid gap-2"><Label htmlFor="credit-notes">Notes <span className="font-normal text-[#94a3b8]">(optional)</span></Label><textarea id="credit-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Add a note about this credit application" className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          {error && <p role="alert" className="rounded-lg border border-[#f4b4b0] bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" loading={busy}>{busy ? "Applying..." : "Apply credit"}</Button></div>
        </form>
      </div>
    </div>}
  </>;
}
