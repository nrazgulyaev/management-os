/**
 * CRM ACTIVITY TIMELINE (#169 · migration 0144) — crm_activities.
 *
 * The unified, chronological activity stream behind the CRM relationship layer
 * (the Attio / Salesforce core). A single feed for every CRM subject — owner,
 * contact, lead, buyer — keyed by a polymorphic (subjectType, subjectId) pair.
 *
 * DISTINCT from:
 *   - `auditEvents`        → system-of-record, internal who-mutated-what.
 *   - `ownerActivityLog`   → owner-PORTAL-facing narrative, owner-only.
 * This is the INTERNAL CRM operator timeline (notes, status changes, calls,
 * emails, messages, tasks) that detail pages render and other CRM units write.
 *
 * TENANCY: organizationId is NULLABLE (no `.notNull`) per the migration policy
 * for tenancy on a fresh table — the writer threads org in via requireOrgId().
 *
 * subjectId is a SOFT reference (no FK) to avoid an import cycle across the
 * owners / contacts / sales schema packages; subject ownership is validated in
 * the action layer.
 */

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Multi-tenant scope. Nullable per tenancy migration policy. */
    organizationId: uuid("organization_id"),
    /** Enum: owner | contact | lead | buyer. */
    subjectType: text("subject_type").notNull(),
    /** Soft reference to the subject row (no FK). */
    subjectId: uuid("subject_id").notNull(),
    /** Enum: note | message | status_change | call | task | email. */
    kind: text("kind").notNull(),
    /** Short headline rendered in the feed. */
    title: text("title").notNull(),
    /** Optional longer free-text body. */
    body: text("body"),
    /** Soft link to app_users; null for system-generated events. */
    actorAppUserId: uuid("actor_app_user_id"),
    /** Cached display name so the feed renders without a join. */
    actorName: text("actor_name"),
    /** Free-form structured payload (e.g. { fromStatus, toStatus, channel }). */
    metadata: jsonb("metadata"),
    /** When the activity happened (may be backdated for imports). */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_activities_subject_idx").on(t.subjectType, t.subjectId, t.occurredAt),
    index("crm_activities_org_idx").on(t.organizationId, t.occurredAt),
    index("crm_activities_kind_idx").on(t.subjectType, t.subjectId, t.kind),
  ],
);

export type CrmActivity = typeof crmActivities.$inferSelect;
export type NewCrmActivity = typeof crmActivities.$inferInsert;
