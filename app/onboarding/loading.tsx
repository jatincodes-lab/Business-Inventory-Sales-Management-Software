export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f8fa] p-4">
      <div className="w-full max-w-xl animate-pulse rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:p-10">
        <div className="h-9 w-48 rounded-lg bg-[#e2e8f0]" />
        <div className="mt-3 h-5 w-80 max-w-full rounded bg-[#f1f5f9]" />
        <div className="mt-10 space-y-5">
          <div className="h-11 rounded-lg bg-[#f1f5f9]" />
          <div className="h-11 rounded-lg bg-[#f1f5f9]" />
          <div className="h-11 rounded-lg bg-[#d7eee0]" />
        </div>
      </div>
    </main>
  );
}
