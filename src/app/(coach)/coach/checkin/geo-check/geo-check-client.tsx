"use client";

import { useEffect, useState } from "react";
import { LocateFixed, Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { haversineMeters } from "@/lib/geo";

interface Geofence {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  required: boolean;
}

interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  distance: number | null;
  pass: boolean | null;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span
        className={cn(
          "font-medium",
          tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-slate-800",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// Standalone "will my phone pass the geofence?" tester. Reports the browser's
// support, permission state, and a live measured distance so a client can verify
// the setup on their own device before go-live.
export function GeoCheckClient({ geofence }: { geofence: Geofence }) {
  const [secure, setSecure] = useState<boolean | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<string>("unknown");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);

  useEffect(() => {
    setSecure(typeof window !== "undefined" && window.isSecureContext);
    setSupported(typeof navigator !== "undefined" && "geolocation" in navigator);
    (async () => {
      try {
        const p = await (navigator as Navigator & {
          permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> };
        }).permissions?.query({ name: "geolocation" as PermissionName });
        if (p) {
          setPerm(p.state);
          p.onchange = () => setPerm(p.state);
        }
      } catch {
        /* permissions API not available — leave "unknown" */
      }
    })();
  }, []);

  function run() {
    setErr(null);
    if (!navigator.geolocation) {
      setErr("This browser can't share a location.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        const accuracy = Math.round(p.coords.accuracy);
        let distance: number | null = null;
        let pass: boolean | null = null;
        if (geofence.enabled && geofence.lat != null && geofence.lng != null) {
          distance = Math.round(haversineMeters({ lat: geofence.lat, lng: geofence.lng }, { lat, lng }));
          pass = distance - accuracy <= geofence.radiusM;
        }
        setFix({ lat, lng, accuracy, distance, pass });
        setBusy(false);
      },
      (e) => {
        setErr(
          e.code === e.PERMISSION_DENIED
            ? "Permission denied — allow location for this site and retry."
            : "Couldn't get a fix. Move near a window / outdoors and retry.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <Card className="p-5">
        <div className="mb-2 text-sm font-semibold text-slate-700">Your device</div>
        <Row label="Secure connection (HTTPS)" value={secure ? "yes" : "no"} tone={secure ? "ok" : "bad"} />
        <Row label="Location supported" value={supported ? "yes" : "no"} tone={supported ? "ok" : "bad"} />
        <Row label="Permission" value={perm} tone={perm === "granted" ? "ok" : perm === "denied" ? "bad" : "muted"} />
      </Card>

      <Card className="p-5">
        <div className="mb-2 text-sm font-semibold text-slate-700">Your branch geofence</div>
        {geofence.enabled ? (
          <>
            <Row label="Status" value="active" tone="ok" />
            <Row label="Allowed radius" value={`${geofence.radiusM} m`} />
            <Row label="Location required to check in" value={geofence.required ? "yes" : "no"} tone="muted" />
          </>
        ) : (
          <Row label="Status" value="off (no venue location set)" tone="muted" />
        )}
      </Card>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white",
          "hover:bg-emerald-700 disabled:opacity-60",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
        Test my location
      </button>

      {err && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {fix && (
        <Card className="p-5">
          <div className="mb-2 text-sm font-semibold text-slate-700">Result</div>
          <Row label="Your position" value={`${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`} />
          <Row label="GPS accuracy" value={`±${fix.accuracy} m`} tone={fix.accuracy > 100 ? "bad" : "muted"} />
          {fix.distance != null && <Row label="Distance to venue" value={`${fix.distance} m`} />}
          {fix.pass != null ? (
            <div
              className={cn(
                "mt-3 flex items-center gap-2 rounded-lg p-3 text-sm font-semibold",
                fix.pass ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
              )}
            >
              {fix.pass ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {fix.pass ? "PASS — you'd be able to check in here." : "FAIL — you're outside the geofence."}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm font-medium text-slate-600">
              <MinusCircle className="h-5 w-5" /> No geofence to test against — check-in isn&apos;t location-gated.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
