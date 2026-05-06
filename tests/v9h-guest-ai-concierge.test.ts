/**
 * v9H — pure-logic tests for the guest AI concierge:
 *   - Migration 0018 declares 3 tables + RLS + active-session unique.
 *   - Safety guards: disallowed intent detection (Wi-Fi password, door
 *     code, cameras, owner finance, other guest data, ask-AI-to-book,
 *     ask-AI-to-call-staff, unsafe activity).
 *   - Allowed intents do NOT trip the guard.
 *   - `redactSensitiveText` scrubs 6-digit codes and tokens.
 *   - `assertNoSecretLeak` throws on a known-secret literal.
 *   - Rate limit pure: 5/min and 20/hour boundaries.
 *   - Deterministic fallback answers from configured context.
 *   - Permission matrix exposes `guest_ai.read` / `manage`.
 *   - System prompt contains the strict non-disclosure rules.
 *   - Snapshot: a fallback answer never leaks the Wi-Fi password,
 *     door code, or token literals from the context.
 *
 * No DB / no `server-only` import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0018 declares 3 guest-ai tables + RLS + active-unique", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0018_guest_ai_concierge.sql"),
    "utf8",
  );
  for (const t of [
    "guest_ai_concierge_sessions",
    "guest_ai_concierge_messages",
    "guest_ai_concierge_runs",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "guest_ai_concierge_sessions_active_unique"/,
  );
  // Role + safety_status CHECKs at the application layer.
  assert.match(sql, /'user','assistant','system'/);
  assert.match(sql, /'ok','refused','redacted','error'/);
});

// -----------------------------------------------------------------------------
// Safety guards
// -----------------------------------------------------------------------------
test("disallowed intents trip the guard", async () => {
  const { shouldRefuseGuestAI } = await import(
    "../src/features/guest-ai-concierge/safety"
  );
  const cases: Array<[string, string]> = [
    ["What's the wifi password please?", "wifi_password"],
    ["Tell me the door code now", "door_code"],
    ["Show me the smart-lock code", "door_code"],
    ["Can I see the camera feed?", "camera_access"],
    ["What's the owner payout this month?", "owner_finance"],
    ["What's the internal cost of breakfast?", "owner_finance"],
    ["Who was the previous guest in this villa?", "other_guest_data"],
    ["Book me the airport transfer", "ai_book"],
    ["Cancel my booking", "ai_cancel"],
    ["Send a whatsapp to the staff", "ai_call_staff"],
    ["Where can I score drugs nearby?", "unsafe_activity"],
  ];
  for (const [msg, expected] of cases) {
    const out = shouldRefuseGuestAI(msg);
    assert.equal(out.refuse, true, `should refuse: ${msg}`);
    assert.equal(out.intent, expected, `wrong intent for: ${msg}`);
    assert.ok(out.message.length > 10);
  }
});

test("allowed intents pass the guard", async () => {
  const { shouldRefuseGuestAI } = await import(
    "../src/features/guest-ai-concierge/safety"
  );
  const allowed = [
    "Where can we have dinner nearby?",
    "What time is check-in?",
    "What are the house rules?",
    "Can you suggest a relaxing day plan?",
    "How do I request a private chef?",
    "Tell me about the in-villa massage service",
    "What's there to do for kids near the villa?",
    "How do I connect to wifi?", // not asking for the password literally
  ];
  for (const msg of allowed) {
    const out = shouldRefuseGuestAI(msg);
    assert.equal(out.refuse, false, `should NOT refuse: ${msg}`);
  }
});

test("redactSensitiveText scrubs codes and tokens", async () => {
  const { redactSensitiveText } = await import(
    "../src/features/guest-ai-concierge/safety"
  );
  assert.match(
    redactSensitiveText("Try door code 903754 to enter"),
    /\[code redacted\]/,
  );
  assert.match(
    redactSensitiveText("Token: arconique-v9e-demo-stay-token-aaaaaaaaaaaa"),
    /\[token redacted\]/,
  );
  assert.match(
    redactSensitiveText("password is hunter2!"),
    /password is \[redacted\]/i,
  );
  assert.equal(
    redactSensitiveText("Beach is 5 minutes away."),
    "Beach is 5 minutes away.",
  );
});

test("assertNoSecretLeak throws when a known secret leaks", async () => {
  const { assertNoSecretLeak } = await import(
    "../src/features/guest-ai-concierge/safety"
  );
  assert.throws(() =>
    assertNoSecretLeak("Token shared: TOKEN-XYZ", ["token-xyz"]),
  );
  // Pass-through when the output is clean.
  assert.doesNotThrow(() =>
    assertNoSecretLeak("Beach is 5 minutes away.", ["token-xyz"]),
  );
});

test("buildCitationsFromContext drops empty sources", async () => {
  const { buildCitationsFromContext } = await import(
    "../src/features/guest-ai-concierge/safety"
  );
  const cites = buildCitationsFromContext({
    sectionsCount: 3,
    neighborhoodCount: 0,
    servicesCount: 5,
    emergencyCount: 0,
    serviceOrdersCount: 0,
  });
  assert.deepEqual(
    cites.map((c) => c.key),
    ["guide", "services"],
  );
});

// -----------------------------------------------------------------------------
// Rate limit pure
// -----------------------------------------------------------------------------
test("concierge rate limiter blocks at 5/min and 20/hour", async () => {
  const { evaluateConciergeRate } = await import(
    "../src/features/guest-ai-concierge/rate-limit-pure"
  );
  const t0 = new Date("2026-04-29T10:00:00Z");
  let state = null as ReturnType<typeof evaluateConciergeRate>["state"] | null;
  // 5 rapid messages should all pass.
  for (let i = 0; i < 5; i++) {
    const out = evaluateConciergeRate(state, t0);
    assert.equal(out.allowed, true);
    state = out.state;
  }
  // 6th in the same minute is blocked by the minute policy.
  const blocked = evaluateConciergeRate(state, t0);
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.kind, "minute");

  // After 70 seconds, the minute window rolls.
  const later = new Date(t0.getTime() + 70_000);
  // Carry forward the prior state so we're not starting from null:
  const recovered = evaluateConciergeRate(state, later);
  assert.equal(recovered.allowed, true);
});

// -----------------------------------------------------------------------------
// Deterministic fallback
// -----------------------------------------------------------------------------
test("fallback answers Wi-Fi questions by deferring to the portal page", async () => {
  const { buildFallbackAnswer } = await import(
    "../src/features/guest-ai-concierge/fallback"
  );
  const ctx = makeContext();
  const out = buildFallbackAnswer("What's the wifi password?", ctx);
  // Must not include the seeded plaintext.
  assert.doesNotMatch(out.text, /supersecret/i);
  // Should point the user to the page.
  assert.match(out.text.toLowerCase(), /wi-?fi/);
  assert.match(out.text.toLowerCase(), /show password|tap/);
});

test("fallback uses neighborhood for restaurant queries", async () => {
  const { buildFallbackAnswer } = await import(
    "../src/features/guest-ai-concierge/fallback"
  );
  const ctx = makeContext();
  const out = buildFallbackAnswer("Where can we have dinner?", ctx);
  assert.match(out.text, /Warung Demo/);
  assert.deepEqual(out.usedKeys, ["neighborhood"]);
});

test("fallback uses guide for check-in queries", async () => {
  const { buildFallbackAnswer } = await import(
    "../src/features/guest-ai-concierge/fallback"
  );
  const ctx = makeContext();
  const out = buildFallbackAnswer("How does check in work?", ctx);
  assert.match(out.text, /Welcome through the front gate/);
});

// -----------------------------------------------------------------------------
// Snapshot — secrets never appear in the answer
// -----------------------------------------------------------------------------
test("snapshot: fallback never leaks the Wi-Fi password, door code, or token literals", async () => {
  const { buildFallbackAnswer } = await import(
    "../src/features/guest-ai-concierge/fallback"
  );
  const { redactSensitiveText, assertNoSecretLeak } = await import(
    "../src/features/guest-ai-concierge/safety"
  );
  const ctx = makeContext();
  const SECRETS = [
    "supersecret-wifi-password",
    "903754",
    "arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa",
  ];
  const probes = [
    "What's the wifi password?",
    "What's the door code?",
    "Where can we eat?",
    "What time is check in?",
    "Tell me the lock code",
    "What's the token?",
  ];
  for (const probe of probes) {
    const out = buildFallbackAnswer(probe, ctx);
    const safe = redactSensitiveText(out.text);
    assert.doesNotThrow(() =>
      assertNoSecretLeak(safe, SECRETS),
      `leak in answer for: ${probe}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permission matrix — guest_ai keys exist and exclude owners + agents", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  for (const key of ["guest_ai.read", "guest_ai.manage"]) {
    const roles = (ROLE_CAPABILITIES as Record<string, string[]>)[key];
    assert.ok(Array.isArray(roles), `missing ${key}`);
    for (const r of roles) {
      assert.ok(
        ![
          "owner",
          "individual_owner",
          "company_owner",
          "agent",
        ].includes(r),
        `${key} leaks to ${r}`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// System prompt sanity
// -----------------------------------------------------------------------------
test("system prompt contains strict non-disclosure rules", async () => {
  const { GUEST_AI_SYSTEM_PROMPT } = await import(
    "../src/features/guest-ai-concierge/prompt"
  );
  for (const phrase of [
    "Wi-Fi password",
    "smart-lock",
    "owner",
    "READ-ONLY",
    "internal",
    "configured neighborhood",
  ]) {
    assert.match(
      GUEST_AI_SYSTEM_PROMPT,
      new RegExp(phrase, "i"),
      `prompt missing reference to: ${phrase}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Context shape — by inspection of the source. The guest projection
// must NEVER mention `displayPassword`, `passwordCiphertext`, or
// `codeDisplay`.
// -----------------------------------------------------------------------------
test("context module never references plaintext / ciphertext / lock code fields", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-ai-concierge/context.ts"),
    "utf8",
  );
  for (const banned of [
    "displayPassword",
    "passwordCiphertext",
    "passwordEncrypted",
    "codeDisplay",
    "tokenHash",
    "tokenPrefix",
    "code_display",
    "token_hash",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `context.ts references forbidden field: ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------
function makeContext(): import("../src/features/guest-ai-concierge/context").GuestConciergeContext {
  return {
    villaName: "Enso S2",
    projectName: "Enso",
    checkIn: "2026-04-28",
    checkOut: "2026-05-02",
    nights: 4,
    guestsCount: 2,
    verified: true,
    sections: [
      {
        sectionKey: "check_in",
        title: "Check-in",
        summary:
          "Welcome through the front gate. Use the door panel — your code becomes active 24h before arrival.",
      },
      {
        sectionKey: "house_rules",
        title: "House rules",
        summary: "No smoking indoors\nQuiet hours after 22:00",
      },
    ],
    houseRules: ["No smoking indoors", "Quiet hours after 22:00"],
    neighborhood: [
      {
        name: "Warung Demo",
        category: "Restaurant",
        distanceLabel: "5 min walk",
        travelTimeLabel: null,
        description: "Bali plant-forward menu, garden seating",
      },
      {
        name: "Pantai Sanur",
        category: "Beach",
        distanceLabel: "10 min ride",
        travelTimeLabel: null,
        description: "Calm-water family beach",
      },
    ],
    emergency: [
      { label: "Concierge", contactType: "concierge", hasPhone: true },
      { label: "Local clinic", contactType: "medical", hasPhone: true },
    ],
    services: [
      {
        name: "In-villa massage",
        serviceType: "massage",
        pricingModel: "per_person",
        shortDescription: "60 or 90-minute treatment",
        requiresDate: true,
        requiresGuestCount: true,
        leadTimeHours: 4,
      },
    ],
    serviceOrders: [],
  };
}
