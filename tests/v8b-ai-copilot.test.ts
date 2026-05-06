/**
 * v8B — pure-logic smoke tests:
 *   - Migration 0010 shape (timezone, max_attempts, AI tables)
 *   - Notification template rendering (escape, substitution)
 *   - Retry backoff schedule
 *   - Timezone-aware quiet hours
 *   - AI tool allowlist (executeTool blocks unknown names)
 *   - Deterministic fallback summary risk levels
 *   - Zod schema rejects invalid riskLevel
 *   - Permission matrix has ai.*
 *
 * No DB / no `server-only` — every imported module is pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration 0010
// -----------------------------------------------------------------------------
test("migration 0010 declares ai tables, timezone, max_attempts", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0010_ai_ops_copilot_notification_polish.sql"),
    "utf8",
  );
  for (const t of [
    "notification_templates",
    "ai_assistant_runs",
    "ai_assistant_tool_calls",
    "ai_operations_summaries",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "timezone"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "max_attempts"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

// -----------------------------------------------------------------------------
// Retry backoff
// -----------------------------------------------------------------------------
test("computeNextRetryAt returns 30s, 5m, 30m and null after maxAttempts", async () => {
  const { computeNextRetryAt } = await import(
    "../src/features/notifications/retry"
  );
  const now = new Date("2026-04-26T12:00:00Z");
  const r1 = computeNextRetryAt(1, 3, now);
  const r2 = computeNextRetryAt(2, 3, now);
  const r3 = computeNextRetryAt(3, 3, now);
  assert.equal(r1?.getTime(), now.getTime() + 30_000);
  assert.equal(r2?.getTime(), now.getTime() + 5 * 60_000);
  assert.equal(r3, null);
});

test("canRetry reflects deliveryAttempts vs maxAttempts", async () => {
  const { canRetry } = await import("../src/features/notifications/retry");
  assert.equal(canRetry(0, 3), true);
  assert.equal(canRetry(2, 3), true);
  assert.equal(canRetry(3, 3), false);
  assert.equal(canRetry(7, 3), false);
});

// -----------------------------------------------------------------------------
// Timezone-aware quiet hours
// -----------------------------------------------------------------------------
test("isWithinQuietHours evaluates in recipient timezone", async () => {
  const { isWithinQuietHours } = await import(
    "../src/features/notifications/quiet-hours"
  );
  // 22:30–07:00 in Asia/Makassar (UTC+8). 23:00 WITA == 15:00 UTC.
  const insideWindow = new Date("2026-04-26T15:00:00Z");
  assert.equal(
    isWithinQuietHours(
      { quietHoursStart: "22:30", quietHoursEnd: "07:00" },
      insideWindow,
      "Asia/Makassar",
    ),
    true,
  );
  // 12:00 UTC == 20:00 WITA — outside the window.
  const outside = new Date("2026-04-26T12:00:00Z");
  assert.equal(
    isWithinQuietHours(
      { quietHoursStart: "22:30", quietHoursEnd: "07:00" },
      outside,
      "Asia/Makassar",
    ),
    false,
  );
});

test("resolveTimezone falls back to Asia/Makassar for unknown tz", async () => {
  const { resolveTimezone } = await import(
    "../src/features/notifications/quiet-hours"
  );
  assert.equal(resolveTimezone("Not/A/Real_Zone"), "Asia/Makassar");
  assert.equal(resolveTimezone("Asia/Singapore"), "Asia/Singapore");
  assert.equal(resolveTimezone(null), "Asia/Makassar");
});

test("nextQuietHoursEnd advances to next window close", async () => {
  const { nextQuietHoursEnd } = await import(
    "../src/features/notifications/quiet-hours"
  );
  const now = new Date("2026-04-26T15:00:00Z"); // 23:00 WITA
  const end = nextQuietHoursEnd(
    { quietHoursStart: "22:30", quietHoursEnd: "07:00" },
    now,
    "Asia/Makassar",
  );
  assert.ok(end instanceof Date);
  assert.ok(end!.getTime() > now.getTime());
});

// -----------------------------------------------------------------------------
// Notification templates
// -----------------------------------------------------------------------------
test("renderString HTML-escapes substituted values when mode=html", async () => {
  const { renderString } = await import(
    "../src/features/notifications/templates"
  );
  const out = renderString("<p>{{name}}</p>", { name: "<script>alert(1)</script>" }, "html");
  assert.match(out, /&lt;script&gt;/);
  assert.doesNotMatch(out, /<script>/);
});

test("renderString leaves text mode verbatim", async () => {
  const { renderString } = await import(
    "../src/features/notifications/templates"
  );
  assert.equal(
    renderString("hello {{name}}", { name: "<world>" }, "text"),
    "hello <world>",
  );
});

test("renderTemplate returns null html when template has no html_template", async () => {
  const { renderTemplate } = await import(
    "../src/features/notifications/templates"
  );
  const out = renderTemplate(
    {
      templateKey: "x",
      channel: "in_app",
      subjectTemplate: null,
      bodyTemplate: "hi {{n}}",
      htmlTemplate: null,
    },
    { n: "Anna" },
  );
  assert.equal(out.subject, null);
  assert.equal(out.body, "hi Anna");
  assert.equal(out.html, null);
});

test("chooseDeliveryContent uses fallback when no rendered template", async () => {
  const { chooseDeliveryContent } = await import(
    "../src/features/notifications/templates"
  );
  const out = chooseDeliveryContent({ title: "T", body: "B" }, null);
  assert.equal(out.title, "T");
  assert.equal(out.body, "B");
  assert.equal(out.html, null);
});

// -----------------------------------------------------------------------------
// AI tool allowlist
// -----------------------------------------------------------------------------
test("ALLOWED_TOOLS lists exactly the eight read-only tools", async () => {
  const { ALLOWED_TOOLS } = await import(
    "../src/features/ai/operations-copilot/tools-allowlist"
  );
  assert.deepEqual([...ALLOWED_TOOLS].sort(), [
    "getOperationsMetrics",
    "listBookingConflicts",
    "listCalendarFeeds",
    "listJobRuns",
    "listLowStockItems",
    "listMaintenanceTickets",
    "listOperationTasks",
    "listServiceRequests",
  ]);
});

test("isAllowedTool rejects unknown tools", async () => {
  const { isAllowedTool } = await import(
    "../src/features/ai/operations-copilot/tools-allowlist"
  );
  assert.equal(isAllowedTool("createBooking"), false);
});

test("isAllowedTool rejects close-but-wrong names (spelling drift)", async () => {
  const { isAllowedTool } = await import(
    "../src/features/ai/operations-copilot/tools-allowlist"
  );
  assert.equal(isAllowedTool("listLowStock"), false);
  assert.equal(isAllowedTool("listLowStockItems"), true);
});

// -----------------------------------------------------------------------------
// AI fallback summary
// -----------------------------------------------------------------------------
test("computeFallbackRiskLevel scales with snapshot metrics", async () => {
  const { computeFallbackRiskLevel } = await import(
    "../src/features/ai/operations-copilot/fallback"
  );
  const baseSnap = {
    generatedAt: "now",
    metrics: {
      openTasks: 0,
      overdueTasks: 0,
      todaysCheckins: 0,
      todaysCheckouts: 0,
      bookingConflicts: 0,
      lowStockItems: 0,
      failedJobsLast24h: 0,
      queuedNotifications: 0,
    },
    topTasks: [],
    conflicts: [],
    lowStock: [],
    jobRuns: [],
    serviceRequests: [],
    maintenance: [],
    feeds: [],
  };
  assert.equal(computeFallbackRiskLevel(baseSnap), "normal");
  assert.equal(
    computeFallbackRiskLevel({
      ...baseSnap,
      metrics: { ...baseSnap.metrics, bookingConflicts: 1 },
    }),
    "elevated",
  );
  assert.equal(
    computeFallbackRiskLevel({
      ...baseSnap,
      metrics: { ...baseSnap.metrics, bookingConflicts: 5 },
    }),
    "high",
  );
});

test("deterministicFallbackSummary always emits at least one recommendation", async () => {
  const { deterministicFallbackSummary } = await import(
    "../src/features/ai/operations-copilot/fallback"
  );
  const snap = {
    generatedAt: "now",
    metrics: {
      openTasks: 0,
      overdueTasks: 0,
      todaysCheckins: 0,
      todaysCheckouts: 0,
      bookingConflicts: 0,
      lowStockItems: 0,
      failedJobsLast24h: 0,
      queuedNotifications: 0,
    },
    topTasks: [],
    conflicts: [],
    lowStock: [],
    jobRuns: [],
    serviceRequests: [],
    maintenance: [],
    feeds: [],
  };
  const out = deterministicFallbackSummary(snap);
  assert.ok(out.recommendedActions.length >= 1);
  assert.equal(out.riskLevel, "normal");
});

// -----------------------------------------------------------------------------
// AI structured-response Zod validation
// -----------------------------------------------------------------------------
test("copilotResponseSchema rejects invalid riskLevel", async () => {
  const { copilotResponseSchema } = await import(
    "../src/features/ai/operations-copilot/types"
  );
  const result = copilotResponseSchema.safeParse({
    title: "ok",
    executiveSummary: "ok ok ok ok ok",
    riskLevel: "EXTREME",
    highlights: [],
    risks: [],
    recommendedActions: [],
  });
  assert.equal(result.success, false);
});

test("copilotResponseSchema accepts a minimal valid response", async () => {
  const { copilotResponseSchema } = await import(
    "../src/features/ai/operations-copilot/types"
  );
  const result = copilotResponseSchema.safeParse({
    title: "Daily briefing",
    executiveSummary: "All systems steady; no urgent action.",
    riskLevel: "normal",
    highlights: [],
    risks: [],
    recommendedActions: [],
  });
  assert.equal(result.success, true);
});

// -----------------------------------------------------------------------------
// Provider parser — strips fences, tolerates surrounding text
// -----------------------------------------------------------------------------
test("parseStructuredResponse tolerates ```json fences", async () => {
  const { parseStructuredResponse } = await import(
    "../src/features/ai/operations-copilot/response-parser"
  );
  const text =
    "```json\n" +
    JSON.stringify({
      title: "Daily briefing",
      executiveSummary: "All systems steady — no urgent action required.",
      riskLevel: "normal",
      highlights: [],
      risks: [],
      recommendedActions: [],
    }) +
    "\n```";
  const out = parseStructuredResponse(text);
  assert.equal(out.ok, true);
});

test("parseStructuredResponse rejects empty / non-JSON text", async () => {
  const { parseStructuredResponse } = await import(
    "../src/features/ai/operations-copilot/response-parser"
  );
  assert.equal(parseStructuredResponse("").ok, false);
  assert.equal(parseStructuredResponse("hello world").ok, false);
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix exposes ai.read | ai.run | ai.manage", async () => {
  const mod = await import("../src/features/auth/permission-matrix");
  for (const k of ["ai.read", "ai.run", "ai.manage"]) {
    assert.ok(
      Array.isArray(mod.ROLE_CAPABILITIES[k]),
      `missing ai capability key: ${k}`,
    );
    assert.ok(
      mod.ROLE_CAPABILITIES[k].includes("super_admin"),
      `super_admin should have ${k}`,
    );
  }
});

test("hasPermission honours demo mode short-circuit", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const ctx = {
    mode: "demo" as const,
    appUser: null,
    roles: [],
    isInternal: false,
    isSuperAdmin: false,
  };
  assert.equal(hasPermission(ctx, "ai.run"), true);
});

// -----------------------------------------------------------------------------
// Job catalog
// -----------------------------------------------------------------------------
test("ai_operations_summary_refresh job is registered, disabled by default", async () => {
  const { DEFAULT_JOB_DEFINITIONS } = await import(
    "../src/features/jobs/definitions"
  );
  const def = DEFAULT_JOB_DEFINITIONS.find(
    (d) => d.key === "ai_operations_summary_refresh",
  );
  assert.ok(def, "ai_operations_summary_refresh missing from default catalog");
  assert.equal(def!.enabled, false);
  assert.equal(def!.jobType, "ai_summary");
});
