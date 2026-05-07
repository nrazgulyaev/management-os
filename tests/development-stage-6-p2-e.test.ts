/**
 * Stage 6.P2.E — Gmail OAuth provider tests.
 *
 * Covers:
 *   - refreshGoogleToken (success, rotation, missing inputs, non-2xx,
 *     non-JSON, missing access_token / expires_in)
 *   - Email helpers (RFC 822 builder for plain / HTML / multipart;
 *     base64url round-trip; address parsing; Gmail JSON projection
 *     incl. attachments + labels + In-Reply-To)
 *   - GmailClient (auth header, listMessages query params,
 *     getMessage, sendMessage with base64url, getProfile,
 *     proactive token refresh, 401 reactive refresh+retry)
 *   - GmailProvider (sendMessage routes by HTML vs text heuristic,
 *     pullRecentMessages projects via getMessage, fail-closed
 *     verifyWebhook + parseWebhook for the polling-only P2.E scope,
 *     testConnection with profile fields)
 *   - Selector dispatch (email/gmail → real provider, email/resend
 *     still DryRun pending P2.F)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  refreshGoogleToken,
} from "../src/lib/oauth/google";
import {
  buildRfc822,
  toBase64Url,
  fromBase64Url,
  getHeader,
  extractBodyParts,
  parseAddress,
  projectGmailMessage,
} from "../src/lib/messaging/providers/gmail/email-helpers";
import { GmailClient } from "../src/lib/messaging/providers/gmail/client";
import { GmailProvider } from "../src/lib/messaging/providers/gmail/provider";
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

const FUTURE = Date.now() + 24 * 3600 * 1000;
const PAST = Date.now() - 60 * 1000;

function gmailCreds(overrides: Partial<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  emailAddress: string;
}> = {}) {
  return {
    channel: "email" as const,
    provider: "gmail" as const,
    accessToken: overrides.accessToken ?? "ya29.fresh-access",
    refreshToken: overrides.refreshToken ?? "1//refresh-x",
    expiresAt: overrides.expiresAt ?? FUTURE,
    emailAddress: overrides.emailAddress ?? "ops@arconique.com",
    userId: "user-1",
  };
}

// ===========================================================================
// 1) refreshGoogleToken
// ===========================================================================

test("oauth: refreshGoogleToken success returns access + expiresAt", async () => {
  const result = await refreshGoogleToken({
    refreshToken: "r1",
    clientId: "client-id",
    clientSecret: "client-secret",
    fetch: mockFetch(() =>
      jsonResponse({
        access_token: "new-access",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "https://www.googleapis.com/auth/gmail.modify",
      }),
    ),
  });
  assert.equal(result.accessToken, "new-access");
  assert.ok(result.expiresAt > Date.now());
  assert.ok(result.expiresAt <= Date.now() + 3600 * 1000 + 100);
  assert.equal(result.tokenType, "Bearer");
  assert.match(result.scope ?? "", /gmail\.modify/);
});

test("oauth: refreshGoogleToken POSTs form-encoded body (Google rejects JSON)", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  await refreshGoogleToken({
    refreshToken: "r1",
    clientId: "ci",
    clientSecret: "cs",
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ access_token: "x", expires_in: 3600 });
    }),
  });
  const headers = captured.init?.headers as Record<string, string>;
  assert.match(headers["Content-Type"], /application\/x-www-form-urlencoded/);
  const body = new URLSearchParams((captured.init?.body as string) ?? "");
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), "r1");
  assert.equal(body.get("client_id"), "ci");
  assert.equal(body.get("client_secret"), "cs");
});

test("oauth: refreshGoogleToken returns rotated refresh token when Google rotates", async () => {
  const result = await refreshGoogleToken({
    refreshToken: "r1",
    clientId: "ci",
    clientSecret: "cs",
    fetch: mockFetch(() =>
      jsonResponse({
        access_token: "new",
        refresh_token: "rotated-r",
        expires_in: 1800,
      }),
    ),
  });
  assert.equal(result.refreshToken, "rotated-r");
});

test("oauth: refreshGoogleToken omits refreshToken when Google doesn't rotate", async () => {
  const result = await refreshGoogleToken({
    refreshToken: "r1",
    clientId: "ci",
    clientSecret: "cs",
    fetch: mockFetch(() =>
      jsonResponse({ access_token: "new", expires_in: 3600 }),
    ),
  });
  assert.equal(result.refreshToken, undefined);
});

test("oauth: refreshGoogleToken throws on missing inputs", async () => {
  await assert.rejects(() =>
    refreshGoogleToken({
      refreshToken: "",
      clientId: "ci",
      clientSecret: "cs",
    }),
  );
  await assert.rejects(() =>
    refreshGoogleToken({
      refreshToken: "r1",
      clientId: "",
      clientSecret: "cs",
    }),
  );
  await assert.rejects(() =>
    refreshGoogleToken({
      refreshToken: "r1",
      clientId: "ci",
      clientSecret: "",
    }),
  );
});

test("oauth: refreshGoogleToken throws on non-2xx with Google error in message", async () => {
  await assert.rejects(
    () =>
      refreshGoogleToken({
        refreshToken: "r1",
        clientId: "ci",
        clientSecret: "cs",
        fetch: mockFetch(
          () =>
            new Response(
              JSON.stringify({ error: "invalid_grant" }),
              { status: 400 },
            ),
        ),
      }),
    /HTTP 400/,
  );
});

test("oauth: refreshGoogleToken throws on missing access_token", async () => {
  await assert.rejects(
    () =>
      refreshGoogleToken({
        refreshToken: "r1",
        clientId: "ci",
        clientSecret: "cs",
        fetch: mockFetch(() => jsonResponse({ expires_in: 3600 })),
      }),
    /missing access_token/,
  );
});

test("oauth: refreshGoogleToken throws on non-JSON body", async () => {
  await assert.rejects(
    () =>
      refreshGoogleToken({
        refreshToken: "r1",
        clientId: "ci",
        clientSecret: "cs",
        fetch: mockFetch(() => new Response("not json", { status: 200 })),
      }),
    /non-JSON/,
  );
});

// ===========================================================================
// 2) Email helpers — RFC 822 builder
// ===========================================================================

test("rfc822: plain text builds with basic headers + body", () => {
  const out = buildRfc822({
    from: "ops@arconique.com",
    to: "guest@example.com",
    subject: "Welcome",
    bodyText: "Hello!",
  });
  assert.match(out, /From: ops@arconique\.com/);
  assert.match(out, /To: guest@example\.com/);
  assert.match(out, /Subject: Welcome/);
  assert.match(out, /Content-Type: text\/plain; charset="UTF-8"/);
  assert.ok(out.endsWith("Hello!"));
});

test("rfc822: HTML-only builds text/html content type", () => {
  const out = buildRfc822({
    from: "a@x",
    to: "b@y",
    subject: "x",
    bodyHtml: "<p>hi</p>",
  });
  assert.match(out, /Content-Type: text\/html; charset="UTF-8"/);
  assert.ok(out.includes("<p>hi</p>"));
});

test("rfc822: HTML + plain text → multipart/alternative with both parts", () => {
  const out = buildRfc822({
    from: "a@x",
    to: "b@y",
    subject: "x",
    bodyText: "Hello plain",
    bodyHtml: "<p>Hello HTML</p>",
  });
  assert.match(out, /Content-Type: multipart\/alternative; boundary=/);
  // Boundary appears at least 3 times: 2 part separators + 1 close.
  const boundaryMatches = out.match(/----arconique-[a-f0-9]+/g) ?? [];
  assert.ok(boundaryMatches.length >= 3);
  assert.ok(out.includes("Hello plain"));
  assert.ok(out.includes("<p>Hello HTML</p>"));
});

test("rfc822: In-Reply-To + References for threading", () => {
  const out = buildRfc822({
    from: "a@x",
    to: "b@y",
    subject: "Re: Welcome",
    bodyText: "thanks",
    inReplyTo: "<msg-1@example.com>",
    references: ["<msg-1@example.com>", "<msg-0@example.com>"],
  });
  assert.match(out, /In-Reply-To: <msg-1@example\.com>/);
  assert.match(out, /References: <msg-1@example\.com> <msg-0@example\.com>/);
});

test("rfc822: non-ASCII subject gets RFC 2047 base64 encoded", () => {
  const out = buildRfc822({
    from: "a@x",
    to: "b@y",
    subject: "Welcome 👋 Алексей",
    bodyText: "x",
  });
  assert.match(out, /Subject: =\?UTF-8\?B\?[^?]+\?=/);
});

test("rfc822: cc + bcc headers when provided", () => {
  const out = buildRfc822({
    from: "a@x",
    to: "b@y",
    subject: "x",
    bodyText: "x",
    cc: "manager@x",
    bcc: "audit@x",
  });
  assert.match(out, /Cc: manager@x/);
  assert.match(out, /Bcc: audit@x/);
});

// ===========================================================================
// 3) Email helpers — base64url + address parsing
// ===========================================================================

test("base64url: round-trip preserves UTF-8 content", () => {
  const original = "Hello 👋 with newlines\r\nand tabs\t!";
  assert.equal(fromBase64Url(toBase64Url(original)), original);
});

test("base64url: encoded form is URL-safe (no +, /, =)", () => {
  // Input with bytes that would produce + and / in standard base64.
  const enc = toBase64Url("Subjects: ?? & =/+ end");
  assert.doesNotMatch(enc, /[+/=]/);
});

test("parseAddress: 'Name <addr>' splits into displayName + address", () => {
  const r = parseAddress('"Alice Tester" <alice@example.com>');
  assert.equal(r.displayName, "Alice Tester");
  assert.equal(r.address, "alice@example.com");
});

test("parseAddress: bare address has no displayName", () => {
  const r = parseAddress("bob@example.com");
  assert.equal(r.displayName, undefined);
  assert.equal(r.address, "bob@example.com");
});

test("parseAddress: unquoted name accepted", () => {
  const r = parseAddress("Bob Smith <bob@example.com>");
  assert.equal(r.displayName, "Bob Smith");
});

// ===========================================================================
// 4) Email helpers — Gmail JSON projection
// ===========================================================================

test("gmail parser: getHeader is case-insensitive", () => {
  const headers = [
    { name: "From", value: "alice@x" },
    { name: "Message-ID", value: "<m1>" },
  ];
  assert.equal(getHeader(headers, "from"), "alice@x");
  assert.equal(getHeader(headers, "MESSAGE-ID"), "<m1>");
  assert.equal(getHeader(headers, "missing"), undefined);
});

test("gmail parser: extractBodyParts walks multipart tree", () => {
  // Multipart/mixed → multipart/alternative → text/plain + text/html.
  const result = extractBodyParts({
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          {
            mimeType: "text/plain",
            body: { data: toBase64Url("plain version") },
          },
          {
            mimeType: "text/html",
            body: { data: toBase64Url("<p>html version</p>") },
          },
        ],
      },
      {
        mimeType: "application/pdf",
        filename: "passport.pdf",
        body: { attachmentId: "att-1", size: 12345 },
      },
    ],
  });
  assert.equal(result.text, "plain version");
  assert.equal(result.html, "<p>html version</p>");
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].filename, "passport.pdf");
  assert.equal(result.attachments[0].attachmentId, "att-1");
});

test("gmail parser: projects standard Gmail message → IncomingMessage", () => {
  const r = projectGmailMessage(
    {
      id: "g-msg-1",
      threadId: "g-thread-1",
      labelIds: ["INBOX", "UNREAD"],
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "Alice Tester <alice@example.com>" },
          { name: "To", value: "ops@arconique.com" },
          { name: "Subject", value: "Booking inquiry" },
          { name: "Message-ID", value: "<msg-abc@example.com>" },
        ],
        body: { data: toBase64Url("Hello, I'd like to book...") },
        mimeType: "text/plain",
      },
    },
    "ops@arconique.com",
  );
  assert.ok(r);
  assert.equal(r!.channel, "email");
  assert.equal(r!.externalMessageId, "<msg-abc@example.com>");
  assert.equal(r!.externalThreadId, "g-thread-1");
  assert.equal(r!.senderExternalId, "alice@example.com");
  assert.equal(r!.senderDisplayName, "Alice Tester");
  assert.equal(r!.contentText, "Hello, I'd like to book...");
  assert.equal(r!.contentMetadata?.subject, "Booking inquiry");
  assert.deepEqual(r!.contentMetadata?.labelIds, ["INBOX", "UNREAD"]);
  assert.equal(r!.contentMetadata?.isOutbound, false);
});

test("gmail parser: outbound message (sender == owner) marked isOutbound:true", () => {
  const r = projectGmailMessage(
    {
      id: "g-msg-out",
      threadId: "g-thread-1",
      labelIds: ["SENT"],
      payload: {
        headers: [
          { name: "From", value: "ops@arconique.com" },
          { name: "Subject", value: "Re: Booking" },
        ],
        body: { data: toBase64Url("Sure, here's the rate") },
        mimeType: "text/plain",
      },
    },
    "ops@arconique.com",
  );
  assert.equal(r!.contentMetadata?.isOutbound, true);
});

test("gmail parser: In-Reply-To header → replyToExternalId", () => {
  const r = projectGmailMessage(
    {
      id: "g-msg-2",
      threadId: "g-thread-1",
      payload: {
        headers: [
          { name: "From", value: "alice@x" },
          { name: "In-Reply-To", value: "<msg-prev@x>" },
        ],
        body: { data: toBase64Url("yes") },
        mimeType: "text/plain",
      },
    },
    "ops@arconique.com",
  );
  assert.equal(r!.replyToExternalId, "<msg-prev@x>");
});

test("gmail parser: pure-attachment email sets contentType from first attachment", () => {
  const r = projectGmailMessage(
    {
      id: "g-msg-3",
      threadId: "g-thread-2",
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "alice@x" },
          { name: "Subject", value: "Invoice" },
        ],
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "image/jpeg",
            filename: "scan.jpg",
            body: { attachmentId: "att-1", size: 5000 },
          },
        ],
      },
    },
    "ops@arconique.com",
  );
  assert.equal(r!.contentType, "image");
  assert.equal(r!.contentText, "Invoice"); // subject as fallback
});

test("gmail parser: returns null on missing required fields (no From header)", () => {
  const r = projectGmailMessage(
    {
      id: "g-msg-x",
      threadId: "g-thread-x",
      payload: { headers: [{ name: "Subject", value: "x" }] },
    },
    "ops@arconique.com",
  );
  assert.equal(r, null);
});

test("gmail parser: falls back to Date header when internalDate missing", () => {
  const r = projectGmailMessage(
    {
      id: "g-msg-4",
      threadId: "g-thread-1",
      payload: {
        headers: [
          { name: "From", value: "alice@x" },
          { name: "Date", value: "Wed, 06 May 2026 10:00:00 +0000" },
        ],
        body: { data: toBase64Url("x") },
        mimeType: "text/plain",
      },
    },
    "ops@arconique.com",
  );
  assert.ok(r);
  // Date parsed from header.
  assert.equal(
    r!.receivedAt.toISOString(),
    new Date("Wed, 06 May 2026 10:00:00 +0000").toISOString(),
  );
});

// ===========================================================================
// 5) GmailClient
// ===========================================================================

test("client: dispatches with Bearer auth + GET listMessages with q + maxResults", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const c = new GmailClient(gmailCreds(), {
    fetch: mockFetch((url, init) => {
      captured = { url, init };
      return jsonResponse({ messages: [{ id: "m1" }] });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  await c.listMessages({ query: "in:inbox", maxResults: 50 });
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer ya29.fresh-access");
  assert.match(captured.url ?? "", /\/users\/me\/messages/);
  assert.match(captured.url ?? "", /q=in%3Ainbox/);
  assert.match(captured.url ?? "", /maxResults=50/);
});

test("client: getMessage uses format=full + URL-encoded message ID", async () => {
  let urlSeen = "";
  const c = new GmailClient(gmailCreds(), {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ id: "m1", threadId: "t1" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  await c.getMessage("msg/with/slashes");
  assert.match(urlSeen, /\/users\/me\/messages\/msg%2Fwith%2Fslashes\?format=full$/);
});

test("client: sendMessage encodes RFC 822 to base64url in 'raw' field", async () => {
  let body: Record<string, unknown> = {};
  const c = new GmailClient(gmailCreds(), {
    fetch: mockFetch((_, init) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ id: "g-out-1" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  await c.sendMessage({
    from: "ops@x",
    to: "guest@y",
    subject: "Hi",
    bodyText: "hello",
  });
  assert.ok(typeof body.raw === "string");
  // Verify it round-trips: base64url decode → contains the headers.
  const decoded = fromBase64Url(body.raw as string);
  assert.match(decoded, /From: ops@x/);
  assert.match(decoded, /Subject: Hi/);
});

test("client: getProfile is GET on /users/me/profile", async () => {
  let urlSeen = "";
  const c = new GmailClient(gmailCreds(), {
    fetch: mockFetch((url) => {
      urlSeen = url;
      return jsonResponse({ emailAddress: "ops@arconique.com" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  await c.getProfile();
  assert.match(urlSeen, /\/users\/me\/profile$/);
});

test("client: proactive refresh fires when expiresAt within margin", async () => {
  let refreshHit = false;
  const c = new GmailClient(gmailCreds({ expiresAt: PAST }), {
    fetch: mockFetch((url) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        refreshHit = true;
        return jsonResponse({
          access_token: "rotated",
          expires_in: 3600,
        });
      }
      return jsonResponse({ emailAddress: "ops@x" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  await c.getProfile();
  assert.ok(refreshHit);
  assert.equal(c.credentials.accessToken, "rotated");
});

test("client: 401 mid-flight triggers reactive refresh + single retry", async () => {
  let phase: "first" | "refresh" | "second" = "first";
  const c = new GmailClient(gmailCreds(), {
    fetch: mockFetch((url) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        phase = "refresh";
        return jsonResponse({ access_token: "rotated", expires_in: 3600 });
      }
      if (phase === "first") {
        phase = "second";
        return new Response("token expired", { status: 401 });
      }
      return jsonResponse({ emailAddress: "ops@x" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const res = await c.getProfile();
  assert.equal(res.status, 200);
  assert.ok(res.apiCallsCount >= 2);
});

test("client: onCredentialsRefreshed callback fires with new tokens", async () => {
  let captured: { accessToken?: string; refreshToken?: string } = {};
  const c = new GmailClient(gmailCreds({ expiresAt: PAST }), {
    fetch: mockFetch((url) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return jsonResponse({
          access_token: "rotated-A",
          refresh_token: "rotated-R",
          expires_in: 3600,
        });
      }
      return jsonResponse({ emailAddress: "x" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
    onCredentialsRefreshed: async (next) => {
      captured = next;
    },
  });
  await c.getProfile();
  assert.equal(captured.accessToken, "rotated-A");
  assert.equal(captured.refreshToken, "rotated-R");
});

test("client: refresh without clientId/clientSecret throws clearly", async () => {
  const c = new GmailClient(gmailCreds({ expiresAt: PAST }), {
    fetch: mockFetch(() => jsonResponse({})),
    backoffBaseMs: 1,
    // intentionally omit clientId/secret
  });
  await assert.rejects(
    () => c.getProfile(),
    /clientId \+ clientSecret must be passed/,
  );
});

// ===========================================================================
// 6) GmailProvider
// ===========================================================================

test("provider: implements MessagingProvider contract", () => {
  const p = new GmailProvider(gmailCreds());
  for (const m of [
    "sendMessage",
    "pullRecentMessages",
    "verifyWebhook",
    "parseWebhook",
    "testConnection",
  ]) {
    assert.equal(
      typeof (p as unknown as Record<string, unknown>)[m],
      "function",
      `missing ${m}`,
    );
  }
  assert.equal(p.channel, "email");
});

test("provider: sendMessage with plain text → text/plain part; success extracts id", async () => {
  let bodyJson: Record<string, unknown> = {};
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ id: "g-sent-1" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const r = await p.sendMessage({
    channel: "email",
    recipientExternalId: "guest@example.com",
    contentType: "text",
    text: "Hello, here are the rates.",
    subject: "Re: rates",
  });
  assert.equal(r.success, true);
  assert.equal(r.externalMessageId, "g-sent-1");
  // Decode the raw body — should contain text/plain + the body.
  const decoded = fromBase64Url(bodyJson.raw as string);
  assert.match(decoded, /text\/plain/);
  assert.match(decoded, /Hello, here are the rates/);
  assert.match(decoded, /Subject: Re: rates/);
});

test("provider: sendMessage with HTML in text → text/html part (heuristic)", async () => {
  let bodyJson: Record<string, unknown> = {};
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch((_, init) => {
      bodyJson = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ id: "g-sent-2" });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  await p.sendMessage({
    channel: "email",
    recipientExternalId: "guest@example.com",
    contentType: "text",
    text: "<p>Hello</p>",
    subject: "x",
  });
  const decoded = fromBase64Url(bodyJson.raw as string);
  assert.match(decoded, /text\/html/);
  assert.match(decoded, /<p>Hello<\/p>/);
});

test("provider: sendMessage rejects without text", async () => {
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch(() => {
      throw new Error("should not be called");
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const r = await p.sendMessage({
    channel: "email",
    recipientExternalId: "guest@x",
    contentType: "text",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /text required/);
});

test("provider: sendMessage non-2xx returns failure with truncated body", async () => {
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: 400, message: "Invalid To" } }),
          { status: 400 },
        ),
    ),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const r = await p.sendMessage({
    channel: "email",
    recipientExternalId: "x",
    contentType: "text",
    text: "x",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /HTTP 400/);
});

test("provider: sendMessage thrown error degrades to failure SyncResult", async () => {
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch(() => {
      throw new Error("DNS down");
    }),
    backoffBaseMs: 1,
    maxRetries: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const r = await p.sendMessage({
    channel: "email",
    recipientExternalId: "guest@x",
    contentType: "text",
    text: "hi",
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /DNS down|after 1 attempts/);
});

test("provider: pullRecentMessages — list + per-id getMessage projects to IncomingMessage[]", async () => {
  let phase: "list" | "msg-1" | "msg-2" = "list";
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch((url) => {
      if (url.includes("/messages?") || url.includes("/messages/me/messages")) {
        // listMessages
      }
      if (phase === "list" && url.includes("messages?")) {
        phase = "msg-1";
        return jsonResponse({
          messages: [{ id: "m1" }, { id: "m2" }],
        });
      }
      if (url.endsWith("/messages/m1?format=full")) {
        return jsonResponse({
          id: "m1",
          threadId: "t1",
          internalDate: "1700000000000",
          payload: {
            headers: [
              { name: "From", value: "alice@x" },
              { name: "Subject", value: "S1" },
            ],
            body: { data: toBase64Url("first") },
            mimeType: "text/plain",
          },
        });
      }
      if (url.endsWith("/messages/m2?format=full")) {
        return jsonResponse({
          id: "m2",
          threadId: "t2",
          internalDate: "1700000010000",
          payload: {
            headers: [
              { name: "From", value: "bob@x" },
              { name: "Subject", value: "S2" },
            ],
            body: { data: toBase64Url("second") },
            mimeType: "text/plain",
          },
        });
      }
      // Unknown fallback (the listMessages path that the test
      // entered first).
      return jsonResponse({ messages: [{ id: "m1" }, { id: "m2" }] });
    }),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const messages = await p.pullRecentMessages({ since: new Date(0) });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].contentText, "first");
  assert.equal(messages[1].contentText, "second");
});

test("provider: pullRecentMessages returns [] on non-2xx list response", async () => {
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch(() => new Response("err", { status: 500 })),
    backoffBaseMs: 1,
    maxRetries: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const r = await p.pullRecentMessages({ since: new Date() });
  assert.deepEqual(r, []);
});

test("provider: verifyWebhook fails closed (P2.E polling-only — Pub/Sub deferred to P5)", () => {
  const p = new GmailProvider(gmailCreds());
  // Even with apparently-valid inputs, return false: the JWT-based
  // Pub/Sub verify lands in P5.
  assert.equal(p.verifyWebhook("payload", "any-sig", "any-secret"), false);
});

test("provider: parseWebhook returns null (Pub/Sub deferred to P5)", () => {
  const p = new GmailProvider(gmailCreds());
  assert.equal(p.parseWebhook({ message: { data: "xxx" } }), null);
});

test("provider: testConnection success extracts emailAddress + messagesTotal", async () => {
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch(() =>
      jsonResponse({
        emailAddress: "ops@arconique.com",
        messagesTotal: 12345,
      }),
    ),
    backoffBaseMs: 1,
    clientId: "ci",
    clientSecret: "cs",
  });
  const r = await p.testConnection();
  assert.equal(r.connected, true);
  assert.equal(r.details.provider, "gmail");
  assert.equal(r.details.emailAddress, "ops@arconique.com");
  assert.equal(r.details.messagesTotal, 12345);
});

test("provider: testConnection 401 → connected:false (refresh attempt fails without clientId)", async () => {
  // No clientId/secret in opts — the 401 reactive refresh throws,
  // which is caught and returned as connected:false with status code.
  const p = new GmailProvider(gmailCreds(), {
    fetch: mockFetch(() => new Response("denied", { status: 401 })),
    backoffBaseMs: 1,
  });
  const r = await p.testConnection();
  assert.equal(r.connected, false);
});

// ===========================================================================
// 7) Selector dispatch
// ===========================================================================

test("selector: email + gmail creds returns GmailProvider", () => {
  const provider = selectMessagingProvider("email", gmailCreds());
  assert.ok(provider instanceof GmailProvider);
  assert.ok(!(provider instanceof DryRunMessagingProvider));
});

test("selector: email + resend creds selects ResendProvider (post-P2.F)", () => {
  const resendCreds: MessagingCredentials = {
    channel: "email",
    provider: "resend",
    apiKey: "re_xxx",
    fromAddress: "noreply@arconique.com",
  };
  const provider = selectMessagingProvider("email", resendCreds);
  assert.ok(!(provider instanceof DryRunMessagingProvider));
  assert.equal(provider.channel, "email");
});

test("selector: email without creds falls back to DryRun", () => {
  const provider = selectMessagingProvider("email", null);
  assert.ok(provider instanceof DryRunMessagingProvider);
});

test("selector: email with mismatched creds.channel → DryRun", () => {
  const wrong: MessagingCredentials = {
    channel: "telegram",
    botToken: "x",
    webhookSecret: "y",
  };
  const provider = selectMessagingProvider("email", wrong);
  assert.ok(provider instanceof DryRunMessagingProvider);
});
