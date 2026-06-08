"use client";

import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui";

export function SignOutButton() {
  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/login");
  }
  return (
    <button onClick={signOut} className={buttonClass("ghost", "w-full justify-start")}>
      Sign out
    </button>
  );
}
