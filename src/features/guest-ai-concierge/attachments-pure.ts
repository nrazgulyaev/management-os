/**
 * Pure helpers for guest concierge attachments (v9K).
 *
 * No DB / no `server-only` import — every helper here is unit-testable
 * directly. The MIME / size constants are the single source of truth
 * for validation (zod schemas, server actions, the DB CHECK
 * constraint, and the guest-side max-size hint all read from these).
 *
 * Stays browser-bundle-safe so client uploaders can import the same
 * limits the server enforces — we deliberately don't `import` from
 * `node:crypto`. Uses `globalThis.crypto.randomUUID()` (Web Crypto)
 * with a stable fallback for ancient runtimes that lack it.
 */

function defaultUuid(): string {
  const g = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (g?.randomUUID) return g.randomUUID();
  // Last-resort fallback: build a v4-shape string from Math.random.
  // Acceptable here because the path is per-attachment, NOT a security
  // boundary — and the pure test suite injects a deterministic UUID.
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += "-";
      continue;
    }
    if (i === 14) {
      out += "4";
      continue;
    }
    if (i === 19) {
      out += hex[8 + Math.floor(Math.random() * 4)];
      continue;
    }
    out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

export const ATTACHMENT_BUCKET = "guest-request-attachments";

/**
 * Allowed MIME types for guest concierge attachments. Narrower than
 * the v6 task-attachment set — no video and no `image/jpg` alias.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

export const MAX_ATTACHMENTS_PER_REPLY = 3;

export const SIGNED_URL_TTL_SECONDS = 10 * 60; // 10 minutes

export const ALLOWED_VISIBILITY = ["guest_visible", "internal_only"] as const;
export type AttachmentVisibility = (typeof ALLOWED_VISIBILITY)[number];

export const ALLOWED_UPLOADER = ["guest", "staff"] as const;
export type AttachmentUploader = (typeof ALLOWED_UPLOADER)[number];

export const ALLOWED_STATUS = [
  "pending",
  "uploaded",
  "failed",
  "deleted",
] as const;
export type AttachmentStatus = (typeof ALLOWED_STATUS)[number];

export interface ValidationOutcome {
  ok: boolean;
  reason: string | null;
}

/**
 * Pure: validate the guest-supplied file metadata before we mint a
 * signed upload URL. We do not see the bytes — the guest uploads
 * directly to storage — so this is a soft gate; the `register`
 * step also re-checks `size_bytes` against what storage reports.
 */
export function validateAttachmentMetadata(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): ValidationOutcome {
  if (!input.fileName || input.fileName.trim().length === 0) {
    return { ok: false, reason: "empty_file_name" };
  }
  if (input.fileName.length > 255) {
    return { ok: false, reason: "file_name_too_long" };
  }
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType as AllowedMimeType)) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  if (
    !Number.isFinite(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > MAX_FILE_BYTES
  ) {
    return { ok: false, reason: "size_out_of_range" };
  }
  return { ok: true, reason: null };
}

/**
 * Pure: sanitise an arbitrary file name for storage. Same rule as
 * v6's `sanitizeFilename` but inlined here so the AI context builder
 * (which the migration test grep ban-lists) can't accidentally pull
 * in the v6 storage module.
 *
 * Replaces non-alphanumeric runs with `-`, lowercases, clamps the
 * stem to 80 chars and the extension to 8 chars.
 */
export function sanitizeAttachmentFilename(name: string): string {
  const cleaned = (name ?? "").replace(/[ -]/g, "").trim();
  const lastSlash = Math.max(
    cleaned.lastIndexOf("/"),
    cleaned.lastIndexOf("\\"),
  );
  const baseRaw =
    lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
  const dot = baseRaw.lastIndexOf(".");
  const ext = dot > 0 ? baseRaw.slice(dot + 1).toLowerCase() : "";
  const base =
    (dot > 0 ? baseRaw.slice(0, dot) : baseRaw)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file";
  const safeExt = ext.replace(/[^a-z0-9]+/g, "").slice(0, 8);
  return safeExt ? `${base}.${safeExt}` : base;
}

/**
 * Pure: build the canonical storage path for a guest-concierge
 * attachment.
 *
 *   handoffs/{handoffId}/replies/{replyId}/{yyyy-mm}/{uuid}-{safeFile}
 *
 * The `{handoffId}` prefix lets storage policies scope cheaply by
 * prefix later. `randomUUID` keeps two simultaneous uploads of
 * `photo.jpg` from colliding.
 */
export function buildAttachmentStoragePath(args: {
  handoffId: string;
  replyId: string;
  fileName: string;
  now?: Date;
  uuid?: () => string;
}): string {
  const now = args.now ?? new Date();
  const yyyymm = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  const safe = sanitizeAttachmentFilename(args.fileName);
  const id = args.uuid ? args.uuid() : defaultUuid();
  return `handoffs/${args.handoffId}/replies/${args.replyId}/${yyyymm}/${id}-${safe}`;
}

/**
 * Pure: filter a list of attachment rows down to the guest-visible
 * projection. Drops:
 *   - any `internal_only` row
 *   - any row where `upload_status !== 'uploaded'` (still pending /
 *     failed / deleted)
 *
 * Intentionally does NOT carry the storage path through. The
 * projection caller is responsible for substituting the
 * (short-lived) signed download URL.
 */
export interface AttachmentSnapshot {
  id: string;
  visibility: AttachmentVisibility;
  uploadStatus: AttachmentStatus;
  uploadedByType: AttachmentUploader;
  fileName: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
}

export function filterGuestVisibleAttachments<T extends AttachmentSnapshot>(
  rows: ReadonlyArray<T>,
): T[] {
  return rows.filter(
    (a) =>
      a.visibility === "guest_visible" && a.uploadStatus === "uploaded",
  );
}

export function maxAttachmentsLeft(
  rows: ReadonlyArray<{ uploadStatus: AttachmentStatus }>,
): number {
  const counted = rows.filter(
    (a) => a.uploadStatus === "pending" || a.uploadStatus === "uploaded",
  ).length;
  return Math.max(0, MAX_ATTACHMENTS_PER_REPLY - counted);
}

/**
 * Pure: format a byte count for the guest-side hint. We never need
 * exact bytes in the UI; "2.4 MB" / "812 KB" / "117 B" is enough.
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Pure: simple file extension picker for icon / preview decisions.
 * Returns lowercased extension without the dot; "" when none.
 */
export function fileExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i < 0) return "";
  return fileName.slice(i + 1).toLowerCase();
}
