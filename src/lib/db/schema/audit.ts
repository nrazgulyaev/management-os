import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { organizations } from "./saas";

/**
 * Append-only audit log. Writes only — never updated.
 * Mirrored from docs/DATABASE_SCHEMA.md §13.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** TENANCY (migration 0154): nullable org anchor. The audit log is mostly
     *  platform-global (actor + entity span every tenant); the column is added
     *  and backfilled from the actor's org so future per-tenant audit filtering
     *  has a local anchor. NOT threaded into writes/reads here. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    // dotted action: e.g. project.create, villa.update, booking.create
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    index("audit_events_actor_idx").on(t.actorUserId, t.createdAt),
    index("audit_events_action_idx").on(t.action),
    index("audit_events_organization_idx").on(t.organizationId),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
