import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { aiAssistantRuns } from "@/lib/db/schema/ai";
import { getAIProvider } from "@/lib/ai/providers";
import { computeCallCost } from "@/lib/ai/cost";
import { checkBudget } from "@/lib/ai/budget";
import { aiModel } from "@/lib/env";

/**
 * Lightweight intent classifier for inbound WhatsApp messages.
 *
 * Returns one of five intents + a confidence score + intent-specific
 * structured extraction. Designed to be cheap (~$0.001/msg on Haiku
 * 4.5) and fast — single short prompt, JSON response.
 *
 * The classifier is a SUGGESTER. It never creates entities directly;
 * the inbound processor reads its output and creates DRAFT rows that
 * an operator approves.
 */

export const WHATSAPP_INTENT_KEY = "dev_os.whatsapp_intent_classifier";
const SYSTEM_PROMPT_MARKER = "DEV_OS_WHATSAPP_INTENT_V1";

export type Intent =
  | "site_report"
  | "safety_alert"
  | "vendor_inquiry"
  | "investor_question"
  | "unknown";

export interface ClassificationResult {
  status: "succeeded" | "dry_run" | "budget_exceeded" | "failed";
  intent: Intent;
  confidence: number;
  detectedLanguage: string | null;
  extractedData: Record<string, unknown>;
  runId: string | null;
  errorMessage?: string;
}

const ResponseSchema = z.object({
  intent: z.enum([
    "site_report",
    "safety_alert",
    "vendor_inquiry",
    "investor_question",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  detected_language: z.string().max(10).nullable().optional(),
  extracted_data: z.record(z.string(), z.unknown()).default({}),
});

export interface ClassifyInput {
  /** Sender entity type (from the phone resolver). */
  senderEntityType:
    | "app_user"
    | "investor"
    | "vendor"
    | "contact"
    | "unknown";
  /** Optional sender entity name for prompt context. */
  senderEntityName?: string;
  /** Body text. May be the voice transcript. */
  body: string;
  /** Whether the source was voice. */
  isVoice: boolean;
  /** Whether the message included media (photo / document). */
  hasMedia: boolean;
}

export async function classifyMessage(
  input: ClassifyInput,
): Promise<ClassificationResult> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      intent: "unknown",
      confidence: 0,
      detectedLanguage: null,
      extractedData: {},
      runId: null,
      errorMessage: "DB unavailable",
    };
  }

  // 1) Budget gate — never spend on classification when capped.
  const budget = await checkBudget(WHATSAPP_INTENT_KEY);
  if (budget.decision === "block") {
    const [run] = await db
      .insert(aiAssistantRuns)
      .values({
        assistantKey: WHATSAPP_INTENT_KEY,
        runType: "scheduled",
        status: "budget_exceeded",
        inputSummary: `whatsapp inbound budget=${budget.reason}`,
        finishedAt: new Date(),
      })
      .returning({ id: aiAssistantRuns.id });
    return {
      status: "budget_exceeded",
      intent: "unknown",
      confidence: 0,
      detectedLanguage: null,
      extractedData: {},
      runId: run?.id ?? null,
      errorMessage: budget.reason,
    };
  }

  // 2) Open run row.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: WHATSAPP_INTENT_KEY,
      runType: "scheduled",
      status: "running",
      model: aiModel(),
      inputSummary: `inbound from=${input.senderEntityType} chars=${input.body.length}`,
    })
    .returning({ id: aiAssistantRuns.id });
  const runId = run!.id;

  // 3) Provider call.
  const provider = getAIProvider();
  const isLive = provider.name !== "dry-run";
  const startMs = Date.now();
  const userPrompt = buildUserPrompt(input);

  let providerResp;
  try {
    providerResp = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 500,
      temperature: 0.1,
      responseFormat: "json",
      timeoutMs: 15_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "provider error";
    await markRunFailed(runId, message);
    return {
      status: "failed",
      intent: "unknown",
      confidence: 0,
      detectedLanguage: null,
      extractedData: {},
      runId,
      errorMessage: message,
    };
  }
  const latencyMs = Date.now() - startMs;

  // 4) Parse + Zod validate.
  let parsed;
  try {
    const raw = JSON.parse(providerResp.content);
    parsed = ResponseSchema.parse(
      isLive ? raw : synthesizeDryRun(raw, input),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse failed";
    await markRunFailed(runId, `parse: ${message}`);
    return {
      status: "failed",
      intent: "unknown",
      confidence: 0,
      detectedLanguage: null,
      extractedData: {},
      runId,
      errorMessage: message,
    };
  }

  // 5) Cost.
  const cost = computeCallCost({
    model: providerResp.model,
    promptTokens: providerResp.usage.promptTokens,
    completionTokens: providerResp.usage.completionTokens,
  });

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
      outputSummary: `intent=${parsed.intent} conf=${parsed.confidence}`,
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));

  return {
    status: isLive ? "succeeded" : "dry_run",
    intent: parsed.intent,
    confidence: parsed.confidence,
    detectedLanguage: parsed.detected_language ?? null,
    extractedData: parsed.extracted_data,
    runId,
  };
}

const SYSTEM_PROMPT = `You are an inbound WhatsApp message classifier (${SYSTEM_PROMPT_MARKER}) for an Arconique Bali villa development company.

Respond with JSON only. Schema:
  intent: one of "site_report" | "safety_alert" | "vendor_inquiry" | "investor_question" | "unknown"
  confidence: 0.0 to 1.0
  detected_language: ISO 639-1 (e.g. "en", "id", "ru", "zh") or null
  extracted_data: object with intent-specific fields (see below)

Intent rules:
- "site_report" — message describes work done on site (concrete pour, foundation, framing, finishes), workforce, weather, or progress. Common from foremen.
- "safety_alert" — explicit injury, accident, fall, fire, or "near miss" mention. Always flag if the word "injury" or local equivalents appear.
- "vendor_inquiry" — vendor asks about payment, scheduling, deliveries, or PO clarification.
- "investor_question" — questions about distributions, IRR, project status, exit timing.
- "unknown" — none of the above clearly applies, or message is too short / non-task.

Extracted_data per intent:
- site_report: { date?, zone_codes?: [], workers_present?: number, weather?, summary }
- safety_alert: { severity_hint?: "near_miss"|"minor"|"moderate"|"severe"|"fatal", workers_affected?: number, location?, description }
- vendor_inquiry: { topic?: "payment"|"delivery"|"schedule"|"other", po_reference?, summary }
- investor_question: { topic?: "distribution"|"irr"|"status"|"exit"|"other", summary }
- unknown: {}

CONFIDENCE rules:
- ≥ 0.8 only when message clearly matches a single intent.
- 0.5-0.8 when likely intent is clear but some ambiguity.
- < 0.5 when uncertain — operator MUST review.
Never invent details not in the message.`;

function buildUserPrompt(input: ClassifyInput): string {
  const lines: string[] = [];
  lines.push(`Sender entity type: ${input.senderEntityType}`);
  if (input.senderEntityName) {
    lines.push(`Sender name: ${input.senderEntityName}`);
  }
  lines.push(`Source: ${input.isVoice ? "voice (transcribed)" : "text"}`);
  if (input.hasMedia) lines.push("Includes media attachment.");
  lines.push("");
  lines.push("Message body:");
  lines.push(input.body || "(empty)");
  lines.push("");
  lines.push("Return the JSON schema only.");
  return lines.join("\n");
}

function synthesizeDryRun(
  raw: unknown,
  input: ClassifyInput,
): unknown {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "intent" in raw &&
    typeof (raw as { intent: unknown }).intent === "string"
  ) {
    return raw;
  }
  // Useful fallback inference based on sender type so HITL UI shows
  // something exercisable without a real LLM.
  let intent: Intent = "unknown";
  if (input.senderEntityType === "app_user") intent = "site_report";
  else if (input.senderEntityType === "vendor") intent = "vendor_inquiry";
  else if (input.senderEntityType === "investor") intent = "investor_question";
  return {
    intent,
    confidence: 0.5,
    detected_language: "en",
    extracted_data: {
      summary: input.body.slice(0, 200) || "[empty body]",
      dry_run: true,
    },
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
