/**
 * Phase 2 data-wiring PR 2 (Dev slice) — rfis.
 *
 * Requests for information from site supervisor / contractor to
 * the design team. Drives the RFI inbox on the Projects cabinet.
 * The rfi-router agent (event-triggered on compose) sets
 * `routed_to_contact_id` + flips `routed_by_agent = true` for audit.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1.
 */

import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { contacts } from "./contacts";
import { organizations } from "./saas";

export type RfiDiscipline =
  | "structural"
  | "architectural"
  | "mep"
  | "finishes"
  | "landscape"
  | "civil"
  | "other";

export type RfiPriority = "low" | "medium" | "high" | "critical";

export const rfis = pgTable(
  "rfis",
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
    /** e.g. RFI-EV02-0014. */
    ref: text("ref").notNull().unique(),
    question: text("question").notNull(),
    /** Enum: structural | architectural | mep | finishes | landscape | civil | other. */
    discipline: text("discipline").notNull(),
    routedToContactId: uuid("routed_to_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** True when the rfi-router agent set routed_to_contact_id (audit). */
    routedByAgent: boolean("routed_by_agent").notNull().default(false),
    /** Enum: low | medium | high | critical. */
    priority: text("priority").notNull().default("medium"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    responseText: text("response_text"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("rfis_project_opened_idx").on(t.projectId, t.openedAt),
    index("rfis_routed_contact_opened_idx").on(t.routedToContactId, t.openedAt),
    index("rfis_organization_idx").on(t.organizationId),
  ],
);

export type Rfi = typeof rfis.$inferSelect;
export type NewRfi = typeof rfis.$inferInsert;
