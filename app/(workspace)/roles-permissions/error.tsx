"use client";

export default function RolesPermissionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-xl border border-[#f4b4b0] bg-[#fff5f5] p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Roles & permissions could not load</h1><p className="mt-2 text-sm text-[#b42318]">Refresh the page and try again. Your existing access has not been changed.</p><button type="button" onClick={reset} className="mt-5 rounded-lg bg-[#00a63e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#008a34]">Try again</button></div>;
}
