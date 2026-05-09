/**
 * Stage 10.H Part 5 — Polish + production verification regression locks.
 *
 * Locks the contracts the Part 5 audit walked:
 *   - Both layout files exist with the right enforceProductAccess slug
 *   - Both sidebars render <Logo> with the correct (subtitle, title, href)
 *     triple — pages NEVER render <Logo> directly
 *   - No page imports the OTHER product's shell
 *   - The architecture doc shipped
 *
 * Skips line-level page audits (40 pages were walked manually in Part 5);
 * future drift would be caught by the file-level brand contract.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
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
function walkPages(rootRel: string): string[] {
  const out: string[] = [];
  const start = resolve(ROOT, rootRel);
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = resolve(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile() && name === "page.tsx") {
        out.push(relative(ROOT, full));
      }
    }
  }
  walk(start);
  return out;
}

const ARCH_DOC = "docs/stage-10-h-product-split.md";
const MGMT_LAYOUT = "src/app/(dashboard)/layout.tsx";
const DEV_LAYOUT = "src/app/(development-app)/layout.tsx";
const MGMT_SIDEBAR = "src/components/layout/dashboard-sidebar.tsx";
const DEV_SIDEBAR = "src/components/development/development-app-sidebar.tsx";

// ============================================================================
// 5.1 — Brand consistency contract: only sidebars render <Logo>; pages don't
// ============================================================================

test("10.H Part 5 — Mgmt OS sidebar carries the full brand triple", () => {
  const src = read(MGMT_SIDEBAR);
  assert.match(src, /subtitle="Management OS"/);
  assert.match(src, /title="Arconique Management OS"/);
  assert.match(src, /href="\/dashboard"/);
});

test("10.H Part 5 — Dev OS sidebar carries the full brand triple", () => {
  const src = read(DEV_SIDEBAR);
  assert.match(src, /subtitle="Development OS"/);
  assert.match(src, /title="Arconique Development OS"/);
  assert.match(src, /href="\/development-os"/);
});

test("10.H Part 5 — pages never directly render <Logo> (only shells do)", () => {
  const offenders: string[] = [];
  for (const root of ["src/app/(dashboard)", "src/app/(development-app)"]) {
    for (const page of walkPages(root)) {
      const src = read(page);
      if (
        /from\s+["']@\/components\/brand\/logo["']/.test(src) ||
        /<Logo\b/.test(src)
      ) {
        offenders.push(page);
      }
    }
  }
  assert.equal(
    offenders.length,
    0,
    `pages must NOT render <Logo>; only shells do. Offenders:\n  ${offenders.join("\n  ")}`,
  );
});

// ============================================================================
// 5.2 — Shell ownership: no cross-product shell imports
// ============================================================================

test("10.H Part 5 — no Mgmt OS page imports DevelopmentAppShell", () => {
  const offenders: string[] = [];
  for (const page of walkPages("src/app/(dashboard)")) {
    const src = read(page);
    if (
      /from\s+["']@\/components\/development\/development-app-shell["']/.test(
        src,
      ) ||
      /\bDevelopmentAppShell\b/.test(src)
    ) {
      offenders.push(page);
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Mgmt OS pages must not import DevelopmentAppShell:\n  ${offenders.join("\n  ")}`,
  );
});

test("10.H Part 5 — no Dev OS page imports DashboardShell", () => {
  const offenders: string[] = [];
  for (const page of walkPages("src/app/(development-app)")) {
    const src = read(page);
    if (
      /from\s+["']@\/components\/layout\/dashboard-shell["']/.test(src) ||
      /\bDashboardShell\b/.test(src)
    ) {
      offenders.push(page);
    }
  }
  assert.equal(
    offenders.length,
    0,
    `Dev OS pages must not import DashboardShell:\n  ${offenders.join("\n  ")}`,
  );
});

// ============================================================================
// 5.3 — Both layouts call enforceProductAccess with the matching slug
// ============================================================================

test("10.H Part 5 — Mgmt OS layout exists + guards 'mgmt'", () => {
  assert.ok(exists(MGMT_LAYOUT));
  const src = read(MGMT_LAYOUT);
  assert.match(src, /enforceProductAccess\("mgmt"\)/);
});

test("10.H Part 5 — Dev OS layout exists + guards 'dev'", () => {
  assert.ok(exists(DEV_LAYOUT));
  const src = read(DEV_LAYOUT);
  assert.match(src, /enforceProductAccess\("dev"\)/);
});

// ============================================================================
// 5.4 — Architecture doc shipped + key sections present
// ============================================================================

test("10.H Part 5 — architecture doc shipped with the operational runbook", () => {
  assert.ok(exists(ARCH_DOC), `Missing ${ARCH_DOC}`);
  const doc = read(ARCH_DOC);
  // Key sections operators / engineers will look for.
  for (const heading of [
    "## Concept",
    "## Schema",
    "## Runtime enum",
    "## Auth surface",
    "## Sign-in flow",
    "## Cross-product switcher",
    "## Brand split",
    "## /no-product-access landing",
    "## Adding a third product",
    "## Operational runbook",
    "## Out of scope",
  ]) {
    assert.ok(
      doc.includes(heading),
      `architecture doc missing section: ${heading}`,
    );
  }
});
