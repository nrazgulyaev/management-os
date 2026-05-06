import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  siteReports,
  siteReportZones,
  siteReportPhotos,
  siteWorkforceLogs,
  siteZones,
  materialConsumptionLogs,
  materialPoLines,
  vendorEngagements,
  vendors,
} from "@/lib/db/schema/site-operations";
import { aiAssistantRuns } from "@/lib/db/schema/ai";
import { aiConstructionAnalyses } from "@/lib/db/schema/ai-development";
import { projects } from "@/lib/db/schema/projects";
import { getAIProvider } from "@/lib/ai/providers";
import { computeCallCost } from "@/lib/ai/cost";
import { checkBudget } from "@/lib/ai/budget";
import { aiModel } from "@/lib/env";

/**
 * AI Construction Supervisor — analyzes a daily site report and drafts
 * a structured supervisor-style analysis. HITL: every analysis lands
 * as a 'draft' row that an internal reviewer must Approve / Edit /
 * Reject / Regenerate.
 *
 * Pipeline:
 *   1. Look up the site report + everything that hangs off it (zones,
 *      photos, workforce, materials, vendors).
 *   2. Refuse if there's already an ACTIVE analysis (draft / approved
 *      / edited_approved). Regenerate must explicitly supersede first.
 *   3. Budget check (`dev_os.construction_supervisor`).
 *   4. Open `ai_assistant_runs` row.
 *   5. Build the structured prompt. Call Claude with JSON response.
 *   6. Zod-validate the response.
 *   7. Insert `ai_construction_analyses` row + finish the run row.
 *
 * Translation of the operator's summary into other languages is left
 * to the translator service — the supervisor returns its own English
 * summary inside `draft_summary` (and translations in
 * `draft_summary_translations` if Claude included them).
 */

export const CONSTRUCTION_SUPERVISOR_KEY = "dev_os.construction_supervisor";
const SYSTEM_PROMPT_MARKER = "DEV_OS_CONSTRUCTION_SUPERVISOR_V1";

export interface SupervisorOutcome {
  reportId: string;
  status:
    | "succeeded"
    | "dry_run"
    | "skipped_active_analysis"
    | "budget_exceeded"
    | "failed";
  analysisId?: string;
  runId: string | null;
  errorMessage?: string;
}

const ResponseSchema = z.object({
  draft_summary: z.string().min(1).max(4000),
  draft_summary_translations: z
    .record(z.string(), z.string())
    .optional()
    .default({}),
  safety_status: z.enum(["normal", "minor_concerns", "serious_concerns"]),
  safety_concerns: z.array(z.string().max(300)).max(20).default([]),
  immediate_actions_recommended: z
    .array(z.string().max(300))
    .max(20)
    .default([]),
  estimated_completion_percent: z.number().min(0).max(100).nullable().optional(),
  on_track_vs_budget: z.boolean().nullable().optional(),
  delay_risk_flags: z.array(z.string().max(300)).max(20).default([]),
  workforce_flags: z.array(z.string().max(300)).max(20).default([]),
  vendor_flags: z.array(z.string().max(300)).max(20).default([]),
  recommended_reviewer_actions: z
    .array(z.string().max(300))
    .max(20)
    .default([]),
});

export async function analyzeSiteReport(
  reportId: string,
): Promise<SupervisorOutcome> {
  const db = getDb();
  if (!db) {
    return {
      reportId,
      status: "failed",
      errorMessage: "DB unavailable",
      runId: null,
    };
  }

  // 1) Look up report + everything that hangs off it.
  const [report] = await db
    .select({
      id: siteReports.id,
      reportDate: siteReports.reportDate,
      summary: siteReports.summary,
      summaryTranslations: siteReports.summaryTranslations,
      status: siteReports.status,
      weatherConditions: siteReports.weatherConditions,
      weatherNotes: siteReports.weatherNotes,
      tempMin: siteReports.temperatureCelsiusMin,
      tempMax: siteReports.temperatureCelsiusMax,
      workersPresent: siteReports.totalWorkersPresent,
      workersPlanned: siteReports.totalWorkersPlanned,
      projectId: siteReports.projectId,
    })
    .from(siteReports)
    .where(eq(siteReports.id, reportId))
    .limit(1);
  if (!report) {
    return {
      reportId,
      status: "failed",
      errorMessage: "Report not found",
      runId: null,
    };
  }

  // Refuse on draft reports — they're operator-mutable.
  if (report.status !== "submitted" && report.status !== "reviewed") {
    return {
      reportId,
      status: "failed",
      errorMessage: `Report status '${report.status}' not eligible for analysis`,
      runId: null,
    };
  }

  // 2) Active analysis already present?
  const [active] = await db
    .select({ id: aiConstructionAnalyses.id })
    .from(aiConstructionAnalyses)
    .where(
      and(
        eq(aiConstructionAnalyses.siteReportId, reportId),
        sql`${aiConstructionAnalyses.status} IN ('draft','approved','edited_approved')`,
      ),
    )
    .limit(1);
  if (active) {
    return {
      reportId,
      status: "skipped_active_analysis",
      analysisId: active.id,
      runId: null,
    };
  }

  // 3) Budget.
  const budget = await checkBudget(CONSTRUCTION_SUPERVISOR_KEY);
  if (budget.decision === "block") {
    const [run] = await db
      .insert(aiAssistantRuns)
      .values({
        assistantKey: CONSTRUCTION_SUPERVISOR_KEY,
        runType: "scheduled",
        status: "budget_exceeded",
        inputSummary: `report=${reportId} budget=${budget.reason}`,
        finishedAt: new Date(),
      })
      .returning({ id: aiAssistantRuns.id });
    return {
      reportId,
      status: "budget_exceeded",
      errorMessage: budget.reason,
      runId: run?.id ?? null,
    };
  }

  // 4) Project name + everything hanging off the report (parallel).
  const [
    [projectRow],
    zoneRows,
    photoRows,
    workforceRows,
    materialRows,
    vendorRows,
  ] = await Promise.all([
    db
      .select({ name: projects.name, slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, report.projectId))
      .limit(1),
    db
      .select({
        zoneCode: siteZones.zoneCode,
        zoneName: siteZones.zoneName,
        activitiesCompleted: siteReportZones.activitiesCompleted,
        activitiesTomorrow: siteReportZones.activitiesPlannedTomorrow,
        workersInZone: siteReportZones.workersInZone,
        progressToday: siteReportZones.progressPercentToday,
        cumulative: siteReportZones.cumulativeProgressPercent,
        hasBlocker: siteReportZones.hasBlocker,
        blockerDescription: siteReportZones.blockerDescription,
      })
      .from(siteReportZones)
      .innerJoin(siteZones, eq(siteZones.id, siteReportZones.zoneId))
      .where(eq(siteReportZones.siteReportId, reportId)),
    db
      .select({
        caption: siteReportPhotos.caption,
        aiDetectedObjects: siteReportPhotos.aiDetectedObjects,
        aiSafetyConcerns: siteReportPhotos.aiSafetyConcerns,
        aiQualityConcerns: siteReportPhotos.aiQualityConcerns,
        aiProgressInferred: siteReportPhotos.aiProgressInferred,
      })
      .from(siteReportPhotos)
      .where(eq(siteReportPhotos.siteReportId, reportId)),
    db
      .select({
        roleCategory: siteWorkforceLogs.roleCategory,
        workerCount: siteWorkforceLogs.workerCount,
        hoursPerWorker: siteWorkforceLogs.hoursPerWorker,
      })
      .from(siteWorkforceLogs)
      .where(eq(siteWorkforceLogs.siteReportId, reportId)),
    db
      .select({
        materialName: materialPoLines.materialName,
        quantityUsed: materialConsumptionLogs.quantityConsumed,
        unit: materialPoLines.unitOfMeasure,
      })
      .from(materialConsumptionLogs)
      .innerJoin(
        materialPoLines,
        eq(materialPoLines.id, materialConsumptionLogs.poLineId),
      )
      .where(eq(materialConsumptionLogs.siteReportId, reportId)),
    db
      .selectDistinct({
        vendorName: vendors.legalName,
        engagementCode: vendorEngagements.engagementCode,
        scope: vendorEngagements.scopeDescription,
      })
      .from(siteReportZones)
      .innerJoin(
        vendorEngagements,
        eq(vendorEngagements.id, siteReportZones.vendorEngagementId),
      )
      .innerJoin(vendors, eq(vendors.id, vendorEngagements.vendorId))
      .where(eq(siteReportZones.siteReportId, reportId)),
  ]);

  // 5) Open run row.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: CONSTRUCTION_SUPERVISOR_KEY,
      runType: "scheduled",
      status: "running",
      model: aiModel(),
      inputSummary: `report=${reportId} zones=${zoneRows.length} photos=${photoRows.length} workforce=${workforceRows.length}`,
    })
    .returning({ id: aiAssistantRuns.id });
  const runId = run!.id;

  // 6) Provider call.
  const provider = getAIProvider();
  const isLive = provider.name !== "dry-run";
  const startMs = Date.now();
  const userPrompt = buildUserPrompt({
    project: projectRow?.name ?? "(unknown)",
    report,
    zoneRows,
    photoRows,
    workforceRows,
    materialRows,
    vendorRows,
  });

  let providerResp;
  try {
    providerResp = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2000,
      temperature: 0.2,
      responseFormat: "json",
      timeoutMs: 30_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "provider error";
    await markRunFailed(runId, message);
    return { reportId, status: "failed", errorMessage: message, runId };
  }
  const latencyMs = Date.now() - startMs;

  // 7) Parse + validate.
  let parsed;
  try {
    const raw = JSON.parse(providerResp.content);
    parsed = ResponseSchema.parse(isLive ? raw : synthesizeDryRun(raw, report));
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse failed";
    await markRunFailed(runId, `parse: ${message}`);
    return { reportId, status: "failed", errorMessage: message, runId };
  }

  // 8) Insert analysis + close run.
  const cost = computeCallCost({
    model: providerResp.model,
    promptTokens: providerResp.usage.promptTokens,
    completionTokens: providerResp.usage.completionTokens,
  });

  const [analysis] = await db
    .insert(aiConstructionAnalyses)
    .values({
      siteReportId: reportId,
      draftSummary: parsed.draft_summary,
      draftSummaryTranslations:
        parsed.draft_summary_translations as typeof aiConstructionAnalyses.$inferInsert["draftSummaryTranslations"],
      safetyStatus: parsed.safety_status,
      safetyConcerns: parsed.safety_concerns,
      immediateActionsRecommended: parsed.immediate_actions_recommended,
      estimatedCompletionPercent:
        parsed.estimated_completion_percent != null
          ? parsed.estimated_completion_percent.toFixed(2)
          : null,
      onTrackVsBudget: parsed.on_track_vs_budget ?? null,
      delayRiskFlags: parsed.delay_risk_flags,
      workforceFlags: parsed.workforce_flags,
      vendorFlags: parsed.vendor_flags,
      recommendedReviewerActions: parsed.recommended_reviewer_actions,
      rawResponse: providerResp.content,
      aiRunId: runId,
      status: "draft",
    })
    .returning({ id: aiConstructionAnalyses.id });

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
      outputSummary: parsed.draft_summary.slice(0, 500),
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));

  return {
    reportId,
    status: isLive ? "succeeded" : "dry_run",
    analysisId: analysis.id,
    runId,
  };
}

/**
 * Find submitted reports that have no active analysis. Used by the
 * cron job; oldest first; capped to keep a single tick under the
 * Vercel timeout.
 */
export async function findReportsNeedingAnalysis(
  limit = 10,
): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  // LEFT JOIN on the partial-unique active set; rows with no active
  // analysis come back as NULL.
  const rows = await db
    .select({ id: siteReports.id })
    .from(siteReports)
    .leftJoin(
      aiConstructionAnalyses,
      and(
        eq(aiConstructionAnalyses.siteReportId, siteReports.id),
        sql`${aiConstructionAnalyses.status} IN ('draft','approved','edited_approved')`,
      ),
    )
    .where(
      and(
        sql`${siteReports.status} IN ('submitted','reviewed')`,
        isNull(aiConstructionAnalyses.id),
      ),
    )
    .orderBy(siteReports.submittedAt)
    .limit(limit);
  return rows.map((r) => r.id);
}

const SYSTEM_PROMPT = `You are an experienced construction project supervisor (${SYSTEM_PROMPT_MARKER}) reviewing a daily site report from a Bali villa development project.

Respond with JSON only. Schema:
  draft_summary: 2-3 short paragraphs in clear professional English (translate from Indonesian/Russian if needed).
  draft_summary_translations: optional object {lang_code: translated_summary}, e.g. {"id": "...", "ru": "..."}. Provide if you can produce a high-quality translation.
  safety_status: one of "normal" | "minor_concerns" | "serious_concerns"
  safety_concerns: array of specific safety issues observed (workers without PPE, unguarded edges, etc.) — empty if none
  immediate_actions_recommended: array of concrete actions the supervisor should take TODAY
  estimated_completion_percent: 0-100 inferred from zones cumulative % (weighted by activity), or null
  on_track_vs_budget: true/false/null based on workforce ratio vs planned + visible progress
  delay_risk_flags: array of specific delay risks ("formwork delivery 2 days late", etc.)
  workforce_flags: array of significant deviations ("workforce 30% below planned", "no foreman on site")
  vendor_flags: array of vendor-specific issues
  recommended_reviewer_actions: short list of follow-ups for the project manager

Be specific and use concrete numbers from the data. Do NOT invent issues you cannot see.
If safety_status is 'serious_concerns', the immediate_actions_recommended must include at least one action.`;

interface SupervisorContext {
  project: string;
  report: {
    reportDate: string;
    summary: string | null;
    summaryTranslations: unknown;
    weatherConditions: string | null;
    weatherNotes: string | null;
    tempMin: number | null;
    tempMax: number | null;
    workersPresent: number;
    workersPlanned: number | null;
  };
  zoneRows: Array<{
    zoneCode: string;
    zoneName: string;
    activitiesCompleted: string[] | null;
    activitiesTomorrow: string[] | null;
    workersInZone: number;
    progressToday: string | null;
    cumulative: string | null;
    hasBlocker: boolean;
    blockerDescription: string | null;
  }>;
  photoRows: Array<{
    caption: string | null;
    aiDetectedObjects: unknown;
    aiSafetyConcerns: string[] | null;
    aiQualityConcerns: string[] | null;
    aiProgressInferred: string | null;
  }>;
  workforceRows: Array<{
    roleCategory: string;
    workerCount: number;
    hoursPerWorker: string;
  }>;
  materialRows: Array<{
    materialName: string;
    quantityUsed: string;
    unit: string;
  }>;
  vendorRows: Array<{
    vendorName: string;
    engagementCode: string;
    scope: string;
  }>;
}

function buildUserPrompt(c: SupervisorContext): string {
  const lines: string[] = [];
  lines.push(`Project: ${c.project}`);
  lines.push(`Date: ${c.report.reportDate}`);
  lines.push(
    `Workers: ${c.report.workersPresent}${c.report.workersPlanned ? ` / ${c.report.workersPlanned} planned` : ""}`,
  );
  if (c.report.weatherConditions) {
    lines.push(
      `Weather: ${c.report.weatherConditions}` +
        (c.report.tempMin != null && c.report.tempMax != null
          ? ` (${c.report.tempMin}–${c.report.tempMax}°C)`
          : "") +
        (c.report.weatherNotes ? ` — ${c.report.weatherNotes}` : ""),
    );
  }
  if (c.report.summary) {
    lines.push("");
    lines.push("Operator summary (may be in Indonesian/Russian/English):");
    lines.push(c.report.summary);
  }
  if (c.zoneRows.length > 0) {
    lines.push("");
    lines.push(`Zones (${c.zoneRows.length}):`);
    for (const z of c.zoneRows) {
      const blocker = z.hasBlocker
        ? ` BLOCKER: ${z.blockerDescription ?? "unspecified"}`
        : "";
      const cum = z.cumulative ? ` cumulative ${z.cumulative}%` : "";
      lines.push(
        `- ${z.zoneCode} ${z.zoneName}: ${z.workersInZone} workers,${cum}${blocker}`,
      );
      if (z.activitiesCompleted?.length) {
        lines.push(`    completed: ${z.activitiesCompleted.join("; ")}`);
      }
      if (z.activitiesTomorrow?.length) {
        lines.push(`    tomorrow:  ${z.activitiesTomorrow.join("; ")}`);
      }
    }
  }
  if (c.photoRows.length > 0) {
    lines.push("");
    lines.push(`Photos (${c.photoRows.length}):`);
    for (const p of c.photoRows.slice(0, 10)) {
      const safety = p.aiSafetyConcerns?.length
        ? ` [SAFETY: ${p.aiSafetyConcerns.join(", ")}]`
        : "";
      const quality = p.aiQualityConcerns?.length
        ? ` [QUALITY: ${p.aiQualityConcerns.join(", ")}]`
        : "";
      lines.push(
        `- ${p.caption ?? "(no caption)"}${safety}${quality}`,
      );
    }
  }
  if (c.workforceRows.length > 0) {
    lines.push("");
    lines.push("Workforce breakdown:");
    for (const w of c.workforceRows) {
      lines.push(
        `- ${w.workerCount}× ${w.roleCategory} @ ${w.hoursPerWorker}h`,
      );
    }
  }
  if (c.materialRows.length > 0) {
    lines.push("");
    lines.push("Material consumed:");
    for (const m of c.materialRows) {
      lines.push(`- ${m.quantityUsed} ${m.unit} ${m.materialName}`);
    }
  }
  if (c.vendorRows.length > 0) {
    lines.push("");
    lines.push("Vendors on site:");
    for (const v of c.vendorRows) {
      lines.push(`- ${v.vendorName} (${v.engagementCode}): ${v.scope}`);
    }
  }
  lines.push("");
  lines.push("Return the JSON schema only.");
  return lines.join("\n");
}

function synthesizeDryRun(
  raw: unknown,
  report: { workersPresent: number; workersPlanned: number | null },
): unknown {
  // Dry-run provider returns `{acknowledged: true, dry_run: true}`.
  // Synthesize a useful supervisor-shaped stub so HITL UI can render.
  if (typeof raw === "object" && raw !== null && "draft_summary" in raw) {
    return raw;
  }
  const understaffed =
    report.workersPlanned != null &&
    report.workersPresent < report.workersPlanned * 0.8;
  return {
    draft_summary:
      "[dry-run analysis] Site activity proceeded as expected. Operator summary translated and archived. Set ANTHROPIC_API_KEY + AI_DRY_RUN=0 for live supervisor analysis.",
    draft_summary_translations: {},
    safety_status: "normal",
    safety_concerns: [],
    immediate_actions_recommended: [],
    estimated_completion_percent: null,
    on_track_vs_budget: !understaffed,
    delay_risk_flags: [],
    workforce_flags: understaffed
      ? [
          `Workforce ${report.workersPresent}/${report.workersPlanned} — below 80% of plan`,
        ]
      : [],
    vendor_flags: [],
    recommended_reviewer_actions: [
      "Review operator summary for completeness",
      "Verify safety status against attached photos",
    ],
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
