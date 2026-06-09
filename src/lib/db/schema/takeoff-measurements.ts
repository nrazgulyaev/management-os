import {
  pgTable,
  uuid,
  text,
  numeric,
  bigint,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { drawingRevisions } from "./drawings";
import { boqItems, boqSections } from "./boq";
import { appUsers } from "./identity";

/**
 * takeoff_measurements (migration 0140) — Block 09 ESTIMATOR.
 *
 * Persistence layer for the drawing-takeoff workbench round-trip. The workbench
 * (PRs #133/#134/#138) could only PUSH a one-way line into boq_items; the
 * measured geometry, the rate, the unit, and the link back to the drawing
 * revision all lived in throwaway client state. This table makes a takeoff a
 * durable, editable record so the estimator can:
 *
 *   (a) re-open + edit/delete a persisted measurement, re-cost it, and push a
 *       revision into the BOQ (boqItemId is the round-trip link);
 *   (b) measure area / length / count with an explicit unitOfMeasure + an
 *       assembly/rate so quantity × rate creates the correct BOQ line;
 *   (c) pin each takeoff to the drawingRevisionId it was measured on, so a newer
 *       revision on the same drawing flags the takeoff STALE (derived in the
 *       reader — no denormalised flag to drift).
 *
 * Money is bigint MINOR. Org-scoped. No PSP — pure estimate quantity × rate.
 */
export const takeoffMeasurements = pgTable(
  "takeoff_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** The revision this measurement was taken on. Newer rev ⇒ stale takeoff. */
    drawingRevisionId: uuid("drawing_revision_id")
      .notNull()
      .references(() => drawingRevisions.id, { onDelete: "cascade" }),
    /** Round-trip link to the costed BOQ line; SET NULL if that line is deleted. */
    boqItemId: uuid("boq_item_id").references(() => boqItems.id, {
      onDelete: "set null",
    }),
    /** Section a push targets (kept so a re-push lands in the same section). */
    boqSectionId: uuid("boq_section_id").references(() => boqSections.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull().default(""),
    /** 'area' | 'length' | 'count'. */
    kind: text("kind").notNull(),
    /** Explicit unit: m2 / m / ea, or an estimator override. */
    unitOfMeasure: text("unit_of_measure").notNull(),
    /** Optional assembly / rate-library key (free text until a rate lib lands). */
    assembly: text("assembly"),
    /** Materialised measured quantity (mirrors boq_items.quantity precision). */
    rawQuantity: numeric("raw_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    /** Unit rate in MINOR currency units. quantity × rate = line cost. */
    unitRateMinor: bigint("unit_rate_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    currency: text("currency").notNull().default("IDR"),
    /** Image-space geometry points [{x,y},…] so quantity can be recomputed. */
    geometry: jsonb("geometry").notNull().default([]),
    /** Scale snapshot at measure time: { pixels, meters }. NULL for counts. */
    scaleSnapshot: jsonb("scale_snapshot"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("takeoff_measurements_org_idx").on(t.organizationId),
    index("takeoff_measurements_revision_idx").on(t.drawingRevisionId),
    index("takeoff_measurements_boq_item_idx").on(t.boqItemId),
    index("takeoff_measurements_section_idx").on(t.boqSectionId),
  ],
);

export type TakeoffMeasurement = typeof takeoffMeasurements.$inferSelect;
export type NewTakeoffMeasurement = typeof takeoffMeasurements.$inferInsert;

/** A geometry point in image space, as stored in the `geometry` jsonb. */
export interface TakeoffGeometryPoint {
  x: number;
  y: number;
}

/** The scale snapshot stored alongside an area/length measurement. */
export interface TakeoffScaleSnapshot {
  pixels: number;
  meters: number;
}
