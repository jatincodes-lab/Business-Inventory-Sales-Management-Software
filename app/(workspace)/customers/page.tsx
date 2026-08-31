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

  const [{ data: allowed, error: permissionError }, { data: canViewCredit, error: creditPermissionError }] = await Promise.all([
    context.supabase.rpc("has_permission", { required_permission: "customers.view" }),
    context.supabase.rpc("has_permission", { required_permission: "payments.view" }),
  ]);
  if (permissionError) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Customers</h1><p className="mt-2 text-sm text-[#64748b]">Unable to verify your access right now. Refresh the page and try again.</p></div>;
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Customers</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view customers.</p></div>;

  const params = await searchParams;
  const page = validPage(params.page);
  const from = (page - 1) * PAGE_SIZE;
  const { data, error } = await context.supabase.from("customers").select("id,name,email,mobile,address,tax_id,payment_terms_days,is_active").eq("business_id", context.businessId).order("name").range(from, from + PAGE_SIZE);
  const records = (data ?? []) as CustomerRecord[];
  const customerIds = records.map((customer) => customer.id);
  const creditResult = canViewCredit === true && !creditPermissionError && customerIds.length > 0
    ? await context.supabase.from("customer_credits").select("customer_id,remaining_amount").eq("business_id", context.businessId).in("customer_id", customerIds).gt("remaining_amount", 0)
    : { data: [], error: null };
  const showCustomerCredit = canViewCredit === true && !creditPermissionError && !creditResult.error;
  const creditTotals = new Map<string, number>();
  for (const row of (creditResult.data ?? []) as Array<{ customer_id: string; remaining_amount: string | number }>) creditTotals.set(row.customer_id, (creditTotals.get(row.customer_id) ?? 0) + (Number(row.remaining_amount) || 0));
  const customers = records.map((customer) => ({ ...customer, credit_balance: showCustomerCredit ? creditTotals.get(customer.id) ?? 0 : null }));

  return <MasterDataPage kind="customers" rows={customers.slice(0, PAGE_SIZE)} units={[]} page={page} hasNext={records.length > PAGE_SIZE} initiallyOpen={params.new === "1"} loadError={error ? "Unable to load customers." : undefined} showCustomerCredit={showCustomerCredit} />;
}
