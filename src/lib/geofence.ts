import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, isGeofenceConfigured } from "@/lib/env";

// The effective check-in geofence for a session's branch. `enabled` is true only
// when there's a real coordinate to measure against; `required` decides whether a
// missing device fix blocks the check-in. This is the single source of truth for
// both the server guard (board-actions) and the UI (coach chip, self-test).
export interface Geofence {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  required: boolean;
}

// Global default from env vars — used when a branch hasn't configured its own.
function envGeofence(): Geofence {
  return isGeofenceConfigured()
    ? {
        enabled: true,
        lat: env.academyLat,
        lng: env.academyLng,
        radiusM: env.geofenceRadiusM,
        required: env.geofenceRequired,
      }
    : { enabled: false, lat: null, lng: null, radiusM: env.geofenceRadiusM, required: false };
}

// Resolve the geofence for a branch: a branch that has opted in (geofence_enabled)
// with valid coordinates overrides the env default; otherwise the env default
// applies. A branch opted in but missing coordinates does NOT gate (we won't fall
// back to a possibly-distant academy coordinate) — it just carries no active fence.
export async function getBranchGeofence(branchId: string | null): Promise<Geofence> {
  const fallback = envGeofence();
  if (!branchId) return fallback;

  const db = createAdminClient();
  const { data } = await db
    .from("branches")
    .select("lat, lng, geofence_radius_m, geofence_enabled, geofence_required")
    .eq("id", branchId)
    .maybeSingle();

  if (!data || !data.geofence_enabled) return fallback;

  const hasCoords = Number.isFinite(data.lat) && Number.isFinite(data.lng);
  return {
    enabled: hasCoords,
    lat: hasCoords ? (data.lat as number) : null,
    lng: hasCoords ? (data.lng as number) : null,
    radiusM: data.geofence_radius_m ?? env.geofenceRadiusM,
    required: !!data.geofence_required,
  };
}
