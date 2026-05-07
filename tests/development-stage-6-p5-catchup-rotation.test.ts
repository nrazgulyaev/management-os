/**
 * Stage 6.P5-CATCHUP — API key + webhook signing-secret rotation tests.
 *
 * The rotation happens behind a "use server" boundary that touches the
 * database. The tests below validate the source-level invariants that
 * matter most: action presence + atomicity guards + return-shape
 * contracts. Live DB-touching tests live behind the pgtap harness.
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
// 1) API key rotation
// ===========================================================================

test("rotateApiKey action exported + uses transaction", () => {
  const src = readFile("src/lib/development/server/api/api-key-actions.ts");
  assert.match(src, /export\s+async\s+function\s+rotateApiKey\b/);
  // Atomic: the rotation MUST happen inside db.transaction so a partial
  // failure can't leave a revoked key without a fresh replacement.
  assert.match(src, /db\.transaction\(/);
});

test("rotateApiKey refuses to rotate a revoked key", () => {
  const src = readFile("src/lib/development/server/api/api-key-actions.ts");
  assert.match(src, /Cannot rotate a revoked key/);
});

test("rotateApiKey carries forward shape (label + scopes + rate limits + type)", () => {
  const src = readFile("src/lib/development/server/api/api-key-actions.ts");
  // The transaction body re-uses the existing row's shape on insert.
  for (const field of [
    "keyLabel: existing.keyLabel",
    "keyType: existing.keyType",
    "scopes: existing.scopes",
    "rateLimitPerMinute: existing.rateLimitPerMinute",
    "rateLimitPerHour: existing.rateLimitPerHour",
    "rateLimitPerDay: existing.rateLimitPerDay",
  ]) {
    assert.match(src, new RegExp(field.replace(/[.]/g, "\\.")));
  }
});

test("rotateApiKey records [rotation] marker on revocation reason", () => {
  const src = readFile("src/lib/development/server/api/api-key-actions.ts");
  assert.match(src, /\[rotation\]/);
});

test("rotateApiKey returns rotatedFrom + plaintext key once", () => {
  const src = readFile("src/lib/development/server/api/api-key-actions.ts");
  // Return shape must include rotatedFrom for caller audit.
  assert.match(src, /rotatedFrom:\s*parsed\.data\.keyId/);
  // Plaintext is returned exactly once (immediately after generation).
  assert.match(src, /fullKey:\s*parts\.fullKey/);
});

test('api-key-actions.ts opens with "use server"', () => {
  const src = readFile("src/lib/development/server/api/api-key-actions.ts");
  assert.match(src, /^"use server";/);
});

// ===========================================================================
// 2) Webhook signing-secret rotation (already shipped in P3.J — verifying it
//    still ships the rotation surface for the catch-up acceptance gate)
// ===========================================================================

test("rotateSigningSecret action exported + returns new secret", () => {
  const src = readFile(
    "src/lib/development/server/webhooks/webhook-actions.ts",
  );
  assert.match(src, /export\s+async\s+function\s+rotateSigningSecret\b/);
  assert.match(src, /signingSecret:\s*next/);
});

test('webhook-actions.ts opens with "use server"', () => {
  const src = readFile(
    "src/lib/development/server/webhooks/webhook-actions.ts",
  );
  assert.match(src, /^"use server";/);
});
