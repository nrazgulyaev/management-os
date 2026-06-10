/**
 * PLATFORM SUPPORT INBOX (migration 0165) — support_threads + support_messages.
 *
 * One thread per conversation between a customer org and the platform team.
 * The org side lives at /dashboard/settings/support (org-scoped); the
 * operator side at /platform/support (super-admin, all tenants) — the live
 * descendant of the superseded super-admin mock 06-support-inbox.html.
 *
 * Lifecycle: open → pending (platform replied, waiting on the customer) →
 * closed (closed_at stamped). Reopen flips closed → open and nulls closed_at;
 * an org reply on a pending thread flips it back to open (back in the
 * platform queue).
 *
 * v1 scope: no attachments, no email bridge, no SLA timers, no assignment.
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const SUPPORT_THREAD_STATUSES = ["open", "pending", "closed"] as const;
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];

export const SUPPORT_THREAD_PRIORITIES = ["normal", "high", "urgent"] as const;
export type SupportThreadPriority = (typeof SUPPORT_THREAD_PRIORITIES)[number];

export const supportThreads = pgTable(
  "support_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** TENANCY: org anchor — every read/write is ANDed with this on the org
     *  side; the platform side reads across all orgs (super-admin gate). */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    /** Enum: open | pending | closed (pending = waiting on the customer). */
    status: text("status").notNull().default("open"),
    /** Enum: normal | high | urgent. */
    priority: text("priority").notNull().default("normal"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Bumped on every message + status transition — inbox sort key. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("support_threads_org_updated_idx").on(t.organizationId, t.updatedAt),
    index("support_threads_status_updated_idx").on(
      t.status,
      t.priority,
      t.updatedAt,
    ),
  ],
);

export type SupportThread = typeof supportThreads.$inferSelect;
export type NewSupportThread = typeof supportThreads.$inferInsert;

export const SUPPORT_AUTHOR_SIDES = ["org", "platform"] as const;
export type SupportAuthorSide = (typeof SUPPORT_AUTHOR_SIDES)[number];

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => supportThreads.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    /** Enum: org (customer member) | platform (super-admin operator). */
    authorSide: text("author_side").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("support_messages_thread_created_idx").on(t.threadId, t.createdAt),
  ],
);

export type SupportMessage = typeof supportMessages.$inferSelect;
export type NewSupportMessage = typeof supportMessages.$inferInsert;
