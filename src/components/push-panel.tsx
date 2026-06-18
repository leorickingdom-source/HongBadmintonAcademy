"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import {
  savePushSubscription,
  removePushSubscription,
  sendTestPushToSelf,
} from "@/app/(admin)/admin/settings/push-actions";

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(safe);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

type Status =
  | { kind: "unsupported" }
  | { kind: "idle"; permission: NotificationPermission }
  | { kind: "subscribed"; endpoint: string }
  | { kind: "denied" };

export function PushPanel({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus({ kind: "unsupported" });
      return;
    }
    if (Notification.permission === "denied") {
      setStatus({ kind: "denied" });
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) setStatus({ kind: "subscribed", endpoint: sub.endpoint });
    else setStatus({ kind: "idle", permission: Notification.permission });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    if (!vapidPublicKey) {
      setMsg({ kind: "err", text: "VAPID public key missing on server." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg({ kind: "err", text: `Permission ${perm}.` });
        setStatus(perm === "denied" ? { kind: "denied" } : { kind: "idle", permission: perm });
        return;
      }
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
        }));
      const json = sub.toJSON();
      const r = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: (json.keys as any)?.p256dh ?? "",
        auth: (json.keys as any)?.auth ?? "",
        user_agent: navigator.userAgent,
      });
      if (!r.ok) {
        setMsg({ kind: "err", text: r.error ?? "Save failed." });
        return;
      }
      setStatus({ kind: "subscribed", endpoint: sub.endpoint });
      setMsg({ kind: "ok", text: "Enabled. Now hit “Send test”." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) await removePushSubscription(endpoint);
      setStatus({ kind: "idle", permission: Notification.permission });
      setMsg({ kind: "ok", text: "Disabled on this device." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendTestPushToSelf();
      if (r.ok)
        setMsg({
          kind: "ok",
          text: `Sent ${r.sent} push${r.sent > 1 ? "es" : ""}${r.failed ? ` (${r.failed} failed)` : ""}.`,
        });
      else setMsg({ kind: "err", text: r.error ?? "Send failed." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <div className="p-5 text-sm text-slate-400">Loading…</div>;

  if (status.kind === "unsupported") {
    return (
      <div className="p-5 text-sm text-slate-600">
        This browser does not support Web Push. Try Chrome (Android/desktop) or iOS Safari 16.4+ with HBA installed to your home screen.
      </div>
    );
  }

  if (status.kind === "denied") {
    return (
      <div className="p-5 text-sm text-slate-600">
        Notifications are <strong>blocked</strong> in your browser settings. Allow them for this site, then reload this page.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-5">
      <p className="text-sm text-slate-600">
        Test Web Push on this device. Subscribe once, then “Send test” fires a push to every device subscribed under your account.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status.kind === "subscribed" ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
              ● Subscribed
            </span>
            <button onClick={sendTest} disabled={busy} className={buttonClass("primary")}>
              {busy ? "Sending…" : "Send test push"}
            </button>
            <button onClick={disable} disabled={busy} className={buttonClass("secondary")}>
              Disable here
            </button>
          </>
        ) : (
          <button onClick={enable} disabled={busy} className={buttonClass("primary")}>
            {busy ? "Enabling…" : "Enable notifications"}
          </button>
        )}
      </div>
      {msg && (
        <div
          className={
            "rounded-lg border p-3 text-sm " +
            (msg.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700")
          }
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
