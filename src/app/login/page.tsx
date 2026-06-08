import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
