export default function Loading() {
  return <div className="animate-pulse space-y-6"><div><div className="h-3 w-32 rounded bg-[#d7eee0]" /><div className="mt-3 h-9 w-64 rounded bg-[#e2e8f0]" /><div className="mt-2 h-4 w-96 max-w-full rounded bg-[#e2e8f0]" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-36 rounded-xl bg-white" />)}</div><div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><div className="h-64 rounded-xl bg-white" /><div className="h-64 rounded-xl bg-white" /></div></div>;
}
