import { MasterDataPage, type VendorRecord } from "@/components/master-data-page";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;

function validPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const instant = false;

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);

  const page = validPage((await searchParams).page);
  const from = (page - 1) * PAGE_SIZE;
  const { data, error } = await context.supabase.from("vendors").select("id,name,email,mobile,address,tax_id,payment_terms_days,is_active").eq("business_id", context.businessId).order("name").range(from, from + PAGE_SIZE);
  const records = (data ?? []) as VendorRecord[];

  return <MasterDataPage kind="vendors" rows={records.slice(0, PAGE_SIZE)} units={[]} page={page} hasNext={records.length > PAGE_SIZE} loadError={error ? "Unable to load vendors." : undefined} />;
}
