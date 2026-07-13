import { requireRole } from "@/lib/auth";
import { getBranchGeofence } from "@/lib/geofence";
import { PageHeader } from "@/components/ui";
import { GeoCheckClient } from "./geo-check-client";

export const dynamic = "force-dynamic";

// Standalone location self-test — a shareable URL a coach or the client can open
// on their phone to confirm the geofence works before relying on it.
export default async function GeoCheckPage() {
  const me = await requireRole("coach");
  const gf = await getBranchGeofence(me.branch_id ?? null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Location self-test"
        description="Confirm your phone will pass the on-site check-in geofence."
      />
      <GeoCheckClient
        geofence={{ enabled: gf.enabled, lat: gf.lat, lng: gf.lng, radiusM: gf.radiusM, required: gf.required }}
      />
    </div>
  );
}
