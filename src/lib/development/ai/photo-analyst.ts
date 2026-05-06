import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  siteReportPhotos,
  siteReports,
} from "@/lib/db/schema/site-operations";
import { documents } from "@/lib/db/schema/documents";
import { aiAssistantRuns } from "@/lib/db/schema/ai";
import {
  getAIProvider,
  PHOTO_ANALYST_PROMPT_MARKER,
  type AIImageAttachment,
} from "@/lib/ai/providers";
import { computeCallCost } from "@/lib/ai/cost";
import { checkBudget } from "@/lib/ai/budget";
import { getStorageProvider } from "@/lib/storage";
import { aiModel } from "@/lib/env";

/**
 * AI Photo Analyst — analyses one site report photo with Claude vision.
 *
 * Pipeline per photo:
 *   1. Read photo metadata + storage location.
 *   2. Check spend budget for `dev_os.photo_analyst`.
 *   3. Insert ai_assistant_runs row (status='running').
 *   4. Download bytes via the storage provider; convert to base64.
 *   5. Send a structured prompt + image to Claude. JSON response shape:
 *        { caption, detected_objects[], progress_inferred_pct,
 *          safety_concerns[], quality_concerns[], confidence }
 *   6. Update site_report_photos with the parsed analysis.
 *   7. Update ai_assistant_runs with cost + outcome.
 *
 * The agent is HITL-friendly: every analysis lands in DB columns the
 * detail page renders, but the photo's caption (operator-authored)
 * is never overwritten — `aiCaption` lives in `aiDetectedObjects`
 * JSON if the operator wants to copy it manually.
 *
 * Returns one outcome per attempted photo. Cron job batches calls.
 */

export const PHOTO_ANALYST_KEY = "dev_os.photo_analyst";
const ANALYST_MODEL_DEFAULT = "claude-haiku-4-5";

export interface PhotoAnalysisResult {
  photoId: string;
  status: "succeeded" | "failed" | "skipped" | "budget_exceeded" | "dry_run";
  detectedObjects?: string[];
  progressInferredPct?: number | null;
  safetyConcerns?: string[];
  qualityConcerns?: string[];
  costUsd?: number | null;
  errorMessage?: string;
  runId: string | null;
}

const ResponseSchema = z.object({
  caption: z.string().max(500),
  detected_objects: z.array(z.string()).max(20),
  progress_inferred_pct: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .optional(),
  safety_concerns: z.array(z.string().max(200)).max(10),
  quality_concerns: z.array(z.string().max(200)).max(10),
  confidence: z.number().min(0).max(1),
});

export async function analyzePhoto(
  photoId: string,
): Promise<PhotoAnalysisResult> {
  const db = getDb();
  if (!db) {
    return {
      photoId,
      status: "failed",
      errorMessage: "DB unavailable",
      runId: null,
    };
  }

  // 1) Look up photo + document + report.
  const [row] = await db
    .select({
      photoId: siteReportPhotos.id,
      reportId: siteReportPhotos.siteReportId,
      reportDate: siteReports.reportDate,
      caption: siteReportPhotos.caption,
      analyzedAt: siteReportPhotos.aiAnalyzedAt,
      bucket: documents.storageBucket,
      path: documents.storagePath,
      mime: documents.mimeType,
    })
    .from(siteReportPhotos)
    .innerJoin(documents, eq(documents.id, siteReportPhotos.documentId))
    .innerJoin(siteReports, eq(siteReports.id, siteReportPhotos.siteReportId))
    .where(eq(siteReportPhotos.id, photoId))
    .limit(1);

  if (!row) {
    return {
      photoId,
      status: "failed",
      errorMessage: "Photo not found",
      runId: null,
    };
  }
  if (row.analyzedAt) {
    return { photoId, status: "skipped", runId: null };
  }

  // 2) Budget check.
  const budget = await checkBudget(PHOTO_ANALYST_KEY);
  if (budget.decision === "block") {
    const [run] = await db
      .insert(aiAssistantRuns)
      .values({
        assistantKey: PHOTO_ANALYST_KEY,
        runType: "scheduled",
        status: "budget_exceeded",
        model: null,
        inputSummary: `photo=${photoId} budget=${budget.reason}`,
        finishedAt: new Date(),
      })
      .returning({ id: aiAssistantRuns.id });
    return {
      photoId,
      status: "budget_exceeded",
      errorMessage: budget.reason,
      runId: run?.id ?? null,
    };
  }

  // 3) Open run row.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: PHOTO_ANALYST_KEY,
      runType: "scheduled",
      status: "running",
      model: aiModel() || ANALYST_MODEL_DEFAULT,
      inputSummary: `photo=${photoId} caption=${(row.caption ?? "").slice(0, 80)}`,
    })
    .returning({ id: aiAssistantRuns.id });
  const runId = run!.id;

  // 4) Download bytes.
  if (!row.path || !row.bucket) {
    await markRunFailed(runId, "document missing storage location");
    return {
      photoId,
      status: "failed",
      errorMessage: "document missing storage location",
      runId,
    };
  }
  const storage = getStorageProvider();
  const download = await storage.download(row.bucket, row.path);
  if (!download) {
    await markRunFailed(runId, "storage download returned null");
    return {
      photoId,
      status: "failed",
      errorMessage: "storage download failed",
      runId,
    };
  }

  const provider = getAIProvider();
  const isLive = provider.name !== "dry-run";
  const imageBase64 = download.bytes.toString("base64");
  const mediaType = normalizeMediaType(row.mime);
  if (!mediaType) {
    await markRunFailed(runId, `unsupported media type ${row.mime}`);
    return {
      photoId,
      status: "failed",
      errorMessage: "unsupported media type",
      runId,
    };
  }

  const images: AIImageAttachment[] = isLive
    ? [{ base64: imageBase64, mediaType }]
    : [];

  const startMs = Date.now();
  let providerResp;
  try {
    providerResp = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(row.caption ?? null, row.reportDate),
          images,
        },
      ],
      maxTokens: 600,
      temperature: 0.2,
      responseFormat: "json",
      timeoutMs: 30_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "provider error";
    await markRunFailed(runId, message);
    return {
      photoId,
      status: "failed",
      errorMessage: message,
      runId,
    };
  }
  const latencyMs = Date.now() - startMs;

  // 5) Parse + validate.
  let parsed;
  try {
    parsed = ResponseSchema.parse(JSON.parse(providerResp.content));
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse failed";
    await markRunFailed(runId, `parse: ${message}`, providerResp);
    return {
      photoId,
      status: "failed",
      errorMessage: `parse: ${message}`,
      runId,
    };
  }

  // 6) Update photo + run rows.
  const cost = computeCallCost({
    model: providerResp.model,
    promptTokens: providerResp.usage.promptTokens,
    completionTokens: providerResp.usage.completionTokens,
  });

  await db
    .update(siteReportPhotos)
    .set({
      aiAnalyzedAt: new Date(),
      aiDetectedObjects: {
        objects: parsed.detected_objects,
        caption: parsed.caption,
        confidence: parsed.confidence,
      } as typeof siteReportPhotos.$inferInsert["aiDetectedObjects"],
      aiProgressInferred:
        parsed.progress_inferred_pct != null
          ? parsed.progress_inferred_pct.toFixed(2)
          : null,
      aiSafetyConcerns: parsed.safety_concerns,
      aiQualityConcerns: parsed.quality_concerns,
    })
    .where(eq(siteReportPhotos.id, photoId));

  const finalStatus: "succeeded" | "dry_run" = isLive ? "succeeded" : "dry_run";
  await db
    .update(aiAssistantRuns)
    .set({
      status: finalStatus,
      model: providerResp.model,
      promptTokens: providerResp.usage.promptTokens,
      completionTokens: providerResp.usage.completionTokens,
      totalTokens: providerResp.usage.totalTokens,
      latencyMs,
      inputCostUsd: cost ? cost.inputCostUsd.toFixed(4) : null,
      outputCostUsd: cost ? cost.outputCostUsd.toFixed(4) : null,
      totalCostUsd: cost ? cost.totalCostUsd.toFixed(4) : null,
      outputSummary: parsed.caption.slice(0, 500),
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));

  return {
    photoId,
    status: finalStatus,
    detectedObjects: parsed.detected_objects,
    progressInferredPct: parsed.progress_inferred_pct ?? null,
    safetyConcerns: parsed.safety_concerns,
    qualityConcerns: parsed.quality_concerns,
    costUsd: cost?.totalCostUsd ?? null,
    runId,
  };
}

/**
 * Find unanalyzed photos in submitted/reviewed reports, oldest first.
 * Limit defaults to 25 — keeps a single cron tick well under the
 * Vercel function timeout even at ~1.5s per Claude call.
 */
export async function findUnanalyzedPhotos(limit = 25): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: siteReportPhotos.id })
    .from(siteReportPhotos)
    .innerJoin(siteReports, eq(siteReports.id, siteReportPhotos.siteReportId))
    .where(
      and(
        isNull(siteReportPhotos.aiAnalyzedAt),
        sql`${siteReports.status} IN ('submitted','reviewed')`,
      ),
    )
    .orderBy(siteReportPhotos.createdAt)
    .limit(limit);
  return rows.map((r) => r.id);
}

const SYSTEM_PROMPT = `You are the Arconique site photo analyst (${PHOTO_ANALYST_PROMPT_MARKER}).
You receive a photo from a Bali villa construction site and must respond with JSON only.
Output schema:
  caption: short factual description (1 sentence, ≤200 chars)
  detected_objects: array of construction-relevant objects ("worker", "rebar", "concrete_pump", "scaffold", "crane", "excavator", "tile_stack", "broken_wall", etc.)
  progress_inferred_pct: visible build progress 0-100 if inferrable, else null
  safety_concerns: array of plain-English safety issues if visible (e.g. "worker without hard hat", "unguarded edge"), empty array if none
  quality_concerns: array of plain-English quality issues if visible (e.g. "honeycomb in concrete", "uneven render"), empty array if none
  confidence: 0.0 to 1.0 — how confident you are about the inferences above
Do not invent issues you cannot see. If the photo is too ambiguous, set confidence ≤ 0.3 and use empty arrays.`;

function buildUserPrompt(caption: string | null, reportDate: string): string {
  const lines: string[] = [];
  lines.push(`Photo from site report dated ${reportDate}.`);
  if (caption) lines.push(`Operator caption: ${caption}`);
  lines.push("Respond with the JSON schema only.");
  return lines.join("\n");
}

function normalizeMediaType(
  mime: string | null,
): AIImageAttachment["mediaType"] | null {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/png":
      return "image/png";
    case "image/webp":
      return "image/webp";
    case "image/gif":
      return "image/gif";
    default:
      return null;
  }
}

async function markRunFailed(
  runId: string,
  errorMessage: string,
  resp?: { usage: { promptTokens: number; completionTokens: number; totalTokens: number }; model: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(aiAssistantRuns)
    .set({
      status: "failed",
      errorMessage,
      model: resp?.model ?? null,
      promptTokens: resp?.usage.promptTokens ?? null,
      completionTokens: resp?.usage.completionTokens ?? null,
      totalTokens: resp?.usage.totalTokens ?? null,
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));
}
