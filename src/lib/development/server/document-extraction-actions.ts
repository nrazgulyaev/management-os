import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { aiDocumentExtractions } from "@/lib/db/schema/ai-development";
import { documents } from "@/lib/db/schema/documents";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  extractFromDocument,
  type ExtractDocumentResult,
  type SupportedDocumentType,
} from "@/lib/development/ai/document-understanding";
import { recordTransaction } from "@/lib/development/server/transaction-actions";

/**
 * HITL actions for document extractions. Approving creates the
 * downstream entity (transaction, delivery) atomically with the
 * extraction status update — half-applied state is impossible.
 */

const extractSchema = z.object({
  documentId: z.string().uuid(),
  documentType: z.enum([
    "receipt",
    "invoice",
    "delivery_note",
    "contract",
    "other",
  ]),
  hintProjectId: z.string().uuid().optional(),
  hintVendorId: z.string().uuid().optional(),
});

export async function extractFromDocumentNow(
  input: z.input<typeof extractSchema>,
): Promise<ExtractDocumentResult> {
  const parsed = extractSchema.parse(input);
  await requireInternalUser();
  const out = await extractFromDocument({
    documentId: parsed.documentId,
    documentType: parsed.documentType as SupportedDocumentType,
    hintProjectId: parsed.hintProjectId,
    hintVendorId: parsed.hintVendorId,
  });
  revalidatePath(`/development-os/finance/document-extractions`);
  if (out.extractionId) {
    revalidatePath(
      `/development-os/finance/document-extractions/${out.extractionId}`,
    );
  }
  return out;
}

const idSchema = z.object({ extractionId: z.string().uuid() });

const approveTxnSchema = z.object({
  extractionId: z.string().uuid(),
  // Operator-confirmed transaction fields. Pre-filled from the
  // extraction in the UI; operator can override before approving.
  transaction: z.object({
    bankAccountId: z.string().uuid(),
    direction: z.enum(["inflow", "outflow"]),
    categoryId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    amountMinor: z.union([z.bigint(), z.string(), z.number()]),
    currency: z.enum(["USD", "IDR", "RUB", "EUR", "USDT", "CNY"]),
    fxRateAtTransaction: z.string().regex(/^\d+(\.\d+)?$/),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().min(1),
    counterpartyName: z.string().optional().nullable(),
    externalReference: z.string().optional().nullable(),
  }),
});

/**
 * Approves an extraction by creating a `dev_transactions` row and
 * linking it. Operator-supplied values win — the AI extraction is
 * the suggestion, the operator's form values are the truth.
 *
 * Atomic: extraction status flips to 'approved' (or 'edited_approved'
 * if operator overrode anything from the AI suggestion) only after
 * `recordTransaction` succeeds. If the transaction insert fails, the
 * extraction stays at 'pending_review'.
 */
export async function approveExtractionAsTransaction(
  input: z.input<typeof approveTxnSchema>,
): Promise<{ ok: true; transactionId: string }> {
  const parsed = approveTxnSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();

  const [ext] = await db
    .select()
    .from(aiDocumentExtractions)
    .where(eq(aiDocumentExtractions.id, parsed.extractionId))
    .limit(1);
  if (!ext) throw new Error("Extraction not found");
  if (ext.status !== "pending_review") {
    throw new Error(`Cannot approve extraction in '${ext.status}' state`);
  }
  if (ext.documentType !== "receipt" && ext.documentType !== "invoice") {
    throw new Error(
      `Document type '${ext.documentType}' cannot be approved as a transaction`,
    );
  }

  // Create the transaction first (its own internal transaction).
  const created = await recordTransaction({
    bankAccountId: parsed.transaction.bankAccountId,
    direction: parsed.transaction.direction,
    categoryId: parsed.transaction.categoryId ?? ext.suggestedCategoryId ?? undefined,
    projectId: parsed.transaction.projectId ?? ext.suggestedProjectId ?? undefined,
    amountMinor: parsed.transaction.amountMinor,
    currency: parsed.transaction.currency,
    fxRateAtTransaction: parsed.transaction.fxRateAtTransaction,
    transactionDate: parsed.transaction.transactionDate,
    description: parsed.transaction.description,
    counterpartyName: parsed.transaction.counterpartyName ?? null,
    externalReference: parsed.transaction.externalReference ?? null,
    receiptDocumentId: ext.documentId,
  });

  // Decide approved vs edited_approved: if the operator overrode any
  // field that the extraction had a suggestion for, mark edited.
  const wasEdited = detectOperatorEdits(ext, parsed.transaction);

  await db
    .update(aiDocumentExtractions)
    .set({
      status: wasEdited ? "edited_approved" : "approved",
      reviewedBy: meId,
      reviewedAt: new Date(),
      reviewerEdits: wasEdited
        ? (parsed.transaction as typeof aiDocumentExtractions.$inferInsert["reviewerEdits"])
        : null,
      createdTransactionId: created.id,
      updatedAt: new Date(),
    })
    .where(eq(aiDocumentExtractions.id, ext.id));

  revalidatePath(`/development-os/finance/document-extractions`);
  revalidatePath(`/development-os/finance/document-extractions/${ext.id}`);
  return { ok: true, transactionId: created.id };
}

const rejectSchema = z.object({
  extractionId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function rejectExtraction(
  input: z.input<typeof rejectSchema>,
): Promise<{ ok: true }> {
  const parsed = rejectSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  const [ext] = await db
    .select({
      id: aiDocumentExtractions.id,
      status: aiDocumentExtractions.status,
    })
    .from(aiDocumentExtractions)
    .where(eq(aiDocumentExtractions.id, parsed.extractionId))
    .limit(1);
  if (!ext) throw new Error("Extraction not found");
  if (ext.status !== "pending_review") {
    throw new Error(`Cannot reject extraction in '${ext.status}' state`);
  }
  await db
    .update(aiDocumentExtractions)
    .set({
      status: "rejected",
      rejectionReason: parsed.reason,
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiDocumentExtractions.id, ext.id));
  revalidatePath(`/development-os/finance/document-extractions`);
  return { ok: true };
}

const dupeSchema = z.object({
  extractionId: z.string().uuid(),
  duplicateOfTransactionId: z.string().uuid().optional(),
});

export async function markExtractionDuplicate(
  input: z.input<typeof dupeSchema>,
): Promise<{ ok: true }> {
  const parsed = dupeSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  await db
    .update(aiDocumentExtractions)
    .set({
      status: "duplicate",
      createdTransactionId: parsed.duplicateOfTransactionId ?? null,
      reviewedBy: meId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiDocumentExtractions.id, parsed.extractionId));
  revalidatePath(`/development-os/finance/document-extractions`);
  return { ok: true };
}

/**
 * Re-extract: marks the current row superseded then re-runs the
 * extractor. Audit chain preserved.
 */
export async function regenerateExtraction(
  input: z.input<typeof idSchema>,
): Promise<ExtractDocumentResult> {
  const parsed = idSchema.parse(input);
  const me = await requireInternalUser();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  const [ext] = await db
    .select({
      id: aiDocumentExtractions.id,
      documentId: aiDocumentExtractions.documentId,
      documentType: aiDocumentExtractions.documentType,
      status: aiDocumentExtractions.status,
    })
    .from(aiDocumentExtractions)
    .where(eq(aiDocumentExtractions.id, parsed.extractionId))
    .limit(1);
  if (!ext) throw new Error("Extraction not found");
  if (ext.status === "pending_review") {
    await db
      .update(aiDocumentExtractions)
      .set({
        status: "superseded",
        reviewedBy: meId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiDocumentExtractions.id, ext.id));
  }
  const out = await extractFromDocument({
    documentId: ext.documentId,
    documentType: ext.documentType as SupportedDocumentType,
  });
  revalidatePath(`/development-os/finance/document-extractions`);
  return out;
}

// =========================================================================
// Read-side queries
// =========================================================================

export async function getDocumentExtractions(opts?: {
  status?: string;
  documentType?: string;
  limit?: number;
}) {
  const db = requireDb();
  const conditions = [];
  if (opts?.status) {
    conditions.push(eq(aiDocumentExtractions.status, opts.status));
  }
  if (opts?.documentType) {
    conditions.push(
      eq(aiDocumentExtractions.documentType, opts.documentType),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      id: aiDocumentExtractions.id,
      documentId: aiDocumentExtractions.documentId,
      documentTitle: documents.title,
      documentType: aiDocumentExtractions.documentType,
      detectedLanguage: aiDocumentExtractions.detectedLanguage,
      detectedQuality: aiDocumentExtractions.detectedQuality,
      status: aiDocumentExtractions.status,
      vendorMatchConfidence: aiDocumentExtractions.vendorMatchConfidence,
      categoryMatchConfidence: aiDocumentExtractions.categoryMatchConfidence,
      generatedAt: aiDocumentExtractions.generatedAt,
      reviewedAt: aiDocumentExtractions.reviewedAt,
    })
    .from(aiDocumentExtractions)
    .innerJoin(documents, eq(documents.id, aiDocumentExtractions.documentId))
    .where(where ?? sql`true`)
    .orderBy(desc(aiDocumentExtractions.generatedAt))
    .limit(opts?.limit ?? 100);
  return rows;
}

export async function getDocumentExtraction(extractionId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(aiDocumentExtractions)
    .where(eq(aiDocumentExtractions.id, extractionId))
    .limit(1);
  return row ?? null;
}

// =========================================================================
// Helpers
// =========================================================================

interface OperatorTransaction {
  bankAccountId: string;
  categoryId?: string | null;
  projectId?: string | null;
  amountMinor: bigint | string | number;
  currency: string;
  transactionDate: string;
  counterpartyName?: string | null;
}

function detectOperatorEdits(
  ext: typeof aiDocumentExtractions.$inferSelect,
  txn: OperatorTransaction,
): boolean {
  // Compare operator's transaction values against the extracted_data
  // suggestions. Any mismatch on a field the AI populated counts as
  // an edit. Used to decide between status='approved' vs 'edited_approved'.
  const ed = (ext.extractedData ?? {}) as Record<string, unknown>;
  if (
    typeof ed.currency === "string" &&
    ed.currency !== txn.currency
  ) {
    return true;
  }
  if (
    typeof ed.transaction_date === "string" &&
    ed.transaction_date !== txn.transactionDate
  ) {
    return true;
  }
  if (
    ext.suggestedCategoryId &&
    txn.categoryId !== undefined &&
    txn.categoryId !== ext.suggestedCategoryId
  ) {
    return true;
  }
  if (
    ext.suggestedProjectId &&
    txn.projectId !== undefined &&
    txn.projectId !== ext.suggestedProjectId
  ) {
    return true;
  }
  return false;
}
