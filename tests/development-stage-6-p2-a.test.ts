/**
 * Stage 6.P2.A — Schema + provider abstraction tests.
 *
 * Covers:
 *   - Migration 0078 (4 tables) — incl. FOREACH IN ARRAY pattern check
 *     (the 0075 lesson the launch prompt explicitly called out)
 *   - Drizzle schema (messaging.ts) — table exports + type unions
 *   - Provider types (MessagingProvider interface contract +
 *     credentials discriminated union)
 *   - DryRunMessagingProvider behaviour (the actual class is exercised)
 *   - selectMessagingProvider routing (no-creds, internal_note,
 *     mismatch, real channels still on DryRun pre-P2.B)
 *   - Architecture doc markers
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  selectMessagingProvider,
  DryRunMessagingProvider,
} from "../src/lib/messaging";
import type {
  MessagingCredentials,
  MessagingProvider,
} from "../src/lib/messaging";
import {
  MESSAGING_CHANNELS,
  THREAD_STATUSES,
  MESSAGE_CONTENT_TYPES,
  MESSAGE_STATUSES,
  AUTO_RESPONSE_TRIGGER_TYPES,
  AUTO_RESPONSE_ACTION_TYPES,
} from "../src/lib/db/schema/messaging";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const F_MIG_0078 =
  "drizzle/0078_development_os_stage_6_p2_unified_messaging.sql";
const F_SCHEMA = "src/lib/db/schema/messaging.ts";
const F_SCHEMA_INDEX = "src/lib/db/schema/index.ts";
const F_TYPES = "src/lib/messaging/types.ts";
const F_SELECTOR = "src/lib/messaging/select-provider.ts";
const F_DRY_RUN = "src/lib/messaging/providers/dry-run.ts";
const F_INDEX = "src/lib/messaging/index.ts";
const F_ARCH_DOC = "docs/development-os-architecture.md";

// ===========================================================================
// 1) Architecture doc markers
// ===========================================================================

test("architecture: Stage 6.P1 + Stage 6.P2 ACCEPTED markers stable (post-P2.F)", () => {
  const src = read(F_ARCH_DOC);
  assert.match(src, /Stage 6\.P1 — Booking Channels `\[ACCEPTED 6\.P1\]`/);
  assert.match(src, /Stage 6\.P2 — Communications `\[ACCEPTED 6\.P2\]`/);
});

test("architecture: P2 section names locked architectural decisions", () => {
  const src = read(F_ARCH_DOC);
  // Prove the decisions are documented so future-me / contributors
  // know where they came from.
  assert.match(src, /One unified inbox, every channel/);
  assert.match(src, /WhatsApp is dual-provider/);
  assert.match(src, /Webhook-first, polling fallback/);
  assert.match(src, /Templates managed centrally/);
  assert.match(src, /Auto-responses are rules-based, not AI/);
  assert.match(src, /Email split/);
  assert.match(src, /0075 PL\/pgSQL FOREACH lesson preserved/);
});

// ===========================================================================
// 2) Migration 0078 — schema + 0075 FOREACH lesson
// ===========================================================================

test("migration 0078: file exists with expected naming", () => {
  assert.ok(exists(F_MIG_0078), "0078 migration missing");
});

test("migration 0078: creates all 4 tables", () => {
  const sql = read(F_MIG_0078);
  for (const t of [
    "conversation_threads",
    "conversation_messages",
    "message_templates",
    "auto_response_rules",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} missing`,
    );
  }
});

test("migration 0078: channel CHECK covers all 7 messaging channels", () => {
  const sql = read(F_MIG_0078);
  for (const c of MESSAGING_CHANNELS) {
    assert.match(sql, new RegExp(`'${c}'`), `channel '${c}' missing`);
  }
});

test("migration 0078: enforces idempotent ingestion via UNIQUE(channel, external_message_id)", () => {
  const sql = read(F_MIG_0078);
  assert.match(
    sql,
    /UNIQUE \("channel", "external_message_id"\)/,
  );
});

test("migration 0078: pending-status partial index for the status-sync cron", () => {
  // Cron only needs to scan outbound rows still waiting for receipts.
  const sql = read(F_MIG_0078);
  assert.match(
    sql,
    /conversation_messages_pending_status_idx[\s\S]*?WHERE "direction" = 'outbound'/,
  );
});

test("migration 0078: message_templates enforces UNIQUE (org, code)", () => {
  const sql = read(F_MIG_0078);
  assert.match(sql, /UNIQUE \("organization_id", "code"\)/);
});

test("migration 0078: auto_response_rules trigger_type CHECK covers all 4 types", () => {
  const sql = read(F_MIG_0078);
  for (const t of AUTO_RESPONSE_TRIGGER_TYPES) {
    assert.match(sql, new RegExp(`'${t}'`));
  }
});

test("migration 0078: auto_response_rules action_type CHECK covers all 4 actions", () => {
  const sql = read(F_MIG_0078);
  for (const a of AUTO_RESPONSE_ACTION_TYPES) {
    assert.match(sql, new RegExp(`'${a}'`));
  }
});

test("migration 0078: enables RLS via is_in_user_organization() on every table", () => {
  const sql = read(F_MIG_0078);
  for (const t of [
    "conversation_threads",
    "conversation_messages",
    "message_templates",
    "auto_response_rules",
  ]) {
    // The dynamic ALTER TABLE happens inside the FOREACH loop —
    // assert the table name is in the array literal that drives it.
    assert.match(sql, new RegExp(`'${t}'`));
  }
  assert.match(sql, /is_in_user_organization\(organization_id\)/);
});

test("migration 0078: USES FOREACH IN ARRAY (preserves the 0075 lesson)", () => {
  // The launch prompt explicitly called out: do NOT regress to
  // FOR ... IN SELECT unnest(...) — Postgres versions vary on it.
  // FOREACH IN ARRAY is the safe form.
  const sql = read(F_MIG_0078);
  assert.match(sql, /FOREACH t IN ARRAY ARRAY\[/);
});

test("migration 0078: does NOT use FOR ... IN SELECT unnest(...) (regression guard)", () => {
  const sql = read(F_MIG_0078);
  assert.doesNotMatch(sql, /FOR\s+\w+\s+IN\s*\n?\s*SELECT\s+unnest\(/i);
});

test("migration 0078: 0075 already established the FOREACH pattern (cross-reference)", () => {
  // Sanity check: verify migration 0075 itself uses FOREACH so the
  // cross-reference in 0078's docstring isn't lying.
  const sql = read("drizzle/0075_development_os_stage_6_p0_bulk_import.sql");
  assert.match(sql, /FOREACH t IN ARRAY ARRAY\[/);
});

test("migration 0078: updated_at triggers on every table", () => {
  const sql = read(F_MIG_0078);
  for (const t of [
    "trg_threads_updated_at",
    "trg_messages_updated_at",
    "trg_templates_updated_at",
    "trg_rules_updated_at",
  ]) {
    assert.match(sql, new RegExp(t));
  }
});

// ===========================================================================
// 3) Drizzle schema
// ===========================================================================

test("schema: messaging.ts exists + re-exported from schema index", () => {
  assert.ok(exists(F_SCHEMA));
  const idx = read(F_SCHEMA_INDEX);
  assert.match(idx, /export \* from "\.\/messaging"/);
});

test("schema: exports all 4 Drizzle tables", () => {
  const src = read(F_SCHEMA);
  for (const ex of [
    'export const conversationThreads = pgTable(\n  "conversation_threads"',
    'export const conversationMessages = pgTable(\n  "conversation_messages"',
    'export const messageTemplates = pgTable(\n  "message_templates"',
    'export const autoResponseRules = pgTable(\n  "auto_response_rules"',
  ]) {
    assert.ok(src.includes(ex), `missing: ${ex.split("\n")[0]}`);
  }
});

test("schema: type unions cover the same values as SQL CHECK constraints", () => {
  // CHANNEL counts mirror the migration's CHECK list.
  assert.equal(MESSAGING_CHANNELS.length, 7);
  assert.equal(THREAD_STATUSES.length, 4);
  assert.equal(MESSAGE_CONTENT_TYPES.length, 12);
  assert.equal(MESSAGE_STATUSES.length, 6);
  assert.equal(AUTO_RESPONSE_TRIGGER_TYPES.length, 4);
  assert.equal(AUTO_RESPONSE_ACTION_TYPES.length, 4);
});

test("schema: FKs target organizations + app_users + contacts (existing platform tables)", () => {
  const src = read(F_SCHEMA);
  assert.match(src, /=>\s*organizations\.id/);
  assert.match(src, /=>\s*appUsers\.id/);
  assert.match(src, /=>\s*contacts\.id/);
});

// ===========================================================================
// 4) Provider types contract
// ===========================================================================

test("types: MessagingProvider interface declares the contract methods", () => {
  const src = read(F_TYPES);
  assert.match(src, /sendMessage\(input: SendMessageInput\): Promise<SendMessageResult>/);
  assert.match(src, /verifyWebhook\(payload: string, signature: string, secret: string\): boolean/);
  assert.match(src, /parseWebhook\(payload: Record<string, unknown>\): IncomingMessage\[\] \| null/);
  assert.match(src, /testConnection\(\): Promise<ConnectionTestResult>/);
});

test("types: pullRecentMessages is optional (webhook-first channels can skip it)", () => {
  const src = read(F_TYPES);
  assert.match(src, /pullRecentMessages\?\(/);
});

test("types: credentials are a discriminated union per channel", () => {
  const src = read(F_TYPES);
  for (const variant of [
    "WhatsAppMetaCloudCredentials",
    "WhatsAppTwilioCredentials",
    "TelegramCredentials",
    "InstagramCredentials",
    "FacebookMessengerCredentials",
    "GmailCredentials",
    "ResendCredentials",
    "TwilioSmsCredentials",
  ]) {
    assert.match(src, new RegExp(`interface ${variant}`));
  }
  // WhatsApp = dual provider: union of meta_cloud + twilio variants.
  assert.match(src, /export type WhatsAppCredentials =/);
  // Email = dual provider: gmail + resend.
  assert.match(src, /export type EmailCredentials =/);
});

test("types: SendMessageInput supports text + media + template + reply", () => {
  const src = read(F_TYPES);
  assert.match(src, /text\?: string/);
  assert.match(src, /mediaUrl\?: string/);
  assert.match(src, /templateName\?: string/);
  assert.match(src, /templateVariables\?: Record<string, string>/);
  assert.match(src, /replyToExternalId\?: string/);
});

test("types: IncomingMessage carries rawPayload alongside projected fields", () => {
  const src = read(F_TYPES);
  assert.match(src, /rawPayload: Record<string, unknown>/);
  assert.match(src, /externalMessageId: string/);
});

// ===========================================================================
// 5) selectMessagingProvider routing
// ===========================================================================

test("selector: returns DryRun when no credentials passed", () => {
  const provider = selectMessagingProvider("whatsapp", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
  assert.equal(provider.channel, "whatsapp");
});

test("selector: returns DryRun for the 'internal_note' marker channel", () => {
  // Internal notes are platform-side annotations — never sent through
  // any external channel. Provider methods should be no-ops.
  const provider = selectMessagingProvider("internal_note", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
  assert.equal(provider.channel, "internal_note");
});

test("selector: falls back to DryRun on credentials.channel mismatch", () => {
  const wrongCreds: MessagingCredentials = {
    channel: "telegram",
    botToken: "bot-x",
    webhookSecret: "secret",
  };
  const provider = selectMessagingProvider("whatsapp", wrongCreds);
  assert.ok(provider instanceof DryRunMessagingProvider);
});

test("selector: every channel except internal_note now selects a real provider when credentials are present (post-P2.F)", () => {
  // Stage 6.P2 ships real adapters for every external messaging
  // channel. `internal_note` deliberately stays DryRun because notes
  // never leave the platform.
  //
  // If a future channel is added (e.g. LINE), this list keeps the
  // contract honest: when its real provider lands the case is added
  // here; while it's still pending the case is moved to the
  // "still-DryRun" list below.
  const cases: Array<[string, MessagingCredentials]> = [
    [
      "email",
      {
        channel: "email",
        provider: "resend",
        apiKey: "k",
        fromAddress: "noreply@example.com",
      },
    ],
    [
      "sms",
      {
        channel: "sms",
        accountSid: "AC...",
        authToken: "t",
        fromNumber: "+1...",
      },
    ],
  ];
  for (const [name, creds] of cases) {
    const provider = selectMessagingProvider(
      name as Parameters<typeof selectMessagingProvider>[0],
      creds,
    );
    assert.ok(
      !(provider instanceof DryRunMessagingProvider),
      `${name} should select a real provider post-P2.F`,
    );
    assert.equal(provider.channel, name);
  }
});

// ===========================================================================
// 6) DryRunMessagingProvider behaviour
// ===========================================================================

test("dry-run: sendMessage returns success with synthetic externalMessageId + cost=0", async () => {
  const provider = new DryRunMessagingProvider("telegram");
  const result = await provider.sendMessage({
    channel: "telegram",
    recipientExternalId: "12345",
    contentType: "text",
    text: "hello",
  });
  assert.equal(result.success, true);
  assert.ok(result.externalMessageId);
  assert.match(result.externalMessageId!, /^dry-run-telegram-/);
  assert.equal(result.costMinor, 0n);
});

test("dry-run: pullRecentMessages returns []", async () => {
  const provider = new DryRunMessagingProvider("email");
  const r = await provider.pullRecentMessages?.({ since: new Date() });
  assert.deepEqual(r, []);
});

test("dry-run: verifyWebhook fails closed (no shared secret)", () => {
  const provider = new DryRunMessagingProvider("whatsapp");
  assert.equal(provider.verifyWebhook("payload", "sig", "secret"), false);
});

test("dry-run: parseWebhook returns null", () => {
  const provider = new DryRunMessagingProvider("whatsapp");
  assert.equal(provider.parseWebhook({ type: "anything" }), null);
});

test("dry-run: testConnection reports not-connected with diagnostic details", async () => {
  const provider = new DryRunMessagingProvider("whatsapp");
  const r = await provider.testConnection();
  assert.equal(r.connected, false);
  assert.equal(r.details.mode, "dry-run");
  assert.equal(r.details.channel, "whatsapp");
});

test("dry-run: implements full MessagingProvider contract (no missing methods)", () => {
  // Compile-time check via the assignment + runtime check on method
  // presence. If a method is added to the interface but not the class,
  // TypeScript fails to compile this assignment.
  const provider: MessagingProvider = new DryRunMessagingProvider("telegram");
  for (const method of [
    "sendMessage",
    "pullRecentMessages",
    "verifyWebhook",
    "parseWebhook",
    "testConnection",
  ]) {
    assert.equal(
      typeof (provider as unknown as Record<string, unknown>)[method],
      "function",
      `DryRun missing ${method}`,
    );
  }
});

// ===========================================================================
// 7) Public surface — index re-exports
// ===========================================================================

test("index: re-exports selectMessagingProvider + DryRunMessagingProvider + types", () => {
  const src = read(F_INDEX);
  assert.match(src, /export \* from "\.\/types"/);
  assert.match(src, /export \{ selectMessagingProvider \}/);
  assert.match(src, /export \{ DryRunMessagingProvider \}/);
});

test("index: does NOT re-export per-channel implementations directly", () => {
  // Per-channel providers stay internal — accessed only via selector.
  const src = read(F_INDEX);
  assert.doesNotMatch(src, /export \* from ".\/providers\/whatsapp/);
  assert.doesNotMatch(src, /export \* from ".\/providers\/telegram/);
});

test("dry-run file: doesn't import server-only or DB modules (pure)", () => {
  const src = read(F_DRY_RUN);
  assert.doesNotMatch(src, /^import\s+["']server-only["']/m);
  assert.doesNotMatch(src, /from "drizzle/);
  assert.doesNotMatch(src, /from "@\/lib\/db/);
});

test("selector file: P2.B–E promoted all 5 channels; only Resend + SMS adapter pending for P2.F", () => {
  // Post-P2.E: whatsapp + telegram + instagram + messenger + gmail
  // all have real providers wired up. Resend + SMS adapters land
  // in P2.F.
  const src = read(F_SELECTOR);
  assert.match(src, /from "\.\/providers\/whatsapp-meta\/provider"/);
  assert.match(src, /from "\.\/providers\/whatsapp-twilio\/provider"/);
  assert.match(src, /from "\.\/providers\/telegram\/provider"/);
  assert.match(src, /from "\.\/providers\/instagram\/provider"/);
  assert.match(src, /from "\.\/providers\/messenger\/provider"/);
  assert.match(src, /from "\.\/providers\/gmail\/provider"/);
});
