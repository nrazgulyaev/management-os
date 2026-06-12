"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { villas, projects } from "@/lib/db/schema/projects";
import { villaPhotos } from "@/lib/db/schema/villa-photos";
import { ensureVillaPhotosBucket, VILLA_PHOTOS_BUCKET } from "./ensure-villa-photos-bucket";

/**
 * Villa photo upload / delete (management edit page). Bytes go to a PUBLIC
 * Supabase bucket; the public URL is stored on villa_photos.url (read as a
 * literal <img src> by the owner portal). Tenancy: villas have no org column,
 * so every path proves the villa ∈ caller's org via project — a cross-tenant
 * villa/photo id reads as "not found".
 */

interface Result {
  ok: boolean;
  error?: string;
  photoId?: string;
  url?: string;
}

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const extFor: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function villaInOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  villaId: string,
  orgId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: villas.id })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(and(eq(villas.id, villaId), eq(projects.organizationId, orgId)))
    .limit(1);
  return Boolean(row);
}

export async function uploadVillaPhotoAction(formData: FormData): Promise<Result> {
  if (!(await canManageEntity("villa"))) return { ok: false, error: "Not authorised." };
  const villaId = String(formData.get("villaId") ?? "");
  const file = formData.get("file");
  const caption = (formData.get("caption") as string | null)?.trim() || null;
  const kind = (formData.get("kind") as string | null) || "gallery";
  if (!villaId) return { ok: false, error: "Missing villa id." };
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (!ALLOWED.has(file.type)) return { ok: false, error: "Only JPEG, PNG, or WEBP." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Image must be ≤ 10MB." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Storage is not configured." };

  const organizationId = await requireOrgId();
  if (!(await villaInOrg(db, villaId, organizationId))) {
    return { ok: false, error: "Villa not found." };
  }

  const bucket = await ensureVillaPhotosBucket();
  if (!bucket.ok) return { ok: false, error: bucket.error ?? "Bucket error" };

  const me = await getCurrentAppUser();

  // Next position = highest existing + 1.
  const existing = await db
    .select({ position: villaPhotos.position })
    .from(villaPhotos)
    .where(eq(villaPhotos.villaId, villaId))
    .orderBy(desc(villaPhotos.position))
    .limit(1);
  const nextPos = (existing[0]?.position ?? -1) + 1;

  // Insert the row first (url empty) to get a stable id for the object path.
  const [row] = await db
    .insert(villaPhotos)
    .values({
      villaId,
      organizationId,
      url: "",
      caption,
      kind,
      position: nextPos,
      uploadedByUserId: me?.id ?? null,
      visibleToOwner: true,
      storageBucket: VILLA_PHOTOS_BUCKET,
      storagePath: "",
    })
    .returning({ id: villaPhotos.id });
  if (!row) return { ok: false, error: "Failed to create photo row." };

  const ext = extFor[file.type] ?? "bin";
  const storagePath = `org/${organizationId}/villa/${villaId}/${row.id}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(VILLA_PHOTOS_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (upErr) {
    await db.delete(villaPhotos).where(eq(villaPhotos.id, row.id)); // rollback
    return { ok: false, error: upErr.message };
  }
  const publicUrl = admin.storage
    .from(VILLA_PHOTOS_BUCKET)
    .getPublicUrl(storagePath).data.publicUrl;
  await db
    .update(villaPhotos)
    .set({ url: publicUrl, storagePath, updatedAt: new Date() })
    .where(eq(villaPhotos.id, row.id));

  revalidatePath(`/dashboard/villas/${villaId}`);
  revalidatePath(`/dashboard/villas/${villaId}/edit`);
  revalidatePath("/owner/villas");
  return { ok: true, photoId: row.id, url: publicUrl };
}

export async function deleteVillaPhotoAction(formData: FormData): Promise<Result> {
  if (!(await canManageEntity("villa"))) return { ok: false, error: "Not authorised." };
  const photoId = String(formData.get("photoId") ?? "");
  if (!photoId) return { ok: false, error: "Missing photo id." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();

  // Tenancy: join photo→villa→project; a cross-org photo id reads as not-found.
  const [row] = await db
    .select({
      id: villaPhotos.id,
      villaId: villaPhotos.villaId,
      bucket: villaPhotos.storageBucket,
      path: villaPhotos.storagePath,
    })
    .from(villaPhotos)
    .innerJoin(villas, eq(villas.id, villaPhotos.villaId))
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(and(eq(villaPhotos.id, photoId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!row) return { ok: false, error: "Photo not found." };

  const admin = getSupabaseAdmin();
  if (admin && row.bucket && row.path) {
    await admin.storage.from(row.bucket).remove([row.path]).catch(() => null);
  }
  await db.delete(villaPhotos).where(eq(villaPhotos.id, photoId));

  revalidatePath(`/dashboard/villas/${row.villaId}`);
  revalidatePath(`/dashboard/villas/${row.villaId}/edit`);
  revalidatePath("/owner/villas");
  return { ok: true };
}
