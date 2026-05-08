/**
 * Stage 10.B (cleanup) — Quick-wins acceptance tests.
 *
 * Static / file-content tests verifying the audit findings shipped by
 * docs/stage-10-audit have been addressed:
 *   1. Zero stage labels (`X.Y` / `X.Y.Z`) leak to operator-visible UI.
 *   2. Zero developer instructions (`npm run db:seed`, `db:migrate`)
 *      surface in any operator-facing page or shared component.
 *   3. The "P2..P6" integration roadmap badges replaced with "Soon".
 *   4. Brand helper (`src/lib/brand.ts`) resolves Mgmt OS / Dev OS /
 *      umbrella from a request path; Logo accepts `subtitle` + `title`
 *      props; per-product layouts wire them.
 *
 * The repo's prior committed file `tests/development-stage-10-b.test.ts`
 * covers the design-system primitives (commit 9a52531). This file
 * covers the audit-driven cleanup phase. Both are kept distinct.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

/**
 * Walk a directory and yield every file path matching the predicate.
 * Skips node_modules + .next + .git automatically.
 */
function walk(rel: string, predicate: (path: string) => boolean): string[] {
  const out: string[] = [];
  function visit(absDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(absDir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === ".next" || e === ".git") continue;
      const full = join(absDir, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) visit(full);
      else if (predicate(full)) out.push(full);
    }
  }
  visit(resolve(ROOT, rel));
  return out;
}

const TSX = (p: string): boolean => p.endsWith(".tsx");
const TS_OR_TSX = (p: string): boolean => p.endsWith(".tsx") || p.endsWith(".ts");

/**
 * Match a stage label outside of:
 *   - JSDoc / block comments (`* ...`)
 *   - Single-line comments (`// ...`)
 *   - Inside string literals containing "Migration" or "Stage" identifiers
 *     in test fixture files
 *
 * Heuristic: drop comment lines first, then look for stage-label literals
 * surrounded by quotes or backticks (anything that would render to UI).
 */
function findStageLabelsInUiCopy(src: string): string[] {
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^[\t ]*\*.*$/gm, "") // JSDoc continuation lines
    .replace(/^[\t ]*\/\/.*$/gm, ""); // line comments
  const matches: string[] = [];
  // Look for stage labels embedded in JSX text or string props (quoted).
  const re = /(?<=["'`>][^"'`<>\n]{0,200})\b\d+\.[A-N](?:\.\d+)?\b(?=[^"'`<>\n]{0,200}["'`<])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments)) !== null) matches.push(m[0]!);
  return matches;
}

// ============================================================================
// 10.B.1 — Stage labels in dev-os navigation
// ============================================================================

test("10.B: navigation.ts has zero stage-label badges", () => {
  const src = read("src/lib/development/navigation.ts");
  // Permitted: "soon" badges remain (Roadmap section).
  const labelRe = /badge:\s*"\d+\.[A-Z](?:\.\d+)?"/g;
  const hits = src.match(labelRe) ?? [];
  assert.strictEqual(
    hits.length,
    0,
    `expected 0 stage-label badges in navigation.ts, found: ${hits.join(", ")}`,
  );
});

test("10.B: navigation.ts may keep 'soon' badges (genuine roadmap markers)", () => {
  const src = read("src/lib/development/navigation.ts");
  const soons = src.match(/badge:\s*"soon"/g) ?? [];
  assert.ok(
    soons.length >= 0 && soons.length <= 4,
    `unexpected number of soon badges: ${soons.length}`,
  );
});

// ============================================================================
// 10.B.1b — Stage refs in page eyebrows / descriptions / inline copy
// ============================================================================

test("10.B: zero stage-label leaks in dashboard + dev-os page sources", () => {
  const offenders: { file: string; labels: string[] }[] = [];
  for (const root of ["src/app/(dashboard)", "src/app/(development-app)"]) {
    for (const file of walk(root, TS_OR_TSX)) {
      const rel = file.slice(ROOT.length + 1);
      const src = readFileSync(file, "utf8");
      const labels = findStageLabelsInUiCopy(src);
      if (labels.length > 0) offenders.push({ file: rel, labels });
    }
  }
  assert.strictEqual(
    offenders.length,
    0,
    `stage-label leaks in operator-facing pages:\n${offenders
      .map((o) => `  - ${o.file}: ${o.labels.join(", ")}`)
      .join("\n")}`,
  );
});

// ============================================================================
// 10.B.2 — Integration roadmap stages
// ============================================================================

test("10.B: integrations page replaced 'P2..P6' placeholders with 'Soon'", () => {
  const src = read(
    "src/app/(development-app)/development-os/integrations/page.tsx",
  );
  // The PlaceholderCard `stage` prop should not carry "P2..P9".
  const phaseHits = src.match(/stage="P\d"/g) ?? [];
  assert.strictEqual(
    phaseHits.length,
    0,
    `unexpected P-stage placeholders: ${phaseHits.join(", ")}`,
  );
  // At least one Soon placeholder should remain.
  assert.match(src, /stage="Soon"/);
});

// ============================================================================
// 10.B.3 — Developer-instruction leakage
// ============================================================================

// Operator's audit specifically called out `db:seed` / `db:migrate`
// surfacing in the UI. Other CLI commands (`npm run check:storage`,
// `npm run preflight:deploy`) are legitimate when present in /system
// surfaces — operators will see them but they are explicit "this is a
// CI command" context, not surprise developer leakage.
const DEV_LEAK_RE =
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:db:migrate|db:seed[\w:-]*)\b/i;

test("10.B: zero `npm run db:seed*` / `db:migrate` strings in dashboard pages", () => {
  const offenders: string[] = [];
  for (const file of walk("src/app/(dashboard)", TSX)) {
    const src = readFileSync(file, "utf8");
    // Drop comments/JSDoc to avoid false positives.
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[\t ]*\*.*$/gm, "")
      .replace(/^[\t ]*\/\/.*$/gm, "");
    if (DEV_LEAK_RE.test(noComments)) {
      offenders.push(file.slice(ROOT.length + 1));
    }
  }
  assert.strictEqual(
    offenders.length,
    0,
    `dev-instruction leaks in dashboard:\n  ${offenders.join("\n  ")}`,
  );
});

test("10.B: zero `npm run db:seed*` / `db:migrate` strings in dev-os pages", () => {
  const offenders: string[] = [];
  for (const file of walk("src/app/(development-app)", TSX)) {
    const src = readFileSync(file, "utf8");
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[\t ]*\*.*$/gm, "")
      .replace(/^[\t ]*\/\/.*$/gm, "");
    if (DEV_LEAK_RE.test(noComments)) {
      offenders.push(file.slice(ROOT.length + 1));
    }
  }
  assert.strictEqual(
    offenders.length,
    0,
    `dev-instruction leaks in dev-os:\n  ${offenders.join("\n  ")}`,
  );
});

test("10.B: zero `npm run db:seed*` / `db:migrate` strings in shared components", () => {
  const offenders: string[] = [];
  for (const file of walk("src/components", TSX)) {
    const src = readFileSync(file, "utf8");
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[\t ]*\*.*$/gm, "")
      .replace(/^[\t ]*\/\/.*$/gm, "");
    if (DEV_LEAK_RE.test(noComments)) {
      offenders.push(file.slice(ROOT.length + 1));
    }
  }
  assert.strictEqual(
    offenders.length,
    0,
    `dev-instruction leaks in components:\n  ${offenders.join("\n  ")}`,
  );
});

test("10.B: setup/admin-bootstrap softened — no `npm run db:` instruction in operator copy", () => {
  const src = read("src/app/(auth)/setup/admin-bootstrap/page.tsx");
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[\t ]*\*.*$/gm, "")
    .replace(/^[\t ]*\/\/.*$/gm, "");
  assert.ok(
    !/npm\s+run\s+db:/i.test(noComments),
    "admin-bootstrap still surfaces npm run db:* to operators",
  );
});

// ============================================================================
// 10.B.4 — Brand helper + Logo wiring
// ============================================================================

test("10.B: brand helper exports productBrand + 3 product flavors", async () => {
  assert.ok(exists("src/lib/brand.ts"));
  const src = read("src/lib/brand.ts");
  for (const id of ['"management"', '"development"', '"umbrella"']) {
    assert.ok(src.includes(id), `brand.ts must declare ${id}`);
  }
  assert.match(src, /export function productBrand/);
  // Resolution sanity: the helper itself.
  const mod = (await import("../src/lib/brand")) as {
    productBrand: (p: string | null | undefined) => {
      id: string;
      title: string;
      subtitle: string;
    };
  };
  assert.strictEqual(
    mod.productBrand("/dashboard").id,
    "management",
  );
  assert.strictEqual(
    mod.productBrand("/dashboard/settings").id,
    "management",
  );
  assert.strictEqual(
    mod.productBrand("/development-os").id,
    "development",
  );
  assert.strictEqual(
    mod.productBrand("/development-os/cabinets/qs").id,
    "development",
  );
  assert.strictEqual(mod.productBrand("/").id, "umbrella");
  assert.strictEqual(mod.productBrand(null).id, "umbrella");
  assert.strictEqual(mod.productBrand("/owner").id, "umbrella");
  // Title + subtitle.
  assert.strictEqual(
    mod.productBrand("/dashboard").title,
    "Arconique Management OS",
  );
  assert.strictEqual(
    mod.productBrand("/development-os").title,
    "Arconique Development OS",
  );
  assert.strictEqual(
    mod.productBrand("/development-os").subtitle,
    "Development OS",
  );
});

test("10.B: Logo component accepts subtitle + title props", () => {
  const src = read("src/components/brand/logo.tsx");
  assert.match(src, /subtitle\?:\s*string/);
  assert.match(src, /title\?:\s*string/);
  // The hardcoded "Management OS" subtitle is now controlled by the prop.
  assert.match(src, /\{subtitle\}/);
  assert.match(src, /aria-label=\{title\}/);
});

test("10.B: dev-os sidebar passes Development OS subtitle to Logo", () => {
  const src = read("src/components/development/development-app-sidebar.tsx");
  assert.match(src, /subtitle="Development OS"/);
  assert.match(src, /title="Arconique Development OS"/);
});

test("10.B: dashboard sidebar passes Management OS subtitle to Logo", () => {
  const src = read("src/components/layout/dashboard-sidebar.tsx");
  assert.match(src, /subtitle="Management OS"/);
  assert.match(src, /title="Arconique Management OS"/);
});

test("10.B: dev-os layout exports per-product page metadata", () => {
  const src = read("src/app/(development-app)/layout.tsx");
  assert.match(src, /export const metadata/);
  assert.match(src, /Arconique Development OS/);
});

test("10.B: dashboard root layout retains Management OS metadata", () => {
  // The root app layout (/(dashboard) inherits this) is at src/app/layout.tsx.
  const src = read("src/app/layout.tsx");
  assert.match(src, /Arconique Management OS/);
});

// ============================================================================
// Phase 10.B closure
// ============================================================================

test("Phase 10.B: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-b-cleanup-decisions.md"));
});
