"use client";

import * as React from "react";
import { Camera, MapPin, WifiOff, Wifi } from "lucide-react";
import {
  PhotoCapture,
  GeoCheckIn,
  type CapturedPhoto,
  type GeoFix,
} from "@/components/ui/primitives";
import {
  queueOfflinePhoto,
  requestBackgroundSync,
  drainPendingPhotos,
  getPendingPhotos,
} from "@/lib/development/client/offline-queue";

/**
 * Stage 11.B.2 — Field-task capture block.
 *
 * Wraps the Stage 10.D `<PhotoCapture>` + `<GeoCheckIn>` primitives
 * into a single capture surface for field-staff working on a task.
 * Captured photos go straight to the IndexedDB offline queue (Stage
 * 5.I `queueOfflinePhoto`), tagged with `taskId` + the most recent
 * geo fix. A client-side drain (`drainPendingPhotos`) uploads them to
 * the task-attachment endpoint on mount + on every `online` event, and
 * immediately when a photo is captured while online — deleting each from
 * IndexedDB only on a 2xx. (The SW background-sync is a secondary retry
 * path.) Before this fix the photos store had no consumer and offline
 * captures were stranded forever.
 *
 * GeoCheckIn renders only when `anchor` is provided (villa.coordinates
 * populated); otherwise a friendly "geo check-in not configured for
 * this villa" hint replaces it.
 *
 * No live mutation server-actions here — everything queues locally.
 * The drain is the I/O layer.
 */

export interface FieldCaptureBlockProps {
  taskId: string;
  villaId: string | null;
  /** From villas.coordinates (Stage 11.B.1). NULL when not configured. */
  villaAnchor: { lat: number; lng: number } | null;
  villaLabel: string;
  /** Tolerance in meters for the GeoCheckIn match. Default 100m. */
  toleranceM?: number;
}

export function FieldCaptureBlock({
  taskId,
  villaId,
  villaAnchor,
  villaLabel,
  toleranceM = 100,
}: FieldCaptureBlockProps) {
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [lastFix, setLastFix] = React.useState<GeoFix | null>(null);
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    null,
  );
  const [isOnline, setIsOnline] = React.useState(true);

  // Upload any photos stranded in IndexedDB (from this or a prior session) and
  // sync the queued badge to what's actually still pending. This is the client
  // consumer of the offline photo queue — the audit found photos were never
  // drained, so they were lost forever. Deletes only happen on a 2xx.
  const drain = React.useCallback(async () => {
    const result = await drainPendingPhotos();
    setQueuedCount(result.remaining);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    // Seed the badge from IndexedDB, then drain anything stranded if online.
    void getPendingPhotos()
      .then((p) => setQueuedCount(p.length))
      .catch(() => {});
    if (navigator.onLine) void drain();
    const onOnline = () => {
      setIsOnline(true);
      void drain();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [drain]);

  async function onPhotoCapture(photo: CapturedPhoto) {
    setErrorMessage(null);
    setPhotos((prev) => [...prev, photo]);
    if (!photo.file) {
      setErrorMessage(
        "Photo could not be queued (no file blob). Try re-capturing.",
      );
      return;
    }
    try {
      await queueOfflinePhoto({
        blob: photo.file,
        metadata: {
          taskId,
          villaId: villaId ?? undefined,
          description: photo.caption,
          geo: lastFix
            ? {
                lat: lastFix.lat,
                lng: lastFix.lng,
                accuracy_m: lastFix.accuracyM,
              }
            : undefined,
        },
      });
      setQueuedCount((c) => c + 1);
      // If online, upload immediately (client drain). Otherwise register a
      // background-sync so the SW retries when connectivity returns.
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void drain();
      } else {
        try {
          await requestBackgroundSync();
        } catch {
          // browser doesn't support sync — drain runs on the next `online` event.
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Queue failed: ${err.message}`
          : "Queue failed",
      );
    }
  }

  function onPhotoRemove(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    // Note: the IndexedDB photo entry is intentionally NOT removed —
    // once queued, the offline drain owns the lifecycle. Removing from
    // local state just hides it from this session's UI.
  }

  function onCheckIn(fix: GeoFix, withinTolerance: boolean) {
    setLastFix(fix);
    if (!withinTolerance) {
      setErrorMessage(
        `You're not within ${toleranceM}m of ${villaLabel}. Photos will still be tagged with your actual location.`,
      );
    } else {
      setErrorMessage(null);
    }
  }

  return (
    <section className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera
            className="w-4 h-4 text-ink-secondary"
            strokeWidth={1.75}
          />
          <span className="text-label">Capture</span>
        </div>
        <span
          className={
            "inline-flex items-center gap-1.5 text-[11px] " +
            (isOnline ? "text-ink-tertiary" : "text-warning")
          }
        >
          {isOnline ? (
            <Wifi className="w-3 h-3" strokeWidth={1.75} />
          ) : (
            <WifiOff className="w-3 h-3" strokeWidth={1.75} />
          )}
          {isOnline
            ? `${queuedCount} queued`
            : `Offline · ${queuedCount} queued, will sync`}
        </span>
      </header>

      {villaAnchor ? (
        <GeoCheckIn
          anchor={villaAnchor}
          toleranceM={toleranceM}
          onCheckIn={onCheckIn}
          label={`Check in at ${villaLabel}`}
        />
      ) : (
        <div className="rounded-md border border-dashed border-line-soft bg-muted/20 p-3 flex items-start gap-2">
          <MapPin
            className="w-4 h-4 text-ink-tertiary mt-0.5 shrink-0"
            strokeWidth={1.75}
          />
          <p className="text-xs text-ink-secondary leading-relaxed">
            Geo check-in is not configured for this villa. Ask your
            workspace admin to set the villa coordinates so photos can
            be auto-tagged with proximity.
          </p>
        </div>
      )}

      <PhotoCapture
        photos={photos}
        onPhotoCapture={onPhotoCapture}
        onPhotoRemove={onPhotoRemove}
        label="Add photo"
      />

      {errorMessage && (
        <p className="text-xs text-warning leading-relaxed">
          {errorMessage}
        </p>
      )}

      <p className="text-[11px] text-ink-tertiary leading-relaxed">
        Photos are saved to your device first + uploaded automatically
        when you&apos;re back online. Closing the page or losing
        connection won&apos;t lose your captures.
      </p>
    </section>
  );
}
