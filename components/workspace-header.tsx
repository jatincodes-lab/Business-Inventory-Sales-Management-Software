"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bell, Menu, Search } from "lucide-react";

import { getWorkspaceNotifications, searchWorkspace, type WorkspaceNotification, type WorkspaceSearchResult } from "@/app/actions/workspace-header";
import { LogoutButton } from "@/components/logout-button";

function resultType(type: WorkspaceSearchResult["type"]) {
  return type === "sales_order" ? "Sales order" : type === "purchase_order" ? "Purchase order" : type[0].toUpperCase() + type.slice(1);
}

function initials(name: string, fallback: string) {
  const source = name.trim() || fallback.trim() || "SF";
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2)).toUpperCase();
}

export function WorkspaceHeader({ userName, email, onOpenMenu }: { userName: string; email: string; onOpenMenu: () => void }) {
  const searchBox = useRef<HTMLDivElement>(null);
  const notificationBox = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationError, setNotificationError] = useState("");

  async function loadNotifications() {
    setNotificationsLoading(true);
    setNotificationError("");
    const result = await getWorkspaceNotifications();
    if (result.ok) setNotifications(result.data);
    else setNotificationError(result.message || "Unable to load notifications.");
    setNotificationsLoading(false);
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInput.current?.focus());
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!searchBox.current?.contains(target)) setSearchOpen(false);
      if (!notificationBox.current?.contains(target)) setNotificationsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    const currentRequest = ++requestId.current;
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const result = await searchWorkspace(query);
      if (requestId.current !== currentRequest) return;
      if (result.ok) setSearchResults(result.data);
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  return <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e2e8f0] bg-white/95 px-4 backdrop-blur md:px-8">
    <div className="flex items-center gap-3">
      <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="grid size-10 place-items-center rounded-lg text-[#64748b] transition hover:bg-[#f1f5f9] lg:hidden"><Menu className="size-5" /></button>
      <div ref={searchBox} className="relative hidden sm:block sm:w-64">
        <div className="flex h-11 items-center rounded-lg border border-[#e2e8f0] bg-white px-3 transition focus-within:border-[#00a63e] focus-within:ring-2 focus-within:ring-[#d7eee0]">
          <input ref={searchInput} value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} placeholder="Search workspace" aria-label="Search workspace" className="workspace-search-input min-w-0 flex-1 bg-transparent text-sm text-[#334155] outline-none placeholder:text-[#94a3b8]" />
        </div>
        {searchOpen && <div className="absolute left-0 top-12 z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-xl shadow-[#0e1f16]/10">
          {searchQuery.trim().length < 2 ? <p className="px-4 py-5 text-xs text-[#64748b]">Type at least 2 characters to search items, customers, orders, and invoices.</p> : searching ? <p className="px-4 py-5 text-xs text-[#64748b]">Searching workspace…</p> : searchResults.length === 0 ? <p className="px-4 py-5 text-xs text-[#64748b]">No matching records found.</p> : <div className="max-h-96 overflow-y-auto py-1">{searchResults.map((result) => <Link key={`${result.type}:${result.id}`} href={result.href} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#f7f8fa]"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#e6f8ee] text-[#00a63e]"><Search className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium text-[#334155]">{result.label}</span><span className="block truncate text-xs text-[#94a3b8]">{resultType(result.type)} · {result.description.replace(`${resultType(result.type)} · `, "")}</span></span></Link>)}</div>}
        </div>}
      </div>
    </div>
    <div className="flex items-center gap-2 md:gap-4">
      <div ref={notificationBox} className="relative">
        <button type="button" onClick={() => { const opening = !notificationsOpen; setNotificationsOpen(opening); if (opening) void loadNotifications(); }} aria-label={notifications.length ? `Notifications (${notifications.length})` : "Notifications"} aria-expanded={notificationsOpen} className={`relative grid size-10 place-items-center rounded-lg transition ${notificationsOpen ? "bg-[#e6f8ee] text-[#00a63e]" : "text-[#64748b] hover:bg-[#f1f5f9]"}`}><Bell className="size-[18px]" />{notifications.length > 0 && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#00a63e]" />}</button>
        {notificationsOpen && <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-xl shadow-[#0e1f16]/10"><div className="flex items-center justify-between border-b border-[#f1f5f9] px-4 py-3"><div><h2 className="text-sm font-semibold text-[#0f172a]">Notifications</h2><p className="mt-0.5 text-xs text-[#94a3b8]">Items that need your attention</p></div>{notifications.length > 0 && <span className="rounded-full bg-[#e6f8ee] px-2 py-1 text-[11px] font-semibold text-[#00a63e]">{notifications.length}</span>}</div>{notificationsLoading ? <p className="px-4 py-6 text-xs text-[#64748b]">Loading notifications…</p> : notificationError ? <p role="alert" className="px-4 py-6 text-xs text-red-700">{notificationError}</p> : notifications.length === 0 ? <div className="px-4 py-8 text-center"><Bell className="mx-auto size-5 text-[#94a3b8]" /><p className="mt-2 text-xs text-[#64748b]">You’re all caught up.</p></div> : <div className="max-h-96 overflow-y-auto">{notifications.map((notification) => <Link key={notification.id} href={notification.href} onClick={() => setNotificationsOpen(false)} className="flex gap-3 border-b border-[#f1f5f9] px-4 py-3 transition last:border-0 hover:bg-[#f7f8fa]"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#fff7e6] text-[#a16207]"><AlertCircle className="size-4" /></span><span className="min-w-0"><span className="block text-xs font-semibold text-[#334155]">{notification.title}</span><span className="mt-1 block text-xs leading-4 text-[#64748b]">{notification.message}</span></span></Link>)}</div>}</div>}
      </div>
      <div className="hidden h-6 w-px bg-[#e2e8f0] md:block" />
      <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-[#d7eee0] text-xs font-semibold text-[#0e1f16]">{initials(userName, email)}</span><div className="hidden text-left md:block"><p className="max-w-40 truncate text-xs font-semibold text-[#334155]">{userName}</p><p className="max-w-40 truncate text-[11px] text-[#94a3b8]">{email}</p></div><LogoutButton iconOnly /></div>
    </div>
  </header>;
}
