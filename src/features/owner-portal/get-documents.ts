/**
 * Phase 2.3 owner-06 — getOwnerDocuments.
 *
 * Server fn that resolves the owner's document library. Ownership-
 * scoped + `visible_to_owner=true` only (internal memos stay
 * hidden).
 *
 * Today returns empty groups; the data PR wires `documents` table
 * reads with the kind enum (msa / annex / legal / tax_summary /
 * tax_cert / statement_pdf / policy).
 */

import "server-only";
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

export async function getOwnerDocuments(ownerId: string): Promise<OwnerDocumentsResult> {
  void ownerId;
  return {
    groups: EMPTY_GROUPS,
    bundles: { yearEndAvailable: false, monthlyTaxCertsAvailable: false },
  };
}
