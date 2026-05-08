/**
 * Stage 9.F.1 — per-tenant AI agent enable/disable + custom prompt.
 *
 * Plan-tier eligibility (`plan_features` from Stage 7.B) is the upper
 * bound; this table is the per-org override that lets an admin turn
 * an agent OFF without changing plans. Default behavior: an agent
 * allowed by the plan is enabled unless this table has an explicit
 * row with `is_enabled = false`.
 */

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";

export const orgAiAgentConfig = pgTable(
  "org_ai_agent_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Matches the `agent_key` CHECK in migration 0090:
     *   qs_cost_analyst, procurement_analyst, tax_assistant,
     *   marketing_assistant, executive_business, daily_digest,
     *   weekly_plan, inbox, memory
     */
    agentKey: text("agent_key").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    /** Optional override for the canonical RUN_NOW_AGENTS kickoff prompt. */
    customPrompt: text("custom_prompt"),
    notes: text("notes"),
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
    index("org_ai_agent_config_org_idx").on(t.organizationId),
    index("org_ai_agent_config_agent_idx").on(t.agentKey),
    unique("org_ai_agent_config_org_agent_uniq").on(
      t.organizationId,
      t.agentKey,
    ),
  ],
);

export type OrgAiAgentConfig = typeof orgAiAgentConfig.$inferSelect;
export type NewOrgAiAgentConfig = typeof orgAiAgentConfig.$inferInsert;
