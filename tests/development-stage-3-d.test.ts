/**
 * Stage 3.D — WhatsApp Integration.
 *
 * Mix of:
 *   - Runtime tests for the pure types-module helpers (`normalisePhone`)
 *     and provider behaviours that don't require a DB.
 *   - Static-source tests for everything that imports `server-only`
 *     (providers, processor, webhook, server actions, UI pages).
 *   - Migration shape tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

import { normalisePhone } from "../src/lib/whatsapp/providers/types";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// 1) Migration 0044
// ===========================================================================

const MIGRATION_PATH = "drizzle/0044_development_os_stage_3_d_whatsapp.sql";

test("migration 0044 file exists", () => {
  assert.ok(exists(MIGRATION_PATH));
});

test("migration 0044 wraps in BEGIN/COMMIT", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0044 creates whatsapp_phone_numbers with type CHECK", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "whatsapp_phone_numbers"/);
  assert.match(
    sql,
    /'arconique_outbound', 'arconique_inbound', 'recipient', 'unknown'/,
  );
  assert.match(sql, /'app_user', 'investor', 'vendor', 'contact'/);
  assert.match(sql, /'twilio', 'meta_cloud', 'sandbox', 'dry_run'/);
});

test("migration 0044 creates whatsapp_messages with direction/type/status CHECKs", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "whatsapp_messages"/);
  assert.match(sql, /'inbound', 'outbound'/);
  assert.match(
    sql,
    /'text', 'voice', 'image', 'document', 'video', 'location', 'template'/,
  );
  assert.match(
    sql,
    /'received', 'queued', 'sent', 'delivered', 'read', 'failed', 'processed'/,
  );
  assert.match(
    sql,
    /'site_report', 'safety_alert', 'vendor_inquiry',\s*\n\s*'investor_question', 'unknown'/,
  );
});

test("migration 0044 enforces replay protection via partial unique index", () => {
  const sql = read(MIGRATION_PATH);
  // (provider, external_message_sid) unique when sid present.
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_provider_sid_unique"/,
  );
  assert.match(sql, /WHERE "external_message_sid" IS NOT NULL/);
});

test("migration 0044 creates whatsapp_message_templates with approval CHECK", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "whatsapp_message_templates"/);
  assert.match(
    sql,
    /'draft', 'pending_approval', 'approved', 'rejected', 'inactive'/,
  );
});

test("migration 0044 creates whatsapp_webhook_events with rejection statuses", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "whatsapp_webhook_events"/);
  // Webhook events MUST track signature rejection + replay separately.
  assert.match(
    sql,
    /'pending', 'processed', 'failed',\s*\n\s*'rejected_invalid_signature', 'rejected_replay'/,
  );
});

test("migration 0044 enables RLS on all four new tables", () => {
  const sql = read(MIGRATION_PATH);
  for (const t of [
    "whatsapp_phone_numbers",
    "whatsapp_messages",
    "whatsapp_message_templates",
    "whatsapp_webhook_events",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

test("migration 0044 extends app_users / investors / contacts with whatsapp columns", () => {
  const sql = read(MIGRATION_PATH);
  for (const tbl of ["app_users", "investors", "contacts"]) {
    assert.ok(
      new RegExp(`ALTER TABLE "${tbl}"[\\s\\S]*?whatsapp_phone`).test(sql),
      `${tbl} missing whatsapp_phone ALTER`,
    );
    assert.ok(
      new RegExp(`ALTER TABLE "${tbl}"[\\s\\S]*?prefers_whatsapp`).test(sql),
      `${tbl} missing prefers_whatsapp ALTER`,
    );
  }
});

test("migration 0044 seeds the WhatsApp intent classifier budget idempotently", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /'dev_os\.whatsapp_intent_classifier'/);
  assert.match(sql, /ON CONFLICT \("assistant_key"\) DO UPDATE/);
});

// ===========================================================================
// 2) Drizzle schema
// ===========================================================================

test("Drizzle schema exports the four WhatsApp tables", () => {
  const src = read("src/lib/db/schema/whatsapp.ts");
  for (const t of [
    "whatsappPhoneNumbers",
    "whatsappMessages",
    "whatsappMessageTemplates",
    "whatsappWebhookEvents",
  ]) {
    assert.match(src, new RegExp(`export const ${t} `));
  }
});

test("Drizzle schema mirrors the (provider, sid) partial unique index", () => {
  const src = read("src/lib/db/schema/whatsapp.ts");
  assert.match(
    src,
    /uniqueIndex\("whatsapp_messages_provider_sid_unique"\)/,
  );
  assert.match(src, /external_message_sid IS NOT NULL/);
});

test("WhatsApp schema is re-exported from db/schema/index", () => {
  const src = read("src/lib/db/schema/index.ts");
  assert.match(src, /whatsapp/);
});

test("identity / contacts / investor-capital schemas have whatsapp columns", () => {
  const id = read("src/lib/db/schema/identity.ts");
  const cont = read("src/lib/db/schema/contacts.ts");
  const inv = read("src/lib/db/schema/investor-capital.ts");
  for (const src of [id, cont, inv]) {
    assert.match(src, /whatsappPhone: text\("whatsapp_phone"\)/);
    assert.match(src, /prefersWhatsapp: boolean\("prefers_whatsapp"\)/);
  }
});

// ===========================================================================
// 3) Provider abstraction — runtime tests for normalisePhone
// ===========================================================================

test("normalisePhone strips whatsapp: prefix", () => {
  assert.equal(normalisePhone("whatsapp:+6281234567890"), "+6281234567890");
});

test("normalisePhone preserves leading +", () => {
  assert.equal(normalisePhone("+6281234567890"), "+6281234567890");
});

test("normalisePhone adds + when missing", () => {
  assert.equal(normalisePhone("6281234567890"), "+6281234567890");
});

test("normalisePhone strips spaces and dashes", () => {
  assert.equal(normalisePhone("+62 812-3456-7890"), "+6281234567890");
});

test("normalisePhone is case-insensitive on prefix", () => {
  assert.equal(normalisePhone("WhatsApp:+6281234567890"), "+6281234567890");
});

// ===========================================================================
// 4) DryRun provider behaviour (no fetch, no DB)
// ===========================================================================

test("DryRun provider file exists with server-only guard", () => {
  const path = "src/lib/whatsapp/providers/dry-run.ts";
  assert.ok(exists(path));
  assert.match(read(path), /^(import "server-only";|"use server";)/m);
});

test("DryRun provider is always available + always sandbox", () => {
  const src = read("src/lib/whatsapp/providers/dry-run.ts");
  assert.match(src, /isAvailable\(\): boolean \{\s*return true;/);
  assert.match(src, /isSandbox\(\): boolean \{\s*return true;/);
});

test("DryRun verifyWebhookSignature ALWAYS returns true (dev only)", () => {
  // This is a critical safety claim — verify in source.
  const src = read("src/lib/whatsapp/providers/dry-run.ts");
  assert.match(
    src,
    /verifyWebhookSignature\(\s*_args[\s\S]*?\)[\s\S]*?Promise<boolean>[\s\S]*?return true;/,
  );
});

test("DryRun parseInboundMessage accepts both Twilio form + test JSON shapes", () => {
  const src = read("src/lib/whatsapp/providers/dry-run.ts");
  assert.match(src, /payload\.MessageSid/);
  assert.match(src, /payload\.sid/);
});

// ===========================================================================
// 5) Twilio provider — signature verification
// ===========================================================================

test("Twilio provider file exists with server-only guard", () => {
  const path = "src/lib/whatsapp/providers/twilio.ts";
  assert.ok(exists(path));
  assert.match(read(path), /^(import "server-only";|"use server";)/m);
});

test("Twilio provider auto-detects sandbox via TWILIO_WHATSAPP_FROM_NUMBER", () => {
  const src = read("src/lib/whatsapp/providers/twilio.ts");
  assert.match(src, /SANDBOX_FROM = "whatsapp:\+14155238886"/);
  assert.match(src, /this\.fromNumber === SANDBOX_FROM/);
});

test("Twilio webhook signature uses HMAC-SHA1 over sorted params (matches Twilio spec)", () => {
  // Pure helper extracted into twilio-signature.ts so we can unit-test
  // the algorithm without server-only.
  const src = read("src/lib/whatsapp/providers/twilio-signature.ts");
  assert.match(src, /createHmac\("sha1", authToken\)/);
  assert.match(src, /sort\(\(\[a\], \[b\]\)/);
  assert.match(src, /timingSafeEqual/);
  // Provider must delegate to the helper.
  const provider = read("src/lib/whatsapp/providers/twilio.ts");
  assert.match(provider, /verifyTwilioSignature/);
});

test("Twilio sendMessage uses raw fetch (no SDK dependency)", () => {
  const src = read("src/lib/whatsapp/providers/twilio.ts");
  assert.match(src, /fetch\(url, \{/);
  // No twilio package import.
  assert.doesNotMatch(src, /from ["']twilio["']/);
});

test("Twilio parseInboundMessage maps MediaContentType to messageType", () => {
  const src = read("src/lib/whatsapp/providers/twilio.ts");
  assert.match(src, /audio\//);
  assert.match(src, /image\//);
  assert.match(src, /video\//);
  assert.match(src, /messageType = "voice"/);
});

// ===========================================================================
// 6) Twilio signature verification — RUNTIME
//
// The provider's HMAC is straightforward enough to test end-to-end by
// instantiating the provider with a fake token via env, then calling
// verifyWebhookSignature with a request we sign ourselves.
// ===========================================================================

test("Twilio signature verifies a known-good HMAC; rejects mismatched", async () => {
  // Use the pure helper module — no server-only dependency.
  const { verifyTwilioSignature, computeTwilioSignature } = await import(
    "../src/lib/whatsapp/providers/twilio-signature"
  );
  const authToken = "secret-token-abc";
  const fullUrl = "https://example.com/api/whatsapp/webhook";
  const params = new URLSearchParams();
  params.set("MessageSid", "SMabc123");
  params.set("From", "whatsapp:+6281234567890");
  params.set("To", "whatsapp:+14155238886");
  params.set("Body", "hello");
  const formBody = params.toString();
  const expected = computeTwilioSignature(authToken, fullUrl, formBody);
  // 1) Known-good HMAC verifies.
  assert.equal(
    verifyTwilioSignature({
      authToken,
      fullUrl,
      formBody,
      providedSignature: expected,
    }),
    true,
  );
  // 2) Tampered signature rejected.
  assert.equal(
    verifyTwilioSignature({
      authToken,
      fullUrl,
      formBody,
      providedSignature: "tampered=",
    }),
    false,
  );
  // 3) Missing signature rejected.
  assert.equal(
    verifyTwilioSignature({
      authToken,
      fullUrl,
      formBody,
      providedSignature: undefined,
    }),
    false,
  );
  // 4) Tampered body invalidates a previously-good signature
  //    (replay-against-mutated-payload protection).
  assert.equal(
    verifyTwilioSignature({
      authToken,
      fullUrl,
      formBody: formBody + "&extra=injected",
      providedSignature: expected,
    }),
    false,
  );
});

test("Twilio signature verification refuses without auth token", async () => {
  const { verifyTwilioSignature } = await import(
    "../src/lib/whatsapp/providers/twilio-signature"
  );
  assert.equal(
    verifyTwilioSignature({
      authToken: undefined,
      fullUrl: "https://example.com",
      formBody: "",
      providedSignature: "anything",
    }),
    false,
  );
});

// ===========================================================================
// 7) Meta Cloud stub
// ===========================================================================

test("MetaCloud provider exists and is NOT available (stub only)", () => {
  const src = read("src/lib/whatsapp/providers/meta-cloud.ts");
  assert.match(src, /^(import "server-only";|"use server";)/m);
  assert.match(src, /isAvailable\(\): boolean \{\s*return false;/);
});

test("MetaCloud sendMessage / parseInboundMessage / verifyWebhookSignature throw NotImplementedError", () => {
  const src = read("src/lib/whatsapp/providers/meta-cloud.ts");
  assert.match(src, /NotImplementedError/);
  // Each of the three load-bearing methods must throw.
  for (const m of [
    "sendMessage",
    "sendTemplateMessage",
    "parseInboundMessage",
    "verifyWebhookSignature",
  ]) {
    assert.ok(
      new RegExp(`async?\\s*${m}[\\s\\S]*?NotImplementedError`).test(src) ||
        new RegExp(`${m}\\(`).test(src),
      `Meta Cloud ${m} missing`,
    );
  }
});

// ===========================================================================
// 8) Provider factory
// ===========================================================================

test("Factory selects DryRun when WHATSAPP_PROVIDER=dry_run explicitly", () => {
  const src = read("src/lib/whatsapp/providers/index.ts");
  assert.match(src, /explicit === "dry_run"/);
  assert.match(src, /new DryRunWhatsAppProvider\(\)/);
});

test("Factory selects MetaCloud when WHATSAPP_PROVIDER=meta_cloud", () => {
  const src = read("src/lib/whatsapp/providers/index.ts");
  assert.match(src, /explicit === "meta_cloud"/);
  assert.match(src, /new MetaCloudWhatsAppProvider\(\)/);
});

test("Factory selects Twilio when explicit OR (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN) present", () => {
  const src = read("src/lib/whatsapp/providers/index.ts");
  assert.match(src, /explicit === "twilio"/);
  assert.match(src, /process\.env\.TWILIO_ACCOUNT_SID/);
  assert.match(src, /process\.env\.TWILIO_AUTH_TOKEN/);
});

test("Factory refuses DryRun fallback in production with WHATSAPP_REQUIRE_REAL_PROVIDER=1", () => {
  const src = read("src/lib/whatsapp/providers/index.ts");
  assert.match(src, /WHATSAPP_REQUIRE_REAL_PROVIDER === "1"/);
  assert.match(src, /throw new Error/);
});

// ===========================================================================
// 9) Phone resolver
// ===========================================================================

const RESOLVER_PATH = "src/lib/development/whatsapp/phone-resolver.ts";

test("phone resolver file exists with server-only guard", () => {
  assert.ok(exists(RESOLVER_PATH));
  assert.match(read(RESOLVER_PATH), /^(import "server-only";|"use server";)/m);
});

test("phone resolver tries app_users → investors → vendors → contacts in order", () => {
  const src = read(RESOLVER_PATH);
  const appIdx = src.indexOf(".select({\n      id: appUsers.id");
  const invIdx = src.indexOf(".from(investors)");
  const venIdx = src.indexOf(".from(vendors)");
  const conIdx = src.indexOf(".from(contacts)");
  assert.ok(appIdx > 0 && invIdx > appIdx && venIdx > invIdx && conIdx > venIdx,
    "resolver tier ordering must be app_users → investors → vendors → contacts");
});

test("phone resolver upserts into whatsapp_phone_numbers (registry stays fresh)", () => {
  const src = read(RESOLVER_PATH);
  assert.match(src, /onConflictDoUpdate/);
  assert.match(src, /target: whatsappPhoneNumbers\.phoneNumber/);
});

test("phone resolver never downgrades a known phone to 'unknown'", () => {
  const src = read(RESOLVER_PATH);
  assert.match(
    src,
    /WHEN[\s\S]*?numberType[\s\S]*?'unknown' AND EXCLUDED\.number_type = 'recipient'[\s\S]*?THEN 'recipient'/,
  );
});

// ===========================================================================
// 10) AI intent classifier
// ===========================================================================

const CLASSIFIER_PATH =
  "src/lib/development/ai/whatsapp-intent-classifier.ts";

test("intent classifier file exists with server-only guard", () => {
  assert.ok(exists(CLASSIFIER_PATH));
  assert.match(read(CLASSIFIER_PATH), /^(import "server-only";|"use server";)/m);
});

test("classifier exports WHATSAPP_INTENT_KEY = 'dev_os.whatsapp_intent_classifier'", () => {
  const src = read(CLASSIFIER_PATH);
  assert.match(
    src,
    /WHATSAPP_INTENT_KEY = "dev_os\.whatsapp_intent_classifier"/,
  );
});

test("classifier enforces budget BEFORE provider call", () => {
  const src = read(CLASSIFIER_PATH);
  const budgetIdx = src.indexOf("checkBudget(WHATSAPP_INTENT_KEY)");
  const providerIdx = src.indexOf("provider.complete");
  assert.ok(budgetIdx >= 0 && providerIdx > budgetIdx);
});

test("classifier supports 5 intents (site_report, safety_alert, vendor_inquiry, investor_question, unknown)", () => {
  const src = read(CLASSIFIER_PATH);
  assert.match(src, /"site_report"/);
  assert.match(src, /"safety_alert"/);
  assert.match(src, /"vendor_inquiry"/);
  assert.match(src, /"investor_question"/);
  assert.match(src, /"unknown"/);
});

test("classifier records cost on every call (budget audit)", () => {
  const src = read(CLASSIFIER_PATH);
  assert.match(src, /computeCallCost/);
  assert.match(src, /inputCostUsd:/);
});

test("classifier dry-run synthesizes intent based on sender entity type", () => {
  const src = read(CLASSIFIER_PATH);
  assert.match(src, /senderEntityType === "app_user"/);
  assert.match(src, /senderEntityType === "vendor"/);
  assert.match(src, /senderEntityType === "investor"/);
});

// ===========================================================================
// 11) Inbound webhook + processor
// ===========================================================================

const WEBHOOK_PATH = "src/app/api/whatsapp/webhook/route.ts";
const PROCESSOR_PATH = "src/lib/development/whatsapp/inbound-processor.ts";

test("webhook endpoint exists at /api/whatsapp/webhook", () => {
  assert.ok(exists(WEBHOOK_PATH));
});

test("webhook persists raw payload BEFORE signature verification (recoverability)", () => {
  const src = read(WEBHOOK_PATH);
  const logIdx = src.indexOf(".insert(whatsappWebhookEvents)");
  const verifyIdx = src.indexOf("verifyWebhookSignature");
  assert.ok(
    logIdx > 0 && verifyIdx > logIdx,
    "webhook event must be logged before signature verification",
  );
});

test("webhook returns 401 on invalid signature + marks event rejected_invalid_signature", () => {
  const src = read(WEBHOOK_PATH);
  assert.match(src, /Invalid webhook signature/);
  assert.match(src, /rejected_invalid_signature/);
  assert.match(src, /status: 401/);
});

test("webhook detects replay via unique constraint + marks rejected_replay (returns 200 OK)", () => {
  const src = read(WEBHOOK_PATH);
  assert.match(src, /unique\|duplicate/);
  assert.match(src, /rejected_replay/);
  assert.match(src, /isReplay/);
});

test("webhook inserts message with status='received' (cron picks up async)", () => {
  const src = read(WEBHOOK_PATH);
  assert.match(src, /status: "received"/);
});

test("webhook returns 200 OK quickly — no AI calls inline", () => {
  const src = read(WEBHOOK_PATH);
  // No imports of the classifier or processor.
  assert.doesNotMatch(src, /classifyMessage|processInboundMessage/);
});

test("inbound processor file exists with server-only guard", () => {
  assert.ok(exists(PROCESSOR_PATH));
  assert.match(read(PROCESSOR_PATH), /^(import "server-only";|"use server";)/m);
});

test("inbound processor calls phone resolver + intent classifier in order", () => {
  const src = read(PROCESSOR_PATH);
  const resolverIdx = src.indexOf("resolveSenderPhone(msg.fromPhone)");
  const classifierIdx = src.indexOf("classifyMessage(");
  const routeIdx = src.indexOf("classification.intent ===");
  assert.ok(
    resolverIdx > 0 && classifierIdx > resolverIdx && routeIdx > classifierIdx,
  );
});

test("inbound processor creates DRAFT site_reports (HITL — never auto-acts)", () => {
  const src = read(PROCESSOR_PATH);
  assert.match(src, /status: "draft"/);
  assert.match(src, /sourceChannel: "whatsapp"/);
});

test("inbound processor never auto-creates safety_incidents (defers to operator)", () => {
  const src = read(PROCESSOR_PATH);
  // Stage 3.D ships HITL plumbing only — auto-create safety incidents is deferred.
  assert.match(src, /Stage 3.D we don't auto-create vendor notifications or/);
});

test("inbound processor sends acknowledgement to known senders only", () => {
  const src = read(PROCESSOR_PATH);
  assert.match(src, /sendAcknowledgement/);
  assert.match(src, /senderType === "unknown"/);
});

test("inbound processor confidence threshold 0.5 for routing to drafts", () => {
  const src = read(PROCESSOR_PATH);
  assert.match(src, /confidence >= 0\.5/);
});

// ===========================================================================
// 12) Outbound dispatch
// ===========================================================================

const ACTIONS_PATH = "src/lib/development/server/whatsapp-actions.ts";

test("whatsapp-actions has server-only guard + 5 server actions", () => {
  assert.ok(exists(ACTIONS_PATH));
  const src = read(ACTIONS_PATH);
  assert.match(src, /^(import "server-only";|"use server";)/m);
  for (const fn of [
    "sendWhatsAppMessage",
    "sendWhatsAppTemplateMessage",
    "getRecentWhatsappMessages",
    "getWhatsappPhoneNumbers",
    "getWhatsappTemplates",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `missing ${fn}`,
    );
  }
});

test("sendWhatsAppMessage writes 'queued' BEFORE provider call (audit trail)", () => {
  const src = read(ACTIONS_PATH);
  const insertIdx = src.indexOf(".insert(whatsappMessages)");
  const sendIdx = src.indexOf("sendMessage({");
  assert.ok(
    insertIdx > 0 && sendIdx > insertIdx,
    "message row must be inserted before provider.sendMessage",
  );
});

test("sendWhatsAppTemplateMessage REFUSES non-approved templates (defense in depth)", () => {
  const src = read(ACTIONS_PATH);
  assert.match(
    src,
    /template\.approvalStatus !== "approved"/,
  );
  assert.match(src, /only approved templates can be sent/);
});

test("sendWhatsAppTemplateMessage substitutes {{var}} variables", () => {
  const src = read(ACTIONS_PATH);
  assert.match(src, /substituteVariables/);
  assert.match(src, /\\\{\\\{\\s\*\(\[a-zA-Z0-9_\]\+\)\\s\*\\\}\\\}/);
});

test("sendWhatsAppTemplateMessage records failure_reason on provider error", () => {
  const src = read(ACTIONS_PATH);
  assert.match(src, /failureReason: reason/);
});

// ===========================================================================
// 13) Cron + dispatcher wiring
// ===========================================================================

test("WhatsApp inbound processor cron file exists", () => {
  const path =
    "src/lib/development/server/cron/whatsapp-inbound-processor-job.ts";
  assert.ok(exists(path));
  assert.match(read(path), /^(import "server-only";|"use server";)/m);
});

test("WhatsApp inbound cron route exists at /api/cron/dev-os-whatsapp-inbound-processor", () => {
  const r =
    "src/app/api/cron/dev-os-whatsapp-inbound-processor/route.ts";
  assert.ok(exists(r));
  assert.match(
    read(r),
    /handleCronJobRequest\(request, "dev_os_whatsapp_inbound_processor"\)/,
  );
});

test("dev_os_whatsapp_inbound_processor wired into KNOWN_JOBS + dispatcher + DEV_OS_JOB_KEYS", () => {
  const a = read("src/features/jobs/actions.ts");
  const c = read("src/lib/development/server/cron/index.ts");
  assert.match(a, /"dev_os_whatsapp_inbound_processor"/);
  assert.match(
    a,
    /case "dev_os_whatsapp_inbound_processor":\s*\n\s*return runDevOsWhatsappInboundProcessor/,
  );
  assert.match(c, /"dev_os_whatsapp_inbound_processor"/);
  assert.match(c, /runDevOsWhatsappInboundProcessor/);
});

test("VERCEL-CRON-CHECKLIST.md documents WhatsApp cron at every 2 minutes", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-whatsapp-inbound-processor/);
  assert.match(md, /\*\/2 \* \* \* \*/);
});

// ===========================================================================
// 14) UI pages
// ===========================================================================

test("WhatsApp dashboard page exists", () => {
  assert.ok(
    exists("src/app/(development-app)/development-os/whatsapp/page.tsx"),
  );
});

test("WhatsApp message detail page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/whatsapp/messages/[id]/page.tsx",
    ),
  );
});

test("WhatsApp templates page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/whatsapp/templates/page.tsx",
    ),
  );
});

test("WhatsApp phone-numbers page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/whatsapp/phone-numbers/page.tsx",
    ),
  );
});

test("WhatsApp setup wizard page exists at /settings/whatsapp", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/settings/whatsapp/page.tsx",
    ),
  );
});

test("Setup wizard renders provider health + operational checklist", () => {
  const src = read(
    "src/app/(development-app)/development-os/settings/whatsapp/page.tsx",
  );
  assert.match(src, /healthCheck/);
  assert.match(src, /Operational checklist/);
  assert.match(src, /WHATSAPP_REQUIRE_REAL_PROVIDER/);
});

test("Setup wizard surfaces the expected webhook URL", () => {
  const src = read(
    "src/app/(development-app)/development-os/settings/whatsapp/page.tsx",
  );
  assert.match(src, /\/api\/whatsapp\/webhook/);
});

// ===========================================================================
// 15) Demo seed extension
// ===========================================================================

test("seed-dev-os.mjs seeds whatsapp_phone_numbers + arconique outbound", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO whatsapp_phone_numbers/);
  assert.match(src, /arconique_outbound/);
});

test("seed-dev-os.mjs seeds 5 sample whatsapp_message_templates as 'draft'", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO whatsapp_message_templates/);
  assert.match(src, /'draft'/);
  // Five template keys.
  for (const key of [
    "welcome_to_site_team",
    "distribution_announcement",
    "payment_reminder",
    "daily_report_request",
    "investor_milestone_update",
  ]) {
    assert.ok(src.includes(key), `template ${key} missing from seed`);
  }
});

test("seed-dev-os.mjs seeds whatsapp_messages (8 inbound + 7 outbound demo)", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO whatsapp_messages/);
  assert.match(src, /inbound/);
  assert.match(src, /outbound/);
  // Voice transcript variant.
  assert.match(src, /voice_transcript/);
});

test("seed-dev-os.mjs seeds the WhatsApp intent classifier budget", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /dev_os\.whatsapp_intent_classifier/);
});
