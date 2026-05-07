/**
 * Stage 6.P2.F — Resend + Twilio SMS adapters, MessagingService,
 * rule evaluator, webhook handler, cron jobs, inbox UI.
 *
 * Covers (file-presence + grep + pure-helper invariants):
 *   - ResendProvider + TwilioSmsProvider behind the unified selector
 *   - rule-evaluator pure trigger predicates (keyword, after-hours,
 *     throttle window, midnight-wrap edge cases)
 *   - webhook routes for every channel — Meta verify wiring +
 *     telegram x-bot-api-secret-token + gmail authorization +
 *     instagram + messenger
 *   - cron registration: 4 new keys (messaging_inbound_poll,
 *     messaging_status_sync, messaging_auto_response_evaluator,
 *     messaging_cleanup) wired in dispatcher + DEV_OS_JOB_KEYS
 *   - inbox UI presence: list + thread detail + templates + auto-responses
 *   - service.ts handleIncomingMessage echo-skip + dedupe semantics
 *     verified via grep (no DB needed)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  matchesKeywordTrigger,
  matchesAfterHoursTrigger,
  isRuleWithinThrottleWindow,
  getLocalHour,
  type AfterHoursTriggerConfig,
} from "../src/lib/messaging/rule-predicates";
import {
  selectMessagingProvider,
  DryRunMessagingProvider,
} from "../src/lib/messaging";
import { ResendProvider } from "../src/lib/messaging/providers/resend/provider";
import { TwilioSmsProvider } from "../src/lib/messaging/providers/twilio-sms/provider";
import type { MessagingCredentials } from "../src/lib/messaging";

// Resolve repo root in a way that works under both CJS (tsx) and ESM.
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
// 1) Selector dispatch — every channel except internal_note real-routes
// ===========================================================================

test("selector: email/resend selects ResendProvider", () => {
  const creds: MessagingCredentials = {
    channel: "email",
    provider: "resend",
    apiKey: "re_live_xxx",
    fromAddress: "ops@arconique.com",
  };
  const provider = selectMessagingProvider("email", creds);
  assert.ok(provider instanceof ResendProvider);
  assert.equal(provider.channel, "email");
});

test("selector: sms with creds selects TwilioSmsProvider", () => {
  const creds: MessagingCredentials = {
    channel: "sms",
    accountSid: "AC1234",
    authToken: "tok",
    fromNumber: "+15551234567",
  };
  const provider = selectMessagingProvider("sms", creds);
  assert.ok(provider instanceof TwilioSmsProvider);
  assert.equal(provider.channel, "sms");
});

test("selector: internal_note still DryRun (notes never go through a channel)", () => {
  const provider = selectMessagingProvider("internal_note", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
});

test("selector: sms without creds → DryRun fallback", () => {
  const provider = selectMessagingProvider("sms", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
});

// ===========================================================================
// 2) ResendProvider
// ===========================================================================

test("ResendProvider: sendMessage rejects non-email input", async () => {
  const provider = new ResendProvider({
    channel: "email",
    provider: "resend",
    apiKey: "re_x",
    fromAddress: "ops@x.com",
  });
  const r = await provider.sendMessage({
    channel: "sms",
    recipientExternalId: "+1",
    contentType: "text",
    text: "x",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /non-email/i);
});

test("ResendProvider: sendMessage rejects missing recipient", async () => {
  const provider = new ResendProvider({
    channel: "email",
    provider: "resend",
    apiKey: "re_x",
    fromAddress: "ops@x.com",
  });
  const r = await provider.sendMessage({
    channel: "email",
    recipientExternalId: "",
    contentType: "text",
    text: "x",
  });
  assert.equal(r.success, false);
});

test("ResendProvider: parseWebhook returns null (status-only events)", () => {
  const provider = new ResendProvider({
    channel: "email",
    provider: "resend",
    apiKey: "re_x",
    fromAddress: "ops@x.com",
  });
  const out = provider.parseWebhook({
    type: "email.delivered",
    data: { email_id: "abc" },
  });
  assert.equal(out, null);
});

// ===========================================================================
// 3) TwilioSmsProvider
// ===========================================================================

test("TwilioSmsProvider: parseWebhook ignores status-only callbacks", () => {
  const provider = new TwilioSmsProvider({
    channel: "sms",
    accountSid: "AC",
    authToken: "tok",
    fromNumber: "+1",
  });
  const out = provider.parseWebhook({
    MessageSid: "SM1",
    From: "+1",
    MessageStatus: "delivered",
  });
  assert.equal(out, null);
});

test("TwilioSmsProvider: parseWebhook projects inbound text", () => {
  const provider = new TwilioSmsProvider({
    channel: "sms",
    accountSid: "AC",
    authToken: "tok",
    fromNumber: "+1",
  });
  const out = provider.parseWebhook({
    MessageSid: "SM2",
    From: "+15551234",
    Body: "hello",
  });
  assert.ok(out);
  assert.equal(out.length, 1);
  assert.equal(out[0].channel, "sms");
  assert.equal(out[0].externalMessageId, "SM2");
  assert.equal(out[0].contentText, "hello");
  assert.equal(out[0].contentType, "text");
});

test("TwilioSmsProvider: parseWebhook detects MMS image", () => {
  const provider = new TwilioSmsProvider({
    channel: "sms",
    accountSid: "AC",
    authToken: "tok",
    fromNumber: "+1",
  });
  const out = provider.parseWebhook({
    MessageSid: "SM3",
    From: "+1",
    Body: "look",
    MediaUrl0: "https://api.twilio.com/.../Media/ME1",
    MediaContentType0: "image/jpeg",
  });
  assert.ok(out);
  assert.equal(out[0].contentType, "image");
  assert.equal(out[0].contentMediaUrl, "https://api.twilio.com/.../Media/ME1");
});

// ===========================================================================
// 4) Pure rule-evaluator predicates
// ===========================================================================

test("matchesKeywordTrigger: any-match (default) is OR semantics", () => {
  assert.equal(
    matchesKeywordTrigger(
      { keywords: ["price", "book"] },
      "what is your price tonight",
    ),
    true,
  );
  assert.equal(
    matchesKeywordTrigger(
      { keywords: ["price", "book"] },
      "good morning team",
    ),
    false,
  );
});

test("matchesKeywordTrigger: all-match is AND semantics", () => {
  assert.equal(
    matchesKeywordTrigger(
      { keywords: ["price", "tonight"], matchType: "all" },
      "what is the price for tonight",
    ),
    true,
  );
  assert.equal(
    matchesKeywordTrigger(
      { keywords: ["price", "tonight"], matchType: "all" },
      "what is the price for tomorrow",
    ),
    false,
  );
});

test("matchesKeywordTrigger: case-sensitive flag honored", () => {
  assert.equal(
    matchesKeywordTrigger(
      { keywords: ["Hello"], caseSensitive: true },
      "hello world",
    ),
    false,
  );
  assert.equal(
    matchesKeywordTrigger(
      { keywords: ["Hello"], caseSensitive: true },
      "Hello world",
    ),
    true,
  );
});

test("matchesKeywordTrigger: empty keywords array never matches", () => {
  assert.equal(matchesKeywordTrigger({ keywords: [] }, "anything"), false);
});

test("matchesAfterHoursTrigger: midnight-wrap window (18→9)", () => {
  // UTC reference times — Asia/Jakarta is UTC+7. 11:00 UTC = 18:00 JKT.
  const cfg: AfterHoursTriggerConfig = {
    timezone: "Asia/Jakarta",
    startHour: 18,
    endHour: 9,
  };
  const at1800 = new Date(Date.UTC(2026, 4, 6, 11, 0)); // 18:00 JKT
  const at0800 = new Date(Date.UTC(2026, 4, 6, 1, 0)); // 08:00 JKT
  const at1200 = new Date(Date.UTC(2026, 4, 6, 5, 0)); // 12:00 JKT
  assert.equal(matchesAfterHoursTrigger(cfg, at1800), true);
  assert.equal(matchesAfterHoursTrigger(cfg, at0800), true);
  assert.equal(matchesAfterHoursTrigger(cfg, at1200), false);
});

test("matchesAfterHoursTrigger: daytime window (9→18)", () => {
  const cfg: AfterHoursTriggerConfig = {
    timezone: "Asia/Jakarta",
    startHour: 9,
    endHour: 18,
  };
  const at1200 = new Date(Date.UTC(2026, 4, 6, 5, 0)); // 12:00 JKT
  const at0700 = new Date(Date.UTC(2026, 4, 6, 0, 0)); // 07:00 JKT
  assert.equal(matchesAfterHoursTrigger(cfg, at1200), true);
  assert.equal(matchesAfterHoursTrigger(cfg, at0700), false);
});

test("matchesAfterHoursTrigger: startHour === endHour ⇒ always after-hours", () => {
  const cfg: AfterHoursTriggerConfig = {
    timezone: "UTC",
    startHour: 12,
    endHour: 12,
  };
  assert.equal(matchesAfterHoursTrigger(cfg, new Date()), true);
});

test("getLocalHour: invalid timezone returns null", () => {
  assert.equal(getLocalHour(new Date(), "Not/A_Real_Zone"), null);
});

test("isRuleWithinThrottleWindow: null lastTriggeredAt always allows", () => {
  assert.equal(isRuleWithinThrottleWindow(null, 60, new Date()), false);
});

test("isRuleWithinThrottleWindow: inside window blocks, outside allows", () => {
  const now = new Date("2026-05-06T12:00:00Z");
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);
  assert.equal(isRuleWithinThrottleWindow(fiveMinAgo, 60, now), true);
  assert.equal(isRuleWithinThrottleWindow(twoHoursAgo, 60, now), false);
});

// ===========================================================================
// 5) Webhook routes — file presence + handler delegation
// ===========================================================================

test("webhook routes: all 5 channel routes exist under /api/webhooks/messaging/", () => {
  for (const channel of [
    "whatsapp",
    "telegram",
    "instagram",
    "messenger",
    "gmail",
  ]) {
    assert.ok(
      fileExists(`src/app/api/webhooks/messaging/${channel}/route.ts`),
      `${channel}/route.ts must exist`,
    );
  }
});

test("webhook routes: all delegate to handleMessagingWebhook", () => {
  for (const channel of [
    "whatsapp",
    "telegram",
    "instagram",
    "messenger",
    "gmail",
  ]) {
    const src = readFile(
      `src/app/api/webhooks/messaging/${channel}/route.ts`,
    );
    assert.match(src, /handleMessagingWebhook/);
    assert.match(src, /export const runtime = "nodejs"/);
  }
});

test("webhook routes: Meta channels declare verify-token GET handshake", () => {
  for (const channel of ["whatsapp", "instagram", "messenger"]) {
    const src = readFile(
      `src/app/api/webhooks/messaging/${channel}/route.ts`,
    );
    assert.match(src, /export async function GET/);
    assert.match(src, /metaVerifyToken/);
    assert.match(src, /x-hub-signature-256/);
  }
});

test("webhook routes: telegram uses x-telegram-bot-api-secret-token", () => {
  const src = readFile(`src/app/api/webhooks/messaging/telegram/route.ts`);
  assert.match(src, /x-telegram-bot-api-secret-token/);
});

// ===========================================================================
// 6) Cron registration — 4 new P2.F job keys
// ===========================================================================

test("cron index: exports all 4 P2.F runners", () => {
  const src = readFile("src/lib/development/server/cron/index.ts");
  for (const fn of [
    "runMessagingInboundPoll",
    "runMessagingStatusSync",
    "runMessagingAutoResponseEvaluator",
    "runMessagingCleanup",
  ]) {
    assert.match(
      src,
      new RegExp(`export\\s*\\{\\s*${fn}\\s*\\}\\s*from`),
      `${fn} must be exported`,
    );
  }
});

test("cron index: DEV_OS_JOB_KEYS includes the 4 P2.F keys", () => {
  const src = readFile("src/lib/development/server/cron/index.ts");
  for (const key of [
    "messaging_inbound_poll",
    "messaging_status_sync",
    "messaging_auto_response_evaluator",
    "messaging_cleanup",
  ]) {
    assert.match(src, new RegExp(`"${key}"`), `${key} must appear in index`);
  }
});

test("dispatcher: actions.ts wires all 4 P2.F jobs into KNOWN_JOBS + executeJob switch", () => {
  const src = readFile("src/features/jobs/actions.ts");
  for (const key of [
    "messaging_inbound_poll",
    "messaging_status_sync",
    "messaging_auto_response_evaluator",
    "messaging_cleanup",
  ]) {
    assert.match(src, new RegExp(`"${key}"`), `KNOWN_JOBS must include ${key}`);
    assert.match(
      src,
      new RegExp(`case\\s+"${key}":`),
      `executeJob switch must include ${key}`,
    );
  }
});

test("cron routes: all 4 P2.F route files exist + delegate to handleCronJobRequest", () => {
  for (const route of [
    "messaging-inbound-poll",
    "messaging-status-sync",
    "messaging-auto-response-evaluator",
    "messaging-cleanup",
  ]) {
    const path = `src/app/api/cron/${route}/route.ts`;
    assert.ok(fileExists(path), `${path} must exist`);
    const src = readFile(path);
    assert.match(src, /handleCronJobRequest/);
  }
});

test("VERCEL-CRON-CHECKLIST: all 4 P2.F entries listed under Stage 6.P2.F", () => {
  const src = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  for (const route of [
    "/api/cron/messaging-inbound-poll",
    "/api/cron/messaging-status-sync",
    "/api/cron/messaging-auto-response-evaluator",
    "/api/cron/messaging-cleanup",
  ]) {
    assert.ok(src.includes(route), `${route} must appear in checklist`);
  }
});

// ===========================================================================
// 7) Inbox UI — file presence
// ===========================================================================

test("inbox UI: top-level inbox + thread detail + templates + auto-responses pages exist", () => {
  for (const path of [
    "src/app/(development-app)/development-os/inbox/page.tsx",
    "src/app/(development-app)/development-os/inbox/[threadId]/page.tsx",
    "src/app/(development-app)/development-os/inbox/templates/page.tsx",
    "src/app/(development-app)/development-os/inbox/auto-responses/page.tsx",
  ]) {
    assert.ok(fileExists(path), `${path} must exist`);
  }
});

test("inbox UI: thread detail page wires the reply composer to sendReplyAction", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/inbox/[threadId]/page.tsx",
  );
  assert.match(src, /sendReplyAction/);
  assert.match(src, /name="text"/);
  assert.match(src, /name="recipientExternalId"/);
});

test("inbox UI: templates page wires create + archive actions", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/inbox/templates/page.tsx",
  );
  assert.match(src, /createTemplateAction/);
  assert.match(src, /archiveTemplateAction/);
});

test("inbox UI: auto-responses page wires create + toggle actions", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/inbox/auto-responses/page.tsx",
  );
  assert.match(src, /createAutoResponseRuleAction/);
  assert.match(src, /setRuleActiveAction/);
});

// ===========================================================================
// 8) Service-layer invariants — verified via grep, no DB
// ===========================================================================

test("service.ts: handleIncomingMessage skips platform echoes (contentMetadata.echo === true)", () => {
  const src = readFile("src/lib/messaging/service.ts");
  assert.match(src, /echo_skipped/);
  assert.match(src, /\["echo"\]\s*===\s*true/);
});

test("service.ts: handleIncomingMessage dedupes by (channel, externalMessageId)", () => {
  const src = readFile("src/lib/messaging/service.ts");
  assert.match(src, /duplicate_skipped/);
  assert.match(src, /externalMessageId/);
});

test("service.ts: sendOutboundMessage pre-inserts pending row + updates after dispatch", () => {
  const src = readFile("src/lib/messaging/service.ts");
  // Pre-insert with pending status
  assert.match(src, /status:\s*"pending"/);
  // Update to sent or failed after dispatch
  assert.match(src, /status:\s*result\.success\s*\?\s*"sent"\s*:\s*"failed"/);
});

test("inbox-actions.ts: every form action returns Promise<void> (Next.js form-action contract)", () => {
  const src = readFile("src/lib/messaging/inbox-actions.ts");
  for (const fn of [
    "sendReplyAction",
    "createTemplateAction",
    "archiveTemplateAction",
    "createAutoResponseRuleAction",
    "setRuleActiveAction",
    "markThreadReadAction",
    "updateThreadStatusAction",
  ]) {
    assert.match(
      src,
      new RegExp(`function\\s+${fn}\\b[^{]*Promise<void>`),
      `${fn} must return Promise<void>`,
    );
  }
});

test("inbox-actions.ts: opens with \"use server\" directive (client-imported, build-fix invariant)", () => {
  const src = readFile("src/lib/messaging/inbox-actions.ts");
  assert.match(src, /^"use server";/);
});

// ===========================================================================
// 9) Cron job runners — pure-grep invariants
// ===========================================================================

test("cron/messaging-cleanup: archives threads inactive >90 days via service helper", () => {
  const src = readFile(
    "src/lib/development/server/cron/messaging-cleanup-job.ts",
  );
  assert.match(src, /archiveInactiveThreads/);
  assert.match(src, /INACTIVE_DAYS\s*=\s*90/);
});

test("cron/messaging-status-sync: reconciles stuck outbound rows after 24h", () => {
  const src = readFile(
    "src/lib/development/server/cron/messaging-status-sync-job.ts",
  );
  assert.match(src, /direction.*outbound/);
  assert.match(src, /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(src, /'queued','sending','sent'/);
});

test("cron/messaging-auto-response-evaluator: walks after_hours + no_response_timeout rules", () => {
  const src = readFile(
    "src/lib/development/server/cron/messaging-auto-response-evaluator-job.ts",
  );
  assert.match(src, /'after_hours','no_response_timeout'/);
  assert.match(src, /matchesAfterHoursTrigger/);
  assert.match(src, /thresholdMinutes/);
});

// ===========================================================================
// 10) P2.A invariant must reflect P2.F closure
// ===========================================================================

test("P2.A invariant test: every external channel now real-routes (post-P2.F)", () => {
  const src = readFile("tests/development-stage-6-p2-a.test.ts");
  // Our updated invariant flips the assertion: real provider, NOT DryRun.
  assert.match(src, /every channel except internal_note now selects a real provider/);
});
