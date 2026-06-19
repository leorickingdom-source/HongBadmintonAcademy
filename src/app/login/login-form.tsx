"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { APP_NAME } from "@/lib/constants";
import { Feather } from "lucide-react";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Full reload so middleware picks up the new session cookie + role-routes.
    window.location.assign(next);
  }

  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white">
          <Feather className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{APP_NAME}</h1>
        <p className="text-sm text-slate-500">Management System — sign in</p>
      </div>

      {!configured && (
        <div className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          Supabase is not configured yet. Add your project URL and keys to{" "}
          <code>.env.local</code>, then restart. See <code>README.md</code>.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Password" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading || !configured}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        Demo: admin@hba.test / coach1@hba.test / parent1@hba.test — Password123!
      </p>
    </Card>
  );
}
