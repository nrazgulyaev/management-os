/**
 * Stage 3.B — Development OS-specific AI tables.
 *
 * Kept separate from `ai.ts` (which holds Management OS AI tables —
 * runs, tool calls, ops summaries) to keep import surfaces small. Both
 * sets reference `ai_assistant_runs.id` for cost lineage.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  numeric,
  boolean,
  bigint,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { aiAssistantRuns } from "./ai";
import {
  siteReports,
  vendors,
  materialPurchaseOrders,
  materialDeliveries,
} from "./site-operations";
import { investors, distributions } from "./investor-capital";
import { devCostCategories, devBankAccounts, devTransactions } from "./dev-finance";
import { documents } from "./documents";
import { projects } from "./projects";

/**
 * One HITL draft per site report. Active analyses (draft / approved /
 * edited_approved) are constrained to one-per-report by a partial
 * unique index in the migration; superseded + rejected rows accumulate
 * for audit.
 */
export const aiConstructionAnalyses = pgTable(
  "ai_construction_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteReportId: uuid("site_report_id")
      .notNull()
      .references(() => siteReports.id, { onDelete: "cascade" }),

    draftSummary: text("draft_summary").notNull(),
    draftSummaryTranslations: jsonb("draft_summary_translations")
      .notNull()
      .default(sql`'{}'::jsonb`),
    safetyStatus: text("safety_status").notNull(),
    safetyConcerns: text("safety_concerns").array(),
    immediateActionsRecommended: text("immediate_actions_recommended").array(),
    estimatedCompletionPercent: numeric("estimated_completion_percent", {
      precision: 5,
      scale: 2,
    }),
    onTrackVsBudget: boolean("on_track_vs_budget"),
    delayRiskFlags: text("delay_risk_flags").array(),
    workforceFlags: text("workforce_flags").array(),
    vendorFlags: text("vendor_flags").array(),
    recommendedReviewerActions: text("recommended_reviewer_actions").array(),

    rawResponse: text("raw_response").notNull(),
    aiRunId: uuid("ai_run_id").references(() => aiAssistantRuns.id, {
      onDelete: "set null",
    }),

    status: text("status").notNull().default("draft"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewerEdits: jsonb("reviewer_edits"),
    rejectionReason: text("rejection_reason"),

    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_construction_analyses_one_active_idx")
      .on(t.siteReportId)
      .where(sql`status IN ('draft','approved','edited_approved')`),
    index("ai_construction_analyses_report_idx").on(t.siteReportId),
    index("ai_construction_analyses_status_idx").on(t.status),
    index("ai_construction_analyses_safety_idx").on(t.safetyStatus),
  ],
);

export type AiConstructionAnalysis = typeof aiConstructionAnalyses.$inferSelect;
export type NewAiConstructionAnalysis =
  typeof aiConstructionAnalyses.$inferInsert;

/**
 * Investor Q&A drafts — operator pastes a question, agent drafts a
 * response, operator approves/edits/sends. No UNIQUE on investor_id —
 * many questions per investor over time.
 */
export const aiInvestorQaDrafts = pgTable(
  "ai_investor_qa_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),

    question: text("question").notNull(),
    questionLanguage: text("question_language"),
    responseLanguage: text("response_language").notNull(),

    draftResponse: text("draft_response").notNull(),
    contextSummary: jsonb("context_summary").notNull(),
    rawResponse: text("raw_response").notNull(),
    aiRunId: uuid("ai_run_id").references(() => aiAssistantRuns.id, {
      onDelete: "set null",
    }),

    status: text("status").notNull().default("draft"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    approvedResponse: text("approved_response"),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentVia: text("sent_via"),
    deliveryLogId: uuid("delivery_log_id"),

    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_investor_qa_drafts_investor_idx").on(t.investorId),
    index("ai_investor_qa_drafts_status_idx").on(t.status),
    index("ai_investor_qa_drafts_generated_idx").on(
      sql`${t.generatedAt} desc`,
    ),
  ],
);

export type AiInvestorQaDraft = typeof aiInvestorQaDrafts.$inferSelect;
export type NewAiInvestorQaDraft = typeof aiInvestorQaDrafts.$inferInsert;

/**
 * Stage 3.C — Distribution Preview suggestions.
 * One suggestion per (project, generation event); partial unique index
 * keeps "one ACTIVE suggestion per project" while preserving audit
 * history (superseded + rejected rows accumulate).
 */
export const aiDistributionSuggestions = pgTable(
  "ai_distribution_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    suggestedAmountUsdMinor: bigint("suggested_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),
    suggestedDistributionType: text("suggested_distribution_type").notNull(),
    suggestedEffectiveDate: date("suggested_effective_date").notNull(),

    currentCompanyBalanceUsdMinor: bigint(
      "current_company_balance_usd_minor",
      { mode: "bigint" },
    ).notNull(),
    currentProjectBalanceUsdMinor: bigint(
      "current_project_balance_usd_minor",
      { mode: "bigint" },
    ).notNull(),
    recentInflows90dUsdMinor: bigint("recent_inflows_90d_usd_minor", {
      mode: "bigint",
    }).notNull(),
    recentOutflows90dUsdMinor: bigint("recent_outflows_90d_usd_minor", {
      mode: "bigint",
    }).notNull(),
    netCashFlow90dUsdMinor: bigint("net_cash_flow_90d_usd_minor", {
      mode: "bigint",
    }).notNull(),
    isSelfSustaining: boolean("is_self_sustaining").notNull(),
    bufferAmountUsdMinor: bigint("buffer_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),

    outstandingCapitalUsdMinor: bigint("outstanding_capital_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    outstandingInvoicesUsdMinor: bigint("outstanding_invoices_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    outstandingCommitmentsUsdMinor: bigint(
      "outstanding_commitments_usd_minor",
      { mode: "bigint" },
    )
      .notNull()
      .default(0n),

    reasoning: text("reasoning").notNull(),
    confidenceLevel: text("confidence_level").notNull(),
    riskFactors: text("risk_factors").array(),
    recommendations: text("recommendations").array(),

    allocationPreview: jsonb("allocation_preview")
      .notNull()
      .default(sql`'[]'::jsonb`),

    rawResponse: text("raw_response").notNull(),
    aiRunId: uuid("ai_run_id").references(() => aiAssistantRuns.id, {
      onDelete: "set null",
    }),
    triggeredBy: text("triggered_by").notNull().default("manual_request"),

    status: text("status").notNull().default("draft"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewerNotes: text("reviewer_notes"),

    relatedDistributionId: uuid("related_distribution_id").references(
      () => distributions.id,
      { onDelete: "set null" },
    ),

    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_distribution_suggestions_one_active_idx")
      .on(t.projectId)
      .where(sql`status IN ('draft','reviewed')`),
    index("ai_distribution_suggestions_project_idx").on(t.projectId),
    index("ai_distribution_suggestions_status_idx").on(t.status),
    index("ai_distribution_suggestions_generated_idx").on(
      sql`${t.generatedAt} desc`,
    ),
  ],
);

export type AiDistributionSuggestion =
  typeof aiDistributionSuggestions.$inferSelect;
export type NewAiDistributionSuggestion =
  typeof aiDistributionSuggestions.$inferInsert;

/**
 * Stage 3.C — AI Document Understanding extractions.
 * One row per (document × generation). Re-extraction supersedes the
 * previous active row.
 */
export const aiDocumentExtractions = pgTable(
  "ai_document_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),

    detectedLanguage: text("detected_language"),
    detectedQuality: text("detected_quality"),

    extractedData: jsonb("extracted_data")
      .notNull()
      .default(sql`'{}'::jsonb`),

    suggestedVendorId: uuid("suggested_vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    suggestedProjectId: uuid("suggested_project_id").references(
      () => projects.id,
      { onDelete: "set null" },
    ),
    suggestedCategoryId: uuid("suggested_category_id").references(
      () => devCostCategories.id,
      { onDelete: "set null" },
    ),
    suggestedPoId: uuid("suggested_po_id").references(
      () => materialPurchaseOrders.id,
      { onDelete: "set null" },
    ),
    suggestedBankAccountId: uuid("suggested_bank_account_id").references(
      () => devBankAccounts.id,
      { onDelete: "set null" },
    ),

    vendorMatchConfidence: numeric("vendor_match_confidence", {
      precision: 3,
      scale: 2,
    }),
    categoryMatchConfidence: numeric("category_match_confidence", {
      precision: 3,
      scale: 2,
    }),

    reasoning: text("reasoning").notNull(),
    ambiguities: text("ambiguities").array(),

    rawResponse: text("raw_response").notNull(),
    aiRunId: uuid("ai_run_id").references(() => aiAssistantRuns.id, {
      onDelete: "set null",
    }),

    status: text("status").notNull().default("pending_review"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewerEdits: jsonb("reviewer_edits"),
    rejectionReason: text("rejection_reason"),

    createdTransactionId: uuid("created_transaction_id").references(
      () => devTransactions.id,
      { onDelete: "set null" },
    ),
    createdDeliveryId: uuid("created_delivery_id").references(
      () => materialDeliveries.id,
      { onDelete: "set null" },
    ),

    uploadedBy: uuid("uploaded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_document_extractions_one_active_idx")
      .on(t.documentId)
      .where(
        sql`status IN ('pending_review','approved','edited_approved','duplicate')`,
      ),
    index("ai_document_extractions_document_idx").on(t.documentId),
    index("ai_document_extractions_type_idx").on(t.documentType),
    index("ai_document_extractions_status_idx").on(t.status),
    index("ai_document_extractions_generated_idx").on(
      sql`${t.generatedAt} desc`,
    ),
  ],
);

export type AiDocumentExtraction = typeof aiDocumentExtractions.$inferSelect;
export type NewAiDocumentExtraction =
  typeof aiDocumentExtractions.$inferInsert;
