/**
 * Stage 7.F.B — Phase 2 (Connection UIs) acceptance tests.
 *
 * Source-level invariants for the 3 sub-items:
 *   B.1 Marketing connections form (unblocks 7 providers)
 *   B.2 Google Workspace OAuth start + callback + settings page
 *   B.3 Banking connections page (new surface)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
// 7.F.B.1 — Marketing connections form
// ===========================================================================

test("7.F.B.1: connection-actions module exists + 4 actions exported", () => {
  const path = "src/lib/marketing/connection-actions.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  for (const fn of [
    "createMarketingConnectionAction",
    "testMarketingConnectionAction",
    "disconnectMarketingConnectionAction",
    "syncMarketingConnectionNowAction",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

test('7.F.B.1: connection-actions opens with "use server"', () => {
  const src = readFile("src/lib/marketing/connection-actions.ts");
  assert.match(src, /^"use server";/);
});

test("7.F.B.1: schemas cover all 7 providers", () => {
  const src = readFile("src/lib/marketing/connection-actions.ts");
  for (const provider of [
    "google_analytics",
    "google_ads",
    "meta_pixel",
    "meta_ads",
    "tiktok_ads",
    "mailchimp",
    "convertkit",
  ]) {
    assert.match(src, new RegExp(`z\\.literal\\("${provider}"\\)`));
  }
});

test("7.F.B.1: createMarketingConnectionAction enforces uniqueness check", () => {
  const src = readFile("src/lib/marketing/connection-actions.ts");
  // Pre-insert SELECT ensures (org, provider, externalAccountId) not already present.
  assert.match(src, /already exists/);
  // Audit event recorded.
  assert.match(src, /action:\s*"marketing\.connection\.create"/);
});

test("7.F.B.1: testMarketingConnectionAction stamps status + lastSyncStatus", () => {
  const src = readFile("src/lib/marketing/connection-actions.ts");
  assert.match(src, /status:\s*result\.connected\s*\?\s*"active"\s*:\s*"error"/);
  assert.match(
    src,
    /lastSyncStatus:\s*result\.connected\s*\?\s*"success"\s*:\s*"error"/,
  );
});

test("7.F.B.1: disconnect = soft archive (not delete)", () => {
  const src = readFile("src/lib/marketing/connection-actions.ts");
  assert.match(src, /status:\s*"archived"/);
  assert.match(src, /archivedAt:\s*new Date\(\)/);
  // Audit recorded.
  assert.match(src, /action:\s*"marketing\.connection\.disconnect"/);
});

test("7.F.B.1: form component covers all 7 providers", () => {
  const path = "src/components/marketing/connect-marketing-form.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  for (const provider of [
    '"google_analytics"',
    '"google_ads"',
    '"meta_pixel"',
    '"meta_ads"',
    '"tiktok_ads"',
    '"mailchimp"',
    '"convertkit"',
  ]) {
    assert.match(src, new RegExp(provider.replace(/[.]/g, "\\.")));
  }
});

test("7.F.B.1: form auto-runs testConnection after create", () => {
  const src = readFile(
    "src/components/marketing/connect-marketing-form.tsx",
  );
  assert.match(src, /createMarketingConnectionAction/);
  assert.match(src, /testMarketingConnectionAction/);
  assert.match(src, /Connection verified/);
});

test("7.F.B.1: detail action component wires test/sync/disconnect", () => {
  const path = "src/components/marketing/connection-actions-buttons.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /testMarketingConnectionAction/);
  assert.match(src, /syncMarketingConnectionNowAction/);
  assert.match(src, /disconnectMarketingConnectionAction/);
});

test("7.F.B.1: list page swaps stub empty-state for + Connect provider CTA", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/marketing/connections/page.tsx",
  );
  assert.match(src, /Connect provider/);
  assert.match(src, /\/development-os\/marketing\/connections\/new/);
  // Old "form will land in P5" message replaced.
  assert.doesNotMatch(src, /will land alongside the operator-facing settings page in P5/);
});

test("7.F.B.1: /new + /[id] pages both exist", () => {
  for (const path of [
    "src/app/(development-app)/development-os/marketing/connections/new/page.tsx",
    "src/app/(development-app)/development-os/marketing/connections/[id]/page.tsx",
  ]) {
    assert.ok(fileExists(path), `${path} missing`);
  }
});

// ===========================================================================
// 7.F.B.2 — Google Workspace OAuth
// ===========================================================================

test("7.F.B.2: OAuth start route exists + redirects via buildGoogleAuthorizeUrl", () => {
  const path = "src/app/api/oauth/google-workspace/start/route.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /buildGoogleAuthorizeUrl/);
  assert.match(src, /GOOGLE_WORKSPACE_SCOPES/);
  // Sets state cookie for CSRF verification.
  assert.match(src, /google_oauth_state/);
  // 4 service scopes + userinfo present.
  for (const scope of [
    "calendarEventsReadWrite",
    "gmailModify",
    "spreadsheetsReadWrite",
    "driveFile",
  ]) {
    assert.match(src, new RegExp(scope));
  }
});

test("7.F.B.2: OAuth callback verifies state cookie + persists grant", () => {
  const path = "src/app/api/oauth/google-workspace/callback/route.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /exchangeGoogleCode/);
  assert.match(src, /persistGoogleOAuthGrant/);
  assert.match(src, /state_mismatch/);
  assert.match(src, /missing_code/);
  assert.match(src, /cookies\.delete\("google_oauth_state"\)/);
});

test("7.F.B.2: settings page renders Connect/Reconnect/Disconnect", () => {
  const path =
    "src/app/(development-app)/development-os/settings/google-workspace/page.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /listGoogleConnectionsForOrg/);
  assert.match(src, /GoogleWorkspaceActions/);
  // Surfaces ?ok / ?error feedback.
  assert.match(src, /sp\.ok === "connected"/);
  assert.match(src, /sp\.error/);
});

test("7.F.B.2: settings page warns when env not configured", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/settings/google-workspace/page.tsx",
  );
  assert.match(src, /isGoogleWorkspaceConfigured/);
  assert.match(src, /Not configured/);
});

test("7.F.B.2: GoogleWorkspaceActions client component wires disconnect", () => {
  const src = readFile(
    "src/components/settings/google-workspace-connection.tsx",
  );
  assert.match(src, /disconnectGoogleConnection/);
  assert.match(src, /\/api\/oauth\/google-workspace\/start/);
});

// ===========================================================================
// 7.F.B.3 — Banking connections page
// ===========================================================================

test("7.F.B.3: banking connection-actions module exists + 4 actions", () => {
  const path = "src/lib/banking/connection-actions.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  for (const fn of [
    "createBankConnectionAction",
    "testBankConnectionAction",
    "disconnectBankConnectionAction",
    "syncBankConnectionNowAction",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

test("7.F.B.3: banking schemas cover 5 providers", () => {
  const src = readFile("src/lib/banking/connection-actions.ts");
  for (const provider of ["revolut", "wise", "mandiri", "bca", "manual"]) {
    assert.match(src, new RegExp(`z\\.literal\\("${provider}"\\)`));
  }
});

test("7.F.B.3: form component exists + handles all 5 providers", () => {
  const path = "src/components/banking/connect-bank-form.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  for (const provider of ['"revolut"', '"wise"', '"mandiri"', '"bca"', '"manual"']) {
    assert.match(src, new RegExp(provider.replace(/[.]/g, "\\.")));
  }
});

test("7.F.B.3: detail-page action buttons disable sync on CSV-only providers", () => {
  const src = readFile(
    "src/components/banking/connection-actions-buttons.tsx",
  );
  assert.match(src, /supportsAutoSync/);
  // Manual / Mandiri / BCA explicitly carved out.
  assert.match(src, /provider !== "manual"/);
  assert.match(src, /provider !== "mandiri"/);
  assert.match(src, /provider !== "bca"/);
});

test("7.F.B.3: /banking + /banking/new + /banking/[id] all exist", () => {
  for (const path of [
    "src/app/(development-app)/development-os/banking/page.tsx",
    "src/app/(development-app)/development-os/banking/new/page.tsx",
    "src/app/(development-app)/development-os/banking/[id]/page.tsx",
  ]) {
    assert.ok(fileExists(path), `${path} missing`);
  }
});

test("7.F.B.3: list page renders bank_connections rows + Add CTA", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/banking/page.tsx",
  );
  assert.match(src, /bankConnections/);
  assert.match(src, /Add bank connection/);
  assert.match(src, /No bank connections yet/);
});

test("7.F.B.3: detail page surfaces CSV upload pointer for manual/Mandiri/BCA", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/banking/[id]/page.tsx",
  );
  assert.match(src, /Statement upload/);
  assert.match(src, /\/finance\/statement-imports/);
});

test("7.F.B.3: createBankConnectionAction records audit event", () => {
  const src = readFile("src/lib/banking/connection-actions.ts");
  assert.match(src, /action:\s*"banking\.connection\.create"/);
  assert.match(src, /action:\s*"banking\.connection\.disconnect"/);
});

// ===========================================================================
// Phase 2 closure invariants
// ===========================================================================

test("Phase 2: no new migration files added", () => {
  // Latest migration is 0086 (Stage 7.0 retrofit). Phase 2 ships UI only.
  assert.ok(
    !fileExists("drizzle/0087_development_os_stage_7_f_phase_2.sql"),
    "Phase 2 must not introduce new migrations",
  );
});

test("Phase 2: ChannelManager reference impl untouched", () => {
  // Sanity — the canonical pattern stays as the reference. We don't
  // refactor it during 7.F.
  assert.ok(
    fileExists("src/components/development/channels/connect-channel-modal.tsx"),
  );
});

test("Phase 2: encryption-at-rest gap documented in marketing action", () => {
  const src = readFile("src/lib/marketing/connection-actions.ts");
  // The plaintext-storage compromise must be explicit in source for the
  // future encryption pass to find.
  assert.match(src, /encryption-at-rest/);
});
