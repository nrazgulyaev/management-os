#!/usr/bin/env tsx
/**
 * RELIABILITY-1 Task 2 — Next.js runtime config audit.
 *
 * Reads next.config.mjs and validates that production-critical
 * settings are at or above safe defaults. Catches regressions like
 * "someone reverted the HF-8 serverActions.bodySizeLimit bump back
 * to the 1 MB default" before they reach production.
 *
 * Settings checked:
 *
 *   experimental.serverActions.bodySizeLimit
 *     Required: ≥ 5mb (Receipt OCR uploads phone JPEGs, 2–5 MB
 *     typical). Default Next 15 limit is 1 MB which silently 413s.
 *     Set by HF-8.
 *
 *   reactStrictMode
 *     Required: true. Catches double-render bugs in dev.
 *
 *   outputFileTracingRoot
 *     Required: set. Prevents Next from walking up to parent
 *     lockfiles in monorepo / Vercel scenarios.
 *
 * Exit code: 1 if any check fails, 0 otherwise.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "next.config.mjs");

interface Check {
  name: string;
  pattern: RegExp;
  expectedDescription: string;
  validate: (match: RegExpMatchArray | null, src: string) => "ok" | string;
}

const SIZE_UNIT_BYTES: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

function parseSizeLimit(value: string): number | null {
  const m = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*([kmg]?b)$/);
  if (!m) return null;
  const num = Number.parseFloat(m[1]);
  const unit = SIZE_UNIT_BYTES[m[2]] ?? 1;
  return num * unit;
}

const CHECKS: Check[] = [
  {
    name: "experimental.serverActions.bodySizeLimit",
    pattern: /bodySizeLimit:\s*["']([^"']+)["']/,
    expectedDescription: "≥ 5mb (phone JPEGs are 2–5 MB)",
    validate: (m) => {
      if (!m) {
        return "not set (defaults to 1 MB — receipt uploads will 413)";
      }
      const bytes = parseSizeLimit(m[1]);
      if (bytes === null) return `unparseable value: ${m[1]}`;
      const FIVE_MB = 5 * 1024 * 1024;
      if (bytes < FIVE_MB) {
        return `set to ${m[1]} — below the 5 MB safe minimum`;
      }
      return "ok";
    },
  },
  {
    name: "reactStrictMode",
    pattern: /reactStrictMode:\s*(true|false)/,
    expectedDescription: "true",
    validate: (m) => {
      if (!m) return "not set (defaults to false)";
      return m[1] === "true" ? "ok" : "set to false";
    },
  },
  {
    name: "outputFileTracingRoot",
    pattern: /outputFileTracingRoot:\s*\w+/,
    expectedDescription: "set (pins tracing to package root)",
    validate: (m) => (m ? "ok" : "not set"),
  },
];

function main(): void {
  const src = readFileSync(CONFIG_PATH, "utf8");
  console.log(`runtime-config audit — ${CONFIG_PATH}\n`);

  let fail = 0;
  for (const check of CHECKS) {
    const match = src.match(check.pattern);
    const result = check.validate(match, src);
    if (result === "ok") {
      console.log(`✓ ${check.name}`);
    } else {
      console.log(
        `✗ ${check.name} — expected ${check.expectedDescription}; ${result}`,
      );
      fail++;
    }
  }

  if (fail > 0) {
    console.log(`\n${fail} runtime-config check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nall ${CHECKS.length} checks passed.`);
}

main();
