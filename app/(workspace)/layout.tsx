import { DashboardShell, type SetupProgress } from "@/components/dashboard-shell";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const [units, warehouses, items, vendors, customers] = await Promise.all([
    context.supabase.from("units").select("id", { count: "exact", head: true }).eq("business_id", context.businessId),
    context.supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("is_active", true),
    context.supabase.from("items").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("is_active", true),
    context.supabase.from("vendors").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("is_active", true),
    context.supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", context.businessId).eq("is_active", true),
  ]);
  const setupProgress: SetupProgress = {
    units: (units.count ?? 0) > 0,
    warehouses: (warehouses.count ?? 0) > 0,
    items: (items.count ?? 0) > 0,
    vendors: (vendors.count ?? 0) > 0,
    customers: (customers.count ?? 0) > 0,
  };
  return <DashboardShell businessName={context.businessName} userName={context.userName} email={context.email} setupProgress={setupProgress}>{children}</DashboardShell>;
}
