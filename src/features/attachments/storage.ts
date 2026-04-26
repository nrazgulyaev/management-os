import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ATTACHMENT_BUCKET, sanitizeFilename, type AttachmentTarget } from "./schema";

/**
 * Build the canonical storage path for an attachment. Path convention:
 *   tasks/{taskId}/{yyyy-mm}/{uuid}-{safeFilename}
 *   checklist-items/{itemId}/{yyyy-mm}/{uuid}-{safeFilename}
 *   maintenance/{ticketId}/{yyyy-mm}/{uuid}-{safeFilename}
 *
 * The leading directory differs per target so admin/storage policies can
 * scope cheaply by prefix later.
 */
export function buildStoragePath(
  target: AttachmentTarget,
  targetId: string,
  rawFileName: string,
  now: Date = new Date(),
): string {
  const yyyymm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const safe = sanitizeFilename(rawFileName);
  const id = randomUUID();
  const dir =
    target === "task"
      ? "tasks"
      : target === "checklist_item"
        ? "checklist-items"
        : "maintenance";
  return `${dir}/${targetId}/${yyyymm}/${id}-${safe}`;
}

export interface SignedUploadResult {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
}

/**
 * Mint a one-shot upload token for the bucket. Returns null when Supabase
 * Storage isn't configured — callers should treat that as graceful demo
 * mode and surface a "storage not configured" message.
 */
export async function createSignedUploadToken(
  path: string,
): Promise<SignedUploadResult | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadToken failed", error?.message);
    return null;
  }
  return {
    bucket: ATTACHMENT_BUCKET,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}

/**
 * Mint a short-lived signed download URL for an existing object. Returns
 * null when Storage isn't configured or the object doesn't exist.
 */
export async function createSignedDownloadUrl(
  path: string,
  expiresInSeconds: number = 60 * 10,
): Promise<{ url: string; expiresAt: Date } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

/**
 * Best-effort delete — the row in `task_attachments` is the source of truth;
 * if storage hasn't been wired we just skip.
 */
export async function deleteStorageObject(path: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { error } = await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
  return !error;
}

export { ATTACHMENT_BUCKET };
