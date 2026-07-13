"use client";

import { useState } from "react";
import { MapPin, LocateFixed, Loader2 } from "lucide-react";
import { Field, Input, cn } from "@/components/ui";

interface Props {
  defaultEnabled: boolean;
  defaultRequired: boolean;
  defaultRadius: number;
  defaultLat: number | null;
  defaultLng: number | null;
}

// Per-branch check-in geofence editor, embedded in the branch "Edit details"
// form (posts with the surrounding <form action={updateBranch}>). The headline
// feature: "Use my current location" — a super-admin standing in the hall taps
// it on their phone and the venue coordinate is captured with no map lookups.
export function BranchGeofenceFields({
  defaultEnabled,
  defaultRequired,
  defaultRadius,
  defaultLat,
  defaultLng,
}: Props) {
  const [lat, setLat] = useState<string>(defaultLat != null ? String(defaultLat) : "");
  const [lng, setLng] = useState<string>(defaultLng != null ? String(defaultLng) : "");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasCoords = lat.trim() !== "" && lng.trim() !== "";

  function useCurrentLocation() {
    setErr(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("This device/browser can't share a location.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setAccuracy(Math.round(p.coords.accuracy));
        setBusy(false);
      },
      (e) => {
        setErr(
          e.code === e.PERMISSION_DENIED
            ? "Location permission denied — allow it in the browser and retry."
            : "Couldn't get a location fix. Try again outdoors / near a window.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <MapPin className="h-4 w-4 text-emerald-600" /> Check-in geofence
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="geofence_enabled" defaultChecked={defaultEnabled} className="h-4 w-4" />
        Require coaches to be on-site to check in
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="geofence_required" defaultChecked={defaultRequired} className="h-4 w-4" />
        Block check-in when the coach won&apos;t share a location
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white",
            "hover:bg-emerald-700 disabled:opacity-60",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          Use my current location
        </button>
        {hasCoords && (
          <a
            href={`https://maps.google.com/?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-700 underline"
          >
            View on map
          </a>
        )}
        {accuracy != null && <span className="text-xs text-slate-500">±{accuracy} m accuracy</span>}
      </div>

      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Latitude">
          <Input
            name="lat"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="3.1390"
          />
        </Field>
        <Field label="Longitude">
          <Input
            name="lng"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="101.6869"
          />
        </Field>
        <Field label="Radius (m)">
          <Input name="geofence_radius_m" type="number" min={20} max={5000} defaultValue={defaultRadius} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Leave latitude/longitude blank to turn the fence off. Radius covers GPS drift — 150–300 m suits a single venue.
      </p>
    </div>
  );
}
