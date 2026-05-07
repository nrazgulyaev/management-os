/**
 * Build-time prerender coverage test.
 *
 * Background: 2026-05-07 Vercel build crashed prerendering
 * /dashboard/shares because `listOwnershipShares()` ran during static
 * generation and Drizzle's `PgDateString.mapFromDriverValue` crashed
 * with `Cannot read properties of undefined (reading 'toISOString')`.
 * Root cause: the page lacked `export const dynamic = "force-dynamic"`,
 * so Next.js attempted to prerender it. Org-scoped pages must be
 * dynamic.
 *
 * This test guards against regression: every async page in
 * (dashboard), (development-app), or (investor-portal) trees that
 * imports server-side helpers MUST declare `export const dynamic =
 * "force-dynamic"`.
 *
 * See `tmp/force-dynamic-sweep.md` and `tmp/shares-date-fix.md`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const ALWAYS_DYNAMIC_TREES = [
  "src/app/(dashboard)",
  "src/app/(development-app)",
  "src/app/(investor-portal)",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

const SERVER_HELPER_RE =
  /from ["']@\/(lib\/db|features|lib\/development\/server|lib\/billing|lib\/marketing|lib\/banking|lib\/payment-processors|lib\/channel-manager|lib\/ai|lib\/whatsapp|lib\/google-workspace|lib\/notifications)/;
const SERVER_HELPER_FN_RE =
  /(requireDb|getDb|requirePermission|requireInternalUser|getCurrentAppUser)\b/;
const ASYNC_DEFAULT_RE = /export\s+default\s+async\s+function/;
const FORCE_DYNAMIC_RE =
  /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/;

test("force-dynamic coverage: /dashboard/shares declares force-dynamic", () => {
  const src = readFileSync(
    resolve(ROOT, "src/app/(dashboard)/dashboard/shares/page.tsx"),
    "utf8",
  );
  assert.match(
    src,
    FORCE_DYNAMIC_RE,
    "/dashboard/shares must be dynamic — original crash site",
  );
});

test("force-dynamic coverage: every async DB-querying page in dashboard/dev-os/investor trees declares force-dynamic", () => {
  const offenders: string[] = [];

  for (const tree of ALWAYS_DYNAMIC_TREES) {
    const treeRoot = resolve(ROOT, tree);
    let files: string[];
    try {
      files = walk(treeRoot);
    } catch {
      continue;
    }
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const isAsync = ASYNC_DEFAULT_RE.test(src);
      const importsServerHelpers =
        SERVER_HELPER_RE.test(src) || SERVER_HELPER_FN_RE.test(src);
      if (!isAsync || !importsServerHelpers) continue;
      if (FORCE_DYNAMIC_RE.test(src)) continue;
      offenders.push(file.replace(ROOT + "/", ""));
    }
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `${offenders.length} pages query server-side helpers but lack force-dynamic. See tmp/force-dynamic-sweep.md.\n` +
      offenders.map((o) => `  - ${o}`).join("\n"),
  );
});

test("force-dynamic coverage: PgDateString.mapFromDriverValue undefined-crash invariant documented", () => {
  // Sanity check that the upstream Drizzle bug is still present in the
  // pinned version, so the rationale in tmp/shares-date-fix.md remains
  // valid. If Drizzle ships a fix, this test alerts us so the doc can
  // be updated.
  const drizzleDate = readFileSync(
    resolve(ROOT, "node_modules/drizzle-orm/pg-core/columns/date.js"),
    "utf8",
  );
  // The vulnerable mapping returns `value.toISOString().slice(0, -14)`
  // without a null/undefined guard.
  assert.match(
    drizzleDate,
    /value\.toISOString\(\)\.slice\(0, -14\)/,
    "PgDateString crash signature changed — review tmp/shares-date-fix.md",
  );
});
