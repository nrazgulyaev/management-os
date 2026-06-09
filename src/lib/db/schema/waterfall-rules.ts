/**
 * Stage 4.B.1 — Custom waterfall rules per project XOR commitment.
 *
 * The DB CHECK constraint enforces scope = 'project' XOR scope = 'commitment'
 * (exactly one of project_id / commitment_id must be set).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { capitalCommitments } from "./investor-capital";
import { organizations } from "./saas";

export const waterfallRules = pgTable(
  "waterfall_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** 'project' | 'commitment' */
    scope: text("scope").notNull(),
    projectId: uuid("project_id").references(() => projects.id),
    commitmentId: uuid("commitment_id").references(() => capitalCommitments.id),

    /** TENANCY (migration 0152): nullable org anchor, backfilled via
     *  project.organization_id (commitment-scoped rows fall back to the
     *  default org). Not threaded into queries yet; kept NULLABLE until
     *  app-layer scoping lands. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),

    ruleLabel: text("rule_label").notNull(),
    /**
     * 'generic_50_50' | 'arconique_25_credit' | 'preferred_return_then_split'
     * | 'waterfall_with_hurdle' | 'capital_first_then_split'
     * | 'tiered_promote' | 'custom'
     */
    ruleType: text("rule_type").notNull(),

    /** Shape varies by ruleType — see waterfall-helpers.ts. */
    ruleParameters: jsonb("rule_parameters")
      .notNull()
      .default({} as Record<string, unknown>),

    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: date("effective_from").notNull(),
    effectiveUntil: date("effective_until"),

    description: text("description"),
    legalReference: text("legal_reference"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("waterfall_rules_project_idx").on(t.projectId),
    commitmentIdx: index("waterfall_rules_commitment_idx").on(t.commitmentId),
    activeIdx: index("waterfall_rules_active_idx").on(t.isActive),
    typeIdx: index("waterfall_rules_type_idx").on(t.ruleType),
    organizationIdx: index("waterfall_rules_organization_idx").on(
      t.organizationId,
    ),
  }),
);

export type WaterfallRule = typeof waterfallRules.$inferSelect;
export type NewWaterfallRule = typeof waterfallRules.$inferInsert;
