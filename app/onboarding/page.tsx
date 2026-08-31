import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding-form";
import { getWorkspaceContext } from "@/lib/supabase/workspace";

export const instant = false;

export default async function OnboardingPage() {
  const context = await getWorkspaceContext();
  if (context.status === "unauthenticated") {
    redirect("/auth/login");
  }
  if (context.status === "error") {
    redirect("/auth/error?error=Unable%20to%20load%20workspace");
  }
  if (context.status === "ready") {
    redirect("/protected");
  }
  if (context.status === "needs_onboarding") {
    return <OnboardingForm email={context.email} />;
  }
  redirect("/auth/error?error=Unable%20to%20load%20workspace");
}
