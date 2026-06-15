"use client";

/**
 * Wire-up (dev-OS engineering-doc lifecycles §4) — per-photo delete control
 * for the QA/QC photo gallery. `deleteQaQcPhoto` existed server-side but had
 * ZERO UI trigger, so site-evidence photos could never be removed.
 *
 * Posts to the co-located "use server" adapter (the gallery action file is
 * `server-only`). Confirm-gated; the server is the authority + now org-scoped.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteQaQcPhotoAction } from "./_photo-actions";

export function QaQcPhotoDeleteButton({
  photoId,
  issueCode,
}: {
  photoId: string;
  issueCode: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    if (!confirm("Delete this photo? This permanently removes the file and its record.")) {
      return;
    }
    setErr(null);
    start(async () => {
      const res = await deleteQaQcPhotoAction(photoId, issueCode);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        aria-label="Delete photo"
        title="Delete photo"
        className="inline-flex items-center gap-1 text-[10px] text-danger hover:underline disabled:opacity-50"
      >
        <Trash2 className="w-3 h-3" strokeWidth={1.75} />
        {pending ? "Deleting…" : "Delete"}
      </button>
      {err && <span className="block text-[10px] text-danger">{err}</span>}
    </>
  );
}
