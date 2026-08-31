"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
  X,
} from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { WorkspaceHeader } from "@/components/workspace-header";

type Icon = typeof LayoutDashboard;
type NavItem = { label: string; href: string };
type NavEntry =
  | { label: string; href: string; icon: Icon }
  | { label: string; icon: Icon; items: NavItem[] };
type NavGroup = Extract<NavEntry, { items: NavItem[] }>;
type Flyout = { label: string; items: NavItem[]; top: number };

const navigation: NavEntry[] = [
  { label: "Dashboard", href: "/protected", icon: LayoutDashboard },
  {
    label: "Inventory",
    icon: Boxes,
    items: [
      { label: "Stock overview", href: "/inventory" },
      { label: "Items", href: "/items" },
      { label: "Units", href: "/units" },
      { label: "Warehouses", href: "/warehouses" },
      { label: "Stock movements", href: "/stock-movements" },
      { label: "Adjustments", href: "/inventory-adjustment" },
      { label: "Transfers", href: "/inventory-transfers" },
    ],
  },
  {
    label: "Purchases",
    icon: ShoppingCart,
    items: [
      { label: "Vendors", href: "/vendors" },
      { label: "Purchase orders", href: "/purchase-orders" },
      { label: "Goods receipts", href: "/goods-receipts" },
    ],
  },
  {
    label: "Sales",
    icon: ReceiptText,
    items: [
      { label: "Customers", href: "/customers" },
      { label: "Sales orders", href: "/sales-orders" },
      { label: "Fulfillments", href: "/sales-fulfillments" },
      { label: "Invoices", href: "/invoices" },
      { label: "Payments", href: "/payments" },
      { label: "Returns", href: "/sales-returns" },
    ],
  },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Roles & permissions", href: "/roles-permissions", icon: ShieldCheck },
  { label: "Settings", href: "/settings", icon: Settings },
];

const metrics = [
  { label: "Items in stock", note: "Connect Supabase to load live data", icon: Boxes },
  { label: "Low-stock items", note: "Reorder levels will appear here", icon: CircleAlert },
  { label: "Open purchases", note: "Pending purchase orders", icon: ClipboardList },
  { label: "Unpaid invoices", note: "Outstanding customer balance", icon: ReceiptText },
];

function initials(name: string, fallback: string) {
  const source = name.trim() || fallback.trim() || "SF";
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2)).toUpperCase();
}

function NavContent({
  collapsed,
  onNavigate,
  onFlyoutOpen,
  onFlyoutClose,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onFlyoutOpen: (group: NavGroup, trigger: HTMLElement) => void;
  onFlyoutClose: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Inventory: true,
    Purchases: true,
    Sales: true,
  });

  return (
    <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
      {!collapsed && (
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7da48b]">
          Workspace
        </p>
      )}
      <div className="space-y-1">
        {navigation.map((entry) => {
          const EntryIcon = entry.icon;

          if (!("items" in entry)) {
            return (
              <Link
                key={entry.label}
                href={entry.href}
                onClick={onNavigate}
                title={collapsed ? entry.label : undefined}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#b8cbbd] transition hover:bg-[#16291e] hover:text-white"
              >
                <EntryIcon className="size-[18px] shrink-0" strokeWidth={1.8} />
                {!collapsed && <span>{entry.label}</span>}
              </Link>
            );
          }

          const isOpen = openGroups[entry.label];

          return (
            <div key={entry.label} onMouseLeave={collapsed ? onFlyoutClose : undefined}>
              <button
                type="button"
                onClick={(event) => {
                  if (collapsed) {
                    onFlyoutOpen(entry, event.currentTarget);
                    return;
                  }

                  setOpenGroups((current) => ({
                    ...current,
                    [entry.label]: !current[entry.label],
                  }));
                }}
                onMouseEnter={(event) => collapsed && onFlyoutOpen(entry, event.currentTarget)}
                onFocus={(event) => collapsed && onFlyoutOpen(entry, event.currentTarget)}
                title={collapsed ? entry.label : undefined}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#b8cbbd] transition hover:bg-[#16291e] hover:text-white"
              >
                <EntryIcon className="size-[18px] shrink-0" strokeWidth={1.8} />
                {!collapsed && (
                  <>
                    <span className="flex-1">{entry.label}</span>
                    {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </>
                )}
              </button>
              {!collapsed && isOpen && (
                <div className="ml-9 mt-1 space-y-0.5 border-l border-[#294833] pl-3">
                  {entry.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className="block rounded-lg px-3 py-2 text-xs text-[#92ad9a] transition hover:bg-[#16291e] hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function Sidebar({
  collapsed,
  mobileOpen,
  businessName,
  userName,
  email,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  businessName: string;
  userName: string;
  email: string;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [flyout, setFlyout] = useState<Flyout | null>(null);
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlyoutTimer = () => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
  };

  const closeFlyout = () => {
    clearFlyoutTimer();
    flyoutTimer.current = setTimeout(() => setFlyout(null), 160);
  };

  const openFlyout = (group: NavGroup, trigger: HTMLElement) => {
    clearFlyoutTimer();
    setFlyout({
      label: group.label,
      items: group.items,
      top: trigger.getBoundingClientRect().top,
    });
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col overflow-visible bg-[#0e1f16] transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-[76px]" : "lg:w-[256px]"}`}
      >
        <div
          className={`flex h-16 items-center border-b border-white/10 px-4 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && (
            <Link href="/protected" onClick={onClose} className="flex items-center gap-3 overflow-hidden text-white">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#00a63e] text-xs font-bold">{initials(businessName, "B")}</span>
              <span className="truncate font-semibold tracking-tight">{businessName}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setFlyout(null);
              onToggle();
            }}
            aria-label="Toggle sidebar"
            className="hidden size-9 place-items-center rounded-lg text-[#b8cbbd] transition hover:bg-[#16291e] hover:text-white lg:grid"
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-9 place-items-center rounded-lg text-[#b8cbbd] transition hover:bg-[#16291e] hover:text-white lg:hidden"
          >
            <X className="size-[18px]" />
          </button>
        </div>
        <NavContent
          collapsed={collapsed}
          onNavigate={onClose}
          onFlyoutOpen={openFlyout}
          onFlyoutClose={closeFlyout}
        />
        {collapsed && flyout && (
          <div
            className="fixed z-[70] w-52 rounded-xl border border-white/10 bg-[#12271b] p-2 shadow-2xl shadow-black/30"
            style={{ left: 72, top: flyout.top }}
            onMouseEnter={clearFlyoutTimer}
            onMouseLeave={closeFlyout}
          >
            <p className="px-3 py-2 text-xs font-semibold text-white">{flyout.label}</p>
            <div className="space-y-0.5">
              {flyout.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setFlyout(null);
                    onClose();
                  }}
                  className="block rounded-lg px-3 py-2 text-xs text-[#92ad9a] transition hover:bg-[#1a3825] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="border-t border-white/10 p-3">
          <div className={`flex items-center gap-3 rounded-xl bg-[#16291e] p-2.5 ${collapsed ? "flex-col" : ""}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d7eee0] text-sm font-semibold text-[#0e1f16]">{initials(userName, email)}</span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{userName}</p>
                <p className="truncate text-[11px] text-[#92ad9a]">{email}</p>
              </div>
            )}
            <LogoutButton iconOnly />
          </div>
        </div>
      </aside>
    </>
  );
}

export function DashboardShell({ businessName, userName, email, children }: { businessName: string; userName: string; email: string; children?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[#f7f8fa] text-[#0f172a]">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        businessName={businessName}
        userName={userName}
        email={email}
        onToggle={() => setCollapsed((value) => !value)}
        onClose={() => setMobileOpen(false)}
      />
      <div className={`min-h-dvh transition-[padding] duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[256px]"}`}>
        <WorkspaceHeader userName={userName} email={email} onOpenMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 md:p-8">
          {children ?? <>
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Workspace overview</p>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">Good morning</h1>
              <p className="mt-1 text-sm text-[#64748b]">Your inventory workspace will appear here as data is connected.</p>
            </div>
            <Link href="/purchase-orders/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white transition hover:bg-[#008a34] active:translate-y-px">
              <ShoppingCart className="size-4" />
              New purchase order
            </Link>
          </div>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const MetricIcon = metric.icon;
              return (
                <div key={metric.label} className="rounded-xl border border-[#e2e8f0] bg-white p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <p className="text-sm font-medium text-[#64748b]">{metric.label}</p>
                    <span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><MetricIcon className="size-[18px]" /></span>
                  </div>
                  <p className="font-mono text-3xl font-semibold tracking-tight text-[#0f172a]">-</p>
                  <p className="mt-2 text-xs text-[#94a3b8]">{metric.note}</p>
                </div>
              );
            })}
          </section>
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-xl border border-[#e2e8f0] bg-white">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#0f172a]">Recent activity</h2>
                  <p className="mt-1 text-xs text-[#94a3b8]">Stock and document events will be listed here.</p>
                </div>
                <Link href="/stock-movements" className="text-xs font-semibold text-[#00a63e] hover:text-[#008a34]">View history</Link>
              </div>
              <div className="grid min-h-64 place-items-center p-8 text-center">
                <div>
                  <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#f1f5f9] text-[#94a3b8]"><PackageCheck className="size-5" /></div>
                  <p className="text-sm font-medium text-[#334155]">No activity yet</p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-[#94a3b8]">Post your first goods receipt to start building the stock history.</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-[#e2e8f0] bg-white">
              <div className="border-b border-[#f1f5f9] px-5 py-4">
                <h2 className="text-sm font-semibold text-[#0f172a]">Quick setup</h2>
                <p className="mt-1 text-xs text-[#94a3b8]">Complete these basics before daily operations.</p>
              </div>
              <div className="divide-y divide-[#f1f5f9]">
                <Link href="/items" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f7f8fa]"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Boxes className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-[#334155]">Add your first item</span><span className="block text-xs text-[#94a3b8]">Create an SKU and set reorder levels</span></span><ChevronRight className="size-4 text-[#94a3b8]" /></Link>
                <Link href="/vendors" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f7f8fa]"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Store className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-[#334155]">Add a vendor</span><span className="block text-xs text-[#94a3b8]">Prepare your purchasing directory</span></span><ChevronRight className="size-4 text-[#94a3b8]" /></Link>
                <Link href="/customers/new" className="flex items-center gap-3 px-5 py-4 transition hover:bg-[#f7f8fa]"><span className="grid size-9 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Users className="size-[18px]" /></span><span className="flex-1"><span className="block text-sm font-medium text-[#334155]">Add a customer</span><span className="block text-xs text-[#94a3b8]">Set up future sales and invoices</span></span><ChevronRight className="size-4 text-[#94a3b8]" /></Link>
              </div>
            </div>
          </section>
          </>}
        </main>
      </div>
    </div>
  );
}
