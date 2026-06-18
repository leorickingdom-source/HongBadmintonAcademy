"use server";

import { createClient } from "@/lib/supabase/server";

export interface SearchHit {
  id: string;
  label: string;
  sub?: string;
  href: string;
}

export interface SearchResults {
  students: SearchHit[];
  parents: SearchHit[];
  coaches: SearchHit[];
  classes: SearchHit[];
}

const EMPTY: SearchResults = { students: [], parents: [], coaches: [], classes: [] };

// Global search across students, parents, coaches, classes. RLS gates access;
// admin layout already guards the calling route.
export async function searchEverything(query: string): Promise<SearchResults> {
  const q = (query ?? "").trim();
  if (!q) return EMPTY;
  const pattern = `%${q}%`;
  const supabase = await createClient();

  const [{ data: students }, { data: profiles }, { data: classes }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, status")
      .ilike("full_name", pattern)
      .limit(8),
    supabase
      .from("profiles")
      .select("id, full_name, role, email")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .in("role", ["parent", "coach"])
      .limit(16),
    supabase
      .from("classes")
      .select("id, name, level")
      .ilike("name", pattern)
      .limit(8),
  ]);

  const parents = (profiles ?? []).filter((p: any) => p.role === "parent").slice(0, 8);
  const coaches = (profiles ?? []).filter((p: any) => p.role === "coach").slice(0, 8);

  return {
    students: (students ?? []).map((s: any) => ({
      id: s.id,
      label: s.full_name,
      sub: s.status,
      href: `/admin/students/${s.id}`,
    })),
    parents: parents.map((p: any) => ({
      id: p.id,
      label: p.full_name ?? p.email ?? "—",
      sub: p.email ?? undefined,
      href: `/admin/parents/${p.id}`,
    })),
    coaches: coaches.map((p: any) => ({
      id: p.id,
      label: p.full_name ?? p.email ?? "—",
      sub: p.email ?? undefined,
      href: `/admin/coaches/${p.id}`,
    })),
    classes: (classes ?? []).map((c: any) => ({
      id: c.id,
      label: c.name,
      sub: c.level ?? undefined,
      href: `/admin/classes/${c.id}`,
    })),
  };
}
