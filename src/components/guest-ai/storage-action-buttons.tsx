"use client";

import { useState, useTransition } from "react";
import { validateGuestRequestAttachmentBucketAction } from "@/features/guest-ai-concierge/storage-bucket-actions";
import { runMetadataStripPendingAction } from "@/features/guest-ai-concierge/metadata-strip-actions";
import { runAttachmentCleanupAction } from "@/features/guest-ai-concierge/attachment-cleanup-actions";

export function ValidateBucketButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const out = await validateGuestRequestAttachmentBucketAction();
            if (out.ok) {
              setMessage(
                `Bucket: ${out.health.bucketExists}, private: ${out.health.bucketPrivate}, signed upload: ${out.health.signedUploadWorks}.`,
              );
            } else {
              setMessage(out.error);
            }
          });
        }}
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Checking…" : "Validate bucket"}
      </button>
      {message && <span className="text-[11px] text-ink-tertiary">{message}</span>}
    </div>
  );
}

export function StripPendingButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const out = await runMetadataStripPendingAction();
            if (out.ok) {
              setMessage(
                `Scanned ${out.scanned} · stripped ${out.succeeded} · failed ${out.failed} · warnings ${out.warnings}.`,
              );
            } else {
              setMessage(out.error);
            }
          });
        }}
        className="h-9 px-4 rounded-full border border-line-soft hover:border-line-strong text-xs"
      >
        {isPending ? "Stripping…" : "Strip pending metadata"}
      </button>
      {message && <span className="text-[11px] text-ink-tertiary">{message}</span>}
    </div>
  );
}

export function CleanupStaleButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const out = await runAttachmentCleanupAction();
            if (out.ok) {
              setMessage(
                `Scanned ${out.outcome.scanned} · deleted ${out.outcome.deleted} · failed ${out.outcome.failed}.`,
              );
            } else {
              setMessage(out.error);
            }
          });
        }}
        className="h-9 px-4 rounded-full border border-line-soft hover:border-line-strong text-xs"
      >
        {isPending ? "Cleaning…" : "Cleanup stale pending"}
      </button>
      {message && <span className="text-[11px] text-ink-tertiary">{message}</span>}
    </div>
  );
}
