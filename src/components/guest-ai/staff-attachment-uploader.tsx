"use client";

import { useState, useTransition } from "react";
import {
  createStaffReplyAttachmentUploadAction,
  registerStaffReplyAttachmentUploadedAction,
  deleteStaffReplyAttachmentAction,
} from "@/features/guest-ai-concierge/attachments-actions";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_ATTACHMENTS_PER_REPLY,
  formatBytes,
} from "@/features/guest-ai-concierge/attachments-pure";

interface StaffUploadedFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  visibility: "guest_visible" | "internal_only";
  status: "uploading" | "uploaded" | "failed";
}

export function StaffAttachmentUploader({
  handoffId,
  replyId,
  remainingSlots,
  visibility,
  onUploaded,
}: {
  handoffId: string;
  replyId: string;
  remainingSlots: number;
  visibility: "guest_visible" | "internal_only";
  onUploaded?: (id: string) => void;
}) {
  const [files, setFiles] = useState<StaffUploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const remaining = Math.max(0, remainingSlots - files.length);

  function pick(file: File) {
    setError(null);
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError("Only JPEG, PNG, WEBP, or PDF.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Each file must be ≤ ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    if (remaining === 0) {
      setError(`Max ${MAX_ATTACHMENTS_PER_REPLY} files per reply.`);
      return;
    }
    startTransition(async () => {
      const issued = await createStaffReplyAttachmentUploadAction({
        handoffId,
        replyId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        visibility,
      });
      if (!issued.ok) {
        setError(issued.error);
        return;
      }
      const local: StaffUploadedFile = {
        id: issued.attachmentId,
        fileName: file.name,
        sizeBytes: file.size,
        visibility,
        status: "uploading",
      };
      setFiles((prev) => [...prev, local]);
      try {
        const resp = await fetch(issued.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type },
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
      const reg = await registerStaffReplyAttachmentUploadedAction({
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
      const res = await deleteStaffReplyAttachmentAction({
        attachmentId: id,
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
      } else {
        setError(res.error ?? "Couldn't remove the file.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        className={`flex items-center justify-center gap-2 h-9 px-4 rounded-full border border-dashed border-line-soft bg-surface text-xs text-ink-secondary cursor-pointer hover:border-line-strong ${
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
          : `Attach ${visibility === "internal_only" ? "(internal)" : ""} · ${remaining} left`}
      </label>
      {error && <p className="text-[11px] text-danger">{error}</p>}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[11px]">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-line-soft bg-canvas px-3 py-2"
            >
              <span className="truncate flex items-center gap-2">
                {f.visibility === "internal_only" && (
                  <span className="text-[10px] uppercase tracking-widest text-warning">
                    internal
                  </span>
                )}
                <span>
                  {f.fileName} · {formatBytes(f.sizeBytes)}
                </span>
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
