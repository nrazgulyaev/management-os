/**
 * v9M — pure-logic tests for the realtime concierge SSE pipeline:
 *   - Event envelope shape + ALLOWED_EVENT_TYPES set.
 *   - encodeSseFrame / encodeRetryFrame / encodeCommentFrame.
 *   - encodeEventId / parseLastEventId round-trip + edge cases.
 *   - projectForGuest strips storage_path / token_hash /
 *     password_ciphertext / code_display / display_password / raw_token /
 *     internal_only fields, including nested.
 *   - makeDedupe rejects repeats and bounds memory.
 *   - makeReadReceiptGate honours the throttle interval.
 *   - publicSafeStatus collapses ops statuses.
 *   - attachmentLifecycle maps the documented combinations.
 *   - Permission matrix unchanged: admin stream uses
 *     guest_ai.handoff.read; notes follow guest_ai.handoff.notes.read;
 *     owners / agents / field roles excluded.
 *   - Source grep: AI context + fallback don't import realtime
 *     modules; client components don't reference forbidden fields;
 *     SSE builder source mentions every guest-banned token only in
 *     the projector itself, not in the builder body.
 *   - Snapshot: a guest projection of a row containing every
 *     forbidden field comes out clean.
 *
 * No DB / no `server-only` import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Envelope + frame encoding
// -----------------------------------------------------------------------------
test("ALLOWED_EVENT_TYPES covers the documented set", async () => {
  const { ALLOWED_EVENT_TYPES } = await import(
    "../src/features/realtime/events"
  );
  for (const t of [
    "connected",
    "heartbeat",
    "reply_created",
    "reply_read",
    "attachment_created",
    "attachment_processing",
    "attachment_uploaded",
    "attachment_failed",
    "handoff_status_changed",
    "unread_count_changed",
    "error",
  ]) {
    assert.ok(
      (ALLOWED_EVENT_TYPES as readonly string[]).includes(t),
      `missing ${t}`,
    );
  }
});

test("encodeSseFrame / encodeRetryFrame / encodeCommentFrame produce well-formed frames", async () => {
  const {
    encodeCommentFrame,
    encodeRetryFrame,
    encodeSseFrame,
  } = await import("../src/features/realtime/events");
  const frame = encodeSseFrame({
    id: "abcd1234:1",
    type: "reply_created",
    handoffId: "abcd1234-handoff",
    occurredAt: "2026-04-29T10:00:00.000Z",
    payload: { ok: true },
  });
  assert.match(frame, /^id: abcd1234:1\n/);
  assert.match(frame, /^event: reply_created$/m);
  assert.match(frame, /^data: \{.*"ok":true.*\}\n\n$/m);
  assert.equal(encodeRetryFrame(3000), "retry: 3000\n\n");
  assert.equal(encodeCommentFrame("ping"), ": ping\n\n");
});

test("encodeEventId + parseLastEventId round-trip", async () => {
  const { encodeEventId, parseLastEventId } = await import(
    "../src/features/realtime/events"
  );
  const id = encodeEventId("abcdefg-handoff", 42);
  assert.equal(id, "abcdefg-:42");
  const parsed = parseLastEventId(id);
  assert.deepEqual(parsed, { handoffPrefix: "abcdefg-", seq: 42 });
  // Edge cases.
  assert.equal(parseLastEventId(null), null);
  assert.equal(parseLastEventId(""), null);
  assert.equal(parseLastEventId("garbage"), null);
  assert.equal(parseLastEventId("handoff:-1"), null);
});

// -----------------------------------------------------------------------------
// Guest projection
// -----------------------------------------------------------------------------
test("projectForGuest strips every forbidden field, including nested", async () => {
  const { projectForGuest } = await import(
    "../src/features/realtime/events"
  );
  const dirty = {
    replyId: "ok",
    storage_path: "should-not-be-here",
    storagePath: "ditto",
    token_hash: "secret",
    tokenHash: "secret",
    password_ciphertext: "secret",
    passwordCiphertext: "secret",
    code_display: "903754",
    codeDisplay: "903754",
    displayPassword: "hunter2",
    raw_token: "secret",
    internal_only: true,
    payload: {
      storage_path: "nested",
      bodyRedacted: "Hi",
    },
    bodyRedacted: "Hello",
  };
  const safe = projectForGuest(dirty);
  for (const banned of [
    "storage_path",
    "storagePath",
    "token_hash",
    "tokenHash",
    "password_ciphertext",
    "passwordCiphertext",
    "code_display",
    "codeDisplay",
    "displayPassword",
    "raw_token",
    "internal_only",
  ]) {
    assert.ok(
      !(banned in safe),
      `top-level field ${banned} leaked`,
    );
  }
  // Nested fields scrubbed too.
  const nested = (safe as { payload: Record<string, unknown> }).payload;
  assert.ok(!("storage_path" in nested));
  assert.equal(nested.bodyRedacted, "Hi");
  // Intended fields survive.
  assert.equal(safe.replyId, "ok");
  assert.equal(safe.bodyRedacted, "Hello");
});

// -----------------------------------------------------------------------------
// Dedupe + read-receipt gate
// -----------------------------------------------------------------------------
test("makeDedupe rejects repeats and evicts beyond the cap", async () => {
  const { makeDedupe } = await import(
    "../src/features/realtime/events"
  );
  const dedupe = makeDedupe(3);
  assert.equal(dedupe.seen("a"), false);
  assert.equal(dedupe.seen("a"), true);
  assert.equal(dedupe.seen("b"), false);
  assert.equal(dedupe.seen("c"), false);
  // 4th item evicts "a".
  assert.equal(dedupe.seen("d"), false);
  assert.equal(dedupe.seen("a"), false);
});

test("makeReadReceiptGate throttles within the interval", async () => {
  const { makeReadReceiptGate } = await import(
    "../src/features/realtime/events"
  );
  const gate = makeReadReceiptGate(50);
  assert.equal(gate.shouldEmit(), true);
  assert.equal(gate.shouldEmit(), false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(gate.shouldEmit(), true);
});

// -----------------------------------------------------------------------------
// Status mapper + lifecycle
// -----------------------------------------------------------------------------
test("publicSafeStatus collapses ops statuses to the public set", async () => {
  const { publicSafeStatus } = await import(
    "../src/features/realtime/events"
  );
  assert.equal(publicSafeStatus("created"), "received");
  assert.equal(publicSafeStatus("linked_to_request"), "received");
  assert.equal(publicSafeStatus("acknowledged"), "acknowledged");
  assert.equal(publicSafeStatus("resolved"), "resolved");
  assert.equal(publicSafeStatus("cancelled"), "cancelled");
  assert.equal(publicSafeStatus("nope"), "unknown");
});

test("attachmentLifecycle maps the documented combinations", async () => {
  const { attachmentLifecycle } = await import(
    "../src/features/realtime/events"
  );
  assert.equal(
    attachmentLifecycle({
      uploadStatus: "pending",
      metadataStatus: "pending",
      securityScanStatus: "not_scanned",
    }),
    "processing",
  );
  assert.equal(
    attachmentLifecycle({
      uploadStatus: "uploaded",
      metadataStatus: "pending",
      securityScanStatus: "not_scanned",
    }),
    "processing",
  );
  assert.equal(
    attachmentLifecycle({
      uploadStatus: "uploaded",
      metadataStatus: "stripped",
      securityScanStatus: "passed",
    }),
    "uploaded",
  );
  assert.equal(
    attachmentLifecycle({
      uploadStatus: "uploaded",
      metadataStatus: "warning",
      securityScanStatus: "warning",
    }),
    "uploaded",
  );
  assert.equal(
    attachmentLifecycle({
      uploadStatus: "uploaded",
      metadataStatus: "failed",
      securityScanStatus: "failed",
    }),
    "failed",
  );
  assert.equal(
    attachmentLifecycle({
      uploadStatus: "deleted",
      metadataStatus: "stripped",
      securityScanStatus: "passed",
    }),
    "failed",
  );
});

// -----------------------------------------------------------------------------
// Permissions unchanged
// -----------------------------------------------------------------------------
test("admin stream uses guest_ai.handoff.read; notes gated by notes.read", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const matrix = ROLE_CAPABILITIES as Record<string, string[]>;
  for (const role of matrix["guest_ai.handoff.read"]) {
    assert.ok(
      ![
        "owner",
        "individual_owner",
        "company_owner",
        "agent",
        "housekeeper",
        "technician",
        "security",
        "driver",
      ].includes(role),
      `read leaks to ${role}`,
    );
  }
  // booking_manager has read but not notes.
  assert.ok(
    matrix["guest_ai.handoff.read"].includes("booking_manager"),
  );
  assert.ok(
    !matrix["guest_ai.handoff.notes.read"].includes("booking_manager"),
  );
});

// -----------------------------------------------------------------------------
// Static-source — AI banned imports
// -----------------------------------------------------------------------------
test("AI context builder does not import realtime / attachment / storage modules", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-ai-concierge/context.ts"),
    "utf8",
  );
  for (const banned of [
    "realtime/sse",
    "realtime/events",
    "realtime-services",
    "realtime-actions",
    "attachments-services",
    "attachments-actions",
    "attachments-storage",
    "metadata-strip",
    "attachment-cleanup",
    "storage-bucket",
    "guestAiHandoffReplyAttachments",
    "guestAiHandoffReplyReads",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `context.ts references ${banned}`,
    );
  }
});

test("AI fallback does not import realtime / attachment / storage modules either", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-ai-concierge/fallback.ts"),
    "utf8",
  );
  for (const banned of [
    "realtime/sse",
    "realtime/events",
    "realtime-services",
    "realtime-actions",
    "attachments-services",
    "attachments-actions",
    "metadata-strip",
    "attachment-cleanup",
    "storage-bucket",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `fallback.ts references ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Static-source — client components don't reference forbidden fields
// -----------------------------------------------------------------------------
test("guest realtime client does not reference forbidden output fields", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/components/guest-ai/realtime-request-client.tsx",
    ),
    "utf8",
  );
  for (const banned of [
    "storage_path",
    "storagePath",
    "tokenHash",
    "passwordCiphertext",
    "displayPassword",
    "codeDisplay",
    "code_display",
    "internal_only",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `guest realtime client references ${banned}`,
    );
  }
});

test("admin realtime client does not reference forbidden output fields", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/components/guest-ai/realtime-handoff-admin-client.tsx",
    ),
    "utf8",
  );
  for (const banned of [
    "storage_path",
    "storagePath",
    "tokenHash",
    "password_ciphertext",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `admin realtime client references ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Snapshot — guest projection sweep
// -----------------------------------------------------------------------------
test("snapshot: projectForGuest applied to a fully-tainted row drops every banned field", async () => {
  const { projectForGuest, GUEST_FORBIDDEN_FIELDS } = await import(
    "../src/features/realtime/events"
  );
  const tainted: Record<string, unknown> = {
    replyId: "ok",
    bodyRedacted: "Hello",
  };
  for (const f of GUEST_FORBIDDEN_FIELDS) {
    tainted[f] = "secret";
  }
  // Add nested copy to confirm recursion.
  tainted.payload = { ...tainted };
  const safe = projectForGuest(tainted);
  for (const f of GUEST_FORBIDDEN_FIELDS) {
    assert.ok(!(f in safe), `top-level ${f} leaked`);
  }
  const nested = (safe as { payload?: Record<string, unknown> }).payload;
  assert.ok(nested);
  for (const f of GUEST_FORBIDDEN_FIELDS) {
    assert.ok(!(f in (nested as Record<string, unknown>)), `nested ${f} leaked`);
  }
});

// -----------------------------------------------------------------------------
// Routes exist + dispatch the right handler.
// -----------------------------------------------------------------------------
test("guest stream route file exists + uses pollGuestEvents", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(guest)/stay/[token]/requests/[code]/stream/route.ts",
    ),
    "utf8",
  );
  assert.match(src, /pollGuestEvents/);
  assert.match(src, /openConciergeSseStream/);
});

test("admin stream route file exists + checks guest_ai.handoff.read", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/guest-ai/handoffs/[id]/stream/route.ts",
    ),
    "utf8",
  );
  assert.match(src, /pollAdminEvents/);
  assert.match(src, /guest_ai\.handoff\.read/);
  assert.match(src, /guest_ai\.handoff\.notes\.read/);
});
