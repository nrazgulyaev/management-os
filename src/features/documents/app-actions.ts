"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import {
  documentTemplates,
  documentVersions,
  documentSignatureRequests,
} from "@/lib/db/schema/documents-app";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Documents-app v1 write layer (migration 0132). Every action is
 * permission-gated (`document` entity) like its siblings and audit-logs
 * the state change via recordAuditEvent. getDb() may be null.
 *
 * No real e-signature provider is wired (Indonesia rails / DocuSign
 * deferred) — sign / countersign are manual operator marks, same
 * posture as manual mark-paid.
 */

export type AppActionResult = { ok: true } | { ok: false; error: string };

const PATH = "/dashboard/documents";
const uuid = z.string().uuid();

async function guard(): Promise<
  | { ok: true; userId: string | null; organizationId: string }
  | { ok: false; error: string }
> {
  if (!(await canManageEntity("document"))) {
    return { ok: false, error: "Not authorised." };
  }
  const me = await getCurrentAppUser();
  // TENANCY-FINANCE-DOCS — operator context; org from the session.
  const organizationId = await requireOrgId();
  return { ok: true, userId: me?.id ?? null, organizationId };
}

// Feed-to-AI / Remove-from-AI moved to the real ingestion flow in
// src/app/(dashboard)/dashboard/documents/ai-knowledge-actions.ts
// (feedDocumentToAgentAction / removeDocumentFromAgentAction) — the old
// flag-only setDocumentAiFedAction was removed.

// ---------- Sign (manual operator mark) ----------

export async function markDocumentSignedAction(input: {
  documentId: string;
  signed: boolean;
}): Promise<AppActionResult> {
  const id = uuid.safeParse(input.documentId);
  if (!id.success) return { ok: false, error: "Invalid document id." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select({ signedAt: documents.signedAt })
    .from(documents)
    .where(eq(documents.id, id.data))
    .limit(1);
  if (!before) return { ok: false, error: "Document not found." };

  const next = input.signed ? new Date() : null;
  await db.update(documents).set({ signedAt: next }).where(eq(documents.id, id.data));
  await recordAuditEvent({
    actorUserId: g.userId,
    action: input.signed ? "document.sign" : "document.unsign",
    entityType: "document",
    entityId: id.data,
    before: { signedAt: before.signedAt },
    after: { signedAt: next },
  });
  revalidatePath(PATH);
  return { ok: true };
}

// ---------- Delete ----------

export async function deleteDocumentAppAction(input: {
  documentId: string;
}): Promise<AppActionResult> {
  const id = uuid.safeParse(input.documentId);
  if (!id.success) return { ok: false, error: "Invalid document id." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select({ title: documents.title })
    .from(documents)
    .where(eq(documents.id, id.data))
    .limit(1);
  if (!before) return { ok: false, error: "Document not found." };

  await db.delete(documents).where(eq(documents.id, id.data));
  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.delete",
    entityType: "document",
    entityId: id.data,
    before: { title: before.title },
  });
  revalidatePath(PATH);
  return { ok: true };
}

// ---------- e-sign request flow ----------

const createSigSchema = z.object({
  documentId: z.string().uuid(),
  signerName: z.string().min(2).max(200),
  signerEmail: z.string().email().max(200).optional().or(z.literal("")),
  signerRole: z.enum(["owner", "guest", "supplier", "counterparty", "internal"]),
  message: z.string().max(1000).optional().or(z.literal("")),
});

export async function createSignatureRequestAction(
  input: z.infer<typeof createSigSchema>,
): Promise<AppActionResult> {
  const parsed = createSigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please complete the signer fields." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;

  const [doc] = await db
    .select({ id: documents.id, organizationId: documents.organizationId })
    .from(documents)
    .where(eq(documents.id, d.documentId))
    .limit(1);
  if (!doc) return { ok: false, error: "Document not found." };

  const now = new Date();
  const [row] = await db
    .insert(documentSignatureRequests)
    .values({
      // TENANCY-FINANCE-DOCS — child copies the parent document's org.
      organizationId: doc.organizationId ?? g.organizationId,
      documentId: d.documentId,
      signerName: d.signerName,
      signerEmail: d.signerEmail || null,
      signerRole: d.signerRole,
      status: "sent",
      message: d.message || null,
      sentAt: now,
      requestedBy: g.userId,
    })
    .returning({ id: documentSignatureRequests.id });
  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.signature_request",
    entityType: "document",
    entityId: d.documentId,
    after: { signatureRequestId: row.id, signer: d.signerName, status: "sent" },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function sendSignatureReminderAction(input: {
  requestId: string;
}): Promise<AppActionResult> {
  const id = uuid.safeParse(input.requestId);
  if (!id.success) return { ok: false, error: "Invalid request id." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [req] = await db
    .select()
    .from(documentSignatureRequests)
    .where(eq(documentSignatureRequests.id, id.data))
    .limit(1);
  if (!req) return { ok: false, error: "Signature request not found." };
  if (req.status === "signed" || req.status === "countersigned") {
    return { ok: false, error: "Already signed — no reminder needed." };
  }

  const now = new Date();
  await db
    .update(documentSignatureRequests)
    .set({
      reminderCount: sql`${documentSignatureRequests.reminderCount} + 1`,
      lastReminderAt: now,
      status: req.status === "pending" ? "sent" : req.status,
      updatedAt: now,
    })
    .where(eq(documentSignatureRequests.id, id.data));
  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.signature_reminder",
    entityType: "document",
    entityId: req.documentId,
    after: { signatureRequestId: id.data, reminderCount: req.reminderCount + 1 },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function markCountersignedAction(input: {
  requestId: string;
}): Promise<AppActionResult> {
  const id = uuid.safeParse(input.requestId);
  if (!id.success) return { ok: false, error: "Invalid request id." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [req] = await db
    .select()
    .from(documentSignatureRequests)
    .where(eq(documentSignatureRequests.id, id.data))
    .limit(1);
  if (!req) return { ok: false, error: "Signature request not found." };

  const now = new Date();
  await db
    .update(documentSignatureRequests)
    .set({
      status: "countersigned",
      signedAt: req.signedAt ?? now,
      countersignedAt: now,
      updatedAt: now,
    })
    .where(eq(documentSignatureRequests.id, id.data));
  // Mark the underlying document signed too, capturing the moment.
  await db
    .update(documents)
    .set({ signedAt: now })
    .where(and(eq(documents.id, req.documentId), sql`${documents.signedAt} IS NULL`));
  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.countersigned",
    entityType: "document",
    entityId: req.documentId,
    before: { status: req.status },
    after: { status: "countersigned", signatureRequestId: id.data },
  });
  revalidatePath(PATH);
  return { ok: true };
}

// ---------- Version snapshot (for version compare) ----------

const addVersionSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().min(2).max(200),
  changeNote: z.string().max(1000).optional().or(z.literal("")),
  fileName: z.string().max(200).optional().or(z.literal("")),
  contentHash: z.string().max(128).optional().or(z.literal("")),
});

export async function addDocumentVersionAction(
  input: z.infer<typeof addVersionSchema>,
): Promise<AppActionResult> {
  const parsed = addVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please complete the version fields." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, d.documentId))
    .limit(1);
  if (!doc) return { ok: false, error: "Document not found." };

  const [last] = await db
    .select({ versionNo: documentVersions.versionNo })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, d.documentId))
    .orderBy(desc(documentVersions.versionNo))
    .limit(1);
  const nextNo = (last?.versionNo ?? 0) + 1;

  // Demote prior current.
  await db
    .update(documentVersions)
    .set({ isCurrent: false })
    .where(eq(documentVersions.documentId, d.documentId));

  await db.insert(documentVersions).values({
    // TENANCY-FINANCE-DOCS — child copies the parent document's org.
    organizationId: doc.organizationId ?? g.organizationId,
    documentId: d.documentId,
    versionNo: nextNo,
    title: d.title,
    storageBucket: doc.storageBucket,
    storagePath: doc.storagePath,
    fileName: d.fileName || doc.fileName,
    sizeBytes: doc.sizeBytes,
    contentHash: d.contentHash || null,
    changeNote: d.changeNote || null,
    isCurrent: true,
    createdBy: g.userId,
  });
  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.version_add",
    entityType: "document",
    entityId: d.documentId,
    after: { versionNo: nextNo, title: d.title },
  });
  revalidatePath(PATH);
  return { ok: true };
}

// ---------- Templates ----------

const createTemplateSchema = z.object({
  name: z.string().min(2).max(200),
  documentType: z.enum([
    "contract",
    "invoice",
    "receipt",
    "statement",
    "kyc",
    "certificate",
    "guide",
    "policy",
    "other",
  ]),
  description: z.string().max(1000).optional().or(z.literal("")),
  body: z.string().max(20000).optional().or(z.literal("")),
  defaultVisibility: z.enum(["internal", "owner", "guest", "public"]),
});

export async function createTemplateAction(
  input: z.infer<typeof createTemplateSchema>,
): Promise<AppActionResult> {
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please complete the template fields." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;

  const [row] = await db
    .insert(documentTemplates)
    .values({
      // TENANCY-FINANCE-DOCS — operator context; org from the session.
      organizationId: g.organizationId,
      name: d.name,
      documentType: d.documentType,
      description: d.description || null,
      body: d.body || "",
      defaultVisibility: d.defaultVisibility,
      createdBy: g.userId,
    })
    .returning({ id: documentTemplates.id });
  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.template_create",
    entityType: "document",
    entityId: row.id,
    after: { name: d.name, documentType: d.documentType },
  });
  revalidatePath(PATH);
  return { ok: true };
}

const generateSchema = z.object({
  templateId: z.string().uuid(),
  title: z.string().min(2).max(200),
  entityType: z.enum([
    "project",
    "villa",
    "owner",
    "booking",
    "supplier",
    "task",
    "maintenance",
  ]),
  entityId: z.string().uuid(),
});

export async function generateFromTemplateAction(
  input: z.infer<typeof generateSchema>,
): Promise<AppActionResult> {
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please complete the generation fields." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const d = parsed.data;

  const [tpl] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.id, d.templateId))
    .limit(1);
  if (!tpl) return { ok: false, error: "Template not found." };

  const visibility = tpl.defaultVisibility as
    | "internal"
    | "owner"
    | "guest"
    | "public";
  // TENANCY-FINANCE-DOCS — generated doc inherits the template's org
  // (falls back to the operator's session org).
  const organizationId = tpl.organizationId ?? g.organizationId;
  const [row] = await db
    .insert(documents)
    .values({
      organizationId,
      title: d.title,
      documentType: tpl.documentType,
      entityType: d.entityType,
      entityId: d.entityId,
      fileName: `${d.title}.txt`,
      mimeType: "text/plain",
      visibility,
      visibleToOwner: visibility === "owner" || visibility === "public",
      status: "active",
      uploadedBy: g.userId,
    })
    .returning({ id: documents.id });

  // Seed v1 from the rendered template body.
  await db.insert(documentVersions).values({
    organizationId,
    documentId: row.id,
    versionNo: 1,
    title: d.title,
    fileName: `${d.title}.txt`,
    changeNote: `Generated from template “${tpl.name}”.`,
    isCurrent: true,
    createdBy: g.userId,
  });

  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.generate_from_template",
    entityType: "document",
    entityId: row.id,
    after: { templateId: d.templateId, title: d.title },
  });
  revalidatePath(PATH);
  return { ok: true };
}
