"use server";

/**
 * Sprint 4.5 — Receipt OCR via the AI provider's image-attachment
 * path.
 *
 * Operator snaps / uploads a receipt photo; the bytes flow through
 * the existing `AIImageAttachment` channel (only honoured today by
 * the Anthropic provider, but the request shape is provider-agnostic
 * so future providers compose). The model is asked to return strict
 * JSON with the four operator-facing fields:
 *
 *   { date: "YYYY-MM-DD", amountMajor: number,
 *     vendor: string, suggestedCategory: string }
 *
 * Anything the model can't determine comes back as null. We never
 * mutate a transaction here — the action returns the extracted
 * fields and lets the caller decide what to do (typically prefill
 * a quick-entry row that the operator confirms).
 *
 * Auth: requires a signed-in user (the action is gated by the
 * same Stage-10.H product-access pattern as recordTransaction at
 * the route level; this action itself only requires a signed-in
 * appUser).
 *
 * Cost note: this is an interactive single-image call, not a
 * batched cron path. The AI provider's per-org budget cap (Sprint-1
 * audit) still applies — over-budget orgs get a clear error.
 */

import "server-only";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/providers";
import { isAiConfigured, isAiDryRun } from "@/lib/env";
import { getCurrentAppUser } from "@/features/auth/current-user";

const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

const inputSchema = z.object({
  /**
   * Base64-encoded image bytes (no `data:image/jpeg;base64,` prefix).
   * The client should strip the data URL prefix before posting.
   */
  imageBase64: z.string().min(1),
  mediaType: z.enum(ACCEPTED_MEDIA_TYPES),
});

export interface ExtractedReceipt {
  /** YYYY-MM-DD if the model could read it; null otherwise. */
  date: string | null;
  /** Major-units number (e.g. 12.50). null if unreadable. */
  amountMajor: number | null;
  /** ISO 4217 if explicit on the receipt; null otherwise. */
  currency: string | null;
  /** Counterparty / merchant name. */
  vendor: string | null;
  /**
   * Loose-string category suggestion (e.g. "Office supplies",
   * "Construction materials"). The operator picks the actual
   * org-catalogue category in the spreadsheet.
   */
  suggestedCategory: string | null;
  /** Short prose description suitable for the transaction `description` field. */
  description: string | null;
  /** Model's overall confidence — "high" | "medium" | "low" | null. */
  confidence: string | null;
  /** Raw model response (debug surface; never displayed to operators by default). */
  rawJson: string;
}

export type ExtractReceiptResult =
  | { ok: true; extracted: ExtractedReceipt }
  | { ok: false; reason: string };

const SYSTEM_PROMPT = `You are an OCR specialist. The user will send you a single photo of a paper receipt or invoice. Read everything you can and return STRICT JSON matching this schema (no commentary, no markdown fences):

{
  "date": "YYYY-MM-DD or null",
  "amountMajor": "number (total, in major units e.g. 12.50) or null",
  "currency": "ISO 4217 three-letter code or null (only if explicit on receipt)",
  "vendor": "merchant/counterparty name or null",
  "suggestedCategory": "short category guess (e.g. 'Office supplies') or null",
  "description": "short prose summary suitable for a bookkeeping description or null",
  "confidence": "high | medium | low"
}

Rules:
- If a field is illegible or absent, use null — never invent.
- Amount is the TOTAL paid (after tax/tip). Strip the currency symbol.
- For ambiguous dates (e.g. 04/05), prefer the format that matches the rest of the receipt's locale; if you can't tell, return null.
- Categories should be SHORT (1–3 words) and operator-facing, not Stripe-style codes.`;

export async function extractReceipt(
  input: z.input<typeof inputSchema>,
): Promise<ExtractReceiptResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, reason: "not_signed_in" };

  // HF-7 fix: when no AI key is configured (or AI_DRY_RUN=1), the
  // dry-run provider returns a synthetic `{acknowledged:true}` blob
  // that has no date/amount/vendor fields. The action would otherwise
  // "succeed" with an all-null extraction, leaving the operator
  // staring at empty fields with no idea why. Surface the real
  // cause: the AI key is missing in this environment.
  if (isAiDryRun() || !isAiConfigured()) {
    return {
      ok: false,
      reason:
        "ai_not_configured: set ANTHROPIC_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY) in the deployment environment to enable receipt OCR. Without it, the request runs against the dry-run stub which can't read receipts.",
    };
  }

  const provider = getAIProvider();
  let response;
  try {
    response = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Extract the receipt fields. Return STRICT JSON per the schema. No prose, no fences.",
          images: [
            {
              base64: parsed.data.imageBase64,
              mediaType: parsed.data.mediaType as AcceptedMediaType,
            },
          ],
        },
      ],
      responseFormat: "json",
      maxTokens: 600,
      temperature: 0.1,
    });
  } catch (err) {
    return {
      ok: false,
      reason: `provider_error: ${
        err instanceof Error ? err.message.slice(0, 200) : "unknown"
      }`,
    };
  }

  // Some providers wrap the JSON in markdown fences even when asked
  // not to. Strip if present.
  let body = response.content.trim();
  if (body.startsWith("```")) {
    body = body.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  }

  let parsedJson: Record<string, unknown>;
  try {
    parsedJson = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      reason: `model_returned_non_json: ${response.content.slice(0, 200)}`,
    };
  }

  function pickString(key: string): string | null {
    const v = parsedJson[key];
    return typeof v === "string" && v.trim().length > 0 && v !== "null"
      ? v.trim()
      : null;
  }

  function pickNumber(key: string): number | null {
    const v = parsedJson[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^\d.-]/g, "");
      const n = Number.parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  const extracted: ExtractedReceipt = {
    date: (() => {
      const d = pickString("date");
      return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    })(),
    amountMajor: pickNumber("amountMajor"),
    currency: (() => {
      const c = pickString("currency");
      return c && /^[A-Z]{3}$/.test(c) ? c : null;
    })(),
    vendor: pickString("vendor"),
    suggestedCategory: pickString("suggestedCategory"),
    description: pickString("description"),
    confidence: pickString("confidence"),
    rawJson: response.content,
  };

  return { ok: true, extracted };
}
