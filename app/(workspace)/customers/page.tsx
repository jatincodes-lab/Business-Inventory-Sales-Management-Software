import { MasterDataPage, type CustomerRecord } from "@/components/master-data-page";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;

function validPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const instant = false;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ page?: string; new?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);

  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "customers.view" });
  if (permissionError) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Customers</h1><p className="mt-2 text-sm text-[#64748b]">Unable to verify your access right now. Refresh the page and try again.</p></div>;
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Customers</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view customers.</p></div>;

  const params = await searchParams;
  const page = validPage(params.page);
  const from = (page - 1) * PAGE_SIZE;
  const { data, error } = await context.supabase.from("customers").select("id,name,email,mobile,address,tax_id,payment_terms_days,is_active").eq("business_id", context.businessId).order("name").range(from, from + PAGE_SIZE);
  const records = (data ?? []) as CustomerRecord[];

  return <MasterDataPage kind="customers" rows={records.slice(0, PAGE_SIZE)} units={[]} page={page} hasNext={records.length > PAGE_SIZE} initiallyOpen={params.new === "1"} loadError={error ? "Unable to load customers." : undefined} />;
}
