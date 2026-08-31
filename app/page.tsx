import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh bg-[#f7f8fa] px-6 py-8 text-[#0f172a]">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-between rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:p-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid size-10 place-items-center rounded-xl bg-[#0e1f16] text-lg text-white">S</span>
            <span>StockFlow</span>
          </Link>
          <Link href="/auth/login" className="rounded-lg border border-[#cbd5e1] px-4 py-2 text-sm font-medium text-[#334155] transition hover:border-[#00a63e] hover:text-[#008a34]">Sign in</Link>
        </header>

        <section className="max-w-2xl py-20">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#00a63e]">Inventory operations</p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] text-[#0f172a] md:text-6xl">Know what came in, what went out, and what is left.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#64748b]">StockFlow connects vendors, purchase orders, receipts, stock, customers, sales, and invoices in one dependable workspace.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/auth/login" className="rounded-lg bg-[#00a63e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#008a34] active:translate-y-px">Open workspace</Link>
            <Link href="/protected" className="rounded-lg border border-[#cbd5e1] px-5 py-3 text-sm font-semibold text-[#334155] transition hover:border-[#00a63e] hover:text-[#008a34]">View dashboard</Link>
          </div>
        </section>

        <footer className="border-t border-[#f1f5f9] pt-5 text-xs text-[#94a3b8]">Purchase to stock. Sale to invoice. One source of truth.</footer>
      </div>
    </main>
  );
}
