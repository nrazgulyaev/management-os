/**
 * Stage 6.P2.C — Telegram Bot provider tests.
 *
 * Covers:
 *   - TelegramClient (botApiBase, sendMessage/sendPhoto/sendDocument
 *     payload shape, undefined-stripping, setWebhook, getMe/getUpdates,
 *     retry envelope)
 *   - TelegramProvider sendMessage routing (text + photo + document +
 *     audio + video + template_message + missing media error)
 *   - verifyWebhook constant-time secret-token compare
 *   - parseWebhook for message / edited_message / callback_query and
 *     all media variants (text, photo, document, audio/voice, video,
 *     sticker, location, contact, reply_to context)
 *   - testConnection success/failure paths
 *   - Selector dispatch
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { TelegramClient } from "../src/lib/messaging/providers/telegram/client";
import { TelegramProvider } from "../src/lib/messaging/providers/telegram/provider";
import {
  selectMessagingProvider,
  DryRunMessagingProvider,
} from "../src/lib/messaging";
import type { MessagingCredentials } from "../src/lib/messaging";

// ===========================================================================
// Helpers
// ===========================================================================

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    return handler(typeof url === "string" ? url : url.toString(), init);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TG_CREDS = {
  channel: "telegram" as const,
  botToken: "1234567890:ABCdefGHIjklmnoPQRstuvWXYZ",
  webhookSecret: "tg-webhook-secret-token",
};

// ===========================================================================
// 1) TelegramClient
// ===========================================================================

test("client: botApiBase embeds the bot token (sensitive — never log)", () => {
  const c = new TelegramClient(TG_CREDS);
  assert.ok(c.botApiBase.includes(TG_CREDS.botToken));
  assert.ok(c.botApiBase.endsWith(`/bot${TG_CREDS.botToken}`));
});

test("client: sendMessage POSTs JSON body with chat_id + text", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const c = new TelegramClient(TG_CREDS, {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ ok: true, result: { message_id: 42 } });
    }),
    backoffBaseMs: 1,
  });
  await c.sendMessage({ chatId: 12345, text: "hello" });
  assert.match(captured.url ?? "", /\/sendMessage$/);
  const body = JSON.parse((captured.init?.body as string) ?? "{}");
  assert.equal(body.chat_id, 12345);
  assert.equal(body.text, "hello");
});

test("client: sendMessage strips undefined fields (Telegram parser rejects them)", async () => {
  let body: Record<string, unknown> = {};
  const c = new TelegramClient(TG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  await c.sendMessage({ chatId: 1, text: "x" });
  assert.equal("parse_mode" in body, false);
  assert.equal("reply_to_message_id" in body, false);
});

test("client: sendPhoto + sendDocument routes correctly", async () => {
  const seen: string[] = [];
  const c = new TelegramClient(TG_CREDS, {
    fetch: mockFetch((url) => {
      seen.push(url);
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  await c.sendPhoto({ chatId: 1, photoUrl: "https://x" });
  await c.sendDocument({ chatId: 1, documentUrl: "https://y" });
  assert.match(seen[0], /\/sendPhoto$/);
  assert.match(seen[1], /\/sendDocument$/);
});

test("client: setWebhook posts url + secret_token + allowed_updates defaults", async () => {
  let body: Record<string, unknown> = {};
  const c = new TelegramClient(TG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ ok: true, result: true });
    }),
    backoffBaseMs: 1,
  });
  await c.setWebhook({ webhookUrl: "https://example.com/wh" });
  assert.equal(body.url, "https://example.com/wh");
  assert.equal(body.secret_token, TG_CREDS.webhookSecret);
  assert.deepEqual(body.allowed_updates, [
    "message",
    "edited_message",
    "callback_query",
  ]);
});

test("client: getMe is a GET (not POST)", async () => {
  let methodSeen = "";
  const c = new TelegramClient(TG_CREDS, {
    fetch: mockFetch((_, init) => {
      methodSeen = init?.method ?? "";
      return jsonResponse({ ok: true, result: { id: 1, username: "bot" } });
    }),
    backoffBaseMs: 1,
  });
  await c.getMe();
  assert.equal(methodSeen, "GET");
});

test("client: getUpdates passes offset + limit + timeout as query params", async () => {
  let urlSeen = "";
  const c = new TelegramClient(TG_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ ok: true, result: [] });
    }),
    backoffBaseMs: 1,
  });
  await c.getUpdates({ offset: 100, limit: 50, timeout: 30 });
  assert.match(urlSeen, /offset=100/);
  assert.match(urlSeen, /limit=50/);
  assert.match(urlSeen, /timeout=30/);
});

test("client: 429 retries via shared envelope", async () => {
  let calls = 0;
  const c = new TelegramClient(TG_CREDS, {
    fetch: mockFetch(() => {
      calls++;
      if (calls < 3)
        return new Response("Retry-After: 1", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
    maxRetries: 3,
  });
  const res = await c.sendMessage({ chatId: 1, text: "x" });
  assert.equal(res.status, 200);
  assert.equal(calls, 3);
});

// ===========================================================================
// 2) TelegramProvider — sendMessage routing
// ===========================================================================

test("provider: implements MessagingProvider contract", () => {
  const p = new TelegramProvider(TG_CREDS);
  for (const m of [
    "sendMessage",
    "verifyWebhook",
    "parseWebhook",
    "testConnection",
  ]) {
    assert.equal(
      typeof (p as unknown as Record<string, unknown>)[m],
      "function",
    );
  }
  assert.equal(p.channel, "telegram");
});

test("provider: sendMessage text — success returns externalMessageId + cost=0", async () => {
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch(() => jsonResponse({ ok: true, result: { message_id: 99 } })),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "12345",
    contentType: "text",
    text: "hi",
  });
  assert.equal(r.success, true);
  assert.equal(r.externalMessageId, "99");
  // Telegram = free per-message (explicit zero, not undefined).
  assert.equal(r.costMinor, 0n);
  assert.equal(r.costCurrency, "USD");
});

test("provider: sendMessage parses numeric chat IDs as numbers (Telegram type rule)", async () => {
  let body: Record<string, unknown> = {};
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "-12345",
    contentType: "text",
    text: "x",
  });
  assert.equal(typeof body.chat_id, "number");
  assert.equal(body.chat_id, -12345);
});

test("provider: sendMessage keeps non-numeric chat IDs as strings (channel @username)", async () => {
  let body: Record<string, unknown> = {};
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "@arconique_bookings",
    contentType: "text",
    text: "x",
  });
  assert.equal(body.chat_id, "@arconique_bookings");
});

test("provider: image content type → sendPhoto with caption from text field", async () => {
  let urlSeen = "";
  let body: Record<string, unknown> = {};
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch((url, init) => {
      urlSeen = url;
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "1",
    contentType: "image",
    mediaUrl: "https://example.com/x.jpg",
    text: "look at this",
  });
  assert.match(urlSeen, /\/sendPhoto$/);
  assert.equal(body.photo, "https://example.com/x.jpg");
  assert.equal(body.caption, "look at this");
});

test("provider: document/audio/video routes to the right Telegram endpoint", async () => {
  const seen: string[] = [];
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch((url) => {
      seen.push(url);
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  for (const [type, urlPart] of [
    ["document", "/sendDocument"],
    ["audio", "/sendAudio"],
    ["video", "/sendVideo"],
  ] as const) {
    await p.sendMessage({
      channel: "telegram",
      recipientExternalId: "1",
      contentType: type,
      mediaUrl: "https://example.com/x",
    });
    assert.match(seen[seen.length - 1], new RegExp(urlPart + "$"));
  }
});

test("provider: media types reject when mediaUrl missing", async () => {
  const p = new TelegramProvider(TG_CREDS);
  for (const t of ["image", "document", "audio", "video"] as const) {
    const r = await p.sendMessage({
      channel: "telegram",
      recipientExternalId: "1",
      contentType: t,
    });
    assert.equal(r.success, false);
    assert.match(r.error ?? "", /mediaUrl required/);
  }
});

test("provider: text reject when text missing", async () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "1",
    contentType: "text",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /text required/);
});

test("provider: template_message rejects (Telegram has no template surface)", async () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "1",
    contentType: "template_message",
    templateName: "any",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /no template surface/);
});

test("provider: replyToExternalId becomes reply_to_message_id (numeric)", async () => {
  let body: Record<string, unknown> = {};
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "1",
    contentType: "text",
    text: "x",
    replyToExternalId: "42",
  });
  assert.equal(body.reply_to_message_id, 42);
});

test("provider: callback-query synthetic IDs (cbq:...) are NOT treated as message_ids for reply", async () => {
  let body: Record<string, unknown> = {};
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ ok: true, result: { message_id: 1 } });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "1",
    contentType: "text",
    text: "x",
    replyToExternalId: "cbq:abc-id",
  });
  // undefined gets stripped — assert it's not present at all.
  assert.equal("reply_to_message_id" in body, false);
});

test("provider: non-2xx returns failure with truncated body", async () => {
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch(
      () =>
        new Response(
          JSON.stringify({ ok: false, description: "chat not found" }),
          { status: 400 },
        ),
    ),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "1",
    contentType: "text",
    text: "x",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /HTTP 400/);
});

test("provider: thrown network error degrades to failure SyncResult", async () => {
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch(() => {
      throw new Error("DNS down");
    }),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const r = await p.sendMessage({
    channel: "telegram",
    recipientExternalId: "1",
    contentType: "text",
    text: "x",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /DNS down|after 1 attempts/);
});

// ===========================================================================
// 3) verifyWebhook — secret-token constant-time compare
// ===========================================================================

test("webhook verify: matching secret token returns true", () => {
  const p = new TelegramProvider(TG_CREDS);
  assert.equal(
    p.verifyWebhook("any-payload", TG_CREDS.webhookSecret, TG_CREDS.webhookSecret),
    true,
  );
});

test("webhook verify: mismatched secret rejects (constant-time)", () => {
  const p = new TelegramProvider(TG_CREDS);
  assert.equal(
    p.verifyWebhook(
      "any",
      "wrong-secret-with-same-length-pad",
      TG_CREDS.webhookSecret,
    ),
    false,
  );
});

test("webhook verify: missing inputs reject", () => {
  const p = new TelegramProvider(TG_CREDS);
  assert.equal(p.verifyWebhook("p", "", "secret"), false);
  assert.equal(p.verifyWebhook("p", "sig", ""), false);
});

test("webhook verify: different-length signature rejects without crypto call", () => {
  const p = new TelegramProvider(TG_CREDS);
  // timingSafeEqual would throw on length mismatch — we short-circuit
  // first to avoid that path.
  assert.equal(p.verifyWebhook("p", "short", "much-longer-secret"), false);
});

// ===========================================================================
// 4) parseWebhook — message / edited_message / callback_query
// ===========================================================================

test("parse: text message — projects all key fields", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 42,
      from: {
        id: 12345,
        first_name: "Alice",
        last_name: "Tester",
        username: "alice",
      },
      chat: { id: 12345, type: "private" },
      date: 1700000000,
      text: "hello bot",
    },
  });
  assert.ok(r);
  assert.equal(r!.length, 1);
  const m = r![0];
  assert.equal(m.channel, "telegram");
  assert.equal(m.externalMessageId, "42");
  assert.equal(m.externalThreadId, "12345");
  assert.equal(m.senderExternalId, "12345");
  // username takes precedence over first_name+last_name.
  assert.equal(m.senderDisplayName, "alice");
  assert.equal(m.contentType, "text");
  assert.equal(m.contentText, "hello bot");
  assert.equal(m.receivedAt.toISOString(), new Date(1700000000 * 1000).toISOString());
});

test("parse: senderDisplayName falls back to first+last when username missing", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 1, first_name: "Bob", last_name: "Smith" },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      text: "x",
    },
  });
  assert.equal(r![0].senderDisplayName, "Bob Smith");
});

test("parse: photo message → contentType 'image' with largest fileId in metadata", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      caption: "look",
      photo: [
        { file_id: "small-f", width: 90 },
        { file_id: "med-f", width: 320 },
        { file_id: "large-f", width: 1280 },
      ],
    },
  });
  const m = r![0];
  assert.equal(m.contentType, "image");
  assert.equal(m.contentText, "look");
  assert.equal(m.contentMetadata?.fileId, "large-f");
  assert.equal(m.contentMetadata?.mediaSizes, 3);
});

test("parse: document → fileId + fileName + mimeType in metadata", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      document: {
        file_id: "doc-1",
        file_name: "passport.pdf",
        mime_type: "application/pdf",
      },
    },
  });
  const m = r![0];
  assert.equal(m.contentType, "document");
  assert.equal(m.contentMetadata?.fileId, "doc-1");
  assert.equal(m.contentMetadata?.fileName, "passport.pdf");
  assert.equal(m.contentMetadata?.mimeType, "application/pdf");
});

test("parse: voice message → audio content type", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      voice: { file_id: "v1", mime_type: "audio/ogg", duration: 12 },
    },
  });
  assert.equal(r![0].contentType, "audio");
  assert.equal(r![0].contentMetadata?.duration, 12);
});

test("parse: video / video_note → video content type", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r1 = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      video: { file_id: "v1", mime_type: "video/mp4", duration: 5 },
    },
  });
  assert.equal(r1![0].contentType, "video");
  const r2 = p.parseWebhook({
    update_id: 2,
    message: {
      message_id: 2,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      video_note: { file_id: "vn1", duration: 3 },
    },
  });
  assert.equal(r2![0].contentType, "video");
});

test("parse: sticker → sticker content type with emoji + setName", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      sticker: { file_id: "s1", emoji: "👋", set_name: "GreetingsPack" },
    },
  });
  const m = r![0];
  assert.equal(m.contentType, "sticker");
  assert.equal(m.contentMetadata?.emoji, "👋");
  assert.equal(m.contentMetadata?.setName, "GreetingsPack");
});

test("parse: location → coordinates in metadata", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      location: { latitude: -8.4095, longitude: 115.1889 },
    },
  });
  const m = r![0];
  assert.equal(m.contentType, "location");
  assert.equal(m.contentMetadata?.latitude, -8.4095);
});

test("parse: reply_to_message captures replyToExternalId", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    message: {
      message_id: 99,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      text: "thanks",
      reply_to_message: { message_id: 50, chat: { id: 1 }, text: "earlier" },
    },
  });
  assert.equal(r![0].replyToExternalId, "50");
});

test("parse: edited_message gets contentMetadata.edited = true", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    edited_message: {
      message_id: 42,
      from: { id: 1 },
      chat: { id: 1, type: "private" },
      date: 1700000000,
      text: "edited text",
    },
  });
  assert.equal(r![0].contentMetadata?.edited, true);
});

test("parse: callback_query → reply content type with callback data in metadata", () => {
  const p = new TelegramProvider(TG_CREDS);
  const r = p.parseWebhook({
    update_id: 1,
    callback_query: {
      id: "abc-callback-id",
      from: { id: 1, username: "alice" },
      message: { message_id: 50, chat: { id: 1, type: "private" }, date: 1700000000 },
      data: "confirm_booking",
    },
  });
  assert.ok(r);
  const m = r![0];
  // Synthetic external ID prefixed with cbq: to avoid collision with
  // regular messages on the unique (channel, external_message_id) key.
  assert.equal(m.externalMessageId, "cbq:abc-callback-id");
  assert.equal(m.contentType, "reply");
  assert.equal(m.contentText, "confirm_booking");
  assert.equal(m.contentMetadata?.callbackQueryId, "abc-callback-id");
  assert.equal(m.contentMetadata?.sourceMessageId, 50);
});

test("parse: returns null for unknown update types (channel_post, inline_query)", () => {
  const p = new TelegramProvider(TG_CREDS);
  assert.equal(
    p.parseWebhook({ update_id: 1, channel_post: { message_id: 1 } }),
    null,
  );
  assert.equal(
    p.parseWebhook({ update_id: 1, inline_query: { id: "x" } }),
    null,
  );
});

test("parse: returns null for malformed payloads (missing update_id)", () => {
  const p = new TelegramProvider(TG_CREDS);
  assert.equal(p.parseWebhook({}), null);
  assert.equal(p.parseWebhook({ message: { message_id: 1 } }), null);
});

test("parse: returns null when message is missing required fields", () => {
  const p = new TelegramProvider(TG_CREDS);
  // No chat / from
  assert.equal(
    p.parseWebhook({ update_id: 1, message: { message_id: 1 } }),
    null,
  );
});

// ===========================================================================
// 5) testConnection
// ===========================================================================

test("testConnection: success path reports bot username + first_name", async () => {
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch(() =>
      jsonResponse({
        ok: true,
        result: { id: 999, username: "ArconiqueBot", first_name: "Arconique" },
      }),
    ),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details.botUsername, "ArconiqueBot");
  assert.equal(r.details.botFirstName, "Arconique");
  assert.equal(r.details.botId, 999);
});

test("testConnection: ok=false in 200 body still reports connected:false", async () => {
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch(() =>
      jsonResponse({ ok: false, description: "Unauthorized" }),
    ),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, false);
});

test("testConnection: network error → connected:false with error details", async () => {
  const p = new TelegramProvider(TG_CREDS, {
    fetch: mockFetch(() => {
      throw new Error("DNS down");
    }),
    backoffBaseMs: 1,
    maxRetries: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, false);
  assert.match(String(r.details.error), /DNS down|after 1 attempts/);
});

// ===========================================================================
// 6) Selector dispatch
// ===========================================================================

test("selector: telegram + creds returns TelegramProvider", () => {
  const provider = selectMessagingProvider("telegram", TG_CREDS);
  assert.ok(provider instanceof TelegramProvider);
  assert.ok(!(provider instanceof DryRunMessagingProvider));
});

test("selector: telegram without creds falls back to DryRun", () => {
  const provider = selectMessagingProvider("telegram", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
  assert.equal(provider.channel, "telegram");
});

test("selector: telegram with mismatched creds.channel → DryRun", () => {
  const wrong: MessagingCredentials = {
    channel: "sms",
    accountSid: "AC",
    authToken: "t",
    fromNumber: "+1",
  };
  const provider = selectMessagingProvider("telegram", wrong);
  assert.ok(provider instanceof DryRunMessagingProvider);
});
