/**
 * Pure parser for the AI Sales Assistant draft response.
 *
 * Lives outside `sales-assistant.ts` (which carries `import "server-only"`)
 * so the parser can be unit-tested via node:test without dragging in the
 * provider abstraction.
 */

export interface LeadWelcomeDraft {
  subject: string;
  body: string;
  qualification: "hot" | "warm" | "cold";
  qualificationReasoning: string;
  followUp: {
    channel: "whatsapp" | "email" | "phone" | "in_person";
    etaHours: number;
    reasoning: string;
  };
  language: string;
}

/**
 * Parses a model response (which may carry surrounding markdown fences).
 * Returns null when the response is not a valid `LeadWelcomeDraft`.
 */
export function parseLeadWelcomeDraft(raw: string): LeadWelcomeDraft | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const followUp = p.followUp as Record<string, unknown> | undefined;
  if (!followUp) return null;
  if (
    typeof p.subject !== "string" ||
    typeof p.body !== "string" ||
    !isQualification(p.qualification) ||
    typeof p.qualificationReasoning !== "string" ||
    !isChannel(followUp.channel) ||
    typeof followUp.etaHours !== "number" ||
    typeof followUp.reasoning !== "string" ||
    typeof p.language !== "string"
  ) {
    return null;
  }
  return {
    subject: p.subject,
    body: p.body,
    qualification: p.qualification,
    qualificationReasoning: p.qualificationReasoning,
    followUp: {
      channel: followUp.channel,
      etaHours: followUp.etaHours,
      reasoning: followUp.reasoning,
    },
    language: p.language,
  };
}

function isQualification(v: unknown): v is "hot" | "warm" | "cold" {
  return v === "hot" || v === "warm" || v === "cold";
}

function isChannel(
  v: unknown,
): v is "whatsapp" | "email" | "phone" | "in_person" {
  return (
    v === "whatsapp" || v === "email" || v === "phone" || v === "in_person"
  );
}
