#!/usr/bin/env tsx
/**
 * RELIABILITY-1 Task 5 — env-var inventory audit.
 *
 * Scans every src/ file for `process.env.X` references, compares
 * the set against the existing env registry (Prompt 113), and
 * surfaces:
 *
 *   1. Env vars used in source code but missing from the registry.
 *      These are blind spots: `check:env` won't tell you when they're
 *      misconfigured, and a missing one causes silent feature
 *      degradation (not a fatal startup error).
 *
 *   2. Registry entries that no source code references. Usually dead
 *      entries from retired features.
 *
 *   3. Total counts so the operator can see the gap closing as the
 *      registry is backfilled.
 *
 * Exit code: 0 always (informational audit, not a CI gate). Use
 * `--strict` to fail when source uses a var that isn't registered.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");
const REGISTRY_PATH = join(ROOT, "src/lib/env/registry.ts");

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (
      entry.endsWith(".ts") ||
      entry.endsWith(".tsx") ||
      entry.endsWith(".mts")
    ) {
      out.push(full);
    }
  }
}

function collectEnvRefs(files: string[]): Set<string> {
  const refs = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const matches = src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
    for (const m of matches) refs.add(m[1]);
  }
  return refs;
}

function collectRegistryKeys(): Set<string> {
  const src = readFileSync(REGISTRY_PATH, "utf8");
  const keys = new Set<string>();
  for (const m of src.matchAll(/"([A-Z_][A-Z0-9_]*)"/g)) {
    if (m[1].length > 2 && m[1] !== "NEXT_PUBLIC_") keys.add(m[1]);
  }
  return keys;
}

function main(): void {
  const files: string[] = [];
  walk(SRC, files);
  const sourceRefs = collectEnvRefs(files);
  const registry = collectRegistryKeys();

  const missingFromRegistry = [...sourceRefs]
    .filter((k) => !registry.has(k))
    .sort();
  const unusedInSource = [...registry]
    .filter((k) => !sourceRefs.has(k))
    .sort();

  console.log(`env audit — ${files.length} TS/TSX files scanned`);
  console.log(`  source refs : ${sourceRefs.size}`);
  console.log(`  registry    : ${registry.size}`);
  console.log(
    `  gap (in source, missing from registry): ${missingFromRegistry.length}`,
  );
  console.log(
    `  unused (in registry, no source ref)  : ${unusedInSource.length}`,
  );

  if (missingFromRegistry.length > 0) {
    console.log(
      `\n✗ ${missingFromRegistry.length} env var(s) used in source but NOT in the registry — check:env can't catch misconfiguration:`,
    );
    for (const k of missingFromRegistry) console.log(`  ${k}`);
  } else {
    console.log("\n✓ every env var used in source is in the registry");
  }

  if (unusedInSource.length > 0) {
    console.log(
      `\n? ${unusedInSource.length} registry entries with no source reference (probably retired features):`,
    );
    for (const k of unusedInSource) console.log(`  ${k}`);
  }

  // Strict mode fails CI on registry gaps.
  if (process.argv.includes("--strict") && missingFromRegistry.length > 0) {
    process.exit(1);
  }
}

main();
