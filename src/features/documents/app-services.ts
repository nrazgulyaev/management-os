import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import {
  documentTemplates,
  documentVersions,
  documentSignatureRequests,
} from "@/lib/db/schema/documents-app";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Documents-app v1 read layer (migration 0132). Powers the interactive
 * documents cabinet: category tabs, expiring-soon, preview pane,
 * per-row sign / version state, templates, and AI-knowledge.
 *
 * getDb() may be null (no DB configured) — every reader guards it and
 * returns empty arrays so the demo never crashes.
 */

const EXPIRY_SOON_DAYS = 30;

export interface DocAppRow {
  id: string;
  title: string;
  documentType: string;
  entityType: string;
  entityId: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  visibility: "internal" | "owner" | "guest" | "public";
  status: "active" | "archived";
  createdAt: string;
  signedAt: string | null;
  expiresAt: string | null;
  aiFedAt: string | null;
  hasFile: boolean;
  /** Whether the doc expires within EXPIRY_SOON_DAYS (and is not archived). */
  expiringSoon: boolean;
  /** Whether the doc has already expired. */
  expired: boolean;
  versionCount: number;
  /** Latest signature-request status, if any. */
  signatureStatus: string | null;
  signatureRequestId: string | null;
}

function isExpiringSoon(expiresAt: Date | null, status: string): boolean {
  if (!expiresAt || status === "archived") return false;
  const ms = expiresAt.getTime() - Date.now();
  return ms > 0 && ms <= EXPIRY_SOON_DAYS * 24 * 60 * 60 * 1000;
}

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

/** Full doc list enriched with version count + latest signature status. */
export async function listDocsForApp(): Promise<DocAppRow[]> {
  const db = getDb();
  if (!db) return [];

  // TENANCY-FINANCE-DOCS — scope the documents-app cabinet to the org.
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.organizationId, organizationId))
    .orderBy(desc(documents.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // Version counts.
  const versions = await db
    .select({ documentId: documentVersions.documentId, id: documentVersions.id })
    .from(documentVersions)
    .where(inArray(documentVersions.documentId, ids));
  const versionCount = new Map<string, number>();
  for (const v of versions) {
    versionCount.set(v.documentId, (versionCount.get(v.documentId) ?? 0) + 1);
  }

  // Latest signature request per doc.
  const sigs = await db
    .select()
    .from(documentSignatureRequests)
    .where(inArray(documentSignatureRequests.documentId, ids))
    .orderBy(desc(documentSignatureRequests.createdAt));
  const latestSig = new Map<string, { id: string; status: string }>();
  for (const s of sigs) {
    if (!latestSig.has(s.documentId)) {
      latestSig.set(s.documentId, { id: s.id, status: s.status });
    }
  }

  return rows.map((r) => {
    const sig = latestSig.get(r.id) ?? null;
    return {
      id: r.id,
      title: r.title,
      documentType: r.documentType,
      entityType: r.entityType,
      entityId: r.entityId,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      visibility: r.visibility as DocAppRow["visibility"],
      status: (r.status as "active" | "archived") ?? "active",
      createdAt: r.createdAt.toISOString(),
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      aiFedAt: r.aiFedAt ? r.aiFedAt.toISOString() : null,
      hasFile: !!(r.storageBucket && r.storagePath && r.storageBucket !== "dry_run"),
      expiringSoon: isExpiringSoon(r.expiresAt, r.status),
      expired: isExpired(r.expiresAt),
      versionCount: versionCount.get(r.id) ?? 0,
      signatureStatus: sig?.status ?? null,
      signatureRequestId: sig?.id ?? null,
    };
  });
}

export interface TemplateRow {
  id: string;
  name: string;
  documentType: string;
  description: string | null;
  defaultVisibility: string;
  isActive: boolean;
  createdAt: string;
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE-DOCS — scope the template list to the caller's org.
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.organizationId, organizationId))
    .orderBy(desc(documentTemplates.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    documentType: r.documentType,
    description: r.description,
    defaultVisibility: r.defaultVisibility,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface VersionRow {
  id: string;
  versionNo: number;
  title: string;
  fileName: string | null;
  sizeBytes: number | null;
  contentHash: string | null;
  changeNote: string | null;
  isCurrent: boolean;
  createdAt: string;
}

export interface SignatureRow {
  id: string;
  signerName: string;
  signerEmail: string | null;
  signerRole: string;
  status: string;
  message: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
  countersignedAt: string | null;
  createdAt: string;
}

export interface DocDetail {
  versions: VersionRow[];
  signatures: SignatureRow[];
}

/** Versions + signature requests for a single document (preview pane). */
export async function getDocDetail(documentId: string): Promise<DocDetail> {
  const db = getDb();
  if (!db) return { versions: [], signatures: [] };

  // TENANCY-FINANCE-DOCS — verify the parent document is in the caller's org
  // before exposing its versions / signature requests. A cross-org id (the
  // route only auth-gates, it doesn't org-scope) returns empty.
  const organizationId = await requireOrgId();
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!doc) return { versions: [], signatures: [] };

  const [vRows, sRows] = await Promise.all([
    db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.versionNo)),
    db
      .select()
      .from(documentSignatureRequests)
      .where(eq(documentSignatureRequests.documentId, documentId))
      .orderBy(desc(documentSignatureRequests.createdAt)),
  ]);

  return {
    versions: vRows.map((v) => ({
      id: v.id,
      versionNo: v.versionNo,
      title: v.title,
      fileName: v.fileName,
      sizeBytes: v.sizeBytes,
      contentHash: v.contentHash,
      changeNote: v.changeNote,
      isCurrent: v.isCurrent,
      createdAt: v.createdAt.toISOString(),
    })),
    signatures: sRows.map((s) => ({
      id: s.id,
      signerName: s.signerName,
      signerEmail: s.signerEmail,
      signerRole: s.signerRole,
      status: s.status,
      message: s.message,
      reminderCount: s.reminderCount,
      lastReminderAt: s.lastReminderAt ? s.lastReminderAt.toISOString() : null,
      sentAt: s.sentAt ? s.sentAt.toISOString() : null,
      signedAt: s.signedAt ? s.signedAt.toISOString() : null,
      countersignedAt: s.countersignedAt ? s.countersignedAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

/** Counts per category tab + expiring-soon + ai-knowledge (active docs only). */
export async function getDocCategoryCounts(): Promise<{
  all: number;
  byType: Record<string, number>;
  expiringSoon: number;
  aiKnowledge: number;
}> {
  const rows = await listDocsForApp();
  const active = rows.filter((r) => r.status === "active");
  const byType: Record<string, number> = {};
  for (const r of active) {
    byType[r.documentType] = (byType[r.documentType] ?? 0) + 1;
  }
  return {
    all: active.length,
    byType,
    expiringSoon: active.filter((r) => r.expiringSoon || r.expired).length,
    aiKnowledge: active.filter((r) => !!r.aiFedAt).length,
  };
}

export { EXPIRY_SOON_DAYS };
