"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import {
  takeoffMeasurements,
  type TakeoffGeometryPoint,
  type TakeoffScaleSnapshot,
} from "@/lib/db/schema/takeoff-measurements";
import { boqItems, boqSections, boqDocuments } from "@/lib/db/schema/boq";
import { drawingRevisions } from "@/lib/db/schema/drawings";
import {
  quantityFor,
  TAKEOFF_UNIT,
  type TakeoffKind,
} from "@/lib/development/takeoff-geometry";
import { rollupBoqTotals } from "./boq-helpers";

/**
 * Block 09 ESTIMATOR — the takeoff → BOQ round-trip.
 *
 * These actions persist drawing-takeoff measurements (area / length / count,
 * each pinned to the drawing REVISION it was measured on), let the estimator
 * edit/delete/re-cost them, and push (or re-push) a measurement into a BOQ
 * section as a costed line — keeping a round-trip link (boqItemId) so a re-cost
 * updates the SAME BOQ line in place rather than spawning duplicates.
 *
 * Money is bigint MINOR. Every state/money write is org-scoped + audit-logged.
 * No PSP — this only computes estimate quantity × rate.
 */

const pointSchema = z.object({ x: z.number(), y: z.number() });
const scaleSchema = z.object({
  pixels: z.number().nonnegative(),
  meters: z.number().nonnegative(),
});
const kindSchema = z.enum(["area", "length", "count"]);

/** Recompute section subtotals + document total for a document. Atomic. */
async function recomputeTotalsTx(
  tx: Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0],
  documentId: string,
  organizationId: string,
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
      .where(
        and(
          eq(boqSections.id, sectionId),
          eq(boqSections.organizationId, organizationId),
        ),
      );
  }
  await tx
    .update(boqDocuments)
    .set({ totalAmountMinor: BigInt(result.documentTotal) })
    .where(
      and(
        eq(boqDocuments.id, documentId),
        eq(boqDocuments.organizationId, organizationId),
      ),
    );
}

/** Derive the measured quantity from geometry + scale; throws if impossible. */
function deriveQuantity(
  kind: TakeoffKind,
  geometry: TakeoffGeometryPoint[],
  scale: TakeoffScaleSnapshot | null,
): number {
  const qty = quantityFor(kind, geometry, scale);
  if (qty == null) {
    throw new Error(
      "Cannot derive quantity — calibrate the scale before measuring area/length.",
    );
  }
  return qty;
}

// ───────────────────────── create ─────────────────────────

const saveSchema = z.object({
  drawingRevisionId: z.string().uuid(),
  label: z.string().max(200).default(""),
  kind: kindSchema,
  /** Explicit unit; defaults to the canonical unit for the kind. */
  unitOfMeasure: z.string().min(1).max(16).optional(),
  assembly: z.string().max(120).nullable().optional(),
  geometry: z.array(pointSchema).min(1),
  scaleSnapshot: scaleSchema.nullable().optional(),
  /** Unit rate in MINOR units, as a string (bigint-safe over the wire). */
  unitRateMinor: z.string().regex(/^\d+$/).default("0"),
  currency: z.string().min(1).max(4).default("IDR"),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * Persist a single takeoff measurement against a drawing revision. The quantity
 * is derived server-side from the geometry + scale (never trusted from the
 * client) so the stored raw_quantity is authoritative for re-costing.
 */
export async function saveTakeoffMeasurement(
  input: z.input<typeof saveSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireInternalUser();
    const organizationId = await requireOrgId();
    const parsed = saveSchema.parse(input);
    const db = requireDb();

    // Verify the revision belongs to this org (cross-tenant guard).
    const [rev] = await db
      .select({ id: drawingRevisions.id })
      .from(drawingRevisions)
      .where(
        and(
          eq(drawingRevisions.id, parsed.drawingRevisionId),
          eq(drawingRevisions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rev) return { ok: false, error: "drawing_revision_not_found" };

    const qty = deriveQuantity(
      parsed.kind,
      parsed.geometry,
      parsed.scaleSnapshot ?? null,
    );
    const unit = parsed.unitOfMeasure ?? TAKEOFF_UNIT[parsed.kind];

    const [row] = await db
      .insert(takeoffMeasurements)
      .values({
        organizationId,
        drawingRevisionId: parsed.drawingRevisionId,
        label: parsed.label,
        kind: parsed.kind,
        unitOfMeasure: unit,
        assembly: parsed.assembly ?? null,
        rawQuantity: String(qty),
        unitRateMinor: BigInt(parsed.unitRateMinor),
        currency: parsed.currency,
        geometry: parsed.geometry,
        scaleSnapshot: parsed.scaleSnapshot ?? null,
        notes: parsed.notes ?? null,
        createdBy: ctx.appUser?.id ?? null,
      })
      .returning();

    await recordAuditEvent({
      action: "takeoff_measurement.create",
      entityType: "takeoff_measurement",
      entityId: row.id,
      actorUserId: ctx.appUser?.id ?? null,
      after: {
        kind: row.kind,
        unitOfMeasure: row.unitOfMeasure,
        rawQuantity: row.rawQuantity,
        unitRateMinor: row.unitRateMinor.toString(),
        currency: row.currency,
      },
      metadata: { drawingRevisionId: parsed.drawingRevisionId },
    });

    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "save_failed" };
  }
}

// ───────────────────────── edit / re-cost ─────────────────────────

const editSchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(200).optional(),
  unitOfMeasure: z.string().min(1).max(16).optional(),
  assembly: z.string().max(120).nullable().optional(),
  unitRateMinor: z.string().regex(/^\d+$/).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * Edit a persisted measurement's label / unit / assembly / rate and re-cost it.
 * If the measurement is already linked to a BOQ line, that line is updated IN
 * PLACE (same itemCode) and the parent document totals are recomputed — so the
 * round-trip never spawns a duplicate BOQ line. Quantity is NOT editable here;
 * it derives from the geometry (re-measure to change it).
 */
export async function editTakeoffMeasurement(
  input: z.input<typeof editSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await requireInternalUser();
    const organizationId = await requireOrgId();
    const parsed = editSchema.parse(input);
    const db = requireDb();

    const [existing] = await db
      .select()
      .from(takeoffMeasurements)
      .where(
        and(
          eq(takeoffMeasurements.id, parsed.id),
          eq(takeoffMeasurements.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!existing) return { ok: false, error: "takeoff_not_found" };

    const nextRate =
      parsed.unitRateMinor != null
        ? BigInt(parsed.unitRateMinor)
        : existing.unitRateMinor;
    const nextLabel = parsed.label ?? existing.label;
    const nextUnit = parsed.unitOfMeasure ?? existing.unitOfMeasure;
    const nextAssembly =
      parsed.assembly !== undefined ? parsed.assembly : existing.assembly;
    const nextNotes = parsed.notes !== undefined ? parsed.notes : existing.notes;

    await db.transaction(async (tx) => {
      await tx
        .update(takeoffMeasurements)
        .set({
          label: nextLabel,
          unitOfMeasure: nextUnit,
          assembly: nextAssembly,
          unitRateMinor: nextRate,
          notes: nextNotes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(takeoffMeasurements.id, parsed.id),
            eq(takeoffMeasurements.organizationId, organizationId),
          ),
        );

      // Re-cost the linked BOQ line in place, if any.
      if (existing.boqItemId) {
        const [item] = await tx
          .select({
            id: boqItems.id,
            sectionId: boqItems.sectionId,
          })
          .from(boqItems)
          .where(
            and(
              eq(boqItems.id, existing.boqItemId),
              eq(boqItems.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (item) {
          await tx
            .update(boqItems)
            .set({
              description: nextLabel || `Takeoff ${existing.kind}`,
              unitOfMeasure: nextUnit,
              unitRateMinor: nextRate,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(boqItems.id, item.id),
                eq(boqItems.organizationId, organizationId),
              ),
            );
          const [section] = await tx
            .select({ docId: boqSections.boqDocumentId })
            .from(boqSections)
            .where(eq(boqSections.id, item.sectionId))
            .limit(1);
          if (section) {
            await recomputeTotalsTx(tx, section.docId, organizationId);
          }
        }
      }
    });

    await recordAuditEvent({
      action: "takeoff_measurement.update",
      entityType: "takeoff_measurement",
      entityId: parsed.id,
      actorUserId: ctx.appUser?.id ?? null,
      before: {
        label: existing.label,
        unitRateMinor: existing.unitRateMinor.toString(),
      },
      after: {
        label: nextLabel,
        unitRateMinor: nextRate.toString(),
      },
      metadata: { recostedBoqItemId: existing.boqItemId },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "edit_failed" };
  }
}

// ───────────────────────── delete ─────────────────────────

const deleteSchema = z.object({
  id: z.string().uuid(),
  /** Also delete the linked BOQ line (default true). */
  cascadeBoqLine: z.boolean().default(true),
});

/**
 * Delete a persisted measurement. By default also removes the BOQ line it was
 * pushed into (and recomputes totals); pass cascadeBoqLine=false to keep the
 * BOQ line and just drop the takeoff record.
 */
export async function deleteTakeoffMeasurement(
  input: z.input<typeof deleteSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await requireInternalUser();
    const organizationId = await requireOrgId();
    const parsed = deleteSchema.parse(input);
    const db = requireDb();

    const [existing] = await db
      .select()
      .from(takeoffMeasurements)
      .where(
        and(
          eq(takeoffMeasurements.id, parsed.id),
          eq(takeoffMeasurements.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!existing) return { ok: false, error: "takeoff_not_found" };

    await db.transaction(async (tx) => {
      if (parsed.cascadeBoqLine && existing.boqItemId) {
        const [item] = await tx
          .select({ id: boqItems.id, sectionId: boqItems.sectionId })
          .from(boqItems)
          .where(
            and(
              eq(boqItems.id, existing.boqItemId),
              eq(boqItems.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (item) {
          const [section] = await tx
            .select({ docId: boqSections.boqDocumentId })
            .from(boqSections)
            .where(eq(boqSections.id, item.sectionId))
            .limit(1);
          await tx
            .delete(boqItems)
            .where(
              and(
                eq(boqItems.id, item.id),
                eq(boqItems.organizationId, organizationId),
              ),
            );
          if (section) {
            await recomputeTotalsTx(tx, section.docId, organizationId);
          }
        }
      }
      await tx
        .delete(takeoffMeasurements)
        .where(
          and(
            eq(takeoffMeasurements.id, parsed.id),
            eq(takeoffMeasurements.organizationId, organizationId),
          ),
        );
    });

    await recordAuditEvent({
      action: "takeoff_measurement.delete",
      entityType: "takeoff_measurement",
      entityId: existing.id,
      actorUserId: ctx.appUser?.id ?? null,
      before: {
        kind: existing.kind,
        rawQuantity: existing.rawQuantity,
        unitRateMinor: existing.unitRateMinor.toString(),
      },
      metadata: {
        cascadeBoqLine: parsed.cascadeBoqLine,
        boqItemId: existing.boqItemId,
      },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "delete_failed",
    };
  }
}

// ───────────────────── push / re-push into BOQ ─────────────────────

const pushSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
});

/**
 * Push (or re-push) a persisted measurement into a BOQ section as a costed line
 * (qty × rate = total via the GENERATED total_minor column). Idempotent on the
 * round-trip link: if this measurement already points at a live BOQ line, that
 * line is UPDATED in place (and moved to the chosen section); otherwise a new
 * boq_item is created and linked back. Recomputes affected document totals.
 */
export async function pushTakeoffToBoq(
  input: z.input<typeof pushSchema>,
): Promise<
  | { ok: true; boqItemId: string; created: boolean }
  | { ok: false; error: string }
> {
  try {
    const ctx = await requireInternalUser();
    const organizationId = await requireOrgId();
    const parsed = pushSchema.parse(input);
    const db = requireDb();

    const [m] = await db
      .select()
      .from(takeoffMeasurements)
      .where(
        and(
          eq(takeoffMeasurements.id, parsed.id),
          eq(takeoffMeasurements.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!m) return { ok: false, error: "takeoff_not_found" };

    const [section] = await db
      .select({ id: boqSections.id, docId: boqSections.boqDocumentId })
      .from(boqSections)
      .where(
        and(
          eq(boqSections.id, parsed.sectionId),
          eq(boqSections.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!section) return { ok: false, error: "boq_section_not_found" };

    const qty = Number(m.rawQuantity ?? 0);
    if (!(qty > 0)) return { ok: false, error: "quantity_must_be_positive" };
    const description = m.label || `Takeoff ${m.kind}`;
    const docIdsToRecompute = new Set<string>([section.docId]);

    const result = await db.transaction(async (tx) => {
      // Does the link still point at a live BOQ line?
      let liveItemId: string | null = null;
      if (m.boqItemId) {
        const [live] = await tx
          .select({ id: boqItems.id, sectionId: boqItems.sectionId })
          .from(boqItems)
          .where(
            and(
              eq(boqItems.id, m.boqItemId),
              eq(boqItems.organizationId, organizationId),
            ),
          )
          .limit(1);
        if (live) {
          liveItemId = live.id;
          // The old line may live in a different document — recompute both.
          const [oldSection] = await tx
            .select({ docId: boqSections.boqDocumentId })
            .from(boqSections)
            .where(eq(boqSections.id, live.sectionId))
            .limit(1);
          if (oldSection) docIdsToRecompute.add(oldSection.docId);
        }
      }

      let created: boolean;
      let boqItemId: string;
      if (liveItemId) {
        await tx
          .update(boqItems)
          .set({
            sectionId: parsed.sectionId,
            description,
            quantity: String(qty),
            unitOfMeasure: m.unitOfMeasure,
            unitRateMinor: m.unitRateMinor,
            rateCurrency: m.currency,
            notes: "Source: drawing takeoff (round-trip)",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(boqItems.id, liveItemId),
              eq(boqItems.organizationId, organizationId),
            ),
          );
        boqItemId = liveItemId;
        created = false;
      } else {
        const [item] = await tx
          .insert(boqItems)
          .values({
            organizationId,
            sectionId: parsed.sectionId,
            itemCode: `TO-${Date.now().toString(36).toUpperCase()}`,
            description,
            quantity: String(qty),
            unitOfMeasure: m.unitOfMeasure,
            unitRateMinor: m.unitRateMinor,
            rateCurrency: m.currency,
            notes: "Source: drawing takeoff",
          })
          .returning({ id: boqItems.id });
        boqItemId = item.id;
        created = true;
      }

      // Persist the round-trip link + target section back onto the takeoff.
      await tx
        .update(takeoffMeasurements)
        .set({
          boqItemId,
          boqSectionId: parsed.sectionId,
          updatedAt: new Date(),
        })
        .where(eq(takeoffMeasurements.id, m.id));

      for (const docId of docIdsToRecompute) {
        await recomputeTotalsTx(tx, docId, organizationId);
      }
      return { boqItemId, created };
    });

    await recordAuditEvent({
      action: result.created ? "boq_item.create" : "boq_item.update",
      entityType: "boq_item",
      entityId: result.boqItemId,
      actorUserId: ctx.appUser?.id ?? null,
      after: {
        description,
        quantity: String(qty),
        unitOfMeasure: m.unitOfMeasure,
        unitRateMinor: m.unitRateMinor.toString(),
        currency: m.currency,
      },
      metadata: {
        source: "drawing_takeoff_round_trip",
        takeoffMeasurementId: m.id,
        sectionId: parsed.sectionId,
      },
    });

    return { ok: true, boqItemId: result.boqItemId, created: result.created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "push_failed" };
  }
}
