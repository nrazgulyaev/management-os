/**
 * v9K — pure-logic tests for guest concierge attachments + read
 * receipts + internal-note permissions:
 *   - Migration 0021 declares both tables, RLS, indexes, CHECK enums.
 *   - validateAttachmentMetadata MIME / size / file-name rules.
 *   - sanitizeAttachmentFilename + buildAttachmentStoragePath shape.
 *   - filterGuestVisibleAttachments + maxAttachmentsLeft + formatBytes.
 *   - replySeenByGuest / replySeenByStaff predicates.
 *   - Permission matrix adds notes.read / attachments.read /
 *     attachments.write; booking_manager only has attachments.read.
 *   - Static-source: AI context builder doesn't import attachment /
 *     storage modules.
 *   - Static-source: guest detail / admin detail pages don't reveal
 *     storage_path / tokenHash / passwordCiphertext / codeDisplay.
 *   - Snapshot: guest-visible projection drops internal-only and
 *     never carries storage path strings.
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
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0021 declares both tables + RLS + CHECKs", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0021_guest_request_attachments_reads.sql"),
    "utf8",
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS "guest_ai_handoff_reply_reads"/,
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS "guest_ai_handoff_reply_attachments"/,
  );
  for (const idx of [
    "guest_ai_handoff_reply_reads_reply_idx",
    "guest_ai_handoff_reply_reads_handoff_idx",
    "guest_ai_handoff_reply_reads_reader_idx",
    "guest_ai_handoff_reply_reads_read_at_idx",
    "guest_ai_handoff_reply_reads_principal_unique",
    "guest_ai_handoff_reply_attachments_reply_idx",
    "guest_ai_handoff_reply_attachments_handoff_idx",
    "guest_ai_handoff_reply_attachments_status_idx",
    "guest_ai_handoff_reply_attachments_visibility_idx",
    "guest_ai_handoff_reply_attachments_storage_unique",
  ]) {
    assert.match(sql, new RegExp(idx), `missing index ${idx}`);
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // Enum values pinned in CHECKs.
  for (const v of [
    "'image/jpeg'",
    "'image/png'",
    "'image/webp'",
    "'application/pdf'",
    "'pending'",
    "'uploaded'",
    "'failed'",
    "'deleted'",
    "'guest_visible'",
    "'internal_only'",
    "'guest'",
    "'staff'",
  ]) {
    assert.match(sql, new RegExp(v));
  }
  // Size cap is 8 MB.
  assert.match(sql, /8 \* 1024 \* 1024/);
});

// -----------------------------------------------------------------------------
// MIME / size validation
// -----------------------------------------------------------------------------
test("validateAttachmentMetadata enforces MIME / size / name", async () => {
  const { validateAttachmentMetadata, MAX_FILE_BYTES } = await import(
    "../src/features/guest-ai-concierge/attachments-pure"
  );
  // Valid.
  assert.equal(
    validateAttachmentMetadata({
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    }).ok,
    true,
  );
  // Bad MIME.
  assert.equal(
    validateAttachmentMetadata({
      fileName: "x.txt",
      mimeType: "text/plain",
      sizeBytes: 1024,
    }).reason,
    "mime_not_allowed",
  );
  // Too big.
  assert.equal(
    validateAttachmentMetadata({
      fileName: "x.png",
      mimeType: "image/png",
      sizeBytes: MAX_FILE_BYTES + 1,
    }).reason,
    "size_out_of_range",
  );
  // Empty name.
  assert.equal(
    validateAttachmentMetadata({
      fileName: "",
      mimeType: "image/png",
      sizeBytes: 100,
    }).reason,
    "empty_file_name",
  );
});

// -----------------------------------------------------------------------------
// Sanitisation + storage path
// -----------------------------------------------------------------------------
test("sanitizeAttachmentFilename strips path traversal + special chars", async () => {
  const { sanitizeAttachmentFilename } = await import(
    "../src/features/guest-ai-concierge/attachments-pure"
  );
  assert.equal(
    sanitizeAttachmentFilename("../../etc/passwd"),
    "passwd",
  );
  // Spaces / hyphens get stripped; the extension survives lowercased.
  assert.equal(
    sanitizeAttachmentFilename("Holiday Photo 2026.JPG"),
    "holidayphoto2026.jpg",
  );
  // Non-ascii letters get scrubbed but the extension makes it through.
  assert.match(sanitizeAttachmentFilename("évidence.pdf"), /\.pdf$/);
  assert.equal(sanitizeAttachmentFilename(""), "file");
});

test("buildAttachmentStoragePath uses handoff prefix and uuid + safe name", async () => {
  const { buildAttachmentStoragePath } = await import(
    "../src/features/guest-ai-concierge/attachments-pure"
  );
  const path = buildAttachmentStoragePath({
    handoffId: "11111111-1111-1111-1111-111111111111",
    replyId: "22222222-2222-2222-2222-222222222222",
    fileName: "Photo.jpg",
    now: new Date("2026-04-29T10:00:00Z"),
    uuid: () => "33333333-3333-3333-3333-333333333333",
  });
  assert.equal(
    path,
    "handoffs/11111111-1111-1111-1111-111111111111/replies/22222222-2222-2222-2222-222222222222/2026-04/33333333-3333-3333-3333-333333333333-photo.jpg",
  );
});

// -----------------------------------------------------------------------------
// Guest projection helpers
// -----------------------------------------------------------------------------
test("filterGuestVisibleAttachments drops internal_only + non-uploaded", async () => {
  const { filterGuestVisibleAttachments } = await import(
    "../src/features/guest-ai-concierge/attachments-pure"
  );
  const seed = [
    {
      id: "1",
      visibility: "guest_visible" as const,
      uploadStatus: "uploaded" as const,
      uploadedByType: "guest" as const,
      fileName: "ok.jpg",
      mimeType: "image/jpeg" as const,
      sizeBytes: 1234,
    },
    {
      id: "2",
      visibility: "internal_only" as const,
      uploadStatus: "uploaded" as const,
      uploadedByType: "staff" as const,
      fileName: "secret.pdf",
      mimeType: "application/pdf" as const,
      sizeBytes: 5000,
    },
    {
      id: "3",
      visibility: "guest_visible" as const,
      uploadStatus: "pending" as const,
      uploadedByType: "guest" as const,
      fileName: "in-flight.png",
      mimeType: "image/png" as const,
      sizeBytes: 100,
    },
  ];
  const out = filterGuestVisibleAttachments(seed);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "1");
});

test("maxAttachmentsLeft counts pending + uploaded only", async () => {
  const { maxAttachmentsLeft } = await import(
    "../src/features/guest-ai-concierge/attachments-pure"
  );
  assert.equal(
    maxAttachmentsLeft([
      { uploadStatus: "uploaded" },
      { uploadStatus: "uploaded" },
      { uploadStatus: "deleted" },
    ]),
    1,
  );
  assert.equal(
    maxAttachmentsLeft([
      { uploadStatus: "uploaded" },
      { uploadStatus: "uploaded" },
      { uploadStatus: "uploaded" },
    ]),
    0,
  );
});

test("formatBytes covers byte / KB / MB", async () => {
  const { formatBytes } = await import(
    "../src/features/guest-ai-concierge/attachments-pure"
  );
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1500), "1.5 KB");
  assert.equal(formatBytes(2_500_000), "2.4 MB");
});

// -----------------------------------------------------------------------------
// Read-receipt predicates
// -----------------------------------------------------------------------------
test("replySeenByGuest / replySeenByStaff use the receipt summary", async () => {
  const mod = await import(
    "../src/features/guest-ai-concierge/read-receipts-pure"
  );
  const byReplyId = new Map<string, Set<"guest" | "staff">>();
  byReplyId.set("A", new Set<"guest" | "staff">(["guest"]));
  byReplyId.set("B", new Set<"guest" | "staff">(["staff"]));
  const summary = {
    byReplyId,
    firstReadByReplyId: new Map<
      string,
      { guest: Date | null; staff: Date | null }
    >(),
  };
  assert.equal(mod.replySeenByGuest("A", summary), true);
  assert.equal(mod.replySeenByGuest("B", summary), false);
  assert.equal(mod.replySeenByStaff("B", summary), true);
  assert.equal(mod.replySeenByStaff("A", summary), false);
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permission matrix — v9K keys, booking_manager only attachments.read", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const matrix = ROLE_CAPABILITIES as Record<string, string[]>;
  for (const k of [
    "guest_ai.handoff.notes.read",
    "guest_ai.handoff.attachments.read",
    "guest_ai.handoff.attachments.write",
  ]) {
    assert.ok(Array.isArray(matrix[k]), `missing ${k}`);
    for (const r of matrix[k]) {
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
        ].includes(r),
        `${k} leaks to ${r}`,
      );
    }
  }
  // booking_manager: read attachments only, no notes, no write.
  assert.ok(
    matrix["guest_ai.handoff.attachments.read"].includes("booking_manager"),
  );
  assert.ok(
    !matrix["guest_ai.handoff.notes.read"].includes("booking_manager"),
  );
  assert.ok(
    !matrix["guest_ai.handoff.attachments.write"].includes("booking_manager"),
  );
});

// -----------------------------------------------------------------------------
// AI context builder must not pull attachments / signed URL helpers.
// -----------------------------------------------------------------------------
test("AI context builder does not import attachment / storage modules", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-ai-concierge/context.ts"),
    "utf8",
  );
  for (const banned of [
    "attachments-services",
    "attachments-actions",
    "attachments-storage",
    "createSignedUploadToken",
    "createSignedDownloadUrl",
    "guestAiHandoffReplyAttachments",
    "guestAiHandoffReplyReads",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `context.ts references forbidden module / symbol: ${banned}`,
    );
  }
});

test("AI fallback module does not import attachment helpers either", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-ai-concierge/fallback.ts"),
    "utf8",
  );
  for (const banned of [
    "attachments-services",
    "attachments-actions",
    "attachments-storage",
    "guestAiHandoffReplyAttachments",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `fallback.ts references ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Static-source — guest pages don't surface storage paths or other secrets.
// -----------------------------------------------------------------------------
test("guest request detail does not reference forbidden output fields", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(guest)/stay/[token]/requests/[code]/page.tsx",
    ),
    "utf8",
  );
  for (const banned of [
    "storage_path",
    "storagePath",
    "passwordCiphertext",
    "displayPassword",
    "codeDisplay",
    "code_display",
    "password_ciphertext",
    "token_hash",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `guest detail leaks ${banned}`,
    );
  }
});

test("admin handoff detail does not reveal tokenHash or storage paths", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/guest-ai/handoffs/[id]/page.tsx",
    ),
    "utf8",
  );
  for (const banned of [
    "storage_path",
    "tokenHash",
    "token_hash",
    "passwordCiphertext",
    "password_ciphertext",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `admin detail leaks ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Snapshot — guest-visible projection drops internal + storage paths.
// -----------------------------------------------------------------------------
test("snapshot: filterGuestVisibleAttachments output never carries storage paths", async () => {
  const {
    filterGuestVisibleAttachments,
  } = await import("../src/features/guest-ai-concierge/attachments-pure");
  const seed = [
    {
      id: "ok",
      visibility: "guest_visible" as const,
      uploadStatus: "uploaded" as const,
      uploadedByType: "staff" as const,
      fileName: "guide.pdf",
      mimeType: "application/pdf" as const,
      sizeBytes: 1234,
    },
    {
      id: "internal",
      visibility: "internal_only" as const,
      uploadStatus: "uploaded" as const,
      uploadedByType: "staff" as const,
      fileName: "internal-note.png",
      mimeType: "image/png" as const,
      sizeBytes: 4567,
    },
  ];
  const out = filterGuestVisibleAttachments(seed);
  for (const a of out) {
    // The pure projection deliberately doesn't even *carry* a
    // storage-path field, so we just assert it's gone.
    assert.equal(
      // @ts-expect-error checking absence
      a.storagePath,
      undefined,
    );
    assert.notEqual(a.id, "internal");
  }
});

test("ALLOWED_MIME_TYPES locks the v9K set", async () => {
  const { ALLOWED_MIME_TYPES } = await import(
    "../src/features/guest-ai-concierge/attachments-pure"
  );
  assert.deepEqual(
    [...ALLOWED_MIME_TYPES],
    ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  );
  // No image/jpg alias, no image/gif, no video.
  assert.ok(!(ALLOWED_MIME_TYPES as readonly string[]).includes("image/jpg"));
  assert.ok(!(ALLOWED_MIME_TYPES as readonly string[]).includes("image/gif"));
  assert.ok(
    !(ALLOWED_MIME_TYPES as readonly string[]).includes("video/mp4"),
  );
});
