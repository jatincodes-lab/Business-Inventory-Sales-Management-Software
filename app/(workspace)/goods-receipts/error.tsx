"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-64 place-items-center rounded-xl border border-[#e2e8f0] bg-white p-8 text-center"><div><h2 className="text-lg font-semibold text-[#0f172a]">Goods receipts could not load</h2><p className="mt-2 text-sm text-[#64748b]">Refresh this section and try again.</p><button type="button" onClick={reset} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white hover:bg-[#008a34]">Try again</button></div></main>;
}
