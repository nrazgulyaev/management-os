/**
 * Pure safety guards for the guest AI concierge (v9H).
 *
 * No DB / no `server-only` import. All functions are deterministic so
 * the test suite can pin exact behaviour against known-bad prompts.
 *
 * Layered defence:
 *  1. `detectDisallowedIntent` — fast keyword classifier on the user
 *     message. Decides whether we even ask the model.
 *  2. `shouldRefuseGuestAI` — wraps (1) + a small set of safety words.
 *  3. `redactSensitiveText` — scrubs anything that LOOKS like a Wi-Fi
 *     password / door code / token from a string before persisting or
 *     replying. Defence-in-depth — we should already have stripped
 *     these from the context, but if the model hallucinates a 6-digit
 *     code that matches the lock pattern we still scrub it.
 *  4. `assertNoSecretLeak` — last-line check before we hand the answer
 *     back to the guest. Throws when a known secret literal slipped
 *     through.
 */

export type DisallowedIntent =
  | "wifi_password"
  | "door_code"
  | "camera_access"
  | "owner_finance"
  | "other_guest_data"
  | "ai_book"
  | "ai_pay"
  | "ai_cancel"
  | "ai_call_staff"
  | "unsafe_activity";

export interface IntentDetection {
  intent: DisallowedIntent | null;
  reason: string | null;
}

const DOOR_KEYWORDS = [
  "door code",
  "door pin",
  "lock code",
  "smart lock code",
  "smart-lock code",
  "smartlock code",
  "access code",
  "pin code",
];
const WIFI_KEYWORDS = [
  "wifi password",
  "wi-fi password",
  "wi fi password",
  "wlan password",
  "network password",
  "internet password",
];
const CAMERA_KEYWORDS = [
  "camera feed",
  "camera stream",
  "cctv",
  "security cam",
  "surveillance feed",
  "video feed",
];
const OWNER_FINANCE_KEYWORDS = [
  "owner statement",
  "owner finance",
  "owner payout",
  "investor finance",
  "investor share",
  "internal cost",
  "supplier cost",
  "margin",
  "profit",
];
const OTHER_GUEST_KEYWORDS = [
  "other guest",
  "previous guest",
  "another guest",
  "next guest",
  "who stayed",
];
const BOOK_KEYWORDS = [
  "book me",
  "book this",
  "book a",
  "reserve me",
  "schedule me",
  "place an order",
  "order this for me",
];
const PAY_KEYWORDS = ["pay now", "charge my", "credit card", "purchase"];
const CANCEL_KEYWORDS = [
  "cancel my booking",
  "cancel my stay",
  "cancel my reservation",
  "cancel my order",
  "cancel for me",
];
const CALL_STAFF_KEYWORDS = [
  "call the staff",
  "call concierge",
  "call the host",
  "send whatsapp",
  "send a whatsapp",
  "text me",
  "telegram them",
  "ring them",
];
const UNSAFE_KEYWORDS = [
  "buy drugs",
  "score drugs",
  "cocaine",
  "methamphetamine",
  "prostitute",
  "escort",
  "fake passport",
  "smuggle",
  "weapon",
  "gun shop",
];

const ALL_BUCKETS: ReadonlyArray<{
  intent: DisallowedIntent;
  keywords: readonly string[];
  reason: string;
}> = [
  {
    intent: "wifi_password",
    keywords: WIFI_KEYWORDS,
    reason: "guest asked the AI for the Wi-Fi password",
  },
  {
    intent: "door_code",
    keywords: DOOR_KEYWORDS,
    reason: "guest asked the AI for the door / smart-lock code",
  },
  {
    intent: "camera_access",
    keywords: CAMERA_KEYWORDS,
    reason: "guest asked about camera / surveillance feeds",
  },
  {
    intent: "owner_finance",
    keywords: OWNER_FINANCE_KEYWORDS,
    reason: "guest asked about owner / investor finance",
  },
  {
    intent: "other_guest_data",
    keywords: OTHER_GUEST_KEYWORDS,
    reason: "guest asked about other guests' data",
  },
  {
    intent: "ai_book",
    keywords: BOOK_KEYWORDS,
    reason: "guest asked the AI to book a service",
  },
  {
    intent: "ai_pay",
    keywords: PAY_KEYWORDS,
    reason: "guest asked the AI to take a payment",
  },
  {
    intent: "ai_cancel",
    keywords: CANCEL_KEYWORDS,
    reason: "guest asked the AI to cancel a booking / order",
  },
  {
    intent: "ai_call_staff",
    keywords: CALL_STAFF_KEYWORDS,
    reason: "guest asked the AI to contact staff directly",
  },
  {
    intent: "unsafe_activity",
    keywords: UNSAFE_KEYWORDS,
    reason: "guest asked about unsafe / illegal activity",
  },
];

/** Pure: lowercased message. */
export function normalizeUserMessage(message: string): string {
  return message.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Pure: classify the message into one disallowed intent. Returns
 * `{ intent: null }` when the message looks fine.
 */
export function detectDisallowedIntent(message: string): IntentDetection {
  const norm = normalizeUserMessage(message);
  for (const bucket of ALL_BUCKETS) {
    for (const k of bucket.keywords) {
      if (norm.includes(k)) {
        return { intent: bucket.intent, reason: bucket.reason };
      }
    }
  }
  return { intent: null, reason: null };
}

export interface RefuseDecision {
  refuse: boolean;
  intent: DisallowedIntent | null;
  message: string;
  reason: string | null;
}

/**
 * Compose a friendly refusal copy for each disallowed intent. The text
 * is intentionally brief and points the guest at the correct
 * (token-gated, audited) flow.
 */
export function refusalCopyFor(intent: DisallowedIntent): string {
  switch (intent) {
    case "wifi_password":
      return "I can't share the Wi-Fi password directly here. Open the Wi-Fi page from your stay menu and tap **Show password** — your stay is already verified, so it'll appear instantly.";
    case "door_code":
      return "I can't share the door code in chat. Open **Check-in** from your stay menu and tap **Show door code** — it appears 24 hours before arrival.";
    case "camera_access":
      return "There are no guest-facing camera feeds in this villa, and I can't share any internal monitoring. If something feels off, use the Emergency page.";
    case "owner_finance":
      return "I can only help with your stay. Owner / investor finance isn't visible from the guest portal.";
    case "other_guest_data":
      return "I can't share other guests' details — only your own stay.";
    case "ai_book":
    case "ai_pay":
    case "ai_cancel":
      return "I can guide you to the right service, but I can't book, charge, or cancel for you. Open the **Concierge & services** page and pick the option that fits — you'll see prices and confirm before submitting.";
    case "ai_call_staff":
      return "I'm not able to call or message staff for you. The fastest channel is the **Concierge & services** form, or the **Emergency** page for safety issues.";
    case "unsafe_activity":
      return "I can't help with that. For safety issues, please use the Emergency page.";
    default:
      return "I'm not able to help with that here.";
  }
}

/**
 * Pure: top-level guard. Returns whether to refuse + canned copy.
 */
export function shouldRefuseGuestAI(message: string): RefuseDecision {
  const det = detectDisallowedIntent(message);
  if (det.intent === null) {
    return { refuse: false, intent: null, message: "", reason: null };
  }
  return {
    refuse: true,
    intent: det.intent,
    message: refusalCopyFor(det.intent),
    reason: det.reason,
  };
}

// -----------------------------------------------------------------------------
// Output sanitisation
// -----------------------------------------------------------------------------

/**
 * Pure: scrub anything in the output that LOOKS like a credential.
 *
 * - 6-digit standalone numbers → "[code redacted]" (matches lock stub
 *   format). False-positive rate is acceptable: no real concierge
 *   answer needs to bake a 6-digit code into the text.
 * - 32+ char base64url tokens → "[token redacted]"
 * - Strings clearly framed as "password is XYZ" → "password is [redacted]"
 *
 * Never returns the original input on a redaction.
 */
export function redactSensitiveText(text: string): string {
  if (!text) return text;
  let out = text;

  // 6-digit standalone numbers (door codes).
  out = out.replace(
    /(?<!\d)\d{6}(?!\d)/g,
    "[code redacted]",
  );

  // 32+ character URL-safe tokens (raw stay tokens).
  out = out.replace(
    /\b[A-Za-z0-9_-]{32,}\b/g,
    "[token redacted]",
  );

  // "password is X" / "password: X" / "wifi password XYZ" patterns.
  out = out.replace(
    /(\b(?:password|passcode|pin)\b\s*(?:is|=|:)?\s*)([^\s.,!?]{4,})/gi,
    (_match, lead) => `${lead}[redacted]`,
  );

  return out;
}

/**
 * Pure: composite sanitiser used by the response layer. Combines
 * redaction + a length cap to prevent the model rambling past the
 * configured output budget.
 */
export function sanitizeGuestAIResponse(
  raw: string,
  opts: { maxWords?: number } = {},
): { text: string; redacted: boolean } {
  const max = opts.maxWords ?? 450;
  const redactedText = redactSensitiveText(raw);
  const redacted = redactedText !== raw;
  const words = redactedText.trim().split(/\s+/);
  const trimmed =
    words.length > max ? words.slice(0, max).join(" ") + "…" : redactedText;
  return { text: trimmed, redacted };
}

/**
 * Pure: belt-and-braces. Throws when a known-secret literal made it
 * into the output. The caller logs the leak and falls back to a
 * generic answer; the guest should never see the offending text.
 */
export function assertNoSecretLeak(
  output: string,
  secrets: ReadonlyArray<string | null | undefined>,
): void {
  for (const s of secrets) {
    if (!s) continue;
    if (s.length < 4) continue;
    if (output.toLowerCase().includes(s.toLowerCase())) {
      throw new Error(`SECRET_LEAK: output contained a forbidden value`);
    }
  }
}

/**
 * Pure: build citation labels from the assembled context so the UI can
 * show "based on your villa guide / neighborhood places / services
 * catalog". The labels are short and non-leaky.
 */
export interface CitationInput {
  sectionsCount: number;
  neighborhoodCount: number;
  servicesCount: number;
  emergencyCount: number;
  serviceOrdersCount: number;
}
export interface CitationLabel {
  key: string;
  label: string;
  count: number;
}

export function buildCitationsFromContext(
  c: CitationInput,
): CitationLabel[] {
  const labels: CitationLabel[] = [];
  if (c.sectionsCount > 0)
    labels.push({
      key: "guide",
      label: "Villa guide",
      count: c.sectionsCount,
    });
  if (c.neighborhoodCount > 0)
    labels.push({
      key: "neighborhood",
      label: "Neighborhood",
      count: c.neighborhoodCount,
    });
  if (c.servicesCount > 0)
    labels.push({
      key: "services",
      label: "Services catalog",
      count: c.servicesCount,
    });
  if (c.emergencyCount > 0)
    labels.push({
      key: "emergency",
      label: "Emergency contacts",
      count: c.emergencyCount,
    });
  if (c.serviceOrdersCount > 0)
    labels.push({
      key: "service_orders",
      label: "Your services",
      count: c.serviceOrdersCount,
    });
  return labels;
}
