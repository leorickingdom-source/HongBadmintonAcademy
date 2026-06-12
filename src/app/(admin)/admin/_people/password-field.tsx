"use client";

import { useState } from "react";
import { Input } from "@/components/ui";

// Password input with a show/hide toggle, so an admin can see exactly what
// they're setting before creating the account (a masked typo silently created
// accounts with an unrecoverable password).
export function PasswordField({ required }: { required?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        name="password"
        autoComplete="new-password"
        required={required}
        className="pr-16"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-slate-500 hover:text-slate-800"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
