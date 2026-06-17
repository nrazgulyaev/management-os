"use server";

/**
 * Project Documents tab actions. Creates a `documents` metadata row indexed
 * against the project (entity_type='project'), and archives one. Org-scoped +
 * audited, mirroring features/documents/actions.ts. Real bytes live in Supabase
 * Storage; this records the metadata + storage path. The form supports two
 * flows: (a) attach an already-uploaded object by bucket/path, or (b) record a
 * link/reference document with no bytes.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

const DOCUMENT_TYPES = [
  "contract",
  "invoice",
  "receipt",
  "photo",
  "statement",
  "kyc",
  "certificate",
  "guide",
  "policy",
  "other",
] as const;

const VISIBILITIES = ["internal", "owner", "guest", "public"] as const;

const createSchema = z.object({
  projectId: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1).max(300),
  documentType: z.enum(DOCUMENT_TYPES),
  visibility: z.enum(VISIBILITIES).default("internal"),
  fileName: z.string().max(300).optional(),
  storageBucket: z.string().max(200).optional(),
  storagePath: z.string().max(500).optional(),
});

export async function createProjectDocumentAction(input: {
  projectId: string;
  slug: string;
  title: string;
  documentType: (typeof DOCUMENT_TYPES)[number];
  visibility?: (typeof VISIBILITIES)[number];
  fileName?: string;
  storageBucket?: string;
  storagePath?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await canManageEntity("document"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please review the form fields." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;
  const me = await getCurrentAppUser();
  // TENANCY — operator context; org from the session, never the client.
  const organizationId = await requireOrgId();

  const [row] = await db
    .insert(documents)
    .values({
      organizationId,
      title: d.title,
      documentType: d.documentType,
      entityType: "project",
      entityId: d.projectId,
      visibility: d.visibility,
      status: "active",
      fileName: d.fileName?.trim() || null,
      storageBucket: d.storageBucket?.trim() || null,
      storagePath: d.storagePath?.trim() || null,
      visibleToOwner: d.visibility === "owner" || d.visibility === "public",
      uploadedBy: me?.id ?? null,
    })
    .returning({ id: documents.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "document.create",
    entityType: "document",
    entityId: row.id,
    after: { entityType: "project", entityId: d.projectId, title: d.title },
  });
  revalidatePath(`/development-os/projects/${d.slug}`);
  return { ok: true, id: row.id };
}

const archiveSchema = z.object({
  documentId: z.string().uuid(),
  slug: z.string().min(1),
});

export async function archiveProjectDocumentAction(input: {
  documentId: string;
  slug: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canManageEntity("document"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Missing document id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  // Scope the load AND update so a cross-org id reads as not-found.
  const [before] = await db
    .select({ id: documents.id, status: documents.status })
    .from(documents)
    .where(
      and(
        eq(documents.id, parsed.data.documentId),
        eq(documents.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Document not found." };

  await db
    .update(documents)
    .set({ status: "archived" })
    .where(
      and(
        eq(documents.id, parsed.data.documentId),
        eq(documents.organizationId, organizationId),
      ),
    );
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "document.archive",
    entityType: "document",
    entityId: parsed.data.documentId,
    before: { status: before.status },
    after: { status: "archived" },
  });
  revalidatePath(`/development-os/projects/${parsed.data.slug}`);
  return { ok: true };
}
