import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { developmentProjectMeta } from "@/lib/db/schema/development";
import { projects } from "@/lib/db/schema/projects";
import {
  capitalCommitments,
  distributions,
  investorWallets,
} from "@/lib/db/schema/investor-capital";
import {
  devBankAccounts,
  devTransactions,
  devCommitmentsLedger,
} from "@/lib/db/schema/dev-finance";
import { aiAssistantRuns } from "@/lib/db/schema/ai";
import { aiDistributionSuggestions } from "@/lib/db/schema/ai-development";
import { getAIProvider } from "@/lib/ai/providers";
import { computeCallCost } from "@/lib/ai/cost";
import { checkBudget } from "@/lib/ai/budget";
import { aiModel } from "@/lib/env";
import { previewDistribution } from "@/lib/development/server/distributions";
import {
  applyConservativeClamps,
  formatUsdMinor,
  BUFFER_MONTHS,
  COOLDOWN_DAYS,
  type DistributionContextSnapshot,
} from "./distribution-preview-helpers";

export type { DistributionContextSnapshot } from "./distribution-preview-helpers";
export { applyConservativeClamps } from "./distribution-preview-helpers";

/**
 * AI Distribution Preview Assistant.
 *
 * The agent advises whether a project should declare a distribution and
 * at what amount. This is a HITL-strict surface — every suggestion
 * lands as `status='draft'` and the operator must explicitly approve
 * before any actual distribution is declared.
 *
 * Conservative defaults are enforced IN CODE (not just the prompt):
 *   - If `is_self_sustaining = false`, suggested amount is forced to 0.
 *   - 30-day cooldown after the last `'declared'` / `'completed'` /
 *     `'executing'` distribution: agent refuses with status='draft' and
 *     amount=0, recommending "wait until cooldown expires".
 *   - Buffer requirement: 6× monthly average outflows (computed from
 *     past 90 days). Suggested amount is capped at:
 *         project_balance - buffer - outstanding_obligations
 *   - Suggested amount is clamped to the LESSER of the LLM's number
 *     and the safe envelope. The LLM cannot bypass these rails.
 *
 * Pipeline:
 *   1. Look up project + meta.
 *   2. Refuse if there's already an ACTIVE suggestion (draft/reviewed).
 *   3. Build the financial snapshot (balances, cash flow, obligations).
 *   4. Compute the safe envelope.
 *   5. Compute the cooldown gate.
 *   6. Budget check (dev_os.distribution_preview).
 *   7. Open `ai_assistant_runs` row.
 *   8. Call the provider with the snapshot. Parse + Zod-validate.
 *   9. Apply conservative clamps to the LLM's suggested amount.
 *  10. Compute `previewDistribution` allocation for the clamped amount.
 *  11. Insert `ai_distribution_suggestions` row.
 */

export const DISTRIBUTION_PREVIEW_KEY = "dev_os.distribution_preview";
const SYSTEM_PROMPT_MARKER = "DEV_OS_DISTRIBUTION_PREVIEW_V1";

export type SuggestionTriggeredBy =
  | "cron_check"
  | "manual_request"
  | "threshold_event";

export interface SuggestDistributionResult {
  status:
    | "succeeded"
    | "dry_run"
    | "skipped_active"
    | "skipped_cooldown"
    | "budget_exceeded"
    | "failed";
  suggestionId?: string;
  runId: string | null;
  errorMessage?: string;
}

const ResponseSchema = z.object({
  suggested_amount_usd_minor: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === "string" ? Number(v) : v;
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.trunc(n);
    }),
  suggested_distribution_type: z.enum([
    "capital_return",
    "profit_distribution",
    "mixed",
    "none",
  ]),
  suggested_effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  reasoning: z.string().min(1).max(8000),
  confidence_level: z.enum(["low", "medium", "high"]),
  risk_factors: z.array(z.string().max(300)).max(15).default([]),
  recommendations: z.array(z.string().max(300)).max(15).default([]),
});

export async function suggestDistribution(input: {
  projectId: string;
  triggeredBy?: SuggestionTriggeredBy;
}): Promise<SuggestDistributionResult> {
  const db = getDb();
  if (!db) {
    return { status: "failed", errorMessage: "DB unavailable", runId: null };
  }
  const triggeredBy = input.triggeredBy ?? "manual_request";

  // 1) Project lookup.
  const [proj] = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
    })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (!proj) {
    return { status: "failed", errorMessage: "Project not found", runId: null };
  }

  const [meta] = await db
    .select({ isSelfSustaining: developmentProjectMeta.isSelfSustaining })
    .from(developmentProjectMeta)
    .where(eq(developmentProjectMeta.projectId, proj.id))
    .limit(1);
  const isSelfSustaining = Boolean(meta?.isSelfSustaining);

  // 2) Active suggestion present?
  const [active] = await db
    .select({ id: aiDistributionSuggestions.id })
    .from(aiDistributionSuggestions)
    .where(
      and(
        eq(aiDistributionSuggestions.projectId, proj.id),
        sql`${aiDistributionSuggestions.status} IN ('draft','reviewed')`,
      ),
    )
    .limit(1);
  if (active) {
    return {
      status: "skipped_active",
      suggestionId: active.id,
      runId: null,
    };
  }

  // 3) Build financial snapshot.
  const snapshot = await buildSnapshot(proj.id, proj.name, isSelfSustaining);

  // 4) 30-day cooldown gate. Check happens BEFORE the provider call —
  // we never spend AI budget on a project that's still in cooldown.
  if (snapshot.cooldownActive) {
    return {
      status: "skipped_cooldown",
      runId: null,
    };
  }

  // 5) Budget.
  const budget = await checkBudget(DISTRIBUTION_PREVIEW_KEY);
  if (budget.decision === "block") {
    const [run] = await db
      .insert(aiAssistantRuns)
      .values({
        assistantKey: DISTRIBUTION_PREVIEW_KEY,
        runType: triggeredBy === "cron_check" ? "scheduled" : "manual",
        status: "budget_exceeded",
        inputSummary: `project=${proj.id} budget=${budget.reason}`,
        finishedAt: new Date(),
      })
      .returning({ id: aiAssistantRuns.id });
    return {
      status: "budget_exceeded",
      errorMessage: budget.reason,
      runId: run?.id ?? null,
    };
  }

  // 6) Open run row.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: DISTRIBUTION_PREVIEW_KEY,
      runType: triggeredBy === "cron_check" ? "scheduled" : "manual",
      status: "running",
      model: aiModel(),
      inputSummary: `project=${proj.id} self_sustaining=${isSelfSustaining} envelope=${snapshot.safeEnvelopeUsdMinor}`,
    })
    .returning({ id: aiAssistantRuns.id });
  const runId = run!.id;

  // 7) Provider call.
  const provider = getAIProvider();
  const isLive = provider.name !== "dry-run";
  const startMs = Date.now();
  const userPrompt = buildUserPrompt(snapshot);

  let providerResp;
  try {
    providerResp = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      temperature: 0.1,
      responseFormat: "json",
      timeoutMs: 30_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "provider error";
    await markRunFailed(runId, message);
    return { status: "failed", errorMessage: message, runId };
  }
  const latencyMs = Date.now() - startMs;

  // 8) Parse + validate + apply CONSERVATIVE CLAMPS in code.
  let parsed;
  try {
    const raw = JSON.parse(providerResp.content);
    parsed = ResponseSchema.parse(isLive ? raw : synthesizeDryRun(raw, snapshot));
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse failed";
    await markRunFailed(runId, `parse: ${message}`);
    return { status: "failed", errorMessage: message, runId };
  }

  // === DEFENSIVE CLAMPS ===
  const clamped = applyConservativeClamps(parsed, snapshot);

  // 9) Allocation preview using existing pure helper.
  let allocationPreview: Array<{
    commitmentId: string;
    commitmentCode: string;
    investorLegalName: string;
    capitalReturnAmountUsdMinor: string;
    profitAmountUsdMinor: string;
    totalAmountUsdMinor: string;
  }> = [];
  if (
    clamped.suggestedAmountUsdMinor > 0n &&
    clamped.suggestedDistributionType !== "none"
  ) {
    const result = await previewDistribution({
      projectId: proj.id,
      totalAmountUsdMinor: clamped.suggestedAmountUsdMinor,
      distributionType: clamped.suggestedDistributionType,
    }).catch(() => ({ allocations: [], totalAllocatedUsdMinor: 0n, unallocatedUsdMinor: 0n }));
    allocationPreview = result.allocations.map((a) => ({
      commitmentId: a.commitmentId,
      commitmentCode: a.commitmentCode,
      investorLegalName: a.investorLegalName,
      capitalReturnAmountUsdMinor: a.capitalReturnAmountUsdMinor.toString(),
      profitAmountUsdMinor: a.profitAmountUsdMinor.toString(),
      totalAmountUsdMinor: a.totalAmountUsdMinor.toString(),
    }));
  }

  // 10) Cost.
  const cost = computeCallCost({
    model: providerResp.model,
    promptTokens: providerResp.usage.promptTokens,
    completionTokens: providerResp.usage.completionTokens,
  });

  // 11) Persist suggestion.
  const [suggestion] = await db
    .insert(aiDistributionSuggestions)
    .values({
      projectId: proj.id,
      suggestedAmountUsdMinor: clamped.suggestedAmountUsdMinor,
      suggestedDistributionType: clamped.suggestedDistributionType,
      suggestedEffectiveDate: parsed.suggested_effective_date,
      currentCompanyBalanceUsdMinor: snapshot.companyBalanceUsdMinor,
      currentProjectBalanceUsdMinor: snapshot.projectBalanceUsdMinor,
      recentInflows90dUsdMinor: snapshot.inflows90dUsdMinor,
      recentOutflows90dUsdMinor: snapshot.outflows90dUsdMinor,
      netCashFlow90dUsdMinor: snapshot.netCashFlow90dUsdMinor,
      isSelfSustaining: snapshot.isSelfSustaining,
      bufferAmountUsdMinor: snapshot.bufferUsdMinor,
      outstandingCapitalUsdMinor: snapshot.outstandingCapitalUsdMinor,
      outstandingInvoicesUsdMinor: snapshot.outstandingInvoicesUsdMinor,
      outstandingCommitmentsUsdMinor: snapshot.outstandingCommitmentsUsdMinor,
      reasoning: clamped.adjustedReasoning,
      confidenceLevel: clamped.confidenceLevel,
      riskFactors: clamped.riskFactors,
      recommendations: parsed.recommendations,
      allocationPreview:
        allocationPreview as typeof aiDistributionSuggestions.$inferInsert["allocationPreview"],
      rawResponse: providerResp.content,
      aiRunId: runId,
      triggeredBy,
      status: "draft",
    })
    .returning({ id: aiDistributionSuggestions.id });

  await db
    .update(aiAssistantRuns)
    .set({
      status: isLive ? "succeeded" : "dry_run",
      model: providerResp.model,
      promptTokens: providerResp.usage.promptTokens,
      completionTokens: providerResp.usage.completionTokens,
      totalTokens: providerResp.usage.totalTokens,
      latencyMs,
      inputCostUsd: cost ? cost.inputCostUsd.toFixed(4) : null,
      outputCostUsd: cost ? cost.outputCostUsd.toFixed(4) : null,
      totalCostUsd: cost ? cost.totalCostUsd.toFixed(4) : null,
      outputSummary: clamped.adjustedReasoning.slice(0, 500),
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));

  return {
    status: isLive ? "succeeded" : "dry_run",
    suggestionId: suggestion.id,
    runId,
  };
}

/**
 * Find self-sustaining projects without an active suggestion AND with
 * the cooldown expired. Used by the cron job.
 */
export async function findProjectsNeedingSuggestion(): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ projectId: developmentProjectMeta.projectId })
    .from(developmentProjectMeta)
    .leftJoin(
      aiDistributionSuggestions,
      and(
        eq(
          aiDistributionSuggestions.projectId,
          developmentProjectMeta.projectId,
        ),
        sql`${aiDistributionSuggestions.status} IN ('draft','reviewed')`,
      ),
    )
    .where(
      and(
        eq(developmentProjectMeta.isSelfSustaining, true),
        sql`${aiDistributionSuggestions.id} IS NULL`,
      ),
    );
  return rows.map((r) => r.projectId);
}

// ===========================================================================
// Snapshot + clamp helpers
// ===========================================================================

async function buildSnapshot(
  projectId: string,
  projectName: string,
  isSelfSustaining: boolean,
): Promise<DistributionContextSnapshot> {
  const db = getDb();
  if (!db) {
    return zeroSnapshot(projectId, projectName, isSelfSustaining);
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const cooldownCutoff = new Date(
    Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );

  // Project bank balance: sum of `current_balance_minor` across accounts
  // where `project_id` matches OR (no project link AND is_company_account=true).
  // Stage 3.B simplification: project_id might not be wired on every
  // account; fall back to company total when project total is zero.
  const [bankRows, txRows, lastDistRow, walletAggregate, ledgerAggregate] =
    await Promise.all([
      db.execute<{ project_total: string; company_total: string }>(sql`
        SELECT
          coalesce(sum(current_balance_minor) FILTER (WHERE is_company_account = false), 0)::text AS project_total,
          coalesce(sum(current_balance_minor), 0)::text AS company_total
        FROM dev_bank_accounts
        WHERE is_active = true
      `),
      db.execute<{ inflows: string; outflows: string }>(sql`
        SELECT
          coalesce(sum(amount_usd_minor) FILTER (WHERE amount_usd_minor > 0), 0)::text AS inflows,
          coalesce(-sum(amount_usd_minor) FILTER (WHERE amount_usd_minor < 0), 0)::text AS outflows
        FROM dev_transactions
        WHERE transaction_date >= ${ninetyDaysAgo.toISOString().slice(0, 10)}::date
          AND project_id = ${projectId}
      `),
      db
        .select({
          completedAt: distributions.completedAt,
          declaredAt: distributions.declaredAt,
          distributionType: distributions.distributionType,
          status: distributions.status,
        })
        .from(distributions)
        .where(
          and(
            eq(distributions.projectId, projectId),
            sql`${distributions.status} IN ('declared','executing','completed')`,
          ),
        )
        .orderBy(desc(distributions.declaredAt))
        .limit(1),
      db.execute<{
        outstanding_capital: string;
      }>(sql`
        SELECT coalesce(sum(
          GREATEST(iw.total_drawn_usd_minor - iw.total_returned_capital_usd_minor, 0)
        ), 0)::text AS outstanding_capital
        FROM investor_wallets iw
        JOIN capital_commitments cc ON cc.id = iw.commitment_id
        WHERE cc.project_id = ${projectId}
      `),
      db.execute<{ outstanding_commitments: string }>(sql`
        SELECT coalesce(sum(amount_usd_minor), 0)::text AS outstanding_commitments
        FROM dev_commitments_ledger
        WHERE project_id = ${projectId}
          AND status IN ('committed','partially_settled')
      `),
    ]);

  const projectBalanceUsdMinor = BigInt(bankRows[0]?.project_total ?? "0");
  const companyBalanceUsdMinor = BigInt(bankRows[0]?.company_total ?? "0");
  const inflows90dUsdMinor = BigInt(txRows[0]?.inflows ?? "0");
  const outflows90dUsdMinor = BigInt(txRows[0]?.outflows ?? "0");
  const netCashFlow90dUsdMinor = inflows90dUsdMinor - outflows90dUsdMinor;
  const bufferUsdMinor =
    outflows90dUsdMinor > 0n
      ? (outflows90dUsdMinor / 90n) * 30n * BigInt(BUFFER_MONTHS)
      : 0n;
  const outstandingCapitalUsdMinor = BigInt(
    walletAggregate[0]?.outstanding_capital ?? "0",
  );
  const outstandingCommitmentsUsdMinor = BigInt(
    ledgerAggregate[0]?.outstanding_commitments ?? "0",
  );
  // Stage 3.C scope: invoices currently rolled into commitments — left
  // 0 here. A future stage will add `dev_invoices` and split this out.
  const outstandingInvoicesUsdMinor = 0n;

  const safeEnvelopeRaw =
    projectBalanceUsdMinor -
    bufferUsdMinor -
    outstandingCommitmentsUsdMinor -
    outstandingInvoicesUsdMinor;
  const safeEnvelopeUsdMinor =
    safeEnvelopeRaw > 0n ? safeEnvelopeRaw : 0n;

  let daysSinceLastDistribution: number | null = null;
  let lastDistributionType: string | null = null;
  let cooldownActive = false;
  const lastRow = lastDistRow[0];
  if (lastRow) {
    const ref = lastRow.completedAt ?? lastRow.declaredAt;
    if (ref) {
      const refDate = ref instanceof Date ? ref : new Date(ref);
      daysSinceLastDistribution = Math.floor(
        (Date.now() - refDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      lastDistributionType = lastRow.distributionType;
      cooldownActive = refDate >= cooldownCutoff;
    }
  }

  return {
    projectId,
    projectName,
    isSelfSustaining,
    projectBalanceUsdMinor,
    companyBalanceUsdMinor,
    inflows90dUsdMinor,
    outflows90dUsdMinor,
    netCashFlow90dUsdMinor,
    bufferUsdMinor,
    outstandingCapitalUsdMinor,
    outstandingInvoicesUsdMinor,
    outstandingCommitmentsUsdMinor,
    safeEnvelopeUsdMinor,
    daysSinceLastDistribution,
    lastDistributionType,
    cooldownActive,
  };
}

function zeroSnapshot(
  projectId: string,
  projectName: string,
  isSelfSustaining: boolean,
): DistributionContextSnapshot {
  return {
    projectId,
    projectName,
    isSelfSustaining,
    projectBalanceUsdMinor: 0n,
    companyBalanceUsdMinor: 0n,
    inflows90dUsdMinor: 0n,
    outflows90dUsdMinor: 0n,
    netCashFlow90dUsdMinor: 0n,
    bufferUsdMinor: 0n,
    outstandingCapitalUsdMinor: 0n,
    outstandingInvoicesUsdMinor: 0n,
    outstandingCommitmentsUsdMinor: 0n,
    safeEnvelopeUsdMinor: 0n,
    daysSinceLastDistribution: null,
    lastDistributionType: null,
    cooldownActive: false,
  };
}

const SYSTEM_PROMPT = `You are a conservative financial advisor (${SYSTEM_PROMPT_MARKER}) analyzing whether a real-estate development project should declare a distribution to its investors.

Respond with JSON only. Schema:
  suggested_amount_usd_minor: integer USD minor units (e.g. 15000000 = $150,000.00); 0 = recommend no distribution
  suggested_distribution_type: "capital_return" | "profit_distribution" | "mixed" | "none"
  suggested_effective_date: YYYY-MM-DD
  reasoning: 2-4 paragraph markdown explaining your logic, citing actual numbers from the snapshot
  confidence_level: "low" | "medium" | "high"
  risk_factors: array of specific concerns (e.g. "outstanding capital larger than buffer")
  recommendations: array of actions for the operator (e.g. "wait for next milestone invoice to clear")

Principles:
1. CONSERVATIVE BIAS — when in doubt, suggest LESS or 0.
2. Never suggest more than (project_balance − buffer − outstanding_obligations).
3. If is_self_sustaining is false → suggest 0 with type 'none'.
4. If outstanding capital remains → prefer 'capital_return' over 'profit_distribution'.
5. Never speculate about future returns. Cite actual snapshot numbers.

The system will additionally apply conservative clamps in code. Your job is to provide the best-reasoned recommendation within the safe envelope.`;

function buildUserPrompt(s: DistributionContextSnapshot): string {
  const lines: string[] = [];
  lines.push(`Project: ${s.projectName}`);
  lines.push(`Self-sustaining: ${s.isSelfSustaining ? "yes" : "NO"}`);
  lines.push("");
  lines.push("Balances (USD):");
  lines.push(`- Project bank balance: $${formatUsdMinor(s.projectBalanceUsdMinor)}`);
  lines.push(`- Company total balance: $${formatUsdMinor(s.companyBalanceUsdMinor)}`);
  lines.push("");
  lines.push("Last 90 days cash flow (USD):");
  lines.push(`- Inflows: $${formatUsdMinor(s.inflows90dUsdMinor)}`);
  lines.push(`- Outflows: $${formatUsdMinor(s.outflows90dUsdMinor)}`);
  lines.push(`- Net: $${formatUsdMinor(s.netCashFlow90dUsdMinor)}`);
  lines.push("");
  lines.push(`Recommended ${BUFFER_MONTHS}-month operating buffer: $${formatUsdMinor(s.bufferUsdMinor)}`);
  lines.push("");
  lines.push("Outstanding obligations (USD):");
  lines.push(`- Capital owed to investors: $${formatUsdMinor(s.outstandingCapitalUsdMinor)}`);
  lines.push(`- Outstanding commitments: $${formatUsdMinor(s.outstandingCommitmentsUsdMinor)}`);
  lines.push(`- Outstanding invoices: $${formatUsdMinor(s.outstandingInvoicesUsdMinor)}`);
  lines.push("");
  lines.push(`SAFE ENVELOPE (max suggestable): $${formatUsdMinor(s.safeEnvelopeUsdMinor)}`);
  lines.push("");
  if (s.daysSinceLastDistribution != null) {
    lines.push(
      `Last distribution: ${s.daysSinceLastDistribution} days ago, type=${s.lastDistributionType ?? "?"}`,
    );
    if (s.cooldownActive) {
      lines.push(`COOLDOWN ACTIVE — must suggest 0`);
    }
  } else {
    lines.push("No prior distributions recorded.");
  }
  lines.push("");
  lines.push("Return the JSON schema only.");
  return lines.join("\n");
}

function synthesizeDryRun(
  raw: unknown,
  s: DistributionContextSnapshot,
): unknown {
  if (typeof raw === "object" && raw !== null && "suggested_amount_usd_minor" in raw) {
    return raw;
  }
  // Useful supervisor-shaped stub. Capital return preferred when capital
  // is still outstanding; otherwise profit; otherwise none.
  const safeAmount =
    s.safeEnvelopeUsdMinor > 0n && s.isSelfSustaining
      ? // Suggest half of the safe envelope as a conservative dry-run default.
        Number(s.safeEnvelopeUsdMinor / 2n)
      : 0;
  const type =
    safeAmount === 0
      ? "none"
      : s.outstandingCapitalUsdMinor > 0n
        ? "capital_return"
        : "profit_distribution";
  const today = new Date().toISOString().slice(0, 10);
  return {
    suggested_amount_usd_minor: safeAmount,
    suggested_distribution_type: type,
    suggested_effective_date: today,
    reasoning: s.isSelfSustaining
      ? "[dry-run] Project is self-sustaining; suggesting half of the safe envelope as a conservative starting point. Set ANTHROPIC_API_KEY + AI_DRY_RUN=0 for a real reasoning pass."
      : "[dry-run] Project is NOT self-sustaining. Conservative recommendation is to wait until the threshold is met before declaring any distribution.",
    confidence_level: s.isSelfSustaining ? "medium" : "low",
    risk_factors: s.isSelfSustaining
      ? []
      : ["Project not self-sustaining"],
    recommendations: s.isSelfSustaining
      ? ["Verify safe envelope figure against latest reconciliation"]
      : ["Run self-sustaining-check cron to refresh status"],
  };
}

async function markRunFailed(
  runId: string,
  errorMessage: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(aiAssistantRuns)
    .set({ status: "failed", errorMessage, finishedAt: new Date() })
    .where(eq(aiAssistantRuns.id, runId));
}
