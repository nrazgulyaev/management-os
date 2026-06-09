/**
 * Coordination cabinet DEPTH (migration 0139) — drawing markup persistence.
 *
 * coordination_pins (0126) anchors *items* (RFI/Submittal/Defect) to a point.
 * coordination_annotations stores the free *markup* — the DrawingViewer
 * length/area/count/note strokes — as JSON, one row per drawing revision, so
 * markup reloads on the viewer. The stroke shape mirrors the DrawingViewer
 * `DrawingStroke` model (image-space points).
 *
 * Single-tenant style (project-scoped, mirrors coordination_pins). Writes are
 * permission-gated + audit-logged in coordination-actions.ts.
 */

import {
  pgTable,
  uuid,
  jsonb,
  doublePrecision,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { drawingRevisions } from "./drawings";
import { appUsers } from "./identity";
import { organizations } from "./saas";

/** Kinds the coordination markup layer persists (superset of takeoff kinds). */
export const ANNOTATION_STROKE_KINDS = [
  "length",
  "area",
  "count",
  "note",
] as const;
export type AnnotationStrokeKind = (typeof ANNOTATION_STROKE_KINDS)[number];

export interface AnnotationPoint {
  x: number;
  y: number;
}

/** Persisted stroke — superset of the DrawingViewer `DrawingStroke`. */
export interface AnnotationStroke {
  id: string;
  kind: AnnotationStrokeKind;
  points: AnnotationPoint[];
  label?: string;
  color?: string;
}

export const coordinationAnnotations = pgTable(
  "coordination_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * TENANCY (migration 0150) — NULLABLE org column, backfilled via
     * project_id -> projects.organization_id. Not yet threaded into queries
     * and not DB-enforced NOT NULL; the app still org-scopes via project_id.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** One annotation row per revision (UNIQUE) — upsert on save. */
    revisionId: uuid("revision_id")
      .notNull()
      .unique()
      .references(() => drawingRevisions.id, { onDelete: "cascade" }),
    /** AnnotationStroke[] — image-space markup. */
    strokes: jsonb("strokes")
      .$type<AnnotationStroke[]>()
      .notNull()
      .default([]),
    /** Optional pixels-per-meter calibration carried with the markup. */
    scalePixels: doublePrecision("scale_pixels"),
    scaleMeters: doublePrecision("scale_meters"),
    updatedBy: uuid("updated_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("coordination_annotations_project_idx").on(t.projectId),
    index("coordination_annotations_organization_idx").on(t.organizationId),
  ],
);

export type CoordinationAnnotation = typeof coordinationAnnotations.$inferSelect;
export type NewCoordinationAnnotation =
  typeof coordinationAnnotations.$inferInsert;
