"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchEverything, type SearchHit, type SearchResults } from "@/app/(admin)/admin/search-action";

const EMPTY: SearchResults = { students: [], parents: [], coaches: [], classes: [] };

const GROUPS: { key: keyof SearchResults; label: string; icon: string }[] = [
  { key: "students", label: "Students", icon: "🧒" },
  { key: "parents", label: "Parents", icon: "👨‍👩‍👧" },
  { key: "coaches", label: "Coaches", icon: "🎽" },
  { key: "classes", label: "Classes", icon: "📅" },
];

function flatten(results: SearchResults): SearchHit[] {
  return GROUPS.flatMap((g) => results[g.key]);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => flatten(results), [results]);
  const totalHits = flat.length;

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults(EMPTY);
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) {
      // next-tick so the input mounts before focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults(EMPTY);
      setActive(0);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchEverything(term);
        setResults(r);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLAnchorElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function go(hit: SearchHit) {
    close();
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, totalHits - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[active];
      if (hit) go(hit);
    }
  }

  if (!open) return null;

  let idx = 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-20"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <span className="text-slate-400">🔎</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search students, parents, coaches, classes…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-slate-400"
          />
          {loading && <span className="text-xs text-slate-400">…</span>}
        </div>

        <div ref={listRef} className="max-h-96 overflow-y-auto">
          {!q.trim() && (
            <div className="px-5 py-6 text-center text-sm text-slate-400">
              Type a name or class to search.
            </div>
          )}
          {q.trim() && totalHits === 0 && !loading && (
            <div className="px-5 py-6 text-center text-sm text-slate-400">No matches.</div>
          )}
          {GROUPS.map((g) => {
            const hits = results[g.key];
            if (!hits.length) return null;
            return (
              <div key={g.key} className="py-2">
                <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {g.icon} {g.label}
                </div>
                {hits.map((h) => {
                  const myIdx = idx++;
                  const isActive = myIdx === active;
                  return (
                    <a
                      key={`${g.key}:${h.id}`}
                      href={h.href}
                      data-idx={myIdx}
                      onMouseEnter={() => setActive(myIdx)}
                      onClick={(e) => {
                        e.preventDefault();
                        go(h);
                      }}
                      className={
                        "flex items-center justify-between gap-3 px-4 py-2 text-sm transition-colors " +
                        (isActive ? "bg-green-50 text-green-800" : "text-slate-700 hover:bg-slate-50")
                      }
                    >
                      <span className="truncate font-medium">{h.label}</span>
                      {h.sub && <span className="shrink-0 text-xs text-slate-400">{h.sub}</span>}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
          <span>
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5">↑</kbd>{" "}
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5">↓</kbd> navigate ·{" "}
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5">↵</kbd> open ·{" "}
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5">esc</kbd> close
          </span>
          <span>
            <kbd className="rounded bg-slate-100 px-1.5 py-0.5">⌘K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
