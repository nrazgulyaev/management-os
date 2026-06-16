/**
 * Hotfix HF-1 — Regression test.
 *
 * Prod /dashboard crashed with
 *   "Functions cannot be passed directly to Client Components"
 * because <AreaChartCard> (a `"use client"` primitive) accepted a
 * `formatValue: (v: number) => string` prop, and the server-
 * component dashboard passed an inline arrow. RSC payload can't
 * serialise functions across the boundary.
 *
 * The hotfix replaces every chart-tooltip function prop with a
 * serialisable `FormatSpec` string (+ optional `valuePrefix` /
 * `valueSuffix`). This test pins the contract:
 *
 *   1. The chart primitives' exported prop interfaces MUST NOT
 *      include `formatValue` anymore (it would still typecheck a
 *      `() => string` call site).
 *   2. The chart primitives MUST export a `formatSpec?: FormatSpec`
 *      prop instead.
 *   3. No server-component consumer (call sites under
 *      src/app/STAR-STAR/page.tsx without a "use client" directive)
 *      may pass a formatValue= attribute — covers AreaChartCard,
 *      HatchedBarChart, and the wider use-client primitive surface.
 *   4. The format-specs.ts resolver handles every spec branch
 *      cleanly with prefix / suffix wrappers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatValueFromSpec,
  type FormatSpec,
} from "../src/components/award/format-specs";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// ============================================================================
// 1 — Primitive prop interfaces no longer carry `formatValue`
// ============================================================================

// client-tax: these primitives were split for lazy-loading — the public
// named export lives in `<base>.tsx` (a `next/dynamic` wrapper), the
// recharts render in `<base>-impl.tsx`, and the prop interface (which
// carries `formatSpec` / `valuePrefix` / `valueSuffix`) in
// `<base>-shared.ts`. The contract is unchanged; we just read the whole
// module set so the assertions still find the relocated declarations.
const REFACTORED_PRIMITIVES = [
  "src/components/ui/primitives/area-chart-card",
  "src/components/award/hatched-bar-chart",
];

function readPrimitiveModuleSet(base: string): string {
  return [`${base}.tsx`, `${base}-impl.tsx`, `${base}-shared.ts`]
    .map((rel) => {
      try {
        return read(rel);
      } catch {
        return "";
      }
    })
    .join("\n");
}

for (const base of REFACTORED_PRIMITIVES) {
  test(`hf-1 — ${base} drops the legacy formatValue function prop`, () => {
    const src = readPrimitiveModuleSet(base);
    // The prop interface must no longer declare `formatValue?: (...) => string`.
    assert.doesNotMatch(
      src,
      /formatValue\?:\s*\(/,
      `${base} still declares formatValue as a function prop — this re-opens the RSC serialisation crash`,
    );
  });

  test(`hf-1 — ${base} exposes the serialisable formatSpec prop instead`, () => {
    const src = readPrimitiveModuleSet(base);
    assert.match(src, /formatSpec\?:\s*FormatSpec/);
    assert.match(src, /valuePrefix\?:\s*string/);
    assert.match(src, /valueSuffix\?:\s*string/);
  });
}

// ============================================================================
// 2 — No server-component page passes a `formatValue=` JSX attribute
// ============================================================================

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (extname(entry) === ".tsx") {
      out.push(full);
    }
  }
  return out;
}

test("hf-1 — no server-component page passes a function `formatValue=` to a use-client primitive", () => {
  const pages = walk(resolve(ROOT, "src/app"));
  const offenders: string[] = [];
  for (const f of pages) {
    const src = readFileSync(f, "utf8");
    // Only check server components — a file that opens with "use client" is allowed
    // to pass functions across local boundaries.
    if (/^"use client"/m.test(src.split("\n").slice(0, 5).join("\n"))) {
      continue;
    }
    if (/\bformatValue=\{/.test(src)) {
      offenders.push(f.replace(ROOT + "/", ""));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Server-component pages must not pass formatValue function props. Offenders:\n${offenders.join("\n")}`,
  );
});

// ============================================================================
// 3 — formatValueFromSpec handles every spec branch (no NaN / undefined leaks)
// ============================================================================

const SPECS: FormatSpec[] = [
  "number",
  "number-compact",
  "number-1dp",
  "number-2dp",
  "currency-usd",
  "currency-usd-compact",
  "currency-usdt-2dp",
  "currency-usdt-6dp",
  "percent",
  "percent-1dp",
  "duration-hms",
];

for (const spec of SPECS) {
  test(`hf-1 — formatValueFromSpec returns a non-empty string for "${spec}"`, () => {
    const out = formatValueFromSpec(1234.5678, spec);
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0, `spec "${spec}" returned empty string`);
    assert.doesNotMatch(
      out,
      /\bundefined\b|\bNaN\b/,
      `spec "${spec}" leaked undefined / NaN: "${out}"`,
    );
  });
}

test("hf-1 — formatValueFromSpec applies prefix + suffix wrappers", () => {
  const out = formatValueFromSpec(1.36, "number-2dp", {
    prefix: "Rp ",
    suffix: "B",
  });
  assert.equal(out, "Rp 1.36B");
});

test("hf-1 — formatValueFromSpec percent specs respect decimal precision", () => {
  assert.equal(formatValueFromSpec(82.5, "percent"), "83%");
  assert.equal(formatValueFromSpec(82.5, "percent-1dp"), "82.5%");
});

test("hf-1 — formatValueFromSpec duration-hms covers s / m+s / h+m+s branches", () => {
  assert.equal(formatValueFromSpec(5, "duration-hms"), "5s");
  assert.equal(formatValueFromSpec(125, "duration-hms"), "2m 5s");
  assert.equal(formatValueFromSpec(3725, "duration-hms"), "1h 2m 5s");
});
