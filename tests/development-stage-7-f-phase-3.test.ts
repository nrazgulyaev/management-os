/**
 * Stage 7.F.C — Phase 3 (Medium-leverage UIs) acceptance tests.
 *
 * Sub-items:
 *   C.1 Payment provider config UI
 *   C.2 WhatsApp credential UI
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
// 7.F.C.1 — Payment provider config UI
// ===========================================================================

test("7.F.C.1: payment connection-actions module + 3 actions", () => {
  const path = "src/lib/payment-processors/connection-actions.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  for (const fn of [
    "createPaymentConnectionAction",
    "testPaymentConnectionAction",
    "disconnectPaymentConnectionAction",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

test("7.F.C.1: payment schemas cover 4 providers", () => {
  const src = readFile(
    "src/lib/payment-processors/connection-actions.ts",
  );
  for (const provider of ["stripe", "wise_payments", "paypal", "manual"]) {
    assert.match(src, new RegExp(`z\\.literal\\("${provider}"\\)`));
  }
});

test("7.F.C.1: Stripe schema validates sk_/pk_/whsec_ prefixes", () => {
  const src = readFile(
    "src/lib/payment-processors/connection-actions.ts",
  );
  // Regex literal text in source — both prefix patterns present.
  assert.match(src, /sk_\(test\|live\)_/);
  assert.match(src, /pk_\(test\|live\)_/);
  assert.match(src, /\^whsec_/);
});

test("7.F.C.1: form component covers all 4 providers", () => {
  const path = "src/components/payments/connect-payment-form.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  for (const provider of ['"stripe"', '"wise_payments"', '"paypal"', '"manual"']) {
    assert.match(src, new RegExp(provider.replace(/[.]/g, "\\.")));
  }
});

test("7.F.C.1: detail-page action component wires test + disconnect", () => {
  const path = "src/components/payments/connection-actions-buttons.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /testPaymentConnectionAction/);
  assert.match(src, /disconnectPaymentConnectionAction/);
});

test("7.F.C.1: list page surfaces both legacy + new connection sections", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/payments/providers/page.tsx",
  );
  assert.match(src, /paymentProcessorConnections/);
  assert.match(src, /payment_processor_connections/);
  assert.match(src, /Add connection/);
  assert.match(src, /Legacy direct-booking catalog/);
});

test("7.F.C.1: /new + /[id] pages exist", () => {
  for (const path of [
    "src/app/(dashboard)/dashboard/payments/providers/new/page.tsx",
    "src/app/(dashboard)/dashboard/payments/providers/[id]/page.tsx",
  ]) {
    assert.ok(fileExists(path), `${path} missing`);
  }
});

test("7.F.C.1: detail page surfaces webhook URL for copy/paste", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/payments/providers/[id]/page.tsx",
  );
  assert.match(src, /Webhook endpoint/);
  assert.match(src, /\/api\/webhooks\/payments/);
});

test("7.F.C.1: createPaymentConnectionAction records audit + uniqueness", () => {
  const src = readFile(
    "src/lib/payment-processors/connection-actions.ts",
  );
  assert.match(src, /action:\s*"payments\.connection\.create"/);
  assert.match(src, /already exists/);
});

// ===========================================================================
// 7.F.C.2 — WhatsApp credential UI
// ===========================================================================

test("7.F.C.2: whatsapp credential-form action module exists", () => {
  const path =
    "src/lib/development/server/whatsapp-credential-form-actions.ts";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /^"use server";/);
  assert.match(
    src,
    /export\s+async\s+function\s+saveWhatsappCredentialsAction\b/,
  );
  assert.match(
    src,
    /export\s+async\s+function\s+sendWhatsappTestMessageAction\b/,
  );
});

test("7.F.C.2: schema validates Twilio Account SID + auth token + from number", () => {
  const src = readFile(
    "src/lib/development/server/whatsapp-credential-form-actions.ts",
  );
  // SID format: AC + 32 hex.
  assert.match(src, /\^AC\[a-f0-9\]\{32\}/);
  // From number: whatsapp:+digits.
  assert.match(src, /\^whatsapp:\\\+\\d/);
});

test("7.F.C.2: credentials persist encrypted via STAY_LINK_KMS_SECRET envelope", () => {
  const src = readFile(
    "src/lib/development/server/whatsapp-credential-form-actions.ts",
  );
  assert.match(src, /encryptCredentials/);
  assert.match(src, /stayLinkKmsSecret/);
  assert.match(src, /provider:\s*"twilio_whatsapp"/);
});

test("7.F.C.2: action records audit event + permission-gated", () => {
  const src = readFile(
    "src/lib/development/server/whatsapp-credential-form-actions.ts",
  );
  assert.match(src, /requirePermission\("whatsapp\.admin"\)/);
  assert.match(src, /action:\s*"whatsapp\.credentials\.save"/);
});

test("7.F.C.2: test-message action delegates to env-based provider", () => {
  const src = readFile(
    "src/lib/development/server/whatsapp-credential-form-actions.ts",
  );
  assert.match(src, /TWILIO_WHATSAPP_FROM_NUMBER/);
  assert.match(src, /provider\.sendMessage/);
});

test("7.F.C.2: credential form client component exists", () => {
  const path = "src/components/settings/whatsapp-credential-form.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /saveWhatsappCredentialsAction/);
  assert.match(src, /sendWhatsappTestMessageAction/);
  // Test-message form appears after save.
  assert.match(src, /Send test message/);
});

test("7.F.C.2: settings page wires the credential form", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/settings/whatsapp/page.tsx",
  );
  assert.match(src, /WhatsappCredentialForm/);
  assert.match(src, /Per-org credentials/);
  // Surfaces the env-vs-DB compromise prominently.
  assert.match(src, /env vars take precedence/);
});

// ===========================================================================
// Phase 3 closure
// ===========================================================================

test("Phase 3: no new migrations", () => {
  // Latest migration remains 0086.
  assert.ok(
    !fileExists("drizzle/0087_development_os_stage_7_f_phase_3.sql"),
    "Phase 3 must not introduce new migrations",
  );
});

test("Phase 3: encryption-at-rest used for WhatsApp creds (parity with channel-manager)", () => {
  const src = readFile(
    "src/lib/development/server/whatsapp-credential-form-actions.ts",
  );
  // Unlike marketing/banking (which currently store plaintext to match
  // existing read paths), WhatsApp uses the encrypted envelope from the
  // start since oauth_connections always stored encrypted blobs.
  assert.match(src, /JSON\.stringify\(encrypted\)/);
});
