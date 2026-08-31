import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type WorkspaceContext = {
  status: "ready";
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  businessId: string;
  businessName: string;
  userName: string;
  email: string;
};

export type WorkspaceContextResult =
  | WorkspaceContext
  | { status: "unauthenticated" | "error" }
  | { status: "needs_onboarding"; email: string };

export function assertWorkspace(context: WorkspaceContextResult): asserts context is WorkspaceContext {
  if (context.status === "unauthenticated") redirect("/auth/login");
  if (context.status === "needs_onboarding") redirect("/onboarding");
  if (context.status === "error") redirect("/auth/error?error=Unable%20to%20load%20workspace");
}

export async function getWorkspaceContext(): Promise<WorkspaceContextResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims || typeof data.claims.sub !== "string") {
    return { status: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("business_id,full_name,business:businesses(name)")
    .eq("user_id", data.claims.sub)
    .maybeSingle();

  if (profileError) {
    return { status: "error" };
  }

  if (!profile?.business_id) {
    return {
      status: "needs_onboarding",
      email: typeof data.claims.email === "string" ? data.claims.email : "",
    };
  }

  const business = Array.isArray(profile.business) ? profile.business[0] : profile.business;
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  const userName = typeof profile.full_name === "string" && profile.full_name.trim()
    ? profile.full_name.trim()
    : email.split("@")[0] || "Workspace user";

  return {
    status: "ready",
    supabase,
    userId: data.claims.sub,
    businessId: profile.business_id,
    businessName: typeof business?.name === "string" && business.name.trim() ? business.name.trim() : "Business",
    userName,
    email: email || "Workspace user",
  };
}
