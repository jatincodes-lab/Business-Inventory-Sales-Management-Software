import Link from "next/link";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-dvh bg-[#f7f8fa] p-4 md:p-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:min-h-[calc(100dvh-4rem)] lg:grid-cols-[0.85fr_1.15fr]">
        <section className="hidden flex-col justify-between bg-[#0e1f16] p-8 text-white lg:flex xl:p-12">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid size-10 place-items-center rounded-xl bg-[#00a63e] text-lg">S</span>StockFlow</Link>
          <div><p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#7da48b]">Inventory operations</p><h1 className="max-w-sm text-4xl font-semibold tracking-[-0.04em]">Every movement accounted for.</h1><p className="mt-5 max-w-sm text-sm leading-6 text-[#b8cbbd]">Purchase orders, stock receipts, customer sales, and invoices in one dependable workspace.</p></div>
          <p className="text-xs text-[#7da48b]">Purchase to stock. Sale to invoice.</p>
        </section>
        <section className="flex items-center justify-center p-5 md:p-10"><div className="w-full max-w-sm">{children}</div></section>
      </div>
    </main>
  );
}
