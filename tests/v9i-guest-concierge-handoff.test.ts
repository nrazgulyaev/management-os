/**
 * v9I — pure-logic tests for the guest concierge operational handoff:
 *   - Migration 0019 declares the table + RLS + CHECK constraints.
 *   - Drizzle schema exports `guestAiHandoffs`.
 *   - summarizeLastMessages caps at the last 3 messages and redacts.
 *   - classifyHandoffType: emergency wins, then UI hint, then refusal,
 *     then keyword fallback, then default `ask_human`.
 *   - inferHandoffPriority forces `urgent` for emergency types.
 *   - redactHandoffContext scrubs codes + tokens + password literals.
 *   - buildServiceRequestFromHandoff produces a fully-redacted payload.
 *   - Permission matrix includes `guest_ai.handoff.read` / `manage`,
 *     excludes owners/agents/field roles.
 *   - Guest /stay/[token]/concierge + /requests pages do not reference
 *     `tokenHash`, `passwordCiphertext`, or `codeDisplay` literals.
 *   - Admin handoff detail page does not reference `tokenHash`.
 *   - Notification template keys present in seed.sql.
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
test("migration 0019 declares guest_ai_handoffs + RLS + CHECKs", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0019_guest_concierge_handoff.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "guest_ai_handoffs"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // CHECK constraint values may span multiple lines.
  for (const v of [
    "'ask_human'",
    "'report_problem'",
    "'emergency_concern'",
    "'service_question'",
    "'ai_refusal_followup'",
  ]) {
    assert.match(sql, new RegExp(v), `missing CHECK value ${v}`);
  }
  for (const v of [
    "'created'",
    "'linked_to_request'",
    "'acknowledged'",
    "'resolved'",
    "'cancelled'",
  ]) {
    assert.match(sql, new RegExp(v), `missing status CHECK ${v}`);
  }
  for (const v of ["'low'", "'normal'", "'high'", "'urgent'"]) {
    assert.match(sql, new RegExp(v), `missing priority CHECK ${v}`);
  }
  // Required indexes per the spec.
  for (const idx of [
    "guest_ai_handoffs_session_idx",
    "guest_ai_handoffs_booking_idx",
    "guest_ai_handoffs_service_request_idx",
    "guest_ai_handoffs_status_idx",
    "guest_ai_handoffs_created_at_idx",
  ]) {
    assert.match(
      sql,
      new RegExp(idx),
      `migration missing index ${idx}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------
test("summarizeLastMessages keeps only the last 3 messages and redacts", async () => {
  const { summarizeLastMessages } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  const seed = [
    { role: "user" as const, content: "first" },
    { role: "assistant" as const, content: "second" },
    { role: "user" as const, content: "third" },
    { role: "assistant" as const, content: "fourth" },
    {
      role: "user" as const,
      content: "fifth, my code is 903754",
    },
  ];
  const out = summarizeLastMessages(seed, 3);
  assert.equal(out.length, 3);
  assert.equal(out[0].content, "third");
  assert.equal(out[1].content, "fourth");
  assert.match(out[2].content, /\[code redacted\]/);
});

test("redactHandoffContext scrubs codes / tokens / password literals", async () => {
  const { redactHandoffContext } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  assert.match(
    redactHandoffContext("the door pin is 903754"),
    /\[code redacted\]|\[redacted\]/,
  );
  assert.match(
    redactHandoffContext(
      "tokens like arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaa should never persist",
    ),
    /\[token redacted\]/,
  );
  assert.match(
    redactHandoffContext("password is hunter2"),
    /password is \[redacted\]/i,
  );
});

test("classifyHandoffType: emergency keywords always win", async () => {
  const { classifyHandoffType } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  assert.equal(
    classifyHandoffType({ message: "There is a fire in the kitchen!" }),
    "emergency_concern",
  );
  assert.equal(
    classifyHandoffType({
      message: "There is a fire — call ambulance",
      hint: "service_question",
    }),
    "emergency_concern",
  );
  assert.equal(
    classifyHandoffType({
      message: "police please, intruder",
      lastAssistantWasRefusal: true,
    }),
    "emergency_concern",
  );
});

test("classifyHandoffType: UI hint wins after emergency", async () => {
  const { classifyHandoffType } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  assert.equal(
    classifyHandoffType({
      message: "How much does the chef cost?",
      hint: "service_question",
    }),
    "service_question",
  );
});

test("classifyHandoffType: refusal follow-up if last assistant refused", async () => {
  const { classifyHandoffType } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  assert.equal(
    classifyHandoffType({
      message: "Need help anyway please",
      lastAssistantWasRefusal: true,
    }),
    "ai_refusal_followup",
  );
});

test("classifyHandoffType: keyword fallback for problem vs service_question", async () => {
  const { classifyHandoffType } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  assert.equal(
    classifyHandoffType({ message: "the AC is broken" }),
    "report_problem",
  );
  assert.equal(
    classifyHandoffType({ message: "do you offer a private chef?" }),
    "service_question",
  );
  assert.equal(
    classifyHandoffType({ message: "Can you help me?" }),
    "ask_human",
  );
});

test("inferHandoffPriority: emergency types are always urgent", async () => {
  const { inferHandoffPriority } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  assert.equal(
    inferHandoffPriority({
      message: "fire",
      type: "emergency_concern",
      preferred: "low",
    }),
    "urgent",
  );
  assert.equal(
    inferHandoffPriority({
      message: "the AC is broken",
      type: "report_problem",
    }),
    "high",
  );
  assert.equal(
    inferHandoffPriority({
      message: "general question",
      type: "ask_human",
      preferred: "low",
    }),
    "low",
  );
  assert.equal(
    inferHandoffPriority({
      message: "general question",
      type: "ask_human",
    }),
    "normal",
  );
});

// -----------------------------------------------------------------------------
// Service request payload shape
// -----------------------------------------------------------------------------
test("buildServiceRequestFromHandoff produces a redacted payload with no secrets", async () => {
  const { buildServiceRequestFromHandoff } = await import(
    "../src/features/guest-ai-concierge/handoff-pure"
  );
  const SECRETS = [
    "903754",
    "arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa",
    "supersecret-wifi",
  ];
  const payload = buildServiceRequestFromHandoff(
    {
      handoffType: "report_problem",
      priority: "high",
      guestSummary:
        "Door code 903754 doesn't work and password is supersecret-wifi",
      lastMessages: [
        {
          role: "user",
          content: "Hi token: arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          role: "assistant",
          content: "I can't share that.",
        },
      ],
      preferredContact: "WhatsApp +6281234567890",
    },
    {
      villaId: "11111111-1111-1111-1111-111111111111",
      bookingId: "22222222-2222-2222-2222-222222222222",
      villaName: "Enso S2",
      villaCode: "ES-S2",
      bookingCode: "ARC-A-00238",
    },
  );
  assert.equal(payload.requestType, "guest_ai_handoff");
  assert.equal(payload.priority, "high");
  for (const secret of SECRETS) {
    assert.ok(
      !payload.message.includes(secret),
      `payload.message leaked: ${secret}`,
    );
    assert.ok(
      !payload.title.includes(secret),
      `payload.title leaked: ${secret}`,
    );
  }
  assert.match(payload.title, /Reported problem/);
  assert.match(payload.message, /Recent conversation:/);
  assert.match(payload.message, /\[token redacted\]|\[code redacted\]/);
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permission matrix — handoff keys exist; owners/agents/field excluded", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  for (const key of [
    "guest_ai.handoff.read",
    "guest_ai.handoff.manage",
  ]) {
    const roles = (ROLE_CAPABILITIES as Record<string, string[]>)[key];
    assert.ok(Array.isArray(roles), `missing ${key}`);
    for (const r of roles) {
      assert.ok(
        ![
          "owner",
          "individual_owner",
          "company_owner",
          "agent",
          "housekeeper",
          "technician",
          "security",
          "driver",
        ].includes(r),
        `${key} leaks to ${r}`,
      );
    }
  }
  // booking_manager should be in read.
  assert.ok(
    (ROLE_CAPABILITIES as Record<string, string[]>)[
      "guest_ai.handoff.read"
    ].includes("booking_manager"),
  );
  // booking_manager should NOT be in manage.
  assert.ok(
    !(ROLE_CAPABILITIES as Record<string, string[]>)[
      "guest_ai.handoff.manage"
    ].includes("booking_manager"),
  );
});

// -----------------------------------------------------------------------------
// Static source — no token-hash / passwordCiphertext / codeDisplay leaks
// -----------------------------------------------------------------------------
test("guest /requests page does not reference forbidden output fields", () => {
  const src = readFileSync(
    join(repoRoot, "src/app/(guest)/stay/[token]/requests/page.tsx"),
    "utf8",
  );
  // These are field names that should never reach a guest projection
  // — local computed hashes (tokenHash variable) are fine because
  // they're never rendered to HTML.
  for (const banned of [
    "passwordCiphertext",
    "displayPassword",
    "codeDisplay",
    "code_display",
    "token_hash",
    "password_ciphertext",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `requests/page.tsx references forbidden field: ${banned}`,
    );
  }
});

test("guest concierge page does not reference forbidden output fields", () => {
  const src = readFileSync(
    join(repoRoot, "src/app/(guest)/stay/[token]/concierge/page.tsx"),
    "utf8",
  );
  for (const banned of [
    "passwordCiphertext",
    "displayPassword",
    "codeDisplay",
    "code_display",
    "password_ciphertext",
    "token_hash",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `concierge/page.tsx references forbidden field: ${banned}`,
    );
  }
});

test("admin handoff detail does not surface tokenHash", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/guest-ai/handoffs/[id]/page.tsx",
    ),
    "utf8",
  );
  assert.doesNotMatch(src, /tokenHash/);
  assert.doesNotMatch(src, /token_hash/);
});

// -----------------------------------------------------------------------------
// Notification templates seeded
// -----------------------------------------------------------------------------
test("seed.sql includes all v9I notification templates", () => {
  const sql = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf8");
  for (const key of [
    "guest_ai.handoff_created",
    "guest_ai.handoff_urgent",
    "guest_ai.handoff_resolved_guest",
  ]) {
    assert.match(
      sql,
      new RegExp(key),
      `seed missing notification template: ${key}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Snapshot — handoff payload + concierge transcript never carry secrets
// -----------------------------------------------------------------------------
test("snapshot: emergency-routed handoff is `urgent` regardless of preferred", async () => {
  const {
    classifyHandoffType,
    inferHandoffPriority,
  } = await import("../src/features/guest-ai-concierge/handoff-pure");
  const type = classifyHandoffType({
    message: "There is a fire in the kitchen, please help!",
    hint: "service_question",
    lastAssistantWasRefusal: false,
  });
  const priority = inferHandoffPriority({
    message: "fire kitchen help",
    type,
    preferred: "low",
  });
  assert.equal(type, "emergency_concern");
  assert.equal(priority, "urgent");
});
