/**
 * Stage 10.B — GeoCheckIn primitive.
 *
 * GPS-stamped action button. On press: requests browser geolocation,
 * compares against an expected anchor (villa coordinates) within a
 * tolerance radius, surfaces match / mismatch / off-network. Returns
 * the captured fix to the parent for posting.
 *
 * Used by: 10.D Cleaner turnover start, 10.F PM site report anchor,
 * 10.K Front Office floor patrols.
 *
 * Reference patterns: Procore site-anchor, Hostaway property GPS
 * (research-summary.md theme 1 + reference-apps/project-manager.md).
 *
 * Client component (Geolocation API).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MapPin, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: string;
}

export interface GeoCheckInProps {
  /** Expected anchor in lat/lng. If absent, any fix is accepted. */
  anchor?: { lat: number; lng: number };
  /** Tolerance radius in meters; default 100m. */
  toleranceM?: number;
  onCheckIn: (fix: GeoFix, withinTolerance: boolean) => void;
  label?: string;
  className?: string;
}

type Phase = "idle" | "locating" | "matched" | "mismatched" | "error";

export function GeoCheckIn({
  anchor,
  toleranceM = 100,
  onCheckIn,
  label = "Check in",
  className,
}: GeoCheckInProps) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [fix, setFix] = React.useState<GeoFix | null>(null);
  const [distanceM, setDistanceM] = React.useState<number | null>(null);

  function checkIn() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPhase("error");
      return;
    }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const f: GeoFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
        };
        setFix(f);
        let withinTolerance = true;
        if (anchor) {
          const d = haversineM(f.lat, f.lng, anchor.lat, anchor.lng);
          setDistanceM(d);
          withinTolerance = d <= toleranceM;
          setPhase(withinTolerance ? "matched" : "mismatched");
        } else {
          setPhase("matched");
        }
        onCheckIn(f, withinTolerance);
      },
      () => setPhase("error"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={checkIn}
        disabled={phase === "locating"}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-sm border text-sm font-medium",
          phase === "matched"
            ? "bg-success-weak border-success/40 text-success"
            : phase === "mismatched"
              ? "bg-warning-weak border-warning/40 text-warning"
              : phase === "error"
                ? "bg-danger-weak border-danger/40 text-danger"
                : "bg-surface border-line-soft text-ink",
          "active:translate-y-[1px]",
        )}
      >
        {phase === "locating" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : phase === "error" || phase === "mismatched" ? (
          <AlertTriangle className="w-4 h-4" />
        ) : phase === "matched" ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <MapPin className="w-4 h-4" />
        )}
        {phase === "locating"
          ? "Locating…"
          : phase === "error"
            ? "Location unavailable"
            : phase === "matched"
              ? "Checked in"
              : phase === "mismatched"
                ? `Off-site (${Math.round(distanceM ?? 0)}m)`
                : label}
      </button>
      {fix && phase !== "error" && (
        <div className="text-xs text-ink-tertiary tabular-nums">
          {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} · ±{Math.round(fix.accuracyM)}m
          {distanceM != null && (
            <>
              {" · "}
              {Math.round(distanceM)}m from anchor (tolerance {toleranceM}m)
            </>
          )}
        </div>
      )}
      {phase === "error" && (
        <div className="text-xs text-danger">
          Could not get location. Check permissions + signal.
        </div>
      )}
    </div>
  );
}

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
