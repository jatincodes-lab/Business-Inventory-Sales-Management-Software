import { MasterDataPage, type ItemRecord, type UnitRecord } from "@/components/master-data-page";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const PAGE_SIZE = 50;

function validPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const instant = false;

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getWorkspaceContext();
  assertWorkspace(context);

  const page = validPage((await searchParams).page);
  const from = (page - 1) * PAGE_SIZE;
  const [{ data: itemData, error: itemError }, { data: unitData }] = await Promise.all([
    context.supabase.from("items").select("id,sku,name,unit_id,purchase_price,sale_price,tax_rate,reorder_level,is_active").eq("business_id", context.businessId).order("name").range(from, from + PAGE_SIZE),
    context.supabase.from("units").select("id,name,code").eq("business_id", context.businessId).order("name").limit(500),
  ]);
  const records = (itemData ?? []) as ItemRecord[];
  const units = (unitData ?? []) as UnitRecord[];

  return <MasterDataPage kind="items" rows={records.slice(0, PAGE_SIZE)} units={units} page={page} hasNext={records.length > PAGE_SIZE} loadError={itemError ? "Unable to load items." : undefined} />;
}
