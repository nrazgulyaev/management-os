import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { buyers, buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { villas } from "@/lib/db/schema/projects";

/**
 * Buyer-portal document vault data layer.
 *
 * Scopes the shared `documents` table to a single authenticated buyer:
 * the buyer can see active documents tied to a villa they are assigned to
 * (entity_type='villa') or to the project that villa belongs to
 * (entity_type='project'). Operator-internal documents are excluded via
 * the visibility filter below.
 *
 * The page groups rows into the four buyer-facing sections by
 * `document_type`:
 *   - contract           → Contract
 *   - plan/render/photo  → Plans & renders
 *   - permit/certificate → Permits
 *   - invoice/receipt    → Payment receipts
 *
 * Anything else falls through to "Other documents" so nothing the
 * operator deliberately shared is silently dropped.
 */

export type BuyerDocGroupKey =
  | "contract"
  | "plans"
  | "permits"
  | "receipts"
  | "other";

export interface BuyerDocument {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  /** Buyer-scoped download endpoint (null when no bytes are attached). */
  downloadUrl: string | null;
}

export interface BuyerDocumentGroup {
  key: BuyerDocGroupKey;
  title: string;
  helper: string;
  documents: BuyerDocument[];
}

// Visibility tiers a buyer is allowed to see. The legacy enum is
// `internal | owner | guest | public`; the widened spec adds
// `operator_only | owner_visible | investor_visible | public`. Buyers
// are external counterparties, so they only ever see the explicitly
// shared / public tiers — never `internal` / `operator_only`.
const BUYER_VISIBLE = ["owner", "guest", "public", "owner_visible"];

const GROUP_ORDER: { key: BuyerDocGroupKey; title: string; helper: string }[] = [
  {
    key: "contract",
    title: "Contract",
    helper: "Your purchase agreement, annexes, and signed amendments.",
  },
  {
    key: "plans",
    title: "Plans & renders",
    helper: "Architectural plans, floorplans, and visualisations of your villa.",
  },
  {
    key: "permits",
    title: "Permits",
    helper: "Building permits and regulatory certificates for the project.",
  },
  {
    key: "receipts",
    title: "Payment receipts",
    helper: "Receipts and invoices for the installments you have paid.",
  },
  {
    key: "other",
    title: "Other documents",
    helper: "Everything else your team has shared with you.",
  },
];

function groupKeyForType(docType: string): BuyerDocGroupKey {
  switch (docType) {
    case "contract":
      return "contract";
    case "plan":
    case "render":
    case "drawing":
    case "photo":
      return "plans";
    case "permit":
    case "certificate":
    case "kyc":
      return "permits";
    case "invoice":
    case "receipt":
      return "receipts";
    default:
      return "other";
  }
}

/** Human-readable file size from a byte count. */
export function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export interface BuyerDocumentsResult {
  groups: BuyerDocumentGroup[];
  totalCount: number;
}

/**
 * Returns the buyer's document vault, grouped and ordered. Empty groups
 * are dropped so the page only renders sections that actually have files.
 */
export async function getBuyerDocuments(
  buyerId: string,
): Promise<BuyerDocumentsResult> {
  const db = getDb();
  if (!db) return { groups: [], totalCount: 0 };

  // 0. Resolve the buyer's own org so the entire chain — assignments, villas,
  //    and the shared `documents` table — is bounded to the buyer's tenant
  //    (defence-in-depth even if a stray cross-org assignment row exists).
  const [buyer] = await db
    .select({ organizationId: buyers.organizationId })
    .from(buyers)
    .where(eq(buyers.id, buyerId))
    .limit(1);
  if (!buyer) return { groups: [], totalCount: 0 };
  const orgId = buyer.organizationId;

  // 1. The buyer's assigned villas (org-bounded).
  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(
      and(
        eq(buyerUnitAssignments.buyerId, buyerId),
        eq(buyerUnitAssignments.organizationId, orgId),
      ),
    );
  const unitIds = [...new Set(assignments.map((a) => a.unitId))];
  if (unitIds.length === 0) return { groups: [], totalCount: 0 };

  // 2. Projects those villas belong to (for project-level shared docs).
  const villaRows = await db
    .select({ projectId: villas.projectId })
    .from(villas)
    .where(inArray(villas.id, unitIds));
  const projectIds = [...new Set(villaRows.map((v) => v.projectId))];

  // 3. Documents scoped to either a villa the buyer owns or its project,
  //    restricted to active + buyer-visible visibility tiers.
  const entityFilters = [
    and(eq(documents.entityType, "villa"), inArray(documents.entityId, unitIds)),
  ];
  if (projectIds.length > 0) {
    entityFilters.push(
      and(
        eq(documents.entityType, "project"),
        inArray(documents.entityId, projectIds),
      ),
    );
  }

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      documentType: documents.documentType,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      storageBucket: documents.storageBucket,
      storagePath: documents.storagePath,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, orgId),
        or(...entityFilters),
        eq(documents.status, "active"),
        inArray(documents.visibility, BUYER_VISIBLE),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(500);

  const groups: BuyerDocumentGroup[] = GROUP_ORDER.map((g) => ({
    ...g,
    documents: [],
  }));
  const byKey = new Map(groups.map((g) => [g.key, g]));

  for (const r of rows) {
    const group = byKey.get(groupKeyForType(r.documentType));
    if (!group) continue;
    group.documents.push({
      id: r.id,
      title: r.title,
      documentType: r.documentType,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
      downloadUrl:
        r.storageBucket && r.storagePath
          ? `/api/buyer-portal/documents/${r.id}/download`
          : null,
    });
  }

  return {
    groups: groups.filter((g) => g.documents.length > 0),
    totalCount: rows.length,
  };
}

/**
 * Authorization helper for the buyer-scoped download route. Returns true
 * iff the given document is in scope for this buyer (same villa/project
 * scope + visibility tier as the listing query).
 */
export async function buyerCanAccessDocument(
  buyerId: string,
  documentId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  // Resolve the buyer's own org first so the document fetch + the assignment
  // chain are both bounded to the buyer's tenant. Without this, the download
  // route would gate access purely on entity-id collision across tenants.
  const [buyer] = await db
    .select({ organizationId: buyers.organizationId })
    .from(buyers)
    .where(eq(buyers.id, buyerId))
    .limit(1);
  if (!buyer) return false;
  const orgId = buyer.organizationId;

  const [doc] = await db
    .select({
      entityType: documents.entityType,
      entityId: documents.entityId,
      status: documents.status,
      visibility: documents.visibility,
    })
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.organizationId, orgId)),
    )
    .limit(1);
  if (!doc) return false;
  if (doc.status !== "active") return false;
  if (!BUYER_VISIBLE.includes(doc.visibility)) return false;

  const assignments = await db
    .select({ unitId: buyerUnitAssignments.unitId })
    .from(buyerUnitAssignments)
    .where(
      and(
        eq(buyerUnitAssignments.buyerId, buyerId),
        eq(buyerUnitAssignments.organizationId, orgId),
      ),
    );
  const unitIds = new Set(assignments.map((a) => a.unitId));
  if (unitIds.size === 0) return false;

  if (doc.entityType === "villa") {
    return unitIds.has(doc.entityId);
  }
  if (doc.entityType === "project") {
    const villaRows = await db
      .select({ projectId: villas.projectId })
      .from(villas)
      .where(inArray(villas.id, [...unitIds]));
    return villaRows.some((v) => v.projectId === doc.entityId);
  }
  return false;
}
