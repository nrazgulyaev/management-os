/**
 * Stage 6.P2.B — WhatsApp Meta Cloud + Twilio provider tests.
 *
 * Covers:
 *   - WhatsAppMetaClient (auth, send variants, retry envelope)
 *   - parseMetaWebhook (text + media + status + reply context)
 *   - WhatsAppMetaProvider (sendMessage all content types,
 *     verifyWebhook HMAC-SHA256, parseWebhook, testConnection)
 *   - WhatsAppTwilioProvider (Basic auth, form-encoded send,
 *     templates via ContentSid, HMAC-SHA1 webhook verify via
 *     existing twilio-signature.ts helper, parse form-encoded
 *     inbound)
 *   - Selector dispatch by `provider` discriminator within
 *     WhatsApp credentials
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  WhatsAppMetaClient,
} from "../src/lib/messaging/providers/whatsapp-meta/client";
import { parseMetaWebhook } from "../src/lib/messaging/providers/whatsapp-meta/parsers";
import { WhatsAppMetaProvider } from "../src/lib/messaging/providers/whatsapp-meta/provider";
import { WhatsAppTwilioProvider } from "../src/lib/messaging/providers/whatsapp-twilio/provider";
import {
  selectMessagingProvider,
  DryRunMessagingProvider,
} from "../src/lib/messaging";
import { computeTwilioSignature } from "../src/lib/whatsapp/providers/twilio-signature";
import type { MessagingCredentials } from "../src/lib/messaging";

// ===========================================================================
// Test helpers
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

const META_CREDS = {
  channel: "whatsapp" as const,
  provider: "meta_cloud" as const,
  accessToken: "EAAxxxxx",
  phoneNumberId: "1234567890",
  businessAccountId: "9876543210",
  webhookVerifyToken: "verify-token",
  appSecret: "app-secret-32chars-or-longer-padding",
};

const TWILIO_CREDS = {
  channel: "whatsapp" as const,
  provider: "twilio" as const,
  accountSid: "AC1234567890",
  authToken: "auth-token-32-chars-min-padding-zzz",
  fromNumber: "whatsapp:+14155238886",
};

// ===========================================================================
// 1) Meta Cloud — client
// ===========================================================================

test("meta client: authHeader is 'Bearer <accessToken>'", () => {
  const client = new WhatsAppMetaClient(META_CREDS);
  assert.equal(client.authHeader, `Bearer ${META_CREDS.accessToken}`);
});

test("meta client: sendText posts to /{phoneNumberId}/messages with type=text", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const client = new WhatsAppMetaClient(META_CREDS, {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ messages: [{ id: "wamid.abc" }] });
    }),
    backoffBaseMs: 1,
  });
  await client.sendText({ to: "+1234567890", text: "Hello world" });
  assert.match(captured.url ?? "", /\/1234567890\/messages$/);
  const body = JSON.parse((captured.init?.body as string) ?? "{}");
  assert.equal(body.messaging_product, "whatsapp");
  assert.equal(body.type, "text");
  assert.equal(body.text.body, "Hello world");
  assert.equal(body.to, "+1234567890");
});

test("meta client: sendText includes context.message_id when replyToMessageId provided", async () => {
  let bodyJson: Record<string, unknown> = {};
  const client = new WhatsAppMetaClient(META_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ messages: [{ id: "wamid.x" }] });
    }),
    backoffBaseMs: 1,
  });
  await client.sendText({
    to: "+1...",
    text: "reply",
    replyToMessageId: "wamid.parent",
  });
  const ctx = bodyJson.context as Record<string, unknown>;
  assert.equal(ctx.message_id, "wamid.parent");
});

test("meta client: sendMedia routes media types correctly + supports captions", async () => {
  let bodyJson: Record<string, unknown> = {};
  const client = new WhatsAppMetaClient(META_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ messages: [{ id: "wamid.media" }] });
    }),
    backoffBaseMs: 1,
  });
  await client.sendMedia({
    to: "+1",
    mediaType: "image",
    mediaUrl: "https://example.com/x.jpg",
    caption: "hello caption",
  });
  assert.equal(bodyJson.type, "image");
  const image = bodyJson.image as Record<string, unknown>;
  assert.equal(image.link, "https://example.com/x.jpg");
  assert.equal(image.caption, "hello caption");
});

test("meta client: sendMedia drops caption on audio (Meta rejects audio captions)", async () => {
  let bodyJson: Record<string, unknown> = {};
  const client = new WhatsAppMetaClient(META_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ messages: [{ id: "x" }] });
    }),
    backoffBaseMs: 1,
  });
  await client.sendMedia({
    to: "+1",
    mediaType: "audio",
    mediaUrl: "https://example.com/x.mp3",
    caption: "should-not-be-sent",
  });
  const audio = bodyJson.audio as Record<string, unknown>;
  assert.equal(audio.link, "https://example.com/x.mp3");
  assert.equal(audio.caption, undefined);
});

test("meta client: sendTemplate emits positional body parameters", async () => {
  let bodyJson: Record<string, unknown> = {};
  const client = new WhatsAppMetaClient(META_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ messages: [{ id: "x" }] });
    }),
    backoffBaseMs: 1,
  });
  await client.sendTemplate({
    to: "+1",
    templateName: "booking_confirmation",
    languageCode: "en_US",
    bodyParameters: ["Alice", "2026-06-01"],
  });
  const tpl = bodyJson.template as Record<string, unknown>;
  assert.equal(tpl.name, "booking_confirmation");
  const lang = tpl.language as Record<string, unknown>;
  assert.equal(lang.code, "en_US");
  const components = tpl.components as Array<Record<string, unknown>>;
  const params = components[0].parameters as Array<Record<string, unknown>>;
  assert.equal(params.length, 2);
  assert.equal(params[0].text, "Alice");
  assert.equal(params[1].text, "2026-06-01");
});

test("meta client: sendTemplate omits components array when no parameters", async () => {
  let bodyJson: Record<string, unknown> = {};
  const client = new WhatsAppMetaClient(META_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ messages: [{ id: "x" }] });
    }),
    backoffBaseMs: 1,
  });
  await client.sendTemplate({
    to: "+1",
    templateName: "no_vars",
    languageCode: "en",
    bodyParameters: [],
  });
  const tpl = bodyJson.template as Record<string, unknown>;
  assert.equal(tpl.components, undefined);
});

test("meta client: 429 retries via shared envelope", async () => {
  let calls = 0;
  const client = new WhatsAppMetaClient(META_CREDS, {
    fetch: mockFetch(() => {
      calls++;
      if (calls < 3) return new Response("rate", { status: 429 });
      return jsonResponse({ messages: [{ id: "x" }] });
    }),
    backoffBaseMs: 1,
    maxRetries: 3,
  });
  const res = await client.sendText({ to: "+1", text: "x" });
  assert.equal(res.status, 200);
  assert.equal(calls, 3);
});

// ===========================================================================
// 2) Meta Cloud — parsers
// ===========================================================================

test("meta parser: extracts a text message with sender profile name", () => {
  const result = parseMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "biz",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ profile: { name: "Alice" }, wa_id: "12345" }],
              messages: [
                {
                  from: "12345",
                  id: "wamid.1",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "hi" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(result.messages.length, 1);
  const m = result.messages[0];
  assert.equal(m.externalMessageId, "wamid.1");
  assert.equal(m.senderExternalId, "12345");
  assert.equal(m.senderDisplayName, "Alice");
  assert.equal(m.contentType, "text");
  assert.equal(m.contentText, "hi");
  assert.equal(m.channel, "whatsapp");
});

test("meta parser: extracts media id + mimeType into contentMetadata", () => {
  const result = parseMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  from: "12345",
                  id: "wamid.media",
                  timestamp: "1700000000",
                  type: "image",
                  image: {
                    id: "media-1",
                    mime_type: "image/jpeg",
                    sha256: "abc",
                    caption: "look at this",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const m = result.messages[0];
  assert.equal(m.contentType, "image");
  assert.equal(m.contentText, "look at this");
  assert.equal(m.contentMetadata?.mediaId, "media-1");
  assert.equal(m.contentMetadata?.mimeType, "image/jpeg");
});

test("meta parser: captures reply context.id as replyToExternalId", () => {
  const result = parseMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  from: "12345",
                  id: "wamid.reply",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "thanks" },
                  context: { id: "wamid.parent", from: "us" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(result.messages[0].replyToExternalId, "wamid.parent");
});

test("meta parser: collects status receipts in result.statuses", () => {
  const result = parseMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              statuses: [
                {
                  id: "wamid.x",
                  status: "delivered",
                  timestamp: "1700000050",
                  recipient_id: "12345",
                },
                {
                  id: "wamid.x",
                  status: "read",
                  timestamp: "1700000060",
                  recipient_id: "12345",
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(result.messages.length, 0);
  assert.equal(result.statuses.length, 2);
  assert.equal(result.statuses[0].status, "delivered");
  assert.equal(result.statuses[1].status, "read");
});

test("meta parser: failed status carries errorTitle + errorMessage", () => {
  const result = parseMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              statuses: [
                {
                  id: "wamid.x",
                  status: "failed",
                  timestamp: "1700000050",
                  errors: [{ title: "Send failed", message: "Recipient blocked" }],
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const s = result.statuses[0];
  assert.equal(s.status, "failed");
  assert.equal(s.errorTitle, "Send failed");
  assert.equal(s.errorMessage, "Recipient blocked");
});

test("meta parser: ignores non-whatsapp object payloads", () => {
  const r = parseMetaWebhook({ object: "page", entry: [] });
  assert.deepEqual(r, { messages: [], statuses: [] });
});

test("meta parser: handles malformed payloads safely", () => {
  assert.deepEqual(parseMetaWebhook({} as never), { messages: [], statuses: [] });
  assert.deepEqual(
    parseMetaWebhook({ object: "whatsapp_business_account" } as never),
    { messages: [], statuses: [] },
  );
});

// ===========================================================================
// 3) Meta Cloud — provider
// ===========================================================================

test("meta provider: implements MessagingProvider contract", () => {
  const p = new WhatsAppMetaProvider(META_CREDS);
  for (const m of ["sendMessage", "verifyWebhook", "parseWebhook", "testConnection"]) {
    assert.equal(
      typeof (p as unknown as Record<string, unknown>)[m],
      "function",
    );
  }
  assert.equal(p.channel, "whatsapp");
});

test("meta provider: sendMessage text — success returns externalMessageId from response", async () => {
  const p = new WhatsAppMetaProvider(META_CREDS, {
    fetch: mockFetch(() => jsonResponse({ messages: [{ id: "wamid.zzz" }] })),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1234567890",
    contentType: "text",
    text: "hello",
  });
  assert.equal(r.success, true);
  assert.equal(r.externalMessageId, "wamid.zzz");
});

test("meta provider: sendMessage template — passes positional params", async () => {
  let bodyJson: Record<string, unknown> = {};
  const p = new WhatsAppMetaProvider(META_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ messages: [{ id: "x" }] });
    }),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1",
    contentType: "template_message",
    templateName: "booking_confirmation",
    templateVariables: { "1": "Alice", "2": "2026-06-01", __language__: "en_US" },
  });
  assert.equal(r.success, true);
  const tpl = bodyJson.template as Record<string, unknown>;
  assert.equal(tpl.name, "booking_confirmation");
  const lang = tpl.language as Record<string, unknown>;
  assert.equal(lang.code, "en_US");
  const components = tpl.components as Array<Record<string, unknown>>;
  const params = components[0].parameters as Array<Record<string, unknown>>;
  assert.equal(params[0].text, "Alice");
  assert.equal(params[1].text, "2026-06-01");
});

test("meta provider: sendMessage template requires templateName", async () => {
  const p = new WhatsAppMetaProvider(META_CREDS);
  const r = await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1",
    contentType: "template_message",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /templateName required/);
});

test("meta provider: sendMessage media requires mediaUrl", async () => {
  const p = new WhatsAppMetaProvider(META_CREDS);
  const r = await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1",
    contentType: "image",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /mediaUrl required/);
});

test("meta provider: sendMessage non-2xx returns error with truncated body", async () => {
  const p = new WhatsAppMetaProvider(META_CREDS, {
    fetch: mockFetch(() => new Response("bad request", { status: 400 })),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1",
    contentType: "text",
    text: "x",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /HTTP 400/);
});

test("meta provider: verifyWebhook accepts valid HMAC-SHA256 with sha256= prefix", () => {
  const p = new WhatsAppMetaProvider(META_CREDS);
  const payload = '{"x":1}';
  const sig =
    "sha256=" +
    createHmac("sha256", META_CREDS.appSecret).update(payload).digest("hex");
  assert.equal(p.verifyWebhook(payload, sig, ""), true);
});

test("meta provider: verifyWebhook rejects bad signature (constant-time)", () => {
  const p = new WhatsAppMetaProvider(META_CREDS);
  assert.equal(
    p.verifyWebhook(`{"x":1}`, "sha256=" + "0".repeat(64), ""),
    false,
  );
});

test("meta provider: verifyWebhook accepts raw hex (no sha256= prefix)", () => {
  const p = new WhatsAppMetaProvider(META_CREDS);
  const payload = '{"y":2}';
  const sig = createHmac("sha256", META_CREDS.appSecret)
    .update(payload)
    .digest("hex");
  assert.equal(p.verifyWebhook(payload, sig, ""), true);
});

test("meta provider: parseWebhook returns messages, null if only statuses", () => {
  const p = new WhatsAppMetaProvider(META_CREDS);
  const withMsgs = p.parseWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  from: "12345",
                  id: "wamid.1",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "x" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.ok(withMsgs);
  assert.equal(withMsgs!.length, 1);

  const onlyStatus = p.parseWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: { statuses: [{ id: "wamid.x", status: "delivered" }] },
          },
        ],
      },
    ],
  });
  assert.equal(onlyStatus, null);
});

test("meta provider: testConnection success/failure paths", async () => {
  const ok = new WhatsAppMetaProvider(META_CREDS, {
    fetch: mockFetch(() => jsonResponse({ verified_name: "Test Hotel" })),
    backoffBaseMs: 1,
  });
  const okR = await ok.testConnection();
  assert.equal(okR.connected, true);
  assert.equal(okR.details.provider, "meta_cloud");

  const bad = new WhatsAppMetaProvider(META_CREDS, {
    fetch: mockFetch(() => new Response("denied", { status: 401 })),
    backoffBaseMs: 1,
  });
  const badR = await bad.testConnection();
  assert.equal(badR.connected, false);
});

// ===========================================================================
// 4) Twilio WhatsApp — provider
// ===========================================================================

test("twilio provider: implements MessagingProvider contract", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  for (const m of ["sendMessage", "verifyWebhook", "parseWebhook", "testConnection"]) {
    assert.equal(
      typeof (p as unknown as Record<string, unknown>)[m],
      "function",
    );
  }
  assert.equal(p.channel, "whatsapp");
});

test("twilio provider: authHeader is 'Basic base64(sid:token)'", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  const expected =
    "Basic " +
    Buffer.from(`${TWILIO_CREDS.accountSid}:${TWILIO_CREDS.authToken}`).toString(
      "base64",
    );
  assert.equal(p.authHeader, expected);
});

test("twilio provider: sendMessage form-encodes body with whatsapp: prefix auto-added", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS, {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ sid: "SM12345" });
    }),
    backoffBaseMs: 1,
  });
  const r = await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1234567890",
    contentType: "text",
    text: "hi twilio",
  });
  assert.equal(r.success, true);
  assert.equal(r.externalMessageId, "SM12345");
  assert.match(captured.url ?? "", /\/Accounts\/AC1234567890\/Messages\.json$/);
  const headers = captured.init?.headers as Record<string, string>;
  assert.match(headers["Content-Type"], /application\/x-www-form-urlencoded/);
  const body = new URLSearchParams((captured.init?.body as string) ?? "");
  assert.equal(body.get("From"), "whatsapp:+14155238886");
  assert.equal(body.get("To"), "whatsapp:+1234567890");
  assert.equal(body.get("Body"), "hi twilio");
});

test("twilio provider: sendMessage preserves existing whatsapp: prefix", async () => {
  let bodyParams: URLSearchParams | undefined;
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyParams = new URLSearchParams((init?.body as string) ?? "");
      return jsonResponse({ sid: "SM" });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "whatsapp:+1234567890",
    contentType: "text",
    text: "x",
  });
  assert.equal(bodyParams?.get("To"), "whatsapp:+1234567890");
});

test("twilio provider: template_message uses ContentSid + ContentVariables", async () => {
  let bodyParams: URLSearchParams | undefined;
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyParams = new URLSearchParams((init?.body as string) ?? "");
      return jsonResponse({ sid: "SM" });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1",
    contentType: "template_message",
    templateName: "HXabc123",
    templateVariables: { "1": "Alice", __language__: "en" },
  });
  assert.equal(bodyParams?.get("ContentSid"), "HXabc123");
  // __language__ must be stripped before stringifying.
  const cv = JSON.parse(bodyParams?.get("ContentVariables") ?? "{}");
  assert.equal(cv["1"], "Alice");
  assert.equal(cv.__language__, undefined);
});

test("twilio provider: media payloads set MediaUrl + optional Body caption", async () => {
  let bodyParams: URLSearchParams | undefined;
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS, {
    fetch: mockFetch((_, init) => {
      bodyParams = new URLSearchParams((init?.body as string) ?? "");
      return jsonResponse({ sid: "SM" });
    }),
    backoffBaseMs: 1,
  });
  await p.sendMessage({
    channel: "whatsapp",
    recipientExternalId: "+1",
    contentType: "image",
    mediaUrl: "https://example.com/x.jpg",
    text: "with caption",
  });
  assert.equal(bodyParams?.get("MediaUrl"), "https://example.com/x.jpg");
  assert.equal(bodyParams?.get("Body"), "with caption");
});

test("twilio provider: verifyWebhook delegates to existing twilio-signature.ts (HMAC-SHA1)", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  const url = "https://example.com/api/webhooks/whatsapp";
  const formBody = "From=whatsapp%3A%2B1&Body=hi&MessageSid=SM1";
  const expected = computeTwilioSignature(TWILIO_CREDS.authToken, url, formBody);
  // Third arg = full URL (Twilio's HMAC scheme requires URL+body —
  // not a separate webhook secret like Meta uses).
  assert.equal(p.verifyWebhook(formBody, expected, url), true);
});

test("twilio provider: verifyWebhook rejects bad signature", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  assert.equal(
    p.verifyWebhook("From=x", "wrong-sig-xyz", "https://example.com/wh"),
    false,
  );
});

test("twilio provider: parseWebhook projects form-decoded inbound to IncomingMessage", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  const messages = p.parseWebhook({
    MessageSid: "SM-IN-1",
    From: "whatsapp:+15551234567",
    To: "whatsapp:+14155238886",
    Body: "hello hotel",
    ProfileName: "Bob Tester",
  });
  assert.ok(messages);
  assert.equal(messages!.length, 1);
  const m = messages![0];
  assert.equal(m.externalMessageId, "SM-IN-1");
  assert.equal(m.senderExternalId, "+15551234567");
  assert.equal(m.senderDisplayName, "Bob Tester");
  assert.equal(m.contentText, "hello hotel");
  assert.equal(m.contentType, "text");
});

test("twilio provider: parseWebhook detects media + content type from MediaContentType0", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  const messages = p.parseWebhook({
    MessageSid: "SM-IN-2",
    From: "whatsapp:+1",
    NumMedia: "1",
    MediaUrl0: "https://api.twilio.com/.../Media/ME1",
    MediaContentType0: "image/jpeg",
  });
  assert.ok(messages);
  const m = messages![0];
  assert.equal(m.contentType, "image");
  assert.equal(m.contentMediaUrl, "https://api.twilio.com/.../Media/ME1");
});

test("twilio provider: parseWebhook returns null for status-only callbacks", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  // Status callbacks have MessageStatus + no Body/Media.
  const r = p.parseWebhook({
    MessageSid: "SM-OUT-1",
    From: "whatsapp:+x",
    MessageStatus: "delivered",
  });
  assert.equal(r, null);
});

test("twilio provider: parseWebhook returns null when missing required keys", () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS);
  assert.equal(p.parseWebhook({}), null);
  assert.equal(p.parseWebhook({ MessageSid: "x" }), null);
  assert.equal(p.parseWebhook({ From: "x" }), null);
});

test("twilio provider: testConnection hits /Accounts/{sid}.json", async () => {
  let urlSeen = "";
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS, {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ sid: TWILIO_CREDS.accountSid });
    }),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.match(urlSeen, /\/Accounts\/AC1234567890\.json$/);
  assert.equal(r.details.provider, "twilio");
});

test("twilio provider: testConnection failure path", async () => {
  const p = new WhatsAppTwilioProvider(TWILIO_CREDS, {
    fetch: mockFetch(() => new Response("denied", { status: 401 })),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, false);
  assert.equal(r.details.status, 401);
});

// ===========================================================================
// 5) Selector dispatch by `provider` discriminator within whatsapp creds
// ===========================================================================

test("selector: whatsapp + meta_cloud creds returns WhatsAppMetaProvider", () => {
  const provider = selectMessagingProvider("whatsapp", META_CREDS);
  assert.ok(provider instanceof WhatsAppMetaProvider);
  assert.ok(!(provider instanceof DryRunMessagingProvider));
});

test("selector: whatsapp + twilio creds returns WhatsAppTwilioProvider", () => {
  const provider = selectMessagingProvider("whatsapp", TWILIO_CREDS);
  assert.ok(provider instanceof WhatsAppTwilioProvider);
  assert.ok(!(provider instanceof DryRunMessagingProvider));
});

test("selector: whatsapp without creds still falls back to DryRun", () => {
  const provider = selectMessagingProvider("whatsapp", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
});

test("selector: whatsapp with unknown provider tag falls back to DryRun (defense in depth)", () => {
  // Unknown provider — operator-side data corruption or future-provider
  // with no client class yet. Return DryRun rather than throw.
  const weird = {
    channel: "whatsapp",
    provider: "future-yet-unwritten",
  } as unknown as MessagingCredentials;
  const provider = selectMessagingProvider("whatsapp", weird);
  assert.ok(provider instanceof DryRunMessagingProvider);
});

test("selector: cross-channel mismatch (whatsapp arg + telegram creds) → DryRun", () => {
  const tgCreds: MessagingCredentials = {
    channel: "telegram",
    botToken: "x",
    webhookSecret: "y",
  };
  const provider = selectMessagingProvider("whatsapp", tgCreds);
  assert.ok(provider instanceof DryRunMessagingProvider);
});
