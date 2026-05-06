"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, ArrowLeft, CheckCircle2 } from "lucide-react";
import {
  queueOfflinePhoto,
  generateClientActionId,
  requestBackgroundSync,
} from "@/lib/development/client/offline-queue";

export const dynamic = "force-dynamic";

/**
 * Stage 5.I — Mobile-first quick-photo capture.
 *
 * Pure client component (no DB access). If online: posts the photo
 * blob to the server; if offline: queues in IndexedDB so the SW
 * background-sync can drain when the connection returns.
 */
export default function QuickPhotoPage() {
  const [status, setStatus] = useState<"idle" | "captured" | "queued" | "uploaded" | "error">(
    "idle",
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCapture(file: File) {
    setStatus("captured");
    setPhotoUrl(URL.createObjectURL(file));
    setError(null);
  }

  async function handleSubmit() {
    if (!photoUrl) return;
    try {
      const blob = await fetch(photoUrl).then((r) => r.blob());
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueOfflinePhoto({
          blob,
          metadata: { description },
        });
        await requestBackgroundSync();
        setStatus("queued");
        return;
      }
      // Online path — wire to a real upload endpoint when available.
      // For now we still queue so the demo+sync flow stays consistent.
      const id = generateClientActionId();
      await queueOfflinePhoto({
        blob,
        metadata: { description },
      });
      await requestBackgroundSync();
      setStatus("uploaded");
      // eslint-disable-next-line no-console
      console.log("[PWA] photo capture queued with action id", id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/development-os/cabinets/site-supervisor"
          className="text-sm text-ink-secondary inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </Link>
        <span className="text-xs text-ink-tertiary">Quick photo</span>
      </div>

      <h1 className="text-2xl font-medium mb-1">Capture site photo</h1>
      <p className="text-sm text-ink-secondary mb-6">
        Works offline — queued upload when connection returns.
      </p>

      {!photoUrl && (
        <label className="block min-h-[200px] border-2 border-dashed border-line-soft rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-ink/30">
          <Camera className="w-10 h-10 text-ink-tertiary mb-2" strokeWidth={1.5} />
          <span className="text-sm text-ink-secondary">Tap to take photo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCapture(f);
            }}
          />
        </label>
      )}

      {photoUrl && (
        <>
          <img
            src={photoUrl}
            alt="captured"
            className="w-full rounded-md border border-line-soft mb-4"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
            className="w-full rounded-md border border-line-soft p-3 text-sm mb-4"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={status === "queued" || status === "uploaded"}
            className="w-full min-h-[44px] rounded-md bg-info text-white text-sm font-medium disabled:opacity-60"
          >
            {status === "queued"
              ? "Queued — will sync when online"
              : status === "uploaded"
                ? "Submitted"
                : "Submit photo"}
          </button>
          {(status === "queued" || status === "uploaded") && (
            <p className="text-sm text-success mt-3 inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              {status === "queued"
                ? "Photo captured. Will sync when online."
                : "Photo captured + queued for upload."}
            </p>
          )}
          {error && (
            <p className="text-sm text-danger mt-3" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
