import "server-only";

import { getAIProvider, AIProviderUnavailableError } from "@/lib/ai/providers";
import type { AICompletionResponse } from "@/lib/ai/providers";
import {
  parseLeadWelcomeDraft,
  type LeadWelcomeDraft,
} from "./sales-assistant-parser";

export type { LeadWelcomeDraft } from "./sales-assistant-parser";

/**
 * AI Sales Assistant — Stage 2.2.A scope.
 *
 * Draft-only, human-in-the-loop. Three capabilities:
 *   1. Generate a welcome-message draft for a brand-new lead.
 *   2. Suggest a qualification (hot/warm/cold) + reasoning.
 *   3. Suggest follow-up timing (next-touch ETA + channel).
 *
 * The agent NEVER sends. Output is persisted to `contact_interactions`
 * with `review_status='pending'`; a sales manager reviews/edits/approves
 * before any outbound communication happens.
 */

const SYSTEM_PROMPT = `You are an experienced real estate sales assistant for Arconique, a premium villa developer in Bali.

Your job is to draft a first-touch reply to inbound leads, classify their qualification, and recommend follow-up timing — in a single structured JSON response.

Voice:
- Warm but professional. Never pushy. No emojis. No exclamation marks.
- Short paragraphs. Maximum 6 sentences in the body.
- Mirror the lead's preferred language when known (default to English).
- Use the lead's first name once, near the start.

Knowledge boundaries:
- Use ONLY the context provided in the user message — project name, location, unit type interest, source, and the lead's initial message if any.
- DO NOT invent prices, square meters, handover dates, payment plans, or any specific facts about the project.
- If the lead asked a specific question you cannot answer from context, acknowledge it and promise that the team will follow up with the detail rather than fabricating a number.
- Never quote prices.

Output format — strict JSON, no prose outside the JSON:
{
  "subject": "string — short email/message subject (max 80 chars)",
  "body": "string — full draft message body, plain text",
  "qualification": "hot" | "warm" | "cold",
  "qualificationReasoning": "string — one or two sentences explaining the qualification",
  "followUp": {
    "channel": "whatsapp" | "email" | "phone" | "in_person",
    "etaHours": number,
    "reasoning": "string — short reasoning for the timing"
  },
  "language": "en" | "fr" | "es" | "de" | "it" | "id" | "zh" | "ja" | "other"
}

Qualification rubric:
- hot: explicit budget that fits ($800k+ USD); concrete timeline (within 6 months); specific unit type or villa interest; cash buyer; agent-referred from a known partner.
- warm: shows real intent (asks about pricing/payment plan/handover) but missing 1-2 of the hot signals.
- cold: no budget signal; vague timeline; "just looking" or research-mode wording; no specific project/unit interest.

Always return valid JSON. No markdown fences. No commentary.`;

export interface LeadWelcomeDraftInput {
  contact: {
    fullName: string;
    displayName?: string | null;
    preferredLanguage?: string | null;
    preferredCommunicationChannel?: string | null;
    countryOfResidence?: string | null;
    citizenship?: string | null;
  };
  project?: {
    name: string;
    location: string;
    slug: string;
  } | null;
  unitTypeInterest?: {
    name: string;
  } | null;
  acquisitionSource?: string | null;
  acquisitionSourceDetail?: string | null;
  initialMessage?: string | null;
}

export interface LeadWelcomeDraftResult {
  ok: true;
  draft: LeadWelcomeDraft;
  rawContent: string;
  usage: AICompletionResponse["usage"];
  model: string;
  durationMs: number;
}

export interface LeadWelcomeDraftFailure {
  ok: false;
  reason: "unavailable" | "provider_error" | "parse_error";
  message: string;
  durationMs: number;
}

export const SALES_ASSISTANT_KEY = "dev_os.sales_assistant";

/**
 * Generates a draft welcome reply + qualification suggestion + follow-up
 * timing recommendation for a new lead.
 *
 * Pure function: does not write to the DB. Caller is responsible for
 * logging to `aiAssistantRuns` and persisting the draft to
 * `contact_interactions` with `review_status='pending'`.
 */
export async function generateLeadWelcomeDraft(
  input: LeadWelcomeDraftInput,
): Promise<LeadWelcomeDraftResult | LeadWelcomeDraftFailure> {
  const start = Date.now();
  const provider = getAIProvider();

  try {
    const userMessage = renderUserMessage(input);
    const res = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 800,
      temperature: 0.4,
      responseFormat: "json",
    });

    const draft = parseLeadWelcomeDraft(res.content);
    if (!draft) {
      return {
        ok: false,
        reason: "parse_error",
        message:
          "Could not parse a valid LeadWelcomeDraft JSON object out of the model response.",
        durationMs: Date.now() - start,
      };
    }
    return {
      ok: true,
      draft,
      rawContent: res.content,
      usage: res.usage,
      model: res.model,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (err instanceof AIProviderUnavailableError) {
      return {
        ok: false,
        reason: "unavailable",
        message: err.message,
        durationMs: Date.now() - start,
      };
    }
    return {
      ok: false,
      reason: "provider_error",
      message: err instanceof Error ? err.message : "unknown provider error",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Regenerates a previously-drafted welcome reply, optionally with a
 * reviewer instruction (e.g. "shorter", "more formal", "address the
 * pricing question they asked").
 *
 * Pure function — caller is responsible for logging to `aiAssistantRuns`
 * and persisting the new draft alongside (not in place of) the original.
 */
export async function regenerateLeadWelcomeDraft(input: {
  base: LeadWelcomeDraftInput;
  previousDraftBody: string;
  reviewerInstruction?: string;
}): Promise<LeadWelcomeDraftResult | LeadWelcomeDraftFailure> {
  const start = Date.now();
  const provider = getAIProvider();

  try {
    const userMessage =
      renderUserMessage(input.base) +
      "\n\nPrevious draft (reviewer wants a regeneration):\n" +
      input.previousDraftBody +
      (input.reviewerInstruction
        ? `\n\nReviewer instruction: ${input.reviewerInstruction}`
        : "\n\nReviewer instruction: produce a fresh alternative — same tone, different wording.");
    const res = await provider.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 800,
      // Slightly higher temperature so the regeneration actually differs.
      temperature: 0.55,
      responseFormat: "json",
    });
    const draft = parseLeadWelcomeDraft(res.content);
    if (!draft) {
      return {
        ok: false,
        reason: "parse_error",
        message:
          "Could not parse a valid LeadWelcomeDraft JSON object from the regenerated response.",
        durationMs: Date.now() - start,
      };
    }
    return {
      ok: true,
      draft,
      rawContent: res.content,
      usage: res.usage,
      model: res.model,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (err instanceof AIProviderUnavailableError) {
      return {
        ok: false,
        reason: "unavailable",
        message: err.message,
        durationMs: Date.now() - start,
      };
    }
    return {
      ok: false,
      reason: "provider_error",
      message: err instanceof Error ? err.message : "unknown provider error",
      durationMs: Date.now() - start,
    };
  }
}

function renderUserMessage(input: LeadWelcomeDraftInput): string {
  const lines: string[] = [];
  lines.push(`Lead full name: ${input.contact.fullName}`);
  if (input.contact.displayName) lines.push(`Goes by: ${input.contact.displayName}`);
  if (input.contact.preferredLanguage)
    lines.push(`Preferred language: ${input.contact.preferredLanguage}`);
  if (input.contact.preferredCommunicationChannel)
    lines.push(`Preferred channel: ${input.contact.preferredCommunicationChannel}`);
  if (input.contact.countryOfResidence)
    lines.push(`Lives in: ${input.contact.countryOfResidence}`);
  if (input.contact.citizenship)
    lines.push(`Citizenship: ${input.contact.citizenship}`);
  if (input.project)
    lines.push(`Project of interest: ${input.project.name} (${input.project.location})`);
  if (input.unitTypeInterest)
    lines.push(`Unit type interest: ${input.unitTypeInterest.name}`);
  if (input.acquisitionSource)
    lines.push(`Source: ${input.acquisitionSource}${input.acquisitionSourceDetail ? ` — ${input.acquisitionSourceDetail}` : ""}`);
  if (input.initialMessage) {
    lines.push("");
    lines.push("Lead's initial message:");
    lines.push(input.initialMessage);
  }
  return lines.join("\n");
}

