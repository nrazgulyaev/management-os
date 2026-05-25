/**
 * Stage 10.6 / Phase 10.6.C.1.0 — Token foundation acceptance.
 *
 * Verifies that globals.css ships:
 *   - new radii (--r-2xl, --r-3xl, --r-4xl)
 *   - new shadows (--shadow-soft-card, --shadow-elevated-card)
 *   - new gradients (emerald / gold / coral / ink-deep)
 *   - dark-mode overrides for shadows + gradients
 *   - Tailwind utility classes (.bg-gradient-*, .shadow-*-card)
 *   - @theme mappings for new radii (--radius-2xl/3xl/4xl)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// Phase 2.0: globals.css is now a thin entry that @imports the real
// modules from src/styles/*.css. Read the entry plus every imported
// module so the assertions below keep working without caring about
// which module a given token landed in.
const GLOBALS = (() => {
  const entry = readFileSync(resolve(ROOT, "src/app/globals.css"), "utf8");
  const imports = Array.from(
    entry.matchAll(/@import\s+"((?:\.\.\/)+styles\/[^"]+)"/g),
    (m) => m[1],
  );
  const modules = imports.map((rel) =>
    readFileSync(resolve(ROOT, "src/app", rel), "utf8"),
  );
  return [entry, ...modules].join("\n");
})();

// ============================================================================
// Light-mode tokens
// ============================================================================

test("10.6.C.1.0 — globals.css adds --r-2xl / --r-3xl / --r-4xl radii", () => {
  assert.match(GLOBALS, /--r-2xl:\s*20px/);
  assert.match(GLOBALS, /--r-3xl:\s*24px/);
  assert.match(GLOBALS, /--r-4xl:\s*32px/);
});

test("10.6.C.1.0 — globals.css adds soft + elevated card shadows (light)", () => {
  assert.match(GLOBALS, /--shadow-soft-card:\s*0 2px 12px/);
  assert.match(GLOBALS, /--shadow-elevated-card:\s*0 8px 32px/);
});

test("10.6.C.1.0 — globals.css adds 4 hero card gradients (light)", () => {
  assert.match(GLOBALS, /--gradient-emerald-soft:\s*linear-gradient/);
  assert.match(GLOBALS, /--gradient-gold-soft:\s*linear-gradient/);
  assert.match(GLOBALS, /--gradient-coral-soft:\s*linear-gradient/);
  assert.match(GLOBALS, /--gradient-ink-deep:\s*linear-gradient/);
});

// ============================================================================
// Dark-mode parity
// ============================================================================

test("10.6.C.1.0 — .dark block overrides soft + elevated card shadows", () => {
  // Ensure the .dark block exists and has its own shadow definitions.
  const darkBlock = GLOBALS.match(/\.dark\s*\{[\s\S]*?\n\}/);
  assert.ok(darkBlock, "could not locate .dark CSS block");
  assert.match(darkBlock[0], /--shadow-soft-card:/);
  assert.match(darkBlock[0], /--shadow-elevated-card:/);
});

test("10.6.C.1.0 — .dark block overrides all 4 hero gradients", () => {
  const darkBlock = GLOBALS.match(/\.dark\s*\{[\s\S]*?\n\}/);
  assert.ok(darkBlock);
  for (const grad of [
    "gradient-emerald-soft",
    "gradient-gold-soft",
    "gradient-coral-soft",
    "gradient-ink-deep",
  ]) {
    assert.match(darkBlock[0], new RegExp(`--${grad}:`));
  }
});

// ============================================================================
// @theme mappings + utility classes
// ============================================================================

test("10.6.C.1.0 — @theme exposes new radii to Tailwind", () => {
  assert.match(GLOBALS, /--radius-2xl:\s*var\(--r-2xl\)/);
  assert.match(GLOBALS, /--radius-3xl:\s*var\(--r-3xl\)/);
  assert.match(GLOBALS, /--radius-4xl:\s*var\(--r-4xl\)/);
});

test("10.6.C.1.0 — utility classes for hero gradients ship", () => {
  for (const cls of [
    "bg-gradient-emerald-soft",
    "bg-gradient-gold-soft",
    "bg-gradient-coral-soft",
    "bg-gradient-ink-deep",
  ]) {
    assert.match(GLOBALS, new RegExp(`\\.${cls}\\s*\\{`));
  }
});

test("10.6.C.1.0 — utility classes for hero shadows ship", () => {
  assert.match(GLOBALS, /\.shadow-soft-card\s*\{/);
  assert.match(GLOBALS, /\.shadow-elevated-card\s*\{/);
});
