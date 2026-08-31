"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ConfirmationDialog({ open, title, description, confirmLabel, loading = false, onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel: string; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && !loading && onCancel();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    confirmRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [open, loading, onCancel]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#0e1f16]/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !loading && onCancel()}><div role="dialog" aria-modal="true" aria-labelledby="confirmation-dialog-title" aria-describedby="confirmation-dialog-description" className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-2xl"><div className="flex gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff7df] text-[#9a6700]"><AlertTriangle className="size-5" /></span><div><h2 id="confirmation-dialog-title" className="text-base font-semibold text-[#0f172a]">{title}</h2><p id="confirmation-dialog-description" className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p></div></div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button><Button ref={confirmRef} type="button" onClick={onConfirm} loading={loading} disabled={loading}>{loading ? "Please wait..." : confirmLabel}</Button></div></div></div>;
}
