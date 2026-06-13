"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { createDocumentSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();
const nullable = (v: string | undefined) => (v && v !== "" ? v : null);

/**
 * Create returns the new document id (instead of redirecting) so the
 * form can run the optional "Feed to AI agent" follow-up with the id.
 * Navigation on success is handled client-side by the form.
 */
export type CreateDocumentResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createDocumentAction(
  _prev: CreateDocumentResult | null,
  formData: FormData,
): Promise<CreateDocumentResult> {
  if (!(await canManageEntity("document"))) return { ok: false, error: "Not authorised." };
  const parsed = createDocumentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  const me = await getCurrentAppUser();
  // TENANCY-FINANCE-DOCS — operator context; org from the session.
  const organizationId = await requireOrgId();

  const [row] = await db
    .insert(documents)
    .values({
      organizationId,
      title: d.title,
      documentType: d.documentType,
      entityType: d.entityType,
      entityId: d.entityId,
      storageBucket: nullable(d.storageBucket),
      storagePath: nullable(d.storagePath),
      fileName: nullable(d.fileName),
      visibility: d.visibility,
      status: d.status,
      uploadedBy: me?.id ?? null,
    })
    .returning({ id: documents.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "document.create",
    entityType: "document",
    entityId: row.id,
    after: d,
  });
  revalidatePath("/dashboard/documents");
  return { ok: true, id: row.id };
}

async function transition(
  id: string,
  next: "archived" | "active",
  action: "document.archive" | "document.unarchive",
): Promise<ActionResult> {
  if (!(await canManageEntity("document"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY-FINANCE-DOCS — operator context; org from the session. Scope the
  // load AND the update so a cross-org id reads as "not found" (and TOCTOU-safe).
  const organizationId = await requireOrgId();
  const [before] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Document not found." };
  await db
    .update(documents)
    .set({ status: next })
    .where(and(eq(documents.id, id), eq(documents.organizationId, organizationId)));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action,
    entityType: "document",
    entityId: id,
    before: { status: before.status },
    after: { status: next },
  });
  revalidatePath("/dashboard/documents");
  return { ok: true };
}

export async function archiveDocumentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing document id." };
  return transition(id.data, "archived", "document.archive");
}
