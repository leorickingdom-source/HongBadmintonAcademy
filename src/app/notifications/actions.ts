"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { getParentIdFromCookie } from "@/lib/parent-auth";
import { markAllRead, markRead, setMuted } from "@/lib/notifications";

// Resolve the caller from trusted server-side auth: staff via Supabase session,
// otherwise a parent via the signed cookie. Never from request input.
async function meId(): Promise<string | null> {
  const staff = await getProfile();
  if (staff) return staff.id;
  return getParentIdFromCookie();
}

export async function markAllReadAction(): Promise<void> {
  const id = await meId();
  if (!id) return;
  await markAllRead(id);
  revalidatePath("/", "layout");
}

export async function markReadAction(notifId: string): Promise<void> {
  const id = await meId();
  if (!id) return;
  await markRead(id, notifId);
  revalidatePath("/", "layout");
}

export async function setMutedAction(muted: boolean): Promise<void> {
  const id = await meId();
  if (!id) return;
  await setMuted(id, muted);
  revalidatePath("/", "layout");
}
