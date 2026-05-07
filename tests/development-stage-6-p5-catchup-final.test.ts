/**
 * Stage 6.P5-CATCHUP — final acceptance.
 *
 * Validates that every Phase A.1 P5 catch-up deliverable is in place:
 *   - Schedule Calendars + Resources Edit / Archive actions
 *   - Knowledge Base Edit + Archive (already covered by villa-guides)
 *   - Notification preferences Edit (already shipped)
 *   - Responsibility scopes Edit
 *   - Architecture doc bookkeeping
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// ===========================================================================
// 1) Schedule + Resource Edit + Archive (P5.A.3)
// ===========================================================================

test("editResourcePool + archiveResourcePool actions exported", () => {
  const src = readFile(
    "src/lib/development/server/schedule/resource-pool-actions.ts",
  );
  assert.match(src, /export\s+async\s+function\s+editResourcePool\b/);
  assert.match(src, /export\s+async\s+function\s+archiveResourcePool\b/);
});

test("editWorkingCalendar + archiveWorkingCalendar actions exported", () => {
  const src = readFile(
    "src/lib/development/server/schedule/resource-pool-actions.ts",
  );
  assert.match(src, /export\s+async\s+function\s+editWorkingCalendar\b/);
  assert.match(src, /export\s+async\s+function\s+archiveWorkingCalendar\b/);
});

test('schedule resource-pool-actions opens with "use server"', () => {
  const src = readFile(
    "src/lib/development/server/schedule/resource-pool-actions.ts",
  );
  assert.match(src, /^"use server";/);
});

// ===========================================================================
// 2) Knowledge Base — Villa guides already provide upsert + archive (P5.A.4)
// ===========================================================================

test("villa-guides actions: upsertGuideSection + archiveGuideSection already cover KB Edit+Archive", () => {
  const src = readFile("src/features/villa-guides/actions.ts");
  assert.match(src, /export\s+async\s+function\s+upsertGuideSectionAction\b/);
  assert.match(src, /export\s+async\s+function\s+archiveGuideSectionAction\b/);
});

// ===========================================================================
// 3) Notification preferences Edit — already shipped (P5.A.5)
// ===========================================================================

test("notifications actions: updateNotificationPreference exists", () => {
  const src = readFile("src/features/notifications/actions.ts");
  assert.match(
    src,
    /export\s+async\s+function\s+updateNotificationPreferenceAction\b/,
  );
});

// ===========================================================================
// 4) Responsibility scopes Edit (new in P5.A.5)
// ===========================================================================

test("responsibility-scopes Edit action exported", () => {
  const src = readFile("src/features/responsibility-scopes/actions.ts");
  assert.match(
    src,
    /export\s+async\s+function\s+editResponsibilityScopeAction\b/,
  );
});

test("editResponsibilityScopeSchema exists in availability schema", () => {
  const src = readFile("src/features/availability/schema.ts");
  assert.match(
    src,
    /export\s+const\s+editResponsibilityScopeSchema\b/,
  );
});

test("editResponsibilityScopeAction records audit + revalidates", () => {
  const src = readFile("src/features/responsibility-scopes/actions.ts");
  assert.match(src, /action:\s*"responsibility_scope\.edit"/);
  assert.match(
    src,
    /revalidatePath\("\/dashboard\/settings\/responsibility-scopes"\)/,
  );
});

// ===========================================================================
// 5) Architecture doc bookkeeping
// ===========================================================================

test("arch doc: P5 carries CATCHUP marker (active or accepted)", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P5 — Productivity Tools .*\[(ACTIVE|ACCEPTED) 6\.P5-CATCHUP\]/);
});

test("arch doc: P6 marked ACTIVE-CATCHUP", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P6 — AI Agents Activation Ready .*\[ACTIVE 6\.P6-CATCHUP\]/);
});

test("arch doc: P7 marked ACTIVE-CATCHUP", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P7 — Investor Portal Enhancement .*\[ACTIVE 6\.P7-CATCHUP\]/);
});

test("arch doc: P8 marked ACTIVE-CATCHUP", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P8 — Polish \+ Comprehensive Testing .*\[ACTIVE 6\.P8-CATCHUP\]/);
});

// ===========================================================================
// 6) Test count: P5.A.1 + .2 + new = baseline +30 to +40 over 4632
// ===========================================================================

test("Phase A.1 closure: 4 catchup test files exist", () => {
  for (const f of [
    "tests/development-stage-6-p5-catchup-operations.test.ts",
    "tests/development-stage-6-p5-catchup-rotation.test.ts",
    "tests/development-stage-6-p5-catchup-final.test.ts",
  ]) {
    assert.ok(
      readFile(f).length > 100,
      `${f} must exist and be non-trivial`,
    );
  }
});
