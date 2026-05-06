/**
 * Provider-agnostic storage interface.
 *
 * Today we use Supabase Storage. The architecture doc commits to a
 * future Cloudflare R2 migration for site photos. This abstraction
 * lets non-upload code (photo analyst, AI vision, signed-URL
 * generation for the gallery) call only `getStorageProvider()` and
 * stay portable across the migration.
 *
 * The existing `photo-upload-actions.ts` continues to talk to
 * `getSupabaseAdmin()` directly because it needs upload semantics
 * (resumable, content-type negotiation) that are provider-specific.
 * Stage 3.A scope: provide read-side abstraction (download, signed URL)
 * so the photo analyst is portable.
 */

export interface StorageDownload {
  bytes: Buffer;
  contentType: string;
}

export interface SignedUrlOptions {
  /** Seconds until the URL expires. Default 3600. */
  expirySeconds?: number;
}

export interface StorageProvider {
  readonly name: string;
  /** True when the underlying client is configured (admin key present). */
  isAvailable(): boolean;
  /** Returns a time-limited URL the browser (or Claude vision) can fetch. */
  createSignedUrl(
    bucket: string,
    path: string,
    options?: SignedUrlOptions,
  ): Promise<string | null>;
  /** Fetches bytes server-side. Used when we need to pass image data to Claude as base64. */
  download(bucket: string, path: string): Promise<StorageDownload | null>;
}

export class StorageUnavailableError extends Error {
  readonly providerName: string;
  constructor(providerName: string, reason: string) {
    super(reason);
    this.name = "StorageUnavailableError";
    this.providerName = providerName;
  }
}
