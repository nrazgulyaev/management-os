/**
 * v9L — pure-logic tests for guest concierge storage hardening:
 *   - Migration 0022 declares the new columns + CHECKs + indexes.
 *   - JPEG EXIF (APP1) stripping with synthetic fixture bytes.
 *   - JPEG without EXIF stays valid (status `not_required`).
 *   - PNG text-chunk stripping with synthetic chunks; critical chunks
 *     preserved.
 *   - WebP marked `warning`.
 *   - PDF marked `not_required`.
 *   - Unknown MIME → `failed`.
 *   - `isAttachmentGuestSafe` predicate covers every safe / unsafe
 *     state combination.
 *   - Job catalogue includes `guest_request_attachment_cleanup` with
 *     a daily cron and `attachment_cleanup` jobType.
 *   - Cron endpoint route file exists and dispatches the right key.
 *   - AI context builder + fallback do not import attachment
 *     processing modules (storage / cleanup / metadata-strip).
 *   - Guest detail + admin storage page do not reference
 *     `storage_path` / `tokenHash` / `passwordCiphertext` / `codeDisplay`.
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
test("migration 0022 declares new columns + CHECKs + indexes", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0022_guest_request_storage_hardening.sql"),
    "utf8",
  );
  for (const col of [
    "metadata_status",
    "metadata_stripped_at",
    "metadata_error",
    "original_size_bytes",
    "processed_size_bytes",
    "cleanup_eligible_at",
    "deleted_reason",
    "security_scan_status",
    "security_scan_notes",
  ]) {
    assert.match(
      sql,
      new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`),
      `missing ${col}`,
    );
  }
  for (const idx of [
    "attachment_metadata_status_idx",
    "attachment_cleanup_eligible_idx",
    "attachment_security_scan_status_idx",
  ]) {
    assert.match(sql, new RegExp(idx), `missing index ${idx}`);
  }
  for (const v of [
    "'pending'",
    "'stripped'",
    "'not_required'",
    "'warning'",
    "'failed'",
    "'not_scanned'",
    "'passed'",
    "'stale_pending'",
    "'guest_deleted'",
    "'staff_deleted'",
    "'security_rejected'",
    "'storage_missing'",
  ]) {
    assert.match(sql, new RegExp(v));
  }
});

// -----------------------------------------------------------------------------
// JPEG stripper
// -----------------------------------------------------------------------------

function buildSyntheticJpegWithExif(): Buffer {
  // SOI + APP0 (small JFIF marker) + APP1 EXIF + DQT + SOS + entropy + EOI
  const soi = Buffer.from([0xff, 0xd8]);
  // APP0 with a JFIF identifier (length 0x0010 = 16 bytes incl. length itself)
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0]),
    // length high/low 0x00 0x10
    Buffer.from([0x00, 0x10]),
    Buffer.from("JFIF\0", "ascii"),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]),
  ]);
  const exifPayload = Buffer.concat([
    Buffer.from("Exif\0\0", "ascii"),
    Buffer.alloc(64, 0xab), // dummy IFD
  ]);
  const exifLen = exifPayload.length + 2;
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    Buffer.from([(exifLen >> 8) & 0xff, exifLen & 0xff]),
    exifPayload,
  ]);
  // Tiny DQT segment: marker + length(4) + body(2)
  const dqt = Buffer.concat([
    Buffer.from([0xff, 0xdb]),
    Buffer.from([0x00, 0x04]),
    Buffer.from([0x00, 0x00]),
  ]);
  // SOS: marker + length + dummy header byte; then arbitrary entropy
  const sos = Buffer.concat([
    Buffer.from([0xff, 0xda]),
    Buffer.from([0x00, 0x03]),
    Buffer.from([0x00]),
    Buffer.from([0x12, 0x34, 0x56, 0x78]), // entropy
  ]);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app0, app1, dqt, sos, eoi]);
}

test("stripJpegExif removes APP1 EXIF; output stays valid JPEG", async () => {
  const { stripJpegExif } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  const input = buildSyntheticJpegWithExif();
  const out = stripJpegExif(input);
  assert.equal(out.status, "stripped");
  assert.equal(out.scan, "passed");
  assert.ok(out.changed);
  assert.ok(out.removed.includes("APP1:EXIF"));
  const bytes = Buffer.from(out.bytes!);
  // JPEG signature preserved.
  assert.deepEqual(bytes.subarray(0, 2), Buffer.from([0xff, 0xd8]));
  // EOI preserved.
  const last = bytes.subarray(bytes.length - 2);
  assert.deepEqual(last, Buffer.from([0xff, 0xd9]));
  // The output should NOT contain "Exif\0\0".
  assert.equal(bytes.indexOf(Buffer.from("Exif\0\0", "ascii")), -1);
});

test("stripJpegExif on EXIF-free JPEG returns not_required + unchanged", async () => {
  const { stripJpegExif } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  // Same fixture without the APP1 segment.
  const soi = Buffer.from([0xff, 0xd8]);
  const dqt = Buffer.concat([
    Buffer.from([0xff, 0xdb]),
    Buffer.from([0x00, 0x04]),
    Buffer.from([0x00, 0x00]),
  ]);
  const sos = Buffer.concat([
    Buffer.from([0xff, 0xda]),
    Buffer.from([0x00, 0x03]),
    Buffer.from([0x00]),
    Buffer.from([0xab, 0xcd]),
  ]);
  const eoi = Buffer.from([0xff, 0xd9]);
  const input = Buffer.concat([soi, dqt, sos, eoi]);
  const out = stripJpegExif(input);
  assert.equal(out.status, "not_required");
  assert.equal(out.changed, false);
  assert.deepEqual(out.bytes, input);
});

test("stripJpegExif rejects non-JPEG bytes", async () => {
  const { stripJpegExif } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  const out = stripJpegExif(Buffer.from([0x42, 0x42, 0x42]));
  assert.equal(out.status, "failed");
  assert.equal(out.bytes, null);
});

// -----------------------------------------------------------------------------
// PNG stripper
// -----------------------------------------------------------------------------

function buildSyntheticPng(): Buffer {
  const sig = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdrData = Buffer.alloc(13, 0x01);
  const ihdr = pngChunk("IHDR", ihdrData);
  const tEXt = pngChunk("tEXt", Buffer.from("Author\0Spy", "ascii"));
  const idatBody = Buffer.alloc(8, 0x00);
  const idat = pngChunk("IDAT", idatBody);
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, tEXt, idat, iend]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  // CRC isn't validated by our reader; fill with deterministic bytes.
  const crc = Buffer.alloc(4, 0xab);
  return Buffer.concat([length, typeBuf, data, crc]);
}

test("stripPngText removes tEXt chunks but preserves IHDR/IDAT/IEND", async () => {
  const { stripPngText } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  const input = buildSyntheticPng();
  const out = stripPngText(input);
  assert.equal(out.status, "stripped");
  assert.ok(out.removed.includes("tEXt"));
  assert.ok(out.bytes !== null);
  const bytes = Buffer.from(out.bytes!);
  // IHDR stays.
  assert.notEqual(bytes.indexOf(Buffer.from("IHDR", "ascii")), -1);
  // IEND stays.
  assert.notEqual(bytes.indexOf(Buffer.from("IEND", "ascii")), -1);
  // tEXt is gone.
  assert.equal(bytes.indexOf(Buffer.from("tEXt", "ascii")), -1);
});

test("stripPngText rejects non-PNG / truncated bytes", async () => {
  const { stripPngText } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  const out = stripPngText(Buffer.from("not a png"));
  assert.equal(out.status, "failed");
});

// -----------------------------------------------------------------------------
// WebP / PDF / unknown
// -----------------------------------------------------------------------------
test("WebP returns warning passthrough; non-WebP RIFF returns failed", async () => {
  const { stripImageMetadata } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  const webp = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "ascii"),
    Buffer.alloc(16, 0x00),
  ]);
  const out = stripImageMetadata({
    mimeType: "image/webp",
    bytes: webp,
  });
  assert.equal(out.status, "warning");
  assert.equal(out.bytes, null);

  const fake = Buffer.concat([
    Buffer.from("WAVE", "ascii"),
    Buffer.alloc(20, 0x00),
  ]);
  const bad = stripImageMetadata({
    mimeType: "image/webp",
    bytes: fake,
  });
  assert.equal(bad.status, "failed");
});

test("PDF + unknown MIME paths", async () => {
  const { stripImageMetadata } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  const pdf = stripImageMetadata({
    mimeType: "application/pdf",
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  });
  assert.equal(pdf.status, "not_required");
  const unknown = stripImageMetadata({
    mimeType: "text/plain",
    bytes: new Uint8Array([0x01, 0x02]),
  });
  assert.equal(unknown.status, "failed");
});

// -----------------------------------------------------------------------------
// Guest-safe predicate
// -----------------------------------------------------------------------------
test("isAttachmentGuestSafe accepts the documented safe combinations", async () => {
  const { isAttachmentGuestSafe } = await import(
    "../src/features/guest-ai-concierge/metadata-strip-pure"
  );
  // Safe.
  assert.equal(
    isAttachmentGuestSafe({
      uploadStatus: "uploaded",
      visibility: "guest_visible",
      metadataStatus: "stripped",
      securityScanStatus: "passed",
    }),
    true,
  );
  assert.equal(
    isAttachmentGuestSafe({
      uploadStatus: "uploaded",
      visibility: "guest_visible",
      metadataStatus: "warning",
      securityScanStatus: "warning",
    }),
    true,
  );
  assert.equal(
    isAttachmentGuestSafe({
      uploadStatus: "uploaded",
      visibility: "guest_visible",
      metadataStatus: "not_required",
      securityScanStatus: "passed",
    }),
    true,
  );
  // Unsafe combos.
  assert.equal(
    isAttachmentGuestSafe({
      uploadStatus: "pending",
      visibility: "guest_visible",
      metadataStatus: "stripped",
      securityScanStatus: "passed",
    }),
    false,
  );
  assert.equal(
    isAttachmentGuestSafe({
      uploadStatus: "uploaded",
      visibility: "internal_only",
      metadataStatus: "stripped",
      securityScanStatus: "passed",
    }),
    false,
  );
  assert.equal(
    isAttachmentGuestSafe({
      uploadStatus: "uploaded",
      visibility: "guest_visible",
      metadataStatus: "failed",
      securityScanStatus: "failed",
    }),
    false,
  );
  assert.equal(
    isAttachmentGuestSafe({
      uploadStatus: "uploaded",
      visibility: "guest_visible",
      metadataStatus: "pending",
      securityScanStatus: "passed",
    }),
    false,
  );
});

// -----------------------------------------------------------------------------
// Job catalogue
// -----------------------------------------------------------------------------
test("DEFAULT_JOB_DEFINITIONS includes guest_request_attachment_cleanup", async () => {
  const { DEFAULT_JOB_DEFINITIONS } = await import(
    "../src/features/jobs/definitions"
  );
  const def = DEFAULT_JOB_DEFINITIONS.find(
    (d) => d.key === "guest_request_attachment_cleanup",
  );
  assert.ok(def, "definition not registered");
  assert.equal(def!.jobType, "attachment_cleanup");
  assert.equal(def!.enabled, true);
  assert.match(def!.scheduleCron ?? "", /\* \* \*/);
});

test("/api/cron/guest-request-attachments-cleanup route exists + dispatches the right key", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/api/cron/guest-request-attachments-cleanup/route.ts",
    ),
    "utf8",
  );
  assert.match(src, /handleCronJobRequest/);
  assert.match(src, /guest_request_attachment_cleanup/);
});

// -----------------------------------------------------------------------------
// AI isolation — context builder + fallback don't pull attachment / cleanup /
// metadata-strip / signed URL modules.
// -----------------------------------------------------------------------------
test("AI context builder does not import attachment / storage / cleanup / strip modules", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-ai-concierge/context.ts"),
    "utf8",
  );
  for (const banned of [
    "attachments-services",
    "attachments-actions",
    "attachments-storage",
    "metadata-strip",
    "attachment-cleanup",
    "storage-bucket",
    "createSignedUploadToken",
    "createSignedDownloadUrl",
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

test("AI fallback does not import attachment / storage / cleanup modules either", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/guest-ai-concierge/fallback.ts"),
    "utf8",
  );
  for (const banned of [
    "attachments-services",
    "attachments-actions",
    "attachments-storage",
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
// Static-source — guest UI never references storage_path / forbidden fields.
// -----------------------------------------------------------------------------
test("guest request detail page does not reference forbidden output fields", () => {
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

test("admin storage page does not reveal forbidden secret-shaped fields", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(dashboard)/dashboard/guest-ai/storage/page.tsx",
    ),
    "utf8",
  );
  for (const banned of [
    "tokenHash",
    "token_hash",
    "passwordCiphertext",
    "password_ciphertext",
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(banned),
      `admin storage page leaks ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// Client-side resize helper — refuses oversized PDFs + non-images.
// -----------------------------------------------------------------------------
test("client resize helper exports the documented function", () => {
  const src = readFileSync(
    join(repoRoot, "src/components/guest-ai/client-image-resize.ts"),
    "utf8",
  );
  assert.match(src, /export async function maybeResizeAttachment/);
  assert.match(src, /not_resizable_pdf/);
  assert.match(src, /still_too_large/);
  assert.match(src, /not_an_image/);
});
