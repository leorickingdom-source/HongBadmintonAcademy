"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Feather, Calendar, CalendarDays, CalendarOff, CreditCard, TrendingUp, UserCheck, ClipboardCheck, Banknote, Tablet, LayoutGrid, Users, GraduationCap, Trophy, Award, Medal, BookOpen, Megaphone, MessageCircle, Tag, BarChart3, FileText, Settings } from "lucide-react";
import { Avatar, cn } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out-button";
import { APP_SHORT, ROLE_LABEL, type NavItem } from "@/lib/constants";

const ROOTS = ["/admin", "/coach", "/parent"];

export interface NavGroup {
  group: string;
  items: NavItem[];
}

function isActive(pathname: string, href: string): boolean {
  if (ROOTS.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

// Resolve a lucide icon from a nav href — used by both the sidebar items and
// the mobile bottom tabs.
function navIcon(href: string) {
  if (href.includes("attendance")) return ClipboardCheck;
  if (href.includes("sessions")) return CalendarDays;
  if (href.includes("children")) return Users;
  if (href.includes("people")) return Users;
  if (href.includes("classes")) return GraduationCap;
  if (href.includes("coaches")) return Users;
  if (href.includes("leaderboard")) return Trophy;
  if (href.includes("training")) return BookOpen;
  if (href.includes("exams")) return Medal;
  if (href.includes("rewards")) return Award;
  if (href.includes("collections")) return Banknote;
  if (href.includes("invoice")) return CreditCard;
  if (href.includes("scorecard")) return TrendingUp;
  if (href.includes("announce")) return Megaphone;
  if (href.includes("messages")) return MessageCircle;
  if (href.includes("fee-plans")) return Tag;
  if (href.includes("analytics")) return BarChart3;
  if (href.includes("reports")) return FileText;
  if (href.includes("holidays")) return CalendarOff;
  if (href.includes("settings")) return Settings;
  if (href.includes("kiosk")) return Tablet;
  if (href.includes("checkin")) return UserCheck;
  if (href.includes("schedule")) return Calendar;
  if (href.includes("payroll")) return Banknote;
  return LayoutGrid;
}
function shortLabel(label: string): string {
  return label.replace(/ ?[&·].*/, "").replace(/^My /, "").trim().split(" ")[0];
}

export function AppShell({
  groups,
  role,
  name,
  accountHref,
  bell,
  children,
}: {
  groups: NavGroup[];
  role: string;
  name: string;
  accountHref?: string;
  bell?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Admin has many groups → collapse to an accordion (only the active section
  // open) so the rail isn't 16 links at once. Coach/Parent pass one group →
  // show it flat with no toggle.
  const collapsible = groups.length > 1;
  const activeGroup =
    groups.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.group ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(
    activeGroup ?? (collapsible ? null : groups[0]?.group ?? null),
  );
  // Keep whichever section you navigate into expanded.
  useEffect(() => {
    if (collapsible && activeGroup) setOpenGroup(activeGroup);
  }, [collapsible, activeGroup]);

  const nav = (
    <nav className={collapsible ? "space-y-1" : "space-y-6"}>
      {groups.map((g) => {
        const expanded = !collapsible || openGroup === g.group;
        return (
          <div key={g.group}>
            {collapsible ? (
              <button
                type="button"
                onClick={() => setOpenGroup((cur) => (cur === g.group ? null : g.group))}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              >
                {g.group}
                <svg
                  viewBox="0 0 12 12"
                  className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M4.5 2.5 8 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {g.group}
              </div>
            )}
            {expanded && (
              <div className={cn("space-y-0.5", collapsible ? "mb-1 mt-1" : "mt-2")}>
                {g.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = navIcon(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-green-50 font-semibold text-green-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          active ? "text-green-600" : "text-slate-400 group-hover:text-slate-500",
                        )}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  // Logo is a one-tap shortcut back to the role's home (the main menu).
  const home = ROOTS.includes(`/${role}`) ? `/${role}` : "/";
  const homeActive = pathname === home;
  // Parent/coach get a mobile bottom-tab bar (consumer-app pattern). Admin keeps
  // the sidebar — too many sections for tabs. Show every nav item (Home + up to
  // 5) so nothing is buried in the burger menu — coach has 5 (check-in,
  // schedule, marking, payroll, exams), parent 4.
  const bottomItems =
    role === "admin"
      ? []
      : [
          { href: home, short: "Home", Icon: Home },
          ...groups
            .flatMap((g) => g.items)
            .slice(0, 5)
            .map((it) => ({ href: it.href, short: shortLabel(it.label), Icon: navIcon(it.href) })),
        ];

  // Dashboard is pinned above the section groups so it's always one tap away
  // (no expanding an accordion to find it).
  const dashboardLink = (
    <Link
      href={home}
      onClick={() => setOpen(false)}
      className={cn(
        "mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        homeActive
          ? "bg-green-50 font-semibold text-green-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      <Home className="h-4 w-4 shrink-0" />
      Dashboard
    </Link>
  );
  const brand = (
    <Link
      href={home}
      onClick={() => setOpen(false)}
      title="Back to home"
      className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-70"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
        <Feather className="h-5 w-5" />
      </span>
      <div>
        <div className="text-sm font-bold text-slate-900">{APP_SHORT}</div>
        <div className="text-[11px] text-slate-400">{ROLE_LABEL[role] ?? role}</div>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        {brand}
        <div className="flex items-center gap-2">
          {bell}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      <div className="md:flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "w-full border-r border-slate-200 bg-white p-4 md:block md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto",
            open ? "block" : "hidden",
          )}
        >
          <div className="mb-6 hidden items-center justify-between px-2 md:flex">
            {brand}
            {bell}
          </div>

          {dashboardLink}
          {nav}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2.5 px-2 pb-3">
              <Avatar name={name} size={36} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{name}</div>
                <div className="text-[11px] text-slate-400">{ROLE_LABEL[role] ?? role}</div>
              </div>
            </div>
            {accountHref && (
              <Link
                href={accountHref}
                onClick={() => setOpen(false)}
                className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <Settings className="h-4 w-4 shrink-0 text-slate-400" />
                Account
              </Link>
            )}
            <SignOutButton role={role} />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 pb-20 md:h-screen md:overflow-y-auto md:p-8 md:pb-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {bottomItems.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
          {bottomItems.map((it) => {
            const active = isActive(pathname, it.href);
            const Icon = it.Icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={cn("flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium", active ? "text-green-700" : "text-slate-500")}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate px-1">{it.short}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
