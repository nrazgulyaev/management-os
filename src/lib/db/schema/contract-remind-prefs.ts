/**
 * Contract-group auto-remind preferences (migration 0130). One row per
 * contract group records whether that buyer's installment plan is opted
 * into automatic payment reminders. Backs the per-buyer auto-remind toggle
 * on the operator buyers+installments desk (/development-os/installments).
 * A missing row means auto-remind is off.
 */

import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { contractGroups } from "./sales";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const contractGroupRemindPrefs = pgTable(
  "contract_group_remind_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractGroupId: uuid("contract_group_id")
      .notNull()
      .references(() => contractGroups.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0152 add, 0158 NOT NULL): org anchor from the
     *  reminder action's requireOrgId() (thread-portal unit). */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, {
        onDelete: "restrict",
      }),
    autoRemindEnabled: boolean("auto_remind_enabled").notNull().default(false),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
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
    index("contract_group_remind_prefs_group_uq").on(t.contractGroupId),
    index("contract_group_remind_prefs_organization_idx").on(t.organizationId),
  ],
);

export type ContractGroupRemindPref =
  typeof contractGroupRemindPrefs.$inferSelect;
export type NewContractGroupRemindPref =
  typeof contractGroupRemindPrefs.$inferInsert;
