import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ATTACHMENT_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "./attachments-pure";

/**
 * Server-only Storage helpers for guest concierge attachments. The
 * bucket name is private to this module — callers pass `storagePath`
 * only. We never expose `storage_path` outside the server.
 */

export interface SignedUploadHandle {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
}

export async function createSignedUploadToken(
  storagePath: string,
): Promise<SignedUploadHandle | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error(
      "[guest-ai/attachments] createSignedUploadUrl failed",
      error?.message,
    );
    return null;
  }
  return {
    bucket: ATTACHMENT_BUCKET,
    path: storagePath,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}

export interface SignedDownloadHandle {
  url: string;
  expiresAt: Date;
}

export async function createSignedDownloadUrl(
  storagePath: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<SignedDownloadHandle | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  };
}

export async function deleteStorageObject(
  storagePath: string,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .remove([storagePath]);
  return !error;
}
