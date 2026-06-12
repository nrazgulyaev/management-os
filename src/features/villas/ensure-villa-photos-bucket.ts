import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Idempotently ensure the public `villa-photos` storage bucket exists with the
 * right public flag + limits. Mirrors scripts/setup-agent-storage.ts: create
 * when absent, RECONCILE (updateBucket) when present so a pre-existing private
 * bucket can't silently break the owner-portal <img> reads. 5-minute cache so
 * we don't list buckets on every upload.
 */

export const VILLA_PHOTOS_BUCKET = "villa-photos";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
let ensuredAt: number | null = null;

export async function ensureVillaPhotosBucket(): Promise<{ ok: boolean; error?: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Supabase admin client not configured" };
  if (ensuredAt && Date.now() - ensuredAt < 5 * 60 * 1000) return { ok: true };

  const { data: list, error: listErr } = await admin.storage.listBuckets();
  if (listErr) return { ok: false, error: listErr.message };

  const existing = list?.find((b) => b.name === VILLA_PHOTOS_BUCKET);
  if (!existing) {
    const { error: createErr } = await admin.storage.createBucket(VILLA_PHOTOS_BUCKET, {
      public: true,
      fileSizeLimit: SIZE_LIMIT,
      allowedMimeTypes: ALLOWED,
    });
    if (createErr && !/already exists/i.test(createErr.message)) {
      return { ok: false, error: createErr.message };
    }
  } else {
    // Reconcile flags — a pre-existing private/misconfigured bucket would make
    // getPublicUrl() 400 on every read.
    const { error: updateErr } = await admin.storage.updateBucket(VILLA_PHOTOS_BUCKET, {
      public: true,
      fileSizeLimit: SIZE_LIMIT,
      allowedMimeTypes: ALLOWED,
    });
    if (updateErr) return { ok: false, error: updateErr.message };
  }

  ensuredAt = Date.now();
  return { ok: true };
}
