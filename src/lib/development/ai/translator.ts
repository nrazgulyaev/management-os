import "server-only";

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { aiAssistantRuns, aiTranslationCache } from "@/lib/db/schema/ai";
import { siteReports } from "@/lib/db/schema/site-operations";
import { getAIProvider } from "@/lib/ai/providers";
import { computeCallCost } from "@/lib/ai/cost";
import { checkBudget } from "@/lib/ai/budget";
import { aiModel } from "@/lib/env";

/**
 * AI translation service.
 *
 * - Cache lookup by sha256(text + '|' + (context ?? '')) keyed with the
 *   target language. Hits update `last_used_at` + `hit_count` so we
 *   can prune cold rows later without losing recent activity.
 * - Misses call `getAIProvider().complete(...)` with a translation
 *   prompt. Result is written to cache + `ai_assistant_runs` (with
 *   cost columns).
 * - Budget enforcement on misses only — cache hits are free and never
 *   blocked.
 *
 * Languages: ISO 639-1 short codes ("en", "id", "ru", "zh"). The
 * agent budget key for translation work is `dev_os.translator`.
 */

export const TRANSLATOR_KEY = "dev_os.translator";
export type SupportedLang = "en" | "id" | "ru" | "zh";
const SUPPORTED_LANGS: ReadonlyArray<SupportedLang> = ["en", "id", "ru", "zh"];

const TranslateInput = z.object({
  text: z.string().min(1).max(10_000),
  sourceLanguage: z.enum(["en", "id", "ru", "zh", "auto"]).optional(),
  targetLanguage: z.enum(["en", "id", "ru", "zh"]),
  context: z.string().max(200).optional(),
});

export interface TranslateResult {
  translatedText: string;
  detectedSourceLanguage?: string;
  fromCache: boolean;
  costUsd?: number | null;
}

export async function translateText(
  input: z.input<typeof TranslateInput>,
): Promise<TranslateResult> {
  const parsed = TranslateInput.parse(input);
  if (parsed.sourceLanguage && parsed.sourceLanguage !== "auto") {
    if (parsed.sourceLanguage === parsed.targetLanguage) {
      return {
        translatedText: parsed.text,
        detectedSourceLanguage: parsed.sourceLanguage,
        fromCache: false,
      };
    }
  }

  const db = getDb();
  const hash = hashSourceText(parsed.text, parsed.context ?? null);

  // 1) Cache lookup.
  if (db) {
    const [hit] = await db
      .select()
      .from(aiTranslationCache)
      .where(
        and(
          eq(aiTranslationCache.sourceTextHash, hash),
          eq(aiTranslationCache.targetLanguage, parsed.targetLanguage),
        ),
      )
      .limit(1);
    if (hit) {
      // Bump usage stats (fire-and-forget — failure to update is non-fatal).
      await db
        .update(aiTranslationCache)
        .set({
          hitCount: sql`${aiTranslationCache.hitCount} + 1`,
          lastUsedAt: new Date(),
        })
        .where(eq(aiTranslationCache.id, hit.id));
      return {
        translatedText: hit.translatedText,
        detectedSourceLanguage: hit.sourceLanguage ?? undefined,
        fromCache: true,
      };
    }
  }

  // 2) Budget check (misses only).
  if (db) {
    const budget = await checkBudget(TRANSLATOR_KEY);
    if (budget.decision === "block") {
      const err = new Error(`Translation budget exceeded: ${budget.reason}`);
      // Record a budget-blocked run so the dashboard can show it.
      await db.insert(aiAssistantRuns).values({
        assistantKey: TRANSLATOR_KEY,
        runType: "manual",
        status: "budget_exceeded",
        inputSummary: `translate to=${parsed.targetLanguage} hash=${hash.slice(0, 12)}`,
        finishedAt: new Date(),
      });
      throw err;
    }
  }

  // 3) Provider call.
  const provider = getAIProvider();
  const isLive = provider.name !== "dry-run";
  const startMs = Date.now();
  let providerResp;
  try {
    providerResp = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(parsed),
        },
      ],
      maxTokens: 1000,
      temperature: 0.1,
      responseFormat: "json",
      timeoutMs: 20_000,
    });
  } catch (err) {
    if (db) {
      await db.insert(aiAssistantRuns).values({
        assistantKey: TRANSLATOR_KEY,
        runType: "manual",
        status: "failed",
        inputSummary: `translate to=${parsed.targetLanguage} hash=${hash.slice(0, 12)}`,
        errorMessage: err instanceof Error ? err.message : "provider error",
        finishedAt: new Date(),
      });
    }
    throw err;
  }
  const latencyMs = Date.now() - startMs;

  // 4) Parse response. Dry-run provider returns `{acknowledged: true}` —
  // fall back to a marker so callers can still cache something useful.
  const parsedJson = safeParseJson(providerResp.content);
  const translatedText =
    parsedJson?.translated_text ??
    parsedJson?.text ??
    (isLive
      ? providerResp.content.trim()
      : `[dry-run translation to ${parsed.targetLanguage}] ${parsed.text}`);
  const detectedSource =
    parsedJson?.source_language ??
    (parsed.sourceLanguage && parsed.sourceLanguage !== "auto"
      ? parsed.sourceLanguage
      : undefined);

  // 5) Cost tracking + run row.
  const cost = computeCallCost({
    model: providerResp.model,
    promptTokens: providerResp.usage.promptTokens,
    completionTokens: providerResp.usage.completionTokens,
  });

  if (db) {
    await db.insert(aiAssistantRuns).values({
      assistantKey: TRANSLATOR_KEY,
      runType: "manual",
      status: isLive ? "succeeded" : "dry_run",
      model: providerResp.model,
      promptTokens: providerResp.usage.promptTokens,
      completionTokens: providerResp.usage.completionTokens,
      totalTokens: providerResp.usage.totalTokens,
      latencyMs,
      inputCostUsd: cost ? cost.inputCostUsd.toFixed(4) : null,
      outputCostUsd: cost ? cost.outputCostUsd.toFixed(4) : null,
      totalCostUsd: cost ? cost.totalCostUsd.toFixed(4) : null,
      inputSummary: `translate to=${parsed.targetLanguage} chars=${parsed.text.length}`,
      outputSummary: translatedText.slice(0, 500),
      finishedAt: new Date(),
    });

    // 6) Cache the translation. ON CONFLICT covers the race where two
    // workers hit the same miss in parallel.
    await db
      .insert(aiTranslationCache)
      .values({
        sourceTextHash: hash,
        targetLanguage: parsed.targetLanguage,
        translatedText,
        sourceLanguage: detectedSource ?? null,
        context: parsed.context ?? null,
        hitCount: 0,
      })
      .onConflictDoNothing();
  }

  return {
    translatedText,
    detectedSourceLanguage: detectedSource,
    fromCache: false,
    costUsd: cost?.totalCostUsd ?? null,
  };
}

/**
 * Translate a site report's `summary` field into multiple target
 * languages and persist into `site_reports.summary_translations`.
 *
 * Idempotent — preserves any existing translations not in the target
 * list. Skips when the report has no summary text.
 */
export async function translateSiteReportSummary(
  reportId: string,
  targetLanguages: SupportedLang[],
): Promise<{ translated: SupportedLang[]; cached: SupportedLang[] }> {
  const db = getDb();
  if (!db) return { translated: [], cached: [] };

  const [report] = await db
    .select({
      id: siteReports.id,
      summary: siteReports.summary,
      existing: siteReports.summaryTranslations,
    })
    .from(siteReports)
    .where(eq(siteReports.id, reportId))
    .limit(1);
  if (!report || !report.summary) {
    return { translated: [], cached: [] };
  }

  const existing = (report.existing as Record<string, string> | null) ?? {};
  const translated: SupportedLang[] = [];
  const cached: SupportedLang[] = [];
  const next: Record<string, string> = { ...existing };

  for (const lang of targetLanguages) {
    if (!SUPPORTED_LANGS.includes(lang)) continue;
    if (existing[lang]) {
      cached.push(lang);
      continue;
    }
    const out = await translateText({
      text: report.summary,
      sourceLanguage: "auto",
      targetLanguage: lang,
      context: "Daily construction site report from a Bali villa project",
    });
    next[lang] = out.translatedText;
    if (out.fromCache) cached.push(lang);
    else translated.push(lang);
  }

  await db
    .update(siteReports)
    .set({
      summaryTranslations:
        next as typeof siteReports.$inferInsert["summaryTranslations"],
      updatedAt: new Date(),
    })
    .where(eq(siteReports.id, reportId));

  return { translated, cached };
}

function hashSourceText(text: string, context: string | null): string {
  return createHash("sha256")
    .update(text)
    .update("|")
    .update(context ?? "")
    .digest("hex");
}

const SYSTEM_PROMPT = `You are a professional translator for a Bali construction company.
Respond with JSON only. Schema:
  translated_text: the translated text in the target language
  source_language: ISO 639-1 code you detected (e.g. "id", "ru", "en", "zh")
Translate accurately, preserve construction terminology (zones, milestones, materials).
Do NOT invent details. Keep the same tone (factual, operational).`;

function buildUserPrompt(parsed: z.infer<typeof TranslateInput>): string {
  const lines: string[] = [];
  if (parsed.context) lines.push(`Context: ${parsed.context}`);
  if (parsed.sourceLanguage && parsed.sourceLanguage !== "auto") {
    lines.push(`Source language: ${parsed.sourceLanguage}`);
  }
  lines.push(`Target language: ${parsed.targetLanguage}`);
  lines.push(`Source text:`);
  lines.push(parsed.text);
  return lines.join("\n");
}

function safeParseJson(s: string): {
  translated_text?: string;
  text?: string;
  source_language?: string;
} | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
