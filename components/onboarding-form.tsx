"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function OnboardingForm({ email }: { email: string }) {
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBusinessName = businessName.trim();
    const trimmedFullName = fullName.trim();

    if (trimmedBusinessName.length < 2) {
      setError("Workspace name must be at least 2 characters.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("create_business_for_current_user", {
        business_name: trimmedBusinessName,
        user_name: trimmedFullName || null,
      });

      if (rpcError) throw rpcError;
      router.replace("/protected");
      router.refresh();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create workspace.");
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[#f7f8fa] p-4 md:p-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:min-h-[calc(100dvh-4rem)] lg:grid-cols-[0.8fr_1.2fr]">
        <section className="hidden flex-col justify-between bg-[#0e1f16] p-8 text-white lg:flex xl:p-12">
          <div className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid size-10 place-items-center rounded-xl bg-[#00a63e] text-lg">S</span>StockFlow</div>
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#7da48b]">Workspace setup</p>
            <h1 className="max-w-sm text-4xl font-semibold tracking-[-0.04em]">Set up your operating space.</h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[#b8cbbd]">Create the workspace where your products, purchases, stock, sales, and invoices will live.</p>
          </div>
          <p className="text-xs text-[#7da48b]">One workspace. Every movement accounted for.</p>
        </section>
        <section className="flex items-center justify-center p-5 md:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#00a63e]">First step</p>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#0f172a]">Create your workspace</h2>
              <p className="mt-2 text-sm leading-6 text-[#64748b]">You can invite your team and configure details later.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="business-name">Business or workspace name</Label>
                <Input id="business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="e.g. Jatin Retail" minLength={2} maxLength={120} required autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="full-name">Your full name <span className="font-normal text-[#94a3b8]">(optional)</span></Label>
                <Input id="full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="e.g. Jatin Kumar" maxLength={120} autoComplete="name" />
              </div>
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-xs leading-5 text-[#64748b]">
                Signed in as <span className="font-medium text-[#334155]">{email}</span>. You will become the workspace owner.
              </div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" loading={isLoading}>{isLoading ? "Creating workspace..." : "Create workspace"}</Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
