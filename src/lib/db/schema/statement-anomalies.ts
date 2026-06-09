/**
 * Phase 2 data-wiring PR 1 (Mgmt slice) — statement_anomalies.
 *
 * Append-only row per anomaly the statement-anomaly-detector agent
 * finds while preparing an owner statement. Cascades with the
 * statement so retracting a statement drops its anomalies.
 *
 * Surfaced on the Statements cabinet as flags + the Anomaly inspector.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Mgmt P1.
 */

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ownerStatements } from "./finance";
import { organizations } from "./saas";
import { appUsers } from "./identity";

export type StatementAnomalyKind =
  | "supplier_cost_spike"
  | "occupancy_drop"
  | "channel_mix_shift"
  | "one_off_charge"
  | "tax_anomaly"
  | "other";

export type StatementAnomalySeverity = "info" | "warn" | "critical";

export const statementAnomalies = pgTable(
  "statement_anomalies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via owner_statements.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => ownerStatements.id, { onDelete: "cascade" }),
    /** Enum: supplier_cost_spike | occupancy_drop | channel_mix_shift | one_off_charge | tax_anomaly | other. */
    kind: text("kind").notNull(),
    /** Enum: info | warn | critical. */
    severity: text("severity").notNull(),
    /** Structured agent finding — which line, magnitude, comparison window. */
    payload: jsonb("payload").notNull(),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    index("statement_anomalies_statement_fired_idx").on(t.statementId, t.firedAt),
    index("statement_anomalies_kind_severity_fired_idx").on(t.kind, t.severity, t.firedAt),
    index("statement_anomalies_org_idx").on(t.organizationId),
  ],
);

export type StatementAnomaly = typeof statementAnomalies.$inferSelect;
export type NewStatementAnomaly = typeof statementAnomalies.$inferInsert;
