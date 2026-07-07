"use client";

import { useCallback, useEffect, useState } from "react";

type State = { configured?: boolean; ready?: boolean; dataUrl?: string | null; error?: string };

// Shows the WhatsApp worker's link status + QR (polled from /api/admin/wa-qr,
// which proxies the worker server-side). QR rotates, so we refresh every 12s.
// When linked, super admins can "Disconnect & re-link" to swap the number.
export function WaLinkPanel() {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/wa-qr", { cache: "no-store" });
      const j = await r.json();
      setSt(j);
    } catch {
      setSt({ configured: true, ready: false, dataUrl: null, error: "unreachable" });
    }
  }, []);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (live) await load();
    };
    tick();
    const t = setInterval(tick, 12000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [load]);

  async function disconnect() {
    if (
      !confirm(
        "Disconnect the current WhatsApp number? Sending stops until a new number is linked by scanning the QR.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/wa-logout", { method: "POST" });
      if (!r.ok) throw new Error();
      setSt({ configured: true, ready: false, dataUrl: null }); // optimistic — QR appears shortly
      await load();
    } catch {
      alert("Couldn't disconnect — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (st === null) {
    return <div className="p-5 text-sm text-slate-500">Checking WhatsApp connection…</div>;
  }
  if (st.configured === false) {
    return (
      <div className="p-5 text-sm text-slate-600">
        Worker not configured. Set <code className="rounded bg-slate-100 px-1.5 py-0.5">WA_WORKER_URL</code> and{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5">WA_WORKER_SECRET</code> in Vercel.
      </div>
    );
  }
  if (st.ready) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          <span className="font-medium text-green-700">WhatsApp connected</span>
          <span className="text-slate-500">— the worker is linked and can send.</span>
        </div>
        <div>
          <button
            onClick={disconnect}
            disabled={busy}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            {busy ? "Disconnecting…" : "Disconnect & re-link"}
          </button>
          <p className="mt-1.5 text-xs text-slate-400">
            Unlinks the current number and shows a QR to link a new one — for handing the worker to a new super admin.
            Sending pauses until re-linked.
          </p>
        </div>
      </div>
    );
  }
  if (st.dataUrl) {
    return (
      <div className="flex flex-col items-center gap-3 p-5 text-center">
        <p className="text-sm text-slate-700">
          Scan to link the dedicated number: phone → WhatsApp → <b>Settings → Linked devices → Link a device</b>
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={st.dataUrl} alt="WhatsApp QR code" width={260} height={260} className="rounded-lg border border-slate-200" />
        <p className="text-xs text-slate-400">QR rotates — this refreshes automatically every 12s.</p>
      </div>
    );
  }
  return (
    <div className="p-5 text-sm text-amber-700">
      Worker reachable but no QR yet — it may be starting up or already linking. If this persists, restart the worker.
      {st.error ? <span className="text-slate-400"> ({st.error})</span> : null}
    </div>
  );
}
