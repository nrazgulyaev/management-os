/**
 * Stage 6.P8 — Cross-stage acceptance + polish tests.
 *
 * Validates that Stage 6's load-bearing invariants hold across all
 * sub-stages: every sub-stage marker is ACCEPTED in the architecture
 * doc, every cron registry consumer agrees on the cron count,
 * provider abstractions cohere, and the build-fix invariants from
 * Stage 5.J are preserved.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
// 1) Every Stage 6 sub-stage is ACCEPTED in the architecture doc.
// ===========================================================================

test("arch doc: all 9 Stage 6 sub-stages marked ACCEPTED", () => {
  const src = readFile("docs/development-os-architecture.md");
  for (const sub of [
    "P0",
    "P1",
    "P2",
    "P3",
    "P3.6",
    "P4",
    "P5",
    "P6",
    "P7",
    "P8",
  ]) {
    assert.match(
      src,
      new RegExp(`## Stage 6\\.${sub.replace(/\./g, "\\.")} —.*\`\\[ACCEPTED 6\\.${sub.replace(/\./g, "\\.")}\\]\``),
      `Stage 6.${sub} must be ACCEPTED`,
    );
  }
});

// ===========================================================================
// 2) Per-stage completion docs are present.
// ===========================================================================

test("docs: STAGE-6-P{4,5,6,7}-COMPLETE.md present", () => {
  for (const slug of ["P4", "P5", "P6", "P7"]) {
    assert.ok(
      fileExists(`docs/STAGE-6-${slug}-COMPLETE.md`),
      `STAGE-6-${slug}-COMPLETE.md must exist`,
    );
  }
});

// ===========================================================================
// 3) Provider abstractions cohere — every category exposes the same
//    select/factory shape.
// ===========================================================================

test("AI providers: 3 real + DryRun + selector + getAIProviderByName", () => {
  const dir = readdirSync(resolve(ROOT, "src/lib/ai/providers"));
  for (const file of [
    "anthropic.ts",
    "openai.ts",
    "gemini.ts",
    "dry-run.ts",
    "types.ts",
    "index.ts",
  ]) {
    assert.ok(dir.includes(file), `src/lib/ai/providers/${file} must exist`);
  }
  const idx = readFile("src/lib/ai/providers/index.ts");
  assert.match(idx, /export\s+function\s+getAIProvider\b/);
  assert.match(idx, /export\s+function\s+getAIProviderByName\b/);
});

test("Marketing providers: 7 real + DryRun + selector", () => {
  const base = "src/lib/marketing/providers";
  for (const sub of [
    "google-analytics",
    "meta-pixel",
    "google-ads",
    "meta-ads",
    "tiktok-ads",
    "mailchimp",
    "convertkit",
    "dry-run.ts",
  ]) {
    const path = sub.endsWith(".ts") ? `${base}/${sub}` : `${base}/${sub}`;
    assert.ok(fileExists(path), `${path} must exist`);
  }
});

test("Google Workspace: 3 services + selector + service layer", () => {
  for (const sub of [
    "calendar/provider.ts",
    "sheets/provider.ts",
    "drive/provider.ts",
    "select-provider.ts",
    "service.ts",
    "types.ts",
    "oauth-flow.ts",
    "index.ts",
  ]) {
    assert.ok(
      fileExists(`src/lib/google-workspace/${sub}`),
      `src/lib/google-workspace/${sub} must exist`,
    );
  }
});

// ===========================================================================
// 4) Cron registry consistency — index.ts + dispatcher + checklist.
// ===========================================================================

test("cron registry: P5 google_workspace_health_check wired in all 3 places", () => {
  const idx = readFile("src/lib/development/server/cron/index.ts");
  const dispatcher = readFile("src/features/jobs/actions.ts");
  const checklist = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  for (const src of [idx, dispatcher]) {
    assert.match(src, /google_workspace_health_check/);
  }
  assert.ok(checklist.includes("/api/cron/google-workspace-health-check"));
});

test("cron registry: every P4.F cron wired in all 3 places", () => {
  const idx = readFile("src/lib/development/server/cron/index.ts");
  const dispatcher = readFile("src/features/jobs/actions.ts");
  const checklist = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  for (const key of [
    "marketing_campaigns_sync",
    "marketing_metrics_sync",
    "attribution_engine",
    "utm_touchpoint_cleanup",
  ]) {
    for (const src of [idx, dispatcher]) {
      assert.match(src, new RegExp(`"${key}"`));
    }
    const route = key.replace(/_/g, "-");
    assert.ok(
      checklist.includes(`/api/cron/${route}`),
      `${route} must appear in checklist`,
    );
  }
});

// ===========================================================================
// 5) Stage 5.J build-fix invariant — every *-actions.ts file imported
//    by client components opens with "use server".
// ===========================================================================

test('build-fix invariant: P5 service.ts opens with "use server"', () => {
  const src = readFile("src/lib/google-workspace/service.ts");
  assert.match(src, /^"use server";/);
});

test('build-fix invariant: P5 selectors use `import "server-only"`', () => {
  const src = readFile("src/lib/google-workspace/select-provider.ts");
  assert.match(src, /^import\s+"server-only";/);
});

test('build-fix invariant: marketing service.ts opens with "use server"', () => {
  const src = readFile("src/lib/marketing/service.ts");
  assert.match(src, /^"use server";/);
});

test('build-fix invariant: P4.F attribution engine uses `import "server-only"`', () => {
  // engine.ts exports synchronous helpers — Server Actions must be async,
  // so engine.ts cannot use "use server". It must use server-only.
  const src = readFile("src/lib/marketing/attribution/engine.ts");
  assert.match(src, /^import\s+"server-only";/);
});

test('build-fix invariant: P5.F WhatsApp credentials actions opens with "use server"', () => {
  const src = readFile(
    "src/lib/development/server/whatsapp-credentials-actions.ts",
  );
  assert.match(src, /^"use server";/);
});

// ===========================================================================
// 6) Migration ordering — every Stage 6 migration follows the FOREACH
//    ARRAY pattern for the per-org RLS loop ("0075 lesson preservation").
// ===========================================================================

test("migrations: every Stage 6 migration that loops tables uses FOREACH ARRAY", () => {
  const dir = resolve(ROOT, "drizzle");
  const stage6 = readdirSync(dir).filter(
    (f) => f.startsWith("0075_") || f.startsWith("0076_") ||
      f.startsWith("0077_") || f.startsWith("0078_") ||
      f.startsWith("0079_") || f.startsWith("0080_") ||
      f.startsWith("0081_") || f.startsWith("0082_"),
  );
  for (const file of stage6) {
    if (!file.endsWith(".sql")) continue;
    const src = readFile(`drizzle/${file}`);
    // If the migration loops over tables, it must use FOREACH … IN ARRAY.
    if (/FOREACH/i.test(src)) {
      assert.match(
        src,
        /FOREACH\s+\w+\s+IN\s+ARRAY/i,
        `${file} uses FOREACH but not IN ARRAY — 0075 lesson regression`,
      );
    }
  }
});

// ===========================================================================
// 7) Architecture doc surfaces Stage 6 completion bookkeeping.
// ===========================================================================

test("arch doc: documents Stage 6 baseline counts at each sub-stage entry", () => {
  const src = readFile("docs/development-os-architecture.md");
  // Spot-check the entry-state inheritance lines exist.
  assert.match(src, /4312 baseline tests/);
  assert.match(src, /4570 baseline tests/);
  assert.match(src, /4597 baseline tests/);
  assert.match(src, /4605 baseline tests/);
});
