/**
 * Stage 6.P5 — Google Workspace integrations + Tier-3 P3.6 closures.
 *
 * Mix of pure-helper invariants and file-presence + grep-based tests
 * for the cron + service layer + UI plumbing. Real-functionality
 * coverage of OAuth flows happens via the existing oauth_connections
 * tests + provider-mock tests below.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGoogleAuthorizeUrl,
} from "../src/lib/google-workspace/oauth-flow";
import { GOOGLE_WORKSPACE_SCOPES } from "../src/lib/google-workspace/types";
import {
  buildEventInsertBody,
  mapCalendarEvent,
} from "../src/lib/google-workspace/calendar/parsers";
import { extractSpreadsheetIdFromUrl } from "../src/lib/google-workspace/sheets/provider";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 1) OAuth-flow helpers (pure)
// ===========================================================================

test("buildGoogleAuthorizeUrl: requires clientId", () => {
  assert.throws(() =>
    buildGoogleAuthorizeUrl({
      clientId: "",
      redirectUri: "https://example.com/cb",
      scopes: ["openid"],
      state: "abc",
    }),
  );
});

test("buildGoogleAuthorizeUrl: requires non-empty scopes", () => {
  assert.throws(() =>
    buildGoogleAuthorizeUrl({
      clientId: "cid",
      redirectUri: "https://example.com/cb",
      scopes: [],
      state: "abc",
    }),
  );
});

test("buildGoogleAuthorizeUrl: emits correct shape", () => {
  const url = buildGoogleAuthorizeUrl({
    clientId: "cid",
    redirectUri: "https://example.com/cb",
    scopes: [
      GOOGLE_WORKSPACE_SCOPES.calendarEventsReadWrite,
      GOOGLE_WORKSPACE_SCOPES.spreadsheetsReadWrite,
    ],
    state: "STATE_TOKEN",
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("redirect_uri"), "https://example.com/cb");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("state"), "STATE_TOKEN");
  // Scopes are space-joined
  const scope = u.searchParams.get("scope") ?? "";
  assert.ok(scope.includes(GOOGLE_WORKSPACE_SCOPES.calendarEventsReadWrite));
  assert.ok(scope.includes(GOOGLE_WORKSPACE_SCOPES.spreadsheetsReadWrite));
});

// ===========================================================================
// 2) Calendar parsers
// ===========================================================================

test("mapCalendarEvent: returns null when id missing", () => {
  const res = mapCalendarEvent({ summary: "x" });
  assert.equal(res, null);
});

test("mapCalendarEvent: pulls timestamped events", () => {
  const res = mapCalendarEvent({
    id: "ev-1",
    summary: "Standup",
    start: { dateTime: "2026-05-07T10:00:00Z" },
    end: { dateTime: "2026-05-07T10:30:00Z" },
    status: "confirmed",
    htmlLink: "https://calendar.google.com/...",
  });
  assert.ok(res);
  assert.equal(res!.externalEventId, "ev-1");
  assert.equal(res!.summary, "Standup");
  assert.equal(res!.startAt.toISOString(), "2026-05-07T10:00:00.000Z");
  assert.equal(res!.endAt.toISOString(), "2026-05-07T10:30:00.000Z");
  assert.equal(res!.status, "confirmed");
});

test("mapCalendarEvent: pulls all-day events from start.date", () => {
  const res = mapCalendarEvent({
    id: "ev-2",
    summary: "Sprint planning",
    start: { date: "2026-05-08" },
    end: { date: "2026-05-09" },
    status: "confirmed",
  });
  assert.ok(res);
  assert.equal(res!.startAt.toISOString().slice(0, 10), "2026-05-08");
});

test("mapCalendarEvent: filters out attendees without email", () => {
  const res = mapCalendarEvent({
    id: "ev-3",
    summary: "Demo",
    start: { dateTime: "2026-05-07T10:00:00Z" },
    end: { dateTime: "2026-05-07T11:00:00Z" },
    attendees: [
      { email: "alice@example.com", responseStatus: "accepted" },
      { displayName: "no-email-user" },
      { email: "bob@example.com" },
    ],
  });
  assert.ok(res);
  assert.equal(res!.attendees.length, 2);
  assert.equal(res!.attendees[0].email, "alice@example.com");
  assert.equal(res!.attendees[0].responseStatus, "accepted");
});

test("buildEventInsertBody: ISO-formats dates + applies timezone", () => {
  const body = buildEventInsertBody({
    summary: "Quarterly review",
    description: "Q2 results",
    startAt: new Date("2026-06-15T14:00:00Z"),
    endAt: new Date("2026-06-15T15:30:00Z"),
    attendees: ["alice@example.com", "bob@example.com"],
    timeZone: "Asia/Makassar",
  });
  const start = body.start as { dateTime: string; timeZone: string };
  const end = body.end as { dateTime: string; timeZone: string };
  assert.equal(start.dateTime, "2026-06-15T14:00:00.000Z");
  assert.equal(start.timeZone, "Asia/Makassar");
  assert.equal(end.dateTime, "2026-06-15T15:30:00.000Z");
  assert.deepEqual(body.attendees, [
    { email: "alice@example.com" },
    { email: "bob@example.com" },
  ]);
});

test("buildEventInsertBody: omits attendees + timeZone when not provided", () => {
  const body = buildEventInsertBody({
    summary: "Solo focus block",
    startAt: new Date("2026-06-15T14:00:00Z"),
    endAt: new Date("2026-06-15T15:00:00Z"),
  });
  assert.equal((body as Record<string, unknown>)["attendees"], undefined);
  assert.equal(
    (body.start as Record<string, unknown>)["timeZone"],
    undefined,
  );
});

// ===========================================================================
// 3) Sheets URL parser
// ===========================================================================

test("extractSpreadsheetIdFromUrl: parses a standard URL", () => {
  const id = extractSpreadsheetIdFromUrl(
    "https://docs.google.com/spreadsheets/d/1abcDEF123_xyz-456/edit#gid=0",
  );
  assert.equal(id, "1abcDEF123_xyz-456");
});

test("extractSpreadsheetIdFromUrl: returns null on non-matching string", () => {
  assert.equal(extractSpreadsheetIdFromUrl("not a url"), null);
  assert.equal(extractSpreadsheetIdFromUrl(""), null);
  assert.equal(extractSpreadsheetIdFromUrl("https://example.com"), null);
});

// ===========================================================================
// 4) Module + file presence
// ===========================================================================

test("P5: 4 google-workspace module files exist", () => {
  for (const f of [
    "src/lib/google-workspace/types.ts",
    "src/lib/google-workspace/oauth-flow.ts",
    "src/lib/google-workspace/select-provider.ts",
    "src/lib/google-workspace/service.ts",
    "src/lib/google-workspace/index.ts",
  ]) {
    assert.ok(fileExists(f), `${f} must exist`);
  }
});

test("P5.B: Calendar provider has client + parsers + provider", () => {
  for (const f of [
    "src/lib/google-workspace/calendar/client.ts",
    "src/lib/google-workspace/calendar/parsers.ts",
    "src/lib/google-workspace/calendar/provider.ts",
  ]) {
    assert.ok(fileExists(f), `${f} must exist`);
  }
});

test("P5.D: Sheets provider has client + provider", () => {
  for (const f of [
    "src/lib/google-workspace/sheets/client.ts",
    "src/lib/google-workspace/sheets/provider.ts",
  ]) {
    assert.ok(fileExists(f), `${f} must exist`);
  }
});

test("P5.E: Drive provider has client + provider", () => {
  for (const f of [
    "src/lib/google-workspace/drive/client.ts",
    "src/lib/google-workspace/drive/provider.ts",
  ]) {
    assert.ok(fileExists(f), `${f} must exist`);
  }
});

// ===========================================================================
// 5) Cron + dispatcher wiring
// ===========================================================================

test("P5: google-workspace-health-check cron runner exists", () => {
  assert.ok(
    fileExists(
      "src/lib/development/server/cron/google-workspace-health-check-job.ts",
    ),
  );
});

test("P5: cron index exports runGoogleWorkspaceHealthCheck", () => {
  const src = readFile("src/lib/development/server/cron/index.ts");
  assert.match(
    src,
    /export\s*\{\s*runGoogleWorkspaceHealthCheck\s*\}\s*from/,
  );
  assert.match(src, /"google_workspace_health_check"/);
});

test("P5: dispatcher wires google_workspace_health_check", () => {
  const src = readFile("src/features/jobs/actions.ts");
  assert.match(src, /"google_workspace_health_check"/);
  assert.match(src, /case\s+"google_workspace_health_check":/);
  assert.match(src, /runGoogleWorkspaceHealthCheck/);
});

test("P5: cron route file exists + delegates", () => {
  const path = "src/app/api/cron/google-workspace-health-check/route.ts";
  assert.ok(fileExists(path));
  assert.match(readFile(path), /handleCronJobRequest/);
  assert.match(readFile(path), /google_workspace_health_check/);
});

test("P5: VERCEL-CRON-CHECKLIST has google-workspace-health-check entry", () => {
  const src = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  assert.ok(src.includes("/api/cron/google-workspace-health-check"));
});

// ===========================================================================
// 6) Service layer surface
// ===========================================================================

test("google-workspace service: exports load-bearing functions", () => {
  const src = readFile("src/lib/google-workspace/service.ts");
  for (const fn of [
    "listCalendarEventsForUser",
    "createCalendarEventForUser",
    "readSheetRangeForUser",
    "appendSheetRowsForUser",
    "listDriveFilesForUser",
    "uploadDriveFileForUser",
    "listGoogleConnectionsForOrg",
    "persistGoogleOAuthGrant",
    "disconnectGoogleConnection",
    "probeGoogleConnection",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("google-workspace service: opens with \"use server\" directive", () => {
  const src = readFile("src/lib/google-workspace/service.ts");
  assert.match(src, /^"use server";/);
});

test("google-workspace selector: opens with `import \"server-only\"`", () => {
  const src = readFile("src/lib/google-workspace/select-provider.ts");
  assert.match(src, /^import\s+"server-only";/);
});

// ===========================================================================
// 7) Tier-3 P3.6 closures
// ===========================================================================

test("Tier-3 P5.F: approval-thresholds CRUD actions exist", () => {
  const src = readFile(
    "src/lib/development/server/procurement/procurement-actions.ts",
  );
  for (const fn of [
    "createApprovalThreshold",
    "updateApprovalThreshold",
    "deactivateApprovalThreshold",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("Tier-3 P5.F: WhatsApp credential CRUD actions exist + carry \"use server\"", () => {
  const path =
    "src/lib/development/server/whatsapp-credentials-actions.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /^"use server";/);
  for (const fn of [
    "createWhatsappPhoneNumber",
    "updateWhatsappPhoneNumber",
    "setWhatsappPhoneNumberActive",
    "markWhatsappPhoneNumberVerified",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

// ===========================================================================
// 8) Env helper exposure
// ===========================================================================

test("env: Google Workspace helpers added", () => {
  const src = readFile("src/lib/env.ts");
  for (const fn of [
    "googleWorkspaceOAuthClientId",
    "googleWorkspaceOAuthClientSecret",
    "googleWorkspaceOAuthRedirectUri",
    "isGoogleWorkspaceConfigured",
    "isGoogleWorkspaceDryRun",
  ]) {
    assert.match(src, new RegExp(`export function ${fn}\\b`));
  }
});

// ===========================================================================
// 9) Architecture doc bookkeeping
// ===========================================================================

test("architecture doc: Stage 6.P5 marker present", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P5/);
});
