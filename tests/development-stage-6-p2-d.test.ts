/**
 * Stage 6.P2.D — Instagram + Facebook Messenger provider tests.
 *
 * Both share Meta Graph API + the shared HMAC verifier from P1.D
 * (`provider-helpers.ts`), so these tests verify:
 *   - Per-channel client methods (auth header, endpoint routing,
 *     payload shape, retry envelope reuse)
 *   - Per-channel parsers (full event-type coverage incl. comments
 *     for IG and postback/quick_reply/referral/read for Messenger)
 *   - Per-channel providers (sendMessage routing, verifyWebhook via
 *     the shared helper, parseWebhook returning null for status-only)
 *   - Selector dispatch
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { InstagramClient } from "../src/lib/messaging/providers/instagram/client";
import { parseInstagramWebhook } from "../src/lib/messaging/providers/instagram/parsers";
import { InstagramProvider } from "../src/lib/messaging/providers/instagram/provider";

import { MessengerClient } from "../src/lib/messaging/providers/messenger/client";
import { parseMessengerWebhook } from "../src/lib/messaging/providers/messenger/parsers";
import { MessengerProvider } from "../src/lib/messaging/providers/messenger/provider";

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

const IG_CREDS = {
  channel: "instagram" as const,
  pageAccessToken: "EAAxxxx",
  instagramBusinessAccountId: "1784300000000000",
  facebookPageId: "100000000000000",
  appSecret: "ig-app-secret-32chars-or-more-padding",
  webhookVerifyToken: "ig-verify",
};

const MSG_CREDS = {
  channel: "facebook_messenger" as const,
  pageAccessToken: "EAAyyyy",
  facebookPageId: "100000000000000",
  appSecret: "msg-app-secret-32chars-or-more-padding",
  webhookVerifyToken: "msg-verify",
};

// ===========================================================================
// 1) Instagram client
// ===========================================================================

test("ig client: authHeader is 'Bearer <pageAccessToken>'", () => {
  const c = new InstagramClient(IG_CREDS);
  assert.equal(c.authHeader, "Bearer EAAxxxx");
});

test("ig client: sendDirectMessage POSTs to /{ig_business_account_id}/messages", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const c = new InstagramClient(IG_CREDS, {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({
        recipient_id: "999",
        message_id: "m_xxx",
      });
    }),
    backoffBaseMs: 1,
  });
  await c.sendDirectMessage({ recipientId: "999", text: "hi" });
  assert.match(
    captured.url ?? "",
    /\/1784300000000000\/messages$/,
  );
  const body = JSON.parse((captured.init?.body as string) ?? "{}");
  const recipient = body.recipient as Record<string, unknown>;
  assert.equal(recipient.id, "999");
  const message = body.message as Record<string, unknown>;
  assert.equal(message.text, "hi");
});

test("ig client: sendDirectMessage with imageUrl sends attachment payload", async () => {
  let body: Record<string, unknown> = {};
  const c = new InstagramClient(IG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ message_id: "m" });
    }),
    backoffBaseMs: 1,
  });
  await c.sendDirectMessage({
    recipientId: "999",
    imageUrl: "https://example.com/x.jpg",
  });
  const message = body.message as Record<string, unknown>;
  const attachment = message.attachment as Record<string, unknown>;
  assert.equal(attachment.type, "image");
  const payload = attachment.payload as Record<string, unknown>;
  assert.equal(payload.url, "https://example.com/x.jpg");
});

test("ig client: replyToComment posts to /{commentId}/replies", async () => {
  let urlSeen = "";
  const c = new InstagramClient(IG_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ id: "reply-1" });
    }),
    backoffBaseMs: 1,
  });
  await c.replyToComment({ commentId: "comment-42", message: "thanks!" });
  assert.match(urlSeen, /\/comment-42\/replies$/);
});

test("ig client: getMe is a GET (auth ping)", async () => {
  let methodSeen = "";
  let urlSeen = "";
  const c = new InstagramClient(IG_CREDS, {
    fetch: mockFetch((url, init) => {
      methodSeen = init?.method ?? "";
      urlSeen = url;
      return jsonResponse({ id: "100", name: "Arconique Villa" });
    }),
    backoffBaseMs: 1,
  });
  await c.getMe();
  assert.equal(methodSeen, "GET");
  assert.match(urlSeen, /\/me\?/);
});

// ===========================================================================
// 2) Instagram parsers
// ===========================================================================

test("ig parser: text DM → IncomingMessage with sender id as threadId", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        id: "ig-biz",
        time: 1700000000,
        messaging: [
          {
            sender: { id: "user-123" },
            recipient: { id: "ig-biz" },
            timestamp: 1700000000,
            message: { mid: "ig-mid-1", text: "hello business" },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages.length, 1);
  const m = r.messages[0];
  assert.equal(m.channel, "instagram");
  assert.equal(m.externalMessageId, "ig-mid-1");
  assert.equal(m.externalThreadId, "user-123");
  assert.equal(m.senderExternalId, "user-123");
  assert.equal(m.contentType, "text");
  assert.equal(m.contentText, "hello business");
});

test("ig parser: image attachment → contentType 'image' with mediaUrl", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "u" },
            recipient: { id: "biz" },
            timestamp: 1700000000,
            message: {
              mid: "ig-mid-2",
              attachments: [
                { type: "image", payload: { url: "https://cdn.fb/x.jpg" } },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentType, "image");
  assert.equal(r.messages[0].contentMediaUrl, "https://cdn.fb/x.jpg");
});

test("ig parser: story_mention attachment → contentType 'system' with kind", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "u" },
            recipient: { id: "biz" },
            timestamp: 1700000000,
            message: {
              mid: "ig-mid-3",
              attachments: [{ type: "story_mention", payload: {} }],
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentType, "system");
  assert.equal(r.messages[0].contentMetadata?.kind, "story_mention");
});

test("ig parser: reply_to.mid → replyToExternalId", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "u" },
            recipient: { id: "biz" },
            timestamp: 1700000000,
            message: {
              mid: "ig-mid-4",
              text: "yes!",
              reply_to: { mid: "ig-mid-prev" },
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].replyToExternalId, "ig-mid-prev");
});

test("ig parser: is_echo on outbound echo → contentMetadata.echo=true", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "biz" },
            recipient: { id: "u" },
            timestamp: 1700000000,
            message: { mid: "ig-mid-5", text: "auto-reply", is_echo: true },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentMetadata?.echo, true);
});

test("ig parser: postback (Ice Breaker click) → reply content type with payload", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "u" },
            recipient: { id: "biz" },
            timestamp: 1700000000,
            postback: {
              mid: "pb-1",
              title: "What's the price?",
              payload: "ICE_BREAKER_PRICE",
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentType, "reply");
  assert.equal(r.messages[0].contentText, "What's the price?");
  assert.equal(r.messages[0].contentMetadata?.payload, "ICE_BREAKER_PRICE");
  assert.equal(r.messages[0].contentMetadata?.source, "postback");
});

test("ig parser: reaction split off into result.reactions (not messages)", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "u" },
            recipient: { id: "biz" },
            timestamp: 1700000050,
            reaction: { mid: "ig-mid-1", action: "react", emoji: "❤️" },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages.length, 0);
  assert.equal(r.reactions.length, 1);
  const reaction = r.reactions[0];
  assert.equal(reaction.targetExternalMessageId, "ig-mid-1");
  assert.equal(reaction.action, "react");
  assert.equal(reaction.emoji, "❤️");
});

test("ig parser: comment via changes[].field='comments' → message with comment: prefix", () => {
  const r = parseInstagramWebhook({
    object: "instagram",
    entry: [
      {
        changes: [
          {
            field: "comments",
            value: {
              id: "comment-99",
              text: "Looks great!",
              from: { id: "user-456", username: "alice" },
              media: {
                id: "media-22",
                media_product_type: "FEED",
              },
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages.length, 1);
  const m = r.messages[0];
  assert.equal(m.externalMessageId, "comment:comment-99");
  assert.equal(m.externalThreadId, "media:media-22");
  assert.equal(m.senderDisplayName, "alice");
  assert.equal(m.contentText, "Looks great!");
  assert.equal(m.contentMetadata?.kind, "comment");
});

test("ig parser: rejects payloads where object != 'instagram'", () => {
  const r = parseInstagramWebhook({
    object: "page", // Messenger, not IG
    entry: [{ messaging: [{ sender: { id: "u" } }] }],
  });
  assert.deepEqual(r, { messages: [], reactions: [] });
});

// ===========================================================================
// 3) Instagram provider
// ===========================================================================

test("ig provider: sendMessage text — success extracts message_id", async () => {
  const p = new InstagramProvider(IG_CREDS, {
    fetch: mockFetch(() =>
      jsonResponse({ recipient_id: "999", message_id: "m-out-1" }),
    ),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "instagram",
    recipientExternalId: "999",
    contentType: "text",
    text: "hi",
  });
  assert.equal(r.success, true);
  assert.equal(r.externalMessageId, "m-out-1");
});

test("ig provider: sendMessage with replyToExternalId='comment:X' routes to comment-reply endpoint", async () => {
  let urlSeen = "";
  const p = new InstagramProvider(IG_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ id: "reply-1" });
    }),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "instagram",
    recipientExternalId: "media-22", // not used for comment-reply path
    contentType: "text",
    text: "thanks!",
    replyToExternalId: "comment:comment-99",
  });
  assert.equal(r.success, true);
  assert.match(urlSeen, /\/comment-99\/replies$/);
});

test("ig provider: sendMessage image without mediaUrl rejects synchronously", async () => {
  // Inject a fetch that throws so any accidental real-network call
  // surfaces as a test failure rather than hitting Meta's servers.
  const p = new InstagramProvider(IG_CREDS, {
    fetch: mockFetch(() => {
      throw new Error("should not call Meta — validation must reject first");
    }),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "instagram",
    recipientExternalId: "999",
    contentType: "image",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /mediaUrl required/);
});

test("ig provider: non-2xx response degrades to failure with truncated body", async () => {
  const p = new InstagramProvider(IG_CREDS, {
    fetch: mockFetch(() =>
      new Response(
        JSON.stringify({ error: { message: "Invalid recipient", code: 100 } }),
        { status: 400 },
      ),
    ),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "instagram",
    recipientExternalId: "999",
    contentType: "text",
    text: "x",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /HTTP 400/);
});

test("ig provider: verifyWebhook accepts valid HMAC-SHA256 (sha256= prefix)", () => {
  const p = new InstagramProvider(IG_CREDS);
  const payload = '{"object":"instagram"}';
  const sig =
    "sha256=" +
    createHmac("sha256", IG_CREDS.appSecret).update(payload).digest("hex");
  assert.equal(p.verifyWebhook(payload, sig, ""), true);
});

test("ig provider: verifyWebhook rejects bad signature", () => {
  const p = new InstagramProvider(IG_CREDS);
  assert.equal(
    p.verifyWebhook('{"x":1}', "sha256=" + "0".repeat(64), ""),
    false,
  );
});

test("ig provider: parseWebhook returns null when only reactions present", () => {
  const p = new InstagramProvider(IG_CREDS);
  const r = p.parseWebhook({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "u" },
            recipient: { id: "biz" },
            timestamp: 1700000000,
            reaction: { mid: "x", action: "react", emoji: "❤️" },
          },
        ],
      },
    ],
  });
  assert.equal(r, null);
});

test("ig provider: testConnection success path captures pageName", async () => {
  const p = new InstagramProvider(IG_CREDS, {
    fetch: mockFetch(() => jsonResponse({ id: "ig-biz", name: "Arconique" })),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details.pageName, "Arconique");
});

test("ig provider: testConnection failure path", async () => {
  const p = new InstagramProvider(IG_CREDS, {
    fetch: mockFetch(() => new Response("denied", { status: 401 })),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, false);
  assert.equal(r.details.status, 401);
});

// ===========================================================================
// 4) Messenger client
// ===========================================================================

test("msg client: authHeader is 'Bearer <pageAccessToken>'", () => {
  const c = new MessengerClient(MSG_CREDS);
  assert.equal(c.authHeader, "Bearer EAAyyyy");
});

test("msg client: sendText posts /me/messages with messaging_type=RESPONSE", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const c = new MessengerClient(MSG_CREDS, {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ recipient_id: "PSID", message_id: "m-1" });
    }),
    backoffBaseMs: 1,
  });
  await c.sendText({ recipientId: "PSID", text: "hello" });
  assert.match(captured.url ?? "", /\/me\/messages$/);
  const body = JSON.parse((captured.init?.body as string) ?? "{}");
  assert.equal(body.messaging_type, "RESPONSE");
  const recipient = body.recipient as Record<string, unknown>;
  assert.equal(recipient.id, "PSID");
});

test("msg client: sendText with quickReplies emits quick_replies array", async () => {
  let body: Record<string, unknown> = {};
  const c = new MessengerClient(MSG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ message_id: "m" });
    }),
    backoffBaseMs: 1,
  });
  await c.sendText({
    recipientId: "PSID",
    text: "Choose:",
    quickReplies: [
      { contentType: "text", title: "Yes", payload: "Y" },
      { contentType: "text", title: "No", payload: "N" },
    ],
  });
  const message = body.message as Record<string, unknown>;
  const quickReplies = message.quick_replies as Array<Record<string, unknown>>;
  assert.equal(quickReplies.length, 2);
  assert.equal(quickReplies[0].title, "Yes");
  assert.equal(quickReplies[0].content_type, "text");
});

test("msg client: tag triggers messaging_type=MESSAGE_TAG", async () => {
  let body: Record<string, unknown> = {};
  const c = new MessengerClient(MSG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ message_id: "m" });
    }),
    backoffBaseMs: 1,
  });
  await c.sendText({ recipientId: "PSID", text: "x", tag: "HUMAN_AGENT" });
  assert.equal(body.messaging_type, "MESSAGE_TAG");
  assert.equal(body.tag, "HUMAN_AGENT");
});

test("msg client: sendButtonTemplate emits attachment.type='template'", async () => {
  let body: Record<string, unknown> = {};
  const c = new MessengerClient(MSG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ message_id: "m" });
    }),
    backoffBaseMs: 1,
  });
  await c.sendButtonTemplate({
    recipientId: "PSID",
    template: {
      text: "Continue?",
      buttons: [{ type: "postback", title: "Yes", payload: "YES" }],
    },
  });
  const message = body.message as Record<string, unknown>;
  const attachment = message.attachment as Record<string, unknown>;
  assert.equal(attachment.type, "template");
  const payload = attachment.payload as Record<string, unknown>;
  assert.equal(payload.template_type, "button");
  assert.equal(payload.text, "Continue?");
});

test("msg client: setMessengerProfile posts profile fields", async () => {
  let body: Record<string, unknown> = {};
  const c = new MessengerClient(MSG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ result: "success" });
    }),
    backoffBaseMs: 1,
  });
  await c.setMessengerProfile({ getStarted: { payload: "GET_STARTED" } });
  const getStarted = body.get_started as Record<string, unknown>;
  assert.equal(getStarted.payload, "GET_STARTED");
});

test("msg client: getPageInfo is a GET on /me with fields", async () => {
  let urlSeen = "";
  const c = new MessengerClient(MSG_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ id: "page", name: "Arconique" });
    }),
    backoffBaseMs: 1,
  });
  await c.getPageInfo();
  assert.match(urlSeen, /\/me\?fields=id,name,category$/);
});

// ===========================================================================
// 5) Messenger parsers
// ===========================================================================

test("msg parser: text message → IncomingMessage with PSID as threadId", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000000,
            message: { mid: "msg-1", text: "hi" },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages.length, 1);
  const m = r.messages[0];
  assert.equal(m.channel, "facebook_messenger");
  assert.equal(m.externalThreadId, "PSID-1");
  assert.equal(m.contentText, "hi");
});

test("msg parser: quick_reply selection → reply content type with payload", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000000,
            message: {
              mid: "msg-2",
              text: "Yes",
              quick_reply: { payload: "YES_BOOKING" },
            },
          },
        ],
      },
    ],
  });
  const m = r.messages[0];
  assert.equal(m.contentType, "reply");
  assert.equal(m.contentMetadata?.kind, "quick_reply");
  assert.equal(m.contentMetadata?.payload, "YES_BOOKING");
});

test("msg parser: postback (button click) → reply with payload + postback kind", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000000,
            postback: {
              mid: "pb-mid-1",
              title: "Get Started",
              payload: "GET_STARTED",
            },
          },
        ],
      },
    ],
  });
  const m = r.messages[0];
  assert.equal(m.contentType, "reply");
  assert.equal(m.contentText, "Get Started");
  assert.equal(m.contentMetadata?.kind, "postback");
  assert.equal(m.contentMetadata?.payload, "GET_STARTED");
});

test("msg parser: postback without mid → synthesises pb: prefix", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000000,
            postback: { title: "x", payload: "X" },
          },
        ],
      },
    ],
  });
  assert.match(r.messages[0].externalMessageId, /^pb:PSID-1:1700000000$/);
});

test("msg parser: image attachment → contentType 'image' with mediaUrl", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000000,
            message: {
              mid: "msg-3",
              attachments: [
                { type: "image", payload: { url: "https://cdn/x.jpg" } },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentType, "image");
  assert.equal(r.messages[0].contentMediaUrl, "https://cdn/x.jpg");
});

test("msg parser: file attachment → contentType 'document'", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000000,
            message: {
              mid: "msg-4",
              attachments: [
                { type: "file", payload: { url: "https://cdn/x.pdf" } },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentType, "document");
});

test("msg parser: referral (m.me link) → system content with ref + source", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000000,
            referral: { source: "ADS", type: "OPEN_THREAD", ref: "ad-123" },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentType, "system");
  assert.equal(r.messages[0].contentMetadata?.kind, "referral");
  assert.equal(r.messages[0].contentMetadata?.ref, "ad-123");
});

test("msg parser: read receipt split off into result.statuses with watermark", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000050,
            read: { watermark: 1700000040 },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages.length, 0);
  assert.equal(r.statuses.length, 1);
  const s = r.statuses[0];
  assert.equal(s.type, "read");
  assert.equal(s.senderExternalId, "PSID-1");
  assert.equal(s.watermark.getTime(), 1700000040);
});

test("msg parser: delivery receipt with mids", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000050,
            delivery: { watermark: 1700000045, mids: ["msg-1", "msg-2"] },
          },
        ],
      },
    ],
  });
  assert.equal(r.statuses[0].type, "delivery");
  assert.deepEqual(r.statuses[0].messageIds, ["msg-1", "msg-2"]);
});

test("msg parser: rejects non-page object", () => {
  const r = parseMessengerWebhook({ object: "instagram", entry: [] });
  assert.deepEqual(r, { messages: [], statuses: [] });
});

test("msg parser: is_echo on outbound echoes → contentMetadata.echo=true", () => {
  const r = parseMessengerWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "page" },
            recipient: { id: "PSID-1" },
            timestamp: 1700000000,
            message: { mid: "msg-echo", text: "auto", is_echo: true },
          },
        ],
      },
    ],
  });
  assert.equal(r.messages[0].contentMetadata?.echo, true);
});

// ===========================================================================
// 6) Messenger provider
// ===========================================================================

test("msg provider: sendMessage text — success returns message_id", async () => {
  const p = new MessengerProvider(MSG_CREDS, {
    fetch: mockFetch(() =>
      jsonResponse({ recipient_id: "PSID", message_id: "m-out-1" }),
    ),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "facebook_messenger",
    recipientExternalId: "PSID",
    contentType: "text",
    text: "hi",
  });
  assert.equal(r.success, true);
  assert.equal(r.externalMessageId, "m-out-1");
});

test("msg provider: sendMessage template_message parses JSON-string payload", async () => {
  let body: Record<string, unknown> = {};
  const p = new MessengerProvider(MSG_CREDS, {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ message_id: "m" });
    }),
    backoffBaseMs: 1,
  });
  const templateJson = JSON.stringify({
    text: "Continue?",
    buttons: [{ type: "postback", title: "Yes", payload: "YES" }],
  });
  const r = await p.sendMessage({
    channel: "facebook_messenger",
    recipientExternalId: "PSID",
    contentType: "template_message",
    text: templateJson,
  });
  assert.equal(r.success, true);
  const message = body.message as Record<string, unknown>;
  const attachment = message.attachment as Record<string, unknown>;
  assert.equal(attachment.type, "template");
});

test("msg provider: template_message rejects when text isn't valid JSON", async () => {
  const p = new MessengerProvider(MSG_CREDS);
  const r = await p.sendMessage({
    channel: "facebook_messenger",
    recipientExternalId: "PSID",
    contentType: "template_message",
    text: "not json",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /JSON-serialised button template/);
});

test("msg provider: image without mediaUrl rejects synchronously", async () => {
  const p = new MessengerProvider(MSG_CREDS, {
    fetch: mockFetch(() => {
      throw new Error("should not call Meta — validation must reject first");
    }),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "facebook_messenger",
    recipientExternalId: "PSID",
    contentType: "image",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /mediaUrl required/);
});

test("msg provider: verifyWebhook delegates to shared HMAC-SHA256 helper", () => {
  const p = new MessengerProvider(MSG_CREDS);
  const payload = '{"object":"page"}';
  const sig =
    "sha256=" +
    createHmac("sha256", MSG_CREDS.appSecret).update(payload).digest("hex");
  assert.equal(p.verifyWebhook(payload, sig, ""), true);
  assert.equal(p.verifyWebhook(payload, "sha256=00", ""), false);
});

test("msg provider: parseWebhook returns null for status-only payloads", () => {
  const p = new MessengerProvider(MSG_CREDS);
  const r = p.parseWebhook({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "PSID-1" },
            recipient: { id: "page" },
            timestamp: 1700000050,
            read: { watermark: 1700000040 },
          },
        ],
      },
    ],
  });
  assert.equal(r, null);
});

test("msg provider: testConnection captures pageName + pageCategory", async () => {
  const p = new MessengerProvider(MSG_CREDS, {
    fetch: mockFetch(() =>
      jsonResponse({ id: "page", name: "Arconique", category: "Hotel" }),
    ),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details.pageName, "Arconique");
  assert.equal(r.details.pageCategory, "Hotel");
});

// ===========================================================================
// 7) Selector dispatch
// ===========================================================================

test("selector: instagram + creds returns InstagramProvider", () => {
  const provider = selectMessagingProvider("instagram", IG_CREDS);
  assert.ok(provider instanceof InstagramProvider);
  assert.ok(!(provider instanceof DryRunMessagingProvider));
});

test("selector: facebook_messenger + creds returns MessengerProvider", () => {
  const provider = selectMessagingProvider("facebook_messenger", MSG_CREDS);
  assert.ok(provider instanceof MessengerProvider);
  assert.ok(!(provider instanceof DryRunMessagingProvider));
});

test("selector: instagram without creds → DryRun", () => {
  const provider = selectMessagingProvider("instagram", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
});

test("selector: facebook_messenger with mismatched channel tag → DryRun", () => {
  const wrong: MessagingCredentials = {
    channel: "instagram",
    pageAccessToken: "p",
    instagramBusinessAccountId: "i",
    facebookPageId: "f",
    appSecret: "a",
    webhookVerifyToken: "v",
  };
  const provider = selectMessagingProvider("facebook_messenger", wrong);
  assert.ok(provider instanceof DryRunMessagingProvider);
});
