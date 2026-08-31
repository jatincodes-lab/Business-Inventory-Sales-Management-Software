import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  CreditCard,
  FileText,
  PackageCheck,
  Plus,
  ReceiptText,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

type Period = "day" | "week" | "month" | "year";
type ItemRow = { id: string; name: string; sku: string; purchase_price: number | string; reorder_level: number | string; is_active: boolean };
type BalanceRow = { warehouse_id: string; item_id: string; quantity: number | string; reserved_quantity?: number | string };
type InvoiceRow = { id: string; invoice_date: string; total: number | string };
type PaymentRow = { id: string; invoice_id: string; amount: number | string };
type ReturnRow = { id: string; invoice_id: string; total: number | string; refund_amount: number | string; return_date: string };
type InvoiceLineRow = { id: string; item_id: string; item_name: string; quantity: number | string; line_total: number | string; invoice_id: string };
type MovementRow = { id: string; item_id: string; quantity_delta: number | string; movement_type: string; created_at: string };

type DashboardData = {
  permissions: { inventory: boolean; sales: boolean; invoices: boolean; payments: boolean; purchases: boolean; receipts: boolean; returns: boolean };
  stock: { quantity: number; available: number; reserved: number; value: number; lowStock: Array<{ id: string; name: string; sku: string; available: number; reorderLevel: number }>; outOfStock: number };
  sales: { trend: Array<{ label: string; value: number }>; total: number; invoiceCount: number };
  stockMix: Array<{ label: string; value: number; color: string }>;
  payments: { available: boolean; paid: number; partial: number; unpaid: number; outstanding: number };
  topItems: Array<{ id: string; name: string; quantity: number; revenue: number }>;
  recentActivity: Array<{ id: string; item: string; type: string; quantity: number; date: string }>;
  pendingPurchaseOrders: number | null;
  pendingReceipts: number | null;
  pendingSalesOrders: number | null;
  queryError: boolean;
};

const periods: Array<{ value: Period; label: string }> = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Annual" },
];

const movementLabels: Record<string, string> = { receipt: "Received", sale: "Sales dispatched", return: "Sales returns", adjustment: "Adjustments", transfer_in: "Transfer in", transfer_out: "Transfer out" };
const movementColors: Record<string, string> = { receipt: "#00a63e", sale: "#356fe8", return: "#7b57ed", adjustment: "#f59e0b", transfer_in: "#16a6a0", transfer_out: "#e26d5a" };
const PAGE_SIZE = 1000;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function responseCount(value: unknown) {
  if (!value || typeof value !== "object" || !("count" in value)) return 0;
  return number(value.count);
}

async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const result = await build(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (result.error) return { data: null, error: result.error };
    const pageRows = result.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function quantity(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getPeriodRange(period: Period) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let start = new Date(today);
  if (period === "week") start = addDays(today, -6);
  if (period === "month") start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  if (period === "year") start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  return { start: dateOnly(start), end: dateOnly(today), endExclusive: dateOnly(addDays(today, 1)) };
}

function getGreeting() {
  const hour = new Date().getUTCHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function makeBuckets(period: Period, start: string, end: string) {
  const buckets: Array<{ key: string; label: string; value: number }> = [];
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (period === "year") {
    const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    while (cursor <= last) {
      buckets.push({ key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`, label: cursor.toLocaleDateString("en-IN", { month: "short" }), value: 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return buckets;
  }
  const cursor = new Date(first);
  while (cursor <= last) {
    buckets.push({ key: dateOnly(cursor), label: period === "day" ? "Today" : cursor.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

function chartBucket(period: Period, value: string) {
  return period === "year" ? value.slice(0, 7) : value.slice(0, 10);
}

function formatActivityDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

async function loadDashboard(period: Period): Promise<DashboardData> {
  const context = await getWorkspaceContext();
  assertWorkspace(context);
  const { supabase, businessId } = context;
  const range = getPeriodRange(period);
  const permissionKeys = ["inventory.view", "sales.view", "invoices.view", "payments.view", "purchases.view", "receipts.view", "returns.view"];
  const permissionResults = await Promise.all(permissionKeys.map((required_permission) => supabase.rpc("has_permission", { required_permission })));
  const canInventory = permissionResults[0]?.data === true;
  const canSales = permissionResults[1]?.data === true;
  const canInvoices = permissionResults[2]?.data === true;
  const canPayments = permissionResults[3]?.data === true;
  const canPurchases = permissionResults[4]?.data === true;
  const canReceipts = permissionResults[5]?.data === true;
  const canReturns = permissionResults[6]?.data === true;

  const [itemsResult, balancesResult, invoicesResult, paymentsResult, returnsResult, invoiceLinesResult, movementsResult, purchaseOrdersResult, receiptsResult, salesOrdersResult] = await Promise.all([
    canInventory ? fetchAllRows<ItemRow>((from, to) => supabase.from("items").select("id,name,sku,purchase_price,reorder_level,is_active").eq("business_id", businessId).order("id").range(from, to)) : Promise.resolve({ data: null, error: null }),
    canInventory ? fetchAllRows<BalanceRow>((from, to) => supabase.from("stock_balances").select("warehouse_id,item_id,quantity,reserved_quantity").eq("business_id", businessId).order("item_id").order("warehouse_id").range(from, to)) : Promise.resolve({ data: null, error: null }),
    canInvoices ? fetchAllRows<InvoiceRow>((from, to) => supabase.from("invoices").select("id,invoice_date,total").eq("business_id", businessId).eq("status", "issued").order("invoice_date").order("id").range(from, to)) : Promise.resolve({ data: null, error: null }),
    canPayments ? fetchAllRows<PaymentRow>((from, to) => supabase.from("invoice_payments").select("id,invoice_id,amount").eq("business_id", businessId).order("invoice_id").order("id").range(from, to)) : Promise.resolve({ data: null, error: null }),
    canInvoices && canReturns ? fetchAllRows<ReturnRow>((from, to) => supabase.from("sales_returns").select("id,invoice_id,total,refund_amount,return_date").eq("business_id", businessId).eq("status", "posted").order("return_date").order("id").range(from, to)) : Promise.resolve({ data: null, error: null }),
    canInvoices ? fetchAllRows<InvoiceLineRow>((from, to) => supabase.from("invoice_lines").select("id,item_id,item_name,quantity,line_total,invoice_id").order("invoice_id").order("id").range(from, to)) : Promise.resolve({ data: null, error: null }),
    canInventory ? fetchAllRows<MovementRow>((from, to) => supabase.from("stock_movements").select("id,item_id,quantity_delta,movement_type,created_at").eq("business_id", businessId).gte("created_at", `${range.start}T00:00:00.000Z`).lt("created_at", `${range.endExclusive}T00:00:00.000Z`).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to)) : Promise.resolve({ data: null, error: null }),
    canPurchases ? supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["submitted", "partially_received"]) : Promise.resolve({ data: null, error: null }),
    canReceipts ? supabase.from("goods_receipts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "draft") : Promise.resolve({ data: null, error: null }),
    canSales ? supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["submitted", "partially_fulfilled"]) : Promise.resolve({ data: null, error: null }),
  ]);

  const items = (itemsResult.data ?? []) as unknown as ItemRow[];
  const balances = (balancesResult.data ?? []) as unknown as BalanceRow[];
  const invoices = (invoicesResult.data ?? []) as unknown as InvoiceRow[];
  const payments = (paymentsResult.data ?? []) as unknown as PaymentRow[];
  const returns = (returnsResult.data ?? []) as unknown as ReturnRow[];
  const invoiceLines = (invoiceLinesResult.data ?? []) as unknown as InvoiceLineRow[];
  const movements = (movementsResult.data ?? []) as unknown as MovementRow[];
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const balancesByItem = new Map<string, { quantity: number; reserved: number }>();

  for (const balance of balances) {
    const current = balancesByItem.get(balance.item_id) || { quantity: 0, reserved: 0 };
    const physical = Math.max(number(balance.quantity), 0);
    current.quantity += physical;
    current.reserved += Math.min(Math.max(number(balance.reserved_quantity), 0), physical);
    balancesByItem.set(balance.item_id, current);
  }

  let stockQuantity = 0;
  let availableStock = 0;
  let reservedStock = 0;
  let stockValue = 0;
  let outOfStock = 0;
  const lowStock = items.filter((item) => item.is_active).map((item) => {
    const balance = balancesByItem.get(item.id) || { quantity: 0, reserved: 0 };
    return { id: item.id, name: item.name, sku: item.sku, available: Math.max(balance.quantity - balance.reserved, 0), reorderLevel: Math.max(number(item.reorder_level), 0) };
  }).filter((item) => item.reorderLevel > 0 && item.available <= item.reorderLevel).sort((a, b) => a.available - b.available || a.name.localeCompare(b.name));

  for (const item of items) {
    const balance = balancesByItem.get(item.id) || { quantity: 0, reserved: 0 };
    const available = Math.max(balance.quantity - balance.reserved, 0);
    stockQuantity += balance.quantity;
    availableStock += available;
    reservedStock += balance.reserved;
    stockValue += balance.quantity * Math.max(number(item.purchase_price), 0);
    if (item.is_active && available <= 0) outOfStock += 1;
  }

  const paymentsByInvoice = new Map<string, number>();
  for (const payment of payments) paymentsByInvoice.set(payment.invoice_id, (paymentsByInvoice.get(payment.invoice_id) || 0) + Math.max(number(payment.amount), 0));
  const returnsByInvoice = new Map<string, { total: number; refund: number }>();
  for (const returned of returns) {
    const current = returnsByInvoice.get(returned.invoice_id) || { total: 0, refund: 0 };
    current.total += Math.max(number(returned.total), 0);
    current.refund += Math.max(number(returned.refund_amount), 0);
    returnsByInvoice.set(returned.invoice_id, current);
  }

  const buckets = makeBuckets(period, range.start, range.end);
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  let salesTotal = 0;
  let invoiceCount = 0;
  for (const invoice of invoices) {
    if (invoice.invoice_date < range.start || invoice.invoice_date > range.end) continue;
    invoiceCount += 1;
    const periodReturns = returns.filter((returned) => returned.invoice_id === invoice.id && returned.return_date >= range.start && returned.return_date <= range.end).reduce((sum, returned) => sum + Math.max(number(returned.total), 0), 0);
    const netTotal = Math.max(number(invoice.total) - periodReturns, 0);
    salesTotal += netTotal;
    const bucket = bucketMap.get(chartBucket(period, invoice.invoice_date));
    if (bucket) bucket.value += netTotal;
  }

  let paidInvoices = 0;
  let partialInvoices = 0;
  let unpaidInvoices = 0;
  let outstanding = 0;
  for (const invoice of invoices) {
    const invoiceData = returnsByInvoice.get(invoice.id) || { total: 0, refund: 0 };
    const invoiceTotal = Math.max(number(invoice.total) - invoiceData.total, 0);
    const paid = Math.max((paymentsByInvoice.get(invoice.id) || 0) - invoiceData.refund, 0);
    const balance = Math.max(invoiceTotal - paid, 0);
    outstanding += balance;
    if (balance <= 0) paidInvoices += 1;
    else if (paid > 0) partialInvoices += 1;
    else unpaidInvoices += 1;
  }

  const movementTotals = new Map<string, number>();
  for (const movement of movements) movementTotals.set(movement.movement_type, (movementTotals.get(movement.movement_type) || 0) + Math.abs(number(movement.quantity_delta)));
  const stockMix = Object.keys(movementLabels).map((type) => ({ label: movementLabels[type], value: movementTotals.get(type) || 0, color: movementColors[type] }));
  const periodInvoiceIds = new Set(invoices.filter((invoice) => invoice.invoice_date >= range.start && invoice.invoice_date <= range.end).map((invoice) => invoice.id));
  const topItemsMap = new Map<string, { id: string; name: string; quantity: number; revenue: number }>();
  for (const line of invoiceLines) {
    if (!periodInvoiceIds.has(line.invoice_id)) continue;
    const current = topItemsMap.get(line.item_id) || { id: line.item_id, name: line.item_name || itemMap.get(line.item_id)?.name || "Item unavailable", quantity: 0, revenue: 0 };
    current.quantity += Math.max(number(line.quantity), 0);
    current.revenue += Math.max(number(line.line_total), 0);
    topItemsMap.set(line.item_id, current);
  }

  const recentActivity = movements.slice(0, 8).map((movement) => ({ id: movement.id, item: itemMap.get(movement.item_id)?.name || "Item unavailable", type: movementLabels[movement.movement_type] || "Stock movement", quantity: number(movement.quantity_delta), date: movement.created_at }));
  const queryError = [itemsResult, balancesResult, invoicesResult, paymentsResult, returnsResult, invoiceLinesResult, movementsResult, purchaseOrdersResult, receiptsResult, salesOrdersResult].some((result) => Boolean(result.error));

  return {
    permissions: { inventory: canInventory, sales: canSales, invoices: canInvoices, payments: canPayments, purchases: canPurchases, receipts: canReceipts, returns: canReturns },
    stock: { quantity: stockQuantity, available: availableStock, reserved: reservedStock, value: stockValue, lowStock: lowStock.slice(0, 8), outOfStock },
    sales: { trend: buckets.map(({ label, value }) => ({ label, value })), total: salesTotal, invoiceCount },
    stockMix,
    payments: { available: canInvoices && canPayments && canReturns, paid: paidInvoices, partial: partialInvoices, unpaid: unpaidInvoices, outstanding },
    topItems: [...topItemsMap.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 5),
    recentActivity,
    pendingPurchaseOrders: canPurchases ? responseCount(purchaseOrdersResult) : null,
    pendingReceipts: canReceipts ? responseCount(receiptsResult) : null,
    pendingSalesOrders: canSales ? responseCount(salesOrdersResult) : null,
    queryError,
  };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#e2e8f0] bg-white ${className}`}>{children}</section>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-48 place-items-center p-6 text-center text-sm text-[#94a3b8]">{children}</div>;
}

function TrendChart({ points, restricted = false }: { points: Array<{ label: string; value: number }>; restricted?: boolean }) {
  const width = 720;
  const height = 240;
  const padding = { top: 18, right: 12, bottom: 32, left: 12 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...points.map((point) => point.value), 0);
  if (restricted) return <EmptyState>Sales information is restricted for your role.</EmptyState>;
  if (max <= 0) return <EmptyState>No issued sales in this period.</EmptyState>;
  const coordinates = points.map((point, index) => ({ ...point, x: padding.left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth), y: padding.top + chartHeight - (point.value / max) * chartHeight }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${padding.top + chartHeight} ${line} ${padding.left + chartWidth},${padding.top + chartHeight}`;
  const labels = coordinates.length <= 4 ? coordinates : [coordinates[0], coordinates[Math.floor((coordinates.length - 1) / 2)], coordinates[coordinates.length - 1]];
  return <div className="relative px-4 pb-3 pt-4"><svg viewBox={`0 0 ${width} ${height}`} className="pointer-events-none h-auto w-full" role="img" aria-label="Sales trend chart"><title>Sales trend</title>{[0, 1, 2, 3].map((step) => { const y = padding.top + (chartHeight / 3) * step; return <line key={step} x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} stroke="#edf2f4" strokeDasharray="3 5" />; })}<polygon points={area} fill="#00a63e" opacity="0.12" /><polyline points={line} fill="none" stroke="#00a63e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{coordinates.map((point) => <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="3.5" fill="white" stroke="#00a63e" strokeWidth="2"><title>{`${point.label}: ${money(point.value)}`}</title></circle>)}{labels.map((point) => <text key={`label-${point.label}`} x={point.x} y={height - 8} textAnchor="middle" fill="#64748b" fontSize="11">{point.label}</text>)}</svg><div className="pointer-events-none absolute inset-0" aria-label="Sales values"><div className="relative size-full">{coordinates.map((point) => <button key={`tooltip-${point.label}-${point.x}`} type="button" aria-label={`${point.label}: ${money(point.value)}`} className="pointer-events-auto group absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00a63e]" style={{ left: `${Math.min(Math.max((point.x / width) * 100, 8), 92)}%`, top: `${(point.y / height) * 100}%` }}><span className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#0f172a] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100 ${point.y < 80 ? "top-full mt-2" : "bottom-full mb-2"}`}>{point.label} · {money(point.value)}</span></button>)}</div></div></div>;
}

function DonutChart({ values, restricted = false }: { values: Array<{ label: string; value: number; color: string }>; restricted?: boolean }) {
  const total = values.reduce((sum, value) => sum + value.value, 0);
  if (restricted) return <EmptyState>Inventory information is restricted for your role.</EmptyState>;
  if (total <= 0) return <EmptyState>No stock movement in this period.</EmptyState>;
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className="grid gap-6 p-5 sm:grid-cols-[180px_1fr] sm:items-center"><div className="relative z-20 mx-auto size-44"><svg viewBox="0 0 180 180" className="relative z-20 size-full overflow-visible" role="img" aria-label="Stock movement breakdown"><title>Stock movement breakdown</title><circle cx="90" cy="90" r={radius} fill="none" stroke="#edf2f4" strokeWidth="22" transform="rotate(-90 90 90)" />{values.filter((value) => value.value > 0).map((value) => { const length = (value.value / total) * circumference; const percent = (value.value / total) * 100; const circle = <g key={value.label} className="group cursor-help" tabIndex={0} role="img" aria-label={`${value.label}: ${quantity(value.value)} units, ${percent.toFixed(1)} percent`}><circle cx="90" cy="90" r={radius} fill="none" stroke={value.color} strokeWidth="22" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" /><title>{`${value.label}: ${quantity(value.value)} units (${percent.toFixed(1)}%)`}</title><g className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><rect x="18" y="70" width="144" height="40" rx="7" fill="#0f172a" /><text x="90" y="86" textAnchor="middle" fill="white" fontSize="8" fontWeight="600">{value.label}</text><text x="90" y="101" textAnchor="middle" fill="white" fontSize="9" fontWeight="600">{`${quantity(value.value)} · ${percent.toFixed(1)}%`}</text></g></g>; offset += length; return circle; })}</svg><div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-center"><div><p className="font-mono text-2xl font-semibold text-[#0f172a]">{quantity(total)}</p><p className="text-[11px] text-[#64748b]">Units moved</p></div></div></div><div className="space-y-3">{values.filter((value) => value.value > 0).map((value) => <div key={value.label} className="flex items-center justify-between gap-4 text-sm"><span className="flex min-w-0 items-center gap-2 text-[#475569]"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: value.color }} />{value.label}</span><span className="shrink-0 font-mono text-xs font-semibold text-[#334155]">{quantity(value.value)}</span></div>)}</div></div>;
}

function SectionHeading({ icon: Icon, title, description, href, action }: { icon: typeof Boxes; title: string; description?: string; href?: string; action?: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[#f1f5f9] px-5 py-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Icon className="size-[18px]" /></span><div><h2 className="text-sm font-semibold text-[#0f172a]">{title}</h2>{description && <p className="mt-1 text-xs text-[#94a3b8]">{description}</p>}</div></div>{href && <Link href={href} className="shrink-0 text-xs font-semibold text-[#00a63e] hover:text-[#008a34]">{action || "View all"}</Link>}</div>;
}

export async function DashboardOverview({ period = "month" }: { period?: Period }) {
  const data = await loadDashboard(period);
  const maxTopItem = Math.max(...data.topItems.map((item) => item.quantity), 0);
  const maxPayment = Math.max(data.payments.paid, data.payments.partial, data.payments.unpaid, 1);
  const showStockData = data.permissions.inventory;
  const showPaymentData = data.payments.available;
  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Workspace overview</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">{getGreeting()}</h1><p className="mt-1 text-sm text-[#64748b]">Here is what needs your attention today.</p></div><div className="flex flex-wrap gap-2"><Link href="/sales-orders/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white transition hover:bg-[#008a34]"><Plus className="size-4" />New sale</Link><Link href="/purchase-orders/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dbe2e8] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:border-[#00a63e] hover:text-[#00a63e]"><ShoppingCart className="size-4" />New purchase</Link></div></div>
    {data.queryError && <div role="status" className="mb-6 rounded-lg border border-[#f5d48a] bg-[#fffaf0] px-4 py-3 text-sm text-[#7a5200]">Some dashboard data could not be loaded. Check your permissions or refresh the page.</div>}
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Stock value", value: showStockData ? money(data.stock.value) : "—", note: showStockData ? "Current physical stock" : "Inventory information restricted", icon: Boxes }, { label: "Available units", value: showStockData ? quantity(data.stock.available) : "—", note: showStockData ? `${quantity(data.stock.reserved)} reserved` : "Inventory information restricted", icon: PackageCheck }, { label: "Low-stock items", value: showStockData ? quantity(data.stock.lowStock.length) : "—", note: showStockData ? `${data.stock.outOfStock} out of stock` : "Inventory information restricted", icon: AlertTriangle }, { label: "Outstanding invoices", value: showPaymentData ? money(data.payments.outstanding) : "—", note: showPaymentData ? `${data.payments.unpaid + data.payments.partial} need attention` : "Payment information restricted", icon: ReceiptText }].map((metric) => { const MetricIcon = metric.icon; return <Card key={metric.label} className="p-5"><div className="mb-5 flex items-center justify-between"><p className="text-sm font-medium text-[#64748b]">{metric.label}</p><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><MetricIcon className="size-[18px]" /></span></div><p className="font-mono text-2xl font-semibold tracking-tight text-[#0f172a]">{metric.value}</p><p className="mt-2 text-xs text-[#94a3b8]">{metric.note}</p></Card>; })}</section>
    <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]"><Card><div className="flex flex-col justify-between gap-3 border-b border-[#f1f5f9] px-5 py-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><ArrowUpRight className="size-[18px]" /></span><div><h2 className="text-sm font-semibold text-[#0f172a]">Sales trend</h2><p className="mt-1 text-xs text-[#94a3b8]">{data.permissions.invoices ? `${money(data.sales.total)} across ${data.sales.invoiceCount} issued ${data.sales.invoiceCount === 1 ? "invoice" : "invoices"}` : "Sales information restricted"}</p></div></div><div className="flex rounded-lg bg-[#f1f5f9] p-1">{periods.map((option) => <Link key={option.value} href={`/protected?period=${option.value}`} aria-current={period === option.value ? "page" : undefined} className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:px-3 ${period === option.value ? "bg-[#00a63e] text-white" : "text-[#64748b] hover:text-[#0f172a]"}`}>{option.label}</Link>)}</div></div><TrendChart points={data.sales.trend} restricted={!data.permissions.invoices} /></Card><Card><SectionHeading icon={ArrowDownToLine} title="Stock movement" description="Posted movement quantity" href="/stock-movements" action="View history" /><DonutChart values={data.stockMix} restricted={!showStockData} /></Card></section>
    <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><Card><SectionHeading icon={CreditCard} title="Invoice payments" description="Current payment status" href="/invoices" action="View invoices" /><div className="space-y-5 p-5"><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-2xl font-semibold text-[#0f172a]">{money(data.payments.outstanding)}</p><p className="mt-1 text-xs text-[#94a3b8]">Outstanding balance</p></div><span className="rounded-full bg-[#fffaf0] px-2.5 py-1 text-[11px] font-medium text-[#7a5200]">{data.payments.unpaid + data.payments.partial} open</span></div>{[{ label: "Paid", count: data.payments.paid, color: "#00a63e" }, { label: "Partially paid", count: data.payments.partial, color: "#7b57ed" }, { label: "Unpaid", count: data.payments.unpaid, color: "#e26d5a" }].map((status) => <div key={status.label}><div className="mb-1.5 flex justify-between gap-4 text-xs"><span className="text-[#475569]">{status.label}</span><span className="font-mono font-semibold text-[#334155]">{status.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#eef2f4]"><div className="h-full rounded-full" style={{ width: `${(status.count / maxPayment) * 100}%`, backgroundColor: status.color }} /></div></div>)}</div></Card><Card><SectionHeading icon={Boxes} title="Top-selling items" description="By quantity sold in the selected period" href="/reports" action="Open reports" />{data.topItems.length === 0 ? <EmptyState>No sales recorded in this period.</EmptyState> : <div className="space-y-4 p-5">{data.topItems.map((item) => <div key={item.id}><div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span className="min-w-0 truncate font-medium text-[#334155]" title={item.name}>{item.name}</span><span className="shrink-0 font-mono text-xs text-[#64748b]">{quantity(item.quantity)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#eef2f4]"><div className="h-full rounded-full bg-[#00a63e]" style={{ width: `${maxTopItem > 0 ? (item.quantity / maxTopItem) * 100 : 0}%` }} /></div><p className="mt-1 text-xs text-[#94a3b8]">{money(item.revenue)} revenue</p></div>)}</div>}</Card></section>
    <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]"><Card><SectionHeading icon={AlertTriangle} title="Needs attention" description="Actions that may need your attention" />{data.stock.lowStock.length === 0 && !data.pendingPurchaseOrders && !data.pendingReceipts && !data.pendingSalesOrders ? <EmptyState>Everything is up to date.</EmptyState> : <div className="divide-y divide-[#f1f5f9]">{data.stock.lowStock.slice(0, 4).map((item) => <Link key={item.id} href="/inventory" className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[#fbfcfd]"><span className="grid size-8 place-items-center rounded-lg bg-[#fffaf0] text-[#c27c00]"><AlertTriangle className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[#334155]">{item.name}</span><span className="block text-xs text-[#94a3b8]">{quantity(item.available)} available · reorder at {quantity(item.reorderLevel)}</span></span><ArrowUpRight className="size-4 text-[#94a3b8]" /></Link>)}{data.pendingPurchaseOrders !== null && data.pendingPurchaseOrders > 0 && <Link href="/purchase-orders" className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[#fbfcfd]"><span className="grid size-8 place-items-center rounded-lg bg-[#eaf1ff] text-[#356fe8]"><ClipboardList className="size-4" /></span><span className="flex-1 text-sm text-[#334155]">{data.pendingPurchaseOrders} purchase orders waiting for receipt</span><ArrowUpRight className="size-4 text-[#94a3b8]" /></Link>}{data.pendingReceipts !== null && data.pendingReceipts > 0 && <Link href="/goods-receipts" className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[#fbfcfd]"><span className="grid size-8 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Truck className="size-4" /></span><span className="flex-1 text-sm text-[#334155]">{data.pendingReceipts} goods receipts saved as draft</span><ArrowUpRight className="size-4 text-[#94a3b8]" /></Link>}{data.pendingSalesOrders !== null && data.pendingSalesOrders > 0 && <Link href="/sales-orders" className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[#fbfcfd]"><span className="grid size-8 place-items-center rounded-lg bg-[#f2edff] text-[#7b57ed]"><FileText className="size-4" /></span><span className="flex-1 text-sm text-[#334155]">{data.pendingSalesOrders} sales orders waiting for fulfillment</span><ArrowUpRight className="size-4 text-[#94a3b8]" /></Link>}</div>}</Card><Card><SectionHeading icon={PackageCheck} title="Recent activity" description="Latest stock movements" href="/stock-movements" action="View history" />{data.recentActivity.length === 0 ? <EmptyState>No stock activity yet.</EmptyState> : <div className="divide-y divide-[#f1f5f9]">{data.recentActivity.slice(0, 6).map((activity) => <div key={activity.id} className="flex items-center gap-3 px-5 py-3.5"><span className={`grid size-8 place-items-center rounded-lg ${activity.quantity >= 0 ? "bg-[#e6f8ee] text-[#00a63e]" : "bg-[#fff5f5] text-[#c2413b]"}`}>{activity.quantity >= 0 ? <ArrowDownToLine className="size-4" /> : <ArrowUpRight className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#334155]">{activity.item}</p><p className="mt-0.5 text-xs text-[#94a3b8]">{activity.type} · {formatActivityDate(activity.date)}</p></div><span className={`shrink-0 font-mono text-xs font-semibold ${activity.quantity >= 0 ? "text-[#08752e]" : "text-[#b42318]"}`}>{activity.quantity >= 0 ? "+" : ""}{quantity(activity.quantity)}</span></div>)}</div>}</Card></section>
    <Card><SectionHeading icon={Plus} title="Quick actions" description="Start the next common task" /><div className="grid divide-y divide-[#f1f5f9] sm:grid-cols-4 sm:divide-x sm:divide-y-0"><Link href="/sales-orders/new" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#fbfcfd]"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><ReceiptText className="size-[18px]" /></span><span className="text-sm font-medium text-[#334155]">New sale</span></Link><Link href="/goods-receipts/new" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#fbfcfd]"><span className="grid size-9 place-items-center rounded-lg bg-[#eaf1ff] text-[#356fe8]"><PackageCheck className="size-[18px]" /></span><span className="text-sm font-medium text-[#334155]">Receive stock</span></Link><Link href="/customers/new" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#fbfcfd]"><span className="grid size-9 place-items-center rounded-lg bg-[#f2edff] text-[#7b57ed]"><Users className="size-[18px]" /></span><span className="text-sm font-medium text-[#334155]">Add customer</span></Link><Link href="/items" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#fbfcfd]"><span className="grid size-9 place-items-center rounded-lg bg-[#fffaf0] text-[#c27c00]"><Boxes className="size-[18px]" /></span><span className="text-sm font-medium text-[#334155]">Add item</span></Link></div></Card>
  </div>;
}
