"use server";

import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type WorkspaceSearchResult = {
  id: string;
  type: "item" | "customer" | "vendor" | "sales_order" | "invoice" | "purchase_order";
  label: string;
  description: string;
  href: string;
};

export type WorkspaceNotification = {
  id: string;
  title: string;
  message: string;
  href: string;
};

type ActionResult<T> = { ok: boolean; message?: string; data: T };
type Row = Record<string, unknown>;
const permissions = ["items.view", "customers.view", "vendors.view", "sales.view", "invoices.view", "purchases.view"] as const;

async function allowed(context: Awaited<ReturnType<typeof getWorkspaceContext>>, keys: readonly string[]) {
  if (context.status !== "ready") return new Set<string>();
  const checks = await Promise.all(keys.map(async (key) => {
    const { data, error } = await context.supabase.rpc("has_permission", { required_permission: key });
    return !error && data === true ? key : null;
  }));
  return new Set(checks.filter((key): key is string => Boolean(key)));
}

function rows(data: unknown) { return Array.isArray(data) ? data as Row[] : []; }
function pattern(value: string) { return `%${value.replace(/[\\%_]/g, "\\$&")}%`; }
function addResults(tasks: Array<Promise<WorkspaceSearchResult[]>>, query: PromiseLike<{ data: unknown; error: unknown }>, map: (row: Row) => WorkspaceSearchResult) {
  tasks.push(Promise.resolve(query).then(({ data, error }) => error ? [] : rows(data).map(map)));
}

export async function searchWorkspace(rawQuery: string): Promise<ActionResult<WorkspaceSearchResult[]>> {
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 80) : "";
  if (query.length < 2) return { ok: true, data: [] };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: "Your session has expired. Please sign in again.", data: [] };
  const access = await allowed(context, permissions);
  const like = pattern(query);
  const tasks: Array<Promise<WorkspaceSearchResult[]>> = [];
  if (access.has("items.view")) {
    addResults(tasks, context.supabase.from("items").select("id,name,sku").eq("is_active", true).ilike("name", like).limit(6), (row) => ({ id: String(row.id), type: "item", label: String(row.name), description: `Item · SKU ${String(row.sku)}`, href: "/items" }));
    addResults(tasks, context.supabase.from("items").select("id,name,sku").eq("is_active", true).ilike("sku", like).limit(6), (row) => ({ id: String(row.id), type: "item", label: String(row.name), description: `Item · SKU ${String(row.sku)}`, href: "/items" }));
  }
  if (access.has("customers.view")) addResults(tasks, context.supabase.from("customers").select("id,name,email,mobile").eq("is_active", true).ilike("name", like).limit(6), (row) => ({ id: String(row.id), type: "customer", label: String(row.name), description: `Customer · ${String(row.email || row.mobile || "No contact")}`, href: "/customers" }));
  if (access.has("vendors.view")) addResults(tasks, context.supabase.from("vendors").select("id,name,email,mobile").eq("is_active", true).ilike("name", like).limit(6), (row) => ({ id: String(row.id), type: "vendor", label: String(row.name), description: `Vendor · ${String(row.email || row.mobile || "No contact")}`, href: "/vendors" }));
  if (access.has("sales.view")) addResults(tasks, context.supabase.from("sales_orders").select("id,order_number,status").ilike("order_number", like).limit(6), (row) => ({ id: String(row.id), type: "sales_order", label: String(row.order_number), description: `Sales order · ${String(row.status)}`, href: `/sales-orders/${String(row.id)}` }));
  if (access.has("invoices.view")) {
    addResults(tasks, context.supabase.from("invoices").select("id,invoice_number,customer_name,status").ilike("invoice_number", like).limit(6), (row) => ({ id: String(row.id), type: "invoice", label: String(row.invoice_number), description: `Invoice · ${String(row.customer_name)}`, href: `/invoices/${String(row.id)}` }));
    addResults(tasks, context.supabase.from("invoices").select("id,invoice_number,customer_name,status").ilike("customer_name", like).limit(6), (row) => ({ id: String(row.id), type: "invoice", label: String(row.invoice_number), description: `Invoice · ${String(row.customer_name)}`, href: `/invoices/${String(row.id)}` }));
  }
  if (access.has("purchases.view")) addResults(tasks, context.supabase.from("purchase_orders").select("id,order_number,status").ilike("order_number", like).limit(6), (row) => ({ id: String(row.id), type: "purchase_order", label: String(row.order_number), description: `Purchase order · ${String(row.status)}`, href: `/purchase-orders/${String(row.id)}` }));
  const results = (await Promise.all(tasks)).flat();
  return { ok: true, data: Array.from(new Map(results.map((result) => [`${result.type}:${result.id}`, result])).values()).slice(0, 20) };
}

export async function getWorkspaceNotifications(): Promise<ActionResult<WorkspaceNotification[]>> {
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: "Your session has expired. Please sign in again.", data: [] };
  const access = await allowed(context, ["inventory.view", "purchases.view", "sales.view", "invoices.view", "payments.view"]);
  const tasks: Array<Promise<WorkspaceNotification[]>> = [];
  if (access.has("inventory.view")) {
    tasks.push((async () => {
      const [{ data: items, error: itemError }, { data: balances, error: balanceError }, { data: warehouses, error: warehouseError }] = await Promise.all([
        context.supabase.from("items").select("id,name,reorder_level").eq("is_active", true).gt("reorder_level", 0).limit(2000),
        context.supabase.from("stock_balances").select("item_id,warehouse_id,quantity").limit(10000),
        context.supabase.from("warehouses").select("id,name").eq("is_active", true).limit(500),
      ]);
      if (itemError || balanceError || warehouseError) return [];
      const itemMap = new Map(rows(items).map((item) => [String(item.id), item]));
      const warehouseMap = new Map(rows(warehouses).map((warehouse) => [String(warehouse.id), String(warehouse.name)]));
      return rows(balances).flatMap((balance) => {
        const item = itemMap.get(String(balance.item_id));
        const quantity = Number(balance.quantity);
        const reorderLevel = Number(item?.reorder_level);
        if (!item || !Number.isFinite(quantity) || !Number.isFinite(reorderLevel) || quantity > reorderLevel) return [];
        return [{ id: `low-stock:${String(balance.warehouse_id)}:${String(balance.item_id)}`, title: `Low stock: ${String(item.name)}`, message: `${warehouseMap.get(String(balance.warehouse_id)) || "Warehouse"} · ${quantity} left · reorder at ${reorderLevel}`, href: "/inventory" }];
      });
    })());
  }
  if (access.has("purchases.view")) tasks.push((async () => {
    const { data, error } = await context.supabase.from("purchase_orders").select("id,order_number,status").in("status", ["submitted", "partially_received"]).order("order_date", { ascending: true }).limit(10);
    return error ? [] : rows(data).map((row) => ({ id: `purchase:${String(row.id)}`, title: `Purchase order ${String(row.order_number)} is open`, message: `Status · ${String(row.status)}`, href: `/purchase-orders/${String(row.id)}` }));
  })());
  if (access.has("sales.view")) tasks.push((async () => {
    const { data, error } = await context.supabase.from("sales_orders").select("id,order_number,status").in("status", ["submitted", "partially_fulfilled"]).order("order_date", { ascending: true }).limit(10);
    return error ? [] : rows(data).map((row) => ({ id: `sales:${String(row.id)}`, title: `Sales order ${String(row.order_number)} needs fulfillment`, message: `Status · ${String(row.status)}`, href: `/sales-orders/${String(row.id)}` }));
  })());
  if (access.has("invoices.view") && access.has("payments.view")) tasks.push((async () => {
    const [{ data: invoices, error: invoiceError }, { data: payments, error: paymentError }] = await Promise.all([
      context.supabase.from("invoices").select("id,invoice_number,customer_name,total").eq("status", "issued").order("invoice_date", { ascending: true }).limit(100),
      context.supabase.from("invoice_payments").select("invoice_id,amount").limit(10000),
    ]);
    if (invoiceError || paymentError) return [];
    const paid = new Map<string, number>();
    rows(payments).forEach((payment) => paid.set(String(payment.invoice_id), (paid.get(String(payment.invoice_id)) || 0) + Number(payment.amount || 0)));
    return rows(invoices).flatMap((invoice) => {
      const outstanding = Number(invoice.total) - (paid.get(String(invoice.id)) || 0);
      if (!Number.isFinite(outstanding) || outstanding <= 0.005) return [];
      return [{ id: `invoice:${String(invoice.id)}`, title: `Invoice ${String(invoice.invoice_number)} is unpaid`, message: `${String(invoice.customer_name)} · ₹${outstanding.toFixed(2)} outstanding`, href: `/invoices/${String(invoice.id)}` }];
    });
  })());
  return { ok: true, data: (await Promise.all(tasks)).flat().slice(0, 20) };
}
