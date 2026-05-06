import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  SignedUrlOptions,
  StorageDownload,
  StorageProvider,
} from "./types";

/**
 * Supabase Storage adapter — wraps the admin client.
 *
 * `isAvailable()` returns false when `SUPABASE_SERVICE_ROLE_KEY` is
 * unset; callers are expected to check before invoking.
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase";

  isAvailable(): boolean {
    return Boolean(getSupabaseAdmin());
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    options?: SignedUrlOptions,
  ): Promise<string | null> {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, options?.expirySeconds ?? 3600);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  async download(
    bucket: string,
    path: string,
  ): Promise<StorageDownload | null> {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return { bytes: buf, contentType: data.type || "application/octet-stream" };
  }
}
