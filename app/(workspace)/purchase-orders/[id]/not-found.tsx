import Link from "next/link";

export default function NotFound() {
  return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center"><h1 className="text-xl font-semibold text-[#0f172a]">Purchase order not found</h1><p className="mt-2 text-sm text-[#64748b]">It may have been removed or belongs to another workspace.</p><Link href="/purchase-orders" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white hover:bg-[#008a34]">Back to purchase orders</Link></div>;
}
