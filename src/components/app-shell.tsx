"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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

  const nav = (
    <nav className="space-y-6">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {g.group}
          </div>
          <div className="mt-2 space-y-0.5">
            {g.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm",
                  isActive(pathname, item.href)
                    ? "bg-green-600 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-green-600 text-sm text-white">
            🏸
          </span>
          {APP_SHORT}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm"
        >
          Menu
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
          <div className="mb-6 hidden items-center gap-2 px-2 md:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 text-white">
              🏸
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-900">{APP_SHORT}</div>
              <div className="text-xs text-slate-400">{ROLE_LABEL[role] ?? role}</div>
            </div>
          </div>

          {nav}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="px-3 pb-2 text-sm">
              <div className="font-medium text-slate-700">{name}</div>
              <div className="text-xs text-slate-400">{ROLE_LABEL[role] ?? role}</div>
            </div>
            <SignOutButton />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-4 md:h-screen md:overflow-y-auto md:p-8">{children}</main>
      </div>
    </div>
  );
}
