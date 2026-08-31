import { DashboardShell } from "@/components/dashboard-shell";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  return <DashboardShell businessName={context.businessName} userName={context.userName} email={context.email}>{children}</DashboardShell>;
}
