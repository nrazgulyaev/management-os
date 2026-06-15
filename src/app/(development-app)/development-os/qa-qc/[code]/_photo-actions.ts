"use server";

/**
 * Wire-up (dev-OS engineering-doc lifecycles §4) — "use server" adapter for
 * the server-only `deleteQaQcPhoto` action so the photo-gallery client island
 * can post to it (a "use client" module cannot import a `server-only` module).
 *
 * The underlying action enforces permissions + (now) tenant org-scoping. This
 * wrapper adds NO authority — it only normalizes the result shape and
 * revalidates the issue detail route so the deleted thumbnail disappears.
 */

import { revalidatePath } from "next/cache";
import { deleteQaQcPhoto } from "@/lib/development/server/qa-qc/qa-qc-photo-upload-actions";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function deleteQaQcPhotoAction(
  photoId: string,
  issueCode: string,
): Promise<ActionResult> {
  try {
    await deleteQaQcPhoto({ photoId });
    revalidatePath(
      `/development-os/qa-qc/${encodeURIComponent(issueCode)}`,
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete photo.",
    };
  }
}
