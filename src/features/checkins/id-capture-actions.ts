"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { checkins, guestIdDocuments } from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { uploadDocument } from "@/features/storage/storage-service";
import { recordAuditEvent } from "@/features/audit/services";
import {
  run as runIdOcr,
  mimeToMediaType,
  type IdDocumentType,
} from "@/features/ai-agents/front-office/id-ocr";

export interface IdCaptureResult {
  ok: boolean;
  error?: string;
  needsReview?: boolean;
}

const MAX_BYTES = 8 * 1024 * 1024;
const DOC_TYPES = new Set<IdDocumentType>(["passport", "kitas", "ktp"]);
const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Front-office operator captures a guest's ID at the desk (Phase 3). Stores the
 * scan in `documents` (Supabase Storage, operator_only), runs the id-ocr agent
 * (vision; dry-run-safe), and upserts the extraction into `guest_id_documents`.
 * confidence < 0.85 → status stays `pending_review` for manual override.
 */
export async function captureGuestIdAction(
  _prev: IdCaptureResult | null,
  formData: FormData,
): Promise<IdCaptureResult> {
  if (!(await canManageEntity("booking"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrgId();
  const user = await getCurrentAppUser();

  const bookingId = String(formData.get("bookingId") ?? "");
  const docTypeRaw = String(formData.get("docType") ?? "passport") as IdDocumentType;
  const docType = DOC_TYPES.has(docTypeRaw) ? docTypeRaw : "passport";
  const file = formData.get("file");
  if (!bookingId) return { ok: false, error: "Missing booking." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Attach a scan image." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File too large (max 8MB)." };

  const [bk] = await db
    .select({ id: bookings.id, guestId: bookings.guestId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!bk) return { ok: false, error: "Booking not found." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";

  // 1) store the scan
  const up = await uploadDocument({
    organizationId: orgId,
    entityType: "booking",
    entityId: bookingId,
    documentType: "id_document",
    title: `Guest ID — ${docType}`,
    fileName: file.name || `${docType}.jpg`,
    mimeType: mime,
    bytes,
    visibility: "operator_only",
    uploadedBy: user?.id ?? null,
  });
  if (!up.ok) return { ok: false, error: up.error ?? "Upload failed." };

  // 2) OCR (vision; dry-run returns confidence 0 → manual review)
  const mediaType = mimeToMediaType(mime);
  const out = mediaType
    ? await runIdOcr({ docType, imageBase64: bytes.toString("base64"), mediaType, organizationId: orgId })
    : { confidence: 0, raw: { error: "unsupported_mime" } as Record<string, unknown> };

  const needsReview = out.confidence < CONFIDENCE_THRESHOLD;
  const now = new Date();

  // 3) upsert the extraction (one per booking)
  const patch = {
    guestId: bk.guestId ?? null,
    documentId: up.documentId ?? null,
    docType,
    status: needsReview ? "pending_review" : "approved",
    fullName: out.name ?? null,
    nationality: out.nationality ?? null,
    documentNumber: out.documentNumber ?? null,
    expiresAt: out.expiresAt ?? null,
    confidence: String(out.confidence),
    raw: out.raw,
    extractedAt: now,
    reviewedBy: needsReview ? null : user?.id ?? null,
    updatedAt: now,
  };
  const [existing] = await db
    .select({ id: guestIdDocuments.id })
    .from(guestIdDocuments)
    .where(eq(guestIdDocuments.bookingId, bookingId))
    .limit(1);
  if (existing) {
    await db.update(guestIdDocuments).set(patch).where(eq(guestIdDocuments.id, existing.id));
  } else {
    await db.insert(guestIdDocuments).values({ bookingId, ...patch });
  }

  // 4) the check-in now has a passport on file
  await db
    .update(checkins)
    .set({ passportUploaded: true, updatedAt: now })
    .where(eq(checkins.bookingId, bookingId));

  await recordAuditEvent({
    actorUserId: user?.id ?? null,
    action: "checkin.id_captured",
    entityType: "booking",
    entityId: bookingId,
    after: { docType, confidence: out.confidence, needsReview },
  });
  revalidatePath("/dashboard/front-office/arrivals");
  return { ok: true, needsReview };
}

/** Operator confirms a low-confidence extraction (manual override → approved). */
export async function approveGuestIdAction(bookingId: string): Promise<IdCaptureResult> {
  if (!(await canManageEntity("booking"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const user = await getCurrentAppUser();
  const [row] = await db
    .select({ id: guestIdDocuments.id })
    .from(guestIdDocuments)
    .where(eq(guestIdDocuments.bookingId, bookingId))
    .limit(1);
  if (!row) return { ok: false, error: "No ID on file for this booking." };
  await db
    .update(guestIdDocuments)
    .set({ status: "approved", reviewedBy: user?.id ?? null, updatedAt: new Date() })
    .where(eq(guestIdDocuments.id, row.id));
  revalidatePath("/dashboard/front-office/arrivals");
  return { ok: true };
}
