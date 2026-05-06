import "server-only";

import type {
  SignedUrlOptions,
  StorageDownload,
  StorageProvider,
} from "./types";

/**
 * Dry-run storage provider — used in tests and when no admin key is set.
 *
 * `createSignedUrl` returns a marker string; `download` returns a tiny
 * synthetic JPEG so the photo analyst can be exercised without the
 * Supabase admin key.
 */

// 1×1 pixel transparent PNG, base64-decoded once at import.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export class DryRunStorageProvider implements StorageProvider {
  readonly name = "dry-run";

  isAvailable(): boolean {
    return true;
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    _options?: SignedUrlOptions,
  ): Promise<string | null> {
    return `dry-run://${bucket}/${path}`;
  }

  async download(
    _bucket: string,
    _path: string,
  ): Promise<StorageDownload | null> {
    return { bytes: TINY_PNG, contentType: "image/png" };
  }
}
