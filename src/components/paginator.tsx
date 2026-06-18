"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";

export const PAGE_SIZE = 25;

export function Paginator({
  page,
  total,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  total: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function go(p: number) {
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const btn =
    "rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-sm">
      <span className="text-xs text-slate-500 tabular-nums">
        Showing <strong className="text-slate-700">{from}</strong>–
        <strong className="text-slate-700">{to}</strong> of{" "}
        <strong className="text-slate-700">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className={cn(btn, "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50")}
        >
          ← Prev
        </button>
        <span className="px-2 text-xs text-slate-500 tabular-nums">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          className={cn(btn, "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50")}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
