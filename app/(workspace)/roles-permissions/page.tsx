import { RolesPermissionsPage } from "@/components/roles-permissions-page";
import { parseRoleManagementData } from "@/lib/roles-permissions";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

export default async function RolesPermissionsRoute() {
  const context = await getWorkspaceContext();
  assertWorkspace(context);

  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "users.manage" });
  if (permissionError) return <div className="rounded-xl border border-[#f4b4b0] bg-[#fff5f5] p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Roles & permissions</h1><p className="mt-2 text-sm text-[#b42318]">Unable to verify access right now. Refresh and try again.</p></div>;
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Roles & permissions</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to manage users and roles.</p></div>;

  const [{ data, error }, { data: invitations, error: invitationsError }] = await Promise.all([
    context.supabase.rpc("get_role_management_data"),
    context.supabase.rpc("get_workspace_invitations"),
  ]);
  if (error || invitationsError) throw new Error("Unable to load role management data");
  const parsed = parseRoleManagementData({ ...(data as object), invitations });
  if (parsed.permissions.length === 0) throw new Error("The permission catalog is unavailable");
  return <RolesPermissionsPage data={parsed} />;
}
