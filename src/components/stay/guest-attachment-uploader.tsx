"use client";

import { useState, useTransition } from "react";
import {
  createGuestReplyAttachmentUploadAction,
  registerGuestReplyAttachmentUploadedAction,
  deleteGuestReplyAttachmentAction,
} from "@/features/guest-ai-concierge/attachments-actions";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_ATTACHMENTS_PER_REPLY,
  formatBytes,
} from "@/features/guest-ai-concierge/attachments-pure";
import { maybeResizeAttachment } from "@/components/guest-ai/client-image-resize";

interface UploadedFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: "uploading" | "uploaded" | "failed";
}

export function GuestAttachmentUploader({
  token,
  replyId,
  remainingSlots,
  onUploaded,
}: {
  token: string;
  replyId: string;
  remainingSlots: number;
  onUploaded?: (id: string) => void;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function pick(file: File) {
    setError(null);
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError("Only JPEG, PNG, WEBP, or PDF.");
      return;
    }
    if (files.length >= remainingSlots) {
      setError(`Max ${MAX_ATTACHMENTS_PER_REPLY} files per reply.`);
      return;
    }
    startTransition(async () => {
      // V9L: try a client-side resize for oversize images first.
      let candidate = file;
      if (file.size > MAX_FILE_BYTES) {
        const resized = await maybeResizeAttachment(file);
        if (!resized.ok) {
          if (resized.reason === "not_resizable_pdf") {
            setError(
              `PDF too large. Each file must be ≤ ${formatBytes(MAX_FILE_BYTES)}. Please compress and try again.`,
            );
          } else if (resized.reason === "still_too_large") {
            setError(
              `File too large. We tried to compress but couldn't keep it under ${formatBytes(MAX_FILE_BYTES)}. Please pick a smaller image.`,
            );
          } else {
            setError(
              `File too large. Each file must be ≤ ${formatBytes(MAX_FILE_BYTES)}.`,
            );
          }
          return;
        }
        candidate = resized.file;
      }
      const issued = await createGuestReplyAttachmentUploadAction({
        token,
        replyId,
        fileName: candidate.name,
        mimeType: candidate.type,
        sizeBytes: candidate.size,
      });
      if (!issued.ok) {
        setError(issued.error);
        return;
      }
      const local: UploadedFile = {
        id: issued.attachmentId,
        fileName: candidate.name,
        sizeBytes: candidate.size,
        status: "uploading",
      };
      setFiles((prev) => [...prev, local]);
      // PUT the bytes to the signed URL.
      try {
        const resp = await fetch(issued.signedUrl, {
          method: "PUT",
          body: candidate,
          headers: { "content-type": candidate.type },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === issued.attachmentId
              ? { ...f, status: "failed" }
              : f,
          ),
        );
        setError("Upload failed. Please try again.");
        return;
      }
      const reg = await registerGuestReplyAttachmentUploadedAction({
        token,
        attachmentId: issued.attachmentId,
      });
      if (!reg.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === issued.attachmentId
              ? { ...f, status: "failed" }
              : f,
          ),
        );
        setError(reg.error ?? "Couldn't save the upload.");
        return;
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === issued.attachmentId
            ? { ...f, status: "uploaded" }
            : f,
        ),
      );
      onUploaded?.(issued.attachmentId);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteGuestReplyAttachmentAction({
        token,
        attachmentId: id,
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
      } else {
        setError(res.error ?? "Couldn't remove the file.");
      }
    });
  }

  const remaining = Math.max(0, remainingSlots - files.length);

  return (
    <div className="flex flex-col gap-2">
      <label
        className={`flex items-center justify-center gap-2 h-10 px-4 rounded-full border border-dashed border-line-soft bg-canvas text-xs text-ink-secondary cursor-pointer hover:border-line-strong ${
          remaining === 0 || isPending ? "opacity-60 cursor-not-allowed" : ""
        }`}
      >
        <input
          type="file"
          accept={ALLOWED_MIME_TYPES.join(",")}
          disabled={remaining === 0 || isPending}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
        {isPending
          ? "Uploading…"
          : `Attach photo or PDF · ${remaining} left · max ${formatBytes(MAX_FILE_BYTES)}`}
      </label>
      <p className="text-[10px] text-ink-tertiary">
        Allowed: JPEG, PNG, WEBP, PDF. We never share these images publicly —
        signed links expire in 10 minutes.
      </p>
      {error && <p className="text-[11px] text-danger">{error}</p>}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[11px]">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-line-soft bg-surface px-3 py-2"
            >
              <span className="truncate">
                {f.fileName} · {formatBytes(f.sizeBytes)}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`text-[10px] uppercase tracking-widest ${
                    f.status === "uploaded"
                      ? "text-success"
                      : f.status === "failed"
                        ? "text-danger"
                        : "text-ink-tertiary"
                  }`}
                >
                  {f.status}
                </span>
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  className="text-[10px] text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
                >
                  remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
