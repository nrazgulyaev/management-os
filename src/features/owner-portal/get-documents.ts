/**
 * Phase 2.3 owner-06 / Phase 2 data-wiring PR 3 — getOwnerDocuments.
 *
 * Ownership-scoped read against the `documents` table. Filters to:
 *   - entity_type = 'owner' AND entity_id = ownerId, OR
 *   - visible_to_owner = true (set by migration 0114 from
 *     `visibility = 'owner'`)
 *
 * Maps the existing `document_type` column to the UI's DocKind
 * (msa / annex / legal / tax_summary / tax_cert / statement_pdf /
 * policy) and groups into the 4 cabinet sections.
 */

import "server-only";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import type { DocKind, DocStatus } from "@/components/owner-portal/doc-row";

export interface OwnerDocument {
  id: string;
  name: string;
  sub?: string;
  kind: DocKind;
  status?: DocStatus;
  fileUrl?: string;
  signedAt?: string;
  expiresAt?: string;
}

export interface OwnerDocumentGroup {
  key: "agreements" | "tax" | "statements" | "property";
  title: string;
  helper?: string;
  documents: OwnerDocument[];
}

export interface OwnerDocumentsResult {
  groups: OwnerDocumentGroup[];
  bundles: {
    yearEndAvailable: boolean;
    monthlyTaxCertsAvailable: boolean;
  };
}

const EMPTY_GROUPS: OwnerDocumentGroup[] = [
  {
    key: "agreements",
    title: "Agreements",
    helper: "Master services agreement, annexes, and power of attorney.",
    documents: [],
  },
  {
    key: "tax",
    title: "Tax",
    helper: "Annual summary, PHR certs, and WHT statements.",
    documents: [],
  },
  {
    key: "statements",
    title: "Statements archive",
    helper: "Monthly PDFs and the year-end bundle.",
    documents: [],
  },
  {
    key: "property",
    title: "Property & insurance",
    helper: "Building cover and public liability certificates.",
    documents: [],
  },
];

function mapDocTypeToKind(docType: string): DocKind {
  switch (docType) {
    case "contract":
      return "msa";
    case "statement":
      return "statement_pdf";
    case "certificate":
      return "tax_cert";
    case "policy":
      return "policy";
    case "guide":
    case "other":
      return "legal";
    default:
      // Other existing document_types: invoice, receipt, photo, kyc — these
      // shouldn't surface on the owner portal documents cabinet, but if
      // they leak through (e.g. visibility='owner' on a receipt), bucket
      // them under "legal" so the cabinet doesn't drop them.
      return "legal";
  }
}

function groupKeyForKind(kind: DocKind): OwnerDocumentGroup["key"] {
  switch (kind) {
    case "msa":
    case "annex":
    case "legal":
      return "agreements";
    case "tax_summary":
    case "tax_cert":
      return "tax";
    case "statement_pdf":
      return "statements";
    case "policy":
      return "property";
  }
}

function statusForRow(row: {
  signedAt: Date | null;
  expiresAt: Date | null;
}): DocStatus | undefined {
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return "expired";
  if (row.signedAt) return "signed";
  return undefined;
}

export async function getOwnerDocuments(ownerId: string): Promise<OwnerDocumentsResult> {
  const db = getDb();
  if (!db) {
    return {
      groups: EMPTY_GROUPS,
      bundles: { yearEndAvailable: false, monthlyTaxCertsAvailable: false },
    };
  }

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      documentType: documents.documentType,
      status: documents.status,
      signedAt: documents.signedAt,
      expiresAt: documents.expiresAt,
      storageBucket: documents.storageBucket,
      storagePath: documents.storagePath,
    })
    .from(documents)
    .where(
      and(
        // Ownership scope: either tagged to this owner OR globally visible.
        or(
          and(eq(documents.entityType, "owner"), eq(documents.entityId, ownerId)),
          eq(documents.visibleToOwner, true),
        ),
        eq(documents.status, "active"),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(500);

  // Deep-clone the empty groups so we don't mutate the module-level constant.
  const groups: OwnerDocumentGroup[] = EMPTY_GROUPS.map((g) => ({ ...g, documents: [] }));

  let hasYearStatement = false;
  let hasTaxCert = false;
  for (const r of rows) {
    const kind = mapDocTypeToKind(r.documentType);
    const groupKey = groupKeyForKind(kind);
    const group = groups.find((g) => g.key === groupKey);
    if (!group) continue;
    const fileUrl =
      r.storageBucket && r.storagePath
        ? `/api/documents/${r.id}/download`
        : undefined;
    group.documents.push({
      id: r.id,
      name: r.title,
      kind,
      status: statusForRow({ signedAt: r.signedAt, expiresAt: r.expiresAt }),
      fileUrl,
      signedAt: r.signedAt?.toISOString().slice(0, 10),
      expiresAt: r.expiresAt?.toISOString().slice(0, 10),
    });
    if (kind === "statement_pdf") hasYearStatement = true;
    if (kind === "tax_cert") hasTaxCert = true;
  }

  void isNotNull; // imported for future filters
  return {
    groups,
    bundles: {
      yearEndAvailable: hasYearStatement,
      monthlyTaxCertsAvailable: hasTaxCert,
    },
  };
}
