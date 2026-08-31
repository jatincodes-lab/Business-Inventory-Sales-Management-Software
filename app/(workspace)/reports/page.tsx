import { redirect } from "next/navigation";

import { ReportsDashboard, type ReportKey } from "@/components/reports-dashboard";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const reportKeys: ReportKey[] = ["stock", "sales", "customers", "purchases"];
type SearchParams = { report?: string; start?: string; end?: string; search?: string; warehouse_id?: string };
type ReportPayload = { rows: Array<Record<string, string | number | null>>; summary: Record<string, string | number | null> };

function today() { return new Date().toISOString().slice(0, 10); }
function defaultStart() { const date = new Date(); date.setUTCMonth(0, 1); return date.toISOString().slice(0, 10); }
function validDate(value: string | undefined) { return value && DATE.test(value) ? value : ""; }

export const instant = false;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const report = reportKeys.includes(params.report as ReportKey) ? params.report as ReportKey : "stock";
  const fallbackEnd = today();
  const requestedEnd = validDate(params.end) || fallbackEnd;
  const requestedStart = validDate(params.start) || defaultStart();
  const start = requestedStart <= requestedEnd ? requestedStart : defaultStart();
  const end = start <= requestedEnd ? requestedEnd : fallbackEnd;
  const search = (params.search || "").trim().slice(0, 80);
  const warehouseId = params.warehouse_id && UUID.test(params.warehouse_id) ? params.warehouse_id : "";
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "reports.view" });
  if (permissionError) redirect("/auth/error?error=Unable%20to%20verify%20report%20permissions");
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Reports</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to view reports.</p></div>;

  const showWarehouse = report === "stock" || report === "sales";
  const [{ data: warehouses, error: warehouseError }, reportResult] = await Promise.all([
    showWarehouse ? context.supabase.from("warehouses").select("id,name").eq("business_id", context.businessId).order("name").limit(500) : Promise.resolve({ data: [], error: null }),
    report === "stock"
      ? context.supabase.rpc("get_stock_report", { p_start_date: start, p_end_date: end, p_warehouse_id: warehouseId || null, p_search: search || null })
      : report === "sales"
        ? context.supabase.rpc("get_sales_report", { p_start_date: start, p_end_date: end, p_warehouse_id: warehouseId || null, p_search: search || null })
        : report === "customers"
          ? context.supabase.rpc("get_customer_report", { p_start_date: start, p_end_date: end, p_search: search || null })
          : context.supabase.rpc("get_purchase_report", { p_start_date: start, p_end_date: end, p_search: search || null }),
  ]);

  const payload = (reportResult.data || { rows: [], summary: {} }) as ReportPayload;
  return <ReportsDashboard report={report} start={start} end={end} search={search} warehouseId={warehouseId} warehouses={(warehouses ?? []) as Array<{ id: string; name: string }>} payload={payload} loadError={Boolean(warehouseError || reportResult.error)} />;
}
