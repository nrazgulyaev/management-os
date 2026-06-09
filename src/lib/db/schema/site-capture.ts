/**
 * Site-supervisor field-capture frames (migration 0127).
 *
 * One row per captured frame on the mobile site-supervisor cabinet.
 * `frameType` discriminates the payload (photo | incident | voice |
 * note | daily_summary). Org-scoped, money-free. See the migration
 * header for the per-type column contract.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { projects } from "./projects";
import { documents } from "./documents";
import { appUsers } from "./identity";

export const siteCaptureFrames = pgTable(
  "site_capture_frames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    // photo | incident | voice | note | daily_summary
    frameType: text("frame_type").notNull(),
    activeZone: text("active_zone"),
    crewOnShift: integer("crew_on_shift"),
    // incident severity: high | normal
    severity: text("severity"),
    title: text("title"),
    body: text("body"),
    photoDocumentId: uuid("photo_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    audioDocumentId: uuid("audio_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    transcriptText: text("transcript_text"),
    // none | stub | pending | done
    transcriptStatus: text("transcript_status").notNull().default("none"),
    metadata: jsonb("metadata").notNull().default({}),
    capturedBy: uuid("captured_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("site_capture_frames_org_idx").on(t.organizationId, t.capturedAt),
    index("site_capture_frames_type_idx").on(t.frameType),
    index("site_capture_frames_project_idx").on(t.projectId),
  ],
);

export type SiteCaptureFrame = typeof siteCaptureFrames.$inferSelect;
export type NewSiteCaptureFrame = typeof siteCaptureFrames.$inferInsert;
