"use server";

import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type ReportKey = "stock" | "sales" | "customers" | "purchases";
export type ReportRow = Record<string, string | number | null>;
export type ReportPayload = { rows: ReportRow[]; summary: ReportRow };
export type ReportActionResult = { ok: boolean; message: string; payload?: ReportPayload };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reportKeys: ReportKey[] = ["stock", "sales", "customers", "purchases"];

function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function getReportData(report: ReportKey, start: string, end: string, search: string, warehouseId: string): Promise<ReportActionResult> {
  if (!reportKeys.includes(report) || !validDate(start) || !validDate(end) || end < start) return { ok: false, message: "Choose a valid report date range." };
  const cleanSearch = typeof search === "string" ? search.trim().slice(0, 80) : "";
  if (typeof warehouseId !== "string" || (warehouseId && !UUID.test(warehouseId))) return { ok: false, message: "Report filters are invalid." };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before viewing reports." };
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "reports.view" });
  if (permissionError || allowed !== true) return { ok: false, message: "You do not have permission to view reports." };
  const result = report === "stock"
    ? await context.supabase.rpc("get_stock_report", { p_start_date: start, p_end_date: end, p_warehouse_id: warehouseId || null, p_search: cleanSearch || null })
    : report === "sales"
      ? await context.supabase.rpc("get_sales_report", { p_start_date: start, p_end_date: end, p_warehouse_id: warehouseId || null, p_search: cleanSearch || null })
      : report === "customers"
        ? await context.supabase.rpc("get_customer_report", { p_start_date: start, p_end_date: end, p_search: cleanSearch || null })
        : await context.supabase.rpc("get_purchase_report", { p_start_date: start, p_end_date: end, p_search: cleanSearch || null });
  if (result.error) return { ok: false, message: "Unable to load this report. Refresh and try again." };
  return { ok: true, message: "Report updated.", payload: (result.data || { rows: [], summary: {} }) as ReportPayload };
}
