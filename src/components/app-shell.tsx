"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function AppShell({
  groups,
  role,
  name,
  children,
}: {
  groups: NavGroup[];
  role: string;
  name: string;
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
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-green-50 font-semibold text-green-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                          active ? "bg-green-600" : "bg-slate-300 group-hover:bg-slate-400",
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
  const brand = (
    <Link
      href={home}
      onClick={() => setOpen(false)}
      title="Back to home"
      className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-70"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
        🏸
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
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <div className="md:flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "w-full border-r border-slate-200 bg-white p-4 md:block md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto",
            open ? "block" : "hidden",
          )}
        >
          <div className="mb-6 hidden px-2 md:block">{brand}</div>

          {nav}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2.5 px-2 pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                {initials(name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{name}</div>
                <div className="text-[11px] text-slate-400">{ROLE_LABEL[role] ?? role}</div>
              </div>
            </div>
            <SignOutButton />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 md:h-screen md:overflow-y-auto md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
