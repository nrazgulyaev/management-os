/**
 * v9J — pure-logic tests for the guest request center + concierge replies:
 *   - Migration 0020 declares replies table + RLS + indexes + handoff columns.
 *   - redactGuestReply / redactStaffReply remove codes, tokens, password
 *     literals, emails, phones, camera URLs.
 *   - canGuestReply blocks resolved/cancelled.
 *   - canStaffReply blocks cancelled but allows resolved.
 *   - buildSystemStatusReply produces guest-visible status_update /
 *     resolution drafts with redacted bodies and the right reply_type.
 *   - filterGuestVisible drops internal_only entries.
 *   - calculateHandoffSlaMetrics medians + overdue counts.
 *   - groupHandoffMetricsByVilla / Type / Priority shape.
 *   - formatDuration boundaries.
 *   - Permission matrix unchanged from v9I (handoff.read / manage).
 *   - Guest request detail page does not reference forbidden output fields.
 *   - Admin handoff detail does not surface tokenHash or password_ciphertext.
 *   - Notification templates `handoff_reply_guest` and `handoff_reply_staff`
 *     are seeded.
 *   - Snapshot: guest-visible projection never carries internal notes
 *     or secret literals.
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
test("migration 0020 declares replies table + RLS + handoff columns", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0020_guest_request_center.sql"),
    "utf8",
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS "guest_ai_handoff_replies"/,
  );
  for (const idx of [
    "guest_ai_handoff_replies_handoff_idx",
    "guest_ai_handoff_replies_service_request_idx",
    "guest_ai_handoff_replies_created_at_idx",
    "guest_ai_handoff_replies_visibility_idx",
  ]) {
    assert.match(sql, new RegExp(idx), `missing index ${idx}`);
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  for (const v of [
    "'guest'",
    "'staff'",
    "'system'",
    "'guest_visible'",
    "'internal_only'",
    "'message'",
    "'status_update'",
    "'resolution'",
    "'internal_note'",
  ]) {
    assert.match(sql, new RegExp(v));
  }
  // Handoff column additions.
  for (const col of [
    "first_staff_reply_at",
    "last_guest_reply_at",
    "last_staff_reply_at",
    "guest_unread_count",
    "staff_unread_count",
  ]) {
    assert.match(
      sql,
      new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`),
      `missing handoff column ${col}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Redaction
// -----------------------------------------------------------------------------
test("redactGuestReply scrubs codes, tokens, passwords, emails, phones, camera URLs", async () => {
  const { redactGuestReply } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  const cases: Array<[string, RegExp[]]> = [
    ["The door code is 903754", [/\[code redacted\]/]],
    [
      "token arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa here",
      [/\[token redacted\]/],
    ],
    ["password is hunter2!", [/password is \[redacted\]/i]],
    ["email me at guest@example.com please", [/\[email redacted\]/]],
    ["call +6281234567890", [/\[phone redacted\]/]],
    [
      "camera here rtsp://192.168.0.1/cam0",
      [/\[camera URL redacted\]/],
    ],
    [
      "watch the cctv at https://camera.example.com/live",
      [/\[camera URL redacted\]/],
    ],
  ];
  for (const [input, expected] of cases) {
    const out = redactGuestReply(input);
    for (const re of expected) {
      assert.match(out, re, `redaction missed for: ${input}`);
    }
  }
  // Clean text passes through.
  assert.equal(
    redactGuestReply("Beach is 5 minutes away."),
    "Beach is 5 minutes away.",
  );
});

test("redactStaffReply applies the same rules as guest", async () => {
  const { redactGuestReply, redactStaffReply } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  const text = "guest@example.com asked about door code 903754";
  assert.equal(redactGuestReply(text), redactStaffReply(text));
});

// -----------------------------------------------------------------------------
// Reply gates
// -----------------------------------------------------------------------------
test("canGuestReply blocks resolved/cancelled", async () => {
  const { canGuestReply } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  assert.equal(canGuestReply("created"), true);
  assert.equal(canGuestReply("linked_to_request"), true);
  assert.equal(canGuestReply("acknowledged"), true);
  assert.equal(canGuestReply("resolved"), false);
  assert.equal(canGuestReply("cancelled"), false);
});

test("canStaffReply blocks cancelled but allows resolved", async () => {
  const { canStaffReply } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  assert.equal(canStaffReply("resolved"), true);
  assert.equal(canStaffReply("cancelled"), false);
  assert.equal(canStaffReply("created"), true);
});

// -----------------------------------------------------------------------------
// System status reply builder
// -----------------------------------------------------------------------------
test("buildSystemStatusReply produces guest-visible drafts with right type", async () => {
  const { buildSystemStatusReply } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  const ack = buildSystemStatusReply("acknowledged", "Sari");
  assert.equal(ack.replyType, "status_update");
  assert.equal(ack.visibility, "guest_visible");
  assert.equal(ack.statusSnapshot, "acknowledged");
  assert.match(ack.body, /Sari/);

  const res = buildSystemStatusReply("resolved", null);
  assert.equal(res.replyType, "resolution");
  assert.equal(res.statusSnapshot, "resolved");
});

test("buildSystemStatusReply scrubs the actor label if it contains a secret", async () => {
  const { buildSystemStatusReply } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  const draft = buildSystemStatusReply(
    "acknowledged",
    "alice 903754",
  );
  assert.match(draft.bodyRedacted, /\[code redacted\]/);
});

// -----------------------------------------------------------------------------
// Guest-visible projection
// -----------------------------------------------------------------------------
test("filterGuestVisible drops internal_only entries", async () => {
  const { filterGuestVisible } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  const seed = [
    {
      id: "1",
      authorType: "guest" as const,
      visibility: "guest_visible" as const,
      bodyRedacted: "Hi",
      replyType: "message" as const,
      createdAt: new Date(),
    },
    {
      id: "2",
      authorType: "staff" as const,
      visibility: "internal_only" as const,
      bodyRedacted: "alice has access to this villa",
      replyType: "internal_note" as const,
      createdAt: new Date(),
    },
    {
      id: "3",
      authorType: "system" as const,
      visibility: "guest_visible" as const,
      bodyRedacted: "Acknowledged.",
      replyType: "status_update" as const,
      createdAt: new Date(),
    },
  ];
  const out = filterGuestVisible(seed);
  assert.equal(out.length, 2);
  assert.ok(!out.some((r) => r.visibility === "internal_only"));
});

// -----------------------------------------------------------------------------
// SLA metrics
// -----------------------------------------------------------------------------
test("calculateHandoffSlaMetrics medians + overdue counters", async () => {
  const { calculateHandoffSlaMetrics } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  const now = new Date("2026-04-29T10:00:00Z");
  const minute = 60_000;
  const rows = [
    // resolved fast
    {
      id: "a",
      status: "resolved" as const,
      priority: "normal" as const,
      handoffType: "ask_human" as const,
      createdAt: new Date(now.getTime() - 60 * minute),
      acknowledgedAt: new Date(now.getTime() - 55 * minute),
      resolvedAt: new Date(now.getTime() - 30 * minute),
      firstStaffReplyAt: new Date(now.getTime() - 50 * minute),
      villaCode: "ES-S2",
    },
    // urgent overdue (35 min old, no ack)
    {
      id: "b",
      status: "created" as const,
      priority: "urgent" as const,
      handoffType: "emergency_concern" as const,
      createdAt: new Date(now.getTime() - 35 * minute),
      acknowledgedAt: null,
      resolvedAt: null,
      firstStaffReplyAt: null,
      villaCode: "EV-S5",
    },
    // open but not overdue
    {
      id: "c",
      status: "linked_to_request" as const,
      priority: "normal" as const,
      handoffType: "service_question" as const,
      createdAt: new Date(now.getTime() - 30 * minute),
      acknowledgedAt: null,
      resolvedAt: null,
      firstStaffReplyAt: null,
      villaCode: "ES-S2",
    },
    // resolved slow
    {
      id: "d",
      status: "resolved" as const,
      priority: "high" as const,
      handoffType: "report_problem" as const,
      createdAt: new Date(now.getTime() - 4 * 60 * minute),
      acknowledgedAt: new Date(now.getTime() - 3 * 60 * minute),
      resolvedAt: new Date(now.getTime() - 60 * minute),
      firstStaffReplyAt: new Date(now.getTime() - 2 * 60 * minute),
      villaCode: "AH-01",
    },
  ];
  const sla = calculateHandoffSlaMetrics(rows, now);
  assert.equal(sla.total, 4);
  assert.equal(sla.open, 2);
  assert.equal(sla.urgentOpen, 1);
  // Overdue: row b (urgent > 30m), row c (normal, only 30m — at threshold, not over)
  assert.equal(sla.overdue, 1);
  // Median ack: rows a (300s), d (3600s) → 1950s
  assert.equal(sla.medianTimeToAcknowledgeSec, 1950);
  // Median resolve: a=30m=1800s, d=3h=10800s → 6300s
  assert.equal(sla.medianTimeToResolveSec, 6300);
});

test("groupHandoffMetricsByVilla / Type / Priority shape", async () => {
  const {
    groupHandoffMetricsByPriority,
    groupHandoffMetricsByType,
    groupHandoffMetricsByVilla,
  } = await import("../src/features/guest-ai-concierge/replies-pure");
  const t0 = new Date("2026-04-29T10:00:00Z");
  const rows = [
    {
      id: "1",
      status: "resolved" as const,
      priority: "normal" as const,
      handoffType: "ask_human" as const,
      createdAt: new Date(t0.getTime() - 60_000),
      acknowledgedAt: t0,
      resolvedAt: t0,
      firstStaffReplyAt: t0,
      villaCode: "ES-S2",
    },
    {
      id: "2",
      status: "created" as const,
      priority: "urgent" as const,
      handoffType: "emergency_concern" as const,
      createdAt: new Date(t0.getTime() - 60_000),
      acknowledgedAt: null,
      resolvedAt: null,
      firstStaffReplyAt: null,
      villaCode: "ES-S2",
    },
  ];
  const byVilla = groupHandoffMetricsByVilla(rows);
  assert.equal(byVilla.length, 1);
  assert.equal(byVilla[0].label, "ES-S2");
  assert.equal(byVilla[0].total, 2);
  assert.equal(byVilla[0].urgentOpen, 1);

  const byType = groupHandoffMetricsByType(rows);
  assert.equal(byType.length, 2);

  const byPriority = groupHandoffMetricsByPriority(rows);
  assert.equal(byPriority.length, 2);
});

test("formatDuration handles boundaries", async () => {
  const { formatDuration } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(180), "3m");
  assert.equal(formatDuration(3700), "1h 2m");
  assert.equal(formatDuration(86_400), "1d");
});

test("redactionWouldChange detects when staff text needs scrubbing", async () => {
  const { redactionWouldChange } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  assert.equal(redactionWouldChange("Hi, see you at 3pm").changed, false);
  assert.equal(
    redactionWouldChange("call me at +6281234567890").changed,
    true,
  );
});

// -----------------------------------------------------------------------------
// Permissions unchanged
// -----------------------------------------------------------------------------
test("permission matrix still has handoff.read / handoff.manage", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  for (const k of [
    "guest_ai.handoff.read",
    "guest_ai.handoff.manage",
  ]) {
    const roles = (ROLE_CAPABILITIES as Record<string, string[]>)[k];
    assert.ok(Array.isArray(roles), `missing ${k}`);
  }
});

// -----------------------------------------------------------------------------
// Static-source — no leaks in guest-facing pages
// -----------------------------------------------------------------------------
test("guest request detail page does not reference forbidden output fields", () => {
  const src = readFileSync(
    join(repoRoot, "src/app/(guest)/stay/[token]/requests/[code]/page.tsx"),
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
      `request detail references forbidden field: ${banned}`,
    );
  }
});

test("admin handoff detail page does not reveal tokenHash / passwordCiphertext", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/guest-ai/handoffs/[id]/page.tsx",
    ),
    "utf8",
  );
  for (const banned of [
    "tokenHash",
    "passwordCiphertext",
    "token_hash",
    "password_ciphertext",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `admin detail references ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Notification templates
// -----------------------------------------------------------------------------
test("seed.sql includes v9J reply notification templates", () => {
  const sql = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf8");
  for (const k of [
    "guest_ai.handoff_reply_guest",
    "guest_ai.handoff_reply_staff",
  ]) {
    assert.match(sql, new RegExp(k), `seed missing template ${k}`);
  }
});

// -----------------------------------------------------------------------------
// Snapshot: guest-visible projection never carries internal notes or secrets
// -----------------------------------------------------------------------------
test("snapshot: guest-visible timeline excludes internal notes and secret literals", async () => {
  const { filterGuestVisible, redactGuestReply } = await import(
    "../src/features/guest-ai-concierge/replies-pure"
  );
  const SECRETS = ["903754", "supersecret-wifi", "guest@example.com"];
  const seed = [
    {
      id: "1",
      authorType: "staff" as const,
      visibility: "internal_only" as const,
      bodyRedacted: "alice — door code is 903754",
      replyType: "internal_note" as const,
      createdAt: new Date(),
    },
    {
      id: "2",
      authorType: "staff" as const,
      visibility: "guest_visible" as const,
      bodyRedacted: redactGuestReply(
        "Hi! I'll bring towels. Reach me at guest@example.com",
      ),
      replyType: "message" as const,
      createdAt: new Date(),
    },
    {
      id: "3",
      authorType: "guest" as const,
      visibility: "guest_visible" as const,
      bodyRedacted: redactGuestReply("password is supersecret-wifi"),
      replyType: "message" as const,
      createdAt: new Date(),
    },
  ];
  const visible = filterGuestVisible(seed);
  for (const r of visible) {
    for (const s of SECRETS) {
      assert.ok(
        !r.bodyRedacted.toLowerCase().includes(s.toLowerCase()),
        `guest-visible reply leaked secret: ${s}`,
      );
    }
  }
  // Internal note must be filtered out.
  assert.ok(!visible.some((r) => r.replyType === "internal_note"));
});
