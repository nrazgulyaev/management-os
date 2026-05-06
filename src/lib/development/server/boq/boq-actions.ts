import "server-only";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  boqDocuments,
  boqSections,
  boqItems,
} from "@/lib/db/schema/boq";
import { requireInternalUser } from "@/features/auth/permissions";
import { rollupBoqTotals } from "./boq-helpers";
import {
  parseBoqCsv,
  serializeBoqCsv,
  type CsvBoqItem,
  type CsvBoqSection,
} from "./boq-import-export";

const STATUSES = [
  "draft",
  "under_review",
  "approved",
  "tender",
  "awarded",
  "superseded",
  "archived",
] as const;

const createDocSchema = z.object({
  boqCode: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  projectId: z.string().uuid(),
  villaId: z.string().uuid().nullable().optional(),
  versionLabel: z.string().min(1),
  versionNumber: z.number().int().positive().default(1),
  currency: z.string().default("IDR"),
  qsFirm: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createBoqDocument(
  input: z.input<typeof createDocSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = createDocSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(boqDocuments)
    .values({
      boqCode: parsed.boqCode,
      title: parsed.title,
      description: parsed.description ?? null,
      projectId: parsed.projectId,
      villaId: parsed.villaId ?? null,
      versionLabel: parsed.versionLabel,
      versionNumber: parsed.versionNumber,
      currency: parsed.currency,
      qsFirm: parsed.qsFirm ?? null,
      notes: parsed.notes ?? null,
      status: "draft",
      preparedBy: ctx.appUser?.id ?? null,
    })
    .returning();
  return row;
}

const addSectionSchema = z.object({
  boqDocumentId: z.string().uuid(),
  parentSectionId: z.string().uuid().nullable().optional(),
  sectionCode: z.string().min(1),
  sectionName: z.string().min(1),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int().default(0),
});

export async function addBoqSection(input: z.input<typeof addSectionSchema>) {
  await requireInternalUser();
  const parsed = addSectionSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(boqSections)
    .values({
      boqDocumentId: parsed.boqDocumentId,
      parentSectionId: parsed.parentSectionId ?? null,
      sectionCode: parsed.sectionCode,
      sectionName: parsed.sectionName,
      description: parsed.description ?? null,
      displayOrder: parsed.displayOrder,
    })
    .returning();
  return row;
}

const addItemSchema = z.object({
  sectionId: z.string().uuid(),
  itemCode: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitOfMeasure: z.string().min(1),
  unitRateMinor: z.bigint().nonnegative(),
  rateCurrency: z.string().default("IDR"),
  costCategoryId: z.string().uuid().nullable().optional(),
  specificationId: z.string().uuid().nullable().optional(),
  inventoryItemId: z.string().uuid().nullable().optional(),
  wasteFactor: z.number().nonnegative().optional(),
  logisticsFactor: z.number().nonnegative().optional(),
  laborFactor: z.number().nonnegative().optional(),
  displayOrder: z.number().int().default(0),
  notes: z.string().nullable().optional(),
});

/**
 * Add a single line item, then recompute section subtotals + document
 * total atomically.
 */
export async function addBoqItem(input: z.input<typeof addItemSchema>) {
  await requireInternalUser();
  const parsed = addItemSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(boqItems)
      .values({
        sectionId: parsed.sectionId,
        itemCode: parsed.itemCode,
        description: parsed.description,
        quantity: String(parsed.quantity),
        unitOfMeasure: parsed.unitOfMeasure,
        unitRateMinor: parsed.unitRateMinor,
        rateCurrency: parsed.rateCurrency,
        costCategoryId: parsed.costCategoryId ?? null,
        specificationId: parsed.specificationId ?? null,
        inventoryItemId: parsed.inventoryItemId ?? null,
        wasteFactor: parsed.wasteFactor != null ? String(parsed.wasteFactor) : null,
        logisticsFactor:
          parsed.logisticsFactor != null ? String(parsed.logisticsFactor) : null,
        laborFactor: parsed.laborFactor != null ? String(parsed.laborFactor) : null,
        displayOrder: parsed.displayOrder,
        notes: parsed.notes ?? null,
      })
      .returning();

    // Recompute totals for this section's parent document.
    const [section] = await tx
      .select({ docId: boqSections.boqDocumentId })
      .from(boqSections)
      .where(eq(boqSections.id, parsed.sectionId))
      .limit(1);
    if (section) {
      await recomputeBoqTotalsTx(tx, section.docId);
    }
    return item;
  });
}

/** Recompute section subtotals + document total. Atomic helper. */
async function recomputeBoqTotalsTx(
  tx: Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0],
  documentId: string,
) {
  const sections = await tx
    .select({
      id: boqSections.id,
      parentSectionId: boqSections.parentSectionId,
    })
    .from(boqSections)
    .where(eq(boqSections.boqDocumentId, documentId));
  const sectionIds = sections.map((s) => s.id);
  const items =
    sectionIds.length === 0
      ? []
      : await tx
          .select({
            sectionId: boqItems.sectionId,
            totalMinor: boqItems.totalMinor,
          })
          .from(boqItems)
          .where(sql`${boqItems.sectionId} = ANY(${sectionIds}::uuid[])`);

  const result = rollupBoqTotals(
    sections,
    items.map((i) => ({
      sectionId: i.sectionId,
      totalMinor: Number(i.totalMinor ?? 0),
    })),
  );

  for (const [sectionId, subtotal] of result.sectionSubtotals) {
    await tx
      .update(boqSections)
      .set({ subtotalMinor: BigInt(subtotal) })
      .where(eq(boqSections.id, sectionId));
  }
  await tx
    .update(boqDocuments)
    .set({ totalAmountMinor: BigInt(result.documentTotal) })
    .where(eq(boqDocuments.id, documentId));
}

/** Manual recompute trigger (also runs after every addBoqItem). */
export async function recomputeBoqTotals(input: { boqDocumentId: string }) {
  await requireInternalUser();
  const db = requireDb();
  return db.transaction(async (tx) => {
    await recomputeBoqTotalsTx(tx, input.boqDocumentId);
  });
}

const importCsvSchema = z.object({
  boqDocumentId: z.string().uuid(),
  csv: z.string().min(1),
});

/**
 * Import a CSV into an existing BOQ document. Atomic: clears existing
 * sections + items first, then inserts the new structure, then
 * recomputes totals — all in one transaction.
 */
export async function importBoqFromCsv(
  input: z.input<typeof importCsvSchema>,
) {
  await requireInternalUser();
  const parsed = importCsvSchema.parse(input);
  const db = requireDb();
  const csvData = parseBoqCsv(parsed.csv);

  return db.transaction(async (tx) => {
    // Clear existing sections (cascades to items via ON DELETE CASCADE).
    await tx
      .delete(boqSections)
      .where(eq(boqSections.boqDocumentId, parsed.boqDocumentId));

    // Insert sections, capturing their IDs by section_code.
    const sectionIdByCode = new Map<string, string>();
    for (const s of csvData.sections) {
      const [row] = await tx
        .insert(boqSections)
        .values({
          boqDocumentId: parsed.boqDocumentId,
          sectionCode: s.sectionCode,
          sectionName: s.sectionName,
          displayOrder: 0,
        })
        .returning();
      sectionIdByCode.set(s.sectionCode, row.id);
    }

    // Insert items.
    for (const it of csvData.items) {
      const sectionId = sectionIdByCode.get(it.sectionCode);
      if (!sectionId) {
        throw new Error(
          `importBoqFromCsv: item references unknown section_code '${it.sectionCode}'`,
        );
      }
      await tx.insert(boqItems).values({
        sectionId,
        itemCode: it.itemCode,
        description: it.description,
        quantity: String(it.quantity),
        unitOfMeasure: it.uom,
        unitRateMinor: it.unitRateMinor,
        rateCurrency: it.currency,
      });
    }

    await recomputeBoqTotalsTx(tx, parsed.boqDocumentId);
    return {
      sectionCount: csvData.sections.length,
      itemCount: csvData.items.length,
    };
  });
}

/** Build a CSV string for download. */
export async function exportBoqAsCsv(input: { boqDocumentId: string }) {
  await requireInternalUser();
  const db = requireDb();
  const sections = await db
    .select()
    .from(boqSections)
    .where(eq(boqSections.boqDocumentId, input.boqDocumentId));
  const sectionIds = sections.map((s) => s.id);
  const items =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(boqItems)
          .where(sql`${boqItems.sectionId} = ANY(${sectionIds}::uuid[])`);
  const sectionCodeById = new Map(sections.map((s) => [s.id, s.sectionCode]));
  const csvSections: CsvBoqSection[] = sections.map((s) => ({
    sectionCode: s.sectionCode,
    sectionName: s.sectionName,
  }));
  const csvItems: CsvBoqItem[] = items.map((it) => ({
    sectionCode: sectionCodeById.get(it.sectionId) ?? "",
    itemCode: it.itemCode,
    description: it.description,
    quantity: Number(it.quantity),
    uom: it.unitOfMeasure,
    unitRateMinor: it.unitRateMinor,
    currency: it.rateCurrency,
  }));
  return serializeBoqCsv({ sections: csvSections, items: csvItems });
}

const transitionSchema = z.object({
  boqDocumentId: z.string().uuid(),
  to: z.enum(STATUSES),
});

export async function transitionBoqStatus(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();
  const updates: Record<string, unknown> = { status: parsed.to };
  if (parsed.to === "approved") {
    updates.approvedBy = ctx.appUser?.id ?? null;
    updates.approvedAt = new Date();
  }
  const [row] = await db
    .update(boqDocuments)
    .set(updates)
    .where(eq(boqDocuments.id, parsed.boqDocumentId))
    .returning();
  return row;
}
