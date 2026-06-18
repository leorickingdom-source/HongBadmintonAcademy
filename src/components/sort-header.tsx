"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";

// Clickable column header. Clicking cycles asc → desc → asc on this key; the
// previous sort param is replaced. Page resets to 1 so a re-sort doesn't strand
// you on page 4.
export function SortHeader({
  label,
  sortKey,
  current,
  dir,
}: {
  label: string;
  sortKey: string;
  current: string;
  dir: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = current === sortKey;
  const nextDir: "asc" | "desc" = active && dir === "asc" ? "desc" : "asc";

  function onClick() {
    const params = new URLSearchParams(sp.toString());
    params.set("sort", sortKey);
    if (nextDir === "desc") params.set("dir", "desc");
    else params.delete("dir");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide transition-colors",
        active ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {label}
      <span className="text-[10px]">
        {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
