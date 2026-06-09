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
      {/* Carbon LIVE-CAPTURE header — matches the cabinet capture console */}
      <div className="flex items-center gap-3 rounded-[14px] bg-carbon px-4 py-3 text-white mb-5">
        <Link
          href="/development-os/cabinets/site-supervisor"
          className="inline-flex items-center gap-1 text-[13px] text-white/75 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back
        </Link>
        <span className="ml-auto mono text-[10.5px] tracking-[0.14em] text-amber">
          QUICK PHOTO
        </span>
      </div>

      <h1 className="display text-[26px] font-medium mb-1">Capture site photo</h1>
      <p className="text-[13px] text-ink-3 mb-6">
        Works offline — queued upload when connection returns.
      </p>

      {!photoUrl && (
        <label className="flex min-h-[220px] flex-col items-center justify-center cursor-pointer rounded-[14px] border-2 border-dashed border-line-2 bg-bg-2 hover:border-amber">
          <Camera className="w-10 h-10 text-amber mb-2.5" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-ink">Tap to take photo</span>
          <span className="mono mt-1 text-[10px] tracking-[0.12em] text-ink-4 uppercase">
            camera · environment
          </span>
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
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL preview, next/image doesn't support arbitrary blob URLs */}
          <img
            src={photoUrl}
            alt="captured"
            className="w-full rounded-[14px] border border-line-2 mb-4"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description…"
            rows={3}
            className="textarea mb-4"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={status === "queued" || status === "uploaded"}
            className="btn btn-amber w-full min-h-[48px]"
          >
            {status === "queued"
              ? "Queued — will sync when online"
              : status === "uploaded"
                ? "Submitted"
                : "Submit photo"}
          </button>
          {(status === "queued" || status === "uploaded") && (
            <p className="text-[13px] text-success mt-3 inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              {status === "queued"
                ? "Photo captured. Will sync when online."
                : "Photo captured + queued for upload."}
            </p>
          )}
          {error && (
            <p className="text-[13px] text-danger mt-3" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
