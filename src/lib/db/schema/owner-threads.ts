/**
 * Phase 2 data-wiring PR 3 (Owner slice) — owner_threads + owner_messages.
 *
 * One thread per conversation between an owner and Mgmt staff or
 * the concierge agent. The Owner Portal inbox surfaces these.
 *
 * `actorId` is union-typed by `actorKind`:
 *   - owner / mgmt_staff   → app_users.id (NOT enforced via FK because
 *                            owners aren't app_users today — owners
 *                            authenticate via a separate auth flow)
 *   - concierge_agent      → null (or agent code string in the future)
 *   - system               → null
 *
 * Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Owner Portal.
 */

import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { owners } from "./ownership";
import { organizations } from "./saas";

export type OwnerThreadKind =
  | "general"
  | "dispute"
  | "personal_stay_request"
  | "maintenance_question"
  | "tax_question"
  | "onboarding"
  | "offboarding"
  | "other";

export type OwnerThreadStatus = "open" | "resolved" | "escalated" | "archived";

export const ownerThreads = pgTable(
  "owner_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0152): nullable org anchor, backfilled via
     *  owner → ownership_shares → project.organization_id. Not threaded into
     *  queries yet; kept NULLABLE until app-layer scoping lands. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    subject: text("subject").notNull(),
    /** Enum: general | dispute | personal_stay_request | maintenance_question | tax_question | onboarding | offboarding | other. */
    kind: text("kind").notNull().default("general"),
    /** Soft reference — e.g. "statement", "booking", "maintenance_ticket". */
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    /** Denormalized — owner_messages insert path / trigger increments. */
    unreadCount: integer("unread_count").notNull().default(0),
    /** Enum: open | resolved | escalated | archived. */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("owner_threads_owner_last_msg_idx").on(t.ownerId, t.lastMessageAt),
    index("owner_threads_status_last_msg_idx").on(t.status, t.lastMessageAt),
    index("owner_threads_organization_idx").on(t.organizationId),
  ],
);

export type OwnerThread = typeof ownerThreads.$inferSelect;
export type NewOwnerThread = typeof ownerThreads.$inferInsert;

export type OwnerMessageActorKind = "owner" | "mgmt_staff" | "concierge_agent" | "system";

export const ownerMessages = pgTable(
  "owner_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => ownerThreads.id, { onDelete: "cascade" }),
    /** Enum: owner | mgmt_staff | concierge_agent | system. */
    actorKind: text("actor_kind").notNull(),
    /** app_users.id when actorKind ∈ (owner, mgmt_staff); null for agent/system. */
    actorId: uuid("actor_id"),
    body: text("body").notNull(),
    /** Agent-surfaced structured actions: [{ kind: 'book_chef' | 'approve_comp' | …, payload }]. */
    inlineActions: jsonb("inline_actions"),
    /** Array of file refs (PDFs, photos). */
    attachments: jsonb("attachments"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    readByOwnerAt: timestamp("read_by_owner_at", { withTimezone: true }),
  },
  (t) => [
    index("owner_messages_thread_sent_idx").on(t.threadId, t.sentAt),
    index("owner_messages_actor_kind_sent_idx").on(t.actorKind, t.sentAt),
  ],
);

export type OwnerMessage = typeof ownerMessages.$inferSelect;
export type NewOwnerMessage = typeof ownerMessages.$inferInsert;
