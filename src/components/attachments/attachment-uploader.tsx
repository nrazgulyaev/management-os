"use client";

import { useState, useTransition } from "react";
import { Camera, Upload, AlertTriangle } from "lucide-react";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  type AttachmentTarget,
} from "@/features/attachments/schema";
import {
  createSignedUploadUrlAction,
  registerUploadedAttachmentAction,
} from "@/features/attachments/actions";

const ACCEPT = ALLOWED_MIME_TYPES.join(",");

type UploaderState = "idle" | "requesting" | "uploading" | "registering" | "done";

export function AttachmentUploader({
  target,
  targetId,
  attachmentType = "photo",
  label = "Upload photo",
  variant = "internal",
}: {
  target: AttachmentTarget;
  targetId: string;
  attachmentType?: "photo" | "receipt" | "video" | "document" | "other";
  label?: string;
  variant?: "internal" | "field";
}) {
  const [state, setState] = useState<UploaderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError(`Unsupported file type: ${file.type || "unknown"}.`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB; limit is ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`,
      );
      return;
    }

    // Step 1: ask the server for a signed upload URL.
    setState("requesting");
    const fd = new FormData();
    fd.set("target", target);
    fd.set("targetId", targetId);
    fd.set("fileName", file.name);
    fd.set("mimeType", file.type);
    fd.set("sizeBytes", String(file.size));
    fd.set("attachmentType", attachmentType);

    const requested = await createSignedUploadUrlAction(null, fd);
    if (!requested.ok) {
      setError(requested.error);
      setState("idle");
      return;
    }
    const { signedUrl, attachmentId } = requested as {
      signedUrl: string;
      attachmentId: string;
    };

    // Step 2: upload the bytes via PUT to the signed URL.
    setState("uploading");
    setProgress(0);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
        });
        xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
        xhr.addEventListener("abort", () => reject(new Error("Upload aborted.")));
        xhr.open("PUT", signedUrl);
        // Supabase expects the content-type the bytes were uploaded with.
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("Cache-Control", "max-age=3600");
        xhr.send(file);
      });
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
      return;
    }

    // Step 3: tell the server the row is now uploaded.
    setState("registering");
    startTransition(async () => {
      const reg = new FormData();
      reg.set("attachmentId", attachmentId);
      const res = await registerUploadedAttachmentAction(null, reg);
      if (!res.ok) {
        setError(res.error);
        setState("idle");
        return;
      }
      setState("done");
    });
  };

  const sizeClass = variant === "field" ? "h-12" : "h-10";

  return (
    <div className="flex flex-col gap-2">
      <label className={`inline-flex items-center justify-center gap-2 rounded-sm border border-line-soft bg-surface px-4 ${sizeClass} text-sm cursor-pointer hover:bg-muted transition-colors`}>
        {attachmentType === "photo" ? (
          <Camera className="w-4 h-4" strokeWidth={1.75} />
        ) : (
          <Upload className="w-4 h-4" strokeWidth={1.75} />
        )}
        <span>{label}</span>
        <input
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          disabled={state !== "idle" && state !== "done"}
          className="hidden"
        />
      </label>

      {state === "uploading" && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] text-ink-tertiary tabular-nums">{progress}%</span>
        </div>
      )}
      {state === "registering" && (
        <p className="text-xs text-ink-tertiary">
          {isPending ? "Saving…" : "Saving…"}
        </p>
      )}
      {state === "done" && (
        <p className="text-xs text-success">Uploaded. Refresh to see the gallery.</p>
      )}
      {error && (
        <div className="flex items-start gap-2 text-xs text-danger">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-[1px]" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}
      <p className="text-[10px] text-ink-tertiary">
        JPG / PNG / WEBP / PDF · up to {Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.
      </p>
    </div>
  );
}
