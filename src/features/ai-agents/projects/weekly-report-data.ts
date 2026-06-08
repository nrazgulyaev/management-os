import "server-only";

/**
 * Server data layer for the weekly-report-composer agent.
 *
 * Reads the past-week facts for a project — milestones progressed,
 * BOQ/cost movement, RFIs opened/closed, daily site reports — and
 * delegates to the pure `assembleWeeklyReport()` for the deterministic
 * structured brief.
 *
 * AI polish is OPTIONAL and degrades gracefully: when AI is unconfigured
 * (or the org's quota is spent), we return the deterministic markdown
 * untouched. The deterministic assembly is always the source of truth.
 *
 * Guards `getDb()` null per the codebase contract — returns `null` so
 * callers (page / cron) can render an empty state without crashing.
 */

import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { milestones } from "@/lib/db/schema/milestones";
import { boqRevisions } from "@/lib/db/schema/boq-revisions";
import { boqDocuments } from "@/lib/db/schema/boq";
import { rfis } from "@/lib/db/schema/rfis";
import { siteReports } from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import { developmentProjectMeta } from "@/lib/db/schema/development";
import { aiExecute } from "@/lib/ai/execute";
import {
  assembleWeeklyReport,
  type WeeklyBoqFact,
  type WeeklyMilestoneFact,
  type WeeklyReportAssembly,
  type WeeklyReportFacts,
  type WeeklyRfiFact,
  type WeeklySiteReportFact,
} from "./weekly-report-assembly";

export interface WeeklyReportComposeInput {
  organizationId: string;
  projectId: string;
  /** Week-ending date (ISO YYYY-MM-DD). Defaults to today. */
  weekEnding?: string;
  /** Owning user, for the optional AI run's audit trail. */
  triggeredByUserId?: string | null;
  /** When true, skip the LLM polish entirely (deterministic only). */
  skipAiPolish?: boolean;
}

export interface WeeklyReportComposeResult extends WeeklyReportAssembly {
  projectName: string;
  weekStart: string;
  weekEnding: string;
  /** Deterministic markdown (always present). */
  deterministicMarkdown: string;
  /** Whether the LLM polish was applied (else `markdown === deterministicMarkdown`). */
  aiPolished: boolean;
  /** When AI was attempted but skipped/failed — a short reason for the operator. */
  aiNote: string | null;
}

/** ISO YYYY-MM-DD for `d` (UTC). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Read a numeric `total_minor` out of a boq_revisions snapshot jsonb. */
function snapshotTotalMinor(snapshot: unknown): bigint {
  if (snapshot && typeof snapshot === "object") {
    const v = (snapshot as Record<string, unknown>).total_minor;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  }
  return 0n;
}

function snapshotNote(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === "object") {
    const v = (snapshot as Record<string, unknown>).note;
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

/**
 * Compose the weekly report for one project. Returns `null` only when the
 * database is unavailable or the project is not found.
 */
export async function composeWeeklyReport(
  input: WeeklyReportComposeInput,
): Promise<WeeklyReportComposeResult | null> {
  const db = getDb();
  if (!db) return null;

  const weekEndingDate = input.weekEnding
    ? new Date(`${input.weekEnding}T00:00:00.000Z`)
    : new Date();
  const weekEnding = isoDate(weekEndingDate);
  const weekStartDate = new Date(weekEndingDate);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 6); // inclusive 7-day window
  const weekStart = isoDate(weekStartDate);

  // Timestamp bounds for `timestamptz` columns (RFIs, site reports created/opened).
  const windowStart = new Date(`${weekStart}T00:00:00.000Z`);
  const windowEnd = new Date(`${weekEnding}T23:59:59.999Z`);

  // --- Project name + operating currency ---
  const [projectRow] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (!projectRow) return null;

  const [metaRow] = await db
    .select({ operationalCurrency: developmentProjectMeta.operationalCurrency })
    .from(developmentProjectMeta)
    .where(eq(developmentProjectMeta.projectId, input.projectId))
    .limit(1);
  const boqCurrency = metaRow?.operationalCurrency ?? "IDR";

  // --- Milestones progressed / completed in the window ---
  // "Progressed" = completed in-window (actual_date), OR touched (updated_at)
  // while not yet done. We pull the project's milestones and filter in TS so
  // the window math is unit-tested in the assembler's inputs.
  const milestoneRows = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, input.projectId))
    .orderBy(asc(milestones.targetDate));

  const milestoneFacts: WeeklyMilestoneFact[] = milestoneRows
    .map((m): WeeklyMilestoneFact | null => {
      const actual = m.actualDate ? String(m.actualDate) : null;
      const completedThisWeek =
        actual !== null && actual >= weekStart && actual <= weekEnding;
      const updatedInWindow =
        m.updatedAt >= windowStart && m.updatedAt <= windowEnd;
      const isInFlight =
        m.status === "in_progress" ||
        m.status === "at_risk" ||
        m.status === "slipped";
      // Include if it completed this week, or it's in-flight and was touched.
      if (!completedThisWeek && !(isInFlight && updatedInWindow)) return null;
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        status: m.status,
        targetDate: String(m.targetDate),
        actualDate: actual,
        completedThisWeek,
      };
    })
    .filter((m): m is WeeklyMilestoneFact => m !== null);

  // --- BOQ / cost movement: revisions snapshot in the window ---
  // Pull this week's revisions plus the one immediately prior (for the delta).
  const revisionRows = await db
    .select()
    .from(boqRevisions)
    .where(eq(boqRevisions.projectId, input.projectId))
    .orderBy(asc(boqRevisions.version));

  const boqMovements: WeeklyBoqFact[] = [];
  for (let i = 0; i < revisionRows.length; i++) {
    const r = revisionRows[i];
    const inWindow = r.snapshotAt >= windowStart && r.snapshotAt <= windowEnd;
    if (!inWindow) continue;
    const total = snapshotTotalMinor(r.snapshot);
    const prior = i > 0 ? snapshotTotalMinor(revisionRows[i - 1].snapshot) : null;
    boqMovements.push({
      version: r.version,
      totalMinor: total,
      deltaMinor: prior === null ? null : total - prior,
      note: r.note ?? snapshotNote(r.snapshot),
      snapshotAt: r.snapshotAt.toISOString(),
    });
  }

  // Fallback signal when no formal revision was cut this week: surface the
  // latest approved BOQ document total so cost still has a figure.
  if (boqMovements.length === 0) {
    const [approvedDoc] = await db
      .select({
        versionNumber: boqDocuments.versionNumber,
        totalAmountMinor: boqDocuments.totalAmountMinor,
        currency: boqDocuments.currency,
        title: boqDocuments.title,
        updatedAt: boqDocuments.updatedAt,
      })
      .from(boqDocuments)
      .where(
        and(
          eq(boqDocuments.projectId, input.projectId),
          eq(boqDocuments.status, "approved"),
        ),
      )
      .orderBy(desc(boqDocuments.versionNumber))
      .limit(1);
    if (
      approvedDoc &&
      approvedDoc.totalAmountMinor !== null &&
      approvedDoc.updatedAt >= windowStart &&
      approvedDoc.updatedAt <= windowEnd
    ) {
      boqMovements.push({
        version: approvedDoc.versionNumber,
        totalMinor: approvedDoc.totalAmountMinor,
        deltaMinor: null,
        note: `Approved BOQ — ${approvedDoc.title}`,
        snapshotAt: approvedDoc.updatedAt.toISOString(),
      });
    }
  }

  // --- RFIs opened / closed in the window ---
  // Opened OR closed inside the window (closed = responded_at or resolved_at).
  const rfiRows = await db
    .select()
    .from(rfis)
    .where(eq(rfis.projectId, input.projectId))
    .orderBy(desc(rfis.openedAt));

  const rfiFacts: WeeklyRfiFact[] = rfiRows
    .map((r): WeeklyRfiFact | null => {
      const openedThisWeek =
        r.openedAt >= windowStart && r.openedAt <= windowEnd;
      const closedAt = r.resolvedAt ?? r.respondedAt;
      const closedThisWeek =
        closedAt !== null && closedAt >= windowStart && closedAt <= windowEnd;
      if (!openedThisWeek && !closedThisWeek) return null;
      return {
        ref: r.ref,
        discipline: r.discipline,
        priority: r.priority,
        openedThisWeek,
        closedThisWeek,
      };
    })
    .filter((r): r is WeeklyRfiFact => r !== null);

  // --- Site reports filed in the window ---
  const siteReportRows = await db
    .select()
    .from(siteReports)
    .where(
      and(
        eq(siteReports.projectId, input.projectId),
        gte(siteReports.reportDate, weekStart),
        lte(siteReports.reportDate, weekEnding),
      ),
    )
    .orderBy(asc(siteReports.reportDate));

  const siteReportFacts: WeeklySiteReportFact[] = siteReportRows.map((r) => ({
    reportDate: String(r.reportDate),
    totalWorkersPresent: r.totalWorkersPresent,
    // A report-level blocker proxy: flagged status. Zone-level blockers live
    // on site_report_zones; the flagged status is the report's roll-up signal.
    hasBlocker: r.status === "flagged",
    status: r.status,
    summary: r.summary ?? null,
  }));

  const facts: WeeklyReportFacts = {
    projectName: projectRow.name,
    weekStart,
    weekEnding,
    boqCurrency,
    milestones: milestoneFacts,
    boqMovements,
    rfis: rfiFacts,
    siteReports: siteReportFacts,
  };

  const assembly = assembleWeeklyReport(facts);

  // --- Optional LLM polish (degrades gracefully) ---
  let markdown = assembly.markdown;
  let aiPolished = false;
  let aiNote: string | null = null;

  if (input.skipAiPolish) {
    aiNote = "AI polish skipped (deterministic draft).";
  } else if (assembly.isQuiet) {
    aiNote = "Quiet week — no AI polish applied.";
  } else {
    try {
      const exec = await aiExecute({
        organizationId: input.organizationId,
        assistantKey: "weekly_report_composer",
        triggeredByUserId: input.triggeredByUserId ?? null,
        inputSummary: `Weekly report polish · ${projectRow.name} · ${weekEnding}`,
        messages: [
          {
            role: "system",
            content:
              "You are a development director's assistant drafting a concise, factual weekly investor update for a villa-development project. " +
              "Rewrite the supplied facts into a tight, professional one-page brief in Markdown. " +
              "Do NOT invent numbers, dates, or events — use only the facts given. Keep all figures exactly as provided. " +
              "Lead with the single most important development of the week.",
          },
          {
            role: "user",
            content: `Facts for ${facts.projectName}, week ${weekStart} to ${weekEnding}:\n\n${assembly.promptContext}`,
          },
        ],
        maxTokens: 700,
        temperature: 0.2,
        timeoutMs: 30_000,
      });
      if (exec.ok && exec.response.content.trim().length > 0) {
        markdown = exec.response.content.trim();
        aiPolished = true;
      } else {
        aiNote = exec.ok
          ? "AI returned an empty draft — using deterministic version."
          : `AI unavailable (${exec.message}) — using deterministic version.`;
      }
    } catch (err) {
      // Never let an AI failure break the report — fall back to deterministic.
      aiNote = "AI polish failed — using deterministic version.";
      if (process.env.NODE_ENV !== "production") {
        console.error("[weekly-report-composer] AI polish failed", err);
      }
    }
  }

  return {
    ...assembly,
    markdown,
    deterministicMarkdown: assembly.markdown,
    projectName: facts.projectName,
    weekStart,
    weekEnding,
    aiPolished,
    aiNote,
  };
}
