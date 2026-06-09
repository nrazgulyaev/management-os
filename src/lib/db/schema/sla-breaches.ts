/**
 * Phase 2 data-wiring PR 1 (Mgmt slice) — sla_breaches.
 *
 * Append-only log of maintenance-ticket SLA breaches. One row per
 * breach event (not per ticket — a ticket can breach the response
 * SLA AND later breach the resolution SLA). Drives the breach pill
 * on the Operations cabinet maintenance card.
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Mgmt P1.
 */

import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { maintenanceTickets } from "./operations";
import { organizations } from "./saas";

export const slaBreaches = pgTable(
  "sla_breaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => maintenanceTickets.id, { onDelete: "cascade" }),
    breachedAt: timestamp("breached_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Computed at resolve time — minutes from breach to resolution. */
    breachMinutes: integer("breach_minutes").notNull(),
  },
  (t) => [
    index("sla_breaches_ticket_idx").on(t.ticketId),
    index("sla_breaches_breached_at_idx").on(t.breachedAt),
    index("sla_breaches_org_idx").on(t.organizationId),
  ],
);

export type SlaBreach = typeof slaBreaches.$inferSelect;
export type NewSlaBreach = typeof slaBreaches.$inferInsert;
