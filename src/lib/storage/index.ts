import "server-only";

import { DryRunStorageProvider } from "./dry-run";
import { SupabaseStorageProvider } from "./supabase";
import type { StorageProvider } from "./types";

export type { StorageProvider, StorageDownload, SignedUrlOptions } from "./types";
export { StorageUnavailableError } from "./types";

let cached: StorageProvider | null = null;

/**
 * Returns the configured storage provider for the current process.
 *
 * Today: Supabase when admin key is present, otherwise dry-run. The
 * architecture doc commits to a Cloudflare R2 implementation in a
 * later stage — adding it is a one-file change here.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const supabase = new SupabaseStorageProvider();
  cached = supabase.isAvailable() ? supabase : new DryRunStorageProvider();
  return cached;
}

/** Test seam — allows specs to inject a fake provider. */
export function _setStorageProviderForTest(provider: StorageProvider | null): void {
  cached = provider;
}
