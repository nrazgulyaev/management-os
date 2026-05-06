import "server-only";

import { and, desc, eq, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  investors,
  investorWallets,
  capitalCommitments,
  distributions,
  walletTransactions,
} from "@/lib/db/schema/investor-capital";
import { aiAssistantRuns } from "@/lib/db/schema/ai";
import { aiInvestorQaDrafts } from "@/lib/db/schema/ai-development";
import { projects } from "@/lib/db/schema/projects";
import { getAIProvider } from "@/lib/ai/providers";
import { computeCallCost } from "@/lib/ai/cost";
import { checkBudget } from "@/lib/ai/budget";
import { aiModel } from "@/lib/env";

/**
 * Investor Relations agent.
 *
 * Operator pastes a question received from an investor (email, portal,
 * WhatsApp). The agent loads that investor's specific data
 * (commitments, wallets, recent distributions) and drafts a response
 * in the investor's preferred language. The draft lands in
 * `ai_investor_qa_drafts` for HITL review.
 *
 * Manual trigger only — no cron path. Each call records a row in
 * `ai_assistant_runs` with cost.
 */

export const INVESTOR_RELATIONS_KEY = "dev_os.investor_relations";
const SYSTEM_PROMPT_MARKER = "DEV_OS_INVESTOR_RELATIONS_V1";

const SUPPORTED_LANGS = ["en", "ru", "id", "zh"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const Input = z.object({
  investorId: z.string().uuid(),
  question: z.string().min(1).max(4000),
  questionLanguage: z.enum(SUPPORTED_LANGS).optional(),
  responseLanguage: z.enum(SUPPORTED_LANGS).optional(),
  contextOptions: z
    .object({
      includeCommitments: z.boolean().optional(),
      includeWalletBalances: z.boolean().optional(),
      includeRecentDistributions: z.boolean().optional(),
      includeIRR: z.boolean().optional(),
      includeProjectStatus: z.boolean().optional(),
    })
    .optional(),
});

export interface DraftInvestorResponseResult {
  draftId: string | null;
  draftResponse: string;
  responseLanguage: string;
  contextSummary: ContextSummary;
  costUsd?: number | null;
  status: "succeeded" | "dry_run" | "budget_exceeded" | "failed";
  errorMessage?: string;
}

interface ContextSummary {
  commitmentsCount: number;
  walletBalances: Record<string, string>;
  recentDistributionsCount: number;
  weightedIrr: number | null;
  projectsInvested: string[];
}

export async function draftInvestorResponse(
  input: z.input<typeof Input>,
): Promise<DraftInvestorResponseResult> {
  const parsed = Input.parse(input);
  const db = getDb();
  if (!db) {
    return {
      draftId: null,
      draftResponse: "",
      responseLanguage: parsed.responseLanguage ?? "en",
      contextSummary: emptyContext(),
      status: "failed",
      errorMessage: "DB unavailable",
    };
  }

  // 1) Investor lookup.
  const [investor] = await db
    .select({
      id: investors.id,
      legalName: investors.legalName,
      reportingLanguage: investors.reportingLanguage,
      primaryCurrency: investors.primaryCurrency,
      status: investors.status,
    })
    .from(investors)
    .where(eq(investors.id, parsed.investorId))
    .limit(1);
  if (!investor) {
    return {
      draftId: null,
      draftResponse: "",
      responseLanguage: parsed.responseLanguage ?? "en",
      contextSummary: emptyContext(),
      status: "failed",
      errorMessage: "Investor not found",
    };
  }

  const responseLanguage =
    parsed.responseLanguage ??
    ((SUPPORTED_LANGS as readonly string[]).includes(investor.reportingLanguage)
      ? (investor.reportingLanguage as Lang)
      : "en");

  // 2) Budget.
  const budget = await checkBudget(INVESTOR_RELATIONS_KEY);
  if (budget.decision === "block") {
    return {
      draftId: null,
      draftResponse: "",
      responseLanguage,
      contextSummary: emptyContext(),
      status: "budget_exceeded",
      errorMessage: budget.reason,
    };
  }

  // 3) Build context.
  const opts = parsed.contextOptions ?? {};
  const includeCommitments = opts.includeCommitments !== false;
  const includeWallets = opts.includeWalletBalances !== false;
  const includeDistributions = opts.includeRecentDistributions !== false;
  const includeProjects = opts.includeProjectStatus !== false;

  // capital_commitments.investorId is the join key to wallets and to
  // wallet_transactions (which carry commitmentId). investor_wallets is
  // USD-only (one wallet per commitment) — Stage 2.3 design.
  const [commitmentRows, walletRows, distRows, distLines] = await Promise.all([
    includeCommitments
      ? db
          .select({
            id: capitalCommitments.id,
            code: capitalCommitments.commitmentCode,
            committedUsdMinor: capitalCommitments.committedAmountUsdMinor,
            committedCurrency: capitalCommitments.committedCurrency,
            profitShare: capitalCommitments.profitSharePercent,
            projectId: capitalCommitments.projectId,
          })
          .from(capitalCommitments)
          .where(eq(capitalCommitments.investorId, investor.id))
      : Promise.resolve([]),
    includeWallets
      ? db
          .select({
            availableUsdMinor: investorWallets.availableBalanceUsdMinor,
            holdUsdMinor: investorWallets.holdBalanceUsdMinor,
            totalProfitUsdMinor: investorWallets.totalProfitDistributedUsdMinor,
          })
          .from(investorWallets)
          .innerJoin(
            capitalCommitments,
            eq(capitalCommitments.id, investorWallets.commitmentId),
          )
          .where(eq(capitalCommitments.investorId, investor.id))
      : Promise.resolve([]),
    includeDistributions
      ? db
          .selectDistinct({
            distributionNumber: distributions.distributionNumber,
            distributionType: distributions.distributionType,
            completedAt: distributions.completedAt,
            totalUsdMinor: distributions.totalAmountUsdMinor,
          })
          .from(distributions)
          .innerJoin(
            walletTransactions,
            eq(walletTransactions.distributionId, distributions.id),
          )
          .innerJoin(
            capitalCommitments,
            eq(capitalCommitments.id, walletTransactions.commitmentId),
          )
          .where(
            and(
              eq(capitalCommitments.investorId, investor.id),
              eq(distributions.status, "completed"),
            ),
          )
          .orderBy(desc(distributions.completedAt))
          .limit(5)
      : Promise.resolve([]),
    db
      .select({
        amountUsdMinor: sum(walletTransactions.amountUsdMinor),
      })
      .from(walletTransactions)
      .innerJoin(
        capitalCommitments,
        eq(capitalCommitments.id, walletTransactions.commitmentId),
      )
      .where(
        and(
          eq(capitalCommitments.investorId, investor.id),
          eq(walletTransactions.transactionType, "profit_distribution"),
        ),
      ),
  ]);

  // Project names for the projects this investor is in.
  const projectIds = [
    ...new Set(commitmentRows.map((c) => c.projectId).filter(Boolean)),
  ] as string[];
  const projectsInvested = includeProjects && projectIds.length > 0
    ? (
        await db
          .select({ name: projects.name })
          .from(projects)
          .where(sql_in_uuids(projects.id, projectIds))
      ).map((r) => r.name)
    : [];

  const totalCommittedUsdMinor = commitmentRows.reduce(
    (s, c) => s + BigInt(c.committedUsdMinor),
    0n,
  );
  const totalDistributedUsdMinor =
    distLines[0]?.amountUsdMinor != null
      ? BigInt(String(distLines[0].amountUsdMinor))
      : 0n;
  const weightedIrr =
    totalCommittedUsdMinor > 0n
      ? Number(
          ((totalDistributedUsdMinor * 10000n) / totalCommittedUsdMinor) /
            100n,
        ) / 100
      : null;

  // Wallets are USD-only and keyed per commitment — sum across to
  // present a single USD figure for `availableBalanceUsdMinor` and
  // `holdBalanceUsdMinor`.
  let totalAvailable = 0n;
  let totalHold = 0n;
  for (const w of walletRows) {
    totalAvailable += BigInt(w.availableUsdMinor);
    totalHold += BigInt(w.holdUsdMinor);
  }
  const walletBalances: Record<string, string> = {};
  if (walletRows.length > 0) {
    walletBalances["USD_available"] = totalAvailable.toString();
    if (totalHold > 0n) walletBalances["USD_hold"] = totalHold.toString();
  }

  const contextSummary: ContextSummary = {
    commitmentsCount: commitmentRows.length,
    walletBalances,
    recentDistributionsCount: distRows.length,
    weightedIrr,
    projectsInvested,
  };

  // 4) Open run row.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: INVESTOR_RELATIONS_KEY,
      runType: "manual",
      status: "running",
      model: aiModel(),
      inputSummary: `investor=${investor.id} q.chars=${parsed.question.length}`,
    })
    .returning({ id: aiAssistantRuns.id });
  const runId = run!.id;

  // 5) Provider call.
  const provider = getAIProvider();
  const isLive = provider.name !== "dry-run";
  const startMs = Date.now();
  const userPrompt = buildUserPrompt({
    investor,
    responseLanguage,
    question: parsed.question,
    contextSummary,
    commitmentRows,
    walletRows,
    distRows,
  });

  let providerResp;
  try {
    providerResp = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1200,
      temperature: 0.3,
      timeoutMs: 25_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "provider error";
    await db
      .update(aiAssistantRuns)
      .set({ status: "failed", errorMessage: message, finishedAt: new Date() })
      .where(eq(aiAssistantRuns.id, runId));
    return {
      draftId: null,
      draftResponse: "",
      responseLanguage,
      contextSummary,
      status: "failed",
      errorMessage: message,
    };
  }
  const latencyMs = Date.now() - startMs;

  const draftResponse = isLive
    ? providerResp.content.trim()
    : buildDryRunResponse(
        investor.legalName,
        responseLanguage,
        contextSummary,
      );

  // 6) Cost + draft persist.
  const cost = computeCallCost({
    model: providerResp.model,
    promptTokens: providerResp.usage.promptTokens,
    completionTokens: providerResp.usage.completionTokens,
  });

  const [draft] = await db
    .insert(aiInvestorQaDrafts)
    .values({
      investorId: investor.id,
      question: parsed.question,
      questionLanguage: parsed.questionLanguage ?? null,
      responseLanguage,
      draftResponse,
      contextSummary:
        contextSummary as typeof aiInvestorQaDrafts.$inferInsert["contextSummary"],
      rawResponse: providerResp.content,
      aiRunId: runId,
      status: "draft",
    })
    .returning({ id: aiInvestorQaDrafts.id });

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
      outputSummary: draftResponse.slice(0, 500),
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));

  return {
    draftId: draft.id,
    draftResponse,
    responseLanguage,
    contextSummary,
    costUsd: cost?.totalCostUsd ?? null,
    status: isLive ? "succeeded" : "dry_run",
  };
}

const SYSTEM_PROMPT = `You are drafting a response from Arconique Investor Relations to one of our investors (${SYSTEM_PROMPT_MARKER}).

Tone: professional, warm, transparent, factual.

Rules:
1. Use only the data provided. Do not invent commitment amounts, distributions, or projects.
2. Reference specific numbers from the data when they help answer the question.
3. If the data does not answer the question, say so honestly and suggest the operator confirm with finance.
4. Never speculate about future returns. Never guarantee outcomes.
5. Match the response to the requested language.
6. Sign off as "Arconique Investor Relations Team".
7. If the question is ambiguous, ask 2-3 clarifying questions inline.
8. Keep responses concise — usually 2-4 short paragraphs.

Return the response text only — no JSON, no metadata, no preamble.`;

interface UserPromptArgs {
  investor: {
    legalName: string;
    primaryCurrency: string;
    reportingLanguage: string;
  };
  responseLanguage: string;
  question: string;
  contextSummary: ContextSummary;
  commitmentRows: Array<{
    code: string;
    committedUsdMinor: bigint;
    committedCurrency: string;
    profitShare: string;
  }>;
  walletRows: Array<{
    availableUsdMinor: bigint;
    holdUsdMinor: bigint;
    totalProfitUsdMinor: bigint;
  }>;
  distRows: Array<{
    distributionNumber: number;
    distributionType: string;
    completedAt: Date | null;
    totalUsdMinor: bigint;
  }>;
}

function buildUserPrompt(args: UserPromptArgs): string {
  const fmtUsd = (b: bigint) =>
    `$${(Number(b) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines: string[] = [];
  lines.push(`Investor: ${args.investor.legalName}`);
  lines.push(`Primary currency: ${args.investor.primaryCurrency}`);
  lines.push(`Reporting language preference: ${args.investor.reportingLanguage}`);
  lines.push(`Response language requested: ${args.responseLanguage}`);
  if (args.contextSummary.projectsInvested.length > 0) {
    lines.push(`Projects: ${args.contextSummary.projectsInvested.join(", ")}`);
  }
  if (args.commitmentRows.length > 0) {
    lines.push("");
    lines.push(`Commitments (${args.commitmentRows.length}):`);
    for (const c of args.commitmentRows) {
      lines.push(
        `- ${c.code}: ${fmtUsd(BigInt(c.committedUsdMinor))} USD (profit share ${c.profitShare}%)`,
      );
    }
  }
  if (args.walletRows.length > 0) {
    let totalAvail = 0n;
    let totalHold = 0n;
    let totalProfit = 0n;
    for (const w of args.walletRows) {
      totalAvail += BigInt(w.availableUsdMinor);
      totalHold += BigInt(w.holdUsdMinor);
      totalProfit += BigInt(w.totalProfitUsdMinor);
    }
    lines.push("");
    lines.push("Wallet (USD, summed across all commitments):");
    lines.push(`- Available: ${fmtUsd(totalAvail)}`);
    if (totalHold > 0n) lines.push(`- On hold:   ${fmtUsd(totalHold)}`);
    lines.push(`- Lifetime profit distributed: ${fmtUsd(totalProfit)}`);
  }
  if (args.distRows.length > 0) {
    lines.push("");
    lines.push(`Recent distributions (${args.distRows.length}):`);
    for (const d of args.distRows) {
      const date = d.completedAt
        ? d.completedAt.toISOString().slice(0, 10)
        : "pending";
      lines.push(
        `- #${d.distributionNumber} (${d.distributionType}) on ${date}: ${fmtUsd(BigInt(d.totalUsdMinor))} project total`,
      );
    }
  }
  if (args.contextSummary.weightedIrr != null) {
    lines.push("");
    lines.push(
      `Cumulative distributions / committed (proxy IRR): ${args.contextSummary.weightedIrr.toFixed(2)}%`,
    );
  }
  lines.push("");
  lines.push("Investor's question:");
  lines.push(args.question);
  lines.push("");
  lines.push(
    `Draft a response in ${args.responseLanguage} that answers using the data above.`,
  );
  return lines.join("\n");
}

function buildDryRunResponse(
  legalName: string,
  lang: string,
  ctx: ContextSummary,
): string {
  const greeting: Record<string, string> = {
    en: `Dear ${legalName},`,
    ru: `Уважаемый ${legalName},`,
    id: `Yth. ${legalName},`,
    zh: `${legalName} 先生／女士，`,
  };
  return `${greeting[lang] ?? greeting.en}

[dry-run draft] Thank you for your question. Based on our records:
- Active commitments: ${ctx.commitmentsCount}
- Recent distributions: ${ctx.recentDistributionsCount}
- Wallet balances on file: ${Object.keys(ctx.walletBalances).join(", ") || "none"}

Set ANTHROPIC_API_KEY and AI_DRY_RUN=0 for a live draft.

Best regards,
Arconique Investor Relations Team`;
}

function emptyContext(): ContextSummary {
  return {
    commitmentsCount: 0,
    walletBalances: {},
    recentDistributionsCount: 0,
    weightedIrr: null,
    projectsInvested: [],
  };
}

// Drizzle's inArray when the array might be empty — early-return.
import { sql, inArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

function sql_in_uuids(col: PgColumn, ids: string[]) {
  if (ids.length === 0) return sql`false`;
  return inArray(col, ids);
}
