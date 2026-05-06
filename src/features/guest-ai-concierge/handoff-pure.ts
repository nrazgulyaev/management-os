/**
 * Pure helpers for the v9I operational handoff. No DB, no
 * `server-only`. Tested directly against fixtures so behaviour is
 * pinned.
 */

import { redactSensitiveText } from "./safety";

export type HandoffType =
  | "ask_human"
  | "report_problem"
  | "emergency_concern"
  | "service_question"
  | "ai_refusal_followup";

export type HandoffPriority = "low" | "normal" | "high" | "urgent";

export interface MessageSnapshot {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface ClassifyInput {
  /** What the guest typed in the handoff modal. */
  message: string;
  /** Optional explicit type hint from the UI button. */
  hint?: HandoffType;
  /**
   * If the previous assistant message was a safety refusal, the
   * caller passes the refusal status so the type defaults to
   * `ai_refusal_followup`.
   */
  lastAssistantWasRefusal?: boolean;
}

const EMERGENCY_KEYWORDS = [
  "fire",
  "burn",
  "burning",
  "injury",
  "injured",
  "bleeding",
  "ambulance",
  "police",
  "intruder",
  "break-in",
  "break in",
  "broke in",
  "security threat",
  "stuck in",
  "drowning",
  "unconscious",
  "heart attack",
  "stroke",
  "dangerous",
  "smoke alarm",
];

const PROBLEM_KEYWORDS = [
  "broken",
  "leak",
  "leaking",
  "not working",
  "won't",
  "can't",
  "doesn't work",
  "doesnt work",
  "no hot water",
  "no water",
  "no power",
  "no electricity",
  "blackout",
  "smell",
  "smells",
  "stuck",
  "blocked",
  "clogged",
  "dirty",
  "missing",
  "lost",
  "damaged",
];

const SERVICE_QUESTION_KEYWORDS = [
  "how much",
  "price",
  "available",
  "available?",
  "can i book",
  "can we book",
  "how do i request",
  "how to request",
  "is there",
  "do you offer",
  "menu",
];

/** Pure: lowercased + collapsed whitespace. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Pure: take the last N non-system messages, in chronological order,
 * with each `content` redacted via the same secret-scrub used by the
 * AI output sanitiser. Defaults to 3.
 */
export function summarizeLastMessages(
  messages: ReadonlyArray<MessageSnapshot>,
  max = 3,
): MessageSnapshot[] {
  const filtered = messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  return filtered.slice(-max).map((m) => ({
    role: m.role,
    content: redactSensitiveText(m.content ?? ""),
    createdAt: m.createdAt,
  }));
}

/**
 * Pure: defence-in-depth wrapper around the safety redactor. Used
 * when persisting any free-text into a handoff row.
 */
export function redactHandoffContext(text: string): string {
  return redactSensitiveText(text ?? "");
}

/**
 * Pure: pick a handoff type. Order:
 *  1. Emergency keywords always win → `emergency_concern`.
 *  2. Caller-provided UI hint, when present.
 *  3. AI-refusal follow-up (if the previous assistant message was a
 *     refusal AND we didn't already classify as emergency).
 *  4. Keyword fallback: problem vs service-question vs generic
 *     ask_human.
 */
export function classifyHandoffType(input: ClassifyInput): HandoffType {
  const m = norm(input.message);
  if (containsAny(m, EMERGENCY_KEYWORDS)) {
    return "emergency_concern";
  }
  if (input.hint) {
    return input.hint;
  }
  if (input.lastAssistantWasRefusal) {
    return "ai_refusal_followup";
  }
  if (containsAny(m, PROBLEM_KEYWORDS)) {
    return "report_problem";
  }
  if (containsAny(m, SERVICE_QUESTION_KEYWORDS)) {
    return "service_question";
  }
  return "ask_human";
}

/**
 * Pure: priority. Emergencies are always urgent regardless of UI
 * input; non-emergency types take the explicit selection or fall
 * back to keyword inference.
 */
export interface PriorityInput {
  message: string;
  type: HandoffType;
  /** Selection from the UI radio. */
  preferred?: HandoffPriority;
}

export function inferHandoffPriority(input: PriorityInput): HandoffPriority {
  if (input.type === "emergency_concern") return "urgent";
  const m = norm(input.message);
  if (containsAny(m, ["asap", "right now", "immediately", "urgent"])) {
    return "high";
  }
  if (input.preferred) return input.preferred;
  if (input.type === "report_problem") return "high";
  return "normal";
}

function containsAny(s: string, words: ReadonlyArray<string>): boolean {
  for (const w of words) {
    if (s.includes(w)) return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// Service request payload builder
// -----------------------------------------------------------------------------

export interface HandoffStaySummary {
  villaId: string | null;
  bookingId: string | null;
  villaName: string | null;
  villaCode: string | null;
  bookingCode: string | null;
}

export interface HandoffForSrPayload {
  handoffType: HandoffType;
  priority: HandoffPriority;
  guestSummary: string;
  lastMessages: ReadonlyArray<MessageSnapshot>;
  preferredContact?: string | null;
}

export interface ServiceRequestPayload {
  villaId: string | null;
  bookingId: string | null;
  requestType: "guest_ai_handoff";
  title: string;
  message: string;
  priority: HandoffPriority;
  preferredContact: string | null;
}

/**
 * Pure: assemble the `service_requests` insert payload from a
 * handoff. The output is fully redacted and never contains the
 * original raw secrets — callers can persist it directly.
 */
export function buildServiceRequestFromHandoff(
  handoff: HandoffForSrPayload,
  stay: HandoffStaySummary,
): ServiceRequestPayload {
  const summary = redactSensitiveText(handoff.guestSummary).slice(0, 1000);
  const last = summarizeLastMessages(handoff.lastMessages, 3);
  const transcript = last
    .map(
      (m) =>
        `${m.role === "user" ? "Guest" : "AI concierge"}: ${m.content}`,
    )
    .join("\n");
  const villaLabel =
    stay.villaCode || stay.villaName || stay.bookingCode || "guest stay";
  const message = [
    `Submitted from /stay/[token]/concierge for ${villaLabel}.`,
    `Type: ${handoff.handoffType}`,
    "",
    `Guest message:\n${summary}`,
    last.length > 0 ? `\nRecent conversation:\n${transcript}` : "",
    handoff.preferredContact
      ? `\nPreferred contact: ${redactSensitiveText(
          handoff.preferredContact,
        )}`
      : "",
  ]
    .join("\n")
    .trim();

  return {
    villaId: stay.villaId,
    bookingId: stay.bookingId,
    requestType: "guest_ai_handoff",
    title: titleFor(handoff.handoffType, summary),
    message,
    priority: handoff.priority,
    preferredContact: handoff.preferredContact
      ? redactSensitiveText(handoff.preferredContact).slice(0, 200)
      : null,
  };
}

function titleFor(type: HandoffType, summary: string): string {
  const headline = summary.slice(0, 80).trim();
  switch (type) {
    case "emergency_concern":
      return `🚨 Emergency concern${headline ? ` — ${headline}` : ""}`;
    case "report_problem":
      return `Reported problem${headline ? ` — ${headline}` : ""}`;
    case "service_question":
      return `Service question${headline ? ` — ${headline}` : ""}`;
    case "ai_refusal_followup":
      return `AI refusal follow-up${headline ? ` — ${headline}` : ""}`;
    case "ask_human":
    default:
      return `Guest concierge handoff${headline ? ` — ${headline}` : ""}`;
  }
}

// -----------------------------------------------------------------------------
// Safety flags (advisory only — caller decides whether to pause)
// -----------------------------------------------------------------------------

export interface SafetyFlagSet {
  emergencyKeywords: boolean;
  problemKeywords: boolean;
  containedNumbers: boolean;
}

export function safetyFlagsFor(text: string): SafetyFlagSet {
  const m = norm(text);
  return {
    emergencyKeywords: containsAny(m, EMERGENCY_KEYWORDS),
    problemKeywords: containsAny(m, PROBLEM_KEYWORDS),
    containedNumbers: /\d{6,}/.test(text),
  };
}
