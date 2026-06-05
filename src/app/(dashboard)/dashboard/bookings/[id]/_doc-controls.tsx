"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  uploadDocumentAction,
  getDocumentSignedUrlAction,
} from "@/features/storage/storage-actions";

export function UploadDocButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("entityType", "booking");
    fd.set("entityId", bookingId);
    fd.set("title", file.name);
    fd.set("documentType", "other");
    start(async () => {
      const res = await uploadDocumentAction(fd);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Upload failed");
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title={error ?? undefined}
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
    </>
  );
}

export function PrintFolioButton() {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => window.print()}
      title="Print / save the booking detail as PDF"
    >
      Print folio
    </button>
  );
}

export function DocViewButton({
  documentId,
  hasFile,
}: {
  documentId: string;
  hasFile: boolean;
}) {
  const [pending, start] = React.useTransition();

  if (!hasFile) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm opacity-50 cursor-not-allowed"
        disabled
        title="No stored file (demo metadata only)"
      >
        View
      </button>
    );
  }

  function open() {
    start(async () => {
      const res = await getDocumentSignedUrlAction(documentId);
      if (res.ok && res.signedUrl) {
        window.open(res.signedUrl, "_blank", "noopener");
      }
    });
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={open} disabled={pending}>
      {pending ? "…" : "View"}
    </button>
  );
}
